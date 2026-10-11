import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const load = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

const { homeViewFor, resolveWorkspaceView } = await load('../src/utils/workspaceView.ts');

const coding = { kind: 'coding' };
const writing = { kind: 'writing' };
const presentation = { kind: 'presentation' };

test('every kind of workspace has its own home view', () => {
  assert.equal(homeViewFor(coding), 'terminal');
  assert.equal(homeViewFor({}), 'terminal');
  assert.equal(homeViewFor(writing), 'writing');
  assert.equal(homeViewFor(presentation), 'presentation');
});

test('a new studio workspace opens in its studio', () => {
  assert.equal(resolveWorkspaceView(undefined, writing, 0), 'writing');
  assert.equal(resolveWorkspaceView(undefined, presentation, 0), 'presentation');
});

test('a studio that was saved on the terminal (older start-up) goes back to the studio when it has no terminal', () => {
  assert.equal(resolveWorkspaceView('terminal', writing, 0), 'writing');
  assert.equal(resolveWorkspaceView('terminal', presentation, 0), 'presentation');
  assert.equal(resolveWorkspaceView('extensions', presentation, 0), 'presentation');
});

test('a studio keeps the terminal once one has been opened in it', () => {
  assert.equal(resolveWorkspaceView('terminal', presentation, 1), 'terminal');
});

test('a studio reopens on the files and research views it was left on', () => {
  assert.equal(resolveWorkspaceView('editor', writing, 0), 'editor');
  assert.equal(resolveWorkspaceView('browser', presentation, 0), 'browser');
});

test("a studio never lands on the other studio's view", () => {
  assert.equal(resolveWorkspaceView('presentation', writing, 0), 'writing');
  assert.equal(resolveWorkspaceView('writing', presentation, 0), 'presentation');
});

test('coding workspaces keep the view they were left on', () => {
  assert.equal(resolveWorkspaceView('browser', coding, 0), 'browser');
  assert.equal(resolveWorkspaceView('extensions', coding, 0), 'extensions');
  assert.equal(resolveWorkspaceView(undefined, coding, 0), 'terminal');
});
