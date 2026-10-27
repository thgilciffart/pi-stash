# pi-stash

Save text prompts from [Pi](https://pi.dev) chat and reuse them across projects.

## Install

Requires Pi 1.4 or later and Node.js 22.19 or later. The extension uses Pi's interactive terminal UI.

```sh
pi install npm:@thgilciffart/pi-stash
```

Run `/reload` in an open Pi session.

## Save a prompt

1. Run `/stash save`.
2. Search and select a sent prompt from the current conversation branch.
3. Edit the text, enter a name and description, and choose project or global storage.

The chat picker includes messages retained before compaction and omits image attachments. To write a prompt, run `/stash` and choose **Write a new prompt**. Ctrl+Alt+S saves your unsent editor draft without clearing it. Esc cancels a save.

Global prompts live in `~/.pi/agent/stashed-prompts/`. Project prompts live in `.pi/stashed-prompts/` under Pi's current working directory and require project trust.

## Reuse a prompt

Run `/stash` and choose **Browse saved prompts**. Search names, descriptions, and text, then select a prompt and choose **Insert into editor**. Pi appends it to your draft with a blank line between them. Review and send the draft when ready.

The same menu lets you view, edit, or delete a prompt. See the [command and file reference](docs/reference.md) for controls and Markdown format.

## Develop

```sh
npm ci
npm run check
pi -e ./src/index.ts
```

See [publishing](docs/publishing.md) for release steps.

[MIT license](LICENSE).
