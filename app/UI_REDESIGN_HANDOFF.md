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
- `.app-chrome`
- `.app-page`, `.app-page__header`, `.app-page__content`
- `.app-sidebar`, `.app-nav-item`
- `.app-surface`, `.app-surface--raised`
- `.app-button`, `.app-button--primary`, `.app-button--quiet`
- `.app-icon-button`
- `.app-input`

Use `AppChrome` from `src/components/common/AppChrome.tsx` for top-level window chrome.

## Icons

Use `@phosphor-icons/react` for new UI. Prefer the regular 16–18px weight. Use filled icons only for a selected state. Do not add new hand-written SVG paths or another icon library during migration.

## AI Elements

The following Vercel AI Elements are installed in `src/components/ai-elements` and are already used by the YzPz Agent:

- `Conversation`, `ConversationContent`, `ConversationEmptyState`, `ConversationScrollButton`
- `Message`, `MessageContent`
- `Reasoning`, `ReasoningTrigger`, `ReasoningContent`
- `Tool`, `ToolHeader`, `ToolContent`
- `Queue` primitives
- `Confirmation` primitives
- `PromptInput` primitives are installed for later composer consolidation

AI Elements are application-owned source files. Modify their styles locally when necessary; do not wrap them in a second visual card system.

## YzPz Agent layout

The intended hierarchy is:

1. A quiet 48px grid toolbar for the Agent view and session creation.
2. Each session is one bordered pane, with a calm header containing title, connection summary, status, new chat, overflow, and close.
3. Provider/model/reasoning/usage controls live in the overflow rather than permanently crowding the header.
4. Conversation content owns the center and scroll behavior.
5. Reasoning and tool activity expand inline using AI Elements.
6. The task queue is a compact floating work surface, not a glowing sidebar.
7. Confirmations appear as a focused approval surface above the composer.
8. The composer is one raised neutral surface; no canvas effect, color cycling, or gradient send button.
9. Orchestrator teammate progress may use a right rail at wide sizes and an inline disclosure in narrow panes.

Preserve all task execution, approval, queue, attachment, provider, model, and orchestration behavior when simplifying visuals.

## Migration status

Completed foundation:

- Global dark/light neutral tokens and typography
- Shared application chrome and surfaces
- Setup shell and hero hierarchy
- Settings shell and navigation
- Workspace titlebar normalization
- YzPz Agent grid, pane, chat, empty state, reasoning, tools, queue, approval, and composer foundation

Completed since the last handoff (2026-08-22):

- **Agent components fully migrated to Phosphor**: AgentPane (mode icons, effort, reasoning, overflow, close, notice), AgentChat (translation, copy, remember, tool details, error/idle/compaction cards, suggestions, completion), AgentInput (mode tabs, fast keycap, attachments, queue, search, send), TeamProgressPanel, UiEditRequestCard, AgentSelect, AgentCommandDrawer, AgentGrid, NewAgentDialog, SessionHistory, QuestionCard, McpStatusStrip, DiffView, AgentMentionMenu spinner. No Iconify/inline SVG remains in `components/agent`.
- **Terminal panel**: `TerminalHeader` glyphs → Phosphor (brand logos stay Iconify simple-icons); `agentCommands.ts` renamed to `.tsx` and command icons are now Phosphor nodes via `getCommandIcon`.
- **Workspace panels**: BrowserPane (40+ icons), BrowserTabBar, StyleClipboardPanel, StylePreviewCard, UiReferenceClipboardPanel, UiReferenceCard, ApplyModeToolbar, AgentTargetSelect, ElementInspectorPanel — all Phosphor.
- **Explorer panels**: DbPanel, DockerPanel, SearchPanel, MemoryPanel, GitChangesPanel — all Phosphor.
- **Editor**: DiffViewer — all Phosphor.
- **Settings**: SettingsAgent (refresh, reveal key) and SettingsAgents (section headers) — Phosphor; SettingsAgents still uses Iconify for brand-logo tool rows.
- **Agent chat tool cards reworked for calm**: non-edit tools no longer render as cards when finished — they show as a single quiet activity line while running, then disappear (the agent's next message explains the result). Only file-edit tools render the diff card (`AiTool` + `DiffView`), and finished failures still get an error card. Added `showStatus` option to `ai-elements/tool.tsx` so the diff card hides the status pill.

Remaining passes:

- **Iconify brand marks only**: `TerminalHeader` (simple-icons anthropic + tool logos), `NewTerminalDialog` (tool brand icons), `SettingsAgents` (tool brand icons), `InitializeWorkspace` (codeberg), `WorkspaceTemplatePicker` / `AgentFleetConfig` (template/fleet brand icons). These are deliberate — brand logos, not UI glyphs. The image editor icon set (`image/icons.tsx`) and `RichPromptEditor` action icons are still Iconify and should move to Phosphor next.
- **Consolidate the Agent composer onto `PromptInput` primitives** after verifying voice, attachment, translation, and queue behavior.
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

