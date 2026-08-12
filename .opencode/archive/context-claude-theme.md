# Project Context

## Environment
- Tauri v2 desktop app (YzPzCode)
- Frontend: React 19 + TypeScript, Vite 6, Tailwind CSS v4 (`@import "tailwindcss"` in styles.css)
- Backend: Rust (not affected by theme work)
- Test: `npx tsc --noEmit` (from app/), `cargo test` (backend)
- Tailwind v4 CSS-first config; tailwind.config.js is legacy/minimal

## Theming Architecture (DISCOVERED)
- **styles.css** is the color system heart:
  - `:root` = dark mode defaults (bg #09090b, zinc-based neutrals)
  - `.light-theme` class = light mode (currently dark-navy #17191d surfaces + white text)
  - CSS vars: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--border-primary`,
    `--text-primary`, `--text-secondary`, `--accent` + `--accent-light/glow/border/text`
  - Derived sub-themes: `.markdown-dark/.markdown-light`, `.docx-preview-*`, spreadsheet,
    `.setup-bg`, scrollbars, xterm overrides, `.rich-prompt-editor`
- **App.tsx** `ACCENT_COLOR_MAP` (8 accents) applied to `document.documentElement.style` via
  useEffect (single hex + derived rgba). Default accent = #a1a1aa gray.
- **SettingsAppearance.tsx** `ACCENT_COLORS` swatch list (mirrors map).
- **TerminalPane.tsx** `DARK_TERMINAL_THEME` / `LIGHT_TERMINAL_THEME` (xterm.js themes).
- **InlineTerminal.tsx** `TERMINAL_THEME` (xterm, setup flow).
- **DesignerPage.css** `.od-designer` custom design-system vars (own palette).
- ~213 hardcoded hex colors + 1746 `zinc-*` class usages across components.

## Claude Theme (shadcn registry, source: https://www.shadcn.io/r/claude.json)
"AI assistant inspired theme with warm terracotta orange tones"
- Dark: bg oklch(0.27 0 106.64)≈#262626, primary terracotta ≈#d87757, ring ≈#1b7ede
- Light: bg oklch(0.98 0.01 95.10)≈#faf8f1 cream, primary ≈#cb6441, ring ≈#1b7ede
- Full palette + hex conversions cached in `.opencode/docs/claude-theme.json`

## Design Decision (Commander)
- Dark body (`:root`) → Claude dark palette (warm dark grays, terracotta accent)
- Light body (`.light-theme`) → Claude light palette (warm cream bg, dark warm text,
  terracotta accent). Terminal/content areas keep dark rendering (terminal-app convention).
- Default accent color becomes Claude terracotta; accent applied theme-aware in App.tsx.
- Hardcoded navy hexes (#1a1a2e, #0a0a0f, #080810, #252540, #22252b, #23262c, #17191d...)
  migrated to warm Claude equivalents.

## Notes
- There are uncommitted changes from previous mission (terminal viewport fix) — preserve them.
- Verdict: shadcn CLI interactive install not applicable (no components.json; app has custom
  var system). Theme extracted from registry URL directly = "installed".
