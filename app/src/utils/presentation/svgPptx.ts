// Converts a designed slide's SVG into native PowerPoint shapes (DrawingML):
// rect / circle / ellipse become preset shapes, paths and polygons custom
// geometry, text editable text frames, images pictures (with crop and round
// clips), gradients gradient fills, feDropShadow / glow filters effects, and
// top-level groups groups. Text frames are placed with ppt-master's baseline
// model (github.com/hugohe3/ppt-master, MIT) so the first baseline lands where
// the SVG put it. What DrawingML cannot express (masks, patterns, blend modes)
// is left out and reported. Uses the global DOMParser; no other dependencies.

import { normalizeHex } from './designColors';
import { elementXml } from './modelPptx';
import type { SlideElement } from './slideModel';

export interface PptxPicture {
  data: Uint8Array;
  ext: 'png' | 'jpeg' | 'gif';
  width: number;
  height: number;
}

/** Width in px of `text` set in `font` at `sizePx`. */
export type TextMeasurer = (text: string, font: string, sizePx: number, bold: boolean, italic: boolean) => number;

export interface ConvertOptions {
  slideWidthEmu: number;
  slideHeightEmu: number;
  /** A preloaded picture for an `<image href>`, or null when it cannot be used. */
  picture: (href: string) => PptxPicture | null;
  measure?: TextMeasurer;
  /** BCP-47 language for text runs. */
  lang?: string;
  /** Prefix for relationship ids, unique per slide. */
  relPrefix?: string;
}

export interface ConvertedSlide {
  /** `<p:bg>…</p:bg>` or ''. */
  background: string;
  /** Children of `<p:spTree>`. */
  shapes: string;
  media: Array<{ rId: string; picture: PptxPicture }>;
  warnings: string[];
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const isIdentity = (m: Matrix): boolean => {
  // A modelled element's own transform only places it; its model already holds the position.
  return Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9;
};
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseTransform(value: string | null): Matrix {
  let m: Matrix = IDENTITY;
  if (!value) return m;
  for (const match of value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const n = (match[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    let t: Matrix = IDENTITY;
    switch (match[1]) {
      case 'matrix': if (n.length === 6) t = n as Matrix; break;
      case 'translate': t = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]; break;
      case 'scale': t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]; break;
      case 'rotate': {
        const a = ((n[0] ?? 0) * Math.PI) / 180;
        const r: Matrix = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        t = n.length >= 3 ? multiply(multiply([1, 0, 0, 1, n[1], n[2]], r), [1, 0, 0, 1, -n[1], -n[2]]) : r;
        break;
      }
      case 'skewX': t = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      case 'skewY': t = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = multiply(m, t);
  }
  return m;
}

/** Rotation and scale of a matrix with no skew or mirror; null otherwise. */
function similarity(m: Matrix): { scale: number; sx: number; sy: number; rotation: number } | null {
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  const det = m[0] * m[3] - m[1] * m[2];
  if (det <= 0 || sx === 0 || sy === 0) return null;
  if (Math.abs(m[0] * m[2] + m[1] * m[3]) > 1e-6 * sx * sy) return null;
  return { scale: Math.sqrt(det), sx, sy, rotation: (Math.atan2(m[1], m[0]) * 180) / Math.PI };
}

// Styles ---------------------------------------------------------------------------

const NAMED: Record<string, string> = {
  black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00', orange: '#FFA500',
  purple: '#800080', gray: '#808080', grey: '#808080', silver: '#C0C0C0', navy: '#000080', teal: '#008080', maroon: '#800000',
  olive: '#808000', lime: '#00FF00', aqua: '#00FFFF', cyan: '#00FFFF', fuchsia: '#FF00FF', magenta: '#FF00FF', pink: '#FFC0CB',
  gold: '#FFD700', beige: '#F5F5DC', ivory: '#FFFFF0', coral: '#FF7F50', salmon: '#FA8072', crimson: '#DC143C', indigo: '#4B0082',
  violet: '#EE82EE', tan: '#D2B48C', brown: '#A52A2A', khaki: '#F0E68C', lavender: '#E6E6FA', whitesmoke: '#F5F5F5',
  gainsboro: '#DCDCDC', lightgray: '#D3D3D3', darkgray: '#A9A9A9', dimgray: '#696969', slategray: '#708090', skyblue: '#87CEEB',
  steelblue: '#4682B4', tomato: '#FF6347', orchid: '#DA70D6', turquoise: '#40E0D0', mintcream: '#F5FFFA', snow: '#FFFAFA',
};

type Paint = { kind: 'none' } | { kind: 'solid'; hex: string; alpha: number } | { kind: 'url'; id: string };

function parsePaint(value: string | null | undefined, current: string): Paint | null {
  if (value === null || value === undefined) return null;
  const v = value.trim();
  if (!v || v === 'inherit') return null;
  if (v === 'none' || v === 'transparent') return { kind: 'none' };
  const url = v.match(/^url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/);
  if (url) return { kind: 'url', id: url[1] };
  if (v === 'currentColor') return parsePaint(current, '#000000');
  const hex = normalizeHex(v.startsWith('#') ? v : '');
  if (hex) {
    const alpha = /^#[0-9a-f]{8}$/i.test(v) ? Number.parseInt(v.slice(7, 9), 16) / 255 : /^#[0-9a-f]{4}$/i.test(v) ? Number.parseInt(v[4] + v[4], 16) / 255 : 1;
    return { kind: 'solid', hex, alpha };
  }
  const rgb = v.match(/^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (rgb) {
    const channel = (s: string): number => (s.endsWith('%') ? (Number.parseFloat(s) / 100) * 255 : Number.parseFloat(s));
    const alpha = rgb[4] ? (rgb[4].endsWith('%') ? Number.parseFloat(rgb[4]) / 100 : Number.parseFloat(rgb[4])) : 1;
    const to2 = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return { kind: 'solid', hex: `#${to2(channel(rgb[1]))}${to2(channel(rgb[2]))}${to2(channel(rgb[3]))}`.toUpperCase(), alpha };
  }
  const named = NAMED[v.toLowerCase()];
  return named ? { kind: 'solid', hex: named, alpha: 1 } : null;
}

interface Ctx {
  m: Matrix;
  opacity: number;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  dash: string;
  cap: string;
  join: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  anchor: string;
  letterSpacing: number;
  decoration: string;
  color: string;
  /** A filter on an ancestor group, applied to each shape inside it. */
  filter: string | null;
}

const INITIAL: Ctx = {
  m: IDENTITY, opacity: 1, fill: '#000000', fillOpacity: 1, stroke: 'none', strokeOpacity: 1, strokeWidth: 1, dash: 'none',
  cap: 'butt', join: 'miter', fontFamily: 'Segoe UI', fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', anchor: 'start',
  letterSpacing: 0, decoration: 'none', color: '#000000', filter: null,
};

const tag = (node: Node): string => ((node as Element).localName || node.nodeName).replace(/^.*:/, '');
const num = (value: string | null | undefined, fallback = 0): number => {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : fallback;
};
const numList = (value: string | null): number[] => (value ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);

const styleCache = new WeakMap<Element, Map<string, string>>();
function styleMap(el: Element): Map<string, string> {
  let map = styleCache.get(el);
  if (!map) {
    map = new Map();
    for (const part of (el.getAttribute('style') || '').split(';')) {
      const colon = part.indexOf(':');
      if (colon > 0) map.set(part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim());
    }
    styleCache.set(el, map);
  }
  return map;
}
const prop = (el: Element, name: string): string | null => styleMap(el).get(name) ?? (el.hasAttribute(name) ? el.getAttribute(name) : null);

function opacityValue(value: string | null): number | null {
  if (value === null) return null;
  const n = value.trim().endsWith('%') ? Number.parseFloat(value) / 100 : Number.parseFloat(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}

function inherit(el: Element, ctx: Ctx): Ctx {
  const next: Ctx = { ...ctx, m: multiply(ctx.m, parseTransform(el.getAttribute('transform'))) };
  const set = <K extends keyof Ctx>(key: K, value: Ctx[K] | null | undefined): void => { if (value !== null && value !== undefined) next[key] = value; };
  set('color', prop(el, 'color'));
  set('fill', prop(el, 'fill'));
  set('stroke', prop(el, 'stroke'));
  set('fillOpacity', opacityValue(prop(el, 'fill-opacity')));
  set('strokeOpacity', opacityValue(prop(el, 'stroke-opacity')));
  const width = prop(el, 'stroke-width');
  if (width !== null) set('strokeWidth', num(width, ctx.strokeWidth));
  set('dash', prop(el, 'stroke-dasharray'));
  set('cap', prop(el, 'stroke-linecap'));
  set('join', prop(el, 'stroke-linejoin'));
  const family = prop(el, 'font-family');
  if (family) set('fontFamily', family);
  const size = prop(el, 'font-size');
  if (size !== null && num(size) > 0) set('fontSize', num(size));
  set('fontWeight', prop(el, 'font-weight'));
  set('fontStyle', prop(el, 'font-style'));
  set('anchor', prop(el, 'text-anchor'));
  const spacing = prop(el, 'letter-spacing');
  if (spacing !== null) set('letterSpacing', spacing === 'normal' ? 0 : num(spacing));
  set('decoration', prop(el, 'text-decoration'));
  const opacity = opacityValue(prop(el, 'opacity'));
  if (opacity !== null) next.opacity = ctx.opacity * opacity;
  const filter = el.getAttribute('filter') || prop(el, 'filter');
  if (filter) next.filter = filter;
  return next;
}

// XML helpers ------------------------------------------------------------------------

const xml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Characters XML 1.0 forbids.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
const pct = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 100000);
const color = (hex: string, alpha: number): string => {
  const a = pct(alpha);
  return `<a:srgbClr val="${hex.slice(1)}">${a < 100000 ? `<a:alpha val="${a}"/>` : ''}</a:srgbClr>`;
};
const angle60k = (degrees: number): number => Math.round((((degrees % 360) + 360) % 360) * 60000);

interface Box { x: number; y: number; w: number; h: number }

// Paths ------------------------------------------------------------------------------

type Seg = { op: 'M' | 'L'; p: [number, number] } | { op: 'C'; p: [number, number, number, number, number, number] } | { op: 'Z' };

/** Arc endpoint parameterisation → cubic Béziers (SVG implementation notes, F.6). */
function arcToCubics(x1: number, y1: number, rxIn: number, ryIn: number, phiDeg: number, largeArc: number, sweep: number, x2: number, y2: number): Seg[] {
  if (rxIn === 0 || ryIn === 0) return [{ op: 'L', p: [x2, y2] }];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, numerator / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const vecAngle = (ux: number, uy: number, vx: number, vy: number): number => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = vecAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const parts = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / parts;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: Seg[] = [];
  let t = theta1;
  const point = (angle: number): [number, number] => [cx + rx * Math.cos(angle) * cos - ry * Math.sin(angle) * sin, cy + rx * Math.cos(angle) * sin + ry * Math.sin(angle) * cos];
  const deriv = (angle: number): [number, number] => [-rx * Math.sin(angle) * cos - ry * Math.cos(angle) * sin, -rx * Math.sin(angle) * sin + ry * Math.cos(angle) * cos];
  for (let i = 0; i < parts; i += 1) {
    const t2 = t + step;
    const [px1, py1] = point(t);
    const [px2, py2] = point(t2);
    const [d1x, d1y] = deriv(t);
    const [d2x, d2y] = deriv(t2);
    out.push({ op: 'C', p: [px1 + k * d1x, py1 + k * d1y, px2 - k * d2x, py2 - k * d2y, px2, py2] });
    t = t2;
  }
  return out;
}

/** Path data → absolute M / L / C / Z segments. */
export function parsePathData(d: string): Seg[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const segs: Seg[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;
  const next = (): number => Number(tokens[i++]);
  const hasNumber = (): boolean => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      segs.push({ op: 'Z' });
      x = sx;
      y = sy;
      lastC = lastQ = null;
      cmd = '';
      continue;
    }
    if (!hasNumber()) {
      cmd = '';
      continue;
    }
    switch (C) {
      case 'M': {
        x = next() + (rel ? x : 0);
        y = next() + (rel ? y : 0);
        sx = x;
        sy = y;
        segs.push({ op: 'M', p: [x, y] });
        cmd = rel ? 'l' : 'L';
        lastC = lastQ = null;
        break;
      }
      case 'L': x = next() + (rel ? x : 0); y = next() + (rel ? y : 0); segs.push({ op: 'L', p: [x, y] }); lastC = lastQ = null; break;
      case 'H': x = next() + (rel ? x : 0); segs.push({ op: 'L', p: [x, y] }); lastC = lastQ = null; break;
      case 'V': y = next() + (rel ? y : 0); segs.push({ op: 'L', p: [x, y] }); lastC = lastQ = null; break;
      case 'C': {
        const p = [next(), next(), next(), next(), next(), next()].map((v, j) => v + (rel ? (j % 2 ? y : x) : 0)) as [number, number, number, number, number, number];
        segs.push({ op: 'C', p });
        lastC = [p[2], p[3]];
        lastQ = null;
        [x, y] = [p[4], p[5]];
        break;
      }
      case 'S': {
        const c1: [number, number] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
        const p = [next(), next(), next(), next()].map((v, j) => v + (rel ? (j % 2 ? y : x) : 0));
        segs.push({ op: 'C', p: [c1[0], c1[1], p[0], p[1], p[2], p[3]] });
        lastC = [p[0], p[1]];
        lastQ = null;
        [x, y] = [p[2], p[3]];
        break;
      }
      case 'Q': case 'T': {
        let q: [number, number];
        let end: [number, number];
        if (C === 'Q') {
          const p = [next(), next(), next(), next()].map((v, j) => v + (rel ? (j % 2 ? y : x) : 0));
          q = [p[0], p[1]];
          end = [p[2], p[3]];
        } else {
          q = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
          end = [next() + (rel ? x : 0), next() + (rel ? y : 0)];
        }
        segs.push({ op: 'C', p: [x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y), end[0] + (2 / 3) * (q[0] - end[0]), end[1] + (2 / 3) * (q[1] - end[1]), end[0], end[1]] });
        lastQ = q;
        lastC = null;
        [x, y] = end;
        break;
      }
      case 'A': {
        const [rx, ry, rot, large, sweep] = [next(), next(), next(), next(), next()];
        const ex = next() + (rel ? x : 0);
        const ey = next() + (rel ? y : 0);
        segs.push(...arcToCubics(x, y, rx, ry, rot, large ? 1 : 0, sweep ? 1 : 0, ex, ey));
        [x, y] = [ex, ey];
        lastC = lastQ = null;
        break;
      }
      default:
        i += 1;
    }
    if (segs.length > 20000) break;
  }
  return segs.filter((seg) => seg.op === 'Z' || seg.p.every(Number.isFinite));
}

const transformSegs = (segs: Seg[], m: Matrix): Seg[] => segs.map((seg) => {
  if (seg.op === 'Z') return seg;
  if (seg.op === 'C') {
    const [a, b] = apply(m, seg.p[0], seg.p[1]);
    const [c, d] = apply(m, seg.p[2], seg.p[3]);
    const [e, f] = apply(m, seg.p[4], seg.p[5]);
    return { op: 'C', p: [a, b, c, d, e, f] };
  }
  return { op: seg.op, p: apply(m, seg.p[0], seg.p[1]) };
});

function segBox(segs: Seg[]): Box | null {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const seg of segs) {
    if (seg.op === 'Z') continue;
    for (let i = 0; i < seg.p.length; i += 2) {
      minX = Math.min(minX, seg.p[i]); maxX = Math.max(maxX, seg.p[i]);
      minY = Math.min(minY, seg.p[i + 1]); maxY = Math.max(maxY, seg.p[i + 1]);
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

const ellipseSegs = (cx: number, cy: number, rx: number, ry: number): Seg[] => {
  const k = 0.5522847498;
  return [
    { op: 'M', p: [cx + rx, cy] },
    { op: 'C', p: [cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry] },
    { op: 'C', p: [cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy] },
    { op: 'C', p: [cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry] },
    { op: 'C', p: [cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy] },
    { op: 'Z' },
  ];
};

function rectSegs(x: number, y: number, w: number, h: number, rx: number, ry: number): Seg[] {
  if (rx <= 0 || ry <= 0) return [{ op: 'M', p: [x, y] }, { op: 'L', p: [x + w, y] }, { op: 'L', p: [x + w, y + h] }, { op: 'L', p: [x, y + h] }, { op: 'Z' }];
  const k = 0.5522847498;
  return [
    { op: 'M', p: [x + rx, y] }, { op: 'L', p: [x + w - rx, y] },
    { op: 'C', p: [x + w - rx + k * rx, y, x + w, y + ry - k * ry, x + w, y + ry] }, { op: 'L', p: [x + w, y + h - ry] },
    { op: 'C', p: [x + w, y + h - ry + k * ry, x + w - rx + k * rx, y + h, x + w - rx, y + h] }, { op: 'L', p: [x + rx, y + h] },
    { op: 'C', p: [x + rx - k * rx, y + h, x, y + h - ry + k * ry, x, y + h - ry] }, { op: 'L', p: [x, y + ry] },
    { op: 'C', p: [x, y + ry - k * ry, x + rx - k * rx, y, x + rx, y] }, { op: 'Z' },
  ];
}

// Fonts and text ---------------------------------------------------------------------------

/** Ascent ÷ (ascent + descent) of common Office faces (ppt-master font_metrics.json). */
const ASCENT: Record<string, number> = {
  aptos: 0.769, arial: 0.81, 'arial black': 0.81, calibri: 0.78, cambria: 0.81, candara: 0.78, consolas: 0.786,
  constantia: 0.78, corbel: 0.78, garamond: 0.766, georgia: 0.807, 'segoe ui': 0.811, 'segoe ui semibold': 0.811,
  'segoe ui light': 0.811, 'segoe ui black': 0.811, tahoma: 0.829, 'times new roman': 0.805, 'trebuchet ms': 0.809,
  verdana: 0.827, 'yu gothic': 0.765, 'microsoft yahei': 0.802, simsun: 0.859, 'ms gothic': 0.859, 'malgun gothic': 0.818,
  meiryo: 0.707, bahnschrift: 0.8, 'century gothic': 0.8, impact: 0.82, rockwell: 0.79,
};

const GENERIC: Record<string, string> = { 'sans-serif': 'Arial', serif: 'Times New Roman', monospace: 'Courier New', cursive: 'Segoe Script', fantasy: 'Impact', 'system-ui': 'Segoe UI' };

export function primaryFont(stack: string): string {
  const first = stack.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
  return GENERIC[first.toLowerCase()] ?? (first || 'Segoe UI');
}

const isCjk = (ch: string): boolean => /[⺀-鿿가-힯豈-﫿＀-￯]/.test(ch);

/** A rough width when no measurer is given (tests, or a font the canvas cannot load). */
export function estimateWidth(text: string, _font: string, sizePx: number, bold: boolean): number {
  let units = 0;
  for (const ch of text) {
    if (isCjk(ch)) units += 1;
    else if (/[A-Z0-9]/.test(ch)) units += 0.64;
    else if (/[il.,:;'|!]/.test(ch)) units += 0.28;
    else if (ch === ' ') units += 0.28;
    else if (/[mwMW]/.test(ch)) units += 0.85;
    else units += 0.52;
  }
  return units * sizePx * (bold ? 1.06 : 1);
}

interface Run {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
  font: string;
  paint: Paint | null;
  fillOpacity: number;
  opacity: number;
  decoration: string;
  letterSpacing: number;
  current: string;
}

interface Line {
  x: number | null;
  baseline: number;
  runs: Run[];
}

const boldOf = (weight: string): boolean => weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;

/** ppt-master's first-baseline offset (px) of a zero-inset, top-anchored DrawingML frame. */
function baselineOffset(sizePx: number, font: string, spacingPx: number | null): number {
  const size = Math.round(sizePx * 75) / 100;
  const ratio = ASCENT[font.toLowerCase()] ?? 0.8;
  const natural = 1.2 * size;
  let baseline = natural * ratio;
  if (spacingPx !== null) {
    const spacing = Math.round(spacingPx * 0.75);
    const minimum = 0.75 * spacing;
    baseline = spacing <= natural ? Math.max(minimum, spacing - (natural - baseline)) : minimum;
  }
  return Math.round(baseline) * (4 / 3);
}

// The converter ----------------------------------------------------------------------------

export function convertSvgSlide(svg: string, options: ConvertOptions): ConvertedSlide {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const warnings = new Set<string>();
  const box = numList(root.getAttribute('viewBox'));
  const view = box.length === 4 && box[2] > 0 && box[3] > 0 ? { x: box[0], y: box[1], w: box[2], h: box[3] } : { x: 0, y: 0, w: 1280, h: 720 };
  const sx = options.slideWidthEmu / view.w;
  const sy = options.slideHeightEmu / view.h;
  const emuX = (px: number): number => Math.round((px - view.x) * sx);
  const emuY = (px: number): number => Math.round((px - view.y) * sy);
  const emuLen = (px: number): number => Math.round(px * Math.min(sx, sy));
  const measure = options.measure ?? estimateWidth;
  const lang = options.lang ?? 'en-US';
  const relPrefix = options.relPrefix ?? 'rIdYz';

  const byId = new Map<string, Element>();
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const id = el.getAttribute('id');
    if (id && !byId.has(id)) byId.set(id, el);
  }
  const media: ConvertedSlide['media'] = [];
  const mediaByHref = new Map<string, string>();
  let nextId = 2;

  const shapeName = (el: Element, fallback: string): string => xml(el.getAttribute('id') || `${fallback} ${nextId}`);

  function registerPicture(href: string, picture: PptxPicture): string {
    let rId = mediaByHref.get(href);
    if (!rId) {
      rId = `${relPrefix}${media.length + 1}`;
      mediaByHref.set(href, rId);
      media.push({ rId, picture });
    }
    return rId;
  }

  // Elements that carry their slide model are written as the PowerPoint objects they describe.
  const modelContext = {
    emuPerPx: sx,
    x: emuX,
    y: emuY,
    nextId: () => nextId++,
    picture: (href: string): string | null => {
      const picture = options.picture(href);
      if (!picture) {
        warnings.add(`A picture could not be placed: ${href.slice(0, 80)}`);
        return null;
      }
      return registerPicture(href, picture);
    },
    lang,
  };
  function modelShapes(el: Element): Out[] | null {
    const raw = el.getAttribute('data-m');
    if (!raw) return null;
    let model: SlideElement;
    try {
      model = JSON.parse(raw) as SlideElement;
    } catch {
      return null;
    }
    const out = elementXml(model, modelContext);
    return out ? [{ xml: out, box: { x: model.box.x, y: model.box.y, w: model.box.w, h: model.box.h } }] : [];
  }

  // Gradients ---------------------------------------------------------------------------
  function gradientStops(grad: Element, alpha: number): Array<{ o: number; hex: string; a: number }> {
    let source: Element | null = grad;
    for (let depth = 0; depth < 3 && source; depth += 1) {
      const stops = Array.from(source.childNodes).filter((node) => node.nodeType === 1 && tag(node) === 'stop') as Element[];
      if (stops.length > 0) {
        let last = 0;
        return stops.map((stop) => {
          const raw = stop.getAttribute('offset') || '0';
          const o = Math.max(last, Math.min(1, raw.endsWith('%') ? num(raw) / 100 : num(raw)));
          last = o;
          const paint = parsePaint(prop(stop, 'stop-color') ?? '#000000', '#000000');
          const stopAlpha = opacityValue(prop(stop, 'stop-opacity')) ?? 1;
          return { o, hex: paint?.kind === 'solid' ? paint.hex : '#000000', a: (paint?.kind === 'solid' ? paint.alpha : 1) * stopAlpha * alpha };
        });
      }
      const href: string = (source.getAttribute('href') || source.getAttribute('xlink:href') || '').replace(/^#/, '');
      source = href ? byId.get(href) ?? null : null;
    }
    return [];
  }

  function gradAttr(grad: Element, name: string, fallback: string): string {
    let source: Element | null = grad;
    for (let depth = 0; depth < 3 && source; depth += 1) {
      if (source.hasAttribute(name)) return source.getAttribute(name) ?? fallback;
      const href: string = (source.getAttribute('href') || source.getAttribute('xlink:href') || '').replace(/^#/, '');
      source = href ? byId.get(href) ?? null : null;
    }
    return fallback;
  }

  const coord = (value: string, extent: number, origin: number, bbox: boolean): number => (value.endsWith('%') ? (num(value) / 100) * (bbox ? 1 : extent) + (bbox ? 0 : origin) : num(value));

  function colorAt(stops: Array<{ o: number; hex: string; a: number }>, t: number): { hex: string; a: number } {
    if (t <= stops[0].o) return stops[0];
    for (let i = 1; i < stops.length; i += 1) {
      if (t <= stops[i].o) {
        const span = stops[i].o - stops[i - 1].o || 1;
        const f = (t - stops[i - 1].o) / span;
        const [a, b] = [stops[i - 1], stops[i]];
        const channel = (k: number): number => Number.parseInt(a.hex.slice(k, k + 2), 16) + (Number.parseInt(b.hex.slice(k, k + 2), 16) - Number.parseInt(a.hex.slice(k, k + 2), 16)) * f;
        const hex = `#${[1, 3, 5].map((k) => Math.round(channel(k)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
        return { hex, a: a.a + (b.a - a.a) * f };
      }
    }
    return stops[stops.length - 1];
  }

  /**
   * A gradient fill for a shape whose local (pre-transform) bounding box is
   * `local` and whose slide-space box is `slide`. The angle and stops are
   * computed in slide space, so userSpaceOnUse and transformed gradients land
   * where the SVG drew them.
   */
  function gradientXml(id: string, alpha: number, local: Box, slide: Box, m: Matrix): string | null {
    const grad = byId.get(id);
    if (!grad) return null;
    const kind = tag(grad);
    const stops = gradientStops(grad, alpha);
    if (stops.length === 0) return null;
    if (stops.length === 1) return `<a:solidFill>${color(stops[0].hex, stops[0].a)}</a:solidFill>`;
    const bboxUnits = gradAttr(grad, 'gradientUnits', 'objectBoundingBox') !== 'userSpaceOnUse';
    const gm = multiply(m, parseTransform(gradAttr(grad, 'gradientTransform', '')));
    const toSlide = (u: number, v: number): [number, number] => (bboxUnits ? apply(gm, local.x + u * local.w, local.y + v * local.h) : apply(gm, u, v));
    if (kind === 'linearGradient') {
      const x1 = coord(gradAttr(grad, 'x1', '0%'), view.w, view.x, bboxUnits);
      const y1 = coord(gradAttr(grad, 'y1', '0%'), view.h, view.y, bboxUnits);
      const x2 = coord(gradAttr(grad, 'x2', '100%'), view.w, view.x, bboxUnits);
      const y2 = coord(gradAttr(grad, 'y2', '0%'), view.h, view.y, bboxUnits);
      const [p1x, p1y] = toSlide(x1, y1);
      const [p2x, p2y] = toSlide(x2, y2);
      const vx = p2x - p1x;
      const vy = p2y - p1y;
      const len2 = vx * vx + vy * vy;
      if (len2 < 1e-9) return `<a:solidFill>${color(stops[0].hex, stops[0].a)}</a:solidFill>`;
      const ts = [[slide.x, slide.y], [slide.x + slide.w, slide.y], [slide.x, slide.y + slide.h], [slide.x + slide.w, slide.y + slide.h]]
        .map(([qx, qy]) => ((qx - p1x) * vx + (qy - p1y) * vy) / len2);
      const t0 = Math.min(...ts);
      const t1 = Math.max(...ts);
      const span = t1 - t0 || 1;
      const mapped = [
        { pos: 0, ...colorAt(stops, t0) },
        ...stops.filter((stop) => stop.o > t0 && stop.o < t1).map((stop) => ({ pos: (stop.o - t0) / span, hex: stop.hex, a: stop.a })),
        { pos: 1, ...colorAt(stops, t1) },
      ];
      const list = mapped.map((stop) => `<a:gs pos="${pct(stop.pos)}">${color(stop.hex, stop.a)}</a:gs>`).join('');
      return `<a:gradFill rotWithShape="0"><a:gsLst>${list}</a:gsLst><a:lin ang="${angle60k((Math.atan2(vy, vx) * 180) / Math.PI)}" scaled="0"/></a:gradFill>`;
    }
    if (kind === 'radialGradient') {
      const cx = coord(gradAttr(grad, 'cx', '50%'), view.w, view.x, bboxUnits);
      const cy = coord(gradAttr(grad, 'cy', '50%'), view.h, view.y, bboxUnits);
      const [px, py] = toSlide(cx, cy);
      const fx = slide.w > 0 ? Math.max(0, Math.min(1, (px - slide.x) / slide.w)) : 0.5;
      const fy = slide.h > 0 ? Math.max(0, Math.min(1, (py - slide.y) / slide.h)) : 0.5;
      const list = stops.map((stop) => `<a:gs pos="${pct(stop.o)}">${color(stop.hex, stop.a)}</a:gs>`).join('');
      return `<a:gradFill rotWithShape="1"><a:gsLst>${list}</a:gsLst><a:path path="circle"><a:fillToRect l="${pct(fx)}" t="${pct(fy)}" r="${pct(1 - fx)}" b="${pct(1 - fy)}"/></a:path></a:gradFill>`;
    }
    if (kind === 'pattern') warnings.add('Pattern fills are left out of the PowerPoint file.');
    return null;
  }

  /** Fill XML for a paint; null means "no fill". */
  function paintXml(paint: Paint | null, alpha: number, local: Box, slide: Box, m: Matrix): string {
    if (!paint || paint.kind === 'none') return '<a:noFill/>';
    if (paint.kind === 'solid') return `<a:solidFill>${color(paint.hex, paint.alpha * alpha)}</a:solidFill>`;
    return gradientXml(paint.id, alpha, local, slide, m) ?? '<a:noFill/>';
  }

  function lineXml(el: Element, ctx: Ctx, local: Box, slide: Box, scale: number, markers = false): string {
    const paint = parsePaint(ctx.stroke, ctx.color);
    const width = ctx.strokeWidth * scale;
    if (!paint || paint.kind === 'none' || width <= 0) return '<a:ln><a:noFill/></a:ln>';
    const fill = paintXml(paint, ctx.opacity * ctx.strokeOpacity, local, slide, ctx.m);
    const cap = ctx.cap === 'round' ? 'rnd' : ctx.cap === 'square' ? 'sq' : 'flat';
    const dashes = ctx.dash && ctx.dash !== 'none' ? numList(ctx.dash) : [];
    let dash = '';
    if (dashes.length >= 1 && dashes.some((value) => value > 0)) {
      const ratio = dashes[0] / Math.max(0.5, ctx.strokeWidth);
      const preset = dashes.length >= 4 ? 'dashDot' : ratio <= 1.5 ? 'sysDot' : ratio <= 4 ? 'sysDash' : ratio <= 9 ? 'dash' : 'lgDash';
      dash = `<a:prstDash val="${preset}"/>`;
    }
    const join = ctx.join === 'round' ? '<a:round/>' : ctx.join === 'bevel' ? '<a:bevel/>' : '<a:miter lim="800000"/>';
    let ends = '';
    if (markers) {
      const end = (attr: string): string => {
        const ref = (el.getAttribute(attr) || prop(el, attr) || '').match(/#([^)'"\s]+)/)?.[1];
        const marker = ref ? byId.get(ref) : undefined;
        if (!marker) return '';
        const shape = Array.from(marker.getElementsByTagName('*')).find((child) => ['path', 'polygon', 'polyline', 'circle', 'ellipse', 'rect'].includes(tag(child)));
        if (!shape) return '';
        if (tag(shape) === 'circle' || tag(shape) === 'ellipse') return 'oval';
        if (tag(shape) === 'rect') return 'diamond';
        const open = tag(shape) === 'polyline' || (prop(shape, 'fill') ?? '') === 'none';
        return open ? 'arrow' : 'triangle';
      };
      const head = end('marker-start');
      const tail = end('marker-end');
      if (head) ends += `<a:headEnd type="${head}" w="med" len="med"/>`;
      if (tail) ends += `<a:tailEnd type="${tail}" w="med" len="med"/>`;
    }
    return `<a:ln w="${emuLen(width)}" cap="${cap}">${fill}${dash}${join}${ends}</a:ln>`;
  }

  function effectXml(ctx: Ctx, scale: number): string {
    const id = ctx.filter?.match(/#([^)'"\s]+)/)?.[1];
    const filter = id ? byId.get(id) : undefined;
    if (!filter) return '';
    const parts = Array.from(filter.getElementsByTagName('*'));
    const find = (name: string): Element | undefined => parts.find((el) => tag(el) === name);
    const drop = find('feDropShadow');
    const offset = find('feOffset');
    const blur = find('feGaussianBlur');
    const flood = find('feFlood');
    const shadowColor = (el: Element | undefined, fallbackAlpha: number): string => {
      const paint = parsePaint(el ? prop(el, 'flood-color') ?? '#000000' : '#000000', '#000000');
      const a = el ? opacityValue(prop(el, 'flood-opacity')) ?? 1 : fallbackAlpha;
      return color(paint?.kind === 'solid' ? paint.hex : '#000000', Math.min(1, a * (paint?.kind === 'solid' ? paint.alpha : 1)));
    };
    if (drop || (offset && blur)) {
      const source = drop ?? offset!;
      const dx = num(source.getAttribute('dx')) * scale;
      const dy = num(source.getAttribute('dy')) * scale;
      const std = num((drop ?? blur!).getAttribute('stdDeviation')) * scale;
      const tint = drop ? shadowColor(drop, 1) : shadowColor(flood, 0.3);
      const dist = Math.hypot(dx, dy);
      return `<a:effectLst><a:outerShdw blurRad="${emuLen(std * 2)}" dist="${emuLen(dist)}" dir="${angle60k((Math.atan2(dy, dx) * 180) / Math.PI)}" algn="ctr" rotWithShape="0">${tint}</a:outerShdw></a:effectLst>`;
    }
    if (blur && flood) {
      return `<a:effectLst><a:glow rad="${emuLen(num(blur.getAttribute('stdDeviation')) * 2 * scale)}">${shadowColor(flood, 0.5)}</a:glow></a:effectLst>`;
    }
    if (parts.length > 0) warnings.add('Some filter effects have no PowerPoint equivalent and were left out.');
    return '';
  }

  // Shapes ------------------------------------------------------------------------------
  interface Out { xml: string; box: Box }

  const xfrm = (b: Box, rotation = 0): string => {
    const rot = Math.abs(rotation) > 0.01 ? ` rot="${angle60k(rotation)}"` : '';
    return `<a:xfrm${rot}><a:off x="${emuX(b.x)}" y="${emuY(b.y)}"/><a:ext cx="${Math.max(0, Math.round(b.w * sx))}" cy="${Math.max(0, Math.round(b.h * sy))}"/></a:xfrm>`;
  };

  function spXml(el: Element, kind: string, frame: Box, rotation: number, geometry: string, fill: string, line: string, effects: string): Out {
    const id = nextId++;
    return {
      xml: `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${shapeName(el, kind)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(frame, rotation)}${geometry}${fill}${line}${effects}</p:spPr></p:sp>`,
      box: frame,
    };
  }

  function customShape(el: Element, ctx: Ctx, segs: Seg[], local: Box, closedFill: boolean, markers: boolean): Out | null {
    const t = transformSegs(segs, ctx.m);
    const b = segBox(t);
    if (!b) return null;
    const frame: Box = { x: b.x, y: b.y, w: Math.max(b.w, 0.01), h: Math.max(b.h, 0.01) };
    const w = Math.max(1, Math.round(frame.w * sx));
    const h = Math.max(1, Math.round(frame.h * sy));
    const px = (x: number): number => Math.round((x - frame.x) * sx);
    const py = (y: number): number => Math.round((y - frame.y) * sy);
    let path = '';
    for (const seg of t) {
      if (seg.op === 'Z') path += '<a:close/>';
      else if (seg.op === 'M') path += `<a:moveTo><a:pt x="${px(seg.p[0])}" y="${py(seg.p[1])}"/></a:moveTo>`;
      else if (seg.op === 'L') path += `<a:lnTo><a:pt x="${px(seg.p[0])}" y="${py(seg.p[1])}"/></a:lnTo>`;
      else if (seg.op === 'C') path += `<a:cubicBezTo><a:pt x="${px(seg.p[0])}" y="${py(seg.p[1])}"/><a:pt x="${px(seg.p[2])}" y="${py(seg.p[3])}"/><a:pt x="${px(seg.p[4])}" y="${py(seg.p[5])}"/></a:cubicBezTo>`;
    }
    const paint = closedFill ? parsePaint(ctx.fill, ctx.color) : { kind: 'none' as const };
    const noFill = !paint || paint.kind === 'none';
    const scale = similarity(ctx.m)?.scale ?? Math.sqrt(Math.abs(ctx.m[0] * ctx.m[3] - ctx.m[1] * ctx.m[2]));
    const geometry = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}"${noFill ? ' fill="none"' : ''}>${path}</a:path></a:pathLst></a:custGeom>`;
    return spXml(el, tag(el), frame, 0, geometry, paintXml(paint, ctx.opacity * ctx.fillOpacity, local, frame, ctx.m), lineXml(el, ctx, local, frame, scale, markers), effectXml(ctx, scale));
  }

  /** rect / circle / ellipse as a preset shape when the transform allows, else custom geometry. */
  function presetShape(el: Element, ctx: Ctx, local: Box, preset: 'rect' | 'roundRect' | 'ellipse', adj: number, fallback: Seg[]): Out | null {
    const sim = similarity(ctx.m);
    if (!sim) return customShape(el, ctx, fallback, local, true, false);
    const [cx, cy] = apply(ctx.m, local.x + local.w / 2, local.y + local.h / 2);
    const w = local.w * sim.sx;
    const h = local.h * sim.sy;
    const frame: Box = { x: cx - w / 2, y: cy - h / 2, w, h };
    const slideBox: Box = sim.rotation ? (segBox(transformSegs(fallback, ctx.m)) ?? frame) : frame;
    const geometry = `<a:prstGeom prst="${preset}"><a:avLst>${preset === 'roundRect' ? `<a:gd name="adj" fmla="val ${Math.round(adj)}"/>` : ''}</a:avLst></a:prstGeom>`;
    const fill = paintXml(parsePaint(ctx.fill, ctx.color), ctx.opacity * ctx.fillOpacity, local, slideBox, ctx.m);
    return spXml(el, tag(el), frame, sim.rotation, geometry, fill, lineXml(el, ctx, local, slideBox, sim.scale), effectXml(ctx, sim.scale));
  }

  function rectShape(el: Element, ctx: Ctx): Out | null {
    const x = num(el.getAttribute('x'));
    const y = num(el.getAttribute('y'));
    const w = num(el.getAttribute('width'));
    const h = num(el.getAttribute('height'));
    if (w <= 0 || h <= 0) return null;
    let rx = el.hasAttribute('rx') ? num(el.getAttribute('rx')) : el.hasAttribute('ry') ? num(el.getAttribute('ry')) : 0;
    let ry = el.hasAttribute('ry') ? num(el.getAttribute('ry')) : rx;
    rx = Math.min(Math.max(0, rx), w / 2);
    ry = Math.min(Math.max(0, ry), h / 2);
    const local = { x, y, w, h };
    const segs = rectSegs(x, y, w, h, rx, ry);
    if (rx > 0 && Math.abs(rx - ry) > 0.5) return customShape(el, ctx, segs, local, true, false);
    if (rx >= Math.min(w, h) / 2 - 0.01 && Math.abs(w - h) < 0.01) return presetShape(el, ctx, local, 'ellipse', 0, segs);
    return presetShape(el, ctx, local, rx > 0 ? 'roundRect' : 'rect', (rx / Math.min(w, h)) * 100000, segs);
  }

  // Text ------------------------------------------------------------------------------------
  function collectLines(textEl: Element, base: Ctx): { lines: Line[]; anchor: string } {
    const xs = numList(textEl.getAttribute('x'));
    const ys = numList(textEl.getAttribute('y'));
    const lines: Line[] = [{ x: xs[0] ?? 0, baseline: (ys[0] ?? 0) + (numList(textEl.getAttribute('dy'))[0] ?? 0), runs: [] }];
    let lineX = lines[0].x ?? 0;
    const visit = (node: Node, ctx: Ctx): void => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3 || child.nodeType === 4) {
          const value = (child.textContent ?? '').replace(/[\r\n\t]+/g, ' ');
          if (!value) continue;
          lines[lines.length - 1].runs.push({
            text: value, size: ctx.fontSize, bold: boldOf(ctx.fontWeight), italic: ctx.fontStyle === 'italic' || ctx.fontStyle === 'oblique',
            font: primaryFont(ctx.fontFamily), paint: parsePaint(ctx.fill, ctx.color), fillOpacity: ctx.fillOpacity, opacity: ctx.opacity,
            decoration: ctx.decoration, letterSpacing: ctx.letterSpacing, current: ctx.color,
          });
        } else if (child.nodeType === 1 && tag(child) === 'tspan') {
          const el = child as Element;
          const ctxChild = inherit(el, { ...ctx, m: ctx.m });
          ctxChild.m = ctx.m;
          const hasX = el.hasAttribute('x');
          const hasY = el.hasAttribute('y');
          const dy = numList(el.getAttribute('dy'))[0] ?? 0;
          if (hasX || hasY || dy !== 0) {
            const previous = lines[lines.length - 1];
            if (hasX) lineX = numList(el.getAttribute('x'))[0] ?? lineX;
            const baseline = (hasY ? numList(el.getAttribute('y'))[0] ?? previous.baseline : previous.baseline) + dy;
            if (previous.runs.length === 0 && lines.length === 1 && !hasY && dy === 0) {
              previous.x = lineX;
            } else {
              lines.push({ x: lineX, baseline, runs: [] });
            }
          }
          visit(el, ctxChild);
        }
      }
    };
    visit(textEl, base);
    for (const line of lines) {
      // SVG collapses runs of spaces and trims the ends of the whole line.
      const merged = line.runs.map((run) => ({ ...run, text: run.text.replace(/ {2,}/g, ' ') }));
      if (merged.length) {
        merged[0].text = merged[0].text.replace(/^ +/, '');
        merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/ +$/, '');
      }
      line.runs = merged.filter((run) => run.text.length > 0);
    }
    return { lines: lines.filter((line, index) => line.runs.length > 0 || (index > 0 && index < lines.length - 1)), anchor: base.anchor };
  }

  function runXml(run: Run, scale: number): string {
    const size = Math.max(100, Math.round(run.size * scale * 75));
    const attributes = [`lang="${xml(lang)}"`, `sz="${size}"`, run.bold ? 'b="1"' : 'b="0"', run.italic ? 'i="1"' : ''];
    if (/underline/.test(run.decoration)) attributes.push('u="sng"');
    if (/line-through/.test(run.decoration)) attributes.push('strike="sngStrike"');
    if (run.letterSpacing) attributes.push(`spc="${Math.round(run.letterSpacing * scale * 75)}"`);
    attributes.push('dirty="0"');
    const alpha = run.opacity * run.fillOpacity;
    let fill = '';
    if (run.paint?.kind === 'solid') fill = `<a:solidFill>${color(run.paint.hex, run.paint.alpha * alpha)}</a:solidFill>`;
    else if (run.paint?.kind === 'url') {
      const grad = byId.get(run.paint.id);
      const stops = grad ? gradientStops(grad, alpha) : [];
      fill = stops.length ? `<a:gradFill><a:gsLst>${stops.map((stop) => `<a:gs pos="${pct(stop.o)}">${color(stop.hex, stop.a)}</a:gs>`).join('')}</a:gsLst><a:lin ang="0" scaled="1"/></a:gradFill>` : '';
    } else if (run.paint?.kind === 'none') fill = '<a:noFill/>';
    const font = xml(run.font);
    return `<a:r><a:rPr ${attributes.filter(Boolean).join(' ')}>${fill}<a:latin typeface="${font}"/><a:ea typeface="${font}"/><a:cs typeface="${font}"/></a:rPr><a:t>${xml(run.text)}</a:t></a:r>`;
  }

  function textFrames(el: Element, ctx: Ctx): Out[] {
    const { lines, anchor } = collectLines(el, ctx);
    if (lines.length === 0) return [];
    const sim = similarity(ctx.m) ?? { scale: Math.sqrt(Math.abs(ctx.m[0] * ctx.m[3] - ctx.m[1] * ctx.m[2])) || 1, sx: 1, sy: 1, rotation: 0 };
    // Lines that share a left edge (or a centre / right edge) form one frame.
    const groups: Line[][] = [];
    for (const line of lines) {
      const last = groups[groups.length - 1];
      const ref = last?.[0];
      if (ref && Math.abs((line.x ?? 0) - (ref.x ?? 0)) < 2 && line.baseline >= last[last.length - 1].baseline) last.push(line);
      else groups.push([line]);
    }
    const algn = anchor === 'middle' ? 'ctr' : anchor === 'end' ? 'r' : 'l';
    return groups.map((group) => {
      const sizes = group.map((line) => Math.max(...line.runs.map((run) => run.size), ctx.fontSize));
      const steps = group.slice(1).map((line, index) => line.baseline - group[index].baseline).filter((step) => step > 0).sort((a, b) => a - b);
      const spacing = steps.length ? steps[Math.floor(steps.length / 2)] : null;
      const firstRun = group[0].runs[0];
      const offset = baselineOffset(sizes[0], firstRun?.font ?? 'Segoe UI', spacing);
      const widths = group.map((line) => line.runs.reduce((sum, run) => sum + measure(run.text, run.font, run.size, run.bold, run.italic) + run.letterSpacing * [...run.text].length, 0));
      const width = Math.max(4, ...widths) * 1.04 + 4;
      const lastSize = sizes[sizes.length - 1];
      const height = offset + (spacing ?? sizes[0] * 1.2) * (group.length - 1) + lastSize * 0.35 + 2;
      const x0 = group[0].x ?? 0;
      const left = algn === 'ctr' ? x0 - width / 2 : algn === 'r' ? x0 - width : x0;
      const top = group[0].baseline - offset;
      const [cx, cy] = apply(ctx.m, left + width / 2, top + height / 2);
      const frame: Box = { x: cx - (width * sim.scale) / 2, y: cy - (height * sim.scale) / 2, w: width * sim.scale, h: height * sim.scale };
      const lnSpc = spacing !== null ? `<a:lnSpc><a:spcPts val="${Math.round(spacing * 0.75 * sim.scale) * 100}"/></a:lnSpc>` : '';
      const paragraphs = group.map((line) => `<a:p><a:pPr algn="${algn}">${lnSpc}<a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>${line.runs.map((run) => runXml(run, sim.scale)).join('')}<a:endParaRPr lang="${xml(lang)}" sz="${Math.round((line.runs[0]?.size ?? ctx.fontSize) * sim.scale * 75)}" dirty="0"/></a:p>`).join('');
      const id = nextId++;
      return {
        xml: `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${shapeName(el, 'Text')}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(frame, sim.rotation)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>${effectXml(ctx, sim.scale)}</p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`,
        box: frame,
      };
    });
  }

  // Images ----------------------------------------------------------------------------------
  function imageShape(el: Element, ctx: Ctx): Out | null {
    const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
    const picture = href ? options.picture(href) : null;
    if (!picture) {
      if (href) warnings.add(`A picture could not be placed: ${href.slice(0, 80)}`);
      return null;
    }
    const x = num(el.getAttribute('x'));
    const y = num(el.getAttribute('y'));
    const w = num(el.getAttribute('width'), picture.width);
    const h = num(el.getAttribute('height'), picture.height);
    if (w <= 0 || h <= 0) return null;
    const ratio = (el.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim().split(/\s+/);
    const align = ratio[0];
    const slice = ratio[1] === 'slice';
    let frame: Box = { x, y, w, h };
    let crop = '';
    if (align !== 'none' && picture.width > 0 && picture.height > 0) {
      const ax = /xMin/.test(align) ? 0 : /xMax/.test(align) ? 1 : 0.5;
      const ay = /YMin/.test(align) ? 0 : /YMax/.test(align) ? 1 : 0.5;
      const scale = slice ? Math.max(w / picture.width, h / picture.height) : Math.min(w / picture.width, h / picture.height);
      const dw = picture.width * scale;
      const dh = picture.height * scale;
      if (slice) {
        const cropX = (dw - w) / dw;
        const cropY = (dh - h) / dh;
        const l = cropX * ax;
        const t = cropY * ay;
        if (cropX > 0.001 || cropY > 0.001) crop = `<a:srcRect l="${pct(l)}" t="${pct(t)}" r="${pct(cropX - l)}" b="${pct(cropY - t)}"/>`;
      } else {
        frame = { x: x + (w - dw) * ax, y: y + (h - dh) * ay, w: dw, h: dh };
      }
    }
    let preset = 'rect';
    let adj = '';
    const clipRef = (el.getAttribute('clip-path') || prop(el, 'clip-path') || '').match(/#([^)'"\s]+)/)?.[1];
    const clip = clipRef ? byId.get(clipRef) : undefined;
    const clipShape = clip ? Array.from(clip.childNodes).find((node) => node.nodeType === 1) as Element | undefined : undefined;
    if (clipShape) {
      const kind = tag(clipShape);
      if (kind === 'circle' || kind === 'ellipse') preset = 'ellipse';
      else if (kind === 'rect' && num(clipShape.getAttribute('rx') || clipShape.getAttribute('ry')) > 0) {
        preset = 'roundRect';
        const r = num(clipShape.getAttribute('rx') || clipShape.getAttribute('ry'));
        adj = `<a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (r / Math.max(1, Math.min(frame.w, frame.h))) * 100000))}"/>`;
      } else if (kind !== 'rect') warnings.add('A picture clip shape was simplified to its frame.');
    }
    const sim = similarity(ctx.m);
    let slideFrame: Box;
    let rotation = 0;
    if (sim) {
      const [cx, cy] = apply(ctx.m, frame.x + frame.w / 2, frame.y + frame.h / 2);
      slideFrame = { x: cx - (frame.w * sim.sx) / 2, y: cy - (frame.h * sim.sy) / 2, w: frame.w * sim.sx, h: frame.h * sim.sy };
      rotation = sim.rotation;
    } else {
      slideFrame = segBox(transformSegs(rectSegs(frame.x, frame.y, frame.w, frame.h, 0, 0), ctx.m)) ?? frame;
      warnings.add('A skewed picture was placed upright.');
    }
    const rId = registerPicture(href, picture);
    const alpha = ctx.opacity < 0.999 ? `<a:alphaModFix amt="${pct(ctx.opacity)}"/>` : '';
    const id = nextId++;
    return {
      xml: `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${shapeName(el, 'Picture')}" descr="${xml(el.getAttribute('id') || '')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}">${alpha}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(slideFrame, rotation)}<a:prstGeom prst="${preset}"><a:avLst>${adj}</a:avLst></a:prstGeom>${effectXml(ctx, sim?.scale ?? 1)}</p:spPr></p:pic>`,
      box: slideFrame,
    };
  }

  // Walking the tree ----------------------------------------------------------------------------
  const SKIP = new Set(['defs', 'title', 'desc', 'metadata', 'clipPath', 'linearGradient', 'radialGradient', 'filter', 'marker', 'symbol', 'pattern', 'mask', 'style', 'script']);

  function hidden(el: Element): boolean {
    return prop(el, 'display') === 'none' || prop(el, 'visibility') === 'hidden';
  }

  function render(el: Element, parent: Ctx, depth: number): Out[] {
    const name = tag(el);
    if (SKIP.has(name) || hidden(el) || depth > 40) return [];
    if (name === 'mask') {
      warnings.add('Masks are left out of the PowerPoint file.');
      return [];
    }
    const ctx = inherit(el, parent);
    if (ctx.opacity <= 0.001) return [];
    switch (name) {
      case 'g':
      case 'svg':
      case 'a': {
        const modelled = name === 'g' && isIdentity(parent.m) ? modelShapes(el) : null;
        if (modelled) return modelled;
        // A nested filter on a group applies to each shape inside it.
        const out: Out[] = [];
        for (const child of Array.from(el.childNodes)) if (child.nodeType === 1) out.push(...render(child as Element, ctx, depth + 1));
        return out;
      }
      case 'use': {
        const ref = (el.getAttribute('href') || el.getAttribute('xlink:href') || '').replace(/^#/, '');
        const target = ref ? byId.get(ref) : undefined;
        if (!target || depth > 8) return [];
        const x = num(el.getAttribute('x'));
        const y = num(el.getAttribute('y'));
        let m = multiply(ctx.m, [1, 0, 0, 1, x, y]);
        if (tag(target) === 'symbol') {
          const vb = numList(target.getAttribute('viewBox'));
          const w = num(el.getAttribute('width'), vb[2] ?? 0);
          const h = num(el.getAttribute('height'), vb[3] ?? 0);
          if (vb.length === 4 && vb[2] > 0 && vb[3] > 0 && w > 0 && h > 0) {
            const s = Math.min(w / vb[2], h / vb[3]);
            m = multiply(m, [s, 0, 0, s, (w - vb[2] * s) / 2 - vb[0] * s, (h - vb[3] * s) / 2 - vb[1] * s]);
          }
          const out: Out[] = [];
          const inner = { ...ctx, m };
          for (const child of Array.from(target.childNodes)) if (child.nodeType === 1) out.push(...render(child as Element, inner, depth + 1));
          return out;
        }
        return render(target, { ...ctx, m }, depth + 1);
      }
      case 'rect': {
        const out = rectShape(el, ctx);
        return out ? [out] : [];
      }
      case 'circle': {
        const r = num(el.getAttribute('r'));
        if (r <= 0) return [];
        const cx = num(el.getAttribute('cx'));
        const cy = num(el.getAttribute('cy'));
        const out = presetShape(el, ctx, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, 'ellipse', 0, ellipseSegs(cx, cy, r, r));
        return out ? [out] : [];
      }
      case 'ellipse': {
        const rx = num(el.getAttribute('rx'));
        const ry = num(el.getAttribute('ry'));
        if (rx <= 0 || ry <= 0) return [];
        const cx = num(el.getAttribute('cx'));
        const cy = num(el.getAttribute('cy'));
        const out = presetShape(el, ctx, { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry }, 'ellipse', 0, ellipseSegs(cx, cy, rx, ry));
        return out ? [out] : [];
      }
      case 'line': {
        const x1 = num(el.getAttribute('x1'));
        const y1 = num(el.getAttribute('y1'));
        const x2 = num(el.getAttribute('x2'));
        const y2 = num(el.getAttribute('y2'));
        const out = customShape(el, ctx, [{ op: 'M', p: [x1, y1] }, { op: 'L', p: [x2, y2] }], { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }, false, true);
        return out ? [out] : [];
      }
      case 'polyline':
      case 'polygon': {
        const points = numList(el.getAttribute('points'));
        if (points.length < 4) return [];
        const segs: Seg[] = [{ op: 'M', p: [points[0], points[1]] }];
        for (let i = 2; i + 1 < points.length; i += 2) segs.push({ op: 'L', p: [points[i], points[i + 1]] });
        if (name === 'polygon') segs.push({ op: 'Z' });
        const local = segBox(segs)!;
        const out = customShape(el, ctx, segs, local, true, name === 'polyline');
        return out ? [out] : [];
      }
      case 'path': {
        const segs = parsePathData(el.getAttribute('d') || '');
        const local = segBox(segs);
        if (!local || segs.length < 2) return [];
        const out = customShape(el, ctx, segs, local, true, true);
        return out ? [out] : [];
      }
      case 'text':
        return textFrames(el, ctx);
      case 'image': {
        const out = imageShape(el, ctx);
        return out ? [out] : [];
      }
      default:
        return [];
    }
  }

  // A full-canvas first rectangle becomes the slide background.
  const top = Array.from(root.childNodes).filter((node) => node.nodeType === 1) as Element[];
  let background = '';
  let skip: Element | null = null;
  const first = top.find((el) => !SKIP.has(tag(el)));
  if (first && tag(first) === 'rect' && !first.getAttribute('transform') && !first.getAttribute('filter')) {
    const ctx = inherit(first, INITIAL);
    const covers = num(first.getAttribute('x')) <= view.x + 1 && num(first.getAttribute('y')) <= view.y + 1
      && num(first.getAttribute('width')) >= view.w - 1 && num(first.getAttribute('height')) >= view.h - 1;
    const paint = parsePaint(ctx.fill, ctx.color);
    const stroke = parsePaint(ctx.stroke, ctx.color);
    if (covers && paint && paint.kind !== 'none' && (!stroke || stroke.kind === 'none') && ctx.opacity * ctx.fillOpacity > 0.99 && num(first.getAttribute('rx')) === 0) {
      const full: Box = { x: view.x, y: view.y, w: view.w, h: view.h };
      const fill = paintXml(paint, 1, full, full, IDENTITY);
      if (fill !== '<a:noFill/>') {
        background = `<p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>`;
        skip = first;
      }
    }
  }

  const rootCtx = inherit(root, INITIAL);
  rootCtx.m = IDENTITY;
  const shapes: string[] = [];
  for (const el of top) {
    if (el === skip) continue;
    const out = render(el, rootCtx, 0);
    if (out.length === 0) continue;
    if (tag(el) === 'g' && out.length > 1) {
      // Top-level groups stay groups: one object to move, as drawn.
      const minX = Math.min(...out.map((o) => o.box.x));
      const minY = Math.min(...out.map((o) => o.box.y));
      const maxX = Math.max(...out.map((o) => o.box.x + o.box.w));
      const maxY = Math.max(...out.map((o) => o.box.y + o.box.h));
      const off = `<a:off x="${emuX(minX)}" y="${emuY(minY)}"/>`;
      const ext = `<a:ext cx="${Math.max(1, Math.round((maxX - minX) * sx))}" cy="${Math.max(1, Math.round((maxY - minY) * sy))}"/>`;
      const chOff = `<a:chOff x="${emuX(minX)}" y="${emuY(minY)}"/>`;
      const chExt = `<a:chExt cx="${Math.max(1, Math.round((maxX - minX) * sx))}" cy="${Math.max(1, Math.round((maxY - minY) * sy))}"/>`;
      shapes.push(`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${nextId++}" name="${shapeName(el, 'Group')}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm>${off}${ext}${chOff}${chExt}</a:xfrm></p:grpSpPr>${out.map((o) => o.xml).join('')}</p:grpSp>`);
    } else {
      shapes.push(...out.map((o) => o.xml));
    }
  }
  return { background, shapes: shapes.join(''), media, warnings: [...warnings] };
}
