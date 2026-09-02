export const settingsContent = `# Settings

Open Settings with \`Ctrl+,\` or from the context menu. There are 13 sections:

| Section | What You Configure |
|---------|-------------------|
| **Appearance** | Theme, accent color, density, animations, cursor, Discord presence |
| **Terminal** | Font, colors, cursor, scrollback, behavior |
| **Editor** | Font, tab size, formatting, display options |
| **Workspace** | Auto-save, minimap, defaults, IDE launch |
| **Environment** | Prerequisites check |
| **CLI tools** | AI agent and tool CLI detection, install commands, timeouts |
| **YzPz Agent** | Built-in agent harness, model catalog |
| **IDE integration** | IDE detection and launch |
| **Keyboard shortcuts** | Shortcut reference |
| **Updates** | Update channel and auto-update behavior |
| **Data and storage** | Clear data, reset settings |
| **Quick prompts** | Preset prompt chips |
| **About** | Version and system information |

## Appearance

- **Theme**: Dark or Light
- **Accent color**: 8 colors (default, blue, purple, green, orange, red, pink, cyan)
- **UI density**: Compact, Comfortable, or Spacious
- **Animations**: Toggle all animations on or off (accessibility)
- **Custom cursor**: Toggle the animated cursor
- **Discord Rich Presence**: Show your workspace activity on Discord

## Terminal

- **Font family and size**
- **Colors**: Custom background and text colors with presets (Theme, Graphite, Midnight, Solarized, Paper), a reset button, and a live preview
- **Cursor**: Block, underline, or bar style, with optional blink
- **Scrollback size**: Defaults to 10,000 lines
- **Behavior**: Copy on select, paste on right-click, terminal bell, background opacity, word wrap

## Editor

- Font family, font size, tab size
- Word wrap, line numbers, bracket colorization
- Format on save, trim trailing whitespace

## Workspace

- Auto-save toggle and delay
- Minimap toggle
- Confirm before closing unsaved files
- Save workspace state between sessions
- Default layout template and default directory
- Launch IDE on workspace creation

## Environment

Check prerequisites at a glance: Node.js, npm, Git, bun, pnpm, and Docker.

## CLI Tools

- See which AI agents and tool CLIs are installed, with version and auth status
- Get install commands for missing CLIs
- Set the agent timeout

## YzPz Agent

- Configure the built-in agent harness (runs as a local Node sidecar; settings apply globally)
- Check the harness status
- Refresh the model catalog to pick up newly released models

## IDE Integration

Detects installed IDEs: VS Code, Visual Studio, Cursor, Zed, WebStorm, IntelliJ, Sublime Text, Windsurf, Perplexity, and Antigravity. Detected IDEs can be launched from the workspace.

## Updates

- Auto-check and auto-download updates
- Update channel: Stable, Beta, or Nightly
- Manual check with download progress, auto-install, and relaunch

## Quick Prompts

Manage the preset prompt chips that appear under the agent input, in terminal panes, and in the element inspector:

- Two groups: **Enhance** and **Adjust / Edit**
- Add, edit, and remove prompts with custom labels and prompt text
- **Drag to reorder** prompts within a group using the grip handle
- **Reset to defaults** restores the original presets

## Data and Storage

Clear application data and reset settings to defaults.

> **Warning:** Clearing data removes saved workspaces and preferences. Reset only when you intend a fresh start.
`;
