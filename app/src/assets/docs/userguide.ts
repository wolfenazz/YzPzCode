export const userGuideContent = `# YzPzCode User Guide

## Table of Contents

1. [What is YzPzCode?](#what-is-yzpzcode)
2. [Getting Started](#getting-started)
3. [Before You Begin](#before-you-begin)
4. [How to Use YzPzCode](#how-to-use-yzpzcode)
5. [Understanding the Screens](#understanding-the-screens)
6. [The Setup Screen](#the-setup-screen)
7. [The Workspace Screen](#the-workspace-screen)
8. [Terminal Grid & Panes](#terminal-grid--panes)
9. [File Explorer](#file-explorer)
10. [Code Editor](#code-editor)
11. [File Previews](#file-previews)
12. [Git Integration](#git-integration)
13. [In-App Browser](#in-app-browser)
14. [Visual Design Inspector](#visual-design-inspector)
15. [Settings](#settings)
16. [Discord Rich Presence](#discord-rich-presence)
17. [External Terminals](#external-terminals)
18. [Quick Actions](#quick-actions)
19. [Keyboard Shortcuts](#keyboard-shortcuts)
20. [Common Tasks](#common-tasks)
21. [Tips for Success](#tips-for-success)
22. [Troubleshooting](#troubleshooting)
23. [Platform-Specific Tips](#platform-specific-tips)
24. [Button Reference](#button-reference)
25. [Frequently Asked Questions](#frequently-asked-questions)
26. [Getting More Help](#getting-more-help)

---

## What is YzPzCode?

YzPzCode is a **multi-terminal AI development environment** — a desktop app that lets you work with multiple AI coding assistants simultaneously, each in their own terminal window, all organized in a beautiful grid layout. It also includes an in-app web browser with visual design tools and support for 10 SaaS tool CLIs.

Think of it like having several AI assistants (Claude, Codex, Gemini, Cursor, Kilo, Hermes, Pi) and DevOps tools (GitHub, Stripe, Vercel, etc.) all helping you with your coding projects at the same time, with a built-in file explorer, code editor, and web browser.

**Why use YzPzCode?**
- **Parallel AI workflows** — Run multiple AI assistants side by side
- **Smart terminal grid** — Resizable, draggable terminal panes
- **Built-in file explorer** — Browse, search, and manage your project files
- **Code editor** — Syntax highlighting, find/replace, auto-save, minimap
- **Git integration** — Real-time status, diff stats, stage/unstage files
- **In-app browser** — Webview browser with tabs, zoom, device presets
- **Visual design inspector** — Inspect, capture, and apply styles from any webpage
- **Quick Actions** — Auto-detected Dev/Build commands for your project
- **Multi-workspace** — Switch between projects with tabbed workspaces
- **Tool CLI management** — 10 SaaS tools detected and auth-checked
- **Discord presence** — Show your activity on Discord

---

## Getting Started

### 1. Download and Install

- Download YzPzCode for your computer (Windows, macOS, or Linux)
- Open the downloaded file and follow the installation prompts
- Launch the app from your Applications folder, desktop, or Start menu

### 2. Quick Overview

When you first open YzPzCode, you'll see the **Setup Screen**. This is where you create your first workspace.

**What is a workspace?**
A workspace is like a project folder where you can work on one coding project. You can create multiple workspaces for different projects and switch between them with tabs.

---

## Before You Begin

### Install AI Tools

YzPzCode works with popular AI coding tools. You'll need to install at least one before you can use it:

| Tool | CLI Command | What it does |
|------|-------------|-------------|
| **Claude** | \`claude\` | General coding assistant |
| **Codex** | \`codex\` | Code generator |
| **Gemini** | \`gemini\` | Google's AI assistant |
| **Cursor** | \`cursor\` | AI-powered coding IDE |
| **Kilo** | \`kilo\` | Code agent for any task |
| **Hermes** | \`hermes\` | Fast coding agent |
| **Pi** | \`pi\` | Minimal terminal coding harness |
| **OpenCode** | \`opencode\` | Open-source AI coding |

### Sign In

After installing an AI tool, you'll need to sign in:
- Open your terminal or command prompt
- Type the tool's name and look for a "login" or "authenticate" option
- Follow the on-screen instructions

> **Tip:** You only need to do this once for each tool.

---

## How to Use YzPzCode

### Step 1: Create Your First Workspace

1. **Name your workspace**
   - Type a name like "my-project" or "website-work"
   - This helps you keep projects organized

2. **Choose a folder**
   - Click "Browse" to pick the folder where your project is
   - This is where your AI assistants will work

3. **Pick a layout**
   - Choose how many terminal windows you want
   - **1 Terminal**: Simple, focused work
   - **2-4 Terminals**: Good for most projects
   - **6-8 Terminals**: For complex projects

4. **Select IDEs (optional)**
   - Choose which IDEs to associate with the workspace
   - Launch IDEs directly from YzPzCode

### Step 2: Add AI Assistants

1. Find the "Agent Fleet" section
2. Turn on the AI tools you want to use (Claude, Codex, Gemini, etc.)
3. Use the \`+\` and \`-\` buttons to set how many windows each tool gets

**Example:** If you have 4 terminals and turn on Claude (2) and Codex (1), you'll have 1 empty terminal left for regular commands.

### Step 3: Start Working

1. Click the **Execute** button to create your workspace
2. You'll see your terminal grid with your AI assistants ready to go
3. Type commands in each terminal like you normally would
4. Use the **view switcher** to switch between Terminal, Editor, and Browser views

---

## Understanding the Screens

### Screen Types

YzPzCode has 5 main screens:

1. **Node.js Check Screen** — Appears on first launch to check prerequisites
2. **Setup Screen** — Where you create and configure workspaces
3. **Workspace Screen** — The main working area with terminals, editor, and browser
4. **Docs Screen** — Built-in user documentation
5. **Settings Screen** — Application configuration

### View Switcher

Within each Workspace Screen, you can switch between 3 views:
1. **Terminal View** — Multi-pane PTY terminal grid
2. **Editor View** — Code editor with file tabs
3. **Browser View** — In-app web browser

---

## The Setup Screen

The Setup Screen has these main areas:

| Section | What You Do |
|---------|-------------|
| **Workspace Name** | Give your project a name |
| **Directory** | Pick your project folder |
| **Layout** | Choose how many terminals (1/2/4/6/8) |
| **Agent Fleet** | Assign AI tools to terminals |
| **CLI Tools** | See what's installed |
| **IDE Selection** | Choose IDEs to launch |

### Setup View Modes

You can switch between two modes:
- **Page Mode**: All settings on one page
- **Stepper Mode**: Step-by-step guided setup

---

## The Workspace Screen

The Workspace Screen is your main working area. It has:

### Workspace Header

The header shows:
- **Workspace Tabs** — Switch between open workspaces
- **View Buttons** — Terminal, Editor, Browser view switcher
- **Theme Toggle** — Dark/light mode
- **Quick Actions** — Project-specific commands
- **Window Controls** — Minimize, maximize, close

### Multi-Workspace Support

You can open multiple workspaces at once. Each workspace has its own:
- Terminal sessions
- Open files and editor state
- Browser tabs and navigation history
- Active view selection

---

## Terminal Grid & Panes

### The Grid

Terminals are arranged in a grid:

| Layout | Sessions | Grid Size |
|--------|----------|-----------|
| 1 Terminal | 1 session | 1×1 |
| 2 Terminals | 2 sessions | 2×1 |
| 4 Terminals | 4 sessions | 2×2 |
| 6 Terminals | 6 sessions | 3×2 |
| 8 Terminals | 8 sessions | 4×2 |

### Terminal Panes

Each terminal pane shows:
- **Title Bar**: Shows TTY number, agent assignment, status indicator
- **Status Indicator**: Green dot for active, yellow for running, red for error
- **Terminal**: Full xterm.js terminal emulation

### Using Terminals

- **Click**: Focus a terminal
- **Type**: Enter commands
- **Drag**: Reorder terminal panes with drag and drop
- **Right-click**: Context menu with agent launch options

---

## File Explorer

The file explorer opens on the left side of the workspace.

### Features

- **Tree View**: Click folders to expand, files to open
- **Git Badges**: Color-coded indicators:
  - **Green** (M): Modified
  - **Yellow** (A): Added
  - **Red** (D): Deleted
  - **Gray** (?): Untracked
- **File Icons**: Language-aware icons for recognized file types
- **Context Menu**: Right-click for:
  - Copy, Cut, Paste
  - Rename, Delete
  - Duplicate
  - Reveal in File Manager
  - Git Stage / Git Unstage
- **Drag & Drop**: Move files by dragging
- **Import**: Import files into the workspace

### Quick Open

Press **Ctrl+P** to quickly search and open any file in your workspace.

---

## Code Editor

### Opening Files

Double-click a file in the explorer or use Quick Open (Ctrl+P).

### Multi-Tab Editing

- Files open as tabs at the top of the editor
- **Dirty indicator**: A dot appears on unsaved files
- **Tab context menu**: Right-click a tab to:
  - Close
  - Close Others
  - Close to the Right
  - Close Saved Files

### Editor Features

- **Syntax highlighting** for JS, TS, Python, Rust, Java, C++, HTML, CSS, JSON, Markdown
- **Minimap** on the right side for quick navigation
- **Find and Replace** (Ctrl+F)
- **Word Wrap** toggle
- **Bracket colorization** for matching brackets
- **Line numbers** with on/off/relative modes
- **Auto-save** with configurable delay

### File Previews

YzPzCode can preview:
- **Markdown files** (.md) — Rendered markdown preview
- **PDF files** (.pdf) — Embedded PDF viewer
- **Images** (.png, .jpg, .gif, .svg) — Image viewer
- **Spreadsheets** (.xlsx, .csv) — Table viewer
- **Word documents** (.docx) — Document viewer

---

## In-App Browser

The browser runs inside your workspace. Open it by clicking the Browser view button.

### Features

- **URL Bar**: Type any URL and press Enter
- **Multi-Tab**: Open multiple browser tabs
- **Navigation**: Back/Forward buttons
- **Zoom**: Adjust from 50% to 200%
- **Device Presets**:
  - **Responsive** (default)
  - **iPhone 14 Pro** (393×852)
  - **iPad** (820×1180)
- **Orientation**: Switch between portrait and landscape
- **Snapshot**: Export the full page HTML
- **Pop-Out**: Open the browser in a separate window

---

## Visual Design Inspector

The browser includes powerful design tools. Access them from the browser toolbar.

### Inspect Mode

- **What it does**: Hover over any element to see its HTML, classes, ID, and CSS selectors
- **How to use**: Click the Inspect button, then hover over elements
- **Exit**: Press Escape or click the Inspect button again

### Pick Style Mode

- **What it does**: Click an element to capture its computed CSS styles (including \`::before\` and \`::after\`)
- **How to use**: Click the Pick Style button, then click an element
- **Result**: Styles are saved to the Style Clipboard for later use

### Pick UI Element Mode

- **What it does**: Deep-capture an entire UI component with structure tree, layout, typography, visuals, and design intent
- **How to use**: Click Pick UI Element, then click a component
- **Result**: Full reference saved to the UI Reference Clipboard
- **Captured data**: Structure tree (up to 8 levels), layout grid, spacing, fonts, colors, shadows, assets, hover selectors, and auto-generated design analysis

### Apply Mode

- **What it does**: Apply captured styles to target elements
- **How to use**: Select a style from the clipboard, click Apply, then click an element
- **Preview**: Hover to preview before applying
- **Undo**: Use the undo button to revert applications
- **CSS Classes**: Generated CSS classes are injected into the page

---

## Settings

Press **Ctrl+,** or use the context menu to open Settings. There are 11 sections:

### 1. Appearance

- **Theme**: Dark or Light
- **Accent Color**: Choose from 8 colors (default, blue, purple, green, orange, red, pink, cyan)
- **UI Density**: Compact, Comfortable, or Spacious
- **Animations**: Toggle on/off for accessibility
- **Custom Cursor**: Toggle animated cursor

### 2. Terminal

- Font family, font size
- Custom terminal background and text colors, including curated presets and theme reset
- Cursor style (block, underline, bar) and blink
- Scrollback size (default: 10,000 lines)
- Copy on select, paste on right-click
- Terminal bell, background opacity, word wrap

### 3. Editor

- Font family, font size, tab size
- Word wrap, line numbers, bracket colorization
- Format on save, trim whitespace

### 4. Agents

- See which AI agents and tool CLIs are installed
- Get install commands for missing CLIs
- Set agent timeout

### 5. Workspace

- Auto-save toggle and delay
- Minimap toggle
- Confirm before closing unsaved files
- Save workspace state
- Default layout template and directory
- Launch IDE on workspace creation

### 6. IDE

- Detect installed IDEs
- Supported: VS Code, Cursor, Zed, Visual Studio, WebStorm, IntelliJ, Sublime Text, Windsurf, Perplexity, Antigravity

### 7. Updates

- Auto-check for updates
- Auto-download updates
- Update channel: Stable, Beta, Nightly
- Manual check for updates
- Download progress with auto-install and relaunch

### 8. Environment

Check prerequisites: Node.js, npm, git, bun, pnpm, Docker

### 9. Data

Clear application data and reset settings.

### 10. About

Version and OS information.

### 11. Shortcuts

Keyboard shortcuts reference.

---

## Discord Rich Presence

Show what you're working on in your Discord profile.

### Enabling

Go to **Settings → Appearance** and toggle **Discord Rich Presence**.

### What Shows on Discord

- **Workspace name** or "No workspace open"
- **Active file name** while editing or reviewing a diff
- **Current view** when using the terminal, AI agents, or browser preview
- **Elapsed time** since current activity started
- YzPzCode logo, plus GitHub and download links

---

## External Terminals

Launch native OS terminal windows with AI CLIs pre-configured.

### How It Works

- Windows: Opens CMD windows with auto-tiling
- macOS: Opens Terminal.app windows with positioned bounds
- Linux: Opens detected terminal (gnome-terminal, konsole, etc.) with wmctrl tiling

### Use Cases

- Running long-lived processes outside the app
- Opening additional terminals beyond the grid
- Quick access to a full OS terminal in your workspace directory

---

## Quick Actions

Quick Actions appear in the workspace header and provide:

- **Build commands** — Auto-detected from your project
- **Dev commands** — Common development tasks
- **One-click execution** — Run commands in the active terminal

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Settings | Ctrl+, |
| Quick Open File | Ctrl+P |
| Find in File | Ctrl+F |
| Copy | Ctrl+C (with text selected) |
| Paste | Ctrl+V |
| Clear Terminal | Ctrl+L (shell dependent) |
| Escape | Exit inspect/pick modes |
| Switch View | Click view buttons in header |

---

## Common Tasks

### Opening a File

1. Click the file explorer toggle to show the panel
2. Navigate to your file and click it
3. The file opens in the editor

### Checking Git Status

1. Click the Git icon in the explorer panel
2. See all modified, added, and deleted files
3. Click on files to see diff statistics

### Launching an IDE

1. Open **Settings → IDE**
2. Ensure your IDE is detected
3. Configure IDE launch on workspace creation

### Inspecting a Web Page

1. Switch to **Browser View**
2. Navigate to the page you want to inspect
3. Click **Inspect Mode** in the browser toolbar
4. Hover over elements to see their HTML structure

### Capturing a Design Reference

1. In the browser, click **Pick UI Element Mode**
2. Click on a UI component (card, nav bar, hero section, etc.)
3. The full design reference is captured with structure, styles, typography, and colors

---

## Tips for Success

### Best Practices

- **Name workspaces clearly** — Use project names you'll recognize
- **Match layout to work** — Start with 2-4 terminals, expand as needed
- **Use dedicated workspaces** — Different projects get different workspaces
- **Check CLI status** — Make sure your AI tools are installed and authenticated
- **Save often** — Enable auto-save for worry-free editing
- **Use the browser** — Preview your work without leaving the app
- **Capture references** — Use Pick UI Element to build a library of design references

### Workflow Ideas

- **Frontend dev**: Browser view + Claude + Codex + Editor
- **Backend API**: Gemini + multiple terminal sessions + Git integration
- **DevOps**: Tool CLIs (Vercel, Supabase, Stripe) + managed commands

---

## Troubleshooting

### CLI Tools Not Detected

**Try these:**
1. Click the refresh icon to re-detect
2. Check the CLI is in your system PATH
3. Restart YzPzCode

### Terminals Won't Start

**Try these:**
1. Close and reopen the workspace
2. Check the directory exists and is accessible
3. Restart the app

### Browser Shows Blank

**Try these:**
1. Check the URL is valid
2. Navigate to a different URL
3. Close and reopen the browser tab

### App Feels Slow

**Try these:**
1. Reduce the number of terminal sessions
2. Close unused workspaces
3. Disable animations in Settings

---

## Platform-Specific Tips

### Windows

- Terminals use CMD by default
- External terminals open with auto-tiling (grid layout)
- Use winget for CLI installations

### macOS

- macOS may require right-click to open (not code-signed yet)
- Terminal.app used for external terminals
- Use Homebrew for CLI installations

### Linux

- Terminal detection: gnome-terminal, konsole, xfce4-terminal
- wmctrl required for external terminal tiling
- Standard package managers for CLI installations

---

## Button Reference

| Button | Where | What It Does |
|--------|-------|-------------|
| Execute | Setup Screen | Create workspace |
| Browse | Setup Screen | Choose project folder |
| + | Workspace Header | New workspace |
| × | Workspace Tab | Close workspace |
| Theme | Header | Dark/Light toggle |
| Docs | Header | Open documentation |
| Settings | Context Menu | Open settings |
| Terminal/Editor/Browser | Header | Switch workspace view |
| Refresh | Agent Fleet | Re-detect CLIs |

---

## Frequently Asked Questions

### Do I need to install Node.js?

Yes. YzPzCode checks for Node.js on first launch and will prompt you to install it if missing.

### How many AI assistants can I use at once?

Up to 8 terminals in the grid, each can run a different AI CLI or shell.

### Can I use YzPzCode without AI tools?

Yes. Unassigned terminals run as regular shell sessions in your workspace directory.

### How do I update YzPzCode?

Check **Settings → Updates** for available updates. Configure update channel (Stable, Beta, Nightly).

---

## Getting More Help

If you can't find what you need:

1. Check the console for error messages
2. Look at the \`AGENTS.md\` file for development information
3. Open an issue on GitHub

---

## Next Steps

Now that you know the basics:

- Explore different agent combinations
- Try the in-app browser and visual design tools
- Set up Discord Rich Presence
- Customize your workspace experience

Happy coding with AI agents! 🚀
`;
