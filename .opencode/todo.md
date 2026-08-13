# Mission: Explorer → VS Code Parity (Phases 1–3)

## M1: Phase 1 — Core DnD + Multi-select Fixes
### T1.1: useFileTree.ts — multi-file move + unloaded-folder fix | agent:Worker
- [x] S1.1.1: handleMove loops all dragIds, batches tree update | size:L
- [x] S1.1.2: insertNodeIntoDirectory keeps loaded:false for unloaded dirs | size:M
- [x] S1.1.3: open destination dir after move | size:S

### T1.2: Multi-select clipboard (TreeNode.tsx, appStore.ts) | agent:Worker
- [x] S1.2.1: ExplorerClipboard → entries array with isClipboardPath helper | size:M
- [x] S1.2.2: appStore explorerClipboard type updated | size:S
- [x] S1.2.3: TreeNode cut visual uses membership check | size:S

### T1.3: FileExplorer.tsx multi-select handlers | agent:Worker | depends:T1.1,T1.2
- [x] S1.3.1: handleCopy/handleCut snapshot all selectedNodes | size:S
- [x] S1.3.2: keyboard handler Ctrl+C/X/V + Delete for all nodes | size:M
- [x] S1.3.3: handlePaste loops clipboard entries | size:M

### T1.4: Multi-delete confirmation | agent:Worker | depends:T1.3
- [x] S1.4.1: pendingDelete holds paths array; modal handles N items | size:M

### T1.5: Drop-onto-file → parent folder | agent:Worker | depends:T1.3
- [x] S1.5.1: disableDrop relaxed; dest resolves to parent for files | size:M

### T1.6: Context menu multi-select | agent:Worker | depends:T1.3
- [x] S1.6.1: menu items apply to full selection | size:M

## M2: Phase 2 — Live Tree Sync
### T2.1: useFileTree refresh API + watcher wiring | agent:Worker | depends:M1
- [x] S2.1.1: refreshPath + mergePreservingLoaded added to useFileTree | size:M
- [x] S2.1.2: FileExplorer listens to file-system-changed → tree refresh | size:M
- [x] S2.1.3: refresh preserves expanded/loaded state | size:S

### T2.2: watcher.rs re-watch new dirs | agent:Worker | depends:M1 | status: completed
- [x] S2.2.1: re-watch newly created top-level dirs + 3 unit tests | size:M | verified | evidence: cargo test filesystem::watcher → 3 passed, cargo check clean, clippy 0 warnings in watcher.rs, fmt clean, full cargo test 5/5 | 2026-08-13T03:00:00Z

## M3: Phase 3 — VS Code Parity Extras
### T3.1: Reveal Active File + Open Editors section | agent:Worker | depends:M2
- [x] S3.1.1: Reveal Active File header button + openParents/scrollTo/select | size:M
- [x] S3.1.2: Open Editors section above tree (dirty indicators, close) | size:L

### T3.2: Enter-to-open + search highlighting | agent:Worker | depends:M2
- [x] S3.2.1: Enter opens file via capture-phase interception (F2 rename kept) | size:S
- [x] S3.2.2: searchMatch fn + HighlightedName component | size:M

### T3.3: Extra context menu items | agent:Worker | depends:T1.6
- [x] S3.3.1: Copy Name, Find in Folder + multi-select items | size:M

### T3.4: Undo for explorer ops | agent:Worker | depends:M2
- [x] S3.4.1: undo log (move/delete/create/rename/duplicate) + Ctrl+Z | size:L

## M4: Verification
### T4.1: Frontend typecheck | agent:Reviewer | depends:M3
- [x] S4.1.1: npx tsc --noEmit passes | size:S
### T4.2: Backend check | agent:Reviewer | depends:M3
- [x] S4.2.1: cargo check + clippy + cargo test passes | size:S
### T4.3: Full System Verification | agent:Reviewer | depends:T4.1,T4.2 | status: completed
- [x] S4.3.1: integration review of all changed files (evidence in .opencode/integration-status.md) | size:M | verified | evidence: npx tsc exit 0, npm run build exit 0 (1m48s), cargo test 5/5, cargo check clean, clippy exit 0 (0 in mission files), fmt clean, contracts consistent, 0 debug artifacts | 2026-08-13T03:04:00Z
