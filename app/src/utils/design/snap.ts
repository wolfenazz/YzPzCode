// Snapping, aligning and distributing boards on the canvas. Pure geometry, no DOM
// (`npm run test:design`).

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A guide line drawn while snapping: `axis: 'x'` is a vertical line at x = `at`. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export function unionRect(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

interface Match { delta: number; at: number }

function bestMatch(moving: number[], targets: number[], threshold: number): Match | null {
  let best: Match | null = null;
  for (const from of moving) {
    for (const to of targets) {
      const delta = to - from;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: to };
    }
  }
  return best;
}

/**
 * How far to nudge `moving` so its edges or centre meet those of `others`, and the guide lines to
 * draw. `threshold` is in canvas units (divide screen pixels by the zoom).
 */
export function snapRect(moving: Rect, others: Rect[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const xs = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const ys = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];
  const otherXs = others.flatMap((rect) => [rect.x, rect.x + rect.width / 2, rect.x + rect.width]);
  const otherYs = others.flatMap((rect) => [rect.y, rect.y + rect.height / 2, rect.y + rect.height]);
  const matchX = bestMatch(xs, otherXs, threshold);
  const matchY = bestMatch(ys, otherYs, threshold);
  const dx = matchX?.delta ?? 0;
  const dy = matchY?.delta ?? 0;
  const snapped: Rect = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  if (matchX) {
    const touching = others.filter((rect) => [rect.x, rect.x + rect.width / 2, rect.x + rect.width].some((line) => Math.abs(line - matchX.at) < 0.5));
    const span = unionRect([snapped, ...touching]);
    guides.push({ axis: 'x', at: matchX.at, from: span.y, to: span.y + span.height });
  }
  if (matchY) {
    const touching = others.filter((rect) => [rect.y, rect.y + rect.height / 2, rect.y + rect.height].some((line) => Math.abs(line - matchY.at) < 0.5));
    const span = unionRect([snapped, ...touching]);
    guides.push({ axis: 'y', at: matchY.at, from: span.x, to: span.x + span.width });
  }
  return { dx, dy, guides };
}

/** New positions that line the boards up on one edge or centre of their common box. */
export function alignRects(rects: Record<string, Rect>, mode: AlignMode): Record<string, { x: number; y: number }> {
  const ids = Object.keys(rects);
  const box = unionRect(ids.map((id) => rects[id]));
  const out: Record<string, { x: number; y: number }> = {};
  for (const id of ids) {
    const rect = rects[id];
    let { x, y } = rect;
    if (mode === 'left') x = box.x;
    else if (mode === 'right') x = box.x + box.width - rect.width;
    else if (mode === 'center') x = box.x + (box.width - rect.width) / 2;
    else if (mode === 'top') y = box.y;
    else if (mode === 'bottom') y = box.y + box.height - rect.height;
    else y = box.y + (box.height - rect.height) / 2;
    out[id] = { x: Math.round(x), y: Math.round(y) };
  }
  return out;
}

/** Equal gaps between boards along one axis; the two outermost stay where they are. */
export function distributeRects(rects: Record<string, Rect>, axis: 'x' | 'y'): Record<string, { x: number; y: number }> {
  const ids = Object.keys(rects).sort((a, b) => rects[a][axis] - rects[b][axis]);
  const out: Record<string, { x: number; y: number }> = Object.fromEntries(ids.map((id) => [id, { x: rects[id].x, y: rects[id].y }]));
  if (ids.length < 3) return out;
  const size = axis === 'x' ? 'width' : 'height';
  const first = rects[ids[0]];
  const last = rects[ids[ids.length - 1]];
  const total = last[axis] + last[size] - first[axis];
  const used = ids.reduce((sum, id) => sum + rects[id][size], 0);
  const gap = (total - used) / (ids.length - 1);
  let cursor = first[axis];
  for (const id of ids) {
    out[id] = { ...out[id], [axis]: Math.round(cursor) };
    cursor += rects[id][size] + gap;
  }
  return out;
}

/** Boards whose box meets the rectangle (the marquee). */
export function boardsInRect(rects: Record<string, Rect>, area: Rect): string[] {
  return Object.keys(rects).filter((id) => {
    const rect = rects[id];
    return rect.x < area.x + area.width && rect.x + rect.width > area.x && rect.y < area.y + area.height && rect.y + rect.height > area.y;
  });
}

/** A place for a pasted or duplicated copy: to the right of everything, or offset when the spot is taken. */
export function pasteOrigin(copies: Rect[], existing: Rect[], gap = 120): { dx: number; dy: number } {
  if (copies.length === 0) return { dx: 0, dy: 0 };
  const box = unionRect(copies);
  const right = existing.length > 0 ? Math.max(...existing.map((rect) => rect.x + rect.width)) : box.x + box.width;
  return { dx: right + gap - box.x, dy: 0 };
}

/** The boards in one row, left to right as they are now, top-aligned, `gap` apart (0 = edge to edge). */
export function rowRects(rects: Record<string, Rect>, gap = 0): Record<string, { x: number; y: number }> {
  const ids = Object.keys(rects).sort((a, b) => rects[a].x - rects[b].x || rects[a].y - rects[b].y);
  const out: Record<string, { x: number; y: number }> = {};
  if (ids.length === 0) return out;
  const top = Math.min(...ids.map((id) => rects[id].y));
  let cursor = rects[ids[0]].x;
  for (const id of ids) {
    out[id] = { x: Math.round(cursor), y: Math.round(top) };
    cursor += rects[id].width + gap;
  }
  return out;
}
