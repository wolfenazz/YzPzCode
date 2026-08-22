import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentHarness } from './dist/harness.js';

const harness = new AgentHarness(mkdtempSync(join(tmpdir(), 'yzpz-queue-probe-')));
const events = [];
const sends = [];
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));
harness.setEventSink((name, payload) => events.push({ name, payload }));

// Private fields/methods remain normal JavaScript properties after TypeScript
// compilation, which makes this a small deterministic harness-level probe.
harness.runningSessions.add('queue-probe');
harness.activeSessions.add('queue-probe');
harness.cline = {
  send: async (request) => {
    sends.push(request);
  },
};

const first = await harness.sendMessage(
  'queue-probe',
  'Run only after the active task',
  undefined,
  ['data:image/png;base64,AA=='],
  ['/tmp/reference.txt'],
);
const second = await harness.sendMessage('queue-probe', 'Run third');
const pending = await harness.listPendingPrompts('queue-probe');

if (!first.accepted || !first.queued || !first.promptId) throw new Error('first prompt was not queued');
if (!second.accepted || !second.queued || !second.promptId) throw new Error('second prompt was not queued');
if (sends.length !== 0) throw new Error('a queued prompt reached the active SDK turn');
if (pending.length !== 2 || pending[0].attachmentCount !== 2) throw new Error('queue metadata is incorrect');
if (JSON.stringify(pending).includes('data:image') || JSON.stringify(pending).includes('/tmp/reference.txt')) {
  throw new Error('queue view leaked attachment payloads');
}

await harness.removePendingPrompt('queue-probe', first.promptId);
const afterRemoval = await harness.listPendingPrompts('queue-probe');
if (afterRemoval.length !== 1 || afterRemoval[0].id !== second.promptId) {
  throw new Error('queue removal did not preserve FIFO identity');
}

harness.runningSessions.delete('queue-probe');
const gapArrival = await harness.sendMessage('queue-probe', 'Run fourth');
if (!gapArrival.queued || sends.length !== 0) {
  throw new Error('a prompt bypassed FIFO during the completion-to-drain gap');
}
await harness.startNextQueuedPrompt('queue-probe');
await nextTick();
if (sends.length !== 1) throw new Error('the next queued prompt did not start');
if (sends[0].prompt !== 'Run third') throw new Error('the wrong queued prompt started');
if ('delivery' in sends[0]) throw new Error('queued prompt was delivered as steering');
if ((await harness.listPendingPrompts('queue-probe')).length !== 1) throw new Error('FIFO tail was lost');

harness.runningSessions.delete('queue-probe');
await harness.startNextQueuedPrompt('queue-probe');
await nextTick();
if (sends.length !== 2 || sends[1].prompt !== 'Run fourth') throw new Error('FIFO tail did not start second');
if ((await harness.listPendingPrompts('queue-probe')).length !== 0) throw new Error('started prompt remained queued');

const started = events.find((entry) => entry.payload?.type === 'queued_prompt_started');
if (!started) throw new Error('queued_prompt_started was not emitted');

console.log('PASS  queued prompts never intercept the active task');
console.log('PASS  FIFO cancellation and fresh-turn delivery');
console.log('PASS  queue events omit attachment payloads');
