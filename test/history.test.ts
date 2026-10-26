import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { chatPrompts } from "../src/history.ts";

test("chat history includes only user text, newest first, including entries before compaction", () => {
  const branch = [
    { type: "message", id: "first", timestamp: "2026-10-25T01:00:00Z", message: { role: "user", content: "  Keep formatting\n" } },
    { type: "message", id: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Assistant response" }] } },
    { type: "compaction", summary: "A summary" },
    { type: "message", id: "mixed", timestamp: "2026-10-25T02:00:00Z", message: { role: "user", content: [{ type: "text", text: "First block" }, { type: "image", data: "...", mimeType: "image/png" }, { type: "text", text: "Second block" }] } },
    { type: "message", id: "image", message: { role: "user", content: [{ type: "image", data: "...", mimeType: "image/png" }] } },
    { type: "message", id: "tool", message: { role: "toolResult", content: [{ type: "text", text: "Tool output" }] } },
    { type: "custom_message", content: "Extension message" },
    { type: "message", id: "blank", message: { role: "user", content: " \n " } },
  ] as unknown as SessionEntry[];
  assert.deepEqual(chatPrompts(branch), [
    { id: "mixed", body: "First block\nSecond block", imageCount: 1, timestamp: "2026-10-25T02:00:00Z", number: 2 },
    { id: "first", body: "  Keep formatting\n", imageCount: 0, timestamp: "2026-10-25T01:00:00Z", number: 1 },
  ]);
});
