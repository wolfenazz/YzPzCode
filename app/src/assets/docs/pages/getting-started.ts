export const gettingStartedContent = `# Getting Started

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
- Use the \`+\` and \`-\` buttons to give an agent multiple slots
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
`;
