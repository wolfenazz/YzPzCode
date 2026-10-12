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
const documentDoc = await load('document');

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

test('headings without sections (a Word import) become sections', () => {
  const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
  const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const doc = { type: 'doc', content: [p('A title line'), h(2, 'Purpose'), p('one two three four five'), h(3, 'Detail'), p('six seven'), h(2, 'References'), p('x')] };
  const adopted = documentDoc.adoptSections(doc);
  assert.ok(adopted, 'sections are found');
  assert.deepEqual(adopted.outline.map((section) => section.title), ['Purpose', 'References']);
  assert.equal(adopted.outline[1].unnumbered, true);
  const headings = adopted.content.content.filter((node) => node.type === 'heading');
  assert.deepEqual(headings.map((node) => node.attrs.level), [1, 2, 1]);
  assert.equal(headings[0].attrs.sectionId, adopted.outline[0].id);
  assert.equal(headings[1].attrs.sectionId, undefined);
  assert.ok(adopted.outline.every((section) => section.targetWords >= 120));
  // A lone level-1 title stays a title; the level below becomes the sections.
  const titled = documentDoc.adoptSections({ type: 'doc', content: [h(1, 'Guide'), h(2, 'Intro'), p('a'), h(2, 'Body'), p('b')] });
  assert.deepEqual(titled.outline.map((section) => section.title), ['Intro', 'Body']);
  assert.equal(titled.content.content[0].attrs.sectionId, undefined);
  // Documents that already have sections, or no headings, are left alone.
  assert.equal(documentDoc.adoptSections(adopted.content), null);
  assert.equal(documentDoc.adoptSections({ type: 'doc', content: [p('plain')] }), null);
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

const styleAi = await load('styleAi');

test('outline replies can propose the title', () => {
  const reply = '```json\n{"title":"  Water Use in\\nArid Farms ","subtitle":"A field study","sections":[{"title":"Introduction"}]}\n```';
  assert.deepEqual(prompts.parseOutlineTitle(reply), { title: 'Water Use in Arid Farms', subtitle: 'A field study' });
  assert.equal(prompts.parseOutlineTitle('{"sections":[]}'), null);
  assert.equal(prompts.parseOutlineTitle('nothing'), null);
  const brief = documentModule.createBrief('essay');
  assert.match(prompts.buildOutlinePrompt(brief, '', []).prompt, /No title was given/);
  brief.details.title = 'On Walking';
  assert.match(prompts.buildOutlinePrompt(brief, '', []).prompt, /Use "On Walking" as the title/);
});

test('every report type has composer copy', () => {
  for (const type of reportTypes.REPORT_TYPES) {
    const copy = reportTypes.composerCopy(type);
    assert.ok(copy.ask.endsWith('?'), type.id);
    assert.ok(copy.placeholder.length > 20, type.id);
  }
});

test('restyle replies are applied strictly', () => {
  const current = stylePresets.styleFromTheme('classic-academic');
  const reply = 'Here you go:\n{"bodyFont":"garamond","headingFont":"Comic Sans MS","bodySize":40,"lineHeight":"1.6","headingColor":"#FFE","accentColor":"#1d4ed8","cover":"corporate","margins":{"left":5},"pageNumbers":"middle","summary":"Warm editorial serif."}';
  const result = styleAi.parseRestyle(reply, current);
  assert.equal(result.style.bodyFont, 'Garamond');
  assert.equal(result.style.headingFont, current.headingFont, 'unknown fonts are ignored');
  assert.equal(result.style.bodySize, 14, 'sizes are clamped');
  assert.equal(result.style.lineHeight, 1.6);
  assert.equal(result.style.headingColor, current.headingColor, 'unreadable colours are ignored');
  assert.equal(result.style.accentColor, '#1d4ed8');
  assert.equal(result.style.cover, 'corporate');
  assert.deepEqual(result.style.margins, { top: 12, right: 12, bottom: 12, left: 12 });
  assert.equal(result.style.pageNumbers, current.pageNumbers, 'unknown options are ignored');
  assert.equal(result.style.themeId, 'custom');
  assert.equal(result.summary, 'Warm editorial serif.');
  assert.ok(result.changes.includes('Body font') && result.changes.includes('Cover') && !result.changes.includes('Heading font'));
  assert.equal(styleAi.parseRestyle('{"bodyFont":"Wingdings"}', current), null);
  assert.equal(styleAi.parseRestyle('no json', current), null);
  assert.ok(styleAi.contrastOnWhite('#000000') > 20);
  assert.ok(styleAi.contrastOnWhite('#ffffee') < 1.1);
  const prompt = styleAi.buildRestylePrompt(current, 'Make it corporate', { typeName: 'Business Plan', title: 'Acme' });
  assert.match(prompt.prompt, /Make it corporate/);
  assert.match(prompt.prompt, /Times New Roman/);
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

const pictures = await load('pictures');

test('the writer asks for web photos with [Photo: words | caption], and pictures survive a rewrite', () => {
  const blocks = markdown.parseBlocks('[Photo: drip irrigation field | Drip lines in an arid farm]\n\n![Pump house](assets/pump.jpg "Photo: Ann Lee / Unsplash")\n\n[Figure: Water use by month]');
  assert.deepEqual(blocks[0].attrs, { src: null, alt: 'Drip lines in an arid farm', caption: 'Drip lines in an arid farm', query: 'drip irrigation field' });
  assert.equal(blocks[1].attrs.src, 'assets/pump.jpg');
  assert.equal(blocks[1].attrs.credit, 'Photo: Ann Lee / Unsplash');
  assert.equal(blocks[2].attrs.src, null);
  const back = markdown.blocksToMarkdown(blocks);
  assert.match(back, /\[Photo: drip irrigation field \| Drip lines in an arid farm\]/);
  assert.match(back, /!\[Pump house\]\(assets\/pump\.jpg "Photo: Ann Lee \/ Unsplash"\)/);
  assert.match(back, /\[Figure: Water use by month\]/);
  assert.deepEqual(markdown.parseBlocks(back).map((block) => block.attrs), blocks.map((block) => block.attrs));
  assert.equal(markdown.blocksToMarkdown([{ type: 'figure', attrs: { src: 'data:image/png;base64,AAAA', caption: 'Inline' } }]), '[Figure: Inline]');

  const brief = documentModule.createBrief('technical-report');
  const outline = reportTypes.defaultOutline(reportTypes.getReportType('technical-report'), 3000);
  const input = { brief, outline, index: 1, written: [], sources: '', references: [] };
  assert.doesNotMatch(prompts.buildSectionPrompt(input).prompt, /\[Photo:/);
  assert.match(prompts.buildSectionPrompt({ ...input, photos: true }).prompt, /\[Photo: 2–5 concrete English search words \| Caption\]/);
  assert.match(prompts.buildRewritePrompt({ brief, action: 'grammar', passage: 'x', references: [] }).prompt, /Keep picture lines/);
});

test('page flow: space to the next page, unknown past the last page', async () => {
  const { spaceToPageEnd } = await load('pageFlow');
  // Page 1 content 100–1000, break band 1000–1100, page 2 content 1100–2000, band 2000–2100.
  const bands = [{ top: 1000, bottom: 1100 }, { top: 2000, bottom: 2100 }];
  assert.equal(spaceToPageEnd(100, bands, 100), 0, 'the first line of page 1 already starts a page');
  assert.equal(spaceToPageEnd(1100, bands, 100), 0, 'right after a band starts a page');
  assert.equal(spaceToPageEnd(400, bands, 100), 601);
  assert.equal(spaceToPageEnd(1500, bands, 100), 501);
  // Past the last band the pagination has not added pages yet: unknown, never 0
  // (0 dropped the padding, shortened the document and made the pages flicker).
  assert.equal(spaceToPageEnd(2500, bands, 100), null);
  assert.equal(spaceToPageEnd(2100, bands, 100), 0);
  assert.equal(spaceToPageEnd(500, [], 100), null);
});

test('streaming writes keep the blocks that did not change', async () => {
  const { commonPrefixLength } = await load('pageFlow');
  const same = (a, b) => a === b;
  assert.equal(commonPrefixLength(['a', 'b', 'c'], ['a', 'b', 'c2'], same), 2);
  assert.equal(commonPrefixLength(['a', 'b'], ['a', 'b', 'c'], same), 2);
  assert.equal(commonPrefixLength(['a', 'b', 'c'], ['a'], same), 1);
  assert.equal(commonPrefixLength([], ['a'], same), 0);
  assert.equal(commonPrefixLength(['x'], ['a'], same), 0);
});

test('web photo results: printable, the right way round, search order otherwise', () => {
  const at = (width, height, name = 'a.jpg') => ({ fullUrl: `https://example.org/${name}`, width, height });
  assert.equal(pictures.choosePicture([]), null);
  assert.equal(pictures.choosePicture([at(2000, 1000, 'x.svg'), { fullUrl: 'http://insecure.org/a.jpg', width: 2000, height: 1000 }]), null);
  const small = at(400, 300, 'small.jpg');
  const tall = at(1000, 1600, 'tall.jpg');
  const wide = at(1600, 1000, 'wide.jpg');
  assert.equal(pictures.choosePicture([small, tall, wide]), wide);
  assert.equal(pictures.choosePicture([small, tall, wide], 'portrait'), tall);
  assert.equal(pictures.choosePicture([wide, at(1800, 1100, 'second.jpg')]), wide);
  assert.equal(pictures.choosePicture([at(4000, 800, 'banner.jpg'), wide]), wide, 'extreme panoramas lose');
  assert.equal(pictures.cleanPictureQuery('  "Container port" cranes, at dusk!! (wide) extra words here '), 'Container port cranes at dusk wide');
  assert.equal(pictures.pictureStem('Container port: cranes'), 'container-port-cranes');
});

test('photos found by the AI web search: one list per request, real files only', () => {
  const { system, prompt } = pictures.buildPhotoSearchPrompt([
    { queries: ['solar panels on house roofs', 'rooftop solar'], prefer: 'landscape' },
    { queries: ['"parents" with adult son!'], prefer: 'portrait' },
  ]);
  assert.match(system, /web search/i);
  assert.match(system, /Never use paid stock/);
  assert.match(prompt, /1\. solar panels on house roofs \(or: rooftop solar\)\. landscape\./);
  assert.match(prompt, /2\. parents with adult son\. portrait\./);

  const reply = `I'll search for these {now}.\n\n\`\`\`json\n${JSON.stringify({ results: [
    { n: 2, photos: [{ url: 'https://images.pexels.com/photos/1/a.jpeg?w=1600', page: 'https://www.pexels.com/photo/1/', credit: 'Ann / Pexels', width: 1600, height: 2400 }] },
    { n: 1, photos: [
      { url: 'https://upload.wikimedia.org/a.jpg', page: 'https://commons.wikimedia.org/wiki/File:a.jpg', credit: 'Bo / Wikimedia Commons, CC BY-SA 4.0' },
      { url: 'https://upload.wikimedia.org/a.jpg', credit: 'duplicate' },
      { url: 'https://media.gettyimages.com/photos/x.jpg', credit: 'paid' },
      { url: 'https://example.org/drawing.svg', credit: 'svg' },
      { url: 'http://insecure.org/b.jpg', credit: 'not https' },
      { url: 'https://cdn.pixabay.com/c.jpg' },
    ] },
  ] })}\n\`\`\``;
  const found = pictures.parsePhotoSearch(reply, 2);
  assert.equal(found.length, 2);
  assert.deepEqual(found[0].map((photo) => photo.fullUrl), ['https://upload.wikimedia.org/a.jpg', 'https://cdn.pixabay.com/c.jpg']);
  assert.equal(found[0][1].credit, 'cdn.pixabay.com', 'a missing credit falls back to the site');
  assert.equal(found[1][0].height, 2400);
  assert.equal(found[1][0].credit, 'Ann / Pexels');

  const single = pictures.parsePhotoSearch('{"photos":[{"url":"https://images.unsplash.com/p?w=1600","credit":"Cy / Unsplash"}]}', 1);
  assert.equal(single[0][0].fullUrl, 'https://images.unsplash.com/p?w=1600');
  assert.deepEqual(pictures.parsePhotoSearch('No luck, sorry.', 2), [[], []]);
});

// Right to left -------------------------------------------------------------

const rtl = await load('rtl');
const labels = await load('labels');
const fontCatalog = await load('fontCatalog');

const AR_HELLO = 'مرحبا بالعالم';
const AR_TITLE = 'نظام الري الذكي';

test('right-to-left helpers: direction, language, tags, words and folding', () => {
  assert.equal(rtl.hasRtl(AR_HELLO), true);
  assert.equal(rtl.hasRtl('hello'), false);
  assert.equal(rtl.paragraphDirection(`${AR_HELLO}.`), 'rtl');
  assert.equal(rtl.paragraphDirection('Hello world'), 'ltr');
  // A Latin opener in an Arabic paragraph does not make it left to right; numbers alone follow the fallback.
  assert.equal(rtl.paragraphDirection(`iPhone 15 ${AR_HELLO} ${AR_TITLE} ${AR_HELLO}`), 'rtl');
  assert.equal(rtl.paragraphDirection('2024'), 'ltr');
  assert.equal(rtl.paragraphDirection('2024', 'rtl'), 'rtl');

  assert.equal(rtl.isRtlLanguage('Arabic'), true);
  assert.equal(rtl.isRtlLanguage('Arabic (Egyptian)'), true);
  assert.equal(rtl.isRtlLanguage('ar-EG'), true);
  assert.equal(rtl.isRtlLanguage('العربية'), true);
  assert.equal(rtl.isRtlLanguage('Hebrew'), true);
  assert.equal(rtl.isRtlLanguage('Persian (Farsi)'), true);
  assert.equal(rtl.isRtlLanguage('English'), false);
  assert.equal(rtl.isRtlLanguage('French'), false);

  assert.equal(rtl.languageTag('Arabic'), 'ar-SA');
  assert.equal(rtl.languageTag('العربية'), 'ar-SA');
  assert.equal(rtl.languageTag('Persian'), 'fa-IR');
  assert.equal(rtl.languageTag('Urdu'), 'ur-PK');
  assert.equal(rtl.languageTag('French'), 'fr-FR');
  assert.equal(rtl.languageTag('Klingon'), 'en-US');

  // Latin \w finds no Arabic word; the shared counter does.
  assert.equal(rtl.countWordsIn(`${AR_HELLO}, hello 12`), 4);
  assert.equal(rtl.languageFor(`${AR_HELLO} ${AR_TITLE}`, 'English'), 'Arabic');
  assert.equal(rtl.languageFor(`${AR_HELLO}`, 'French'), 'French');
  assert.equal(rtl.languageFor('hello', 'English'), 'English');

  assert.equal(rtl.foldArabic('أَحْمَد'), 'احمد');
  assert.equal(rtl.westernDigits('٢٠٢٤'), '2024');
  assert.equal(rtl.complexScriptFace('Calibri'), 'Segoe UI');
  assert.equal(rtl.complexScriptFace('Georgia'), 'Times New Roman');
  assert.equal(rtl.complexScriptFace('Tahoma'), 'Tahoma');
});

test('the font catalog has many faces, Arabic ones among them, and says which need installing', () => {
  const all = fontCatalog.FONT_CATALOG;
  assert.ok(all.length >= 120, `${all.length} faces`);
  assert.equal(new Set(all.map((entry) => entry.name)).size, all.length, 'names are unique');
  const arabic = all.filter((entry) => entry.arabic);
  assert.ok(arabic.length >= 35);
  for (const name of ['Cairo', 'Tajawal', 'Amiri', 'Sakkal Majalla', 'Traditional Arabic', 'Segoe UI', 'Tahoma', 'Dubai', 'Noto Kufi Arabic']) {
    assert.ok(arabic.some((entry) => entry.name === name), name);
  }
  assert.equal(fontCatalog.catalogFont('cairo, sans-serif')?.source, 'bundled');
  assert.deepEqual(fontCatalog.needsInstalling(['Segoe UI', 'Cairo', 'Calibri', 'Lato']).sort(), ['Cairo', 'Lato']);
  assert.match(fontCatalog.catalogStack('Cairo'), /^'Cairo', 'Segoe UI'/);
  // The writing studio offers the same faces.
  assert.ok(stylePresets.DOCUMENT_FONTS.length >= all.length);
  // A face with no Arabic letters is backed by one that has them; an Arabic face needs no backup.
  assert.match(stylePresets.fontStack('Georgia'), /Times New Roman/);
  assert.match(stylePresets.fontStack('Calibri'), /Segoe UI/);
  assert.equal(stylePresets.fontStack('Cairo'), 'Cairo, sans-serif');
});

test('an Arabic report prints right to left with its own labels, mirrored page boxes and per-block direction', () => {
  const report = sampleReport();
  report.brief.details.language = 'Arabic';
  report.brief.details.title = AR_TITLE;
  report.brief.style = { ...report.brief.style, headingNumbering: 'chapter', includeListOfTables: true, pageNumbers: 'bottom-right', footerText: 'Footer' };
  report.content.content.push(
    { type: 'paragraph', content: [{ type: 'text', text: `${AR_HELLO}.` }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'An English note.' }] },
    { type: 'caption', attrs: { kind: 'table' }, content: [{ type: 'text', text: AR_TITLE }] },
  );
  const html = printHtml.buildPrintHtml(report);
  const arabic = labels.docLabels('Arabic');
  assert.match(html, /<html lang="ar-SA" dir="rtl">/);
  assert.match(html, /<p>مرحبا بالعالم\.<\/p>/, 'an Arabic paragraph inherits the document direction');
  assert.match(html, /<p dir="ltr">An English note\.<\/p>/, 'an English one says so');
  assert.match(html, new RegExp(`content: "${arabic.chapter} " counter\\(h1\\)`));
  assert.match(html, new RegExp(`\\.caption-table::before \\{ content: "${arabic.table} "`));
  assert.match(html, new RegExp(arabic.contents));
  assert.match(html, new RegExp(arabic.preparedBy));
  // The page boxes mirror: the page number moves to the left, the footer text to the right.
  assert.match(html, /@bottom-left \{ content: counter\(page\)/);
  assert.match(html, /@bottom-right \{ content: "Footer"/);
  assert.match(html, /text-align: start/);
  assert.match(html, /\[dir="rtl"\] \{ letter-spacing: 0/);
  assert.doesNotMatch(html, /padding-left: 1\.6em|border-left: 3px/);
});

test('an Arabic report exports to Word with bidirectional paragraphs, complex-script fonts and sizes, and Arabic labels', async () => {
  const report = sampleReport();
  report.brief.details.language = 'Arabic';
  report.brief.details.title = AR_TITLE;
  report.content.content.push(
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: AR_TITLE }] },
    { type: 'paragraph', content: [{ type: 'text', text: `${AR_HELLO}.` }, { type: 'text', text: ' 2024', marks: [{ type: 'bold' }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Plain English paragraph.' }] },
    { type: 'caption', attrs: { kind: 'table' }, content: [{ type: 'text', text: AR_TITLE }] },
  );
  const zip = await JSZip.loadAsync(Buffer.from(await docxExport.docxBase64(report), 'base64'));
  const documentXml = await zip.file('word/document.xml').async('string');
  const styles = await zip.file('word/styles.xml').async('string');
  assert.match(documentXml, /<w:bidi\/>|<w:bidi w:val="1"\/>|<w:bidi w:val="true"\/>/, 'a right-to-left paragraph');
  assert.match(documentXml, /<w:rtl\/>|<w:rtl w:val="1"\/>|<w:rtl w:val="true"\/>/, 'right-to-left runs');
  assert.match(documentXml, /w:cs="Times New Roman"|w:cs="Segoe UI"/, 'a complex-script face for Arabic runs');
  assert.match(documentXml, /<w:szCs w:val="\d+"\/>/, 'complex-script sizes');
  assert.match(styles, /<w:lang [^>]*w:bidi="ar-SA"/);
  assert.match(documentXml, new RegExp(labels.docLabels('Arabic').table));
  // The English paragraph is explicitly left to right (w:bidi off).
  assert.match(documentXml, /<w:bidi w:val="(0|false)"\/>/);
});

test('lint and style rules understand Arabic', () => {
  const stock = 'من الجدير بالذكر أن النظام يعمل بكفاءة. علاوة على ذلك، يوفر الماء. في الواقع، الأمر بسيط.';
  const result = humanizer.lintText(stock);
  assert.ok(result.words >= 10, `counted ${result.words} words`);
  assert.ok(result.sentences >= 3, `found ${result.sentences} sentences`);
  assert.ok(result.issues.some((issue) => issue.kind === 'phrase'));
  assert.ok(result.issues.some((issue) => issue.kind === 'transition'));
  const marked = result.issues.find((issue) => issue.kind === 'phrase');
  assert.equal(stock.slice(marked.start, marked.end).includes('الجدير'), true, 'offsets point at the Arabic phrase');
  // A question mark of the language ends a sentence.
  assert.equal(humanizer.lintText('هل يعمل النظام؟ نعم يعمل جيدا.').sentences, 2);

  const voice = { tone: 'professional', readingLevel: 'college', person: 'auto', spelling: 'us' };
  const english = humanizer.buildStyleRules(humanizer.defaultHumanizer(), voice, 'English');
  const arabicRules = humanizer.buildStyleRules(humanizer.defaultHumanizer(), voice, 'Arabic');
  assert.match(english, /American English/);
  assert.match(english, /Moreover/);
  assert.doesNotMatch(arabicRules, /American English|contractions|Moreover|delve/);
  assert.match(arabicRules, /علاوة على ذلك/);
});

test('prompts for an Arabic report carry the writing rules and know Arabic section titles', () => {
  const brief = documentModule.createBrief('research-paper');
  brief.details.language = 'Arabic';
  brief.details.title = AR_TITLE;
  const outline = [
    { id: 's1', title: 'المقدمة', notes: '', targetWords: 300, subsections: [] },
    { id: 's2', title: 'المراجع', notes: '', targetWords: 100, subsections: [], unnumbered: true },
  ];
  const section = prompts.buildSectionPrompt({ brief, outline, index: 0, written: [], sources: '', references: [] });
  assert.match(section.prompt, /Write the entire report in: Arabic/);
  assert.match(section.prompt, /Modern Standard Arabic/);
  assert.match(section.prompt, /Western digits/);
  assert.doesNotMatch(section.prompt, /American English/);
  const refs = prompts.buildSectionPrompt({ brief, outline, index: 1, written: [], sources: '', references: [{ id: 'r', key: 'k', authors: 'A', year: '2020', title: 'T', source: '', url: '' }] });
  assert.match(refs.prompt, /\[\[BIBLIOGRAPHY\]\]/, 'the Arabic references section gets the bibliography block');
  const english = documentModule.createBrief('research-paper');
  const englishPrompt = prompts.buildSectionPrompt({ brief: english, outline: [{ id: 'a', title: 'Intro', notes: '', targetWords: 100, subsections: [] }], index: 0, written: [], sources: '', references: [] });
  assert.doesNotMatch(englishPrompt.prompt, /LANGUAGE — the report is written in/);
  assert.equal(labels.isFrontBackTitle('الملخص التنفيذي'), true);
  assert.equal(labels.isFrontBackTitle('المقدمة'), false);
  assert.equal(labels.startsFrontBack('ملحق أ'), true);
  const parsed = prompts.parseOutline(JSON.stringify({ sections: [{ title: 'ملخص' }, { title: 'المقدمة' }, { title: 'المراجع' }] }), 1000);
  assert.deepEqual(parsed.map((entry) => entry.unnumbered), [true, false, true]);
});

test('Arabic captions, placeholders, citation keys, names and file names', () => {
  const blocks = markdown.parseBlocks('جدول: النتائج حسب الربع\n| الربع | النمو |\n| --- | --- |\n| الأول | 12% |\n\n[شكل: مخطط الحساسات]\n\n[صورة: irrigation field | حقل مروي]');
  assert.deepEqual(blocks.map((block) => block.type).slice(0, 3), ['caption', 'table', 'figure']);
  assert.equal(blocks[2].attrs.caption, 'مخطط الحساسات');
  assert.equal(blocks.find((block) => block.attrs?.query)?.attrs.caption, 'حقل مروي');

  const nodes = markdown.parseInline('كما ذكر [@محمد2020; @سالم2021, ص. 4] هنا.');
  const citation = nodes.find((node) => node.type === 'citation');
  assert.deepEqual(citation.attrs.keys, ['محمد2020', 'سالم2021']);
  assert.equal(citation.attrs.locator, 'ص. 4');

  const taken = new Set();
  const ref = { authors: 'أحمد بن سالم', year: '٢٠٢٠', title: 'الري الذكي' };
  assert.equal(citations.makeCitationKey(ref, taken), 'سالم2020');
  assert.deepEqual(citations.splitAuthors('أحمد سالم و خالد عمر؛ ليلى حسن'), ['أحمد سالم', 'خالد عمر', 'ليلى حسن']);
  const full = { id: 'a', key: 'k', authors: 'أحمد سالم و خالد عمر', year: '2020', title: 'الري الذكي', source: 'مجلة الزراعة', url: '' };
  assert.equal(citations.formatInText([full], 'apa'), '(سالم وعمر، 2020)');
  assert.match(citations.formatReference(full, 'apa'), /^سالم، أحمد و/);
  const list = citations.parseReferenceList('أحمد سالم (٢٠٢٠). الري الذكي. مجلة الزراعة.');
  assert.equal(list[0].year, '2020');

  assert.equal(documentModule.slugify('نظام الري الذكي: دراسة حالة'), 'نظام-الري-الذكي-دراسة-حالة');
  assert.equal(documentModule.slugify('Smart Irrigation'), 'smart-irrigation');
});
