import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/customTheme.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const theme = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const {
  MAX_CUSTOM_THEMES,
  THEME_COLOR_KEYS,
  THEME_PRESETS,
  buildTerminalPalette,
  buildThemeTokens,
  contrastRatio,
  createCustomTheme,
  getBlockingProblems,
  getContrastChecks,
  normalizeHex,
  parseCustomThemeFile,
  relativeLuminance,
  sanitizeCustomTheme,
  sanitizeCustomThemes,
  serializeCustomTheme,
  uniqueThemeName,
} = theme;

const dark = THEME_PRESETS.find((preset) => preset.id === 'dark');

test('hex input is normalised and anything else is rejected', () => {
  assert.equal(normalizeHex('#ABCDEF'), '#abcdef');
  assert.equal(normalizeHex('abc'), '#aabbcc');
  assert.equal(normalizeHex('  #fff '), '#ffffff');
  for (const bad of ['', '#', '#12', '#12345', '#1234567', 'red', 'rgb(0,0,0)', '#gggggg', null, undefined, 12, {}]) {
    assert.equal(normalizeHex(bad), null, `${String(bad)} must be rejected`);
  }
});

test('contrast ratio matches the WCAG reference values', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
  assert.ok(Math.abs(contrastRatio('#767676', '#ffffff') - 4.54) < 0.02);
});

test('every preset is a complete palette with readable text', () => {
  const ids = new Set();
  for (const preset of THEME_PRESETS) {
    assert.ok(!ids.has(preset.id), `duplicate preset id ${preset.id}`);
    ids.add(preset.id);
    for (const key of THEME_COLOR_KEYS) assert.equal(normalizeHex(preset.colors[key]), preset.colors[key], `${preset.id}.${key}`);
    assert.deepEqual(getBlockingProblems(preset), [], `${preset.id} must be usable`);
    const failing = getContrastChecks(preset).filter((check) => check.status !== 'pass');
    assert.deepEqual(failing.map((check) => `${preset.id}:${check.id}:${check.ratio.toFixed(2)}`), [], `${preset.id} must pass every contrast check`);
  }
});

test('the palette library is broad, well-grouped and honestly labelled', () => {
  assert.ok(THEME_PRESETS.length >= 20, `only ${THEME_PRESETS.length} palettes`);
  // The first two double as the fallback for malformed dark/light themes.
  assert.deepEqual([THEME_PRESETS[0].id, THEME_PRESETS[1].id], ['dark', 'light']);
  const names = new Set();
  for (const preset of THEME_PRESETS) {
    assert.ok(['built-in', 'platform', 'editor'].includes(preset.group), `${preset.id} group`);
    assert.ok(preset.description.length > 8, `${preset.id} needs a description`);
    assert.ok(!names.has(preset.name.toLowerCase()), `duplicate name ${preset.name}`);
    names.add(preset.name.toLowerCase());
    const luminance = relativeLuminance(preset.colors.background);
    assert.ok(preset.base === 'light' ? luminance > 0.3 : luminance < 0.1, `${preset.id} is labelled ${preset.base} but its background luminance is ${luminance.toFixed(2)}`);
    // AA (4.5) is enforced for every pairing elsewhere; primary text should clear it with room to spare.
    assert.ok(contrastRatio(preset.colors.text, preset.colors.background) >= 6, `${preset.id} text should be comfortably readable`);
  }
  for (const group of ['built-in', 'platform', 'editor']) assert.ok(THEME_PRESETS.some((p) => p.group === group), `no ${group} palettes`);
  assert.ok(THEME_PRESETS.filter((p) => p.base === 'light').length >= 8, 'needs a healthy set of light palettes');
  assert.ok(THEME_PRESETS.filter((p) => p.base === 'dark').length >= 8, 'needs a healthy set of dark palettes');
  for (const brand of ['Apple', 'Google', 'GitHub', 'Fluent', 'Material You']) {
    assert.ok(THEME_PRESETS.some((p) => p.name.startsWith(brand)), `missing ${brand} palettes`);
  }
});

test('tokens cover everything the built-in Claude theme defines, so no UI surface is left unthemed', async () => {
  const css = await readFile(new URL('../src/premium-system.css', import.meta.url), 'utf8');
  const block = /\n\.claude-theme \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const expected = [...block.matchAll(/^\s*(--[\w-]+):/gm)].map((match) => match[1]).filter((name) => !name.startsWith('--claude-'));
  assert.ok(expected.length > 40, 'expected to find the Claude theme tokens');
  const tokens = buildThemeTokens(dark);
  const missing = expected.filter((name) => !(name in tokens));
  assert.deepEqual(missing, []);
});

test('light and dark bases invert the zinc ramp the way the built-in themes do', () => {
  const darkTokens = buildThemeTokens(dark);
  assert.equal(darkTokens['--color-zinc-50'], dark.colors.text);
  assert.equal(darkTokens['--color-zinc-950'], dark.colors.background);
  const light = THEME_PRESETS.find((preset) => preset.id === 'light');
  const lightTokens = buildThemeTokens(light);
  assert.equal(lightTokens['--color-zinc-50'], light.colors.text);
  assert.equal(lightTokens['--color-zinc-950'], light.colors.background);
  assert.ok(contrastRatio(lightTokens['--color-zinc-50'], lightTokens['--color-zinc-950']) > 10);
});

test('accent text always reads on the background even for low-contrast accents', () => {
  const tokens = buildThemeTokens({ ...dark, colors: { ...dark.colors, accent: '#222222' } });
  assert.ok(contrastRatio(tokens['--accent-text'], dark.colors.background) >= 4.5);
  assert.equal(tokens['--primary-foreground'], '#ffffff');
});

test('hostile or malformed colors can never reach a CSS value', () => {
  const tokens = buildThemeTokens({
    base: 'dark',
    radius: Number.NaN,
    colors: {
      background: 'red; } body { display: none',
      surface: 'url(https://evil.test/x)',
      elevated: '#12',
      text: { toString: () => '#ffffff' },
      textMuted: null,
      accent: 'var(--x)',
    },
  });
  for (const [name, value] of Object.entries(tokens)) {
    assert.match(value, /^(#[\da-f]{6}|rgba\(\d+, \d+, \d+, [\d.]+\)|transparent|[\d.]+rem|0 [^;{}]+)$/, `${name}: ${value}`);
  }
  assert.equal(tokens['--bg-primary'], dark.colors.background);
  assert.equal(tokens['--radius'], '0.625rem');
});

test('radius is clamped and scales the derived radii', () => {
  assert.equal(buildThemeTokens({ ...dark, radius: 999 })['--radius'], '1.25rem');
  assert.equal(buildThemeTokens({ ...dark, radius: -5 })['--radius'], '0rem');
  assert.equal(buildThemeTokens({ ...dark, radius: 10 })['--radius-control'], '0.5rem');
  assert.equal(buildThemeTokens({ ...dark, radius: 10 })['--radius-dialog'], '1.125rem');
});

test('a theme that would make the app unreadable is blocked', () => {
  const invisible = { base: 'dark', colors: { ...dark.colors, text: dark.colors.background } };
  assert.equal(getBlockingProblems(invisible).length, 3);
  assert.deepEqual(getBlockingProblems(dark), []);
});

test('terminal palette flags light backgrounds so a readable ANSI set can be chosen', () => {
  assert.equal(buildTerminalPalette(dark).light, false);
  const paper = buildTerminalPalette({ base: 'light', colors: { ...dark.colors, terminal: '#fdf6e3' } });
  assert.equal(paper.light, true);
  assert.ok(contrastRatio(paper.foreground, paper.background) >= 7);
});

test('themes round-trip through the share format with a fresh identity', () => {
  const original = createCustomTheme({ ...dark, radius: 14 }, 'Ocean');
  const result = parseCustomThemeFile(serializeCustomTheme(original));
  assert.equal(result.ok, true);
  assert.notEqual(result.theme.id, original.id);
  assert.equal(result.theme.name, 'Ocean');
  assert.equal(result.theme.radius, 14);
  assert.deepEqual(result.theme.colors, original.colors);
});

test('imports report what is wrong instead of repairing it', () => {
  const file = JSON.parse(serializeCustomTheme(createCustomTheme(dark, 'x')));
  const reject = (patch, pattern) => {
    const result = parseCustomThemeFile(typeof patch === 'string' ? patch : JSON.stringify({ ...file, ...patch }));
    assert.equal(result.ok, false);
    assert.match(result.error, pattern);
  };
  reject('{nope', /valid JSON/);
  reject('[]', /not a YzPzCode theme/);
  reject({ format: 'other' }, /not a YzPzCode theme/);
  reject({ version: 99 }, /newer version/);
  reject({ colors: 'red' }, /no colors/);
  reject({ colors: { ...file.colors, accent: 'javascript:alert(1)' } }, /"accent"/);
  reject(' '.repeat(70 * 1024), /too large/);
});

test('imports fill missing colors and cannot smuggle identity or prototype keys', () => {
  const payload = '{"format":"yzpzcode-theme","version":1,"name":"  Ghost\\u0007  ","id":"stolen","__proto__":{"polluted":true},"colors":{"accent":"#ff0000"}}';
  const result = parseCustomThemeFile(payload);
  assert.equal(result.ok, true);
  assert.notEqual(result.theme.id, 'stolen');
  assert.equal(result.theme.name, 'Ghost');
  assert.equal(result.theme.colors.accent, '#ff0000');
  assert.equal(result.theme.colors.background, dark.colors.background);
  assert.equal({}.polluted, undefined);
});

test('stored themes are sanitised, de-duplicated and capped', () => {
  assert.deepEqual(sanitizeCustomThemes('nope'), []);
  assert.equal(sanitizeCustomTheme(null), null);
  assert.equal(sanitizeCustomTheme({ name: 'no colors' }), null);
  const good = createCustomTheme(dark, 'Good');
  const many = Array.from({ length: MAX_CUSTOM_THEMES + 5 }, (_, i) => ({ ...good, id: `t-${i}` }));
  assert.equal(sanitizeCustomThemes(many).length, MAX_CUSTOM_THEMES);
  assert.equal(sanitizeCustomThemes([good, good, { ...good, name: 'again' }]).length, 1);
  const repaired = sanitizeCustomTheme({ ...good, id: '../../etc', base: 'sepia', colors: { ...good.colors, text: 'nope' } });
  assert.match(repaired.id, /^theme-/);
  assert.equal(repaired.base, 'dark');
  assert.equal(repaired.colors.text, dark.colors.text);
});

test('new theme names avoid collisions', () => {
  assert.equal(uniqueThemeName('My theme', []), 'My theme');
  assert.equal(uniqueThemeName('My theme', ['my theme']), 'My theme 2');
  assert.equal(uniqueThemeName('My theme', ['My theme', 'My theme 2']), 'My theme 3');
});
