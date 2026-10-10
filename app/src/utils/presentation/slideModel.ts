// The editable slide model behind imported PowerPoint slides and every
// element added in the editor: shapes, text boxes, pictures, tables and
// groups, with PowerPoint's text model (paragraphs, runs, bullets, line
// spacing, insets, anchoring, autofit). Each element renders to a
// self-contained SVG group that carries its model (`data-m`), so the editor
// can move, resize and re-flow text, and the PowerPoint export can write a
// native text box. Text is wrapped here with a width measurer (the canvas in
// the app, an estimate in tests). Dependency-free.

import { geometryPaths, LINE_PRESETS, presetTextRect, type Geometry } from './slideGeometry';

// Model ----------------------------------------------------------------------------------------

export type Paint =
  | { t: 'none' }
  | { t: 'solid'; c: string; a?: number }
  | { t: 'grad'; stops: Array<{ o: number; c: string; a?: number }>; ang?: number; path?: 'circle' | 'rect' | 'shape' }
  | { t: 'img'; href: string; crop?: [number, number, number, number]; a?: number };

export interface Arrow { type: string; w: 'sm' | 'med' | 'lg'; len: 'sm' | 'med' | 'lg' }

export interface LineStyle {
  c: Paint;
  /** Width in px. */
  w: number;
  dash?: string;
  cap?: 'rnd' | 'sq' | 'flat';
  join?: 'round' | 'bevel' | 'miter';
  head?: Arrow;
  tail?: Arrow;
}

export interface Shadow { c: string; a: number; blur: number; dx: number; dy: number }

export interface TxRun {
  /** Text; a run of exactly "\n" is a line break. */
  t: string;
  /** Size in px. */
  sz: number;
  /** Font family. */
  f: string;
  /** Colour; absent = no fill. */
  c?: string;
  a?: number;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  /** Baseline shift as a fraction of the size (0.3 superscript, -0.25 subscript). */
  bl?: number;
  /** Letter spacing in px. */
  sp?: number;
  cap?: 'all' | 'small';
  link?: string;
}

export interface TxBullet {
  /** A bullet character… */
  ch?: string;
  /** …or an automatic numbering scheme (`arabicPeriod`, `romanUcParenR`…). */
  num?: string;
  start?: number;
  c?: string;
  /** Size as a fraction of the first run's size. */
  sz?: number;
  f?: string;
}

export interface TxPara {
  r: TxRun[];
  al?: 'l' | 'c' | 'r' | 'j';
  /** Left margin and first-line indent in px (indent < 0 hangs). */
  ml?: number;
  ind?: number;
  bu?: TxBullet;
  lv?: number;
  /** Line spacing: > 0 a multiple of single spacing, < 0 an exact pitch of -ls px. */
  ls?: number;
  /** Space before / after in px. */
  sb?: number;
  sa?: number;
  /** Size and font of the paragraph mark (the height of an empty paragraph). */
  esz?: number;
  ef?: string;
  ec?: string;
}

export interface TxBody {
  p: TxPara[];
  /** Insets l, t, r, b in px. */
  ins: [number, number, number, number];
  anc: 't' | 'ctr' | 'b';
  wrap: boolean;
  /** Shrink text on overflow, or grow the shape to fit. */
  fit?: 'norm' | 'shape';
  /** Font scale and line-spacing reduction applied by shrink-on-overflow. */
  fs?: number;
  lr?: number;
  vert?: 'vert' | 'vert270';
}

export interface Box { x: number; y: number; w: number; h: number }

interface ElementBase {
  id: string;
  box: Box;
  /** Rotation in degrees, clockwise. */
  rot?: number;
  flipH?: boolean;
  flipV?: boolean;
  name?: string;
}

export interface ShapeElement extends ElementBase {
  k: 'shape';
  geom: Geometry;
  fill: Paint;
  line: LineStyle | null;
  shadow?: Shadow;
  tx?: TxBody;
}

export interface PictureElement extends ElementBase {
  k: 'pic';
  /** `assets/…`, or empty when the picture cannot be shown (EMF, WMF…). */
  href: string;
  /** Crop l, t, r, b as fractions of the picture. */
  crop?: [number, number, number, number];
  geom?: Geometry;
  line: LineStyle | null;
  shadow?: Shadow;
  alpha?: number;
  gray?: boolean;
}

export interface TableCell {
  tx: TxBody;
  fill: Paint;
  bl?: LineStyle | null;
  br?: LineStyle | null;
  bt?: LineStyle | null;
  bb?: LineStyle | null;
  /** Columns and rows this cell spans; covered cells are `merged`. */
  span?: [number, number];
  merged?: boolean;
}

export interface TableElement extends ElementBase {
  k: 'table';
  cols: number[];
  rows: Array<{ h: number; cells: TableCell[] }>;
}

export interface GroupElement extends ElementBase {
  k: 'group';
  /** Children, positioned in slide coordinates. */
  ch: SlideElement[];
}

export type SlideElement = ShapeElement | PictureElement | TableElement | GroupElement;

/** Width in px of `text` in `font` at `sizePx`. */
export type Measure = (text: string, font: string, sizePx: number, bold: boolean, italic: boolean) => number;

// Helpers ---------------------------------------------------------------------------------------

const n2 = (value: number): string => (Math.round(value * 100) / 100).toString();
export const escapeXml = (value: string): string => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Characters XML 1.0 forbids.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');

const GENERIC_FALLBACK = "'Segoe UI', Arial, sans-serif";

/** A CSS font stack for a family, with sensible fallbacks. */
export function fontStack(family: string): string {
  const clean = family.replace(/['"\\;<>]/g, '').trim();
  if (!clean) return GENERIC_FALLBACK;
  const lower = clean.toLowerCase();
  const serif = /times|georgia|garamond|cambria|book|serif|palatino|baskerville|didot|constantia|rockwell/.test(lower) && !/sans/.test(lower);
  const mono = /mono|consolas|courier|code/.test(lower);
  return `'${clean}', ${mono ? "Consolas, 'Courier New', monospace" : serif ? "Cambria, 'Times New Roman', serif" : GENERIC_FALLBACK}`;
}

/** Ascent ÷ (ascent + descent) of common faces; the first baseline sits this far into a line. */
const ASCENT: Record<string, number> = {
  aptos: 0.769, arial: 0.81, 'arial black': 0.81, calibri: 0.78, 'calibri light': 0.78, cambria: 0.81, candara: 0.78, consolas: 0.786,
  constantia: 0.78, corbel: 0.78, garamond: 0.766, georgia: 0.807, 'segoe ui': 0.811, 'segoe ui semibold': 0.811, 'segoe ui light': 0.811,
  'segoe ui black': 0.811, tahoma: 0.829, 'times new roman': 0.805, 'trebuchet ms': 0.809, verdana: 0.827, 'century gothic': 0.8,
  impact: 0.82, rockwell: 0.79, bahnschrift: 0.8, 'tw cen mt': 0.8, 'gill sans mt': 0.8, 'franklin gothic book': 0.8,
};

const faceKey = (font: string): string => font.toLowerCase().replace(/['"]/g, '').trim();
export const ascentOf = (font: string): number => ASCENT[faceKey(font)] ?? 0.8;
/** PowerPoint's single line spacing is 1.2 × the font size whatever the face (measured against its renders). */
export const lineFactorOf = (_font: string): number => 1.2;

/** A rough width when there is no measurer (tests). */
export function estimateMeasure(text: string, _font: string, sizePx: number, bold: boolean): number {
  let units = 0;
  for (const ch of text) {
    if (/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch)) units += 1;
    else if (/[A-Z0-9]/.test(ch)) units += 0.64;
    else if (/[il.,:;'|!]/.test(ch)) units += 0.28;
    else if (ch === ' ') units += 0.28;
    else if (/[mwMW]/.test(ch)) units += 0.85;
    else units += 0.52;
  }
  return units * sizePx * (bold ? 1.06 : 1);
}

// Colour shading for the faces PowerPoint lightens or darkens -------------------------------------

function shadeHex(hex: string, mode: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const channels = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  const amount = mode === 'darken' ? -0.4 : mode === 'darkenLess' ? -0.2 : mode === 'lighten' ? 0.4 : mode === 'lightenLess' ? 0.2 : 0;
  const out = channels.map((channel) => Math.round(amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount));
  return `#${out.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

// Numbering --------------------------------------------------------------------------------------

function roman(value: number): string {
  const table: Array<[number, string]> = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let rest = Math.max(1, Math.min(3999, value));
  let out = '';
  for (const [amount, letters] of table) while (rest >= amount) { out += letters; rest -= amount; }
  return out;
}

const alpha = (value: number): string => {
  let rest = Math.max(1, value);
  let out = '';
  while (rest > 0) { rest -= 1; out = String.fromCharCode(97 + (rest % 26)) + out; rest = Math.floor(rest / 26); }
  return out;
};

/** The label of item `value` in a DrawingML auto-numbering scheme. */
export function numberLabel(scheme: string, value: number): string {
  const base = scheme.startsWith('roman') ? roman(value) : scheme.startsWith('alpha') ? alpha(value) : String(value);
  const text = /Uc/.test(scheme) ? base.toUpperCase() : base;
  if (/ParenBoth$/.test(scheme)) return `(${text})`;
  if (/ParenR$/.test(scheme)) return `${text})`;
  if (/Period$/.test(scheme)) return `${text}.`;
  if (/Minus$/.test(scheme)) return `- ${text} -`;
  return text;
}

// Text layout ------------------------------------------------------------------------------------

interface Frag { run: number; text: string; width: number }
interface LaidLine { frags: Frag[]; width: number; size: number; font: string; spaces: number; last: boolean }

export interface LaidParagraph {
  index: number;
  lines: Array<LaidLine & { x0: number; avail: number; baseline: number; pitch: number }>;
  bullet: { text: string; x: number; size: number; color: string; font: string } | null;
  top: number;
}

export interface TextLayout {
  paragraphs: LaidParagraph[];
  /** Height the text needs, insets included. */
  height: number;
  /** Font scale and line reduction used (after shrink-on-overflow). */
  fs: number;
  lr: number;
}

const isCjkChar = (ch: string): boolean => /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch);

/** Splits text into words and spaces; CJK characters break anywhere. */
function tokens(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\s+|[^\s]+/g)) {
    const piece = match[0];
    if (/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/.test(piece) && !/\s/.test(piece)) {
      let buffer = '';
      for (const ch of piece) {
        if (isCjkChar(ch)) {
          if (buffer) out.push(buffer);
          out.push(ch);
          buffer = '';
        } else buffer += ch;
      }
      if (buffer) out.push(buffer);
    } else out.push(piece);
  }
  return out;
}

export const displayText = (run: TxRun): string => (run.cap === 'all' || run.cap === 'small' ? run.t.toUpperCase() : run.t);
const runSize = (run: TxRun, fs: number): number => {
  const size = run.sz * fs * (run.cap === 'small' ? 0.8 : 1) * (run.bl ? 0.67 : 1);
  return Math.max(1, size);
};

function measureRun(measure: Measure, run: TxRun, text: string, fs: number): number {
  const size = runSize(run, fs);
  return measure(text, run.f, size, Boolean(run.b), Boolean(run.i)) + (run.sp ?? 0) * fs * [...text].length;
}

/** Lays out the paragraphs of a body in a box of `w` × `h` px. */
export function layoutText(body: TxBody, w: number, h: number, measure: Measure, options: { refit?: boolean } = {}): TextLayout {
  const attempt = (fs: number, lr: number): TextLayout => layoutOnce(body, w, h, measure, fs, lr);
  let fs = body.fs ?? 1;
  let lr = body.lr ?? 0;
  let result = attempt(fs, lr);
  // Shrink on overflow is live in PowerPoint: after an edit it starts again from full size, and stored
  // text that clearly overflows shrinks further (PowerPoint tolerates a little overhang).
  if (body.fit === 'norm' && (options.refit || result.height > h * 1.08 + 2)) {
    if (options.refit) {
      fs = 1;
      lr = 0;
      result = attempt(fs, lr);
    }
    const steps: Array<[number, number]> = [[1, 0.1], [0.925, 0.1], [0.925, 0.2], [0.85, 0.2], [0.775, 0.2], [0.7, 0.2], [0.625, 0.2], [0.55, 0.2], [0.475, 0.2], [0.4, 0.2], [0.325, 0.2], [0.25, 0.2]];
    for (const [nextFs, nextLr] of steps) {
      if (result.height <= h + 1) break;
      if (nextFs > fs || (nextFs === fs && nextLr <= lr)) continue;
      fs = nextFs;
      lr = nextLr;
      result = attempt(fs, lr);
    }
  }
  return result;
}

function layoutOnce(body: TxBody, w: number, h: number, measure: Measure, fs: number, lr: number): TextLayout {
  const [il, it, ir, ib] = body.ins;
  const innerW = Math.max(1, w - il - ir);
  const counters = new Map<number, { scheme: string; value: number }>();
  const paragraphs: LaidParagraph[] = [];
  let cursor = 0;

  body.p.forEach((para, index) => {
    const runs = para.r;
    const level = para.lv ?? 0;
    const first = runs.find((run) => run.t && run.t !== '\n');
    const baseSize = (first ? runSize(first, fs) : (para.esz ?? 18) * fs);
    const baseFont = first?.f ?? para.ef ?? 'Calibri';
    const empty = !runs.some((run) => run.t && run.t !== '\n');

    // Bullets and numbering.
    let bullet: LaidParagraph['bullet'] = null;
    for (const key of [...counters.keys()]) if (key > level) counters.delete(key);
    if (para.bu && !empty) {
      let label = para.bu.ch ?? '';
      if (para.bu.num) {
        const current = counters.get(level);
        const value = current && current.scheme === para.bu.num ? current.value + 1 : para.bu.start ?? 1;
        counters.set(level, { scheme: para.bu.num, value });
        label = numberLabel(para.bu.num, value);
      } else counters.delete(level);
      const size = baseSize * (para.bu.sz ?? 1);
      bullet = { text: label, x: 0, size, color: para.bu.c ?? first?.c ?? '#000000', font: para.bu.f ?? baseFont };
    } else counters.delete(level);

    const ml = para.ml ?? 0;
    const indent = para.ind ?? 0;
    let firstX = Math.max(0, ml + indent);
    if (bullet) {
      bullet.x = firstX;
      const bulletWidth = measure(bullet.text, bullet.font, bullet.size, false, false);
      firstX = ml > firstX + bulletWidth ? ml : firstX + bulletWidth + baseSize * 0.3;
    }
    const restX = ml;

    // Line breaking.
    const lines: LaidLine[] = [];
    let line: LaidLine = { frags: [], width: 0, size: 0, font: baseFont, spaces: 0, last: false };
    const lineStart = (): number => (lines.length === 0 ? firstX : restX);
    const avail = (): number => Math.max(baseSize, innerW - lineStart());
    const pushFrag = (runIndex: number, text: string, width: number): void => {
      const last = line.frags[line.frags.length - 1];
      if (last && last.run === runIndex) {
        last.text += text;
        last.width += width;
      } else line.frags.push({ run: runIndex, text, width });
      line.width += width;
      const size = runSize(runs[runIndex], fs);
      if (size > line.size) { line.size = size; line.font = runs[runIndex].f; }
    };
    const breakLine = (): void => {
      // Trailing spaces do not count.
      while (line.frags.length) {
        const last = line.frags[line.frags.length - 1];
        const trimmed = last.text.replace(/\s+$/, '');
        if (trimmed === last.text) break;
        const removed = last.text.slice(trimmed.length);
        const removedWidth = measureRun(measure, runs[last.run], removed, fs);
        last.text = trimmed;
        last.width -= removedWidth;
        line.width -= removedWidth;
        if (!last.text) line.frags.pop();
        else break;
      }
      if (line.size === 0) line.size = baseSize;
      lines.push(line);
      line = { frags: [], width: 0, size: 0, font: baseFont, spaces: 0, last: false };
    };

    runs.forEach((run, runIndex) => {
      if (run.t === '\n') {
        if (line.size === 0) { line.size = runSize(run, fs); line.font = run.f; }
        breakLine();
        return;
      }
      for (const token of tokens(displayText(run))) {
        const width = measureRun(measure, run, token, fs);
        const space = /^\s+$/.test(token);
        if (space) {
          if (line.frags.length === 0 && lines.length > 0) continue;
          pushFrag(runIndex, token, width);
          continue;
        }
        if (body.wrap && line.width + width > avail() + 0.5 && line.frags.length > 0) breakLine();
        if (body.wrap && width > avail() + 0.5) {
          // A word longer than the line breaks between characters.
          let chunk = '';
          let chunkWidth = 0;
          for (const ch of token) {
            const chWidth = measureRun(measure, run, ch, fs);
            if (chunk && line.width + chunkWidth + chWidth > avail() + 0.5) {
              pushFrag(runIndex, chunk, chunkWidth);
              breakLine();
              chunk = '';
              chunkWidth = 0;
            }
            chunk += ch;
            chunkWidth += chWidth;
          }
          if (chunk) pushFrag(runIndex, chunk, chunkWidth);
        } else pushFrag(runIndex, token, width);
      }
    });
    if (line.frags.length > 0 || lines.length === 0 || runs[runs.length - 1]?.t === '\n') {
      if (line.size === 0) { line.size = empty ? (para.esz ?? baseSize / fs) * fs : baseSize; line.font = para.ef ?? baseFont; }
      breakLine();
    }
    lines[lines.length - 1].last = true;
    for (const entry of lines) entry.spaces = entry.frags.reduce((sum, frag) => sum + (frag.text.match(/ /g)?.length ?? 0), 0);

    // Vertical metrics.
    const top = cursor + (index > 0 ? (para.sb ?? 0) : 0);
    let y = top;
    const laid = lines.map((entry, lineIndex) => {
      const natural = entry.size * lineFactorOf(entry.font);
      const descent = natural * (1 - ascentOf(entry.font));
      const ls = para.ls ?? 1;
      const pitch = ls < 0 ? -ls * (1 - lr) : natural * Math.max(0.1, ls - lr);
      const baseline = y + Math.max(entry.size * 0.6, pitch - descent);
      y += pitch;
      const x0 = lineIndex === 0 ? firstX : restX;
      return { ...entry, x0, avail: Math.max(1, innerW - x0), baseline, pitch };
    });
    cursor = y + (para.sa ?? 0);
    paragraphs.push({ index, lines: laid, bullet, top });
  });

  const lastPara = body.p[body.p.length - 1];
  const textHeight = cursor - (lastPara?.sa ?? 0);
  const innerH = h - it - ib;
  const offset = body.anc === 'b' ? innerH - textHeight : body.anc === 'ctr' ? (innerH - textHeight) / 2 : 0;
  for (const para of paragraphs) {
    para.top += it + offset;
    for (const entry of para.lines) entry.baseline += it + offset;
  }
  return { paragraphs, height: textHeight + it + ib, fs, lr };
}

interface RunStyle { family: string; size: number; fill: string; alpha: number; bold: boolean; italic: boolean; deco: string; spacing: number; shift: number }

function runStyle(run: TxRun, fs: number): RunStyle {
  const size = runSize(run, fs);
  return {
    family: fontStack(run.f),
    size,
    fill: run.c ?? 'none',
    alpha: run.a ?? 1,
    bold: Boolean(run.b),
    italic: Boolean(run.i),
    deco: [run.u || run.link ? 'underline' : '', run.s ? 'line-through' : ''].filter(Boolean).join(' '),
    spacing: (run.sp ?? 0) * fs,
    shift: run.bl ? run.bl * run.sz * fs : 0,
  };
}

function styleAttrs(style: RunStyle, base: RunStyle | null): string {
  const out: string[] = [];
  if (!base || style.family !== base.family) out.push(`font-family="${escapeXml(style.family)}"`);
  if (!base || Math.abs(style.size - base.size) > 0.01) out.push(`font-size="${n2(style.size)}"`);
  if (!base || style.fill !== base.fill) out.push(`fill="${style.fill}"`);
  if ((!base && style.alpha < 1) || (base && style.alpha !== base.alpha)) out.push(`fill-opacity="${n2(style.alpha)}"`);
  if ((!base && style.bold) || (base && style.bold !== base.bold)) out.push(`font-weight="${style.bold ? 'bold' : 'normal'}"`);
  if ((!base && style.italic) || (base && style.italic !== base.italic)) out.push(`font-style="${style.italic ? 'italic' : 'normal'}"`);
  // Decorations propagate to descendants and cannot be cancelled there, so only runs carry them.
  if (base && style.deco) out.push(`text-decoration="${style.deco}"`);
  if ((!base && style.spacing) || (base && style.spacing !== base.spacing)) out.push(`letter-spacing="${n2(style.spacing)}"`);
  if (style.shift) out.push(`baseline-shift="${n2(style.shift)}"`);
  return out.join(' ');
}

/** SVG `<text>` elements for a laid-out body, in the body's local coordinates. */
export function textSvg(body: TxBody, layout: TextLayout, w: number): string {
  const [il] = body.ins;
  const out: string[] = [];
  for (const para of layout.paragraphs) {
    const source = body.p[para.index];
    const runs = source.r;
    const align = source.al ?? 'l';
    const first = runs.find((run) => run.t && run.t !== '\n') ?? runs[0];
    if (para.bullet && para.lines[0]) {
      const bullet = para.bullet;
      out.push(`<text data-bu="1" x="${n2(il + bullet.x)}" y="${n2(para.lines[0].baseline)}" font-family="${escapeXml(fontStack(bullet.font))}" font-size="${n2(bullet.size)}" fill="${bullet.color}">${escapeXml(bullet.text)}</text>`);
    }
    if (!first || para.lines.every((line) => line.frags.length === 0)) continue;
    const base = runStyle(first, layout.fs);
    const anchor = align === 'c' ? 'middle' : align === 'r' ? 'end' : 'start';
    const lines = para.lines.filter((line) => line.frags.length > 0).map((line) => {
      const x = il + (align === 'c' ? line.x0 + line.avail / 2 : align === 'r' ? line.x0 + line.avail : line.x0);
      const justify = align === 'j' && !line.last && line.spaces > 0 ? (line.avail - line.width) / line.spaces : 0;
      const spans = line.frags.map((frag) => {
        const attrs = styleAttrs(runStyle(runs[frag.run], layout.fs), base);
        return attrs ? `<tspan ${attrs}>${escapeXml(frag.text)}</tspan>` : escapeXml(frag.text);
      }).join('');
      return `<tspan x="${n2(x)}" y="${n2(line.baseline)}"${justify > 0 && justify < line.avail * 0.5 ? ` word-spacing="${n2(justify)}"` : ''}>${spans}</tspan>`;
    });
    out.push(`<text xml:space="preserve" ${styleAttrs(base, null)}${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${lines.join('')}</text>`);
  }
  void w;
  return out.join('');
}

// Paints, lines, effects --------------------------------------------------------------------------

interface Defs { id: string; list: string[]; count: number }
const defId = (defs: Defs, kind: string): string => `${defs.id}-${kind}${defs.count++}`;

function paintAttr(paint: Paint, defs: Defs, attribute: 'fill' | 'stroke', mode = 'norm'): string {
  if (paint.t === 'none') return `${attribute}="none"`;
  if (paint.t === 'solid') {
    const color = mode === 'norm' ? paint.c : shadeHex(paint.c, mode);
    return `${attribute}="${color}"${paint.a !== undefined && paint.a < 1 ? ` ${attribute}-opacity="${n2(paint.a)}"` : ''}`;
  }
  if (paint.t === 'grad') {
    const id = defId(defs, 'g');
    const stops = paint.stops.map((stop) => `<stop offset="${n2(stop.o)}" stop-color="${mode === 'norm' ? stop.c : shadeHex(stop.c, mode)}"${stop.a !== undefined && stop.a < 1 ? ` stop-opacity="${n2(stop.a)}"` : ''}/>`).join('');
    if (paint.path) {
      defs.list.push(`<radialGradient id="${id}" cx="0.5" cy="0.5" r="${paint.path === 'rect' ? '0.71' : '0.5'}">${stops}</radialGradient>`);
    } else {
      // DrawingML angles run clockwise from the +x axis, over the shape's box.
      const angle = ((paint.ang ?? 0) * Math.PI) / 180;
      const dx = Math.cos(angle) / 2;
      const dy = Math.sin(angle) / 2;
      defs.list.push(`<linearGradient id="${id}" x1="${n2(0.5 - dx)}" y1="${n2(0.5 - dy)}" x2="${n2(0.5 + dx)}" y2="${n2(0.5 + dy)}">${stops}</linearGradient>`);
    }
    return `${attribute}="url(#${id})"`;
  }
  return `${attribute}="none"`;
}

const DASHES: Record<string, number[]> = {
  dash: [4, 3], dashDot: [4, 3, 1, 3], dot: [1, 3], lgDash: [8, 3], lgDashDot: [8, 3, 1, 3], lgDashDotDot: [8, 3, 1, 3, 1, 3],
  sysDash: [3, 1], sysDot: [1, 1], sysDashDot: [3, 1, 1, 1], sysDashDotDot: [3, 1, 1, 1, 1, 1],
};

const ARROW_SIZE: Record<string, number> = { sm: 2, med: 3, lg: 5 };

function markerDef(arrow: Arrow, color: string, defs: Defs, end: boolean): string {
  const id = defId(defs, 'm');
  const w = ARROW_SIZE[arrow.w] ?? 3;
  const l = ARROW_SIZE[arrow.len] ?? 3;
  let shape: string;
  switch (arrow.type) {
    case 'oval': shape = `<ellipse cx="${l / 2}" cy="${w / 2}" rx="${l / 2}" ry="${w / 2}" fill="${color}"/>`; break;
    case 'diamond': shape = `<path d="M0 ${w / 2} L${l / 2} 0 L${l} ${w / 2} L${l / 2} ${w} Z" fill="${color}"/>`; break;
    case 'stealth': shape = `<path d="M0 0 L${l} ${w / 2} L0 ${w} L${l * 0.35} ${w / 2} Z" fill="${color}"/>`; break;
    case 'arrow': shape = `<path d="M0 0 L${l} ${w / 2} L0 ${w}" fill="none" stroke="${color}" stroke-width="0.6"/>`; break;
    default: shape = `<path d="M0 0 L${l} ${w / 2} L0 ${w} Z" fill="${color}"/>`;
  }
  const refX = arrow.type === 'oval' || arrow.type === 'diamond' ? l / 2 : l * 0.8;
  defs.list.push(`<marker id="${id}" viewBox="0 0 ${l} ${w}" markerWidth="${l}" markerHeight="${w}" refX="${n2(refX)}" refY="${w / 2}" orient="auto${end ? '' : '-start-reverse'}" markerUnits="strokeWidth">${shape}</marker>`);
  return id;
}

function lineAttrs(line: LineStyle | null, defs: Defs, withMarkers: boolean): string {
  if (!line || line.c.t === 'none' || line.w <= 0) return 'stroke="none"';
  const paint = line.c.t === 'grad' ? { t: 'solid' as const, c: line.c.stops[0]?.c ?? '#000000', a: line.c.stops[0]?.a } : line.c;
  const out = [paintAttr(paint, defs, 'stroke'), `stroke-width="${n2(line.w)}"`];
  const dash = line.dash ? DASHES[line.dash] : undefined;
  if (dash) out.push(`stroke-dasharray="${dash.map((value) => n2(value * Math.max(1, line.w))).join(' ')}"`);
  out.push(`stroke-linecap="${line.cap === 'rnd' ? 'round' : line.cap === 'sq' ? 'square' : 'butt'}"`);
  out.push(`stroke-linejoin="${line.join ?? 'round'}"`);
  if (withMarkers) {
    const color = paint.t === 'solid' ? paint.c : '#000000';
    if (line.head && line.head.type !== 'none') out.push(`marker-start="url(#${markerDef(line.head, color, defs, false)})"`);
    if (line.tail && line.tail.type !== 'none') out.push(`marker-end="url(#${markerDef(line.tail, color, defs, true)})"`);
  }
  return out.join(' ');
}

function shadowFilter(shadow: Shadow | undefined, defs: Defs): string {
  if (!shadow) return '';
  const id = defId(defs, 'f');
  defs.list.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${n2(shadow.dx)}" dy="${n2(shadow.dy)}" stdDeviation="${n2(shadow.blur / 2)}" flood-color="${shadow.c}" flood-opacity="${n2(shadow.a)}"/></filter>`);
  return ` filter="url(#${id})"`;
}

// Rendering --------------------------------------------------------------------------------------

export interface RenderOptions {
  measure: Measure;
  /** Re-run shrink-on-overflow (after an edit); imports keep PowerPoint's stored scale. */
  refit?: boolean;
}

const transformOf = (el: SlideElement): string => {
  const { x, y, w, h } = el.box;
  const parts = [`translate(${n2(x)} ${n2(y)})`];
  if (el.rot) parts.push(`rotate(${n2(el.rot)} ${n2(w / 2)} ${n2(h / 2)})`);
  return parts.join(' ');
};

const flipTransform = (el: SlideElement): string => {
  const { w, h } = el.box;
  if (el.flipH && el.flipV) return ` transform="translate(${n2(w)} ${n2(h)}) scale(-1 -1)"`;
  if (el.flipH) return ` transform="translate(${n2(w)} 0) scale(-1 1)"`;
  if (el.flipV) return ` transform="translate(0 ${n2(h)}) scale(1 -1)"`;
  return '';
};

/** The text of a body, laid out and drawn into the rectangle `rect` (local coordinates). */
function bodySvg(body: TxBody, rect: Box, options: RenderOptions, flipV: boolean): { svg: string; height: number } {
  const vertical = body.vert === 'vert' || body.vert === 'vert270';
  const w = vertical ? rect.h : rect.w;
  const h = vertical ? rect.w : rect.h;
  const layout = layoutText(body, w, h, options.measure, { refit: options.refit });
  let svg = textSvg(body, layout, w);
  if (!svg) return { svg: '', height: layout.height };
  let transform = `translate(${n2(rect.x)} ${n2(rect.y)})`;
  if (body.vert === 'vert') transform += ` translate(${n2(rect.w)} 0) rotate(90)`;
  else if (body.vert === 'vert270') transform += ` translate(0 ${n2(rect.h)}) rotate(-90)`;
  if (flipV) transform += ` rotate(180 ${n2(rect.w / 2)} ${n2(rect.h / 2)})`;
  svg = `<g transform="${transform}">${svg}</g>`;
  return { svg, height: layout.height };
}

function shapeInner(el: ShapeElement, options: RenderOptions, defs: Defs): string {
  const { w, h } = el.box;
  const paths = geometryPaths(el.geom, w, h);
  const isLine = !el.geom.paths && LINE_PRESETS.has(el.geom.prst ?? '');
  const filter = shadowFilter(el.shadow, defs);
  const parts: string[] = [];
  if (el.fill.t === 'img' && paths.length > 0) {
    const clip = defId(defs, 'c');
    defs.list.push(`<clipPath id="${clip}"><path d="${paths.filter((path) => path.fill !== 'none').map((path) => path.d).join(' ')}"/></clipPath>`);
    parts.push(`<g clip-path="url(#${clip})"${filter}>${imageMarkup(el.fill.href, w, h, el.fill.crop, el.fill.a)}</g>`);
    const outline = lineAttrs(el.line, defs, false);
    if (outline !== 'stroke="none"') parts.push(paths.filter((path) => path.stroke).map((path) => `<path d="${path.d}" fill="none" ${outline}/>`).join(''));
  } else if (paths.length > 0) {
    const stroke = lineAttrs(el.line, defs, isLine || Boolean(el.line?.head || el.line?.tail));
    const geometry = paths.map((path) => {
      const fill = path.fill === 'none' || isLine ? 'fill="none"' : paintAttr(el.fill, defs, 'fill', path.fill);
      return `<path d="${path.d}" ${fill} ${path.stroke ? stroke : 'stroke="none"'}/>`;
    }).join('');
    const visible = el.fill.t !== 'none' || (el.line && el.line.c.t !== 'none');
    if (visible) parts.push(`<g${flipTransform(el)}${filter}>${geometry}</g>`);
  }
  if (el.tx) {
    const rect = el.geom.paths ? { x: 0, y: 0, w, h } : presetTextRect(el.geom.prst, w, h, el.geom.av);
    const text = bodySvg(el.tx, rect, options, Boolean(el.flipV));
    // With no visible shape, PowerPoint casts the shadow from the text.
    const textFilter = el.fill.t === 'none' && (!el.line || el.line.c.t === 'none') ? filter : '';
    if (text.svg) parts.push(textFilter ? `<g${textFilter}>${text.svg}</g>` : text.svg);
  }
  return parts.join('');
}

function imageMarkup(href: string, w: number, h: number, crop?: [number, number, number, number], alpha?: number): string {
  const [l, t, r, b] = crop ?? [0, 0, 0, 0];
  const fullW = w / Math.max(0.01, 1 - l - r);
  const fullH = h / Math.max(0.01, 1 - t - b);
  return `<image href="${escapeXml(href)}" x="${n2(-l * fullW)}" y="${n2(-t * fullH)}" width="${n2(fullW)}" height="${n2(fullH)}" preserveAspectRatio="none"${alpha !== undefined && alpha < 1 ? ` opacity="${n2(alpha)}"` : ''}/>`;
}

function pictureInner(el: PictureElement, defs: Defs): string {
  const { w, h } = el.box;
  const filter = shadowFilter(el.shadow, defs);
  if (!el.href) {
    return `<rect width="${n2(w)}" height="${n2(h)}" fill="#808080" fill-opacity="0.08" stroke="#808080" stroke-opacity="0.35" stroke-dasharray="4 4"/>`;
  }
  const paths = el.geom ? geometryPaths(el.geom, w, h) : [];
  const shaped = el.geom && (el.geom.paths || (el.geom.prst && el.geom.prst !== 'rect'));
  const cropped = el.crop && el.crop.some((value) => value > 0.0005);
  let inner = imageMarkup(el.href, w, h, el.crop, el.alpha);
  if (el.gray) {
    const id = defId(defs, 'f');
    defs.list.push(`<filter id="${id}"><feColorMatrix type="saturate" values="0"/></filter>`);
    inner = `<g filter="url(#${id})">${inner}</g>`;
  }
  if (shaped || cropped) {
    const clip = defId(defs, 'c');
    const d = shaped ? paths.filter((path) => path.fill !== 'none').map((path) => path.d).join(' ') : `M0 0 H${n2(w)} V${n2(h)} H0 Z`;
    defs.list.push(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
    inner = `<g clip-path="url(#${clip})">${inner}</g>`;
  }
  const parts = [`<g${flipTransform(el)}${filter}>${inner}</g>`];
  const outline = lineAttrs(el.line, defs, false);
  if (outline !== 'stroke="none"') {
    const d = shaped ? paths.map((path) => path.d).join(' ') : `M0 0 H${n2(w)} V${n2(h)} H0 Z`;
    parts.push(`<path d="${d}" fill="none" ${outline}/>`);
  }
  return parts.join('');
}

/** Row heights grown to fit their text, as PowerPoint does. */
export function tableRowHeights(el: TableElement, measure: Measure): number[] {
  const heights = el.rows.map((row) => row.h);
  el.rows.forEach((row, r) => {
    let x = 0;
    row.cells.forEach((cell, c) => {
      const width = el.cols.slice(c, c + (cell.span?.[0] ?? 1)).reduce((sum, value) => sum + value, 0);
      if (!cell.merged && (cell.span?.[1] ?? 1) === 1 && cell.tx.p.some((para) => para.r.some((run) => run.t.trim()))) {
        const need = layoutText(cell.tx, width, row.h, measure).height;
        if (need > heights[r]) heights[r] = need;
      }
      x += el.cols[c] ?? 0;
    });
    void x;
  });
  return heights;
}

function tableInner(el: TableElement, options: RenderOptions, defs: Defs): string {
  const heights = tableRowHeights(el, options.measure);
  const xs = [0];
  for (const width of el.cols) xs.push(xs[xs.length - 1] + width);
  const ys = [0];
  for (const height of heights) ys.push(ys[ys.length - 1] + height);
  const fills: string[] = [];
  const texts: string[] = [];
  const borders: string[] = [];
  el.rows.forEach((row, r) => {
    row.cells.forEach((cell, c) => {
      if (cell.merged) return;
      const cs = cell.span?.[0] ?? 1;
      const rs = cell.span?.[1] ?? 1;
      const x = xs[c] ?? 0;
      const y = ys[r] ?? 0;
      const w = (xs[Math.min(xs.length - 1, c + cs)] ?? x) - x;
      const h = (ys[Math.min(ys.length - 1, r + rs)] ?? y) - y;
      if (cell.fill.t !== 'none') fills.push(`<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${paintAttr(cell.fill, defs, 'fill')}/>`);
      const text = bodySvg(cell.tx, { x, y, w, h }, options, false);
      if (text.svg) texts.push(text.svg);
      const edge = (line: LineStyle | null | undefined, x1: number, y1: number, x2: number, y2: number): void => {
        if (line && line.c.t !== 'none' && line.w > 0) borders.push(`<path d="M${n2(x1)} ${n2(y1)} L${n2(x2)} ${n2(y2)}" fill="none" ${lineAttrs({ ...line, cap: 'sq' }, defs, false)}/>`);
      };
      edge(cell.bt, x, y, x + w, y);
      edge(cell.bb, x, y + h, x + w, y + h);
      edge(cell.bl, x, y, x, y + h);
      edge(cell.br, x + w, y, x + w, y + h);
    });
  });
  return `${fills.join('')}${borders.join('')}${texts.join('')}`;
}

/** Encodes a model for the `data-m` attribute. */
const modelAttr = (el: SlideElement): string => escapeXml(JSON.stringify(el));

function renderNode(el: SlideElement, options: RenderOptions, top: boolean): string {
  const defs: Defs = { id: el.id, list: [], count: 0 };
  let inner: string;
  switch (el.k) {
    case 'shape': inner = shapeInner(el, options, defs); break;
    case 'pic': inner = pictureInner(el, defs); break;
    case 'table': inner = tableInner(el, options, defs); break;
    case 'group': {
      // Children are in slide coordinates; undo the group's translation.
      const children = el.ch.map((child) => renderNode(child, options, false)).join('');
      const parts = [`translate(${n2(-el.box.x)} ${n2(-el.box.y)})`];
      inner = `<g transform="${parts.join(' ')}">${children}</g>`;
      if (el.flipH || el.flipV) inner = `<g${flipTransform(el)}>${inner}</g>`;
      break;
    }
  }
  const kind = el.k === 'shape' && el.tx && el.fill.t === 'none' && (!el.line || el.line.c.t === 'none') ? 'text' : el.k;
  const head = `<g data-el="${escapeXml(el.id)}" data-kind="${kind}"${top ? ` data-m="${modelAttr(el)}"` : ''} transform="${transformOf(el)}">`;
  return `${head}${defs.list.length ? `<defs>${defs.list.join('')}</defs>` : ''}${inner}</g>`;
}

/** One element as a self-contained SVG group carrying its model. */
export function renderElement(el: SlideElement, options: RenderOptions): string {
  return renderNode(el, options, true);
}

export interface SlideBackground { paint: Paint }

/** The background as the slide's first element (a full-canvas rectangle or picture). */
export function renderBackground(bg: Paint, canvas: { width: number; height: number }): string {
  if (bg.t === 'img') {
    return `<g data-bg="1"><rect x="0" y="0" width="${canvas.width}" height="${canvas.height}" fill="#FFFFFF"/>${imageMarkup(bg.href, canvas.width, canvas.height, bg.crop, bg.a)}</g>`;
  }
  const defs: Defs = { id: 'bg', list: [], count: 0 };
  const fill = bg.t === 'none' ? 'fill="#FFFFFF"' : paintAttr(bg, defs, 'fill');
  return `${defs.list.length ? `<defs>${defs.list.join('')}</defs>` : ''}<rect data-bg="1" x="0" y="0" width="${canvas.width}" height="${canvas.height}" ${fill}/>`;
}

/** A whole slide: background, then elements in z-order. */
export function renderSlideSvg(input: { canvas: { width: number; height: number }; background: Paint; elements: SlideElement[] }, options: RenderOptions): string {
  const { width, height } = input.canvas;
  const body = input.elements.map((el) => renderElement(el, options)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(width)} ${n2(height)}" data-model="1">${renderBackground(input.background, input.canvas)}${body}</svg>`;
}

// Model utilities --------------------------------------------------------------------------------

/** Plain text of a body: paragraphs joined by newlines. */
export function bodyText(body: TxBody): string {
  return body.p.map((para) => para.r.map((run) => (run.t === '\n' ? '\n' : run.t)).join('')).join('\n');
}

/** Every text body in an element (tables and groups included). */
export function elementBodies(el: SlideElement): TxBody[] {
  if (el.k === 'shape') return el.tx ? [el.tx] : [];
  if (el.k === 'table') return el.rows.flatMap((row) => row.cells.filter((cell) => !cell.merged).map((cell) => cell.tx));
  if (el.k === 'group') return el.ch.flatMap(elementBodies);
  return [];
}

/** Moves an element (and a group's children) by dx, dy. */
export function translateElement<T extends SlideElement>(el: T, dx: number, dy: number): T {
  const box = { ...el.box, x: el.box.x + dx, y: el.box.y + dy };
  if (el.k === 'group') return { ...el, box, ch: el.ch.map((child) => translateElement(child, dx, dy)) };
  return { ...el, box };
}

/** Resizes an element into `box`; a group scales its children's frames (not their text). */
export function resizeElement<T extends SlideElement>(el: T, box: Box): T {
  if (el.k === 'group') {
    const sx = el.box.w > 0 ? box.w / el.box.w : 1;
    const sy = el.box.h > 0 ? box.h / el.box.h : 1;
    const map = (child: SlideElement): SlideElement => resizeElement(child, {
      x: box.x + (child.box.x - el.box.x) * sx,
      y: box.y + (child.box.y - el.box.y) * sy,
      w: child.box.w * sx,
      h: child.box.h * sy,
    });
    return { ...el, box, ch: el.ch.map(map) };
  }
  if (el.k === 'table') {
    const sx = el.box.w > 0 ? box.w / el.box.w : 1;
    const sy = el.box.h > 0 ? box.h / el.box.h : 1;
    return { ...el, box, cols: el.cols.map((width) => width * sx), rows: el.rows.map((row) => ({ ...row, h: row.h * sy })) };
  }
  return { ...el, box };
}

/** Gives an element (and its children) fresh ids. */
export function reidElement<T extends SlideElement>(el: T, nextId: () => string): T {
  if (el.k === 'group') return { ...el, id: nextId(), ch: el.ch.map((child) => reidElement(child, nextId)) };
  return { ...el, id: nextId() };
}

/** Finds a nested element by id. */
export function findElement(el: SlideElement, id: string): SlideElement | null {
  if (el.id === id) return el;
  if (el.k === 'group') {
    for (const child of el.ch) {
      const found = findElement(child, id);
      if (found) return found;
    }
  }
  return null;
}

/** Replaces a nested element by id. */
export function replaceNested(el: SlideElement, id: string, next: SlideElement): SlideElement {
  if (el.id === id) return next;
  if (el.k === 'group') return { ...el, ch: el.ch.map((child) => replaceNested(child, id, next)) };
  return el;
}

/** Applies `change` to every text body in an element (tables and groups included). */
export function mapBodies(el: SlideElement, change: (body: TxBody) => TxBody): SlideElement {
  if (el.k === 'shape') return el.tx ? { ...el, tx: change(el.tx) } : el;
  if (el.k === 'table') return { ...el, rows: el.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => (cell.merged ? cell : { ...cell, tx: change(cell.tx) })) })) };
  if (el.k === 'group') return { ...el, ch: el.ch.map((child) => mapBodies(child, change)) };
  return el;
}

/** Applies `change` to every run of every body in an element. */
export function mapRuns(el: SlideElement, change: (run: TxRun) => TxRun): SlideElement {
  const mapBody = (body: TxBody): TxBody => ({ ...body, p: body.p.map((para) => ({ ...para, r: para.r.map(change) })) });
  if (el.k === 'shape') return el.tx ? { ...el, tx: mapBody(el.tx) } : el;
  if (el.k === 'table') return { ...el, rows: el.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, tx: mapBody(cell.tx) })) })) };
  if (el.k === 'group') return { ...el, ch: el.ch.map((child) => mapRuns(child, change)) };
  return el;
}

/** A "resize shape to fit text" box grown (or shrunk) to its text's height. */
export function fitToText<T extends SlideElement>(el: T, measure: Measure): T {
  if (el.k !== 'shape' || !el.tx || el.tx.fit !== 'shape' || el.tx.vert) return el;
  const height = layoutText(el.tx, el.box.w, el.box.h, measure).height;
  if (Math.abs(height - el.box.h) < 0.5) return el;
  return { ...el, box: { ...el.box, h: Math.max(4, height) } };
}
