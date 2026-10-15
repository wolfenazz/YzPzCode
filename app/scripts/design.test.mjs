import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const load = async (entry) => {
  const result = await build({ entryPoints: [new URL(entry, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const project = await load('../src/utils/design/project.ts');
const formats = await load('../src/utils/design/formats.ts');
const css = await load('../src/utils/design/tokensCss.ts');
const css_ = css;

test('presets exist for every kind and resolve by id', () => {
  for (const kind of ['app', 'web', 'graphic']) assert.ok(formats.presetsFor(kind).length > 0);
  assert.deepEqual(formats.resolveFormat('story'), { id: 'story', label: 'Story / Reel', width: 1080, height: 1920 });
});

test('custom sizes parse and clamp', () => {
  assert.deepEqual(formats.resolveFormat('1200x628'), { id: '1200x628', label: 'Custom 1200 × 628', width: 1200, height: 628 });
  assert.equal(formats.resolveFormat('9000x10').width, 8000);
  assert.equal(formats.resolveFormat('nonsense'), null);
  assert.equal(formats.clampCanvas(3), 64);
});

test('aspect labels reduce, and untidy ratios are left blank', () => {
  assert.equal(formats.aspectLabel(1080, 1350), '4:5');
  assert.equal(formats.aspectLabel(1920, 1080), '16:9');
  assert.equal(formats.aspectLabel(1241, 1753), '');
});

test('project paths slug the title and avoid taken ones', () => {
  const root = ['C:', 'Docs', 'YzPzCode'].join(String.fromCharCode(92));
  const sep = String.fromCharCode(92);
  const first = project.designPath(root, 'Habit tracker!');
  assert.equal(first, [root, 'Designs', 'habit-tracker', 'habit-tracker.yzdesign'].join(sep));
  const second = project.designPath(root, 'Habit tracker!', new Set([first.toLowerCase()]));
  assert.ok(second.endsWith('habit-tracker-2.yzdesign'));
  assert.ok(project.designPath('/home/u', '').endsWith('/Designs/design/design.yzdesign'));
});

test('parseProject repairs a malformed file', () => {
  const broken = project.parseProject('{"kind":"nope","title":5,"boards":[{"width":"x","source":"<p>hi</p>","status":"drawing"},{"format":"svg","status":"drawing"}],"system":{"palette":{"primary":"red"}}}');
  assert.equal(broken.kind, 'app');
  assert.equal(broken.title, 'Untitled design');
  assert.equal(broken.boards.length, 2);
  assert.equal(broken.boards[0].width, 390);
  // A board left drawing keeps what it had, or is marked failed.
  assert.equal(broken.boards[0].status, 'done');
  assert.equal(broken.boards[1].status, 'failed');
  assert.equal(broken.system.palette.primary, '#18181b');
  assert.equal(project.parseProject('not json').boards.length, 0);
});

test('a graphic project starts with svg boards, an app with html', () => {
  assert.equal(project.parseProject('{"kind":"graphic","boards":[{}]}').boards[0].format, 'svg');
  assert.equal(project.parseProject('{"kind":"app","boards":[{}]}').boards[0].format, 'html');
});

test('serialize then parse keeps the project', () => {
  const made = project.createProject({ title: 'Launch', kind: 'graphic', prompt: 'A banner', boards: [] });
  const back = project.parseProject(project.serializeProject(made));
  assert.equal(back.title, 'Launch');
  assert.equal(back.kind, 'graphic');
  assert.equal(back.chat.length, 1);
});

test('boards are laid out in a row after the system board', () => {
  const placed = project.layoutBoards([{ width: 390, height: 844 }, { width: 390, height: 844 }].map((size, index) => ({ id: String(index), name: '', brief: '', format: 'html', source: '', x: 9, y: 9, ...size })));
  assert.equal(placed[0].x, project.SYSTEM_BOARD.width + project.BOARD_GAP);
  assert.equal(placed[1].x, placed[0].x + 390 + project.BOARD_GAP);
  assert.equal(placed[0].y, 0);
  const bounds = project.contentBounds(placed);
  assert.equal(bounds.x, 0);
  assert.equal(bounds.height, 844);
});

test('tokens become css variables, and font names cannot break out', () => {
  const out = css.tokensToCss({ ...project.DEFAULT_TOKENS, fonts: { heading: "Evil'; } body{", body: 'Inter' } });
  assert.match(out, /--ds-primary:#18181b/);
  assert.match(out, /--ds-font-body:'Inter'/);
  assert.ok(!out.includes("Evil'"));
});

const safe = await load('../src/utils/design/htmlSafe.ts');
const prompts = await load('../src/utils/design/prompts.ts');

test('sanitizeHtml drops scripts, handlers, frames and external references', () => {
  const dirty = '<html><head><script>alert(1)</script><style>@import url(https://evil.test/a.css);.a{background:url(https://evil.test/x.png);color:red}</style></head>'
    + '<body onload="x()"><div class="a" onclick="steal()" style="background:url(http://evil.test/b.png);color:blue">Hi<img src="https://evil.test/p.png"><iframe src="x"></iframe>'
    + '<a href="javascript:alert(1)">bad</a><a href="#ok">ok</a><img src="assets/pic.png"><img src="photo:red barn"></div></body></html>';
  const { html, photos } = safe.sanitizeHtml(dirty);
  assert.ok(!/<script|onload|onclick|iframe|evil\.test|javascript:|@import/i.test(html), html);
  assert.match(html, /color:red/);
  assert.match(html, /href="#ok"/);
  assert.match(html, /src="assets\/pic\.png"/);
  assert.deepEqual(photos, ['red barn']);
  assert.match(html, /data-yz="1"/);
});

test('sanitizeHtml closes what a streamed reply left open and hides a cut-off tag', () => {
  const { html } = safe.sanitizeHtml('<div><section><h1>Title</h1><p>Body <b>bold');
  assert.ok(html.endsWith('</b></p></section></div>'), html);
  const cut = safe.sanitizeHtml('<div><p>one</p><span cla');
  assert.ok(!cut.html.includes('cla'));
});

test('sanitizeHtml cannot be broken out of with odd tags and unknown elements', () => {
  const { html } = safe.sanitizeHtml('<div><form action="https://x"><input name="a"></form><custom-el onclick="x">t</custom-el><svg viewBox="0 0 1 1" onload="x"><path d="M0 0" fill="url(https://x)"/></svg></div>');
  assert.ok(!/form|custom-el|onload|https:\/\/x/i.test(html), html);
  assert.match(html, /viewBox="0 0 1 1"/);
});

test('photos are swapped for the files found; the rest stay placeholders', () => {
  const out = safe.applyPhotos('<img src="photo:red barn"><img src="photo:lake">', { 'red barn': 'assets/a.jpg' });
  assert.match(out, /src="assets\/a\.jpg"/);
  assert.match(out, /src="photo:lake"/);
});

test('board blocks are read while streaming and at the end', () => {
  const partial = '<board name="Home"><style>.a{}</style><div>He';
  const blocks = prompts.extractBoardBlocks(partial);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].closed, false);
  assert.equal(blocks[0].name, 'Home');
  assert.equal(prompts.extractBoardBlocks('<board name="A">x</board><board name="B">y</board>').length, 2);
  assert.equal(prompts.extractBoardBlocks('here: <svg viewBox="0 0 1 1"></svg>', true)[0].source, '<svg viewBox="0 0 1 1"></svg>');
});

test('the direction reply is read from fenced or wrapped JSON and fitted to the canvas', () => {
  const formats = [{ id: 'phone', label: 'Phone', width: 390, height: 844 }];
  const reply = 'Sure!\n```json\n{"summary":"A calm app.","system":{"name":"Calm","palette":{"primary":"#112233"},"type":{"display":400,"body":4}},"boards":[{"name":"Home","brief":"Streaks"},{"name":"Add","brief":"New habit","format":"nope"}]}\n```';
  const direction = prompts.parseDirection(reply, { kind: 'app', formats });
  assert.equal(direction.tokens.palette.primary, '#112233');
  assert.equal(direction.tokens.type.display, 96);
  assert.equal(direction.tokens.type.body, 13);
  assert.equal(direction.boards.length, 2);
  assert.equal(direction.boards[1].format, 'phone');
  assert.throws(() => prompts.parseDirection('no json here', { kind: 'app', formats }));
});

test('a graphic gets exactly one board per requested size', () => {
  const formats = [{ id: 'ig-post', label: 'Instagram post', width: 1080, height: 1080 }, { id: 'story', label: 'Story / Reel', width: 1080, height: 1920 }];
  const direction = prompts.parseDirection('{"system":{},"boards":[{"name":"Launch","brief":"Big headline"}]}', { kind: 'graphic', formats });
  assert.deepEqual(direction.boards.map((board) => board.format), ['ig-post', 'story']);
  assert.equal(direction.boards[1].brief, 'Big headline');
});

test('type scale follows the canvas', () => {
  const small = prompts.fitTypeScale({ display: 10, h1: 10, h2: 10, body: 10, caption: 10 }, 'graphic', 1080, 1080);
  assert.equal(small.display, 65);
  const phone = prompts.fitTypeScale({ display: 200, h1: 200, h2: 200, body: 40, caption: 1 }, 'app', 390, 844);
  assert.equal(phone.body, 20);
  assert.equal(phone.caption, 10);
});

const exportUtils = await load('../src/utils/design/export.ts');

test('a leaf text can be replaced by its stamp and nothing else', () => {
  const { html } = safe.sanitizeHtml('<div><h1>Welcome</h1><p>Hello <b>there</b></p></div>');
  const h1 = /<h1 data-yz="(\d+)"/.exec(html)[1];
  const p = /<p data-yz="(\d+)"/.exec(html)[1];
  assert.equal(safe.elementText(html, h1), 'Welcome');
  const changed = safe.setElementText(html, h1, 'Hi <you> & me');
  assert.match(changed, /<h1 data-yz="\d+">Hi &lt;you> &amp; me<\/h1>/);
  assert.equal(safe.setElementText(html, p, 'x'), null);
  assert.equal(safe.setElementText(html, '999', 'x'), null);
});

test('the markup of a picked element is found with its children', () => {
  const { html } = safe.sanitizeHtml('<div><section><div>a</div><div>b</div></section><p>after</p></div>');
  const section = /<section data-yz="(\d+)"/.exec(html)[1];
  const out = safe.outerHtmlOf(html, section);
  assert.ok(out.startsWith('<section'));
  assert.ok(out.endsWith('</section>'));
  assert.ok(!out.includes('after'));
});

test('export names are safe and unique', () => {
  assert.equal(exportUtils.safeFileName('A/B: "C"?'), 'A B C');
  assert.equal(exportUtils.safeFileName('...'), 'board');
  assert.deepEqual(exportUtils.boardFileNames([{ name: 'Home' }, { name: 'home' }, { name: 'Cart' }]), ['Home', 'home 2', 'Cart']);
});

test('print pages get one named page size per distinct board size', () => {
  const html = exportUtils.printPagesHtml('Set', [
    { width: 390, height: 844, src: 'data:a', name: 'A' },
    { width: 390, height: 844, src: 'data:b', name: 'B' },
    { width: 1080, height: 1080, src: 'data:c', name: 'C' },
  ]);
  assert.equal((html.match(/@page p\d/g) ?? []).length, 2);
  assert.match(html, /size:390px 844px/);
  assert.equal((html.match(/class="pg /g) ?? []).length, 3);
});

test('a code export page links the tokens and escapes its title', () => {
  const page = exportUtils.standaloneBoardHtml({ name: 'A <b>', width: 390, source: '<p>hi</p>' }, project.DEFAULT_TOKENS, { tokensHref: 'tokens.css', dir: 'rtl', lang: 'ar' });
  assert.match(page, /<link rel="stylesheet" href="tokens\.css">/);
  assert.match(page, /dir="rtl"/);
  assert.match(page, /<title>A &lt;b>/);
});

test('a picture is swapped by stamp, only for images and only to project assets', () => {
  const { html } = safe.sanitizeHtml('<div><img src="photo:barn" alt="x"><p>t</p></div>');
  const img = /<img data-yz="(\d+)"/.exec(html)[1];
  const p = /<p data-yz="(\d+)"/.exec(html)[1];
  assert.match(safe.setImageSrc(html, img, 'assets/new.png'), /src="assets\/new\.png"/);
  assert.equal(safe.setImageSrc(html, img, 'https://evil.test/a.png'), null);
  assert.equal(safe.setImageSrc(html, p, 'assets/new.png'), null);
});

const quick = await load('../src/utils/design/quickActions.ts');

test('counts and scope labels are pluralised', () => {
  assert.equal(quick.plural(1, 'board'), '1 board');
  assert.equal(quick.plural(3, 'board'), '3 boards');
  assert.equal(quick.scopeLabel({ picked: false, selected: 0, total: 1 }), 'This board');
  assert.equal(quick.scopeLabel({ picked: false, selected: 0, total: 4 }), 'All 4 boards');
  assert.equal(quick.scopeLabel({ picked: false, selected: 1, total: 4 }), '1 board selected');
  assert.equal(quick.scopeLabel({ picked: true, selected: 2, total: 4 }), 'This element');
});

test('quick actions follow the kind and the scope', () => {
  const graphic = quick.quickActionsFor('graphic', 'all').map((entry) => entry.label);
  assert.ok(graphic.includes('Bigger headline') && graphic.includes('Translate to Arabic'));
  assert.ok(quick.quickActionsFor('app', 'all').some((entry) => entry.label === 'Bigger tap targets'));
  assert.ok(!quick.quickActionsFor('web', 'element').some((entry) => entry.label === 'Dark mode'));
});

test('the direction carries the project title', () => {
  const formats = [{ id: 'phone', label: 'Phone', width: 390, height: 844 }];
  const direction = prompts.parseDirection('{"title":"Habit streaks","system":{},"boards":[{"name":"Home","brief":"x"}]}', { kind: 'app', formats });
  assert.equal(direction.title, 'Habit streaks');
});

const tree = await load('../src/utils/design/domTree.ts');
const edit = await load('../src/utils/design/styleEdit.ts');
const SAMPLE = safe.sanitizeHtml('<style>.a>b{color:red}</style><header class="top"><div><h1>Hello world</h1></div><button style="color:red">Go</button></header><section class="hero"><img src="assets/a.png" alt="A"><p>One</p><p>Two</p></section>').html;
const idOf = (tag, from = SAMPLE) => new RegExp(String.raw`<${tag} [^>]*data-yz="(\d+)"`).exec(from)[1];

test('the element tree skips single-child wrappers and labels by role', () => {
  const nodes = tree.elementTree(SAMPLE);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].tag, 'header');
  assert.deepEqual(nodes[0].children.map((child) => child.tag), ['h1', 'button']);
  assert.match(nodes[0].children[0].label, /Heading 1 “Hello world”/);
  assert.match(nodes[1].children[0].label, /Picture “A”/);
  assert.equal(tree.elementTree(SAMPLE, { collapse: false })[0].children[0].tag, 'div');
});

test('style edits merge, remove and refuse unsafe values', () => {
  const id = idOf('button');
  let next = edit.setElementStyle(SAMPLE, id, { 'font-size': '18px', color: null });
  assert.deepEqual(edit.getInlineStyle(next, id), { 'font-size': '18px' });
  assert.equal(edit.setElementStyle(next, id, { background: 'url(https://evil.test/x.png)' }), next);
  next = edit.setElementStyle(next, id, { background: 'var(--ds-primary)', 'bad;prop': 'x', width: '10px;color:red' });
  assert.deepEqual(edit.getInlineStyle(next, id), { 'font-size': '18px', background: 'var(--ds-primary)' });
  assert.equal(edit.setElementStyle(SAMPLE, '999', { color: 'red' }), null);
  assert.match(next, new RegExp(`<button data-yz="${id}" style="`));
});

test('duplicate restamps, remove and move keep the markup balanced', () => {
  const section = idOf('section');
  const copy = edit.duplicateElement(SAMPLE, section);
  const stamps = [...copy.html.matchAll(/data-yz="(\d+)"/g)].map((match) => match[1]);
  assert.equal(new Set(stamps).size, stamps.length);
  assert.notEqual(copy.id, section);
  assert.equal(tree.elementTree(copy.html).length, 3);
  const without = edit.removeElement(SAMPLE, idOf('button'));
  assert.deepEqual(tree.elementTree(without)[0].children.map((child) => child.tag), ['h1']);
  const moved = edit.moveElement(SAMPLE, idOf('button'), -1);
  assert.deepEqual(tree.elementTree(moved)[0].children.map((child) => child.tag), ['button', 'h1']);
  assert.equal(edit.moveElement(SAMPLE, idOf('header'), -1), null);
});

const snap = await load('../src/utils/design/snap.ts');

test('a moving board snaps to near edges and centres and reports guides', () => {
  const others = [{ x: 0, y: 0, width: 400, height: 300 }];
  const result = snap.snapRect({ x: 396, y: 120, width: 100, height: 100 }, others, 6);
  assert.equal(result.dx, 4);
  assert.equal(result.dy, 0);
  assert.equal(result.guides.some((guide) => guide.axis === 'x' && guide.at === 400), true);
  const far = snap.snapRect({ x: 500, y: 500, width: 100, height: 100 }, others, 6);
  assert.deepEqual([far.dx, far.dy, far.guides.length], [0, 0, 0]);
  // centres meet as well
  const centre = snap.snapRect({ x: 150, y: 400, width: 100, height: 50 }, others, 6);
  assert.equal(centre.dx, 0);
  assert.equal(centre.guides.some((guide) => guide.axis === 'x' && guide.at === 200), true);
});

test('boards align to their common box and distribute with equal gaps', () => {
  const rects = { a: { x: 0, y: 0, width: 100, height: 100 }, b: { x: 300, y: 50, width: 200, height: 60 }, c: { x: 120, y: 400, width: 80, height: 80 } };
  assert.deepEqual(snap.alignRects(rects, 'left').b, { x: 0, y: 50 });
  assert.deepEqual(snap.alignRects(rects, 'right').a, { x: 400, y: 0 });
  assert.deepEqual(snap.alignRects(rects, 'middle').b, { x: 300, y: 210 });
  const spread = snap.distributeRects(rects, 'x');
  assert.equal(spread.a.x, 0);
  assert.equal(spread.b.x, 500 - 200);
  // gaps: total 500, used 380, gap 60 -> a 0..100, c 160..240, b 300..500
  assert.equal(spread.c.x, 160);
});

test('the marquee selects boards it touches and a paste lands to the right', () => {
  const rects = { a: { x: 0, y: 0, width: 100, height: 100 }, b: { x: 300, y: 0, width: 100, height: 100 } };
  assert.deepEqual(snap.boardsInRect(rects, { x: 50, y: 50, width: 100, height: 20 }), ['a']);
  assert.deepEqual(snap.boardsInRect(rects, { x: -10, y: -10, width: 500, height: 500 }).sort(), ['a', 'b']);
  const spot = snap.pasteOrigin([rects.a], Object.values(rects));
  assert.equal(spot.dx, 400 + 120);
});

const color = await load('../src/utils/design/color.ts');
const kits = await load('../src/utils/design/kits.ts');

test('contrast is computed and a failing colour is moved until it reads', () => {
  assert.equal(Math.round(color.contrastRatio('#000000', '#ffffff')), 21);
  assert.ok(color.contrastRatio('#777777', '#ffffff') < 4.5);
  const fixed = color.fixContrast('#9a9a9a', '#ffffff', 4.5);
  assert.ok(color.contrastRatio(fixed, '#ffffff') >= 4.5);
  const onDark = color.fixContrast('#333333', '#111111', 4.5);
  assert.ok(color.contrastRatio(onDark, '#111111') >= 4.5);
  assert.equal(color.fixContrast('#101010', '#ffffff', 4.5), '#101010');
});

test('a dark palette is derived and stays readable; ideas keep the lightness structure', () => {
  const light = project.DEFAULT_TOKENS.palette;
  const dark = color.deriveDarkPalette(light);
  assert.ok(color.isDarkColor(dark.background));
  assert.ok(!color.isDarkColor(dark.text));
  assert.ok(color.contrastRatio(dark.text, dark.background) >= 7);
  assert.ok(color.contrastRatio(dark.muted, dark.background) >= 3);
  const ideas = color.paletteIdeas(light, 5);
  assert.equal(ideas.length, 5);
  for (const idea of ideas) {
    assert.ok(!color.isDarkColor(idea.palette.background), idea.name);
    assert.ok(color.contrastRatio(idea.palette.text, idea.palette.background) >= 7, idea.name);
  }
  const scale = color.typeScale(16, 1.25);
  assert.deepEqual([scale.body, scale.h2, scale.h1, scale.display], [16, 25, 31, 49]);
});

test('system extras are repaired and written as variables, dark theme included', () => {
  const tokens = project.normalizeTokens({ shadow: 'huge', headingWeight: 640, lineHeight: 9, borderWidth: -3, darkPalette: { background: '#000', text: 'nope' } });
  assert.equal(tokens.shadow, 'soft');
  assert.equal(tokens.headingWeight, 600);
  assert.equal(tokens.lineHeight, 2.2);
  assert.equal(tokens.borderWidth, 0);
  const css = css_.tokensToCss(tokens);
  assert.match(css, /--ds-shadow-2:/);
  assert.match(css, /:root\[data-theme="dark"\]\{--ds-background:#000/);
  assert.ok(!/data-theme="dark"/.test(css_.tokensToCss(project.DEFAULT_TOKENS)));
});

test('a design system round-trips through DESIGN.md and a kit file', () => {
  const tokens = project.normalizeTokens({ name: 'Amber Roast', concept: 'Warm and quiet.', palette: { background: '#fbf6ee', surface: '#ffffff', text: '#2b1d14', muted: '#7a6a5d', primary: '#a14a24', secondary: '#d6b08c', accent: '#e07b39' }, fonts: { heading: 'Playfair Display', body: 'Inter' }, type: { display: 64, h1: 40, h2: 26, body: 17, caption: 12 }, radius: 14, spacing: 8, motif: 'laurel', headingWeight: 700 });
  tokens.darkPalette = { ...tokens.palette, background: '#1a120d', surface: '#241a14', text: '#f7efe6', muted: '#b7a698' };
  const back = kits.parseDesignMd(kits.tokensToDesignMd(tokens));
  assert.equal(back.name, 'Amber Roast');
  assert.deepEqual(back.palette, tokens.palette);
  assert.deepEqual(back.darkPalette, tokens.darkPalette);
  assert.equal(back.fonts.heading, 'Playfair Display');
  assert.equal(back.fonts.body, 'Inter');
  assert.deepEqual(back.type, tokens.type);
  assert.equal(back.radius, 14);
  assert.equal(back.motif, 'laurel');
  const kit = kits.parseKit(kits.serializeKit({ version: 1, id: 'k1', name: 'Mine', tokens, created: 5 }));
  assert.equal(kit.name, 'Mine');
  assert.deepEqual(kit.tokens.palette, tokens.palette);
  assert.equal(kits.parseKit('{not json'), null);
  assert.equal(kits.kitFileName('My Brand!', new Set(['my-brand.yzkit.json'])), 'my-brand-2.yzkit.json');
});

test('a loose DESIGN.md is read for colours and fonts', () => {
  const md = '# Brand\n\nPrimary: #FF3366\nBackground color #101010\nText colour: #f5f5f5\nHeading font: Poppins\nBody font: Inter\n';
  const tokens = kits.parseDesignMd(md);
  assert.equal(tokens.palette.primary, '#FF3366');
  assert.equal(tokens.palette.background, '#101010');
  assert.equal(tokens.palette.text, '#f5f5f5');
  assert.equal(tokens.fonts.heading, 'Poppins');
  assert.equal(tokens.fonts.body, 'Inter');
});

test('alternatives and a system from a picture are read from replies', () => {
  const formats = [{ id: 'phone', label: 'Phone', width: 390, height: 844 }];
  const reply = JSON.stringify({ title: 'T', mood: 'warm, quiet', system: { name: 'A', palette: { primary: '#112233' } }, boards: [{ name: 'Home', brief: 'x' }], alternatives: [{ mood: 'cool, sharp', system: { name: 'B', palette: { primary: '#334455' } } }, 'junk'] });
  const direction = prompts.parseDirection(reply, { kind: 'app', formats });
  assert.equal(direction.mood, 'warm, quiet');
  assert.equal(direction.alternatives.length, 1);
  assert.equal(direction.alternatives[0].tokens.palette.primary, '#334455');
  assert.match(prompts.buildDirectionPrompt({ kind: 'app', prompt: 'x', formats, sources: '', pictures: [], language: '', rtl: false, styleHint: '', fonts: ['Inter'], photos: false, boardCount: null, alternatives: 2 }).prompt, /"alternatives"/);
  assert.equal(prompts.parseSystem('{"system":{"name":"S","palette":{"accent":"#ff0000"}}}').palette.accent, '#ff0000');
});

const templates = await load('../src/utils/design/templates.ts');
const library = await load('../src/utils/design/promptLibrary.ts');
const inline = await load('../src/utils/design/inlineCss.ts');

test('every template resolves its sizes and has Arabic copy and boards', () => {
  assert.ok(templates.DESIGN_TEMPLATES.length >= 30);
  const ids = new Set();
  for (const template of templates.DESIGN_TEMPLATES) {
    assert.ok(!ids.has(template.id), template.id);
    ids.add(template.id);
    assert.ok(template.sizes.length > 0 && template.boards.length > 0, template.id);
    for (const size of template.sizes) {
      const resolved = formats.resolveFormat(size);
      assert.ok(resolved, `${template.id}: ${size}`);
      if (template.kind !== 'graphic') assert.equal(formats.findPreset(size)?.kind, template.kind, template.id);
    }
    if (template.kind === 'graphic') assert.equal(template.sizes.length, template.boards.length, template.id);
    assert.ok(/[؀-ۿ]/.test(template.ar.name) && /[؀-ۿ]/.test(template.ar.question), template.id);
    for (const field of template.fields) assert.ok(/[؀-ۿ]/.test(field.ar.label), `${template.id}.${field.id}`);
  }
  assert.ok(templates.categoriesOf('graphic').includes('Print'));
  assert.equal(templates.findTemplate('g-carousel').series, true);
});

test('the brief sent with a template lists the filled details and the planned boards', () => {
  const template = templates.findTemplate('g-poster');
  const extra = templates.composeExtra(template, { title: 'Open day', date: ' ', place: 'Main hall' });
  assert.match(extra, /- Title: Open day/);
  assert.match(extra, /- Place: Main hall/);
  assert.ok(!/Date and time/.test(extra));
  assert.match(extra, /1\. Poster:/);
  assert.match(templates.composeExtra(templates.findTemplate('g-carousel'), {}), /cards in this order/);
});

test('thumbnails keep aspect ratios and fit the box', () => {
  const rects = templates.thumbRects([{ width: 1080, height: 1350 }, { width: 1080, height: 1350 }], 64, 40);
  assert.equal(rects.length, 2);
  for (const rect of rects) {
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 64.01 && rect.y >= 0 && rect.y + rect.height <= 40.01);
    assert.ok(Math.abs(rect.width / rect.height - 0.8) < 0.01);
  }
  assert.deepEqual(templates.thumbRects([], 64, 40), []);
});

test('example prompts point at real templates and sizes', () => {
  for (const kind of ['app', 'web', 'graphic']) assert.ok(library.examplesFor(kind).length >= 6, kind);
  for (const example of library.EXAMPLE_PROMPTS) {
    if (example.templateId) assert.equal(templates.findTemplate(example.templateId)?.kind, example.kind, example.id);
    for (const size of example.sizes ?? []) assert.ok(formats.resolveFormat(size), `${example.id}: ${size}`);
    assert.ok(example.prompt.length > 60, example.id);
  }
});

test('a series keeps one board per card, in order, with repeated sizes', () => {
  const card = { id: 'ig-portrait', label: 'Instagram portrait', width: 1080, height: 1350 };
  const sized = [card, card, card];
  const reply = JSON.stringify({ system: {}, boards: [{ name: 'Hook', brief: 'a' }, { name: 'Point', brief: 'b' }, { name: 'Wrap', brief: 'c' }] });
  const direction = prompts.parseDirection(reply, { kind: 'graphic', formats: sized });
  assert.deepEqual(direction.boards.map((board) => board.name), ['Hook', 'Point', 'Wrap']);
  assert.deepEqual(direction.boards.map((board) => board.brief), ['a', 'b', 'c']);
  const asked = prompts.buildDirectionPrompt({ kind: 'graphic', prompt: 'x', formats: sized, sources: '', pictures: [], language: '', rtl: false, styleHint: '', fonts: ['Inter'], photos: false, boardCount: null, series: true });
  assert.match(asked.prompt, /cards of one series/);
});

test('email markup gets its styles inlined and its variables resolved', () => {
  const source = '<style>.btn{background:var(--ds-primary);color:#fff;padding:12px}p{margin:0}@media (max-width:480px){.btn{display:block}}div p{color:red}</style><div><p style="margin:4px">Hi</p><a class="btn">Go</a></div>';
  const html = safe.sanitizeHtml(source).html;
  const out = inline.emailMarkup(html, project.DEFAULT_TOKENS);
  assert.match(out, /<p [^>]*style="margin:4px"/);
  assert.match(out, /<a [^>]*class="btn"[^>]*style="[^"]*background: #18181b/);
  assert.ok(!/var\(--ds-/.test(out));
  assert.match(out, /^<style>@media/);
  assert.match(out, /div p\{color:red\}/);
  assert.ok(!/\.btn\{background/.test(out));
  assert.equal(inline.inlineStyles('<p data-yz="1">x</p>'), '<p data-yz="1">x</p>');
});

const tw = await load('../src/utils/design/tweaks.ts');

test('tweaks are read from the AI reply, repaired and capped', () => {
  const json = JSON.stringify([
    { id: 'Hero Layout', label: 'Hero layout', type: 'select', options: ['Split', 'Centred', 'Split', { value: 'Full bleed', label: 'Full bleed' }], default: 'Centred' },
    { id: 'accent', label: 'Accent', type: 'range', min: 0, max: 100, unit: '%', default: 140 },
    { id: 'quotes', type: 'toggle', default: 'off' },
    { id: 'bad-select', type: 'select', options: ['only'] },
    { id: 'bad-range', type: 'range', min: 5, max: 5 },
    { id: '1numeric', type: 'toggle' },
    { id: 'x', type: 'colour' },
    'junk',
    { id: 'a1', type: 'toggle' }, { id: 'a2', type: 'toggle' }, { id: 'a3', type: 'toggle' }, { id: 'a4', type: 'toggle' },
  ]);
  const tweaks = tw.parseTweaks(`\`\`\`json\n${json}\n\`\`\``);
  assert.equal(tweaks.length, 6);
  assert.deepEqual(tweaks.map((tweak) => tweak.id), ['hero-layout', 'accent', 'quotes', 'a1', 'a2', 'a3']);
  assert.deepEqual(tweaks[0].options.map((option) => option.value), ['split', 'centred', 'full-bleed']);
  assert.equal(tweaks[0].default, 'centred');
  assert.equal(tweaks[1].default, 100);
  assert.equal(tweaks[2].default, false);
  assert.deepEqual(tw.parseTweaks('not json'), []);
  assert.deepEqual(tw.parseTweaks('Here: [{"id":"d","type":"toggle"}] done')[0].id, 'd');
});

test('the tweaks block is split off the markup, also while it streams', () => {
  const done = tw.splitTweaks('<div>x</div><tweaks>[{"id":"a","type":"toggle"}]</tweaks>');
  assert.equal(done.markup, '<div>x</div>');
  assert.match(done.json, /"id":"a"/);
  const streaming = tw.splitTweaks('<div>x</div><tweaks>[{"id":"a","ty');
  assert.equal(streaming.markup, '<div>x</div>');
  assert.ok(streaming.json.startsWith('[{"id":"a"'));
  assert.equal(tw.splitTweaks('<div>x</div><tw').markup, '<div>x</div>');
  assert.deepEqual(tw.splitTweaks('<p>plain</p>'), { markup: '<p>plain</p>', json: null });
});

test('values are clamped and written as attributes and variables', () => {
  const tweaks = tw.parseTweaks([
    { id: 'layout', type: 'select', options: ['split', 'centred'], default: 'split' },
    { id: 'accent', type: 'range', min: 0, max: 100, unit: '%', default: 60 },
    { id: 'quotes', type: 'toggle', default: true },
  ]);
  const values = tw.normalizeValues(tweaks, { layout: 'nope', accent: 250, quotes: false, gone: 1 });
  assert.deepEqual(values, { layout: 'split', accent: 100, quotes: false });
  assert.deepEqual(tw.tweakAttributes(tweaks, values), { 'data-tw-layout': 'split', 'data-tw-quotes': 'off' });
  assert.deepEqual(tw.tweakVariables(tweaks, { accent: 42.5 }), { '--tw-layout': 'split', '--tw-accent': '42.5%', '--tw-accent-n': '42.5', '--tw-quotes': '1' });
  assert.equal(tw.rootAttributes(tweaks, values), ' data-tw-layout="split" data-tw-quotes="off" style="--tw-layout:split;--tw-accent:100%;--tw-accent-n:100;--tw-quotes:0"');
  assert.equal(tw.rootAttributes([], {}), '');
  assert.deepEqual(tw.defaultValues(tweaks), { layout: 'split', accent: 60, quotes: true });
});

test('a project keeps tweaks on its boards and repairs their values', () => {
  const draft = JSON.parse(project.serializeProject(project.createProject({ title: 'T', kind: 'web', prompt: 'p', boards: [{ id: 'b', name: 'Home', brief: '', format: 'html', width: 1440, height: 900, x: 0, y: 0, source: '<p>x</p>' }] })));
  draft.boards[0].tweaks = [{ id: 'dense', label: 'Dense', type: 'toggle', default: false }];
  draft.boards[0].tweakValues = { dense: 'yes', other: 1 };
  const parsed = project.parseProject(JSON.stringify(draft));
  assert.equal(parsed.boards[0].tweaks.length, 1);
  assert.deepEqual(parsed.boards[0].tweakValues, { dense: false });
  draft.boards[0].format = 'svg';
  assert.equal(project.parseProject(JSON.stringify(draft)).boards[0].tweaks.length, 1);
});

test('the board prompt offers tweaks for html and, wired by attributes, for graphics', () => {
  const base = { name: 'Home', brief: 'b', width: 390, height: 844, tokens: project.DEFAULT_TOKENS, project: 'p', siblings: [], reference: '', language: '', rtl: false, photos: false, assets: [], fontStacks: { heading: 'Inter', body: 'Inter' } };
  const app = prompts.buildBoardPrompt({ ...base, kind: 'app', tweaks: tw.parseTweaks([{ id: 'dense', type: 'toggle' }]), current: '<p>x</p>' });
  assert.match(app.system, /<tweaks>/);
  assert.match(app.prompt, /current tweaks/);
  const graphic = prompts.buildBoardPrompt({ ...base, kind: 'graphic' }).system;
  assert.match(graphic, /data-tw-show/);
  assert.ok(!/\[data-tw-hero-layout/.test(graphic));
});

test('standalone pages carry the tweak values on their root', () => {
  const tweaks = tw.parseTweaks([{ id: 'dense', type: 'toggle', default: true }]);
  const page = exportUtils.standaloneBoardHtml({ name: 'A', width: 390, source: '<p>x</p>', tweaks, tweakValues: { dense: false } }, project.DEFAULT_TOKENS);
  assert.match(page, /<html [^>]*data-tw-dense="off"[^>]*style="--tw-dense:0"/);
});

const flow = await load('../src/utils/design/flow.ts');

const screen = (id, name, source, extra = {}) => ({ id, name, brief: '', format: 'html', width: 390, height: 844, x: 0, y: 0, source, ...extra });

test('data-goto survives the sanitizer as plain text and can be set by stamp', () => {
  const { html } = safe.sanitizeHtml('<div><button data-goto="Checkout <b>now</b>">Buy</button><a data-goto="  ">x</a></div>');
  assert.match(html, /data-goto="Checkout bnow\/b"/);
  assert.ok(!/data-goto="\s*"/.test(html));
  const id = /<button data-yz="(\d+)"/.exec(html)[1];
  const cleared = edit.setElementAttr(html, id, 'data-goto', '');
  assert.ok(!/data-goto/.test(cleared));
  assert.match(edit.setElementAttr(cleared, id, 'data-goto', 'Home'), /data-goto="Home"/);
});

test('links resolve by name, ignore size suffixes and make one arrow per pair', () => {
  const home = screen('a', 'Home', safe.sanitizeHtml('<nav><a data-goto="Profile">P</a><a data-goto="profile">P2</a><a data-goto="Nowhere">X</a></nav>').html);
  const profile = screen('b', 'Profile', '<p data-yz="1">x</p>');
  const profileTablet = screen('c', 'Profile · Tablet', '<p data-yz="1">x</p>', { width: 820 });
  const boards = [home, profile, profileTablet];
  assert.equal(flow.gotoLinks(home.source).length, 3);
  assert.equal(flow.resolveGoto(boards, 'PROFILE', 'a').id, 'b');
  assert.equal(flow.resolveGoto(boards, 'Profile · Tablet', 'a').id, 'c');
  assert.equal(flow.resolveGoto(boards, 'Prof', 'a'), null);
  assert.equal(flow.resolveGoto(boards, 'Nowhere', 'a'), null);
  const links = flow.boardLinks(boards);
  assert.deepEqual(links, [{ from: 'a', to: 'b', count: 2 }]);
  assert.deepEqual(flow.brokenLinks(boards, home).map((link) => link.target), ['Nowhere']);
  // A tablet copy links to the tablet version of its target when there is one.
  const tabletHome = screen('d', 'Home · Tablet', home.source, { width: 820 });
  assert.equal(flow.resolveGoto([...boards, tabletHome], 'Profile', 'd').id, 'c');
});

test('copies are named, placed beneath and never on another board', () => {
  assert.equal(flow.versionName('Home · Phone', 'Tablet'), 'Home · Tablet');
  const original = { x: 0, y: 0, width: 390, height: 844 };
  assert.deepEqual(flow.belowPosition(original, [original], { width: 820, height: 1180 }), { x: 0, y: 984 });
  const taken = { x: 0, y: 900, width: 500, height: 600 };
  const spot = flow.belowPosition(original, [original, taken], { width: 820, height: 1180 });
  assert.equal(spot.x, 0);
  assert.equal(spot.y, 900 + 600 + 140);
  assert.ok(flow.versionTargets('web', 'desktop').every((target) => target.id !== 'desktop'));
  assert.deepEqual(flow.versionTargets('graphic', undefined), []);
  assert.deepEqual(flow.SCREEN_STATES.map((state) => state.id), ['empty', 'loading', 'error', 'success']);
});

test('the board prompt tells the AI how to link screens', () => {
  const base = { name: 'Home', brief: 'b', width: 390, height: 844, tokens: project.DEFAULT_TOKENS, project: 'p', siblings: [{ name: 'Profile', brief: 'x' }], reference: '', language: '', rtl: false, photos: false, assets: [], fontStacks: { heading: 'Inter', body: 'Inter' } };
  assert.match(prompts.buildBoardPrompt({ ...base, kind: 'app' }).system, /data-goto/);
});

test('boards can be joined in a row, edge to edge', () => {
  const rects = { c: { x: 700, y: 30, width: 100, height: 100 }, a: { x: 0, y: 10, width: 100, height: 100 }, b: { x: 300, y: 0, width: 80, height: 100 } };
  const row = snap.rowRects(rects, 0);
  assert.deepEqual(row, { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 180, y: 0 } });
  assert.equal(snap.rowRects(rects, 16).c.x, 100 + 16 + 80 + 16);
  assert.deepEqual(snap.rowRects({}, 0), {});
});

test('a series exports in reading order with numbered names', () => {
  const card = (name) => ({ name, width: 1080, height: 1350 });
  assert.deepEqual(exportUtils.numberedNames([card('Cover'), card('Point 1'), card('Wrap up')]), ['01-Cover', '02-Point 1', '03-Wrap up']);
  assert.deepEqual(exportUtils.numberedNames([card('Post'), { name: 'Story', width: 1080, height: 1920 }]), ['Post', 'Story']);
  assert.deepEqual(exportUtils.numberedNames([card('Only')]), ['Only']);
});

test('colours in svg are recoloured through a map and bad ones are left', () => {
  const out = color.recolorHexes('<rect fill="#ffffff"/><rect fill="#123456"/>', (hex) => { if (hex === '#123456') throw new Error('no'); return '#000000'; });
  assert.equal(out, '<rect fill="#000000"/><rect fill="#123456"/>');
});

test('restyle and web page prompts carry the request and the system shape', () => {
  const restyle = prompts.buildRestylePrompt({ current: project.DEFAULT_TOKENS, instruction: 'warmer, softer', fonts: ['Inter', 'Lora'], language: '' });
  assert.match(restyle.prompt, /Change requested: warmer, softer/);
  assert.match(restyle.prompt, /"palette"/);
  const url = prompts.buildSystemFromUrlPrompt({ url: 'https://example.com', fonts: ['Inter'], language: 'Arabic' });
  assert.match(url.prompt, /Website: https:\/\/example\.com/);
  assert.match(url.prompt, /Arabic/);
  assert.equal(prompts.parseSystem('{"system":{"name":"R"}}').name, 'R');
});

test('a board keeps its group id', () => {
  const draft = JSON.parse(project.serializeProject(project.createProject({ title: 'T', kind: 'app', prompt: 'p', boards: [{ id: 'b', name: 'Home', brief: '', format: 'html', width: 390, height: 844, x: 0, y: 0, source: '', group: 'g1' }] })));
  assert.equal(project.parseProject(JSON.stringify(draft)).boards[0].group, 'g1');
});

const previews = await load('../src/utils/design/previewCache.ts');
const svgTw = await load('../src/utils/design/svgTweaks.ts');
const textFmt = await load('../src/utils/design/textFormat.ts');

test('preview keys change with the picture and sizes keep to a small budget', () => {
  const system = previews.systemSignature(project.DEFAULT_TOKENS);
  const board = { source: '<p>a</p>', width: 390, height: 844, theme: undefined, tweakValues: undefined };
  const key = previews.previewKey(board, system);
  assert.equal(previews.previewKey({ ...board }, system), key);
  assert.notEqual(previews.previewKey({ ...board, source: '<p>b</p>' }, system), key);
  assert.notEqual(previews.previewKey({ ...board, theme: 'dark' }, system), key);
  assert.notEqual(previews.previewKey({ ...board, tweakValues: { a: true } }, system), key);
  assert.notEqual(previews.previewKey(board, previews.systemSignature({ ...project.DEFAULT_TOKENS, radius: 30 })), key);
  assert.equal(previews.previewScale(240, 400), 1);
  assert.equal(previews.previewScale(1440, 900), 480 / 1440);
  assert.ok(previews.previewScale(1440, 9000) * 9000 <= 2400.001);
});

test('graphic tweaks show, hide and fade the elements they are wired to', () => {
  const tweaks = tw.parseTweaks([
    { id: 'badge', type: 'toggle', default: true },
    { id: 'layout', type: 'select', options: ['left', 'centre'], default: 'left' },
    { id: 'glow', type: 'range', min: 0, max: 100, default: 50 },
  ]);
  const svg = '<svg viewBox="0 0 10 10"><g data-tw-show="badge"><rect/></g><text data-tw-when="layout=left">L</text><text data-tw-when="layout=centre|right" opacity="0.8">C</text><circle data-tw-opacity="glow" r="2"/><rect id="plain"/></svg>';
  const initial = svgTw.applySvgTweaks(svg, tweaks, undefined);
  assert.ok(!/data-tw-show="badge"[^>]*display="none"/.test(initial));
  assert.match(initial, /<text data-tw-when="layout=centre\|right" opacity="[\d.]+" display="none">C<\/text>|<text data-tw-when="layout=centre\|right" display="none" opacity="0\.8">C<\/text>/);
  assert.match(initial, /<circle data-tw-opacity="glow" r="2" opacity="0\.5"\/>/);
  const changed = svgTw.applySvgTweaks(svg, tweaks, { badge: false, layout: 'centre', glow: 100 });
  assert.match(changed, /<g data-tw-show="badge" display="none">/);
  assert.match(changed, /<text data-tw-when="layout=left" display="none">L<\/text>/);
  assert.match(changed, /opacity="1"/);
  assert.equal(svgTw.applySvgTweaks('<svg><rect/></svg>', tweaks, {}), '<svg><rect/></svg>');
  assert.equal(svgTw.applySvgTweaks(svg, [], {}), svg);
});

test('drawn text is restyled by index, tspans included, and read back', () => {
  const svg = '<svg><text x="1" y="2" font-size="20" fill="#111111" style="font-weight:700;fill:#222222">A<tspan x="1" dy="24" font-size="18" fill="#333">B</tspan></text><text x="5" y="9">C</text></svg>';
  assert.deepEqual(textFmt.svgTextStyle(svg, 0), { font: '', size: 20, bold: true, italic: false, color: '#222222' });
  const next = textFmt.setSvgTextStyle(svg, 0, { size: 32, color: '#ff0000', bold: false, font: "'Lora', serif" });
  const first = textFmt.svgTextStyle(next, 0);
  assert.equal(first.size, 32);
  assert.equal(first.color, '#ff0000');
  assert.equal(first.bold, false);
  assert.equal(first.font, 'Lora');
  assert.ok(!/<tspan[^>]*(font-size|fill)=/.test(next));
  assert.match(next, /<text x="5" y="9">C<\/text>/);
  assert.equal(textFmt.setSvgTextStyle(svg, 7, { size: 9 }), svg);
  assert.match(textFmt.setSvgTextStyle(svg, 1, { italic: true }), /<text x="5" y="9" font-style="italic">C<\/text>/);
});

test('a modelled text box is formatted on every paragraph', () => {
  const model = { k: 'shape', id: 'e1', box: { x: 0, y: 0, w: 100, h: 40 }, geom: { prst: 'rect' }, fill: { t: 'none' }, line: null, tx: { p: [{ r: [{ t: 'Hi', sz: 20, f: 'Inter', c: '#000000' }], esz: 20, ef: 'Inter' }, { r: [{ t: 'there', sz: 20, f: 'Inter', c: '#000000' }] }], ins: [0, 0, 0, 0], anc: 't', wrap: true, fit: 'shape' } };
  assert.deepEqual(textFmt.modelTextStyle(model), { font: 'Inter', size: 20, bold: false, italic: false, color: '#000000' });
  const next = textFmt.formatModelText(model, { size: 40, bold: true, align: 'c', color: '#aa0000', font: 'Lora' });
  for (const para of next.tx.p) {
    assert.equal(para.al, 'c');
    assert.deepEqual(para.r.map((run) => [run.sz, run.b, run.c, run.f]), [[40, true, '#aa0000', 'Lora']]);
  }
  assert.equal(next.tx.p[0].esz, 40);
  assert.equal(textFmt.formatModelText({ k: 'picture', id: 'p' }, { size: 9 }).k, 'picture');
  assert.equal(textFmt.modelTextStyle({ k: 'picture' }), null);
});

test('text-heavy graphic templates ask for HTML and the rest stay free layout', () => {
  const html = templates.DESIGN_TEMPLATES.filter((template) => template.draw === 'html').map((template) => template.id).sort();
  assert.deepEqual(html, ['g-carousel', 'g-cert', 'g-infographic', 'g-menu', 'g-og', 'g-quote']);
  for (const template of templates.DESIGN_TEMPLATES) if (template.draw) assert.equal(template.kind, 'graphic', template.id);
  assert.equal(templates.findTemplate('g-poster').draw, undefined);
});

test('a graphic can be drawn as html on a fixed canvas or as svg', () => {
  const base = { name: 'Menu', brief: 'b', width: 1240, height: 1754, tokens: project.DEFAULT_TOKENS, project: 'p', siblings: [], reference: '', language: '', rtl: false, photos: false, assets: [], fontStacks: { heading: 'Inter', body: 'Inter' }, kind: 'graphic' };
  const html = prompts.buildBoardPrompt({ ...base, format: 'html' });
  assert.match(html.system, /FIXED canvas of exactly 1240×1754px/);
  assert.match(html.system, /<tweaks>/);
  assert.ok(!/viewBox="0 0 1240 1754"/.test(html.system));
  const svg = prompts.buildBoardPrompt({ ...base, format: 'svg' });
  assert.match(svg.system, /viewBox="0 0 1240 1754"/);
  assert.match(svg.system, /data-tw-show/);
  assert.match(prompts.buildBoardPrompt({ ...base }).system, /viewBox="0 0 1240 1754"/);
  assert.match(prompts.buildBoardPrompt({ ...base, kind: 'web', width: 1440, height: 900 }).system, /Draw ONE web page/);
});

const restyle = await load('../src/utils/design/svgRestyle.ts');
const colorMod = await load('../src/utils/design/color.ts');

test('system changes are written into a drawn graphic', () => {
  const before = project.defaultTokens ? project.defaultTokens() : null;
  const base = before ?? { palette: { surface: '#FFFFFF' }, fonts: { heading: 'Almarai', body: 'Alexandria' }, type: { display: 64, h1: 48, h2: 32, body: 16, caption: 12 }, radius: 8, spacing: 8, headingWeight: 700, lineHeight: 1.5, borderWidth: 2, shadow: 'soft' };
  const after = { ...base, type: { ...base.type, body: 20 }, headingWeight: 900, radius: 16, borderWidth: 4, shadow: 'strong', fonts: { heading: 'Cairo', body: 'Tajawal' } };
  const svg = `<svg viewBox="0 0 100 100"><rect width="80" height="60" rx="8" fill="${base.palette.surface}" stroke="#000" stroke-width="2"/><text font-family="'${base.fonts.heading}'" font-size="${base.type.h1}" font-weight="700">T</text><text font-family="${base.fonts.body}" font-size="${base.type.body}">B<tspan dy="24">x</tspan></text></svg>`;
  const next = colorMod.refontSvg(restyle.restyleSvg(svg, base, after, { width: 100, height: 100 }), base.fonts, after.fonts);
  assert.match(next, /rx="16"/);
  assert.match(next, /stroke-width="4"/);
  assert.match(next, /font-weight="900"/);
  assert.match(next, /font-size="20"/);
  assert.match(next, /font-family="'Cairo'"/);
  assert.match(next, /filter="url\(#yzShadow\)"/);
  assert.match(next, /<feDropShadow/);
  const back = restyle.restyleSvg(next, after, { ...after, shadow: 'none' }, { width: 100, height: 100 });
  assert.doesNotMatch(back, /yzShadow/);
});

test('faces the system never named follow a font change by their size', () => {
  const from = { heading: 'Alexandria', body: 'Cairo' };
  const to = { heading: 'Andalus', body: 'Almarai' };
  const svg = `<svg><text font-family="'Times New Roman', Georgia, serif" font-size="54">H</text><text font-family="'Times New Roman', serif" font-size="20">D</text><text font-family="'Segoe UI', Tahoma, sans-serif" font-size="19">B</text><text font-family="Consolas, monospace" font-size="14">C</text></svg>`;
  const next = colorMod.refontSvg(svg, from, to, 24);
  assert.equal((next.match(/'Andalus'/g) ?? []).length, 2);
  assert.match(next, /font-family="'Almarai', Tahoma, sans-serif"/);
  assert.match(next, /font-family="Consolas, monospace"/);
  // One face for everything: decided per element.
  const single = colorMod.refontSvg(`<svg><text font-family="Arial" font-size="60">H</text><text font-family="Arial" font-size="16">B</text></svg>`, from, to, 24);
  assert.match(single, /font-family="'Andalus'" font-size="60"/);
  assert.match(single, /font-family="'Almarai'" font-size="16"/);
  // Without a heading size only the system's own faces are swapped.
  assert.equal(colorMod.refontSvg(svg, from, to), svg);
});

const intents = await load('../src/utils/design/intents.ts');

test('the composer reads make-versions requests as making boards, not edits', () => {
  assert.deepEqual(intents.parseComposerIntent('make the header darker'), { kind: 'refine', instruction: 'make the header darker' });
  const many = intents.parseComposerIntent('Create multiple versions from the existing picture');
  assert.equal(many.kind, 'variations');
  assert.equal(many.count, 3);
  assert.equal(many.note, null);
  // The way the request was actually phrased: "create multiple images".
  const images = intents.parseComposerIntent('generate and create multiple images from the existing picture');
  assert.equal(images.kind, 'variations');
  assert.equal(images.note, null);
  const two = intents.parseComposerIntent('make 2 versions in a retro style');
  assert.equal(two.kind, 'variations');
  assert.equal(two.count, 2);
  assert.match(two.note, /retro style/);
  assert.equal(intents.parseComposerIntent('give me variations of this').kind, 'variations');
  assert.equal(intents.parseComposerIntent('try three different alternatives of the existing design').kind, 'variations');
  assert.equal(intents.parseComposerIntent('Create 3 different versions of this.').note, null);
});

test('the composer reads create-another requests with their canvas size', () => {
  const custom = intents.parseComposerIntent('create another image at 1200x628 with the summer sale design');
  assert.equal(custom.kind, 'newBoard');
  assert.equal(custom.format, '1200x628');
  assert.equal(custom.blank, false);
  assert.match(custom.brief, /summer sale design/);
  const spelled = intents.parseComposerIntent('another poster at 1080 × 1350 of our grand opening');
  assert.equal(spelled.kind, 'newBoard');
  assert.equal(spelled.format, '1080x1350');
  assert.match(spelled.brief, /grand opening/);
  const named = intents.parseComposerIntent('add another story about the new menu');
  assert.equal(named.kind, 'newBoard');
  assert.equal(named.format, 'story');
  const blank = intents.parseComposerIntent('add an empty canvas 800x600');
  assert.equal(blank.kind, 'newBoard');
  assert.equal(blank.blank, true);
  assert.equal(blank.format, '800x600');
  assert.equal(blank.brief, '');
  assert.equal(intents.parseComposerIntent('make an empty board').blank, true);
});

test('a new image named with its canvas size makes a board at that size', () => {
  // The design of the new image, given with the size of the new canvas.
  const named = intents.parseComposerIntent('the new image of a summer sale, size 1200x628');
  assert.equal(named.kind, 'newBoard');
  assert.equal(named.format, '1200x628');
  assert.equal(named.brief, 'a summer sale');
  const canvas = intents.parseComposerIntent('the size of the new canvas is 800x600');
  assert.equal(canvas.kind, 'newBoard');
  assert.equal(canvas.format, '800x600');
  assert.equal(canvas.brief, '');
  const colon = intents.parseComposerIntent('new image at 800x600: summer sale poster');
  assert.equal(colon.kind, 'newBoard');
  assert.equal(colon.format, '800x600');
  assert.equal(colon.brief, 'summer sale poster');
  const sized = intents.parseComposerIntent('summer poster at 1080x1920');
  assert.equal(sized.kind, 'newBoard');
  assert.equal(sized.format, '1080x1920');
  assert.equal(sized.brief, 'summer poster');
});

test('sizes in a change request stay a change, not a new board', () => {
  assert.equal(intents.parseComposerIntent('make the hero image 1200x628').kind, 'refine');
  assert.equal(intents.parseComposerIntent('make the new design bolder').kind, 'refine');
  assert.equal(intents.parseComposerIntent('change the image to 100x100').kind, 'refine');
  assert.equal(intents.parseComposerIntent('make the picture smaller').kind, 'refine');
  assert.equal(intents.parseComposerIntent('give the poster a calmer look').kind, 'newBoard');
});

test('quick actions stay edits except the board actions', () => {
  for (const kind of ['graphic', 'app', 'web']) {
    for (const scope of ['all', 'element']) {
      for (const action of quick.quickActionsFor(kind, scope)) {
        const intent = intents.parseComposerIntent(action.instruction);
        if (action.label === '3 versions') assert.equal(intent.kind, 'variations', action.label);
        else if (action.label === 'Blank board') assert.equal(intent.kind, 'newBoard', action.label);
        else assert.equal(intent.kind, 'refine', `${kind}/${scope}: ${action.label}`);
      }
    }
  }
  for (const instruction of [quick.ADD_TWEAKS_INSTRUCTION, quick.ADD_SVG_TWEAKS_INSTRUCTION]) {
    assert.equal(intents.parseComposerIntent(instruction).kind, 'refine');
  }
});

test('custom sizes accept the ways people write them', () => {
  assert.deepEqual(formats.resolveFormat('1200 × 628'), { id: '1200x628', label: 'Custom 1200 × 628', width: 1200, height: 628 });
  assert.deepEqual(formats.resolveFormat('1200 by 628'), { id: '1200x628', label: 'Custom 1200 × 628', width: 1200, height: 628 });
  assert.equal(intents.readCount('make six versions'), 6);
  assert.equal(intents.readCount('versions'), 3);
});

test('the composer plan routes by intent, scope and project', () => {
  // With an element picked, words are about that element.
  assert.equal(intents.planComposerAction('create 3 versions', { picked: true, kind: 'graphic' }).kind, 'refine');
  const change = intents.planComposerAction('make the header darker', { picked: false, kind: 'graphic' });
  assert.deepEqual(change, { kind: 'refine', instruction: 'make the header darker' });
  const versions = intents.planComposerAction('create 3 versions', { picked: false, kind: 'graphic' });
  assert.equal(versions.kind, 'variations');
  assert.equal(versions.count, 3);
  const drawn = intents.planComposerAction('another image at 1200x628 of the summer sale', { picked: false, kind: 'graphic', lastPreset: 'ig-post' });
  assert.equal(drawn.kind, 'newBoard');
  assert.equal(drawn.format, '1200x628');
  assert.equal(drawn.blank, false);
  // A size is not typed: the project's last size, then the kind's default.
  assert.equal(intents.planComposerAction('another image of the summer sale', { picked: false, kind: 'graphic', lastPreset: 'story' }).format, 'story');
  assert.equal(intents.planComposerAction('another image of the summer sale', { picked: false, kind: 'graphic' }).format, 'ig-post');
  assert.deepEqual(intents.planComposerAction('add an empty canvas', { picked: false, kind: 'graphic' }), { kind: 'newBoard', brief: '', format: 'ig-post', blank: true });
});

test('a blank board stays an empty canvas through save and load', () => {
  const made = project.createProject({ title: 'T', kind: 'graphic', prompt: '', boards: [] });
  const withBlank = { ...made, boards: [{ id: 'b1', name: 'Facebook cover', brief: '', format: 'svg', width: 1640, height: 624, preset: 'facebook-cover', x: 0, y: 0, source: '', status: 'blank' }] };
  const back = project.parseProject(project.serializeProject(withBlank));
  assert.equal(back.boards[0].status, 'blank');
  assert.equal(back.boards[0].source, '');
  // A blank board that gained a drawing is done; an interrupted draw is still a failure.
  assert.equal(project.parseProject(JSON.stringify({ kind: 'graphic', boards: [{ source: '<svg viewBox="0 0 1 1"></svg>', status: 'blank' }] })).boards[0].status, 'done');
  assert.equal(project.parseProject(JSON.stringify({ kind: 'graphic', boards: [{ status: 'pending', source: '', brief: 'A poster about coffee' }] })).boards[0].status, 'failed');
  // An empty board saved without a brief was blank on purpose (even before blank existed).
  assert.equal(project.parseProject(JSON.stringify({ kind: 'graphic', boards: [{ status: 'pending', source: '', brief: '' }] })).boards[0].status, 'blank');
  assert.equal(project.parseProject(JSON.stringify({ kind: 'graphic', boards: [{ status: 'drawing', source: '' }] })).boards[0].status, 'failed');
  assert.equal(quick.statusLabel('blank', false), 'Empty canvas');
  assert.equal(quick.statusLabel('failed', false), 'Could not be drawn');
});

test('every empty board state names itself and its action', () => {
  assert.deepEqual(quick.emptyBoardState('blank'), { skeleton: false, message: 'Empty canvas', action: 'Draw' });
  assert.deepEqual(quick.emptyBoardState('failed'), { skeleton: false, message: 'Could not be drawn', action: 'Try again' });
  assert.deepEqual(quick.emptyBoardState('pending'), { skeleton: true, message: 'Waiting in line', action: null });
  assert.deepEqual(quick.emptyBoardState('drawing'), { skeleton: true, message: 'Drawing…', action: null });
  assert.deepEqual(quick.emptyBoardState(undefined), { skeleton: false, message: 'Not drawn yet', action: 'Draw' });
});

const ui = await load('./design-ui.ts');

test('the size picker and the composer bar render their controls', () => {
  const noop = () => undefined;
  const picker = ui.renderToString(ui.React.createElement(ui.BoardSizePicker, { kind: 'graphic', label: 'Add blank board', onCreate: noop }));
  assert.match(picker, /Add blank board/);
  assert.match(picker, /Custom size/);
  assert.match(picker, /Instagram post/);
  assert.match(picker, /Facebook cover/);
  const props = {
    kind: 'graphic', boardCount: 2, selectedCount: 0, picked: null, busy: false, reviewing: false, status: null,
    onSend: noop, onAddDrawn: noop, onAddBlank: noop, onVersions: noop, onStop: noop, onKeep: noop, onDiscard: noop, onClearPicked: noop, onHoldBefore: noop,
  };
  const bar = ui.renderToString(ui.React.createElement(ui.DesignPromptBar, props));
  assert.match(bar, /Versions/);
  assert.match(bar, /New/);
  assert.match(bar, /3 versions/);
  assert.match(bar, /Blank board/);
  assert.match(bar, /make the header darker/);
  const reviewing = ui.renderToString(ui.React.createElement(ui.DesignPromptBar, { ...props, reviewing: true }));
  assert.match(reviewing, /Keep it\?/);
  assert.match(reviewing, /Hold for before/);
  assert.match(reviewing, /Discard/);
});

// React's scheduler leaves a handle open once its bundle is imported; exit anyway.
test.after(() => {
  setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref();
});
