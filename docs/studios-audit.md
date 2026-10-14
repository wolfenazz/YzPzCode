# Studios Audit — Writing, Presentation, Sheets + Shared Chrome

Date: 2026-10-14
Scope: `app/src/components/writing/`, `app/src/components/presentation/`, `app/src/components/sheets/`, `app/src/components/studio/` (`StudioTopBar.tsx`, `Inspector.tsx`, `studio.css`), studio storage (`utils/studioRoot.ts`, `hooks/useStudioRoot.ts`, `filesystem_commands.rs:get_studio_root`), workspace wiring (`workspaceView.ts`, `useWorkspace.ts`, `StudioLocation.tsx`).

Method: 4 parallel codebase audits (evidence-backed, file:line cited). This file is the consolidated list.

## TL;DR — top fixes

1. Shared chrome fork: Presentation bypasses `StudioTopBar`/`InspectorTabs` (`DesignedEditor.tsx:949-977`, `PresentationWorkspace.tsx:973-978`). Unify or document fork.
2. `StudioTopBar.tsx:80-83` determinate progress still sweeps (selector matches presence, not value).
3. Concurrent same-title creates overwrite — collision check is in-memory only (`document.ts:167-177`, `deck.ts:92-102`, `useWorkbookDocument.ts:73-83`).
4. Single global FS watcher + per-workspace home lists go stale when N studios share one folder (`watcher.rs:14,124-159`).
5. Setup launch stays enabled while studio folder pending/failed (`WorkspaceConfigForm.tsx:148,165,173`).
6. Review/undo races in Writing (`WritingWorkspace.tsx:311-327`) and Presentation (`presentationSessionStore.ts:128-141`, `useDesignGenerator.ts:255-265`).
7. Sheets: TSV export down-converts to CSV, `=...` CSV cells become formulas, full-workbook snapshot undo (`sheetsSessionStore.ts:77-78`), uncapped sort/filter on Ctrl+A (`SheetGrid.tsx:311,318,326`).

## Fix log

- [done] Shared: determinate progress flag + `data-indeterminate="true"` selector, true-0% width, run-label tooltip (`StudioTopBar.tsx`, `studio.css`).
- [done] Shared: `InspectorTabs` keyboard (arrows/Home/End, roving tabindex, `aria-controls`), `InspectorBody` tabpanel wiring, Writing + Sheets bodies linked.
- [done] Shared: `Section` collapsible head `h3`-in-`button` → `span` (valid HTML).
- [done] Shared: `ColorInput` hex normalize + fallback.
- [done] Shared: Sheets assistant wrapped in `InspectorBody` (scroll/padding parity).
- [done] Shared: `studio.css` density rules (`density-compact/spacious`), motion-off consolidation, `sheets.css` `--sx-warning` token, save-state `unsaved/saving` distinction.
- [done] Writing #1 determinate progress (same as shared fix).
- [done] Writing #2 review token/cancel per runReview; stale results ignored (`WritingWorkspace.tsx`, `useReportGenerator.ts` scoped `cancelRewrite`/`cancelRestyle`).
- [done] Writing #3 applyRewrite anchor + neighbor revalidation on drift (`rewriteSelection.ts`).
- [done] Writing #4 streaming lock: refused keystrokes fire throttled `wr-stream-locked` toast instead of silent drop (`editor/extensions.ts`).
- [done] Writing #5 outline stable keys by sectionId, pos resolved at click, L3 included (`OutlinePanel.tsx`).
- [done] Writing #6 restyle controls locked while running + 10-deep undo stack (`DesignPanel.tsx`).
- [done] Writing #7 cancel scoping Design vs writing (`useReportGenerator.ts`, `WritingWorkspace.tsx` uses `cancelRestyle` for Design).
- [done] Writing #8 generateSections preserves non-target sectionStatus (`useReportGenerator.ts`).
- [done] Writing #9 humanizeAll saves per section (`WritingWorkspace.tsx`).
- [done] Writing #10 export snapshot includes live editor text + outdated hint (`WritingWorkspace.tsx`, `ExportDialog.tsx`).
- [done] Writing #11 export abort flag: Esc/close while busy aborts cooperatively (`ExportDialog.tsx`).
- [done] Writing #12 Escape scoped to review-focused + menu coordination (`ReviewCard.tsx`).
- [done] Writing #13 selection captured on menu open, restored on submit (`SelectionMenu.tsx`).
- [done] Writing #14 link URL committed on blur (`StudioToolbar.tsx`).
- [done] Writing #15 tabs APG pattern (`Inspector.tsx`; `WritingHome.tsx` roving tabindex + arrows).
- [done] Writing #16 outline includes L3 (`OutlinePanel.tsx`).
- [done] Writing #17 single `WRITTEN_WORDS=25` constant (`useReportGenerator.ts`, `AssistantPanel.tsx`, `WritingWorkspace.tsx`).
- [done] Writing #18 Section head valid HTML (shared fix).
- [done] Writing #19 ColorInput normalize (shared fix).
- [done] Writing #20 unrecognised-references hint (`ReferencesPanel.tsx`).
- [done] Writing #21 measure() try/catch (`WritingWorkspace.tsx`).
- [done] Writing #22 save() surfaces error when doc incomplete (`useWritingDocument.ts`).
- [done] Writing #23 photo notFound cache cleared on docPath change (`useReportGenerator.ts`).
- [done] Writing #24 Dropdown/Review Escape coordination (`ReviewCard.tsx` checks `.wr-dd__menu`).
- [done] Presentation: undo/redo selectedIds filter (`presentationSessionStore.ts`) + auto-reselect fallback (`DesignedEditor.tsx`).
- [done] Presentation: refine/newSlide/animate endRun error + slideStatus failed (`useDesignGenerator.ts`).
- [done] Presentation: adopt() SVG forwarded to askAi/retry (`DesignedEditor.tsx`).
- [done] Presentation: classic HTML/PDF export visible-slides only (`ExportDialog.tsx`).
- [done] Presentation: all-hidden presenter guard (`PresenterMode.tsx`).
- [done] Presentation: 0-slide blank at index 0 + empty-state CTA (`DesignedEditor.tsx`).
- [done] Presentation: delete guards toast (`DesignedEditor.tsx`).
- [done] Presentation: coalesced history entry post-draw, Undo as promised (`useDesignGenerator.ts`).
- [done] Presentation: per-workspace element clipboard Map (`DesignedEditor.tsx`).
- [done] Presentation: theme full-palette active compare + luminance dark + fontDraft/tab state reset on deckDir (`DesignedEditor.tsx`).
- [done] Presentation: fullscreen sync record + TTS debounce (`PresenterMode.tsx`).
- [done] Presentation: export cancel + slugify fallback, both dialogs (`ExportDialog.tsx`, `DesignedExportDialog.tsx`).
- [done] Presentation: filmstrip keyboard (tabIndex/role/Enter/arrows, listbox, Blank tooltip, 0-state) (`DesignedFilmstrip.tsx`, `Filmstrip.tsx`).
- [done] Presentation: presenter 3s typed timeout + handled-keys-only stopPropagation (`PresenterMode.tsx`).
- [done] Presentation: stale editor state reset on slide/deck change (`DesignedEditor.tsx`).
- [done] Presentation: stage not-drawn CTA + textbox role (`SlideStage.tsx`); ColorGrid labels (`FormatBar.tsx`); AI error surface (`DesignedAiPanel.tsx`); ensureFonts debounce.
- [done] Sheets B-1 TSV export choice + session format default (`ExportDialog.tsx`, `csv.ts` TSV helpers).
- [done] Sheets B-2 CSV `=`-text kept as text unless parses (`ops.ts` writeInput).
- [done] Sheets B-3 typing coalesce 5000ms, no snapshot per keystroke (`sheetsSessionStore.ts`, `useSheetsEditor.ts`).
- [done] Sheets B-4 sort/filter/dedup clamped to usedBounds (`SheetsWorkspace.tsx`).
- [done] Sheets B-5 recovery estimate + early-exit compare, 25MB guard kept (`useWorkbookDocument.ts`).
- [done] Sheets B-6 truncation toasts (`useSheetsEditor.ts`).
- [done] Sheets I-1 values-only formula note (`ExportDialog.tsx`); I-2 cycles `#CALC!` + warning address (`recalc.ts`); I-3 zoom persisted via sheetProps op (`useSheetsEditor.ts`); I-4 style-only ops skip recalc (`ops.ts` valuesDirty); I-6 Retry save banner (`SheetsWorkspace.tsx`); I-7 empty hints (`SheetsHome.tsx`, status bar); I-8 cross-workspace Open in Sheets (`OpenInSheetsButton.tsx`).
- [done] Shared setup: launch gated on studio folder ready + preparing blocker + Retry + base label (`WorkspaceConfigForm.tsx`, `StudioLocation.tsx`, `useStudioRoot.ts` retry, `studioRoot.ts` forget/revalidate).
- [done] Shared docs: three-studio wording (`README.md`, `CLAUDE.md`, `Inspector.tsx` + `studio.css` + `studioRoot.ts` + `StudioLocation.tsx` comments).
- Remaining (documented, needs backend/spec decision): FS-backed unique slugs / cross-workspace locking, single-watcher home-list refresh, BatchReview pagination + narration prewarm scope, sheets deep-chain iterative worklist (measured unnecessary: 3000-chain passes, depth ~25).

---

## 1. Writing Studio — Findings

Files: `WritingWorkspace.tsx:51-589`, `StudioToolbar.tsx:76-378`, `OutlinePanel.tsx:21-96`, `AssistantPanel.tsx:35-291`, `DesignPanel.tsx:39-207`, `ReferencesPanel.tsx:22-96`, `editor/PagedEditor.tsx:122-308`, `SelectionMenu.tsx:18-119`, `useWritingDocument.ts:66-253`, `ReviewCard.tsx:26-80`, `rewriteSelection.ts:27-94`, `useReportGenerator.ts:53-366`, `ExportDialog.tsx:23-150`, `ui.tsx:28-192`, `editor/extensions.ts:216-542`, `editor/nodeViews.tsx:44-357`, `editor/scrollKeeper.ts:26-165`.

### Bugs

1. **High — determinate progress renders as indeterminate** — `studio/StudioTopBar.tsx:80-83`: [done]
   `<div className="sx-bar__progress" data-indeterminate={run.progress === null || undefined}>` renders `data-indeterminate="false"` for numbers; CSS `studio.css:232` matches attribute presence. Fix: `data-indeterminate={run.progress==null ? true : undefined}`.
2. **High — concurrent reviews race** — `WritingWorkspace.tsx:311-327` overwrites `reviewTarget.current` + `setReview` without cancelling prior `generator.rewrite`; `useReportGenerator.ts:150-168` only tracks latest run but both promises resolve. Fix: per-review token/cancel.
3. **Med — `applyRewrite` checks size, not content drift** — `rewriteSelection.ts:64-94` (`if (target.to > doc.content.size) return false`). Accept can replace wrong range after interim edits. Fix: anchor hash / neighbor-text revalidation.
4. **Med — keystrokes during AI streaming silently dropped** — `editor/extensions.ts:255-267` `filterTransaction` drops touches with no toast/queue. Show locked hint.
5. **Med — stale `pos` in outline jump** — `OutlinePanel.tsx:60-68,80` captures `pos` at render; AI streaming shifts it; `nodeDOM(stale)` → wrong node. Key by stable `sectionId`, resolve pos at click.
6. **Med — restyle Undo single-level + races template edits** — `DesignPanel.tsx:45-58,81,94-107`: `previous` captured at run start; style `Select`s not disabled while `running`. Disable controls while running or stack history.
7. **Med — restyle/write cancel cross-talk** — `DesignPanel.tsx:47` vs `OutlinePanel.tsx:86` (`disabled={busy}` covers writing only). `generator.cancel` cancels any run. Scope cancel tokens.
8. **Med — `generateSections({sectionIds})` wipes other sections' status** — `useReportGenerator.ts:256-266,333-339`. Preserve non-target `sectionStatus`.
9. **Med — `humanizeAll` marks dirty only at end** — `WritingWorkspace.tsx:370-396` schedules save only at `:395`; close mid-loop loses work. Set `dirty:true` per section.
10. **Med — export snapshots stale content** — `WritingWorkspace.tsx:398-403` memo excludes editor text; `ExportDialog.tsx:33-46` paginates once on mount. Re-snapshot on update or warn outdated.
11. **Med — no export cancel; close trapped** — `ExportDialog.tsx:48-57,94,113,143` gate Esc/overlay/Close on `!busy` with no abort. Add cancellable flag.
12. **Med — global `Escape` discards review** — `ReviewCard.tsx:31-45` capture-phase `Escape` + `stopPropagation` kills footnote popovers, menus, and discards AI result. Scope to review-focused / confirm when done.
13. **Med — selection-menu `autoFocus` can collapse selection** — `SelectionMenu.tsx:88-91`; recapture happens on submit (`WritingWorkspace.tsx:329-334`). Capture synchronously on menu open.
14. **Med — link draft lost on blur** — `StudioToolbar.tsx:277-291` discards on blur; `focus()` restore may collapse range. Commit valid URL on blur.
15. **Med — tabs lack APG pattern** — `Inspector.tsx:26-36`: `tablist/tab` + `aria-selected` only; no roving tabindex, arrows, `aria-controls`. Same in `WritingHome.tsx:77-84`.
16. **Low — outline L1–L2 only, ToC L1–L3** — `OutlinePanel.tsx:34` vs `nodeViews.tsx:211`. H3 rewrite-via-outline unavailable.
17. **Low — three "written" thresholds disagree** — `AssistantPanel.tsx:101` `<20` vs `useReportGenerator.ts:279` `>20` vs `WritingWorkspace.tsx:378` `<30`. Unify constant.
18. **Low — invalid HTML `h3` in `button`** — `Inspector.tsx:66-69`.
19. **Low — `ColorInput` crashes on non-hex** — `Inspector.tsx:100-105` with old-file colors via `DesignPanel.tsx:147-152`. Normalize + fallback.
20. **Low — silent no-op on unparsable references** — `ReferencesPanel.tsx:26-31,76` (`if(parsed.length===0) return`). Show "No references recognised" hint.
21. **Low — word/page measure can throw** — `WritingWorkspace.tsx:147-154` unguarded `domAtPos` (contrast `StudioToolbar.tsx:108-116` try/catch). Wrap in try/catch.
22. **Low — `save()` silently drops when doc incomplete** — `useWritingDocument.ts:108-112` returns with `dirty:true`, "Edited" forever. Surface error.
23. **Low — `notFound` photo cache never reset** — `useReportGenerator.ts:203,226-230`. Clear on docPath/settings change.
24. **Low — `Dropdown` vs `ReviewCard` Escape race** — `ui.tsx:38-43` + `ReviewCard.tsx:32-35` both capture-phase. Coordinate.

### Improvements

- Document + test focus contract: all menus use `Dropdown`/same `preventDefault` guard (`ui.tsx:62,73`, `StudioToolbar.tsx:59`, `SelectionMenu.tsx:71`).
- On `applyRewrite===false`, offer re-select-and-retry instead of dead retry.
- Show streaming lock (disable `humanizeAll`/`rewriteAll` while `AiStream` active).
- Unify outline/ToC/`sectionTarget` via one `scanSections(doc)` helper; optional L3.
- Add density vars for studio chrome; extend motion-off to all `sx-*` transitions (`studio.css:1056-1062` covers progress/meter/switch only).
- Citation UX: search input (list caps at 8, `StudioToolbar.tsx:309-317`); "Remove citation" for missing-key chips (`nodeViews.tsx:91-112`).
- Clarify bibliography semantics (cited-only vs all; `nodeViews.tsx:342-343`).
- Surface `gatherSources` errors (`useReportGenerator.ts:268-269` only `console.warn`) as Hint.
- Debounce cover-field autosave (per-keystroke `dirty:true`, `nodeViews.tsx:266-288`).
- Docs/tests: document Review `Ctrl+Enter` vs page-break + `Escape`-to-discard; add unit tests for `rewriteSelection` guard, outline key stability, indeterminate flag, undo stacking.

---

## 2. Presentation Studio — Findings

Files: `DesignedEditor.tsx:154-166,227-330,340-517,854-906`, `DesignedFilmstrip.tsx:29-71,98-220`, `Filmstrip.tsx:30-135`, `PresenterMode.tsx:64-83,127-242,280-410`, `useDesignGenerator.ts:177-196,242-268,286-377,426-504,511-559,687-748`, `useDeckGenerator.ts:105-124,159-197,200-258`, `useDeckDocument.ts:92-135,154-170`, `presentationSessionStore.ts:105-141`, `SlideStage.tsx:58-150,199-350,394-468,519-587`, `DesignedAiPanel.tsx:62-90,95-191,194-232`, `BatchReview.tsx:48-133`, `SvgSlide.tsx:23-110`, `FormatBar.tsx:61-80,129-392`, `DesignedExportDialog.tsx:39-150,201-203` vs `ExportDialog.tsx:39-121`, `AnimationPanel.tsx:73-131,158-255`, `DesignComposer.tsx:134-273,290-464`, `designPrompts.ts:71-117,175-188,253-275`, `slideSelection.ts:18-42`, `ThemeEditor.tsx:40-51,68-80,101-104`.

### Bugs

- **High — Undo/redo desyncs stage selection** — `presentationSessionStore.ts:128-141` keeps `selectedIds` verbatim on undo/redo (vs `edit:113-124` filtering to known ids). After undo-add / redo-delete → `slide=null` → "Select a slide." + "Slide 0 of N" (`DesignedEditor.tsx:160-162,1566`). Fix: filter `selectedIds` in undo/redo; auto-reselect fallback.
- **High — single-slide AI never marks run failed** — `useDesignGenerator.ts:497-504` (`refine`), `:555-556` (`newSlide`), `:732` (`animate`) always `endRun(null)`. Failed proposal shows `phase:done`. Fix: `endRun(ok||cancelled?null:error)` + `slideStatus:failed` (like `refineMany:527`).
- **High — AI refine drops adopted artwork / selection ids** — `DesignedEditor.tsx:503-517` calls `askAi` without `options.svg`; `useDesignGenerator.ts:432` falls back to stored SVG; raw `raw:<n>` selections (`SlideStage.tsx:125,129-143`) have no `data-el`, but `designPrompts.ts:596-601` tells AI to edit `data-el`. Forward `adopt()` SVG (`DesignedEditor.tsx:533-537`).
- **High — classic HTML/PDF export leaks hidden slides** — `ExportDialog.tsx:102-108` builds from all `deck.slides` while PNG skips hidden (`:71-73`) and hint (`:147`) claims hidden excluded from PDF. Fix: pass `visible` (designed dialog `:97` already does).
- **High — presenter with 0 visible slides broken** — `PresenterMode.tsx:65-66,80,151,398`: `current=null`, `go` clamps to 0 forever, count "1 / 0". Guard: disable Present + "all hidden" state.
- **Medium — 0-slide deck cannot add blank** — `DesignedEditor.tsx:719-720` `if(!slide) return`; only With-AI (`:347-351`) can recover, no empty-state guidance.
- **Medium — delete guards inconsistent** — `DesignedEditor.tsx:275` vs `commandMany:303` vs classic `PresentationWorkspace.tsx:554`. Silent returns; surface toast.
- **Medium — streaming draws not undoable, "one Undo" claims false** — `useDesignGenerator.ts:255-265` `applyBlock {skipHistory:true}`; toasts (`DesignedEditor.tsx:468,490,1476-1477`) promise full undo. Push one coalesced history entry post-draw.
- **Medium — module-global element clipboard leaks across decks** — `DesignedEditor.tsx:83` `let elementClipboard`. Scope per `workspaceId`; clear on `deckDir` change.
- **Medium — theme apply mis-detects active + dark flag + stale font draft** — `DesignedEditor.tsx:1408-1411` (primary+background only), `:756,760` (`dark` via contrast vs `sanitizeDesignSystem luminance<0.4` at `designPrompts.ts:76`), `fontDraft:774` never reset on deck switch.
- **Medium — fullscreen restore race + TTS thrash** — `PresenterMode.tsx:134-146` (`wasFullscreen` async), `:148-157,192-198`, dual `useTtsPlayback` (`:85-90`).
- **Medium — export not cancellable, blocks close** — both export dialogs disable Esc/Close/scrim while `busy`; PNG/pptx loops `await` sequentially, no `AbortSignal`.
- **Medium — filmstrip thumbs not keyboard-operable** — `DesignedFilmstrip.tsx:33-48`, `Filmstrip.tsx:44-56`: `div.pr-thumb`, no `tabIndex/role/keyboard`. `InspectorTabs` same gap.
- **Low — presenter swallows all keys; number-jump never expires** — `PresenterMode.tsx:201-204` `stopPropagation` everything; `typed:75,213-224` no timeout; space/Enter in `NEXT_KEYS:40` conflicts.
- **Low — slide switch keeps stale editor state** — `DesignedEditor.tsx:215` resets subset only; `review` lingers for old `slideId`.
- **Low — thin empty/loading states** — `SvgSlide.tsx:80-87` (ghost title only if `width>220`), `SlideStage.tsx:517` (`!svg → null` blank frame), cancelled runs show nothing (`DesignComposer.tsx:286`).

### Improvements

- Filmstrip 0/1/many: disable Blank with tooltip when `!slide`; explicit 0-state; toast instead of silent return; virtualize beyond ~20 slides.
- AI errors: surface `run.error` in `DesignedAiPanel` (today `busy` only at `:178-184`); toast when batch items empty.
- Theme: full-palette active compare; unify `dark`; reset `fontDraft/tab/instruction/restyle/scope` on `[deckDir]`; handle `ensureFonts` rejection (`:757`).
- Presenter: focus trap + `aria-modal`; 3s `typed` timeout; don't swallow unhandled keys; debounce autoplay.
- Export: cancel button (AbortController in PNG/pptx loops); `slugify(title)||'presentation'` fallback; allow background-close.
- Empty states: "slide not drawn yet — Draw again" CTA on stage when `!slide.svg`.
- Focus/a11y: thumbs `tabIndex=0 role=option`, Enter/Space/arrows; label `ColorGrid` swatches (`FormatBar.tsx:87`); `SlideStage` `role=textbox`; return focus on menu/dialog close.
- Perf: stabilize `canvas` memo deps (`DesignedEditor.tsx:156` → `[deck.size]` + svg hash, not whole array); memoize `slideFonts` on hash + debounce `ensureFonts` (`:218-223` per keystroke); paginate `BatchReview`; prewarm narration current ±2 only.
- Docs/chrome: document Esc/R/T/Home/End, hidden-slide export semantics (PPTX keeps hidden vs PDF/PNG/HTML drop), EMF/WMF + font-install notes; reconcile `CLAUDE.md:143-144` (DesignedEditor uses bespoke `pr-toolbar/pr-side__tabs`, not `StudioTopBar/InspectorTabs`).

---

## 3. Sheets Studio — Findings

Full studio at parity with siblings: ~23 files in `components/sheets/`, ~40 modules in `utils/sheets/` (formula engine, ops, xlsx/csv, pivot, charts, CF, validation, print), 2 Zustand stores, suite `app/scripts/sheets.test.mjs` (~1067 lines, `npm run test:sheets`), docs `assets/docs/pages/sheets-studio.ts:1-69`. Wiring correct: `types/index.ts:6,8`, `workspaceView.ts:8,12,20-27`, `workspaceSetup.ts:9` (`Sheets studio`), `useWorkspace.ts:158,307`, `App.tsx:124`, `Workspace.tsx:118,338-339,676-677`, `WorkspaceHeader.tsx:114,116`, `useDiscordPresence.ts:42`.

Core: `SheetsWorkspace.tsx:93-745`, `SheetsHome.tsx:33-204`, `SheetGrid.tsx:61-749`, `gridRender.ts:72-98,221-429,593-802`, `useWorkbookDocument.ts:191-515`, `useSheetsEditor.ts:44-488`, `sheetsSessionStore.ts:63-149,167-199`, `sheetsStore.ts:11-67`, `SheetsAssistant.tsx` + `useSheetsAssistant.ts`, `ai/{context,parse,prompts}.ts`, ribbon/formula-bar/tabs/status/charts/inspectors/dialogs.

### Bugs

- **B-1 — TSV exports as comma-CSV** — `ExportDialog.tsx:52-66` offers `xlsx|pdf|csv|html` only; CSV branch calls `sheetToCsv(sheet, styles)` with default `','` (`csv.ts:81`) even when `session.format==='tsv'` (`useWorkbookDocument.ts:269` preserves on save). Fix: TSV choice or inherit format.
- **B-2 — CSV `=...` cells become formulas** — `useWorkbookDocument.ts:149-154` maps every non-empty CSV field through `applyOps(...{parse:true})`. Fix: only formula when it parses (`tryParseFormula`), else text.
- **B-3 — undo = up to 100 full-workbook snapshots** — `sheetsSessionStore.ts:77-78,180`; `useSheetsEditor.ts:89-97` forwards `coalesce` almost no caller supplies; `ops.ts` computes `inverse` (tested `sheets.test.mjs:370-376`) but store ignores it. Fix: op-inverse history or `coalesce:'typing'`.
- **B-4 — giant selections flow uncapped into ops** — `SheetGrid.tsx:311,318,326` selects to `MAX_ROWS-1/MAX_COLS-1`; `SheetsWorkspace.tsx:263-279` sort/filter/dedup via `dataRange()` with no guard (copy caps at 5000×200 in `useSheetsEditor.ts:246-247`). Fix: clamp to `usedBounds`.
- **B-5 — recovery diff = full `JSON.stringify` compare; write stringifies before size check** — `useWorkbookDocument.ts:403`, `:225-233` (base64 inflates ~33%, then `> 25MB` check). Fix: hash/version stamp; skip when clean; estimate from cell count.
- **B-6 — copy/paste truncation silent** — `useSheetsEditor.ts:246-247` (5000×200), `:301` (fill 2000×100), no `notify()`. Toast when clamping.

### Improvements

- **I-1** CSV export bakes formulas to values (`csv.ts:92-100` ignores `cell.f`; hint `ExportDialog.tsx:27` easy to miss). Confirm text or notes line.
- **I-2** Cycles report `#REF!` (`recalc.ts:89-94`). Consider `#NUM!`/`#CALC!` + warning entry with cycle address.
- **I-3** Zoom session-local, lost on reload (`useSheetsEditor.ts:62-72`; model `sheet.zoom` at `types.ts:172` never committed). Persist per-sheet zoom.
- **I-4** Every op pays full recalc (incl. `format`/`freeze`/`colWidth`). Skip when flags say values can't change.
- **I-5** Deep-chain eval recurses via `top()` (`recalc.ts:210-221`; 3000-row test passes but cliff remains). Iterative worklist.
- **I-6** Save failure has no retry (`useWorkbookDocument.ts:289-291`; autosave re-fires only on next edit `:310-313`). Add Retry button on error state.
- **I-7** No zero-workbook / empty-sheet hint (`SheetsHome.tsx:163` gates Recent; grid guarantees 30×120 extent `SheetGrid.tsx:88-89`). One-line empty hints.
- **I-8** `OpenInSheetsButton.tsx:9` returns null outside sheets workspaces — Files-view `SpreadsheetEditor.tsx:10,83,99,156,323-325` has no path to full studio. Cross-workspace variant or create/switch prompt.

No structural gaps vs Writing/Presentation (home, workspace, assistant, export, docs, settings `SettingsScreen.tsx:52,144`, Discord status all present).

---

## 4. Shared Studio Chrome & Storage — Findings

### Bugs

- **[High] Presentation forks chrome** — `PresentationWorkspace.tsx:50` imports only `SlotInspector` (cf. Writing `:24-25`, Sheets `:18-19`); `DesignedEditor.tsx:950-977` bespoke `pr-toolbar` not `sx-bar`; `PresentationWorkspace.tsx:973-978` bespoke `pr-side__tabs` not `InspectorTabs` (`Inspector.tsx:26-37`). Fixes must be made 2–3×.
- **[Med] `InspectorTabs` no keyboard/tabpanel wiring; Sheets assistant escapes `InspectorBody`** — `Inspector.tsx:26-37` (`tablist/tab` + `aria-selected` only); `SheetsWorkspace.tsx:625-650` renders assistant outside `InspectorBody` (Writing `:476-514` wraps all).
- **[Med] Density presets don't size chrome** — `App.tsx:73-74` sets `density-*`; `styles.css:282-284` changes root font-size only; `studio.css:44-55,341-363,243-303` fixed 52/44/320/28px with no overrides.
- **[Med] Reduced-motion = three strategies** — `studio.css:1056-1070` (kills progress/meter/switch only) vs `sheets.css:616-619` vs `design.css:5`; `sx-sweep` (`studio.css:237-240`) unguaranteed.
- **[Low] Token fork: `sheets.css` drops `--sx-warning`** — `studio.css:11-24` defines it; `sheets/sheets.css:11-21` omits it.
- **[Low] Indeterminate idiom + truncation asymmetry** — `StudioTopBar.tsx:81` (`run.progress === null || undefined` works but fragile); `:82` floor `0.02` hides true 0%; `:151-156` truncates error only; `sx-run__label` (`studio.css:198-202`) no tooltip while `sx-bar__save` has `title` (`:65`).
- **[Med] Save wording + title-commit diverge** — Writing `:406-412` (`Saved|Edited|Saving…`) no `onTitleCommit` (`:430-438`); Sheets `:480-486` (`Saving…|Not saved|Unsaved|Saved|Up to date`) + `renameWorkbook` shows slug not typed title (`:143-169,522-528`); Presentation `:1019-1021` + `:952` live-coalesced title. `sx-bar__save[data-state]` can't distinguish saved vs unsaved (only error colored).
- **[High] `get_studio_root` silently falls back to home** — `filesystem_commands.rs:31-39` (`document_dir().or_else(home_dir)` + `create_dir_all`); UI never says which base; raw permission error, no remediation. Tests `:42-50` cover join only.
- **[High] Setup launch enabled while folder pending/failed** — `WorkspaceConfigForm.tsx:148` (`canOpen` ignores `studioRoot.path|error`); `:165` computes `blocker` but `:173` `primaryEnabled` ignores it; `useWorkspace.ts:338-339` studio `isValid` always true, `:323-335` no validation errors. `StudioLocation.tsx:14,20-27` shows "Preparing…" with no Retry. `workspace-setup.test.mjs:306-314` proves `createWorkspace` rejects, but UI lets user click first.
- **[Med] Root cached forever; hook never retries** — `studioRoot.ts:3-18` (success cached indefinitely); `useStudioRoot.ts:8-15` resolves once. Deleted/moved folder → later saves fail (`useWritingDocument.ts:129-131`, `useDeckDocument.ts:113-115`, `useWorkbookDocument.ts:289-291`).
- **[High] One global watcher + per-workspace home lists go stale** — `watcher.rs:14,124-159` single workspace watched; every studio shares `path=await getStudioRoot()` (`useWorkspace.ts:286`); `useFileWatcher.ts:130,147` follows active path only; `refresh*` on mount/create/close/delete only (`useWritingDocument.ts:75-88`, `useDeckDocument.ts:77-90`, `useWorkbookDocument.ts:202-215`). Report in workspace A invisible in B until remount.
- **[High] Collision avoidance in-memory only** — `writing/document.ts:167-177`, `presentation/deck.ts:92-102`, `sheets/useWorkbookDocument.ts:73-83` (`while(taken.has(...)) slug=base-N`); callers build `taken` from current list (`useWritingDocument.ts:211-212`, `useDeckDocument.ts:184-186`, `useWorkbookDocument.ts:442`). No FS check, no lock; second `write_file_content` wins. `toLowerCase` over-dedupes Linux, papers over Win/macOS case-insensitivity.
- **[Med] Delete removes parent folder; title edits orphan names** — `useWritingDocument.ts:226-235`, `useDeckDocument.ts:198-205`, `useWorkbookDocument.ts:455-462` (`delete_entry(parentPath)` — doc + assets/exports/history, no trash/undo). Writing/Presentation titles never rename (`WritingWorkspace.tsx:435`, `DesignedEditor.tsx:952`) — home title diverges from slug forever. Sheets rename non-atomic (file then folder, `:158-160`); crash leaves mismatched pair + orphaned sidecar (`:92-97`).
- **[Low] Sheets attachments initial path + external-only Save-a-copy** — `SheetsWorkspace.tsx:114,120` (redundant `joinPath` before root resolve); external-file "Save a copy" only in Sheets (`:533-535`, `useWorkbookDocument.ts:423-424,473-485`); Writing `.docx` / Presentation `.pptx` imports lack equivalent.
- **[Med] Docs/comments still say "two studios"** — `README.md:227,235`, `docs/readme/studios.svg:1-2,23-26`, arch `README.md:430`, `CLAUDE.md:148`; stale comments in `studioRoot.ts:6`, `filesystem_commands.rs:16,23`, `Inspector.tsx:1-2`, `studio.css:2`, `StudioLocation.tsx:10`. Missing docs: `Sheets/` folder, `<slug>/<slug>.yzdoc|.yzdeck|.xlsx` + `-2` suffix, `.history/.yzsheet/.attachments` sidecars, `home_dir` fallback, permission/deleted-folder recovery, shared-folder + watcher-follows-active semantics. In-app docs omit Sheets path (`getting-started.ts:25`, `shortcuts-help.ts:133`).

### Improvements

- Unify or explicitly fork Presentation chrome (adopt `StudioTopBar`/`InspectorTabs`/`sx-*`, or document why `pr-*` diverges).
- Fix `InspectorTabs` a11y (roving arrows, `aria-controls`+`tabpanel`); wrap Sheets assistant in `InspectorBody`.
- Add `density-*` rules for `sx-bar/sx-tabs/sx-head/sx-inspector/sx-btn/sx-input`; single-source `--sx-*` tokens (`studio.css` owns).
- Unify `StudioSaveState` copy + title-commit contract; make Sheets rename atomic; decide slug-stable vs rename-on-title for Writing/Presentation (document it).
- Setup: disable launch when `studioRoot.path==''` or error; show base used (Documents vs `~` fallback); Retry in `StudioLocation`; include failure in `isValid`/`validationErrors`.
- Storage: revalidate root before save/list (evict `cached` on `ENOENT`); expose fallback in UI; Rust + frontend tests for Documents-missing/permission-denied/concurrent-create.
- Concurrency: refresh home lists on `file-system-changed`/focus/workspace-switch; FS-existence + `create_new` (or backend-allocated slug) instead of in-memory `taken`; per-workspace trash/confirm for folder deletes.
- Docs: update `README.md`, `studios.svg`, arch diagram, `CLAUDE.md`, all "Writing and Presentation" comments, in-app docs → three studios + `Documents/YzPzCode/{Reports,Presentations,Sheets}` + sidecars + failure modes.

---

## Suggested priority (all studios)

- P0: progress-flag fix, setup-launch gate, FS-backed unique slugs, watcher refresh, undo-selection fix, classic hidden-slide export fix, presenter 0-visible guard.
- P1: review/cancel token scoping, restyle-undo stacking, export cancel, stale-target guards, Sheets TSV/formula-import/undo-memory/unbounded-range fixes, theme-dark unification, clipboard scoping.
- P2: density/motion/token unification, tab a11y, empty states, docs "two studios" → three, zoom persistence, save-retry buttons.
