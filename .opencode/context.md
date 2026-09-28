# Project Context — YzPzCode

## Environment
- Language: TypeScript/React 19 + Rust (Tauri v2)
- Build: `npm run build` (app/), `npm run tauri build`
- Type check: `npx tsc --noEmit` (app/), `cargo check` (app/src-tauri)
- Package Manager: npm

## Structure
- Frontend: `app/src` (components, hooks, stores, types)
- Backend: `app/src-tauri/src` (commands, terminal, agent_cli, filesystem, browser)
- Main window: borderless WebView2 (`decorations: false`), custom titlebar.

## Mission (2026-09-27): Handy voice-to-text not working in YzPzCode

### Symptom
Handy (cjpais/Handy) dictates fine into other apps but nothing appears in YzPzCode.

### Root cause
Terminal panes are the primary dictation surface. `app/src/components/workspace/TerminalPane.tsx`
registered a capture-phase `paste` listener that called `preventDefault()` + `stopPropagation()`
and then discarded the event, and implemented paste ONLY through the async
`navigator.clipboard.readText()` inside xterm's `attachCustomKeyEventHandler` (Ctrl+V).

That async read is unreliable for injected/dictated input:
- Clipboard read needs permission/user-activation that WebView2 may not grant.
- Handy publishes the transcript, injects Ctrl+V, then restores the previous clipboard after
  ~60 ms (legacy paste). A heavy WebView2 app's async read can lose that race and return the
  old/empty clipboard (Handy issue #502 class) → paste silently no-ops.
- `Shift+Insert` was swallowed with no handler at all.

Handy's actual mechanism (verified from its source): clipboard write + `enigo` Ctrl+V chord
(`src-tauri/src/input.rs` `send_paste_ctrl_v`), default delays 60ms/60ms.

### Fix (verified `npx tsc --noEmit` = 0, `npm run build` = pass)
- `TerminalPane.tsx`: replaced the discard-only paste blocker with a real handler that reads
  `e.clipboardData.getData('text/plain')` synchronously (no permission, no race) and routes it
  through the existing shell-aware `pasteClipboardText`. Ctrl+V / Ctrl+Shift+V / Shift+Insert in
  the custom key handler now just `return false` (stop xterm emitting raw bytes) and let the
  browser's default paste command fire the event. Chord match uses `event.code === 'KeyV'` too
  (layout independent, matches Handy's injected `VK_V`).
- `app/src/components/setup/InlineTerminal.tsx`: same — dropped the async `readText` path and let
  xterm's native paste handler (synchronous, bracketed-paste aware) process the event.

### Notes
- Non-terminal inputs (agent composer textarea, RichPromptEditor, CodeMirror) already use native
  paste events with `clipboardData` and were not affected.
- Remaining `navigator.clipboard.readText()` uses (terminal right-click paste, global context-menu
  Paste) are menu-triggered (real user gesture) and were left as-is.
