# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YzPzCode is a Tauri v2 desktop application that provides a unified interface for multiple AI coding CLI tools and SaaS tool CLIs. It combines a React 19 frontend with a Rust backend to create a native, cross-platform development environment with an in-app browser, visual design inspector, AI-powered designer, and multi-workspace management.

**Tech Stack:**
- Frontend: React 19 + TypeScript, Vite 6, Tailwind CSS v4, Zustand 5, CodeMirror 6, xterm.js 6, framer-motion, @iconify/react
- Backend: Tauri v2, Rust, portable-pty, Tokio, discord-rich-presence
- Development: Node.js 18+, Rust (latest stable)

## Development Commands

```bash
# Navigate to app directory first
cd app

# Development
npm install              # Install dependencies
npm run tauri dev       # Run development server (opens on port 8745)

# Building
npm run build           # Build frontend only
npm run tauri build     # Build production installers

# Type Checking
npx tsc --noEmit        # Frontend type checking
cd src-tauri && cargo check  # Backend type checking

# Rust-specific
cd src-tauri
cargo test              # Run tests
cargo clippy            # Lint
cargo fmt               # Format code
```

## Architecture

### Frontend-Backend Communication
The app uses Tauri's IPC (Inter-Process Communication) for all frontend-backend communication:
- Frontend calls Tauri commands via `@tauri-apps/api/core`
- Backend defines commands in `src-tauri/src/commands/` with `#[tauri::command]`
- Real-time events: `app.emit("event-name", payload)` from Rust, `listen<T>("event-name", callback)` from frontend
- No direct REST APIs - all communication through Tauri IPC

### State Management
- **Zustand** (`app/src/stores/appStore.ts`): Centralized state with `persist` middleware
- **Updater Store** (`app/src/stores/updaterStore.ts`): Auto-update state (checking, downloading, progress)
- Key state slices include:
  - Workspace management (currentWorkspace, workspaceList, openWorkspaces, multi-workspace tabs)
  - Terminal sessions (sessions, activeSessionId, per-workspace session tracking)
  - CLI statuses (cliStatuses, toolCliStatuses) — both AI agents and tool CLIs
  - Authentication states (authInfos, toolAuthInfos)
  - UI settings (theme, accent color, UI density, animations, custom cursor, terminal, editor)
  - File editor (openFiles, activeFilePath, dirty state tracking, workspace file isolation)
  - Browser state (URL, tabs, zoom, inspect/pickStyle/apply modes, style clipboard, UI references)
  - IDE detection (ideStatuses, selectedIdes)
  - Version updates (autoCheck, autoDownload, channel, updateAvailable)

### Terminal Management
- **Backend** (`src-tauri/src/terminal/`):
  - `mod.rs`/`session.rs`: PTY session management using `portable-pty`
  - `managed.rs`: `ManagedCommandManager` — run non-interactive commands with status tracking (Idle→Starting→Running→Stopping→Completed/Failed), PID/exit-code monitoring, real-time output streaming, kill support
- **Frontend** (`app/src/components/workspace/`): xterm.js-based terminal UI
- Terminal session management flows through `TerminalManager` in Rust
- Each AI CLI or shell gets its own PTY session with real-time I/O
- Per-workspace session isolation (sessionsByWorkspace)
- Terminal mouse mode tracking per session
- Agent activity: `utils/agentDoneNotifier.ts` (`AgentActivityTracker`, tested by `npm run test:agent-activity`) infers idle → busy → done from submits and PTY output; it drives the done sound and the pane's Gemini-colored working ring / emerald finish effect (`AgentActivityIndicator.tsx` + `AgentActivity.css`, setting `agentActivityGlowEnabled`). Extension panes get the same effect: `extension_host/webview-activity.js` posts `task-busy` / `task-idle` / `task-complete` → `panel-chrome.js` → host → Rust emits `extension-panel-activity` / `extension-panel-task-complete` → `hooks/useExtensionActivity.ts` stores it in `extensionStore.activityByPanel`. The assistant is a native webview, so `ExtensionPane` leaves a 2px rim around it for the ring
- Editor terminal panel: `workspace/EditorTerminalPanel.tsx` (+ `.css`, `.tp-*` classes) is VS Code's integrated terminal under the editor (Ctrl+` toggle, Ctrl+Shift+` new shell, header and status-bar toggles, shell picker from `get_available_shells`). State lives in `stores/editorTerminalStore.ts`, not `appStore.sessionsByWorkspace`; the backend files these PTYs under `<workspaceId>:editor-panel` so the grid's `create_terminal_sessions` (which kills a workspace's sessions) never touches them. Panes are `TerminalPane variant="embedded"` (no header). The editor layer in `Workspace.tsx` is keep-alive (mounted on first visit, then hidden, not unmounted) and one panel is mounted per open workspace, so shells keep their scrollback
- Editor side panel: `workspace/ExtensionDock.tsx` (+ `ExtensionDock.css`, `.xd-*` classes) docks extension panels on the right of the editor view (Ctrl+Alt+B, header toggle). A panel with `dock: 'side'` is hosted there instead of the Extensions grid; `extensionStore.movePanel` moves it between them without restarting. Dock state (open/width/active tab) is `extensionStore.dockByWorkspace`. Both hosts share `hooks/useExtensionPanelHost.ts`, whose sync queue is per panel id so the old host's hide always lands before the new host's show; the webview stays hidden during the slide, while the launcher is shown, and while the editor view is hidden (`visible` prop)

### Agent CLI System
The app supports multiple AI coding agents and SaaS tool CLIs through a provider-based architecture:

**Backend** (`src-tauri/src/agent_cli/`):
- `detector.rs`: Detects installed CLIs and their versions
- `cli_launcher.rs`: Spawns CLI processes in PTY sessions
- `auth_detector.rs`: Checks authentication status for each CLI
- `installer.rs`: Handles CLI installation workflows
- `provider.rs`: `AgentCliProvider` trait for all CLIs
- `prerequisites.rs`: Checks for Node.js, npm, git, bun, pnpm, Docker
- `providers/`: Provider-specific implementations:

  **AI Agents (9):** claude, codex, gemini, opencode, cursor, kilo, hermes, pi, commandcode
  **Tool CLIs (10):** gh (GitHub), stripe, supabase, valyu, posthog, elevenlabs, ramp, gws (Google Workspace), agentmail, vercel

**Frontend** (`app/src/hooks/`):
- `useAgentCli.ts`: AI agent CLI detection, install, launch
- `useToolCli.ts`: Tool CLI detection, install, auth
- `useCliLauncher.ts`: CLI process launch/stop/restart with state tracking
- `useAgent.ts`: Agent task execution

### In-App Browser & Visual Design Tools
**Backend** (`src-tauri/src/browser.rs`):
- Webview-based in-app browser managed via `BrowserManager`; one native child webview per workspace (tabs share it and navigate it)
- Embedded JavaScript bridge (`BROWSER_INIT_SCRIPT`) for element inspection, style capture, UI component capture, page state (title, URL, favicon, `canGoBack`/`canGoForward` via the Navigation API, SPA `pushState` tracking) and forwarding browser shortcuts pressed inside the page (`browser_shortcut`, whitelisted in `BROWSER_SHORTCUT_ACTIONS`)
- **Inspect Mode**: Hover to inspect element HTML/CSS attributes
- **Pick Style Mode**: Click to capture computed styles (with pseudo-element support, diff from baseline)
- **Pick UI Element Mode**: Deep capture of full UI components — structure tree (max depth 8, max 140 nodes), layout, spacing, typography, visuals, pseudo-elements, assets (images/icons), design intent inference, hover selectors, component labeling
- **Apply Mode**: Apply captured styles to target elements with CSS class generation, undo stack
- `target="_blank"` / `window.open` become in-app tabs (`browser-open-tab`); Esc in the page cancels every tool mode (`browser-modes-cleared`)
- **Snapshot Export**: Full document HTML capture
- Events: `browser-element-selected`, `browser-page-load`, `browser-inspect-mode-changed`, `browser-page-state`, `browser-snapshot-ready`, `browser-style-captured`, `browser-ui-element-captured`, `browser-style-applied` (the three capture events carry `workspaceId`), `browser-popout-state`, `browser-modes-cleared`, `browser-shortcut`, `browser-open-tab`
- **IPC security**: `build.rs` declares an app ACL manifest generated from `generate_handler!` (it writes `permissions/app-commands.toml`), so app commands are capability-checked. `capabilities/default.json` grants the `app-commands` set to the local `main` UI only; `capabilities/browser-bridge.json` lets remote pages call just the bridge callbacks. A new command needs no manual permission entry; a new bridge callback must be added to `browser-bridge.json` (tests in `browser.rs` guard both files)

**Frontend** (`app/src/components/workspace/`, styles in `browser/browser.css`, `.bx-*` classes, theme tokens only):
- `BrowserPane.tsx`: Orchestrator — native webview sync queue, events, shortcuts, inspector/agent handoff
- `browser/BrowserToolbar.tsx`, `BrowserOmnibox.tsx` (address bar: ports → localhost, domains → https, else search, via `utils/browserUrl.ts`), `BrowserDeviceMenu.tsx`, `BrowserStatusBar.tsx` (tool hints, messages, applied-style Undo/Keep/Copy CSS), `BrowserStartPage.tsx` (new tab: live dev servers), `UiReferencesPanel.tsx`
- `browser/BrowserMenu.tsx`: popover primitive. The native webview is drawn above the DOM, so nothing may overlap the preview rect: open menus register through `NativeOverlayContext` and the pane hides the webview until they close
- `browser/browserModel.ts`: device presets (desktop/tablet/mobile/custom), `getViewportMetrics` (device emulation: webview drawn at `size × scale` and zoomed by `scale`, so the page lays out at the real device width), snapshot paths, prompt formatting. Tested with `utils/browserUrl.ts` by `npm run test:browser`
- `BrowserTabBar.tsx`, `StyleClipboardPanel.tsx`, `StylePreviewCard.tsx`, `UiReferenceClipboardPanel.tsx`, `UiReferenceCard.tsx`
- Start page sentinel URL `yzpz://newtab` never reaches the native webview; tabs, device, custom viewport and auto-reload are persisted per workspace

### AI-Powered Designer
**Frontend** (`app/src/components/designer/`):
- `DesignerPage.tsx`: Full AI-powered UI design generation interface
- `designerGenerator.ts`: Prompt generation engine with system prompts, themes, page types
- `types.ts`: Designer form state, generated designs, device types
- `DesignerPromptInput.tsx`: Natural language prompt for design generation
- `ThemeSelector.tsx`: Multiple theme selection
- `ResponsivePreviewControls.tsx`: Device preview switching
- `DesignPreview.tsx`: Live design preview rendering
- `CustomizationPanel.tsx`: Color, font, spacing customization
- `ElementInspector.tsx`: Inspect generated elements
- `GeneratedCodePanel.tsx`: View generated HTML/CSS/JS code
- `DesignHistory.tsx`: Design iteration history
- `SkillsManager.tsx`: Prompt engineering skills management
- `ExportControls.tsx`: Export generated designs
- CSS: `DesignerPage.css`

### Agent Task Execution
**Backend** (`src-tauri/src/agent/`):
- `executor.rs`: `AgentExecutor` — takes natural language tasks, generates shell commands via AI CLI, executes with retry (up to 3 attempts)
- `mod.rs`: `AgentTask` types, `AgentTaskStatus` (Pending/Running/Completed/Failed/Cancelled), `COMMAND_GENERATION_PROMPT`
- Real-time task update events via IPC

### Discord Rich Presence
**Backend** (`src-tauri/src/discord_presence.rs`):
- `DiscordPresenceManager` using `discord_rich_presence` crate
- Shows workspace name, activity details, and state on Discord profile
- Enable/disable with IPC commands
- Auto-connect/reconnect to Discord client
- Idle presence when no workspace open

### External Terminal Launch
**Backend** (`src-tauri/src/commands/external_terminals.rs`):
- Launch external OS terminals with AI CLIs pre-configured
- Platform-specific: Windows (CMD with new console + `SetWindowPos` tiling), macOS (AppleScript Terminal.app + bounds tiling), Linux (gnome-terminal/konsole/xfce4-terminal + wmctrl)
- Smart window tiling based on grid dimensions
- External command execution in new terminal windows

### File System Operations
**Backend** (`src-tauri/src/filesystem/`):
- `explorer.rs`: File tree directory listing
- `git_status.rs`: Git repository status (added, modified, deleted, untracked)
- `git_diff_stats.rs`: Git diff statistics (lines added/deleted per file)
- `watcher.rs`: File system change notifications (debounced)
- `operations.rs`: File/directory CRUD (create, delete, move, rename, duplicate, import, reveal)
- `reader.rs`: File content reading with preview support, base64, binary detection, file size
- `validation.rs`: Path security validation

**Frontend** (`app/src/components/explorer/`):
- `FileExplorer.tsx`: File tree using `react-arborist` with virtualized rendering
- `ExplorerContextMenu.tsx`: Right-click context menu with copy/cut/paste, rename, delete, reveal, duplicate, git stage/unstage
- `TreeNode.tsx`: Individual tree node with file icon
- `FileIcon.tsx`: Language-aware file icons
- `GitChangesPanel.tsx`: Git status panel with staging/unstaging
- `GitStatusBadge.tsx`: Per-file git status indicators

### Multi-Tab Editor
**Frontend** (`app/src/components/editor/`):
- `FileEditor.tsx`: CodeMirror 6 with syntax highlighting
- `EditorTabs.tsx`: Tab bar with close, dirty indicators, context menu
- `TabContextMenu.tsx`: Close all, close others, close to right, close saved
- `FindReplaceBar.tsx`: Find and replace in editor
- `QuickOpenPalette.tsx`: File search/quick open palette
- `MarkdownPreview.tsx`: Live markdown rendering
- `PdfPreview.tsx`: PDF file preview (pdfjs)
- `ImagePreview.tsx`: Image file preview
- `SpreadsheetPreview.tsx`: Excel/CSV preview (xlsx)
- `DocxPreview.tsx`: Word document preview (mammoth)
- `MediaPreview.tsx`: Audio (waveform, transport, speed, loop) and video player; `BinaryPreview.tsx`: hex view for any other non-UTF-8 file. Both stream through the `yzpzmedia` URI scheme (`src-tauri/src/filesystem/media_protocol.rs`, HTTP range support, served only to the `main` webview); build URLs with `localFileUrl()` from `utils/mediaFiles.ts`
- Language support: JS, TS, Python, Rust, Java, C++, HTML, CSS, JSON, Markdown, and more
- Features: minimap, search, word wrap, bracket colorization, format on save, line numbers (on/off/relative), auto-save, dirty state tracking

### IDE Integration
**Backend** (`src-tauri/src/ide/`):
- `detector.rs`: Detects 10 IDEs — VS Code, Visual Studio, Cursor, Zed, WebStorm, IntelliJ, Sublime Text, Windsurf, Perplexity, Antigravity
- `launcher.rs`: Opens projects in detected IDEs

### Settings System (11 sections)
**Frontend** (`app/src/components/settings/`):
- `SettingsScreen.tsx`: Main settings layout with navigation
- `SettingsAppearance.tsx`: Theme (dark/light), accent color (8 options), UI density (compact/comfortable/spacious), animations, custom cursor
  - **Custom themes** (`sections/SettingsCustomThemes.tsx` list/import/export, `theme/ThemeEditor.tsx` editor with scoped `ThemePreview`, `ThemePaletteGallery`, WCAG contrast checks). A theme is 9 colors + light/dark base + radius; `utils/customTheme.ts` (dependency-free, tested by `npm run test:custom-theme`) derives every other token, incl. the Tailwind zinc ramp, and holds the 40+ presets. `themeMode: 'custom'` + `activeCustomThemeId`; `hooks/useCustomTheme.ts` writes tokens as inline vars on `<html>`, which outrank the `.light-theme`/`.claude-theme` classes. Terminal and Monaco read the theme directly (not via CSS vars, which land one render late). Imports are validated strictly; saves that make text unreadable (<3:1) are blocked.
- `SettingsTerminal.tsx`: Font, size, cursor style (block/underline/bar), blink, scrollback, copy/paste behavior, bell, opacity, word wrap
- `SettingsEditor.tsx`: Font, size, tab size, word wrap, line numbers, bracket colorization, format on save, trim whitespace
- `SettingsAgents.tsx`: Agent CLI detection status, tool CLI detection, install commands, agent timeout
- `SettingsWorkspace.tsx`: Auto-save, minimap, confirm close, save workspace state, default layout, default directory, launch IDE on creation
- `SettingsIde.tsx`: IDE detection and selection (10 IDEs with icons)
- `SettingsUpdates.tsx`: Auto-check updates, auto-download, update channel (stable/beta/nightly), manual check
- `SettingsEnvironment.tsx`: Prerequisites status (Node.js, npm, git, bun, pnpm, Docker)
- `SettingsData.tsx`: Clear data/reset application
- `SettingsAbout.tsx`: Version info, OS info
- `SettingsShortcuts.tsx`: Keyboard shortcuts reference
- `SettingsKit.tsx` + `settings.css`: Shared settings primitives (SettingsGroup, SettingsRow, ToggleRow, SliderRow, Segmented, Switch, Button, Badge, Notice, SettingsTabs). Build every settings page from these — no per-page card styling.

### Setup & Onboarding
**Frontend** (`app/src/components/setup/`):
- `SetupScreen.tsx`: Main setup with workspace creation flow
- `SetupStepper.tsx`: Step-by-step guided setup (same form, `guided` mode)
- `NodeJsCheckScreen.tsx`: Node.js prerequisite check on first launch
- `WorkspaceConfigForm.tsx`: "Set up your workspace" page — numbered Project / Layout / Agents & tools sections on a progress rail, sticky live preview + launch panel, Ctrl/⌘+O and Ctrl/⌘+Enter shortcuts. All styling lives in `setup.css` (`.ws-*` classes, theme tokens only; motion off under `.animations-disabled`/reduced motion via `useSetupMotion`)
- `WorkspacePreview.tsx`: Animated mock of the workspace about to open (pane grid, typed commands, editor-only mock)
- `cliCatalog.ts`: Shared agent/tool CLI metadata (label, logo/icon, color, command) and `slotAssignments`
- `WorkspaceTemplatePicker.tsx`: Preset chips + "Manage" dialog (save current, edit, restore defaults)
- `DirectorySelector.tsx`: Project folder picker with recent directories
- `LayoutSelector.tsx`: Terminal count/grid layout selection
- `AgentFleetConfig.tsx`: AI agent / tool CLI allocation to terminal slots (not-installed CLIs fold away)
- `IdesSelector.tsx` / `IdesTable.tsx`: IDE selection for workspace
- `PrerequisitesPanel.tsx`: Dependencies status panel
- `InitializeWorkspace.tsx`: Workspace initialization
- `InlineTerminal.tsx`: Embedded terminal in setup flow

### Workspace Views (3 modes)
**Frontend** (`app/src/components/workspace/`):
- `Workspace.tsx`: Main workspace orchestrator
- `WorkspaceHeader.tsx`: Multi-workspace tab bar with close/switch
- `WorkspaceTab.tsx`: Individual workspace tab
- `TerminalGrid.tsx`: Resizable terminal grid
- `TerminalPane.tsx`: Individual terminal with header
- `TerminalHeader.tsx`: Terminal title bar with agent info, status
- `SortableTerminalPane.tsx`: Drag-reorderable terminal pane
- `NewTerminalDialog.tsx`: Add new terminal dialog
- `QuickActions.tsx`: Workspace quick actions toolbar
- `CliStatusBadge.tsx`: CLI running status badge
- `AuthModal.tsx`: Authentication modal for CLIs
- `BrowserPane.tsx`: In-app browser view
- 3 views: "terminal" (grid), "editor" (code tabs), "browser" (webview)

### Common/Shared Components
**Frontend** (`app/src/components/common/`):
- `ContextMenu.tsx`: Global right-click context menu (theme, docs, designer, new workspace)
- `ThemeToggleButton.tsx`: Dark/light toggle
- `CustomCursor.tsx`: Animated custom cursor overlay
- `AppChrome.tsx`: Title bar for setup, settings, and the Node.js check (brand, breadcrumbs, tab strip, theme, window controls); `ChromeParts.tsx` holds the shared brand/button/divider
- `AppFooter.tsx`: Status bar footer — workspace status on the left, app utilities on the right. The workspace header, `AppChrome`, and the footer are all styled in `src/window-chrome.css` (28px controls, 6px radius, hairline dividers; no glow, gloss, or blur)
- `UpdateNotification.tsx`: Update available banner
- `HelpTooltip.tsx`: Contextual help tooltips
- `UtilizationBar.tsx`: Resource utilization display
- `ErrorBoundary.tsx`: React error boundary

### Feedback
- The footer Feedback button opens the project's GitHub Issues page.

### Docs Screen
- `DocsScreen.tsx`: Built-in documentation viewer with theme support

### Auto-Update System
- Tauri updater plugin (`tauri_plugin_updater`)
- `updaterStore.ts`: Zustand store for update state
- `UpdateNotification.tsx`: Update notification UI
- Configurable update channel (stable, beta, night)
- Download progress tracking, auto-install with relaunch

### Window Management
- Commands: `minimize_window`, `maximize_window`, `close_window`
- Platform detection: Windows vs macOS (with custom decorations)
- Borderless window with custom titlebar
- Tauri plugin: `tauri_plugin_process` (relaunch support)
- Tauri plugin: `tauri_plugin_opener` (open URLs)
- Tauri plugin: `tauri_plugin_dialog` (file dialogs)

## Important File Locations

### Configuration
- `app/vite.config.ts`: Frontend build config with vendor chunk splitting
- `app/tsconfig.json`: TypeScript configuration (strict mode, bundler resolution)
- `app/src-tauri/Cargo.toml`: Rust dependencies
- `app/src-tauri/tauri.conf.json`: Tauri app configuration

### Type Definitions
- `app/src/types/index.ts`: Shared TypeScript types (454+ lines) — AgentType, CliType, ToolCliType, Browser types, Designer types, WorkspaceConfig, TerminalSession, Git types, Auth types, etc.
- `app/src-tauri/src/types.rs`: Rust type definitions
- `app/src-tauri/src/browser.rs`: Browser-specific Rust types (BrowserBounds, CapturedStyle, CapturedUiElementReference, etc.)

### Custom Hooks
- `app/src/hooks/useTerminal.ts`: Terminal session lifecycle management
- `app/src/hooks/useAgentAllocation.ts`: Agent-to-workspace slot allocation
- `app/src/hooks/useFileTree.ts`: File explorer operations
- `app/src/hooks/useFileEditor.ts`: Editor tab management
- `app/src/hooks/useFileWatcher.ts`: File system change listener
- `app/src/hooks/useAgentCli.ts`: AI agent CLI detection/install/launch
- `app/src/hooks/useToolCli.ts`: Tool CLI detection/install/auth
- `app/src/hooks/useCliLauncher.ts`: CLI process lifecycle (launch/stop/restart)
- `app/src/hooks/useAgent.ts`: Agent task execution
- `app/src/hooks/useBrowser.ts`: Browser pane management
- `app/src/hooks/useWorkspace.ts`: Workspace CRUD
- `app/src/hooks/useIde.ts`: IDE detection/launch

### Component Structure
- `app/src/components/setup/`: Onboarding and workspace creation (15 components)
- `app/src/components/workspace/`: Terminal grid, browser, views (20+ components)
- `app/src/components/explorer/`: File tree, git panels (7 components)
- `app/src/components/editor/`: Code editor, file previews (10 components)
- `app/src/components/designer/`: AI design tools (12 components)
- `app/src/components/settings/`: Settings sections (15+ components)
- `app/src/components/common/`: Shared UI primitives (9 components)
- `app/src/components/feedback/`: Feedback modal
- `app/src/components/docs/`: Built-in docs viewer

### Utilities
- `app/src/utils/grid.ts`: Terminal grid layout calculations
- `app/src/utils/window.ts`: Window management helpers
- `app/src/utils/projectDetect.ts`: Project type detection
- `app/src/data/initTemplates.ts`: Workspace initialization templates
- `app/src/assets/docs/userguide.ts`: User guide content data

## Key Patterns

### Tauri Commands
All backend commands follow this pattern:
```rust
#[tauri::command]
async fn my_command(state: State<'_, AppState>, arg: Type) -> Result<Type, String> {
    // Implementation
}
```

Registered in `lib.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    my_command,
    // ... other commands (100+ registered)
])
```

### Real-Time Events (Rust → Frontend)
```rust
app.emit("event-name", &payload).map_err(|e| e.to_string())?;
```
Frontend listens with `listen<T>("event-name", callback)` from `@tauri-apps/api/event`.

### Tauri Plugins Used
- `tauri_plugin_opener` — Open URLs/files
- `tauri_plugin_dialog` — File dialogs
- `tauri_plugin_updater` — Auto-updates
- `tauri_plugin_process` — Process/relaunch management

### Error Handling
- Rust: Use `Result<T, String>` for Tauri commands; `anyhow::Result<T>` internally with `.context()`
- Frontend: Try-catch blocks with user-friendly error messages
- Error boundary in React (`ErrorBoundary.tsx`)
- Panic hook setup in `lib.rs` with backtrace capture

### File Operations
- Always validate paths in Rust before filesystem operations
- Use `validation.rs` for security checks
- Watcher notifications for real-time updates (debounced)

### Terminal Sessions
- Each session has a unique UUID
- Sessions are managed per-workspace via `sessionsByWorkspace`
- PTY I/O is streamed in real-time to frontend via events
- Managed commands track status, PID, exit code, error

### Browser Bridge
The browser injects `window.__YZPZ_BROWSER_BRIDGE__` with methods:
- `setInspectMode`, `setPickStyleMode`, `setPickUiElementMode`, `setApplyMode`
- `setPreviewChrome`, `undoLastStyle`, `goBack`, `goForward`, `exportSnapshot`

## Testing Strategy
- Rust unit tests in `src-tauri/src/` alongside modules (test functions with `#[cfg(test)]`)
- Focus on terminal management, CLI detection, browser URL handling, and file operations
- Test error cases and edge cases in IPC communication
- Cargo test all: `cargo test`
- No frontend testing framework configured yet

## Platform-Specific Notes
- **macOS**: Code signing not yet configured — right-click to open on first launch; `set_decorations(true)` applied in setup
- **Windows**: CREATE_NO_WINDOW for managed commands, console tiling with Win32 API (`SetWindowPos`, `FindWindowW`)
- **Linux**: Terminal detection (gnome-terminal, konsole, xfce4-terminal), wmctrl-based window tiling

## Performance Considerations
- Vite chunk splitting configured for vendor libraries
- Large libraries split: codemirror, pdfjs, xlsx, mammoth, framer-motion
- Terminal scrollback limited (configurable, default 10000)
- File watching debounced to reduce filesystem load
- Browser bridge uses requestAnimationFrame for overlay updates
- Structure capture limits: max depth 8, max 140 nodes, max 24 children per node
- Zustand persist middleware with `partialize` for selective persistence
- Lazy-loaded routes: Workspace, DocsScreen, SettingsScreen, DesignerPage
