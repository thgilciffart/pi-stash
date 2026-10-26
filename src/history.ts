import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export interface ChatPrompt {
  id: string;
  body: string;
  timestamp: string;
  number: number;
  imageCount: number;
}

export function chatPrompts(branch: readonly SessionEntry[]): ChatPrompt[] {
  const prompts: ChatPrompt[] = [];
  for (const entry of branch) {
    if (entry.type !== "message" || entry.message.role !== "user") continue;
    const content = entry.message.content;
    const body = typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    if (!body.trim()) continue;
    prompts.push({
      id: entry.id,
      body,
      timestamp: entry.timestamp,
      number: prompts.length + 1,
      imageCount: typeof content === "string" ? 0 : content.filter((part) => part.type === "image").length,
    });
  }
  return prompts.reverse();
}
