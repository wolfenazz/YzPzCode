# Design studio: AI-designed app screens, web pages and graphics

## Context
YzPzCode has three studios (Writing, Presentation, Sheets). The user wants a fourth, **Design**, modelled on Google Stitch:
- **App:** mobile app screens (prototype flows).
- **Web:** website pages.
- **Graphic:** banners, social posts, posters and thumbnails at any aspect ratio and resolution.

It has two parts:
- **Composer.** Stitch's layout: one prompt box, an App / Web / Graphic switch, +attach, a style button, an engine chip, send, and suggestion chips.
- **Studio.** Stitch's layout: an infinite dot-grid canvas with artboards side by side, a design-system board first, the chat / agent log on the left, a floating prompt bar, a tool rail on the right and a zoom % readout.

Decisions the user made:
- **Look:** Stitch's layout with the app's theme tokens (light and dark, no aurora glow).
- **Format:** **HTML + CSS for App / Web screens, SVG for Graphics.**
- **Editing:** AI plus light edits: edit text in place, swap pictures, edit the code; no drag-to-lay-out editor for HTML.
- **Exports:** PNG/JPG, HTML/code, PDF, and Send to a coding agent.

Design taste from memory: minimal, hairlines, ink primary button, sentence case, no hero marketing copy or accent headline words. Arabic and RTL are first-class.

The old `components/designer/` page ("YzPzDesgin", a template generator with no AI) is unreachable; nothing imports it since commit 16720b4. Delete it in phase 1 and borrow only its iframe preview idea and "Send to agent" prompt.

---

## 1. Data model and storage
Files go under `Documents/YzPzCode/Designs/<slug>/<slug>.yzdesign` (JSON), with `assets/`, `.previews/`, `.history/` and `exports/` beside it. Attachments dropped before the project exists go to `Designs/.attachments` (the same pattern as `Presentations/.attachments`).

New `app/src/utils/design/` folder, dependency-free and tested:
- **`types.ts`**
  ```ts
  type DesignKind = 'app' | 'web' | 'graphic';
  interface DesignProject {
    version: 1; id; title; kind; prompt; language; created; updated;
    system: DesignTokens;
    boards: Board[];
    attachments: DesignAttachment[];        // reuse the presentation shape
    chat: ChatEntry[];                      // user turns + AI summaries + run steps (agent log)
    engine?: EngineChoice;
  }
  interface Board {
    id; name; brief;
    format: 'html' | 'svg';
    width; height;                          // app/web: viewport width; height measured from content (min = device height)
    preset?: string;                        // 'iphone-15', 'desktop-1440', 'ig-post'…
    x; y;                                   // position on the canvas
    source: string;                         // sanitized HTML or SVG
    status?: 'pending' | 'drawing' | 'done' | 'failed';
    hidden?: boolean;
  }
  interface DesignTokens {
    name; concept; dark;
    palette { background, surface, text, muted, primary, secondary, accent };
    fonts { heading, body };
    type { display, h1, h2, body, caption };
    radius; spacing; motif; imagery;
  }
  ```
- **`formats.ts`:** size presets.
  - App: phone 390×844, large phone 430×932, tablet 820×1180.
  - Web: desktop 1440, laptop 1280, mobile web 390.
  - Graphic:
    - Instagram post 1080², portrait 1080×1350, story/reel 1080×1920.
    - YouTube thumbnail 1280×720, YouTube banner 2560×1440.
    - X header 1500×500, LinkedIn banner 1584×396, Facebook cover 1640×624.
    - Web hero 1920×1080, leaderboard ad 728×90, rectangle ad 300×250.
    - A4 / US Letter poster at 150 dpi, square logo 1024², custom W×H (64–8000).
  - Also: `fitTypeScale(tokens, canvas)` scales the type limits by canvas size. This replaces the 1280-wide slide clamps in `sanitizeDesignSystem`.
- **`project.ts`:** `parseProject` (repairs and re-sanitizes every board, like `deck.ts` `parseDeck`), `serializeProject`, `slugify`, the folder constants, and auto-layout of board positions (a row with a 120px gap; the design-system board at x=0).
- **`tokensCss.ts`:** `tokensToCss(tokens)` writes a `:root{--ds-primary…--ds-font-heading…--ds-radius…}` block. **HTML screens must use these variables**, so changing a colour or font in the Design panel restyles every screen instantly, with no AI call. For SVG graphics, use `slideEdit.ts` `paletteColorMap` + `applyThemeMap` (+ `fixTextContrast`).

## 2. Untrusted output: sanitizers
- **SVG (Graphic):** reuse `utils/presentation/svgSafe.ts` `sanitizeSvg(raw, canvas)` and `prepareSvgForDisplay` unchanged; they already work at any size.
- **HTML (App / Web): new `utils/design/htmlSafe.ts` `sanitizeHtml(raw, {width})`:**
  - Parse with `DOMParser`.
  - Drop `script`, `iframe`, `object`, `embed`, `base`, `meta[http-equiv]`, `link` (all of them), `form[action]`, and every `on*` attribute.
  - Allow only `javascript:`-free hrefs. `src` may only be `assets/…`, `data:image/…` or the `photo:` placeholder (see section 6).
  - Strip `url()` / `@import` to anything else inside `<style>` and `style=""`.
  - Repair cut-off markup.
  - Stamp a stable `data-yz="n"` on every element. In-place edits and element picking address elements by this id.
  - Keep `<style>` blocks; the app adds the token sheet and bundled `@font-face`.
- **Display:** `<iframe sandbox="allow-same-origin" srcdoc>`, with no `allow-scripts`, so nothing the model writes can run. The CSP meta is `default-src 'none'; style-src 'unsafe-inline'; img-src data: yzpzmedia:; font-src data: yzpzmedia:`. `allow-same-origin` lets the parent read the frame's DOM for measuring height, picking elements and editing text. `assets/` resolves through `localFileUrl` (as `prepareSvgForDisplay` does). Icons are inline SVG, written by the model and allowed by the contract; there is no icon-font CDN.

## 3. AI pipeline: `components/design/useDesignStudioGenerator.ts`
This is the same shape as `components/presentation/useDesignGenerator.ts`, with its own session store.
- **Runner:** `utils/writing/aiClient.ts` `startAiRun` (engines, streaming, images for Claude / Codex, `webSearch`). Copy the `runAi` wrapper pattern: the run trace and cancel-all on unmount.
- **Pass 1, direction:** `utils/design/prompts.ts` `buildDirectionPrompt({kind, formats, prompt, sources, pictures, language, style})` → `parseDirection`. It returns `DesignTokens` and a board list (name, brief, preset, optional `photo` search words). App and Web get 3–6 screens unless the prompt names a number. Graphic gets one board per chosen size, plus optional variations.
  - Reuse `designStyles.ts` `VISUAL_STYLES` as the style catalog behind the composer's style button.
  - Reuse `fontCatalog.ts` (Arabic-capable faces when `isRtlLanguage`).
  - Reuse `gatherSources` for attached documents.
- **Pass 2, drawing:** `buildBoardPrompt`.
  - The first board is drawn alone and passed as the identity reference; the rest run 1 board per call, 5 calls at once (the same constants and worker pool as the deck).
  - Reply blocks are `<board n name>…</board>`, parsed by a new `extractBoardBlocks` (generalised from `extractSlideBlocks`; it accepts an unclosed final block).
  - **HTML streaming:** throttled (~400 ms) re-renders of the partial HTML into the board's iframe, so the user watches the screen build. SVG appears as soon as each block closes.
- **Contracts in the prompt:**
  - `htmlContract(kind, width)`: one self-contained document, CSS in `<style>`, `var(--ds-*)` for every colour, font, radius and spacing; flex/grid layout; realistic content; inline SVG icons; `<img src="photo:words">` for photos; no scripts; RTL via `dir`.
  - `graphicContract(canvas)`: the presentation `svgContract`, made size-aware, with the PowerPoint-only wording and the 48/64 px slide margins removed; margins are proportional to the shorter side.
  - Plus `DESIGN_CRAFT`-style guidance per kind: app (status bar, safe areas, bottom nav, 44px tap targets), web (sections, max-width container, hero), graphic (focal point, hierarchy, legibility at thumbnail size).
  - Add `rtlRules` and `rtlWritingRules` when the language is RTL.
- **Edits, all as proposals with Keep / Discard / hold-for-before (same UX as decks):**
  - `refine(boardIds, instruction, picked?)`: whole project, the selected boards, or a picked element. `picked` sends the element's `data-yz` id and its outer HTML, so "here" is precise. Several boards go through a refine-many pool of 4 with a batch review.
  - `addBoard(description, preset)`: a new screen or size in the same system.
  - `variations(boardId, n=3)`: Stitch's "Remix"; places alternatives beside the original and the user keeps one.
  - `resize(boardId, preset)` (Graphic): redraws an existing banner at another aspect ratio.
  - `restyle(instruction)`: new tokens only. For HTML that is instant, through the token sheet; for SVG it goes through `applyThemeMap`.
- **Pictures:** attached pictures go to engines that can see them (`deckPicturePreview`, `picturesToShow` / contact sheets, `MAX_ATTACHED` = 6). Folder and path mentions use `designPictures.ts` `findMentionedPaths` / `scanFolderPictures`.

## 4. State
- **`stores/designStore.ts`** (persisted as `yzpzcode-design`): default engine and model, default kind, last graphic sizes, language, animation-free defaults, `aiTimeoutSecs`, and a sanitising `merge` like `sheetsStore`.
- **`stores/designSessionStore.ts`:** per workspace. Holds the open project, selection (board ids, picked element), viewport (pan, zoom), proposal or batch, run trace, and whole-project undo/redo through `edit(fn, {skipHistory, coalesce})` (same API as `presentationSessionStore`). Also `closeWorkspace(id)`.
- **`components/design/useDesignDocument.ts`:** loads and saves (debounced), snapshots to `.history/` every 5 minutes, lists recent projects for the home (cover = the first board's PNG thumbnail in `.previews/cover.png`), and deletes to the workspace trash (as recent decks do).

## 5. UI: `components/design/` (`.dz-*` classes in `design-studio.css`, theme tokens only, built on `components/studio/`)
- **`DesignWorkspace.tsx`** (props `{workspace, visible}`, default export): switches between home and studio.
- **`DesignComposer.tsx`, the Stitch-style home:**
  - A plain title ("What shall we design?"); no hero copy.
  - A large rounded hairline box: auto-growing textarea, with the placeholder following the mode ("What mobile app shall we design?" / "…website…" / "…graphic…").
  - Bottom row, left: `+` for files and a folder, then the **App / Web / Graphic** segmented control.
  - Bottom row, right:
    - a size chip: device for App, width for Web, a multi-select size picker with presets and custom W×H for Graphic;
    - a style button (palette icon → `VISUAL_STYLES` grid, "AI decides" by default);
    - an engine chip (`EnginePicker` compact);
    - send (↑, disabled under 8 characters; Ctrl+Enter).
  - Attachment chips above the row (reuse `ComposerFile` / `UseSelect`).
  - Three suggestion chips per mode under the box.
  - Below that, a "Recent" grid of project thumbnails.
  - Drop, paste and path mentions behave as in `components/presentation/DesignComposer.tsx`, which is the template.
- **`DesignStudio.tsx`, the studio:**
  - **Top bar:** `StudioTopBar` (← Designs, title, "App · saved", a run slot with progress and Stop); actions are **Variations** (Stitch's Remix) and **Export**.
  - **Left panel** (`Inspector side="left"`, collapsible):
    - **Chat / agent log** (`DesignChat.tsx`): the original prompt pinned at the top as a collapsible chip, AI summaries of what was made (screen list and design-system notes, as in Stitch), and an "Agent log" disclosure with the run steps.
    - **Design** tab (`DesignTokensPanel.tsx`): palette, fonts (`FontOptions`), radius, type scale, Restyle with AI, one-click Undo.
  - **Canvas** (`DesignCanvas.tsx`): a dot-grid background (a CSS radial-gradient sized with zoom), a world `div` with `transform: translate() scale()`, wheel and pinch zoom around the cursor, Space-drag or the hand tool to pan, fit-to-content on open, and boards placed at `x, y`.
    - Each board (`BoardFrame.tsx`) shows a label above it (device icon, name, size) and renders `HtmlBoard` (iframe at its natural size; content height measured after load and on font load) or `SvgSlide` (graphic).
    - Iframes get `pointer-events:none`; one transparent overlay per board handles hover, select, drag-to-move and double-click.
    - The design-system board (`SystemBoard.tsx`) is rendered locally from the tokens: swatches, "Aa" type ramp, buttons and inputs.
  - **Tool rail** (right, floating): Select, Pick element (hover outline inside the frame via `contentDocument.elementFromPoint`, click to target the AI), Hand. **Bottom right:** help and a zoom % menu (Fit, 25 / 50 / 100 / 200%).
  - **Floating prompt bar** (bottom centre, `DesignPromptBar.tsx`):
    - Scope chips: whole design / N selected boards / picked element.
    - Instruction box, attach, engine chip, send.
    - Quick actions ("More whitespace", "Dark mode", "Add a screen", "Make it bolder", "Translate to Arabic").
    - The proposal bar (Keep / Discard / hold Before) sits here while a review is open; a multi-board review uses `BatchReview`-style before/after cards.
  - **Light edits:**
    - Double-click text in an HTML board → `contentEditable` on that `data-yz` element inside the frame; on blur, write the text back into `source` by id (one undo step).
    - Double-click an image → a picture menu (from file, web photo search via `StockImagePicker`, remove).
    - SVG graphics use `SlideStage` (in-place text, picture swap, move/resize come free) with `canvas = {width, height}`.
    - **Code** drawer (`BoardCode.tsx`, CodeMirror HTML/SVG): edit and Apply, which re-sanitizes; Copy.
  - **Right-click menu on a board:** Rename, Duplicate, Variations, Resize to… (Graphic), Redraw, Hide, Delete, Copy code, Export this board.
  - **Keys:** Del, Ctrl+D / Z / Y / A, 0 = fit, 1 = 100%, H / V tools, Esc.

## 6. Web photos
Web photos are real, openly licensed photos and never AI images (the user's rule):
- The model writes `<img src="photo:modern kitchen interior" alt>` in HTML, or `<image href="photo:…">` in SVG.
- After each board, `fillBoardPhotos` collects the queries and calls `utils/webPictures.ts` `fetchWebPictures(queries, assetsDir, engine, {prefer by aspect})` (Openverse, Unsplash, Pexels or AI search, per Settings → Presentation → Images).
- It rewrites `src` to `assets/…` and stores the credit in `attachments`.
- A query that fails leaves a neutral placeholder block, never a drawn illustration.
- The direction pass may plan photos per board (reuse `WEB_PHOTO_RULES` and `photosRequested`).

## 7. Exports: `components/design/DesignExportDialog.tsx` + `utils/design/export.ts`
Choose all boards or the selected ones:
- **PNG / JPG at 1× / 2× / 3×.**
  - SVG: generalise `designAssets.ts` `slideSvgToPng(svg, size: DeckSize…)` to take `{width, height}`. Keep a `DeckSize` overload for the deck callers.
  - HTML: the same `foreignObject` → canvas technique as `utils/presentation/rasterize.ts`. Inline every `assets/` image as a data URL and embed fonts with `bundledFontFaceCss` first.
  - Several boards go into one zip (JSZip).
- **HTML / code.** One standalone `.html` per board (tokens, fonts and images inlined), or a zip with `index.html` linking the screens, `tokens.css`, `assets/` and a `DESIGN.md` describing the system and screens (the old designer's idea).
- **PDF.** One page per board at its own size through named `@page` rules (`@page b1 { size: Wpx Hpx }`), printed by the existing `export_writing_pdf`.
- **SVG.** Graphic boards only, via `standaloneSvg`.
- **Send to a coding agent.**
  - Write the code export into `exports/handoff-<date>/`.
  - List targets: agent terminals of open coding workspaces, plus extension panels (`extension:<panelId>`), the same list `BrowserPane` builds for its inspector (`sessionOptions`).
  - Send a prompt ("Implement these screens… files at <path>… design tokens…") with `components/workspace/browser/browserModel.ts` `submitBracketedPaste` or `utils/extensionPrompt.ts` `sendPromptToExtensionPanel`.
  - Optionally switch to that workspace.

## 8. Wiring the fourth studio (checklist from exploration)
Only three of these fail the build if they are missed, so go through every line:
- `types/index.ts:6,8`: add `'design'` to `WorkspaceView` and `WorkspaceKind`.
- `utils/workspaceView.ts:8,12`: `isStudio` and `homeViewFor`.
- `utils/workspaceSetup.ts:9`: `studioDefaultName` → "Design studio".
- `hooks/useWorkspace.ts:307`: set the view after creation. The `studio` flag at line 160 already covers it.
- `App.tsx:124`: restore.
- `WorkspaceHeader.tsx:112-122`: view label "Canvas" (plus Files / Research).
- `viewIcons.ts`: add `design` icon bodies.
- `hooks/useDiscordPresence.ts:35`: "Designing".
- `Workspace.tsx`:
  - lazy import;
  - `designMounted` state, mount effect (110-121);
  - Ctrl+E (333-342);
  - close cleanup that calls `useDesignSessionStore.closeWorkspace` (392-418);
  - the keep-alive layer (675-689 pattern).
- `WorkspaceConfigForm.tsx`:
  - `designing` flag;
  - a `RubberSegment` item "Design" with the `PenNib` icon;
  - every per-kind ternary (button label, title, subtitle, hint, step label, "Saved in", "Opens as", summary rows);
  - `DesignSetupSection.tsx` (engine grid, default kind, language).
- `WorkspacePreview.tsx`: `DesignMock`, a small dot-grid with three artboards drawing in; CSS `.ws-design*` in `setup.css`.
- `SettingsScreen.tsx`: a "Design" section → `sections/SettingsDesign.tsx` built from `SettingsKit` (engine, default kind and sizes, AI timeout, a link to the Images settings).
- `assets/docs/index.ts` + `pages/design-studio.ts`.
- `vite.config.ts`: a manual chunk only if the bundle grows.
- **Rust:** none. Update the stale comments in `get_studio_root`.
- **Remove** `components/designer/` (14 files, unreachable).
- **CLAUDE.md:** add a "Design studio" section, and update the Designer section.

## 9. Arabic / RTL
- `language` on the project uses `isRtlLanguage` / `languageTag`: HTML gets `<html dir lang>` and the prompts use logical CSS properties; SVG goes through `normalizeRtlText` (already in `sanitizeSvg`).
- The style and font pickers put Arabic-capable faces first (`FontOptions`).
- `forLanguage` swaps Latin-only fonts the AI picked.
- The quick action "Translate to Arabic" mirrors the layout.

## 10. Phases
1. **Wiring + composer + storage.** Studio kind end to end, `DesignComposer`, `project.ts`, the stores, `formats.ts`, the empty canvas. Delete `components/designer/`.
2. **Generation.** Direction + drawing for all three kinds, HTML sanitizer, iframe boards with streaming, SVG boards, system board, web photos.
3. **Canvas studio.** Pan/zoom/select/move, tool rail, chat and agent log, prompt bar with scopes, proposals and batch review, element picking, Variations, Add screen, Resize (graphic), token panel with instant restyle.
4. **Light edits + code drawer + exports** (PNG/JPG, HTML zip, PDF, SVG, Send to agent).
5. **Settings, docs, Discord, CLAUDE.md, tests.**

## Reuse summary
| Need | Existing code |
|---|---|
| AI runs, streaming, images | `utils/writing/aiClient.ts` `startAiRun`, `listWritingEngines` |
| Engine picker | `components/presentation/EnginePicker.tsx` |
| Composer behaviour (drop, paste, paths, chips) | `components/presentation/DesignComposer.tsx`, `designPictures.ts`, `designAssets.ts` (`saveDroppedFile`, `scanFolderPictures`, `picturesToShow`, `deckPicturePreview`) |
| Style catalog, fonts | `utils/presentation/designStyles.ts`, `utils/writing/fontCatalog.ts`, `components/studio/FontOptions.tsx`, `utils/bundledFonts.ts` |
| SVG safety, display, editing | `svgSafe.ts`, `SvgSlide.tsx`, `SlideStage.tsx`, `svgText.ts`, `slideEdit.ts` |
| Proposal / batch review UX | `DesignedAiPanel.tsx`, `BatchReview.tsx` |
| Web photos | `utils/webPictures.ts`, `utils/writing/pictures.ts`, `StockImagePicker.tsx` |
| Studio chrome | `components/studio/StudioTopBar.tsx`, `Inspector.tsx` |
| Studio folder | `utils/studioRoot.ts` `getStudioRoot` |
| PNG / PDF | `designAssets.ts` `slideSvgToPng` (generalise), `rasterize.ts` technique, `export_writing_pdf` |
| Hand-off to agents | `browserModel.ts` `submitBracketedPaste`, `utils/extensionPrompt.ts` |
| RTL | `utils/writing/rtl.ts`, `labels.ts`, `rtlWritingRules`, `rtlRules` |

## Verification
- **`npm run test:design`** (new `scripts/design.test.mjs`, which transpiles `utils/design/` the way `sheets.test.mjs` does). It covers:
  - `sanitizeHtml`: scripts, `on*` attributes, external URLs and `@import` removed; `data-yz` stamped; cut-off markup repaired;
  - `extractBoardBlocks` streaming and final;
  - `parseDirection`;
  - `parseProject` repair;
  - `formats` and `fitTypeScale`;
  - the `photo:` rewrite;
  - `tokensToCss`;
  - named-page print HTML.
- Extend `test:workspace-view` and `test:workspace-setup` with `design` cases. Run `test:presentation` after generalising `slideSvgToPng`.
- `npx tsc --noEmit`; `cargo check` (comments only).
- **Visual check** (memory's method): a throwaway Vite harness page with stubbed stores plus a headless Edge screenshot of the composer (light and dark), the canvas with 4 app screens, a graphic set (1080², 1080×1920, 1500×500) and an Arabic project.
- **Manual in `npm run tauri dev`:**
  - Create an App project, then a Web project, then a Graphic project with 3 sizes; watch them stream.
  - Pick an element and refine it; Keep, then Undo.
  - Edit text in place; swap a picture for a web photo.
  - Export PNG@2x, the HTML zip and the PDF; send to a Claude Code terminal in a coding workspace.
  - Restart the app: the project reopens in the Canvas view.
