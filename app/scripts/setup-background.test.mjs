import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/setupBackground.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { DEFAULT_SETUP_GALAXY, SETUP_BACKGROUNDS, normalizeSetupGalaxy } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('start screen backgrounds list offers None and Galaxy', () => {
  assert.deepEqual(SETUP_BACKGROUNDS.map(({ value }) => value), ['none', 'galaxy']);
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
