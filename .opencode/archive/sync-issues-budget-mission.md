# Sync Issues (Unresolved Only)

## SYNC-5
- Severity: MEDIUM
- Files: app/agent-harness/src/harness.ts (usage accumulation :492)
- Problem: Cost double-count in `usageBySession` accumulation. SDK `AgentUsageEvent`
  (@cline/shared agents/types.d.ts:98-116) defines `cost?` = "Cost for this turn"
  (per-turn delta) and `totalCost?` = "Accumulated totals" (CUMULATIVE). Harness line
  492 prefers the accumulated field: `const cost = typeof inner.totalCost === "number"
  ? inner.totalCost : inner.cost;` then ADDS it: `totalCost: prev.totalCost + num(cost)`.
  If the SDK emits `totalCost` (accumulated) on successive usage events, the harness
  accumulates an already-cumulative number → inflated totalCost. Token fields
  (inputTokens/outputTokens/cacheRead/cacheWrite) correctly use per-turn deltas; cost
  is inconsistent.
- Impact: budget ENFORCEMENT is unaffected (afterModelHook counts only input+output+
  cacheRead at :1100). The wrong value lives in `usageBySession.totalCost` and the
  `usage-updated` event payload (harness.ts:501) — currently not consumed by the
  frontend (frontend meter uses raw SDK usage events via session-event path), so no
  user-visible break today, but the emitted telemetry is incorrect.
- Fix: use the per-turn delta for consistency — `const cost = typeof inner.cost ===
  "number" && Number.isFinite(inner.cost) ? inner.cost : 0;` (drop the `totalCost`
  preference), matching how the token fields are accumulated.
- Status: FIXED (2026-08-15) — harness.ts:550 uses the per-turn `cost` delta; frontend
  useAgentSession.ts:570 no longer prefers cumulative `totalCost`. The frontend now
  also subscribes to the harness's authoritative cumulative `usage-updated` event
  (useAgentHost.ts onUsageUpdated → useAgentSession.ts setUsage), so the meter is
  corrected on every update regardless of SDK event shape.

## SYNC-6
- Severity: MEDIUM
- Files: app/agent-harness/src/harness.ts (budget logic)
- Problem: No behavioral unit test for the M1 harness budget module. The Rust side has
  `parses_create_session_request_with_max_total_tokens` (cargo test 17/17 PASS) and the
  frontend has a typecheck-gate record (.opencode/unit-tests/2026-08-14T1809-budget-
  frontend.md), but the actual budget behavior — usage-delta accumulation (:476-503),
  afterModelHook stop on budget exceed (:1090-1110), budgets map seeding/cleanup
  (:684, :1376/:1391/:1654) — has NO test. No probe script exists for budget
  (probe-ask/cwd/efficiency/mcp/resume/truncate + smoke all lack budget references).
  Worker's "unit test pass" claim was only build+typecheck (compilation gates), not a
  behavioral test.
- Fix: add a `probe-budget.mjs` (mirroring probe-truncate.mjs convention) that drives
  synthetic usage agent events through the harness and asserts: (a) deltas accumulate
  correctly in usageBySession, (b) afterModelHook returns
  `{stop:true, reason:"token-budget-exceeded"}` once cumulative total ≥ limit, (c)
  `usage-updated` event emitted, (d) budgets cleared on deleteSession/dispose. Record
  result in .opencode/unit-tests/.
- Status: FIXED (2026-08-15) — budget logic extracted to pure `src/budget.ts`
  (accumulateUsage/usageTotal/enforceBudget, behavior-identical) and covered by
  `probe-budget.mjs` (21/21 PASS, no live provider needed) — record in
  .opencode/unit-tests/2026-08-15-budget-probe.md. Assertions covered: (a) delta
  accumulation, (b) afterModelHook stop reason "token-budget-exceeded",
  SYNC-5 cost regression, side-effect-freedom, unlimited default. (c) event
  emission and (d) map cleanup remain integration-verified via the SYNC-7 path.

## SYNC-7 (Reviewer final gate 2026-08-14)
- Severity: HIGH (feature gap — core safety property bypassed on a first-class flow;
  NOT a regression: resumed session behaves as unlimited, matching pre-feature behavior)
- Files: app/agent-harness/src/harness.ts (resumeSession :803-883 → startClineSession :858-871)
- Problem: `resumeSession` calls `startClineSession` WITHOUT `maxTotalTokens`. In
  `startClineSession`, `budgets.set(sessionId, args.maxTotalTokens ?? 0)` (:684) →
  budget becomes 0 (unlimited) after ANY resume, so the afterModelHook hard stop
  (:1090-1110) is silently disabled. Additionally, `usageBySession` is deleted+zeroed
  (:685-692), and the SDK emits per-run usage DELTAS (eventAdapter.reset() per run —
  verified in @cline/core dist index.js `translateUsage`), so even if the budget were
  restored the enforcement would compare against only post-resume usage. sessionMetadata
  DOES persist maxTotalTokens (:706) and resumeSession already reads `metadata` (:837) —
  it just never restores it into `budgets`. Resume is a first-class flow: AgentGrid
  auto-resumes all open panes after sidecar/app restart, and stop() keeps sessions alive
  "so it can be resumed instantly later". A budgeted session that goes through stop→
  resume or app-restart→resume loses its cap → the 1M-token runaway this feature exists
  to prevent can recur.
- Fix: in `resumeSession`, pass
  `maxTotalTokens: typeof metadata.maxTotalTokens === "number" ? metadata.maxTotalTokens : undefined`
  to `startClineSession`, and re-seed `usageBySession` from `getAccumulatedUsage(sessionId)`
  (SDK cumulative) after `startClineSession` (instead of leaving zeros) so enforcement
  compares against the full cumulative total, not just post-resume deltas.
- Status: FIXED (2026-08-15) — harness.ts resumeSession restores `maxTotalTokens` from
  persisted metadata (:992-995) and re-seeds `usageBySession` from
  `cline.getAccumulatedUsage(sessionId).usage` (:1003-1018); `stop()` no longer wipes
  `budgets`/`usageBySession` (:1549-1552) so a paused session keeps its cap and meter.
  Budget-stop also suppresses auto-continue (`budgetStoppedSessions`, afterModelHook
  :1258, maybeAutoContinue :618, completionGuard :1341).

## SYNC-8 (Plan mode is not read-only — agents edit/create/delete files in plan mode)
- Severity: CRITICAL (safety property; user-reported)
- Files: app/agent-harness/src/harness.ts (beforeToolGuard :1181, handleApproval :750,
  sendMessage mode persistence :1124-1130, resumeSession :1090-1096, getSession :1718,
  persistSessionMode :1738)
- Root cause: The harness starts every Cline SDK session in mode `act` and only passes
  `mode` per-send (`sendMessage` maps plan→"plan"). The SDK registers its only plan-mode
  enforcement (`core.plan-mode-command-guard`, which guards run_commands) at SESSION
  START when `G.mode==="plan"` — never for these sessions — and it never gates the
  `editor`/`apply_patch` tools anyway. The harness's own `beforeToolGuard` only blocked
  mutating tools for `ask`, so plan mode was enforced purely by prompt text.
- Also fixed: (a) `ASK_BLOCKED_TOOLS` contained non-existent SDK tool names
  (write_file/create_file/delete_file/rename_file) and used prefix-free exact matching;
  real SDK tools are read_files, search_codebase, run_commands, fetch_web_content,
  apply_patch, editor, skills, ask_question, submit_and_exit. (b) Subagent/teammate
  bypass: the SDK reuses the parent session's hooks for subagents, but their sessionIds
  aren't in `sessionModes`, so the old guard (keyed by the subagent's id) defaulted to
  act; the new guard is keyed on the harness-owned parent session id via the inherited
  hooks. (c) Mode was never persisted: after stop→resume/app-restart it reset to `act`.
  (d) Global tool auto-approve short-circuited approvals even in read-only modes,
  silently executing unknown/MCP write tools.
- Fix: `beforeToolGuard` now hard-blocks mutating tools (editor, apply_patch,
  run_commands, skills, spawn_agent, submit_and_exit, `team_*`) for BOTH ask and plan.
  `handleApproval` denies known mutating tools in read-only modes and skips the global
  auto-approve short-circuit for read-only sessions (unknown/MCP tools need explicit
  user consent). Mode is persisted into sessionMetadata on send, restored by
  `resumeSession`, surfaced by `getSession`, and the frontend seeds the mode tab from
  `AgentSessionSummary.mode` (AgentGrid/AgentPane/useAgentSession).
- Validation: `npm run build` (harness), `npx tsc --noEmit` (frontend), regression
  probe 9/9, new `probe-readonly-guard.mjs` 20/20 (plan/ask block mutators, allow
  read-only tools, act unaffected, approvals denied in read-only modes, unknown MCP
  tools require explicit consent).
