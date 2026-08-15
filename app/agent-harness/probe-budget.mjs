// Synthetic token-budget probe (SYNC-6): exercises the pure budget/usage
// primitives that the harness's afterModelHook enforcement runs on
// (usage-delta accumulation, per-turn cost deltas, cumulative-total stop).
// No LLM needed — drives synthetic usage events straight through the same
// functions harness.ts imports from ./dist/budget.js.
//   node probe-budget.mjs   (after `npm run build`)
import {
  accumulateUsage,
  enforceBudget,
  usageTotal,
  zeroUsage,
  EMPTY_USAGE,
  TOKEN_BUDGET_EXCEEDED_REASON,
} from "./dist/budget.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  [ok] ${name}`);
  } else {
    failures += 1;
    console.log(`  [FAIL] ${name} ${detail}`);
  }
}

// (a) Usage deltas accumulate correctly across successive SDK usage events.
let acc = zeroUsage();
acc = accumulateUsage(acc, { inputTokens: 100, outputTokens: 50, cacheReadTokens: 25, cacheWriteTokens: 5, cost: 0.01 });
acc = accumulateUsage(acc, { inputTokens: 40, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0.004 });
acc = accumulateUsage(acc, { inputTokens: 10, outputTokens: 5, cacheReadTokens: 15, cacheWriteTokens: 0, cost: 0.002 });
check("accumulates inputTokens deltas", acc.inputTokens === 150, `got ${acc.inputTokens}`);
check("accumulates outputTokens deltas", acc.outputTokens === 65, `got ${acc.outputTokens}`);
check("accumulates cacheReadTokens deltas", acc.cacheReadTokens === 40, `got ${acc.cacheReadTokens}`);
check("accumulates cacheWriteTokens deltas", acc.cacheWriteTokens === 5, `got ${acc.cacheWriteTokens}`);
check("accumulates per-turn cost deltas", Math.abs(acc.totalCost - 0.016) < 1e-9, `got ${acc.totalCost}`);

// SYNC-5 regression: the SDK's totalCost is CUMULATIVE and must never be added
// to the running total (that double-counts). Cost always comes from the
// per-turn `cost` field only.
const syn5 = accumulateUsage(zeroUsage(), { inputTokens: 0, cost: 1, totalCost: 999999 });
check("SYNC-5: ignores cumulative totalCost, uses per-turn cost only", syn5.totalCost === 1, `got ${syn5.totalCost}`);
const syn5b = accumulateUsage({ ...zeroUsage(), totalCost: 10 }, { inputTokens: 1, cost: 0.5, totalCost: 10.5 });
check("SYNC-5: cumulative totalCost never accumulates", syn5b.totalCost === 10.5, `got ${syn5b.totalCost}`);

// Non-numeric / missing usage fields are treated as 0, never NaN. The num()
// guard only accepts real finite numbers — strings are rejected defensively.
const sparse = accumulateUsage(zeroUsage(), { inputTokens: "5", outputTokens: undefined, cacheReadTokens: null, cost: NaN });
check("non-numeric fields guarded to 0", sparse.inputTokens === 0 && sparse.outputTokens === 0 && sparse.cacheReadTokens === 0 && sparse.totalCost === 0 && Number.isFinite(sparse.totalCost), JSON.stringify(sparse));

// usageTotal counts input + output + cacheRead (cacheWrite excluded).
check(
  "usageTotal = input+output+cacheRead (cacheWrite excluded)",
  usageTotal({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 9999, totalCost: 0 }) === 60,
  `got ${usageTotal({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 9999, totalCost: 0 })}`
);

// zeroUsage returns a fresh, zeroed accumulator every time.
const z1 = zeroUsage();
const z2 = zeroUsage();
check("zeroUsage starts at 0", usageTotal(z1) === 0 && z1.totalCost === 0);
check("zeroUsage returns fresh objects", z1 !== z2);
check("EMPTY_USAGE is frozen", Object.isFrozen(EMPTY_USAGE));

// (b) enforceBudget: stops once cumulative total >= limit, unlimited when <= 0.
const under = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0 };
check("no stop below limit", enforceBudget(under, 200) === undefined);
check("stop at exactly the limit", enforceBudget(under, 150)?.stop === true && enforceBudget(under, 150)?.reason === TOKEN_BUDGET_EXCEEDED_REASON);
check("stop above the limit", enforceBudget(under, 100)?.reason === "token-budget-exceeded");
check("limit 0 = unlimited", enforceBudget(under, 0) === undefined);
check("negative limit = unlimited", enforceBudget(under, -5) === undefined);
check("missing usage never stops", enforceBudget(undefined, 1) === undefined);
check("exactly-empty usage never stops", enforceBudget(zeroUsage(), 1) === undefined);
check("reason constant matches", TOKEN_BUDGET_EXCEEDED_REASON === "token-budget-exceeded");

// (d) Budget enforcement is pure: repeated calls do not mutate the usage
// object, so harness map state stays authoritative.
const snapshot = { ...under };
enforceBudget(under, 1);
check("enforceBudget is side-effect free", JSON.stringify(under) === JSON.stringify(snapshot));

if (failures === 0) {
  console.log("\nprobe-budget: ALL PASS");
} else {
  console.log(`\nprobe-budget: ${failures} FAILURE(S)`);
  process.exitCode = 1;
}
