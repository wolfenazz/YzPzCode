# Mission M-LG: Port vue-web-liquid-glass refraction engine into the app glass layer

Source of truth: https://github.com/mkj0kjay/vue-web-liquid-glass (MIT) + https://kube.io/blog/liquid-glass-css-svg/
Approach: port the physics engine (surface equations -> Snell ray trace -> SVG displacement map + specular map ->
`backdrop-filter: url(#filter)`) as framework-agnostic TS + React primitives, and re-point the app's existing
`html.liquid-glass` optics at it. Gesture engines (utils/glassPress.ts, utils/glassSwitch.ts) keep their event
architecture; only their optics are replaced.
Verification: `npx tsc --noEmit` (app/), `npm run build`, plus headless-Chrome visual harness screenshots.

## M-LG1: Refraction engine (port) | status: completed
### T-LG1.1: Pure math + maps | status: completed
- [x] S-LG1.1.1: `app/src/glass/surfaceEquations.ts` (convex circle / convex squircle / concave / lip) | verified tsc
- [x] S-LG1.1.2: `app/src/glass/displacementMap.ts` (bezel ray trace + shape-aware pill/rect/squircle map, buffer cap) | verified tsc + numeric profile check
- [x] S-LG1.1.3: `app/src/glass/specular.ts` folded into `displacementMap.ts` (rim specular from edge normal vs light angle) | verified tsc + harness render
- [x] S-LG1.1.4: Numeric check of every profile at real app sizes; added `maxShift` cap (see deviation note) | verified `node check-profiles.mjs`

## M-LG2: Registry + React primitives | status: completed
### T-LG2.1: Filter graph + surfaces | status: completed
- [x] S-LG2.1.1: `app/src/glass/filterRegistry.ts` (cached `<filter>` per geometry hash, shared host, refcount + LRU, 8 app presets) | verified harness reports 20 filters for 22 surfaces
- [x] S-LG2.1.2: `app/src/glass/measure.ts` + `app/src/glass/useGlassRefraction.ts` (React hook, off-render builds, blur fallback) | verified tsc
- [x] S-LG2.1.3: Container/panel primitive folded into the DOM layer + `glass-refraction.css` instead of a separate component (app has no React glass primitives to replace) | verified harness render

## M-LG3: DOM attach layer for existing markup | status: completed
- [x] S-LG3.1.1: `app/src/glass/glassRefraction.ts` — 20 look targets (switches, thumbs, tabs, buttons, menus, dialogs, toolbars, panels, fields), one MutationObserver + one ResizeObserver, per-kind `maxArea`, frost suffix, `CSS.supports` guard | verified harness: 22 surfaces / 20 filters / 0 errors
- [x] S-LG3.1.2: Registered in `App.tsx` beside trackGlassPointer/Press/Switch/Select; CSS imported from `main.tsx` | verified tsc + build

## M-LG4: Re-point the existing glass optics | status: completed
- [x] S-LG4.1.1: `app/src/glass/glass-refraction.css` + optics sections of `liquid-glass.css` rewritten (lens clone-optics removed) | verified harness
- [x] S-LG4.1.2: `utils/glassSwitch.ts` lens now refracts the real backdrop via `glassFilter`; gesture physics untouched | verified harness: `lens=1` + visible bend
- [x] S-LG4.1.3: `utils/liquidLens.ts` deleted; `LiquidSlider.tsx` re-pointed to the new engine | verified tsc
- Note (deliberate deviation from the reference): the ported trace lets a grazing ray travel the whole glass thickness sideways and reported 122px of shift on an 8px bezel. Added `maxShift` (default 1x bezel width) — a ray that would exit that far never gets out of real glass — which also makes `reach`/`scale` predictable.
- Note: `preserveAspectRatio="none"` on both `feImage`s. The reference omits it, so any buffer capped below element size is letterboxed and the whole field lands in the wrong place.
- Note: window chrome (`.chrome`, `.statusbar`) intentionally keeps its frosted glass — full-width, over a flat background, so a bend would show nothing while the frost is the point.

## M-LG5: Verify | status: completed
- [x] S-LG5.1.1: `npx tsc --noEmit` (app/) clean | verified
- [x] S-LG5.1.2: `npm run build` passes (1m29s; only the pre-existing chunk-size warning) | verified
- [x] S-LG5.1.3: Headless-Chrome harness (`app/glass-lab.html`, dev-only) screenshots: held switch lens, held nav thumb, switch tracks, thumbs, panel, menu and toolbar all refracting vs a `data-no-glass-refraction` control column | verified 2 screenshots + DOM report `{supported:true, refracting:22, filters:20, lens:1, thumb:1, errors:[]}`
- Probe (before building): a minimal `backdrop-filter: url(#filter)` page screenshotted in Chromium, confirming the engine runs the filter — the comment in `utils/glassSwitch.ts` claiming WebView2 renders it milky white did not reproduce; kept a `CSS.supports` guard so a non-Chromium engine falls back to the painted glass.

## M-LG6: Follow-ups from the first pass | status: completed
### T-LG6.1: Container edges, magnifier, settings | status: completed
- [x] S-LG6.1.1: Container gradient-blur edges — `glass-refraction.css` `[data-glass-edge]` gives a large pane a two-step progressive blur ramp (3px outer + 14px inner, masked and radius-clipped) instead of refraction. The attach layer picks it by `EDGE_AREA` (120k px²) via `edges: true` on `.ws-panel` and dialog panels. A container cannot refract *and* carry descendant filters: an element with `backdrop-filter` becomes a backdrop root and its children filter an empty backdrop, so the layer sets `backdrop-filter: none` inline for exactly those elements. | verified tsc + build + harness render
- [x] S-LG6.1.2: `glass/GlassMagnifier.tsx` + `glass-magnifier.css` — the reference's drag-a-lens as a component: spring-followed pointer, round bezel built for the lens box, a centre `magnify` pass on top of the bezel pull, iridescent rim, specular arc, caustic glint, lift on grab, stays on screen, `pointer-events` only on its own ring. Off by default; new persisted `glassMagnifier` setting renders it from `App.tsx` behind the feature flag | verified tsc + build
- [x] S-LG6.1.3: Settings → Appearance → **Glass optics** group (shown only while Liquid glass is on): bezel-profile `Segmented` (Default/Squircle/Circle/Concave/Lip), refraction-strength `SliderRow` (30–200%), magnifier `ToggleRow`. Store: `glassProfile`, `glassStrength`, `glassMagnifier` (+ setters, defaults, partialize). `glassOptions.ts` holds the preferences; `glassFilter` folds them in (`strength` multiplies every look's own `scaleRatio`, profile replaces it), and `applyGlassPreferences` re-cuts every attached surface in place rather than tearing the layer down | verified tsc + build
- [x] S-LG6.1.4: `pinProfile` — the switch track, the held lens and the magnifier keep their own profile whatever the setting says, because the lip is what makes a switch read as a switch
- [x] S-LG6.1.5: Real-window verification: `npm run tauri dev` launched (cargo `Finished dev profile in 1.51s`, `Running target\debug\yzpzcode.exe`), the window captured over the Design Studio and the open model menu — floating toolbar, segmented thumbs (`Auto|Free|Text`, `Templates|Examples`), kind pills, workspace tab, fields and an open frosted dropdown all rendering on WebView2. No follow-up captures attempted; the dev chain this session started was stopped afterwards and the pre-existing app instance left running.

## M-LG7: Remaining | status: pending
- [ ] S-LG7.1.1: The strength slider and profile picker have no automated test; they are exercised only by hand and by tsc
- [ ] S-LG7.1.2: `glass-lab.html` verifies the browser path with synthetic pointer events. Pressing a switch or dragging a nav thumb by hand in the real window is still unverified

---

# Mission: Studios audit fixes - Writing, Presentation, Sheets + Shared Chrome

Baseline: docs/studios-audit.md (2026-10-14), 4 parallel audits. Goal: fix bugs + implement enhancements, marking each audit item [done] when verified.
Verification: `npx tsc --noEmit` (app/) clean except foreign untracked `hooks/useMonacoTheme.ts` (sibling WIP, unimported); `npm run test:sheets` 50/50; `npm run test:writing` 37/37; `npm run test:workspace-setup` 18/18.

## M1: Shared studio chrome quick-wins | status: completed
### T1.1: StudioTopBar + studio.css + Inspector | status: completed
- [x] S1.1.1: Progress indeterminate flag + CSS selector `[data-indeterminate="true"]`, run label tooltip, save-state tooltip | verified `npx tsc --noEmit` (only foreign error)
- [x] S1.1.2: InspectorTabs keyboard (arrows/roving tabindex, aria-controls/tabpanel), Section h3-in-button fix, ColorInput normalize, Sheets assistant InspectorBody wrap | verified tsc
- [x] S1.1.3: studio.css density rules + motion-off consolidation + `--sx-warning` single-source (sheets.css) | verified tsc
- [x] S1.1.4: Verify `npx tsc --noEmit` | verified (re-applied after concurrent-session revert wiped shared files; clean except foreign file)
- Note: a concurrent session reverted `studio/*` + callers mid-mission; Commander re-applied all M1 edits on the current tree.

## M2: Writing Studio fixes | agent:Worker | status: completed
### T2.1: Races + editor robustness | status: completed
- [x] S2.1.1: Review token/cancel, applyRewrite drift guard, outline pos-at-click + L3, sectionStatus preserve, humanize dirty per-section | verified tsc + writing tests 37/37
- [x] S2.1.2: Restyle lock-while-running + undo stack, cancel scoping, streaming-lock toast, export snapshot + abort, Escape scoping, selection capture-on-open, link commit-on-blur | verified tsc
- [x] S2.1.3: WRITTEN_WORDS=25 unify, references hint, measure try/catch, save error surface, photo cache reset, Escape coordination, WritingHome tabs | verified tsc
- [x] S2.1.4: Verify tsc + writing tests | tsc clean (own files), 37/37 pass

## M3: Presentation Studio fixes | agent:Worker | status: completed
### T3.1: Selection/AI/export/presenter | status: completed
- [x] S3.1.1: Undo/redo selectedIds filter + auto-reselect, AI endRun error marking, adopt() SVG forward, hidden-slide export fix, 0-visible presenter guard | verified tsc (own files)
- [x] S3.1.2: 0-slide blank + empty state, delete toasts, coalesced undo post-draw, per-workspace clipboard, theme dark unify + state reset, export cancel, filmstrip keyboard, presenter keys/typed timeout, stale state reset | verified tsc
- [x] S3.1.3: Verify tsc | clean in owned files (8 files restored from concurrent-session stash, content verified)
- Deferred with rationale: BatchReview pagination + narration prewarm scoping (risky from DesignedEditor alone).

## M4: Sheets Studio fixes | agent:Worker | status: completed
### T4.1: Import/export/undo/perf/UX | status: completed
- [x] S4.1.1: B-1 TSV export, B-2 CSV `=`-as-formula, B-6 truncation toast, I-1 values-only confirm, I-2 cycle `#CALC!` + warning | verified tsc + sheets 50/50
- [x] S4.1.2: B-3 typing coalesce, B-4 clamp giant ranges, B-5 recovery estimate, I-3 zoom persist, I-4 skip recalc for style ops, I-6 save retry, I-7 empty hints, I-8 cross-workspace open | verified tsc + sheets 50/50
- [x] S4.1.3: Verify `npm run test:sheets` + tsc | 50/50 pass; one assertion updated (cycle now `#CALC!`)
- Deferred with rationale: I-5 iterative worklist (measured unnecessary — 3000-chain passes, recursion depth ~25).

## M5: Shared storage/setup/docs | agent:Commander | status: completed
### T5.1: Setup gate + storage robustness + docs | status: completed
- [x] S5.1.1: Setup launch gate (studioReady in canOpen/primaryEnabled + preparing blocker) + Retry in StudioLocation + base label (Documents vs Home) | verified tsc + workspace-setup 18/18
- [x] S5.1.2: Root revalidation (`forgetStudioRoot` + hook retry); FS-backed slugs + watcher refresh deferred — need Rust backend change / cross-workspace locking, documented in fix log | verified tests
- [x] S5.1.3: Docs three-studio wording (README, CLAUDE.md, code comments) + full [done] fix log in docs/studios-audit.md | verified by read
- [x] S5.1.4: Verify tsc + workspace-setup tests | tsc clean except foreign `useMonacoTheme.ts`; 18/18 pass

Blockers (foreign, not ours): untracked `app/src/hooks/useMonacoTheme.ts` (sibling WIP) breaks `tsc` with 2 errors (`buildMonacoThemeData`, `monacoThemeName`); unimported anywhere — left untouched. Concurrent sessions reverted shared-chrome files once; re-applied and verified.

## M6: Release v5.40.0 | status: in_progress
### T6.1: Version bump + push + Action | status: in_progress
- [x] S6.1.1: Bumped 5.39.0 → 5.40.0 in `app/package.json`, `app/src-tauri/Cargo.toml`, `app/src-tauri/tauri.conf.json`
- [x] S6.1.2: `npm run build` checked: vite bundle passes (2m9s); `tsc` gate fails only on foreign untracked `useMonacoTheme.ts` (excluded from commit; clean-checkout Action build unaffected)
- [x] S6.1.3: Committed 37 files (`ad662e2`, foreign file + mission todo excluded), rebased onto remote, pushed `main` + tag `v5.40.0`
- [ ] S6.1.4: Release Action run 38563747157 in_progress (create draft → 4-platform builds → latest.json → publish); updater will pick it up on publish

## M7: Skills Market (vercel-labs/skills integration) | status: completed
### T7.1: Rust backend `npx skills@latest` + skills.sh catalog | status: completed
- [x] S7.1.1: New `app/src-tauri/src/skills/` (types/catalog/inventory/runner) + `commands/skill_commands.rs` 8 commands, `mod skills` + handler registration | verified `cargo check` clean, `cargo clippy -- -D warnings` clean, `cargo test skills` 7/7 pass
- [x] S7.1.2: Catalog via reqwest skills.sh `/api/v1/skills|search|{id}|audit/{id}`, install/remove/update via `npx -y skills@latest` with DISABLE_TELEMETRY, `skill-install-progress` events | verified by code read + tests
### T7.2: Frontend market UI (global default, hybrid catalog+custom) | status: completed
- [x] S7.2.1: `data/skillsAgents.ts` 27-agent slug map, `types/index.ts` Skill* interfaces, `stores/skillStore.ts` (scope default global) | verified `npx tsc --noEmit` zero errors in owned files
- [x] S7.2.2: `SkillsMarketPanel.tsx` + `SkillInstallDialog.tsx` (graphical terminal workflow: scope/agent/copy + live progress), header Extensions|Skills dropdown, Workspace sidebar + Ctrl+Shift+S + progress listener | verified by read + tsc
- [x] S7.2.3: Header dropdown fix — replaced blur-based close (unmounts menu before click in WebView2, `relatedTarget` null) with capture-phase outside pointerdown + Escape + arrow-key nav, `aria-haspopup/expanded`, `z-[200]`, motion fade | verified `npx tsc --noEmit` clean except foreign `useMonacoTheme.ts`
- [x] S7.2.4: Menu hardening — portaled to `document.body` (`fixed`, `z-[9000]`, no motion/clipping dependency), toggle measures button rect with viewport clamps, menu callbacks explicitly open panels (no toggle-off surprise), `useTitlebarDrag` treats `Element` (svg/path icon clicks) + `[role=menu/menuitem]` as interactive | verified `npx tsc --noEmit` clean except foreign `useMonacoTheme.ts`, `npm run test:workspace-view` 7/7 pass
### T7.3: skills.sh 401 — use the CLI's public endpoint, key only where truly needed | status: completed
- [x] S7.3.1: Researched upstream — `/api/v1/*` key-gated (`Bearer sk_live_…`, keys issued on request, anonymous removed after scraper abuse per maintainer); CLI `find` uses public `GET /api/search` (verified live, no auth)
- [x] S7.3.2: Backend — `catalog.rs` search via public `/api/search` (+ optional key, `SKILLS_API_URL` override like CLI), v1 trending/audit key-gated with `SKILLS_API_KEY_REQUIRED:` marker + key-rejected/429 messages, new `github.rs` key-free SKILL.md preview via GitHub trees+raw (`GITHUB_TOKEN`/`GH_TOKEN` supported like CLI), `api_key` param on 4 Tauri commands
- [x] S7.3.3: Frontend — `skillsApiKey` in appStore (persisted), key passed from skillStore, panel key-gate with suggestion chips + Settings/docs/request-key links, audit key-hint, Settings → Agents key field
- [x] S7.3.4: Verified `cargo check` clean, `cargo clippy --all-targets -- -D warnings` clean, `cargo test skills` 18/18 pass (11 new: public-search mapping ×3, key precedence, github id split, marker errors ×2, SKILL.md picker ×4), `npx tsc --noEmit` clean except foreign `useMonacoTheme.ts`, `npm run test:workspace-view` 7/7 pass
### T7.4: Per-skill stars + installs | status: completed
- [x] S7.4.1: Backend — `stars: Option<i64>` on SkillSummary/SkillDetail (serde aliases `stargazers_count`/`repoStars`/…), `github::fetch_repo_stars` best-effort via GitHub repos API, `enrich_with_stars` fills search + trending concurrently per unique repo, detail fallback includes stars | verified `cargo check` clean, `cargo clippy --all-targets -- -D warnings` clean, `cargo test skills` 20/20 pass (new: repo-source split, stars alias deserialization)
- [x] S7.4.2: Frontend — `stars?: number | null` on SkillSummary/SkillDetail, market cards show ★ stars + ⬇ installs with icons/compact counts/tooltips/aria-labels (stars hidden for non-GitHub/offline), install dialog header shows `★ N stars · M installs` | verified `npx tsc --noEmit` clean except foreign `useMonacoTheme.ts`

## M8: ReactBits PromptBar as the default composer in every studio | status: completed
Goal: the adapted React Bits PromptBar becomes the composer of the Writing, Presentation and Design studios' start screens — same bar everywhere; each studio keeps its own controls (size, style, options…) in the bar row and its own attach flow.
### T8.1: PromptBar component + shared StudioPromptBar wrapper | status: completed
- [x] S8.1.1: PromptBar — `extras` slot in the bar row, `autoFocus`, controlled `draft`/`onDraftChange`, `onModelChange`, `canSend` override, `onPaste`, `inputLabel`, hide the slash menu when no commands, scroll cap for long menus, menu buttons focus the field before toggling (no focus/close race)
- [x] S8.1.2: `components/composer/StudioPromptBar.tsx` — installed engines as model rows (`engine::model`, lazy per-engine model lists, engine name as the default row), effort slider from the model's efforts (hidden without any, stale level reset), attach row; theme props pass through
### T8.2: Studio integration | status: completed
- [x] S8.2.1: Design home (`design/DesignComposer.tsx`) — bar replaces the textarea and its bar; Size/Style menus in `extras`; card background exposed as `--dz-card-bg` for the bar
- [x] S8.2.2: Presentation home (`presentation/DesignComposer.tsx`) — bar replaces the textarea; Add folder + Options in `extras`; engine picker leaves the options panel
- [x] S8.2.3: Writing report composer (`writing/ReportComposer.tsx`) — bar replaces the textarea; References + Options in `extras`; engine fields leave the options panel; draft mirrors `details.brief` (RTL switch keeps working)
- [x] S8.2.4: Ctrl+Enter handling removed from the studio wrappers (the bar sends on Enter; no double submit)
- [x] S8.2.5: `npx tsc --noEmit` clean; `npm run build` passed (2m 15s, `StudioPromptBar` chunk emitted)
- Note: models without effort control — the effort button is hidden entirely when the chosen model lists no effort levels; picking a model resets the level to the CLI default, and a stored level the chosen model does not accept is cleared (same guard as `EffortSelect`).

## M9: Ship v5.45.0 to users | status: in_progress
Goal: bump the app version, land the verified glass work on `main`, and drive the GitHub Release workflow so the updater sees 5.45.0.
Verification: three version files agree, `npx tsc --noEmit` clean, Release run green, GitHub release published (not draft) with `latest.json` for the updater.
### T9.1: Version + commits | status: completed
- [x] S9.1.1: `app/package.json`, `app/src-tauri/Cargo.toml`, `app/src-tauri/Cargo.lock`, `app/src-tauri/tauri.conf.json` all on 5.45.0 (`Cargo.lock` bumped by hand so the tag commit does not depend on a local cargo run) | verified by grep for 5.44.0 across the repo (no hits outside node_modules/target/git)
- [x] S9.1.2: Glass work committed as `ff70ffd feat(glass): ...` with the deviations and harness numbers in the message body; version bump committed separately as `64eb282 chore(release): v5.45.0` | verified `git log`
- [x] S9.1.3: Rebased the 3 local commits onto `origin/main` (was ahead 1 / behind 1 after the contributors-graphic commit) and pushed | verified `main...origin/main` in sync
### T9.2: Release | status: in_progress
- [x] S9.2.1: Annotated tag `v5.45.0` on `64eb282` pushed to origin | verified `git log --oneline -1 v5.45.0`
- [x] S9.2.2: Release workflow `38978217771` triggered by the tag push and observed in progress | verified `gh run list --workflow=release.yml`
- [ ] S9.2.3: Workflow green through build -> updater-json -> publish-release
- [ ] S9.2.4: Release notes written (real changelog in place of the workflow's placeholder body)
