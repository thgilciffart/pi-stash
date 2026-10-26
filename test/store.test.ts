import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { createPrompt, deletePrompt, loadPrompts, parsePrompt, serializePrompt, storagePaths, updatePrompt, type PromptDraft } from "../src/store.ts";

const draft: PromptDraft = { name: "Review PR", description: 'Check: correctness, "tests", and edge cases', body: "\nReview this change.\n\nKeep the code block intact:\n```ts\n  run();\n```\n\n" };

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), "pi-stash-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cwd = join(directory, "repo");
  await mkdir(join(cwd, ".git"), { recursive: true });
  const paths = await storagePaths(cwd, join(directory, "home"));
  return { directory, cwd, paths };
}

test("YAML metadata and exact prompt whitespace survive a round trip", () => {
  const source = serializePrompt(draft, { tags: ["review"], custom: { enabled: true } });
  const parsed = parsePrompt(source);
  assert.equal(parsed.name, draft.name);
  assert.equal(parsed.description, draft.description);
  assert.equal(parsed.body, draft.body);
  assert.deepEqual(parsed.metadata.custom, { enabled: true });
  assert.deepEqual(parsed.metadata.tags, ["review"]);
});

test("handwritten YAML supports folded descriptions, Unicode names, and CRLF", () => {
  const prompt = parsePrompt('\uFEFF---\r\nname: "Révision 📝"\r\ndescription: >-\r\n  Check changes\r\n  and tests\r\n---\r\n  Keep indentation.\r\n');
  assert.equal(prompt.description, "Check changes and tests");
  assert.equal(prompt.body, "  Keep indentation.\r\n");
  assert.equal(prompt.name, "Révision 📝");
});

test("invalid metadata and empty prompts are rejected", () => {
  for (const source of [
    "A plain file", "---\nname: [broken\n---\nBody", "---\nname: 42\n---\nBody",
    "---\nname: ok\ndescription: [array]\n---\nBody", "---\nname: ok\n---\n  ",
    "---\n- a\n- b\n---\nBody", '---\nname: "bad\\nname"\n---\nBody',
    "---\nname: a\nname: b\n---\nBody",
  ]) assert.throws(() => parsePrompt(source));
});

test("storage uses Pi directories and keeps nested working directories independent", async (t) => {
  const { directory, cwd, paths } = await fixture(t);
  const nested = join(cwd, "src", "nested");
  await mkdir(nested, { recursive: true });
  const nestedPaths = await storagePaths(nested, join(directory, "home"));
  assert.equal(paths.global, join(directory, "home", ".pi", "agent", "stashed-prompts"));
  assert.equal(paths.project, join(cwd, ".pi", "stashed-prompts"));
  assert.equal(nestedPaths.project, join(nested, ".pi", "stashed-prompts"));
  assert.equal(nestedPaths.global, paths.global);
  await createPrompt(paths.project, draft);
  assert.deepEqual((await loadPrompts(nestedPaths)).prompts, []);
  await createPrompt(nestedPaths.project, { ...draft, body: "Nested instructions" });
  assert.equal((await loadPrompts(paths)).prompts[0].body, draft.body);
  assert.equal((await loadPrompts(nestedPaths)).prompts[0].body, "Nested instructions");
});

test("same-name global and project prompts both remain available with their scope", async (t) => {
  const { paths } = await fixture(t);
  await createPrompt(paths.global, draft);
  await createPrompt(paths.project, { ...draft, body: "Project instructions" });
  const { prompts, warnings } = await loadPrompts(paths);
  assert.deepEqual(warnings, []);
  assert.equal(prompts.length, 2);
  assert.ok(prompts.every((prompt) => prompt.name === "Review PR"));
  assert.equal(prompts.find((prompt) => prompt.scope === "global")?.body, draft.body);
  assert.equal(prompts.find((prompt) => prompt.scope === "project")?.body, "Project instructions");
  assert.equal((await loadPrompts(paths, false)).prompts[0].scope, "global");
  assert.equal((await loadPrompts(paths, false)).prompts.length, 1);
});

test("malformed files warn without hiding valid entries; symlinked files are ignored", async (t) => {
  const { paths, directory } = await fixture(t);
  await createPrompt(paths.project, draft);
  await writeFile(join(paths.project, "invalid.md"), "---\nname: [bad\n---\nBody");
  await writeFile(join(directory, "outside.md"), serializePrompt({ ...draft, name: "Outside" }));
  await symlink(join(directory, "outside.md"), join(paths.project, "linked.md"));
  const { prompts, warnings } = await loadPrompts(paths);
  assert.equal(prompts.length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /invalid\.md/);
});

test("filename collisions never overwrite files, even with concurrent saves", async (t) => {
  const { paths } = await fixture(t);
  const outcomes = await Promise.allSettled([createPrompt(paths.project, draft), createPrompt(paths.project, draft)]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  await assert.rejects(createPrompt(paths.project, { ...draft, name: "Review/PR" }), /already exists/);
  assert.deepEqual(await readdir(paths.project), ["review-pr.md"]);
  assert.equal(parsePrompt(await readFile(join(paths.project, "review-pr.md"), "utf8")).body, draft.body);
});

test("names cannot escape the stash directory; new files use private permissions", async (t) => {
  const { paths } = await fixture(t);
  const filePath = await createPrompt(paths.project, { ...draft, name: "../../Elsewhere" });
  assert.equal(basename(filePath), "elsewhere.md");
  assert.equal(filePath, join(paths.project, "elsewhere.md"));
  if (process.platform !== "win32") assert.equal((await stat(filePath)).mode & 0o777, 0o600);
});

test("editing preserves unknown metadata and leaves the filename stable", async (t) => {
  const { paths } = await fixture(t);
  const filePath = await createPrompt(paths.project, draft);
  await writeFile(filePath, serializePrompt(draft, { tags: ["review"] }));
  const prompt = (await loadPrompts(paths)).prompts[0];
  await updatePrompt(prompt, { ...draft, name: "Changed name", body: "Edited text" });
  const updated = (await loadPrompts(paths)).prompts[0];
  assert.equal(updated.filePath, filePath);
  assert.equal(updated.name, "Changed name");
  assert.equal(updated.body, "Edited text");
  assert.deepEqual(updated.metadata.tags, ["review"]);
  await deletePrompt(updated);
  assert.deepEqual(await readdir(paths.project), []);
});

test("external edits prevent stale updates and deletion", async (t) => {
  const { paths } = await fixture(t);
  const filePath = await createPrompt(paths.project, draft);
  const prompt = (await loadPrompts(paths)).prompts[0];
  await writeFile(filePath, "External edit");
  await assert.rejects(updatePrompt(prompt, { ...draft, body: "Overwrite" }), /changed on disk/);
  await assert.rejects(deletePrompt(prompt), /changed on disk/);
  assert.equal(await readFile(filePath, "utf8"), "External edit");
  assert.deepEqual(await readdir(paths.project), ["review-pr.md"]);
});

test("identical storage directories are not loaded twice", async (t) => {
  const { paths } = await fixture(t);
  await createPrompt(paths.global, draft);
  assert.equal((await loadPrompts({ global: paths.global, project: paths.global })).prompts.length, 1);
});
