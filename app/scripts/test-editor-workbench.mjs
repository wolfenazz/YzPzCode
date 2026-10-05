import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const app = fileURLToPath(new URL('..', import.meta.url));
const { Color } = await import(pathToFileURL(resolve(app, 'node_modules/monaco-editor/esm/vs/base/common/color.js')).href);
const result = await build({
  stdin: { contents: `export * from './src/stores/editorLayoutStore'; export * from './src/utils/editorSave'; export * from './src/utils/fileSync'; export * from './src/utils/monacoThemeColor';`, resolveDir: app, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', tsconfigRaw: {},
  plugins: [{ name: 'editor-fixture', setup(builder) {
    builder.onResolve({ filter: /^zustand(\/middleware)?$/ }, ({ path }) => ({ path: pathToFileURL(require.resolve(path)).href, external: true }));
    builder.onResolve({ filter: /stores\/appStore$|^@tauri-apps\/api\/core$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path.includes('appStore')
      ? 'export const useAppStore = { getState: () => globalThis.editorFixture.state };'
      : 'export const invoke = (...args) => globalThis.editorFixture.invoke(...args);', loader: 'js' }));
    builder.onResolve({ filter: /^\./ }, ({ path, importer, resolveDir }) => {
      const base = resolve(importer ? dirname(importer) : resolveDir, path);
      const found = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      return found ? { path: found } : undefined;
    });
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = async () => { for (let index = 0; index < 5; index++) await new Promise(setImmediate); };

function fixture(content = 'edited', originalContent = 'original') {
  const tab = { path: '/project/index.ts', name: 'index.ts', language: 'typescript', content, originalContent, isDirty: content !== originalContent };
  const state = {
    activeWorkspaceId: 'workspace-a', filesByWorkspace: { 'workspace-a': [tab] }, editorTrimWhitespace: false,
    updateFileContent(path, content) {
      const files = this.filesByWorkspace[this.activeWorkspaceId];
      this.filesByWorkspace[this.activeWorkspaceId] = files.map((file) => file.path === path ? { ...file, content, isDirty: content !== file.originalContent } : file);
    },
    markFileSaved(path, content, workspaceId) {
      this.filesByWorkspace[workspaceId] = this.filesByWorkspace[workspaceId].map((file) => file.path === path ? api.markSavedContent(file, content) : file);
    },
    reconcileFileDisk(workspaceId, path, disk) {
      this.filesByWorkspace[workspaceId] = this.filesByWorkspace[workspaceId].map((file) => file.path === path ? api.reconcileFileFromDisk(file, disk) : file);
    },
  };
  const writes = [];
  const context = {
    state, disk: originalContent, writes,
    async invoke(command, args) {
      if (command === 'read_file_content') {
        if (this.disk === null) throw new Error('File does not exist: /project/index.ts');
        return { content: this.disk, language: 'typescript' };
      }
      if (command === 'write_file_content') { writes.push(args); this.disk = args.content; return; }
      throw new Error(`Unexpected command: ${command}`);
    },
  };
  globalThis.editorFixture = { state, invoke: (...args) => context.invoke(...args) };
  return { ...context, context, file: () => state.filesByWorkspace['workspace-a'][0], save: () => api.saveEditorFile('workspace-a', tab.path) };
}

test('a split keeps Markdown and code selections independent', () => {
  const initial = { ...api.createEditorGroups('/README.md'), secondary: '/src/main.ts', layout: 'columns', focused: 'secondary' };
  const result = api.reconcileEditorGroups(initial, ['/README.md', '/src/main.ts', '/src/app.ts'], '/src/main.ts');
  assert.equal(result.primary, '/README.md');
  assert.equal(result.secondary, '/src/main.ts');
  assert.equal(result.focused, 'secondary');
});

test('translucent theme colors become valid Monaco hex colors', () => {
  assert.equal(api.toMonacoThemeColor('rgba(12, 8, 27, 0.96)', '#262626'), '#0c081bf5');
  assert.equal(api.toMonacoThemeColor('rgb(12 8 27 / 96%)', '#262626'), '#0c081bf5');
  assert.equal(api.toMonacoThemeColor('rgb(255, 128, 0)', '#262626'), '#ff8000');
  assert.equal(api.toMonacoThemeColor('rgb(100% 0% 100%)', '#262626'), '#ff00ff');
  assert.ok(Color.Format.CSS.parseHex(api.toMonacoThemeColor('rgba(12, 8, 27, 0.96)', '#262626')));
});

test('hex theme colors and fallbacks never pass invalid values to Monaco', () => {
  for (const hex of ['#abc', '#abcd', '#0c081b', '#0c081bf5']) assert.equal(api.toMonacoThemeColor(hex, '#262626'), hex);
  assert.equal(api.toMonacoThemeColor('rgba(nope)', '#262626'), '#262626');
  assert.equal(api.toMonacoThemeColor('', 'rgba(0,0,0,1)'), '#262626');
});

test('closing a split file picks a remaining file without invalid paths', () => {
  const initial = { ...api.createEditorGroups('/README.md'), secondary: '/removed.ts', layout: 'rows' };
  const result = api.reconcileEditorGroups(initial, ['/README.md', '/src/main.ts'], '/README.md');
  assert.equal(result.secondary, '/src/main.ts');
  assert.equal(result.layout, 'rows');
});

test('one open file can appear in both panes', () => {
  const result = api.reconcileEditorGroups({ ...api.createEditorGroups('/README.md'), layout: 'columns' }, ['/README.md'], '/README.md');
  assert.equal(result.primary, result.secondary);
});

test('a closed workspace leaves no stale pane paths', () => {
  const result = api.reconcileEditorGroups({ ...api.createEditorGroups('/README.md'), layout: 'rows', secondary: '/main.ts' }, [], null);
  assert.equal(result.primary, null);
  assert.equal(result.secondary, null);
});

test('single pane restoration removes the secondary path', () => {
  const result = api.reconcileEditorGroups({ ...api.createEditorGroups('/main.ts'), secondary: '/README.md' }, ['/main.ts', '/README.md'], '/main.ts');
  assert.equal(result.secondary, null);
});

test('saving writes the requested pane file and clears its dirty state', async () => {
  const host = fixture();
  await host.save();
  assert.deepEqual(host.writes, [{ path: '/project/index.ts', content: 'edited' }]);
  assert.equal(host.file().isDirty, false);
});

test('trimming preserves CRLF and updates the open model content', async () => {
  const host = fixture('one  \r\ntwo\t\r\n');
  host.state.editorTrimWhitespace = true;
  await host.save();
  assert.equal(host.writes[0].content, 'one\r\ntwo\r\n');
  assert.equal(host.file().content, 'one\r\ntwo\r\n');
  assert.equal(host.file().isDirty, false);
});

test('clean files do not perform disk IO', async () => {
  const host = fixture('original', 'original');
  host.context.invoke = () => { throw new Error('Disk IO must not run'); };
  await host.save();
});

test('a disk conflict preserves edits and never overwrites external content', async () => {
  const host = fixture();
  host.context.disk = 'external change';
  await assert.rejects(host.save(), /changed on disk/);
  assert.equal(host.file().content, 'edited');
  assert.equal(host.file().diskContent, 'external change');
  assert.equal(host.writes.length, 0);
});

test('an existing conflict blocks saving before disk IO', async () => {
  const host = fixture();
  host.file().diskContent = 'external';
  host.context.invoke = () => { throw new Error('Disk IO must not run'); };
  await assert.rejects(host.save(), /Resolve the disk change/);
});

test('deleted files require explicit restoration before saving', async () => {
  const host = fixture();
  host.context.disk = null;
  await assert.rejects(host.save(), /changed on disk/);
  assert.equal(host.file().diskContent, null);
  assert.equal(host.writes.length, 0);
});

test('an approved restoration can recreate a deleted file', async () => {
  const host = fixture();
  host.context.disk = null;
  host.file().recreateOnSave = true;
  await host.save();
  assert.equal(host.writes.length, 1);
  assert.equal(host.file().isDirty, false);
});

test('edits made while a disk write is pending stay dirty', async () => {
  const host = fixture();
  const gate = deferred();
  const invoke = host.context.invoke.bind(host.context);
  host.context.invoke = async (command, args) => { if (command === 'write_file_content') await gate.promise; return invoke(command, args); };
  const saving = host.save();
  await tick();
  host.state.updateFileContent('/project/index.ts', 'newer edits');
  gate.resolve();
  await saving;
  assert.equal(host.file().content, 'newer edits');
  assert.equal(host.file().originalContent, 'edited');
  assert.equal(host.file().isDirty, true);
});

test('three saves from shared panes serialize rather than race', async () => {
  const host = fixture();
  const gate = deferred();
  const invoke = host.context.invoke.bind(host.context);
  let active = 0;
  let peak = 0;
  host.context.invoke = async (command, args) => {
    if (command !== 'write_file_content') return invoke(command, args);
    active++; peak = Math.max(peak, active);
    await gate.promise;
    const result = await invoke(command, args);
    active--; return result;
  };
  const saves = [host.save(), host.save(), host.save()];
  await tick();
  gate.resolve();
  await Promise.all(saves);
  assert.equal(peak, 1);
  assert.equal(host.writes.length, 1);
});

test('a tab closed while its disk read is pending is not written', async () => {
  const host = fixture();
  const gate = deferred();
  const invoke = host.context.invoke.bind(host.context);
  host.context.invoke = async (command, args) => { if (command === 'read_file_content') await gate.promise; return invoke(command, args); };
  const saving = host.save();
  await tick();
  host.state.filesByWorkspace['workspace-a'] = [];
  gate.resolve();
  await saving;
  assert.equal(host.writes.length, 0);
});

test('workspace switching does not mark a different workspace file as saved', async () => {
  const host = fixture();
  const gate = deferred();
  const invoke = host.context.invoke.bind(host.context);
  host.context.invoke = async (command, args) => { if (command === 'write_file_content') await gate.promise; return invoke(command, args); };
  const saving = host.save();
  await tick();
  host.state.activeWorkspaceId = 'workspace-b';
  host.state.filesByWorkspace['workspace-b'] = [{ ...host.file(), content: 'workspace b edits' }];
  gate.resolve();
  await saving;
  assert.equal(host.file().isDirty, false);
  assert.equal(host.state.filesByWorkspace['workspace-b'][0].content, 'workspace b edits');
  assert.equal(host.state.filesByWorkspace['workspace-b'][0].isDirty, true);
});

test('failed IO releases the shared save guard for a retry', async () => {
  const host = fixture();
  const invoke = host.context.invoke.bind(host.context);
  host.context.invoke = async () => { throw new Error('Permission denied'); };
  await assert.rejects(host.save(), /Permission denied/);
  host.context.invoke = invoke;
  await host.save();
  assert.equal(host.file().isDirty, false);
});
