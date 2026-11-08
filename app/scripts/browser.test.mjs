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

const urls = await load('../src/utils/browserUrl.ts');
const model = await load('../src/components/workspace/browser/browserModel.ts');

test('the address bar resolves ports, hosts, domains and searches', () => {
  const { resolveOmniboxInput, BROWSER_NEW_TAB_URL, BROWSER_SEARCH_URL } = urls;
  assert.equal(resolveOmniboxInput(''), null);
  assert.equal(resolveOmniboxInput('   '), null);
  assert.equal(resolveOmniboxInput('3000'), 'http://localhost:3000');
  assert.equal(resolveOmniboxInput(':5173/app'), 'http://localhost:5173/app');
  assert.equal(resolveOmniboxInput('localhost'), 'http://localhost');
  assert.equal(resolveOmniboxInput('localhost:8080/a?b=1'), 'http://localhost:8080/a?b=1');
  assert.equal(resolveOmniboxInput('127.0.0.1:4000'), 'http://127.0.0.1:4000');
  assert.equal(resolveOmniboxInput('192.168.1.20'), 'http://192.168.1.20');
  assert.equal(resolveOmniboxInput('example.com'), 'https://example.com');
  assert.equal(resolveOmniboxInput('docs.rs/tauri/latest'), 'https://docs.rs/tauri/latest');
  assert.equal(resolveOmniboxInput('http://example.com'), 'http://example.com');
  assert.equal(resolveOmniboxInput('https://a.dev/x'), 'https://a.dev/x');
  assert.equal(resolveOmniboxInput(BROWSER_NEW_TAB_URL), BROWSER_NEW_TAB_URL);
  assert.equal(resolveOmniboxInput('how to center a div'), `${BROWSER_SEARCH_URL}how%20to%20center%20a%20div`);
  assert.equal(resolveOmniboxInput('react'), `${BROWSER_SEARCH_URL}react`);
  // 99999 is not a port, so it is a search.
  assert.equal(resolveOmniboxInput('99999'), `${BROWSER_SEARCH_URL}99999`);
});

test('connection security is classified for the address bar badge', () => {
  const { getUrlSecurity, BROWSER_NEW_TAB_URL } = urls;
  assert.equal(getUrlSecurity('https://example.com'), 'secure');
  assert.equal(getUrlSecurity('http://example.com'), 'insecure');
  assert.equal(getUrlSecurity('http://localhost:3000'), 'local');
  assert.equal(getUrlSecurity('http://127.0.0.1:5173/'), 'local');
  assert.equal(getUrlSecurity(BROWSER_NEW_TAB_URL), 'internal');
});

test('display URLs split host and path, and tabs get readable labels', () => {
  const { splitDisplayUrl, getUrlTabLabel, BROWSER_NEW_TAB_URL } = urls;
  assert.deepEqual(splitDisplayUrl('https://example.com/'), { host: 'example.com', rest: '' });
  assert.deepEqual(splitDisplayUrl('http://localhost:3000/a?b=1#c'), { host: 'localhost:3000', rest: '/a?b=1#c' });
  assert.equal(getUrlTabLabel(BROWSER_NEW_TAB_URL), 'New Tab');
  assert.equal(getUrlTabLabel('https://example.com/path'), 'example.com');
});

test('device presets lay the page out at the real device width', () => {
  const { getViewportMetrics, findDevice } = model;
  const custom = { width: 1024, height: 768 };
  const iphone = findDevice('iphone-15-pro');

  // Plenty of room: 100% scale, the page sees exactly 393×852.
  const roomy = getViewportMetrics(1600, 1200, iphone, 'portrait', 1, custom);
  assert.equal(roomy.cssWidth, 393);
  assert.equal(roomy.cssHeight, 852);
  assert.equal(roomy.webviewZoom, 1);
  assert.equal(roomy.viewportWidth, 393);
  assert.equal(roomy.fitted, false);

  // Small pane: the frame shrinks and the webview zooms by the same factor,
  // so innerWidth (viewport / zoom) is still the device width.
  const tight = getViewportMetrics(900, 600, iphone, 'portrait', 1, custom);
  assert.equal(tight.cssWidth, 393);
  assert.ok(tight.webviewZoom < 1);
  assert.ok(tight.fitted);
  assert.ok(Math.abs(tight.viewportWidth / tight.webviewZoom - 393) <= 1 / tight.webviewZoom + 0.5);
  assert.ok(tight.viewportHeight + 2 * tight.bezel <= 600);

  const landscape = getViewportMetrics(1600, 1200, iphone, 'landscape', 1, custom);
  assert.equal(landscape.cssWidth, 852);
  assert.equal(landscape.cssHeight, 393);

  const customMetrics = getViewportMetrics(2000, 1400, findDevice('custom'), 'landscape', 1, { width: 500, height: 700 });
  assert.equal(customMetrics.cssWidth, 500, 'custom sizes ignore orientation');
  assert.equal(customMetrics.cssHeight, 700);
});

test('device frame corners never cut into the square native webview', () => {
  const { getViewportMetrics, findDevice } = model;
  const custom = { width: 1024, height: 768 };
  for (const id of ['laptop', 'ipad', 'iphone-15-pro', 'pixel-8', 'custom']) {
    const metrics = getViewportMetrics(1600, 1200, findDevice(id), 'portrait', 1, custom);
    // The screen corner sits at (bezel, bezel) from the frame corner; it must
    // fall inside the frame's corner arc with some bezel still showing there.
    const inset = metrics.radius - (metrics.radius - metrics.bezel) * Math.SQRT2;
    assert.ok(inset >= Math.min(2, metrics.bezel / 2), `${id}: radius ${metrics.radius} too large for bezel ${metrics.bezel}`);
  }
});

test('responsive mode fills the pane and zoom changes the CSS width', () => {
  const { getViewportMetrics, findDevice } = model;
  const metrics = getViewportMetrics(1000, 700, findDevice('responsive'), 'portrait', 1.25, { width: 1, height: 1 });
  assert.equal(metrics.kind, 'responsive');
  assert.equal(metrics.viewportWidth, 1000);
  assert.equal(metrics.webviewZoom, 1.25);
  assert.equal(metrics.cssWidth, 800);
});

test('unknown persisted device ids fall back to responsive', () => {
  const { findDevice } = model;
  assert.equal(findDevice('iphone-14-pro').id, 'responsive');
  assert.equal(findDevice('pixel-8').label, 'Pixel 8');
});

test('zoom steps move to the neighbouring preset and stop at the ends', () => {
  const { getNextZoom, clampZoom, MIN_ZOOM, MAX_ZOOM } = model;
  assert.equal(getNextZoom(1, 1), 1.1);
  assert.equal(getNextZoom(1, -1), 0.9);
  assert.equal(getNextZoom(0.62, 1), 0.67, 'off-step values snap to the next preset');
  assert.equal(getNextZoom(MAX_ZOOM, 1), MAX_ZOOM);
  assert.equal(getNextZoom(MIN_ZOOM, -1), MIN_ZOOM);
  assert.equal(clampZoom(9), MAX_ZOOM);
  assert.equal(clampZoom(0.01), MIN_ZOOM);
});

test('snapshot paths use the workspace separator', () => {
  const { buildSnapshotPaths } = model;
  const windows = buildSnapshotPaths('C:\\code\\site\\', 'My Page!');
  assert.match(windows.htmlPath, /^C:\\code\\site\\\.yzpzcode\\browser-exports\\\d{8}-\d{6}-my-page\.html$/);
  const posix = buildSnapshotPaths('/home/me/site', '');
  assert.match(posix.jsonPath, /^\/home\/me\/site\/\.yzpzcode\/browser-exports\/\d{8}-\d{6}-snapshot\.json$/);
});

const history = await load('../src/components/workspace/browser/browserHistory.ts');

const snap = (currentIndex, ...pages) => ({
  currentIndex,
  entries: pages.map(([id, url]) => ({ id, url })),
});
const steps = (state, tab, onStart = false, startAvailable = true) => history.historySteps(state, tab, onStart, startAvailable);
const G = [1, 'https://www.google.com/'];
const SITE = [2, 'https://example.com/a'];
const SITE2 = [3, 'https://example.com/b'];

test('a link to another site can be walked back and forward', () => {
  let state = history.applySnapshot(history.EMPTY_WORKSPACE_HISTORY, snap(0, G), 'a');
  assert.equal(steps(state, 'a').back, null);
  state = history.applySnapshot(state, snap(1, G, SITE), 'a');
  assert.deepEqual(steps(state, 'a').back, { kind: 'entry', entryId: 1 });
  assert.equal(steps(state, 'a').forward, null);
  state = history.applySnapshot(state, snap(0, G, SITE), 'a');
  assert.equal(steps(state, 'a').back, null);
  assert.deepEqual(steps(state, 'a').forward, { kind: 'entry', entryId: 2 });
});

test('without an engine history the page decides', () => {
  assert.equal(steps(history.EMPTY_WORKSPACE_HISTORY, 'a').known, false);
});

test('pages that arrive between two reports stay in the trail', () => {
  let state = history.applySnapshot(history.EMPTY_WORKSPACE_HISTORY, snap(0, G), 'a');
  state = history.applySnapshot(state, snap(2, G, SITE, SITE2), 'a');
  assert.deepEqual(steps(state, 'a').back, { kind: 'entry', entryId: 2 });
});

test('the blank first entry is never a page to return to', () => {
  const state = history.applySnapshot(history.EMPTY_WORKSPACE_HISTORY, snap(1, [9, 'about:blank'], G), 'a');
  assert.equal(steps(state, 'a').back, null);
});

test('tabs share the webview but not their history', () => {
  let state = history.applySnapshot(history.EMPTY_WORKSPACE_HISTORY, snap(0, G), 'a');
  state = history.applySnapshot(state, snap(1, G, SITE), 'a');
  const other = [4, 'https://other.dev/'];
  state = history.applySnapshot(state, snap(2, G, SITE, other), 'b');
  assert.equal(steps(state, 'b').back, null);

  // Back on tab A loads its page again as a new entry; Back skips the old copy.
  const again = [5, 'https://example.com/a'];
  state = history.applySnapshot(state, snap(3, G, SITE, other, again), 'a');
  assert.deepEqual(steps(state, 'a').back, { kind: 'entry', entryId: 1 });

  // And returning to tab B does the same: nothing of tab A's is behind it.
  const otherAgain = [6, 'https://other.dev/'];
  state = history.applySnapshot(state, snap(4, G, SITE, other, again, otherAgain), 'b');
  assert.equal(steps(state, 'b').back, null);
});

test('a late report after a tab switch does not hand the page to the new tab', () => {
  let state = history.applySnapshot(history.EMPTY_WORKSPACE_HISTORY, snap(0, G), 'a');
  state = history.applySnapshot(state, snap(1, G, SITE), 'a');
  state = history.applySnapshot(state, snap(1, G, SITE), 'b');
  assert.deepEqual(steps(state, 'a').back, { kind: 'entry', entryId: 1 });
  assert.equal(steps(state, 'b').back, null);
});

test('entries the engine dropped are forgotten', () => {
  let state = history.applySnapshot(history.EMPTY_WORKSPACE_HISTORY, snap(0, G), 'a');
  state = history.applySnapshot(state, snap(1, G, SITE), 'a');
  state = history.applySnapshot(state, snap(1, G, SITE2), 'a');
  assert.equal(state.owners[2], undefined);
  assert.equal(state.owners[3], 'a');
});

test('Back leads to the start page a tab came from, and Forward returns', () => {
  const page = { url: G[1], title: 'Google', favicon: null };
  let state = history.enterFromStartPage(history.EMPTY_WORKSPACE_HISTORY, 'a');
  state = history.applySnapshot(state, snap(0, G), 'a');
  assert.deepEqual(steps(state, 'a').back, { kind: 'start-page' });
  assert.equal(steps(state, 'a', false, false).back, null);

  state = history.leaveToStartPage(state, 'a', page);
  assert.equal(steps(state, 'a', true).back, null);
  assert.deepEqual(steps(state, 'a', true).forward, { kind: 'page', ...page });

  state = history.returnFromStartPage(state, 'a');
  assert.equal(steps(state, 'a', true).forward, null);
  assert.deepEqual(steps(state, 'a').back, { kind: 'start-page' });
});

test('a new page from the start page drops the old trail', () => {
  let state = history.enterFromStartPage(history.EMPTY_WORKSPACE_HISTORY, 'a');
  state = history.applySnapshot(state, snap(0, G), 'a');
  state = history.applySnapshot(state, snap(1, G, SITE), 'a');
  state = history.enterFromStartPage(state, 'a');
  state = history.applySnapshot(state, snap(2, G, SITE, SITE2), 'a');
  assert.deepEqual(steps(state, 'a').back, { kind: 'start-page' });
});

test('a tab opened by a link has no start page behind it', () => {
  const state = history.applySnapshot(history.EMPTY_WORKSPACE_HISTORY, snap(0, G), 'a');
  assert.equal(steps(state, 'a').back, null);
});
