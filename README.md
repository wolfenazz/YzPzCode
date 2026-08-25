<div align="center">

<img src="app/src/assets/YzPzCodeLogo.png" alt="YzPzCode Logo" width="96" />

# YzPzCode

### The Unified Workspace for AI Coding Agents

**Run Claude, Gemini, Codex, OpenCode, Cursor, Kilo, Hermes, Pi, Command Code, and the built-in YZPZ Agent from one native desktop application.**

<p align="center">
  <a href="https://github.com/wolfenazz/YzPzCode/releases/latest">
    <img src="https://img.shields.io/github/v/release/wolfenazz/YzPzCode?color=000000&label=Release&logo=github&style=for-the-badge" alt="Latest Release" />
  </a>
  <a href="https://github.com/wolfenazz/YzPzCode/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-Apache--2.0-00DC82?style=for-the-badge&logo=apache" alt="License" />
  </a>
  <a href="docs/userguid.md">
    <img src="https://img.shields.io/badge/Docs-User%20Guide-4ECDC4?style=for-the-badge&logo=gitbook&logoColor=white" alt="Documentation" />
  </a>
  <a href="https://github.com/wolfenazz/YzPzCode/issues">
    <img src="https://img.shields.io/github/issues/wolfenazz/YzPzCode?color=EF4444&label=Issues&style=for-the-badge&logo=github" alt="Report Issue" />
  </a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-6366F1?style=for-the-badge" alt="Platform Support" />
</p>

<p align="center">
  <a href="#-why-yzpzcode">Why YzPzCode?</a> •
  <a href="#-see-it-in-action">Screenshots</a> •
  <a href="#-supported-ai-coding-clis">AI Agents</a> •
  <a href="#-core-features">Features</a> •
  <a href="#-yzpz-agent">Built-in Agent</a> •
  <a href="#-download--installation">Download</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-contributors">Contributors</a>
</p>

---

<img src="docs/capture/banner1%20(1).png" width="100%" alt="YzPzCode Hero Banner" style="border-radius: 10px;" />

</div>

> [!NOTE]
> **YzPzCode is under active development.** Some features may be experimental or evolve between releases. Feedback, bug reports, and pull requests are warmly welcomed!

---

## ⚡ Why YzPzCode?

Modern AI-assisted development often degrades into a chaotic shuffle between dozens of terminal tabs, scattered coding agents, disconnected browsers, IDEs, and ad-hoc CLI tools.

**YzPzCode replaces the window juggling with a single, coherent command center.**

| Traditional Workflow | With YzPzCode |
| :--- | :--- |
| 🪟 8+ disconnected terminal windows | 🖥️ **Single native workspace** with custom layouts |
| 🔄 Constant `Alt+Tab` context switching | 🎛️ **Side-by-side terminal grid** with PTY sessions |
| 🧩 External editor + external file viewer | 📝 **Embedded Monaco editor** + virtualized file tree |
| 🌐 Separate browser for UI validation | 🔍 **In-app browser** with deep CSS / visual inspector |
| ⚙️ Repetitive CLI install & auth checks | 🔑 **Automatic detection, 1-click install & auth tracking** |
| 💬 Isolated AI chats with lost context | 🤖 **Built-in YZPZ Agent** + 9 supported external AI CLIs |
| 🎨 Switching to Photoshop / Figma for quick edits | 🖌️ **Built-in layered image editor** with blend modes |

---

## 📸 See It in Action

<div align="center">
  <table>
    <tr>
      <td width="50%" align="center">
        <img src="docs/capture/Caoture1New.png" alt="YzPzCode Workspace" style="border-radius: 8px;" />
        <br />
        <sub><b>Terminal Grid & Workspace Explorer</b></sub>
      </td>
      <td width="50%" align="center">
        <img src="docs/capture/Capture4new.jpg" alt="Multi-Agent Workspace" style="border-radius: 8px;" />
        <br />
        <sub><b>Multi-Agent Collaborative Layout</b></sub>
      </td>
    </tr>
    <tr>
      <td width="50%" align="center">
        <img src="docs/capture/Capture5new.jpg" alt="In-App Browser" style="border-radius: 8px;" />
        <br />
        <sub><b>Integrated Multi-Tab Webview Browser</b></sub>
      </td>
      <td width="50%" align="center">
        <img src="docs/capture/Capture6new.jpg" alt="Visual Design Inspector" style="border-radius: 8px;" />
        <br />
        <sub><b>Deep Visual Element & Style Inspector</b></sub>
      </td>
    </tr>
  </table>
</div>

---

## 🤖 Supported AI Coding CLIs

YzPzCode detects, launches, and manages PTY sessions for 9 industry-standard AI coding agents out of the box:

```
                     ┌─── Claude (Anthropic)
                     ├─── Gemini (Google)
                     ├─── Codex (OpenAI)
                     ├─── OpenCode
  YzPzCode Host ─────┼─── Cursor
                     ├─── Kilo
                     ├─── Hermes
                     ├─── Pi (earendil-works)
                     └─── Command Code
```

| Agent | CLI Command | Primary Role & Strengths |
| :--- | :---: | :--- |
| **Claude Code** | `claude` | Deep reasoning, autonomous refactoring, large context |
| **Gemini CLI** | `gemini` | Multimodal development, rapid prototyping |
| **Codex CLI** | `codex` | Precision code generation & unit test authoring |
| **OpenCode** | `opencode` | Open-source agent for customizable local workflows |
| **Cursor CLI** | `cursor` | Agentic file editing and codebase indexing |
| **Kilo** | `kilo` | Fast, terminal-native agent workflows |
| **Hermes** | `hermes` | Compact autonomous terminal assistant |
| **Pi** | `pi` | Minimalist coding agent harness with extension hooks |
| **Command Code** | `cmd` / `cmdc` | Interactive command & script orchestration |

> [!IMPORTANT]
> YzPzCode integrates with third-party CLIs via PTY bridges and is **not affiliated with or endorsed by their respective vendors** unless explicitly stated.

---

## 🛠️ SaaS & Developer Tool CLIs

YzPzCode automatically tracks installation status, executable paths, and authentication state for popular cloud & developer CLIs:

<div align="center">

| Service | Command | Service | Command |
| :--- | :---: | :--- | :---: |
| **GitHub CLI** | `gh` | **PostHog** | `posthog-cli` |
| **Supabase** | `supabase` | **ElevenLabs** | `elevenlabs` |
| **Stripe** | `stripe` | **Google Workspace** | `gws` |
| **Vercel** | `vercel` | **AgentMail** | `agentmail-cli` |
| **Valyu** | `valyu-cli` | **Ramp** | `ramp` |

</div>

---

## ✨ Core Features

### 🖥️ 1. Multi-Agent Terminal Grid
- **Real PTY Backend**: Full xterm.js 6 frontend powered by Rust's `portable-pty`
- **Managed Commands**: Run non-interactive / background tasks with PID, exit code, and live output streaming
- **Workspace Scoping**: Terminal sessions are isolated per project workspace
- **External Terminal Tiling**: Spawn external native consoles (Windows Terminal, macOS Terminal, Linux) with auto-tiling

### 🤖 2. Built-In YZPZ Agent
- **Native AI Sidecar**: Powered by a supervised Node.js harness over WebSockets
- **Zero-Setup Required**: Ready to chat, execute tools, and manipulate files without external CLIs
- **Full Transparency**: Streaming tokens, tool-call logs, permission approval gates, and context-window meters
- **Agent Teams & Mentions**: Orchestrate multi-agent subtasks and reference project files with `@filename`

### 📝 3. Monaco-Based Code Editor
- **Multi-Tab Workspace**: Split views, tab management (close others / right / saved)
- **Syntax Highlighting & Minimap**: Rich language support via Monaco + CodeMirror engines
- **Rich File Previews**: Markdown, PDF, CSV, Excel (`.xlsx`), Word (`.docx`), and Draw.io diagrams
- **Git Integration**: In-tree diff statistics, stage/unstage, status badges, and branch switching

### 🌐 4. In-App Browser & Visual Inspector
- **Device Presets**: Emulate iPhone, iPad, responsive desktop; toggle portrait/landscape
- **Deep Element Inspector**: Inspect computed CSS, pseudo-elements, box model, and DOM hierarchy
- **Style Picker & Generator**: Capture styles directly to clipboard, generate atomic CSS classes, and apply with full undo stack

### 🎨 5. AI Designer & Layered Image Editor
- **Prompt-to-UI Generator**: Produce responsive HTML/CSS/JS interfaces directly from natural language prompts
- **Full Layered Canvas**: Raster, vector, text, and shape layers powered by Konva
- **16 Blend Modes**: Full layer opacity, rotation, masking, marquee/lasso selections, and history
- **Multi-Format Export**: PNG, JPG, WebP, SVG, GIF, BMP, AVIF, TIFF

---

## 🧠 YZPZ Agent: Under the Hood

<div align="center">
  <img src="docs/capture/Capture3new.PNG.jpg" width="85%" alt="YZPZ Agent Interface" style="border-radius: 8px;" />
  <br />
  <sub><b>Interactive Agent Chat with tool execution logs, approval controls, and token context meter</b></sub>
</div>

<br />

The built-in **YZPZ Agent** runs as an isolated Node.js sidecar process supervised directly by the Tauri Rust host:

- ⚡ **Real-Time Streaming**: Incremental token delivery via low-latency WebSocket connection
- 🛡️ **Permission Controls**: Approve or reject bash commands, file writes, and external network requests
- 🔄 **Session Persistence**: Resumable workspace-scoped sessions stored locally
- 🎯 **Model Flexibility**: Connect to OpenAI, Anthropic, Gemini, Ollama, DeepSeek, or any custom OpenAI-compatible endpoint
- 📊 **Context Awareness**: Real-time context budget tracking, automatic compaction strategies, and token cost estimation

---

## 🏗️ Architecture

```mermaid
flowchart TB
    subgraph Frontend["React 19 + TypeScript Frontend (Vite 6)"]
        direction LR
        UI_Term["Terminal Grid\n(xterm.js 6)"]
        UI_Agent["YZPZ Agent\nChat UI"]
        UI_Editor["Code Editor\n(Monaco)"]
        UI_Browser["Browser &\nInspector"]
        UI_Image["Image Editor\n(Konva)"]
    end

    subgraph TauriHost["Tauri v2 + Rust Core Host"]
        IPC["Tauri IPC Command Router"]
        PTY["PTY Manager\n(portable-pty)"]
        FS["File & Git Watcher\n(notify)"]
        Host["Agent Host Supervisor"]
        DevEnv["IDE / CLI Detector"]
    end

    subgraph External["External Runtime"]
        Harness["Node.js 22+ Agent Harness\n(WebSocket Server)"]
        CLIs["External AI & Tool CLIs\n(Claude, Gemini, gh, etc.)"]
        IDEs["External IDEs\n(VS Code, Cursor, Zed)"]
    end

    Frontend <==>|"Tauri IPC (Async Invokes + Events)"| IPC
    IPC --> PTY
    IPC --> FS
    IPC --> Host
    IPC --> DevEnv

    PTY <==>|"Raw PTY Stream"| CLIs
    Host <==>|"Localhost WebSocket (JSON-RPC)"| Harness
    DevEnv -.->|"Process Launch"| IDEs
```

### Technology Matrix

| Layer | Technologies |
| :--- | :--- |
| **Desktop Shell** | [Tauri v2](https://v2.tauri.app/), [Rust](https://www.rust-lang.org/) (2021 Edition) |
| **Concurrency & PTY** | `tokio`, `portable-pty`, `tokio-tungstenite`, `notify`, `which` |
| **Frontend Framework** | [React 19](https://react.dev/), [TypeScript 5.6](https://www.typescriptlang.org/), [Vite 6](https://vitejs.dev/) |
| **Styling & Motion** | [Tailwind CSS v4](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/) |
| **Terminal & Editor** | [@xterm/xterm 6](https://xtermjs.org/), [Monaco Editor](https://microsoft.github.io/monaco-editor/), CodeMirror 6 |
| **Canvas & Media** | [Konva](https://konvajs.org/), `pdfjs`, `xlsx`, `mammoth` |
| **State Management** | [Zustand 5](https://github.com/pmndrs/zustand) (with persistent storage) |

---

## 📂 Project Structure

```text
yzpzcode/
├── .github/workflows/          # CI/CD Release workflows (multi-platform builds)
├── docs/                       # Screenshots, assets, and user guides
└── app/
    ├── src-tauri/              # Rust backend
    │   └── src/
    │       ├── agent/          # Autonomous agent task orchestration & retry logic
    │       ├── agent_cli/      # AI & Tool CLI detection, installation & auth
    │       ├── agent_host/     # Supervisor for built-in Node.js agent harness
    │       ├── browser/        # Webview management & visual inspector bridge
    │       ├── commands/       # Tauri IPC commands (~100+ endpoints)
    │       ├── terminal/       # PTY sessions & managed non-interactive commands
    │       ├── filesystem/     # File tree, Git diffs, watchers, validations
    │       ├── ide/            # External IDE launcher (VS Code, Cursor, Zed, etc.)
    │       └── discord_presence/ # Discord Rich Presence integration
    │
    ├── src/                    # React 19 frontend
    │   ├── components/         # Modular UI components
    │   │   ├── workspace/      # Terminal grid, browser, view switchers
    │   │   ├── editor/         # Monaco editor tabs & rich file previews
    │   │   ├── explorer/       # Virtualized file tree & Git panels
    │   │   ├── designer/       # AI design generation studio
    │   │   ├── image/          # Layered canvas image editor
    │   │   ├── settings/       # 11-section preferences panel
    │   │   └── setup/          # Interactive onboarding wizard
    │   ├── hooks/              # Custom React hooks (useTerminal, useBrowser, etc.)
    │   ├── stores/             # Zustand global state stores
    │   └── types/              # TypeScript mirror interfaces of Rust structs
    │
    └── agent-harness/          # Supervised Node.js sidecar for YZPZ Agent
```

---

## 🚀 Download & Installation

### Option 1: Pre-Built Binaries (Recommended)

Grab the latest installer for your operating system from the **[Releases Page](https://github.com/wolfenazz/YzPzCode/releases/latest)**:

| Platform | Package Format | Architecture |
| :--- | :--- | :--- |
| **🪟 Windows** | `.msi` / `.exe` installer | x86_64 |
| **🍎 macOS** | `.dmg` installer | Apple Silicon (`aarch64`) & Intel (`x86_64`) |
| **🐧 Linux** | `.deb` / `.AppImage` | x86_64 |

> [!TIP]
> **macOS Note**: If running an unsigned build, open with **Right Click → Open**, or allow it under *System Settings → Privacy & Security → Open Anyway*.

---

### Option 2: Build From Source

#### Prerequisites
- **Node.js**: `22.x` or higher
- **Rust**: Latest stable toolchain (`rustup update stable`)
- **C++ Build Tools**: Visual Studio Build Tools (Windows) / Xcode CLI Tools (macOS) / `build-essential` (Linux)

#### 1. Clone the repository
```bash
git clone https://github.com/wolfenazz/YzPzCode.git
cd YzPzCode/app
```

#### 2. Install dependencies
```bash
# Install frontend dependencies
npm install

# Install agent harness dependencies
cd agent-harness && npm install && cd ..
```

#### 3. Run in development mode
```bash
npm run tauri dev
```

#### 4. Build production installer
```bash
npm run tauri build
```
The compiled binaries will be output to `app/src-tauri/target/release/bundle/`.

---

## 🎨 UI Customization

Tailor YzPzCode to your aesthetic and workflow preferences:

- 🌗 **Dark / Light Modes**: Full dynamic theming across the entire UI
- 🎨 **8 Accent Color Schemes**: Default, Blue, Purple, Green, Orange, Red, Pink, Cyan
- 📐 **3 Density Presets**: Compact, Comfortable, Spacious
- ⌨️ **Terminal Styling**: Configurable font families, ligatures, cursor styles, and opacity
- ✨ **Accessibility**: Animation disable toggle (reduced-motion compliance), custom cursor toggle

---

## 🔒 Security & Privacy

YzPzCode was built with a **local-first** security philosophy:

- 🛡️ **Your Code Stays Local**: No project files or source code are ever uploaded to third-party servers by YzPzCode itself.
- 🔑 **Locally Stored Secrets**: API keys and tokens are stored exclusively on your local machine.
- 🚪 **Explicit Permission Gates**: The built-in agent requires explicit user confirmation before executing shell commands or writing destructive changes.
- 📡 **Direct Provider Connections**: When you configure API keys for Anthropic, OpenAI, or other LLMs, requests are dispatched directly to their official endpoints.

---

## 🤝 Contributing

Contributions make open source incredible! Any bugs found, improvements, or new features are appreciated.

### Quality Checklist before Submitting PRs
```bash
# 1. Typecheck the frontend
cd app && npx tsc --noEmit

# 2. Check Rust formatting & lints
cd src-tauri
cargo fmt --check
cargo clippy -- -D warnings

# 3. Run unit & integration tests
cargo test
```

Please check [open issues](https://github.com/wolfenazz/YzPzCode/issues) or start a discussion before proposing major architectural changes.

---

## 👥 Contributors

A huge thank you to everyone building and refining YzPzCode:

<div align="center">
  <table>
    <tr>
      <td align="center" width="200">
        <a href="https://github.com/wolfenazz">
          <img src="https://github.com/wolfenazz.png?size=160" width="80" height="80" style="border-radius: 50%;" alt="Naz" />
          <br /><br />
          <b>Naz</b>
          <br />
          <sub>Creator & Lead Architect</sub>
          <br />
          <code>@wolfenazz</code>
        </a>
      </td>
      <td align="center" width="200">
        <a href="https://github.com/Noor-Al-Khelaifi">
          <img src="https://github.com/Noor-Al-Khelaifi.png?size=160" width="80" height="80" style="border-radius: 50%;" alt="Noor" />
          <br /><br />
          <b>Noor</b>
          <br />
          <sub>Core Contributor & Developer</sub>
          <br />
          <code>@Noor-Al-Khelaifi</code>
        </a>
      </td>
    </tr>
  </table>
</div>

---

## 📄 License

YzPzCode is open-source software licensed under the **[Apache License 2.0](LICENSE)**.

<div align="center">
  <br />
  <b>Build with your AI agents, not around them.</b>
  <br /><br />
  <a href="https://github.com/wolfenazz/YzPzCode/releases/latest">Download YzPzCode</a> •
  <a href="docs/userguid.md">Documentation</a> •
  <a href="https://github.com/wolfenazz/YzPzCode/issues/new">Report Bug</a> •
  <a href="https://github.com/wolfenazz/YzPzCode/issues/new">Request Feature</a>
  <br /><br />
</div>
