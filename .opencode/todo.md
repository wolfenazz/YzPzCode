# Mission: Add cumulative token budget + telemetry to YZPZ Agent host

## Root cause (verified)
The token burn happens in `app/agent-harness/src/harness.ts` (Cline SDK sidecar).
The harness already caps *per-request* size (96K context budget, 8K output/turn,
20 iterations) and truncates tool output — but there is **no cumulative total-token
budget**. 20 iterations × ~50–96K input = ~1M tokens. `maybeAutoContinue` can also
steer follow-ups that keep the loop running.

## M1: Backend harness — cumulative budget + usage events | agent:Worker | status: completed
### T1.1: Track per-session cumulative usage in harness.ts | status: completed
- [x] S1.1.1: Add `usageBySession = new Map<string, AgentAccumulatedUsage>` to AgentHarness
      | verified: harness.ts:234 `private usageBySession = new Map<...>`; usage accumulation
      active at :484-500; cleanup in stop/deleteSession/dispose (:1376/:1391/:1654)
- [x] S1.1.2: In `attachSubscriptions`, intercept `agent_event` events whose inner
      `event.type === "usage" | "usage-updated"` and accumulate deltas into the map
      | verified: harness.ts:476-503 — delta accumulation + `usage-updated` sink (:501)
- [x] S1.1.3: Add `budgets = new Map<string, number>` (sessionId → maxTotalTokens)
      | verified: harness.ts:239; seeded at :684 `this.budgets.set(sessionId, args.maxTotalTokens ?? 0)`

### T1.2: Enforce budget + emit events | status: completed
- [x] S1.2.1: Add `maxTotalTokens?: number` to `CreateSessionArgs` (default 0 = unlimited)
      | verified: harness.ts:146-149 w/ JSDoc
- [x] S1.2.2: In `afterModelHook`, when cumulative total (input+output+cacheRead) exceeds
      budget → return `{ stop: true, reason: "token-budget-exceeded" }` and emit a
      `session-ended` event with `reason: "token-budget-exceeded"` + a `notice` with the
      numbers used / limit
      | verified: harness.ts:1090-1110 — total = input+output+cacheRead; `{ stop: true,
      reason: "token-budget-exceeded" }`; session-ended (:1102) + notice w/ numbers (:1103-1106)
- [x] S1.2.3: Emit `usage-updated` event with the accumulated values after each usage delta
      (frontend already handles it — completes the live telemetry loop)
      | verified: harness.ts:501 `this.sink("usage-updated", { sessionId, usage })`
- [x] S1.2.4: Clear usage/budget maps in `stop()`, `deleteSession()`, `dispose()`
      | verified: :1376-1377 (stop), :1391-1392 (deleteSession), :1654-1655 (dispose)

### T1.3: Plumb budget through the sidecar server | status: completed
- [x] S1.3.1: `server.ts` create-session handler passes `maxTotalTokens` through
      | verified: server.ts:61 `maxTotalTokens: args.maxTotalTokens as number | undefined`

## M2: Rust plumbing | agent:Worker | status: completed
### T2.1: Protocol | status: completed
- [x] S2.1.1: `agent_host/protocol.rs` add `max_total_tokens: Option<u64>` to
      `CreateAgentSessionRequest` (serde camelCase → `maxTotalTokens`)
      | verified: field at protocol.rs:76 w/ `#[serde(default)]`, camelCase round-trip
      asserted in `parses_create_session_request_with_max_total_tokens` test; cargo check PASS
- [x] S2.1.2: `commands/agent_host_commands.rs` pass `"maxTotalTokens": request.max_total_tokens`
      in the create-session JSON payload
      | verified: payload line 38, matches protocol camelCase key; sidecar handler ignores
      unknown args (safe, backward-compatible); cargo test 17/17 PASS

## M3: Frontend — budget input + live meter | agent:Worker | status: completed
### T3.1: Types + hook | status: completed
- [x] S3.1.1: `src/types/index.ts` add `maxTotalTokens?: number` to `CreateAgentSessionParams`-equivalent
      (verify name; frontend params live in `useAgentHost.ts`)
      | verified: params interface is `CreateAgentSessionParams` in useAgentHost.ts:19-32 with
      `maxTotalTokens?: number` at :31 (types/index.ts has no such interface — placement correct)
- [x] S3.1.2: `src/hooks/useAgentHost.ts` `CreateAgentSessionParams` add `maxTotalTokens?: number`,
      pass through in `createSession` invoke payload
      | verified: :31 interface field; :54 payload `maxTotalTokens: request.maxTotalTokens ?? null`

### T3.2: UI | status: completed
- [x] S3.2.1: `NewAgentDialog.tsx` add optional "Max total tokens" numeric input
      (0 = unlimited), default empty/0, passed into onCreate params
      | verified: input row :255-269 (type=number, min=0, step=10000, label
      "Max Total Tokens (0 = unlimited)"); onCreate param :151
      `maxTotalTokens: maxTotalTokens > 0 ? maxTotalTokens : undefined`
- [x] S3.2.2: `UsageMeter.tsx` add optional `budget` prop — show remaining budget bar +
      % and turn red when exceeded (mirror contextPercent logic)
      | verified: prop :8; gauge :52-62 (budgetValue, pct vs budget), :83-96 (red rose-500 at
      >=100%, amber-400 at >=90%, title "Token budget: X / Y")
- [x] S3.2.3: `AgentPane.tsx` pass budget to UsageMeter (from session metadata or a
      fixed per-session default; keep simple — use session usage total + a red state
      when `status === 'ended'` with budget reason if available)
      | verified: BOTH call sites (:411, :714) now pass
      `budget={session.maxTotalTokens ?? null}` sourced from session metadata —
      completes the NewAgentDialog → params → Rust → sidecar → sessionMetadata →
      list-sessions → summary → meter chain

### T3.3: Metadata persistence + summary mapping (Commander session) | status: completed
- [x] S3.3.1: `harness.ts` `startClineSession` persists `maxTotalTokens: args.maxTotalTokens ?? 0`
      in `sessionMetadata` (line ~706) so it appears in `list-sessions` metadata
- [x] S3.3.2: `types/index.ts` `AgentSessionSummary` + `maxTotalTokens?: number | null`
      (after `status?: string;`, line ~490)
- [x] S3.3.3: `SessionHistory.tsx` `toSummary` maps metadata.maxTotalTokens
      (typeof === 'number' && > 0 ? value : null, line 40)
- [x] S3.3.4: `AgentGrid.tsx` maps maxTotalTokens in `existing.map` summary (line 70)
      and in `handleCreate` summary from params (line 117)

## M4: Verification | agent:Reviewer | status: completed
- [x] S4.1: `npm run build` in `app/agent-harness` (tsc) passes
      | verified 2026-08-14T18:15Z: EXIT 0, `tsc -p tsconfig.json` clean
- [x] S4.2: `cargo check` + `cargo test` in `app/src-tauri` pass
      | verified 2026-08-14T18:24-25Z: cargo check Finished dev profile, 0 errors;
      cargo test 17 passed / 0 failed (incl. parses_create_session_request_with_max_total_tokens)
- [x] S4.3: `npx tsc --noEmit` in `app` passes
      | verified 2026-08-14T18:15Z: EXIT 0 (clean)
- [x] S4.4: Confirm budget enforcement logic compiles and hook wiring is consistent
      (review the diff of harness.ts + server.ts + protocol.rs + dialog)
      | verified: full-chain review — NewAgentDialog → CreateAgentSessionParams →
      Rust create_agent_session (protocol.rs max_total_tokens) → sidecar server.ts →
      harness.ts budgets map + afterModelHook stop → sessionMetadata persist →
      list-sessions → AgentGrid/SessionHistory summaries → AgentPane UsageMeter budget prop
      → UsageMeter budget-aware gauge (red >=100% / amber >=90%)
