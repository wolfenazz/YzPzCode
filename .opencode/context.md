# Project Context — YzPzCode UI Redesign Continuation (2026-08-22)

## Environment
- Windows 11, pwsh. App root: `app/`. Frontend: React 19 + TS strict + Vite 6 + Tailwind v4.
- Verify: `cd app && node ./node_modules/typescript/bin/tsc --noEmit` (~24s) and `npm run build`.
- Baseline tsc exit 0 at mission start. Working tree has uncommitted redesign work — build on it.

## Source of truth
- `app/UI_REDESIGN_HANDOFF.md` — design law, primitives list, migration status.
- `app/src/premium-system.css` — tokens + app-* primitives. DO NOT add competing font stacks.

## Mission passes (remaining from handoff)
1. M1 icons: `components/image/icons.tsx` (Iconify→Phosphor), `workspace/RichPromptEditor.tsx` toolbar.
2. M2 setup forms → app-*: WorkspaceTemplatePicker(40KB), AgentFleetConfig(22KB), InitializeWorkspace,
   LayoutSelector, IdesSelector(+IdesTable), DirectorySelector, PrerequisitesPanel.
3. M3 sidebars/tabbars: explorer/FileExplorer(44KB), editor/EditorTabs+TabContextMenu,
   workspace/WorkspaceTab, TerminalStatusBar, common/ContextMenu.tsx.
4. M4 docs/designer: docs/DocsScreen(22KB), designer/DesignerPage.css(32KB) + subpanels.
5. M5 composer: AgentInput onto ai-elements PromptInput primitives (preserve voice/attach/
   translation/queue handlers exactly).
6. Deliberate Iconify exceptions (brand logos only): TerminalHeader/NewTerminalDialog/SettingsAgents
   simple-icons; InitializeWorkspace codeberg; template/fleet brand marks. Do NOT remove these.

## Conventions
- Icons: @phosphor-icons/react regular weight, size 16–18. Filled only for selected state.
- Colors: tokens only (--bg-*, --text-*, --border-primary, --accent restrained).
- No gradients/glow/all-caps-nav/wide-tracking/cards-in-cards. Monospace only for code-like content.
- Workers avoid editing styles.css/premium-system.css; scope any needed CSS to component files.
