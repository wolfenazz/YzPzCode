# Research: Monaco Editor integration — Vite 6 + React 19 + Tauri v2 (offline)

Date: 2026-08-12
Versions verified: `monaco-editor@0.56.0`, `@monaco-editor/react@4.7.0`, Vite 6 (rolldown), React 19, Tauri v2
Scope: Replace CodeMirror editor in `FileEditor.tsx` with Monaco, fully OFFLINE (no CDN), served over `tauri://localhost` (`base: './'`).

> Verification method: official docs (monaco-editor ESM guide, monaco-react README, Vite docs) +
> **direct inspection of the installed `node_modules`** (highest-confidence source for the exact installed versions).

---

## 1. Worker setup — `src/lib/monaco.ts` (EXACT code)

This is the canonical pattern from the official monaco-react README, "If you use Vite" section, adapted to TS with the app's `@/` alias. All 5 worker file paths were verified to exist in the installed 0.56.0 tree:

- `node_modules/monaco-editor/esm/vs/editor/editor.worker.js` ✅
- `node_modules/monaco-editor/esm/vs/language/json/json.worker.js` ✅
- `node_modules/monaco-editor/esm/vs/language/css/css.worker.js` ✅
- `node_modules/monaco-editor/esm/vs/language/html/html.worker.js` ✅
- `node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js` ✅

```ts
// app/src/lib/monaco.ts
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

// MUST run before any <Editor /> mounts. Import this module once at app root.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// Use the npm instance directly — the loader's init() then resolves with this
// instance and NEVER injects CDN scripts (verified in loader source, see §4).
loader.config({ monaco });

export { monaco };
```

**Key rules:**
- `self.MonacoEnvironment` must be assigned **before** the first editor is created (module-level import guarantees this).
- Import `./lib/monaco` from `main.tsx` or the editor component module — **once, at the top**.
- The `declare global` block satisfies `tsc --noEmit` strict mode (this project uses `strict: true`, `noUnusedLocals`, etc.). The app's `src/vite-env.d.ts` (`/// <reference types="vite/client" />`) is already present, which types the `?worker` imports.
- Vite's `?worker` import gives a constructor `new EditorWorker()`. In dev Vite serves workers as ES modules; in build it bundles them per `worker.format` (default `iife`) — no config needed.

Sources:
- https://github.com/suren-atoyan/monaco-react (README §loader-config, "If you use Vite" — exact code block)
- https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md (§Using Vite — uses `getWorker` + `?worker` URLs)
- Installed files verified locally. Confidence: **HIGH**.

---

## 2. Vite config — NO changes required

- `?worker` imports are a first-class Vite feature; no plugin needed.
- `worker.format` defaults to **`'iife'`** (https://vite.dev/config/worker-options). **Keep the default.** IIFE workers are classic scripts and work in every webview: WebView2 (Windows), WKWebView (macOS), webkit2gtk (Linux). Do NOT set `worker: { format: 'es' }` — ES-module workers need newer engines (Chrome 80+, Safari 15+) and buy nothing here.
- No `optimizeDeps` change needed for dev (Vite pre-bundles monaco automatically; if a dev-only circular dep warning appears, `optimizeDeps.exclude` can be used, but that is not expected with this pattern).
- `base: './'` (already set) produces relative worker/asset URLs in build → they load correctly from `tauri://localhost`.

Sources:
- https://vite.dev/config/worker-options (`worker.format` default `'iife'`)
- https://vite.dev/guide/features.html#web-workers
- Confidence: **HIGH**.

---

## 3. Tauri-specific findings (webview / protocol / offline)

**This project's config:** `app/src-tauri/tauri.conf.json` has `"security": { "csp": null }` — **no CSP**, so nothing blocks `new Worker()`. If a CSP were ever added, it must include `worker-src 'self'` (and `blob:` if any worker is inlined).

| Platform | Engine | Worker support |
|---|---|---|
| Windows (this dev machine) | WebView2 (Chromium 109+) | ✅ Full, modern |
| macOS | WKWebView | ✅ (workers OK; keyboard gotchas below) |
| Linux | webkit2gtk | ✅ but clipboard quirks (below) |

- **`tauri://localhost` is an HTTP-like custom protocol, NOT `file://`.** Monaco's FAQ explicitly states workers cannot be created on `file://` — that does not apply here (https://github.com/microsoft/monaco-editor#faq). No known issue with workers on Tauri's custom protocol.
- **GitHub issues found** (searched `tauri-apps/tauri` + `suren-atoyan/monaco-react`):
  - `tauri#14309` — "monaco editor need some clipboard permission??" — Linux webkit2gtk clipboard restriction, closed without Tauri-side fix. **Linux-only; not applicable to Windows WebView2.** If Linux matters later, gate copy/paste through Tauri's clipboard plugin.
  - `tauri#12059` — macOS Cmd+A broken with Monaco "unstable" feature flag. Not applicable (no unstable flag).
  - `tauri#9426` — macOS Cmd+Z "sometimes doesn't work" (WKWebView key handling). Mitigate with a keydown fallback if macOS undo misbehaves.
  - `monaco-react#523` — "Intellisense stopped working when I tried to use node_modules version instead of CDN" (Tauri app; monaco 0.41 in 2023; closed stale). The failure mode: `getWorker` returned/used `editorWorkerService` fallback so the TS worker never attached → IntelliSense silently degraded. **Lesson: assign `MonacoEnvironment` before `loader.init()` and keep the label switch exact (this is why the §1 pattern is module-level).**
  - `monaco-react#741` — init error on Windows Tauri (stale, no resolution; consistent with a missing/incorrect `MonacoEnvironment` at init time).
- **Offline guarantee (verified in installed loader source):** `@monaco-editor/loader` `init()` (node_modules/@monaco-editor/loader/lib/es/loader/index.js) does: `if (state.monaco) { state.resolve(state.monaco); return ... }` before ever touching `injectScripts`/CDN. With `loader.config({ monaco })` the app makes **zero** network requests. Confidence: **HIGH** (read the actual installed code).

Sources:
- https://github.com/tauri-apps/tauri/issues/14309, /12059, /9426
- https://github.com/suren-atoyan/monaco-react/issues/523, /741
- Local: `app/src-tauri/tauri.conf.json`, `node_modules/@monaco-editor/loader/lib/es/loader/index.js`

---

## 4. `@monaco-editor/react` loader — npm package, no CDN (exact pattern)

Documented in the README since v4.4.0 ("use monaco-editor as an npm package"):

```ts
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

loader.config({ monaco }); // deeply merged into the default config
```

- After this call, `<Editor />`/`<DiffEditor />` resolve `monaco` from the npm bundle (verified in loader source, see §3).
- `@monaco-editor/react@4.7.0` peer deps: `monaco-editor >= 0.25.0 < 1` ✅ (0.56.0), `react ^19` ✅.
- The React wrapper's `<Editor />` implementation (verified in `dist/index.mjs`) creates the editor with `automaticLayout: true` by default, so container resize in the Tauri window is handled out of the box.
- Loading prop: `<Editor loading={<AppLoader/>} />` can show a custom spinner while monaco initializes (it's synchronous after `init()` resolves, so this is brief).

Sources:
- https://github.com/suren-atoyan/monaco-react (README §loader-config)
- Local: `node_modules/@monaco-editor/loader/lib/es/loader/index.js` (lines 54–61)
- Confidence: **HIGH**.

---

## 5. Language registration — automatic for ALL requested languages

`import * as monaco from 'monaco-editor'` resolves to `esm/vs/index.js` (package `exports` map, verified). That file imports **every** `languages/definitions/*/register.js` — verified list includes: `cpp, csharp, css, dart, dockerfile, elixir, …` plus the requested `python, rust, java, markdown, html, json, javascript/typescript`. **All basic-language registration is automatic; no manual `register` calls needed.**

Rich-feature split (from monaco-react README, matches monaco's own docs):

| Group | Languages | Features |
|---|---|---|
| **Rich IntelliSense + validation** (worker-backed) | TypeScript, JavaScript, CSS, LESS, SCSS, JSON, HTML | autocomplete, hover, diagnostics, formatting |
| **Basic colorization only** | XML, PHP, C#, C++, Razor, Markdown, Diff, Java, VB, CoffeeScript, Handlebars, Batch, Pug, F#, Lua, Powershell, Python, Ruby, SASS, R, Objective-C | tokenization, folding, bracket matching — **no IntelliSense, no built-in formatter** |

So: the requested 10 languages all get syntax highlighting immediately. **IntelliSense autocomplete works out of the box for JS/TS** via `ts.worker` (and JSON/CSS/HTML). For Python/Rust/Java/C++/Markdown, monaco provides no language server — that matches VS Code only when a language-server extension is present (out of scope; the previous CodeMirror editor also had no IntelliSense for these).

For richer TS/JS defaults (optional): `monaco.languages.typescript.javascriptDefaults.setCompilerOptions({...})` in `beforeMount` — only needed to tune, not to enable.

Sources:
- Local: `node_modules/monaco-editor/esm/vs/index.js` (entry registers all definitions)
- https://github.com/suren-atoyan/monaco-react (README §onValidate — the two language groups)
- Confidence: **HIGH** (entry file read directly).

---

## 6. Theme — `vs-dark` / `vs` built-in

Verified in `node_modules/monaco-editor/esm/vs/editor/standalone/browser/standaloneThemeService.js`:
- `VS_LIGHT_THEME_NAME = 'vs'`, `VS_DARK_THEME_NAME = 'vs-dark'` (+ `hc-black`, `hc-light`). These four are the only built-ins.
- `@monaco-editor/react`'s `theme` prop is passed straight to `monaco.editor.setTheme(theme)` (verified in dist source). So:
  - Dark: `theme="vs-dark"` ✅
  - Light: `theme="vs"` ✅ (avoid the component default `"light"` — monaco has no `'light'` theme registered; `setTheme('light')` silently falls back to `vs`, which happens to be correct, but be explicit).
- **"Dark+/Light+" are NOT bundled as named themes.** `vs-dark` IS the VS Code Dark+ default color palette (monaco is generated from VS Code sources), so `theme="vs-dark"` is visually "VS Code dark". To match the app's Claude palette exactly, define a custom theme once in `monaco.ts`:

```ts
monaco.editor.defineTheme('yzpz-dark', {
  base: 'vs-dark', inherit: true,
  rules: [],
  colors: { 'editor.background': '#262626', 'editor.foreground': '#c3c1ba', ... },
});
```

Then `theme={isDark ? 'vs-dark' : 'vs'}` (or `'yzpz-dark'`) follows the app's existing dark/light toggle.

Sources:
- Local: `standaloneThemeService.js` (constants + `_knownThemes.set(VS_LIGHT/DARK...)`)
- https://github.com/suren-atoyan/monaco-react (README props: theme enum, "Define new themes by monaco.editor.defineTheme")
- Confidence: **HIGH**.

---

## 7. manualChunks + bundle strategy

Add to the existing `build.rollupOptions.output.manualChunks` in `app/vite.config.ts`:

```ts
monaco: ['monaco-editor', '@monaco-editor/react', '@monaco-editor/loader'],
```

- Workers are emitted by Vite as **separate asset files** automatically — they do not inflate the main/monaco JS chunk.
- monaco-editor full ESM is heavy (~3–4 MB minified, ~1 MB gzip). Since the app only opens the editor in the "editor" workspace view:
  - **Lazy-load the editor component**: `const MonacoFileEditor = React.lazy(() => import('./MonacoFileEditor'))` inside `FileEditor`/`Workspace` (the project already lazy-loads routes this way).
  - Keep the `codemirror` manualChunk during the transition; delete it + the CodeMirror deps after the swap is verified.
- Optional size trim (0.56.0 added tree-shakeable entry points per CHANGELOG): `monaco-editor/editor` + `monaco-editor/features/register.all` + `monaco-editor/languages/definitions/register.all`. Not required; the full entry + lazy-load + chunk split is the low-risk path.

Sources:
- Local: `app/vite.config.ts` (existing manualChunks), `node_modules/monaco-editor/CHANGELOG.md` (0.56.0 entry points)
- Confidence: **HIGH**.

---

## 8. Recommended `<Editor />` usage (feature mapping)

All option names below verified in `node_modules/monaco-editor/monaco.d.ts` (0.56.0).

```tsx
import Editor from '@monaco-editor/react';
import { useAppStore } from '@/stores/appStore';

const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: showMinimap },
  wordWrap: wordWrap ? 'on' : 'off',          // 'off' | 'on' | 'wordWrapColumn' | 'bounded'
  fontSize,
  fontFamily: `'${editorFontFamily}', 'JetBrains Mono', 'Fira Code', Consolas, monospace`,
  tabSize,
  lineNumbers: editorLineNumbers,            // 'on' | 'off' | 'relative'  (LineNumbersType)
  bracketPairColorization: { enabled: editorBracketColorization },
  scrollBeyondLastLine: false,
  padding: { top: 12, bottom: 12 },
  renderWhitespace: 'selection',             // 'none'|'boundary'|'selection'|'trailing'|'all'
  formatOnPaste: true,
  formatOnType: false,
  quickSuggestions: { other: true, comments: false, strings: false },
  suggest: { preview: true, showWords: true },
  occurrencesHighlight: 'singleFile',
  folding: true,
  guides: { indentation: true, bracketPairs: true },
  stickyScroll: { enabled: true },           // VS Code "sticky scroll" — see breadcrumbs note
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  cursorBlinking: 'smooth',
  smoothScrolling: true,
  renderLineHighlight: 'all',
  automaticLayout: true,                     // already the wrapper default; explicit for clarity
  fixedOverflowWidgets: true,                // keeps suggest widget inside webview
};

<Editor
  height="100%"
  path={tab.path}                       // multi-model: one model per file (undo stack/view state preserved per tab)
  language={tab.language}
  value={tab.content}
  theme={isDark ? 'vs-dark' : 'vs'}
  options={EDITOR_OPTIONS}
  loading={<Spinner />}
  onChange={(value) => handleChange(tab.path, value ?? '')}   // debounce → updateFileContent(path, content)
  onMount={(editor, monaco) => {
    editorRef.current = editor;
    // cursor position → status bar
    editor.onDidChangeCursorPosition((e) => setCursor(e.position));
    // format on save (JS/TS/JSON/HTML/CSS only)
    if (formatOnSave) editor.addAction({
      id: 'save-format', label: 'Format on Save',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => { saveFile(); editor.getAction('editor.action.formatDocument')?.run(); },
    });
    // optional: Ctrl+S plain save when formatOnSave is off
  }}
/>
```

**Dirty-state / auto-save wiring** — reuse the existing store (already has the right shape; verified in `appStore.ts` + `types/index.ts`):
- `FileTab { path, name, language, content, originalContent, isDirty }`
- `updateFileContent(path, content)` sets `isDirty = originalContent !== content` — feed it from `onChange` (debounced by `autoSaveDelay` from settings, which already exists).
- `markFileSaved(path)` clears dirty after a successful `save_file` invoke.
- Monaco is controlled via `value`; the wrapper guards programmatic updates so typing into the editor does not fight `onChange` (verified in dist: an internal `B` flag skips `onChange` during `value`-prop sync).

**Built-in feature mapping (verified in 0.56.0 contrib tree):**

| Requested feature | Status in 0.56.0 | Evidence |
|---|---|---|
| Find/Replace (Ctrl+F) | ✅ built-in | `contrib/find/browser/findController.js` present |
| Command palette (Ctrl+Shift+P) | ✅ built-in | `contrib/quickAccess/browser/commandsQuickAccess.js` present |
| Go to line (Ctrl+G) | ✅ built-in | `contrib/quickAccess/browser/gotoLineQuickAccess.js` + `standaloneGotoLineQuickAccess.js` present |
| Go to symbol / definition | ✅ built-in | `gotoSymbol`, `documentSymbols`, `peekView` contribs present |
| Minimap, word wrap, line numbers, bracket colorization, folding, inlay hints, suggest, hover, rename | ✅ all present | `monaco.d.ts` options + contrib dir listing |
| **Breadcrumbs** | ❌ **REMOVED in 0.56.0** | No `breadcrumbs` in `monaco.d.ts`; no `breadcrumbNavigation` contrib (only `diffEditorBreadcrumbs`); grep of esm tree → 0 breadcrumb-UI files |
| Format on save | ✅ via action `editor.action.formatDocument` (JS/TS/JSON/CSS/HTML only) | `contrib/format/browser/formatActions.js` (id verified) |

**Breadcrumbs decision (important):** the standalone Monaco 0.56.0 does **not** ship the VS Code breadcrumbs bar (removed upstream; only `diffEditorBreadcrumbs` remains). Options:
1. Accept `stickyScroll` (present ✅) as the "path context" replacement — zero code.
2. Build a small React breadcrumb bar above the editor using `monaco.languages.getFoldingRanges`/outline (`editor.getAction('editor.action.quickOutline')`) — moderate effort, full control, matches the app's UI.
3. Pin an older monaco (≤0.5x where breadcrumbs still shipped) — NOT recommended; loses 0.56 fixes.
Recommendation: **(1)** now, **(2)** if product wants the exact VS Code chrome.

Sources:
- Local: `monaco.d.ts`, `esm/vs/editor/contrib/` listing, `@monaco-editor/react` dist, `appStore.ts`, `types/index.ts`
- https://microsoft.github.io/monaco-editor/ (playground/API docs)
- Confidence: **HIGH** (all from installed 0.56.0 + dist source).

---

## Summary of key decisions

1. **monaco.ts**: use the exact Vite `?worker` pattern from the monaco-react README — module-level `MonacoEnvironment` + `loader.config({ monaco })`, imported once before any editor mounts.
2. **vite.config.ts**: no worker config needed; keep default `iife`; only add the `monaco` manualChunk (and optionally lazy-load the editor component).
3. **Tauri**: `csp: null` + WebView2 → workers work; offline guaranteed (loader never hits CDN when `monaco` is passed). Linux clipboard (tauri#14309) and macOS Cmd+Z (tauri#9426) are the only known webview quirks — both out of scope for this Windows target.
4. **Languages**: all 10 requested auto-register; real IntelliSense only for JS/TS/CSS/JSON/HTML (worker-backed) — Python/Rust/Java/C++/Markdown are tokenization-only (same as CodeMirror before).
5. **Theme**: `theme="vs-dark"` / `theme="vs"` built-in; define a custom Claude-matched theme via `defineTheme` if desired.
6. **Breadcrumbs are NOT available in monaco 0.56.0** — use sticky scroll now; optional custom breadcrumb bar later. This is the one feature-parity gap vs the current plan.
7. Everything else (Ctrl+F, Ctrl+Shift+P, Ctrl+G, minimap, bracket pairs, format-on-save action, dirty tracking via existing `appStore`) is built-in and verified against the installed packages.
