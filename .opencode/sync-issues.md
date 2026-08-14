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
- Status: pending

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
- Status: pending

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
- Status: pending
