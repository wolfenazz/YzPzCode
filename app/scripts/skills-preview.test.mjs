import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// `src/utils/skillPreview.ts` is plain TypeScript with no relative imports, so
// it is transpiled straight into node_modules/.cache and loaded from there
// (`npm run test:skills`).
const outDir = new URL('../node_modules/.cache/skills-preview/', import.meta.url);
await mkdir(outDir, { recursive: true });
const source = await readFile(new URL('../src/utils/skillPreview.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
await writeFile(new URL('skillPreview.mjs', outDir), outputText);
const fileUrl = pathToFileURL(new URL('skillPreview.mjs', outDir).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const { splitFrontmatter, formatMetaValue } = await import(fileUrl);

const lines = (...parts) => parts.join('\n');

// The discord skill as the catalogue returns it (screenshot of the panel).
const DISCORD = lines(
  '---',
  'name: discord',
  'description: "Discord messaging workflows through OpenClaw\'s message tool."',
  'metadata: { "openclaw": { "emoji": "🥂", "requires": { "config": ["channels.discord"] } } }',
  'allowed-tools: ["message"]',
  '---',
  '',
  '# Discord',
  '',
  'Send and read messages with the `message` tool.',
);

test('a SKILL.md keeps its body and turns the frontmatter into chips', () => {
  const { meta, description, body } = splitFrontmatter(DISCORD);
  assert.equal(description, "Discord messaging workflows through OpenClaw's message tool.");
  assert.deepEqual(meta, [
    ['metadata', '{ "openclaw": { "emoji": "🥂", "requires": { "config": ["channels.discord"] } } }'],
    ['allowed-tools', '["message"]'],
  ]);
  assert.equal(body, '# Discord\n\nSend and read messages with the `message` tool.');
  assert.doesNotMatch(body, /name: discord/);
  assert.doesNotMatch(body, /^---/m);
});

test('the name key is dropped (the card already shows it) and description never repeats', () => {
  const { meta, description } = splitFrontmatter(lines('---', 'name: pdfs', 'description: Read PDFs', 'license: MIT', '---', 'Body'));
  assert.equal(description, 'Read PDFs');
  assert.deepEqual(meta, [['license', 'MIT']]);
});

test('CRLF files, byte order marks, tabs and empty values', () => {
  const crlf = '\uFEFF---\r\nname: sheets\r\ndescription: "Spreadsheets"\r\nlicense:\r\nversion:\t1.2.0\r\n---\r\n\r\n# Sheets\r\nBody.';
  const { meta, description, body } = splitFrontmatter(crlf);
  assert.equal(description, 'Spreadsheets');
  assert.deepEqual(meta, [['version', '1.2.0']]);
  assert.equal(body, '# Sheets\r\nBody.');
});

test('block scalars fold into one line', () => {
  const { meta, description } = splitFrontmatter(lines('---', 'name: mail', 'description: >-', '  Send mail from a', '  terminal session.', 'metadata:', '  category: tools', '---', 'Body'));
  assert.equal(description, 'Send mail from a terminal session.');
  assert.deepEqual(meta, [['metadata', 'category: tools']]);
});

test('a file without frontmatter is rendered as is', () => {
  const plain = '# Notes\n\nNo metadata here.\n\n---\n\nAfter a rule.';
  assert.deepEqual(splitFrontmatter(plain), { meta: [], description: null, body: plain });
});

test('a rule in the body is not mistaken for frontmatter', () => {
  const { meta, description, body } = splitFrontmatter(lines('Intro line.', '', '---', '', 'After the rule.'));
  assert.deepEqual(meta, []);
  assert.equal(description, null);
  assert.match(body, /^Intro line\./);
});

test('scalars lose one layer of quotes and collapse whitespace', () => {
  assert.equal(formatMetaValue('"Discord messaging"'), 'Discord messaging');
  assert.equal(formatMetaValue("'single quoted'"), 'single quoted');
  assert.equal(formatMetaValue('  spaced   out  '), 'spaced out');
  assert.equal(formatMetaValue('"unbalanced'), '"unbalanced');
  assert.equal(formatMetaValue(''), '');
});

test('the skills sources parse (a stray newline inside a regex broke the dev build once)', async () => {
  const files = [
    '../src/utils/skillPreview.ts',
    '../src/components/workspace/SkillMarkdownPreview.tsx',
    '../src/components/workspace/SkillsMarketPanel.tsx',
  ];
  for (const file of files) {
    const text = await readFile(new URL(file, import.meta.url), 'utf8');
    const result = ts.transpileModule(text, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    assert.deepEqual((result.diagnostics ?? []).map((diagnostic) => diagnostic.code), [], file);
  }
});
