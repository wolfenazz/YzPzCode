import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

// Run the production React effects against controlled browser/WebGL boundaries.
// This exercises scheduling and disposal without needing a GPU in Node.
const source = await readFile(new URL('../src/components/effects/LightRays.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText
  .replace(/import \{ jsx as _jsx \} from ["']react\/jsx-runtime["'];/, 'const _jsx = (type, props) => ({ type, props });')
  .replace(/import \{[^}]+\} from ["']ogl["'];/, `
    class Renderer {
      constructor(options) {
        const f = globalThis.raysFixture;
        this.dpr = options.dpr;
        this.gl = { canvas: f.canvas, getExtension: () => ({ loseContext: () => f.lost++ }) };
        f.renderers++;
      }
      setSize(w, h) { this.gl.canvas.width = w * this.dpr; this.gl.canvas.height = h * this.dpr; }
      render({ scene }) { globalThis.raysFixture.draws++; globalThis.raysFixture.uniforms = scene.program.uniforms; }
    }
    class Program {
      constructor(_gl, options) { this.uniforms = options.uniforms; }
      remove() { globalThis.raysFixture.programsRemoved++; }
    }
    class Triangle { remove() { globalThis.raysFixture.geometriesRemoved++; } }
    class Mesh { constructor(_gl, { program }) { this.program = program; } }
  `)
  .replace(/import \{[^}]+\} from ["']react["'];/, `
    const useRef = (...args) => globalThis.raysFixture.useRef(...args);
    const useEffect = (...args) => globalThis.raysFixture.useEffect(...args);
  `)
  .replace(/import ['"]\.\/LightRays\.css['"];?/, '');
const { default: LightRays } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function eventTarget() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(name, callback) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(callback); },
    removeEventListener(name, callback) { handlers.get(name)?.delete(callback); },
    emit(name, event) { for (const callback of handlers.get(name) ?? []) callback(event); },
    count() { return [...handlers.values()].reduce((total, group) => total + group.size, 0); },
  };
}

function host() {
  const previous = Object.fromEntries(['window', 'document', 'ResizeObserver', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map((key) => [key, globalThis[key]]));
  const frames = new Map();
  const slots = [];
  const effects = [];
  const pending = [];
  let cursor = 0;
  let nextFrame = 0;
  const f = {
    canvas: { ...eventTarget(), width: 1, height: 1, setAttribute() {}, remove() { f.canvasRemoved++; } },
    renderers: 0, draws: 0, lost: 0, programsRemoved: 0, geometriesRemoved: 0, canvasRemoved: 0, observers: [], uniforms: null,
    container: { clientWidth: 600, clientHeight: 200, appendChild() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 200 }) },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useEffect(create, deps) {
      const index = cursor++;
      const old = effects[index];
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) pending.push(() => {
        old?.cleanup?.(); effects[index] = { deps, cleanup: create() };
      });
    },
    render(props) {
      cursor = 0;
      const element = LightRays(props);
      element.props.ref.current = f.container;
      while (pending.length) pending.shift()();
    },
    step(time = 1000) { const batch = [...frames.values()]; frames.clear(); batch.forEach((draw) => draw(time)); },
    frames,
    unmount() { effects.forEach((effect) => effect?.cleanup?.()); },
    restore() { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } delete globalThis.raysFixture; },
  };
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; f.observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  globalThis.raysFixture = f;
  globalThis.window = { ...eventTarget(), devicePixelRatio: 2 };
  globalThis.document = { ...eventTarget(), hidden: false };
  globalThis.ResizeObserver = Observer;
  globalThis.IntersectionObserver = Observer;
  globalThis.requestAnimationFrame = (draw) => { frames.set(++nextFrame, draw); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  f.show = () => f.observers.at(-1).callback([{ isIntersecting: true }]);
  return f;
}

test('prop changes reuse the canvas; motion and hidden state stop and resume frames', () => {
  const f = host();
  try {
    f.render({});
    f.show(); f.step();
    assert.equal(f.renderers, 1);
    assert.equal(f.draws, 1);
    assert.equal(f.frames.size, 1);
    f.render({ raysColor: '#ff5500', motion: false, raysOrigin: 'bottom-right' }); f.step();
    assert.equal(f.renderers, 1);
    assert.equal(f.frames.size, 0);
    assert.deepEqual(f.uniforms.raysColor.value, [1, 1 / 3, 0]);
    assert.deepEqual(f.uniforms.rayPos.value, [900, 360]);
    assert.equal(f.uniforms.mouseInfluence.value, 0);
    f.render({ motion: true }); f.step();
    assert.equal(f.frames.size, 1);
    document.hidden = true; document.emit('visibilitychange');
    assert.equal(f.frames.size, 0);
    document.hidden = false; document.emit('visibilitychange'); f.step();
    assert.equal(f.frames.size, 1);
    f.observers.at(-1).callback([{ isIntersecting: false }]);
    assert.equal(f.frames.size, 0);
  } finally { f.unmount(); f.restore(); }
});

test('cleanup releases frames, observers, listeners, GPU resources and canvas', () => {
  const f = host();
  try {
    f.render({}); f.show(); f.step(); f.unmount();
    assert.equal(f.frames.size, 0);
    assert.ok(f.observers.every((observer) => observer.disconnected));
    assert.equal(window.count() + document.count() + f.canvas.count(), 0);
    assert.equal(f.geometriesRemoved, 1);
    assert.equal(f.programsRemoved, 1);
    assert.equal(f.canvasRemoved, 1);
    assert.equal(f.lost, 1);
  } finally { f.restore(); }
});
