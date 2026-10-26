import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseDocument, stringify } from "yaml";

export type Scope = "global" | "project";

export interface PromptDraft {
  name: string;
  description: string;
  body: string;
}

export interface SavedPrompt extends PromptDraft {
  scope: Scope;
  filePath: string;
  source: string;
  metadata: Record<string, unknown>;
}

export interface StoragePaths {
  global: string;
  project: string;
}

export function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

export async function storagePaths(cwd: string, home = homedir()): Promise<StoragePaths> {
  return {
    global: join(home, ".pi", "agent", "stashed-prompts"),
    project: join(resolve(cwd), ".pi", "stashed-prompts"),
  };
}

export function validateDraft(draft: PromptDraft): void {
  if (!draft.name.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(draft.name)) {
    throw new Error("The prompt name must be nonempty and contain no control characters.");
  }
  if (!draft.body.trim()) throw new Error("The prompt text cannot be empty.");
}

export function parsePrompt(source: string): PromptDraft & { metadata: Record<string, unknown> } {
  const match = source.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) throw new Error("Expected YAML frontmatter enclosed by --- lines.");
  const document = parseDocument(match[1]);
  if (document.errors.length) throw new Error(document.errors[0].message);
  const metadata: unknown = document.toJS({ maxAliasCount: 100 });
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Frontmatter must be a mapping with a name and description.");
  }
  const fields = metadata as Record<string, unknown>;
  if (typeof fields.name !== "string") throw new Error("Frontmatter name must be a string.");
  if (fields.description !== undefined && typeof fields.description !== "string") {
    throw new Error("Frontmatter description must be a string.");
  }
  const draft = { name: fields.name.trim(), description: fields.description ?? "", body: source.slice(match[0].length) } as PromptDraft;
  validateDraft(draft);
  return { ...draft, metadata: fields };
}

export function serializePrompt(draft: PromptDraft, metadata: Record<string, unknown> = {}): string {
  validateDraft(draft);
  return `---\n${stringify({ ...metadata, name: draft.name.trim(), description: draft.description })}---\n${draft.body}`;
}

export function promptFilename(name: string): string {
  const slug = name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${slug || "prompt"}.md`;
}

export async function loadPrompts(paths: StoragePaths, trusted = true): Promise<{ prompts: SavedPrompt[]; warnings: string[] }> {
  const prompts: SavedPrompt[] = [];
  const warnings: string[] = [];
  for (const scope of ["project", "global"] as const) {
    if (scope === "project" && (!trusted || resolve(paths.project) === resolve(paths.global))) continue;
    let files;
    try {
      files = await readdir(paths[scope], { withFileTypes: true });
    } catch (error) {
      if (!isErrno(error, "ENOENT")) warnings.push(`${paths[scope]}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!file.isFile() || !file.name.endsWith(".md")) continue;
      const filePath = join(paths[scope], file.name);
      try {
        const source = await readFile(filePath, "utf8");
        prompts.push({ ...parsePrompt(source), scope, filePath, source });
      } catch (error) {
        warnings.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  prompts.sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope));
  return { prompts, warnings };
}

async function requireUnchanged(prompt: SavedPrompt): Promise<void> {
  const stat = await lstat(prompt.filePath);
  if (!stat.isFile() || await readFile(prompt.filePath, "utf8") !== prompt.source) {
    throw new Error("This prompt changed on disk. Reopen /stash and try again.");
  }
}

export async function createPrompt(directory: string, draft: PromptDraft): Promise<string> {
  const source = serializePrompt(draft);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filePath = join(directory, promptFilename(draft.name));
  const temporary = join(directory, `.stash-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, source, { flag: "wx", mode: 0o600 });
    // Publish a complete file without overwriting a colliding name.
    await link(temporary, filePath);
  } catch (error) {
    if (isErrno(error, "EEXIST")) throw new Error(`A file named ${basename(filePath)} already exists. Choose another name, or edit the saved prompt.`);
    throw error;
  } finally {
    await unlink(temporary).catch((error) => { if (!isErrno(error, "ENOENT")) throw error; });
  }
  return filePath;
}

export async function updatePrompt(prompt: SavedPrompt, draft: PromptDraft): Promise<void> {
  const source = serializePrompt(draft, prompt.metadata);
  await requireUnchanged(prompt);
  const temporary = join(dirname(prompt.filePath), `.stash-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, source, { flag: "wx", mode: 0o600 });
    await requireUnchanged(prompt);
    await rename(temporary, prompt.filePath);
  } finally {
    await unlink(temporary).catch((error) => { if (!isErrno(error, "ENOENT")) throw error; });
  }
}

export async function deletePrompt(prompt: SavedPrompt): Promise<void> {
  await requireUnchanged(prompt);
  await unlink(prompt.filePath);
}
