import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import stashExtension from "../src/index.ts";
import { createPrompt, loadPrompts, storagePaths } from "../src/store.ts";

async function harness(t: { after: (fn: () => Promise<void>) => void }) {
  const cwd = await mkdtemp(join(tmpdir(), "pi-stash-extension-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".git"));
  const paths = await storagePaths(cwd, join(cwd, "test-home"));
  let command!: Parameters<ExtensionAPI["registerCommand"]>[1];
  let shortcut!: (ctx: ExtensionContext) => Promise<void> | void;
  const messages: unknown[] = [];
  const api = {
    registerCommand: (name: string, options: typeof command) => { assert.equal(name, "stash"); command = options; },
    registerShortcut: (key: string, options: { handler: typeof shortcut }) => { assert.equal(key, "ctrl+alt+s"); shortcut = options.handler; },
    sendMessage: (message: unknown) => { messages.push(message); },
    sendUserMessage: () => { assert.fail("Stash must never send a prompt to the model"); },
  } as unknown as ExtensionAPI;
  stashExtension(api);
  const editorResponses: (string | undefined)[] = [];
  const pickerQueries: (string | undefined)[] = [];
  const selectionResponses: (string | undefined)[] = [];
  const confirmationResponses: boolean[] = [];
  const prefills: (string | undefined)[] = [];
  const notices: { message: string; type: string }[] = [];
  let editorText = "";
  const ctx = {
    cwd,
    mode: "tui",
    hasUI: true,
    isProjectTrusted: () => true,
    sessionManager: { getBranch: () => [
      { type: "message", id: "user", timestamp: "2026-10-26T00:00:00Z", message: { role: "user", content: "Original chat prompt\n" } },
    ] as SessionEntry[] },
    ui: {
      notify: (message: string, type: string) => { notices.push({ message, type }); },
      getEditorText: () => editorText,
      setEditorText: (value: string) => { editorText = value; },
      editor: async (_title: string, prefill?: string) => { prefills.push(prefill); return editorResponses.shift(); },
      select: async (_title: string, options: string[]) => {
        const answer = selectionResponses.shift();
        if (answer) assert.ok(options.includes(answer), `Unexpected option: ${answer}`);
        return answer;
      },
      confirm: async () => confirmationResponses.shift() ?? false,
      custom: async (factory: Parameters<ExtensionContext["ui"]["custom"]>[0]) => {
        let result: unknown;
        const component = await factory(
          { requestRender: () => {}, terminal: { rows: 24 } } as never,
          { fg: (_color: string, value: string) => value } as never,
          {} as never,
          (value: unknown) => { result = value; },
        );
        const query = pickerQueries.shift();
        if (query) component.handleInput?.(query);
        component.render(80);
        component.handleInput?.(query === undefined ? "\x1b" : "\r");
        return result;
      },
    },
  } as unknown as ExtensionCommandContext;
  return { cwd, paths, ctx, command, shortcut, editorResponses, pickerQueries, selectionResponses, confirmationResponses, prefills, notices, messages,
    getDraft: () => editorText, setDraft: (text: string) => { editorText = text; } };
}

test("save from chat selects a user message and saves edited content and metadata in project scope", async (t) => {
  const h = await harness(t);
  h.pickerQueries.push("");
  h.editorResponses.push("Customized chat prompt\n", "Review PR", "Review changes and tests");
  h.selectionResponses.push("Project: available in this project");
  await h.command.handler("save", h.ctx);
  assert.equal(h.prefills[0], "Original chat prompt\n");
  const { prompts } = await loadPrompts(h.paths);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].body, "Customized chat prompt\n");
  assert.equal(prompts[0].name, "Review PR");
  assert.equal(prompts[0].description, "Review changes and tests");
  assert.equal(h.getDraft(), "");
});

test("insert preserves a draft and puts the prompt into the editor without submitting", async (t) => {
  const h = await harness(t);
  await createPrompt(h.paths.project, { name: "Review PR", description: "Review", body: "Saved prompt\n" });
  h.setDraft("Current draft");
  h.pickerQueries.push("Review PR");
  h.selectionResponses.push("Browse saved prompts", "Insert into editor");
  await h.command.handler("", h.ctx);
  assert.equal(h.getDraft(), "Current draft\n\nSaved prompt\n");
  assert.deepEqual(h.messages, []);
});

test("cancelling a save or delete leaves stored prompts and the editor unchanged", async (t) => {
  const h = await harness(t);
  const filePath = await createPrompt(h.paths.project, { name: "Keep me", description: "", body: "Keep this prompt" });
  h.setDraft("Unsent draft");
  h.editorResponses.push(undefined);
  h.selectionResponses.push("Write a new prompt");
  await h.command.handler("", h.ctx);
  h.confirmationResponses.push(false);
  h.pickerQueries.push("Keep me");
  h.selectionResponses.push("Browse saved prompts", "Delete saved prompt");
  await h.command.handler("", h.ctx);
  assert.equal((await loadPrompts(h.paths)).prompts.length, 1);
  assert.match(await readFile(filePath, "utf8"), /Keep this prompt/);
  assert.equal(h.getDraft(), "Unsent draft");
});

test("edit prefills existing metadata and delete removes only the selected file", async (t) => {
  const h = await harness(t);
  await createPrompt(h.paths.project, { name: "Review PR", description: "Original description", body: "Original body" });
  await createPrompt(h.paths.project, { name: "Keep me", description: "", body: "Keep" });
  h.editorResponses.push("Edited body", "New name", "New description");
  h.pickerQueries.push("Review PR");
  h.selectionResponses.push("Browse saved prompts", "Edit saved prompt", "Back to prompts");
  await h.command.handler("", h.ctx);
  assert.deepEqual(h.prefills, ["Original body", "Review PR", "Original description"]);
  assert.equal((await loadPrompts(h.paths)).prompts.find((prompt) => prompt.name === "New name")?.body, "Edited body");
  h.confirmationResponses.push(true);
  h.pickerQueries.push("New name");
  h.selectionResponses.push("Browse saved prompts", "Delete saved prompt");
  await h.command.handler("", h.ctx);
  assert.deepEqual((await loadPrompts(h.paths)).prompts.map((prompt) => prompt.name), ["Keep me"]);
});

test("draft shortcut saves unsent editor text without clearing it", async (t) => {
  const h = await harness(t);
  h.setDraft("  Unsent prompt\n");
  h.editorResponses.push("  Unsent prompt\n", "Draft prompt", "A draft");
  h.selectionResponses.push("Project: available in this project");
  await h.shortcut(h.ctx);
  assert.equal(h.prefills[0], "  Unsent prompt\n");
  assert.equal(h.getDraft(), "  Unsent prompt\n");
  assert.equal((await loadPrompts(h.paths)).prompts[0].body, "  Unsent prompt\n");
});

test("nonterminal use exits without opening dialogs", async (t) => {
  const h = await harness(t);
  const ctx = { ...h.ctx, mode: "rpc" as const };
  await h.command.handler("save", ctx);
  assert.ok(h.notices.some((notice) => notice.type === "error" && /interactive terminal/.test(notice.message)));
  assert.deepEqual(h.messages, []);
});

test("overlapping dialogs are rejected and cancellation releases the command", async (t) => {
  const h = await harness(t);
  let finish!: (value: string | undefined) => void;
  const ctx = { ...h.ctx, ui: { ...h.ctx.ui, select: () => new Promise<string | undefined>((resolve) => { finish = resolve; }) } };
  const first = h.command.handler("", ctx);
  await h.command.handler("save", h.ctx);
  assert.ok(h.notices.some((notice) => /Finish the current/.test(notice.message)));
  finish(undefined);
  await first;
  h.selectionResponses.push("Write a new prompt");
  await h.command.handler("", h.ctx);
  assert.equal(h.prefills.length, 1);
});

test("the menu creates a new prompt without a separate subcommand", async (t) => {
  const h = await harness(t);
  h.selectionResponses.push("Write a new prompt", "Project: available in this project");
  h.editorResponses.push("New prompt text", "New prompt", "Written from the menu");
  await h.command.handler("", h.ctx);
  assert.equal(h.prefills[0], "");
  assert.equal((await loadPrompts(h.paths)).prompts[0].body, "New prompt text");
});

test("save is the only subcommand offered and unsupported arguments show the short usage", async (t) => {
  const h = await harness(t);
  const completions = await h.command.getArgumentCompletions?.("");
  assert.deepEqual(completions?.map((item) => item.value), ["save"]);
  assert.equal(await h.command.getArgumentCompletions?.("browse"), null);
  for (const args of ["browse", "new", "use Review PR", "view", "edit", "delete", "help", "save extra"]) {
    await h.command.handler(args, h.ctx);
    assert.equal(h.notices.at(-1)?.type, "error");
    assert.match(h.notices.at(-1)!.message, /Use \/stash to browse or create prompts, or \/stash save/);
  }
  assert.deepEqual(h.prefills, []);
});
