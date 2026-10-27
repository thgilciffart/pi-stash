# Command and file reference

## Commands and controls

All workflows require Pi's terminal UI.

| Command | Behavior |
| --- | --- |
| `/stash` | Opens the menu to browse prompts, save from chat, or write a new prompt. |
| `/stash save` | Selects a user prompt from the current conversation branch and opens the save dialogs. |
| Ctrl+Alt+S | Saves the editor draft without submitting or clearing it. Terminal shortcuts may intercept this key. |

A saved prompt's menu offers insertion, preview, editing, and deletion. Names can contain spaces. Same-name prompts remain separate and show their scope.

The picker supports text search, Up and Down, Enter to select, and Esc to cancel. The preview supports arrows, Page Up, Page Down, Home, and End. Enter or Esc closes it. Pi's selection keybindings also apply.

## Storage

| Scope | Directory |
| --- | --- |
| Global | `~/.pi/agent/stashed-prompts/` |
| Project | `<cwd>/.pi/stashed-prompts/` |

Project storage uses Pi's current working directory without searching parents. Project prompts require project trust. Global prompts remain available in untrusted sessions.

Discovery reads direct `.md` files and skips symlinks and subdirectories. Invalid files produce warnings. External changes appear the next time the stash is read, without a reload.

New filenames derive from prompt names and never overwrite an existing file. Editing preserves the filename and scope. Deletion requires confirmation. Edits and deletion reject files changed since the command read them.

New files have owner-only permissions where supported, but prompt text is plain text. A project stash can be committed for sharing or ignored for local use.

## Markdown format

```markdown
---
name: Review PR
description: Check correctness, tests, and edge cases
---
Review the current changes. Identify bugs and missing tests.
Explain each finding with a file reference and a concrete example.
```

`name` is a required nonempty YAML string without control characters. `description` is an optional string, empty by default. The body requires non-whitespace text. Full YAML syntax is supported, and edits preserve unknown metadata.

Body whitespace is preserved. A blank line after the closing frontmatter delimiter belongs to the body.

Prompts contain text only. They do not include attachments, expand arguments or template variables, or register individual commands. Insertion appends text to the editor draft; sending that draft adds it to the conversation.
