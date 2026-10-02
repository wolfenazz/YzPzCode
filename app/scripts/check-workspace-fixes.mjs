import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the implemented callbacks with controlled IPC timing. These
// checks require no browser, native webview, or extra test dependencies.
async function sourceFile(path) {
  return ts.createSourceFile(path, await readFile(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function callback(source, name, context) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      expression = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(expression, `missing callback ${name}`);
  const { outputText } = ts.transpileModule(`globalThis.result = (${expression.getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  vm.runInNewContext(outputText, context);
  return context.result;
}

const browserSource = await sourceFile('../src/components/workspace/BrowserPane.tsx');
const terminalSource = await sourceFile('../src/components/workspace/TerminalPane.tsx');
const browserHelpers = { URL, FALLBACK_URL: 'https://www.google.com' };
browserHelpers.normalizeBrowserUrl = callback(browserSource, 'normalizeBrowserUrl', browserHelpers);
browserHelpers.browserUrlsEqual = callback(browserSource, 'browserUrlsEqual', browserHelpers);

function browserHarness({ fresh = false, failOnce = false, pauseFirst = false } = {}) {
  const calls = [];
  let physicalUrl = 'https://www.google.com';
  const state = { activeTabId: 'preview', currentUrl: physicalUrl, browserTabs: [
    { id: 'preview', url: 'http://localhost:5173' },
    { id: 'other', url: 'http://localhost:3000' },
  ] };
  let release;
  const paused = new Promise((resolve) => { release = resolve; });
  const context = {
    ...browserHelpers,
    workspaceId: 'test', appZoom: 100,
    isPoppedOutRef: { current: false }, browserDisposedRef: { current: false },
    browserSyncQueueRef: { current: Promise.resolve() },
    lastSyncedBoundsKeyRef: { current: null }, pendingNavigationUrlRef: { current: null },
    previewViewportRef: { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } },
    useAppStore: { getState: () => ({ browserStateByWorkspace: { test: state }, activeView: 'browser', activeWorkspaceId: 'test' }) },
    ensureBrowserView: async (_id, url) => {
      calls.push(['ensure', url]);
      if (pauseFirst) { pauseFirst = false; await paused; }
      if (failOnce) { failOnce = false; throw new Error('transient creation failure'); }
      if (fresh) physicalUrl = url;
      return { currentUrl: physicalUrl };
    },
    navigateBrowserView: async (_id, url) => { calls.push(['navigate', url]); physicalUrl = url; },
    setBrowserViewVisibility: async () => {},
    setBrowserCurrentUrl: (_id, url) => { state.currentUrl = url; },
    setNativeBrowserReady: () => {}, setError: () => {},
  };
  return { context, state, calls, release, sync: callback(browserSource, 'syncBrowserBounds', context), physicalUrl: () => physicalUrl };
}

let harness = browserHarness();
await harness.sync();
assert.equal(harness.physicalUrl(), 'http://localhost:5173', 'first click must navigate an existing webview');
assert.equal(harness.state.currentUrl, harness.physicalUrl());
await harness.sync();
assert.equal(harness.calls.length, 2, 'repeated layout sync must not reload the page');

harness = browserHarness({ fresh: true });
await harness.sync();
assert.deepEqual(harness.calls, [['ensure', 'http://localhost:5173']], 'first creation must use the requested localhost URL');

harness = browserHarness({ failOnce: true });
await harness.sync();
await harness.sync();
assert.equal(harness.physicalUrl(), 'http://localhost:5173', 'failed initialization must remain retryable');

harness = browserHarness({ pauseFirst: true });
const first = harness.sync();
await Promise.resolve();
harness.state.activeTabId = 'other';
const second = harness.sync();
harness.release();
await Promise.all([first, second]);
assert.equal(harness.physicalUrl(), 'http://localhost:3000', 'a queued old request must not win over the latest tab');
assert.equal(harness.calls.filter(([action]) => action === 'navigate').length, 1, 'superseded tab must not navigate');

const sent = [];
let selected = false;
let managed = false;
let stops = 0;
const interruptContext = {
  xterm: { hasSelection: () => selected, input: (data) => sent.push(data) },
  managedCommandActiveRef: { get current() { return managed; } },
  stopManagedCommand: async () => { stops++; },
};
const interrupt = callback(terminalSource, 'handleInterrupt', interruptContext);
const event = { ctrlKey: true, altKey: false, shiftKey: false, key: 'c', code: 'KeyC', preventDefault() {}, stopPropagation() {} };
interrupt(event);
assert.deepEqual(sent, ['\x03'], 'Ctrl+C must reach the PTY input pipeline');
selected = true;
interrupt(event);
assert.equal(sent.length, 1, 'selected text must be copied without interrupting');
selected = false;
managed = true;
interrupt(event);
assert.equal(stops, 1, 'explicit managed commands must use their stop API');

const writes = [];
const pasteContext = {
  session: { id: 'test', shell: 'powershell.exe' },
  managedCommandActiveRef: { current: false }, effectiveAgentRef: { current: 'codex' },
  lineTrackingReliableRef: { current: true }, lineBufferRef: { current: '' },
  xtermRef: { current: { modes: { bracketedPasteMode: false } } },
  detectShellKind: () => 'powershell',
  invoke: async (command, args) => { writes.push([command, args.input]); },
};
const paste = callback(terminalSource, 'pasteToTerminal', pasteContext);
await paste('npm run dev\n');
assert.deepEqual(writes, [['write_to_terminal', 'npm run dev\r']], 'dev commands must run in the interactive shell');
writes.length = 0;
pasteContext.xtermRef.current.modes.bracketedPasteMode = true;
await paste('line1\nline2');
assert.deepEqual(writes.map(([, text]) => text), ['\x1b[200~', 'line1\nline2', '\x1b[201~'], 'bracketed paste must follow the foreground application mode');

console.log('Passed: browser first-click, reuse, retry and navigation races; Ctrl+C routing; native shell command and paste behavior.');
