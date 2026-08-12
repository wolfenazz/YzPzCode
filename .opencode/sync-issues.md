# Sync Issues (Unresolved Only)

## SYNC-2 (MEDIUM) - TerminalPane container bg not updated to Claude theme [archived Claude-theme mission]
- Severity: MEDIUM
- Files: app/src/components/workspace/TerminalPane.tsx (line 1211)
- Problem: Terminal container bg = `bg-[#18181b]` (light) / `bg-[#09090b]` (dark) but new xterm
  theme bgs = `#faf8f1` / `#262626`. Transparent .xterm-viewport (previous fix) reveals container bg
  as 3px frame + leftover strip → off-theme visible mismatch (dark strip returns in dark mode,
  dark frame around cream terminal in light mode). InlineTerminal.tsx L383 was fixed correctly (#262626).
- Fix: `${isLight ? 'bg-[#faf8f1]' : 'bg-[#262626]'}`
- Status: pending (carry-over from archived theme mission; apply when convenient)

## SYNC-3 (LOW) - LayoutSelector placeholder color [defer to M5 global migration]
- Severity: LOW
- Files: app/src/components/setup/LayoutSelector.tsx (line 32)
- Problem: `bg-[#09090b]` placeholder (old zinc near-black).
- Fix: Handle in global hex migration (M5 of archived theme mission).
- Status: pending (deferred)

---
# Resolved (removed from active list)
- SYNC-1 (HIGH) shadcn semantic @theme tokens missing → RESOLVED 2026-08-12: `@theme inline` block present
  in app/src/styles.css (line 28); all 8 required tokens (background/foreground/primary/card/muted/
  border/ring/sidebar) confirmed present via rg (count=18 for --color-* semantic tokens). Verified by Reviewer.
- SYNC-4 (LOW) monaco-vite-tauri.md missing → RESOLVED 2026-08-12: file exists at .opencode/docs/monaco-vite-tauri.md.
  Verified by Reviewer.
