/**
 * The refraction behind iOS 26 "Liquid Glass" controls, as an SVG filter for
 * `backdrop-filter: url(#…)` (Chromium / WebView2 only; elsewhere the glass is
 * drawn without bending).
 *
 * The lens is a pill of `width × height` CSS px. A displacement map makes every
 * point of the backdrop sample from slightly nearer the centre (a mild
 * magnification), much more so across the rounded rim where the glass curves
 * away, so the track seen through the thumb bends at its edges. The three
 * colour channels are displaced by slightly different amounts, which gives the
 * faint dispersion at the rim.
 */

export interface LensOptions {
  /** Fraction of the distance to the centre, everywhere (magnification). */
  magnify?: number;
  /** Extra pull at the very edge, as a fraction of the radius. */
  rimPull?: number;
  /** Width of the curved rim, as a fraction of the radius. */
  rimWidth?: number;
  /** Red, green, blue displacement scales (colour fringing at the rim). */
  dispersion?: number[];
}

const DEFAULTS: Required<LensOptions> = {
  magnify: 0.08,
  rimPull: 0.42,
  rimWidth: 0.9,
  dispersion: [1, 1.045, 1.09],
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const filters = new Map<string, string>();
let host: SVGSVGElement | null = null;

const ensureHost = (): SVGSVGElement => {
  if (host && host.isConnected) return host;
  host = document.createElementNS(SVG_NS, 'svg');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('width', '0');
  host.setAttribute('height', '0');
  // Not display:none: filters inside an undisplayed <svg> are ignored.
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  host.appendChild(document.createElementNS(SVG_NS, 'defs'));
  document.body.appendChild(host);
  return host;
};

/** Draws the displacement map; returns it with the largest displacement in px. */
const displacementMap = (width: number, height: number, { magnify, rimPull, rimWidth }: Required<LensOptions>): { url: string; reach: number } => {
  const density = 2;
  const w = Math.round(width * density);
  const h = Math.round(height * density);
  const radius = height / 2;
  const half = width / 2 - radius;
  const rim = radius * rimWidth;
  const dx = new Float32Array(w * h);
  const dy = new Float32Array(w * h);
  let reach = 0;

  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const px = (i + 0.5) / density - width / 2;
      const py = (j + 0.5) / density - height / 2;
      const qx = Math.max(Math.abs(px) - half, 0);
      const dist = Math.hypot(qx, py);
      const inside = radius - dist;
      if (inside < 0) continue;
      let x = -px * magnify;
      let y = -py * magnify;
      if (inside < rim && dist > 0) {
        const t = 1 - inside / rim;
        // A circular rim profile: flat inside, bending ever faster to the edge.
        const bend = (1 - Math.sqrt(1 - t * t)) * radius * rimPull;
        x -= (Math.sign(px) * qx / dist) * bend;
        y -= (py / dist) * bend;
      }
      const k = j * w + i;
      dx[k] = x;
      dy[k] = y;
      reach = Math.max(reach, Math.abs(x), Math.abs(y));
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx || reach === 0) return { url: '', reach: 0 };
  const image = ctx.createImageData(w, h);
  for (let k = 0; k < w * h; k += 1) {
    image.data[k * 4] = Math.round(128 + (dx[k] / reach) * 127);
    image.data[k * 4 + 1] = Math.round(128 + (dy[k] / reach) * 127);
    image.data[k * 4 + 2] = 128;
    image.data[k * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return { url: canvas.toDataURL('image/png'), reach };
};

/** A colour matrix keeping one colour channel (and alpha). */
const channel = (index: number): string =>
  [0, 1, 2, 3]
    .map((row) => [0, 1, 2, 3, 4].map((col) => (row === col && (row === index || row === 3) ? 1 : 0)).join(' '))
    .join(' ');

/**
 * Returns `url(#id)` for a lens of this size, creating the filter on first use,
 * or `none` when it cannot be built.
 */
export const liquidLens = (width: number, height: number, options: LensOptions = {}): string => {
  if (typeof document === 'undefined') return 'none';
  const opts = { ...DEFAULTS, ...options };
  const key = `${Math.round(width)}x${Math.round(height)}-${opts.magnify}-${opts.rimPull}-${opts.rimWidth}-${opts.dispersion.join('_')}`.replace(/\./g, 'p');
  const known = filters.get(key);
  if (known) return known;

  const { url, reach } = displacementMap(width, height, opts);
  if (!url) {
    filters.set(key, 'none');
    return 'none';
  }
  const id = `yz-liquid-lens-${key}`;
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('x', '0');
  filter.setAttribute('y', '0');
  filter.setAttribute('width', String(width));
  filter.setAttribute('height', String(height));
  filter.setAttribute('filterUnits', 'userSpaceOnUse');
  filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const add = (tag: string, attrs: Record<string, string | number>) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    filter.appendChild(node);
  };

  add('feImage', { href: url, x: 0, y: 0, width, height, preserveAspectRatio: 'none', result: 'map' });
  opts.dispersion.forEach((scale, index) => {
    add('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'map',
      scale: (reach * 2 * scale).toFixed(2),
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: `bent${index}`,
    });
    add('feColorMatrix', { in: `bent${index}`, type: 'matrix', values: channel(index), result: `ch${index}` });
  });
  add('feBlend', { in: 'ch0', in2: 'ch1', mode: 'screen', result: 'ch01' });
  add('feBlend', { in: 'ch01', in2: 'ch2', mode: 'screen' });

  ensureHost().firstChild!.appendChild(filter);
  const value = `url(#${id})`;
  filters.set(key, value);
  return value;
};
