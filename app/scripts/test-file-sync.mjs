import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const app = fileURLToPath(new URL('..', import.meta.url));
function localModules(builder) {
  // Resolve only known local files; avoid scanning sandboxed parent directories.
  builder.onResolve({ filter: /^\./ }, ({ path, importer, resolveDir }) => {
    const base = resolve(importer ? dirname(importer) : resolveDir, path);
    const found = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    return found ? { path: found } : undefined;
  });
}
const result = await build({
  stdin: { contents: `export * from './src/utils/fileSync'; export * from './src/hooks/useFileTree'; export * from './src/hooks/useFileWatcher'; export * from './src/hooks/useGitRepository'; export * from './src/components/explorer/SourceControlPanel';`, resolveDir: app, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', tsconfigRaw: {}, jsx: 'automatic',
  plugins: [{ name: 'file-sync-fixture', setup(builder) {
    builder.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: pathToFileURL(require.resolve('react/jsx-runtime')).href, external: true }));
    builder.onResolve({ filter: /^react$|@tauri-apps\/api\/(core|event)|stores\/appStore$|^framer-motion$|^@phosphor-icons\/react$|^\.\/FileIcon$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents:
      path === 'framer-motion' ? 'export const motion = { div: "div", span: "span" };'
      : path === '@phosphor-icons/react' ? 'export const ArrowBendUpLeft="svg", ArrowClockwise="svg", ArrowsLeftRight="svg", Check="svg", CircleNotch="svg", CloudArrowDown="svg", CloudArrowUp="svg", FunnelSimple="svg", GitCommit="svg", MagnifyingGlass="svg", X="svg";'
      : path.endsWith('FileIcon') ? 'export const FileIcon = "svg";'
      : path === 'react' ? `export default {};
        export const useState = (...args) => globalThis.fileFixture.hooks.useState(...args);
        export const useRef = (...args) => globalThis.fileFixture.hooks.useRef(...args);
        export const useMemo = (...args) => globalThis.fileFixture.hooks.useMemo(...args);
        export const useCallback = (...args) => globalThis.fileFixture.hooks.useMemo(...args.map((arg, index) => index === 0 ? () => arg : arg));
        export const useEffect = (...args) => globalThis.fileFixture.hooks.useEffect(...args);`
      : path.endsWith('/event') ? 'export const listen = (...args) => globalThis.fileFixture.listen(...args);'
      : path.includes('appStore') ? 'export const useAppStore = Object.assign(selector => selector(globalThis.fileFixture.state), { getState: () => globalThis.fileFixture.state });'
      : 'export const invoke = (...args) => globalThis.fileFixture.invoke(...args);', loader: 'js' }));
    localModules(builder);
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const tick = async () => { for (let index = 0; index < 5; index++) await new Promise(setImmediate); };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

// A small hook host exercises the production callbacks/effects with controlled
// IPC completion order. No filesystem or state synchronization logic is mocked.
function host(context, invoke, state = {}) {
  state.gitStatuses ??= [];
  state.gitDiffStats ??= [];
  const slots = [];
  let cursor = 0;
  let effects = [];
  const same = (previous, next) => previous && next && previous.length === next.length && previous.every((value, index) => Object.is(value, next[index]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next) => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { value: factory(), deps };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const listeners = new Map();
  const intervals = new Map();
  const focus = new Set();
  let timer = 0;
  const oldWindow = globalThis.window;
  globalThis.window = {
    setInterval: (callback) => { intervals.set(++timer, callback); return timer; },
    clearInterval: (id) => intervals.delete(id),
    addEventListener: (_, callback) => focus.add(callback),
    removeEventListener: (_, callback) => focus.delete(callback),
  };
  globalThis.fileFixture = { hooks, state, invoke, listen: async (name, callback) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback); return () => listeners.get(name)?.delete(callback);
  } };
  const cleanup = () => { slots.forEach((slot) => slot?.cleanup?.()); };
  context.after(async () => { cleanup(); await tick(); globalThis.window = oldWindow; delete globalThis.fileFixture; });
  return {
    render(fn) { cursor = 0; effects = []; const value = fn(); effects.forEach((effect) => effect()); return value; },
    event(payload) { listeners.get('file-system-changed')?.forEach((callback) => callback({ payload })); },
    focus() { focus.forEach((callback) => callback()); },
    poll() { intervals.forEach((callback) => callback()); },
    cleanup,
  };
}

const file = (overrides = {}) => ({ path: '/repo/file.ts', name: 'file.ts', content: 'original', originalContent: 'original', language: 'typescript', isDirty: false, ...overrides });
const disk = (content) => ({ content, language: 'typescript' });

test('clean buffers reload; dirty buffers preserve edits and expose the latest disk version', () => {
  const updated = api.reconcileFileFromDisk(file(), disk('agent edit'));
  assert.equal(updated.content, 'agent edit');
  assert.equal(updated.originalContent, 'agent edit');
  assert.equal(updated.isDirty, false);
  const conflict = api.reconcileFileFromDisk(file({ content: 'my edit', isDirty: true }), disk('agent edit'));
  assert.equal(conflict.content, 'my edit');
  assert.equal(conflict.originalContent, 'original');
  assert.equal(conflict.diskContent, 'agent edit');
  assert.equal(api.resolveDiskChange(conflict, false).content, 'agent edit');
  const kept = api.resolveDiskChange(conflict, true);
  assert.equal(kept.content, 'my edit');
  assert.equal(kept.originalContent, 'agent edit');
  assert.equal(kept.isDirty, true);
});

test('deleted buffers remain recoverable; saving an older snapshot leaves later edits dirty', () => {
  const deleted = api.reconcileFileFromDisk(file({ content: 'my edit', isDirty: true }), null);
  assert.equal(deleted.content, 'my edit');
  assert.equal(deleted.diskContent, null);
  const restored = api.resolveDiskChange(deleted, true);
  assert.equal(restored.recreateOnSave, true);
  assert.equal(api.reconcileFileFromDisk(restored, null), restored);
  const saved = api.markSavedContent(file({ content: 'typed during save', isDirty: true }), 'snapshot saved');
  assert.equal(saved.content, 'typed during save');
  assert.equal(saved.originalContent, 'snapshot saved');
  assert.equal(saved.isDirty, true);
});

test('path matching respects Windows spelling and directory replacements without prefix collisions', () => {
  assert.equal(api.pathAffectedByChanges('C:\\Repo\\src\\File.ts', ['c:/repo/src']), true);
  assert.equal(api.pathAffectedByChanges('/repo/src/file.ts', ['/repo/src-other']), false);
  assert.equal(api.pathAffectedByChanges('/repo/File.ts', ['/repo/file.ts']), false);
});

test('full Explorer refresh reloads expanded descendants and removes deleted children', async (context) => {
  const listing = new Map([
    ['/repo', [{ path: '/repo/src', name: 'src', isDir: true, extension: null }]],
    ['/repo/src', [{ path: '/repo/src/old.ts', name: 'old.ts', isDir: false, extension: 'ts' }]],
  ]);
  const h = host(context, (_, { path }) => Promise.resolve(listing.get(path) ?? []));
  const render = () => h.render(() => api.useFileTree('/repo'));
  render(); await tick();
  let tree = render();
  await tree.handleToggle('/repo/src'); tree = render();
  assert.equal(tree.treeData[0].children[0].name, 'old.ts');
  listing.set('/repo/src', [{ path: '/repo/src/new.ts', name: 'new.ts', isDir: false, extension: 'ts' }]);
  await tree.refreshRoot(); tree = render();
  assert.equal(tree.treeData[0].loaded, true);
  assert.deepEqual(tree.treeData[0].children.map((node) => node.name), ['new.ts']);
});

test('an older directory response cannot overwrite a newer response or a new workspace', async (context) => {
  const requests = [];
  const h = host(context, (_, { path }) => { const request = deferred(); requests.push({ path, ...request }); return request.promise; });
  let tree = h.render(() => api.useFileTree('/old'));
  const newer = tree.refreshPath('/old');
  requests[1].resolve([{ path: '/old/new.ts', name: 'new.ts', isDir: false }]);
  await newer;
  requests[0].resolve([{ path: '/old/stale.ts', name: 'stale.ts', isDir: false }]); await tick();
  tree = h.render(() => api.useFileTree('/old'));
  assert.equal(tree.treeData[0].name, 'new.ts');
  const oldRefresh = tree.refreshPath('/old');
  h.render(() => api.useFileTree('/new'));
  requests[3].resolve([{ path: '/new/right.ts', name: 'right.ts', isDir: false }]); await tick();
  requests[2].resolve([{ path: '/old/wrong.ts', name: 'wrong.ts', isDir: false }]); await oldRefresh;
  tree = h.render(() => api.useFileTree('/new'));
  assert.equal(tree.treeData[0].path, '/new/right.ts');
});

test('filesystem events reload open code files, including changes arriving during a read', async (context) => {
  let current = file();
  const pending = [];
  const calls = [];
  const state = {
    currentWorkspace: { id: 'repo', path: '/repo' }, filesByWorkspace: { repo: [current] },
    setGitStatuses() {}, setGitDiffStats() {},
    reconcileFileDisk(_, __, result) { current = api.reconcileFileFromDisk(current, result); state.filesByWorkspace.repo = [current]; },
  };
  const h = host(context, (command, args) => {
    calls.push([command, args]);
    if (command === 'read_file_content') { const request = deferred(); pending.push(request); return request.promise; }
    return Promise.resolve(command.startsWith('get_git_') ? [] : undefined);
  }, state);
  h.render(() => api.useFileWatcher('/repo')); await tick();
  assert.equal(pending.length, 1);
  h.event({ workspacePath: '/elsewhere', paths: ['/repo/file.ts'] });
  h.event({ workspacePath: '/repo', paths: ['/repo/file.ts'] });
  pending[0].resolve(disk('first agent edit')); await tick();
  assert.equal(pending.length, 2);
  // A user edit while IPC is in flight must survive the incoming disk read.
  current = { ...current, content: 'my unsaved edit', isDirty: true };
  state.filesByWorkspace.repo = [current];
  pending[1].resolve(disk('latest agent edit')); await tick();
  assert.equal(current.content, 'my unsaved edit');
  assert.equal(current.diskContent, 'latest agent edit');
  h.cleanup(); await tick();
  assert.ok(calls.some(([command, args]) => command === 'stop_fs_watcher' && args.workspacePath === '/repo'));
});

test('source control refreshes external branch changes and rejects mixed snapshots', async (context) => {
  let branch = 'main';
  let upstreamBranch = 'main';
  const statuses = [];
  const h = host(context, (command) => Promise.resolve(command === 'git_branches'
    ? { current: branch, branches: ['main', 'feature'], repositoryPath: '/repo' }
    : command === 'git_remote_info' ? { name: 'origin', currentBranch: upstreamBranch, remoteBranch: branch, hasUpstream: true }
    : []));
  const render = () => h.render(() => api.useGitRepository('/repo', statuses, false));
  render(); await tick();
  assert.equal(render().branches.current, 'main');
  branch = upstreamBranch = 'feature';
  h.focus(); await tick();
  assert.equal(render().branches.current, 'feature');
  upstreamBranch = 'main';
  h.poll(); await tick();
  assert.equal(render().branches, null);
  assert.match(render().error, /branch changed/);
});

test('workspace switching orders watcher cleanup and ignores an old in-flight file read', async (context) => {
  const oldStart = deferred();
  const oldRead = deferred();
  const calls = [];
  const reconciled = [];
  const state = { currentWorkspace: { id: 'old', path: '/old' }, filesByWorkspace: { old: [file({ path: '/old/file.ts' })], new: [] },
    setGitStatuses() {}, setGitDiffStats() {}, reconcileFileDisk: (...args) => reconciled.push(args) };
  const h = host(context, (command, args) => {
    calls.push([command, args]);
    if (command === 'start_fs_watcher' && args.workspacePath === '/old') return oldStart.promise;
    if (command === 'read_file_content') return oldRead.promise;
    return Promise.resolve(command.startsWith('get_git_') ? [] : undefined);
  }, state);
  h.render(() => api.useFileWatcher('/old')); await tick();
  h.event({ workspacePath: '/old', paths: ['/old/file.ts'] });
  state.currentWorkspace = { id: 'new', path: '/new' };
  h.render(() => api.useFileWatcher('/new')); await tick();
  oldStart.resolve(); oldRead.resolve(disk('late old response')); await tick();
  assert.deepEqual(calls.filter(([command]) => command.endsWith('fs_watcher')), [
    ['start_fs_watcher', { workspacePath: '/old' }], ['stop_fs_watcher', { workspacePath: '/old' }], ['start_fs_watcher', { workspacePath: '/new' }],
  ]);
  assert.deepEqual(reconciled, []);
});

test('checked-file commit targets the displayed branch and push failures remain visible after changes clear', async (context) => {
  const calls = [];
  const props = {
    workspacePath: '/repo', gitStatuses: [{ path: '/repo/a.ts', change: 'modified' }, { path: '/repo/b.ts', change: 'modified' }], gitDiffStats: [],
    onRefresh: async () => { props.gitStatuses = []; }, onOpenDiff() {}, isRefreshing: false, refreshError: null,
  };
  const h = host(context, async (command, args) => {
    calls.push([command, args]);
    if (command === 'git_branches') return { current: 'main', branches: ['main', 'feature'], repositoryPath: '/repo' };
    if (command === 'git_remote_info') return { name: 'team', url: 'git@github.com:owner/project.git', currentBranch: 'main', remoteBranch: 'release', hasUpstream: true, ahead: 0, behind: 0 };
    if (command === 'git_push') throw new Error('authentication failed');
    return [];
  }, { setGitDiffFile() {} });
  const render = () => h.render(() => api.SourceControlPanel(props));
  const elements = (node) => node && typeof node === 'object' && node.props
    ? [node, ...[node.props.children].flat(Infinity).flatMap(elements)] : [];
  const find = (node, predicate) => elements(node).find(predicate);
  render(); await tick();
  let panel = render();
  find(panel, (node) => node.props['aria-label'] === 'Include b.ts in commit').props.onChange({ target: { checked: false } });
  find(panel, (node) => node.props.placeholder === 'Summary (required)').props.onChange({ target: { value: 'summary' } });
  find(panel, (node) => node.props.placeholder === 'Description').props.onChange({ target: { value: 'description' } });
  find(panel, (node) => node.props['aria-label'] === 'Push to team/release after commit').props.onClick();
  panel = render();
  const commit = find(panel, (node) => node.type === 'button' && String([node.props.children].flat(Infinity)).includes('Commit '));
  assert.equal(commit.props.disabled, false);
  commit.props.onClick(); commit.props.onClick(); await tick();
  assert.deepEqual(calls.filter(([command]) => command === 'git_commit'), [['git_commit', { workspacePath: '/repo', expectedBranch: 'main', message: 'summary\n\ndescription', files: ['/repo/a.ts'] }]]);
  assert.deepEqual(calls.find(([command]) => command === 'git_push')[1], { workspacePath: '/repo', expectedBranch: 'main', expectedRemote: 'team', expectedRemoteBranch: 'release' });
  panel = render();
  assert.ok(elements(panel).some((node) => typeof node.props.children === 'string' && node.props.children.includes('Commit saved on main. Push failed: authentication failed')));
});

test('store disk synchronization updates the intended workspace and never drops edits typed during save', async (context) => {
  const previousStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.window = { localStorage: globalThis.localStorage };
  context.after(() => { globalThis.localStorage = previousStorage; globalThis.window = previousWindow; });
  const storeBuild = await build({
    entryPoints: [fileURLToPath(new URL('../src/stores/appStore.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm', tsconfigRaw: {},
    plugins: [{ name: 'store-fixture', setup(builder) {
      builder.onResolve({ filter: /^zustand(\/middleware)?$/ }, ({ path }) => ({ path: pathToFileURL(require.resolve(path)).href, external: true }));
      builder.onResolve({ filter: /imageEditorStore|@tauri-apps\/api\/core/ }, ({ path }) => ({ path, namespace: 'store-fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'store-fixture' }, ({ path }) => ({ contents: path.includes('imageEditorStore') ? 'export const useImageEditorStore = { getState: () => ({}) };' : 'export const invoke = async () => undefined;', loader: 'js' }));
      builder.onResolve({ filter: /^[A-Za-z]:|^\// }, ({ path }) => ({ path }));
      localModules(builder);
    } }],
  });
  const { useAppStore } = await import(`data:text/javascript;base64,${Buffer.from(storeBuild.outputFiles[0].text).toString('base64')}`);
  useAppStore.setState({ activeWorkspaceId: 'b', filesByWorkspace: { a: [file()], b: [file({ path: '/other/file.ts' })] }, openFiles: [file({ path: '/other/file.ts' })] });
  useAppStore.getState().reconcileFileDisk('a', '/repo/file.ts', disk('agent edit'));
  assert.equal(useAppStore.getState().filesByWorkspace.a[0].content, 'agent edit');
  assert.equal(useAppStore.getState().openFiles[0].path, '/other/file.ts');
  useAppStore.setState({ filesByWorkspace: { a: [file({ content: 'typed later', isDirty: true })] } });
  useAppStore.getState().markFileSaved('/repo/file.ts', 'saved earlier', 'a');
  assert.equal(useAppStore.getState().filesByWorkspace.a[0].isDirty, true);
  assert.equal(useAppStore.getState().filesByWorkspace.a[0].originalContent, 'saved earlier');
});
