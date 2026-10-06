import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mock, test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/agentDoneNotifier.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { AgentActivityTracker } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

/** Streams output every 100 ms for `ms`, like an agent spinner repainting. */
function stream(tracker, ms) {
  for (let t = 0; t < ms; t += 100) {
    tracker.output();
    mock.timers.tick(100);
  }
}

function setup(t) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  t.after(() => mock.timers.reset());
  const states = [];
  const tracker = new AgentActivityTracker((state) => states.push(state));
  return { tracker, phases: () => states.map((s) => s.phase), states };
}

test('a submitted task goes busy, then done once output goes quiet', (t) => {
  const { tracker, phases, states } = setup(t);
  tracker.arm();
  stream(tracker, 6000);
  assert.deepEqual(phases(), ['busy']);
  mock.timers.tick(3000);
  assert.deepEqual(phases(), ['busy', 'done']);
  assert.ok(states[1].durationMs >= 5900 && states[1].durationMs <= 6100, `duration ${states[1].durationMs}`);
});

test('a quick menu pick never shows as working', (t) => {
  const { tracker, phases } = setup(t);
  tracker.arm();
  stream(tracker, 200);
  mock.timers.tick(5000);
  assert.deepEqual(phases(), []);
});

test('typing after a short run does not read as a task', (t) => {
  const { tracker, phases } = setup(t);
  tracker.arm();
  stream(tracker, 200);
  mock.timers.tick(700);
  // Arrow keys in a menu, then the user writes the next prompt.
  tracker.typed('\x1b[B');
  tracker.typed('h');
  stream(tracker, 6000);
  mock.timers.tick(3000);
  assert.deepEqual(phases(), []);
});

test('typing ahead while the agent works keeps it working', (t) => {
  const { tracker, phases } = setup(t);
  tracker.arm();
  stream(tracker, 2000);
  tracker.typed('next question');
  stream(tracker, 3000);
  mock.timers.tick(3000);
  assert.deepEqual(phases(), ['busy', 'done']);
});

test('focus and mouse reports are not typing', (t) => {
  const { tracker, phases } = setup(t);
  tracker.arm();
  stream(tracker, 700);
  tracker.typed('\x1b[O');
  tracker.typed('\x1b[<0;12;4M');
  stream(tracker, 5000);
  mock.timers.tick(3000);
  assert.deepEqual(phases(), ['busy', 'done']);
});

test('an interrupt ends the working state without a done', (t) => {
  const { tracker, phases } = setup(t);
  tracker.arm();
  stream(tracker, 5000);
  tracker.disarm();
  stream(tracker, 500);
  mock.timers.tick(3000);
  assert.deepEqual(phases(), ['busy', 'idle']);
});

test('a short working run ends idle, not done', (t) => {
  const { tracker, phases } = setup(t);
  tracker.arm();
  stream(tracker, 1500);
  mock.timers.tick(3000);
  assert.deepEqual(phases(), ['busy', 'idle']);
});
