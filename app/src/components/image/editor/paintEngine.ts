// ─── Image Editor — pixel paint engine ────────────────────────────────────
// Brush / eraser / flood-fill / eyedropper. Paint happens in DOCUMENT space
// and is translated onto the active raster layer via its (x, y) offset.

import type { SelectionMask } from '../types';

export interface StrokeOpts {
  size: number;
  opacity: number; // 0..1
  color: string;
  hardness: number; // 0..1
  erase: boolean;
}

// Reusable doc-sized scratch canvases (allocated lazily, reused).
let scratchA: HTMLCanvasElement | null = null;
let scratchB: HTMLCanvasElement | null = null;
let maskScratch: HTMLCanvasElement | null = null;

const ensureScratch = (
  holder: { current: HTMLCanvasElement | null },
  w: number,
  h: number,
): HTMLCanvasElement => {
  if (!holder.current || holder.current.width !== w || holder.current.height !== h) {
    holder.current = document.createElement('canvas');
    holder.current.width = Math.max(1, w);
    holder.current.height = Math.max(1, h);
  }
  return holder.current;
};

const scratchAHolder = { current: scratchA };
const scratchBHolder = { current: scratchB };
const maskHolder = { current: maskScratch };

/** Builds a doc-sized mask canvas (white where selected), or null if no selection. */
export const buildMaskCanvas = (
  mask: SelectionMask | null,
  docW: number,
  docH: number,
): HTMLCanvasElement | null => {
  if (!mask || !mask.bounds) return null;
  const c = ensureScratch(maskHolder, docW, docH);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(docW, docH);
  const data = mask.data;
  const len = Math.min(data.length, docW * docH);
  for (let i = 0; i < len; i++) {
    const v = data[i];
    const o = i * 4;
    img.data[o] = 255;
    img.data[o + 1] = 255;
    img.data[o + 2] = 255;
    img.data[o + 3] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

const stampDot = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  hardness: number,
): void => {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (hardness >= 0.98) {
    ctx.fillStyle = '#000';
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(Math.max(0.05, hardness), 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fill();
  }
};

/**
 * Paints a brush/eraser stroke segment (doc space) onto a raster layer's context.
 * `layerCtx` is the layer's own 2D context; `layerX`/`layerY` offset it in doc space.
 */
export const paintStroke = (
  layerCtx: CanvasRenderingContext2D,
  layerX: number,
  layerY: number,
  docW: number,
  docH: number,
  maskCanvas: HTMLCanvasElement | null,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: StrokeOpts,
): void => {
  const radius = Math.max(0.5, opts.size / 2);
  const a = ensureScratch(scratchAHolder, docW, docH);
  const actx = a.getContext('2d')!;
  actx.clearRect(0, 0, docW, docH);

  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.5, radius * 0.25)));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 1 : i / steps;
    stampDot(actx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, opts.hardness);
  }

  if (maskCanvas) {
    actx.globalCompositeOperation = 'destination-in';
    actx.drawImage(maskCanvas, 0, 0);
    actx.globalCompositeOperation = 'source-over';
  }

  layerCtx.save();
  layerCtx.translate(-layerX, -layerY);
  layerCtx.globalAlpha = opts.opacity;
  if (opts.erase) {
    layerCtx.globalCompositeOperation = 'destination-out';
    layerCtx.drawImage(a, 0, 0);
  } else {
    const b = ensureScratch(scratchBHolder, docW, docH);
    const bctx = b.getContext('2d')!;
    bctx.clearRect(0, 0, docW, docH);
    bctx.fillStyle = opts.color;
    bctx.fillRect(0, 0, docW, docH);
    bctx.globalCompositeOperation = 'destination-in';
    bctx.drawImage(a, 0, 0);
    bctx.globalCompositeOperation = 'source-over';
    layerCtx.globalCompositeOperation = 'source-over';
    layerCtx.drawImage(b, 0, 0);
  }
  layerCtx.restore();
};

// ── Flood fill ────────────────────────────────────────────────────────────

const hexToRgba = (hex: string): [number, number, number, number] => {
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [0, 0, 0, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

/**
 * Scanline flood fill on `layerCtx` at (x, y) in layer-local space.
 * `maskAt` returns true when a doc-space pixel is inside the selection
 * (used to constrain fills); pass null to fill freely.
 */
export const floodFill = (
  layerCtx: CanvasRenderingContext2D,
  w: number,
  h: number,
  x: number,
  y: number,
  fillColor: string,
  tolerance = 32,
  maskAt: ((px: number, py: number) => boolean) | null = null,
): boolean => {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= w || py >= h) return false;

  const img = layerCtx.getImageData(0, 0, w, h);
  const data = img.data;
  const idx = (ix: number, iy: number) => (iy * w + ix) * 4;
  const start = idx(px, py);
  const sr = data[start];
  const sg = data[start + 1];
  const sb = data[start + 2];
  const sa = data[start + 3];
  const [fr, fg, fb, fa] = hexToRgba(fillColor);

  const tolSq = tolerance * tolerance;
  const visited = new Uint8Array(w * h);

  const matches = (i: number): boolean => {
    const dr = data[i] - sr;
    const dg = data[i + 1] - sg;
    const db = data[i + 2] - sb;
    const da = data[i + 3] - sa;
    return dr * dr + dg * dg + db * db + da * da <= tolSq;
  };

  const stack: number[] = [px, py];
  while (stack.length) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    if (visited[cy * w + cx]) continue;
    visited[cy * w + cx] = 1;
    const i = idx(cx, cy);
    if (!matches(i)) continue;
    if (maskAt && !maskAt(cx, cy)) continue;
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = fa;
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }

  layerCtx.putImageData(img, 0, 0);
  return true;
};

// ── Eyedropper ────────────────────────────────────────────────────────────

export const rgbaToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** Samples a pixel from a doc-space canvas and returns its hex color. */
export const pickColor = (
  source: HTMLCanvasElement,
  x: number,
  y: number,
): string | null => {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= source.width || py >= source.height) return null;
  const d = source.getContext('2d')!.getImageData(px, py, 1, 1).data;
  return rgbaToHex(d[0], d[1], d[2]);
};
