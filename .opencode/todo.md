# Mission: Clean up YZPZ Agent responses — hide internal noise, better organization

The built-in YZPZ Agent chat (AgentChat.tsx) exposes internal noise: reasoning blocks,
raw tool input JSON, full tool outputs, and loud error blocks. Redesign to a clean
default (tool names + status only, I/O collapsed), hide reasoning behind a toggle,
de-emphasize errors, and tighten the agent system prompt (branding.ts) to reduce
redundant exploration and verbose summaries.

## M1: Tool I/O collapsed by default | status: completed
### T1.1: ToolBlock + ToolResultBlock collapse | status: completed
- [x] S1.1.1: `ToolBlock` default collapsed (`useState(false)`) — one-line chip shows icon+name+status only; "Tool input" expands on click | verified | evidence: AgentChat.tsx:435 useState(false), chip rows 437-462, expand 463-471
- [x] S1.1.2: `ToolResultBlock` collapsed by default with truncated preview ("Output · N lines" + first ~120 chars), expand on click | verified | evidence: AgentChat.tsx:477 useState(false), preview 480-481 (first line, 120 chars), label 497 "Output · N lines", expand 484-502
- [x] S1.1.3: Verify `npx tsc --noEmit` passes in app/ | verified | evidence: EXIT 0 (2026-08-14)

## M2: Reasoning hidden by default, toggleable | status: completed
### T2.1: Persisted setting | status: completed
- [x] S2.1.1: Add `showAgentReasoning: boolean` (default false) + setter to appStore interface/state/actions/partialize | verified | evidence: appStore.ts:277-278 interface, :837 default false, :931 setter, :1562 partialize

### T2.2: Render gating + toggle UI | status: completed | depends:T2.1
- [x] S2.2.1: AgentChat.tsx renders ReasoningBlock + streamingThinking only when showAgentReasoning is true | verified | evidence: AgentChat.tsx:526,551 (block gate), :570,644 (streamingThinking gate)
- [x] S2.2.2: AgentPane.tsx header toggle (brain/eye button) flips showAgentReasoning | verified | evidence: AgentPane.tsx:426-445 header eye button, :672-686 overflow-menu toggle
- [x] S2.2.3: Verify `npx tsc --noEmit` passes in app/ | verified | evidence: EXIT 0 (2026-08-14)

## M3: Error noise de-emphasized | status: completed
### T3.1: Collapsed muted error chips | status: completed
- [x] S3.1.1: isError results render as muted collapsed chip (⚠ label, expand on click), not full red block | verified | evidence: AgentChat.tsx:476-505 ToolResultBlock — muted bg, amber ⚠ label, collapsed default, expand on click
- [x] S3.1.2: Verify `npx tsc --noEmit` passes in app/ | verified | evidence: EXIT 0 (2026-08-14)

## M4: Agent behavior tightening | status: completed
### T4.1: branding.ts prompt rules | status: completed
- [x] S4.1.1: Add rules to EFFICIENCY_DIRECTIVE: verify file existence before read; 1-3 sentence final summary + bullets; no step-by-step narration | verified | evidence: rules at branding.ts:31-33, each exactly once; functional probe 14/14 PASS (see .opencode/unit-tests/2026-08-14-branding-m4.md)
- [x] S4.1.2: `cd app/agent-harness && npm run typecheck` + `npm run build` pass | verified | evidence: typecheck EXIT 0, build EXIT 0, dist/branding.js emitted

## M5: Verification | status: completed | depends:M1,M2,M3,M4
### T5.1: Full System Verification | status: completed
- [x] S5.1.1: Reviewer runs all gates (tsc, harness build, smoke) and confirms zero regressions, TODO 100% [x] | verified | evidence: npx tsc --noEmit EXIT 0; harness typecheck EXIT 0; harness build EXIT 0; smoke.mjs EXIT 0 (READY/ping/health/187 providers/create+delete session); branding functional probe 14/14; TODO 12/12 [x] (2026-08-14)
- [x] S5.1.1 (Reviewer independent re-verify 2026-08-14T00:57Z): all structural greps pass (appStore 4/4, AgentChat 4/4 + useAppStore 1×, AgentPane setShowAgentReasoning 3/3 + single eye toggle 1× + single overflow toggle, branding 3 rules 1× each); npx tsc --noEmit EXIT 0; agent-harness npm run typecheck EXIT 0; npm run build EXIT 0; cargo check EXIT 0 (41.7s); probe-cwd.mjs EXIT 0 (4/4); TODO 12/12 [x]
