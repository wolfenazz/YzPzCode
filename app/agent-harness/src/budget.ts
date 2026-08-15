// Pure token-budget / usage primitives shared by the harness and the
// probe-budget.mjs unit probe. Kept free of SDK/harness state so the budget
// behavior (usage-delta accumulation, afterModelHook enforcement) can be
// tested without a live LLM provider (sync-issues SYNC-6).

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
}

export const EMPTY_USAGE: UsageTotals = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalCost: 0,
});

export const TOKEN_BUDGET_EXCEEDED_REASON = "token-budget-exceeded" as const;

export const zeroUsage = (): UsageTotals => ({ ...EMPTY_USAGE });

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Accumulate a single SDK usage event into the running per-session totals.
 * Token fields (inputTokens/outputTokens/cacheReadTokens/cacheWriteTokens) are
 * per-turn deltas. `cost` is also a per-turn delta: the SDK's `totalCost` field
 * is CUMULATIVE, so it must never be added to a running total (adding an
 * already-cumulative number double-counts — see sync-issues SYNC-5).
 */
export function accumulateUsage(prev: UsageTotals, delta: Record<string, unknown>): UsageTotals {
  const cost = num(delta.cost); // per-turn delta only, NOT totalCost
  return {
    inputTokens: prev.inputTokens + num(delta.inputTokens),
    outputTokens: prev.outputTokens + num(delta.outputTokens),
    cacheReadTokens: prev.cacheReadTokens + num(delta.cacheReadTokens),
    cacheWriteTokens: prev.cacheWriteTokens + num(delta.cacheWriteTokens),
    totalCost: prev.totalCost + cost,
  };
}

/** Tokens counted against the total-token budget (input + output + cacheRead). */
export function usageTotal(u: UsageTotals): number {
  return u.inputTokens + u.outputTokens + u.cacheReadTokens;
}

export interface BudgetStop {
  stop: true;
  reason: typeof TOKEN_BUDGET_EXCEEDED_REASON;
}

/**
 * Budget enforcement used by the harness's afterModelHook. Returns a stop
 * directive once the cumulative total reaches the per-session limit.
 * `limit <= 0` (or missing usage) = unlimited.
 */
export function enforceBudget(
  usage: UsageTotals | undefined,
  limit: number,
): BudgetStop | undefined {
  if (limit > 0 && usage) {
    if (usageTotal(usage) >= limit) {
      return { stop: true, reason: TOKEN_BUDGET_EXCEEDED_REASON };
    }
  }
  return undefined;
}
