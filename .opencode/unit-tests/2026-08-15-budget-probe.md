# Unit Test — Token Budget Probe (SYNC-6)

**Date:** 2026-08-15
**File:** `app/agent-harness/probe-budget.mjs`
**Gate:** `cd app/agent-harness && npm run build && node probe-budget.mjs` → **EXIT 0, 21/21 PASS**

## Coverage (synthetic, no live LLM)

The budget behavior was extracted into a pure module `app/agent-harness/src/budget.ts`
(`accumulateUsage`, `usageTotal`, `enforceBudget`, `zeroUsage`, `EMPTY_USAGE`,
`TOKEN_BUDGET_EXCEEDED_REASON`), imported by `harness.ts` (afterModelHook
enforcement at ~:1332-1347, cleanup at ~:1667). The probe drives synthetic
usage events through the exact functions the harness runs.

| Assertion | Status |
|-----------|--------|
| (a) Usage deltas accumulate correctly in `usageBySession` (input/output/cacheRead/cacheWrite) | ✅ |
| (a2) Per-turn `cost` deltas accumulate correctly | ✅ |
| SYNC-5 regression: cumulative SDK `totalCost` is never added to running total | ✅ |
| Non-numeric / NaN / missing fields guarded to 0 (never NaN) | ✅ |
| `usageTotal` = input + output + cacheRead (cacheWrite excluded) | ✅ |
| (b) `enforceBudget` stops with `{stop:true, reason:"token-budget-exceeded"}` at/above limit | ✅ |
| Limit 0 / negative = unlimited; missing usage never stops | ✅ |
| `enforceBudget` is side-effect free (harness map stays authoritative) | ✅ |
| (d) `zeroUsage` returns fresh frozen-empty objects | ✅ |

## Notes
- (c) `usage-updated` event emission and (d) `budgets` map cleanup remain covered
  by the integration path in `harness.ts` (SYNC-7 fix verified separately); the
  pure budget logic is now fully unit-tested without a provider.
- The earlier refactor by the probe task (budget.ts extraction) is behavior-identical:
  `accumulateUsage` still prefers per-turn `cost` over cumulative `totalCost` (SYNC-5),
  and `enforceBudget(limit<=0)=unlimited` matches `budgets.set(sessionId, args.maxTotalTokens ?? 0)`.
