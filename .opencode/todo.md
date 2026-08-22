# Mission: Continue premium UI migration (per app/UI_REDESIGN_HANDOFF.md)

Baseline verified 2026-08-22: `node ./node_modules/typescript/bin/tsc --noEmit` exit 0 on main
(uncommitted redesign work already present — continue on top of it, do not revert).

Design law (from handoff, binding for every worker):
- Calm professional workbench. No gradients/glow/rainbow/shimmer, no all-caps nav,
  no monospace outside code-like content, avoid cards-in-cards, semantic color only,
  icons as quiet wayfinding (@phosphor-icons/react, regular weight, 16–18px).
- Typography via src/premium-system.css only (no competing font stacks).
- Primitives: .app-chrome .app-page .app-sidebar .app-nav-item .app-surface
  (--raised) .app-button (--primary/--quiet) .app-icon-button .app-input.
- Preserve ALL behavior and keyboard access. Verify dark+light themes.
- Workers must NOT edit styles.css / premium-system.css unless unavoidable;
  prefer Tailwind utilities scoped to their own components.

## M1: Icon migration to Phosphor | agent:Worker | status: in_progress
### T1.1: Image editor icon set | size:M
- [ ] S1.1.1: Rewrite app/src/components/image/icons.tsx to export Phosphor icon
      components (keep IMG_ICONS name-keyed API surface so call sites stay stable);
      remove @iconify/react from image/*
      | verify: rg "@iconify" app/src/components/image → empty; tsc clean
### T1.2: RichPromptEditor action icons | size:S
- [ ] S1.2.1: Replace material-symbols Iconify icons with Phosphor equivalents
      (TextB/TextItalic/TextUnderline/TextStrikethrough/Code/Quotes/
      ListBullets/ListNumbers/LinkSimple/LinkSimpleBreak/Eraser or best-fit),
      neutralize legacy zinc/emerald toolbar colors to token-based classes
      | verify: no @iconify import remains in file; tsc clean

## M2: Setup child forms → app-* primitives | agent:Worker | status: pending
### T2.1: Forms migration | size:L
- [ ] S2.1.1: WorkspaceTemplatePicker — flatten nested panels onto .app-surface,
      app-button/app-input primitives, remove local chrome overrides
- [ ] S2.1.2: AgentFleetConfig — same treatment
- [ ] S2.1.3: InitializeWorkspace — same treatment (codeberg brand icon may stay Iconify)
- [ ] S2.1.4: LayoutSelector + IdesSelector + DirectorySelector + PrerequisitesPanel
      — same treatment
      | verify each: tsc clean; visual hierarchy single-surface; dark+light ok

## M3: Workspace sidebars & tab bars normalization | agent:Worker | status: pending
### T3.1: Explorer chrome | size:L
- [ ] S3.1.1: FileExplorer — normalize header/tab bar to quiet neutral chrome,
      remove legacy gradient/heavy borders, keep virtualization + context menu intact
- [ ] S3.1.2: EditorTabs + TabContextMenu — calm tab bar aligned to tokens
- [ ] S3.1.3: WorkspaceTab + TerminalStatusBar — token-aligned chrome
- [ ] S3.1.4: common/ContextMenu.tsx — popover surfaces on tokens, no nested cards
      | verify each: tsc clean; behavior preserved

## M4: Docs & designer CSS restyle | agent:Worker | status: pending
### T4.1: Restyle | size:L
- [ ] S4.1.1: DocsScreen — drop component-local font stacks/surface overrides;
      align to premium tokens
- [ ] S4.1.2: DesignerPage.css + subpanels — remove decorative gradients/glows,
      align surfaces/buttons/inputs to tokens; keep layout intact
      | verify: tsc clean; build passes

## M5: Agent composer consolidation onto PromptInput primitives | agent:Worker | status: pending
### T5.1: Composer consolidation | size:L
- [ ] S5.1.1: Audit AgentInput vs ai-elements PromptInput API; map voice dictation,
      attachments, translation, queue, mode tabs, send behaviors one-to-one
- [ ] S5.1.2: Rebuild composer shell on PromptInput primitives preserving every
      handler; keep agent-input-island raised-neutral styling
      | verify: tsc clean; all handlers still wired (grep evidence)

## M6: Final verification & handoff update | agent:Reviewer | depends:M1,M2,M3,M4,M5 | status: pending
- [ ] S6.1: npx tsc --noEmit exit 0
- [ ] S6.2: npm run build exit 0
- [ ] S6.3: Update UI_REDESIGN_HANDOFF.md "Completed since" + "Remaining passes"
