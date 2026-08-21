# Sync Issues (Unresolved Only)

(none)

## Resolved this mission
- SYNC-5 (cost double-count in usage accumulation): VERIFIED FIXED —
  app/agent-harness/src/budget.ts accumulateUsage() uses per-turn `cost` delta;
  cumulative `totalCost` only seeds on first sample (prev.totalCost === 0).
  Wired via harness.ts:728 accumulateUsage call. Evidence: code read 2026-08-21.
