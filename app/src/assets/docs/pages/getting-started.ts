export const gettingStartedContent = `# Getting Started

## 1. Download and Install

- Download YzPzCode for your platform (Windows, macOS, or Linux)
- Open the downloaded file and follow the installation prompts
- Launch the app from your Start menu, Applications folder, or desktop

## 2. Node.js Check

On first launch, YzPzCode checks for Node.js, which several agent CLIs depend on. If Node.js is missing, the app shows an installation prompt. Other prerequisites such as Git, npm, bun, pnpm, and Docker can be checked later under **Settings → Environment**.

## 3. What is a Workspace?

A workspace is a project context with its own views, open files, browser state, and terminal sessions. You can create several and switch between them with the tabs at the top of the window. Each workspace has one of three kinds:

- **Coding**: terminals with AI agents, a code editor, the browser, and extensions
- **Writing studio**: AI-drafted reports with an editor, outline, and export. See [Writing Studio](#docs/writing-studio)
- **Presentation studio**: AI-designed slide decks with a presenter mode. See [Presentation Studio](#docs/presentation-studio)

## 4. The New Workspace Screen

The **New workspace** screen is one page with three numbered sections on a progress rail. A live preview and a launch panel stay on the side, so you can see what will open before you press **Launch**.

Pick the kind of workspace at the top: **Coding**, **Writing**, or **Presentation**. The studios skip the folder, terminal, and extension choices, and save into your Documents folder instead.

### Step 1: Project

- **Name your workspace**, for example "my-project" or "website-work"
- Click **Browse** to pick the project folder, or select one of your recent directories

### Step 2: Layout

Start from a preset or choose how many terminals open:

| Preset | Terminals |
|--------|-----------|
| **React** | 4 |
| **Rust** | 4 |
| **Python** | 4 |
| **Full-Stack** | 6 |
| **Quick Edit** | 1 |
| **Custom** | 4 (set your own) |

Choose **1, 2, 4, 6, or 8** terminals from the grid previews. Use **Manage** to save your own presets, edit them, delete them, or restore the defaults.

There is also an **Open Terminals Externally** toggle. It opens the terminals as separate system windows outside the app instead of the grid, automatically tiled on your screen.

### Step 3: Agents & tools

The section has three tabs:

- **Agents**: every supported AI agent (Claude, Codex, Antigravity, OpenCode, Cursor, Kilo, Hermes, Pi, Command Code, Cline, Grok)
- **Tool CLIs**: GitHub, Stripe, Supabase, Valyu, PostHog, ElevenLabs, Ramp, Google Workspace, AgentMail, and Vercel
- **Extensions**: AI assistant panels to open alongside the terminals

Toggle an agent on to assign it to a terminal slot, and use the \`+\` and \`-\` buttons to give it several slots. Each agent shows a **status badge** for installed, installable, and signed-in. Use the refresh button to re-detect, and follow the install command shown when a CLI is missing.

You can also choose IDEs (VS Code, Cursor, Zed, WebStorm, and more) to launch alongside the workspace.

### Optional: Initialize

If you are starting a new project, the setup form offers scaffolding commands grouped by category (React, Next.js, and more). Each one can be run when the workspace opens, pasted into the terminal so you can edit it first, or copied. Skip this if your project already exists.

> **Example:** With 4 terminals, assigning Claude (2) and Codex (1) leaves 1 empty terminal for regular shell commands.

### Stepper view

The header of the setup screen switches to a **stepper view**, which asks the same questions one step at a time. Both views create the same workspace.

## 5. Start Working

1. Click **Launch** to create the workspace
2. Your terminal grid opens with the assigned agents started
3. Use the view switcher in the header to move between the views

A coding workspace has these views:

- **Terminal**: the terminal grid
- **Extensions**: AI assistant panels
- **Code**: the file explorer and editor
- **Browser**: the in-app browser

A studio has **Write** or **Slides**, **Files**, and **Research** views. Its **Terminal** view appears once you open a terminal in it. Press \`Ctrl+E\` to switch between the main view and Files.

> **Tip:** Saved presets let you set up a repeat project type in seconds. Pick one in the Layout section and press Launch.
`;
