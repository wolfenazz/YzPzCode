import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/contextMenuModel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildMenuLayout, formatShortcut } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const click = (over = {}) => ({ kind: 'page', hasSelection: false, readOnly: false, secret: false, ...over });
const ids = (layout) => layout.sections.map((section) => section.map((entry) => entry.id));
const entry = (layout, id) => layout.sections.flat().find((candidate) => candidate.id === id);

const APP = ['newWorkspace', 'docs', 'settings', 'theme'];

test('a click on plain page content offers only the app commands', () => {
  assert.deepEqual(ids(buildMenuLayout(click(), 'workspace')), [APP]);
});

test('selected page text adds Copy ahead of the app commands', () => {
  const layout = buildMenuLayout(click({ hasSelection: true }), 'workspace');
  assert.deepEqual(ids(layout), [['copy'], APP]);
  assert.equal(entry(layout, 'copy').disabled, false);
});

test('the terminal gets clipboard commands, then Clear Terminal on its own', () => {
  const layout = buildMenuLayout(click({ kind: 'terminal' }), 'workspace');
  assert.deepEqual(ids(layout), [['copy', 'paste', 'selectAll'], ['clearTerminal'], APP]);
});

test('terminal Copy needs a selection; Paste and Select All never do', () => {
  const none = buildMenuLayout(click({ kind: 'terminal' }), 'workspace');
  assert.equal(entry(none, 'copy').disabled, true);
  assert.equal(entry(none, 'paste').disabled, false);
  assert.equal(entry(none, 'selectAll').disabled, false);

  const some = buildMenuLayout(click({ kind: 'terminal', hasSelection: true }), 'workspace');
  assert.equal(entry(some, 'copy').disabled, false);
});

test('terminal Select All does not advertise Ctrl+A, which the shell owns', () => {
  const terminal = buildMenuLayout(click({ kind: 'terminal' }), 'workspace');
  assert.equal(entry(terminal, 'selectAll').keys, undefined);

  const field = buildMenuLayout(click({ kind: 'editable' }), 'workspace');
  assert.deepEqual(entry(field, 'selectAll').keys, ['Mod', 'A']);
});

test('an editable field offers Cut, Copy, Paste and Select All', () => {
  const layout = buildMenuLayout(click({ kind: 'editable', hasSelection: true }), 'workspace');
  assert.deepEqual(ids(layout), [['cut', 'copy', 'paste', 'selectAll'], APP]);
  for (const id of ['cut', 'copy', 'paste', 'selectAll']) assert.equal(entry(layout, id).disabled, false, id);
});

test('Cut and Copy are disabled until something is selected', () => {
  const layout = buildMenuLayout(click({ kind: 'editable' }), 'workspace');
  assert.equal(entry(layout, 'cut').disabled, true);
  assert.equal(entry(layout, 'copy').disabled, true);
  assert.equal(entry(layout, 'paste').disabled, false);
});

test('a read-only field can be copied from but not cut or pasted into', () => {
  const layout = buildMenuLayout(click({ kind: 'editable', hasSelection: true, readOnly: true }), 'workspace');
  assert.equal(entry(layout, 'cut').disabled, true);
  assert.equal(entry(layout, 'paste').disabled, true);
  assert.equal(entry(layout, 'copy').disabled, false);
});

test('a password field can be pasted into but never cut or copied', () => {
  const layout = buildMenuLayout(click({ kind: 'editable', hasSelection: true, secret: true }), 'workspace');
  assert.equal(entry(layout, 'cut').disabled, true);
  assert.equal(entry(layout, 'copy').disabled, true);
  assert.equal(entry(layout, 'paste').disabled, false);
});

test('the menu never offers the screen the user is already on', () => {
  assert.deepEqual(ids(buildMenuLayout(click(), 'setup')), [['docs', 'settings', 'theme']]);
  assert.deepEqual(ids(buildMenuLayout(click(), 'docs')), [['newWorkspace', 'settings', 'theme']]);
  assert.deepEqual(ids(buildMenuLayout(click(), 'settings')), [['newWorkspace', 'docs', 'theme']]);
  assert.deepEqual(ids(buildMenuLayout(click(), 'nodejs-check')), [APP]);
});

test('every section is non-empty, so the menu never draws a stray divider', () => {
  for (const kind of ['page', 'terminal', 'editable']) {
    for (const view of ['nodejs-check', 'setup', 'workspace', 'docs', 'settings']) {
      for (const section of buildMenuLayout(click({ kind }), view).sections) {
        assert.ok(section.length > 0, `${kind} on ${view}`);
      }
    }
  }
});

test('shortcuts use the platform command key', () => {
  assert.equal(formatShortcut(['Mod', 'C'], false), 'Ctrl+C');
  assert.equal(formatShortcut(['Mod', 'C'], true), '⌘C');
  assert.equal(formatShortcut(['Mod', 'L'], true), '⌘L');
});

test('Settings is a literal Ctrl+, on every platform, matching the App.tsx listener', () => {
  const settings = entry(buildMenuLayout(click(), 'workspace'), 'settings');
  assert.deepEqual(settings.keys, ['Ctrl', ',']);
  assert.equal(formatShortcut(settings.keys, false), 'Ctrl+,');
  assert.equal(formatShortcut(settings.keys, true), 'Ctrl+,');
});
