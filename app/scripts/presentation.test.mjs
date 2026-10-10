import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';

// The presentation utilities import each other and the writing helpers, so
// transpile both folders into node_modules/.cache (where bare imports such as
// `jszip` still resolve) and load them from there. The .pptx code uses the
// global DOMParser, which @xmldom/xmldom provides here.
globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;

const outRoot = new URL('../node_modules/.cache/presentation-test/', import.meta.url);
for (const folder of ['writing', 'presentation']) {
  const sourceDir = new URL(`../src/utils/${folder}/`, import.meta.url);
  const outDir = new URL(`${folder}/`, outRoot);
  await mkdir(outDir, { recursive: true });
  for (const file of await readdir(sourceDir)) {
    if (!file.endsWith('.ts')) continue;
    const source = await readFile(new URL(file, sourceDir), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
    });
    const rewritten = outputText.replace(/(from\s+['"])(\.{1,2}\/[\w/-]+)(['"])/g, '$1$2.mjs$3');
    await writeFile(new URL(file.replace(/\.ts$/, '.mjs'), outDir), rewritten);
  }
}
const load = (name) => import(pathToFileURL(new URL(`presentation/${name}.mjs`, outRoot).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href);

const layouts = await load('layouts');
const deckModule = await load('deck');
const sanitize = await load('sanitize');
const prompts = await load('prompts');
const render = await load('render');
const chartSvg = await load('chartSvg');
const printHtml = await load('printHtml');
const themes = await load('themes');
const richText = await load('richText');
const pkgModule = await load('pptxPackage');
const preserve = await load('pptxPreserve');
const toDeck = await load('pptxToDeck');

const { createDeck, createBrief, parseDeck, serializeDeck, deckPath, slideTitle } = deckModule;
const { sanitizeSlide, changeLayout, emptySlide, slideToAi } = sanitize;

// Deck file -----------------------------------------------------------------

test('parseDeck round-trips a deck', () => {
  const deck = createDeck({ title: 'Quarterly review', brief: createBrief(), slides: [emptySlide('title'), emptySlide('chart'), emptySlide('stats')] });
  const again = parseDeck(serializeDeck(deck));
  assert.equal(again.meta.title, 'Quarterly review');
  assert.equal(again.slides.length, 3);
  assert.deepEqual(again.slides.map((slide) => slide.layout), ['title', 'chart', 'stats']);
  assert.deepEqual(again.slides[1].slots.chart, deck.slides[1].slots.chart);
  assert.equal(again.theme.id, deck.theme.id);
});

test('parseDeck repairs bad slides, layouts, ids and themes', () => {
  const text = JSON.stringify({
    format: 'yzdeck',
    version: 1,
    meta: { title: 'Broken' },
    theme: { id: 'midnight', palette: { accent1: 'not-a-colour', text: '#ABC' }, titleSize: 400 },
    slides: [
      { id: 'a', layout: 'Big Numbers', slots: { stats: { type: 'stats', items: [{ value: '10%', label: 'up' }] }, bogus: { type: 'text', items: ['x'] } } },
      { id: 'a', layout: 'bullets', slots: { body: { type: 'chart', kind: 'pie' } } },
      'garbage',
      { layout: 'nonsense', slots: { title: { type: 'text', items: [{ runs: [{ text: 'Hi', bold: 1, color: 'red' }] }] } }, fit: { title: 0.8, body: 7 } },
    ],
  });
  const deck = parseDeck(text);
  assert.equal(deck.slides.length, 3);
  assert.equal(deck.slides[0].layout, 'stats');
  assert.equal(deck.slides[0].slots.bogus, undefined);
  assert.notEqual(deck.slides[1].id, deck.slides[0].id, 'duplicate ids are replaced');
  assert.equal(deck.slides[1].slots.body, undefined, 'a block the slot does not accept is dropped');
  assert.equal(deck.slides[2].layout, 'bullets');
  assert.deepEqual(deck.slides[2].slots.title.items[0].runs, [{ text: 'Hi', bold: true }]);
  assert.deepEqual(deck.slides[2].fit, { title: 0.8 });
  assert.equal(deck.theme.palette.text, '#aabbcc');
  assert.equal(deck.theme.palette.accent1, themes.getTheme('midnight').palette.accent1);
  assert.equal(deck.theme.titleSize, 54);
  assert.throws(() => parseDeck('{"format":"yzdoc","version":1}'), /not a YzPzCode presentation/);
  assert.throws(() => parseDeck('nope'), /not JSON/);
});

test('deckPath slugs the title and avoids taken names', () => {
  const first = deckPath('C:\\work', 'Q3 Board Update!');
  assert.equal(first, 'C:\\work\\Presentations\\q3-board-update\\q3-board-update.yzdeck');
  assert.equal(deckPath('/w', 'Q3 Board Update', new Set([first.toLowerCase(), '/w/presentations/q3-board-update/q3-board-update.yzdeck'])), '/w/Presentations/q3-board-update-2/q3-board-update-2.yzdeck');
  assert.match(deckPath('/w', '!!!'), /presentation\.yzdeck$/);
});

// Layouts ---------------------------------------------------------------------

test('every layout slot stays inside the slide in both sizes', () => {
  for (const size of ['16:9', '4:3']) {
    const width = layouts.slideWidth(size);
    for (const layout of layouts.LAYOUTS) {
      for (const slot of layouts.layoutSlots(layout.id, size)) {
        const { x, y, w, h } = slot.rect;
        assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0, `${layout.id}.${slot.name} has a positive size`);
        assert.ok(x + w <= width + 0.001, `${layout.id}.${slot.name} fits the width (${size})`);
        assert.ok(y + h <= layouts.SLIDE_HEIGHT + 0.001, `${layout.id}.${slot.name} fits the height (${size})`);
      }
    }
  }
  assert.equal(layouts.LAYOUTS.length, 15);
});

test('nearestLayout maps synonyms', () => {
  assert.equal(layouts.nearestLayout('kpi-numbers'), 'stats');
  assert.equal(layouts.nearestLayout('Roadmap'), 'timeline');
  assert.equal(layouts.nearestLayout('pros and cons'), 'comparison');
  assert.equal(layouts.nearestLayout('photo'), 'full-image');
  assert.equal(layouts.nearestLayout('thank-you'), 'closing');
  assert.equal(layouts.nearestLayout('???', 'agenda'), 'agenda');
});

// AI JSON → slides --------------------------------------------------------------

test('sanitizeSlide maps unknown layouts and clamps text to the budget', () => {
  const longBullet = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
  const [slide] = sanitizeSlide({ layout: 'list-of-points', title: 'Growth', bullets: [longBullet, '**Key** point'] });
  assert.equal(slide.layout, 'bullets');
  const items = slide.slots.body.items;
  assert.ok(richText.wordCount(richText.runsText(items[0].runs)) <= 18, 'long bullet is cut');
  assert.ok(richText.runsText(items[0].runs).endsWith('…'));
  assert.deepEqual(items[1].runs, [{ text: 'Key', bold: true }, { text: ' point' }]);
});

test('sanitizeSlide continues overflowing bullets on a new slide', () => {
  const slides = sanitizeSlide({ layout: 'bullets', title: 'Ten reasons', bullets: Array.from({ length: 10 }, (_, index) => `Reason ${index + 1}`) });
  assert.equal(slides.length, 2);
  assert.equal(slides[0].slots.body.items.length, 5);
  assert.equal(slides[1].slots.body.items.length, 5);
  assert.equal(slideTitle(slides[1]), 'Ten reasons (continued)');
  assert.notEqual(slides[0].id, slides[1].id);
});

test('sanitizeSlide downgrades layouts whose content is missing and infers layouts', () => {
  assert.equal(sanitizeSlide({ layout: 'chart', title: 'No data', bullets: ['a', 'b'] })[0].layout, 'bullets');
  assert.equal(sanitizeSlide({ layout: 'stats', title: 'One stat', stats: [{ value: '1', label: 'x' }], bullets: ['a'] })[0].layout, 'bullets');
  assert.equal(sanitizeSlide({ title: 'Inferred', stats: [{ value: '1', label: 'a' }, { value: '2', label: 'b' }] }, { index: 3 })[0].layout, 'stats');
  const [chart] = sanitizeSlide({ layout: 'chart', title: 'Revenue', chart: { kind: 'horizontal bar', categories: ['a', 'b', 'c'], series: [{ name: 'Rev', values: ['$1.5M', 2] }] }, takeaway: 'Up' });
  assert.equal(chart.layout, 'chart');
  assert.equal(chart.slots.chart.kind, 'bar');
  assert.deepEqual(chart.slots.chart.series[0].values, [1.5, 2, 0]);
  const [missing] = sanitizeSlide({ layout: 'image-right' });
  assert.equal(missing.slots.image.type, 'image', 'image slots get a placeholder');
  assert.equal(missing.slots.title, undefined);
  const [quote] = sanitizeSlide({ layout: 'quote', quote: { text: '“Ship it.”', attribution: 'A. Person' } });
  assert.equal(quote.slots.quote.text, 'Ship it.');
  assert.equal(richText.blockText(quote.slots.attribution), 'A. Person');
  const [imported] = sanitizeSlide({ layout: 'bullets', title: 'x', bullets: [Array.from({ length: 30 }, () => 'w').join(' ')] }, { clamp: false });
  assert.equal(richText.wordCount(richText.runsText(imported.slots.body.items[0].runs)), 30, 'imports keep every word');
});

test('changeLayout moves content between layouts', () => {
  const [slide] = sanitizeSlide({ layout: 'bullets', title: 'Plan', bullets: ['Q1: Discover', 'Q2: Build', 'Q3: Launch'], notes: 'n' });
  const timeline = changeLayout(slide, 'timeline');
  assert.equal(timeline.layout, 'timeline');
  assert.equal(timeline.id, slide.id);
  assert.equal(timeline.notes, 'n');
  assert.deepEqual(timeline.slots.steps.items.map((step) => step.title), ['Q1', 'Q2', 'Q3']);
  const columns = changeLayout(slide, 'two-column');
  assert.equal(columns.slots.left.items.length + columns.slots.right.items.length, 3);
  const back = slideToAi(columns);
  assert.equal(back.title, 'Plan');
});

// Prompts and parsing -----------------------------------------------------------

test('extractJson reads fenced and bare JSON', () => {
  assert.deepEqual(prompts.extractJson('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(prompts.extractJson('prefix {"slides":[{"title":"x"}]} suffix'), { slides: [{ title: 'x' }] });
  assert.equal(prompts.extractJson('no json here'), null);
});

test('parseOutline reads JSON and falls back to a numbered list', () => {
  const json = prompts.parseOutline('{"title":"Deck","slides":[{"title":"Open","layout":"cover","keyPoints":["a"]},{"title":"Data","layout":"graph","purpose":"p"}]}');
  assert.equal(json.title, 'Deck');
  assert.deepEqual(json.slides.map((slide) => slide.layout), ['title', 'chart']);
  assert.deepEqual(json.slides[0].keyPoints, ['a']);
  const list = prompts.parseOutline('1. Welcome\n2. **The problem**\n3. Our answer\n4. Thanks');
  assert.deepEqual(list.slides.map((slide) => slide.title), ['Welcome', 'The problem', 'Our answer', 'Thanks']);
  assert.equal(list.slides[3].layout, 'closing');
  assert.equal(prompts.parseOutline('nothing useful'), null);
});

test('extractSlideObjects returns the complete slides of a streaming reply', () => {
  const partial = '{"slides":[{"layout":"bullets","title":"A {brace} \\"quoted\\"","bullets":["x"]},{"layout":"stats","title":"B","stats":[{"value":"1"';
  const done = prompts.extractSlideObjects(partial);
  assert.equal(done.length, 1);
  assert.equal(done[0].title, 'A {brace} "quoted"');
  assert.equal(prompts.parseSlides(`${partial},"label":"x"}]}]}`).length, 2);
});

test('the slide prompt lists every layout and the requested batch', () => {
  const brief = { ...createBrief(), topic: 'Solar adoption', language: 'French' };
  const outline = [{ id: '1', title: 'Opening', purpose: '', layout: 'title', keyPoints: [] }, { id: '2', title: 'Costs fell 80%', purpose: 'Show the trend', layout: 'chart', keyPoints: ['2010: $4/W', '2024: $0.8/W'] }];
  const { system, prompt } = prompts.buildSlidesPrompt({ brief, title: 'Solar', outline, batch: [1], sources: '' });
  assert.match(system, /takeaway/);
  for (const layout of layouts.LAYOUTS) assert.ok(prompt.includes(`- ${layout.id}:`), layout.id);
  assert.match(prompt, /Slide 2 — layout "chart": Costs fell 80%/);
  assert.match(prompt, /in: French/);
  const edit = prompts.buildSlideEditPrompt({ brief, title: 'Solar', action: 'translate', slides: [{ title: 'x' }], positions: [2], total: 5, instruction: 'Spanish' });
  assert.match(edit.prompt, /Language: Spanish/);
});

// Rendering -----------------------------------------------------------------------

test('the render plan keeps elements on the slide and the print HTML sets the page size', () => {
  const deck = createDeck({ title: 'T', brief: createBrief(), slides: layouts.LAYOUTS.map((layout) => emptySlide(layout.id)) });
  for (const theme of themes.DECK_THEMES) {
    for (const [index, slide] of deck.slides.entries()) {
      const plan = render.planSlide({ theme, size: '16:9', showNumbers: true }, slide, index);
      for (const el of plan.elements) {
        if (el.kind === 'shape' && (el.shape === 'ellipse')) continue; // decorative circles bleed off the edge on purpose
        assert.ok(el.rect.x >= -1.2 && el.rect.x + el.rect.w <= plan.width + 0.01, `${theme.id}/${slide.layout}/${el.kind} x`);
      }
    }
  }
  const chart = render.planSlide({ theme: deck.theme, size: '16:9', showNumbers: true }, emptySlide('chart')).elements.find((el) => el.kind === 'chart');
  assert.match(chartSvg.chartSvg(chart), /^<svg[\s\S]*<rect[\s\S]*<\/svg>$/);
  const html = printHtml.buildDeckPrintHtml({ theme: deck.theme, size: '16:9', showNumbers: true, title: 'T' }, deck.slides, { images: {}, icons: {} });
  assert.match(html, /@page \{ size: 13\.333in 7\.5in; margin: 0; \}/);
  assert.equal((html.match(/<section class="slide"/g) ?? []).length, deck.slides.length);
  const square = printHtml.buildDeckPrintHtml({ theme: deck.theme, size: '4:3', showNumbers: true, title: 'T' }, [{ ...deck.slides[0], hidden: true }, deck.slides[1]], { images: {}, icons: {} });
  assert.match(square, /size: 10in 7\.5in/);
  assert.equal((square.match(/<section class="slide"/g) ?? []).length, 1, 'hidden slides are left out');
});

test('niceScale rounds the axis', () => {
  assert.deepEqual(chartSvg.niceScale(87), { max: 100, step: 25 });
  assert.deepEqual(chartSvg.niceScale(0), { max: 1, step: 0.25 });
});

// .pptx: keep original design -----------------------------------------------------

async function fixturePptx() {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const one = pptx.addSlide();
  one.addText([{ text: 'Original title', options: { bold: true, color: 'C2410C', fontFace: 'Georgia' } }], { x: 1, y: 1, w: 8, h: 1, fontSize: 32 });
  one.addText([
    { text: 'First point', options: { bullet: true, breakLine: true } },
    { text: 'Second point', options: { bullet: true, color: '1F4E9E' } },
  ], { x: 1, y: 2.5, w: 8, h: 3, fontSize: 20 });
  one.addNotes('Original notes');
  const two = pptx.addSlide();
  two.addText('Slide two', { x: 1, y: 1, w: 8, h: 1, fontSize: 28 });
  two.addChart(pptx.ChartType.bar, [{ name: 'Revenue', labels: ['2023', '2024'], values: [3, 5] }], { x: 1, y: 2, w: 6, h: 4 });
  const three = pptx.addSlide();
  three.addText('Slide three', { x: 1, y: 1, w: 8, h: 1, fontSize: 28 });
  return new Uint8Array(await pptx.write({ outputType: 'uint8array' }));
}

test('reads slides, shapes and notes from a .pptx', async () => {
  const pkg = await pkgModule.openPptx(await fixturePptx());
  assert.equal(pkg.slides.length, 3);
  assert.ok(Math.abs(pkg.width - 13.333) < 0.01);
  const info = await preserve.readPreserveInfo(pkg);
  const first = info[pkg.slides[0].part];
  assert.equal(first.title, 'Original title');
  assert.equal(first.notes, 'Original notes');
  assert.deepEqual(first.shapes[1].paragraphs, ['First point', 'Second point']);
});

test('applyPreserve patches text, keeps run formatting, reorders, duplicates, hides and deletes', async () => {
  const bytes = await fixturePptx();
  const pkg = await pkgModule.openPptx(bytes);
  const info = await preserve.readPreserveInfo(pkg);
  const [s1, s2, s3] = pkg.slides.map((slide) => slide.part);
  const titleShape = info[s1].shapes[0].id;
  const bodyShape = info[s1].shapes[1].id;
  const slides = [
    { key: s2, source: s2, hidden: true, text: {} },
    { key: s1, source: s1, hidden: false, text: { [titleShape]: ['New & improved <title>'], [bodyShape]: ['Only point', 'Added point', 'Third\nwith a break'] }, notes: 'New notes' },
    { key: 'dup:1', source: s1, hidden: false, text: {} },
    { key: 'dup:2', source: s2, hidden: false, text: {} },
  ];
  // s3 is left out: deleted.
  const out = await preserve.applyPreserve(bytes, slides);
  const again = await pkgModule.openPptx(out);
  assert.equal(again.slides.length, 4);
  assert.equal(again.slides[0].part, s2);
  assert.equal(again.slides[0].hidden, true);
  assert.equal(again.slides[1].part, s1);
  assert.ok(!again.zip.file(s3), 'the deleted slide part is gone');
  const types = await again.zip.file('[Content_Types].xml').async('string');
  assert.ok(!types.includes(`/${s3}"`), 'and its content type');

  const infoAgain = await preserve.readPreserveInfo(again);
  const edited = infoAgain[s1];
  assert.equal(edited.title, 'New & improved <title>');
  assert.deepEqual(edited.shapes[1].paragraphs, ['Only point', 'Added point', 'Third\nwith a break']);
  assert.equal(edited.notes, 'New notes');

  const xml = await again.zip.file(s1).async('string');
  assert.match(xml, /<a:rPr[^>]*b="1"[\s\S]*?<a:srgbClr val="C2410C"\/>[\s\S]*?New &amp; improved &lt;title&gt;/, 'the title keeps its bold, colour and escapes text');
  assert.match(xml, /<a:latin typeface="Georgia"/);
  assert.match(xml, /<a:buChar|<a:buAutoNum|<a:buFont/, 'bullets keep their paragraph properties');

  // Copies: their own parts, notes and chart, pointing at each other.
  const copyOfOne = again.slides[2];
  assert.notEqual(copyOfOne.part, s1);
  assert.ok(copyOfOne.notesPart && copyOfOne.notesPart !== again.slides[1].notesPart, 'a copied slide gets its own notes slide');
  assert.equal(infoAgain[copyOfOne.part].notes, 'Original notes');
  const notesRels = await again.zip.file(pkgModule.relsPathFor(copyOfOne.notesPart)).async('string');
  assert.ok(notesRels.includes(copyOfOne.part.split('/').pop()), 'the copied notes point back at the copy');
  const copyOfTwoRels = await pkgModule.readRels(again.zip, again.slides[3].part);
  const originalTwoRels = await pkgModule.readRels(again.zip, s2);
  const chartOf = (rels) => rels.find((rel) => rel.type === pkgModule.REL_TYPES.chart)?.target;
  assert.ok(chartOf(copyOfTwoRels) && chartOf(copyOfTwoRels) !== chartOf(originalTwoRels), 'a copied chart slide gets its own chart part');
  assert.ok(again.zip.file(chartOf(copyOfTwoRels)));

  // The sldId list is unique and the result re-zips cleanly.
  const presentation = await again.zip.file('ppt/presentation.xml').async('string');
  const ids = [...presentation.matchAll(/<p:sldId [^>]*id="(\d+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, 4);
  const rezipped = await JSZip.loadAsync(await again.zip.generateAsync({ type: 'uint8array' }));
  assert.ok(rezipped.file('ppt/presentation.xml'));
});

test('applyPreserve creates a notes slide when a slide has none', async () => {
  const bytes = await fixturePptx();
  const pkg = await pkgModule.openPptx(bytes);
  const third = pkg.slides[2];
  const before = await preserve.readPreserveInfo(pkg);
  assert.equal(before[third.part].notesEditable, true);
  const out = await preserve.applyPreserve(bytes, pkg.slides.map((slide) => ({ key: slide.part, source: slide.part, hidden: false, text: {}, ...(slide === third ? { notes: 'Fresh notes' } : {}) })));
  const again = await pkgModule.openPptx(out);
  const info = await preserve.readPreserveInfo(again);
  assert.equal(info[third.part].notes, 'Fresh notes');
});

// .pptx: rebuild in a theme ---------------------------------------------------------

test('pptxToDeck maps slides to layouts and keeps charts', async () => {
  const imported = await toDeck.pptxToDeck(await fixturePptx(), 'Fixture');
  assert.equal(imported.size, '16:9');
  assert.equal(imported.slides[0].layout, 'title');
  assert.equal(slideTitle(imported.slides[0]), 'Original title');
  assert.equal(imported.slides[0].notes, 'Original notes');
  assert.equal(imported.slides[1].layout, 'chart');
  assert.deepEqual(imported.slides[1].slots.chart.series[0].values, [3, 5]);
  assert.deepEqual(imported.slides[1].slots.chart.categories, ['2023', '2024']);
  assert.equal(imported.slides[2].layout, 'section');
  assert.ok(imported.theme.palette.accent1.startsWith('#'));
});

test('themeFromScheme derives a readable theme', () => {
  const theme = themes.themeFromScheme({ dk1: '#000000', lt1: '#FFFFFF', accents: ['#0F6CBD', '#00A3AD', '#F2C14E'], majorFont: 'Aptos Display', minorFont: 'Aptos' });
  assert.equal(theme.palette.accent1, '#0f6cbd');
  assert.equal(theme.headingFont, 'Aptos Display');
  assert.ok(themes.contrastRatio(theme.palette.onAccent, theme.palette.accent1) >= 3);
});

// Phase 3 ---------------------------------------------------------------------------

const timing = await load('timing');
const templates = await load('templates');
const htmlDeck = await load('htmlDeck');
const imagePrompt = await load('imagePrompt');

test('speaking time comes from the notes, or the slide text when there are none', () => {
  const [slide] = sanitizeSlide({ layout: 'bullets', title: 'T', bullets: ['a b c', 'd e f'] });
  const words = Array.from({ length: 280 }, () => 'word').join(' ');
  assert.equal(timing.slideSeconds({ ...slide, notes: words }), 120);
  assert.equal(timing.slideSeconds({ ...slide, notes: 'short' }), 12, 'a floor per slide');
  assert.equal(timing.slideSeconds({ ...slide, hidden: true, notes: words }), 0);
  assert.ok(timing.slideSeconds(slide) >= 12);
  assert.equal(timing.formatDuration(65), '1:05');
  assert.equal(timing.formatDuration(3720), '1:02:00');
  assert.equal(timing.notesBudget([slide, slide], 10), 700);
});

test('templates keep layouts and text, drop pictures, and start decks with fresh ids', () => {
  const [picture] = sanitizeSlide({ layout: 'image-right', title: 'Photo', bullets: ['x'] });
  picture.slots.image = { type: 'image', src: 'assets/a.png', fit: 'cover', alt: 'A team', credit: 'Photo: Ann / Unsplash', prompt: 'p' };
  picture.fit = { title: 0.8 };
  const deck = createDeck({ title: 'Board update', brief: createBrief(), slides: [emptySlide('title'), picture] });
  const template = templates.templateFromDeck(deck, ' Quarterly ', 'For boards');
  assert.equal(template.name, 'Quarterly');
  assert.equal(template.slides[1].slots.image.src, '');
  assert.equal(template.slides[1].slots.image.alt, 'A team');
  assert.equal(template.slides[1].slots.image.credit, undefined);
  assert.equal(template.slides[1].fit, undefined);
  assert.equal(deck.slides[1].slots.image.src, 'assets/a.png', 'the deck itself is untouched');
  const slides = templates.slidesFromTemplate(template);
  assert.notEqual(slides[0].id, template.slides[0].id);
  assert.deepEqual(templates.outlineFromTemplate(template).map((item) => item.layout), ['title', 'image-right']);
  const again = templates.parseTemplateFile(templates.serializeTemplate(template));
  assert.equal(again.slides.length, 2);
  assert.notEqual(again.id, template.id, 'imports get a new id');
  assert.throws(() => templates.parseTemplateFile('{"format":"yzpz-deck-template","template":{"name":"x","slides":[]}}'), /not a YzPzCode deck template/);
});

test('theme files round-trip and reject other JSON', () => {
  const theme = { ...themes.getTheme('ocean'), id: 'theme-x', name: 'Sea' };
  const parsed = templates.parseThemeFile(templates.serializeTheme(theme));
  assert.equal(parsed.name, 'Sea');
  assert.deepEqual(parsed.palette, theme.palette);
  assert.notEqual(parsed.id, 'theme-x');
  assert.equal(templates.parseThemeFile(JSON.stringify(theme)).name, 'Sea', 'a bare theme object works too');
  assert.throws(() => templates.parseThemeFile('{"a":1}'), /not a YzPzCode deck theme/);
  assert.throws(() => templates.parseThemeFile('nope'), /not JSON/);
});

test('the standalone HTML deck has one frame per visible slide and the deck transition', () => {
  const slides = [emptySlide('title'), { ...emptySlide('bullets'), hidden: true }, emptySlide('closing')];
  const context = { theme: themes.getTheme('midnight'), size: '16:9', showNumbers: true, title: 'Talk <1>', transition: 'slide' };
  const html = htmlDeck.buildStandaloneDeckHtml(context, slides, { images: {}, icons: {} });
  assert.equal((html.match(/<div class="frame"/g) ?? []).length, 2);
  assert.match(html, /<title>Talk &lt;1&gt;<\/title>/);
  assert.match(html, /translate: -100vw 0/);
  assert.match(html, /data-w="1280" data-h="720"/);
  assert.doesNotMatch(html, /<script src=/, 'no external scripts');
});

test('pictures survive layout changes and carry their credit onto the slide', () => {
  const [slide] = sanitizeSlide({ layout: 'image-left', title: 'Field work', bullets: ['a'] });
  slide.slots.image = { type: 'image', src: 'assets/field.jpg', fit: 'cover', alt: 'Field', credit: 'Photo: Bo / Pexels' };
  const moved = changeLayout(slide, 'full-image');
  assert.equal(moved.slots.image.src, 'assets/field.jpg');
  assert.equal(moved.slots.image.credit, 'Photo: Bo / Pexels');
  const plan = render.planSlide({ theme: themes.getTheme('executive'), size: '16:9', showNumbers: false }, moved, 0);
  assert.ok(plan.elements.some((el) => el.kind === 'text' && el.paras[0]?.runs[0]?.text === 'Photo: Bo / Pexels'));
  const stored = deckModule.parseDeck(serializeDeck(createDeck({ title: 'x', brief: createBrief(), slides: [moved] })));
  assert.equal(stored.slides[0].slots.image.credit, 'Photo: Bo / Pexels');
  assert.equal(stored.transition, 'fade', 'decks default to a fade');
});

test('deck passes and local image prompts', () => {
  assert.deepEqual(prompts.DECK_PASSES.map((pass) => pass.id), ['consistency', 'coach', 'imagePrompts']);
  const brief = createBrief();
  const coach = prompts.buildSlideEditPrompt({ brief, title: 'T', action: 'coach', slides: [{ title: 'x', notes: 'n' }], positions: [1], total: 1, instruction: 'Target talk length: 5 minutes' });
  assert.match(coach.prompt, /speaker notes/);
  assert.match(coach.prompt, /Additional instruction: Target talk length: 5 minutes/);
  const consistency = prompts.buildSlideEditPrompt({ brief, title: 'T', action: 'consistency', slides: [{ title: 'x' }, { title: 'y' }], positions: [1, 2], total: 2 });
  assert.match(consistency.prompt, /exactly 2 slide objects/);
  const text = imagePrompt.localImagePrompt('a wind farm at dawn', 'Wind now beats coal on cost', themes.getTheme('nature'));
  assert.match(text, /wind farm at dawn/);
  assert.match(text, /No text, no logos/);
  assert.match(text, /green/);
  assert.equal(imagePrompt.colourName('#1f4e9e'), 'blue');
  assert.equal(imagePrompt.colourName('#14213d'), 'navy');
});

// AI-designed decks (SVG slides, after ppt-master) -----------------------------

const svgSafe = await load('svgSafe');
const svgText = await load('svgText');
const designPrompts = await load('designPrompts');
const designColors = await load('designColors');
const designStyles = await load('designStyles');
const svgPptx = await load('svgPptx');
const svgDeckExport = await load('svgDeckExport');

const CANVAS = { width: 1280, height: 720 };

test('slide SVG from the AI is repaired and stripped of anything executable', () => {
  const raw = '```svg\n<svg viewBox="0 0 1280 720" width="1280" height="720" onload="alert(1)">'
    + '<script>alert(1)</script><style>rect{fill:red}</style>'
    + '<foreignObject><div>x</div></foreignObject>'
    + '<defs><linearGradient id="g"><stop offset="0" stop-color="#112233"/></linearGradient></defs>'
    + '<rect width="10" height="10" fill="url(#g)" onclick="x()" class="a" style="fill:url(https://evil/x);stroke:#000"/>'
    + '<a href="javascript:alert(1)"><text x="1" y="2">R&D &mdash; 5 &lt; 6</text></a>'
    + '<image href="https://evil.example/p.png" width="1" height="1"/>'
    + '<image href="assets/photo.png" width="1" height="1"/>'
    + '</svg>\n```';
  const { svg, width, height } = svgSafe.sanitizeSvg(raw, CANVAS);
  assert.equal(width, 1280);
  assert.equal(height, 720);
  for (const banned of ['script', 'onload', 'onclick', 'foreignObject', '<style', 'class=', 'javascript', 'evil', '<a ']) assert.ok(!svg.includes(banned), `${banned} removed`);
  assert.match(svg, /R&amp;D — 5 &lt; 6/);
  assert.match(svg, /fill="url\(#g\)"/);
  assert.match(svg, /style="stroke:#000"/);
  assert.match(svg, /href="assets\/photo.png"/);
  assert.ok(!/\swidth="1280"/.test(svg), 'the root loses its fixed size');
  assert.throws(() => svgSafe.sanitizeSvg('<svg><rect></svg>', CANVAS), /well-formed/);
  assert.throws(() => svgSafe.sanitizeSvg('no svg here', CANVAS), /no <svg>/);
});

test('display copies scope ids, resolve pictures and index editable targets', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/><clipPath id="c"><circle r="1"/></clipPath></defs><rect fill="url(#g)"/><use href="#g"/><image href="assets/a b.png" clip-path="url(#c)"/><text>A</text><text>B</text></svg>';
  const out = svgSafe.prepareSvgForDisplay(svg, { prefix: 's1', resolveHref: (href) => `media://${href}`, indexTargets: true });
  assert.match(out, /id="s1-g"/);
  assert.match(out, /url\(#s1-g\)/);
  assert.match(out, /href="#s1-g"/);
  assert.match(out, /url\(#s1-c\)/);
  assert.match(out, /href="media:\/\/assets\/a b.png"/);
  assert.match(out, /<text data-ti="0">A/);
  assert.match(out, /<text data-ti="1">B/);
  assert.match(out, /<image data-ii="0"/);
  assert.deepEqual(svgSafe.svgAssetRefs(svg), ['assets/a b.png']);
});

test('slide text is edited in place, line by line', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" font-size="20"><text x="10" y="30" font-weight="bold">Grow <tspan fill="#F00">revenue</tspan> fast<tspan x="10" dy="26">second line</tspan></text><text x="5" y="90"><tspan x="5" dy="0">only</tspan></text><image href="assets/a.png"/></svg>';
  const items = svgText.svgTextItems(svg);
  assert.deepEqual(items[0].lines, ['Grow revenue fast', 'second line']);
  assert.equal(items[0].fontSize, 20);
  assert.equal(items[0].bold, true);
  assert.deepEqual(items[1].lines, ['only']);
  const same = svgText.setSvgText(svg, 0, ['Grow revenue fast', 'changed']);
  assert.match(same, /<tspan fill="#F00">revenue<\/tspan>/, 'unchanged lines keep their runs');
  assert.match(same, /<tspan x="10" dy="26">changed<\/tspan>/);
  const more = svgText.setSvgText(svg, 0, ['One', 'Two', 'Three']);
  assert.deepEqual(svgText.svgTextItems(more)[0].lines, ['One', 'Two', 'Three']);
  assert.match(more, /<tspan x="10" dy="26">Three<\/tspan>/, 'new lines copy the line step');
  assert.deepEqual(svgText.svgTextItems(svgText.setSvgText(svg, 0, ['Just one']))[0].lines, ['Just one']);
  assert.equal(svgText.svgTextItems(svgText.setSvgText(svg, 0, [])).length, 1, 'emptying a text removes it');
  const swapped = svgText.setSvgImage(svg, 0, 'assets/b.png');
  assert.deepEqual(svgText.svgImageItems(swapped).map((item) => item.href), ['assets/b.png']);
  assert.match(svgText.svgPlainText(svg), /Grow revenue fast second line\nonly/);
});

test('art direction replies become a readable design system and a storyline', () => {
  const reply = `Here you go:\n${JSON.stringify({
    title: 'Coffee in 2030',
    language: 'English',
    design: {
      name: 'Roastery Ledger', concept: 'Warm paper and espresso ink.', style: 'editorial', mode: 'narrative',
      palette: { background: '#F4ECDF', surface: '#E9DCC8', text: '#EFE6D8', muted: 'oops', primary: '#5B3A29', secondary: '#C08A5B', accent: '#D9482B' },
      chartColors: ['#5B3A29', 'nope', '#C08A5B'],
      fonts: { heading: "'Georgia', serif", body: 'Comic Neue' },
      type: { display: 400, title: 44, body: 10, caption: 16 },
    },
    pages: [{ role: 'cover', title: 'Coffee is about to get expensive', brief: 'Hook: 50% of land lost', density: 'anchor' }, { role: 'weird', title: 'Supply' }, { title: '' }],
  })}`;
  const result = designPrompts.parseDirection(reply);
  assert.equal(result.title, 'Coffee in 2030');
  assert.equal(result.pages.length, 2);
  assert.equal(result.pages[1].role, 'content');
  assert.equal(result.pages[1].density, 'dense');
  const { system } = result;
  assert.equal(system.fonts.heading, 'Georgia');
  assert.equal(system.fonts.body, designStyles.DEFAULT_BODY_FONT, 'unknown fonts fall back');
  assert.ok(designColors.contrastRatio(system.palette.text, system.palette.background) >= 7, 'unreadable text colour is repaired');
  assert.ok(designColors.contrastRatio(system.palette.muted, system.palette.background) >= 4.5);
  assert.equal(system.type.display, 220);
  assert.equal(system.type.body, 18);
  assert.equal(system.dark, false);
  assert.ok(system.chartColors.length >= 3);
  assert.ok(designPrompts.paletteReadable(system));
  assert.equal(designPrompts.parseDirection('no json at all'), null);
});

test('direction and slide prompts carry the brief, the catalog and the SVG contract', () => {
  const attachments = [{ path: 'assets/logo.png', name: 'logo.png', kind: 'image', use: 'slides', width: 400, height: 200, colors: ['#112233'] }];
  const direction = designPrompts.buildDirectionPrompt({ prompt: 'A pitch for a solar co-op', attachments, sources: 'Fact: 40% cheaper', slideCount: 8, language: 'auto', canvas: CANVAS, seesImages: true });
  assert.match(direction.prompt, /A pitch for a solar co-op/);
  assert.match(direction.prompt, /exactly 8/);
  assert.match(direction.prompt, /assets\/logo.png — 400×200px, dominant colours #112233, must appear on a slide/);
  assert.match(direction.prompt, /Fact: 40% cheaper/);
  assert.match(direction.system, /swiss-minimal/);
  assert.match(direction.system, /Bahnschrift/);
  const restyle = designPrompts.buildDirectionPrompt({ prompt: 'darker', attachments: [], sources: 'x', slideCount: null, language: 'English', canvas: CANVAS, seesImages: false, keepPages: [{ role: 'cover', title: 'T', brief: 'B', density: 'anchor' }], previous: designPrompts.FALLBACK_SYSTEM });
  assert.match(restyle.prompt, /RESTYLE/);
  assert.ok(!restyle.prompt.includes('SOURCE MATERIAL'));
  const pages = [{ role: 'cover', title: 'One', brief: 'b1', density: 'anchor' }, { role: 'content', title: 'Two', brief: 'b2', density: 'dense' }, { role: 'closing', title: 'Three', brief: 'b3', density: 'anchor' }];
  const slides = designPrompts.buildSlidesPrompt({ title: 'Deck', language: 'English', system: designPrompts.FALLBACK_SYSTEM, canvas: CANVAS, pages, draw: [1, 2], attachments, seesImages: false, reference: { number: 1, svg: '<svg>cover</svg>' } });
  assert.match(slides.system, /SVG CONTRACT/);
  assert.match(slides.system, /viewBox="0 0 1280 720"/);
  assert.match(slides.system, /DESIGN CRAFT/);
  assert.match(slides.prompt, /▶ 2\. \[content, dense\] Two\n {5}Brief: b2/);
  assert.match(slides.prompt, /^ {2}1\. \[cover, anchor\] One$/m);
  assert.match(slides.prompt, /<svg>cover<\/svg>/);
  assert.match(slides.prompt, /Draw pages 2, 3 now/);
  const blended = designPrompts.buildSlidesPrompt({ title: 'Deck', language: 'English', system: { ...designPrompts.FALLBACK_SYSTEM, style: 'blend: photo-editorial + zine (full-bleed photos)' }, canvas: CANVAS, pages, draw: [0], attachments: [], seesImages: false });
  assert.match(blended.prompt, /^ {2}photo-editorial: /m, 'every style in a blend is described');
  assert.match(blended.prompt, /^ {2}zine: /m);
  assert.doesNotMatch(blended.prompt, /^ {2}editorial: /m, 'a style id inside another id does not count');
  const refine = designPrompts.buildRefinePrompt({ title: 'Deck', language: 'English', system: designPrompts.FALLBACK_SYSTEM, canvas: CANVAS, pages, index: 0, svg: '<svg>x</svg>', notes: 'n', instruction: 'Make it bolder', attachments: [], seesImages: false });
  assert.match(refine.prompt, /REDRAW PAGE 1\. Instruction from the user: Make it bolder/);
});

test('slide blocks are read while streaming and at the end', () => {
  const one = '<slide n="2" role="content" title="Costs &amp; savings">\n<svg viewBox="0 0 1280 720"><text>a</text></svg>\n<notes>Speaker notes: Say this.</notes>\n</slide>';
  const partial = `${one}\n<slide n="3" role="data" title="Next">\n<svg viewBox="0 0 1280 720"><rect/></svg>\n<notes>Half`;
  const streaming = designPrompts.extractSlideBlocks(partial);
  assert.equal(streaming.length, 1);
  assert.deepEqual({ ...streaming[0], svg: undefined }, { n: 2, role: 'content', title: 'Costs & savings', svg: undefined, notes: 'Say this.' });
  const final = designPrompts.extractSlideBlocks(partial, true);
  assert.equal(final.length, 2);
  assert.equal(final[1].role, 'data');
  assert.equal(final[1].notes, 'Half');
  const bare = designPrompts.extractSlideBlocks('Sure!\n<svg viewBox="0 0 1 1"></svg>', true);
  assert.equal(bare.length, 1);
  assert.equal(designPrompts.titleFromSvg('<svg><text font-size="20">small</text><text font-size="60">Big <tspan>title</tspan></text></svg>'), 'Big title');
});

test('designed decks round-trip through the .yzdeck file, sanitised again on load', () => {
  const system = designPrompts.sanitizeDesignSystem({ palette: { background: '#101820' } });
  assert.equal(system.dark, true);
  const deck = createDeck({
    title: 'Designed',
    brief: createBrief(),
    design: {
      prompt: 'A deck', attachments: [{ path: 'assets/a.png', name: 'a.png', kind: 'image', use: 'style' }], slideCount: 99, language: 'English', system,
      slides: [
        { id: 's1', role: 'cover', title: 'Hello', brief: 'b', density: 'anchor', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><script>bad()</script><text x="1" y="2">Hi</text></svg>', notes: 'n' },
        { id: 's1', role: 'content', title: '', brief: '', density: 'dense', svg: '', notes: '', hidden: true },
      ],
    },
  });
  const again = deckModule.parseDeck(serializeDeck(deck));
  assert.equal(again.design.slides.length, 2);
  assert.notEqual(again.design.slides[0].id, again.design.slides[1].id, 'ids stay unique');
  assert.ok(!again.design.slides[0].svg.includes('script'));
  assert.match(again.design.slides[0].svg, /Hi<\/text>/);
  assert.equal(again.design.slides[1].hidden, true);
  assert.equal(again.design.slideCount, designPrompts.MAX_DESIGN_SLIDES);
  assert.equal(again.design.attachments[0].use, 'style');
  assert.equal(again.design.system.palette.background, '#101820');
  assert.equal(deckModule.parseDeck(serializeDeck(createDeck({ title: 'x', brief: createBrief() }))).design, undefined);
});

test('path data with relative commands and arcs becomes absolute cubic segments', () => {
  const segs = svgPptx.parsePathData('M10 10 h20 v20 l-5 5 q 5 5 10 0 t 10 0 a 10 10 0 0 1 20 0 z');
  assert.deepEqual(segs[0], { op: 'M', p: [10, 10] });
  assert.deepEqual(segs[1], { op: 'L', p: [30, 10] });
  assert.deepEqual(segs[2], { op: 'L', p: [30, 30] });
  assert.deepEqual(segs[3], { op: 'L', p: [25, 35] });
  assert.equal(segs.at(-1).op, 'Z');
  const arcs = segs.filter((seg) => seg.op === 'C');
  const end = arcs.at(-1).p;
  assert.ok(Math.abs(end[4] - 65) < 1e-6 && Math.abs(end[5] - 35) < 1e-6, 'the arc ends where the SVG says');
  assert.ok(arcs.length >= 4);
  assert.equal(svgPptx.primaryFont("'Georgia', serif"), 'Georgia');
  assert.equal(svgPptx.primaryFont('sans-serif'), 'Arial');
});

const SAMPLE_SLIDE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" font-family="'Segoe UI', sans-serif">
<defs>
  <linearGradient id="field" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#102A43"/><stop offset="1" stop-color="#243B53"/></linearGradient>
  <radialGradient id="bloom"><stop offset="0" stop-color="#F0B429" stop-opacity="0.6"/><stop offset="1" stop-color="#F0B429" stop-opacity="0"/></radialGradient>
  <filter id="shadow"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.12"/></filter>
  <clipPath id="round"><circle cx="1000" cy="360" r="150"/></clipPath>
  <marker id="arrow" orient="auto" markerWidth="10" markerHeight="10" refX="5" refY="5"><path d="M0 0 L10 5 L0 10 z" fill="#F0B429"/></marker>
</defs>
<rect x="0" y="0" width="1280" height="720" fill="url(#field)"/>
<circle cx="200" cy="200" r="160" fill="url(#bloom)"/>
<g id="header">
  <text x="64" y="120" font-family="'Georgia', serif" font-size="52" font-weight="bold" fill="#FFFFFF">Solar is now <tspan fill="#F0B429">40% cheaper</tspan></text>
  <text x="64" y="180" font-size="24" fill="#BCCCDC">First line of the standfirst<tspan x="64" dy="36">and its second line</tspan></text>
</g>
<g id="card" transform="translate(64 260)">
  <rect width="420" height="200" rx="16" fill="#FFFFFF" fill-opacity="0.08" stroke="#FFFFFF" stroke-opacity="0.2" filter="url(#shadow)"/>
  <text x="210" y="110" text-anchor="middle" font-size="72" font-weight="700" fill="#F0B429">2.4×</text>
</g>
<path d="M520 400 C 600 300, 700 500, 780 400" fill="none" stroke="#F0B429" stroke-width="4" stroke-dasharray="8,4" marker-end="url(#arrow)"/>
<image href="assets/panel.jpg" x="850" y="210" width="300" height="300" preserveAspectRatio="xMidYMid slice" clip-path="url(#round)"/>
<polygon points="64,600 120,560 176,600" fill="#F0B429" transform="rotate(10 120 580)"/>
<text x="1216" y="680" text-anchor="end" font-size="14" fill="#829AB1" opacity="0.8">Source: IEA 2025</text>
</svg>`;

const PICTURE = { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), ext: 'jpeg', width: 600, height: 400 };

test('slide SVG converts to native PowerPoint shapes', () => {
  const out = svgPptx.convertSvgSlide(SAMPLE_SLIDE, { slideWidthEmu: 12192000, slideHeightEmu: 6858000, picture: (href) => (href === 'assets/panel.jpg' ? PICTURE : null) });
  assert.match(out.background, /^<p:bg><p:bgPr><a:gradFill/);
  assert.match(out.background, /<a:lin ang="0" scaled="0"\/>/);
  const doc = new DOMParser().parseFromString(`<p:spTree xmlns:p="p" xmlns:a="a" xmlns:r="r">${out.shapes}</p:spTree>`, 'text/xml');
  assert.equal(doc.getElementsByTagName('parsererror').length, 0, 'shapes are well-formed XML');
  assert.match(out.shapes, /<a:prstGeom prst="ellipse">/);
  assert.match(out.shapes, /<a:path path="circle">/, 'radial gradient');
  assert.match(out.shapes, /<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\d+" name="header"\/>/);
  assert.match(out.shapes, /<a:t>Solar is now <\/a:t><\/a:r><a:r><a:rPr lang="en-US" sz="3900" b="1"/);
  assert.match(out.shapes, /<a:t>40% cheaper<\/a:t>/);
  assert.match(out.shapes, /<a:latin typeface="Georgia"\/>/);
  assert.match(out.shapes, /<a:lnSpc><a:spcPts val="2700"\/><\/a:lnSpc>/, 'line step 36px = 27pt');
  assert.match(out.shapes, /<a:t>and its second line<\/a:t>/);
  assert.match(out.shapes, /<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 8000"\/>/);
  assert.match(out.shapes, /<a:outerShdw blurRad="190500" dist="57150" dir="5400000"/);
  assert.match(out.shapes, /<a:pPr algn="ctr">/);
  assert.match(out.shapes, /<a:cubicBezTo>/);
  assert.match(out.shapes, /<a:prstDash val="sysDash"\/>/);
  assert.match(out.shapes, /<a:tailEnd type="triangle"/);
  assert.match(out.shapes, /<p:pic>.*<a:srcRect l="16667" t="0" r="16667" b="0"\/>.*<a:prstGeom prst="ellipse">/, 'a 3:2 picture in a square frame crops its sides');
  assert.match(out.shapes, /<a:fillToRect l="50000" t="50000" r="50000" b="50000"\/>/, 'radial gradients default to the centre');
  assert.match(out.shapes, /<a:pPr algn="r">/);
  assert.match(out.shapes, /<a:alpha val="80000"\/>/, 'opacity reaches the text colour');
  assert.match(out.shapes, /<a:lnTo><a:pt x="1050593" y="467836"\/><\/a:lnTo><a:close\/>/, 'a rotated polygon keeps its exact points');
  const rotated = svgPptx.convertSvgSlide('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect x="100" y="100" width="200" height="100" fill="#123456" transform="rotate(30 200 150)"/></svg>', { slideWidthEmu: 12192000, slideHeightEmu: 6858000, picture: () => null });
  assert.match(rotated.shapes, /<a:xfrm rot="1800000"><a:off x="952500" y="952500"\/><a:ext cx="1905000" cy="952500"\/>/, 'a rotated rectangle stays a rectangle');
  assert.equal(out.media.length, 1);
  assert.equal(out.media[0].rId, 'rIdYz1');
  // The headline's first baseline lands at y=120: 52px Georgia → 39pt, offset = round(1.2·39·0.807) = 38pt → 50.67px.
  const headline = out.shapes.match(/name="Text \d+"\/><p:cNvSpPr txBox="1"\/><p:nvPr\/><\/p:nvSpPr><p:spPr><a:xfrm><a:off x="(\d+)" y="(\d+)"/);
  assert.ok(headline, 'headline frame');
  assert.equal(Number(headline[1]), 64 * 9525);
  assert.equal(Number(headline[2]), Math.round((120 - (38 * 4) / 3) * 9525));
});

test('designed decks export to a .pptx with shapes, pictures, notes and theme colours', async () => {
  const system = designPrompts.sanitizeDesignSystem({ name: 'Night Grid', palette: { background: '#102A43', text: '#F0F4F8', primary: '#F0B429', accent: '#EF4E4E' } });
  const { bytes, warnings } = await svgDeckExport.buildDesignedPptx({
    title: 'Solar',
    size: '16:9',
    system,
    mode: 'editable',
    slides: [{ svg: SAMPLE_SLIDE, notes: 'Open with the price drop.' }, { svg: '', notes: '', hidden: true }],
    picture: (href) => (href === 'assets/panel.jpg' ? PICTURE : null),
  });
  assert.deepEqual(warnings, []);
  const zip = await JSZip.loadAsync(bytes);
  const slide = await zip.file('ppt/slides/slide1.xml').async('string');
  const parsed = new DOMParser().parseFromString(slide, 'text/xml');
  assert.equal(parsed.getElementsByTagName('parsererror').length, 0);
  assert.match(slide, /<p:cSld name="Slide 1"><p:bg><p:bgPr><a:gradFill/);
  assert.match(slide, /<a:t>40% cheaper<\/a:t>/);
  const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
  assert.match(rels, /Id="rIdYz1" Type="[^"]*\/image" Target="\.\.\/media\/yz-slide1-1\.jpeg"/);
  assert.ok(zip.file('ppt/media/yz-slide1-1.jpeg'));
  const notes = await zip.file('ppt/notesSlides/notesSlide1.xml').async('string');
  assert.match(notes, /Open with the price drop\./);
  const theme = await zip.file('ppt/theme/theme1.xml').async('string');
  assert.match(theme, /<a:clrScheme name="Night Grid">/);
  assert.match(theme, /<a:dk1><a:srgbClr val="102A43"\/><\/a:dk1>/);
  assert.match(theme, /<a:accent1><a:srgbClr val="F0B429"\/><\/a:accent1>/);
  assert.match(await zip.file('ppt/slides/slide2.xml').async('string'), /<p:sld show="0"/, 'hidden slides stay hidden');
  assert.doesNotMatch(slide, /show="0"/);
  const presentation = await zip.file('ppt/presentation.xml').async('string');
  assert.match(presentation, /<p:sldSz cx="12192000" cy="6858000"/);
});

test('dominant colours of a picture', () => {
  const pixels = [];
  for (let i = 0; i < 60; i += 1) pixels.push(200, 30, 40, 255);
  for (let i = 0; i < 30; i += 1) pixels.push(20, 40, 200, 255);
  for (let i = 0; i < 30; i += 1) pixels.push(0, 0, 0, 0);
  const colors = designColors.dominantColors(pixels, 3);
  assert.equal(colors.length, 2);
  assert.equal(colors[0], '#C81E28');
  assert.equal(designColors.normalizeHex('#abc'), '#AABBCC');
  assert.notEqual(designColors.ensureContrast('#777777', '#FFFFFF', 7), '#777777');
});

const designPictures = await load('designPictures');

test('folder and file paths named in a description are found', () => {
  const text = 'you can get the pics you need to desgen the presentation from : @C:\\Users\\nasee\\Desktop\\files\\CODING\\fahad-project\\website\\public\n\nTM471-Full.docx';
  const [mention, ...rest] = designPictures.findMentionedPaths(text);
  assert.equal(rest.length, 0);
  assert.equal(mention.raw, 'C:\\Users\\nasee\\Desktop\\files\\CODING\\fahad-project\\website\\public');
  assert.deepEqual(mention.candidates, [mention.raw]);
  const spaced = designPictures.findMentionedPaths('Photos in C:\\My Pictures\\Trip 2024 are the best.');
  assert.deepEqual(spaced[0].candidates, ['C:\\My Pictures\\Trip 2024 are the best', 'C:\\My Pictures\\Trip 2024 are the', 'C:\\My Pictures\\Trip 2024 are', 'C:\\My Pictures\\Trip 2024', 'C:\\My Pictures\\Trip', 'C:\\My']);
  assert.equal(designPictures.findMentionedPaths('see /home/me/pics and/or TCP/IP').map((entry) => entry.candidates.at(-1)).join('|'), '/home/me/pics');
  const relative = designPictures.findMentionedPaths('use @website/public/pics please, mail me@site.com', 'D:\\work');
  assert.equal(relative.length, 1);
  assert.ok(relative[0].candidates.includes('D:\\work\\website\\public\\pics'));
  assert.equal(designPictures.findMentionedPaths('@C:\\x\\y', 'D:\\work').length, 1, '@C:\\… is not also read as a relative path');
});

test('folder pictures: one per name, PNG before WebP, usable names in assets/', () => {
  const entries = ['street-food.webp', 'street-food.png', 'Banner.png', 'file.svg', 'clip.mp4', 'Noddles..png', 'b.gif']
    .map((name) => ({ name, path: `C:\\p\\${name}` }));
  assert.deepEqual(designPictures.folderPictures(entries).map((entry) => entry.name), ['b.gif', 'Banner.png', 'Noddles..png', 'street-food.png']);
  const frames = Array.from({ length: 30 }, (_, index) => ({ name: `frame-${String(index + 1).padStart(3, '0')}.webp`, path: `C:\\v\\frames\\frame-${String(index + 1).padStart(3, '0')}.webp` }));
  const steps = ['step-01.png', 'step-02.png', 'step-03.png'].map((name) => ({ name, path: `C:\\v\\${name}` }));
  assert.deepEqual(designPictures.folderPictures([...frames, ...steps]).map((entry) => entry.name), ['frame-001.webp', 'step-01.png', 'step-02.png', 'step-03.png'], 'a long frame sequence keeps its first frame; short numbered sets stay');
  const used = new Set(['banner.png']);
  assert.equal(designPictures.assetName('C:\\p\\Banner.png', used), 'Banner-2.png');
  assert.equal(designPictures.assetName('C:\\p\\Noddles..png', used), 'Noddles.png');
  assert.equal(designPictures.assetName('C:\\p\\my photo (1).jpg', used), 'my-photo-1-.jpg');
  const known = ['assets/Burger.png', 'assets/map.png'];
  assert.equal(designPictures.matchPicture('ASSETS/burger.PNG', known), 'assets/Burger.png');
  assert.equal(designPictures.matchPicture('C:\\x\\map.png', known), 'assets/map.png');
  assert.equal(designPictures.matchPicture('assets/none.png', known), null);
  assert.deepEqual(designPictures.matchPictures(['map.png', 'assets/map.png', 'x.png', 'Burger.png'], known), ['assets/map.png', 'assets/Burger.png']);
});

test('art direction plans pictures onto pages, and drawing prompts insist on placing them', () => {
  const attachments = [
    { path: 'assets/truck.png', name: 'truck.png', kind: 'image', use: 'auto', width: 1200, height: 800 },
    { path: 'assets/mood.png', name: 'mood.png', kind: 'image', use: 'style' },
  ];
  const direction = designPrompts.buildDirectionPrompt({ prompt: 'Food trucks in Bahrain', attachments, sources: '', slideCount: null, language: 'auto', canvas: CANVAS, seesImages: 'sheets' });
  assert.match(direction.prompt, /attached as contact sheets/);
  assert.match(direction.prompt, /PLACING THE PICTURES/);
  assert.match(direction.prompt, /"pictures": \["assets\/…"\]/);
  assert.match(direction.prompt, /"pictureNotes"/);
  const plain = designPrompts.buildDirectionPrompt({ prompt: 'x', attachments: [], sources: '', slideCount: null, language: 'auto', canvas: CANVAS, seesImages: false });
  assert.doesNotMatch(plain.prompt, /PLACING THE PICTURES|"pictures"/);

  const reply = JSON.stringify({
    title: 'Trucks',
    design: {},
    pages: [{ role: 'cover', title: 'Cover', brief: 'b', pictures: ['truck.png', 'assets/unknown.png'] }, { title: 'Two', pictures: 'nope' }],
    pictureNotes: { 'assets/truck.png': 'A red food truck at night', 'ghost.png': 'x' },
  });
  const known = designPrompts.placeablePictures(attachments).map((entry) => entry.path);
  const parsed = designPrompts.parseDirection(reply, known);
  assert.deepEqual(parsed.pages[0].pictures, ['assets/truck.png']);
  assert.equal(parsed.pages[1].pictures, undefined);
  assert.deepEqual(parsed.pictureNotes, { 'assets/truck.png': 'A red food truck at night' });

  const pages = [{ role: 'cover', title: 'Cover', brief: 'b', density: 'anchor', pictures: ['assets/truck.png'] }, { role: 'content', title: 'Two', brief: 'b2', density: 'dense' }];
  const withCaption = [{ ...attachments[0], caption: 'A red food truck at night' }, attachments[1]];
  const draw = designPrompts.buildSlidesPrompt({ title: 'T', language: 'English', system: designPrompts.FALLBACK_SYSTEM, canvas: CANVAS, pages, draw: [0], attachments: withCaption, attachedPictures: ['assets/truck.png'] });
  assert.match(draw.prompt, /Pictures \(place every one\): assets\/truck\.png/);
  assert.match(draw.prompt, /Shows: A red food truck at night/);
  assert.match(draw.prompt, /never replace one with a drawn stand-in/);
  assert.match(draw.prompt, /ATTACHED TO THIS MESSAGE, in this order: assets\/truck\.png/);
  assert.doesNotMatch(draw.prompt, /mood\.png/, 'look references are not offered for slides');
  const other = designPrompts.buildSlidesPrompt({ title: 'T', language: 'English', system: designPrompts.FALLBACK_SYSTEM, canvas: CANVAS, pages, draw: [1], attachments: withCaption });
  assert.match(other.prompt, /1\. \[cover, anchor\] Cover · pictures: assets\/truck\.png/);
  assert.doesNotMatch(other.prompt, /ATTACHED TO THIS MESSAGE/);
});

test('a picture plan for an existing deck is read against the deck pictures', () => {
  const attachments = [{ path: 'assets/map.png', name: 'map.png', kind: 'image', use: 'auto' }];
  const pages = [{ role: 'cover', title: 'A', brief: 'a', density: 'anchor' }, { role: 'content', title: 'B', brief: 'b', density: 'dense' }];
  const { prompt } = designPrompts.buildPicturePlanPrompt({ title: 'Deck', pages, attachments, seesImages: true });
  assert.match(prompt, /1\. \[cover\] A/);
  assert.match(prompt, /List only the pages that get pictures/);
  const plan = designPrompts.parsePicturePlan(JSON.stringify({ pages: [{ n: 2, pictures: ['map.png'], brief: 'The map, framed in a phone' }, { n: 9, pictures: ['map.png'] }, { n: 1, pictures: ['x.png'] }], pictureNotes: { 'map.png': 'App map screen' } }), 2, ['assets/map.png']);
  assert.deepEqual([...plan.pages.entries()], [[1, { pictures: ['assets/map.png'], brief: 'The map, framed in a phone' }]]);
  assert.deepEqual(plan.notes, { 'assets/map.png': 'App map screen' });
  assert.equal(designPrompts.parsePicturePlan('nothing', 2, []), null);
  const stored = designPrompts.sanitizeDesignedSlide({ id: 's1', title: 'T', svg: '', pictures: ['assets/a.png', '../x.png', 'C:/abs.png', 5] }, CANVAS);
  assert.deepEqual(stored.pictures, ['assets/a.png']);
  assert.equal(designPrompts.sanitizeAttachment({ path: 'assets/a.png', kind: 'image', caption: '  A truck ' }).caption, 'A truck');
});

// Opening PowerPoint files as editable slides ----------------------------------------------------

const slideModel = await load('slideModel');
const slideGeometry = await load('slideGeometry');
const slideEdit = await load('slideEdit');
const pptxRender = await load('pptxRender');
const modelPptx = await load('modelPptx');
const measure = slideModel.estimateMeasure;

test('opening a .pptx keeps one slide per slide, with text, notes and models', async () => {
  const deck = await pptxRender.importPptx(await fixturePptx(), { fileTitle: 'fixture', measure });
  assert.equal(deck.slides.length, 3, 'one slide in, one slide out');
  assert.equal(deck.size, '16:9');
  assert.deepEqual(deck.canvas, { width: 1280, height: 720 });
  const [first, second] = deck.slides;
  assert.equal(first.notes, 'Original notes');
  assert.match(first.text, /Original title/);
  assert.match(first.text, /First point\nSecond point/);
  assert.match(first.svg, /data-m="/, 'elements carry their model');
  assert.match(first.svg, /<rect data-bg="1"/, 'the background comes first');
  const models = slideEdit.slideModels(first.svg);
  const title = models.find((model) => model.k === 'shape' && model.tx && slideModel.bodyText(model.tx) === 'Original title');
  assert.ok(title, 'the title is a text box');
  const run = title.tx.p[0].r[0];
  assert.equal(run.b, true);
  assert.equal(run.f, 'Georgia');
  assert.equal(run.c, '#C2410C');
  assert.ok(Math.abs(run.sz - 32 * (4 / 3)) < 0.5, `32 pt is ${(32 * 4) / 3} px, got ${run.sz}`);
  const body = models.find((model) => model.k === 'shape' && model.tx && /First point/.test(slideModel.bodyText(model.tx)));
  assert.ok(body.tx.p.every((para) => para.bu), 'bullets come across');
  assert.match(second.svg, /data-kind="chart"/, 'charts are drawn');
  // Stored slides pass the SVG sanitiser with their models intact.
  const stored = svgSafe.sanitizeSvg(first.svg, deck.canvas).svg;
  assert.deepEqual(slideEdit.slideModels(stored).map((model) => model.id), models.map((model) => model.id));
});

test('text layout wraps, numbers, anchors and shrinks on overflow', () => {
  const run = (t, extra = {}) => ({ t, sz: 20, f: 'Calibri', c: '#111111', ...extra });
  const body = { p: [{ r: [run('one two three four five six seven eight nine ten')] }], ins: [0, 0, 0, 0], anc: 't', wrap: true };
  const wide = slideModel.layoutText(body, 2000, 400, measure);
  const narrow = slideModel.layoutText(body, 120, 400, measure);
  assert.equal(wide.paragraphs[0].lines.length, 1);
  assert.ok(narrow.paragraphs[0].lines.length > 2, 'wraps inside a narrow box');
  assert.ok(Math.abs(wide.height - 24) < 0.01, 'single spacing is 1.2 × the size');
  const noWrap = slideModel.layoutText({ ...body, wrap: false }, 120, 400, measure);
  assert.equal(noWrap.paragraphs[0].lines.length, 1);
  const numbered = { p: ['a', 'b', 'c'].map((t) => ({ r: [run(t)], bu: { num: 'romanUcPeriod' } })), ins: [0, 0, 0, 0], anc: 'b', wrap: true };
  const laid = slideModel.layoutText(numbered, 400, 300, measure);
  assert.deepEqual(laid.paragraphs.map((para) => para.bullet.text), ['I.', 'II.', 'III.']);
  assert.ok(laid.paragraphs[2].lines[0].baseline > 280, 'bottom anchoring');
  assert.equal(slideModel.numberLabel('alphaLcParenR', 28), 'ab)');
  const tall = { p: Array.from({ length: 12 }, () => ({ r: [run('line')] })), ins: [0, 0, 0, 0], anc: 't', wrap: true, fit: 'norm' };
  const shrunk = slideModel.layoutText(tall, 300, 120, measure, { refit: true });
  assert.ok(shrunk.fs < 1 && shrunk.height <= 121, 'shrinks to fit');
  const svg = slideModel.textSvg(body, narrow, 120);
  assert.match(svg, /<text xml:space="preserve"/);
  assert.doesNotMatch(svg.match(/<text[^>]*>/)[0], /text-decoration/, 'decorations live on runs only');
});

test('preset and custom geometry become path data', () => {
  const round = slideGeometry.presetPaths('roundRect', 200, 100, { adj: 50000 });
  assert.match(round[0].d, /A50 50/);
  assert.equal(slideGeometry.presetPaths('textNoShape', 10, 10).length, 0);
  assert.match(slideGeometry.presetPaths('somethingUnknown', 10, 20)[0].d, /^M0 0 L10 0 L10 20 L0 20 Z$/);
  assert.equal(slideGeometry.presetPaths('line', 50, 0)[0].fill, 'none');
  const custom = slideGeometry.customPaths([{ w: 100, h: 100, fill: 'norm', stroke: true, cmds: [['M', 0, 0], ['L', 100, 0], ['L', 100, 100], ['Z']] }], 50, 20);
  assert.equal(custom[0].d, 'M0 0 L50 0 L50 20 Z');
  const vars = slideGeometry.evaluateGuides([{ name: 'half', fmla: '*/ w 1 2' }, { name: 'off', fmla: '+- half 10 0' }], slideGeometry.guideVars(300, 100));
  assert.equal(vars.get('off'), 160);
});

test('slide editing moves, resizes, duplicates, arranges, deletes and wraps drawn artwork', () => {
  const box = { x: 100, y: 100, w: 300, h: 60 };
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect data-bg="1" x="0" y="0" width="1280" height="720" fill="#FFFFFF"/><circle cx="900" cy="300" r="50" fill="#123456"/></svg>';
  const inserted = slideEdit.insertElement(svg, slideEdit.textBoxModel(box, 'Hello there', { font: 'Calibri', size: 24, color: '#222222' }), { measure });
  svg = inserted.svg;
  assert.equal(inserted.id, 'e1');
  svg = slideEdit.moveElements(svg, ['e1'], 20, -10, { measure });
  assert.equal(slideEdit.elementModel(svg, 'e1').box.x, 120);
  svg = slideEdit.resizeElement(svg, 'e1', { x: 120, y: 90, w: 80, h: 60 }, { measure });
  const resized = slideEdit.elementModel(svg, 'e1');
  assert.equal(resized.box.w, 80);
  assert.ok(resized.box.h > 60, 'a "resize shape to fit text" box grows when its text wraps');
  const copy = slideEdit.duplicateElements(svg, ['e1'], 16, { measure });
  assert.equal(copy.ids.length, 1);
  assert.notEqual(copy.ids[0], 'e1');
  assert.equal(slideEdit.elementModel(copy.svg, copy.ids[0]).box.x, 136);
  svg = slideEdit.arrangeElement(copy.svg, copy.ids[0], 'back');
  assert.deepEqual(slideEdit.listElements(svg).map((info) => info.id), [copy.ids[0], 'e1']);
  // Drawn artwork (the circle, second under the root) becomes an art element that moves as one piece.
  const adopted = slideEdit.adoptNode(svg, 1, { x: 850, y: 250, w: 100, h: 100 });
  assert.ok(adopted);
  const moved = slideEdit.moveElements(adopted.svg, [adopted.id], 10, 0, { measure });
  assert.match(moved, new RegExp(`data-el="${adopted.id}"[^>]*data-box="860 250 100 100"`));
  assert.match(moved, /transform="translate\(10 0\)"/);
  svg = slideEdit.deleteElements(moved, ['e1', adopted.id]);
  assert.deepEqual(slideEdit.listElements(svg).map((info) => info.id), [copy.ids[0]]);
  assert.doesNotMatch(slideEdit.svgForAi(svg), /data-m=/, 'the AI never sees model data');
  assert.equal(slideEdit.backgroundColor(slideEdit.setBackground(svg, '#0A0A0A')), '#0A0A0A');
  const blank = slideEdit.blankSlide(svg);
  assert.equal(slideEdit.listElements(blank).length, 0);
  assert.match(blank, /data-bg="1"/);
});

test('a theme change recolours every element and keeps text readable', () => {
  const from = { background: '#FBF3E4', surface: '#F0E2C8', text: '#2A1A14', muted: '#7A6A60', primary: '#C33A22', secondary: '#1F5C63', accent: '#F2A31B' };
  const to = { background: '#0E1220', surface: '#1A2033', text: '#F2F4FA', muted: '#9AA3B8', primary: '#7AA2FF', secondary: '#6EE7B7', accent: '#F6B26B' };
  const color = slideEdit.paletteColorMap(from, to);
  assert.equal(color('#C33A22'), '#7AA2FF', 'roles map to roles');
  assert.equal(color('#FBF3E4'), '#0E1220');
  const card = { k: 'shape', id: 'e1', box: { x: 0, y: 0, w: 400, h: 200 }, geom: { prst: 'rect' }, fill: { t: 'solid', c: '#F2A31B' }, line: null, tx: { p: [{ r: [{ t: 'Readable', sz: 24, f: 'Calibri', c: '#FBF3E4' }] }], ins: [0, 0, 0, 0], anc: 't', wrap: true } };
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect data-bg="1" x="0" y="0" width="1280" height="720" fill="#FBF3E4"/></svg>';
  svg = slideEdit.insertElement(svg, card, { measure }).svg;
  const themed = slideEdit.applyThemeMap(svg, { color, font: (family) => family, ink: { dark: to.background, light: to.text } }, { measure });
  const model = slideEdit.slideModels(themed)[0];
  assert.equal(model.fill.c, '#F6B26B');
  assert.ok(slideEdit.contrast(model.tx.p[0].r[0].c, model.fill.c) >= 3, 'text on the recoloured card stays readable');
  assert.equal(slideEdit.backgroundColor(themed), '#0E1220');
});

test('modelled elements export as native PowerPoint text boxes, pictures and tables', async () => {
  const deck = await pptxRender.importPptx(await fixturePptx(), { fileTitle: 'fixture', measure });
  const converted = svgPptx.convertSvgSlide(deck.slides[0].svg, { slideWidthEmu: 12192000, slideHeightEmu: 6858000, picture: () => null, measure });
  assert.match(converted.shapes, /<a:t>Original title<\/a:t>/);
  assert.match(converted.shapes, /<a:buChar char="[^"]+"\/>[\s\S]*<a:t>First point<\/a:t>/);
  assert.match(converted.shapes, /typeface="Georgia"/);
  assert.match(converted.background, /<p:bg>/);
  const cell = (t) => ({ tx: { p: [{ r: t ? [{ t, sz: 16, f: 'Calibri', c: '#000000' }] : [] }], ins: [4, 4, 4, 4], anc: 't', wrap: true }, fill: { t: 'none' } });
  const table = { k: 'table', id: 't1', box: { x: 0, y: 0, w: 200, h: 60 }, cols: [100, 100], rows: [{ h: 30, cells: [{ ...cell('A'), fill: { t: 'solid', c: '#EEEEEE' }, span: [2, 1] }, { ...cell(''), merged: true }] }] };
  let id = 1;
  const context = (picture) => ({ emuPerPx: 9525, x: (px) => Math.round(px * 9525), y: (px) => Math.round(px * 9525), nextId: () => id++, picture, lang: 'en-US' });
  const xml = modelPptx.elementXml(table, context(() => null));
  assert.match(xml, /<a:tc gridSpan="2">/);
  assert.match(xml, /<a:tc hMerge="1">/);
  const picture = modelPptx.elementXml({ k: 'pic', id: 'p', box: { x: 10, y: 10, w: 50, h: 50 }, href: 'assets/a.png', crop: [0.1, 0, 0.1, 0], line: null }, context(() => 'rId7'));
  assert.match(picture, /<a:blip r:embed="rId7"><\/a:blip><a:srcRect l="10000" t="0" r="10000" b="0"\/>/);
});
