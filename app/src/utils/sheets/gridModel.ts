// Geometry and navigation of the grid, independent of the canvas that draws it.
// Dependency-free (tested by `npm run test:sheets`).

import { cellKey, parseRange, type RangeRef } from './address';
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, MAX_COLS, MAX_ROWS, type Sheet } from './types';

/** Pixels of a column's `width` attribute (Excel: 7 px per character unit). */
export const colPixels = (width: number | undefined, fallback = DEFAULT_COL_WIDTH): number => Math.max(0, Math.round((width ?? fallback) * 7));
/** Pixels of a row height given in points. */
export const rowPixels = (height: number | undefined, fallback = DEFAULT_ROW_HEIGHT): number => Math.max(0, Math.round(((height ?? fallback) * 96) / 72));

/**
 * Positions along one axis (rows or columns) with a default size and sparse
 * overrides (custom sizes, hidden = 0). Offsets are computed with a prefix sum
 * over the overrides, so a million rows cost nothing until they are looked at.
 */
export class Axis {
  private readonly indexes: number[];
  /** `prefix[k]` = sum of (size - default) of the first k overrides. */
  private readonly prefix: number[];
  private readonly sizes: Map<number, number>;

  constructor(readonly defaultSize: number, overrides: Map<number, number>) {
    this.sizes = overrides;
    this.indexes = [...overrides.keys()].sort((a, b) => a - b);
    this.prefix = [0];
    for (const index of this.indexes) this.prefix.push(this.prefix[this.prefix.length - 1] + ((overrides.get(index) as number) - defaultSize));
  }

  size(index: number): number {
    return this.sizes.get(index) ?? this.defaultSize;
  }

  /** Start position of `index`. */
  offset(index: number): number {
    // Number of overrides below `index`.
    let lo = 0;
    let hi = this.indexes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.indexes[mid] < index) lo = mid + 1;
      else hi = mid;
    }
    return index * this.defaultSize + this.prefix[lo];
  }

  /** The index whose span contains `position` (clamped to `max - 1`). */
  indexAt(position: number, max = MAX_ROWS): number {
    if (position <= 0) return 0;
    let lo = 0;
    let hi = max - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.offset(mid) <= position) lo = mid;
      else hi = mid - 1;
    }
    // Zero-size (hidden) indexes share their neighbour's offset; land on a visible one.
    let index = lo;
    while (index < max - 1 && this.size(index) === 0) index += 1;
    return index;
  }

  /** Total length of the first `count` indexes. */
  total(count: number): number {
    return this.offset(count);
  }
}

export interface SheetAxes {
  cols: Axis;
  rows: Axis;
}

const axesCache = new WeakMap<object, SheetAxes>();

/** Axes of a sheet, cached until its column or row tables are replaced. */
export function sheetAxes(sheet: Sheet): SheetAxes {
  const key = sheet.cols;
  const cached = axesCache.get(key);
  const rowsKey = sheet.rows;
  if (cached && (cached as SheetAxes & { rowsRef?: object }).rowsRef === rowsKey) return cached;
  const colSizes = new Map<number, number>();
  const defaultCol = colPixels(sheet.defaultColWidth);
  for (const [index, info] of Object.entries(sheet.cols)) {
    const px = info.hidden ? 0 : colPixels(info.width, sheet.defaultColWidth);
    if (px !== defaultCol) colSizes.set(Number(index), px);
  }
  const rowSizes = new Map<number, number>();
  const defaultRow = rowPixels(sheet.defaultRowHeight);
  for (const [index, info] of Object.entries(sheet.rows)) {
    const px = info.hidden ? 0 : info.height !== undefined ? rowPixels(info.height) : defaultRow;
    if (px !== defaultRow) rowSizes.set(Number(index), px);
  }
  const axes = { cols: new Axis(defaultCol, colSizes), rows: new Axis(defaultRow, rowSizes) } as SheetAxes & { rowsRef?: object };
  axes.rowsRef = rowsKey;
  axesCache.set(key, axes);
  return axes;
}

// ---- merges ----

export interface MergeInfo {
  range: RangeRef;
  key: string;
}

const mergeCache = new WeakMap<string[], MergeInfo[]>();

export function sheetMerges(sheet: Sheet): MergeInfo[] {
  let list = mergeCache.get(sheet.merges);
  if (!list) {
    list = sheet.merges.flatMap((text) => {
      const range = parseRange(text);
      return range && (range.r1 !== range.r2 || range.c1 !== range.c2) ? [{ range, key: cellKey(range.r1, range.c1) }] : [];
    });
    mergeCache.set(sheet.merges, list);
  }
  return list;
}

export function mergeAt(sheet: Sheet, row: number, col: number): MergeInfo | null {
  for (const merge of sheetMerges(sheet)) {
    const r = merge.range;
    if (row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2) return merge;
  }
  return null;
}

/** The selection grown so it contains whole merged cells it touches. */
export function expandToMerges(sheet: Sheet, range: RangeRef): RangeRef {
  let out = { ...range };
  let changed = true;
  while (changed) {
    changed = false;
    for (const { range: m } of sheetMerges(sheet)) {
      if (m.r1 <= out.r2 && m.r2 >= out.r1 && m.c1 <= out.c2 && m.c2 >= out.c1) {
        const next = { r1: Math.min(out.r1, m.r1), c1: Math.min(out.c1, m.c1), r2: Math.max(out.r2, m.r2), c2: Math.max(out.c2, m.c2) };
        if (next.r1 !== out.r1 || next.c1 !== out.c1 || next.r2 !== out.r2 || next.c2 !== out.c2) {
          out = next;
          changed = true;
        }
      }
    }
  }
  return out;
}

// ---- navigation ----

export interface Bounds {
  rows: number;
  cols: number;
}

/** Rows and columns that hold something (values, formulas or formatting). */
export function usedBounds(sheet: Sheet): Bounds {
  let rows = 0;
  let cols = 0;
  for (const key of Object.keys(sheet.cells)) {
    const match = /^([A-Z]+)(\d+)$/.exec(key);
    if (!match) continue;
    let col = 0;
    for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    const row = Number(match[2]);
    if (row > rows) rows = row;
    if (col > cols) cols = col;
  }
  return { rows, cols };
}

const filled = (sheet: Sheet, row: number, col: number): boolean => {
  const cell = sheet.cells[cellKey(row, col)];
  return cell !== undefined && (cell.v !== undefined || cell.f !== undefined || cell.e !== undefined);
};

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Where Ctrl+arrow lands: the edge of the current block of data, or the next block. */
export function ctrlArrow(sheet: Sheet, from: { row: number; col: number }, direction: Direction, bounds = usedBounds(sheet)): { row: number; col: number } {
  const dr = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  const dc = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const maxRow = direction === 'down' ? Math.max(bounds.rows - 1, from.row) : MAX_ROWS - 1;
  const maxCol = direction === 'right' ? Math.max(bounds.cols - 1, from.col) : MAX_COLS - 1;
  const inside = (r: number, c: number): boolean => r >= 0 && c >= 0 && r <= maxRow && c <= maxCol;
  let row = from.row;
  let col = from.col;
  const next = (): boolean => inside(row + dr, col + dc);
  if (!next()) {
    if (dr > 0) return { row: Math.min(MAX_ROWS - 1, Math.max(row, bounds.rows - 1)), col };
    if (dc > 0) return { row, col: Math.min(MAX_COLS - 1, Math.max(col, bounds.cols - 1)) };
    return { row: Math.max(0, row), col: Math.max(0, col) };
  }
  const startFilled = filled(sheet, row, col);
  const neighbourFilled = filled(sheet, row + dr, col + dc);
  if (startFilled && neighbourFilled) {
    // Walk to the last cell of the run.
    while (next() && filled(sheet, row + dr, col + dc)) {
      row += dr;
      col += dc;
    }
    return { row, col };
  }
  // Skip the gap to the next filled cell, or the sheet edge.
  row += dr;
  col += dc;
  while (!filled(sheet, row, col) && next()) {
    row += dr;
    col += dc;
  }
  if (!filled(sheet, row, col)) {
    if (dr < 0) return { row: 0, col };
    if (dc < 0) return { row, col: 0 };
    if (dr > 0) return { row: Math.min(MAX_ROWS - 1, Math.max(bounds.rows - 1, from.row)), col };
    return { row, col: Math.min(MAX_COLS - 1, Math.max(bounds.cols - 1, from.col)) };
  }
  return { row, col };
}

/** The block of data around a cell (Ctrl+A and Ctrl+Shift+*): contiguous filled cells in every direction. */
export function currentRegion(sheet: Sheet, at: { row: number; col: number }): RangeRef {
  let range: RangeRef = { r1: at.row, c1: at.col, r2: at.row, c2: at.col };
  if (!filled(sheet, at.row, at.col)) {
    // Excel still finds the region next to an empty cell; keep it simple and use the cell.
    const bounds = usedBounds(sheet);
    return bounds.rows === 0 ? range : { r1: 0, c1: 0, r2: bounds.rows - 1, c2: bounds.cols - 1 };
  }
  let grew = true;
  while (grew) {
    grew = false;
    const touches = (r: number, c: number): boolean => r >= 0 && c >= 0 && filled(sheet, r, c);
    for (let c = range.c1; c <= range.c2 && !grew; c += 1) if (touches(range.r1 - 1, c) || touches(range.r1 - 1, c - 1) || touches(range.r1 - 1, c + 1)) { range = { ...range, r1: range.r1 - 1 }; grew = true; }
    for (let c = range.c1; c <= range.c2 && !grew; c += 1) if (touches(range.r2 + 1, c) || touches(range.r2 + 1, c - 1) || touches(range.r2 + 1, c + 1)) { range = { ...range, r2: range.r2 + 1 }; grew = true; }
    for (let r = range.r1; r <= range.r2 && !grew; r += 1) if (touches(r, range.c1 - 1) || touches(r - 1, range.c1 - 1) || touches(r + 1, range.c1 - 1)) { range = { ...range, c1: range.c1 - 1 }; grew = true; }
    for (let r = range.r1; r <= range.r2 && !grew; r += 1) if (touches(r, range.c2 + 1) || touches(r - 1, range.c2 + 1) || touches(r + 1, range.c2 + 1)) { range = { ...range, c2: range.c2 + 1 }; grew = true; }
  }
  return range;
}

/** Moves a cell within a selection for Tab / Enter (wrapping inside it), or by one step when it is a single cell. */
export function stepWithin(selection: RangeRef, at: { row: number; col: number }, direction: 'next' | 'previous', axis: 'row' | 'col'): { row: number; col: number } {
  const single = selection.r1 === selection.r2 && selection.c1 === selection.c2;
  const delta = direction === 'next' ? 1 : -1;
  if (single) return axis === 'col' ? { row: at.row, col: Math.max(0, at.col + delta) } : { row: Math.max(0, at.row + delta), col: at.col };
  let { row, col } = at;
  if (axis === 'col') {
    col += delta;
    if (col > selection.c2) { col = selection.c1; row += 1; }
    if (col < selection.c1) { col = selection.c2; row -= 1; }
    if (row > selection.r2) row = selection.r1;
    if (row < selection.r1) row = selection.r2;
  } else {
    row += delta;
    if (row > selection.r2) { row = selection.r1; col += 1; }
    if (row < selection.r1) { row = selection.r2; col -= 1; }
    if (col > selection.c2) col = selection.c1;
    if (col < selection.c1) col = selection.c2;
  }
  return { row, col };
}
