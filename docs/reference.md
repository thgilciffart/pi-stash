# Command and file reference

pi-stash provides an interactive terminal extension. It saves text prompts in Markdown files and inserts their contents into Pi's editor.

## Commands

| Command | Behavior |
| --- | --- |
| `/stash` | Opens the menu to browse saved prompts, save from chat, or write a new prompt. |
| `/stash save` | Selects a sent user prompt from the current conversation branch, then opens the save dialogs. |

Selecting a saved prompt opens actions to insert it, view the full text, edit its text and metadata, or delete it after confirmation. Names can contain spaces. Same-name project and global prompts both remain visible with their scope labels.

`Ctrl+Alt+S` saves the current editor draft without submitting or clearing it. Terminal or operating-system shortcuts can intercept this key combination.

The picker supports text search, Up and Down to select, Enter to continue, and Esc to cancel. The full preview supports Up, Down, Page Up, Page Down, Home, and End. Enter or Esc closes the preview. Pi's configured selection keybindings also apply.

All workflows require Pi's terminal UI. RPC and print modes cannot open the custom picker.

## Storage

| Scope | Directory |
| --- | --- |
| Global | `~/.pi/agent/stashed-prompts/` |
| Project | `<cwd>/.pi/stashed-prompts/` |

Project storage uses Pi's current working directory directly. It does not search parent directories or the Git root.

Project prompts are available only when Pi trusts the project. Untrusted sessions can read and save global prompts.

Each directory contains prompt `.md` files. Discovery reads direct files and skips symlinked files and subdirectories. Invalid files produce warnings while valid files remain available. Changes made outside Pi appear the next time a picker or command reads the stash. Reload is unnecessary for prompt file changes.

New files use a filename derived from the name, such as `review-pr.md`. Creating a prompt never overwrites an existing filename. Editing a prompt keeps its filename and scope, even when its name changes. Deletion requires confirmation. Updates and deletion reject a file that changed since the command read it.

New prompt files have owner-only permissions on systems that support Unix permission bits. Prompt text remains plain text on disk. To share a project stash, commit `.pi/stashed-prompts/` to its repository. Use a repository ignore rule for prompts you want to keep local.

## Markdown format

```markdown
---
name: Review PR
description: Check correctness, tests, and edge cases
---
Review the current changes. Identify bugs and missing tests.
Explain each finding with a file reference and a concrete example.
```

`name` is a required nonempty YAML string without control characters. `description` is a YAML string and defaults to empty when omitted. The body must contain non-whitespace text. Full YAML syntax, including quoted strings and folded descriptions, is supported. The editor preserves unknown metadata fields when saving edits.

The prompt body retains its whitespace when read and written. New files place the body immediately after the closing frontmatter line. A blank line after that delimiter is part of the body.

Saved prompts contain text only. The extension does not store image attachments, interpolate arguments, or expand template variables. Stashed prompts appear through `/stash` and do not register individual skill or prompt-template commands. Prompts enter the conversation when you send the editor draft.
