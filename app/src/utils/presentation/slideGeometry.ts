// DrawingML geometry as SVG path data: PowerPoint's preset shapes (the
// common ones, with their adjust values and defaults from the OOXML preset
// definitions) and custom geometry (`a:custGeom` paths, including guide
// formulas). Coordinates are local to the shape box (0,0)–(w,h).
// Dependency-free.

export interface GeoPath {
  d: string;
  /** How the path is filled: PowerPoint shades some faces (a can's lid, a cube's sides). */
  fill: 'norm' | 'none' | 'lighten' | 'lightenLess' | 'darken' | 'darkenLess';
  stroke: boolean;
}

/** A custom geometry path as stored in the slide model (coordinates in its own w × h space). */
export interface CustomPath {
  w: number;
  h: number;
  fill: GeoPath['fill'];
  stroke: boolean;
  /** Commands: M x y · L x y · C x1 y1 x2 y2 x y · Q x1 y1 x y · A wR hR stAng swAng (60000ths of a degree) · Z. */
  cmds: Array<[string, ...number[]]>;
}

export interface Geometry {
  prst?: string;
  /** Adjust values by name (`adj`, `adj1`…), in the preset's own units. */
  av?: Record<string, number>;
  paths?: CustomPath[];
}

export interface Rect { x: number; y: number; w: number; h: number }

const f = (value: number): string => (Math.round(value * 100) / 100).toString();
const pt = (x: number, y: number): string => `${f(x)} ${f(y)}`;
const poly = (points: Array<[number, number]>, close = true): string => `M${points.map(([x, y]) => pt(x, y)).join(' L')}${close ? ' Z' : ''}`;
const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${pt(cx - rx, cy)} A${f(rx)} ${f(ry)} 0 1 0 ${pt(cx + rx, cy)} A${f(rx)} ${f(ry)} 0 1 0 ${pt(cx - rx, cy)} Z`;
const rad = (deg60k: number): number => (deg60k / 60000) * (Math.PI / 180);

/** A rectangle with each corner either square, rounded (r > 0) or snipped (s > 0). */
function cornerRect(w: number, h: number, corners: Array<{ r?: number; s?: number }>): string {
  const [tl, tr, br, bl] = corners.map((corner) => ({ r: Math.max(0, corner.r ?? 0), s: Math.max(0, corner.s ?? 0) }));
  let d = `M${pt(tl.r || tl.s, 0)}`;
  d += ` L${pt(w - (tr.r || tr.s), 0)}`;
  if (tr.r) d += ` A${f(tr.r)} ${f(tr.r)} 0 0 1 ${pt(w, tr.r)}`; else if (tr.s) d += ` L${pt(w, tr.s)}`;
  d += ` L${pt(w, h - (br.r || br.s))}`;
  if (br.r) d += ` A${f(br.r)} ${f(br.r)} 0 0 1 ${pt(w - br.r, h)}`; else if (br.s) d += ` L${pt(w - br.s, h)}`;
  d += ` L${pt(bl.r || bl.s, h)}`;
  if (bl.r) d += ` A${f(bl.r)} ${f(bl.r)} 0 0 1 ${pt(0, h - bl.r)}`; else if (bl.s) d += ` L${pt(0, h - bl.s)}`;
  d += ` L${pt(0, tl.r || tl.s)}`;
  if (tl.r) d += ` A${f(tl.r)} ${f(tl.r)} 0 0 1 ${pt(tl.r, 0)}`; else if (tl.s) d += ` L${pt(tl.s, 0)}`;
  return `${d} Z`;
}

function star(w: number, h: number, points: number, inner: number): string {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const radius = i % 2 === 0 ? 1 : inner;
    out.push([w / 2 + (w / 2) * radius * Math.cos(angle), h / 2 + (h / 2) * radius * Math.sin(angle)]);
  }
  return poly(out);
}

function regular(w: number, h: number, sides: number, rotation = -Math.PI / 2): string {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    out.push([w / 2 + (w / 2) * Math.cos(angle), h / 2 + (h / 2) * Math.sin(angle)]);
  }
  return poly(out);
}

/** A callout body with a pointed tail toward (tx, ty), drawn as one outline. */
function calloutRect(w: number, h: number, tx: number, ty: number, r: number): string {
  const inside = tx >= 0 && tx <= w && ty >= 0 && ty <= h;
  if (inside) return cornerRect(w, h, [{ r }, { r }, { r }, { r }]);
  const dx = (tx - w / 2) / w;
  const dy = (ty - h / 2) / h;
  const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'b' : 't';
  const along = side === 't' || side === 'b' ? w : h;
  const base = along / 6;
  const at = side === 't' || side === 'b' ? Math.min(w - r - base, Math.max(r + base, tx)) : Math.min(h - r - base, Math.max(r + base, ty));
  const a = at - base / 2;
  const b = at + base / 2;
  let d = `M${pt(r, 0)}`;
  if (side === 't') d += ` L${pt(Math.min(a, b), 0)} L${pt(tx, ty)} L${pt(Math.max(a, b), 0)}`;
  d += ` L${pt(w - r, 0)}`;
  if (r) d += ` A${f(r)} ${f(r)} 0 0 1 ${pt(w, r)}`;
  if (side === 'r') d += ` L${pt(w, a)} L${pt(tx, ty)} L${pt(w, b)}`;
  d += ` L${pt(w, h - r)}`;
  if (r) d += ` A${f(r)} ${f(r)} 0 0 1 ${pt(w - r, h)}`;
  if (side === 'b') d += ` L${pt(b, h)} L${pt(tx, ty)} L${pt(a, h)}`;
  d += ` L${pt(r, h)}`;
  if (r) d += ` A${f(r)} ${f(r)} 0 0 1 ${pt(0, h - r)}`;
  if (side === 'l') d += ` L${pt(0, b)} L${pt(tx, ty)} L${pt(0, a)}`;
  d += ` L${pt(0, r)}`;
  if (r) d += ` A${f(r)} ${f(r)} 0 0 1 ${pt(r, 0)}`;
  return `${d} Z`;
}

function cloud(w: number, h: number): string {
  const bumps = 11;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < bumps; i += 1) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / bumps;
    points.push([w / 2 + w * 0.42 * Math.cos(angle), h / 2 + h * 0.4 * Math.sin(angle)]);
  }
  let d = `M${pt(...points[0])}`;
  for (let i = 1; i <= bumps; i += 1) {
    const [x, y] = points[i % bumps];
    const [px, py] = points[i - 1];
    const radius = Math.hypot(x - px, y - py) * 0.62;
    d += ` A${f(radius)} ${f(radius)} 0 0 1 ${pt(x, y)}`;
  }
  return `${d} Z`;
}

/** An elliptical arc between DrawingML angles (60000ths of a degree), as path data. */
function ellipseArc(cx: number, cy: number, rx: number, ry: number, start: number, end: number, move: boolean): string {
  let sweep = end - start;
  while (sweep < 0) sweep += 21600000;
  const a0 = rad(start);
  const a1 = rad(start + sweep);
  const p0: [number, number] = [cx + rx * Math.cos(a0), cy + ry * Math.sin(a0)];
  const p1: [number, number] = [cx + rx * Math.cos(a1), cy + ry * Math.sin(a1)];
  const large = sweep > 10800000 ? 1 : 0;
  return `${move ? `M${pt(...p0)}` : `L${pt(...p0)}`} A${f(rx)} ${f(ry)} 0 ${large} 1 ${pt(...p1)}`;
}

const DEFAULTS: Record<string, Record<string, number>> = {
  roundRect: { adj: 16667 }, triangle: { adj: 50000 }, parallelogram: { adj: 25000 }, trapezoid: { adj: 25000 },
  hexagon: { adj: 25000 }, octagon: { adj: 29289 }, homePlate: { adj: 50000 }, chevron: { adj: 50000 },
  rightArrow: { adj1: 50000, adj2: 50000 }, leftArrow: { adj1: 50000, adj2: 50000 }, upArrow: { adj1: 50000, adj2: 50000 },
  downArrow: { adj1: 50000, adj2: 50000 }, leftRightArrow: { adj1: 50000, adj2: 50000 }, upDownArrow: { adj1: 50000, adj2: 50000 },
  notchedRightArrow: { adj1: 50000, adj2: 50000 }, star4: { adj: 12500 }, star5: { adj: 19098 }, star6: { adj: 28868 },
  star7: { adj: 34601 }, star8: { adj: 38250 }, star10: { adj: 42533 }, star12: { adj: 37500 }, star16: { adj: 37500 },
  star24: { adj: 37500 }, star32: { adj: 37500 }, donut: { adj: 25000 }, frame: { adj1: 12500 }, plus: { adj: 25000 },
  can: { adj: 25000 }, cube: { adj: 25000 }, snip1Rect: { adj: 16667 }, snip2SameRect: { adj1: 16667, adj2: 0 },
  snip2DiagRect: { adj1: 0, adj2: 16667 }, round1Rect: { adj: 16667 }, round2SameRect: { adj1: 16667, adj2: 0 },
  round2DiagRect: { adj1: 16667, adj2: 0 }, snipRoundRect: { adj1: 16667, adj2: 16667 }, leftBrace: { adj1: 8333, adj2: 50000 },
  rightBrace: { adj1: 8333, adj2: 50000 }, leftBracket: { adj: 8333 }, rightBracket: { adj: 8333 },
  wedgeRectCallout: { adj1: -20833, adj2: 62500 }, wedgeRoundRectCallout: { adj1: -20833, adj2: 62500, adj3: 16667 },
  wedgeEllipseCallout: { adj1: -20833, adj2: 62500 }, cloudCallout: { adj1: -20833, adj2: 62500 }, arc: { adj1: 16200000, adj2: 0 },
  pie: { adj1: 0, adj2: 16200000 }, chord: { adj1: 2700000, adj2: 16200000 }, blockArc: { adj1: 10800000, adj2: 0, adj3: 25000 },
  teardrop: { adj: 100000 }, foldedCorner: { adj: 16667 }, plaque: { adj: 16667 }, bevel: { adj: 12500 }, corner: { adj1: 50000, adj2: 50000 },
  halfFrame: { adj1: 33333, adj2: 33333 }, diagStripe: { adj: 50000 }, bentConnector3: { adj1: 50000 }, bentConnector4: { adj1: 50000, adj2: 50000 },
  bentConnector5: { adj1: 50000, adj2: 50000, adj3: 50000 }, curvedConnector3: { adj1: 50000 }, mathPlus: { adj1: 23520 }, mathMinus: { adj1: 23520 },
  mathMultiply: { adj1: 23520 }, mathEqual: { adj1: 23520, adj2: 11760 }, flowChartAlternateProcess: {}, ribbon2: {}, smileyFace: { adj: 4653 },
  moon: { adj: 50000 }, lightningBolt: {}, heart: {}, sun: { adj: 25000 }, noSmoking: { adj: 18750 }, bracePair: { adj: 8333 }, bracketPair: { adj: 16667 },
};

export const LINE_PRESETS = new Set(['line', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5', 'curvedConnector2', 'curvedConnector3', 'curvedConnector4', 'curvedConnector5', 'arc', 'leftBrace', 'rightBrace', 'leftBracket', 'rightBracket', 'bracePair', 'bracketPair']);

/** Path data for a preset shape of size w × h. Unknown presets draw as their frame. */
export function presetPaths(prst: string, w: number, h: number, av: Record<string, number> = {}): GeoPath[] {
  const a = (name: string): number => av[name] ?? DEFAULTS[prst]?.[name] ?? 0;
  const ss = Math.min(w, h);
  const hc = w / 2;
  const vc = h / 2;
  const fill = (d: string): GeoPath[] => [{ d, fill: 'norm', stroke: true }];
  const line = (d: string): GeoPath[] => [{ d, fill: 'none', stroke: true }];
  switch (prst) {
    case 'rect': case 'flowChartProcess': case 'actionButtonBlank':
      return fill(poly([[0, 0], [w, 0], [w, h], [0, h]]));
    case 'textNoShape': return [];
    case 'roundRect': {
      const r = Math.min(ss * Math.min(50000, Math.max(0, a('adj'))) / 100000, ss / 2);
      return fill(cornerRect(w, h, [{ r }, { r }, { r }, { r }]));
    }
    case 'flowChartAlternateProcess': {
      const r = ss / 6;
      return fill(cornerRect(w, h, [{ r }, { r }, { r }, { r }]));
    }
    case 'ellipse': case 'flowChartConnector': return fill(ellipse(hc, vc, w / 2, h / 2));
    case 'flowChartOr': case 'flowChartSummingJunction': {
      const lines = prst === 'flowChartOr'
        ? `M${pt(hc, 0)} L${pt(hc, h)} M${pt(0, vc)} L${pt(w, vc)}`
        : (() => { const k = Math.SQRT1_2 / 2; return `M${pt(hc - w * k, vc - h * k)} L${pt(hc + w * k, vc + h * k)} M${pt(hc + w * k, vc - h * k)} L${pt(hc - w * k, vc + h * k)}`; })();
      return [{ d: ellipse(hc, vc, w / 2, h / 2), fill: 'norm', stroke: true }, { d: lines, fill: 'none', stroke: true }];
    }
    case 'line': case 'straightConnector1': return line(`M0 0 L${pt(w, h)}`);
    case 'bentConnector2': return line(`M0 0 L${pt(w, 0)} L${pt(w, h)}`);
    case 'bentConnector3': { const x1 = (w * a('adj1')) / 100000; return line(`M0 0 L${pt(x1, 0)} L${pt(x1, h)} L${pt(w, h)}`); }
    case 'bentConnector4': {
      const x1 = (w * a('adj1')) / 100000;
      const y2 = (h * a('adj2')) / 100000;
      return line(`M0 0 L${pt(x1, 0)} L${pt(x1, y2)} L${pt(w, y2)} L${pt(w, h)}`);
    }
    case 'bentConnector5': {
      const x1 = (w * a('adj1')) / 100000;
      const y2 = (h * a('adj2')) / 100000;
      const x3 = (w * a('adj3')) / 100000;
      return line(`M0 0 L${pt(x1, 0)} L${pt(x1, y2)} L${pt(x3, y2)} L${pt(x3, h)} L${pt(w, h)}`);
    }
    case 'curvedConnector2': return line(`M0 0 C${pt(w / 2, 0)} ${pt(w, h / 2)} ${pt(w, h)}`);
    case 'curvedConnector3': case 'curvedConnector4': case 'curvedConnector5': {
      const x1 = (w * (av.adj1 ?? 50000)) / 100000;
      return line(`M0 0 C${pt(x1 / 2, 0)} ${pt(x1, h / 4)} ${pt(x1, h / 2)} C${pt(x1, (3 * h) / 4)} ${pt((x1 + w) / 2, h)} ${pt(w, h)}`);
    }
    case 'triangle': case 'flowChartExtract': {
      const x = prst === 'triangle' ? (w * a('adj')) / 100000 : hc;
      return fill(poly([[x, 0], [w, h], [0, h]]));
    }
    case 'flowChartMerge': return fill(poly([[0, 0], [w, 0], [hc, h]]));
    case 'rtTriangle': return fill(poly([[0, 0], [w, h], [0, h]]));
    case 'diamond': case 'flowChartDecision': return fill(poly([[hc, 0], [w, vc], [hc, h], [0, vc]]));
    case 'parallelogram': case 'flowChartInputOutput': {
      const x = prst === 'parallelogram' ? Math.min(w, (ss * a('adj')) / 100000) : w / 5;
      return fill(poly([[x, 0], [w, 0], [w - x, h], [0, h]]));
    }
    case 'trapezoid': {
      const x = Math.min(w / 2, (ss * a('adj')) / 100000);
      return fill(poly([[x, 0], [w - x, 0], [w, h], [0, h]]));
    }
    case 'flowChartManualOperation': return fill(poly([[0, 0], [w, 0], [w * 0.8, h], [w * 0.2, h]]));
    case 'flowChartManualInput': return fill(poly([[0, h / 5], [w, 0], [w, h], [0, h]]));
    case 'hexagon': case 'flowChartPreparation': {
      const x = prst === 'hexagon' ? Math.min(w / 2, (ss * a('adj')) / 100000) : w / 5;
      return fill(poly([[x, 0], [w - x, 0], [w, vc], [w - x, h], [x, h], [0, vc]]));
    }
    case 'octagon': {
      const x = Math.min(ss / 2, (ss * a('adj')) / 100000);
      return fill(poly([[x, 0], [w - x, 0], [w, x], [w, h - x], [w - x, h], [x, h], [0, h - x], [0, x]]));
    }
    case 'pentagon': return fill(poly([[hc, 0], [w, h * 0.382], [w * 0.809, h], [w * 0.191, h], [0, h * 0.382]]));
    case 'heptagon': return fill(regular(w, h, 7));
    case 'decagon': return fill(regular(w, h, 10, 0));
    case 'dodecagon': return fill(regular(w, h, 12, Math.PI / 12));
    case 'flowChartOffpageConnector': return fill(poly([[0, 0], [w, 0], [w, h * 0.8], [hc, h], [0, h * 0.8]]));
    case 'flowChartPunchedCard': return fill(poly([[w / 5, 0], [w, 0], [w, h], [0, h], [0, h / 5]]));
    case 'homePlate': {
      const x = w - Math.min(w, (ss * a('adj')) / 100000);
      return fill(poly([[0, 0], [x, 0], [w, vc], [x, h], [0, h]]));
    }
    case 'chevron': {
      const x = Math.min(w, (ss * a('adj')) / 100000);
      return fill(poly([[0, 0], [w - x, 0], [w, vc], [w - x, h], [0, h], [x, vc]]));
    }
    case 'rightArrow': case 'leftArrow': case 'notchedRightArrow': {
      const dy = (h * Math.min(100000, a('adj1'))) / 200000;
      const head = Math.min(w, (ss * a('adj2')) / 100000);
      const notch = prst === 'notchedRightArrow' ? (dy * head) / vc : 0;
      const right: Array<[number, number]> = [[0, vc - dy], [w - head, vc - dy], [w - head, 0], [w, vc], [w - head, h], [w - head, vc + dy], [0, vc + dy]];
      if (notch) right.push([notch, vc]);
      return fill(poly(prst === 'leftArrow' ? right.map(([x, y]) => [w - x, y]) : right));
    }
    case 'upArrow': case 'downArrow': {
      const dx = (w * Math.min(100000, a('adj1'))) / 200000;
      const head = Math.min(h, (ss * a('adj2')) / 100000);
      const down: Array<[number, number]> = [[hc - dx, 0], [hc + dx, 0], [hc + dx, h - head], [w, h - head], [hc, h], [0, h - head], [hc - dx, h - head]];
      return fill(poly(prst === 'upArrow' ? down.map(([x, y]) => [x, h - y]) : down));
    }
    case 'leftRightArrow': {
      const dy = (h * a('adj1')) / 200000;
      const head = Math.min(w / 2, (ss * a('adj2')) / 100000);
      return fill(poly([[0, vc], [head, 0], [head, vc - dy], [w - head, vc - dy], [w - head, 0], [w, vc], [w - head, h], [w - head, vc + dy], [head, vc + dy], [head, h]]));
    }
    case 'upDownArrow': {
      const dx = (w * a('adj1')) / 200000;
      const head = Math.min(h / 2, (ss * a('adj2')) / 100000);
      return fill(poly([[hc, 0], [w, head], [hc + dx, head], [hc + dx, h - head], [w, h - head], [hc, h], [0, h - head], [hc - dx, h - head], [hc - dx, head], [0, head]]));
    }
    case 'star4': return fill(star(w, h, 4, a('adj') / 50000));
    case 'star5': return fill(star(w, h, 5, a('adj') / 50000));
    case 'star6': return fill(star(w, h, 6, a('adj') / 50000));
    case 'star7': return fill(star(w, h, 7, a('adj') / 50000));
    case 'star8': return fill(star(w, h, 8, a('adj') / 50000));
    case 'star10': return fill(star(w, h, 10, a('adj') / 50000));
    case 'star12': return fill(star(w, h, 12, a('adj') / 50000));
    case 'star16': return fill(star(w, h, 16, a('adj') / 50000));
    case 'star24': return fill(star(w, h, 24, a('adj') / 50000));
    case 'star32': return fill(star(w, h, 32, a('adj') / 50000));
    case 'donut': {
      const t = Math.min(ss / 2, (ss * a('adj')) / 100000);
      return fill(`${ellipse(hc, vc, w / 2, h / 2)} ${ellipse(hc, vc, Math.max(0, w / 2 - t), Math.max(0, h / 2 - t))}`);
    }
    case 'noSmoking': {
      const t = (ss * a('adj')) / 100000;
      return fill(`${ellipse(hc, vc, w / 2, h / 2)} ${ellipse(hc, vc, Math.max(0, w / 2 - t), Math.max(0, h / 2 - t))}`);
    }
    case 'frame': {
      const t = Math.min(ss / 2, (ss * a('adj1')) / 100000);
      return fill(`${poly([[0, 0], [w, 0], [w, h], [0, h]])} ${poly([[t, t], [t, h - t], [w - t, h - t], [w - t, t]])}`);
    }
    case 'halfFrame': {
      const x = Math.min(w, (ss * a('adj2')) / 100000);
      const y = Math.min(h, (ss * a('adj1')) / 100000);
      return fill(poly([[0, 0], [w, 0], [w - (w * y) / h, y], [x, y], [x, h - (h * x) / w], [0, h]]));
    }
    case 'corner': {
      const x = Math.min(w, (ss * a('adj2')) / 100000);
      const y = Math.min(h, (ss * a('adj1')) / 100000);
      return fill(poly([[0, 0], [x, 0], [x, h - y], [w, h - y], [w, h], [0, h]]));
    }
    case 'diagStripe': {
      const x = (w * a('adj')) / 100000;
      const y = (h * a('adj')) / 100000;
      return fill(poly([[0, y], [x, 0], [w, 0], [0, h]]));
    }
    case 'plus': case 'mathPlus': {
      const t = prst === 'plus' ? Math.min(ss / 2, (ss * a('adj')) / 100000) : (ss * a('adj1')) / 200000;
      if (prst === 'plus') return fill(poly([[t, 0], [w - t, 0], [w - t, t], [w, t], [w, h - t], [w - t, h - t], [w - t, h], [t, h], [t, h - t], [0, h - t], [0, t], [t, t]]));
      const arm = ss * 0.36;
      return fill(poly([[hc - t, vc - arm], [hc + t, vc - arm], [hc + t, vc - t], [hc + arm, vc - t], [hc + arm, vc + t], [hc + t, vc + t], [hc + t, vc + arm], [hc - t, vc + arm], [hc - t, vc + t], [hc - arm, vc + t], [hc - arm, vc - t], [hc - t, vc - t]]));
    }
    case 'mathMinus': { const t = (ss * a('adj1')) / 200000; return fill(poly([[w * 0.12, vc - t], [w * 0.88, vc - t], [w * 0.88, vc + t], [w * 0.12, vc + t]])); }
    case 'mathEqual': {
      const t = (ss * a('adj1')) / 200000;
      const g = (ss * a('adj2')) / 200000;
      return fill(`${poly([[w * 0.12, vc - g - 2 * t], [w * 0.88, vc - g - 2 * t], [w * 0.88, vc - g], [w * 0.12, vc - g]])} ${poly([[w * 0.12, vc + g], [w * 0.88, vc + g], [w * 0.88, vc + g + 2 * t], [w * 0.12, vc + g + 2 * t]])}`);
    }
    case 'mathMultiply': {
      const t = (ss * a('adj1')) / 200000;
      const r = ss * 0.36;
      const arm = (angle: number): Array<[number, number]> => {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return [[hc + r * c - t * s, vc + r * s + t * c], [hc + r * c + t * s, vc + r * s - t * c]];
      };
      return fill(`${poly([...arm(Math.PI / 4), ...arm((5 * Math.PI) / 4)])} ${poly([...arm((3 * Math.PI) / 4), ...arm((7 * Math.PI) / 4)])}`);
    }
    case 'can': case 'flowChartMagneticDisk': {
      const ry = prst === 'can' ? Math.min(h / 2, (ss * a('adj')) / 200000) : h / 6;
      const body = `M0 ${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 0 ${pt(w, ry)} L${pt(w, h - ry)} A${f(w / 2)} ${f(ry)} 0 0 1 ${pt(0, h - ry)} Z`;
      return [{ d: body, fill: 'norm', stroke: false }, { d: ellipse(hc, ry, w / 2, ry), fill: 'lighten', stroke: false }, { d: `${body} ${ellipse(hc, ry, w / 2, ry)}`, fill: 'none', stroke: true }];
    }
    case 'cube': {
      const d = Math.min(ss, (ss * a('adj')) / 100000);
      return [
        { d: poly([[0, d], [w - d, d], [w - d, h], [0, h]]), fill: 'norm', stroke: true },
        { d: poly([[0, d], [d, 0], [w, 0], [w - d, d]]), fill: 'lightenLess', stroke: true },
        { d: poly([[w - d, d], [w, 0], [w, h - d], [w - d, h]]), fill: 'darkenLess', stroke: true },
      ];
    }
    case 'snip1Rect': { const s = Math.min(ss, (ss * a('adj')) / 100000); return fill(cornerRect(w, h, [{}, { s }, {}, {}])); }
    case 'snip2SameRect': {
      const s1 = (ss * a('adj1')) / 100000;
      const s2 = (ss * a('adj2')) / 100000;
      return fill(cornerRect(w, h, [{ s: s1 }, { s: s1 }, { s: s2 }, { s: s2 }]));
    }
    case 'snip2DiagRect': {
      const s1 = (ss * a('adj1')) / 100000;
      const s2 = (ss * a('adj2')) / 100000;
      return fill(cornerRect(w, h, [{ s: s1 }, { s: s2 }, { s: s1 }, { s: s2 }]));
    }
    case 'round1Rect': { const r = Math.min(ss / 2, (ss * a('adj')) / 100000); return fill(cornerRect(w, h, [{}, { r }, {}, {}])); }
    case 'round2SameRect': {
      const r1 = Math.min(ss / 2, (ss * a('adj1')) / 100000);
      const r2 = Math.min(ss / 2, (ss * a('adj2')) / 100000);
      return fill(cornerRect(w, h, [{ r: r1 }, { r: r1 }, { r: r2 }, { r: r2 }]));
    }
    case 'round2DiagRect': {
      const r1 = Math.min(ss / 2, (ss * a('adj1')) / 100000);
      const r2 = Math.min(ss / 2, (ss * a('adj2')) / 100000);
      return fill(cornerRect(w, h, [{ r: r1 }, { r: r2 }, { r: r1 }, { r: r2 }]));
    }
    case 'snipRoundRect': {
      const r = Math.min(ss / 2, (ss * a('adj1')) / 100000);
      const s = Math.min(ss, (ss * a('adj2')) / 100000);
      return fill(cornerRect(w, h, [{ r }, { s }, {}, {}]));
    }
    case 'plaque': {
      const r = Math.min(ss / 2, (ss * a('adj')) / 100000);
      return fill(`M${pt(r, 0)} L${pt(w - r, 0)} A${f(r)} ${f(r)} 0 0 0 ${pt(w, r)} L${pt(w, h - r)} A${f(r)} ${f(r)} 0 0 0 ${pt(w - r, h)} L${pt(r, h)} A${f(r)} ${f(r)} 0 0 0 ${pt(0, h - r)} L${pt(0, r)} A${f(r)} ${f(r)} 0 0 0 ${pt(r, 0)} Z`);
    }
    case 'bevel': {
      const t = Math.min(ss / 2, (ss * a('adj')) / 100000);
      return [
        { d: poly([[0, 0], [w, 0], [w, h], [0, h]]), fill: 'norm', stroke: true },
        { d: poly([[0, 0], [w, 0], [w - t, t], [t, t]]), fill: 'lightenLess', stroke: true },
        { d: poly([[w, 0], [w, h], [w - t, h - t], [w - t, t]]), fill: 'darkenLess', stroke: true },
        { d: poly([[0, h], [w, h], [w - t, h - t], [t, h - t]]), fill: 'darken', stroke: true },
        { d: poly([[0, 0], [t, t], [t, h - t], [0, h]]), fill: 'lighten', stroke: true },
      ];
    }
    case 'foldedCorner': {
      const s = Math.min(ss, (ss * a('adj')) / 100000);
      return [
        { d: poly([[0, 0], [w, 0], [w, h - s], [w - s, h], [0, h]]), fill: 'norm', stroke: true },
        { d: poly([[w - s, h], [w - s * 0.8, h - s * 0.8], [w, h - s]]), fill: 'darkenLess', stroke: true },
      ];
    }
    case 'teardrop': {
      const k = Math.min(200000, a('adj')) / 100000;
      const tipX = hc + (w / 2) * k;
      const tipY = vc - (h / 2) * k;
      return fill(`M0 ${f(vc)} A${f(w / 2)} ${f(h / 2)} 0 0 1 ${pt(hc, 0)} Q${pt(Math.max(hc, tipX), Math.min(0, tipY) + (h / 2 - h / 2))} ${pt(tipX, tipY)} Q${pt(w, Math.min(vc, tipY))} ${pt(w, vc)} A${f(w / 2)} ${f(h / 2)} 0 0 1 ${pt(hc, h)} A${f(w / 2)} ${f(h / 2)} 0 0 1 ${pt(0, vc)} Z`);
    }
    case 'flowChartTerminator': {
      const rx = Math.min(w / 2, w * 0.1611);
      return fill(`M${pt(rx, 0)} L${pt(w - rx, 0)} A${f(rx)} ${f(vc)} 0 0 1 ${pt(w - rx, h)} L${pt(rx, h)} A${f(rx)} ${f(vc)} 0 0 1 ${pt(rx, 0)} Z`);
    }
    case 'flowChartDelay': return fill(`M0 0 L${pt(hc, 0)} A${f(hc)} ${f(vc)} 0 0 1 ${pt(hc, h)} L0 ${f(h)} Z`);
    case 'flowChartDocument': return fill(`M0 0 L${pt(w, 0)} L${pt(w, h * 0.8)} C${pt(w * 0.75, h * 0.66)} ${pt(w * 0.5, h * 0.82)} ${pt(w * 0.4, h * 0.93)} C${pt(w * 0.3, h * 1.04)} ${pt(w * 0.12, h)} ${pt(0, h * 0.92)} Z`);
    case 'flowChartMultidocument': {
      const o = Math.min(w, h) * 0.08;
      const docPath = (dx: number, dy: number, ww: number, hh: number): string => `M${pt(dx, dy)} L${pt(dx + ww, dy)} L${pt(dx + ww, dy + hh * 0.8)} C${pt(dx + ww * 0.75, dy + hh * 0.66)} ${pt(dx + ww * 0.5, dy + hh * 0.82)} ${pt(dx + ww * 0.4, dy + hh * 0.93)} C${pt(dx + ww * 0.3, dy + hh * 1.04)} ${pt(dx + ww * 0.12, dy + hh)} ${pt(dx, dy + hh * 0.92)} Z`;
      return [2, 1, 0].map((index) => ({ d: docPath(o * index, o * (2 - index), w - 2 * o, h - 2 * o), fill: 'norm' as const, stroke: true }));
    }
    case 'flowChartPredefinedProcess': return [{ d: poly([[0, 0], [w, 0], [w, h], [0, h]]), fill: 'norm', stroke: true }, { d: `M${pt(w / 8, 0)} L${pt(w / 8, h)} M${pt((7 * w) / 8, 0)} L${pt((7 * w) / 8, h)}`, fill: 'none', stroke: true }];
    case 'flowChartInternalStorage': return [{ d: poly([[0, 0], [w, 0], [w, h], [0, h]]), fill: 'norm', stroke: true }, { d: `M${pt(w / 8, 0)} L${pt(w / 8, h)} M0 ${f(h / 8)} L${pt(w, h / 8)}`, fill: 'none', stroke: true }];
    case 'flowChartSort': return [{ d: poly([[hc, 0], [w, vc], [hc, h], [0, vc]]), fill: 'norm', stroke: true }, { d: `M0 ${f(vc)} L${pt(w, vc)}`, fill: 'none', stroke: true }];
    case 'flowChartCollate': return fill(poly([[0, 0], [w, 0], [0, h], [w, h]]));
    case 'flowChartDisplay': return fill(`M0 ${f(vc)} L${pt(w / 6, 0)} L${pt((5 * w) / 6, 0)} A${f(w / 6)} ${f(vc)} 0 0 1 ${pt((5 * w) / 6, h)} L${pt(w / 6, h)} Z`);
    case 'leftBracket': case 'rightBracket': {
      const r = Math.min(h / 2, (ss * a('adj')) / 100000);
      const d = `M${pt(w, h)} A${f(w)} ${f(r)} 0 0 1 ${pt(0, h - r)} L0 ${f(r)} A${f(w)} ${f(r)} 0 0 1 ${pt(w, 0)}`;
      return [{ d: prst === 'leftBracket' ? d : mirror(d, w), fill: 'none', stroke: true }];
    }
    case 'leftBrace': case 'rightBrace': {
      const r = Math.min(h / 4, (ss * a('adj1')) / 100000);
      const m = (h * a('adj2')) / 100000;
      const x = w / 2;
      const d = `M${pt(w, h)} A${f(x)} ${f(r)} 0 0 1 ${pt(x, h - r)} L${pt(x, m + r)} A${f(x)} ${f(r)} 0 0 0 ${pt(0, m)} A${f(x)} ${f(r)} 0 0 0 ${pt(x, m - r)} L${pt(x, r)} A${f(x)} ${f(r)} 0 0 1 ${pt(w, 0)}`;
      return [{ d: prst === 'leftBrace' ? d : mirror(d, w), fill: 'none', stroke: true }];
    }
    case 'bracketPair': {
      const r = Math.min(ss / 2, (ss * a('adj')) / 100000);
      return line(`M${pt(r, h)} A${f(r)} ${f(r)} 0 0 1 ${pt(0, h - r)} L0 ${f(r)} A${f(r)} ${f(r)} 0 0 1 ${pt(r, 0)} M${pt(w - r, 0)} A${f(r)} ${f(r)} 0 0 1 ${pt(w, r)} L${pt(w, h - r)} A${f(r)} ${f(r)} 0 0 1 ${pt(w - r, h)}`);
    }
    case 'bracePair': {
      const r = Math.min(ss / 4, (ss * a('adj')) / 100000);
      return line(`M${pt(2 * r, h)} A${f(r)} ${f(r)} 0 0 1 ${pt(r, h - r)} L${pt(r, vc + r)} A${f(r)} ${f(r)} 0 0 0 ${pt(0, vc)} A${f(r)} ${f(r)} 0 0 0 ${pt(r, vc - r)} L${pt(r, r)} A${f(r)} ${f(r)} 0 0 1 ${pt(2 * r, 0)} M${pt(w - 2 * r, 0)} A${f(r)} ${f(r)} 0 0 1 ${pt(w - r, r)} L${pt(w - r, vc - r)} A${f(r)} ${f(r)} 0 0 0 ${pt(w, vc)} A${f(r)} ${f(r)} 0 0 0 ${pt(w - r, vc + r)} L${pt(w - r, h - r)} A${f(r)} ${f(r)} 0 0 1 ${pt(w - 2 * r, h)}`);
    }
    case 'wedgeRectCallout': case 'wedgeRoundRectCallout': {
      const tx = hc + (w * a('adj1')) / 100000;
      const ty = vc + (h * a('adj2')) / 100000;
      const r = prst === 'wedgeRoundRectCallout' ? Math.min(ss / 2, (ss * a('adj3')) / 100000) : 0;
      return fill(calloutRect(w, h, tx, ty, r));
    }
    case 'wedgeEllipseCallout': {
      const tx = hc + (w * a('adj1')) / 100000;
      const ty = vc + (h * a('adj2')) / 100000;
      const angle = Math.atan2((ty - vc) / h, (tx - hc) / w);
      const spread = 0.18;
      const p1: [number, number] = [hc + (w / 2) * Math.cos(angle + spread), vc + (h / 2) * Math.sin(angle + spread)];
      const p2: [number, number] = [hc + (w / 2) * Math.cos(angle - spread), vc + (h / 2) * Math.sin(angle - spread)];
      return fill(`M${pt(...p1)} L${pt(tx, ty)} L${pt(...p2)} A${f(w / 2)} ${f(h / 2)} 0 1 0 ${pt(...p1)} Z`);
    }
    case 'cloud': return fill(cloud(w, h));
    case 'cloudCallout': {
      const tx = hc + (w * a('adj1')) / 100000;
      const ty = vc + (h * a('adj2')) / 100000;
      const dx = tx - hc;
      const dy = ty - vc;
      const bubbles = [0.78, 0.9].map((k, index) => ellipse(hc + dx * k, vc + dy * k, ss * (0.06 - index * 0.025), ss * (0.06 - index * 0.025))).join(' ');
      return fill(`${cloud(w, h)} ${bubbles}`);
    }
    case 'arc': return line(ellipseArc(hc, vc, w / 2, h / 2, a('adj1'), a('adj2'), true));
    case 'pie': return fill(`M${pt(hc, vc)} ${ellipseArc(hc, vc, w / 2, h / 2, a('adj1'), a('adj2'), false)} Z`);
    case 'chord': return fill(`${ellipseArc(hc, vc, w / 2, h / 2, a('adj1'), a('adj2'), true)} Z`);
    case 'blockArc': {
      const t = Math.min(ss / 2, (ss * a('adj3')) / 100000);
      const outer = ellipseArc(hc, vc, w / 2, h / 2, a('adj1'), a('adj2'), true);
      let sweep = a('adj2') - a('adj1');
      while (sweep < 0) sweep += 21600000;
      const ri = Math.max(0, w / 2 - t);
      const rj = Math.max(0, h / 2 - t);
      const e = rad(a('adj1') + sweep);
      const s = rad(a('adj1'));
      return fill(`${outer} L${pt(hc + ri * Math.cos(e), vc + rj * Math.sin(e))} A${f(ri)} ${f(rj)} 0 ${sweep > 10800000 ? 1 : 0} 0 ${pt(hc + ri * Math.cos(s), vc + rj * Math.sin(s))} Z`);
    }
    case 'heart': return fill(`M${pt(hc, h * 0.25)} C${pt(hc, 0)} ${pt(0, 0)} ${pt(0, h * 0.3)} C${pt(0, h * 0.6)} ${pt(hc, h * 0.8)} ${pt(hc, h)} C${pt(hc, h * 0.8)} ${pt(w, h * 0.6)} ${pt(w, h * 0.3)} C${pt(w, 0)} ${pt(hc, 0)} ${pt(hc, h * 0.25)} Z`);
    case 'lightningBolt': return fill(poly([[w * 0.39, 0], [w * 0.61, h * 0.31], [w * 0.52, h * 0.35], [w * 0.8, h * 0.62], [w * 0.7, h * 0.66], [w, h], [w * 0.36, h * 0.72], [w * 0.47, h * 0.68], [w * 0.18, h * 0.42], [w * 0.29, h * 0.38], [0, h * 0.16]]));
    case 'moon': {
      const k = a('adj') / 100000;
      return fill(`M${pt(w, 0)} A${f(w)} ${f(vc)} 0 0 0 ${pt(w, h)} A${f(w * (1 - k))} ${f(vc)} 0 0 1 ${pt(w, 0)} Z`);
    }
    case 'sun': {
      const r = ss * 0.25;
      const rays: string[] = [];
      for (let i = 0; i < 8; i += 1) {
        const angle = (i * Math.PI) / 4;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        rays.push(poly([[hc + (w / 2) * c, vc + (h / 2) * s], [hc + r * 1.25 * c - ss * 0.06 * s, vc + r * 1.25 * s + ss * 0.06 * c], [hc + r * 1.25 * c + ss * 0.06 * s, vc + r * 1.25 * s - ss * 0.06 * c]]));
      }
      return fill(`${ellipse(hc, vc, r, r)} ${rays.join(' ')}`);
    }
    case 'smileyFace': {
      const eye = ss * 0.06;
      return [
        { d: ellipse(hc, vc, w / 2, h / 2), fill: 'norm', stroke: true },
        { d: `${ellipse(w * 0.35, h * 0.38, eye, eye)} ${ellipse(w * 0.65, h * 0.38, eye, eye)}`, fill: 'darkenLess', stroke: true },
        { d: `M${pt(w * 0.28, h * 0.66)} Q${pt(hc, h * 0.82)} ${pt(w * 0.72, h * 0.66)}`, fill: 'none', stroke: true },
      ];
    }
    case 'ribbon': case 'ribbon2': case 'ellipseRibbon': case 'ellipseRibbon2':
    default:
      return fill(poly([[0, 0], [w, 0], [w, h], [0, h]]));
  }
}

const mirror = (d: string, w: number): string => {
  // Mirrors absolute path data horizontally (M/L/A/C commands with absolute coordinates).
  return d.replace(/([MLCQA])([^MLCQAZ]*)/g, (_match, op: string, args: string) => {
    const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (op === 'A') {
      // rx ry rot large sweep x y: the sweep flips with the mirror.
      return `A${f(n[0])} ${f(n[1])} ${f(n[2])} ${n[3]} ${n[4] ? 0 : 1} ${pt(w - n[5], n[6])} `;
    }
    const out: string[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) out.push(pt(w - n[i], n[i + 1]));
    return `${op}${out.join(' ')} `;
  }).trim();
};

/** The text rectangle PowerPoint lays text into, for presets that inset it. */
export function presetTextRect(prst: string | undefined, w: number, h: number, av: Record<string, number> = {}): Rect {
  const ss = Math.min(w, h);
  const a = (name: string): number => av[name] ?? DEFAULTS[prst ?? '']?.[name] ?? 0;
  switch (prst) {
    case 'ellipse': case 'flowChartConnector': case 'wedgeEllipseCallout': {
      const dx = (w / 2) * (1 - Math.SQRT1_2);
      const dy = (h / 2) * (1 - Math.SQRT1_2);
      return { x: dx, y: dy, w: w - 2 * dx, h: h - 2 * dy };
    }
    case 'roundRect': case 'wedgeRoundRectCallout': {
      const r = (ss * Math.min(50000, a(prst === 'roundRect' ? 'adj' : 'adj3'))) / 100000;
      const i = r * 0.29289;
      return { x: i, y: i, w: w - 2 * i, h: h - 2 * i };
    }
    case 'triangle': return { x: w / 4, y: h / 2, w: w / 2, h: h / 2 };
    case 'diamond': case 'flowChartDecision': return { x: w / 4, y: h / 4, w: w / 2, h: h / 2 };
    case 'hexagon': { const x = (ss * a('adj')) / 100000 / 2; return { x, y: 0, w: w - 2 * x, h }; }
    case 'parallelogram': { const x = (ss * a('adj')) / 100000 / 2; return { x, y: 0, w: w - 2 * x, h }; }
    case 'homePlate': return { x: 0, y: 0, w: w - (ss * a('adj')) / 100000 / 2, h };
    case 'chevron': { const x = (ss * a('adj')) / 100000; return { x, y: 0, w: Math.max(0, w - 2 * x), h }; }
    case 'can': case 'flowChartMagneticDisk': { const y = prst === 'can' ? (ss * a('adj')) / 100000 : h / 3; return { x: 0, y, w, h: h - y }; }
    default: return { x: 0, y: 0, w, h };
  }
}

// Custom geometry -------------------------------------------------------------------------------

/** Evaluates a DrawingML guide formula ("+- a b c", "?: x y z"…). */
function evalFormula(fmla: string, vars: Map<string, number>): number {
  const [op, ...args] = fmla.trim().split(/\s+/);
  const v = (token: string | undefined): number => {
    if (token === undefined) return 0;
    const n = Number(token);
    return Number.isFinite(n) ? n : vars.get(token) ?? 0;
  };
  const [x, y, z] = [v(args[0]), v(args[1]), v(args[2])];
  const deg = (angle: number): number => (angle / 60000) * (Math.PI / 180);
  switch (op) {
    case '*/': return z === 0 ? 0 : (x * y) / z;
    case '+-': return x + y - z;
    case '+/': return z === 0 ? 0 : (x + y) / z;
    case '?:': return x > 0 ? y : z;
    case 'abs': return Math.abs(x);
    case 'at2': return (Math.atan2(y, x) * 180 / Math.PI) * 60000;
    case 'cat2': return x * Math.cos(Math.atan2(z, y));
    case 'cos': return x * Math.cos(deg(y));
    case 'max': return Math.max(x, y);
    case 'min': return Math.min(x, y);
    case 'mod': return Math.sqrt(x * x + y * y + z * z);
    case 'pin': return y < x ? x : y > z ? z : y;
    case 'sat2': return x * Math.sin(Math.atan2(z, y));
    case 'sin': return x * Math.sin(deg(y));
    case 'sqrt': return Math.sqrt(Math.max(0, x));
    case 'tan': return x * Math.tan(deg(y));
    case 'val': return x;
    default: return 0;
  }
}

/** Built-in guide values for a box of w × h (EMU or any unit). */
export function guideVars(w: number, h: number): Map<string, number> {
  const ss = Math.min(w, h);
  const ls = Math.max(w, h);
  return new Map<string, number>([
    ['w', w], ['h', h], ['ss', ss], ['ls', ls], ['l', 0], ['t', 0], ['r', w], ['b', h], ['hc', w / 2], ['vc', h / 2],
    ['wd2', w / 2], ['wd3', w / 3], ['wd4', w / 4], ['wd5', w / 5], ['wd6', w / 6], ['wd8', w / 8], ['wd10', w / 10], ['wd12', w / 12], ['wd32', w / 32],
    ['hd2', h / 2], ['hd3', h / 3], ['hd4', h / 4], ['hd5', h / 5], ['hd6', h / 6], ['hd8', h / 8], ['hd10', h / 10], ['hd12', h / 12], ['hd32', h / 32],
    ['ssd2', ss / 2], ['ssd4', ss / 4], ['ssd6', ss / 6], ['ssd8', ss / 8], ['ssd16', ss / 16], ['ssd32', ss / 32],
    ['cd2', 10800000], ['cd4', 5400000], ['cd8', 2700000], ['3cd4', 16200000], ['3cd8', 8100000], ['5cd8', 13500000], ['7cd8', 18900000],
  ]);
}

export function evaluateGuides(guides: Array<{ name: string; fmla: string }>, vars: Map<string, number>): Map<string, number> {
  for (const guide of guides) vars.set(guide.name, evalFormula(guide.fmla, vars));
  return vars;
}

/** Path data for custom geometry paths scaled into w × h. */
export function customPaths(paths: CustomPath[], w: number, h: number): GeoPath[] {
  return paths.map((path) => {
    const sx = path.w > 0 ? w / path.w : 1;
    const sy = path.h > 0 ? h / path.h : 1;
    let d = '';
    let cx = 0;
    let cy = 0;
    let startX = 0;
    let startY = 0;
    for (const [op, ...n] of path.cmds) {
      if (op === 'M') { cx = n[0]; cy = n[1]; startX = cx; startY = cy; d += `M${pt(cx * sx, cy * sy)} `; }
      else if (op === 'L') { cx = n[0]; cy = n[1]; d += `L${pt(cx * sx, cy * sy)} `; }
      else if (op === 'C') { d += `C${pt(n[0] * sx, n[1] * sy)} ${pt(n[2] * sx, n[3] * sy)} ${pt(n[4] * sx, n[5] * sy)} `; cx = n[4]; cy = n[5]; }
      else if (op === 'Q') { d += `Q${pt(n[0] * sx, n[1] * sy)} ${pt(n[2] * sx, n[3] * sy)} `; cx = n[2]; cy = n[3]; }
      else if (op === 'A') {
        const [wR, hR, stAng, swAng] = n;
        // DrawingML angles are visual angles on the ellipse; convert to parametric ones.
        const param = (angle: number): number => Math.atan2(wR * Math.sin(rad(angle)), hR * Math.cos(rad(angle)));
        const t0 = param(stAng);
        const centerX = cx - wR * Math.cos(t0);
        const centerY = cy - hR * Math.sin(t0);
        const steps = Math.max(1, Math.ceil(Math.abs(swAng) / 10800000));
        for (let step = 1; step <= steps; step += 1) {
          const angle = stAng + (swAng * step) / steps;
          const t = param(angle);
          const x = centerX + wR * Math.cos(t);
          const y = centerY + hR * Math.sin(t);
          const part = Math.abs(swAng / steps);
          d += `A${f(wR * sx)} ${f(hR * sy)} 0 ${part > 10800000 ? 1 : 0} ${swAng > 0 ? 1 : 0} ${pt(x * sx, y * sy)} `;
          cx = x;
          cy = y;
        }
      } else if (op === 'Z') { d += 'Z '; cx = startX; cy = startY; }
    }
    return { d: d.trim(), fill: path.fill, stroke: path.stroke };
  });
}

/** The paths of any geometry in a box of w × h. */
export function geometryPaths(geom: Geometry, w: number, h: number): GeoPath[] {
  if (geom.paths?.length) return customPaths(geom.paths, w, h);
  return presetPaths(geom.prst ?? 'rect', w, h, geom.av);
}
