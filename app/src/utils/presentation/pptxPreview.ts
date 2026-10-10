// Makes pptx-viewer draw a slide the way PowerPoint does. The viewer only reads
// a run's own <a:rPr>, trims every <a:t>, drops <a:br>, ignores the shape's
// p:style (theme fill, line, shadow and font) and uses the browser's line
// height. PowerPoint resolves text through a chain (presentation defaults or
// the master's text styles, the master and layout placeholders, the shape's
// p:style fontRef and lstStyle, the paragraph's defRPr, the run). This rewrites
// a copy of the package with every value resolved onto the paragraph, run and
// shape, so the viewer has nothing left to guess. The file itself is never
// changed: this copy only feeds the preview. `refinePptxSvg` then fixes the few
// things only visible in the drawn SVG (bullet size, overflow).

import JSZip from 'jszip';
import { childElements, childPath, descendants, firstChild, readRels, readXml, REL_TYPES, serializeXml } from './pptxPackage';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const ZWSP = '​';
/** PowerPoint's single line spacing, as a multiple of the font size. */
const LINE = 1.2;
/** Run size when nothing in the chain sets one (hundredths of a point). */
const DEFAULT_SIZE = 1800;

// Property merging --------------------------------------------------------------

/** Children that replace each other: a later fill replaces any earlier fill. */
const RUN_GROUPS: Record<string, string> = {
  'a:noFill': 'fill', 'a:solidFill': 'fill', 'a:gradFill': 'fill', 'a:blipFill': 'fill', 'a:pattFill': 'fill', 'a:grpFill': 'fill',
  'a:effectLst': 'effect', 'a:effectDag': 'effect',
  'a:uLnTx': 'uLn', 'a:uLn': 'uLn',
  'a:uFillTx': 'uFill', 'a:uFill': 'uFill',
};
const RUN_ORDER = ['a:ln', 'fill', 'effect', 'a:highlight', 'uLn', 'uFill', 'a:latin', 'a:ea', 'a:cs', 'a:sym', 'a:hlinkClick', 'a:hlinkMouseOver', 'a:rtl'];

const PARA_GROUPS: Record<string, string> = {
  'a:buClrTx': 'buClr', 'a:buClr': 'buClr',
  'a:buSzTx': 'buSz', 'a:buSzPct': 'buSz', 'a:buSzPts': 'buSz',
  'a:buFontTx': 'buFont', 'a:buFont': 'buFont',
  'a:buNone': 'bu', 'a:buAutoNum': 'bu', 'a:buChar': 'bu', 'a:buBlip': 'bu',
};
const PARA_ORDER = ['a:lnSpc', 'a:spcBef', 'a:spcAft', 'buClr', 'buSz', 'buFont', 'bu', 'a:tabLst'];

interface Props {
  attrs: Map<string, string>;
  children: Map<string, Element>;
}

const emptyProps = (): Props => ({ attrs: new Map(), children: new Map() });

function mergeInto(props: Props, source: Element | null, groups: Record<string, string>, skip: Set<string> = new Set()): void {
  if (!source) return;
  for (const attribute of Array.from(source.attributes)) props.attrs.set(attribute.name, attribute.value);
  for (const child of childElements(source)) {
    if (skip.has(child.nodeName) || child.nodeName === 'a:extLst') continue;
    props.children.set(groups[child.nodeName] ?? child.nodeName, child);
  }
}

function writeProps(doc: Document, name: string, props: Props, order: string[], extra: Element[] = []): Element {
  const element = doc.createElementNS(A, name);
  for (const [key, value] of props.attrs) element.setAttribute(key, value);
  for (const key of order) {
    const child = props.children.get(key);
    if (child) element.appendChild(child.cloneNode(true));
  }
  for (const child of extra) element.appendChild(child);
  return element;
}

// Theme ---------------------------------------------------------------------------

interface Theme {
  /** `+mn-lt` style references to typefaces. */
  fonts: Map<string, string>;
  fills: Element[];
  bgFills: Element[];
  lines: Element[];
  effects: Element[];
}

function readTheme(doc: Document | null): Theme {
  const fonts = new Map<string, string>();
  const scheme = doc ? descendants(doc, 'a:fontScheme')[0] : undefined;
  for (const [kind, prefix] of [['a:majorFont', 'mj'], ['a:minorFont', 'mn']] as const) {
    const font = scheme ? firstChild(scheme, kind) : null;
    for (const [script, suffix] of [['a:latin', 'lt'], ['a:ea', 'ea'], ['a:cs', 'cs']] as const) {
      const typeface = font ? firstChild(font, script)?.getAttribute('typeface') : null;
      if (typeface) fonts.set(`+${prefix}-${suffix}`, typeface);
    }
  }
  if (!fonts.has('+mj-lt')) fonts.set('+mj-lt', 'Calibri Light');
  if (!fonts.has('+mn-lt')) fonts.set('+mn-lt', 'Calibri');
  const list = (name: string): Element[] => {
    const holder = doc ? descendants(doc, name)[0] : undefined;
    return holder ? childElements(holder) : [];
  };
  return {
    fonts,
    fills: list('a:fillStyleLst'),
    bgFills: list('a:bgFillStyleLst'),
    lines: list('a:lnStyleLst'),
    effects: list('a:effectStyleLst').map((style) => firstChild(style, 'a:effectLst')).filter((effect): effect is Element => Boolean(effect)),
  };
}

/** A theme style with its placeholder colour (`phClr`) replaced by `color`. */
function withColor(style: Element, color: Element | null): Element {
  const copy = style.cloneNode(true) as Element;
  if (!color) return copy;
  for (const placeholder of descendants(copy, 'a:schemeClr').filter((node) => node.getAttribute('val') === 'phClr')) {
    const replacement = color.cloneNode(true) as Element;
    // The theme's own tints and shades apply on top of the referenced colour.
    for (const modifier of childElements(placeholder)) replacement.appendChild(modifier.cloneNode(true));
    placeholder.parentNode?.replaceChild(replacement, placeholder);
  }
  return copy;
}

const colorOf = (ref: Element | null): Element | null => (ref ? childElements(ref).find((child) => /Clr$/.test(child.nodeName)) ?? null : null);

// Parts -----------------------------------------------------------------------------

interface Master {
  doc: Document;
  theme: Theme;
  /** Title, body and other text styles. */
  styles: { title: Element | null; body: Element | null; other: Element | null };
}

interface Context {
  defaults: Element | null;
  master: Master | null;
  layout: Document | null;
  theme: Theme;
}

const FILL_NAMES = new Set(['a:noFill', 'a:solidFill', 'a:gradFill', 'a:blipFill', 'a:pattFill', 'a:grpFill']);

function placeholderOf(shape: Element): { type: string; idx: string | null } | null {
  const ph = childPath(shape, 'p:nvSpPr', 'p:nvPr', 'p:ph');
  return ph ? { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') } : null;
}

const sameKind = (a: string, b: string): boolean => a === b || ((a === 'title' || a === 'ctrTitle') && (b === 'title' || b === 'ctrTitle'));

/** The placeholder shape in a layout or master that `ph` inherits from. */
function findPlaceholder(doc: Document | null, ph: { type: string; idx: string | null }, master: boolean): Element | null {
  if (!doc) return null;
  const shapes = descendants(doc, 'p:sp').map((shape) => ({ shape, ph: placeholderOf(shape) })).filter((entry) => entry.ph);
  if (!master && ph.idx !== null) {
    const byIdx = shapes.find((entry) => entry.ph!.idx === ph.idx);
    if (byIdx) return byIdx.shape;
  }
  const byType = shapes.find((entry) => sameKind(entry.ph!.type, ph.type));
  if (byType) return byType.shape;
  // A master has one body placeholder that subtitles and content inherit from.
  if (master && !['title', 'ctrTitle', 'dt', 'ftr', 'sldNum', 'hdr'].includes(ph.type)) return shapes.find((entry) => entry.ph!.type === 'body')?.shape ?? null;
  return null;
}

// Text --------------------------------------------------------------------------------

interface TextSources {
  /** List-style containers (txStyles, placeholder lstStyles, defaultTextStyle) before the shape's own, in order. */
  lists: Element[];
  fontRef: Element | null;
  /** bodyPr of the master and layout placeholders, in order. */
  bodyPrs: Element[];
}

function textSources(shape: Element, context: Context): TextSources {
  const ph = placeholderOf(shape);
  const lists: Element[] = [];
  const bodyPrs: Element[] = [];
  if (ph) {
    const { master } = context;
    const kind = ph.type === 'title' || ph.type === 'ctrTitle' ? 'title' : ['body', 'subTitle', 'obj'].includes(ph.type) ? 'body' : 'other';
    const style = master?.styles[kind];
    if (style) lists.push(style);
    for (const source of [findPlaceholder(master?.doc ?? null, ph, true), findPlaceholder(context.layout, ph, false)]) {
      if (!source || source === shape) continue;
      const list = childPath(source, 'p:txBody', 'a:lstStyle');
      const bodyPr = childPath(source, 'p:txBody', 'a:bodyPr');
      if (list) lists.push(list);
      if (bodyPr) bodyPrs.push(bodyPr);
    }
  } else if (context.defaults) {
    lists.push(context.defaults);
  }
  return { lists, fontRef: childPath(shape, 'p:style', 'a:fontRef'), bodyPrs };
}

function levelElements(list: Element, level: number): Element[] {
  return [firstChild(list, 'a:defPPr'), firstChild(list, `a:lvl${level + 1}pPr`)].filter((element): element is Element => Boolean(element));
}

function resolveFonts(props: Props, theme: Theme): void {
  for (const name of ['a:latin', 'a:ea', 'a:cs', 'a:sym']) {
    const font = props.children.get(name);
    const typeface = font?.getAttribute('typeface');
    if (!font || !typeface?.startsWith('+')) continue;
    const resolved = theme.fonts.get(typeface) ?? (typeface.endsWith('-lt') ? theme.fonts.get(typeface.slice(0, 4) + 'lt') : undefined);
    const copy = font.cloneNode(true) as Element;
    if (resolved) copy.setAttribute('typeface', resolved);
    else copy.removeAttribute('typeface');
    props.children.set(name, copy);
  }
}

/** Keeps leading and trailing spaces, which the viewer trims away. */
function guardSpaces(t: Element): void {
  const text = t.textContent ?? '';
  if (!/^\s|\s$/.test(text)) return;
  t.textContent = `${/^\s/.test(text) ? ZWSP : ''}${text}${/\s$/.test(text) ? ZWSP : ''}`;
}

function textRun(doc: Document, rPr: Element, text: string): Element {
  const run = doc.createElementNS(A, 'a:r');
  run.appendChild(rPr);
  const t = doc.createElementNS(A, 'a:t');
  t.textContent = text;
  run.appendChild(t);
  return run;
}

function normalizeBody(body: Element, base: Pick<TextSources, 'lists' | 'fontRef'>, theme: Theme): void {
  const doc = body.ownerDocument;
  const own = firstChild(body, 'a:lstStyle');
  const fontColor = colorOf(base.fontRef);
  const fontKind = base.fontRef?.getAttribute('idx');

  for (const paragraph of childElements(body, 'a:p')) {
    const pPr = firstChild(paragraph, 'a:pPr');
    const level = Math.min(8, Math.max(0, Number(pPr?.getAttribute('lvl') ?? 0) || 0));

    const para = emptyProps();
    const runBase = emptyProps();
    // Defaults and master styles, then the shape's p:style font, then its own
    // lstStyle, then the paragraph.
    for (const source of base.lists.flatMap((list) => levelElements(list, level))) {
      mergeInto(para, source, PARA_GROUPS, new Set(['a:defRPr']));
      mergeInto(runBase, firstChild(source, 'a:defRPr'), RUN_GROUPS);
    }
    const ownSources = own ? levelElements(own, level) : [];
    if (base.fontRef) {
      if (fontKind === 'major' || fontKind === 'minor') {
        const latin = doc.createElementNS(A, 'a:latin');
        latin.setAttribute('typeface', fontKind === 'major' ? '+mj-lt' : '+mn-lt');
        runBase.children.set('a:latin', latin);
      }
      if (fontColor) {
        const fill = doc.createElementNS(A, 'a:solidFill');
        fill.appendChild(fontColor.cloneNode(true));
        runBase.children.set('fill', fill);
      }
    }
    for (const source of ownSources) {
      mergeInto(para, source, PARA_GROUPS, new Set(['a:defRPr']));
      mergeInto(runBase, firstChild(source, 'a:defRPr'), RUN_GROUPS);
    }
    mergeInto(para, pPr, PARA_GROUPS, new Set(['a:defRPr']));
    mergeInto(runBase, pPr ? firstChild(pPr, 'a:defRPr') : null, RUN_GROUPS);

    const effective = (own: Element | null): Props => {
      const props: Props = { attrs: new Map(runBase.attrs), children: new Map(runBase.children) };
      mergeInto(props, own, RUN_GROUPS);
      if (!props.attrs.has('sz')) props.attrs.set('sz', String(DEFAULT_SIZE));
      resolveFonts(props, theme);
      return props;
    };

    // Runs, line breaks and fields, in order, as plain runs.
    const endParaRPr = firstChild(paragraph, 'a:endParaRPr');
    let sizes: number[] = [];
    let firstRun: Props | null = null;
    for (const child of childElements(paragraph)) {
      const name = child.nodeName;
      if (name !== 'a:r' && name !== 'a:br' && name !== 'a:fld') continue;
      const props = effective(firstChild(child, 'a:rPr'));
      sizes.push(Number(props.attrs.get('sz')));
      firstRun ??= props;
      const rPr = writeProps(doc, 'a:rPr', props, RUN_ORDER);
      if (name === 'a:br') {
        const run = textRun(doc, rPr, '\n');
        guardSpaces(firstChild(run, 'a:t')!);
        paragraph.replaceChild(run, child);
        continue;
      }
      const t = firstChild(child, 'a:t');
      const run = textRun(doc, rPr, t?.textContent ?? '');
      guardSpaces(firstChild(run, 'a:t')!);
      paragraph.replaceChild(run, child);
    }
    if (sizes.length === 0) {
      // An empty paragraph still takes a line at its end-of-paragraph size.
      const props = effective(endParaRPr);
      sizes = [Number(props.attrs.get('sz'))];
      paragraph.insertBefore(textRun(doc, writeProps(doc, 'a:rPr', props, RUN_ORDER), ZWSP), endParaRPr);
    }
    const size = Math.max(...sizes.filter((value) => value > 0), 100);

    // Spacing in the units the viewer reads: line spacing as a multiple of the
    // font size, space before/after in points.
    const lnSpc = para.children.get('a:lnSpc');
    const lnPct = lnSpc ? firstChild(lnSpc, 'a:spcPct') : null;
    const lnPts = lnSpc ? firstChild(lnSpc, 'a:spcPts') : null;
    const lineFactor = lnPts ? Number(lnPts.getAttribute('val') ?? 0) / size : LINE * (lnPct ? Number(lnPct.getAttribute('val') ?? 100000) / 100000 : 1);
    para.children.set('a:lnSpc', spacing(doc, 'a:lnSpc', 'a:spcPct', Math.round(lineFactor * 100000)));
    for (const name of ['a:spcBef', 'a:spcAft']) {
      const space = para.children.get(name);
      const pct = space ? firstChild(space, 'a:spcPct') : null;
      if (pct) para.children.set(name, spacing(doc, name, 'a:spcPts', Math.round((Number(pct.getAttribute('val') ?? 0) / 100000) * LINE * size)));
    }

    // Bullets take the first run's colour and font unless they set their own.
    const bullet = para.children.get('bu');
    if (bullet && bullet.nodeName !== 'a:buNone' && firstRun) {
      const fill = firstRun.children.get('fill');
      const color = fill?.nodeName === 'a:solidFill' ? colorOf(fill) : null;
      if ((!para.children.has('buClr') || para.children.get('buClr')!.nodeName === 'a:buClrTx') && color) {
        const buClr = doc.createElementNS(A, 'a:buClr');
        buClr.appendChild(color.cloneNode(true));
        para.children.set('buClr', buClr);
      }
      const latin = firstRun.children.get('a:latin');
      if ((!para.children.has('buFont') || para.children.get('buFont')!.nodeName === 'a:buFontTx') && latin?.getAttribute('typeface')) {
        const buFont = doc.createElementNS(A, 'a:buFont');
        buFont.setAttribute('typeface', latin.getAttribute('typeface')!);
        para.children.set('buFont', buFont);
      }
    }

    const nextPPr = writeProps(doc, 'a:pPr', para, PARA_ORDER);
    if (pPr) paragraph.replaceChild(nextPPr, pPr);
    else paragraph.insertBefore(nextPPr, paragraph.firstChild);
  }
}

function spacing(doc: Document, name: string, unit: string, value: number): Element {
  const element = doc.createElementNS(A, name);
  const inner = doc.createElementNS(A, unit);
  inner.setAttribute('val', String(value));
  element.appendChild(inner);
  return element;
}

// Shapes -------------------------------------------------------------------------------

/** PowerPoint's default corner size for presets whose `adj` the viewer guesses differently. */
const DEFAULT_ADJ: Record<string, number> = { roundRect: 16667, snip1Rect: 16667, snip2SameRect: 16667, snip2DiagRect: 16667, round1Rect: 16667, round2SameRect: 16667, round2DiagRect: 16667 };

/** Writes the theme fill, line and shadow a shape's p:style refers to into its spPr. */
function applyShapeStyle(shape: Element, theme: Theme): void {
  const spPr = firstChild(shape, 'p:spPr');
  const style = firstChild(shape, 'p:style');
  if (!spPr) return;
  const doc = shape.ownerDocument;

  const geometry = firstChild(spPr, 'a:prstGeom');
  const preset = geometry?.getAttribute('prst') ?? '';
  if (geometry && DEFAULT_ADJ[preset] !== undefined) {
    let avLst = firstChild(geometry, 'a:avLst');
    if (!avLst) avLst = geometry.appendChild(doc.createElementNS(A, 'a:avLst')) as Element;
    if (!childElements(avLst, 'a:gd').some((gd) => gd.getAttribute('name') === 'adj' || gd.getAttribute('name') === 'adj1')) {
      const gd = doc.createElementNS(A, 'a:gd');
      gd.setAttribute('name', 'adj');
      gd.setAttribute('fmla', `val ${DEFAULT_ADJ[preset]}`);
      avLst.appendChild(gd);
    }
  }

  if (!style) return;
  const ref = (name: string): { index: number; color: Element | null } | null => {
    const element = firstChild(style, name);
    if (!element) return null;
    return { index: Number(element.getAttribute('idx') ?? 0) || 0, color: colorOf(element) };
  };
  // spPr children in schema order: xfrm, geometry, fill, ln, effect, scene3d, sp3d.
  const before = (names: string[]): Node | null => childElements(spPr).find((child) => names.includes(child.nodeName)) ?? null;

  const fill = ref('a:fillRef');
  if (fill && fill.index > 0 && !childElements(spPr).some((child) => FILL_NAMES.has(child.nodeName))) {
    const source = fill.index >= 1001 ? theme.bgFills[fill.index - 1001] : theme.fills[fill.index - 1];
    if (source) spPr.insertBefore(withColor(source, fill.color), before(['a:ln', 'a:effectLst', 'a:effectDag', 'a:scene3d', 'a:sp3d', 'a:extLst']));
  }

  const line = ref('a:lnRef');
  const themeLine = line && line.index > 0 ? theme.lines[line.index - 1] : undefined;
  if (line && themeLine) {
    const resolved = withColor(themeLine, line.color);
    const ln = firstChild(spPr, 'a:ln');
    if (!ln) {
      spPr.insertBefore(resolved, before(['a:effectLst', 'a:effectDag', 'a:scene3d', 'a:sp3d', 'a:extLst']));
    } else {
      // The shape's own line settings win; the theme fills in the rest.
      for (const attribute of Array.from(resolved.attributes)) if (!ln.hasAttribute(attribute.name)) ln.setAttribute(attribute.name, attribute.value);
      if (!childElements(ln).some((child) => FILL_NAMES.has(child.nodeName))) {
        const themeFill = childElements(resolved).find((child) => FILL_NAMES.has(child.nodeName));
        if (themeFill) ln.insertBefore(themeFill.cloneNode(true), ln.firstChild);
      }
    }
  }

  const effect = ref('a:effectRef');
  if (effect && effect.index > 0 && !firstChild(spPr, 'a:effectLst') && !firstChild(spPr, 'a:effectDag')) {
    const source = theme.effects[effect.index - 1];
    if (source && childElements(source).length > 0) spPr.insertBefore(withColor(source, effect.color), before(['a:scene3d', 'a:sp3d', 'a:extLst']));
  }
}

/**
 * PowerPoint lays text out in the preset's text rectangle, not the shape's
 * box: a rounded rectangle keeps it clear of the corners, an ellipse inside
 * the inscribed rectangle. The viewer uses the box, so the difference goes
 * into the insets.
 */
function geometryInsets(shape: Element): void {
  const spPr = firstChild(shape, 'p:spPr');
  const bodyPr = childPath(shape, 'p:txBody', 'a:bodyPr');
  const geometry = spPr ? firstChild(spPr, 'a:prstGeom') : null;
  const ext = spPr ? childPath(spPr, 'a:xfrm', 'a:ext') : null;
  if (!bodyPr || !geometry || !ext) return;
  const width = Number(ext.getAttribute('cx') ?? 0);
  const height = Number(ext.getAttribute('cy') ?? 0);
  if (!(width > 0 && height > 0)) return;
  const adj = (name: string, fallback: number): number => {
    const gd = childElements(firstChild(geometry, 'a:avLst') ?? geometry, 'a:gd').find((entry) => entry.getAttribute('name') === name);
    const value = gd?.getAttribute('fmla')?.match(/val\s+(-?\d+)/)?.[1];
    return value === undefined ? fallback : Number(value);
  };
  let x = 0;
  let y = 0;
  switch (geometry.getAttribute('prst')) {
    case 'roundRect':
      x = y = Math.min(width, height) * (Math.min(50000, Math.max(0, adj('adj', 16667))) / 100000) * 0.29289;
      break;
    case 'ellipse':
      x = width * 0.14645;
      y = height * 0.14645;
      break;
    default:
      return;
  }
  const add = (name: string, fallback: number, extra: number): void => {
    bodyPr.setAttribute(name, String(Math.round(Number(bodyPr.getAttribute(name) ?? fallback) + extra)));
  };
  add('lIns', 91440, x);
  add('rIns', 91440, x);
  add('tIns', 45720, y);
  add('bIns', 45720, y);
}

/** Text boxes that do not wrap: widen them so the browser does not wrap either. */
function unwrapBox(shape: Element, slideWidth: number): void {
  const bodyPr = childPath(shape, 'p:txBody', 'a:bodyPr');
  if (bodyPr?.getAttribute('wrap') !== 'none') return;
  const spPr = firstChild(shape, 'p:spPr');
  // Only boxes without a visible shape: widening a filled shape would show.
  if (!spPr || childElements(spPr).some((child) => FILL_NAMES.has(child.nodeName) && child.nodeName !== 'a:noFill') || firstChild(shape, 'p:style')) return;
  const off = childPath(spPr, 'a:xfrm', 'a:off');
  const ext = childPath(spPr, 'a:xfrm', 'a:ext');
  if (!off || !ext) return;
  const x = Number(off.getAttribute('x') ?? 0);
  const cx = Number(ext.getAttribute('cx') ?? 0);
  const align = descendants(shape, 'a:pPr')[0]?.getAttribute('algn') ?? 'l';
  const grow = slideWidth;
  if (align === 'ctr') {
    off.setAttribute('x', String(Math.round(x - grow / 2)));
    ext.setAttribute('cx', String(Math.round(cx + grow)));
  } else if (align === 'r') {
    off.setAttribute('x', String(Math.round(x - grow)));
    ext.setAttribute('cx', String(Math.round(cx + grow)));
  } else {
    ext.setAttribute('cx', String(Math.round(cx + grow)));
  }
  bodyPr.setAttribute('wrap', 'square');
}

/** Placeholders take insets and anchoring from their layout and master. */
function inheritBodyPr(shape: Element, inherited: Element[]): void {
  const bodyPr = childPath(shape, 'p:txBody', 'a:bodyPr');
  if (!bodyPr || inherited.length === 0) return;
  for (const source of inherited) {
    for (const attribute of Array.from(source.attributes)) if (!bodyPr.hasAttribute(attribute.name)) bodyPr.setAttribute(attribute.name, attribute.value);
  }
  const fits = ['a:noAutofit', 'a:normAutofit', 'a:spAutoFit'];
  if (!childElements(bodyPr).some((child) => fits.includes(child.nodeName))) {
    const fit = [...inherited].reverse().map((source) => childElements(source).find((child) => fits.includes(child.nodeName))).find(Boolean);
    if (fit) bodyPr.appendChild(fit.cloneNode(true));
  }
}

function normalizePart(doc: Document, context: Context, options: { slideWidth: number; text: boolean }): void {
  for (const shape of descendants(doc, 'p:sp')) {
    applyShapeStyle(shape, context.theme);
    const body = firstChild(shape, 'p:txBody');
    // Layout and master placeholders only lend their styles; slides draw the text.
    if (!body || (!options.text && placeholderOf(shape))) continue;
    const sources = textSources(shape, context);
    inheritBodyPr(shape, sources.bodyPrs);
    geometryInsets(shape);
    normalizeBody(body, sources, context.theme);
    unwrapBox(shape, options.slideWidth);
  }
  // Table cells: the cell's own paragraph styling and the presentation defaults.
  for (const cell of descendants(doc, 'a:tc')) {
    const body = firstChild(cell, 'a:txBody');
    if (body) normalizeBody(body, { lists: context.defaults ? [context.defaults] : [], fontRef: null }, context.theme);
  }
}

// Package --------------------------------------------------------------------------------

const LAYOUT_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';

/** A copy of `bytes` with every inherited text and shape style written out for pptx-viewer. */
export async function preparePptxForPreview(bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const presentation = await readXml(zip, 'ppt/presentation.xml');
  if (!presentation) return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const defaults = descendants(presentation, 'p:defaultTextStyle')[0] ?? null;
  const slideWidth = Number(descendants(presentation, 'p:sldSz')[0]?.getAttribute('cx') ?? 12192000);

  const docs = new Map<string, Document>();
  const load = async (part: string): Promise<Document | null> => {
    if (!docs.has(part)) {
      const doc = await readXml(zip, part);
      if (!doc) return null;
      docs.set(part, doc);
    }
    return docs.get(part)!;
  };
  const themes = new Map<string, Theme>();
  const masters = new Map<string, Master>();
  const readMaster = async (part: string): Promise<Master | null> => {
    if (masters.has(part)) return masters.get(part)!;
    const doc = await load(part);
    if (!doc) return null;
    const themePart = (await readRels(zip, part)).find((rel) => rel.type === REL_TYPES.theme)?.target ?? null;
    let theme = themePart ? themes.get(themePart) : undefined;
    if (!theme) {
      theme = readTheme(themePart ? await readXml(zip, themePart) : null);
      if (themePart) themes.set(themePart, theme);
    }
    const txStyles = descendants(doc, 'p:txStyles')[0];
    const master: Master = {
      doc,
      theme,
      styles: {
        title: txStyles ? firstChild(txStyles, 'p:titleStyle') : null,
        body: txStyles ? firstChild(txStyles, 'p:bodyStyle') : null,
        other: txStyles ? firstChild(txStyles, 'p:otherStyle') : null,
      },
    };
    masters.set(part, master);
    return master;
  };

  const done = new Set<string>();
  const slideParts = (await readRels(zip, 'ppt/presentation.xml')).filter((rel) => rel.type === REL_TYPES.slide).map((rel) => rel.target);
  // Slides first, while layouts and masters are still untouched sources of style.
  const later: Array<{ part: string; context: Context }> = [];
  for (const part of slideParts) {
    const doc = await load(part);
    if (!doc) continue;
    const layoutPart = (await readRels(zip, part)).find((rel) => rel.type === LAYOUT_REL)?.target ?? null;
    const layout = layoutPart ? await load(layoutPart) : null;
    const masterPart = layoutPart ? (await readRels(zip, layoutPart)).find((rel) => rel.type === REL_TYPES.slideMaster)?.target ?? null : null;
    const master = masterPart ? await readMaster(masterPart) : null;
    const theme = master?.theme ?? readTheme(null);
    const context: Context = { defaults, master, layout, theme };
    normalizePart(doc, context, { slideWidth, text: true });
    done.add(part);
    if (layoutPart && !later.some((entry) => entry.part === layoutPart)) later.push({ part: layoutPart, context: { defaults, master, layout: null, theme } });
    if (masterPart && !later.some((entry) => entry.part === masterPart)) later.push({ part: masterPart, context: { defaults, master: null, layout: null, theme } });
  }
  for (const { part, context } of later) {
    const doc = docs.get(part);
    if (!doc) continue;
    normalizePart(doc, context, { slideWidth, text: false });
    done.add(part);
  }
  for (const part of done) zip.file(part, serializeXml(docs.get(part)!));
  return zip.generateAsync({ type: 'uint8array' });
}

// Drawn SVG ---------------------------------------------------------------------------------

const TEXT_ALIGN: Record<string, string> = { center: 'center', 'flex-end': 'right' };

/**
 * Fixes what the viewer gets wrong in the drawn SVG: text that runs past its
 * box stays visible (PowerPoint never clips); centred and right-aligned lines
 * are aligned inside their text span (the viewer only aligns the span, which
 * fills the line); lines are as tall as their own text, not at least the
 * page's font size; bullets are sized from their paragraph's text.
 */
export function refinePptxSvg(root: Element): void {
  for (const object of Array.from(root.querySelectorAll('foreignObject'))) {
    const box = object.firstElementChild as HTMLElement | null;
    // Text bodies are a flex column of <p>; tables are left alone.
    if (!box || box.tagName !== 'DIV' || box.style.flexDirection !== 'column') continue;
    object.setAttribute('overflow', 'visible');
    (object as SVGForeignObjectElement).style.overflow = 'visible';
    box.style.overflow = 'visible';
    box.style.fontSize = '0';
    for (const paragraph of Array.from(box.children) as HTMLElement[]) {
      if (paragraph.tagName !== 'P') continue;
      // PowerPoint keeps a line that is a little over half a pixel (at 96 dpi)
      // too wide for its box; the browser would wrap it. Measured: 0.55 px
      // over stays on one line in PowerPoint, 0.8 px over wraps.
      paragraph.style.marginRight = '-0.65px';
      const spans = Array.from(paragraph.children) as HTMLElement[];
      const text = spans[spans.length - 1];
      if (text) text.style.textAlign = TEXT_ALIGN[paragraph.style.justifyContent] ?? 'left';
      const bullet = spans.length > 1 ? spans[0] : undefined;
      if (!bullet || !text || bullet.style.flexShrink !== '0') continue;
      const firstRun = text.querySelector('span[style*="font-size"]') as HTMLElement | null;
      const size = firstRun ? parseFloat(firstRun.style.fontSize) : NaN;
      if (!Number.isFinite(size)) continue;
      const percent = bullet.style.fontSize.endsWith('%') ? parseFloat(bullet.style.fontSize) : 100;
      bullet.style.fontSize = `${(size * percent) / 100}px`;
      bullet.style.lineHeight = paragraph.style.lineHeight;
    }
    // Sub- and superscripts: the viewer sizes them from the page (0 here), not
    // the run, so take the size of the text around them.
    for (const span of Array.from(box.querySelectorAll('span')) as HTMLElement[]) {
      if (span.style.fontSize !== '0.7em') continue;
      const around = [span.previousElementSibling, span.nextElementSibling, ...Array.from(span.closest('p')?.querySelectorAll('span') ?? [])]
        .map((element) => (element as HTMLElement | null)?.style.fontSize ?? '')
        .filter((size) => size.endsWith('px'))
        .map((size) => parseFloat(size))
        .find((size) => size > 0);
      span.style.fontSize = `${(around ?? 24) * 0.7}px`;
    }
  }
}
