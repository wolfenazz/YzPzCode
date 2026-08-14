// ─── Image Editor — selection masks ───────────────────────────────────────

import type { SelectionMask, SelectionOutline } from '../types';

export const emptySelection = (w: number, h: number): SelectionMask => ({
  data: new Uint8ClampedArray(w * h),
  w,
  h,
  bounds: null,
  outline: null,
});

const computeBounds = (data: Uint8ClampedArray, w: number, h: number) => {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

const pack = (
  data: Uint8ClampedArray,
  w: number,
  h: number,
  outline: SelectionOutline,
): SelectionMask => ({ data, w, h, bounds: computeBounds(data, w, h), outline });

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const rectSelection = (
  x: number,
  y: number,
  w: number,
  h: number,
  docW: number,
  docH: number,
): SelectionMask => {
  const x0 = clamp(Math.floor(x), 0, docW);
  const y0 = clamp(Math.floor(y), 0, docH);
  const x1 = clamp(Math.ceil(x + w), 0, docW);
  const y1 = clamp(Math.ceil(y + h), 0, docH);
  const data = new Uint8ClampedArray(docW * docH);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      data[yy * docW + xx] = 255;
    }
  }
  return pack(data, docW, docH, {
    kind: 'rect',
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
  });
};

export const ellipseSelection = (
  x: number,
  y: number,
  w: number,
  h: number,
  docW: number,
  docH: number,
): SelectionMask => {
  const x0 = clamp(Math.floor(x), 0, docW);
  const y0 = clamp(Math.floor(y), 0, docH);
  const x1 = clamp(Math.ceil(x + w), 0, docW);
  const y1 = clamp(Math.ceil(y + h), 0, docH);
  const cw = x1 - x0;
  const ch = y1 - y0;
  const cx = x0 + cw / 2;
  const cy = y0 + ch / 2;
  const rx = cw / 2;
  const ry = ch / 2;
  const data = new Uint8ClampedArray(docW * docH);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const nx = (xx + 0.5 - cx) / rx;
      const ny = (yy + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) data[yy * docW + xx] = 255;
    }
  }
  return pack(data, docW, docH, {
    kind: 'ellipse',
    x: x0,
    y: y0,
    w: cw,
    h: ch,
  });
};

export const lassoSelection = (
  points: number[],
  docW: number,
  docH: number,
): SelectionMask => {
  const c = document.createElement('canvas');
  c.width = docW;
  c.height = docH;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    ctx.lineTo(points[i], points[i + 1]);
  }
  ctx.closePath();
  ctx.fill();
  const img = ctx.getImageData(0, 0, docW, docH);
  const data = new Uint8ClampedArray(docW * docH);
  for (let i = 0; i < data.length; i++) {
    data[i] = img.data[i * 4] > 128 ? 255 : 0;
  }
  const outline: SelectionOutline = { kind: 'path', x: 0, y: 0, w: docW, h: docH, points };
  return pack(data, docW, docH, outline);
};

/** Inverts the selection (used by Select → Inverse). */
export const invertSelection = (sel: SelectionMask): SelectionMask => {
  const data = new Uint8ClampedArray(sel.data.length);
  for (let i = 0; i < data.length; i++) {
    data[i] = sel.data[i] > 0 ? 0 : 255;
  }
  const bounds = computeBounds(data, sel.w, sel.h);
  return { data, w: sel.w, h: sel.h, bounds, outline: null };
};

/** True when the selection contains any pixels. */
export const hasSelection = (sel: SelectionMask | null): boolean =>
  sel !== null && sel.bounds !== null;
