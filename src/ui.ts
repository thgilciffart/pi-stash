import { stripVTControlCharacters } from "node:util";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, getKeybindings, Input, Key, matchesKey, Text, truncateToWidth, type Component, type Focusable } from "@earendil-works/pi-tui";

export function plain(text: string): string {
  return stripVTControlCharacters(text).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
}

export function singleLine(text: string): string {
  return plain(text).replace(/\s+/g, " ").trim();
}

export interface PickerItem {
  id: string;
  label: string;
  description: string;
  body: string;
}

export class PromptPicker implements Component, Focusable {
  private readonly search = new Input({ prompt: "Search: ", placeholder: "Name, description, or prompt text" });
  private selected = 0;

  constructor(
    private readonly title: string,
    private readonly items: PickerItem[],
    private readonly theme: Theme,
    private readonly done: (id: string | undefined) => void,
    private readonly requestRender: () => void,
    private readonly terminalRows: () => number,
  ) {}

  get focused(): boolean { return this.search.focused; }
  set focused(value: boolean) { this.search.focused = value; }

  private visible(): PickerItem[] {
    const query = this.search.getValue();
    return query ? fuzzyFilter(this.items, query, (item) => `${item.label} ${item.description} ${item.body}`) : this.items;
  }

  handleInput(data: string): void {
    const kb = getKeybindings();
    const items = this.visible();
    if (kb.matches(data, "tui.select.cancel")) { this.done(undefined); return; }
    if (kb.matches(data, "tui.select.confirm")) {
      if (items[this.selected]) this.done(items[this.selected].id);
      return;
    }
    if (kb.matches(data, "tui.select.up")) this.selected = items.length ? (this.selected + items.length - 1) % items.length : 0;
    else if (kb.matches(data, "tui.select.down")) this.selected = items.length ? (this.selected + 1) % items.length : 0;
    else { this.search.handleInput(data); this.selected = 0; }
    this.requestRender();
  }

  invalidate(): void { this.search.invalidate(); }

  render(width: number): string[] {
    const items = this.visible();
    const count = Math.max(1, Math.min(7, Math.floor((this.terminalRows() - 9) / 2)));
    const start = Math.max(0, Math.min(this.selected - Math.floor(count / 2), items.length - count));
    const line = (text: string) => truncateToWidth(text, Math.max(1, width));
    const lines = [line(this.theme.fg("accent", singleLine(this.title))), ...this.search.render(width), ""];
    for (let index = start; index < Math.min(start + count, items.length); index++) {
      const item = items[index];
      const selected = index === this.selected;
      const label = line(`${selected ? ">" : " "} ${singleLine(item.label)}`);
      const description = line(`  ${singleLine(item.description) || "No description"}`);
      lines.push(selected ? this.theme.fg("accent", label) : label, this.theme.fg("muted", description));
    }
    if (!items.length) lines.push(this.theme.fg("muted", "No matching prompts."));
    const selected = items[this.selected];
    if (selected) lines.push("", ...new Text(plain(selected.body), 0, 0).render(width).slice(0, 3));
    lines.push("", line(this.theme.fg("dim", `${items.length ? this.selected + 1 : 0}/${items.length}  Up/Down select · Enter continue · Esc cancel`)));
    return lines;
  }
}

export async function pickPrompt(ctx: ExtensionContext, title: string, items: PickerItem[]): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>((tui, theme, _kb, done) =>
    new PromptPicker(title, items, theme, done, () => tui.requestRender(), () => tui.terminal.rows),
  );
}

export class PromptViewer implements Component {
  private offset = 0;
  private pageSize = 12;
  private lineCount = 0;
  private readonly text: Text;

  constructor(
    private readonly title: string,
    body: string,
    private readonly theme: Theme,
    private readonly done: () => void,
    private readonly requestRender: () => void,
    private readonly terminalRows: () => number,
  ) { this.text = new Text(plain(body), 0, 0); }

  handleInput(data: string): void {
    const kb = getKeybindings();
    if (kb.matches(data, "tui.select.cancel") || kb.matches(data, "tui.select.confirm")) { this.done(); return; }
    if (kb.matches(data, "tui.select.up")) this.offset--;
    else if (kb.matches(data, "tui.select.down")) this.offset++;
    else if (kb.matches(data, "tui.select.pageUp")) this.offset -= this.pageSize;
    else if (kb.matches(data, "tui.select.pageDown") || data === " ") this.offset += this.pageSize;
    else if (matchesKey(data, Key.home)) this.offset = 0;
    else if (matchesKey(data, Key.end)) this.offset = this.lineCount;
    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, this.lineCount - this.pageSize)));
    this.requestRender();
  }

  invalidate(): void { this.text.invalidate(); }

  render(width: number): string[] {
    const lines = this.text.render(width);
    this.lineCount = lines.length;
    this.pageSize = Math.max(1, this.terminalRows() - 5);
    this.offset = Math.min(this.offset, Math.max(0, lines.length - this.pageSize));
    return [
      truncateToWidth(this.theme.fg("accent", singleLine(this.title)), width),
      "",
      ...lines.slice(this.offset, this.offset + this.pageSize),
      "",
      truncateToWidth(this.theme.fg("dim", `${this.offset + 1}-${Math.min(this.offset + this.pageSize, lines.length)}/${lines.length}  Up/Down scroll · PgUp/PgDn page · Enter/Esc close`), width),
    ];
  }
}

export async function viewPrompt(ctx: ExtensionContext, title: string, body: string): Promise<void> {
  await ctx.ui.custom<void>((tui, theme, _kb, done) =>
    new PromptViewer(title, body, theme, done, () => tui.requestRender(), () => tui.terminal.rows),
  );
}
