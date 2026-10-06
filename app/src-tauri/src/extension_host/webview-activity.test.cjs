const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { adaptWebviewHtml } = require('./host-preload.cjs');

const source = fs.readFileSync(require.resolve('./webview-activity.js'), 'utf8');

function setup(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  const posted = [];
  const listeners = {};
  let observerCallback;
  const body = { tagName: 'BODY', contains: () => false };
  const textarea = { tagName: 'TEXTAREA', contains: node => node === textarea };
  const doc = {
    body,
    activeElement: body,
    animations: [],
    getAnimations() { return this.animations; },
    addEventListener: (type, listener) => { listeners[type] = listener; },
  };
  class MutationObserver {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  }
  const context = {
    URLSearchParams, WeakSet, MutationObserver, setInterval, Date,
    location: { search: '?id=1&parentOrigin=http%3A%2F%2Fpanel-a.localhost%3A4000' },
    document: { getElementById: id => (id === 'active-frame' ? { contentDocument: doc } : null) },
    window: { parent: { postMessage: (message, origin) => posted.push({ message, origin }) } },
  };
  vm.runInNewContext(source, context);
  t.mock.timers.tick(500); // Attach to the active frame.
  const spinner = () => ({
    playState: 'running',
    effect: { getComputedTiming: () => ({ iterations: Infinity }), target: { isConnected: true, nodeType: 1 } },
  });
  const events = () => posted.map(({ message }) => message.yzpzPanelEvent);
  return {
    posted, doc, spinner, events,
    completions: () => events().filter(event => event === 'task-complete'),
    submit: () => listeners.keydown({ key: 'Enter', shiftKey: false, isComposing: false, target: textarea }),
    escape: () => listeners.keydown({ key: 'Escape', target: textarea }),
    mutate: () => observerCallback([{ target: { nodeType: 1, parentNode: body } }]),
    stream(ms) { for (let elapsed = 0; elapsed < ms; elapsed += 250) { this.mutate(); t.mock.timers.tick(250); } },
    wait: ms => t.mock.timers.tick(ms),
  };
}

test('a submitted request that streams and then settles notifies the workbench once', t => {
  const pane = setup(t);
  pane.submit();
  pane.stream(6000);
  pane.wait(3500);
  assert.deepEqual(pane.events(), ['task-busy', 'task-complete']);
  assert.ok(pane.posted.every(({ origin }) => origin === 'http://panel-a.localhost:4000'));
  pane.wait(10000);
  assert.equal(pane.posted.length, 2);
});

test('quick replies, interrupted requests, and unsubmitted activity stay silent', t => {
  const pane = setup(t);
  pane.submit();
  pane.stream(2000);
  pane.wait(3500);
  pane.stream(8000); // Activity without a new submit.
  pane.wait(3500);
  pane.submit();
  pane.stream(5000);
  pane.escape();
  pane.wait(3500);
  assert.equal(pane.completions().length, 0);
});

test('a spinner shown for the request keeps it busy without DOM changes', t => {
  const pane = setup(t);
  pane.submit();
  pane.doc.animations = [pane.spinner()];
  pane.wait(10000);
  assert.deepEqual(pane.events(), ['task-busy']);
  pane.doc.animations = [];
  pane.wait(3500);
  assert.deepEqual(pane.events(), ['task-busy', 'task-complete']);
});

test('idle animations that were already running do not hold the task open', t => {
  const pane = setup(t);
  pane.doc.animations = [pane.spinner()];
  pane.submit();
  pane.stream(5000);
  pane.wait(3500);
  assert.equal(pane.completions().length, 1);
});

test('busy is reported once a request is underway and cleared when it ends early', t => {
  const pane = setup(t);
  pane.submit();
  pane.stream(500);
  pane.wait(3500);
  assert.deepEqual(pane.events(), [], 'a quick reply never shows as working');

  pane.submit();
  pane.stream(2000);
  assert.deepEqual(pane.events(), ['task-busy']);
  pane.wait(3500);
  assert.deepEqual(pane.events(), ['task-busy', 'task-idle'], 'too short to count as done');

  pane.submit();
  pane.stream(3000);
  pane.escape();
  assert.deepEqual(pane.events(), ['task-busy', 'task-idle', 'task-busy', 'task-idle'], 'Escape clears it at once');
  pane.wait(3500);
  assert.equal(pane.posted.length, 4);
});

test('activity without a submit never shows as working', t => {
  const pane = setup(t);
  pane.stream(8000);
  pane.wait(3500);
  assert.deepEqual(pane.events(), []);
});

test('the webview bootstrap loads the activity script', () => {
  const html = adaptWebviewHtml('<html><head><meta charset="UTF-8"></head><body></body></html>');
  assert.match(html, /<script src="\.\/yzpz-activity\.js"><\/script><\/head>/);
});
