# Design studio, round two: control, polish and starting points

## Context
Phases 1–5 of `design-studio-plan.md` are built: composer, two-pass generation, canvas with pan/zoom/move, AI refine with Keep/Discard, element picking, text and picture edits, token panel, exports. Two problems remain:

1. **Little direct control.** Apart from the palette, fonts, radius, text and pictures, every change goes through the AI. Users cannot set a size, a spacing value or a colour on one element, see the structure of a board, align boards, or go back to an earlier version.
2. **Unfinished UI.** From the screenshot (graphic project, 1 board):
   - The prompt bar's scope chip reads **"All 1 boards"**: a plural bug.
   - The design-system board has a **black empty block** under its card. `SYSTEM_BOARD` is a fixed 640×480 and the card is shorter.
   - The top-bar title is the cut-off prompt ("A square announcement post for a"), not a name.
   - The Board tab is an empty sentence when nothing is selected. That is a 300px panel showing nothing.
   - The side panel uses its own `.dz-tabs` / `<select>` / bare `<input type=color>`, not `components/studio/` (`InspectorTabs`, `Section`, `Field`, `ColorInput`, `Slider`, `FontOptions`). It looks different from the other three studios, and its font list is not grouped with Arabic faces first.
   - The tool rail has three unlabelled icons. The zoom readout and the prompt bar compete in the bottom row, and the boards show no state other than their pixels.

**Reference: open-design (github.com/nexu-io/open-design).** Ideas worth taking, adapted to our stack (no scripts in boards, Rust-free, studio taste):
- Scenario templates and a prompt library: one click loads a structured brief.
- `DESIGN.md` design systems that can be saved, reused, imported, and made from a screenshot or URL.
- Curated visual directions offered when no brand is given.
- A **tweaks panel**: the AI emits a manifest of knobs, and the frame re-renders with no AI call.
- Device frames.
- A five-dimension **self-critique** gate plus an artifact lint.
- **Comment-mode surgical edits.**
- Memory of the fonts, palettes and references a user keeps.
- Social carousel and email templates.
- Hand-off as React / Next / Vue.

Not taken:
- AI images or video. Our rule is real web photos only.
- Brand-clone systems (Stripe, Apple…). Kits are the user's own or ours.
- The plugin marketplace.

Taste rules from memory still apply: minimal, hairlines, ink primary button, sentence case, no hero copy, and Arabic/RTL first-class in every new control.

---

## Progress
- **Built:** phase 6 (tweaks), phase 7 (preview, links, responsive copies, states), phase 5 (templates, example prompts, email, carousel), phase 1 (polish and bugs), phase 2 except the slide editor for graphics, phase 3 (marquee, snapping, arrange, board menu, clipboard, minimap, shortcut sheet, width resize, device frames, off-screen boards), phase 4 (design system editor, kits, three directions, recent systems).
- **Also built:** layout editor for graphics, spacing overlays, multi-element style edits, element-level flow arrows, preview transitions, state groups, join-in-a-row and numbered series exports, Restyle with AI, kit from a web page.
- **Also built:** cached previews of far-away boards, tweaks for graphics, text format bar in the graphic layout editor.
- **Open:** phases 8–10.

## 0. Target layout
```
┌ ← Designs │ Grand opening post ▾  Graphic · 1 board · Saved      ⟲ ⟳ │ Preview  Share/Export ┐
├──────────────┬───────────────────────────────────────────────────────┬────────────────┤
│ Layers │ Chat│                                                       │ Inspector      │
│ ▸ Grand open │      [Design system]      [Board label · 1080² · ⋯]   │ (contextual:   │
│   ▸ header   │                           ┌─────────────┐             │  project /     │
│   ▸ hero     │                           │             │             │  board /       │
│   ▸ footer   │                           │   board     │             │  element /     │
│ + Add board  │                           └─────────────┘             │  multi)        │
│ Assets       │                                                       │                │
│ History      │   ┌ scope · instruction · ⊕ · engine · ↑ ┐            │                │
│              │   └ quick actions for this scope         ┘            │                │
│              │  [V P H C | ⊞ align] ……………………………………  [map][− 64% +] │                │
└──────────────┴───────────────────────────────────────────────────────┴────────────────┘
```
- **Left (collapsible, 260px):** tabs **Layers / Chat / Assets / History**.
- **Right (collapsible, 280px):** **Inspector**, contextual like Figma's. With nothing selected, it shows the project and design system. With boards selected, it shows board properties. With an element picked, it shows element properties.
- **Canvas toolbar:** at the bottom left, labelled tools with shortcut tooltips, replacing the floating right rail. The zoom menu and minimap go at the bottom right. The prompt bar stays centred and never overlaps them; the bar's width is clamped between the two clusters.
- Both panels are built from `components/studio/Inspector.tsx` parts, and `.dz-tabs`, `.dz-field` and `.dz-select` are retired. Panel open/width state goes in `designStore` (persisted).

---

## Phase 1: Polish and bugs (small, do first)
- `DesignPromptBar.tsx`: scope text "Whole design" / "1 board" / "N boards" / "This element"; pluralise everywhere through a tiny `plural(n, word)` helper.
- **System board:** render it as a measured spec sheet (`SystemBoard.tsx`) instead of a fixed 640×480:
  - palette with role names and hex;
  - type ramp (display → caption, in the real faces, with sizes);
  - radius and spacing scale;
  - sample button, input and card;
  - motif and imagery notes.
  - Height comes from content via `onBoardHeight`, as HTML boards already do. Clicking a swatch or a type row opens that token in the Inspector.
- **Title:** after art direction, set `project.title` from `direction.name` when the user never named it (same rule as Writing's `parseOutlineTitle`). The title input truncates with an ellipsis and has a tooltip.
- **Board labels** (`DesignCanvas.tsx`):
  - name · size · a status dot (drawing / failed / hidden / locked);
  - a `⋯` button that opens the board context menu (Phase 3);
  - a double-click on the label renames inline.
  - Labels never scale below 11px on screen; they hide below zoom 0.15.
- **Drawing state:** a pending board shows a skeleton (hairline frame, a shimmer under `.animations-disabled` rules, "Drawing…"). A failed board shows "Couldn't draw · Try again" in place.
- **Empty states:** Board tab removed (the Inspector replaces it). The Layers tab always has content.
- **Prompt bar:**
  - attach button (pictures as references; the same `ComposerFile` flow as the composer);
  - compact engine chip (`EnginePicker`);
  - quick actions chosen per kind and scope (`utils/design/quickActions.ts`):
    - Graphic: "Bigger headline", "Make a story version", "Add a web photo", "Simplify", "Translate to Arabic";
    - App: "Dark mode", "Add empty state", "Add loading state", "Bigger tap targets";
    - Web: "Add a pricing section", "Make it responsive (mobile board)", "Tighter copy";
    - Element: "Make it stand out", "Lighter", "Rewrite text", "Swap for a photo".
- Hover tooltips with shortcuts on every icon button (reuse `HelpTooltip` or `title`).

## Phase 2: Layers and the element inspector (the core of "control it perfectly")
**Layers tab** (`DesignLayers.tsx`):
- The board list in canvas order: drag to reorder, eye (hide), lock, rename, and a thumbnail at 24px.
- Expanding a board shows its **element tree**:
  - HTML: elements with `data-yz`, named by role (`header`, `nav`, `button "Get started"`, `img`, `section`), skipping wrappers with a single child.
  - SVG: top-level groups and elements (`svgText.ts` / `slideEdit.ts` element list, as `elementsForAi` does).
- Hovering a row outlines the element in the frame. Clicking picks it, and pick and Layers stay in sync through `session.picked`.

**New pure module `utils/design/domTree.ts`:** `elementTree(html) → TreeNode[]` (id, tag, label, children, hidden), with a cap on nodes like the browser capture (depth 8, 300 nodes). Tested.

**Element inspector** (right panel, HTML boards). It shows a breadcrumb of ancestors (click to climb; `Shift+Enter` = parent, `Enter` = first child, `Tab` = next sibling, as in Figma). Sections:
| Section | Controls | Writes |
|---|---|---|
| Text | content (multi-line, `dir="auto"`), font (`FontOptions`), weight, size, line height, letter spacing, align (start/centre/end/justify; logical), transform, colour | inline style |
| Fill | background: token swatch / custom colour / gradient (2 stops, angle) / none | inline style |
| Layout | display (block / flex / grid), direction, wrap, gap, align, justify, grid columns | inline style |
| Spacing | padding and margin, linked or per side (logical: block-start, inline-end…) | inline style |
| Size | width / height (auto, px, %, fill), min/max | inline style |
| Border | width, style, colour, radius (linked / per corner) | inline style |
| Effects | opacity, shadow presets (none / soft / medium / strong / custom), blur | inline style |
| Picture | replace (file / web photo / project asset), fit (cover/contain), focal position, alt text, credit | `src`, style, `alt` |
| Element | duplicate, delete, hide, move up/down among siblings, "Ask AI about this" (fills the prompt bar scope) | DOM |
- **Token binding:** colour and size controls show the system's tokens first. Picking one writes `var(--ds-primary)` / `var(--ds-radius)`, so later restyles still reach the element. A custom value shows a small "detach/attach to token" toggle, like Figma variables.
- Values shown are the **computed** style read from the frame (`contentWindow.getComputedStyle`). Only changed properties are written.
- **New pure module `utils/design/styleEdit.ts`:**
  - `getInlineStyle(html, yz)`;
  - `setElementStyle(html, yz, patch: Record<string,string|null>)`: merges into `style=""`, passes every value through `cleanCss`, and drops `url()` other than `assets/`;
  - `duplicateElement`, `removeElement`, `moveElement(html, yz, dir)`, `setAttribute` (allowlist: `alt`, `hidden`).
  - All of them restamp `data-yz` for new nodes. Tested with `scripts/design.test.mjs`.
- **Editing feel:**
  - Scrubbable number fields: drag the label to change the value; arrow keys ±1, Shift ±10.
  - Live preview while dragging (`skipHistory`), one undo step on release (the `edit` coalesce option).
  - Multi-pick (Shift+click two elements) edits the shared properties.
- **On-canvas overlays for the picked element:** the selection box, its padding/margin shaded (DevTools style), a size label, and a parent outline. Drawn in the canvas overlay layer (not inside the frame), positioned from `getBoundingClientRect` × zoom.
- **Graphic (SVG) boards:** swap `SvgSlide` for the presentation **`SlideStage`** when a graphic board is selected and "entered" (double-click or Enter). This gives move, 8 resize handles, snapping guides, multi-select, right-click and in-place text, using `canvas = {width,height}`. The element inspector for SVG reuses the presentation `FormatBar` / Format tab pieces (text, fill, outline, arrange/align, picture). This was in the original plan (§5) but never wired.

## Phase 3: Canvas fundamentals
- **Selection:**
  - marquee on empty canvas;
  - Shift/Ctrl+click toggles;
  - Ctrl+A selects all boards;
  - Esc climbs element → board → nothing.
- **Snapping and guides while dragging boards:** edges and centres of other boards, equal gaps (pink distance labels). Hold Alt to disable. The pure math goes in `utils/design/snap.ts` (tested); the presentation's `SlideStage` guides are the reference.
- **Arrange** (toolbar pop-over and Inspector with several boards selected):
  - align left / centre / right / top / middle / bottom;
  - distribute horizontally / vertically;
  - "Tidy up" (re-flow into rows by kind, `layoutBoards`).
- **Board context menu** (`DesignContextMenu.tsx`, portal, the `ExplorerContextMenu` pattern):
  - Rename, Duplicate, Variations, Make another size… (graphic) / Make mobile version (web) / Make tablet version (app);
  - Draw again, Hide, Lock, Copy as PNG, Copy code, Export this board, Delete;
  - on the empty canvas: Paste, Add board…, Fit all, Show grid / labels.
- **Clipboard:** Ctrl+C/V/D on boards (paste beside the source, offset when pasted twice) and on elements (paste after the picked element; HTML fragments go through `sanitizeHtml`).
- **Keys:**
  - arrows nudge boards (Shift ×10);
  - Shift+1 fits all; Shift+2 zooms to the selection; Ctrl+±;
  - `C` comment tool (Phase 8);
  - `?` opens a shortcut sheet (one modal, listing every key; also linked from Settings → Shortcuts).
- **Zoom menu:** Zoom in/out, Fit all, Zoom to selection, 50/100/200%, "Pixel preview" (1:1 at device pixel ratio).
- **Minimap** (toggle, 160×100, bottom right): board rects in their accent, the viewport box draggable.
- **Board resize:**
  - **Web:** drag the right edge to change the width. HTML reflows and the height is re-measured with no AI call (live responsive check), with snap points at 390 / 768 / 1024 / 1280 / 1440.
  - **App:** a device switcher.
  - **Graphic:** a size changes only through "Make another size" (an AI redraw) or a free "Change canvas" with content scaled (`viewBox` kept, preserveAspectRatio choice).
- **Device frames** (open-design): per board `frame: 'none' | 'iphone' | 'android' | 'tablet' | 'browser'`, drawn by the canvas around the board (SVG chrome in `components/design/frames/`, status bar and home indicator for phones, a URL bar for browser). They are excluded from the board's pixels unless "Include frame" is ticked in Export.
- **Performance:**
  - Boards outside the viewport (plus a margin), or when zoom < 0.2, render a cached PNG (`.previews/<boardId>.png`, refreshed after a change settles) instead of a live iframe.
  - At most ~12 live frames.
  - This keeps projects with 20+ screens smooth.

## Phase 4: Design system, kits and directions
- **Design tab → full system editor** (Inspector with nothing selected), from `Section` + `Field` + `ColorInput` + `Slider` + `FontOptions`:
  - **Colours:** 7 roles plus an optional extended set (success / warning / danger / border). A WCAG contrast badge on text/surface pairs reuses the `customTheme.ts` contrast helper, and **Fix contrast** uses `fixTextContrast`.
  - **Light/dark:** an optional second palette (`system.darkPalette`). The canvas can show a board in either mode (`[data-theme]` on the frame's root, with the tokens CSS writing both), and "Make dark version" needs no AI for HTML boards.
  - **Type:** heading/body faces, scale sliders (display… caption), weights, line height. A ratio preset (1.125 / 1.25 / 1.333 / 1.5) rebuilds the scale.
  - **Shape:** radius scale (sm/md/lg/full), spacing base (4/8), shadow scale (3 levels, written as `--ds-shadow-1..3`), border width.
  - **Restyle with AI** (exists), plus one-click **Undo**.
  - **Shuffle palette:** 5 harmonious alternatives generated locally from the primary (OKLCH), previewed on hover and applied on click.
- **Tokens CSS:** `tokensCss.ts` extended with the new variables, plus `htmlContract` asking boards to use them. Older projects get defaults through `normalizeTokens`.
- **Kits (saved design systems):** "Save as kit" stores `Designs/.kits/<slug>/kit.json` + `DESIGN.md` + `logo.*` + fonts list.
  - The composer's Style button shows **AI decides · My kits · Styles** (the 18 `VISUAL_STYLES`).
  - A kit fixes the tokens, so art direction only plans boards.
  - **Import:**
    - a `DESIGN.md` (parse the sections we write in `designMarkdown`, plus a free-form fallback through the AI);
    - **from a screenshot or picture** (Claude/Codex see it: an AI pass returns tokens with `parseDirection`'s schema);
    - **from a URL**: open it in the in-app browser and use the existing Pick-style capture (`browser.rs` style capture) to read computed colours and fonts, then an AI pass to name the roles.
  - **Export:** `DESIGN.md`, `tokens.css`, W3C design-tokens JSON, Tailwind `theme.extend`.
- **Visual directions before drawing** (open-design's "curated directions"). When the style is "AI decides" and the setting `exploreDirections` is on, pass 1 returns **3 directions**: name, palette, fonts, a one-line mood, and a 300px mini-sample rendered locally from tokens.
  - The studio shows them as cards on the canvas; the user picks one (or "mix: palette of A, type of B") and then pass 2 draws.
  - Off by default for graphics with a kit.
  - Pure: `parseDirections` (plural) in `prompts.ts`, tested.
- **Memory of taste** (open-design "memory"): `designStore.recent` keeps the last 10 kept palettes, font pairs and reference pictures. The composer's style menu shows "Recently used". No new storage format is needed.

## Phase 5: Templates and the prompt library
**`utils/design/templates.ts`**, dependency-free, the same shape as Writing's `reportTypes.ts`. Each template has:
- `{ id, kind, category, name, question (composer placeholder), fields (optional details, like Writing), boards: [{ name, brief, preset }], styleHint, sampleThumb }`;
- `sampleThumb` is a tiny hand-made SVG wireframe, not a screenshot and not AI art.

Categories (first set; each one is just data):
- **App:**
  - Onboarding (3 screens), Sign in / sign up, Home feed, Dashboard;
  - Profile, Settings, Checkout, Chat, Empty and error states;
  - Full app (5–8 screens from a description).
- **Web:**
  - SaaS landing, Pricing, Product page (e-commerce), Portfolio, Blog article;
  - Docs page, Admin dashboard, Waitlist / coming soon, 404, About / team.
- **Graphic:**
  - Social post, **Carousel** (3–10 cards with continuity), Story, YouTube thumbnail;
  - Event poster, **Magazine poster**, Quote card, Product launch, Infographic;
  - **Ad set** (one message at 1080², 1080×1920, 1200×628, 300×250, 728×90);
  - Email header, Business card (1050×600 at 300 dpi), Certificate (A4), Menu (A4).
- **Email** (new 4th kind, or a Web sub-kind):
  - 600px, table-safe HTML (open-design's `email-marketing`);
  - its own contract in `prompts.ts` (`emailContract`: tables, inline styles on export, web-safe font fallbacks, ≤ 102 KB);
  - export as one `.html` with CSS inlined (`utils/design/inlineCss.ts`, pure and tested).

**Carousel** is a graphic project whose boards are ordered and linked:
- The direction pass plans card-to-card continuity (shapes crossing edges, numbering).
- The canvas shows the cards edge to edge with no gap (toggle).
- Export writes `01.png…10.png` plus an optional PDF (LinkedIn carousel).

**Composer changes** (`DesignComposer.tsx`):
- Under the box, **"Start from"**: the kind's categories as a quiet row of chips, then a grid of template cards. Choosing one sets the size(s), fills the placeholder question and shows the template's fields under "Details" (collapsed).
- **Prompt library** (`utils/design/promptLibrary.ts`): ~40 worked example briefs per kind (title, full prompt, sizes, style), shown as "Examples". One click loads one into the box. Copy is written by us, sentence case, with no "stunning" or "sleek".
- **Arabic:** every template has an `ar` name and question; for an RTL language the brief and boards go through `rtlRules`.

## Phase 6: Tweaks (instant knobs the AI designs)
This is open-design's tweaks panel, done safely without scripts.
- The board prompt asks for an optional `<tweaks>` JSON beside the markup. It holds **at most 6 knobs** that matter for this board:
  ```json
  [{"id":"hero-layout","label":"Hero layout","type":"select","options":["split","centred","full-bleed"],"default":"split"},
   {"id":"accent","label":"Accent strength","type":"range","min":0,"max":100,"default":60,"unit":"%"},
   {"id":"cards","label":"Show testimonials","type":"toggle","default":true}]
  ```
- The board's CSS reads them as `var(--tw-accent)` and `[data-tw-hero-layout="centred"] …` selectors. The frame root gets the attributes and variables, so a change re-renders with **no AI call and no reload**.
- `utils/design/tweaks.ts`:
  - `parseTweaks` (clamps types, ids `[a-z0-9-]`, ≤ 6, option count ≤ 6);
  - `tweaksCss(values)` / `tweakAttrs(values)`.
  - `sanitizeHtml` keeps `data-tw-*` selectors in `<style>` (check `cleanCss`).
- Stored as `board.tweaks` + `board.tweakValues`. They appear in the Inspector's board section as **Tweaks**, and drag/scrub is live with one undo step.
- Export bakes the current values in (static attributes and variables).
- Graphic SVG boards: a tweak may target `--tw-*` CSS variables used in the SVG's `<style>` (allowed by `svgSafe` if `var()` passes; verify, else skip SVG in v1).

## Phase 7: Preview, prototype flows and responsive
- **Preview mode** (top bar **Preview**, `F5`, portal like `PresenterMode`):
  - one board full screen at 100% in its device frame, with ←/→ through boards;
  - for graphics, a "how it looks in a feed" mock (Instagram/LinkedIn/X post chrome drawn locally, neutral and unbranded).
- **Prototype links (app and web):**
  - The board prompt may add `data-goto="<board name>"` to buttons and links. `sanitizeHtml` keeps `data-goto` (text only).
  - In Preview the parent handles clicks inside the frame (`contentDocument` click → `closest('[data-goto]')`) and switches board, with a simple slide/fade.
  - In the Inspector (element → **Link to** board select) users set or clear links by hand.
  - **Flow view toggle:** curved arrows on the canvas from the element to the target board (SVG overlay in canvas space).
- **Responsive set (web):** "Make mobile / tablet version" adds a board at 390 / 768 with the same source; the HTML reflows, and the AI is asked only if the user picks "Adapt with AI" (layout changes beyond reflow).
- **States (app):** board context menu **Add state** → Empty / Loading / Error / Success. An AI addBoard with the source as reference, placed under the original as a stacked group (`board.group`).

## Phase 8: Quality, critique and comments
- **Local lint** (`utils/design/lint.ts`, pure, run on the frame's DOM snapshot after each draw or change). It checks:
  - text contrast < 4.5:1 (< 3:1 for large text), computed against the nearest opaque background;
  - text under 12px (app/web) or under 2.2% of the short side (graphic);
  - tap targets < 44px (app);
  - elements overflowing the board width;
  - colours not in the token set (count, not each);
  - images without `alt`;
  - unfilled `photo:` placeholders;
  - text clipped in SVG (`svgText` measure).
  - Results show as small pins on the board (toggle **Checks** in the canvas toolbar) and as a list in the board Inspector, each with **Fix with AI** (a picked-element refine with the lint message as the instruction) or **Fix** where local (contrast → `fixTextContrast`).
- **AI critique** (open-design's five-dimension gate): **Review design** in the board menu / prompt bar.
  - `buildCritiquePrompt` scores 1–5 on hierarchy, legibility & contrast, consistency with the system, spacing & alignment, and content realism & copy, with up to 5 concrete fixes, each naming a `data-yz` id.
  - `parseCritique` gives a scorecard in the Chat tab; each fix has **Apply** (a refine proposal) or **Apply all** (one batch review).
  - Setting `autoReview` (off by default) runs it once after generation and applies nothing on its own.
- **Comments** (`project.comments: { id, boardId, yz?, x, y, text, at, resolved }`):
  - The `C` tool drops a pin on a board point or element. A thread popover holds the text and Resolve, and pins scale with zoom like labels.
  - **"Send N comments to AI"** turns the open comments into one batch of surgical refines (each with its element as `picked`), reviewed in the existing batch UI, and marks the kept ones resolved. This is open-design's comment-mode.
  - Comments are stored in the project, listed in the Chat tab, and excluded from exports.

## Phase 9: History and versions
- **History tab** (left): the `.history/` snapshots (already written every 5 minutes, `snapshotLimit`) listed by time, plus **named versions** ("Save version", Ctrl+Alt+S; stored as `.history/<stamp>--<slug>.yzdesign` and never pruned).
  - Hovering previews the version's first board thumbnail; **Restore** replaces the project as one undo step, after first saving the current state as a snapshot; **Open as copy** creates a new project.
- **Change log in Chat:** every kept AI change adds an assistant entry ("Changed the header on Home · Keep") with board chips. Clicking one selects the boards; **Revert this change** restores those boards from the stored baseline when they have not been edited since (the `baseSvg` rule from decks).
- Per-board **Compare**: hold-for-before already exists for proposals. Add a split slider in Preview between the current board and any version.

## Phase 10: Export and hand-off
- **Export dialog redesign:** a list of boards with checkboxes and thumbnails on the left, format options on the right, and a size/time estimate. "Include device frame" and "Transparent background" (PNG, graphic) are new options.
- New formats:
  - **Carousel** PNG set plus PDF;
  - **Email HTML** (CSS inlined);
  - **ZIP** of everything;
  - **Copy as PNG** to the clipboard (board or element);
  - **Copy CSS** of an element (computed, only non-default properties, tokens as variables).
- **Hand-off presets** (`handoffPrompt` variants): HTML/CSS as is · React + Tailwind · Next.js · Vue · SwiftUI · Flutter (app only). Each writes the code export plus `DESIGN.md` plus `tokens.css` / `tailwind.tokens.js` and tells the agent the target stack and file map. The target list and sending stay as built.
- **Share gallery:** one standalone HTML page with every board, the system sheet and prototype links working (a small inline script is fine here: the export is the user's own file, not shown inside the app).

---

## Data model changes (`types.ts`, project `version: 2`)
- **`Board`:**
  - `locked?`, `frame?`, `group?` (states stack);
  - `tweaks?`, `tweakValues?`;
  - `theme?: 'light' | 'dark'`;
  - `order` (layers order, separate from x/y).
- **`DesignTokens`:**
  - `darkPalette?`, `extended?` (success/warning/danger/border);
  - `weights`, `lineHeight`, `shadows`, `radii`, `border`.
- **`DesignProject`:**
  - `comments`, `kitId?`, `versions?` (names only; files hold the data);
  - `template?: string`, `lint?: Record<boardId, LintResult[]>` (not saved; session only).
- `parseProject` migrates v1 → v2 with defaults. `serializeProject` keeps unknown fields out. Tests cover the round trip and the migration.
- **`designStore`:**
  - panel open/width, `exploreDirections`, `autoReview`;
  - `showChecks`, `showFlows`, `showMinimap`, `recent` (palettes, font pairs, references), `kits` index.

## New and changed files (summary)
| Area | Files |
|---|---|
| Pure, tested | `utils/design/domTree.ts`, `styleEdit.ts`, `snap.ts`, `tweaks.ts`, `lint.ts`, `templates.ts`, `promptLibrary.ts`, `quickActions.ts`, `inlineCss.ts`, `kits.ts` (DESIGN.md ↔ tokens), additions to `prompts.ts` (`parseDirections`, `buildCritiquePrompt`/`parseCritique`, `emailContract`, tweaks and `data-goto` rules), `tokensCss.ts`, `project.ts` (v2), `export.ts` (hand-off variants, tokens formats) |
| UI | `DesignLayers.tsx`, `DesignInspector.tsx` (+ `inspector/TextSection.tsx`, `FillSection`, `LayoutSection`, `SpacingSection`, `SizeSection`, `BorderSection`, `EffectsSection`, `PictureSection`, `TweaksSection`, `SystemSection`), `SystemBoard.tsx`, `DesignToolbar.tsx` (canvas tools + arrange), `DesignContextMenu.tsx`, `Minimap.tsx`, `frames/*.tsx`, `DesignPreview.tsx`, `CommentPins.tsx`, `DirectionCards.tsx`, `HistoryPanel.tsx`, `TemplateGallery.tsx`, `ShortcutSheet.tsx`; `DesignSidePanel.tsx` split into Layers/Chat/Assets/History and removed when done |
| Changed | `DesignWorkspace.tsx` (three-column layout, keys), `DesignCanvas.tsx` (marquee, snapping, overlays, cached previews, frames, comments, flows), `HtmlBoard.tsx` (tweaks, theme attribute, click relay in Preview), `DesignPromptBar.tsx`, `DesignComposer.tsx` (templates, examples, kits), `DesignExportDialog.tsx`, `useDesignGenerator.ts` (directions, critique, states, responsive, comments batch), `design-studio.css` (retire `.dz-tabs`/`.dz-field`, theme tokens only) |
| Reused | `components/studio/Inspector.tsx` parts + `FontOptions`, presentation `SlideStage` / `FormatBar` / `slideEdit` (graphics), `BatchReview` pattern, `StockImagePicker`, `customTheme.ts` contrast, `fixTextContrast`, browser Pick-style capture (kit from URL), `PresenterMode` portal pattern |

## Suggested order and size
| # | Phase | Why first | Size |
|---|---|---|---|
| 1 | Polish and bugs | Visible in the screenshot; cheap | S |
| 2 | Layers + element inspector + SlideStage for graphics | The main "control" gap | L |
| 3 | Canvas fundamentals | Expected by anyone who used Figma or Stitch | M |
| 4 | Design system editor, kits, directions | Consistency across projects | M–L |
| 5 | Templates + prompt library (+ email, carousel) | Better starting points | M (mostly data) |
| 6 | Tweaks | Fast iteration without AI calls | M |
| 7 | Preview, links, responsive, states | App/web become prototypes | M |
| 8 | Lint, critique, comments | Quality and precise feedback | M |
| 9 | History and versions | Safety net | S–M |
| 10 | Export and hand-off upgrades | Completes the loop | S–M |

## Verification
- **`npm run test:design`**, new cases for:
  - `domTree`: labels, caps, and the skipping of single-child wrappers;
  - `styleEdit`: merge, null removes, `cleanCss` on values, `url()` blocked, restamping on duplicate, move among siblings;
  - `snap`: edges, centres, equal gaps;
  - `tweaks`: parse/clamp, CSS output;
  - `lint` on fixture HTML: contrast, tiny text, tap targets, overflow;
  - templates: every template resolves its presets and has `ar` copy;
  - `parseDirections` / `parseCritique`;
  - `inlineCss`;
  - kits: `DESIGN.md` ↔ tokens round trip;
  - `parseProject` v1 → v2.
- `npx tsc --noEmit`; `npm run test:presentation` after any change to `SlideStage` for non-slide canvases.
- **Visual check** (the method from memory: a throwaway Vite harness plus headless Edge screenshots, in light, dark and Arabic) of:
  - the three-column studio with a picked element;
  - the system sheet;
  - the template gallery;
  - direction cards;
  - Preview with a device frame;
  - lint pins.
- **Manual in `npm run tauri dev`:**
  - Graphic from the "Event poster" template, then:
    - change the headline size and colour by hand, bind the colour to `primary`, restyle the palette, and confirm the headline follows;
    - make an ad set, then export the carousel PNGs.
  - App with 5 screens, then:
    - link the buttons and click through in Preview;
    - add an Empty state;
    - run the critique and apply 2 fixes;
    - drop 3 comments and send them to the AI;
    - restore an earlier version, then undo the restore.
  - Web board: drag the width to 768 and watch the reflow; hand off as React + Tailwind to a Claude Code terminal.
  - 25 boards at zoom 10%: panning stays smooth (cached previews).
