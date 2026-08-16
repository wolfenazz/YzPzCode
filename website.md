# YzPzCode: The Complete Application Blueprint & Website Guide

This document serves as the "Source of Truth" for YzPzCode. It contains a deep dive into the application's purpose, internal mechanics, and features, alongside a structured plan for the marketing website.

---

## 1. What is YzPzCode? (The "Core" Information)

### The Problem
Modern developers are increasingly using multiple AI coding assistants (Claude Code, Gemini CLI, GitHub Copilot/Codex, etc.). However, these tools are fragmented. Using them simultaneously requires multiple terminal windows, constant context switching, and repetitive copy-pasting to compare results.

### The Solution
**YzPzCode** is a native desktop "AI Command Center." It brings all your AI coding agents into a single, high-performance window using a sophisticated grid layout. It doesn't just run terminals; it orchestrates your entire AI coding squad.

### How it Works (The "Secret Sauce")
1.  **Multi-Agent Grid:** Unlike a standard terminal, YzPzCode lets you split your screen into 1, 2, 4, 6, or 8 synchronized terminal panes.
2.  **Native PTY (Pseudo-Terminals):** Built with Rust and `portable-pty`, it runs real shell sessions. This isn't a web-based simulation; it's as fast and powerful as iTerm2 or Windows Terminal.
3.  **Automated Fleet Management:** When you create a "Workspace," you assign specific agents (e.g., "Give me 2 Claude slots and 1 Gemini slot"). The app automatically detects if the CLIs are installed, installs them if missing, and launches them in the correct directory.

---

## 2. Deep Dive: Everything Inside the App

### A. The Setup Engine (Onboarding)
- **Prerequisites Checker:** Automatically verifies if Node.js (v18+) and Git are installed—critical for running AI CLIs.
- **Agent CLI Detector:** Scans your system's PATH to find `claude`, `gemini`, `codex`, `opencode`, `cursor`, `kilo`, `pi`, and `cmdc`/`cmd` (Command Code) binaries.
- **Silent Installer:** If an agent is missing, YzPzCode can silently install it via `npm` or platform-specific scripts (e.g., `curl` or `powershell`), so you don't have to leave the app.

### B. Workspace Management
- **Browser-Style Tabs:** Manage multiple projects simultaneously. Switch between a "Frontend" workspace (with Claude) and a "Testing" workspace (with Gemini) in one click.
- **Directory Persistence:** Every workspace is tied to a local folder. All terminal sessions in that workspace automatically start in that folder.
- **Layout Presets:**
    - **1x1:** Single focused agent.
    - **2x1:** Side-by-side comparison.
    - **2x2:** The "Full Squad" (e.g., 2 Claudes, 1 Gemini, 1 standard Bash).

### C. The Terminal Experience
- **Engine:** Powered by `xterm.js` for high-performance rendering.
- **Theme Engine:** Real-time switching between "Carbon" (Dark) and "Studio" (Light) themes.
- **Session Indicators:** Every terminal pane has a header showing the Agent Name, Version, and a "Live" status dot.
- **Interactive Auth:** If an AI agent requires login (like `claude login`), YzPzCode detects this and provides a dedicated interaction mode.

### D. Security & Privacy
- **Local-First:** All API keys and session data stay on your machine. YzPzCode acts as a bridge, never a middleman.
- **Tauri Sandbox:** Leverages Rust's memory safety and Tauri's secure IPC (Inter-Process Communication).

---

## 3. Website Design: "The AI Command Center"

### Visual Style: "Terminal-Chic"
- **Background:** Dark charcoal (`#09090b`) with a subtle "scanline" or grid texture.
- **Accents:** Cyan for actions, Magenta for agents, Amber for warnings.
- **Hero Animation:** A 2x2 grid where different AI outputs stream in real-time, highlighting the "Comparison" feature.

### Section-by-Section Content

#### Hero: The Value Prop
- **Headline:** Stop Coding Alone. Bring the Whole Squad.
- **Sub:** The only desktop environment built specifically for the AI-first developer. Run every major AI CLI in one high-performance grid.

#### Section: "Comparison is the Killer Feature"
- Showcase two terminals side-by-side.
- **Left:** Claude explaining a bug.
- **Right:** Gemini generating a fix.
- **Caption:** "Don't settle for one opinion. See how the world's best models tackle your code simultaneously."

#### Section: "Zero-Config AI"
- **Copy:** "Don't waste an hour setting up environment variables. YzPzCode detects your AI tools, installs missing binaries, and gets you to the prompt in seconds."

#### Section: "Native Performance"
- **Copy:** "No Electron bloat. Built with Rust and Tauri for a footprint that's 90% smaller than VS Code, giving your RAM back to the LLMs that need it."

---

## 4. Download & Installation Guide

### Windows
- **Download:** `.msi` (Recommended) or `.exe` (Portable).
- **Auto-Update:** Built-in via GitHub Releases.

### macOS (Silicon & Intel)
- **Download:** `.dmg` (Universal).
- **Security Note:** Provide the "Right-click -> Open" instructions for the initial launch until code-signing is finalized.

### Linux
- **Download:** `.AppImage` (Works everywhere) or `.deb` (Debian/Ubuntu).
- **Command:** `chmod +x YzPzCode.AppImage && ./YzPzCode.AppImage`

---

## 5. Technical Specification (For Developers)
- **Frontend:** React 19 (Beta/Latest), TypeScript, Zustand, Tailwind CSS v4.
- **Backend:** Tauri v2, Rust 1.75+, `portable-pty`.
- **CLI Ecosystem:** Deep integration with `@anthropic-ai/claude-code`, `@google/gemini-cli`, and `@openai/codex`.
