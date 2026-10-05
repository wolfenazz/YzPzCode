import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/setupBackground.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { DEFAULT_SETUP_GALAXY, SETUP_BACKGROUNDS, normalizeSetupGalaxy, normalizeSetupBackground, migrateSetupBackground } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const rendererSource = await readFile(new URL('../src/components/reactbits/backgrounds/renderBackground.ts', import.meta.url), 'utf8');
const rendererCode = ts.transpileModule(rendererSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { renderBackground, BACKGROUND_RENDER_ERROR } = await import(`data:text/javascript;base64,${Buffer.from(rendererCode).toString('base64')}`);

test('a failed shader never reaches OGL draw and requests the still fallback', () => {
  let draws = 0;
  const events = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const renderer = {
      gl: { LINK_STATUS: 1, getProgramParameter: () => false, getProgramInfoLog: () => 'shader failed to link' },
      render: () => { draws++; throw new TypeError("Cannot read properties of undefined (reading 'forEach')"); },
    };
    const scene = { program: { program: {} } };
    assert.equal(renderBackground(renderer, { scene }, { dispatchEvent: (event) => events.push(event) }), false);
    assert.equal(draws, 0);
    assert.equal(events[0].type, BACKGROUND_RENDER_ERROR);
    assert.equal(events[0].bubbles, true);
  } finally {
    console.warn = originalWarn;
  }
});

test('valid shaders render; runtime GPU failures also request the still fallback', () => {
  let draws = 0;
  const events = [];
  const renderer = {
    gl: { LINK_STATUS: 1, getProgramParameter: () => true },
    render: () => { draws++; },
  };
  const options = { scene: { program: { program: {} } } };
  const host = { dispatchEvent: (event) => events.push(event) };
  assert.equal(renderBackground(renderer, options, host), true);
  assert.equal(draws, 1);
  assert.equal(events.length, 0);
  renderer.render = () => { throw new Error('Context lost'); };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(renderBackground(renderer, options, host), false);
    assert.equal(events[0].type, BACKGROUND_RENDER_ERROR);
  } finally {
    console.warn = originalWarn;
  }
});

test('start screen offers no background first and ten new effects alongside Galaxy', () => {
  assert.equal(SETUP_BACKGROUNDS[0].value, 'none');
  assert.equal(SETUP_BACKGROUNDS.length, 12);
  assert.equal(new Set(SETUP_BACKGROUNDS.map(({ value }) => value)).size, 12);
  for (const { value } of SETUP_BACKGROUNDS) assert.equal(normalizeSetupBackground(value), value);
});

test('old Galaxy default and invalid saved values become no background', () => {
  for (const value of ['galaxy', undefined, null, 'invalid', {}, 12]) {
    assert.equal(migrateSetupBackground(value), 'none');
  }
  assert.equal(migrateSetupBackground('none'), 'none');
  assert.equal(migrateSetupBackground('threads'), 'threads');
  assert.equal(normalizeSetupBackground('galaxy'), 'galaxy');
});

test('invalid imported values cannot produce invalid shader inputs', () => {
  const settings = normalizeSetupGalaxy({ density: -5, hueShift: 1000, glowIntensity: NaN,
    saturation: 4, starSpeed: Infinity, speed: -1, rotationSpeed: 9, twinkleIntensity: -3,
    repulsionStrength: 99, intensity: 250, mouseInteraction: 'yes', mouseRepulsion: null, motion: 0 });
  assert.equal(settings.density, 0.1);
  assert.equal(settings.hueShift, 360);
  assert.equal(settings.glowIntensity, DEFAULT_SETUP_GALAXY.glowIntensity);
  assert.equal(settings.saturation, 1);
  assert.equal(settings.starSpeed, DEFAULT_SETUP_GALAXY.starSpeed);
  assert.equal(settings.speed, 0);
  assert.equal(settings.rotationSpeed, 0.5);
  assert.equal(settings.twinkleIntensity, 0);
  assert.equal(settings.repulsionStrength, 5);
  assert.equal(settings.intensity, 100);
  assert.equal(settings.mouseInteraction, true);
  assert.equal(settings.mouseRepulsion, true);
  assert.equal(settings.motion, true);
});

test('partial edits preserve independently stored galaxy settings and defaults', () => {
  const saved = normalizeSetupGalaxy({ hueShift: 300, mouseRepulsion: false, motion: false });
  const updated = normalizeSetupGalaxy({ ...saved, density: 2.5, intensity: 0 });
  assert.equal(updated.hueShift, 300);
  assert.equal(updated.mouseRepulsion, false);
  assert.equal(updated.motion, false);
  assert.equal(updated.density, 2.5);
  assert.equal(updated.intensity, 0);
  assert.equal(saved.density, DEFAULT_SETUP_GALAXY.density);
  assert.deepEqual(normalizeSetupGalaxy({}), DEFAULT_SETUP_GALAXY);
});
