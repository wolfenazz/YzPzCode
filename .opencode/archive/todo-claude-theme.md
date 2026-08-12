# Mission: Redesign coloring system to Claude (cloud) theme — dark & light bodies

Source: shadcn registry "claude" theme (warm terracotta orange, AI-assistant inspired).
Palette + hex conversions: `.opencode/docs/claude-theme.json`

## Design Mapping (Commander)
- `:root` (dark body) → Claude **dark** palette
  - bg #262626 family, fg #c3c1ba/#faf8f1, primary terracotta #d87757, border #3e3e38, ring #1b7ede
- `.light-theme` (light body) → Claude **light** palette (true light)
  - bg #faf8f1 cream, fg #3d3826 dark warm, primary terracotta #cb6441, border #d9d8d0
  - add `color-scheme: light`; chrome flips to dark text, content panels stay dark (warm-recolored)
- Accent system: default accent → Claude terracotta (theme-aware: dark #d87757 / light #cb6441)
- Hardcoded navy hexes (#1a1a2e, #0a0a0f, #080810, #09090b, #252540, #22252b, #23262c, #17191d...)
  → warm Claude equivalents
- Terminal xterm themes, DesignerPage.css, markdown/docx/spreadsheet/setup-bg/scrollbars → Claude palette

## M1: styles.css core theme | status: in_progress
### T1.1: Base variables — :root dark + .light-theme light | agent:Worker
- [ ] S1.1.1: Rewrite `:root` vars (bg/border/text/accent family) to Claude dark palette | size:L
- [ ] S1.1.2: Rewrite `.light-theme` vars to Claude light palette + color-scheme: light | size:L
### T1.2: Derived sub-themes | agent:Worker | depends:T1.1
- [ ] S1.2.1: markdown-dark/light + hljs vars → warm Claude palette | size:M
- [ ] S1.2.2: docx-preview + spreadsheet + setup-bg + scrollbars + rich-prompt-editor | size:M
- [ ] S1.2.3: xterm viewport hover scrollbar colors + accent-slider | size:S

## M2: Accent color system | status: in_progress
### T2.1: App.tsx ACCENT_COLOR_MAP | agent:Worker
- [ ] S2.1.1: Default accent → Claude terracotta; make map theme-aware (dark/light per accent) | size:M
- [ ] S2.1.2: Apply accent effect depends on theme too | size:S
### T2.2: SettingsAppearance.tsx swatches | agent:Worker | depends:T2.1
- [ ] S2.2.1: Update ACCENT_COLORS list to match new map (terracotta default + Claude blue) | size:S

## M3: Terminal themes | status: in_progress
### T3.1: TerminalPane.tsx xterm themes | agent:Worker
- [ ] S3.1.1: DARK_TERMINAL_THEME → Claude dark palette (warm) | size:M
- [ ] S3.1.2: LIGHT_TERMINAL_THEME → Claude light palette | size:M
### T3.2: InlineTerminal.tsx theme | agent:Worker | depends:T3.1
- [ ] S3.2.1: TERMINAL_THEME → Claude dark palette | size:S

## M4: Designer page palette | status: in_progress
### T4.1: DesignerPage.css .od-designer vars | agent:Worker
- [ ] S4.1.1: Rewrite .od-designer root vars → warm Claude palette | size:M
- [ ] S4.1.2: Update background grid/window-bar hardcoded rgba | size:S

## M5: Component hardcoded colors migration | status: in_progress
### T5.1: Global hex migration (sed) | agent:Worker
- [ ] S5.1.1: Map navy/black hardcoded hexes → warm Claude equivalents across tsx/ts/css | size:L
- [ ] S5.1.2: Fix zinc-950/900/800 accent-heavy surfaces where needed | size:M
### T5.2: Light-mode readability audit | agent:Worker | depends:T5.1
- [ ] S5.2.1: Audit isLight ternaries in 8 workspace components for true-light correctness | size:M

## M6: Verification | status: pending
### T6.1: Review Block | agent:Reviewer | depends:T5.2
- [ ] S6.1.1: `npx tsc --noEmit` — zero type errors | size:M
- [ ] S6.1.2: Diff review: no regressions in non-theme logic; CSS palette matches Claude theme JSON | size:M
