import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const files = new Map();
const nativeTargets = new Map();
const invokes = [];
const invoke = async (command, args) => {
  invokes.push([command, args]);
  if (command === 'get_project_run_targets') return nativeTargets.get(args.cwd) ?? [];
  if (command === 'list_directory_entries') {
    const entries = files.get(args.path);
    if (!entries) throw new Error('Directory does not exist');
    return entries;
  }
  if (command === 'read_file_content') return { content: files.get(args.path) };
  throw new Error(`Unexpected command: ${command}`);
};

async function module(path, dependencies, globals = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => dependencies[name] ?? require(name),
    ...globals,
  });
  return exports;
}

const detection = await module('../src/utils/projectDetect.ts', { '@tauri-apps/api/core': { invoke } });
const entry = (name, isDir = false) => ({ name, isDir });
files.set('/node', [entry('package.json'), entry('pnpm-lock.yaml')]);
files.set('/node/package.json', JSON.stringify({ scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '*' } }));
nativeTargets.set('/node', [{ id: 'main.py', command: 'python -u main.py', cwd: '/node', language: 'Python' }]);
let targets = await detection.detectRunTargets('/node');
assert.equal(targets.length, 2, 'mixed projects keep native targets and Node actions');
assert.equal(targets[0].command, 'pnpm run dev');
assert.equal(targets[0].buildCommand, 'pnpm run build');
assert.equal(targets[1].language, 'Python');

files.set('/repository', [entry('app', true)]);
files.set('/repository/app', [entry('package.json'), entry('yarn.lock')]);
files.set('/repository/app/package.json', JSON.stringify({ scripts: { start: 'node app.js' } }));
targets = await detection.detectRunTargets('/repository');
assert.equal(targets[0].cwd, '/repository/app', 'nested app runs in its actual directory');
assert.equal(targets[0].command, 'yarn run start');
files.set('/repository/app/package.json', JSON.stringify({ scripts: { dev: 'vite' } }));
detection.invalidateProjectCache('/repository/app');
targets = await detection.detectRunTargets('/repository');
assert.equal(targets[0].command, 'yarn run dev', 'refresh discovers changed scripts');

files.set('/python', [entry('hello.py')]);
nativeTargets.set('/python', [{ id: 'hello.py', command: 'python -u hello.py', cwd: '/python', language: 'Python' }]);
targets = await detection.detectRunTargets('/python');
assert.equal(targets.length, 1, 'plain Python does not require a manifest');
assert.equal(targets[0].id, 'hello.py');

const storage = new Map();
const localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true });
globalThis.window = { localStorage };
const runStore = await module('../src/stores/runConfigStore.ts', {}, { navigator: { userAgent: 'Windows' }, localStorage });
const state = () => runStore.useRunConfigStore.getState();
const config = { id: 'custom', name: 'My API', projectPath: 'C:\\Project', workingDirectory: 'C:\\Project\\backend', command: 'python -u -m uvicorn main:app --reload', buildCommand: '' };
state().saveConfig(config);
state().selectTarget('C:\\PROJECT\\', config.id);
assert.equal(state().selectedByProject['c:/project'], config.id);
assert.equal(state().configs[0].workingDirectory, config.workingDirectory);
assert.equal(JSON.parse(storage.get('yzpzcode-application-runs')).state.configs[0].command, config.command, 'runs persist across restarts');
state().saveConfig({ ...config, command: 'python -u server.py --port 9000' });
assert.equal(state().configs.length, 1, 'editing updates the existing profile');
state().removeConfig(config.id);
assert.equal(state().configs.length, 0);
assert.equal(Object.keys(state().selectedByProject).length, 0, 'deleting a profile removes stale selections');

// Exercise the real launch handler with delayed IPC to catch duplicate starts,
// incorrect working directories, build/run confusion, and hidden failures.
const source = ts.createSourceFile('QuickActions.tsx', await readFile(new URL('../src/components/workspace/QuickActions.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let launchHandler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'run') launchHandler = node.initializer.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(launchHandler);
let release;
let failure = false;
const calls = [];
const flags = { launching: false, error: '', open: false, closed: false };
const context = {
  managedBusy: false, launchInFlight: { current: false }, cwd: '/workspace', sessionId: 'terminal-1', workspaceId: 'workspace-1',
  setLaunching: (value) => { flags.launching = value; },
  setError: (value) => { flags.error = value; },
  setOpen: (value) => { flags.open = value; },
  selectTarget: () => {}, closeDialog: () => { flags.closed = true; },
  invoke: async (command, args) => {
    calls.push([command, args]);
    if (failure) throw new Error('launch failed');
    await new Promise((resolve) => { release = resolve; });
  },
};
vm.runInNewContext(ts.transpileModule(`globalThis.run = (${launchHandler});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const target = { id: 'api', command: 'python api.py', buildCommand: 'python build.py', cwd: '/workspace/backend', unavailableReason: null };
const pending = context.run(target);
await context.run(target);
assert.equal(calls.length, 1, 'rapid clicks do not launch duplicate processes');
assert.equal(calls[0][0], 'run_managed_terminal_command');
assert.equal(calls[0][1].request.cwd, '/workspace/backend');
assert.equal(flags.launching, true);
release();
await pending;
assert.equal(flags.closed, true);
assert.equal(flags.launching, false);
const building = context.run(target, true);
assert.equal(calls[1][1].request.command, 'python build.py');
release();
await building;
await context.run({ ...target, unavailableReason: 'Install Python' });
assert.equal(calls.length, 2, 'unavailable runtimes show guidance before launching');
assert.equal(flags.open, true);
failure = true;
await context.run(target);
assert.match(flags.error, /launch failed/);
assert.equal(context.launchInFlight.current, false, 'failure allows retry');
console.log('Project-run detection and saved-configuration checks passed.');
