import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const sources = new Map(await Promise.all(['utils/workspaceSetup', 'data/additionalAgents'].map(async (path) => [
  path, await readFile(new URL(`../src/${path}.ts`, import.meta.url), 'utf8'),
])));

const result = await build({
  stdin: { contents: await readFile(new URL('../src/hooks/useWorkspace.ts', import.meta.url), 'utf8'), loader: 'ts' },
  tsconfigRaw: {},
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'workspace-setup-fixture',
    setup(builder) {
      builder.onResolve({ filter: /(?:utils\/workspaceSetup|data\/additionalAgents)$/ }, ({ path }) => ({ path: path.replace('../', ''), namespace: 'source' }));
      builder.onLoad({ filter: /.*/, namespace: 'source' }, ({ path }) => ({ contents: sources.get(path), loader: 'ts' }));
      builder.onResolve({ filter: /^react$|@tauri-apps\/plugin-dialog|stores\/(?:appStore|extensionStore)/ }, ({ path }) => ({ path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
        contents: path === 'react'
          ? `export const useState = initial => {
              const fixture = globalThis.workspaceSetupFixture;
              const index = fixture.cursor++;
              if (!(index in fixture.slots)) fixture.slots[index] = typeof initial === 'function' ? initial() : initial;
              return [fixture.slots[index], value => { fixture.slots[index] = typeof value === 'function' ? value(fixture.slots[index]) : value; }];
            };
            export const useCallback = callback => callback;
            export const useMemo = callback => callback();`
          : path.includes('extensionStore')
            ? 'export const useExtensionStore = { getState: () => globalThis.workspaceSetupFixture.extensions };'
            : path.includes('appStore')
              ? 'export const useAppStore = Object.assign(() => globalThis.workspaceSetupFixture.app, { getState: () => globalThis.workspaceSetupFixture.app });'
              : 'export const open = async () => globalThis.workspaceSetupFixture.folder;',
        loader: 'js',
      }));
    },
  }],
});
const { useWorkspace } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

function setup(context) {
  const storage = new Map();
  const events = [];
  const fixture = {
    slots: [], cursor: 0, folder: 'C:\\Projects\\my-app',
    app: {
      defaultTerminalCount: 1,
      addRecentDirectory: path => events.push(['recent', path]),
      openWorkspace: workspace => events.push(['workspace', workspace]),
      setActiveView: view => events.push(['view', view]),
    },
    extensions: {
      backendReady: true,
      catalog: [{ id: 'openai.chatgpt', name: 'Codex', installedVersion: '1' }, { id: 'google.antigravity', name: 'Antigravity', installedVersion: '1' }],
      openPanel: (workspaceId, extension) => events.push(['panel', workspaceId, extension.id]),
    },
  };
  globalThis.workspaceSetupFixture = fixture;
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } });
  context.after(() => {
    delete globalThis.workspaceSetupFixture;
    if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage);
    else delete globalThis.localStorage;
  });
  const render = () => { fixture.cursor = 0; return useWorkspace(); };
  return { fixture, events, storage, render };
}

test('quick setup needs only a folder and follows inferred names without overwriting custom names', async (context) => {
  const { render } = setup(context);
  let api = render();
  assert.equal(api.selectedLayout.sessions, 1);
  await api.selectDirectory();
  api = render();
  assert.equal(api.workspaceName, 'my-app');
  assert.equal(api.isValid, true);
  api.selectRecentDirectory('/home/projects/next-project/');
  api = render();
  assert.equal(api.workspaceName, 'next-project');
  api.setWorkspaceName('My custom name');
  api = render();
  api.selectRecentDirectory('C:\\Projects\\another-app');
  assert.equal(render().workspaceName, 'My custom name');
});

test('reducing terminal count fits agents and tools, and no terminals clears every allocation', (context) => {
  const { render } = setup(context);
  let api = render();
  api.setSelectedLayout({ type: 'grid', sessions: 4 });
  api = render();
  api.updateAgentFleet({ totalSlots: 4, allocation: { ...api.agentFleet.allocation, codex: 2, gh: 2 } });
  api = render();
  api.setSelectedLayout({ type: 'grid', sessions: 1 });
  api = render();
  assert.equal(api.agentFleet.allocation.codex, 1);
  assert.equal(api.agentFleet.allocation.gh, 0);
  assert.equal(api.isAllocationValid, true);
  api.setSelectedLayout({ type: 'grid', sessions: 0, openExternally: true });
  api = render();
  assert.equal(api.selectedLayout.openExternally, false);
  assert.equal(api.agentFleet.totalSlots, 0);
  assert.equal(Object.values(api.agentFleet.allocation).every(count => count === 0), true);
});

test('new workspace uses the saved no-terminals preference and templates can override it', (context) => {
  const { render, fixture } = setup(context);
  fixture.app.defaultTerminalCount = 0;
  let api = render();
  assert.equal(api.selectedLayout.sessions, 0);
  assert.equal(api.agentFleet.totalSlots, 0);
  api.applyTemplate('quick');
  api = render();
  assert.equal(api.selectedLayout.sessions, 1);
  assert.equal(api.agentFleet.allocation.claude, 1);
});

test('extensions-only setup registers selected panels before opening the workspace', async (context) => {
  const { render, events } = setup(context);
  let api = render();
  api.selectRecentDirectory('/project');
  api.setSelectedLayout({ type: 'grid', sessions: 0 });
  api.toggleExtension('openai.chatgpt');
  api.toggleExtension('google.antigravity');
  api = render();
  const workspace = await api.createWorkspace();
  assert.equal(workspace.layout.sessions, 0);
  assert.equal(workspace.agentFleet.totalSlots, 0);
  assert.deepEqual(events.filter(([kind]) => kind === 'panel'), [
    ['panel', workspace.id, 'openai.chatgpt'], ['panel', workspace.id, 'google.antigravity'],
  ]);
  assert.ok(events.findIndex(([kind]) => kind === 'workspace') > events.findLastIndex(([kind]) => kind === 'panel'));
  assert.equal(events.some(([kind]) => kind === 'view'), false);
});

test('no terminals and no extensions opens the editor', async (context) => {
  const { render, events } = setup(context);
  let api = render();
  api.selectRecentDirectory('/project');
  api.setSelectedLayout({ type: 'grid', sessions: 0 });
  api = render();
  await api.createWorkspace();
  assert.deepEqual(events.at(-1), ['view', 'editor']);
});

test('extensions switch external launches back into the app and installation selection is idempotent', (context) => {
  const { render } = setup(context);
  let api = render();
  api.setSelectedLayout({ type: 'grid', sessions: 1, openExternally: true });
  api = render();
  assert.equal(api.selectedLayout.openExternally, true);
  api.toggleExtension('openai.chatgpt', true);
  api.toggleExtension('openai.chatgpt', true);
  api = render();
  assert.deepEqual(api.selectedExtensionIds, ['openai.chatgpt']);
  assert.equal(api.selectedLayout.openExternally, false);
  api.setSelectedLayout({ type: 'grid', sessions: 1, openExternally: true });
  assert.equal(render().selectedLayout.openExternally, false);
});

test('uninstalled extensions fail before opening a partial workspace', async (context) => {
  const { render, fixture, events } = setup(context);
  fixture.extensions.catalog[0].installedVersion = null;
  let api = render();
  api.selectRecentDirectory('/project');
  api.toggleExtension('openai.chatgpt');
  api = render();
  await assert.rejects(api.createWorkspace(), /Install the selected extensions/);
  assert.deepEqual(events, []);
});

test('custom templates restore extensions and zero terminals, filtering retired providers', (context) => {
  const { render, storage } = setup(context);
  let api = render();
  api.setSelectedLayout({ type: 'grid', sessions: 0 });
  api.toggleExtension('openai.chatgpt');
  api = render();
  api.saveAsCustomTemplate('Extensions');
  api = render();
  const id = api.selectedTemplateId;
  api.toggleExtension('openai.chatgpt');
  api.setSelectedLayout({ type: 'grid', sessions: 4 });
  const templates = JSON.parse(storage.get('yzpzcode-all-templates'));
  templates.find(template => template.id === id).extensionIds.push('retired.extension');
  storage.set('yzpzcode-all-templates', JSON.stringify(templates));
  api = render();
  api.applyTemplate(id);
  api = render();
  assert.equal(api.selectedLayout.sessions, 0);
  assert.deepEqual(api.selectedExtensionIds, ['openai.chatgpt']);
  assert.equal(api.agentFleet.totalSlots, 0);
});
