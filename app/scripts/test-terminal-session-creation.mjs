import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
// Render the actual hook. Mock only IPC and store access to control when PTY
// creation completes relative to a workspace switch.
const result = await build({
  stdin: {
    contents: await readFile(new URL('../src/hooks/useTerminal.ts', import.meta.url), 'utf8'),
    sourcefile: 'useTerminal.ts',
    loader: 'ts',
  },
  tsconfigRaw: {},
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [{
    name: 'terminal-session-fixture',
    setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: pathToFileURL(require.resolve('react')).href, external: true }));
      builder.onResolve({ filter: /@tauri-apps\/api\/core|stores\/appStore|utils\/agentAllocation/ }, ({ path }) => ({ path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
        contents: path.includes('appStore')
          ? 'export const useAppStore = Object.assign(selector => selector(globalThis.terminalSessionFixture.state), { getState: () => globalThis.terminalSessionFixture.state });'
          : path.includes('agentAllocation')
            ? 'export const activeAgentAllocation = value => value; export const humanizeAgentVariantMismatch = () => null;'
            : 'export const invoke = (...args) => globalThis.terminalSessionFixture.invoke(...args);',
        loader: 'js',
      }));
    },
  }],
});
const { useTerminal } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

function setup(context, activeWorkspaceId) {
  const writes = [];
  let resolve;
  let reject;
  const pending = new Promise((done, fail) => { resolve = done; reject = fail; });
  const state = {
    activeWorkspaceId,
    sessions: [{ id: 'existing-terminal', workspaceId: 'existing' }],
    setSessions: (sessions) => writes.push(['global', sessions]),
    setSessionsForWorkspace: (workspaceId, sessions) => writes.push(['workspace', workspaceId, sessions]),
    setIsLoadingTerminals: (loading) => writes.push(['loading', loading]),
    setTerminalError: (error) => writes.push(['error', error]),
  };
  globalThis.terminalSessionFixture = { state, invoke: () => pending };
  context.after(() => { delete globalThis.terminalSessionFixture; });
  context.mock.method(console, 'error', () => undefined);
  let api;
  function Probe() {
    api = useTerminal();
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  const request = { workspaceId: 'new', workspacePath: '/new', count: 1, agentFleet: { totalSlots: 1, allocation: {} } };
  return { state, writes, resolve, reject, start: (overrides = {}) => api.createSessions({ ...request, ...overrides }) };
}

test('no terminals skips IPC and leaves other workspace loading, errors, and sessions intact', async (context) => {
  const fixture = setup(context, 'existing');
  globalThis.terminalSessionFixture.invoke = () => { throw new Error('No PTY request should be made'); };
  assert.deepEqual(await fixture.start({ count: 0 }), []);
  assert.deepEqual(fixture.writes, []);
});

test('starting workspace setup leaves existing visible sessions intact', async (context) => {
  const fixture = setup(context, 'existing');
  const creation = fixture.start();
  assert.equal(fixture.writes.some(([kind]) => kind === 'global'), false);
  const sessions = [{ id: 'new-terminal', workspaceId: 'new' }];
  fixture.resolve(sessions);
  await creation;
  assert.deepEqual(fixture.writes.filter(([kind]) => kind === 'workspace'), [
    ['workspace', 'new', []], ['workspace', 'new', sessions],
  ]);
  assert.equal(fixture.writes.some(([kind]) => kind === 'global'), false);
});

test('switching workspaces during setup cannot replace the active terminals', async (context) => {
  const fixture = setup(context, 'new');
  const creation = fixture.start();
  fixture.state.activeWorkspaceId = 'existing';
  fixture.resolve([{ id: 'new-terminal', workspaceId: 'new' }]);
  await creation;
  assert.equal(fixture.writes.some(([kind]) => kind === 'global'), false);
  assert.equal(fixture.writes.at(-2)[1], 'new');
});

test('background setup failure does not replace the active workspace with an error screen', async (context) => {
  const fixture = setup(context, 'new');
  const creation = fixture.start();
  fixture.state.activeWorkspaceId = 'existing';
  fixture.reject(new Error('setup failed'));
  await assert.rejects(creation, /setup failed/);
  assert.deepEqual(fixture.writes.filter(([kind]) => kind === 'error'), [['error', null]]);
});

test('setup failure is still surfaced in its active workspace', async (context) => {
  const fixture = setup(context, 'new');
  const creation = fixture.start();
  fixture.reject(new Error('setup failed'));
  await assert.rejects(creation, /setup failed/);
  assert.deepEqual(fixture.writes.filter(([kind]) => kind === 'error'), [['error', null], ['error', 'setup failed']]);
});
