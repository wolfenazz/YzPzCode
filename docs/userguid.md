# YzPzCode User Guide

# Introduction

YzPzCode is a multi-terminal AI development environment. It is a desktop app that lets you run multiple AI coding assistants side by side, each in its own terminal pane, all organized in a resizable grid. It ships with a built-in file explorer, code editor, source control panel, in-app browser with visual design tools, and support for 11 AI agent CLIs and 10 SaaS tool CLIs.

## Why YzPzCode?

- **Parallel AI workflows**: Run Claude, Codex, Gemini, and more at the same time, each in its own terminal
- **Smart terminal grid**: Resizable, draggable panes with per-pane color customization
- **Local agent harness**: An app-managed agent runtime with ask, act, plan, and orchestrator modes
- **Built-in file explorer**: Browse, search, and manage project files with Git status badges
- **Code editor**: Syntax highlighting, find and replace, auto-save, minimap, and file previews
- **Source Control panel**: Stage, commit, diff, push, and pull without leaving the app
- **In-app browser**: Webview browser with tabs, device presets, zoom, and snapshots
- **Visual design inspector**: Inspect, capture, and apply styles from any webpage
- **AI Designer**: Prompt-based UI generation with live preview and code export
- **Image editor**: Layer-based image editing with brushes, shapes, text, and blend modes
- **Multi-workspace**: Switch between projects with tabbed workspaces
- **Discord Rich Presence**: Show your current activity on your Discord profile

## Supported AI Agents

YzPzCode detects, installs, authenticates, and launches these AI coding CLIs:

| Agent | CLI Command | Provider |
|-------|-------------|----------|
| Claude Code | `claude` | Anthropic |
| Codex CLI | `codex` | OpenAI |
| Gemini CLI | `gemini` | Google |
| OpenCode | `opencode` | Open source |
| Cursor CLI | `agent` | Cursor |
| Kilo CLI | `kilo` | Kilo Code |
| Hermes Agent | `hermes` | Nous Research |
| Pi Agent | `pi` | Pi |
| Command Code | `cmd` / `cmdc` | Command Code |
| Cline CLI | `cline` | Cline |
| Grok CLI | `grok` | xAI |

## Supported Tool CLIs

In addition to AI agents, YzPzCode detects and manages 10 SaaS tool CLIs:

`gh` (GitHub), `stripe` (Stripe), `supabase` (Supabase), `valyu` (Valyu), `posthog-cli` (PostHog), `elevenlabs` (ElevenLabs), `ramp` (Ramp), `gws` (Google Workspace), `agentmail` (AgentMail), `vercel` (Vercel)

See the [Tool CLIs](#docs/tool-clis) page for details on each.

## Platform Support

YzPzCode runs on Windows, macOS, and Linux.

> **Tip:** New to the app? Start with [Getting Started](#docs/getting-started), then explore the pages for the tools you plan to use.

---

# Getting Started

## 1. Download and Install

- Download YzPzCode for your platform (Windows, macOS, or Linux)
- Open the downloaded file and follow the installation prompts
- Launch the app from your Start menu, Applications folder, or desktop

## 2. Node.js Check

On first launch, YzPzCode checks for Node.js, which several agent CLIs and the built-in agent harness depend on. If Node.js is missing, the app shows an installation prompt. Other prerequisites such as Git, npm, bun, pnpm, and Docker can be checked later under **Settings → Environment**.

## 3. What is a Workspace?

A workspace is a project context: a name, a folder, a terminal layout, and a set of assigned AI agents. You can create multiple workspaces and switch between them with tabs at the top of the workspace screen. Each workspace keeps its own terminal sessions, open files, browser state, and active view.

## 4. The Setup Wizard

The Setup screen walks you through five steps: **Template → Workspace → Initialize → Layout → Agents**.

### Step 1: Choose a Template

Pick a starting point or configure everything manually:

| Template | What You Get |
|----------|-------------|
| **React** | Frontend development with 4 terminals |
| **Rust** | Rust development setup |
| **Python** | Data and backend development with 4 terminals |
| **Full-Stack** | 6 terminals for combined workloads |
| **Quick Edit** | Single terminal for quick tasks |
| **Custom** | Configure everything yourself |

You can save your own templates, edit them, or restore defaults. Choosing any template other than **Custom** skips the Layout and Agents steps and creates the workspace immediately.

### Step 2: Name and Locate the Workspace

- **Name your workspace**, for example "my-project" or "website-work"
- Click **Browse** to pick the project folder, or select one of your recent directories

### Step 3: Initialize (Optional)

The Initialize step offers scaffolding command templates grouped by category (React, Next.js, and more). For each command you can:

- **Run immediately**: Execute the command when the workspace opens
- **Paste command**: Place it in the terminal so you can edit it first
- **Copy**: Copy it to the clipboard

Skip this step if your project already exists.

### Step 4: Pick a Layout

Choose how many terminal panes the workspace uses: **1, 2, 4, 6, or 8** terminals, shown as grid previews.

- **1 Terminal**: Simple, focused work
- **2-4 Terminals**: Good for most projects
- **6-8 Terminals**: Parallel agent fleets and complex projects

There is also an **Open Terminals Externally** toggle. It opens the terminals as separate system windows outside the app instead of the grid, automatically tiled on your screen.

### Step 5: Assign Agents

The Agent Fleet section lists every supported AI agent (Claude, Codex, Gemini, OpenCode, Cursor, Kilo, Hermes, Pi, Command Code, Cline, Grok) and every tool CLI (GitHub, Stripe, Supabase, Valyu, PostHog, ElevenLabs, Ramp, Google WS, AgentMail, Vercel).

- Toggle an agent on to assign it to a terminal slot
- Use the `+` and `-` buttons to give an agent multiple slots
- Each agent shows a **status badge** with three states: detected, installable, and authenticated. Use the refresh button to re-detect, and follow the provided install command if a CLI is missing

You can also select IDEs (VS Code, Cursor, Zed, WebStorm, and more) to launch alongside the workspace.

> **Example:** With 4 terminals, assigning Claude (2) and Codex (1) leaves 1 empty terminal for regular shell commands.

## 5. Start Working

1. Click **Execute** to create the workspace
2. Your terminal grid opens with the assigned agents launched
3. Use the view switcher in the header to move between **Terminal**, **Editor**, and **Browser** views

## Setup View Modes

The Setup screen supports two modes:

- **Page Mode**: All settings on a single page
- **Stepper Mode**: The guided step-by-step wizard described above

> **Tip:** Revisit templates later. Saved templates let you spin up a new workspace for a repeat project type in seconds.

---

# AI Agents

YzPzCode detects, installs, authenticates, and launches AI coding agents into terminal panes. Each agent is a CLI tool that runs in your workspace directory.

## Supported Agents

| Agent | CLI Command | What it does |
|-------|-------------|-------------|
| **Claude Code** | `claude` | Anthropic's advanced AI coding assistant |
| **Codex CLI** | `codex` | OpenAI's code generation and development CLI |
| **Gemini CLI** | `gemini` | Google's Gemini assistant for terminal-based development |
| **OpenCode** | `opencode` | Open-source AI command-line coding assistant |
| **Cursor CLI** | `agent` | Cursor's AI-enhanced development agent |
| **Kilo CLI** | `kilo` | Agentic coding CLI with TUI and autonomous mode |
| **Hermes Agent** | `hermes` | Autonomous agent with tool use and multi-modal capabilities |
| **Pi Agent** | `pi` | Minimal terminal coding harness with extensions and skills |
| **Command Code** | `cmd` / `cmdc` | Agentic coding CLI that learns your taste and applies it to every session |
| **Cline CLI** | `cline` | Agentic coding CLI with interactive TUI and headless automation |
| **Grok CLI** | `grok` | xAI's agentic coding assistant |

## Installing and Signing In

1. Install the CLI for the agent you want. Each missing agent in the Agent Fleet shows its install command, or see **Settings → CLI tools**
2. Sign in from any terminal: type the tool's name and use its login or authenticate option
3. Click the refresh button in the Agent Fleet to re-detect install and auth status

> **Tip:** You only need to sign in once per tool. YzPzCode checks each agent's credentials and shows an auth badge next to it.

## The YzPz Agent Harness

Alongside external CLIs, YzPzCode ships its own agent harness. It runs as a local Node sidecar, so it needs Node.js installed. Configure it under **Settings → YzPz Agent**.

### Session Modes

| Mode | Behavior |
|------|----------|
| **Ask** | Read-only. Answers questions, reads and searches files, never edits or runs commands |
| **Act** (default) | Full access. Can modify files and execute commands |
| **Plan** | Read-only planning for complex work before acting |
| **Orchestrator** | Coordinates work across sessions |

The mode is enforced: in Ask or Plan mode, file edits and command execution are blocked by a tool guard, so you never have to worry about accidental changes.

### Fast Mode and Token Budget

- **Fast mode**: A per-session toggle that directs the agent to complete the request as fast as possible. Turn it off to let the agent work normally again
- **Token limit**: Set a budget when starting a session (leave it at zero for unlimited). The harness stops the session when the budget is reached, and the usage meter in the agent pane shows live usage against the limit

### Queued Prompts

If an agent is already working and you send another message, it is queued instead of interrupting the running task.

- Queued prompts appear in an **"Up next"** strip above the input box, numbered and in order
- Remove a single prompt with the **X** next to it, or use **Clear all**
- Pressing **Stop** interrupts the running task and clears its queued prompts
- The queue survives a pane refresh

## Images in Agent Chat

- Attach images with the paperclip button or paste them directly into the composer
- Attachments are normalized automatically into a small, provider-neutral JPEG, so oversized or unusual formats do not break the request
- If the selected model does not support vision, you will see a notice asking you to attach a document or choose a vision model instead
- Images generated by the agent appear in the transcript as **Generated image** cards

## Live Model Catalog

The agent harness periodically syncs the provider and model catalog from models.dev. When new models are published, they appear in the model pickers without restarting the app. You can also refresh manually with the **Refresh model catalog** button under **Settings → YzPz Agent**.

## Quick Prompts

Quick prompts are preset, clickable prompts shown as a row of chips under the agent input when it is idle. Clicking a chip appends its text to the message box so you can review or edit it before sending.

Configure your own presets under **Settings → Quick prompts**, where you can add, edit, remove, and drag-to-reorder prompts in two groups (Enhance and Adjust / Edit), or reset to the defaults. The same presets also appear in the terminal quick prompt strip and the element inspector panel.

---

# Tool CLIs

YzPzCode detects, authenticates, and launches 10 SaaS tool CLIs alongside AI agents. They can be assigned to terminal slots in the Agent Fleet and launched like any other CLI, and their login status is checked automatically.

## The Tools

| Tool | CLI Command | What it does |
|------|-------------|-------------|
| **GitHub CLI** | `gh` | Manage repositories, pull requests, and issues from the terminal |
| **Stripe CLI** | `stripe` | Payments, webhooks, and Stripe API testing from the terminal |
| **Supabase CLI** | `supabase` | Local Postgres stack, auth, storage, and database management |
| **Valyu CLI** | `valyu` | Web search, content extraction, and AI reasoning data access |
| **PostHog CLI** | `posthog-cli` | Analytics, SQL querying, and sourcemap management |
| **ElevenLabs CLI** | `elevenlabs` | Text-to-speech, voice cloning, and AI voice agent management |
| **Ramp CLI** | `ramp` | Expense management and programmatic corporate card issuance for AI agents |
| **Google Workspace CLI** | `gws` | Control Gmail, Drive, Docs, Calendar, and Sheets from the terminal |
| **AgentMail CLI** | `agentmail` | Email inbox management and transactional emails for AI agents |
| **Vercel CLI** | `vercel` | Fast application deployment and cloud environment management |

## Using Tool CLIs

1. **Install** the CLI you need. Each tool shows its install command under **Settings → CLI tools** if it is not detected
2. **Authenticate** by running the tool's login command in any terminal (for example `gh auth login` or `vercel login`)
3. **Assign** the tool to a terminal slot in the workspace setup Agent Fleet, or launch it from a terminal pane at any time

> **Tip:** Tool CLIs are great companions to agents. A common setup pairs the GitHub CLI with an AI agent so the agent can open pull requests while you manage releases from a second pane.

## Common Commands

| Tool | Common Command | Purpose |
|------|---------------|---------|
| GitHub | `gh pr create` | Open a pull request |
| GitHub | `gh repo clone <repo>` | Clone a repository |
| Stripe | `stripe listen` | Forward webhooks to your local server |
| Supabase | `supabase start` | Start the local development stack |
| Vercel | `vercel deploy` | Deploy the current project |
| PostHog | `posthog-cli sourcemap upload` | Upload source maps for error decoding |

## Checking Status

The **CLI tools** section in Settings lists every AI agent and tool CLI with its detection and authentication status, the detected version, and install commands for anything missing. Use the refresh button to re-scan after installing a new CLI.

---

# Terminals

## The Terminal Grid

Terminals are arranged in a resizable grid within the workspace:

| Layout | Sessions | Grid Size |
|--------|----------|-----------|
| 1 Terminal | 1 session | 1×1 |
| 2 Terminals | 2 sessions | 2×1 |
| 4 Terminals | 4 sessions | 2×2 |
| 6 Terminals | 6 sessions | 3×2 |
| 8 Terminals | 8 sessions | 4×2 |

Each pane has a title bar showing the TTY number, the assigned agent, and a status indicator (green for active, yellow for running, red for error).

## Using Terminals

- **Click**: Focus a terminal
- **Type**: Enter commands exactly as in a native terminal (full xterm.js emulation)
- **Drag**: Reorder panes with drag and drop
- **Right-click**: Context menu with agent launch options

## Quick Prompts in Terminals

Every terminal pane can show a **quick prompt strip**: a horizontally scrollable row of preset prompt chips below the header.

- Toggle it per-pane with the sparkle button in the terminal header ("Show quick prompts")
- Clicking a chip runs its prompt text immediately in that terminal session
- The same presets you configure under **Settings → Quick prompts** appear here and in the agent input

## Terminal Colors

Personalize each terminal's canvas under **Settings → Terminal → Colors**:

- **Background** and **Text** color pickers, each showing the current hex value or "Theme default"
- One-click **presets**: Theme, Graphite, Midnight, Solarized, and Paper
- **Reset colors** returns both values to the app theme
- A live preview in the settings page shows the result before you commit to it

## Managed Commands

Run non-interactive commands inside app terminals with full status tracking. A managed command moves through Idle → Starting → Running → Stopping, and ends as Completed or Failed, with the PID and exit code monitored and output streamed in real time.

## Quick Actions

The **Quick Actions** menu in the workspace header auto-detects your project's dev and build commands (from package.json scripts and similar) and runs them in the active terminal with one click.

## External Terminals

Prefer native windows? Launch OS terminal windows with the workspace directory pre-configured:

- **Windows**: CMD windows with automatic grid tiling
- **macOS**: Terminal.app windows with positioned bounds
- **Linux**: The detected system terminal (gnome-terminal, konsole, xfce4-terminal) tiled via wmctrl

This is also the mode selected by the **Open Terminals Externally** toggle in workspace setup. Use external terminals for long-lived processes, additional terminals beyond the grid, or a full OS terminal experience.

> **Tip:** Keep agent CLIs in the app grid where you can watch all of them at once, and push long-running dev servers to external windows.

---

# Editor and Files

## File Explorer

The file explorer opens on the left side of the workspace.

### Features

- **Tree view**: Click folders to expand, files to open, with virtualized rendering for large projects
- **Git badges**: Color-coded status per file:
  - **Green** (M): Modified
  - **Yellow** (A): Added
  - **Red** (D): Deleted
  - **Gray** (?): Untracked
- **File icons**: Language-aware icons for recognized file types
- **Context menu**: Right-click a file for Copy, Cut, Paste, Rename, Delete, Duplicate, Reveal in File Manager, and Git Stage / Unstage
- **Drag and drop**: Move files by dragging
- **Import**: Import files into the workspace

### Quick Open

Press `Ctrl+P` to search and open any file in the workspace instantly.

## Code Editor

Files open as tabs in the editor view.

- **Syntax highlighting** for JavaScript, TypeScript, Python, Rust, Java, C++, HTML, CSS, JSON, Markdown, and more
- **Minimap** for quick navigation
- **Find and Replace** (`Ctrl+F`)
- **Word wrap** toggle and **bracket colorization**
- **Line numbers** with on / off / relative modes
- **Auto-save** with a configurable delay
- **Dirty indicator**: A dot on unsaved tabs
- **Tab context menu**: Close, Close Others, Close to the Right, Close Saved

## File Previews

YzPzCode previews common formats directly:

| Format | Preview |
|--------|---------|
| Markdown (`.md`) | Rendered markdown |
| PDF (`.pdf`) | Embedded viewer |
| Images (`.png`, `.jpg`, `.gif`, `.svg`) | Image viewer |
| Spreadsheets (`.xlsx`, `.csv`) | Table viewer |
| Word documents (`.docx`) | Document viewer |

## Image Editor

Open any image from the file editor with the **Image Editor** toolbar button, or start fresh with **New Document** / **Open Image** inside the editor. It is a layer-based editor built for quick visual work.

### Tools

| Category | Tools |
|----------|-------|
| Selection | Rectangular and elliptical marquee, lasso, crop |
| Paint | Brush, eraser, paint bucket, eyedropper |
| Shapes | Rectangle, ellipse, line, text |
| Navigation | Move, hand, zoom |

Each tool has a keyboard shortcut (shown in tooltips), and paint tools expose **Size**, **Opacity**, and **Hardness** sliders. Foreground and background color swatches include a swap button and an HSV color picker.

### Layers

The layers panel supports thumbnails, rename, visibility toggles, opacity, blend modes, drag-to-reorder, and add / duplicate / merge down / flatten / delete actions.

### Saving

- **Save** (`Ctrl+S`) and **Save As** (`Ctrl+Shift+S`) with an unsaved-changes badge
- Undo / redo, fit and 100% zoom controls, and a status bar showing document dimensions, layer count, active tool, and zoom

> **Tip:** The image editor is handy for screenshots you want to annotate before attaching them to an agent prompt.

---

# Source Control

The Source Control panel is a GitHub Desktop-style Git interface built into the workspace. It replaces the file explorer in the sidebar when opened.

## The Panel

The panel has two tabs: **Changes** and **History**.

### Header

The header always shows your current state:

- **Current branch** name
- **Remote** URL, or "No remote configured"
- **Ahead / behind badges** (`↑n` / `↓n`) showing unpushed and unfetched commits
- A link to the repository on GitHub
- Three buttons: **Fetch**, **Pull**, and **Push** to sync with the remote

## Changes Tab

Lists every changed file with per-file add and deletion counts and status colors.

- **Filter box**: Search changed files by name
- **Funnel toggle**: Show only untracked changes or all changes
- **Changed files count** with a refresh button
- Hovering a file reveals four actions:
  - **Compare with HEAD**: Opens the diff for that file
  - **Discard changes**: Reverts the file (asks for confirmation first)
  - **Stage** (+) and **Unstage** (-) the file

You can also stage and unstage directly from the file explorer context menu.

## Committing

The commit bar at the bottom has:

- **Summary** (required) and an optional **Description**
- A **"Push to \<remote\> after commit"** checkbox to commit and push in one step
- A **"Commit N files to \<branch\>"** button

## History Tab

- Lists the current branch, other local branches (click one to check it out), and the last 20 commits
- Each entry shows the commit message, short hash, author, and date

## Git Badges Everywhere

Git status is integrated across the app:

- File explorer badges show modified, added, deleted, and untracked files
- Diff statistics appear per file
- The file watcher updates statuses in real time as you edit

> **Tip:** Keep the Source Control panel open next to your agent terminals. When an agent finishes editing files, review its changes as diffs and stage only what you want to keep.

---

# Browser and Design Tools

## In-App Browser

The browser runs inside your workspace. Open it with the **Browser** view button in the header.

### Browsing

- **URL bar**: Type any URL and press Enter
- **Multi-tab**: Open, switch, and close multiple browser tabs
- **Back / Forward**: Standard navigation history
- **Localhost menu**: The URL bar doubles as a dev-server picker that probes common ports (5173, 3000, 8080, and more) across all your terminals, so you can jump straight to a running dev server
- **Open externally**: Send the current URL to your system browser
- **Pop-out / Dock**: Open the browser in a separate app window, or dock it back into the workspace

### Preview Controls

The bottom workbench bar holds the responsive preview controls:

- **Device presets**: Responsive, iPhone 14 Pro (393×852), iPad (820×1180)
- **Rotate orientation**: Switch between portrait and landscape (disabled for Responsive)
- **Zoom**: 50% to 200% with reset
- **Status metrics**: Viewport size, page load duration, history count, page title, and current URL

### Snapshots

**Export snapshot** saves a full HTML capture of the current page into your workspace, useful as a design reference for agents.

## Visual Design Inspector

The browser includes four design-inspection modes, available from the browser toolbar.

### Inspect Mode

Hover over any element to see its HTML, classes, ID, and CSS selectors. Click the Inspect button to toggle it, or press `Escape` to exit.

### Pick Style Mode

Click an element to capture its computed CSS styles (including `::before` and `::after` pseudo-elements). Captures are saved to the **Style clipboard**, shown in a sidebar with a count badge.

### Copy UI Mode

**Copy a UI element from any page and rebuild it in your local project.** Clicking an element captures a full reference: structure tree, layout grid, spacing, typography, colors, shadows, and assets. The capture feeds a rich prompt, which you can:

- Send to any terminal session running an agent, or to the built-in YzPz Agent
- Use in **replace** mode or **insert** mode, depending on whether you are replacing an element in your project or adding a new one

### Apply Mode

Apply captured styles from the Style clipboard to target elements in the page. Hover previews the result before you click, and the undo button reverts applications. Generated CSS classes are injected into the page.

> **Tip:** A common workflow: capture a reference component with Copy UI, send it to an agent session with a prompt describing how to adapt it, then preview the result in the browser's device presets.

---

# AI Designer

The AI Designer is a prompt-based design studio. Describe the interface you want, pick a page type and theme, and the app generates a complete design you can preview, refine, and export as code.

## Creating a Design

The prompt form has:

- **Idea**: A text description of what you want to build
- **Page type**: Landing page, Website page, Dashboard, Mobile app screen, Form flow, Portfolio, Product page, or Admin panel
- **Theme**: 14 visual directions including Terminal Pro, Minimal SaaS, Futuristic Dark, Neon Cyberpunk, Clean Dashboard, Glassmorphism, Luxury Editorial, Apple-inspired, Material Design, Brutalist, Mobile-first, Developer Portfolio, Enterprise Admin, and Soft Gradient
- **Device**: Responsive, Desktop, Tablet, or Mobile
- **Required sections and mood**: Optional fields to steer the result

Starter chips (Prototype, Slide deck, From Figma, From template, and more) prefill the form with example prompts.

## Refining with the Inspector

After generation, the live preview opens with:

- **Responsive preview controls**: Switch between Responsive, Desktop, Tablet, and Mobile
- **Element inspector**: Browse the generated design as layers. Rename, hide or show, duplicate, and delete elements
- **Customization panel**: Edit CSS properties directly, including display, direction, justify, align, padding, margin, and font family, size, and weight

## Design History

Every iteration is recorded. The **Design history** panel lists past versions so you can undo to a previous design at any time and compare iterations.

## Exporting Code

The **Generated code panel** shows the output with **HTML / CSS / Map / Prompt** tabs and a **Copy active code** button.

Use **Save to Design** to export the files to your workspace's `Design` folder:

- `index.html`
- `styles.css`
- `designer-meta.json` (generation metadata)

## Design Skills

Design skills are persistent preference lines that influence future generations, for example "Always use dark mode." Add them in the **Design skills** manager, where example chips show the format.

## Dispatching to Agents

An agent selector (Codex, Claude, Gemini, and others) lets you send the generated design to an agent session for further implementation work in your actual project.

> **Tip:** Combine the AI Designer with the browser's Copy UI mode: capture a component you like from any webpage, then use it as the reference for your next design generation.

---

# Settings

Open Settings with `Ctrl+,` or from the context menu. There are 13 sections:

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

---

# Integrations

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

---

# Shortcuts and Help

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Settings | `Ctrl+,` |
| Quick Open file | `Ctrl+P` |
| Find in file | `Ctrl+F` |
| Search documentation | `Ctrl+K` |
| Save (image editor) | `Ctrl+S` |
| Save As (image editor) | `Ctrl+Shift+S` |
| Copy | `Ctrl+C` (with text selected) |
| Paste | `Ctrl+V` |
| Clear terminal | `Ctrl+L` (shell dependent) |
| Exit inspect / pick modes | `Escape` |

## Common Tasks

### Opening a File

1. Toggle the file explorer panel
2. Navigate to your file and click it
3. The file opens in the editor, or press `Ctrl+P` and type its name

### Checking Git Status

1. Open the **Source Control** panel
2. Review changed files with add and deletion counts
3. Click **Compare with HEAD** on any file to see its diff

### Committing and Pushing

1. In the Source Control panel, stage your files
2. Write a summary and optional description
3. Tick **Push to \<remote\> after commit** and click the commit button

### Sending Work to an Agent

1. Type your prompt in the agent input, or click a quick prompt chip
2. Add images with the paperclip or by pasting
3. If the agent is busy, your prompt joins the **Up next** queue automatically

### Inspecting a Web Page

1. Switch to **Browser view**
2. Navigate to the page and click **Inspect** in the toolbar
3. Hover elements to see their HTML structure

### Capturing a Design Reference

1. In the browser, click **Copy UI**
2. Click any component (card, nav bar, hero section)
3. Send the captured reference to an agent session to rebuild it in your project

## Troubleshooting

### CLI Tools Not Detected

1. Click the refresh button in the Agent Fleet or under **Settings → CLI tools**
2. Verify the CLI is on your system PATH
3. Restart YzPzCode

### Terminals Won't Start

1. Close and reopen the workspace
2. Check that the directory exists and is accessible
3. Restart the app

### Browser Shows Blank

1. Check the URL is valid
2. Try the localhost dev-server menu to find a running server
3. Close and reopen the browser tab

### Discord Presence Not Showing

1. Make sure Discord is running and you are logged in
2. Re-enable the toggle under **Settings → Appearance**
3. The app reconnects automatically, but restarting YzPzCode also helps

### App Feels Slow

1. Reduce the number of terminal sessions
2. Close unused workspaces
3. Disable animations under **Settings → Appearance**

## Platform Notes

### Windows

- Terminals use CMD by default
- External terminals open with automatic grid tiling
- Use winget for CLI installations

### macOS

- The app may require right-click to open on first launch (not code-signed)
- Terminal.app is used for external terminals
- Use Homebrew for CLI installations

### Linux

- Supported external terminals: gnome-terminal, konsole, xfce4-terminal
- wmctrl is required for external terminal tiling
- Use your standard package manager for CLI installations

## FAQ

### Do I need to install Node.js?

Yes. YzPzCode checks for Node.js on first launch and prompts you to install it if missing. It is required by several agent CLIs and the built-in agent harness.

### How many AI assistants can I use at once?

Up to 8 terminals in the grid, and each can run a different AI CLI or tool CLI.

### Can I use YzPzCode without AI tools?

Yes. Unassigned terminals run as regular shell sessions in your workspace directory.

### How do I update YzPzCode?

Check **Settings → Updates**. Choose the Stable, Beta, or Nightly channel, and enable auto-download for hands-off updates.

### Where do my generated designs go?

Saved designs from the AI Designer export to your workspace's `Design` folder as `index.html`, `styles.css`, and `designer-meta.json`.

## Getting More Help

- Check the terminal output in the app for agent and command errors
- Browse these docs with `Ctrl+K` to search everything
- Open an issue on the GitHub repository

---
