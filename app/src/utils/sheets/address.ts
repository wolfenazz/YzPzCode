// A1 addresses, ranges and reference rewriting. Dependency-free.

import { MAX_COLS, MAX_ROWS } from './types';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const colNameCache: string[] = [];

/** 0 → `A`, 25 → `Z`, 26 → `AA`. */
export function colName(index: number): string {
  if (index < 0) return '';
  let cached = colNameCache[index];
  if (cached === undefined) {
    let n = index;
    let out = '';
    do {
      out = LETTERS[n % 26] + out;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    cached = out;
    if (index < 20000) colNameCache[index] = cached;
  }
  return cached;
}

/** `A` → 0, `AA` → 26. Returns -1 for anything that is not column letters. */
export function colIndex(name: string): number {
  if (!/^[A-Za-z]{1,3}$/.test(name)) return -1;
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1 < MAX_COLS ? n - 1 : -1;
}

export interface CellPos {
  row: number;
  col: number;
}

/** Zero-based row and column to `B3`. */
export const cellKey = (row: number, col: number): string => `${colName(col)}${row + 1}`;

const CELL_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

/** `B3` (optionally with `$`) to a position, or null. */
export function parseCell(text: string): CellPos | null {
  const match = CELL_RE.exec(text.trim());
  if (!match) return null;
  const col = colIndex(match[1]);
  const row = Number(match[2]) - 1;
  if (col < 0 || row < 0 || row >= MAX_ROWS) return null;
  return { row, col };
}

export interface RangeRef {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export const normRange = (range: RangeRef): RangeRef => ({
  r1: Math.min(range.r1, range.r2),
  c1: Math.min(range.c1, range.c2),
  r2: Math.max(range.r1, range.r2),
  c2: Math.max(range.c1, range.c2),
});

/** `A1`, `A1:C5`, `A:C`, `2:4` (with or without `$`). Whole columns and rows span the full sheet. */
export function parseRange(text: string): RangeRef | null {
  const clean = text.trim().replace(/\$/g, '');
  const parts = clean.split(':');
  if (parts.length === 1) {
    const pos = parseCell(parts[0]);
    return pos ? { r1: pos.row, c1: pos.col, r2: pos.row, c2: pos.col } : null;
  }
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  const first = parseCell(a);
  const second = parseCell(b);
  if (first && second) return normRange({ r1: first.row, c1: first.col, r2: second.row, c2: second.col });
  if (/^[A-Za-z]{1,3}$/.test(a) && /^[A-Za-z]{1,3}$/.test(b)) {
    const c1 = colIndex(a);
    const c2 = colIndex(b);
    return c1 < 0 || c2 < 0 ? null : normRange({ r1: 0, c1, r2: MAX_ROWS - 1, c2 });
  }
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const r1 = Number(a) - 1;
    const r2 = Number(b) - 1;
    return r1 < 0 || r2 < 0 || r1 >= MAX_ROWS || r2 >= MAX_ROWS ? null : normRange({ r1, c1: 0, r2, c2: MAX_COLS - 1 });
  }
  return null;
}

export function rangeText(range: RangeRef): string {
  const { r1, c1, r2, c2 } = normRange(range);
  if (r1 === r2 && c1 === c2) return cellKey(r1, c1);
  if (r1 === 0 && r2 === MAX_ROWS - 1) return `${colName(c1)}:${colName(c2)}`;
  if (c1 === 0 && c2 === MAX_COLS - 1) return `${r1 + 1}:${r2 + 1}`;
  return `${cellKey(r1, c1)}:${cellKey(r2, c2)}`;
}

export const rangeContains = (range: RangeRef, row: number, col: number): boolean =>
  row >= range.r1 && row <= range.r2 && col >= range.c1 && col <= range.c2;

export const rangeSize = (range: RangeRef): { rows: number; cols: number } => ({ rows: range.r2 - range.r1 + 1, cols: range.c2 - range.c1 + 1 });

export const rangesIntersect = (a: RangeRef, b: RangeRef): boolean =>
  a.r1 <= b.r2 && a.r2 >= b.r1 && a.c1 <= b.c2 && a.c2 >= b.c1;

/** Quote a sheet name for use in a reference when it needs it. */
export function quoteSheet(name: string): string {
  return /^[A-Za-z_À-￿][\w.À-￿]*$/.test(name) && !CELL_RE.test(name) && !/^R\d*C\d*$/i.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

export interface SheetRef {
  sheet?: string;
  range: RangeRef;
}

/** `Sheet1!A1:B2`, `'My Sheet'!$A$1` or plain `A1:B2`. */
export function parseSheetRef(text: string): SheetRef | null {
  const trimmed = text.trim();
  const bang = trimmed.lastIndexOf('!');
  let sheet: string | undefined;
  let rest = trimmed;
  if (bang >= 0) {
    let name = trimmed.slice(0, bang);
    if (name.startsWith("'") && name.endsWith("'")) name = name.slice(1, -1).replace(/''/g, "'");
    sheet = name;
    rest = trimmed.slice(bang + 1);
  }
  const range = parseRange(rest);
  return range ? { sheet, range } : null;
}

// ---- Reference rewriting (insert / delete rows and columns) ----

export type Shift =
  | { axis: 'row'; at: number; count: number }
  | { axis: 'col'; at: number; count: number };

/** Moves one index for an insert (`count` > 0) or delete (`count` < 0); null when the cell is deleted. */
export function shiftIndex(index: number, shift: Shift): number | null {
  const { at, count } = shift;
  if (count > 0) return index >= at ? index + count : index;
  const removed = -count;
  if (index < at) return index;
  if (index >= at + removed) return index - removed;
  return null;
}

/** Shifts a range for an insert or delete; null when the whole range is deleted. */
export function shiftRange(range: RangeRef, shift: Shift): RangeRef | null {
  const lo = shift.axis === 'row' ? range.r1 : range.c1;
  const hi = shift.axis === 'row' ? range.r2 : range.c2;
  let nextLo: number;
  let nextHi: number;
  if (shift.count > 0) {
    nextLo = lo >= shift.at ? lo + shift.count : lo;
    nextHi = hi >= shift.at ? hi + shift.count : hi;
  } else {
    const removed = -shift.count;
    const end = shift.at + removed - 1;
    if (lo >= shift.at && hi <= end) return null;
    nextLo = lo < shift.at ? lo : lo > end ? lo - removed : shift.at;
    nextHi = hi < shift.at ? hi : hi > end ? hi - removed : shift.at - 1;
    if (nextHi < nextLo) return null;
  }
  return shift.axis === 'row' ? { ...range, r1: nextLo, r2: nextHi } : { ...range, c1: nextLo, c2: nextHi };
}
