# Unit Test Record: max-total-tokens budget frontend

## Target Files
- `app/src/hooks/useAgentHost.ts` — `CreateAgentSessionParams.maxTotalTokens` + invoke passthrough
- `app/src/components/agent/NewAgentDialog.tsx` — state + numeric input + onCreate wiring
- `app/src/components/agent/UsageMeter.tsx` — budget-aware gauge
- `app/src/components/agent/AgentPane.tsx` — passes budget from session metadata (S3.2.3)
- `app/src/components/agent/AgentGrid.tsx` + `SessionHistory.tsx` — metadata → summary mapping
- `app/src/types/index.ts` — `AgentSessionSummary.maxTotalTokens?: number | null`

## Test Approach
No frontend test framework is configured in this project (per CLAUDE.md: "No frontend
testing framework configured yet"). Verification gate is the project's type-check:
`npx tsc --noEmit` in `app/`, plus cross-layer type alignment with Rust
(`Option<u64>` ↔ `number | null`) and the harness (`maxTotalTokens?: number`).

## Verification Evidence (Reviewer re-run 2026-08-14T18:18Z)
```
$ npx tsc --noEmit   (cwd: app/)
APP_TSC_EXIT=0        # zero type errors across the whole project

$ npm run typecheck  (cwd: app/agent-harness)   HARNESS_TYPECHECK_EXIT=0
$ npm run build      (cwd: app/agent-harness)   HARNESS_BUILD_EXIT=0
$ cargo check        (cwd: app/src-tauri)       CARGO_CHECK_EXIT=0
$ cargo test         (cwd: app/src-tauri)       CARGO_TEST_EXIT=0  # 17/17 incl.
  parses_create_session_request_with_max_total_tokens
```

## Spec Compliance Check

### 1. `hooks/useAgentHost.ts` — DONE
- Line 31: `maxTotalTokens?: number;` in `CreateAgentSessionParams` (params live in the
  hook, not types/index.ts — matches TODO "verify name; frontend params live in useAgentHost.ts")
- Line 54: `maxTotalTokens: request.maxTotalTokens ?? null,` in `createSession` invoke
  payload (matches Rust `Option<u64>` + camelCase serde)

### 2. `components/agent/NewAgentDialog.tsx` — DONE
- Line 50: `const [maxTotalTokens, setMaxTotalTokens] = useState<number>(0);`
- Lines 255–269: labeled numeric input row after Base URL block
  - type="number", min=0, step=10000, placeholder "0 = unlimited"
- Line 151: `maxTotalTokens: maxTotalTokens > 0 ? maxTotalTokens : undefined,` in `onCreate({...})`
- Line 159: dep array includes `maxTotalTokens`

### 3. `components/agent/UsageMeter.tsx` — DONE
- Line 8: `budget?: number | null;` prop added
- Lines 52–62: when `budget > 0`, `pct = Math.min(100, (total / budget) * 100)`,
  `warn = pct >= 90`, `danger = pct >= 100`, title `Token budget: X / Y`
- Budget absent → existing context-window behavior preserved unchanged
- Single unified gauge (`pct`/`warn`/`danger`) — the earlier duplicate block that
  referenced undefined `budgetPct`/`budgetWarn`/`budgetDanger` was removed (SYNC-3 resolved)

### 4. `components/agent/AgentPane.tsx` — DONE (S3.2.3, went further than the original unit record)
- Lines 411 / 714: `<UsageMeter ... budget={session.maxTotalTokens ?? null} />`
- Budget source = `AgentSessionSummary.maxTotalTokens` (from session metadata)

### 5. Metadata round-trip — DONE (added after the first unit record snapshot)
- `types/index.ts:490` `AgentSessionSummary.maxTotalTokens?: number | null`
- `AgentGrid.tsx:70` restores from `metadata.maxTotalTokens`; `:117` sets on create;
  `:188/:201` carry on resume
- `SessionHistory.tsx:40` maps `metadata.maxTotalTokens` → summary
- Harness persists it: `harness.ts:706` `sessionMetadata.maxTotalTokens` →
  SDK session list → Rust → frontend metadata mapping (consistent with the existing
  workspaceId/title/providerId/modelId metadata pattern)

## Notes / Observations (non-blocking)
- Harness emits a top-level `usage-updated` sink event (`harness.ts:501`); the frontend
  does not subscribe to `yzpz-agent:usage-updated` directly, but the live meter still
  works via the pre-existing `session-event` → `agent_event`(`usage`) → `applyUsageDelta`
  path (`useAgentSession.ts:396-407`). Both accumulate the same deltas — no drift.
- Budget-exceeded stop delivers `session-ended` (`reason: "token-budget-exceeded"`) +
  `session-status: done`, which the frontend handles (`useAgentSession.ts:528-537`);
  the gauge turns red at 100%. The extra `notice` event is not surfaced verbatim in the
  UI (no `yzpz-agent:notice` listener) — visual feedback via the meter is sufficient.
- Display accounting: `UsageMeter.usageTotals` includes cacheWriteTokens while the
  afterModelHook enforcement counts input+output+cacheRead only — the meter may show a
  slightly higher % than the enforcement threshold for sessions with heavy cache writes.
  Cosmetic only; both clamp at 100%.

## Result
- Status: pass (implementation verified; unit record updated to match the final on-disk state)
- Session: ses_budget + Reviewer re-verification
- Timestamp: 2026-08-14T18:23Z
