import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/workspaceBackground.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { DEFAULT_LIGHT_RAYS, migrateWorkspaceBackground, normalizeLightRays } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('migration preserves existing enabled and disabled Aurora preferences', () => {
  assert.equal(migrateWorkspaceBackground({ workspaceAuroraEnabled: true }), 'aurora');
  assert.equal(migrateWorkspaceBackground({ workspaceAuroraEnabled: false }), 'none');
  assert.equal(migrateWorkspaceBackground({}), 'aurora');
  assert.equal(migrateWorkspaceBackground({ workspaceBackground: 'light-rays', workspaceAuroraEnabled: false }), 'light-rays');
});

test('invalid imported values cannot produce invalid shader inputs', () => {
  const settings = normalizeLightRays({ rayLength: 0, fadeDistance: -1, lightSpread: NaN,
    intensity: 200, mouseInfluence: -0.5, raysSpeed: Infinity, raysColor: 'invalid', raysOrigin: 'invalid', motion: null });
  assert.equal(settings.rayLength, 0.1);
  assert.equal(settings.fadeDistance, 0.1);
  assert.equal(settings.lightSpread, DEFAULT_LIGHT_RAYS.lightSpread);
  assert.equal(settings.intensity, 100);
  assert.equal(settings.mouseInfluence, 0);
  assert.equal(settings.raysSpeed, DEFAULT_LIGHT_RAYS.raysSpeed);
  assert.equal(settings.raysColor, DEFAULT_LIGHT_RAYS.raysColor);
  assert.equal(settings.raysOrigin, DEFAULT_LIGHT_RAYS.raysOrigin);
  assert.equal(settings.motion, true);
});

test('partial edits preserve independently stored ray settings and defaults', () => {
  const saved = normalizeLightRays({ raysColor: '#ff5500', raysOrigin: 'bottom-right', motion: false });
  const updated = normalizeLightRays({ ...saved, intensity: 0, noiseAmount: 0.75 });
  assert.equal(updated.raysColor, '#ff5500');
  assert.equal(updated.raysOrigin, 'bottom-right');
  assert.equal(updated.motion, false);
  assert.equal(updated.intensity, 0);
  assert.equal(updated.noiseAmount, 0.75);
  assert.equal(saved.noiseAmount, DEFAULT_LIGHT_RAYS.noiseAmount);
  assert.deepEqual(normalizeLightRays({}), DEFAULT_LIGHT_RAYS);
});
