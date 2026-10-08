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

const clip = await load('../src/utils/explorerClipboard.ts');

const entry = (path, isDir = false) => ({ path, name: path.split(/[\\/]/).pop(), isDir });
const app = (operation, ...paths) => ({ operation, entries: paths.map((p) => entry(p)) });
const system = (paths, operation = 'copy', hasImage = false) => ({ paths, operation, hasImage });

test('an explorer copy that is still on the OS clipboard keeps its cut/copy intent', () => {
  const source = clip.pickPasteSource(
    app('cut', 'C:\\work\\a.txt', 'C:\\work\\b.txt'),
    system(['c:/work/B.txt', 'C:\\work\\a.txt']),
  );
  assert.deepEqual(source, {
    kind: 'files',
    operation: 'cut',
    paths: ['C:\\work\\a.txt', 'C:\\work\\b.txt'],
    origin: 'app',
  });
});

test('files copied in the system file manager win over a stale explorer copy', () => {
  const source = clip.pickPasteSource(app('copy', 'C:\\work\\a.txt'), system(['D:\\photos\\x.png'], 'cut'));
  assert.deepEqual(source, { kind: 'files', operation: 'cut', paths: ['D:\\photos\\x.png'], origin: 'system' });
});

test('a screenshot pastes as an image; text falls back to the explorer clipboard', () => {
  assert.deepEqual(clip.pickPasteSource(app('copy', '/w/a'), system([], 'copy', true)), { kind: 'image' });
  assert.equal(clip.pickPasteSource(null, system([], 'copy', false)), null);
  assert.equal(clip.pickPasteSource(null, null), null);
  assert.equal(clip.pickPasteSource(app('copy', '/w/a'), system([])).origin, 'app');
  assert.equal(clip.pickPasteSource(app('copy', '/w/a'), null).origin, 'app');
});

test('posix paths compare case-sensitively', () => {
  assert.equal(clip.samePathSet(['/w/A'], ['/w/a']), false);
  assert.equal(clip.samePathSet(['C:\\W\\A'], ['c:/w/a']), true);
  assert.equal(clip.samePathSet(['/w/a'], ['/w/a', '/w/b']), false);
});

test('paste lands in the folder, or beside the file', () => {
  assert.equal(clip.pasteTargetDir(null, '/w'), '/w');
  assert.equal(clip.pasteTargetDir({ path: '/w/src', isDir: true }, '/w'), '/w/src');
  assert.equal(clip.pasteTargetDir({ path: '/w/src/a.ts', isDir: false }, '/w'), '/w/src');
  assert.equal(clip.pasteTargetDir({ path: 'C:\\w\\a.ts', isDir: false }, 'C:\\w'), 'C:\\w');
});

test('a multi-item paste is one undo step, newest first, ignoring failures', () => {
  const outcomes = [
    { source: '/w/a.txt', path: '/w/d/a.txt', error: null, skipped: false },
    { source: '/w/b.txt', path: null, error: 'b.txt already exists in this folder', skipped: false },
    { source: '/w/c.txt', path: '/w/d/c.txt', error: null, skipped: false },
  ];
  assert.deepEqual(clip.buildPasteUndo(outcomes, 'cut', '/w/d'), {
    kind: 'batch',
    ops: [
      { kind: 'move', sourcePath: '/w/c.txt', destinationDir: '/w/d', name: 'c.txt' },
      { kind: 'move', sourcePath: '/w/a.txt', destinationDir: '/w/d', name: 'a.txt' },
    ],
  });
  assert.deepEqual(clip.buildPasteUndo(outcomes.slice(0, 1), 'copy', '/w/d'), {
    kind: 'duplicate',
    sourcePath: '/w/a.txt',
    createdPath: '/w/d/a.txt',
  });
  assert.equal(clip.buildPasteUndo(outcomes.slice(1, 2), 'copy', '/w/d'), null);
});

test('paste summaries name the item, or explain partial failures', () => {
  const ok = { source: '/w/a.txt', path: '/w/d/a (1).txt', error: null, skipped: false };
  const bad = { source: '/w/b', path: null, error: 'Cannot paste b into itself', skipped: false };
  assert.deepEqual(clip.summarizePaste([ok], 'copy'), { tone: 'info', text: 'Pasted a (1).txt' });
  assert.deepEqual(clip.summarizePaste([ok, ok], 'cut'), { tone: 'info', text: 'Moved 2 items' });
  assert.deepEqual(clip.summarizePaste([bad], 'copy'), { tone: 'error', text: 'Cannot paste b into itself' });
  assert.equal(clip.summarizePaste([ok, bad], 'copy').text, 'Pasted 1 of 2. 1 failed: Cannot paste b into itself');
  assert.deepEqual(
    clip.summarizePaste([{ source: '/w/a', path: null, error: null, skipped: true }], 'cut'),
    { tone: 'info', text: 'Already in this folder' },
  );
});

test('copied paths are absolute or workspace-relative, one per line', () => {
  assert.equal(clip.formatPaths(['C:\\w\\src\\a.ts', 'C:\\w\\b.ts'], 'C:\\w', true), 'src\\a.ts\nb.ts');
  assert.equal(clip.formatPaths(['/w/src/a.ts', '/other/x'], '/w/', true), 'src/a.ts\n/other/x');
  assert.equal(clip.formatPaths(['/w'], '/w', true), '.');
  assert.equal(clip.formatPaths(['/w/a', '/w/b'], '/w', false), '/w/a\n/w/b');
});

test('the clipboard status names one item or counts several', () => {
  assert.equal(clip.describeClipboard(null), null);
  assert.equal(clip.describeClipboard(app('copy', '/w/a.ts')), 'a.ts copied');
  assert.equal(clip.describeClipboard(app('cut', '/w/a', '/w/b')), '2 items cut');
});
