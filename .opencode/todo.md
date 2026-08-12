# Mission: Redesign Terminal Grid Section — Sharp "Bases"-Style Terminal Look

## M1: Remove soft styling / implement sharp terminal design | status: completed
### T1.1: Workspace.tsx — outer terminal container | agent:Worker
- [x] S1.1.1: Replace `p-2.5` wrapper + rounded card with tight `p-1.5` + square hard-frame container | size:S | verified

### T1.2: TerminalGrid.tsx — grid cells, empty cell, dividers, footer, TTY button | agent:Worker
- [x] S1.2.1: Square-off grid cells (remove rounded-2xl), empty cell (remove rounded + heavy shadow) | size:S | verified
- [x] S1.2.2: Square-off dividers (remove rounded-full) and DragOverlay (remove rounded-xl) | size:S | verified
- [x] S1.2.3: Tighten footer padding (px-4 py-2.5 → px-3 py-2), square-off Initialize_TTY button (remove rounded-xl, scale hover, shadows) | size:S | verified
- [x] S1.2.4: Reduce GAP_PX 10 → 8 for tighter grid padding | size:S | verified

### T1.3: TerminalPane.tsx — pane container, search bar, paste modal | agent:Worker
- [x] S1.3.1: Square-off pane container (remove rounded-2xl, crisp border), search buttons (remove rounded) | size:S | verified
- [x] S1.3.2: Square-off paste-confirm modal (remove rounded-xl/rounded-lg, remove shadow-2xl) | size:S | verified

### T1.4: TerminalHeader.tsx — badges, LEDs, buttons | agent:Worker
- [x] S1.4.1: Square LEDs (remove rounded-full) + add running LED glow; square badges/buttons (remove rounded-md) | size:S | verified

### T1.5: QuickActions.tsx + AuthModal.tsx + NewTerminalDialog.tsx — overlay consistency | agent:Worker
- [x] S1.5.1: Square-off QuickActions btnBase (remove rounded-md) | size:S | verified
- [x] S1.5.2: Square-off AuthModal panel (remove rounded-lg, shadow-2xl) | size:S | verified
- [x] S1.5.3: Square-off NewTerminalDialog surfaces (rounded-2xl/xl/lg/md/full → square) | size:M | verified

## M2: Verify | status: completed
### T2.1: Review Block | agent:Reviewer | depends:M1
- [x] S2.1.1: Run `npx tsc --noEmit` — zero type errors | size:S | verified
- [x] S2.1.2: Confirm all requested styling changes applied with no regressions | size:S | verified
