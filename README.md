<div align="center">

<img src="app/src/assets/YzPzCodeLogo.png" alt="YzPzCode Logo" width="180"/>

# YzPzCode

### Your AI Coding Squad, One Window Away.

**Stop juggling 5 different terminals.** YzPzCode brings Claude, Gemini, Codex, Opencode, and Cursor together in one clean interface.

[![GitHub stars](https://img.shields.io/github/stars/wolfenazz/YzPzCode?style=social)](https://github.com/wolfenazz/YzPzCode/stargazers)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%20v2-blue?logo=tauri)](https://tauri.app)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019-61DAFB?logo=react)](https://react.dev)
[![Backend](https://img.shields.io/badge/Backend-Rust-orange?logo=rust)](https://rust-lang.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**[Install Now](#-quick-start)** · **[See Screenshots](#-see-it-in-action)** · **[Read the Docs](docs/userguid.md)**

**Readme in other languages:** [العربية](README.ar.md) · [Español](README.es.md) · [Français](README.fr.md) · [中文](README.zh.md) · [日本語](README.ja.md)

---

</div>

## Wait, What's This?

Picture this: You're coding. You want Claude to explain some legacy code, Gemini to generate tests, and Codex to help with that tricky algorithm.

**The old way?** Three terminal windows. Three different CLIs. Alt-tabbing like a maniac. Copy-pasting between them. Losing your mind.

**The YzPzCode way?** One app. Grid layout. All your AI agents side-by-side, actually talking to each other (well, not yet — but you can compare their answers).

## See It In Action

<div align="center">

<img src="docs/capture/Capture1.PNG" width="45%"/>
<img src="docs/capture/Capture2.PNG" width="45%"/>
<img src="docs/capture/Capture3.PNG" width="45%"/>
<img src="docs/capture/Capture4.PNG" width="45%"/>

*Yeah, it's that clean.*

</div>

## Why You'll Love It

| What You Get | Why It's Awesome |
|--------------|------------------|
| **Multi-Agent Grid** | Claude on the left, Gemini on the right. Compare outputs instantly. Pick the winner. |
| **One-Click Setup** | Don't know what's installed? We'll figure it out and guide you through the rest. |
| **Workspace Presets** | Save your favorite agent combos. 3x2 grid with Claude + Gemini? One click. |
| **Real Terminals** | Not a simulation — these are actual PTY sessions with full interactivity. |
| **Cross-Platform** | Windows, macOS, Linux. Your OS, your choice. |
| **Lightweight** | Built with Tauri, not Electron. Your RAM will thank you. |

## The Agents

We support the heavy hitters:

<div align="center">

| Agent | CLI | Superpower |
|-------|-----|------------|
| **Claude** | `claude` | Deep reasoning, explains code like a patient senior dev |
| **Gemini** | `gemini` | Fast, multimodal, Google's finest |
| **Codex** | `codex` | Code generation that actually works |
| **Opencode** | `opencode` | Open-source freedom |
| **Cursor** | `cursor` | IDE-level AI assistance |

</div>

## Quick Start

**You'll need:** Node.js 18+ and Rust (latest stable)

```bash
# 1. Clone it
git clone https://github.com/wolfenazz/YzPzCode.git
cd YzPzCode/app

# 2. Install dependencies
npm install

# 3. Run it
npm run tauri dev
```

Boom. The app will detect what AI CLIs you have installed and help you set up the rest.

### macOS Users

**Install Rust first:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
Then restart your terminal before running `npm run tauri dev`.

**Installing from .dmg?** Since the app isn't code-signed with an Apple Developer certificate, you'll see a security warning. Here's how to bypass it:

**Option 1: Right-click open**
1. Right-click (or Control-click) the app
2. Select "Open" → Click "Open" in the dialog

**Option 2: System Settings**
1. Go to **System Settings → Privacy & Security**
2. Click "Open Anyway" next to the security warning

**Option 3: Terminal**
```bash
xattr -cr /Applications/YzPzCode.app
```

The app is safe — it's built from this open-source repository. The warning is just macOS protecting you from unsigned apps.

> **Note:** We're working on getting the app properly code-signed with an Apple Developer certificate. This process takes a few weeks, but once complete, the security warning will no longer appear.

<details>
<summary>Need more details?</summary>

### Prerequisites

- **Node.js** (v18+) — [Download here](https://nodejs.org)
- **Rust** (latest stable) — [Get it here](https://rust-lang.org)
- **pnpm** or npm — whichever you prefer

### Build for Production

```bash
npm run tauri build
```

This spits out a native installer for your platform. Small, fast, no bloat.

</details>

## How It's Built

We picked tools that don't suck:

**Frontend**
- React 19 + TypeScript
- Vite (because waiting for builds is so 2020)
- Tailwind CSS v4
- Zustand (state management that actually makes sense)
- xterm.js (terminal rendering)

**Backend**
- Tauri v2 (Rust-powered, lightweight)
- portable-pty (real pseudo-terminals)
- Tokio (async that scales)

### Architecture

```mermaid
graph TB
    subgraph Frontend["Frontend (React + TypeScript)"]
        UI[User Interface]
        Grid[Terminal Grid]
        Setup[Setup Screen]
        Store[Zustand Store]
    end

    subgraph Backend["Backend (Rust + Tauri v2)"]
        Commands[Tauri Commands]
        PTY[PTY Manager]
        Detector[CLI Detector]
        Installer[CLI Installer]
    end

    subgraph CLIs["AI CLI Tools"]
        Claude[Claude CLI]
        Gemini[Gemini CLI]
        Codex[Codex CLI]
        Opencode[Opencode CLI]
        Cursor[Cursor CLI]
    end

    UI --> Grid
    UI --> Setup
    Grid --> Store
    Setup --> Store
    
    Store <-->|Tauri IPC| Commands
    Commands --> PTY
    Commands --> Detector
    Commands --> Installer
    
    PTY -->|Spawns| Claude
    PTY -->|Spawns| Gemini
    PTY -->|Spawns| Codex
    PTY -->|Spawns| Opencode
    PTY -->|Spawns| Cursor
    
    Detector -->|Checks| Claude
    Detector -->|Checks| Gemini
    Detector -->|Checks| Codex
    Detector -->|Checks| Opencode
    Detector -->|Checks| Cursor
```

### Data Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend (React)
    participant Tauri as Tauri IPC
    participant PTY as PTY Manager
    participant CLI as AI CLI Tool

    User->>UI: Create Workspace
    UI->>Tauri: detect_agent_cli()
    Tauri->>CLI: Check if installed
    CLI-->>Tauri: Installation status
    Tauri-->>UI: CLI statuses
    
    User->>UI: Launch Workspace
    UI->>Tauri: create_terminal_sessions()
    Tauri->>PTY: Spawn PTY sessions
    PTY->>CLI: Start CLI process
    
    loop Real-time Communication
        CLI-->>PTY: Output stream
        PTY-->>Tauri: Terminal events
        Tauri-->>UI: Update terminal
        UI-->>User: Display output
    end
```

## For the Curious

```
app/
├── src-tauri/          # Rust backend
│   └── src/
│       ├── agent/      # Agent orchestration
│       ├── agent_cli/  # CLI detection & installation
│       ├── commands/   # Tauri IPC handlers
│       └── terminal/   # PTY management
├── src/                # React frontend
│   ├── components/     # UI components
│   ├── hooks/          # Custom hooks
│   ├── stores/         # Zustand stores
│   └── types/          # TypeScript definitions
└── docs/               # Documentation
```

## Contributing

We'd love your help! Here's how to not go crazy while developing:

```bash
# Type checking
npx tsc --noEmit        # Frontend
cargo check             # Backend

# Linting & formatting
cargo clippy            # Catch Rust issues
cargo fmt               # Make it pretty

# Testing
cd src-tauri && cargo test
```

Found a bug? Have an idea? [Open an issue](https://github.com/wolfenazz/YzPzCode/issues) or [submit a PR](https://github.com/wolfenazz/YzPzCode/pulls).

Check out the [full roadmap](docs/plane.md).

## Recommended Setup

- [VS Code](https://code.visualstudio.com)
- [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

Or use whatever makes you productive. We're not here to judge.

## License

MIT. Fork it, build on it, make it yours. Just remember where you got it.

---

<div align="center">

### Like What You See?

If YzPzCode saved you from terminal chaos, consider giving it a **star** — it helps others find it too!

[![Star this repo](https://img.shields.io/github/stars/wolfenazz/YzPzCode?style=social)](https://github.com/wolfenazz/YzPzCode/stargazers)

---

**Built with caffeine and late nights by [Naseem](https://github.com/wolfenazz), Noor & Khalid**

*For developers who'd rather code than manage terminals.*

[Report a Bug](https://github.com/wolfenazz/YzPzCode/issues) · [Request a Feature](https://github.com/wolfenazz/YzPzCode/issues) · [Contribute](https://github.com/wolfenazz/YzPzCode/pulls)

</div>
