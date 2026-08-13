# Mission: PI-Grade Agent Harness for YZPZ Agent

Deep-review the PI agent harness (github.com/earendil-works/pi) and implement the same harness
quality, efficiency, and task-completion mechanics inside the YZPZ Agent harness
(`app/agent-harness/` — Cline-SDK-powered sidecar). Research COMPLETE (see .opencode/context.md).

PI's core efficiency mechanisms to replicate:
1. Tool-output truncation (head for reads / tail for bash / line for grep; 2000 lines / 50KB limits; UTF-8 safe, never partial lines)
2. Context compaction with reserve tokens + keep-recent verbatim + `<summary>` XML wrapping + file-op tracking
3. prepareTurn request projection (cap/prune stale tool results per-request)
4. Length-stop ("max-tokens") safety → detect and auto-continue instead of silent stop
5. Steering: mid-run user messages inject after the current turn (delivery:"steer" + consumePendingUserMessage)
6. Completion guard: prevent premature exit when todos are incomplete
7. System prompt tool snippets (one-line per tool) + token discipline
8. Retry/backoff resilience and loop-detection (already partly present in Cline SDK)

## M1: Tool Output Truncation Layer | status: completed
### T1.1: truncate.ts module (PI port) | agent:Worker | status: completed
- [x] S1.1.1: Create `app/agent-harness/src/truncate.ts` — truncateHead / truncateTail / truncateLine / formatSize, DEFAULT_MAX_LINES=2000, DEFAULT_MAX_BYTES=50KB, GREP_MAX_LINE_LENGTH=500, UTF-8-safe, never partial lines, TruncationResult shape (content, truncated, truncatedBy, totalLines, totalBytes, outputLines, firstLineExceedsLimit) | verified | evidence: file exists (420 lines), faithful PI port, 4-byte emoji UTF-8 spot-check pass, lsp/tsc clean
- [x] S1.1.2: Unit-testable pure functions; `npm run typecheck` passes after adding module | verified | evidence: typecheck EXIT 0, build EXIT 0, `__selfTest` "all assertions passed", record .opencode/unit-tests/2026-08-13-truncate.md

## M2: System Prompt Tool Snippets + Efficiency Directive | status: completed
### T2.1: branding.ts snippets | agent:Worker | status: completed
- [x] S2.1.1: Add PI-style one-line tool snippets map (read, bash/run_commands, search_codebase/grep, find, edit, write, fetch) injected into buildSystemPrompt | verified | evidence: TOOL_SNIPPETS 10 lines injected at branding.ts:57; names cross-checked vs live getCoreBuiltinToolCatalog() 10/10 match (9 SDK + todo_write); `find` omitted = correct (no such tool in Cline SDK catalog); truncation claims match truncate.ts constants; typecheck EXIT 0, build EXIT 0
- [x] S2.1.2: Extend EFFICIENCY_DIRECTIVE with PI-style read pagination guidance (offset/limit, continue until complete, never re-read files, stop-gathering-and-answer) | verified | evidence: all four present — offset/limit branding.ts:21,27; continue-until-complete :27; never-re-read :23; stop-gathering line added at :24 (`"- When a search or read returns enough context to answer, stop gathering and answer immediately."`) exactly once (count=1, no duplicates); npm run build EXIT 0 + npm run typecheck EXIT 0 after fix (SYNC-1 resolved)

## M3: Harness Integration (hooks + steering + guards) | status: completed
### T3.1: afterTool truncation hook | agent:Worker | depends:T1.1 | status: completed
- [x] S3.1.1: Wire `afterTool` hook in harness.ts — truncate read_files→head, run_commands→tail, search_codebase/grep→line+head; set metadata truncated flags | verified | evidence: afterTool wired harness.ts:629-632 → afterToolHook (875-891); truncateToolOutput (823-869) read→head / bash→tail / grep→line+head; synthetic test ALL PASS
- [x] S3.1.2: Emit `notice`/status event when a tool result is truncated (frontend can render) | verified | evidence: sink("notice", …) at harness.ts:886-889; confirmed via synthetic afterToolHook test (notice emitted with sessionId); frontend useAgentSession handles "notice"
- [x] S3.1.3: Unit-verify with a synthetic oversized tool result through the hook path | verified | evidence: synthetic script vs BUILT dist/harness.js → 14/14 assertions pass (head/tail/line caps, notice, isError preserved, passthrough); record .opencode/unit-tests/2026-08-13-s31-synthetic.md

### T3.2: prepareTurn request projection | agent:Worker | depends:T3.1 | status: completed
- [x] S3.2.1: Wire `prepareTurn` in session config — prune/cap stale or oversized tool results for the provider request without mutating canonical transcript; honor overflowRecovery by forcing compaction hint | verified | evidence: prepareTurn wired harness.ts:616-620 → prepareTurnHook (898-936): caps tool_result text blocks per-request via boundToolResultText (returns projected messages only — canonical transcript untouched); overflowRecovery branch emits compaction notice (906-911)
- [x] S3.2.2: Cap per-request tool-result size using truncate.ts limits | verified | evidence: boundToolResultText (harness.ts:939) uses truncateTail w/ DEFAULT_MAX_BYTES, wired into prepareTurnHook (harness.ts:922); typecheck EXIT 0

### T3.3: max-tokens length-stop handling | agent:Worker | depends:T3.1 | status: completed
- [x] S3.3.1: Wire `afterModel` hook — when finishReason === "max-tokens", emit notice and (if tool calls pending) allow loop to continue with a nudge instead of silent stop | verified | evidence: afterModel wired harness.ts:633 → afterModelHook (950-962): max-tokens → sink notice + return undefined (loop continues)
- [x] S3.3.2: Wire beforeModel to surface emitStatusNotice on iteration/overflow | verified | evidence (Reviewer-confirmed): SDK exposes emitStatusNotice on AgentPrepareTurnContext (types.d.ts:483) — overflowRecovery branch at harness.ts:906-911 emits compaction notice; per-iteration status streamed via SDK iteration_start/end (efficiency probe: iteration_start 5 / iteration_end 5). Re-scoping from beforeModel→prepareTurn confirmed SDK-accurate.

### T3.4: Steering (mid-run user messages) | agent:Worker | depends:T3.1 | status: completed
- [x] S3.4.1: sendMessage uses `delivery: "steer"` when session is active; wire `consumePendingUserMessage` so steered messages inject after current turn | verified | evidence: sendMessage (harness.ts:777-790) steerSession + delivery:"steer" when active; consumePendingUserMessage wired (614) → drains one message per iteration (969-975); efficiency probe multi-iteration run confirmed
- [x] S3.4.2: Preserve ask-mode guard ordering so steered messages respect session mode | verified | evidence: beforeToolGuard (805-811) still wired at 628 alongside new hooks; sessionModes set at 761 before dispatch — steer-queued prompts still subject to ask-mode guard on subsequent turns

### T3.5: Completion guard + compaction tuning | agent:Worker | depends:T3.1 | status: completed
- [x] S3.5.1: Wire `completionPolicy.completionGuard` — if todos pending/in_progress and model stops without completing, inject nudge and continue | verified | evidence: completionPolicy.completionGuard wired harness.ts:609-611 → completionGuard (1000-1006): filters todos with status pending/in_progress → nudge string; undefined when list clean
- [x] S3.5.2: Raise preserveRecentTokens toward PI keepRecentTokens (e.g. 12000–16000) and ensure reserve margin via knownModels cap | verified | evidence: COMPACTION_PRESERVE_RECENT_TOKENS=12_000 (harness.ts:74, raised from 8,000), wired at harness.ts:602

## M4: Verification | status: completed
### T4.1: Build + typecheck | agent:Worker | depends:M3 | status: completed
- [x] S4.1.1: `cd app/agent-harness && npm run build` (tsc) passes | verified | evidence: npm run build EXIT 0 (tsc -p tsconfig.json)
- [x] S4.1.2: `npm run typecheck` passes | verified | evidence: npm run typecheck EXIT 0

### T4.2: Smoke test | agent:Reviewer | depends:T4.1 | status: completed
- [x] S4.2.1: `node smoke.mjs` passes (sidecar boots, READY, WS commands, create/read/delete session) | verified | evidence: smoke.mjs EXIT 0 — READY, hello/ping/health, get-providers (187), create-session, read-messages, list-sessions, delete-session all [ok]

### T4.3: Rust + Frontend regression | agent:Reviewer | depends:T4.1 | status: completed
- [x] S4.3.1: `cd app/src-tauri && cargo check` passes (no Rust changes expected) | verified | evidence: cargo check --all-targets EXIT 0 (Finished dev profile)
- [x] S4.3.2: `cd app && npx tsc --noEmit` passes (no frontend changes expected unless protocol changed) | verified | evidence: npx tsc --noEmit EXIT 0

### T4.4: Full System Verification | agent:Reviewer | depends:T4.2,T4.3 | status: completed
- [x] S4.4.1: Reviewer cross-checks all hooks wired correctly, no regressions, TODO 100% [x] | verified | evidence: hooks scan harness.ts — completionGuard:610, consumePendingUserMessage:614, prepareTurnHook:620, beforeToolGuard:628, afterToolHook:632, afterModelHook:633, steerSession:778, delivery:"steer":790; gates: build EXIT 0, typecheck EXIT 0, smoke EXIT 0, synthetic 14/14, probe EXIT 0, cargo check EXIT 0, cargo test 16/16, tsc --noEmit EXIT 0; SYNC-1 resolved (stop-gathering line @ branding.ts:24); TODO 100% [x]
