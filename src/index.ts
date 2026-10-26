import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { chatPrompts } from "./history.ts";
import { createPrompt, deletePrompt, loadPrompts, storagePaths, updatePrompt, validateDraft, type PromptDraft, type SavedPrompt, type Scope } from "./store.ts";
import { pickPrompt, plain, singleLine, viewPrompt } from "./ui.ts";

const usage = "Use /stash to browse or create prompts, or /stash save to save from chat.";

async function snapshot(ctx: ExtensionContext) {
  const paths = await storagePaths(ctx.cwd);
  const result = await loadPrompts(paths, ctx.isProjectTrusted());
  if (result.warnings.length) ctx.ui.notify(plain(`Skipped unreadable prompts:\n${result.warnings.join("\n")}`), "warning");
  return { paths, ...result };
}

async function chooseSaved(ctx: ExtensionContext): Promise<SavedPrompt | undefined> {
  const { prompts } = await snapshot(ctx);
  if (!prompts.length) {
    ctx.ui.notify("No saved prompts. Use /stash save to save from chat, or choose Write a new prompt in /stash.", "info");
    return;
  }
  const selected = await pickPrompt(ctx, "Saved prompts", prompts.map((prompt) => ({
    id: prompt.filePath,
    label: `[${prompt.scope}] ${prompt.name}`,
    description: prompt.description,
    body: prompt.body,
  })));
  return prompts.find((prompt) => prompt.filePath === selected);
}

async function editDraft(ctx: ExtensionContext, body: string, existing?: SavedPrompt): Promise<PromptDraft | undefined> {
  const edited = await ctx.ui.editor("Prompt text", body);
  if (edited === undefined) return;
  if (!edited.trim()) throw new Error("The prompt text cannot be empty.");
  // ui.input's second argument is a placeholder, so use editor for editable defaults.
  const name = await ctx.ui.editor("Prompt name", existing?.name ?? "");
  if (name === undefined) return;
  const description = await ctx.ui.editor("Description shown in the picker", existing?.description ?? "");
  if (description === undefined) return;
  const draft = { name: name.trim(), description: description.trim(), body: edited };
  validateDraft(draft);
  return draft;
}

async function save(ctx: ExtensionContext, source: "save" | "draft" | "new"): Promise<void> {
  let body = "";
  if (source === "save") {
    const prompts = chatPrompts(ctx.sessionManager.getBranch());
    if (!prompts.length) { ctx.ui.notify("No user prompts with text in this conversation branch yet.", "info"); return; }
    const selected = await pickPrompt(ctx, "Choose a chat prompt to stash · newest first", prompts.map((prompt) => ({
      id: prompt.id,
      label: `#${prompt.number} ${singleLine(prompt.body).slice(0, 120)}`,
      description: `${prompt.timestamp}${prompt.imageCount ? ` · ${prompt.imageCount} image(s) will be omitted` : ""}`,
      body: prompt.body,
    })));
    const prompt = prompts.find((item) => item.id === selected);
    if (!prompt) return;
    body = prompt.body;
    if (prompt.imageCount) ctx.ui.notify("Saving text only. Image attachments are not stored.", "info");
  } else if (source === "draft") {
    body = ctx.ui.getEditorText();
    if (!body.trim()) { ctx.ui.notify("The editor draft is empty.", "info"); return; }
  }
  const draft = await editDraft(ctx, body);
  if (!draft) return;
  const { paths, prompts } = await snapshot(ctx);
  const sameDirectory = paths.project === paths.global;
  const options = [
    ...(ctx.isProjectTrusted() && !sameDirectory ? ["Project: available in this project"] : []),
    "Global: available in every project",
  ];
  const selection = await ctx.ui.select("Save prompt where?", options);
  if (!selection) return;
  const scope: Scope = selection.startsWith("Project:") ? "project" : "global";
  if (prompts.some((prompt) => prompt.scope === scope && prompt.name === draft.name)) {
    throw new Error(`A ${scope} prompt named "${draft.name}" already exists. Open /stash, browse to it, and choose Edit saved prompt.`);
  }
  const filePath = await createPrompt(paths[scope], draft);
  ctx.ui.notify(plain(`Saved "${draft.name}" (${scope}) to ${filePath}`), "info");
}

async function insert(ctx: ExtensionContext, prompt: SavedPrompt): Promise<void> {
  const draft = ctx.ui.getEditorText();
  ctx.ui.setEditorText(draft ? `${draft}\n\n${prompt.body}` : prompt.body);
  ctx.ui.notify(plain(`Inserted "${prompt.name}". Review and send when ready.`), "info");
}

async function show(ctx: ExtensionContext, prompt: SavedPrompt): Promise<void> {
  await viewPrompt(ctx, `${prompt.name} [${prompt.scope}]`, `${prompt.description}\n${prompt.filePath}\n\n${prompt.body}`);
}

async function edit(ctx: ExtensionContext, prompt: SavedPrompt): Promise<void> {
  const draft = await editDraft(ctx, prompt.body, prompt);
  if (!draft) return;
  const { prompts } = await snapshot(ctx);
  if (prompts.some((item) => item.filePath !== prompt.filePath && item.scope === prompt.scope && item.name === draft.name)) {
    throw new Error(`A ${prompt.scope} prompt named "${draft.name}" already exists. Choose another name.`);
  }
  await updatePrompt(prompt, draft);
  ctx.ui.notify(plain(`Updated "${draft.name}" (${prompt.scope}).`), "info");
}

async function remove(ctx: ExtensionContext, prompt: SavedPrompt): Promise<boolean> {
  if (!await ctx.ui.confirm("Delete saved prompt?", plain(`Delete "${prompt.name}" (${prompt.scope})?\n${prompt.filePath}`))) return false;
  await deletePrompt(prompt);
  ctx.ui.notify(plain(`Deleted "${prompt.name}" (${prompt.scope}).`), "info");
  return true;
}

async function browse(ctx: ExtensionContext): Promise<void> {
  while (true) {
    let prompt = await chooseSaved(ctx);
    if (!prompt) return;
    while (true) {
      const action = await ctx.ui.select(plain(`${prompt.name} [${prompt.scope}]\n${prompt.description}`), [
        "Insert into editor", "View full prompt", "Edit saved prompt", "Delete saved prompt", "Back to prompts",
      ]);
      if (!action || action === "Back to prompts") break;
      if (action === "Insert into editor") { await insert(ctx, prompt); return; }
      if (action === "View full prompt") await show(ctx, prompt);
      if (action === "Delete saved prompt" && await remove(ctx, prompt)) break;
      if (action === "Edit saved prompt") {
        await edit(ctx, prompt);
        const { prompts } = await snapshot(ctx);
        const updated = prompts.find((item) => item.filePath === prompt!.filePath);
        if (!updated) break;
        prompt = updated;
      }
    }
  }
}

export default function stashExtension(pi: ExtensionAPI): void {
  // Dialogs share Pi's editor, so avoid overlapping command invocations.
  let busy = false;
  async function dialog(ctx: ExtensionContext, action: () => Promise<void>): Promise<void> {
    if (busy) { ctx.ui.notify("Finish the current stash dialog first.", "warning"); return; }
    if (ctx.mode !== "tui") { ctx.ui.notify("Prompt stash requires Pi's interactive terminal UI.", "error"); return; }
    busy = true;
    try { await action(); }
    catch (error) { ctx.ui.notify(plain(error instanceof Error ? error.message : String(error)), "error"); }
    finally { busy = false; }
  }
  pi.registerShortcut("ctrl+alt+s", {
    description: "Save the current editor draft to the prompt stash",
    handler: async (ctx) => dialog(ctx, () => save(ctx, "draft")),
  });
  pi.registerCommand("stash", {
    description: "Save, browse, and reuse project or global prompts",
    getArgumentCompletions: (prefix) => {
      return "save".startsWith(prefix)
        ? [{ value: "save", label: "save", description: "Choose a prompt from chat to save" }]
        : null;
    },
    handler: async (args, ctx) => {
      await dialog(ctx, async () => {
        const command = args.trim();
        if (command === "save") { await save(ctx, "save"); return; }
        if (command) throw new Error(usage);
        const action = await ctx.ui.select("Prompt stash", ["Browse saved prompts", "Save a prompt from chat", "Write a new prompt"]);
        if (action === "Browse saved prompts") await browse(ctx);
        else if (action === "Save a prompt from chat") await save(ctx, "save");
        else if (action === "Write a new prompt") await save(ctx, "new");
      });
    },
  });
}
