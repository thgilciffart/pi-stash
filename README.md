# pi-stash

Save prompts from your Pi conversation, give them a name and description, and reuse them across projects.

## Install

Requires Pi 1.4 or later and Node.js 22.19 or later.

Install from GitHub:

```sh
pi install git:github.com/thgilciffart/pi-stash
```

Or install from npm after the package is published:

```sh
pi install npm:@thgilciffart/pi-stash
```

Run `/reload` in an existing Pi session, or restart Pi.

To try a local checkout before publication:

```sh
npm install
pi -e ./src/index.ts
```

## Save a prompt from chat

1. Run `/stash save`.
2. Search your sent prompts and select one. The newest prompts appear first.
3. Review or edit the prompt text.
4. Enter a name and description.
5. Choose project or global storage.

Global prompts live in `~/.pi/agent/stashed-prompts/`. Project prompts live in `.pi/stashed-prompts/` under Pi's current working directory.

The chat picker shows user messages from your current conversation branch, including messages retained before compaction. Image attachments are omitted.

To write a prompt directly, run `/stash` and choose **Write a new prompt**. To save an unsent editor draft, press `Ctrl+Alt+S`.

Press `Esc` in any save dialog to cancel. The stash keeps your editor draft intact.

## Reuse a saved prompt

Run `/stash` and choose **Browse saved prompts**, then type to search names, descriptions, and prompt text. Each entry shows its scope and description.

Select a prompt and choose **Insert into editor**. Pi appends the saved text to your current draft, with a blank line between them. Review the draft and send it when ready.

Choose **View full prompt** to read the prompt in a scrollable preview. The same menu lets you edit or delete it.

The only subcommand is `/stash save`, a shortcut for saving from chat. All other actions live in the `/stash` menus. See the [command and file reference](docs/reference.md) for controls and Markdown format.

## Develop and publish

```sh
npm ci
npm run check
npm pack --dry-run
```

See [Publish to npm](docs/publishing.md) for the release steps and Pi gallery metadata.

MIT licensed.
