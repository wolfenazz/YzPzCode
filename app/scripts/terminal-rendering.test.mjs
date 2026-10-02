import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import ts from 'typescript';

// Use the project's TypeScript compiler so this runs on supported Node
// versions without depending on Node's experimental type stripping.
const source = await readFile(new URL('../src/utils/terminalRendering.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const {
  observeTerminalLayout,
  refreshTerminalAtlases,
  registerTerminalRenderer,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

let frames;
let timers;
let now;
let nextId;
let cleanups;
let originalGlobals;
let resizeObservers;
let intersectionObservers;

class TestNode extends EventTarget {
  constructor(children = []) {
    super();
    this.children = children;
    this.width = 800;
    this.height = 400;
  }
  contains(node) { return this === node || this.children.includes(node); }
  getBoundingClientRect() { return { width: this.width, height: this.height }; }
}

beforeEach(() => {
  frames = new Map();
  timers = new Map();
  now = 0;
  nextId = 0;
  cleanups = [];
  resizeObservers = [];
  intersectionObservers = [];
  const replacements = {
    window: new EventTarget(),
    document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    Node: TestNode,
    requestAnimationFrame: (fn) => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; resizeObservers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; intersectionObservers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
  };
  originalGlobals = new Map(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

function frame() {
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(now);
}

function advance(ms) {
  now += ms;
  for (const [id, timer] of [...timers]) {
    if (timer.at <= now) { timers.delete(id); timer.fn(); }
  }
}

function watch(element = new TestNode()) {
  const fits = [];
  const dispose = observeTerminalLayout(element, (repaint) => fits.push(repaint));
  cleanups.push(dispose);
  return { element, fits, dispose };
}

test('shared atlas invalidation rebuilds every model before drawing, including hidden panes', () => {
  let generation = 0;
  const calls = [];
  const makeTerminal = (name, hidden = false) => ({
    rows: 24,
    model: generation,
    clearTextureAtlas() { generation++; this.model = null; calls.push(`clear:${name}`); },
    refresh(start, end) {
      assert.equal(start, 0);
      assert.equal(end, 23);
      calls.push(`refresh:${name}`);
      if (!hidden) requestAnimationFrame(() => {
        if (this.model === null) this.model = generation;
        assert.equal(this.model, generation, 'glyph model must match the shared atlas');
      });
    },
  });
  const a = makeTerminal('a');
  const b = makeTerminal('b');
  const hidden = makeTerminal('hidden', true);
  for (const terminal of [a, b, hidden]) cleanups.push(registerTerminalRenderer(terminal));
  // Multiple font/visibility handlers must coalesce to one invalidation task.
  refreshTerminalAtlases();
  refreshTerminalAtlases();
  assert.equal(frames.size, 1);
  frame();
  assert.deepEqual(calls, ['clear:a', 'clear:b', 'clear:hidden', 'refresh:a', 'refresh:b', 'refresh:hidden']);
  frame();
  assert.equal(a.model, generation);
  assert.equal(b.model, generation);
  assert.equal(hidden.model, null, 'hidden model must be invalidated before it resumes');
});

test('a terminal closed before the atlas frame is never touched', () => {
  const dead = { clearTextureAtlas() { assert.fail('disposed renderer accessed'); } };
  const dispose = registerTerminalRenderer(dead);
  refreshTerminalAtlases();
  dispose();
  assert.equal(frames.size, 0);
  frame();
});

test('same-size visibility repaint survives rapid resize debouncing', () => {
  const { element, fits } = watch();
  frame(); frame(); advance(200);
  fits.length = 0;
  element.width = 0;
  resizeObservers[0].callback();
  advance(100);
  assert.deepEqual(fits, []);
  element.width = 800;
  resizeObservers[0].callback();
  resizeObservers[0].callback();
  advance(100);
  assert.deepEqual(fits, [true]);
  resizeObservers[0].callback();
  advance(100);
  assert.deepEqual(fits, [true, false]);
});

test('mount/view-switch repaint works without IntersectionObserver notifications', () => {
  delete globalThis.IntersectionObserver;
  const { fits } = watch();
  frame();
  assert.deepEqual(fits, []);
  frame();
  assert.deepEqual(fits, [true]);
  advance(160);
  assert.deepEqual(fits, [true, true]);
});

test('scrolling the grid repaints once settled; terminal scrollback is excluded', () => {
  const { element, fits } = watch();
  frame(); frame(); advance(200);
  fits.length = 0;
  const dispatchScroll = (target) => {
    const event = new Event('scroll');
    Object.defineProperty(event, 'target', { value: target });
    document.dispatchEvent(event);
  };
  dispatchScroll(new TestNode()); // xterm viewport, not an ancestor
  advance(160);
  assert.deepEqual(fits, []);
  const grid = new TestNode([element]);
  dispatchScroll(grid);
  advance(80);
  dispatchScroll(grid);
  advance(80);
  assert.deepEqual(fits, []);
  advance(80);
  assert.deepEqual(fits, [true]);
});

test('document restore and intersection visibility repaint without a dimension change', () => {
  const { fits } = watch();
  frame(); frame(); advance(200);
  fits.length = 0;
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('resize'));
  advance(100);
  assert.deepEqual(fits, []);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  frame(); frame();
  assert.deepEqual(fits, [true]);
  intersectionObservers[0].callback([{ isIntersecting: true }]);
  frame(); frame();
  assert.deepEqual(fits, [true, true]);
});

test('cleanup cancels the second animation frame and all delayed fits and listeners', () => {
  const { fits, dispose } = watch();
  frame(); // first frame queued the second
  window.dispatchEvent(new Event('resize'));
  dispose();
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
  assert.equal(resizeObservers[0].disconnected, true);
  assert.equal(intersectionObservers[0].disconnected, true);
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  frame(); advance(500);
  assert.deepEqual(fits, []);
});
