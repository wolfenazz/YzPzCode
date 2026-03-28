# Terminal Issues and Solutions

## Problem 1: Long Text Paste Not Working

### Symptom
Pasting long text into the terminal would drop characters or not work at all.

### Root Cause
The PTY backend was sending large data in a single write, overwhelming the PTY input buffer.

### Solution
1. **Backend chunked write** (`session.rs`): Modified `write()` to send data in 512-byte chunks with 1ms delays between chunks.

2. **Frontend chunked paste** (`TerminalPane.tsx`): Added chunked paste handler that sends pasted text in 512-character chunks with 2ms delays.

---

## Problem 2: Bracketed Paste Mode Showing Duplicate Pastes

### Symptom
After adding `TERM=xterm-256color` environment variable, pastes showed as `[Pasted ~1 lines]` but the text was pasted 3 times.

### Root Cause
Three different paste mechanisms were firing simultaneously:
1. `attachCustomKeyEventHandler` on `keydown` event
2. `attachCustomKeyEventHandler` on `keypress` event (duplicate)
3. xterm.js's built-in DOM paste event handler (third paste)

### Solution
1. Added `event.type === 'keydown'` guard to prevent double-fire from keydown + keypress
2. Added capture-phase paste event listener on terminal container to block xterm.js's built-in paste handler:

```typescript
terminalRef.current.addEventListener('paste', (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
}, { capture: true });
```

---

## Problem 3: Ctrl+V Not Working After Fix

### Symptom
After blocking the duplicate pastes, Ctrl+V stopped working entirely.

### Root Cause
xterm.js's canvas doesn't fire native browser paste events - it relies on `attachCustomKeyEventHandler` or direct clipboard API calls.

### Solution
Restored custom Ctrl+V handler with bracketed paste sequences so the shell knows it's a single paste operation:

```typescript
if (isCtrl && event.key === 'v' && event.type === 'keydown') {
  navigator.clipboard.readText().then((text) => {
    if (!text) return;
    invoke('write_to_terminal', {
      sessionId: session.id,
      input: `\x1b[200~${text}\x1b[201~`,
    }).catch(console.error);
  }).catch(console.error);
  return false;
}
```

---

## Problem 4: CLI Tools Not Found in Release Build

### Symptom
In dev mode, CLI tools like `opencode`, `gemini`, `claude` work. In release build (installed app), these commands are not found:
```
PS C:\Users\nasee\Desktop\files\CODING\yzpzcode> opencode
opencode: The term 'opencode' is not recognized as a name of a cmdlet...
```

### Root Cause
The release build passes an incomplete PATH to the PTY session, missing directories where npm/pip/cargo install global CLI tools.

### Solution
Modified `session.rs` to explicitly add known CLI tool directories to PATH on Windows:

```rust
#[cfg(target_os = "windows")]
{
    let mut path = std::env::var("PATH").unwrap_or_default();
    
    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let userprofile = std::env::var("USERPROFILE").unwrap_or_default();
    
    // npm global packages
    if !local_appdata.is_empty() {
        path = format!("{}\n{}\n{}", 
            path,
            format!("{}\\npm", local_appdata),
            format!("{}\\Microsoft\\WindowsApps", local_appdata),
        );
    }
    
    // Python pip scripts
    if !appdata.is_empty() {
        path = format!("{}\n{}", path, format!("{}\\Python\\Scripts", appdata));
    }
    
    // Rust/Cargo binaries
    if !userprofile.is_empty() {
        path = format!("{}\n{}", path, format!("{}\\.cargo\\bin", userprofile));
    }
    
    cmd.env("PATH", path);
    // ... rest of existing env vars
}
```

---

## Environment Variables Added

Added to Windows PTY session to enable modern terminal features:
- `TERM=xterm-256color` - Signals 256-color terminal
- `COLORTERM=truecolor` - Signals true color (16M colors) support
- These enable bracketed paste mode in shells, proper key handling, and advanced terminal features

---

## Cross-Platform Notes

All solutions work on:
- **Windows**: Full support with the PATH additions
- **macOS**: Works with existing `TERM=xterm-256color` in macOS config block
- **Linux**: Works with existing `TERM=xterm-256color` in Linux config block

The bracketed paste sequences (`\x1b[200~...\x1b[201~`) are standard ANSI, supported by bash, zsh, fish, PowerShell, and other modern shells.
