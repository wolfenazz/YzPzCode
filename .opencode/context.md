# Project Context — YzPzCode

## Mission (completed 2026-08-14)
Added a **cumulative token budget + live telemetry** to the YZPZ Agent host to
prevent 1M-token runaway burns (a README task consumed ~1M tokens because the
harness capped *per-request* size but never the *cumulative* total).

## Root cause
- Token burn lives in `app/agent-harness/` (Cline SDK sidecar, Node ≥22).
- harness.ts already capped per-request: DEFAULT_CONTEXT_TOKEN_BUDGET=96_000,
  DEFAULT_MAX_OUTPUT_TOKENS=8192, DEFAULT_MAX_ITERATIONS=20, tool-output
  truncation, compaction — but 20 iterations × ~50–96K input = ~1M tokens.
- Legacy `app/src-tauri/src/agent/executor.rs` (single-command executor) is a
  SEPARATE older system — NOT where the burn happened. Do not confuse the two.

## What was implemented
1. **harness.ts**: `usageBySession` map accumulates `usage`/`usage-updated`
   deltas from `agent_event` subscriptions; `budgets` map (sessionId →
   maxTotalTokens, 0 = unlimited); `afterModelHook` hard-stops the loop when
   input+output+cacheRead ≥ limit, returning `{stop:true, reason:
   "token-budget-exceeded"}` + emits session-ended/notice/session-status;
   `maxTotalTokens` persisted in sessionMetadata; cleanup in stop/delete/dispose.
2. **server.ts**: create-session passes `maxTotalTokens` through.
3. **Rust**: `protocol.rs` CreateAgentSessionRequest.max_total_tokens (Option<u64>,
   camelCase → maxTotalTokens); `agent_host_commands.rs` forwards it.
4. **Frontend**: useAgentHost params+payload; NewAgentDialog numeric input
   (0 = unlimited); UsageMeter `budget` prop (red ≥100%, amber ≥90%);
   budget flows through AgentSessionSummary → SessionHistory → AgentGrid →
   AgentPane `<UsageMeter budget={session.maxTotalTokens ?? null} />`.

## Verification (all PASS, exit 0)
- `npm run build` + `npm run typecheck` in app/agent-harness
- `npx tsc --noEmit` in app
- `cargo check` + `cargo test agent_host` (7/7) + `cargo clippy` (no NEW warnings)
- Pre-existing clippy `too_many_arguments` on `update_agent_session_connection`
  (9 args, untouched) — acceptable.

## Key architecture notes
- Rust ↔ sidecar: WebSocket JSON; `CommandMessage`/`SidecarMessage` in
  `agent_host/protocol.rs`; events forwarded as `yzpz-agent:<name>`.
- Harness hooks: beforeTool/beforeModel/afterTool/afterModel in localRuntime;
  `afterModel` returns `{stop?, reason?}` — the budget stop uses this.
- sessionId access in subscribe callback: `event.payload.sessionId`; inner
  agent_event is `event.payload.event` (type `usage`/`usage-updated`/`done`).
- TODO list + completion guard (`maybeAutoContinue`, MAX 2 nudges) can extend
  runs — budget stop overrides it (afterModelHook returns stop:true).
