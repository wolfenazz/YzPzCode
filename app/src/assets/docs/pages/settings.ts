export const settingsContent = `# Settings

Open Settings with \`Ctrl+,\` or from the settings button in the workspace header. The sections are grouped in the left sidebar. There are 17 sections:

| Group | Section | What You Configure |
|-------|---------|-------------------|
| **General** | **Appearance** | Theme, accent color, density, animations, cursor, custom themes |
| **General** | **Terminal** | Font, colors, cursor, scrollback, behavior |
| **General** | **Editor** | Font, tab size, formatting, display options |
| **General** | **Workspace** | Auto-save, minimap, defaults, IDE launch |
| **Tools** | **CLI tools** | AI agent and tool CLI detection, install commands, timeouts |
| **Tools** | **Writing** | Report profiles, the humanizer, writing engines, and saving |
| **Tools** | **Presentation** | Deck themes, presenter engines, slide batches, images, and saving |
| **Tools** | **Sheets** | Assistant language, the sheets engines, autosave, and version history |
| **Tools** | **Narration** | Offline text-to-speech voices, downloads, and the audio cache |
| **Tools** | **Application runs** | Commands offered by each terminal's Run button |
| **Tools** | **IDE integration** | Open new workspaces in your installed editors |
| **Tools** | **Quick prompts** | One-click prompts for the terminal and the element inspector |
| **System** | **Environment** | Software the app depends on, and whether it is installed |
| **System** | **Updates** | Update channel and auto-update behavior |
| **System** | **Data and storage** | Back up, restore, or clear what the app stores on this device |
| **System** | **Keyboard shortcuts** | Every shortcut available in the app |
| **System** | **About** | Version, credits, and links |

## Appearance

- **Theme**: Dark or Light, or a custom theme you build from nine colors
- **Accent color**: 8 colors (default, blue, purple, green, orange, red, pink, cyan)
- **UI density**: Compact, Comfortable, or Spacious
- **Animations**: Turn all animations on or off (accessibility)
- **Custom cursor**: Toggle the animated cursor

## Terminal

- **Font family and size**
- **Colors**: Background and text colors with presets (Theme, Graphite, Midnight, Solarized, Paper), a reset button, and a live preview
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
- Default layout and default directory
- Launch IDE on workspace creation

## CLI Tools

- See which AI agents and tool CLIs are installed, with version and sign-in status
- Get install commands for missing CLIs
- Set the agent timeout

## Writing

- Report profiles, the humanizer, the writing engine, and saving

## Presentation

- Deck themes, the presenter engine, slide batches, and saving
- **Images**: the web photo service (Openverse needs no key; Unsplash and Pexels use your key)

## Sheets

- **Workbooks**: the assistant language, right-to-left new sheets, and the formula bar
- **Engines**: which installed AI CLI builds workbooks, its model, rounds of reading cells, and the time limit per request
- **Saving**: autosave delay and how many version snapshots are kept in each workbook's history folder

## Narration

Offline text-to-speech voices, their downloads, and the audio cache.

## Application Runs

Saved Run and Build commands. Each terminal's Run button offers these commands.

## IDE Integration

Detects installed IDEs: VS Code, Visual Studio, Cursor, Zed, WebStorm, IntelliJ, Sublime Text, Windsurf, Perplexity, and Antigravity. Detected IDEs can be launched from a workspace.

## Quick Prompts

Manage the preset prompt chips that appear in terminal panes and in the element inspector:

- Two groups: **Enhance** and **Adjust / Edit**
- Add, edit, and remove prompts with custom labels and prompt text
- **Drag to reorder** prompts within a group using the grip handle
- **Reset to defaults** restores the original presets

## Environment

Check prerequisites at a glance: Node.js, npm, Git, bun, pnpm, and Docker.

## Updates

- Auto-check and auto-download updates
- Update channel: Stable, Beta, or Nightly
- Manual check with download progress, auto-install, and relaunch

## Data and Storage

Clear application data and reset settings to defaults.

> **Warning:** Clearing data removes saved workspaces and preferences. Reset only when you intend a fresh start.
`;
