// Behavioral probe for the read-only (ask/plan) tool guard.
//   node probe-readonly-guard.mjs   (after `npm run build`)
// Exercises the compiled harness's beforeToolGuard + handleApproval paths
// without a live LLM provider.
import { AgentHarness } from './dist/harness.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'yzpz-readonly-'));
const harness = new AgentHarness(dataDir);

// Watchdog: if anything awaits a human (act-mode approval), force-exit so the
// already-printed results are flushed instead of lost when the runner kills us.
setTimeout(() => {
  console.log('WATCHDOG: probe did not finish');
  process.exit(1);
}, 15000);

const results = [];
const ok = (name, cond, extra = '') => {
  results.push([name, cond]);
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? `  (${extra})` : ''));
};

const MODES = harness['sessionModes']; // harness-private per-session mode map
const setMode = (sid, mode) => (mode === null ? MODES.delete(sid) : MODES.set(sid, mode));
const guard = (sid, tool) => harness['beforeToolGuard'](sid, tool);

const SID = 'session-test-1';

// ── plan mode is read-only ───────────────────────────────────────────
setMode(SID, 'plan');
ok('plan blocks editor', guard(SID, 'editor')?.skip === true);
ok('plan blocks apply_patch', guard(SID, 'apply_patch')?.skip === true);
ok('plan blocks run_commands', guard(SID, 'run_commands')?.skip === true);
ok('plan blocks spawn_agent', guard(SID, 'spawn_agent')?.skip === true);
ok('plan blocks team_run_task', guard(SID, 'team_run_task')?.skip === true);
ok('plan allows read_files', guard(SID, 'read_files') === undefined);
ok('plan allows search_codebase', guard(SID, 'search_codebase') === undefined);
ok('plan allows fetch_web_content', guard(SID, 'fetch_web_content') === undefined);
ok('plan allows ask_question', guard(SID, 'ask_question') === undefined);
ok('plan allows todo_write', guard(SID, 'todo_write') === undefined);

// ── ask mode stays read-only ─────────────────────────────────────────
setMode(SID, 'ask');
ok('ask blocks editor', guard(SID, 'editor')?.skip === true);
ok('ask blocks run_commands', guard(SID, 'run_commands')?.skip === true);
ok('ask allows read_files', guard(SID, 'read_files') === undefined);

// ── act mode is NOT read-only ────────────────────────────────────────
setMode(SID, 'act');
ok('act allows editor', guard(SID, 'editor') === undefined);
ok('act allows run_commands', guard(SID, 'run_commands') === undefined);

// ── no mode recorded defaults to act (never blocks) ──────────────────
setMode(SID, null);
ok('no-mode allows editor', guard(SID, 'editor') === undefined);

// ── handleApproval denies mutating tools in read-only modes ──────────
setMode(SID, 'plan');
const denial = await harness['handleApproval']({
  sessionId: SID,
  agentId: 'a',
  toolCallId: 't1',
  toolName: 'editor',
  input: {},
  policy: { autoApprove: true }, // even if a policy says autoApprove
});
ok('plan denies approval for editor despite autoApprove policy', denial.approved === false);

const mcpPromise = harness['handleApproval']({
  sessionId: SID,
  agentId: 'a',
  toolCallId: 't2',
  toolName: 'some_mcp_write_tool',
  input: {},
  policy: { autoApprove: true },
});
// Give the handler a tick to reach the pending-approval branch (it must NOT
// auto-approve unknown tools in a read-only session).
await new Promise((r) => setTimeout(r, 50));
const pendingEntry = [...harness['approvals'].values()].find(
  (p) => p.request.toolName === 'some_mcp_write_tool',
);
ok(
  'read-only mode does not auto-approve unknown/MCP tools (waits for explicit user consent)',
  Boolean(pendingEntry),
);
// Deny it explicitly (simulating the user clicking "reject"), then await.
for (const [requestId, p] of harness['approvals']) {
  if (p.request.toolName === 'some_mcp_write_tool') harness['resolveApproval'](requestId, false, 'test cleanup');
}
const mcpDenial = await mcpPromise;
ok('unknown MCP tool request resolved through explicit user decision, not auto-approve', mcpDenial.approved === false);

setMode(SID, 'ask');
const askDenial = await harness['handleApproval']({
  sessionId: SID,
  agentId: 'a',
  toolCallId: 't3',
  toolName: 'run_commands',
  input: {},
  policy: { autoApprove: true },
});
ok('ask denies approval for run_commands despite autoApprove policy', askDenial.approved === false);

console.log('\nRESULT: ' + results.filter(([, c]) => c).length + '/' + results.length + ' passed');
process.exit(0); // act-mode approvals intentionally await a human; never test those here

