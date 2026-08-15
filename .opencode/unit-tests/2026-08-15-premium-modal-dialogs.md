# Unit Test Record — Redesign agent modal dialogs (premium surfaces)

- Date: 2026-08-15T18:13Z
- Reviewer: Reviewer (independent verification)
- Scope: `app/src/components/agent/AgentSelect.tsx`, `AgentPaneMenu.tsx`,
  `AgentMentionMenu.tsx`, `NewAgentDialog.tsx`, `SessionHistory.tsx`
- Nature: visual-only className migration onto the shared premium primitives
  in `app/src/styles.css` (`@layer components`). No logic/API change.

## Gates (fresh, Reviewer-run)
| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npx tsc --noEmit` (app/) | EXIT 0 |
| Build | `npm run build` (app/) | EXIT 0 (2m27s; only pre-existing monaco/Workspace chunk-size warnings) |

## What was verified on disk
- **AgentSelect.tsx** :259 popup `font-mono premium-menu overflow-hidden`
  (replaces `rounded-md border ... bg-[var(--bg-secondary)] shadow-2xl
  animate-scale-in`); :272 search input `premium-input`; :292 scroll region
  `premium-scrollbar`; :312 rows `premium-menu-item` (active state kept via
  conditional utility classes, `[data-active="true"]` CSS hook exists).
- **AgentPaneMenu.tsx** :102 popup `font-mono premium-menu overflow-hidden`.
- **AgentMentionMenu.tsx** :151 popup `premium-menu`; :162 scroll region
  `premium-scrollbar`; :181 rows `premium-menu-item` (selection kept via
  `data-selected` + conditional accent classes).
- **NewAgentDialog.tsx** :172 container `premium-surface`; close btn
  `premium-btn-icon`; scroll region `premium-scrollbar`; 4 inputs
  `premium-input`; footer buttons `premium-btn-ghost` / `premium-btn-primary`.
- **SessionHistory.tsx** :170 container `premium-surface`; close btn
  `premium-btn-icon`; filter `premium-segmented` + `premium-segmented-item`
  (+`is-active` matches CSS hook); search `premium-input`; list
  `premium-scrollbar`; session cards `premium-surface premium-lift`; badges
  `premium-badge`; resume/delete `premium-btn-ghost` with `!`-important
  semantic colors (rose/accent) that correctly override the ghost base.
- **Cascade correctness**: all premium classes live in `@layer components`
  (styles.css :1638-2087, documented intent :1635-1637) so Tailwind utility
  classes (bg-emerald-500, border-rose-500/50, etc.) still win — semantic
  colors tint the surfaces without specificity fights. Confirmed `@layer
  theme, base, components, utilities` order via Tailwind v4.2.2.
- **No legacy class leftovers**: 0 hits for `animate-scale-in|shadow-2xl|
  rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)]`
  in the 3 popover files.
- **Callers unaffected**: AgentSelect API unchanged; callers AgentPane.tsx,
  NewAgentDialog.tsx, SettingsAgent.tsx compile and build clean.
- **Reduced motion**: `html.animations-disabled .premium-menu { animation:
  none !important; }` at styles.css :2090-2097 (unlayered, beats the
  components-layer animation).

## Security / hygiene
- No `console.log`/`debugger`/TODO/FIXME in scope files.
- No hardcoded secrets/API keys (grep `sk-...`, `api_key=` → 0 hits).

## Verdict
PASS — 5/5 in-scope files verified, gates green, no defects found.
