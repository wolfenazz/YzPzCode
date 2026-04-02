# Workspace Enhancement Plan

Comprehensive plan for improving the workspace, startup page, editor, file explorer, terminals, and backend.

---

## Priority 1 — High Impact, Low Effort (Quick Wins)

### Security Fixes

| # | Area | Issue | File(s) |
|---|------|-------|---------|
| S1 | **Hardcoded Discord webhook URL** | Webhook secret exposed in source code — move to env/config | `commands/mod.rs:452` |
| S2 | **No path traversal validation** | All filesystem commands accept arbitrary paths — validate paths are within workspace roots | `filesystem/operations.rs:5-88`, `filesystem/reader.rs:17-100` |
| S3 | **`open_url` no scheme validation** | Arbitrary URL opened without restricting to `http/https` — could allow `file://` or `javascript:` attacks | `commands/mod.rs:354-379` |

### UI/UX Quick Fixes

| # | Area | Issue | File(s) |
|---|------|-------|---------|
| U1 | **Tab/file name truncation with no tooltip** | Long filenames are truncated at fixed width (`max-w-[160px]`) with no way to see full name | `EditorTabs.tsx:128`, `WorkspaceTab.tsx:35` |
| U2 | **Settings button is a placeholder** | Settings icon in workspace header has no `onClick` handler | `WorkspaceHeader.tsx:232` |
| U3 | **Context menu Copy writes empty string** | Copy action writes `''` to clipboard instead of actual selection | `ContextMenu.tsx:102` |
| U4 | **`alert()` used for error feedback** | Setup screen uses native `alert()` — should use toast or inline error | `SetupScreen.tsx:181` |
| U5 | **Feedback success auto-closes too fast** | 1.2s timeout is too quick to read confirmation | `FeedbackModal.tsx:64` |
| U6 | **Terminal grid jargon** | Bottom bar shows "CLUSTER_SIZE", "TOPOLOGY" — confusing for users | `TerminalGrid.tsx:398-404` |
| U7 | **PrerequisitesPanel uses hardcoded grays** | Uses `bg-gray-800` instead of theme variables — breaks in light theme | `PrerequisitesPanel.tsx:18` |

### Error Handling Fixes

| # | Area | Issue | File(s) |
|---|------|-------|---------|
| E1 | **`initWindowPlatform` rejection uncaught** | Promise error not handled in `useEffect` | `App.tsx:27-37` |
| E2 | **IDE error unsafe cast** | `setError(err as string)` — if `err` is an Error object, sets `[object Object]` | `useIde.ts:28` |
| E3 | **FS watcher stop error swallowed** | `.catch(() => {})` hides failures | `useFileWatcher.ts:51` |
| E4 | **`write_to_session`/`resize_session` silent no-op** | Unknown session ID returns success instead of error | `terminal/mod.rs:147-168` |
| E5 | **`let _ =` error swallowing** | Multiple terminal/session cleanup calls ignore errors silently | `commands/mod.rs:56,402`, `lib.rs:83` |
| E6 | **File editor errors not surfaced** | Save error logged to console with no user feedback | `useFileEditor.ts:86-88` |

### Code Quality Quick Fixes

| # | Area | Issue | File(s) |
|---|------|-------|---------|
| C1 | **`any` types in store** | `cliLaunchStates: Record<string, any>` and `authInfos: Record<AgentType, any>` should use proper types | `appStore.ts:23,121-122` |
| C2 | **`Date.now()` for workspace IDs** | Can collide — use `crypto.randomUUID()` | `useWorkspace.ts:55` |
| C3 | **Duplicate constants** | `VALID_AGENTS` and `ALL_AGENTS` are duplicated | `useAgentAllocation.ts:6,53` |
| C4 | **Component-level constant recreated on render** | `SHORTCUTS` array defined inside component body | `WorkspaceHeader.tsx:26-45` |
| C5 | **Debug `println!` in production** | Debug statements left in code | `commands/mod.rs:661-665`, `session.rs:39-40` |
| C6 | **Deprecated `navigator.userAgent`** | Platform detection uses deprecated API | `window.ts:10-11` |
| C7 | **Deprecated `document.execCommand`** | Paste uses legacy API | `ContextMenu.tsx:118` |
| C8 | **`chrono_lite_timestamp()` inaccurate** | Month/day calculations use wrong approximations (31 days per month) | `commands/mod.rs:593-609` |

---

## Priority 2 — Medium Impact, Medium Effort

### Performance Optimizations

| # | Area | Issue | File(s) |
|---|------|-------|---------|
| P1 | **Full tree reload after every file op** | Move/rename/delete reload entire tree — do incremental updates instead | `useFileTree.ts:137,174` |
| P2 | **Recursive tree search on every toggle** | `findNode` traverses entire tree — use `Map<path, node>` for O(1) lookup | `useFileTree.ts:83-92` |
| P3 | **Sync Excel parsing blocks UI** | Large `.xlsx` files freeze renderer — use web worker or chunked parsing | `SpreadsheetPreview.tsx:25-75` |
| P4 | **Markdown re-parsed on every keystroke** | Preview mode re-renders full markdown — debounce rendering | `MarkdownPreview.tsx:167` |
| P5 | **npm calls repeated without caching** | `npm config get --global prefix` runs multiple times — cache result | `session.rs:96-110`, `env.rs`, `process.rs` |
| P6 | **Login shell spawn on every startup** | `env.rs` spawns login shell (~200-1000ms) — cache env to disk | `utils/env.rs:30-35,126-131` |
| P7 | **No filesystem watcher debouncing** | Rapid changes (e.g., `npm install`) flood the frontend — add 300ms debounce | `filesystem/watcher.rs:37-43` |
| P8 | **Image cache not cleared on workspace change** | Module-level global cache leaks between workspaces | `ImagePreview.tsx:12-13` |
| P9 | **File read with no size limit** | Opening a 500MB file crashes the app — add size limit (~10MB) | `filesystem/reader.rs:17,100` |
| P10 | **Grid empty cells rendered** | 6 empty cells rendered for 8-slot grid with 2 sessions — skip empties | `TerminalGrid.tsx:272-318` |
| P11 | **`updateFileContent` maps all files** | Remaps entire file array on every keystroke — use targeted update | `appStore.ts:491-508` |

### Accessibility

| # | Area | Issue | File(s) |
|---|------|-------|---------|
| A1 | **Context menus lack ARIA roles** | No `role="menu"`, `role="menuitem"` on any context menu | `ContextMenu.tsx`, `ExplorerContextMenu.tsx`, `TabContextMenu.tsx` |
| A2 | **Modals missing dialog semantics** | No `role="dialog"`, `aria-modal`, or focus traps on any modal | `FeedbackModal.tsx`, `NewTerminalDialog.tsx`, `WorkspaceHeader.tsx` (shortcuts modal) |
| A3 | **Custom toggles lack switch role** | Toggle buttons have no `role="switch"` or `aria-checked` | `AgentFleetConfig.tsx:198-214`, `ThemeToggleButton.tsx:31-34` |
| A4 | **Progress bars missing ARIA** | No `role="progressbar"` or value attributes | `UtilizationBar.tsx:30-54` |
| A5 | **Tab elements are divs** | Editor tabs and workspace tabs are plain divs — use `role="tab"` | `EditorTabs.tsx`, `WorkspaceTab.tsx` |
| A6 | **Tree view missing tree semantics** | No `role="tree"`, `role="treeitem"`, `aria-expanded` | `TreeNode.tsx:158-205`, `FileExplorer.tsx:157-364` |
| A7 | **Keyboard shortcuts not all listed** | Shortcuts modal is incomplete — Ctrl+B, Ctrl+E, Ctrl+W missing | `WorkspaceHeader.tsx` |
| A8 | **Search input missing label** | File explorer search has no accessible label | `FileExplorer.tsx` |

### New Features — Editor

| # | Feature | Description | File(s) to Modify |
|---|---------|-------------|-------------------|
| F1 | **File size limit before reading** | Show confirmation for files >10MB instead of loading | `useFileEditor.ts`, `filesystem/reader.rs` |
| F2 | **Quick-open file palette (Ctrl+P)** | Fuzzy file search dialog | New component, `WorkspaceHeader.tsx`, `Workspace.tsx` |
| F3 | **Editor toolbar ARIA labels** | All toolbar buttons need `aria-label` and toggle buttons need `aria-pressed` | `FileEditor.tsx:398-556` |
| F4 | **Tab reordering via drag-and-drop** | Allow reordering editor tabs | `EditorTabs.tsx` |
| F5 | **Spreadsheet CSV support** | Extend spreadsheet preview to handle `.csv` files | `SpreadsheetPreview.tsx`, `useFileEditor.ts` |

### New Features — Explorer

| # | Feature | Description | File(s) to Modify |
|---|---------|-------------|-------------------|
| F6 | **"Open in Terminal" from context menu** | Right-click folder → open terminal at that path | `ExplorerContextMenu.tsx` |
| F7 | **"Duplicate" file action** | Right-click file → duplicate with `-copy` suffix | `ExplorerContextMenu.tsx`, `filesystem/operations.rs` |
| F8 | **"Copy as import path"** | Copy relative import path to clipboard | `ExplorerContextMenu.tsx` |
| F9 | **Git stage/unstage per file** | Stage/unstage actions in the git changes panel | `GitChangesPanel.tsx`, new backend commands |
| F10 | **Search debounce** | Debounce file explorer search input (200ms) | `FileExplorer.tsx:40-41` |

### New Features — Terminals

| # | Feature | Description | File(s) to Modify |
|---|---------|-------------|-------------------|
| F11 | **Agent descriptions in new terminal dialog** | Add tooltips explaining each agent's capabilities | `NewTerminalDialog.tsx` |
| F12 | **Configurable shell** | Let users choose shell (bash, zsh, fish, PowerShell) | `terminal/session.rs`, types, setup UI |
| F13 | **Paste confirmation for large content** | Warn before pasting >1KB into terminal | `TerminalPane.tsx:284-310` |

### New Features — Setup

| # | Feature | Description | File(s) to Modify |
|---|---------|-------------|-------------------|
| F14 | **Workspace templates** | Pre-configured workspace templates (React, Rust, Python, etc.) | `SetupScreen.tsx`, new types |
| F15 | **"Distribute evenly" auto-allocation** | One-click to distribute terminal slots equally across installed agents | `AgentFleetConfig.tsx` |
| F16 | **Recent directories dropdown** | Show recently used directories in the directory selector | `DirectorySelector.tsx` |
| F17 | **Form validation messages** | Show inline validation for workspace name, required fields | `WorkspaceConfigForm.tsx` |

---

## Priority 3 — Lower Impact / Higher Effort

### Architecture Refactoring

| # | Area | Issue | File(s) |
|---|------|-------|---------|
| R1 | **Split `commands/mod.rs` (1227 lines)** | Split into: `terminal_commands.rs`, `agent_commands.rs`, `cli_commands.rs`, `ide_commands.rs`, `filesystem_commands.rs`, `window_commands.rs`, `external_terminals.rs` | `commands/mod.rs` |
| R2 | **Split `TerminalPane.tsx` (884 lines)** | Extract: `TerminalXterm`, `TerminalHeader`, `AuthModal`, `CliStatusBadge` | `TerminalPane.tsx` |
| R3 | **Split `SetupScreen.tsx` (533 lines)** | Extract footer/social section, Windows 10 warning | `SetupScreen.tsx` |
| R4 | **Deduplicate output reader thread** | Extract shared `spawn_output_reader()` from `create_sessions` and `create_single_session` (~90 lines duplicated) | `terminal/mod.rs:90-134,246-289` |
| R5 | **Deduplicate platform PATH setup** | Extract shared `build_env_vars()` from 3 platform blocks (~230 lines duplicated) | `terminal/session.rs:66-300` |
| R6 | **Deduplicate git command creation** | Extract `run_git_hidden()` utility from `git_status.rs` and `git_diff_stats.rs` | `filesystem/git_status.rs:17-32`, `git_diff_stats.rs` |
| R7 | **Deduplicate binary search logic** | Consolidate platform-specific binary search code (~300 lines duplicated) | `utils/process.rs:129-358` |
| R8 | **Consolidate IdesSelector/IdesTable** | Two nearly identical components — merge or clearly differentiate | `IdesSelector.tsx`, `IdesTable.tsx` |
| R9 | **Consolidate markdown/DOCX CSS** | Large duplication between `.markdown-dark` and `.markdown-light` styles | `styles.css:174-428,476-637` |
| R10 | **Split appStore.ts (638 lines)** | Split into sub-stores: `workspaceStore`, `fileStore`, `cliStore` | `appStore.ts` |

### New Features — Major

| # | Feature | Description | Effort |
|---|---------|-------------|--------|
| FM1 | **Command palette (Ctrl+P/Ctrl+Shift+P)** | Fuzzy search for all commands, files, and actions | High |
| FM2 | **Split view (terminal + editor side by side)** | Show editor and terminal simultaneously | High |
| FM3 | **Notification/toast system** | Global toast queue for success/error/info messages | Medium |
| FM4 | **Per-workspace filesystem watchers** | Current global watcher only supports one workspace at a time | Medium |
| FM5 | **Terminal session health monitoring** | Detect crashed sessions, auto-restart option | Medium |
| FM6 | **Logging framework** | Replace `println!`/`eprintln!` with `tracing` or `log` crate | Medium |
| FM7 | **Configuration file persistence** | Save user settings to disk (theme, layout prefs, recent workspaces) | Medium |
| FM8 | **File encoding detection** | Detect UTF-8/UTF-16/Latin-1 and handle accordingly | Medium |
| FM9 | **Trash/recycle bin support** | Move to trash instead of permanent delete | Medium |
| FM10 | **Copy file operation** | Add copy alongside existing move/rename | Low |
| FM11 | **Git inline diff preview** | View diffs without leaving the app | Medium |
| FM12 | **Mermaid/KaTeX in markdown** | Render diagrams and math in markdown preview | Medium |
| FM13 | **Image rotation/pan** | Add rotation and drag-to-pan for zoomed images | Low |
| FM14 | **PDF text selection & search** | Enable text selection, Ctrl+F in PDF preview | Medium |
| FM15 | **Undo/redo for file editor** | Track file save states, allow reverting changes | Medium |
| FM16 | **IDE launch with file/line** | Right-click file → "Open in IDE at line X" | Low |

### Reliability Improvements

| # | Area | Issue | File(s) |
|---|------|-------|---------|
| RL1 | **Lock poisoning panics** | Multiple `.lock().unwrap()` calls will panic on poisoned locks — use `.lock().unwrap_or_else(\|e\| e.into_inner())` | `terminal/mod.rs:62,140,215,294`, `agent/executor.rs` |
| RL2 | **CLI launcher race condition** | Hardcoded 2-second sleep to wait for shell — should detect shell readiness | `agent_cli/cli_launcher.rs:95-96` |
| RL3 | **`SystemTime::now()` unwrap** | Panics if system clock is before 1970 — use `.unwrap_or_default()` | `agent/executor.rs:52-55,79-82,117-120` |
| RL4 | **External terminal PID matching fragile** | `FindWindowW` matches ALL ConsoleWindowClass windows — could match unrelated windows | `commands/mod.rs:684-740` |
| RL5 | **macOS osascript escaping incorrect** | `replace('"', "\\'")` is wrong for AppleScript strings | `commands/mod.rs:846` |
| RL6 | **`is_binary_file` treats errors as binary** | Permission-denied files are marked as binary | `filesystem/reader.rs:160-162` |
| RL7 | **CLI launch silent retry give-up** | After 3 retries, silently stops trying with no user feedback | `TerminalPane.tsx:397-412` |
| RL8 | **File tree path not cross-platform** | `${dir}/${name}` interpolation doesn't handle Windows paths | `useFileTree.ts:188` |

---

## Key Files to Modify

### Frontend (TypeScript/React)
| File | Lines | Changes |
|------|-------|---------|
| `src/components/workspace/TerminalPane.tsx` | 884 | Split into sub-components, fix retry logic, add paste confirmation |
| `src/components/setup/SetupScreen.tsx` | 533 | Extract footer, fix alert(), fix random PID display |
| `src/components/workspace/TerminalGrid.tsx` | 438 | Skip empty cell rendering, fix drag cleanup |
| `src/components/explorer/FileExplorer.tsx` | 365 | Add search debounce, ARIA roles |
| `src/components/workspace/Workspace.tsx` | 312 | Add split view, command palette hook |
| `src/components/workspace/WorkspaceHeader.tsx` | 307 | Fix settings button, extract SHORTCUTS constant, complete shortcuts list |
| `src/components/explorer/GitChangesPanel.tsx` | 327 | Add stage/unstage, keyboard navigation |
| `src/components/explorer/ExplorerContextMenu.tsx` | 256 | Add Open in Terminal, Duplicate, Copy import path |
| `src/components/editor/FileEditor.tsx` | 557 | Add ARIA labels, fix prompt() |
| `src/components/editor/EditorTabs.tsx` | 184 | Add drag reorder, tooltips, keyboard nav, virtualization |
| `src/components/editor/MarkdownPreview.tsx` | 245 | Add debounce, DOMPurify, Mermaid/KaTeX support |
| `src/components/editor/SpreadsheetPreview.tsx` | 226 | Add CSV support, async parsing, sorting |
| `src/components/editor/PdfPreview.tsx` | 193 | Add text selection, search, keyboard nav |
| `src/stores/appStore.ts` | 638 | Fix `any` types, split into sub-stores |
| `src/hooks/useFileTree.ts` | 257 | Incremental updates, Map-based lookup, cross-platform paths |
| `src/hooks/useTerminal.ts` | 130 | Better error reporting for kill failures |
| `src/hooks/useFileEditor.ts` | 93 | Add file size limit, surface errors to user |
| `src/components/feedback/FeedbackModal.tsx` | 212 | Add dialog semantics, focus trap, labels |
| `src/components/common/ContextMenu.tsx` | 157 | Fix copy action, add menu ARIA role |
| `src/styles.css` | 871 | Deduplicate markdown styles, add custom scrollbar |

### Backend (Rust)
| File | Lines | Changes |
|------|-------|---------|
| `src-tauri/src/commands/mod.rs` | 1227 | **Split into 7+ sub-modules**, remove webhook URL, add path validation, fix timestamp, remove debug prints |
| `src-tauri/src/terminal/mod.rs` | 310 | Deduplicate reader thread, fix lock handling |
| `src-tauri/src/terminal/session.rs` | 422 | Deduplicate PATH setup, cache npm prefix, fix write chunking |
| `src-tauri/src/filesystem/operations.rs` | 117 | Add path traversal validation, copy operation, trash support |
| `src-tauri/src/filesystem/reader.rs` | 173 | Add file size limit, encoding detection |
| `src-tauri/src/filesystem/watcher.rs` | 71 | Per-workspace watchers, add debouncing |
| `src-tauri/src/filesystem/git_status.rs` | 77 | Extract shared git command utility |
| `src-tauri/src/filesystem/git_diff_stats.rs` | 189 | Combine git commands, extract utility |
| `src-tauri/src/agent/executor.rs` | 223 | Fix SystemTime unwrap, add task timeout |
| `src-tauri/src/agent_cli/cli_launcher.rs` | 192 | Replace hardcoded sleep with shell readiness detection |
| `src-tauri/src/agent_cli/auth_detector.rs` | 349 | Fix dead code in check_opencode_auth |
| `src-tauri/src/utils/env.rs` | 324 | Cache environment to disk, batch Windows var queries |
| `src-tauri/src/utils/process.rs` | 374 | Deduplicate binary search, cache npm prefix |
| `src-tauri/src/ide/detector.rs` | 425 | Extract nested search_dir function, add thread safety |
| `src-tauri/src/ide/launcher.rs` | 304 | Fix double snap spawn, improve desktop file parsing |
| `src-tauri/src/types.rs` | 174 | Remove `#[allow(dead_code)]`, add Display impls |

---

## Implementation Order (Sprints)

### Sprint 1 — Security & Critical Fixes [1 week] [done]

- S1: Move Discord webhook URL to environment variable
- S2: Add path traversal validation to all filesystem commands
- S3: Add URL scheme validation to `open_url`
- E1-E6: Fix all uncaught error handling gaps
- C5: Remove debug `println!` statements
- C8: Fix `chrono_lite_timestamp()` month/day math

### Sprint 2 — Quick UX Wins & Accessibility [1 week] [done]

- U1: ✅ Tab/file tooltips on EditorTabs + WorkspaceTab
- U2: ✅ Settings button disabled with "coming soon" title
- U3: ✅ Context menu Copy uses window.getSelection()
- U4: ✅ alert() replaced with inline error banner in SetupScreen
- U5: ✅ Feedback modal timeout 1200ms → 2500ms
- U6: ✅ Terminal grid labels: CLUSTER_SIZE → Sessions, TOPOLOGY → Layout, removed U suffix
- U7: ✅ PrerequisitesPanel hardcoded grays replaced with theme variables
- A1: ✅ role="menu" + role="menuitem" on ContextMenu, ExplorerContextMenu, TabContextMenu
- A2: ✅ role="dialog" + aria-modal on FeedbackModal, NewTerminalDialog, ShortcutModal
- A3: ✅ role="switch" + aria-checked on AgentFleetConfig toggle, ThemeToggleButton
- A4: ✅ role="progressbar" + aria-valuenow/min/max on UtilizationBar
- A5: ✅ Tab semantics (role="tablist/tab", aria-selected, tabIndex, onKeyDown) on EditorTabs + WorkspaceTab
- A6: ✅ role="tree" on FileExplorer wrapper, role="treeitem" + aria-expanded on TreeNode
- A7: ✅ Ctrl+W (Close tab) added to SHORTCUTS list
- A8: ✅ aria-label="Search files" on FileExplorer search input
- C1: ✅ Replaced `any` with `CliLaunchState | null` and `AuthInfo | null` in appStore
- C2: ✅ Replaced `Date.now()` with `crypto.randomUUID()` for workspace IDs
- C3: ✅ Removed duplicate ALL_AGENTS constant, unified to VALID_AGENTS
- C4: ✅ SHORTCUTS constant already at module level (no change needed)
- C6: ✅ Replaced deprecated navigator.userAgent with userAgentData fallback
- C7: ✅ Replaced document.execCommand with direct input manipulation + dispatchEvent

### Sprint 3 — Performance & Architecture [2 weeks] [done]

- P1-P11: All performance optimizations
- R1: Split `commands/mod.rs` into sub-modules
- R2: Split `TerminalPane.tsx`
- R3: Split `SetupScreen.tsx`
- R4-R5: Deduplicate terminal output reader and PATH setup
- R6-R9: All deduplication refactors
- R10: Split appStore

### Sprint 4 — New Features (Core) [2 weeks]

- F1-F5: Editor enhancements (file size limit, quick-open, tab reorder, CSV)
- F6-F10: Explorer enhancements (Open in Terminal, duplicate, git stage/unstage)
- F11-F13: Terminal enhancements (agent descriptions, configurable shell, paste confirm)
- F14-F17: Setup enhancements (templates, auto-allocation, recent dirs, validation)
- FM3: Notification/toast system
- FM6: Logging framework

### Sprint 5 — Major Features & Reliability [2 weeks]

- FM1: Command palette
- FM2: Split view
- FM4: Per-workspace filesystem watchers
- FM5: Terminal health monitoring
- FM7: Configuration persistence
- FM8-FM16: All remaining major features
- RL1-RL8: All reliability improvements
