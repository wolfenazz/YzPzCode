# YzPzCode - AI Agent Development Guide

Tauri v2 desktop app for managing AI CLI tools (Claude, Gemini, Codex, Kilo, OpenCode, Cursor, Hermes, Pi, Command Code)
and SaaS tool CLIs (GitHub, Stripe, Supabase, Valyu, PostHog, ElevenLabs, Ramp, GWS, AgentMail, Vercel).
Rust backend + React 19 frontend. Borderless window, custom titlebar, PTY-based terminal grid,
in-app browser with visual design inspector, AI-powered designer, and multi-workspace management.

## Development Commands

All commands run from `app/` unless noted. Dev server port: `8745`.

### Rust Backend
```bash
npm run tauri dev                # Dev server with hot reload (from app/)
npm run tauri build              # Production build (from app/)
cargo check                      # Type check (from app/src-tauri/)
cargo clippy                     # Lint
cargo clippy --fix               # Lint + auto-fix
cargo fmt                        # Format
cargo test                       # Run all tests
cargo test test_name             # Run single test by name
cargo test module_name::test     # Run tests in a specific module
cargo test --test integration    # Run integration tests
```

### Frontend
```bash
npm run dev                      # Vite dev server (standalone, from app/)
npm run build                    # tsc + vite build
npx tsc --noEmit                 # Type check only (from app/)
```

## Version Updates

Version is defined in **3 files** — update all consistently:
- `app/package.json` → `"version"`
- `app/src-tauri/Cargo.toml` → `version`
- `app/src-tauri/tauri.conf.json` → `"version"`

## Project Structure

```
app/
├── src-tauri/src/
│   ├── agent/              # Task execution, retry logic, command generation
│   ├── agent_cli/          # CLI detection, install, launch, auth
│   │   └── providers/      # Per-provider (9 AI agents + 10 tool CLIs)
│   ├── browser/            # In-app webview browser + design inspector bridge
│   ├── commands/           # Tauri IPC handlers (thin wrappers, 100+ commands)
│   ├── terminal/           # PTY session management (TerminalManager + ManagedCommandManager)
│   ├── filesystem/         # File ops, git status/diff, watcher, validation
│   ├── ide/                # IDE detection & launching (10 IDEs)
│   ├── discord_presence/   # Discord Rich Presence integration
│   ├── utils/              # Env setup, process helpers
│   ├── types.rs            # Shared types (AgentType, WorkspaceConfig, CliType, etc.)
│   ├── lib.rs              # App init, plugin setup, state, generate_handler!
│   └── main.rs             # Entry point
├── src/
│   ├── components/         # React UI (PascalCase.tsx)
│   │   ├── setup/          # Onboarding/config screens (15 components)
│   │   ├── workspace/      # Terminal grid, browser, workspace tabs (20+ components)
│   │   ├── explorer/       # File tree & git panels (7 components)
│   │   ├── editor/         # CodeMirror + file previews (10 components)
│   │   ├── designer/       # AI design generation tools (12 components)
│   │   ├── settings/       # Settings screen with 11 sections
│   │   ├── common/         # Shared (theme toggle, footer, context menu, cursor)
│   │   ├── feedback/       # Feedback modal
│   │   └── docs/           # Built-in docs viewer
│   ├── hooks/              # useTerminal, useWorkspace, useFileEditor, useBrowser, etc.
│   ├── stores/             # Zustand stores (appStore.ts, updaterStore.ts)
│   ├── types/              # TypeScript interfaces (index.ts)
│   ├── utils/              # Grid layout, window helpers, project detection
│   ├── styles.css          # Global styles, CSS vars, theming
│   ├── App.tsx             # Root component, view routing (6 views)
│   └── main.tsx            # React entry with ErrorBoundary
```

## Code Style — Rust

**Error Handling**
- Internal functions: `anyhow::Result<T>` with `.context("description")?`
- Tauri commands: `Result<T, String>` — convert with `.map_err(|e| e.to_string())`
- Prefer `unwrap_or_else` or `?` over raw `unwrap()`

**Async & Concurrency**
- Shared state: `Arc<Mutex<T>>` — hold `lock().unwrap()` briefly, never across `.await`
- Async work: `tokio::spawn(async move { ... })`
- Blocking work: `std::thread::spawn(move || { ... })` or `tokio::spawn_blocking`
- All shared state types must be `Send + Sync`

**Structs & Types**
- Derive: `Debug, Clone, Serialize, Deserialize` (add `Eq, PartialEq, Hash` for enums)
- Manual `Clone` impl when fields include `Option<AppHandle>`
- Manual `Default` for structs with non-trivial defaults
- `pub(crate)` for crate-internal items

**Serde**
- `#[serde(rename_all = "camelCase")]` on structs (matches JS conventions)
- `#[serde(rename_all = "lowercase")]` on enums
- `#[serde(rename = "type")]` when field conflicts with keyword

**Platform-Specific Code**
```rust
#[cfg(target_os = "windows")]
#[cfg(target_os = "macos")]
#[cfg(not(any(target_os = "windows", target_os = "macos")))]  // Linux
```

**Tauri Command Pattern**
```rust
#[tauri::command]
pub async fn command_name(
    state: State<'_, ManagerType>,
    param: String,
) -> Result<ResponseType, String> {
    state.inner().do_work(param).map_err(|e| e.to_string())
}
```
Register in `lib.rs` → `tauri::generate_handler![command_name, ...]`.

**Real-Time Events** (Rust → Frontend)
```rust
app.emit("event-name", &payload).map_err(|e| e.to_string())?;
```
Frontend listens with `listen<T>("event-name", callback)` from `@tauri-apps/api/event`.

## Code Style — TypeScript/React

**TypeScript Config** — Strict mode, `noUnusedLocals`, `noUnusedParameters`, `moduleResolution: "bundler"`.

**Components**
- Function components + hooks only (no classes)
- Zustand for global state (persisted via middleware), `useState` for component-local state
- Tailwind CSS v4 for all styling (no CSS modules, no styled-components)
- File naming: `PascalCase.tsx` for components, `camelCase.ts` for hooks/utils/stores

**Import Order**
```typescript
// 1. External libs (react, framer-motion, @tauri-apps/*, @iconify/react)
// 2. Local components
// 3. Hooks & stores
// 4. Types (use `import type` for type-only imports)
```

**Types**
- Interfaces in `src/types/index.ts` — mirror Rust types exactly
- Explicit return types on exported functions
- Never use `any` — use `unknown` or proper types
- Type-only imports: `import type { Foo } from '../types'`

**Tauri IPC (Frontend)**
```typescript
import { invoke } from '@tauri-apps/api/core';
const result = await invoke<ResponseType>('command_name', { param });
```

**State Management (Zustand)**
```typescript
interface AppStore {
  field: Type;
  action: (param: Type) => void;
}
export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      field: defaultValue,
      action: (param) => set({ field: param }),
    }),
    { name: 'yzpzcode-storage', partialize: (state) => ({ /* persisted fields */ }) }
  )
);
```

**Styling**
- Theme via CSS custom properties (see `styles.css`): `--bg-primary`, `--text-primary`, `--border-color`, etc.
- Accent colors: `--accent` / `--accent-hover` CSS variables (8 colors: default, blue, purple, green, orange, red, pink, cyan)
- UI density classes: `compact` / `comfortable` / `spacious`
- Reduced motion: `animations-disabled` class on root disables all animations
- Dark/light themes toggled via `light-theme` class on root

## Key Dependencies

| Rust | Frontend |
|------|----------|
| tauri 2, portable-pty, tokio | React 19, TypeScript 5.6 |
| anyhow, thiserror, serde | Vite 6, Tailwind CSS 4 |
| reqwest, uuid, notify | Zustand 5, @xterm/xterm 6 |
| regex, base64, which | CodeMirror 6, framer-motion |
| discord-rich-presence | @iconify/react, react-arborist |
| tauri-plugin-opener, dialog, updater, process | pdfjs, xlsx, mammoth |

## Linting & Quality

- Zero warnings before committing
- Rust: `cargo clippy --fix` then `cargo fmt`
- Frontend: `npx tsc --noEmit` (from `app/`)
- No unused imports — both `clippy` and `tsc` will flag them
- No Prettier or ESLint configured — follow existing code patterns

## Feature Reference

### AI Agent CLIs (9)
Claude, Codex, Gemini, Opencode, Cursor, Kilo, Hermes, Pi, Command Code — each gets a PTY session

### Tool CLIs (10)
GitHub CLI (`gh`), Stripe, Supabase, Valyu, PostHog, ElevenLabs, Ramp, Google Workspace (`gws`), AgentMail, Vercel — detected and auth-checked

### In-App Browser
- Webview-based browser with multi-tab support
- URL navigation, zoom, device presets (responsive, iPhone, iPad)
- Orientation switching (portrait/landscape)
- Snapshot export (full HTML capture)
- Pop-out to separate window

### Visual Design Inspector
- **Inspect Mode**: Hover to inspect element HTML/CSS
- **Pick Style Mode**: Capture computed styles to clipboard
- **Pick UI Element Mode**: Deep capture of full UI component (structure tree, layout, typography, visuals, design intent)
- **Apply Mode**: Apply captured styles to target elements
- Undo stack for style applications
- CSS class generation for captured styles

### AI Designer
- Prompt-based UI design generation
- Multiple themes and page types
- Design history and iteration management
- Live preview with responsive device controls
- Element inspector and customization panel
- Generated code export (HTML/CSS/JS)
- Skills management for prompt engineering

### Managed Terminal Commands
- Run non-interactive commands inside app terminals
- Status tracking: Idle → Starting → Running → Stopping → Completed/Failed
- PID and exit code monitoring
- Real-time output streaming

### Agent Task Execution
- Natural language → shell command generation via AI CLI
- Automatic retry (up to 3 attempts)
- Task status tracking with real-time events

### Discord Rich Presence
- Shows workspace, activity, and state on Discord profile
- Enable/disable toggle in settings

### External Terminals
- Launch native OS terminals with AI CLIs pre-configured
- Automatic window tiling (Windows console, macOS Terminal, Linux terminals)

### Settings (11 sections)
Appearance, Terminal, Editor, Agents, Workspace, IDE, Updates, Environment, Data, About, Shortcuts

### Setup Wizard
- Node.js prerequisite check on first launch
- Stepper and page view modes
- Workspace creation with name, directory, layout, agent fleet, IDE selection
- Workspace templates

### Multi-Workspace
- Multiple open workspaces with tab switching
- Per-workspace: sessions, file tabs, browser state, active view
- Workspace state persistence

### Editor
- CodeMirror 6 with syntax highlighting, minimap, search/replace
- Quick Open palette for file search
- File previews: Markdown, PDF, images, spreadsheets, Word docs
- Tab management: close, close others, close to right, close saved
- Auto-save with configurable delay

### Explorer
- File tree with virtualized rendering (react-arborist)
- Git status badges and diff statistics
- Context menu: copy/cut/paste, rename, delete, duplicate, reveal, git stage/unstage
- File import dialog, recent directories

### UI Customization
- 8 accent colors
- 3 UI density levels
- Custom cursor toggle
- Animation toggle (accessibility)
- Dark/light theme

### Auto-Updates
- Tauri updater integration
- Update channels: stable, beta, nightly
- Download progress tracking with auto-install and relaunch
