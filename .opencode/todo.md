# Mission: Fix Handy voice-to-text (and all dictated paste) inside YzPzCode

Baseline: dictation tools inject clipboard + Ctrl+V; YzPzCode terminals blocked native paste and
depended on async `navigator.clipboard.readText()`, which fails/races for injected input.
Verification: `npx tsc --noEmit` (app) exit 0; `npm run build` (app) pass; targeted code review.

## M1: Diagnose root cause | agent:Commander | status:completed
### T1.1: Establish Handy mechanism | size:S | status:completed
- [x] S1.1.1: Confirmed Handy = clipboard write + `enigo` Ctrl+V (60ms before/after delays, 100ms modifier hold) via Handy source `src-tauri/src/input.rs`, `clipboard.rs`, `paste_tx/*` | verified by source read
- [x] S1.1.2: Confirmed YzPzCode has no global key hooks and no app-wide paste/keydown blockers | verified by grep sweep (only Ctrl+, / Ctrl+B/E/W/P etc.)

### T1.2: Locate the defective paste paths | size:S | status:completed
- [x] S1.2.1: `TerminalPane.tsx` capture-phase `paste` listener discarded the event; paste relied solely on async `readText()` in the Ctrl+V handler; `Shift+Insert` unhandled | verified by code read (lines 817-820, 1008-1011, 857)
- [x] S1.2.2: `InlineTerminal.tsx` used the same async `readText()` path | verified by code read (lines 252-269)

## M2: Implement fix | agent:Worker | status:completed
### T2.1: Workspace terminal | size:M | status:completed
- [x] S2.1.1: Replace discard-only paste blocker with a synchronous `clipboardData` handler routed through `pasteClipboardText` | verified `tsc` 0 + read
- [x] S2.1.2: Ctrl+V / Ctrl+Shift+V / Shift+Insert return false (no async read) and let the native paste event drive insertion; match `code === 'KeyV'` | verified `tsc` 0 + read
- [x] S2.1.3: Update listener add/remove references (`handlePasteCapture` → `handlePaste`) | verified 0 remaining references (grep)

### T2.2: Setup inline terminal | size:S | status:completed
- [x] S2.2.1: Remove async `readText` path; return false so xterm's native (synchronous, bracketed-paste aware) handler processes the event | verified `tsc` 0 + read

## M3: Verify | agent:Reviewer | depends:M2 | status:completed
- [x] S3.1: `npx tsc --noEmit` clean in `app` | verified exit 0 (run twice)
- [x] S3.2: `npm run build` (tsc + vite build) succeeds | verified (build pass)
- [x] S3.3: No stale `handlePasteCapture` references; non-terminal inputs unaffected | verified grep + review
