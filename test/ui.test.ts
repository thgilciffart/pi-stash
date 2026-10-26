import assert from "node:assert/strict";
import { test } from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { plain, PromptPicker, PromptViewer, type PickerItem } from "../src/ui.ts";

const theme = { fg: (_color: string, text: string) => text } as Theme;
const items: PickerItem[] = [
  { id: "review", label: "[project] Review PR", description: "Look for regressions", body: "Inspect changes for incorrect behavior." },
  { id: "write", label: "[global] Write docs", description: "Explain the public interface", body: "Describe each function with examples." },
];

test("picker searches names, descriptions, and body text, and returns the selected ID", () => {
  for (const query of ["docs", "public", "examples"]) {
    let result: string | undefined;
    const picker = new PromptPicker("Prompts", items, theme, (id) => { result = id; }, () => {}, () => 24);
    picker.handleInput(query);
    const lines = picker.render(80).join("\n");
    assert.match(lines, /Write docs/);
    assert.match(lines, /Explain the public interface/);
    assert.doesNotMatch(lines, /Review PR/);
    picker.handleInput("\r");
    assert.equal(result, "write");
  }
});

test("picker handles no matches and cancellation without choosing a prompt", () => {
  const results: (string | undefined)[] = [];
  const picker = new PromptPicker("Prompts", items, theme, (id) => results.push(id), () => {}, () => 24);
  picker.handleInput("zzzzzzzzzzzzzzzzzz");
  picker.handleInput("\r");
  assert.deepEqual(results, []);
  assert.match(picker.render(30).join("\n"), /No matching prompts/);
  picker.handleInput("\x1b");
  assert.deepEqual(results, [undefined]);
});

test("picker and full prompt viewer respect terminal width and height", () => {
  const manyItems = Array.from({ length: 50 }, (_, index) => ({ ...items[0], id: `${index}`, label: `Prompt ${index} ${"界".repeat(40)}` }));
  const picker = new PromptPicker("Saved prompts", manyItems, theme, () => {}, () => {}, () => 18);
  const viewer = new PromptViewer("Long prompt", Array.from({ length: 100 }, (_, index) => `Line ${index}`).join("\n"), theme, () => {}, () => {}, () => 18);
  for (const component of [picker, viewer]) {
    const lines = component.render(24);
    assert.ok(lines.length <= 18);
    assert.ok(lines.every((line) => visibleWidth(line) <= 24));
  }
  viewer.handleInput("\x1b[F");
  assert.match(viewer.render(80).join("\n"), /Line 99/);
  viewer.handleInput("\x1b[H");
  assert.match(viewer.render(80).join("\n"), /Line 0 +\n/);
});

test("terminal escapes are removed for display while ordinary text remains", () => {
  assert.equal(plain("\x1b[31mHello\x1b[0m\x07\r\nworld"), "Hello\nworld");
});
