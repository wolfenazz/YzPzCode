# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YzPzCode is a Tauri v2 desktop application that provides a unified interface for multiple AI coding CLI tools and SaaS tool CLIs. It combines a React 19 frontend with a Rust backend to create a native, cross-platform development environment with an in-app browser, visual design inspector, AI-powered designer, and multi-workspace management, plus Writing, Presentation and Sheets studios.

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
- Prompt handoff to extensions: the browser inspector / UI references target picker lists extension panels (`extension:<panelId>` target ids) next to agent terminals. `utils/extensionPrompt.ts` → `send_extension_panel_prompt` → Rust `eval`s `window.__yzpzPanelPrompt` in the panel webview (`panel-chrome.js`) → posts to the assistant's webview frame → `extension_host/panel-prompt.js` (served with `webview-activity.js`) finds the chat box, inserts the text (paste / `insertText` / value setter) and submits it (Enter, then a "Send" button). Antigravity's chat is a cross-origin tunnelled page, so `panel-tunnel.cjs` injects the same script there and the webview forwards to it. The outcome returns via `/yzpz-panel/event` → stdout → `extension-panel-prompt-result` (`submitted` / `inserted` / failure). A panel not started since launch is revealed first and receives the prompt once ready; the outcome also shows on the panel header (`ExtensionPromptNotice`). Tested by the `extension_host/*.test.cjs` files (`node --test`)
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
  - **Quick prompt card**: picking an element shows a small card next to it (agent picker, one-line instruction, Send, "More controls"), not the side panel. The native webview is drawn above the DOM, so the card is injected by the bridge (closed shadow root in `BROWSER_INIT_SCRIPT`: `showInspectorWidget` / `hideInspectorWidget`) and tracks the element on scroll/resize. The app configures it with `set_browser_inspector_widget` (`BrowserPane` effect: token, targets, draft, send status); the page answers through the `browser_inspector_request` callback (`send` / `expand` / `dismiss` / `target`) → `browser-inspector-request` event → `handleInspectorRequest`. The page is untrusted: requests are ignored unless they carry the per-selection token, only `isTrusted` events act, and the bridge object is frozen. "More controls" opens `ElementInspectorPanel` (draft carried over); its header arrow returns to the card. A full page load drops a card-only selection
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
- Native child webview bounds (browser, extension panels) are DOM rects × `hooks/useNativeViewScale.ts` (`devicePixelRatio ÷ window scale factor`), never `appZoom / 100` alone: WebView2 also applies the Windows "Text size" setting to the main webview, so CSS px ≠ logical px even at 100% app zoom
- `browser/BrowserMenu.tsx`: popover primitive. The native webview is drawn above the DOM, so nothing may overlap the preview rect: open menus register through `NativeOverlayContext` and the pane hides the webview until they close
- `browser/browserModel.ts`: device presets (desktop/tablet/mobile/custom), `getViewportMetrics` (device emulation: webview drawn at `size × scale` and zoomed by `scale`, so the page lays out at the real device width), snapshot paths, prompt formatting. Tested with `utils/browserUrl.ts` by `npm run test:browser`
- `BrowserTabBar.tsx`, `StyleClipboardPanel.tsx`, `StylePreviewCard.tsx`, `UiReferenceClipboardPanel.tsx`, `UiReferenceCard.tsx`
- Start page sentinel URL `yzpz://newtab` never reaches the native webview; tabs, device, custom viewport and auto-reload are persisted per workspace

### Design studio
Workspace kind `'design'` (fourth studio mode on the setup page, `PenNib` icon; plan in `docs/design-studio-plan.md`). The old template-based `components/designer/` page was removed. Wired like the other studios (`workspaceView.ts`, `WorkspaceHeader` view "Canvas", keep-alive layer in `Workspace.tsx`, `DesignSetupSection`, `DesignMock` in `WorkspacePreview`, Settings → Design). No Rust of its own.
- **Storage:** `Documents/YzPzCode/Designs/<slug>/<slug>.yzdesign` (JSON) with `assets/`, `.previews/`, `.history/`, `exports/`; dropped files go to `Designs/.attachments`. State: `stores/designStore.ts` (persisted prefs, `yzpzcode-design`) and `stores/designSessionStore.ts` (open project, selection, viewport, whole-project undo/redo through `edit`).
- **Pure core `utils/design/`** (dependency-free, `npm run test:design`): `types.ts` (`DesignProject`: tokens + boards; app/web boards are sanitized HTML, graphic boards SVG), `formats.ts` (size presets, `resolveFormat` incl. custom `1200x628`), `project.ts` (`parseProject` repairs, `designPath`, `layoutBoards`, `contentBounds`), `tokensCss.ts` (`--ds-*` variables HTML screens draw from).
- **UI** (`components/design/`, `.dz-*` in `design-studio.css`, theme tokens only): `DesignComposer` (Stitch-style: one box, App / Web / Graphic switch, size, style, engine, recent projects), `DesignWorkspace` (home ↔ studio), `DesignCanvas` (pan/zoom dot grid, boards at x/y, design-system board), `useDesignDocument` (list/open/create/autosave/snapshot/delete).
- **Generation** (`components/design/useDesignGenerator.ts`, prompts in `utils/design/prompts.ts`): the studio opens at once, then pass 1 art direction (`buildDirectionPrompt` → `parseDirection`: tokens fitted to the canvas by `fitTypeScale`, one board per requested size for a graphic) and pass 2 one call per board (`buildBoardPrompt`, reply `<board name>…</board>` via `extractBoardBlocks`): the first alone as the look reference, then `PARALLEL_BOARDS` = 4 at a time. HTML boards stream (throttled) into a script-less sandboxed frame (`HtmlBoard.tsx`: `allow-same-origin` only, CSP meta, tokens as `--ds-*` variables, bundled fonts); SVG boards go through `sanitizeSvg` when their block closes. `photo:words` placeholders become real web photos in `<project>/assets/` (`fetchWebPictures`, credits in `attachments`). **HTML is untrusted:** `utils/design/htmlSafe.ts` `sanitizeHtml` is a dependency-free allowlist (tags, attributes, CSS `url()`), stamps `data-yz`, closes cut-off markup.
- **Changing a design** (`DesignPromptBar.tsx`, `DesignSidePanel.tsx`, `DesignCanvas.tsx`): the bar's scope is the picked element, the selected boards or all boards. `useDesignGenerator` `refine` / `addBoard` / `variations` first store `session.proposal.baseline` (the project before), draw into the project with `skipHistory`, then the bar offers Keep (`keepProposal`: baseline becomes one undo step) / Discard (`discardProposal`) / hold-for-before. Element picking (P) reads the board's frame (`contentDocument.elementFromPoint`, climbing to the nearest `data-yz`) and sends its `outerHtmlOf` markup with the instruction. Double-click edits a leaf text in the frame and writes it back by stamp (`setElementText`). The Design tab edits tokens: HTML boards follow the `--ds-*` variables, SVG boards are recoloured through `paletteColorMap`. Boards drag on the canvas (one undo step per drag).
- **Export** (`DesignExportDialog.tsx`, `exportBoards.ts`, pure parts in `utils/design/export.ts`): PNG/JPG at 1–3× (HTML boards rendered through an SVG `foreignObject`, assets inlined, bundled fonts embedded), PDF (one picture per page, named `@page` sizes, `export_writing_pdf`), code folder (`<name>.html` per screen, `tokens.css`, copied `assets/`, `DESIGN.md`), SVG, and hand-off to an agent terminal (`handoffPrompt` + `submitBracketedPaste`). Files go to `<project>/exports/<stamp>-<kind>/`.
- **Status:** phases 1–5 built. Text and pictures of a graphic are edited by clicking them on a selected board (`svgText.ts`), a picture of a screen is swapped by double-click (`setImageSrc`). Not built: drag-resize or free layout of elements, comments.
- **Round two** (`docs/design-studio-ux-plan.md`, phases 1–7 built): **Layers** tab + **element inspector** (`DesignLayers.tsx`, `DesignInspector.tsx`; string-level edits in `utils/design/domTree.ts` / `styleEdit.ts`, every value through `cleanCss`; colours bind to `var(--ds-*)` tokens). Canvas: marquee, snapping guides + align/distribute (`utils/design/snap.ts`), board menu, copy/paste/duplicate, minimap, `?` shortcut sheet, web boards resize by a width handle (page reflows, height follows content), device frames (`board.frame`, canvas-only), off-screen boards are not mounted. **Design system** (`DesignSystemPanel.tsx`, built from `components/studio/` parts): contrast checks + fix, palette ideas, dark palette (`tokens.darkPalette`, `board.theme`), type ratio, shape, shadows (`--ds-shadow-1..3`); `utils/design/color.ts` is the colour maths. **Kits** live in `Designs/.kits/*.yzkit.json` (`useDesignKits.ts`, `utils/design/kits.ts`: DESIGN.md / CSS / JSON / Tailwind out, DESIGN.md in, system from a picture via `generator.deriveSystem`). The composer's style menu offers kits, recent systems (`designStore.recentSystems`) and "Show three directions first" (`exploreDirections` → pass 1 returns `alternatives`, `DirectionCards` waits for a choice, run phase `choosing`). **Layout editor for graphics** (`GraphicStage.tsx`): double-click a graphic board (or right-click → Edit layout) and the presentation studio's `SlideStage` is drawn over it at screen size (move / resize with guides, marquee, type in place, add text, duplicate, delete); commits go through `sanitizeSvg`. **Also:** Shift-click picks more elements (`picked.also`; style edits reach all), the picked element shows its padding and margin, flow arrows start at the linked element, states share `board.group` (dashed frame), "Join in a row" (`rowRects`) and numbered file names for same-size series (`numberedNames`), **Restyle with AI** (`generator.restyle` → a proposal on `system`), kit **from a web page** (`deriveSystemFromUrl`, engine with web access). **Hybrid graphics:** a graphic board is `format: 'svg'` (free layout: layout editor, vector export) or `'html'` (text layout: a fixed-size HTML canvas, `HtmlBoard fixed`, `HTML_GRAPHIC_CONTRACT`; inspector, Layers and CSS tweaks apply, exports as PNG / PDF / code). The composer's Auto / Free / Text switch (`designStore.graphicMode`) picks it, Auto follows the template's `draw` hint (text-heavy ones: carousel, quote, infographic, certificate, menu, link preview); Board tab → "Draw again as…" converts one board (one undo step). **Far-away boards** are drawn as small cached JPEGs (`useBoardPreviews.ts`, keys in `utils/design/previewCache.ts`) outside the view and while zoomed far out. **Graphic tweaks** use attributes instead of CSS (`utils/design/svgTweaks.ts`: `data-tw-show` toggle, `data-tw-when="id=a|b"` select, `data-tw-opacity` range; applied when drawn and exported, the layout editor shows every variant). **Graphic format bar** (`utils/design/textFormat.ts`): font, size, bold, italic, colour for drawn `<text>` (by document index) and the editor's own text boxes (+ alignment). **Tweaks** (`utils/design/tweaks.ts`, `TweaksPanel.tsx`): the AI may end an HTML board with `<tweaks>[…]</tweaks>` (≤ 6 select / range / toggle controls); the CSS reads `[data-tw-<id>=…]` and `var(--tw-<id>)` / `--tw-<id>-n` from the frame root, `HtmlBoard` writes values into the open frame live (no reload), exports bake them in (`rootAttributes`). **Prototype** (`utils/design/flow.ts`, `DesignPreview.tsx`): `data-goto="<board name>"` on an element (sanitizer keeps it as text; inspector "Links to"); F5 / Preview opens a portal slideshow where links navigate (`resolveGoto` prefers the same-size copy), canvas flow arrows (`boardLinks`), responsive copies (`addVersion`: reflow copy, or AI via `addBoard({ placement: 'below' })`) and app screen states (`SCREEN_STATES`). **Templates** (`utils/design/templates.ts`: 34 starting points with boards, optional details and Arabic copy; `promptLibrary.ts`: worked example briefs; `TemplateGallery.tsx` under the composer): choosing one sets its sizes locally (`sizesOverride`, not the remembered sizes) and sends `composeExtra` (planned boards + filled details) beside the user's words; a carousel is a `series` (repeated sizes, boards matched by position in `parseDirection`). Email is a web template on the `email` preset (600 wide); its export (`exportEmail`, `utils/design/inlineCss.ts`) inlines simple-selector rules and writes `--ds-*` values out.

### Agent Task Execution
**Backend** (`src-tauri/src/agent/`):
- `executor.rs`: `AgentExecutor` — takes natural language tasks, generates shell commands via AI CLI, executes with retry (up to 3 attempts)
- `mod.rs`: `AgentTask` types, `AgentTaskStatus` (Pending/Running/Completed/Failed/Cancelled), `COMMAND_GENERATION_PROMPT`
- Real-time task update events via IPC

### Studio chrome (Writing, Presentation and Sheets)
The top bar and the side panels of all three studios are built from one module, `components/studio/` (`studio.css`, `.sx-*` classes, app theme tokens only; the tokens are also defined on `.wr-root` / `.pr-root`). `StudioTopBar.tsx` is the 52px bar (back to the home list, title input with a meta line "kind · saved state", a `run` slot with progress and Stop, actions at the right); `Inspector.tsx` has the panel parts: `Inspector` + `InspectorTabs` (44px, ink underline, arrow-key navigation) + `InspectorBody`, `Section` (optionally collapsible), `Field` / `Select` / `ColorInput` / `Toggle` / `Slider` / `Segmented`, `PromptBox`, `Target`, `ActionList`, `Facts`. Build panels from these, not per-panel card styling. Labels are sentence case; the old small-caps `.pr-label` style is gone. Writing: `WritingWorkspace` (top bar, Outline on the left as `Inspector side="left"`, Assistant / Design / References tabs on the right). Presentation: `DesignedEditor` (top bar, filmstrip, Format / AI / Design tabs); classic decks keep `.pr-toolbar` and `.pr-side__tabs`, restyled to match. Sheets: `SheetsWorkspace` (top bar, Assistant / Format / Data tabs on the right).
- A workspace's reopening view comes from `utils/workspaceView.ts` (`resolveWorkspaceView`, tested by `npm run test:workspace-view`): a studio opens in its own view, and a saved `terminal` there is ignored until a terminal session exists. `App.tsx` `restoreWorkspace` only forces the terminal grid for coding workspaces.

### Studio storage (Writing, Presentation and Sheets)
The three studios have no folder picker. All three save into one app-chosen folder, `Documents/YzPzCode` (Rust `get_studio_root` in `filesystem_commands.rs`: the OS Documents dir, home as fallback, created on first use; frontend `utils/studioRoot.ts` `getStudioRoot`, cached with `forgetStudioRoot()` for revalidation, `hooks/useStudioRoot.ts` for the form with retry). It lives outside the app's install and data directories on purpose: after an uninstall and reinstall a new studio workspace points at the same folder and its home list finds every report (`Reports/`), deck (`Presentations/`) and workbook (`Sheets/`) again. A studio workspace's `path` is that folder; several studio workspaces share it (everything is keyed by workspace id, the file watcher follows the active one). `useWorkspace` keeps a separate `studioName` (empty → `studioDefaultName(kind)`, "Writing studio" / "Presentation studio" / "Sheets studio"), `isValid` is always true for a studio, and studios are not added to `recentDirectories`. The setup form shows `StudioLocation.tsx` ("Saved in", with Show in folder and Retry) instead of `DirectorySelector`, and the launch button stays disabled until the studio folder resolves; Ctrl/⌘+O does nothing there. Workspaces made earlier keep whatever folder they were created with. Tested by `npm run test:workspace-setup`.

### Right-to-left languages and fonts (Writing and Presentation)
Arabic, Hebrew, Persian and Urdu are first-class in both studios; everything shared lives in `utils/writing/` (dependency-free, tested by `npm run test:writing` and `test:presentation`).
- **`rtl.ts`**: `hasRtl`, `paragraphDirection` (first strong letter, majority fallback), `isRtlLanguage`, `languageTag` (name / native name / tag → `ar-SA`…), `languageFor` (a description in Arabic is answered in Arabic while the language is still English), `wordsOf` / `countWordsIn` (Latin `\w` finds no Arabic word), `foldArabic` / `foldLetters` / `westernDigits`, `complexScriptFace` (the Arabic-capable face of a Latin-only one). Characters are built from code points, so the source stays ASCII. `labels.ts`: the words a report prints (Chapter, Table, Figure, Contents, Prepared by…) in English, Arabic, Hebrew and Persian, and `isFrontBackTitle` / `isReferencesTitle` for Arabic and Hebrew section titles.
- **Slide SVG**: `svgSafe.sanitizeSvg` allows `direction` / `unicode-bidi` and runs `rtlSvg.ts` `normalizeRtlText`: a `<text>` whose first strong letter is right-to-left gets `direction="rtl"` and its `text-anchor` flipped (in SVG, under rtl, `start` is the RIGHT edge — what the model drew as "end" at the right margin stays there), `data-bidi="auto"` marks what was added so `svgText.setSvgText` takes it back out when the text becomes English; letter-spacing and slant are removed from Arabic text. A `direction` the model wrote itself is left alone. `designPrompts.rtlRules` tells the AI to mirror layouts and how anchors work; the art-direction prompt lists only faces that draw Arabic and `forLanguage` swaps Latin-only faces the AI picked.
- **Slide model**: `TxPara.rtl` (unset = first strong letter; PowerPoint import sets it explicitly, so Arabic in a paragraph without `rtl` stays left to right as PowerPoint draws it), `paraRtl` / `paraAlign`; `ml`/`ind`/bullets are measured from the start edge (right for rtl), `textSvg` writes `direction` and physical anchors; FormatBar has left-to-right / right-to-left buttons that swap left and right alignment like PowerPoint.
- **PowerPoint**: runs with Arabic get `lang` (`ar-SA`), the complex-script face in `<a:cs>`, no `spc`; paragraphs get `rtl="1"` and a physical `algn`. Import reads `rtl`, the theme's Arab script font and falls back to `complexScriptFace`. Classic decks: `render.ts` uses `text-align: start` + `unicode-bidi: plaintext`, `pptxExport` `rtlMode`.
- **Reports**: the editor's `TextDirection` extension (`editor/textDirection.ts`) writes each block's resolved `dir` (author's `attrs.dir`, else first strong letter, lists/quotes/tables from what they hold) and the editor CSS uses logical properties; `PagedEditor` takes `language` (spell-check `lang`, base direction, printed labels via CSS variables). `printHtml` mirrors page boxes, writes `dir` only where a block differs from the document and uses the labels; `docxExport` writes `w:bidi`, `w:rtl`, `w:cs` / `w:szCs` / `w:bCs`, `w:lang bidi`, `bidiVisual` tables and START/END alignment (Word reads left/right as leading/trailing in a bidi paragraph). Prompts: `rtlWritingRules` (Modern Standard Arabic, ، ؛ ؟ « », Western digits, Latin terms in parentheses, nothing reversed), `buildStyleRules(…, language)` drops the English-only rules and adds Arabic stock phrases / connectors; the lint counts words in any script, splits on ؟ and flags Arabic AI tells. Citations: Arabic names (و / ؛ separators, full given names, "وآخرون", "د.ت"), Unicode citation keys.
- **Fonts**: one catalog, `fontCatalog.ts` (`FONT_CATALOG`: ~150 faces, each `kind`, `arabic`, `source` windows | office | bundled). `designStyles.DESIGN_FONTS` and `stylePresets.DOCUMENT_FONTS` are derived from it; pickers use `components/studio/FontOptions.tsx` (grouped, Arabic first). Bundled faces are `@fontsource/*` woff2 files (Latin + Arabic subsets, 400 and 700) listed in the generated `utils/bundledFontFiles.ts` (`node scripts/gen-font-files.mjs` after changing the catalog) and registered on demand by `utils/bundledFonts.ts` (`ensureFonts` / `registerBundledFont`). Exports that cannot reach the app's fonts (PDF print view, PNG through an SVG image, standalone HTML) embed them with `bundledFontFaceCss`; a .pptx / .docx only names them, so the export dialog says which faces the opening machine needs installed (`needsInstalling`).

### Writing studio
Workspace kind `'writing'`: reports in `<workspace>/Reports/<slug>/<slug>.yzdoc` (JSON, `utils/writing/document.ts`) with `assets/`, `.history/` and `exports/`. UI in `components/writing/` (`.wr-*` classes in `writing.css`, theme tokens only: hairlines, one ink colour for primary actions, the accent only for focus); pure modules in `utils/writing/` (tested by `npm run test:writing`). The AI runs through the headless runner (`aiClient.ts` → `start_writing_ai_run`).
- **Creating:** `WritingHome.tsx` (recent documents, then the 30 kinds from `reportTypes.ts` by category) → `ReportComposer.tsx`, one composer per kind: a description box asking that kind's question (`composerCopy`), attached/dropped/pasted material (`Reports/.attachments`), references, the kind's own fields as optional details, and length / language / profile / web photos / engine behind one toggle. **Write** runs the outline pass (`buildOutlinePrompt`, which also titles an untitled report → `parseOutlineTitle`), creates the file and streams every section (`useReportGenerator.generateSections`). There is no wizard; `wizard/CommissionWizard.tsx` survives only as the profile editor in Settings → Writing.
- **Studio** (`WritingWorkspace.tsx`): top bar (Documents ← title · save state · Assistant / Design / References · Export), one-row `StudioToolbar.tsx` (styles, font, size, marks, colour, alignment, lists, link, Insert menu incl. citations, contextual Table menu; menus are `ui.tsx` `Dropdown`, which never takes focus from the editor), `OutlinePanel.tsx` (headings, live section status, write a section again), the paged TipTap editor (`editor/PagedEditor.tsx`) and the side panel: `AssistantPanel.tsx` (write remaining sections, edit the selection or the section at the cursor with quick actions or an instruction → `ReviewCard` accept/discard, humanize / write all again with confirm, naturalness lint, voice and humanizer, writer engine), `DesignPanel.tsx` (**Restyle with AI** → `styleAi.ts` `buildRestylePrompt` / `parseRestyle`: Office-safe fonts only, clamped sizes, colours readable on white, one-click Undo; six templates; text, colour, page and structure controls; the cover page node follows `style.cover`), `ReferencesPanel.tsx` (citation style, bibliography, material files).
- **Streaming into the page:** `replaceSectionBody` replaces only from the first changed block (`utils/writing/pageFlow.ts` `commonPrefixLength`), flushed on a frame. `PageFlow` page-break padding is a node decoration (plugin state), written to the DOM during measuring only with ProseMirror's DOM observer paused: a bare style write is a foreign edit to ProseMirror, which redraws the node without it, so the page count swung (50 ↔ 56) for ever and dragged the view. Padding is left alone for headings past the last page (`spaceToPageEnd` returns null). Loading a report puts the cursor at the start (`setContent` leaves it at the end). `editor/scrollKeeper.ts` holds the reader's place during AI writes (own anchor, browser scroll anchoring off; only wheel/pointer/in-page keys move the anchor), so the view is never pulled to the section being written.
- **Web photos** (reports and AI-designed decks): real, openly licensed photos, never AI images. The service is Settings → Presentation → Images (`presentationStore.stockProvider`; Openverse needs no key, Unsplash/Pexels fall back to Openverse without one). `utils/webPictures.ts` searches and downloads (`stock_image_search` / `stock_image_download`); `utils/writing/pictures.ts` picks the result (printable size, orientation, search order; `MAX_WEB_PHOTOS` = 6). Reports: with `brief.pictures !== 'none'` the section and rewrite prompts allow `[Photo: search words | Caption]`; `markdown.ts` turns it into a figure with `query`, and `fillPictures` (after each section, accepted rewrite and on open) downloads into `assets/` and sets `src` + `credit` (shown under the figure and in PDF/Word). Pictures survive rewrites as `![caption](assets/… "credit")`.

### Presentation studio
The setup page's mode switch (`WorkspaceConfigForm.tsx`, `RubberSegment`) has a third mode, **Presentation** (`WorkspaceKind`/`WorkspaceView` `'presentation'`). It is built like the Writing studio: no terminals/extensions/IDEs (`useWorkspace` `studio` flag), a keep-alive layer per workspace in `Workspace.tsx` (Ctrl+E toggles Slides ↔ Files), header views Slides / Files / Research (+ Terminal once a session exists), and the same headless AI runner (`utils/writing/aiClient.ts` → `start_writing_ai_run`). No Rust of its own.
- **New decks are AI-designed (ppt-master method, github.com/hugohe3/ppt-master, MIT, ported to TS; no Python).** The home is `DesignComposer.tsx` (styled like the Writing home: hairlines, ink primary button, `.pd-home`/`.pd-composer`/`.pd-chip`/`.pd-deck` in `design.css`; recent decks show their cover slide from `DeckListing.cover` and can be deleted in place, which moves the deck folder to the workspace trash): one description box, files picked/dropped/pasted (pictures: "AI decides" / "On slides" / "Inspiration"; dropped files land in `Presentations/.attachments` until the deck exists), slide count / shape / language / engine behind one toggle. `useDesignGenerator.ts` runs two passes through the headless runner: art direction (`designPrompts.ts` `buildDirectionPrompt` → `parseDirection`: an invented `DesignSystem` — palette roles, Office-safe font pair, type scale, style from the 18 catalog styles in `designStyles.ts` or a blend, motif — plus a storyline with full per-page briefs), then slides as SVG (`buildSlidesPrompt`: `svgContract` + `DESIGN_CRAFT`; the cover is drawn alone first and passed as the identity reference, the rest go 1 page per call, 5 calls at once (a page takes 2–4 min whatever the batch); `<slide n role title>…<notes>` blocks stream in via `extractSlideBlocks`). The deck is stored in the same `.yzdeck` file as `deck.design` (`designTypes.ts`); `PresentationWorkspace` opens it in `DesignedEditor.tsx` (`.pd-*` classes in `design.css`): ask the AI to change a slide (quick actions `REFINE_ACTIONS`; every change is a proposal with Keep / Discard / hold-for-before), edit the slide brief and Draw again, edit text and swap pictures in place (`svgText.ts`), add a slide by describing it, Redesign the whole deck (new system, same pages, one Undo restores). Pictures go to Claude Code (stream-json stdin) and Codex (`--image`) as images (`images` on `start_writing_ai_run`, `stage_images` in `ai_runner.rs`); every engine also gets each picture's size and dominant colours (`designColors.ts`).
- **Pictures reach the slides only through `assets/`.** The sanitiser allows no other href, so a picture must be copied into the deck and listed in `design.attachments`. Folder and file paths written in the description (`@C:\…`, `/home/…`, `@relative/path`) are found by `designPictures.ts` `findMentionedPaths` and attached like the composer's **Add folder** (`scanFolderPictures`: 3 levels, one file per name, frame sequences reduced to their first frame, `MAX_DECK_PICTURES` = 40). Engines that see (Claude, Codex; the runner attaches at most 6 images) get each picture as a small JPEG, or numbered contact sheets when there are more (`designAssets.ts` `picturesToShow` / `writeContactSheets`). Art direction returns `pictures` per page and `pictureNotes` (stored as `attachment.caption`); each drawing call lists the page's pictures as "place every one" and attaches their `.previews/` copies. Existing decks: Design tab → Pictures (add pictures or a folder, **Put pictures on the slides** = `placePictures`: a picture-plan pass, then only those pages are redrawn, one Undo) and the per-slide picker on "This slide". With web photos on, art direction may give a page a `photo` (search words, `WEB_PHOTO_RULES`); `createDesigned` fetches them into `assets/` as `use: 'slides'` attachments with a `credit`, which each drawing call prints small beside the picture.
- **Slide SVG is untrusted.** `svgSafe.ts` `sanitizeSvg` repairs (HTML entities, bare `&`, cut-off markup via `tagsBalanced`) and allowlists elements, attributes, style properties and hrefs (`#id`, inline images, relative `assets/…` only); it runs when a slide arrives and again when a deck file is parsed. `prepareSvgForDisplay` scopes ids per rendered copy and resolves `assets/` through `localFileUrl`; `SvgSlide.tsx` draws it inline.
- **Designed exports** (`DesignedExportDialog.tsx`): editable PowerPoint via `svgPptx.ts` `convertSvgSlide` (SVG → DrawingML: preset/custom geometry with arcs as Béziers, gradients in slide space, shadow/glow, markers, pictures with crop and round clips, text frames placed with ppt-master's first-baseline model, top-level `<g>` → groups, full-canvas first rect → `p:bg`) assembled in `svgDeckExport.ts` (pptxgenjs package + JSZip injection, deck palette in the theme, hidden slides `show="0"`); "exact look" PowerPoint (one PNG per slide); PDF, PNG and HTML from self-contained SVG (`designAssets.ts`). `PresenterMode` takes a `renderSlide` prop and serves both deck kinds.
- **Classic decks** (made before AI design) keep the layout/theme engine below; the wizard and theme-gallery home are gone, the theme editor and templates remain for them.
- **The AI returns JSON, never drawings (classic decks).** `utils/presentation/prompts.ts` asks for a storyline (`buildOutlinePrompt`) then slides in batches (`buildSlidesPrompt`, flat per-layout fields); `sanitize.ts` coerces them to the 15 layouts in `layouts.ts` (unknown layout → nearest, missing content downgrades the layout, text clamped to slot budgets, bullet overflow continues on a new slide). Streaming replies fill placeholder slides as each object completes (`extractSlideObjects`).
- **One geometry source.** `layouts.ts` defines slot rectangles in inches on a 13.333×7.5 in slide (4:3 scales x). `render.ts` `planSlide` turns a slide + theme into positioned elements (text in pt, shapes, images, charts, tables, icons); `SlideRenderer.tsx` (canvas, thumbnails, wizard, review), `printHtml.ts` (PDF via `export_writing_pdf`, `@page` = slide size) and `pptxExport.ts` (pptxgenjs: native text, bullets, charts, tables, notes; gradients and icons rasterised to PNG in `assets.ts`) all draw from it. Charts in HTML are inline SVG (`chartSvg.ts`).
- Themes (`themes.ts`, 12 presets) use only Office-safe fonts; `fontStack` uses single quotes because stacks go into inline style attributes.
- Files: `<workspace>/Presentations/<slug>/<slug>.yzdeck` (JSON, `deck.ts` `parseDeck` repairs it) with `assets/`, `.history/` and `exports/`. State: `stores/presentationStore.ts` (persisted prefs, `yzpzcode-presentation`) and `stores/presentationSessionStore.ts` (open deck, selection, whole-deck undo/redo via `edit`, run trace, overflow warnings).
- UI in `components/presentation/` (`.pr-*` classes in `presentation.css`, theme tokens only): `PresentationWorkspace.tsx` orchestrates; for classic decks `Filmstrip`, `SlideCanvas` + `RichTextEditor` (contentEditable, bold/italic/colour only), `SlotInspector` (image/chart/table/stats/steps), `DeckToolbar`, `DeckAiPanel`, `SlideReviewCard` (Accept with undo window), `ExportDialog`, `ImportDialog`. Design check: filmstrip thumbnails measure text slots; overflow steps `slide.fit[slot]` down to 0.7, then warns with "Fix with AI" (Shorten).
- **Existing .pptx** (`ImportDialog`, or "Open in Presentation studio" on `.pptx` previews) opens as a designed deck, one slide per slide, drawn as PowerPoint draws it. `pptxRender.ts` `importPptx` resolves theme colours (all modifiers, the colour map and overrides), master → layout → slide placeholders, the text-style chain (`defaultTextStyle` / master `titleStyle`·`bodyStyle`·`otherStyle` → placeholder list styles → `p:style` fontRef → shape `lstStyle` → paragraph `pPr` incl. its `defRPr` → run), `p:style` fill/line/effect references, backgrounds, master/layout artwork (`<g data-layer="master">`, not selectable), groups, connectors, tables with table styles, charts (static SVG `data-kind="chart"`), SmartArt drawings and `mc:AlternateContent` fallbacks; pictures are copied into `assets/` (EMF/WMF show as empty frames). Single line spacing is 1.2 × the size for every face and stored autofit scales are kept (re-shrunk only on clear overflow) — both measured against PowerPoint's own renders. Office cloud fonts (Aptos, Merriweather…) are registered from `%LOCALAPPDATA%\Microsoft\FontCache\4\CloudFonts` by `deckFonts.ts` `ensureFonts` before measuring. The deck keeps `design.origin` (file + original system); stored systems keep their fonts and colours (`sanitizeDesignSystem(…, { stored: true })`). Old *Keep original design* decks (`deck.source`, `PreserveEditor.tsx`, `pptxPreserve.ts`) still open, with **Open in the slide editor**; `pptxToDeck.ts` (layout mapping) is no longer offered. `pptxPackage.ts` uses the global `DOMParser` (tests install `@xmldom/xmldom`).
- **The slide model** (`slideModel.ts`, geometry in `slideGeometry.ts`): shapes, text boxes, pictures, tables and groups with PowerPoint's text model (paragraphs, runs, bullets/numbering, spacing, insets, anchoring, autofit). Each element renders to `<g data-el data-kind data-m="{model}">` in slide px; `layoutText` wraps with a measurer (`deckFonts.ts` `measureSlideText` in the app, `estimateMeasure` in tests). `svgForAi` strips model data before slides go into prompts. On export, `svgPptx.ts` writes any element with a model through `modelPptx.ts` `elementXml` (native text boxes, `srcRect` crops, tables with merges, groups), so an imported deck exports back to PowerPoint unchanged.
- **Editing slides** (`DesignedEditor.tsx`, every designed deck): `SlideStage.tsx` is the canvas (click / Shift+click / marquee select, drag with snapping guides, 8 resize handles, double-click to type in place via `textEditing.ts` contentEditable ↔ body, double-click a picture to replace it, right-click menu). AI-drawn artwork is wrapped on first change into an art element (`slideEdit.ts` `adoptNode`: `data-box` / `data-box0` + transform). `FormatBar.tsx` (`.pf-*`) inserts text boxes, pictures and shapes and formats text (font, size, B/I/U/S, colour, alignment, lists, spacing — the selection while typing, the whole element otherwise), fill, outline, arrange/align, duplicate, delete. The side panel has Format (position/size, text box options, picture, slide background, element list), AI (unchanged review flow) and Design (Colours = `paletteColorMap` + `applyThemeMap` with `fixTextContrast`; Fonts; Redesign with AI), plus **Animate** (below). The deck's AI engine and model are chosen at the bottom of the AI tab. Keys: Del, arrows (Shift ×10), Ctrl+D/C/X/V/A, Enter/F2 to type, Esc. Edits that overflow a no-wrap box wrap; text that newly overflows its box shrinks to fit. Styles: `.ps-*` / `.pf-*` / `.pi-*` in `design.css`.
- **Presenting and sharing:** `PresenterMode.tsx` (F5, Shift+F5 from the current slide) is a portal slideshow that puts the window in fullscreen (`core:window:allow-set-fullscreen`), skips hidden slides and plays the deck's `transition` (fade/slide/none); S toggles the presenter view (current + next slide, notes, elapsed timer and pace against `timing.ts` estimates), B/W blank the screen, digits + Enter jump. Exports add PNG per slide (`rasterize.ts`: slide HTML in an SVG `foreignObject` drawn to a canvas, so every image is inlined first) and a standalone HTML slideshow (`htmlDeck.ts`).
- **Element animation** (designed decks, `slideAnimation.ts`, tested by `npm run test:presentation`): modelled like PowerPoint's animation pane. A slide has an ordered list `DesignedSlide.animations` of `ElementAnimation`s (class entrance / emphasis / exit, effect appear · fade · fly · float · zoom · wipe · grow/shrink · spin · pulse, side or motion direction, start on click / with previous / after previous, duration, delay, optional paragraph-by-paragraph build for modelled text). Unset = the automatic plan (`animationPlan`: backdrop and title by themselves, one click per block, at most `MAX_CLICKS` = 6); `[]` = none; an authored list none of whose elements are left (the slide was redrawn) falls back to automatic. `slidePlan(svg, list)` makes the one `AnimPlan` both consumers use. Targets are a top-level element's `data-el` id, or a `data-ani` stamp put on drawn artwork by `ensureTarget` (survives being wrapped into an art element); model text paragraphs carry `data-para`. **Slideshow:** `PresenterMode` (`stepsOf` + `renderSlide(slide, width, revealed)`) plays a click per →/click/Space and takes it back per ←, returning to a slide shows it as it ended; `SvgSlide` `build` wraps each animation in `<g data-step data-cls data-fx data-dir data-state=pre|post>` (`tagAnimation`, one wrapper per animation, no transform of its own) and flips `data-state` as steps are reached (CSS in `design.css`: entrance is away while `pre`, exit is away once `post`, emphasis plays once `post`; wipe is a `clip-path`). **Editor:** side tab **Animate** (`AnimationPanel.tsx`): effect gallery per class applied to the stage selection, the numbered order list (rows select their element; **Customize** turns the automatic plan into an editable list, **Reset to automatic**, **Remove all**), the options of one animation (effect, side/direction, start, duration, delay, by paragraph), **Preview** on the stage, number badges on the slide (`AnimationBadges`), and the deck switch (`deck.animations`, `animationsOn`). **AI-designed motion:** the AI writes each page's animation with its drawing. `ANIMATION_CRAFT` (designPrompts.ts) is added to the drawing prompts when `animationsOn(deck)`; the reply carries an `<animation>` JSON array beside the SVG and the notes (`SlideBlock.animation`, `parseAnimationBlock`), naming elements by `id` (or by their number in the `elementsForAi` list); `animationsFromAi` resolves them to top-level elements (stamping `data-ani`), clamps them through `sanitizeAnimations` and caps clicks at `MAX_CLICKS`. The result is stored as the slide's authored list (`SlideProposal.animations`: new decks, Draw again, Redesign, a redraw from the AI tab, a new slide). A redraw is given the slide's current list (`animationsForAi`) to keep or revise; a slide set to none (`[]`) or a deck with animation off is not asked, and a reply without a usable block leaves the slide on the automatic plan. **Animate** (`generator.animate`, `buildAnimatePrompt`) designs motion for drawn pages without redrawing them: one call per slide, written in one edit (one Undo), slides edited meanwhile are skipped, and it switches the deck's animation on; it is the AI tab's **Animate** button (this slide / several / whole deck, the instruction box steers it) and the Animate tab's **Design with AI**. The home's options have an **Animation** row (AI designs it / None → `deck.animations = false`). **PowerPoint:** `timingXml(plan, targets, shapes)` writes the click groups as PowerPoint does (outer par per click, inner par per "after previous" group, `presetID`/`presetClass`/`presetSubtype`, `grpId` + `<p:bldLst>` `bldP` for shapes with a text body, `build="p"` + `<p:txEl><p:pRg>` for paragraph builds, exit effects ending in a `style.visibility` hidden set) plus the deck's `<p:transition>`; `svgDeckExport` passes each slide's list. **Import:** `pptxRender` records PowerPoint shape id → element id while reading and `animationsFromTiming` turns the slide's `<p:timing>` main sequence into the same list (unknown presets become the nearest effect with a warning); an imported slide always gets a list (`[]` when it had none), and `animationsOn` is true for an imported deck once any slide has animations. The "exact look" PowerPoint and the HTML/PDF exports carry none.
- **Web photos after creation:** the AI panel's request "a picture from the internet…" (`wantsWebPhoto`, English and Arabic) or the **Web photo** chip first asks the AI for English search words (`buildPhotoQueryPrompt`), downloads the photo into `assets/` (`fetchWebPicture` tries each query, then shorter forms), lists it as a deck picture with its credit and redraws the slide around it; the selected elements (`SelectedElement`, `buildRefinePrompt`) tell the AI where "here" is, so the picture takes the selected element's frame. A failed search is reported, never replaced by a drawn illustration. Design tab → Deck pictures → **Add photos from the web** (`addWebPhotos`: `buildPhotoPlanPrompt` → fetch → redraw only those pages, one Undo). A description that asks for internet pictures makes art direction plan photos for the cover and a third of the pages (`photosRequested`).
- **Several slides at once:** the strip is `DesignedFilmstrip.tsx` (header with a **Select** mode, a checkbox on every thumbnail, a pick bar with **Edit N with AI**, and a docked footer with **Blank** / **With AI**; Ctrl/⌘-click toggles, Shift-click picks a range via `slideSelection.ts` `pickSlide`: the last id is the slide on the stage; `session.selectedIds`). The AI tab is `DesignedAiPanel.tsx`: an **Apply to** switch (This slide / Several / Whole deck), the instruction box (elements picked on the stage ride along as target chips, **Web photo** chip, Enter sends) and quick-action tiles incl. **Redesign** (`redesignInstruction`). One slide is reviewed on the stage; several run through `useDesignGenerator.refineMany` (`REFINE_PARALLEL` = 4 under one run, thumbnails show progress) and are reviewed together as a `Batch` in `BatchReview.tsx` (before/after per slide, keep or skip each, Try again for failures). **Keep** writes every kept slide in one edit (one Undo) and leaves slides edited by hand meanwhile as they are (`baseSvg`). Delete / Duplicate / Hide and Del / Ctrl+D act on all picked slides (`commandMany`). Drawn artwork is wrapped into an art element by measuring where it sits, so `SlideStage` removes the live drag transform before `adopt` (measured with it on, the stored box counts the move twice). Side-panel sections (`.pd-section`, `.ps-*`, `.pd-system`) and the AI tab (`.pd-ai`, `.pd-scope`, `.pd-compose`, `.pd-quick`) are styled at the end of `design.css`.
- **Deck passes** in the AI panel (`DECK_PASSES`): Make consistent, Coach the notes (target minutes → words per slide via `notesBudget`), and Image prompts (fills `image.prompt`; `imagePrompt.ts` drafts one locally too). AI rewrites go through the AI-facing slide form, which has no image `src`, so `sanitize.ts` `carryImages` puts pictures back.
- **Themes and templates:** `ThemeEditor.tsx` (palette, fonts, sizes, decoration, title fill, WCAG checks; unreadable titles block saving) saves to `presentationStore.customThemes` (`findTheme` resolves preset or custom ids); `templates.ts` saves a deck as a `DeckTemplate` (pictures stripped) and reads/writes theme and template JSON files. Templates are saved from classic decks (Settings → Presentation → Classic themes); new decks no longer start from them. Settings → Presentation has Themes & templates and Images tabs.
- **Stock photos:** `StockImagePicker.tsx` → Rust `stock_image_search` / `stock_image_download` (`commands/presentation_commands.rs`, reqwest; Openverse needs no key, Unsplash/Pexels use the user's key from Settings). The photo lands in `assets/` with `image.credit`, which is drawn on the picture and added to the speaker notes.
- Tested by `npm run test:presentation` (`scripts/presentation.test.mjs`, incl. the sanitiser, text edits, prompt parsing, the SVG → PPTX converter, PowerPoint import, text layout, geometry, element editing, theme recolouring and model export) and the `presentation_commands` Rust tests.

### Sheets studio
Workspace kind `'sheets'` (third studio mode on the setup page, `Table` icon): AI-assisted Excel workbooks. The workbook **is** a real `.xlsx`: it opens directly in Excel, and any `.xlsx` (or `.csv`/`.tsv`; `.xls`/`.ods` are converted through SheetJS) is edited in place. It is wired exactly like the other studios (`workspaceView.ts`, `WorkspaceHeader` view label "Sheets", keep-alive layer in `Workspace.tsx`, `SheetsSetupSection`, `SheetMock` in `WorkspacePreview`, Settings → Sheets, `OpenInSheetsButton` beside the Excel button in `SpreadsheetEditor`). No Rust of its own: it reuses `start_writing_ai_run` (via `utils/writing/aiClient.ts`), `read_file_as_base64`, `write_file_bytes`, `export_writing_pdf` and the file commands.
- **Storage:** `Documents/YzPzCode/Sheets/<slug>/<slug>.xlsx`, beside a hidden `.yzsheet/` (`chat.json`, `meta.json` with the home preview, `history/` snapshots every 5 min). An external file keeps its sidecar in `Sheets/.external/<slug>-<hash>/.yzsheet`; "Save a copy" brings it into the folder. State: `stores/sheetsStore.ts` (persisted prefs, `yzpzcode-sheets`) and `stores/sheetsSessionStore.ts` (workbook, selection, undo/redo as whole-workbook snapshots that share unchanged sheets, proposal, run, chat).
- **Pure core `utils/sheets/`** (dependency-free, `npm run test:sheets` → `scripts/sheets.test.mjs`, which transpiles the folder into `node_modules/.cache`): `types.ts` (sparse cells keyed by A1, one deduplicated style table, per-sheet layout), `address.ts`, `dates.ts` (1900 serials with the leap bug), `numberFormat.ts` (Excel format codes, `parseInput` picks formats like typing in Excel), `formula/` (own engine: `tokenize` → `parse` → `evaluate`, ~250 functions in `functions/`, `recalc.ts` evaluates every formula once with a memo, dependencies first, a depth guard that defers deep chains, dynamic-array spill with `#SPILL!`, LET/LAMBDA/MAP…; `refs.ts` rewrites references on insert/delete/copy/move/rename at token level), `fillSeries.ts` (numbers, dates, English and Arabic month/day names, text+number), `ops.ts` + `opTypes.ts` (**one edit-operation set for the grid, the ribbon and the AI**: `applyOps(wb, ops) → { wb, inverse, changed, warnings }`; `validateOp` clamps untrusted JSON), `cfEngine.ts` (conditional formats), `validation.ts`, `charts.ts` (model, resolve data from cells, SVG render), `pivot.ts`, `csv.ts`, `clipboard.ts`, `find.ts`, `printHtml.ts` (PDF/HTML export), `display.ts` (shown text and alignment; numbers align to the trailing edge, Arabic text right), `gridModel.ts` (virtualised `Axis` with sparse overrides, merges, Ctrl+arrow, regions), `ai/` (`context.ts` workbook summary within a budget, `prompts.ts`, `parse.ts` for `<reply>`/`<ops>`/`<read>`).
- **xlsx:** `xlsxRead.ts` / `xlsxWrite.ts` (JSZip + the global `DOMParser`, tests install `@xmldom/xmldom`), `xlsxStyles.ts` (theme colours with tint, `cellXfs` → style table, dxfs), `xlsxCharts.ts` (native DrawingML charts), `xlsxXml.ts`. The writer starts from the original package (`session.original` bytes): sheet XML is rebuilt from the model but elements it does not model (page setup, printer settings, drawings' pictures, pivot caches, unknown parts…) are copied through in schema order with their relationships; newer functions get their `_xlfn.` prefix on write and lose it on read; array/spill formulas are written as array formulas; `fullCalcOnLoad` makes Excel recalculate. Chart parts and comments/VML are rewritten from the model.
- **Grid** (`components/sheets/SheetGrid.tsx` + `gridRender.ts`, `.sh-*` in `sheets.css`): a custom canvas grid (sticky frame + scroll spacer, DPR-aware, four frozen-pane regions, merges, borders, text overflow/wrap, conditional formats, RTL mirroring, proposal tints). `useSheetsEditor.ts` holds edit state, clipboard (TSV + HTML, internal copy keeps formulas/styles), commands and style helpers; the formula bar and the in-cell editor share one `GridEdit`; clicking while a formula is typed inserts a reference.
- **Assistant** (`useSheetsAssistant.ts`, `SheetsAssistant.tsx`): the runner is single-shot, so it loops: send context + attachments, and if the reply asks `<read>` send those cells in another round (`maxReadRounds`). Returned ops are applied to a **preview copy**; the grid tints changed cells and the user chooses Keep (one undo step) or Discard, or holds "Before". Pictures go to engines that can see them (Claude, Codex); PDFs/Word/Excel/CSV are turned into text by `utils/writing/sources.ts`. Quick actions include Picture to sheet.
- Tested by `npm run test:sheets` (formulas against known Excel results, number formats, reference rewriting, ops and inverse, xlsx round trips, preservation of unknown parts, AI reply parsing), plus `test:workspace-view` and `test:workspace-setup`.

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
- `FileExplorer.tsx`: File tree using `react-arborist` with virtualized rendering. Ctrl/⌘+click and Shift+click multi-select are handled in `TreeNode.tsx` (react-arborist only binds ⌘). Copy/cut/paste share the OS clipboard: `hooks/useExplorerClipboard.ts` → Rust `filesystem/clipboard.rs` (`read_clipboard_files` / `write_clipboard_files` / `paste_clipboard_image`, CF_HDROP + "Preferred DropEffect" on Windows) and `paste_entries` in `operations.rs` (per-item outcomes, never overwrites, refuses a folder into itself, cross-drive move fallback). Paste-source choice, undo batching and messages live in dependency-free `utils/explorerClipboard.ts` (`npm run test:explorer`). Open in Integrated Terminal adds a pane to the terminal grid at that folder (`create_single_terminal_session`, next grid index) and switches to the terminal view; Open in External Terminal is `open_external_terminal`
- `ExplorerContextMenu.tsx`: one menu (portal, viewport-positioned) for tree rows, multi-selection, empty space and the "Open editors" list; commands come in through a single `ExplorerMenuActions` object
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
- `SettingsAppearance.tsx`: Theme (dark/light), accent color (8 options), UI density (compact/comfortable/spacious), animations, custom cursor, hardware acceleration (Windows GPU toggle backed by `src-tauri/src/hardware_acceleration.rs`; applies on restart)
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
- **Liquid glass** (`src/liquid-glass.css`, imported last in `main.tsx`; setting `appStore.liquidGlass`, Settings → Appearance → Liquid glass, toggles `html.liquid-glass` in `App.tsx`): iOS 26 glass over the shared controls. Specular edge + sheen via inset shadows, a pointer light (`--lg-x`/`--lg-y`, `utils/liquidGlass.ts` `trackGlassPointer`), real `backdrop-filter` only on floating surfaces (menus, popovers, dialogs and their scrims, toasts, title/status bars). Selectors are `html.liquid-glass :where(…)` lists, so a component's own state rules still win; a new button/menu/dialog family is added to those lists, never styled per page. Overrides the "no glow, gloss, or blur" rule of `window-chrome.css` while on
- **Press, drag and slide** (`utils/glassPress.ts`, started beside `trackGlassPointer` in `App.tsx`): holding a glass control grows it and sets `[data-glass-hold]` (lens, rim, glow, styled at the end of `liquid-glass.css`); moving while held pulls it along on springs (individual `translate` / `scale` properties, never `transform`) and stretches it with the motion, and a drag swallows the click. Holding the selected item of a `.view-switch` / `.st-segmented` / `.sx-segmented` lifts its thumb out as a separate clear lens (`.glass-thumb`, a fixed element in `<body>`; labels stay put and show through it, the real thumb is hidden via `data-glass-sliding`), which slides and lands on the nearest item (clicked on release); a tab strip marked `data-glass-reorder="<name>"` (workspace tabs) draws the held tab as a floating copy (`.glass-clone`, because the strip's overflow would clip an enlarged tab), makes room, and emits `glass-reorder` (`{ group, from, to }`, handled in `App.tsx` → `reorderOpenWorkspaces`). **Switches** (`.st-switch`, `.ws-switch`, `.sx-switch`) are one iOS 26 design in `liquid-glass.css` (white capsule thumb on a long pill track); holding one hides its thumb (`data-sw-lifted`) and `utils/glassSwitch.ts` puts a real lens in `<body>` (`.lg-lens`: 1.6x swell with overshoot, `liquidLens` refraction with dispersion, iridescent rim, specular, shadow) that drags, stretches with speed and travels back into the thumb; the navigation thumb shares the layers (`.lg-lens-layers`). A new switch family is added to `SWITCHES` there and to the CSS lists. **Drop lists:** `utils/glassMenu.ts` (`trackGlassSelect`, started in `App.tsx` with the other glass trackers) replaces every native `<select>` popup with an iOS 26 glass menu (`.lg-menu`, end of `liquid-glass.css`): built from the options/optgroups, chosen value set through the prototype setter + `input`/`change` so React `onChange` runs; multi-selects, `size` > 1 and anything inside `[data-native-select]` stay native. Floating bars use `.lg-float` (or the list beside `.dz-topbar`, `.workspace-dev-server`). New pressable controls are added to `PRESSABLE`; `data-no-glass-press` opts out
- `LiquidSlider.tsx` (+ `.css`, `.lq-*`): the only slider in the app (iOS 26 Liquid Glass). An invisible native `<input type="range">` on top takes all events and props (`className`/`style` go to the wrapper, `size` sm | md, tint via `--lq-fill`, default `--accent`); springs drive press → glass lens, velocity stretch and release wobble. The lens bends the track with `backdrop-filter: url(#…)` from `utils/liquidLens.ts` (generated displacement map, Chromium only). Never add a raw range input
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
- Frontend pure modules: `node --test` scripts in `app/scripts/` (e.g. `npm run test:writing`, `npm run test:presentation`)
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

<!-- rtk-instructions v2 -->
# Command output

Command output here is condensed to save tokens, keeping every signal and
dropping costly noise. Treat it as the complete result: run commands
normally, and batch related commands into one call to avoid extra turns.
Truncated results state their recovery path in their own output. Re-run a
command as `rtk proxy <cmd>` only when its result is unusable: empty when
output was clearly expected, contradicting its exit code, or garbled.
<!-- /rtk-instructions -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
