# YzPzCode UI Redesign Handoff

This file is the source of truth for continuing the premium UI migration.

## Product direction

YzPzCode should feel like a calm professional workbench: compact, neutral, precise, and content-first. The reference quality is Cursor/Codex, not a terminal-themed dashboard.

- No decorative gradients, rainbow accents, glowing borders, aurora backgrounds, or shimmer text.
- No all-caps navigation or wide letter spacing.
- No monospace outside terminals, code, diffs, file paths, and command output.
- Avoid cards inside cards. Prefer one surface with dividers and clear spacing.
- Color is semantic. Neutral surfaces are the default; green, amber, and red communicate state only.
- Use icons as quiet wayfinding, not decoration.
- Keep primary actions obvious but not colorful.

## Typography

The app uses local `Inter Variable` from `@fontsource-variable/inter`.

- UI/body: 400
- Secondary labels: 450–480
- Controls and navigation: 480–500
- Section headings: 520
- Page headings: 560
- Avoid 600+ in product UI. Legacy `font-bold` utilities are deliberately softened globally.
- Default UI labels use normal case and slightly tight tracking.
- `Cascadia Mono` remains for terminals and code-oriented content.

The global implementation is in `src/premium-system.css`; do not add a competing font stack in a component stylesheet.

## Tokens and primitives

Use the shared tokens and primitives in `src/premium-system.css`:

- `--bg-primary`, `--bg-secondary`, `--bg-tertiary`
- `--text-primary`, `--text-secondary`
- `--border-primary`
- `--accent` only as a restrained neutral selection color
- `.chrome`, `.chrome-btn`, `.chrome-tab`, `.view-switch`, `.statusbar` (window chrome, in `src/window-chrome.css`)
- `.app-page`, `.app-page__header`, `.app-page__content`
- `.app-sidebar`, `.app-nav-item`
- `.app-surface`, `.app-surface--raised`
- `.app-button`, `.app-button--primary`, `.app-button--quiet`
- `.app-icon-button`
- `.app-input`

Use `AppChrome` from `src/components/common/AppChrome.tsx` for top-level window chrome.

## Icons

Use `@phosphor-icons/react` for new UI. Prefer the regular 16–18px weight. Use filled icons only for a selected state. Do not add new hand-written SVG paths or another icon library during migration.

## Migration status

Completed foundation:

- Global dark/light neutral tokens and typography
- Shared application chrome and surfaces
- Setup shell and hero hierarchy
- Settings shell and navigation
- Workspace titlebar normalization

Completed since the last handoff (2026-08-22):

- **Terminal panel**: `TerminalHeader` glyphs → Phosphor (brand logos stay Iconify simple-icons); `agentCommands.ts` renamed to `.tsx` and command icons are now Phosphor nodes via `getCommandIcon`.
- **Workspace panels**: BrowserPane (40+ icons), BrowserTabBar, StyleClipboardPanel, StylePreviewCard, UiReferenceClipboardPanel, UiReferenceCard, ApplyModeToolbar, AgentTargetSelect, ElementInspectorPanel — all Phosphor.
- **Explorer panels**: DbPanel, DockerPanel, SearchPanel, MemoryPanel, GitChangesPanel — all Phosphor.
- **Editor**: DiffViewer — all Phosphor.
- **Settings**: SettingsAgents (section headers) — Phosphor; SettingsAgents still uses Iconify for brand-logo tool rows.

Remaining passes:

- **Iconify brand marks only**: `TerminalHeader` (simple-icons anthropic + tool logos), `NewTerminalDialog` (tool brand icons), `SettingsAgents` (tool brand icons), `InitializeWorkspace` (codeberg), `WorkspaceTemplatePicker` / `AgentFleetConfig` (template/fleet brand icons). These are deliberate — brand logos, not UI glyphs. The image editor icon set (`image/icons.tsx`) and `RichPromptEditor` action icons are still Iconify and should move to Phosphor next.
- **Migrate setup child forms** (WorkspaceTemplatePicker, AgentFleetConfig, InitializeWorkspace, LayoutSelector, IdesSelector, DirectorySelector, PrerequisitesPanel) to `app-*` primitives and remove nested panels.
- **Normalize workspace explorer/editor/browser sidebars and tab bars** (FileExplorer, EditorTabs, WorkspaceTab, TerminalStatusBar, ContextMenu still carry legacy chrome).
- **Restyle docs and designer-specific CSS** that still overrides global surfaces (DocsScreen, DesignerPage and its ~10 sub-panels).
- **Review every dialog and context menu at 100%, 125%, and 150% Windows scaling.**

## Review checklist

Before accepting a UI change:

- Does it preserve existing behavior and keyboard access?
- Is the information hierarchy clear without color or glow?
- Is monospace limited to code-like content?
- Are labels normal case and no heavier than necessary?
- Is the component aligned to the 4/8px spacing rhythm?
- Is there one clear surface rather than nested cards?
- Does it work in dark and light themes?
- Does `node ./node_modules/typescript/bin/tsc --noEmit` pass?
- Does `npm run build` pass?

