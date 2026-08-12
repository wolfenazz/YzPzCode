# Project Context

## Environment
- Tauri v2 desktop app (YzPzCode)
- Frontend: React 19 + TypeScript, Vite 6, Tailwind CSS v4 (`@import "tailwindcss"` in styles.css)
- Backend: Rust (not affected by editor work)
- Test: `npx tsc --noEmit` (from app/), `npm run build` (tsc + vite), `cargo test` (backend)

## Theming Architecture (DISCOVERED)
- **styles.css** is the color system heart:
  - `:root` = dark mode defaults (Claude warm dark palette after previous mission)
  - `.light-theme` class = light mode (Claude warm light palette)
  - CSS vars: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--border-primary`,
    `--text-primary`, `--text-secondary`, `--accent` + `--accent-light/glow/border/text`
  - Derived sub-themes: `.markdown-dark/.markdown-light`, `.docx-preview-*`, spreadsheet,
    `.setup-bg`, scrollbars, xterm overrides, `.rich-prompt-editor`
- **App.tsx** `ACCENT_COLOR_MAP` (8 accents) applied to `document.documentElement.style`
- Claude theme (terracotta accent) is the current default from the previous mission.

## Editor Architecture (CURRENT MISSION)
- **OLD**: FileEditor.tsx used CodeMirror 6 (`@codemirror/*`) with custom theme compartments.
- **NEW**: FileEditor.tsx rewritten to use **Monaco Editor** (`monaco-editor@0.56.0` +
  `@monaco-editor/react@4.7.0`) — the actual VS Code editor engine. VS Code look & feel:
  minimap, breadcrumbs, native find widget, IntelliSense, vs-dark/vs themes.
- `app/src/lib/monaco.ts`: MonacoEnvironment.getWorker with Vite `?worker` imports
  (editor/json/css/html/ts) + `loader.config({ monaco })` — fully offline (no CDN).
- `app/vite.config.ts`: added `monaco` manualChunk; codemirror chunk retained until
  CodeMirror fully removed.
- **FileTab** (`types/index.ts`): `{ path, name, language, content, originalContent, isDirty, gitChange? }`.
  `openFiles` + `activeFilePath` in appStore. Save via `invoke("write_file_content")`.
- Editor settings in appStore: autoSave, autoSaveDelay, showMinimap, editorFontFamily,
  editorFontSize, editorTabSize, editorWordWrap, editorLineNumbers (on/off/relative),
  editorBracketColorization, editorFormatOnSave, editorTrimWhitespace.
- FindReplaceBar.tsx is now UNUSED (Monaco native find widget replaces it) — kept on disk.

## shadcn/ui foundation (set up for this mission)
- `app/components.json` (new-york style, neutral base, cssVariables, `@/` aliases)
- `app/src/lib/utils.ts` with cn()
- Deps added: class-variance-authority, clsx, tailwind-merge, lucide-react, tw-animate-css
- Tailwind v4 shadcn CSS vars added to styles.css (mapped to Claude palette)

## Notes
- Previous mission (Claude theme redesign) completed; uncommitted changes preserved.
- Mission history archived in `.opencode/archive/`.
