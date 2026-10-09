import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// The writing utilities import each other, so transpile the whole folder into
// node_modules/.cache (where bare imports such as `docx` still resolve) and
// load it from there.
const sourceDir = new URL('../src/utils/writing/', import.meta.url);
const outDir = new URL('../node_modules/.cache/writing-test/', import.meta.url);
await mkdir(outDir, { recursive: true });
for (const file of await readdir(sourceDir)) {
  if (!file.endsWith('.ts')) continue;
  const source = await readFile(new URL(file, sourceDir), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
  });
  const rewritten = outputText.replace(/(from\s+['"])(\.\/[\w-]+)(['"])/g, '$1$2.mjs$3');
  await writeFile(new URL(file.replace(/\.ts$/, '.mjs'), outDir), rewritten);
}
const load = (name) => import(pathToFileURL(new URL(`${name}.mjs`, outDir).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href);

const markdown = await load('markdown');
const humanizer = await load('humanizer');
const prompts = await load('prompts');
const citations = await load('citations');
const reportTypes = await load('reportTypes');
const stylePresets = await load('stylePresets');

const { parseBlocks, parseInline, sectionToNodes, blocksToMarkdown, countWords } = markdown;

test('inline marks, links, citations and footnotes', () => {
  const nodes = parseInline('A **bold** and *italic* [link](https://x.org) with `code` [@smith2024, p. 4] note[^Extra detail].');
  assert.deepEqual(nodes.map((node) => node.type), ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'citation', 'text', 'footnote', 'text']);
  assert.deepEqual(nodes[1].marks, [{ type: 'bold' }]);
  assert.deepEqual(nodes[5].marks, [{ type: 'link', attrs: { href: 'https://x.org' } }]);
  assert.deepEqual(nodes[9].attrs, { keys: ['smith2024'], locator: 'p. 4' });
  assert.equal(nodes[11].attrs.text, 'Extra detail');
});

test('unsafe link targets lose the link but keep the text', () => {
  const nodes = parseInline('[click](javascript:alert(1))');
  assert.equal(nodes.some((node) => node.marks?.some((mark) => mark.type === 'link')), false);
});

test('an unclosed emphasis marker stays literal while streaming', () => {
  const nodes = parseInline('Partial **bold text');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].text, 'Partial **bold text');
});

test('blocks: headings are clamped, tables get captions, footnotes resolve', () => {
  const blocks = parseBlocks([
    '# Too high',
    '',
    'First paragraph',
    'continues here.[^1]',
    '',
    'Table: Results by quarter',
    '| Quarter | Revenue |',
    '| --- | ---: |',
    '| Q1 | 10 |',
    '| Q2 | 12 |',
    '',
    '- one',
    '- two',
    '  - nested',
    '',
    '1. first',
    '2. second',
    '',
    '[Figure: Monthly active users, 2024–2026]',
    '',
    '[^1]: The footnote text.',
  ].join('\n'), { minHeadingLevel: 2 });
  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'paragraph', 'caption', 'table', 'bulletList', 'orderedList', 'figure']);
  assert.equal(blocks[0].attrs.level, 2);
  assert.equal(blocks[1].content[0].text, 'First paragraph continues here.');
  assert.equal(blocks[1].content[1].attrs.text, 'The footnote text.');
  assert.equal(blocks[3].content.length, 3);
  assert.equal(blocks[3].content[0].content[0].type, 'tableHeader');
  assert.equal(blocks[4].content[1].content[1].type, 'bulletList');
  assert.equal(blocks[6].attrs.caption, 'Monthly active users, 2024–2026');
});

test('a caption written after its table moves above it', () => {
  // Captured from a real Claude Code run.
  const blocks = parseBlocks('Intro.\n\n| Approach | Efficiency |\n|---|---|\n| Drip | 90% |\n\nTable: Water use');
  assert.deepEqual(blocks.map((block) => block.type), ['paragraph', 'caption', 'table']);
  assert.equal(blocks[1].content[0].text, 'Water use');
  const both = parseBlocks('Table: First\n| A |\n|---|\n| 1 |\n\nTable: Second\n| B |\n|---|\n| 2 |');
  assert.deepEqual(both.map((block) => block.type), ['caption', 'table', 'caption', 'table']);
});

test('a half-streamed table and list do not throw', () => {
  const partial = 'Intro.\n\n| A | B |\n| --- |';
  assert.doesNotThrow(() => parseBlocks(partial));
  assert.doesNotThrow(() => parseBlocks('- item\n  '));
  assert.doesNotThrow(() => parseBlocks('```js\nconst a = 1;'));
});

test('section nodes drop a repeated title and carry the section id', () => {
  const nodes = sectionToNodes({ id: 'sec-1', title: 'Literature Review' }, '## 2. Literature Review\n\nBody text.');
  assert.equal(nodes[0].attrs.sectionId, 'sec-1');
  assert.equal(nodes[0].attrs.level, 1);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[1].type, 'paragraph');
});

test('markdown round trip keeps structure', () => {
  const source = '## Heading\n\nA **bold** line.\n\n- a\n- b\n\n| X | Y |\n| --- | --- |\n| 1 | 2 |';
  const again = parseBlocks(blocksToMarkdown(parseBlocks(source, { minHeadingLevel: 2 })), { minHeadingLevel: 2 });
  assert.deepEqual(again.map((block) => block.type), ['heading', 'paragraph', 'bulletList', 'table']);
  assert.equal(countWords(again), 10);
});

test('bibliography marker becomes a bibliography block', () => {
  assert.deepEqual(parseBlocks('[[BIBLIOGRAPHY]]'), [{ type: 'bibliography' }]);
});

test('lint flags banned phrases, stock openers and flat rhythm', () => {
  const flat = 'The system is very fast today. The design is quite clean now. The team is really happy here. The users are mostly satisfied now.';
  const result = humanizer.lintText(`Moreover, we delve into the topic. ${flat}`);
  const kinds = new Set(result.issues.map((issue) => issue.kind));
  assert.ok(kinds.has('phrase'));
  assert.ok(kinds.has('transition'));
  assert.ok(kinds.has('rhythm'));
  assert.ok(result.score < 80);
  const natural = humanizer.lintText('Revenue rose 14%. That was not luck: the company cut its onboarding time from nine days to two, and churn in the first quarter after signup fell by a third. Margins followed. By December the unit had paid back its launch costs.');
  assert.ok(natural.score > result.score);
  assert.ok(natural.score >= 85, `natural score ${natural.score}`);
});

test('lint offsets point at the flagged text', () => {
  const text = 'We will leverage data.';
  const issue = humanizer.lintText(text).issues.find((entry) => entry.kind === 'phrase');
  assert.equal(text.slice(issue.start, issue.end), 'leverage');
});

test('style rules reflect the humanizer settings', () => {
  const settings = humanizer.defaultHumanizer('conversational');
  const rules = humanizer.buildStyleRules(settings, { tone: 'friendly', readingLevel: 'general', person: 'first-plural', spelling: 'uk' });
  assert.match(rules, /contractions where they sound natural/);
  assert.match(rules, /British English/);
  assert.match(rules, /"delve"/);
  const off = humanizer.buildStyleRules({ ...settings, enabled: false }, { tone: 'formal', readingLevel: 'expert', person: 'third', spelling: 'us' });
  assert.doesNotMatch(off, /delve/);
});

test('outline parsing accepts JSON, fenced JSON and markdown lists', () => {
  const json = '{"sections":[{"title":"1. Introduction","notes":"Why","targetWords":500,"subsections":["Background"]},{"title":"References","targetWords":100}]}';
  const parsed = prompts.parseOutline(json, 4000);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, 'Introduction');
  assert.deepEqual(parsed[0].subsections, ['Background']);
  assert.equal(parsed[1].unnumbered, true);
  assert.equal(prompts.parseOutline(`Sure:\n\`\`\`json\n${json}\n\`\`\``, 4000).length, 2);
  const md = prompts.parseOutline('1. Introduction\n   1.1 Background\n2. Method\n3. Results', 3000);
  assert.equal(md.length, 3);
  assert.deepEqual(md[0].subsections, ['Background']);
  assert.equal(prompts.parseOutline('no outline here', 1000), null);
});

test('section prompt carries brief, outline, style rules and the output contract', () => {
  const type = reportTypes.getReportType('senior-project');
  const outline = reportTypes.defaultOutline(type, 9000);
  const brief = {
    typeId: 'senior-project',
    details: { title: 'Smart Irrigation', subtitle: '', brief: 'IoT irrigation controller', audience: 'Faculty', authors: 'Team A', organization: '', date: '', language: 'en-US', targetWords: 9000, fields: { institution: 'KFUPM' }, sourceNotes: '', sourceFiles: [] },
    style: stylePresets.styleFromTheme('classic-academic', { citationStyle: 'ieee' }),
    voice: { tone: 'formal', readingLevel: 'professional', person: 'first-plural', spelling: 'us' },
    humanizer: humanizer.defaultHumanizer(),
    engine: { engine: 'claude', model: '', allowWebResearch: false },
  };
  const { system, prompt } = prompts.buildSectionPrompt({ brief, outline, index: 2, written: [{ title: 'Abstract', markdown: 'We built a thing.' }], sources: 'Sensor data: 42%', references: [] });
  assert.match(system, /never invent statistics/i);
  assert.match(prompt, /Smart Irrigation/);
  assert.match(prompt, /University \/ institution: KFUPM/);
  assert.match(prompt, /Now write the section "Introduction"/);
  assert.match(prompt, /## subsections, in order: Background/);
  assert.match(prompt, /Table: Caption text/);
  assert.match(prompt, /<sources>\nSensor data: 42%/);
  assert.match(prompt, /IEEE/);
});

test('default outlines spread the word target', () => {
  const type = reportTypes.getReportType('financial-analysis');
  const outline = reportTypes.defaultOutline(type, 5500);
  const total = outline.reduce((sum, section) => sum + section.targetWords, 0);
  assert.ok(Math.abs(total - 5500) < 200, `total ${total}`);
  assert.equal(outline[0].unnumbered, true);
  for (const definition of reportTypes.REPORT_TYPES) {
    assert.ok(definition.id && definition.name && definition.icon, definition.id);
    assert.ok(stylePresets.STYLE_THEMES.some((theme) => theme.id === definition.themeId), `${definition.id} theme`);
  }
});

test('citations format in each style', () => {
  const ref = { id: 'r1', key: 'smith2024', authors: 'Smith, Jane A.; Lee, Bo', year: '2024', title: 'Water use in arid farms', source: 'Journal of Hydrology', url: '' };
  assert.equal(citations.formatInText([ref], 'apa'), '(Smith & Lee, 2024)');
  assert.equal(citations.formatInText([ref], 'harvard', 'p. 3'), '(Smith and Lee 2024, p. 3)');
  assert.equal(citations.formatInText([ref], 'ieee', '', new Map([['r1', 3]])), '[3]');
  assert.equal(citations.formatReference(ref, 'apa'), 'Smith, J. A., & Lee, B. (2024). Water use in arid farms. *Journal of Hydrology*.');
  assert.match(citations.formatReference(ref, 'ieee', 1), /^\[1\] J\. A\. Smith and B\. Lee, “Water use in arid farms,” \*Journal of Hydrology\*, 2024\.$/);
});

test('pasted reference lists are parsed with unique keys', () => {
  const refs = citations.parseReferenceList('1. Smith, J. (2020). Deep roots. Nature.\n2. Smith, J. (2020). Shallow roots. Science. https://doi.org/10/x\n\nshort');
  assert.equal(refs.length, 2);
  assert.equal(refs[0].key, 'smith2020');
  assert.equal(refs[1].key, 'smith2020a');
  assert.equal(refs[1].url, 'https://doi.org/10/x');
  assert.equal(refs[0].title, 'Deep roots');
});

test('style sanitising clamps values and fills gaps', () => {
  const style = stylePresets.sanitizeStyle({ bodySize: 400, margins: { top: -3 }, pageSize: 'b5' });
  assert.equal(style.bodySize, 24);
  assert.equal(style.margins.top, 5);
  assert.equal(style.pageSize, 'a4');
  assert.deepEqual(stylePresets.pageDimensions('a4', 'landscape'), { width: 297, height: 210 });
});

// Export ------------------------------------------------------------------

const printHtml = await load('printHtml');
const docxExport = await load('docxExport');
const documentModule = await load('document');
const { default: JSZip } = await import('jszip');

function sampleReport() {
  const brief = documentModule.createBrief('senior-project');
  brief.details.title = 'Smart Irrigation';
  brief.details.authors = 'Team A';
  brief.details.fields.institution = 'KFUPM';
  brief.style = { ...brief.style, romanFrontMatter: true, includeToc: true, cover: 'academic', headingNumbering: 'decimal', headerText: '{title}', citationStyle: 'apa' };
  const bibliography = [{ id: 'r1', key: 'smith2024', authors: 'Smith, Jane', year: '2024', title: 'Water use', source: 'Hydrology', url: '' }];
  const outline = [
    { id: 'abs', title: 'Abstract', notes: '', targetWords: 200, subsections: [], unnumbered: true },
    { id: 'intro', title: 'Introduction', notes: '', targetWords: 600, subsections: [] },
    { id: 'refs', title: 'References', notes: '', targetWords: 100, subsections: [], unnumbered: true },
  ];
  const content = documentModule.skeletonContent(brief, outline);
  const fill = (id, markdown) => {
    const index = content.content.findIndex((node) => node.attrs?.sectionId === id);
    content.content.splice(index + 1, 1, ...sectionToNodes({ id, title: '' }, markdown).slice(1));
  };
  fill('abs', 'We built a controller.');
  fill('intro', 'Water matters [@smith2024].[^Measured in 2025.]\n\n## Background\n\nTable: Savings\n| Farm | Saved |\n| --- | --- |\n| North | 31% |\n\n- one\n- two\n\n[Figure: Sensor layout]');
  fill('refs', '[[BIBLIOGRAPHY]]');
  return { brief, bibliography, content };
}

test('print HTML has named pages, roman front matter, TOC targets and footnotes', () => {
  const html = printHtml.buildPrintHtml(sampleReport());
  assert.match(html, /@page front \{[\s\S]*?counter\(page, lower-roman\)/);
  assert.match(html, /\.main \{ page: main; counter-reset: page 1;/);
  assert.match(html, /<section class="cover cover-academic">/);
  assert.match(html, /<nav class="toc">/);
  assert.match(html, /href="#h-\d+" class="front"/);
  assert.match(html, /target-counter\(attr\(href\), page\)/);
  assert.match(html, /<span class="footnote">Measured in 2025\.<\/span>/);
  assert.match(html, /<span class="citation">\(Smith, 2024\)<\/span>/);
  assert.match(html, /<p class="caption caption-table" id="cap-\d+">Savings<\/p>/);
  assert.match(html, /<thead><tr><th>/);
  assert.match(html, /figure-placeholder">Sensor layout/);
  assert.match(html, /Smith, J\. \(2024\)\. Water use\. <em>Hydrology<\/em>\./);
  assert.doesNotMatch(html, /<script/);
});

test('print HTML escapes user text', () => {
  const report = sampleReport();
  report.brief.details.title = '</style><img src=x onerror=alert(1)>';
  report.brief.style.headerText = '{title}';
  const html = printHtml.buildPrintHtml(report);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.equal(html.match(/<\/style>/g).length, 1);
});

test('docx export writes real Word structures', async () => {
  const base64 = await docxExport.docxBase64(sampleReport());
  const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
  const documentXml = await zip.file('word/document.xml').async('string');
  const styles = await zip.file('word/styles.xml').async('string');
  const numbering = await zip.file('word/numbering.xml').async('string');
  const footnotes = await zip.file('word/footnotes.xml').async('string');
  assert.match(styles, /w:styleId="Heading1"/);
  assert.match(styles, /w:styleId="Caption"/);
  assert.match(numbering, /%1\.%2/);
  assert.match(footnotes, /Measured in 2025\./);
  assert.match(documentXml, /TOC \\h \\o &quot;1-3&quot;/);
  assert.match(documentXml, /PAGEREF _Toc\d+/);
  assert.match(documentXml, /w:pgNumType w:start="1" w:fmt="lowerRoman"/);
  assert.match(documentXml, /SEQ Table/);
  assert.match(documentXml, /\(Smith, 2024\)/);
  assert.match(documentXml, /w:titlePg/);
  assert.match(documentXml, /\[Figure: Sensor layout\]/);
});
