# YzPzCode User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Setup Screen](#setup-screen)
3. [Workspace Configuration](#workspace-configuration)
4. [CLI Tool Management](#cli-tool-management)
5. [Working with Workspaces](#working-with-workspaces)
6. [Terminal Operations](#terminal-operations)
7. [In-App Browser](#in-app-browser)
8. [Visual Design Inspector](#visual-design-inspector)
9. [AI Designer](#ai-designer)
10. [File Explorer & Git](#file-explorer--git)
11. [Code Editor](#code-editor)
12. [Settings](#settings)
13. [Discord Rich Presence](#discord-rich-presence)
14. [Managed Commands](#managed-commands)
15. [Keyboard Shortcuts](#keyboard-shortcuts)
16. [Tips & Best Practices](#tips--best-practices)
17. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Launching YzPzCode

To start YzPzCode, run:

```bash
npm run tauri dev
```

This will launch the application window with the setup screen.

### First Time Setup

When you first open YzPzCode, you'll be greeted by the **Setup Screen**. This is where you configure your first workspace for running AI coding agents.

---

## Setup Screen

The setup screen is your entry point to creating and configuring workspaces. It consists of these sections:

1. **Node.js Check** — Verifies Node.js is installed (prerequisite)
2. **Workspace Configuration** — Name, directory, and layout settings
3. **Agent Fleet Configuration** — Allocate AI agents to terminal slots
4. **CLI Tools** — Check installed AI CLI and tool CLIs
5. **IDE Selection** — Choose which IDEs to associate with your workspace

---

## Workspace Configuration

### 1. Workspace Name

Enter a descriptive name for your workspace (e.g., `my-project`, `frontend-dev`, `api-backend`).

### 2. Directory Selection

Choose the working directory for your project:

- Click the **"Browse"** button to open a folder picker
- Navigate to your project directory
- Select the folder and confirm
- Recent directories are tracked for quick access

### 3. Terminal Layout

Select how many terminal sessions you want in your workspace grid:

| Layout | Grid | Best For |
|--------|------|----------|
| 1 Terminal | 1×1 | Single focused agent |
| 2 Terminals | 2×1 | Two agents working together |
| 4 Terminals | 2×2 | Small team collaboration |
| 6 Terminals | 3×2 | Medium-scale projects |
| 8 Terminals | 4×2 | Large-scale parallel work |

Click on a layout option to see a visual preview. The selected layout will be highlighted.

---

## CLI Tool Management

YzPzCode supports **7 AI agent CLIs** and **10 SaaS tool CLIs**.

### AI Agent CLIs (7)

| Agent | CLI Binary | Description |
|-------|-----------|-------------|
| Claude | `claude` | Deep reasoning, patient explanations |
| Codex | `codex` | Code generation that works |
| Gemini | `gemini` | Fast, multimodal, Google's finest |
| OpenCode | `opencode` | Open-source freedom |
| Cursor | `cursor` | IDE-level AI assistance |
| Kilo | `kilo` | Code agent for any task |
| Hermes | `hermes` | Fast, efficient coding agent |

### SaaS Tool CLIs (10)

| Tool | CLI Binary | Description |
|------|-----------|-------------|
| GitHub | `gh` | Manage repositories, PRs, issues |
| Stripe | `stripe` | Payments, webhooks, event triggers |
| Supabase | `supabase` | Database, auth, storage |
| Valyu | `valyu-cli` | Web search & content extraction |
| PostHog | `posthog-cli` | Analytics, SQL querying |
| ElevenLabs | `elevenlabs` | TTS, STT, voice cloning |
| Ramp | `ramp` | Expense management, corporate cards |
| Google Workspace | `gws` | Gmail, Drive, Docs, Calendar |
| AgentMail | `agentmail-cli` | Email inbox management for AI agents |
| Vercel | `vercel` | Application deployment |

### Checking CLI Status

Each CLI shows status indicators:

- ✓ **Installed** — CLI is detected and ready to use
- ✗ **Not Installed** — CLI is not available on your system
- ⟳ **Checking** — Currently detecting CLI status
- ⚠ **Error** — Error occurred during detection

### Refreshing CLI Detection

Click the refresh icon to re-detect all CLI tools.

---

## Agent Fleet Configuration

### Understanding Agent Allocation

The Agent Fleet section allows you to assign specific AI agents to terminal slots in your workspace.

**Key Concepts:**
- **Total Slots**: Determined by your selected terminal layout
- **Allocated Slots**: Number of slots assigned to AI agents
- **Remaining Slots**: Unallocated slots (run as native shell sessions)

### Allocating Agents

1. **Enable an Agent** — Click the toggle switch next to the agent name
2. **Set Allocation Count** — Use the `+` and `-` buttons to adjust slot count
3. **Utilization Bar** — Shows current slot usage (used/total)

### Example Allocation

For a **4 Terminal Layout** with 2 Claude and 1 Codex:

```
Total Slots: 4
Claude: ████████ 2/2
Codex:    ████ 1/1
/bin/sh:  ████ 1 remaining
```

---

## Working with Workspaces

### Creating a Workspace

1. Verify all settings are complete
2. Click **[ Execute ]** button
3. You'll be automatically redirected to the Workspace view

### Workspace Header

The workspace header shows:

- **Workspace Tabs**: Open workspaces as clickable tabs
- **Active Workspace**: Currently selected tab (highlighted)
- **View Switcher**: Switch between Terminal, Editor, and Browser views
- **Theme Toggle**: Switch between dark and light themes
- **Designer Button**: Open the AI Designer
- **Docs Button**: Open built-in documentation

### Multi-Workspace Tabs

Open multiple workspaces and switch between them. Each workspace maintains its own:
- Terminal sessions and their states
- Open files and editor state
- Browser tabs and navigation history
- Active view selection

### 3 Workspace Views

Click view buttons to switch between:
1. **Terminal View** — Multi-pane PTY terminal grid
2. **Editor View** — CodeMirror 6 code editor with tabs
3. **Browser View** — In-app web browser

### Closing Workspaces

Click the **[ × ]** next to a workspace tab to close it and terminate all its sessions.

---

## Terminal Operations

### Terminal Grid

The main workspace area displays all terminal sessions in a grid layout matching your configuration.

Each terminal pane shows:
- **TTY Number** (e.g., TTY1, TTY2) — Session identifier
- **Status Indicator** — Active/running/idle/error status
- **Agent Assignment** — Which AI agent or shell is assigned
- **Terminal Output** — Interactive terminal with xterm.js emulation

### Using Terminals

1. **Select a Terminal**: Click on any terminal pane to focus it
2. **Enter Commands**: Type commands and press Enter
3. **Agent Context**: Each terminal runs in your workspace directory
4. **Copy/Paste**: Standard keyboard shortcuts

### Session Status

- **Idle** — Waiting for input
- **Running** — Processing a command
- **Error** — An error occurred

---

## In-App Browser

YzPzCode includes a built-in webview-based browser that can be opened in any workspace.

### Browser Features

- **Multi-Tab Browsing**: Open multiple tabs within the browser pane
- **URL Navigation**: Type URLs, use back/forward navigation
- **Zoom Controls**: Adjust zoom from 50% to 200%
- **Device Presets**: Switch between responsive, iPhone 14 Pro, and iPad views
- **Orientation**: Toggle between portrait and landscape for device views
- **Snapshot Export**: Capture the full page HTML as a snapshot
- **Pop-Out Mode**: Pop the browser out into a separate window
- **Page State Tracking**: Real-time URL, title, and history tracking

### Opening the Browser

Click the Browser view button in the workspace header to switch to browser mode.

---

## Visual Design Inspector

The browser comes with powerful visual design tools for inspecting and capturing styles from any webpage.

### Inspect Mode

- Hover over any element to see its HTML tag, classes, ID
- Shows element rectangle dimensions and position
- Displays CSS selectors for the highlighted element
- Press **Escape** to exit inspect mode

### Pick Style Mode

1. Activate Pick Style mode in the browser toolbar
2. Click any element on the page
3. Computed CSS styles (including `::before` and `::after` pseudo-elements) are captured
4. Styles are stored in the **Style Clipboard** for later use

### Pick UI Element Mode

1. Activate Pick UI Element mode
2. Click any UI component on the page
3. A deep capture is performed including:
   - **Structure Tree**: Full DOM hierarchy (up to 8 levels deep, 140 nodes)
   - **Layout**: Display, position, flexbox/grid properties
   - **Spacing**: Margin, padding, border-radius
   - **Typography**: Font family, size, weight, line-height
   - **Visuals**: Background, color, border, box-shadow, opacity
   - **Pseudo-elements**: `::before` and `::after` styles
   - **Assets**: Images, icons, background images
   - **Design Intent**: Auto-generated analysis of the component's design
   - **Hover Selectors**: Detected CSS hover rules targeting the element
4. Captured references are stored in the **UI Reference Clipboard**

### Apply Mode

1. Select a captured style from the Style Clipboard
2. Activate Apply mode
3. Hover over elements to preview the style application
4. Click to apply the styles (generates a CSS class and injects it)
5. **Undo**: Use the undo button to revert style applications

### Style Clipboard

- Stores all captured styles for reapplication
- View captured styles with their source URL and selectors
- Remove individual styles from the clipboard

### UI Reference Clipboard

- Stores captured UI component references
- Each reference includes full structure, style, and design analysis
- Use as reference when generating designs with the AI Designer

---

## AI Designer

Generate complete UI designs from natural language prompts using AI.

### Opening the Designer

Click the **Designer** button in the workspace header or context menu.

### Generating a Design

1. **Enter a Prompt**: Describe the design you want (e.g., "A modern SaaS landing page with hero section, features grid, and pricing table")
2. **Select a Theme**: Choose from curated design themes
3. **Choose Page Type**: Landing page, dashboard, or more
4. **Generate**: Click generate to create the design

### Design Preview

- View your design in responsive device frames
- Switch between desktop, tablet, and mobile views
- Toggle device orientation

### Customization

- **Theme Selector**: Change the design theme
- **Customization Panel**: Adjust colors, fonts, and spacing
- **Element Inspector**: Inspect generated design elements
- **Skills Manager**: Manage prompt engineering skills for better results

### Design History

- Browse previously generated designs
- Restore and iterate on past designs
- Export designs as HTML/CSS/JS code

### Code Export

Export your generated designs as clean HTML, CSS, and JavaScript code ready to use in your projects.

---

## File Explorer & Git

### File Explorer

The file explorer shows your workspace directory tree with:
- **Directory Navigation**: Expand/collapse folders
- **File Icons**: Language-aware file type icons
- **Git Status Badges**: Color-coded indicators for modified, added, deleted files
- **Context Menu**: Right-click for copy, cut, paste, rename, delete, duplicate, reveal in file manager
- **Drag & Drop**: Reorganize files

### Git Integration

- **Status Overview**: See modified, added, deleted, and untracked files
- **Diff Statistics**: Lines added/deleted per file
- **Stage/Unstage**: Stage or unstage files from the context menu
- **Git Changes Panel**: Full git status panel

---

## Code Editor

### Features

- **CodeMirror 6**: Syntax highlighting for JS, TS, Python, Rust, Java, C++, HTML, CSS, JSON, Markdown, and more
- **Multi-Tab Editing**: Open multiple files in tabs
- **Tab Context Menu**: Close, close others, close to right, close saved
- **Find/Replace**: Search and replace within files
- **Quick Open**: Ctrl+P to quickly find and open files
- **Minimap**: Navigate large files with the minimap
- **Auto-Save**: Configurable auto-save delay
- **Dirty State**: Unsaved changes indicator on tabs

### File Previews

YzPzCode can preview files that aren't plain text:
- **Markdown**: Rendered markdown preview
- **PDF**: Embedded PDF viewer
- **Images**: Image file viewer
- **Spreadsheets**: Excel/CSV viewer
- **Word Documents**: DOCX viewer

### Editor Settings

Customize in Settings → Editor:
- Font family, size, tab size
- Word wrap, line numbers (on/off/relative)
- Bracket colorization
- Format on save, trim whitespace
- Minimap toggle

---

## Settings

YzPzCode has **11 settings sections**. Open Settings from the context menu or press **Ctrl+,**

### 1. Appearance
- Theme: Dark/Light
- Accent Color: 8 options (default, blue, purple, green, orange, red, pink, cyan)
- UI Density: Compact, Comfortable, Spacious
- Animations: Toggle on/off (accessibility)
- Custom Cursor: Toggle on/off

### 2. Terminal
- Font family, font size
- Cursor style (block, underline, bar) and blink
- Scrollback size (default: 10,000 lines)
- Copy on select, paste on right-click
- Bell, opacity, word wrap

### 3. Editor
- Font family, font size, tab size
- Word wrap, line numbers, bracket colorization
- Format on save, trim whitespace

### 4. Agents
- AI agent CLI detection status
- Tool CLI detection status
- Install commands for missing CLIs
- Agent timeout setting

### 5. Workspace
- Auto-save toggle and delay
- Minimap toggle, confirm before close
- Save workspace state on exit
- Default layout template and directory
- Launch IDE on workspace creation

### 6. IDE
- Detect and select from 10 IDEs
- VS Code, Cursor, Zed, Visual Studio, WebStorm, IntelliJ, Sublime Text, Windsurf, Perplexity, Antigravity

### 7. Updates
- Auto-check for updates
- Auto-download updates
- Update channel: Stable, Beta, Nightly
- Manual check for updates

### 8. Environment
- Prerequisites status: Node.js, npm, git, bun, pnpm, Docker
- Version and minimum-version checking
- Install commands for missing prerequisites

### 9. Data
- Clear application data
- Reset settings

### 10. About
- App version
- OS information

### 11. Shortcuts
- Keyboard shortcuts reference

---

## Discord Rich Presence

YzPzCode can show your workspace activity on your Discord profile.

### Enabling Discord Presence

1. Open **Settings → Appearance**
2. Toggle **Discord Rich Presence** on
3. Your workspace name, activity details, and status will appear on your Discord profile

### What It Shows

- **Large Image**: YzPzCode logo
- **Details**: Current workspace name or "No workspace open"
- **State**: Current activity or "Idle"
- **Timestamps**: Elapsed time since starting the activity
- **Small Image**: Workspace icon (when workspace is open)

---

## Managed Commands

Run non-interactive shell commands inside the app with status tracking.

### How It Works

- Commands run in the background with real-time output
- Status tracking: Idle → Starting → Running → Stopping → Completed/Failed
- Each command has a monitored PID and exit code
- Commands can be stopped/killed from the UI

### Use Cases

- Running build scripts
- Executing tests
- Running database migrations
- Any long-running terminal command

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Settings | Ctrl+, |
| Quick Open File | Ctrl+P |
| Find in File | Ctrl+F |
| Copy | Ctrl+C (when text is selected) |
| Paste | Ctrl+V |
| Clear Terminal | Ctrl+L (depends on shell) |
| Open Designer | Click designer button in header |
| Open Docs | Click docs button in header |
| New Workspace | Click + in workspace tabs |
| Switch Workspace | Click tab in workspace header |
| Switch View | Click view buttons in workspace header |
| Toggle Explorer | Click explorer toggle |
| Switch Theme | Click theme toggle in header |
| Escape (Browser) | Exit inspect/pick-style mode |

---

## Tips & Best Practices

### Workspace Organization

- Use descriptive workspace names based on project type
- Create separate workspaces for frontend, backend, and testing
- Match layout size to your parallel work requirements

### Agent Selection

- **Claude**: General coding tasks and debugging
- **Codex**: Code generation and boilerplate
- **Gemini**: Multi-modal tasks (code + images/docs)
- **Kilo**: Complex code tasks
- **Mix agents** to leverage their strengths

### Browser & Designer

- Use **Inspect Mode** to understand the structure of any webpage
- Use **Pick UI Element** to capture design references for your projects
- Use the **AI Designer** to rapidly prototype UI concepts
- Combine captured references with the designer for consistent designs

### Performance

- Start with smaller layouts (2-4 terminals) for optimal performance
- Increase terminal count only when needed
- Close unused workspaces to free up resources
- Disable animations in settings for better performance on older hardware

### Workflow

1. Plan your agent allocations before creating the workspace
2. Use dedicated workspaces for different projects
3. Keep CLI tools updated for best compatibility
4. Regularly check CLI status to ensure agents are available
5. Use the browser and designer for front-end development workflows

---

## Troubleshooting

### CLI Tools Not Detected

**Problem:** Status shows "Not Installed" for a CLI you know is installed.

**Solutions:**
1. Click the refresh icon to re-detect CLI tools
2. Verify the CLI binary is in your system PATH
3. Restart YzPzCode
4. Check if the CLI requires authentication

### Workspace Creation Fails

**Problem:** Clicking "Execute" doesn't create the workspace.

**Solutions:**
1. Check that all required fields are filled
2. Verify the selected directory exists and is accessible
3. Ensure agent allocation doesn't exceed total slots
4. Check console for error messages

### Terminals Not Initializing

**Problem:** Workspace loads but terminals show "Initializing TTY Sessions" indefinitely.

**Solutions:**
1. Close and reopen the workspace
2. Check system permissions for the workspace directory
3. Verify PTY support on your system
4. Restart YzPzCode

### Browser Not Working

**Problem:** Browser view shows a blank page.

**Solutions:**
1. Check the URL is valid
2. Try navigating to a different URL
3. Close and reopen the browser tab
4. Ensure your system supports webview rendering

### Designer Not Generating

**Problem:** AI Designer isn't producing designs.

**Solutions:**
1. Make sure an AI CLI (like Claude) is installed and authenticated
2. Check your prompt is descriptive enough
3. Try a different theme or page type
4. Check the console for any error messages

### Agent Commands Not Working

**Problem:** Terminal runs but agent commands fail.

**Solutions:**
1. Verify the CLI is properly authenticated
2. Check API keys and authentication tokens
3. Ensure the agent CLI supports your current directory
4. Review CLI documentation for specific setup requirements

### Performance Issues

**Problem:** Application is slow or unresponsive.

**Solutions:**
1. Reduce the number of terminal sessions
2. Close unused workspaces
3. Check system resource usage (CPU, memory)
4. Disable animations in settings
5. Close other resource-intensive applications

---

## Getting Help

If you encounter issues not covered in this guide:

1. Check the console for error messages
2. Review the troubleshooting section above
3. Verify your CLI tools are properly installed and authenticated
4. Check the project documentation in `AGENTS.md` for development guidance

---

## Next Steps

Now that you're familiar with YzPzCode:

- Explore different agent combinations for your workflow
- Create multiple workspaces for different projects
- Use the in-app browser to preview your work
- Try the AI Designer for rapid UI prototyping
- Customize your layouts and settings for optimal productivity
- Enable Discord Rich Presence to share your progress

Happy coding with AI agents! 🚀
