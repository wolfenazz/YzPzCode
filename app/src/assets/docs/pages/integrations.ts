export const integrationsContent = `# Integrations

## Discord Rich Presence

Show what you are working on directly on your Discord profile.

### Enabling

Toggle **Discord Rich Presence** under **Settings → Appearance**. If Discord is not running, the setting shows an amber notice asking you to open Discord first.

### What Shows on Discord

- **Activity name**: YzPzCode, with a large image tooltip showing the workspace name
- **State line**: "Workspace: \<name\>", or a default when no workspace is open
- **Details**, depending on what you are doing:
  - "Working in the terminal"
  - "Building with AI agents"
  - "Browsing project files"
  - "Previewing a web project"
  - "Editing \<file\>", "Reviewing changes in \<file\>", or "Editing image \<file\>" in the editor
  - "Reading the documentation", "Customizing the app", or "Choosing a workspace" in other screens
- **File icon**: When a file is open in the editor, a small badge image shows its file-type icon with a "File: \<filename\>" tooltip
- **Elapsed time** for the current activity, plus YzPzCode branding and links

The connection reconnects automatically if Discord restarts.

## IDE Integration

YzPzCode detects installed IDEs and can launch them with your workspace open:

| IDE | | |
|---|---|---|
| VS Code | Visual Studio | Cursor |
| Zed | WebStorm | IntelliJ |
| Sublime Text | Windsurf | Perplexity |
| Antigravity | | |

Manage detection under **Settings → IDE integration**, and select which IDEs to open when creating a workspace during setup.

## Workspace Templates

Templates capture a full workspace configuration so recurring project setups are one click away:

- Built-in seeds: **React**, **Rust**, **Python**, **Full-Stack**, **Quick Edit**, and **Custom**
- Save your own templates from a configured workspace setup, edit them later, or restore the defaults
- Selecting a template during setup skips straight to workspace creation

## Multi-Workspace

Open several workspaces at once and switch with tabs. Each workspace keeps independent:

- Terminal sessions and agent assignments
- Open files and editor state
- Browser tabs and navigation history
- Active view selection
`;
