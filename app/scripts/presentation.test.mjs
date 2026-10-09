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
