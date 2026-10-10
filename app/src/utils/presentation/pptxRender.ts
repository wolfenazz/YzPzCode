// Opens a .pptx as editable slides that look the way PowerPoint draws them.
// Every slide becomes one SVG slide (one in, one out): the master and layout
// artwork, the background, and each shape, picture, table, chart, group and
// SmartArt drawing, with text resolved through PowerPoint's inheritance chain
// (presentation defaults → master text styles → master and layout
// placeholders → the shape's style reference and list styles → paragraph →
// run), theme colours with their modifiers and the colour map, and the
// stored autofit scale. Elements carry the slide model (`slideModel.ts`) so
// the editor can edit them. Pictures are copied out for the deck's
// `assets/` folder. Uses the global DOMParser (tests install @xmldom/xmldom).

import {
  childElements,
  descendants,
  firstChild,
  openPptx,
  readNotes,
  readRels,
  readXml,
  type PptxPackage,
  type Rel,
} from './pptxPackage';
import { evaluateGuides, guideVars, type CustomPath, type Geometry } from './slideGeometry';
import {
  escapeXml,
  estimateMeasure,
  fontStack,
  renderBackground,
  renderElement,
  type Arrow,
  type Box,
  type GroupElement,
  type LineStyle,
  type Measure,
  type Paint,
  type PictureElement,
  type Shadow,
  type ShapeElement,
  type SlideElement,
  type TableCell,
  type TableElement,
  type TxBody,
  type TxBullet,
  type TxPara,
  type TxRun,
} from './slideModel';

export interface ImportedSlide {
  svg: string;
  title: string;
  notes: string;
  hidden: boolean;
  /** All the words on the slide (for the AI brief and search). */
  text: string;
}

export interface ImportedTheme {
  name: string;
  dark: boolean;
  palette: { background: string; surface: string; text: string; muted: string; primary: string; secondary: string; accent: string };
  chartColors: string[];
  fonts: { heading: string; body: string };
}

export interface ImportedPptx {
  title: string;
  size: '16:9' | '4:3';
  canvas: { width: number; height: number };
  slides: ImportedSlide[];
  /** Pictures for the deck's assets folder: file name → bytes. */
  assets: Record<string, Uint8Array>;
  theme: ImportedTheme;
  /** Things that could not be shown as in PowerPoint. */
  warnings: string[];
}

export interface ImportOptions {
  fileTitle: string;
  measure?: Measure;
  /** Called after each slide. */
  onProgress?: (done: number, total: number) => void;
  /** Only these slides (0-based), for previews. */
  only?: number[];
}

const REL = {
  image: '/image',
  chart: '/chart',
  slideLayout: '/slideLayout',
  slideMaster: '/slideMaster',
  theme: '/theme',
  diagramDrawing: '/diagramDrawing',
  diagramData: '/diagramData',
};
const relOfType = (rels: Rel[], suffix: string): Rel | undefined => rels.find((rel) => rel.type.endsWith(suffix));

const BROWSER_IMAGES: Record<string, string> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', bmp: 'bmp', svg: 'svg', webp: 'webp', jfif: 'jpg' };
const attr = (el: Element | null | undefined, name: string): string | null => (el ? el.getAttribute(name) : null);
const numAttr = (el: Element | null | undefined, name: string, fallback: number): number => {
  const value = attr(el, name);
  if (value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const boolAttr = (el: Element | null | undefined, name: string): boolean | null => {
  const value = attr(el, name);
  if (value === null) return null;
  return value === '1' || value === 'true' || value === 'on';
};
/** Child elements whatever their namespace prefix (`p:sp` and `dsp:sp` alike). */
const kids = (node: Node, local?: string): Element[] => childElements(node).filter((child) => !local || child.nodeName.replace(/^.*:/, '') === local);
const kid = (node: Node | null | undefined, local: string): Element | null => (node ? kids(node, local)[0] ?? null : null);
const kidPath = (node: Node | null | undefined, ...names: string[]): Element | null => {
  let current: Node | null | undefined = node;
  for (const name of names) {
    if (!current) return null;
    current = kid(current, name);
  }
  return (current as Element | null) ?? null;
};
const localName = (el: Element): string => el.nodeName.replace(/^.*:/, '');

// Colour -----------------------------------------------------------------------------------------

interface ThemeData {
  name: string;
  colors: Record<string, string>;
  major: { latin: string; ea: string; cs: string };
  minor: { latin: string; ea: string; cs: string };
  fills: Element[];
  lines: Element[];
  effects: Element[];
  bgFills: Element[];
}

const PRESET_COLORS: Record<string, string> = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', cyan: '00FFFF', magenta: 'FF00FF',
  gray: '808080', grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3', orange: 'FFA500', purple: '800080', navy: '000080', teal: '008080',
  maroon: '800000', olive: '808000', silver: 'C0C0C0', lime: '00FF00', aqua: '00FFFF', fuchsia: 'FF00FF', brown: 'A52A2A', pink: 'FFC0CB',
  gold: 'FFD700', darkBlue: '00008B', darkRed: '8B0000', darkGreen: '006400', lightBlue: 'ADD8E6', lightGreen: '90EE90', indigo: '4B0082',
};

const SYSTEM_COLORS: Record<string, string> = { windowText: '000000', window: 'FFFFFF', btnFace: 'F0F0F0', highlight: '0078D7', highlightText: 'FFFFFF', menuText: '000000', btnText: '000000', grayText: '6D6D6D', '3dDkShadow': '696969', '3dLight': 'E3E3E3' };

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue = (p: number, q: number, t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map((channel) => Math.round(clamp01(channel) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const parseHex = (value: string): [number, number, number] => {
  const clean = value.replace('#', '').padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map((index) => Number.parseInt(clean.slice(index, index + 2), 16) / 255) as [number, number, number];
};

interface ColorContext {
  theme: ThemeData;
  clrMap: Record<string, string>;
}

/** Resolves the colour element inside `container` (a fill, or the colour itself). */
function readColor(container: Element | null, ctx: ColorContext, phClr?: string): { c: string; a: number } | null {
  if (!container) return null;
  const kinds = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'];
  const el = kinds.includes(localName(container)) ? container : kids(container).find((child) => kinds.includes(localName(child))) ?? null;
  if (!el) return null;
  let rgb: [number, number, number];
  switch (localName(el)) {
    case 'srgbClr': rgb = parseHex(attr(el, 'val') ?? '000000'); break;
    case 'sysClr': rgb = parseHex(attr(el, 'lastClr') ?? SYSTEM_COLORS[attr(el, 'val') ?? ''] ?? '000000'); break;
    case 'prstClr': rgb = parseHex(PRESET_COLORS[attr(el, 'val') ?? ''] ?? '000000'); break;
    case 'scrgbClr': rgb = [numAttr(el, 'r', 0), numAttr(el, 'g', 0), numAttr(el, 'b', 0)].map((value) => toSrgb(value / 100000)) as [number, number, number]; break;
    case 'hslClr': rgb = hslToRgb(numAttr(el, 'hue', 0) / 21600000, numAttr(el, 'sat', 0) / 100000, numAttr(el, 'lum', 0) / 100000); break;
    default: {
      const val = attr(el, 'val') ?? 'tx1';
      if (val === 'phClr') {
        rgb = parseHex(phClr ?? ctx.theme.colors.dk1 ?? '000000');
      } else {
        const mapped = ctx.clrMap[val] ?? val;
        rgb = parseHex(ctx.theme.colors[mapped] ?? ctx.theme.colors[val] ?? '000000');
      }
    }
  }
  let [r, g, b] = rgb;
  let a = 1;
  for (const mod of kids(el)) {
    const v = numAttr(mod, 'val', 0) / 100000;
    switch (localName(mod)) {
      case 'alpha': a = v; break;
      case 'alphaMod': a *= v; break;
      case 'alphaOff': a += v; break;
      case 'lumMod': case 'lumOff': case 'satMod': case 'satOff': case 'hueMod': case 'hueOff': case 'lum': case 'sat': case 'hue': {
        let [h, s, l] = rgbToHsl(r, g, b);
        const name = localName(mod);
        if (name === 'lumMod') l *= v;
        else if (name === 'lumOff') l += v;
        else if (name === 'lum') l = v;
        else if (name === 'satMod') s *= v;
        else if (name === 'satOff') s += v;
        else if (name === 'sat') s = v;
        else if (name === 'hueMod') h *= v;
        else if (name === 'hueOff') h += numAttr(mod, 'val', 0) / 21600000;
        else if (name === 'hue') h = numAttr(mod, 'val', 0) / 21600000;
        [r, g, b] = hslToRgb(((h % 1) + 1) % 1, clamp01(s), clamp01(l));
        break;
      }
      case 'shade': [r, g, b] = [r, g, b].map((c) => toSrgb(toLinear(c) * v)) as [number, number, number]; break;
      case 'tint': [r, g, b] = [r, g, b].map((c) => toSrgb(toLinear(c) * v + (1 - v))) as [number, number, number]; break;
      case 'comp': { const [h, s, l] = rgbToHsl(r, g, b); [r, g, b] = hslToRgb((h + 0.5) % 1, s, l); break; }
      case 'inv': [r, g, b] = [1 - r, 1 - g, 1 - b]; break;
      case 'gray': { const y = 0.299 * r + 0.587 * g + 0.114 * b; [r, g, b] = [y, y, y]; break; }
      case 'redMod': r *= v; break;
      case 'greenMod': g *= v; break;
      case 'blueMod': b *= v; break;
      default: break;
    }
  }
  return { c: hex(r, g, b), a: clamp01(a) };
}

// Theme -------------------------------------------------------------------------------------------

async function readTheme(pkg: PptxPackage, part: string | null): Promise<ThemeData> {
  const doc = part ? await readXml(pkg.zip, part) : null;
  const scheme = doc ? descendants(doc, 'a:clrScheme')[0] ?? null : null;
  const colors: Record<string, string> = {};
  if (scheme) {
    for (const child of childElements(scheme)) {
      const name = localName(child);
      const color = kids(child)[0];
      if (!color) continue;
      colors[name] = localName(color) === 'sysClr' ? attr(color, 'lastClr') ?? SYSTEM_COLORS[attr(color, 'val') ?? ''] ?? '000000' : attr(color, 'val') ?? '000000';
    }
  }
  const defaults: Record<string, string> = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
  for (const [key, value] of Object.entries(defaults)) colors[key] ??= value;
  const fontScheme = doc ? descendants(doc, 'a:fontScheme')[0] ?? null : null;
  const fonts = (kind: string): { latin: string; ea: string; cs: string } => {
    const node = fontScheme ? kid(fontScheme, kind) : null;
    return {
      latin: attr(kid(node, 'latin'), 'typeface') || 'Calibri',
      ea: attr(kid(node, 'ea'), 'typeface') || '',
      cs: attr(kid(node, 'cs'), 'typeface') || '',
    };
  };
  const fmt = doc ? descendants(doc, 'a:fmtScheme')[0] ?? null : null;
  const list = (name: string): Element[] => {
    const holder = fmt ? kid(fmt, name) : null;
    return holder ? kids(holder) : [];
  };
  return {
    name: attr(scheme, 'name') ?? 'Theme',
    colors,
    major: fonts('majorFont'),
    minor: fonts('minorFont'),
    fills: list('fillStyleLst'),
    lines: list('lnStyleLst'),
    effects: list('effectStyleLst'),
    bgFills: list('bgFillStyleLst'),
  };
}

const DEFAULT_CLR_MAP: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' };

function readClrMap(el: Element | null, base: Record<string, string>): Record<string, string> {
  if (!el) return base;
  const out = { ...base };
  for (const attribute of Array.from(el.attributes)) if (!attribute.name.includes(':')) out[attribute.name] = attribute.value;
  return out;
}

// Parts of a slide's ancestry ----------------------------------------------------------------------

interface PartInfo {
  part: string;
  doc: Document;
  rels: Rel[];
}

interface MasterInfo extends PartInfo {
  theme: ThemeData;
  clrMap: Record<string, string>;
  titleStyle: Element | null;
  bodyStyle: Element | null;
  otherStyle: Element | null;
  placeholders: Element[];
}

interface LayoutInfo extends PartInfo {
  master: MasterInfo;
  clrMap: Record<string, string>;
  placeholders: Element[];
}

const spTreeOf = (doc: Document): Element | null => descendants(doc, 'p:spTree')[0] ?? null;
const phOf = (shape: Element): Element | null => {
  const nv = kids(shape).find((child) => /^nv/.test(localName(child)));
  return nv ? kidPath(nv, 'nvPr', 'ph') : null;
};
const placeholdersIn = (doc: Document): Element[] => {
  const tree = spTreeOf(doc);
  return tree ? kids(tree).filter((child) => phOf(child)) : [];
};

const normalizeType = (type: string | null): string => {
  const value = type ?? 'obj';
  if (value === 'ctrTitle') return 'title';
  if (value === 'subTitle' || value === 'obj') return 'body';
  return value;
};

function findPlaceholder(list: Element[], ph: Element, byIdx: boolean): Element | null {
  const type = attr(ph, 'type');
  const idx = attr(ph, 'idx');
  if (byIdx && idx !== null) {
    const match = list.find((shape) => attr(phOf(shape), 'idx') === idx);
    if (match) return match;
  }
  const wanted = normalizeType(type);
  return list.find((shape) => normalizeType(attr(phOf(shape), 'type')) === wanted) ?? null;
}

// The importer ------------------------------------------------------------------------------------

interface Ctx extends ColorContext {
  pkg: PptxPackage;
  /** px per EMU. */
  k: number;
  measure: Measure;
  master: MasterInfo;
  layout: LayoutInfo | null;
  /** The part whose relationships resolve `r:embed` ids for what is being read. */
  rels: Rel[];
  defaultTextStyle: Element | null;
  slideNumber: number;
  assets: Map<string, string>;
  assetBytes: Record<string, Uint8Array>;
  warnings: Set<string>;
  ids: { next: number };
  tableStyles: Map<string, Element>;
  /** Paint of the slide background, for `useBgFill`. */
  background: Paint;
}

interface Mapping { ax: number; ay: number; bx: number; by: number }

const newId = (ctx: Ctx): string => `e${ctx.ids.next++}`;
const emu = (ctx: Ctx, value: number): number => value * ctx.k;
/** Points (hundredths) → px. */
const ptPx = (ctx: Ctx, hundredths: number): number => (hundredths / 100) * 12700 * ctx.k;

async function assetFor(ctx: Ctx, rId: string | null): Promise<string> {
  if (!rId) return '';
  const rel = ctx.rels.find((entry) => entry.id === rId);
  if (!rel || rel.external) return '';
  const cached = ctx.assets.get(rel.target);
  if (cached !== undefined) return cached;
  const file = ctx.pkg.zip.file(rel.target);
  const extension = rel.target.split('.').pop()?.toLowerCase() ?? '';
  const kind = BROWSER_IMAGES[extension];
  if (!file || !kind) {
    if (file) ctx.warnings.add(`Some pictures are in a format the app cannot draw (${extension.toUpperCase()}); they show as empty frames.`);
    ctx.assets.set(rel.target, '');
    return '';
  }
  const base = rel.target.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-');
  let name = `${base}.${kind}`;
  let counter = 2;
  while (ctx.assetBytes[name]) name = `${base}-${counter++}.${kind}`;
  ctx.assetBytes[name] = await file.async('uint8array');
  const href = `assets/${name}`;
  ctx.assets.set(rel.target, href);
  return href;
}

// Fills, lines, effects ----------------------------------------------------------------------------

const FILL_TAGS = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'];
const fillChild = (props: Element | null): Element | null => (props ? kids(props).find((child) => FILL_TAGS.includes(localName(child))) ?? null : null);

const PATTERN_DENSITY: Record<string, number> = { pct5: 0.05, pct10: 0.1, pct20: 0.2, pct25: 0.25, pct30: 0.3, pct40: 0.4, pct50: 0.5, pct60: 0.6, pct70: 0.7, pct75: 0.75, pct80: 0.8, pct90: 0.9 };

async function readFill(fill: Element | null, ctx: Ctx, phClr?: string, groupFill?: Paint): Promise<Paint | undefined> {
  if (!fill) return undefined;
  switch (localName(fill)) {
    case 'noFill': return { t: 'none' };
    case 'solidFill': {
      const color = readColor(fill, ctx, phClr);
      return color ? { t: 'solid', c: color.c, a: color.a < 1 ? color.a : undefined } : { t: 'none' };
    }
    case 'gradFill': {
      const stops = descendants(fill, 'a:gs').map((gs) => {
        const color = readColor(gs, ctx, phClr) ?? { c: '#000000', a: 1 };
        return { o: numAttr(gs, 'pos', 0) / 100000, c: color.c, a: color.a < 1 ? color.a : undefined };
      }).sort((x, y) => x.o - y.o);
      if (stops.length === 0) return { t: 'none' };
      const lin = kid(fill, 'lin');
      const path = kid(fill, 'path');
      return { t: 'grad', stops, ang: lin ? numAttr(lin, 'ang', 0) / 60000 : path ? undefined : 90, path: path ? (attr(path, 'path') as 'circle' | 'rect' | 'shape') ?? 'circle' : undefined };
    }
    case 'blipFill': {
      const blip = kid(fill, 'blip');
      const href = await assetFor(ctx, attr(blip, 'r:embed'));
      if (!href) return { t: 'none' };
      const src = kid(fill, 'srcRect');
      const crop: [number, number, number, number] = [numAttr(src, 'l', 0), numAttr(src, 't', 0), numAttr(src, 'r', 0), numAttr(src, 'b', 0)].map((value) => value / 100000) as [number, number, number, number];
      const alphaMod = kid(blip, 'alphaModFix');
      return { t: 'img', href, crop: crop.some((value) => value !== 0) ? crop : undefined, a: alphaMod ? numAttr(alphaMod, 'amt', 100000) / 100000 : undefined };
    }
    case 'pattFill': {
      const fg = readColor(kid(fill, 'fgClr'), ctx, phClr) ?? { c: '#000000', a: 1 };
      const bg = readColor(kid(fill, 'bgClr'), ctx, phClr) ?? { c: '#FFFFFF', a: 1 };
      const density = PATTERN_DENSITY[attr(fill, 'prst') ?? ''] ?? 0.5;
      const [r1, g1, b1] = parseHex(fg.c);
      const [r2, g2, b2] = parseHex(bg.c);
      return { t: 'solid', c: hex(r2 + (r1 - r2) * density, g2 + (g1 - g2) * density, b2 + (b1 - b2) * density) };
    }
    case 'grpFill': return groupFill ?? { t: 'none' };
    default: return undefined;
  }
}

/** A theme style-matrix entry (fill, line or effect) by `idx`, with its placeholder colour. */
function styleRef(ref: Element | null, list: Element[], bgList: Element[] = []): { el: Element | null; phClr: Element | null } {
  if (!ref) return { el: null, phClr: null };
  const idx = numAttr(ref, 'idx', 0);
  const el = idx >= 1001 ? bgList[idx - 1001] ?? null : idx >= 1 ? list[idx - 1] ?? null : null;
  return { el, phClr: ref };
}

const ARROW_WIDTHS = new Set(['sm', 'med', 'lg']);
const readArrow = (el: Element | null): Arrow | undefined => {
  const type = attr(el, 'type');
  if (!el || !type || type === 'none') return undefined;
  const w = attr(el, 'w') ?? 'med';
  const len = attr(el, 'len') ?? 'med';
  return { type, w: (ARROW_WIDTHS.has(w) ? w : 'med') as Arrow['w'], len: (ARROW_WIDTHS.has(len) ? len : 'med') as Arrow['len'] };
};

/** Merges line definitions, lowest priority first. Returns null when there is no line. */
async function readLine(lines: Array<{ el: Element | null; phClr?: string }>, ctx: Ctx): Promise<LineStyle | null> {
  let paint: Paint | undefined;
  let width: number | undefined;
  let dash: string | undefined;
  let cap: LineStyle['cap'];
  let join: LineStyle['join'];
  let head: Arrow | undefined;
  let tail: Arrow | undefined;
  for (const { el, phClr } of lines) {
    if (!el) continue;
    const fill = await readFill(fillChild(el), ctx, phClr);
    if (fill) paint = fill;
    if (attr(el, 'w') !== null) width = emu(ctx, numAttr(el, 'w', 9525));
    const prstDash = attr(kid(el, 'prstDash'), 'val');
    if (prstDash) dash = prstDash === 'solid' ? undefined : prstDash;
    const capValue = attr(el, 'cap');
    if (capValue) cap = capValue as LineStyle['cap'];
    if (kid(el, 'round')) join = 'round';
    else if (kid(el, 'bevel')) join = 'bevel';
    else if (kid(el, 'miter')) join = 'miter';
    const headEnd = kid(el, 'headEnd');
    if (headEnd) head = readArrow(headEnd);
    const tailEnd = kid(el, 'tailEnd');
    if (tailEnd) tail = readArrow(tailEnd);
  }
  if (!paint || paint.t === 'none' || paint.t === 'img') return null;
  return { c: paint, w: Math.max(0.5, width ?? emu(ctx, 9525)), dash, cap, join, head, tail };
}

function readShadow(effectLst: Element | null, ctx: Ctx, phClr?: string): Shadow | undefined {
  const outer = kid(effectLst, 'outerShdw');
  if (!outer) return undefined;
  const color = readColor(outer, ctx, phClr) ?? { c: '#000000', a: 0.4 };
  const dist = emu(ctx, numAttr(outer, 'dist', 0));
  const dir = (numAttr(outer, 'dir', 0) / 60000) * (Math.PI / 180);
  return { c: color.c, a: color.a, blur: emu(ctx, numAttr(outer, 'blurRad', 0)), dx: dist * Math.cos(dir), dy: dist * Math.sin(dir) };
}

// Geometry -----------------------------------------------------------------------------------------

function readGeometry(spPr: Element | null): Geometry | null {
  const prst = kid(spPr, 'prstGeom');
  if (prst) {
    const av: Record<string, number> = {};
    for (const gd of descendants(prst, 'a:gd')) {
      const match = (attr(gd, 'fmla') ?? '').match(/^val\s+(-?[\d.]+)/);
      if (match) av[attr(gd, 'name') ?? 'adj'] = Number(match[1]);
    }
    return { prst: attr(prst, 'prst') ?? 'rect', av };
  }
  const cust = kid(spPr, 'custGeom');
  if (!cust) return null;
  const xfrmExt = kidPath(spPr, 'xfrm', 'ext');
  const guides = kids(kid(cust, 'gdLst') ?? cust.ownerDocument.createElement('none'), 'gd');
  const vars = evaluateGuides(guides.map((gd) => ({ name: attr(gd, 'name') ?? '', fmla: attr(gd, 'fmla') ?? '' })), guideVars(numAttr(xfrmExt, 'cx', 0), numAttr(xfrmExt, 'cy', 0)));
  const value = (raw: string | null): number => {
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : vars.get(raw) ?? 0;
  };
  const paths: CustomPath[] = [];
  for (const path of descendants(cust, 'a:path')) {
    const cmds: CustomPath['cmds'] = [];
    for (const cmd of kids(path)) {
      const points = kids(cmd, 'pt').flatMap((p) => [value(attr(p, 'x')), value(attr(p, 'y'))]);
      switch (localName(cmd)) {
        case 'moveTo': cmds.push(['M', ...points.slice(0, 2)]); break;
        case 'lnTo': cmds.push(['L', ...points.slice(0, 2)]); break;
        case 'cubicBezTo': cmds.push(['C', ...points.slice(0, 6)]); break;
        case 'quadBezTo': cmds.push(['Q', ...points.slice(0, 4)]); break;
        case 'arcTo': cmds.push(['A', value(attr(cmd, 'wR')), value(attr(cmd, 'hR')), value(attr(cmd, 'stAng')), value(attr(cmd, 'swAng'))]); break;
        case 'close': cmds.push(['Z']); break;
        default: break;
      }
    }
    const fillMode = attr(path, 'fill') ?? 'norm';
    paths.push({
      w: numAttr(path, 'w', numAttr(xfrmExt, 'cx', 0)),
      h: numAttr(path, 'h', numAttr(xfrmExt, 'cy', 0)),
      fill: (['none', 'lighten', 'lightenLess', 'darken', 'darkenLess'].includes(fillMode) ? fillMode : 'norm') as CustomPath['fill'],
      stroke: attr(path, 'stroke') !== '0' && attr(path, 'stroke') !== 'false',
      cmds,
    });
  }
  return paths.length ? { paths } : { prst: 'rect' };
}

interface Xfrm { box: Box; rot: number; flipH: boolean; flipV: boolean }

function readXfrm(xfrm: Element | null, map: Mapping): Xfrm | null {
  if (!xfrm) return null;
  const off = kid(xfrm, 'off');
  const ext = kid(xfrm, 'ext');
  if (!off && !ext) return null;
  const x = numAttr(off, 'x', 0);
  const y = numAttr(off, 'y', 0);
  const cx = numAttr(ext, 'cx', 0);
  const cy = numAttr(ext, 'cy', 0);
  return {
    box: { x: map.ax * x + map.bx, y: map.ay * y + map.by, w: Math.abs(map.ax * cx), h: Math.abs(map.ay * cy) },
    rot: numAttr(xfrm, 'rot', 0) / 60000,
    flipH: boolAttr(xfrm, 'flipH') ?? false,
    flipV: boolAttr(xfrm, 'flipV') ?? false,
  };
}

// Text ---------------------------------------------------------------------------------------------

interface TextSources {
  /** List-style-like elements (lvlNpPr holders), lowest priority first. */
  lists: Array<Element | null>;
  /** bodyPr elements, lowest priority first. */
  bodies: Array<Element | null>;
  /** The shape's `fontRef` (font and colour), applied above the master styles. */
  fontRef: Element | null;
  /** Index in `lists` at which the fontRef applies. */
  fontRefAt: number;
  /** Extra run defaults (table styles), applied above everything but the runs. */
  runDefaults?: { b?: boolean; i?: boolean; color?: { c: string; a: number }; font?: string };
}

const RTL_SCRIPT = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const CJK_SCRIPT = /[⺀-鿿가-힯豈-﫿＀-￯]/;

function resolveFont(ctx: Ctx, typeface: string | null): string | null {
  if (!typeface) return null;
  const theme = ctx.theme;
  switch (typeface) {
    case '+mj-lt': return theme.major.latin;
    case '+mn-lt': return theme.minor.latin;
    case '+mj-ea': return theme.major.ea || theme.major.latin;
    case '+mn-ea': return theme.minor.ea || theme.minor.latin;
    case '+mj-cs': return theme.major.cs || theme.major.latin;
    case '+mn-cs': return theme.minor.cs || theme.minor.latin;
    default: return typeface;
  }
}

function levelProps(lists: Array<Element | null>, level: number): Element[] {
  const out: Element[] = [];
  for (const list of lists) {
    if (!list) continue;
    const def = kid(list, 'defPPr');
    if (def) out.push(def);
    const lvl = kid(list, `lvl${level + 1}pPr`);
    if (lvl) out.push(lvl);
  }
  return out;
}

const lastAttr = (els: Element[], name: string): string | null => {
  for (let i = els.length - 1; i >= 0; i -= 1) {
    const value = els[i].getAttribute(name);
    if (value !== null && value !== '') return value;
  }
  return null;
};
const lastKid = (els: Element[], names: string[]): Element | null => {
  for (let i = els.length - 1; i >= 0; i -= 1) {
    const found = kids(els[i]).find((child) => names.includes(localName(child)));
    if (found) return found;
  }
  return null;
};

function spacingPx(el: Element | null, ctx: Ctx, size: number): number | undefined {
  if (!el) return undefined;
  const pts = kid(el, 'spcPts');
  if (pts) return ptPx(ctx, numAttr(pts, 'val', 0));
  const pct = kid(el, 'spcPct');
  if (pct) return (numAttr(pct, 'val', 0) / 100000) * size * 1.2;
  return undefined;
}

const SYMBOL_BULLETS: Record<string, string> = { '§': '■', 'Ø': '➢', 'ü': '✓', 'q': '❑', 'v': '❖', 'n': '■', 'l': '●', 'Ü': '➢', 'ð': '➢', 'à': '→', '¨': '□', 'o': '○', '·': '•', 'w': '◆', 'u': '◆', 'Ÿ': '•', 'è': '➜', 'Þ': '➤' };

async function readText(txBody: Element, sources: TextSources, ctx: Ctx, defaults: { anchor?: 't' | 'ctr' | 'b' } = {}): Promise<TxBody> {
  const bodyPrs = [...sources.bodies, kid(txBody, 'bodyPr')].filter((el): el is Element => Boolean(el));
  const lists = [...sources.lists, kid(txBody, 'lstStyle')];
  const ins: [number, number, number, number] = [
    emu(ctx, Number(lastAttr(bodyPrs, 'lIns') ?? 91440)),
    emu(ctx, Number(lastAttr(bodyPrs, 'tIns') ?? 45720)),
    emu(ctx, Number(lastAttr(bodyPrs, 'rIns') ?? 91440)),
    emu(ctx, Number(lastAttr(bodyPrs, 'bIns') ?? 45720)),
  ];
  const anchorRaw = lastAttr(bodyPrs, 'anchor');
  const anc: TxBody['anc'] = anchorRaw === 'ctr' ? 'ctr' : anchorRaw === 'b' ? 'b' : anchorRaw === 't' ? 't' : defaults.anchor ?? 't';
  const wrap = lastAttr(bodyPrs, 'wrap') !== 'none';
  const vertRaw = lastAttr(bodyPrs, 'vert');
  const vert: TxBody['vert'] = vertRaw === 'vert' || vertRaw === 'eaVert' ? 'vert' : vertRaw === 'vert270' ? 'vert270' : undefined;
  const autofit = lastKid(bodyPrs, ['normAutofit', 'spAutoFit', 'noAutofit']);
  const fit: TxBody['fit'] = autofit && localName(autofit) === 'normAutofit' ? 'norm' : autofit && localName(autofit) === 'spAutoFit' ? 'shape' : undefined;
  const fs = fit === 'norm' ? numAttr(autofit, 'fontScale', 100000) / 100000 : 1;
  const lr = fit === 'norm' ? numAttr(autofit, 'lnSpcReduction', 0) / 100000 : 0;

  const paragraphs: TxPara[] = [];
  for (const p of kids(txBody, 'p')) {
    const pPr = kid(p, 'pPr');
    const level = Math.max(0, Math.min(8, numAttr(pPr, 'lvl', 0)));
    const chain = levelProps(lists, level);
    const before = levelProps(lists.slice(0, sources.fontRefAt), level);
    const after = levelProps(lists.slice(sources.fontRefAt), level);
    const pChain = [...chain, ...(pPr ? [pPr] : [])];

    // Run properties: the defRPr of every level, the fontRef above the master styles, then the run.
    // PowerPoint also honours a paragraph's own defRPr, above the list styles.
    const runDefaults = [...before.map((el) => kid(el, 'defRPr')), null, ...after.map((el) => kid(el, 'defRPr')), kid(pPr, 'defRPr')];
    const fontRefAt = before.length;
    const resolveRun = (rPr: Element | null, text: string): TxRun => {
      const props = runDefaults.map((el, index) => (index === fontRefAt ? null : el)).filter((el): el is Element => Boolean(el));
      const all = rPr ? [...props, rPr] : props;
      const sz = Number(lastAttr(all, 'sz') ?? 1800);
      let color: { c: string; a: number } | null = null;
      let noFill = false;
      // Colour: the last level that sets a fill; the fontRef counts at its place in the chain.
      const ordered: Array<Element | 'fontRef'> = [...runDefaults.slice(0, fontRefAt).filter((el): el is Element => Boolean(el)), 'fontRef', ...runDefaults.slice(fontRefAt + 1).filter((el): el is Element => Boolean(el)), ...(rPr ? [rPr] : [])];
      for (let i = ordered.length - 1; i >= 0; i -= 1) {
        const entry = ordered[i];
        if (entry === 'fontRef') {
          if (sources.fontRef && readColor(sources.fontRef, ctx)) { color = readColor(sources.fontRef, ctx); break; }
          continue;
        }
        const fill = kids(entry).find((child) => ['solidFill', 'gradFill', 'noFill'].includes(localName(child)));
        if (!fill) continue;
        if (localName(fill) === 'noFill') { noFill = true; break; }
        if (localName(fill) === 'gradFill') {
          const gs = descendants(fill, 'a:gs')[0];
          color = gs ? readColor(gs, ctx) : null;
        } else color = readColor(fill, ctx);
        break;
      }
      if (sources.runDefaults?.color && !(rPr && kids(rPr).some((child) => ['solidFill', 'gradFill', 'noFill'].includes(localName(child))))) color = sources.runDefaults.color;
      if (!color && !noFill) color = { c: `#${ctx.theme.colors[ctx.clrMap.tx1 ?? 'dk1'] ?? '000000'}`, a: 1 };
      const link = rPr ? kid(rPr, 'hlinkClick') : null;
      if (link && attr(link, 'r:id')) color = { c: `#${ctx.theme.colors[ctx.clrMap.hlink ?? 'hlink'] ?? '0563C1'}`, a: 1 };
      // Font by script: complex scripts and CJK use their own typeface.
      const script = RTL_SCRIPT.test(text) ? 'cs' : CJK_SCRIPT.test(text) ? 'ea' : 'latin';
      const fontFrom = (els: Array<Element | 'fontRef'>, kind: string): string | null => {
        for (let i = els.length - 1; i >= 0; i -= 1) {
          const entry = els[i];
          if (entry === 'fontRef') {
            const idx = attr(sources.fontRef, 'idx');
            if (sources.fontRef && idx && idx !== 'none') return resolveFont(ctx, `+${idx === 'major' ? 'mj' : 'mn'}-${kind === 'latin' ? 'lt' : kind}`);
            continue;
          }
          const typeface = attr(kid(entry, kind), 'typeface');
          if (typeface) return resolveFont(ctx, typeface);
        }
        return null;
      };
      let font = (script !== 'latin' ? fontFrom(ordered, script) : null) ?? fontFrom(ordered, 'latin') ?? ctx.theme.minor.latin;
      if (sources.runDefaults?.font && !(rPr && kid(rPr, 'latin'))) font = sources.runDefaults.font;
      const b = boolAttr(rPr, 'b') ?? (lastAttr(props, 'b') !== null ? lastAttr(props, 'b') === '1' || lastAttr(props, 'b') === 'true' : sources.runDefaults?.b ?? false);
      const i = boolAttr(rPr, 'i') ?? (lastAttr(props, 'i') !== null ? lastAttr(props, 'i') === '1' || lastAttr(props, 'i') === 'true' : sources.runDefaults?.i ?? false);
      const u = lastAttr(all, 'u');
      const strike = lastAttr(all, 'strike');
      const baseline = Number(lastAttr(all, 'baseline') ?? 0);
      const spc = Number(lastAttr(all, 'spc') ?? 0);
      const cap = lastAttr(all, 'cap');
      const run: TxRun = { t: text, sz: ptPx(ctx, sz), f: font };
      if (color && !noFill) { run.c = color.c; if (color.a < 1) run.a = color.a; }
      if (b) run.b = true;
      if (i) run.i = true;
      if (u && u !== 'none') run.u = true;
      if (strike && strike !== 'noStrike') run.s = true;
      if (baseline) run.bl = baseline / 100000;
      if (spc) run.sp = ptPx(ctx, spc);
      if (cap === 'all' || cap === 'small') run.cap = cap;
      if (link) run.link = '1';
      return run;
    };

    const runs: TxRun[] = [];
    for (const child of kids(p)) {
      const name = localName(child);
      if (name === 'r' || name === 'fld') {
        let text = descendants(child, 'a:t').map((node) => node.textContent ?? '').join('');
        if (name === 'fld' && attr(child, 'type') === 'slidenum') text = String(ctx.slideNumber);
        const sym = kid(kid(child, 'rPr'), 'sym');
        if (sym && text.length === 1) text = SYMBOL_BULLETS[text] ?? text;
        if (text) runs.push(resolveRun(kid(child, 'rPr'), text));
      } else if (name === 'br') {
        runs.push({ ...resolveRun(kid(child, 'rPr'), ''), t: '\n' });
      }
    }
    const endRun = resolveRun(kid(p, 'endParaRPr'), '');
    const firstSize = runs.find((run) => run.t !== '\n')?.sz ?? endRun.sz;

    const para: TxPara = { r: runs };
    const algn = lastAttr(pChain, 'algn');
    if (algn === 'ctr') para.al = 'c';
    else if (algn === 'r') para.al = 'r';
    else if (algn === 'just' || algn === 'dist' || algn === 'justLow' || algn === 'thaiDist') para.al = 'j';
    const marL = lastAttr(pChain, 'marL');
    if (marL !== null) para.ml = emu(ctx, Number(marL));
    const indent = lastAttr(pChain, 'indent');
    if (indent !== null) para.ind = emu(ctx, Number(indent));
    if (level) para.lv = level;
    const lnSpc = lastKid(pChain, ['lnSpc']);
    if (lnSpc) {
      const pct = kid(lnSpc, 'spcPct');
      const pts = kid(lnSpc, 'spcPts');
      if (pct) para.ls = numAttr(pct, 'val', 100000) / 100000;
      else if (pts) para.ls = -ptPx(ctx, numAttr(pts, 'val', 0));
    }
    const sb = spacingPx(lastKid(pChain, ['spcBef']), ctx, firstSize * fs);
    if (sb) para.sb = sb;
    const sa = spacingPx(lastKid(pChain, ['spcAft']), ctx, firstSize * fs);
    if (sa) para.sa = sa;
    para.esz = endRun.sz;
    para.ef = endRun.f;

    // Bullets.
    const bulletKind = lastKid(pChain, ['buNone', 'buChar', 'buAutoNum', 'buBlip']);
    if (bulletKind && localName(bulletKind) !== 'buNone') {
      const bullet: TxBullet = {};
      const fontEl = lastKid(pChain, ['buFont', 'buFontTx']);
      const bulletFont = fontEl && localName(fontEl) === 'buFont' ? resolveFont(ctx, attr(fontEl, 'typeface')) : null;
      if (localName(bulletKind) === 'buChar') {
        const raw = attr(bulletKind, 'char') ?? '•';
        const symbolic = bulletFont && /wingdings|symbol|webdings/i.test(bulletFont);
        bullet.ch = symbolic ? SYMBOL_BULLETS[raw] ?? '•' : raw;
        if (bulletFont && !symbolic) bullet.f = bulletFont;
      } else if (localName(bulletKind) === 'buAutoNum') {
        bullet.num = attr(bulletKind, 'type') ?? 'arabicPeriod';
        const start = numAttr(bulletKind, 'startAt', 1);
        if (start !== 1) bullet.start = start;
      } else {
        bullet.ch = '•';
      }
      const colorEl = lastKid(pChain, ['buClr', 'buClrTx']);
      if (colorEl && localName(colorEl) === 'buClr') {
        const color = readColor(colorEl, ctx);
        if (color) bullet.c = color.c;
      }
      const sizeEl = lastKid(pChain, ['buSzPct', 'buSzPts', 'buSzTx']);
      if (sizeEl && localName(sizeEl) === 'buSzPct') bullet.sz = numAttr(sizeEl, 'val', 100000) / 100000;
      else if (sizeEl && localName(sizeEl) === 'buSzPts' && firstSize > 0) bullet.sz = ptPx(ctx, numAttr(sizeEl, 'val', 1800)) / firstSize;
      if (runs.some((run) => run.t.trim())) para.bu = bullet;
    }
    paragraphs.push(para);
  }
  const body: TxBody = { p: paragraphs, ins, anc, wrap };
  if (fit) body.fit = fit;
  if (fs !== 1) body.fs = fs;
  if (lr) body.lr = lr;
  if (vert) body.vert = vert;
  return body;
}

const hasText = (body: TxBody | undefined): boolean => Boolean(body?.p.some((para) => para.r.some((run) => run.t.trim())));

// Shapes ------------------------------------------------------------------------------------------

interface ShapeContext {
  map: Mapping;
  groupFill?: Paint;
  /** Shapes on masters and layouts: placeholders there are never drawn. */
  template: boolean;
}

function masterTextStyle(ctx: Ctx, type: string | null): Element | null {
  const t = type ?? 'obj';
  if (t === 'title' || t === 'ctrTitle') return ctx.master.titleStyle;
  if (['dt', 'ftr', 'sldNum', 'hdr'].includes(t)) return ctx.master.otherStyle;
  return ctx.master.bodyStyle;
}

/** The placeholder chain of a slide shape: [master shape, layout shape]. */
function placeholderChain(ctx: Ctx, ph: Element | null, onLayout: boolean): Element[] {
  if (!ph) return [];
  const chain: Element[] = [];
  const masterShape = findPlaceholder(ctx.master.placeholders, ph, false);
  if (masterShape) chain.push(masterShape);
  if (!onLayout && ctx.layout) {
    const layoutShape = findPlaceholder(ctx.layout.placeholders, ph, true);
    if (layoutShape) chain.push(layoutShape);
  }
  return chain;
}

async function readShape(shape: Element, ctx: Ctx, sc: ShapeContext, onLayout: boolean): Promise<SlideElement | null> {
  const nv = kids(shape).find((child) => /^nv/.test(localName(child)));
  const cNvPr = kid(nv, 'cNvPr');
  if (boolAttr(cNvPr, 'hidden')) return null;
  const ph = phOf(shape);
  if (ph && sc.template) return null;
  const chain = placeholderChain(ctx, ph, onLayout);
  const spPr = kid(shape, 'spPr');
  const chainSpPr = chain.map((el) => kid(el, 'spPr'));
  const xfrm = readXfrm(kid(spPr, 'xfrm'), sc.map)
    ?? [...chainSpPr].reverse().map((props) => readXfrm(kid(props, 'xfrm'), { ax: ctx.k, ay: ctx.k, bx: 0, by: 0 })).find(Boolean)
    ?? null;
  if (!xfrm) return null;
  const style = kid(shape, 'style');
  const geom = readGeometry(spPr) ?? [...chainSpPr].reverse().map(readGeometry).find(Boolean) ?? { prst: 'rect' };

  // Fill: the shape's own, a placeholder's, the style reference, else none.
  let fill = await readFill(fillChild(spPr), ctx, undefined, sc.groupFill);
  if (!fill) for (const props of [...chainSpPr].reverse()) { fill = await readFill(fillChild(props), ctx, undefined, sc.groupFill); if (fill) break; }
  if (!fill && style) {
    const ref = styleRef(kid(style, 'fillRef'), ctx.theme.fills, ctx.theme.bgFills);
    const phClr = readColor(ref.phClr, ctx)?.c;
    fill = ref.el ? await readFill(ref.el, ctx, phClr) : { t: 'none' };
  }
  if (boolAttr(shape, 'useBgFill')) fill = ctx.background;
  fill ??= { t: 'none' };

  // Line: style reference, then placeholders, then the shape's own.
  const lineSources: Array<{ el: Element | null; phClr?: string }> = [];
  if (style) {
    const ref = styleRef(kid(style, 'lnRef'), ctx.theme.lines);
    if (ref.el) lineSources.push({ el: ref.el, phClr: readColor(ref.phClr, ctx)?.c });
  }
  for (const props of chainSpPr) lineSources.push({ el: kid(props, 'ln') });
  lineSources.push({ el: kid(spPr, 'ln') });
  const line = await readLine(lineSources, ctx);

  // Effects: the shape's list replaces the style's.
  let shadow: Shadow | undefined;
  const ownEffects = kid(spPr, 'effectLst') ?? [...chainSpPr].reverse().map((props) => kid(props, 'effectLst')).find(Boolean) ?? null;
  if (ownEffects) shadow = readShadow(ownEffects, ctx);
  else if (style) {
    const ref = styleRef(kid(style, 'effectRef'), ctx.theme.effects);
    if (ref.el) shadow = readShadow(kid(ref.el, 'effectLst'), ctx, readColor(ref.phClr, ctx)?.c);
  }

  let tx: TxBody | undefined;
  const txBody = kid(shape, 'txBody');
  if (txBody) {
    const type = ph ? attr(ph, 'type') : null;
    const lists: Array<Element | null> = ph ? [masterTextStyle(ctx, type)] : [ctx.defaultTextStyle];
    const fontRefAt = lists.length;
    for (const el of chain) lists.push(kidPath(el, 'txBody', 'lstStyle'));
    const bodies = chain.map((el) => kidPath(el, 'txBody', 'bodyPr'));
    tx = await readText(txBody, { lists, bodies, fontRef: kid(style, 'fontRef'), fontRefAt }, ctx);
    if (!hasText(tx)) tx = undefined;
  }
  // A text box laid out in its own frame (SmartArt).
  const txXfrm = kid(shape, 'txXfrm');
  const el: ShapeElement = {
    k: 'shape',
    id: newId(ctx),
    box: xfrm.box,
    geom,
    fill,
    line,
  };
  if (xfrm.rot) el.rot = xfrm.rot;
  if (xfrm.flipH) el.flipH = true;
  if (xfrm.flipV) el.flipV = true;
  if (shadow) el.shadow = shadow;
  const name = attr(cNvPr, 'name');
  if (name) el.name = name;
  if (tx && txXfrm) {
    const frame = readXfrm(txXfrm, sc.map);
    if (frame && (Math.abs(frame.box.x - xfrm.box.x) > 1 || Math.abs(frame.box.y - xfrm.box.y) > 1 || Math.abs(frame.box.w - xfrm.box.w) > 1 || Math.abs(frame.box.h - xfrm.box.h) > 1)) {
      // The text frame differs from the shape: draw the shape, then the text as its own box.
      const textBox: ShapeElement = { k: 'shape', id: newId(ctx), box: frame.box, geom: { prst: 'rect' }, fill: { t: 'none' }, line: null, tx };
      if (frame.rot) textBox.rot = frame.rot;
      return { k: 'group', id: newId(ctx), box: unionBox([el.box, frame.box]), ch: [el, textBox] };
    }
  }
  if (tx) el.tx = tx;
  if (fill.t === 'none' && !line && !tx) return null;
  return el;
}

async function readPicture(pic: Element, ctx: Ctx, sc: ShapeContext, onLayout: boolean, frameBox?: Xfrm): Promise<PictureElement | null> {
  const nv = kid(pic, 'nvPicPr');
  const cNvPr = kid(nv, 'cNvPr');
  if (boolAttr(cNvPr, 'hidden')) return null;
  const ph = phOf(pic);
  if (ph && sc.template) return null;
  const chain = placeholderChain(ctx, ph, onLayout);
  const spPr = kid(pic, 'spPr');
  const xfrm = frameBox ?? readXfrm(kid(spPr, 'xfrm'), sc.map)
    ?? [...chain].reverse().map((el) => readXfrm(kidPath(el, 'spPr', 'xfrm'), { ax: ctx.k, ay: ctx.k, bx: 0, by: 0 })).find(Boolean)
    ?? null;
  if (!xfrm) return null;
  const blipFill = kid(pic, 'blipFill');
  const blip = kid(blipFill, 'blip');
  const href = await assetFor(ctx, attr(blip, 'r:embed') ?? attr(blip, 'r:link'));
  const src = kid(blipFill, 'srcRect');
  const crop = [numAttr(src, 'l', 0), numAttr(src, 't', 0), numAttr(src, 'r', 0), numAttr(src, 'b', 0)].map((value) => value / 100000) as [number, number, number, number];
  const style = kid(pic, 'style');
  const lineSources: Array<{ el: Element | null; phClr?: string }> = [];
  if (style) {
    const ref = styleRef(kid(style, 'lnRef'), ctx.theme.lines);
    if (ref.el) lineSources.push({ el: ref.el, phClr: readColor(ref.phClr, ctx)?.c });
  }
  lineSources.push({ el: kid(spPr, 'ln') });
  const el: PictureElement = {
    k: 'pic',
    id: newId(ctx),
    box: xfrm.box,
    href,
    line: await readLine(lineSources, ctx),
  };
  if (crop.some((value) => Math.abs(value) > 0.0001)) el.crop = crop;
  const geom = readGeometry(spPr);
  if (geom && (geom.paths || geom.prst !== 'rect')) el.geom = geom;
  if (xfrm.rot) el.rot = xfrm.rot;
  if (xfrm.flipH) el.flipH = true;
  if (xfrm.flipV) el.flipV = true;
  const shadow = readShadow(kid(spPr, 'effectLst'), ctx);
  if (shadow) el.shadow = shadow;
  const alphaMod = kid(blip, 'alphaModFix');
  if (alphaMod) el.alpha = numAttr(alphaMod, 'amt', 100000) / 100000;
  if (kid(blip, 'grayscl')) el.gray = true;
  const name = attr(cNvPr, 'name');
  if (name) el.name = name;
  return el;
}

const unionBox = (boxes: Box[]): Box => {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return { x, y, w: Math.max(...boxes.map((box) => box.x + box.w)) - x, h: Math.max(...boxes.map((box) => box.y + box.h)) - y };
};

async function readGroup(group: Element, ctx: Ctx, sc: ShapeContext, onLayout: boolean): Promise<SlideElement | null> {
  const cNvPr = kidPath(group, 'nvGrpSpPr', 'cNvPr');
  if (boolAttr(cNvPr, 'hidden')) return null;
  const grpSpPr = kid(group, 'grpSpPr');
  const xfrmEl = kid(grpSpPr, 'xfrm');
  const own = readXfrm(xfrmEl, sc.map);
  const chOff = kid(xfrmEl, 'chOff');
  const chExt = kid(xfrmEl, 'chExt');
  const off = kid(xfrmEl, 'off');
  const ext = kid(xfrmEl, 'ext');
  // Child coordinates → this group's coordinates → the slide.
  const sx = numAttr(chExt, 'cx', 0) ? numAttr(ext, 'cx', 0) / numAttr(chExt, 'cx', 1) : 1;
  const sy = numAttr(chExt, 'cy', 0) ? numAttr(ext, 'cy', 0) / numAttr(chExt, 'cy', 1) : 1;
  const map: Mapping = {
    ax: sc.map.ax * sx,
    ay: sc.map.ay * sy,
    bx: sc.map.ax * (numAttr(off, 'x', 0) - numAttr(chOff, 'x', 0) * sx) + sc.map.bx,
    by: sc.map.ay * (numAttr(off, 'y', 0) - numAttr(chOff, 'y', 0) * sy) + sc.map.by,
  };
  const groupFill = await readFill(fillChild(grpSpPr), ctx) ?? sc.groupFill;
  // Charts inside groups are rare; the group keeps its shapes.
  const children = (await readTree(group, ctx, { ...sc, map, groupFill }, onLayout)).filter((child): child is SlideElement => child.k !== 'art');
  if (children.length === 0) return null;
  const box = own?.box ?? unionBox(children.map((child) => child.box));
  const el: GroupElement = { k: 'group', id: newId(ctx), box, ch: children };
  if (own?.rot) el.rot = own.rot;
  if (own?.flipH) el.flipH = true;
  if (own?.flipV) el.flipV = true;
  const name = attr(cNvPr, 'name');
  if (name) el.name = name;
  return el;
}

// Tables ------------------------------------------------------------------------------------------

interface TablePartStyle { fill?: Paint; text?: { b?: boolean; i?: boolean; color?: { c: string; a: number }; font?: string }; borders: Record<string, LineStyle | null | undefined> }

async function tableStylePart(part: Element | null, ctx: Ctx): Promise<TablePartStyle | null> {
  if (!part) return null;
  const out: TablePartStyle = { borders: {} };
  const tcStyle = kid(part, 'tcStyle');
  const fillHolder = kid(tcStyle, 'fill');
  if (fillHolder) out.fill = await readFill(fillChild(fillHolder), ctx);
  const fillRef = kid(tcStyle, 'fillRef');
  if (!out.fill && fillRef) {
    const ref = styleRef(fillRef, ctx.theme.fills, ctx.theme.bgFills);
    out.fill = ref.el ? await readFill(ref.el, ctx, readColor(ref.phClr, ctx)?.c) : { t: 'none' };
  }
  const borders = kid(tcStyle, 'tcBdr');
  if (borders) {
    for (const side of kids(borders)) {
      const ln = kid(side, 'ln');
      const lnRef = kid(side, 'lnRef');
      if (ln) out.borders[localName(side)] = await readLine([{ el: ln }], ctx);
      else if (lnRef) {
        const ref = styleRef(lnRef, ctx.theme.lines);
        out.borders[localName(side)] = ref.el ? await readLine([{ el: ref.el, phClr: readColor(ref.phClr, ctx)?.c }], ctx) : null;
      }
    }
  }
  const tx = kid(part, 'tcTxStyle');
  if (tx) {
    out.text = {};
    const b = attr(tx, 'b');
    if (b) out.text.b = b === 'on';
    const i = attr(tx, 'i');
    if (i) out.text.i = i === 'on';
    const color = readColor(tx, ctx);
    if (color) out.text.color = color;
    const fontRef = kid(tx, 'fontRef');
    if (fontRef) {
      out.text.font = attr(fontRef, 'idx') === 'major' ? ctx.theme.major.latin : ctx.theme.minor.latin;
      const refColor = readColor(fontRef, ctx);
      if (refColor && !out.text.color) out.text.color = refColor;
    }
  }
  return out;
}

/** PowerPoint's default table style (Medium Style 2 – Accent 1), for files that do not include it. */
function defaultTableStyle(ctx: Ctx): Record<string, TablePartStyle> {
  const accent = `#${ctx.theme.colors.accent1}`;
  const [r, g, b] = parseHex(accent);
  const tint = (amount: number): string => hex(r + (1 - r) * amount, g + (1 - g) * amount, b + (1 - b) * amount);
  const white: LineStyle = { c: { t: 'solid', c: '#FFFFFF' }, w: emu(ctx, 12700) };
  const dark = `#${ctx.theme.colors[ctx.clrMap.tx1 ?? 'dk1'] ?? '000000'}`;
  return {
    wholeTbl: { fill: { t: 'solid', c: tint(0.8) }, text: { color: { c: dark, a: 1 } }, borders: { left: white, right: white, top: white, bottom: white, insideH: white, insideV: white } },
    band1H: { fill: { t: 'solid', c: tint(0.6) }, borders: {} },
    firstRow: { fill: { t: 'solid', c: accent }, text: { b: true, color: { c: '#FFFFFF', a: 1 } }, borders: { bottom: { ...white, w: emu(ctx, 38100) } } },
    lastRow: { fill: { t: 'solid', c: accent }, text: { b: true, color: { c: '#FFFFFF', a: 1 } }, borders: {} },
    firstCol: { fill: { t: 'solid', c: accent }, text: { b: true, color: { c: '#FFFFFF', a: 1 } }, borders: {} },
    lastCol: { fill: { t: 'solid', c: accent }, text: { b: true, color: { c: '#FFFFFF', a: 1 } }, borders: {} },
  };
}

async function readTable(frame: Element, tbl: Element, ctx: Ctx, xfrm: Xfrm): Promise<TableElement> {
  const tblPr = kid(tbl, 'tblPr');
  const flags = { firstRow: boolAttr(tblPr, 'firstRow') ?? false, lastRow: boolAttr(tblPr, 'lastRow') ?? false, firstCol: boolAttr(tblPr, 'firstCol') ?? false, lastCol: boolAttr(tblPr, 'lastCol') ?? false, bandRow: boolAttr(tblPr, 'bandRow') ?? false, bandCol: boolAttr(tblPr, 'bandCol') ?? false };
  // No style id means no table style; the default style's id may be used without its definition in the file.
  const styleId = kid(tblPr, 'tableStyleId')?.textContent?.trim() ?? '';
  const styleEl = styleId ? ctx.tableStyles.get(styleId) : undefined;
  const parts: Record<string, TablePartStyle> = {};
  if (styleEl) {
    for (const name of ['wholeTbl', 'band1H', 'band2H', 'band1V', 'band2V', 'firstRow', 'lastRow', 'firstCol', 'lastCol']) {
      const part = await tableStylePart(kid(styleEl, name), ctx);
      if (part) parts[name] = part;
    }
  } else if (styleId === '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}') {
    Object.assign(parts, defaultTableStyle(ctx));
  }
  const tableFill = await readFill(fillChild(tblPr), ctx);
  const cols = kids(kid(tbl, 'tblGrid') ?? tbl, 'gridCol').map((col) => emu(ctx, numAttr(col, 'w', 0)));
  const rowsEl = kids(tbl, 'tr');
  const rows: TableElement['rows'] = [];
  for (const [r, tr] of rowsEl.entries()) {
    const cells: TableCell[] = [];
    for (const [c, tc] of kids(tr, 'tc').entries()) {
      const applicable: TablePartStyle[] = [];
      const add = (name: string): void => { if (parts[name]) applicable.push(parts[name]); };
      add('wholeTbl');
      const bodyRow = r - (flags.firstRow ? 1 : 0);
      if (flags.bandCol) add((c - (flags.firstCol ? 1 : 0)) % 2 === 0 ? 'band1V' : 'band2V');
      if (flags.bandRow && !(flags.firstRow && r === 0) && !(flags.lastRow && r === rowsEl.length - 1)) add(bodyRow % 2 === 0 ? 'band1H' : 'band2H');
      if (flags.firstCol && c === 0) add('firstCol');
      if (flags.lastCol && c === kids(tr, 'tc').length - 1) add('lastCol');
      if (flags.firstRow && r === 0) add('firstRow');
      if (flags.lastRow && r === rowsEl.length - 1) add('lastRow');
      const merged = boolAttr(tc, 'hMerge') === true || boolAttr(tc, 'vMerge') === true;
      const tcPr = kid(tc, 'tcPr');
      let fill: Paint | undefined = await readFill(fillChild(tcPr), ctx);
      if (!fill) for (let i = applicable.length - 1; i >= 0; i -= 1) if (applicable[i].fill) { fill = applicable[i].fill; break; }
      fill ??= tableFill ?? { t: 'none' };
      const textStyle = applicable.reduce<NonNullable<TablePartStyle['text']>>((acc, part) => ({ ...acc, ...(part.text ?? {}) }), {});
      const lastRowIndex = rowsEl.length - 1;
      const lastColIndex = cols.length - 1;
      const border = (side: 'left' | 'right' | 'top' | 'bottom'): LineStyle | null | undefined => {
        const inner = side === 'left' ? (c > 0 ? 'insideV' : 'left') : side === 'right' ? (c < lastColIndex ? 'insideV' : 'right') : side === 'top' ? (r > 0 ? 'insideH' : 'top') : (r < lastRowIndex ? 'insideH' : 'bottom');
        let value: LineStyle | null | undefined;
        for (const part of applicable) {
          // Edge parts (first row, last column…) set their own outer sides; the whole table sets inside lines.
          if (part.borders[inner] !== undefined) value = part.borders[inner];
          else if (inner !== side && part !== parts.wholeTbl && part.borders[side] !== undefined) value = part.borders[side];
        }
        return value;
      };
      const own = async (name: string): Promise<LineStyle | null | undefined> => {
        const el = kid(tcPr, name);
        return el ? readLine([{ el }], ctx) : undefined;
      };
      const txBody = kid(tc, 'txBody');
      const tx = txBody
        ? await readText(txBody, { lists: [ctx.defaultTextStyle], bodies: [], fontRef: null, fontRefAt: 1, runDefaults: textStyle }, ctx, { anchor: 't' })
        : { p: [], ins: [0, 0, 0, 0] as [number, number, number, number], anc: 't' as const, wrap: true };
      tx.ins = [
        emu(ctx, numAttr(tcPr, 'marL', 91440)),
        emu(ctx, numAttr(tcPr, 'marT', 45720)),
        emu(ctx, numAttr(tcPr, 'marR', 91440)),
        emu(ctx, numAttr(tcPr, 'marB', 45720)),
      ];
      const anchor = attr(tcPr, 'anchor');
      tx.anc = anchor === 'ctr' ? 'ctr' : anchor === 'b' ? 'b' : 't';
      const cell: TableCell = {
        tx,
        fill,
        bl: (await own('lnL')) ?? border('left'),
        br: (await own('lnR')) ?? border('right'),
        bt: (await own('lnT')) ?? border('top'),
        bb: (await own('lnB')) ?? border('bottom'),
      };
      const span: [number, number] = [numAttr(tc, 'gridSpan', 1), numAttr(tc, 'rowSpan', 1)];
      if (span[0] > 1 || span[1] > 1) cell.span = span;
      if (merged) cell.merged = true;
      cells.push(cell);
    }
    rows.push({ h: emu(ctx, numAttr(tr, 'h', 0)), cells });
  }
  void frame;
  return { k: 'table', id: newId(ctx), box: xfrm.box, cols, rows };
}

// Charts ------------------------------------------------------------------------------------------

function chartValues(node: Element | null): string[] {
  if (!node) return [];
  const out: string[] = [];
  for (const point of descendants(node, 'c:pt')) {
    const index = numAttr(point, 'idx', out.length);
    out[index] = firstChild(point, 'c:v')?.textContent ?? '';
  }
  return Array.from({ length: out.length }, (_, index) => out[index] ?? '');
}

const fmtNumber = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(0)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 10 ? 1 : 0);
};

function niceMax(max: number): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 0.25 };
  const raw = max / 5;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw;
  return { max: Math.ceil(max / step) * step, step };
}

/** A chart drawn as static SVG in a w × h box (the series, axes, labels and legend). */
async function chartMarkup(doc: Document, ctx: Ctx, w: number, h: number): Promise<string | null> {
  const plotArea = descendants(doc, 'c:plotArea')[0];
  if (!plotArea) return null;
  const kinds = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'area3DChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'scatterChart', 'radarChart'];
  const plot = kids(plotArea).find((child) => kinds.includes(localName(child)));
  if (!plot) return null;
  const kind = localName(plot);
  const horizontal = attr(kid(plot, 'barDir'), 'val') === 'bar';
  const grouping = attr(kid(plot, 'grouping'), 'val') ?? 'clustered';
  const stacked = grouping === 'stacked' || grouping === 'percentStacked';
  const accents = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((name) => `#${ctx.theme.colors[name]}`);
  const series: Array<{ name: string; color: string; points: Map<number, string>; categories: string[]; values: number[] }> = [];
  for (const [index, ser] of kids(plot, 'ser').entries()) {
    const name = descendants(kid(ser, 'tx') ?? ser, 'c:v')[0]?.textContent?.trim() || `Series ${index + 1}`;
    const spPr = kid(ser, 'spPr');
    const fill = await readFill(fillChild(spPr), ctx);
    const lineFill = await readFill(fillChild(kid(spPr, 'ln')), ctx);
    const color = fill?.t === 'solid' ? fill.c : lineFill?.t === 'solid' && /line|scatter|radar/.test(kind) ? lineFill.c : accents[index % accents.length];
    const points = new Map<number, string>();
    for (const dPt of kids(ser, 'dPt')) {
      const pointFill = await readFill(fillChild(kid(dPt, 'spPr')), ctx);
      if (pointFill?.t === 'solid') points.set(numAttr(kid(dPt, 'idx'), 'val', 0), pointFill.c);
    }
    series.push({
      name,
      color,
      points,
      categories: chartValues(kid(ser, 'cat') ?? kid(ser, 'xVal')),
      values: chartValues(kid(ser, 'val') ?? kid(ser, 'yVal')).map((value) => Number(value) || 0),
    });
  }
  if (series.length === 0) return null;
  const categories = series[0].categories.length ? series[0].categories : series[0].values.map((_, index) => String(index + 1));
  const textColor = `#${ctx.theme.colors[ctx.clrMap.tx1 ?? 'dk1'] ?? '000000'}`;
  const font = escapeXml(fontStack(ctx.theme.minor.latin));
  const size = Math.max(9, Math.min(16, h / 26));
  const parts: string[] = [];
  const label = (x: number, y: number, text: string, anchor = 'middle', extra = ''): string => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${font}" font-size="${size.toFixed(1)}" fill="${textColor}" fill-opacity="0.75" text-anchor="${anchor}"${extra}>${escapeXml(text)}</text>`;

  const titleText = descendants(kid(descendants(doc, 'c:chart')[0] ?? doc.documentElement, 'title') ?? doc.createElement('x'), 'a:t').map((node) => node.textContent ?? '').join('');
  const deleted = attr(descendants(doc, 'c:autoTitleDeleted')[0], 'val') === '1';
  let top = 6;
  if (titleText && !deleted) {
    parts.push(`<text x="${(w / 2).toFixed(1)}" y="${(size * 1.5).toFixed(1)}" font-family="${font}" font-size="${(size * 1.3).toFixed(1)}" fill="${textColor}" text-anchor="middle">${escapeXml(titleText)}</text>`);
    top = size * 2.4;
  }
  const legendEl = descendants(doc, 'c:legend')[0];
  const legendPos = legendEl ? attr(kid(legendEl, 'legendPos'), 'val') ?? 'r' : null;
  const pie = /pie|doughnut/.test(kind);
  const legendItems = pie ? categories.map((name, index) => ({ name, color: series[0].points.get(index) ?? accents[index % accents.length] })) : series.map((entry) => ({ name: entry.name, color: entry.color }));
  let right = w - 6;
  let bottom = h - 6;
  if (legendPos && legendItems.length) {
    if (legendPos === 'r') {
      const legendW = Math.min(w * 0.3, Math.max(...legendItems.map((item) => item.name.length)) * size * 0.55 + size * 2);
      right = w - legendW;
      legendItems.forEach((item, index) => {
        const y = h / 2 - (legendItems.length * size * 1.5) / 2 + index * size * 1.5;
        parts.push(`<rect x="${(right + size * 0.6).toFixed(1)}" y="${(y - size * 0.4).toFixed(1)}" width="${(size * 0.8).toFixed(1)}" height="${(size * 0.8).toFixed(1)}" fill="${item.color}"/>`);
        parts.push(label(right + size * 1.8, y + size * 0.35, item.name, 'start'));
      });
    } else {
      bottom = h - size * 2;
      const totalW = legendItems.reduce((sum, item) => sum + item.name.length * size * 0.55 + size * 2.4, 0);
      let x = w / 2 - totalW / 2;
      const y = legendPos === 't' ? top + size : h - size * 0.8;
      if (legendPos === 't') top += size * 2;
      for (const item of legendItems) {
        parts.push(`<rect x="${x.toFixed(1)}" y="${(y - size * 0.75).toFixed(1)}" width="${(size * 0.8).toFixed(1)}" height="${(size * 0.8).toFixed(1)}" fill="${item.color}"/>`);
        parts.push(label(x + size * 1.2, y, item.name, 'start'));
        x += item.name.length * size * 0.55 + size * 2.4;
      }
    }
  }

  if (pie) {
    const values = series[0].values;
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
    const cx = (right + 6) / 2;
    const cy = (top + bottom) / 2;
    const r = Math.max(4, Math.min(right - 12, bottom - top) / 2 - 4);
    const hole = kind === 'doughnutChart' ? r * (numAttr(kid(plot, 'holeSize'), 'val', 50) / 100) : 0;
    let angle = -Math.PI / 2 + ((numAttr(kid(plot, 'firstSliceAng'), 'val', 0) * Math.PI) / 180);
    values.forEach((value, index) => {
      const sweep = (Math.max(0, value) / total) * Math.PI * 2;
      if (sweep <= 0) return;
      const a2 = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const p = (radius: number, a: number): string => `${(cx + radius * Math.cos(a)).toFixed(2)} ${(cy + radius * Math.sin(a)).toFixed(2)}`;
      const color = series[0].points.get(index) ?? accents[index % accents.length];
      const d = sweep >= Math.PI * 2 - 0.0001
        ? `M${p(r, 0)} A${r} ${r} 0 1 1 ${p(r, Math.PI)} A${r} ${r} 0 1 1 ${p(r, 0)} Z${hole ? ` M${p(hole, 0)} A${hole} ${hole} 0 1 0 ${p(hole, Math.PI)} A${hole} ${hole} 0 1 0 ${p(hole, 0)} Z` : ''}`
        : hole
          ? `M${p(r, angle)} A${r} ${r} 0 ${large} 1 ${p(r, a2)} L${p(hole, a2)} A${hole} ${hole} 0 ${large} 0 ${p(hole, angle)} Z`
          : `M${cx.toFixed(2)} ${cy.toFixed(2)} L${p(r, angle)} A${r} ${r} 0 ${large} 1 ${p(r, a2)} Z`;
      parts.push(`<path d="${d}" fill="${color}" fill-rule="evenodd" stroke="#FFFFFF" stroke-width="1.5"/>`);
      angle = a2;
    });
    return parts.join('');
  }

  // Axes charts.
  const totals = categories.map((_, index) => series.reduce((sum, entry) => sum + Math.max(0, entry.values[index] ?? 0), 0));
  const maxValue = grouping === 'percentStacked' ? 100 : stacked ? Math.max(...totals) : Math.max(...series.flatMap((entry) => entry.values));
  const minValue = Math.min(0, ...series.flatMap((entry) => entry.values));
  const scale = niceMax(maxValue - minValue);
  const axisW = horizontal ? Math.min(w * 0.3, Math.max(...categories.map((value) => value.length)) * size * 0.55 + 8) : Math.max(...[scale.max, minValue].map((value) => fmtNumber(value).length)) * size * 0.6 + 8;
  const left = axisW;
  const plotTop = top + 4;
  const plotBottom = bottom - (horizontal ? size * 1.6 : size * 1.8);
  const plotW = Math.max(10, right - left - 6);
  const plotH = Math.max(10, plotBottom - plotTop);
  const range = scale.max - Math.min(0, minValue);
  const valueToY = (value: number): number => plotBottom - ((value - Math.min(0, minValue)) / range) * plotH;
  const valueToX = (value: number): number => left + ((value - Math.min(0, minValue)) / range) * plotW;
  for (let tick = Math.min(0, minValue); tick <= scale.max + 1e-9; tick += scale.step) {
    if (horizontal) {
      const x = valueToX(tick);
      parts.push(`<line x1="${x.toFixed(1)}" y1="${plotTop.toFixed(1)}" x2="${x.toFixed(1)}" y2="${plotBottom.toFixed(1)}" stroke="${textColor}" stroke-opacity="0.15" stroke-width="1"/>`);
      parts.push(label(x, plotBottom + size * 1.3, fmtNumber(tick)));
    } else {
      const y = valueToY(tick);
      parts.push(`<line x1="${left.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(left + plotW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${textColor}" stroke-opacity="0.15" stroke-width="1"/>`);
      parts.push(label(left - 6, y + size * 0.35, fmtNumber(tick), 'end'));
    }
  }
  const slots = categories.length || 1;
  const slot = (horizontal ? plotH : plotW) / slots;
  if (/bar/.test(kind)) {
    const gap = (numAttr(kid(plot, 'gapWidth'), 'val', 150) / 100) * (slot / (stacked ? 2 : series.length + 1.5));
    const barSpace = Math.max(1, slot - gap);
    const barW = stacked ? barSpace : barSpace / series.length;
    categories.forEach((_, ci) => {
      let stackBase = 0;
      series.forEach((entry, si) => {
        let value = entry.values[ci] ?? 0;
        if (grouping === 'percentStacked') value = totals[ci] ? (value / totals[ci]) * 100 : 0;
        const from = stacked ? stackBase : 0;
        const to = from + value;
        stackBase = to;
        const offset = ci * slot + gap / 2 + (stacked ? 0 : si * barW);
        const color = entry.points.get(ci) ?? entry.color;
        if (horizontal) {
          const x1 = valueToX(Math.min(from, to));
          const x2 = valueToX(Math.max(from, to));
          parts.push(`<rect x="${x1.toFixed(1)}" y="${(plotTop + offset).toFixed(1)}" width="${Math.max(0, x2 - x1).toFixed(1)}" height="${barW.toFixed(1)}" fill="${color}"/>`);
        } else {
          const y1 = valueToY(Math.max(from, to));
          const y2 = valueToY(Math.min(from, to));
          parts.push(`<rect x="${(left + offset).toFixed(1)}" y="${y1.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, y2 - y1).toFixed(1)}" fill="${color}"/>`);
        }
      });
    });
  } else {
    series.forEach((entry) => {
      const points = entry.values.map((value, index) => [left + slot * (index + 0.5), valueToY(value)] as [number, number]);
      const d = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      if (/area/.test(kind) && points.length) {
        parts.push(`<path d="${d} L${points[points.length - 1][0].toFixed(1)} ${plotBottom.toFixed(1)} L${points[0][0].toFixed(1)} ${plotBottom.toFixed(1)} Z" fill="${entry.color}" fill-opacity="0.85"/>`);
      } else {
        parts.push(`<path d="${d}" fill="none" stroke="${entry.color}" stroke-width="${Math.max(1.5, size * 0.2).toFixed(1)}" stroke-linejoin="round"/>`);
        for (const [x, y] of points) parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size * 0.25).toFixed(1)}" fill="${entry.color}"/>`);
      }
    });
  }
  categories.forEach((name, index) => {
    if (horizontal) parts.push(label(left - 6, plotTop + slot * (index + 0.5) + size * 0.35, name, 'end'));
    else parts.push(label(left + slot * (index + 0.5), plotBottom + size * 1.35, name.length > 18 ? `${name.slice(0, 17)}…` : name));
  });
  parts.push(`<line x1="${left.toFixed(1)}" y1="${plotBottom.toFixed(1)}" x2="${(left + plotW).toFixed(1)}" y2="${plotBottom.toFixed(1)}" stroke="${textColor}" stroke-opacity="0.4" stroke-width="1"/>`);
  return parts.join('');
}

// Graphic frames ------------------------------------------------------------------------------------

/** Rendered static artwork (charts) is kept as SVG; the editor scales it as one piece. */
interface ArtElement { k: 'art'; id: string; box: Box; markup: string; kind: string }

async function readGraphicFrame(frame: Element, ctx: Ctx, sc: ShapeContext, onLayout: boolean): Promise<Array<SlideElement | ArtElement>> {
  const cNvPr = kidPath(frame, 'nvGraphicFramePr', 'cNvPr');
  if (boolAttr(cNvPr, 'hidden')) return [];
  if (phOf(frame) && sc.template) return [];
  const xfrm = readXfrm(kid(frame, 'xfrm'), sc.map);
  if (!xfrm) return [];
  const data = kidPath(frame, 'graphic', 'graphicData');
  if (!data) return [];
  const tbl = kid(data, 'tbl');
  if (tbl) return [await readTable(frame, tbl, ctx, xfrm)];
  const chartRef = kids(data).find((child) => localName(child) === 'chart');
  if (chartRef) {
    const rel = ctx.rels.find((entry) => entry.id === attr(chartRef, 'r:id'));
    const doc = rel ? await readXml(ctx.pkg.zip, rel.target) : null;
    const markup = doc ? await chartMarkup(doc, { ...ctx, rels: rel ? await readRels(ctx.pkg.zip, rel.target) : ctx.rels }, xfrm.box.w, xfrm.box.h) : null;
    if (markup) return [{ k: 'art', id: newId(ctx), box: xfrm.box, markup, kind: 'chart' }];
    ctx.warnings.add('A chart type the app does not draw was left out.');
    return [];
  }
  const relIds = kids(data).find((child) => localName(child) === 'relIds');
  if (relIds) {
    // SmartArt: PowerPoint stores a drawn copy of the diagram (dsp shapes).
    const dataRel = ctx.rels.find((entry) => entry.id === attr(relIds, 'r:dm'));
    let drawingPart: string | null = null;
    if (dataRel) {
      const dataDoc = await readXml(ctx.pkg.zip, dataRel.target);
      const ext = dataDoc ? descendants(dataDoc, 'dsp:dataModelExt')[0] : undefined;
      const drawingRel = ext ? ctx.rels.find((entry) => entry.id === attr(ext, 'relId')) : undefined;
      drawingPart = drawingRel?.target ?? null;
    }
    drawingPart ??= relOfType(ctx.rels, REL.diagramDrawing)?.target ?? null;
    const drawing = drawingPart ? await readXml(ctx.pkg.zip, drawingPart) : null;
    const tree = drawing ? descendants(drawing, 'dsp:spTree')[0] : null;
    if (tree && drawingPart) {
      const off = kidPath(frame, 'xfrm', 'off');
      const map: Mapping = { ax: sc.map.ax, ay: sc.map.ay, bx: sc.map.ax * numAttr(off, 'x', 0) + sc.map.bx, by: sc.map.ay * numAttr(off, 'y', 0) + sc.map.by };
      const children = await readTree(tree, { ...ctx, rels: await readRels(ctx.pkg.zip, drawingPart) }, { ...sc, map }, onLayout);
      const shapes = children.filter((child): child is SlideElement => child.k !== 'art');
      if (shapes.length) return [{ k: 'group', id: newId(ctx), box: xfrm.box, ch: shapes }];
    }
    ctx.warnings.add('A SmartArt diagram without a saved drawing was left out.');
    return [];
  }
  // OLE objects and others keep a picture of themselves.
  const pic = descendants(data, 'p:pic')[0];
  if (pic) {
    const picture = await readPicture(pic, ctx, sc, onLayout, xfrm);
    return picture ? [picture] : [];
  }
  return [];
}

async function readTree(tree: Element, ctx: Ctx, sc: ShapeContext, onLayout: boolean): Promise<Array<SlideElement | ArtElement>> {
  const out: Array<SlideElement | ArtElement> = [];
  const visit = async (node: Element): Promise<void> => {
    switch (localName(node)) {
      case 'sp': case 'cxnSp': { const el = await readShape(node, ctx, sc, onLayout); if (el) out.push(el); break; }
      case 'pic': { const el = await readPicture(node, ctx, sc, onLayout); if (el) out.push(el); break; }
      case 'grpSp': { const el = await readGroup(node, ctx, sc, onLayout); if (el) out.push(el); break; }
      case 'graphicFrame': out.push(...await readGraphicFrame(node, ctx, sc, onLayout)); break;
      case 'AlternateContent': {
        // Prefer the fallback: the choice needs features (equations, 3D models, newer media) older readers lack.
        const choice = kid(node, 'Choice');
        const fallback = kid(node, 'Fallback');
        const pick = fallback && kids(fallback).length ? fallback : choice;
        if (pick) for (const child of kids(pick)) await visit(child);
        break;
      }
      default: break;
    }
  };
  for (const child of kids(tree)) await visit(child);
  return out;
}

// Backgrounds -------------------------------------------------------------------------------------

async function readBackground(doc: Document, ctx: Ctx): Promise<Paint | null> {
  const bg = descendants(doc, 'p:bg')[0];
  if (!bg) return null;
  const bgPr = kid(bg, 'bgPr');
  if (bgPr) return (await readFill(fillChild(bgPr), ctx)) ?? null;
  const bgRef = kid(bg, 'bgRef');
  if (bgRef) {
    const ref = styleRef(bgRef, ctx.theme.fills, ctx.theme.bgFills);
    const phClr = readColor(bgRef, ctx)?.c;
    if (ref.el) return (await readFill(ref.el, ctx, phClr)) ?? null;
    return phClr ? { t: 'solid', c: phClr } : null;
  }
  return null;
}

// Assembling a slide --------------------------------------------------------------------------------

function artSvg(art: ArtElement): string {
  const { x, y, w, h } = art.box;
  return `<g data-el="${art.id}" data-kind="${art.kind}" data-box="${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" data-box0="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">${art.markup}</g>`;
}

/** The slide: background, the master and layout artwork (not selectable), then the slide's elements. */
function slideSvg(canvas: { width: number; height: number }, background: Paint, template: Array<SlideElement | ArtElement>, elements: Array<SlideElement | ArtElement>, measure: Measure): string {
  const draw = (list: Array<SlideElement | ArtElement>): string => list.map((el) => (el.k === 'art' ? artSvg(el) : renderElement(el, { measure }))).join('');
  const layer = template.length ? `<g data-layer="master">${draw(template).replace(/ data-el="/g, ' data-tpl="')}</g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}" data-model="1">${renderBackground(background, canvas)}${layer}${draw(elements)}</svg>`;
}

function collectText(elements: Array<SlideElement | ArtElement>): string {
  const lines: string[] = [];
  const visit = (el: SlideElement | ArtElement): void => {
    if (el.k === 'art' || el.k === 'pic') return;
    if (el.k === 'group') { el.ch.forEach(visit); return; }
    if (el.k === 'shape' && el.tx) lines.push(el.tx.p.map((para) => para.r.map((run) => run.t).join('')).join('\n'));
    if (el.k === 'table') for (const row of el.rows) lines.push(row.cells.map((cell) => cell.tx.p.map((para) => para.r.map((run) => run.t).join('')).join(' ')).join(' | '));
  };
  elements.forEach(visit);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function slideTitle(doc: Document): string {
  for (const shape of descendants(doc, 'p:sp')) {
    const type = attr(phOf(shape), 'type');
    if (type !== 'title' && type !== 'ctrTitle') continue;
    const text = descendants(shape, 'a:t').map((node) => node.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

function luminance(color: string): number {
  const [r, g, b] = parseHex(color).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The deck's palette roles from the theme and the master background. */
function themeSummary(theme: ThemeData, clrMap: Record<string, string>, background: Paint | null): ImportedTheme {
  const color = (name: string): string => `#${theme.colors[clrMap[name] ?? name] ?? theme.colors[name] ?? '000000'}`;
  const bg = background?.t === 'solid' ? background.c : background?.t === 'grad' ? background.stops[0]?.c ?? color('bg1') : color('bg1');
  const text = luminance(bg) < 0.35 ? (luminance(color('tx1')) > 0.5 ? color('tx1') : color('bg1')) : color('tx1');
  const [r1, g1, b1] = parseHex(text);
  const [r2, g2, b2] = parseHex(bg);
  return {
    name: theme.name,
    dark: luminance(bg) < 0.35,
    palette: {
      background: bg,
      surface: color('bg2'),
      text,
      muted: hex(r1 + (r2 - r1) * 0.4, g1 + (g2 - g1) * 0.4, b1 + (b2 - b1) * 0.4),
      primary: color('accent1'),
      secondary: color('accent2'),
      accent: color('accent3'),
    },
    chartColors: ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(color),
    fonts: { heading: theme.major.latin, body: theme.minor.latin },
  };
}

/** The slide canvas for a slide size: 1280 px wide (1024 for 4:3), height to scale. */
export function canvasFor(widthIn: number, heightIn: number): { width: number; height: number; size: '16:9' | '4:3' } {
  const fourThree = Math.abs(widthIn / heightIn - 4 / 3) < 0.05;
  const width = fourThree ? 1024 : 1280;
  return { width, height: Math.round((width * heightIn) / widthIn * 100) / 100, size: fourThree ? '4:3' : '16:9' };
}

/** Reads a .pptx and draws every slide. */
export async function importPptx(bytes: Uint8Array | ArrayBuffer, options: ImportOptions): Promise<ImportedPptx> {
  const pkg = await openPptx(bytes);
  const { width, height, size } = canvasFor(pkg.width, pkg.height);
  const canvas = { width, height };
  const k = width / (pkg.width * 914400);
  const measure = options.measure ?? estimateMeasure;
  const presentation = await readXml(pkg.zip, 'ppt/presentation.xml');
  const defaultTextStyle = presentation ? descendants(presentation, 'p:defaultTextStyle')[0] ?? null : null;
  const tableStyles = new Map<string, Element>();
  const stylesDoc = await readXml(pkg.zip, 'ppt/tableStyles.xml');
  if (stylesDoc) for (const style of descendants(stylesDoc, 'a:tblStyle')) tableStyles.set(attr(style, 'styleId') ?? '', style);

  const masters = new Map<string, MasterInfo>();
  const layouts = new Map<string, LayoutInfo>();
  const loadMaster = async (part: string): Promise<MasterInfo> => {
    const cached = masters.get(part);
    if (cached) return cached;
    const doc = (await readXml(pkg.zip, part))!;
    const rels = await readRels(pkg.zip, part);
    const theme = await readTheme(pkg, relOfType(rels, REL.theme)?.target ?? pkg.themePart);
    const txStyles = descendants(doc, 'p:txStyles')[0] ?? null;
    const info: MasterInfo = {
      part,
      doc,
      rels,
      theme,
      clrMap: readClrMap(descendants(doc, 'p:clrMap')[0] ?? null, DEFAULT_CLR_MAP),
      titleStyle: kid(txStyles, 'titleStyle'),
      bodyStyle: kid(txStyles, 'bodyStyle'),
      otherStyle: kid(txStyles, 'otherStyle'),
      placeholders: placeholdersIn(doc),
    };
    masters.set(part, info);
    return info;
  };
  const loadLayout = async (part: string): Promise<LayoutInfo | null> => {
    const cached = layouts.get(part);
    if (cached) return cached;
    const doc = await readXml(pkg.zip, part);
    if (!doc) return null;
    const rels = await readRels(pkg.zip, part);
    const masterPart = relOfType(rels, REL.slideMaster)?.target;
    if (!masterPart) return null;
    const master = await loadMaster(masterPart);
    const override = descendants(doc, 'p:clrMapOvr')[0];
    const info: LayoutInfo = {
      part,
      doc,
      rels,
      master,
      clrMap: readClrMap(override ? kid(override, 'overrideClrMapping') : null, master.clrMap),
      placeholders: placeholdersIn(doc),
    };
    layouts.set(part, info);
    return info;
  };

  const assets = new Map<string, string>();
  const assetBytes: Record<string, Uint8Array> = {};
  const warnings = new Set<string>();
  const slides: ImportedSlide[] = [];
  let summary: ImportedTheme | null = null;
  const indices = options.only ?? pkg.slides.map((_, index) => index);

  for (const [position, index] of indices.entries()) {
    const entry = pkg.slides[index];
    if (!entry) continue;
    const doc = await readXml(pkg.zip, entry.part);
    if (!doc) continue;
    const rels = await readRels(pkg.zip, entry.part);
    const layoutPart = relOfType(rels, REL.slideLayout)?.target;
    const layout = layoutPart ? await loadLayout(layoutPart) : null;
    const master = layout?.master ?? (masters.size ? [...masters.values()][0] : await loadMaster(relOfType(await readRels(pkg.zip, 'ppt/presentation.xml'), REL.slideMaster)?.target ?? 'ppt/slideMasters/slideMaster1.xml'));
    const override = descendants(doc, 'p:clrMapOvr')[0];
    const clrMap = readClrMap(override ? kid(override, 'overrideClrMapping') : null, layout?.clrMap ?? master.clrMap);
    const ctx: Ctx = {
      pkg, k, measure, master, layout, rels, defaultTextStyle, slideNumber: index + 1, assets, assetBytes, warnings,
      ids: { next: 1 }, tableStyles, theme: master.theme, clrMap, background: { t: 'solid', c: '#FFFFFF' },
    };
    // Background: the slide's, else the layout's, else the master's.
    const background = await readBackground(doc, ctx)
      ?? (layout ? await readBackground(layout.doc, { ...ctx, rels: layout.rels }) : null)
      ?? await readBackground(master.doc, { ...ctx, rels: master.rels })
      ?? { t: 'solid' as const, c: `#${master.theme.colors[clrMap.bg1 ?? 'lt1'] ?? 'FFFFFF'}` };
    ctx.background = background;
    summary ??= themeSummary(master.theme, master.clrMap, await readBackground(master.doc, { ...ctx, rels: master.rels }) ?? background);

    // Artwork from the master and the layout, unless hidden.
    const template: Array<SlideElement | ArtElement> = [];
    const topMap: Mapping = { ax: k, ay: k, bx: 0, by: 0 };
    const showMaster = (el: Document): boolean => attr(el.documentElement, 'showMasterSp') !== '0' && attr(descendants(el, 'p:cSld')[0], 'showMasterSp') !== '0';
    if (showMaster(doc) && (!layout || showMaster(layout.doc))) {
      const tree = spTreeOf(master.doc);
      if (tree) template.push(...await readTree(tree, { ...ctx, rels: master.rels }, { map: topMap, template: true }, true));
    }
    if (layout && showMaster(doc)) {
      const tree = spTreeOf(layout.doc);
      if (tree) template.push(...await readTree(tree, { ...ctx, rels: layout.rels }, { map: topMap, template: true }, true));
    }
    const tree = spTreeOf(doc);
    const elements = tree ? await readTree(tree, ctx, { map: topMap, template: false }, false) : [];
    const svg = slideSvg(canvas, background, template, elements, measure);
    slides.push({
      svg,
      title: slideTitle(doc) || `Slide ${index + 1}`,
      notes: await readNotes(pkg.zip, entry.notesPart),
      hidden: entry.hidden,
      text: collectText(elements),
    });
    options.onProgress?.(position + 1, indices.length);
  }

  const firstTitle = slides.find((slide) => !/^Slide \d+$/.test(slide.title))?.title;
  return {
    title: firstTitle && firstTitle.length <= 80 ? firstTitle : options.fileTitle,
    size,
    canvas,
    slides,
    assets: assetBytes,
    theme: summary ?? themeSummary(await readTheme(pkg, pkg.themePart), DEFAULT_CLR_MAP, null),
    warnings: [...warnings],
  };
}
