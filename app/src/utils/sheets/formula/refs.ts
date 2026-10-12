// Rewriting the references inside formula text: row/column inserts and deletes,
// copy/paste offsets, moved ranges and sheet renames. Works on token spans so
// everything else in the formula (spacing, case, strings) is left as typed.

import { colName, quoteSheet, shiftIndex, type Shift } from '../address';
import { MAX_COLS, MAX_ROWS } from '../types';
import { parseRefBody, tokenize, type RefParts, type Tok } from './tokenize';

/** Text of a reference body (`$A$1:B2`, `C:E`, `3:5`) from coordinates and `$` flags. */
export function refBodyText(parts: RefParts): string {
  const col = (index: number, abs: boolean): string => `${abs ? '$' : ''}${colName(index)}`;
  const row = (index: number, abs: boolean): string => `${abs ? '$' : ''}${index + 1}`;
  switch (parts.kind) {
    case 'cell':
      return `${col(parts.c1, parts.absC1)}${row(parts.r1, parts.absR1)}`;
    case 'cols':
      return `${col(parts.c1, parts.absC1)}:${col(parts.c2, parts.absC2)}`;
    case 'rows':
      return `${row(parts.r1, parts.absR1)}:${row(parts.r2, parts.absR2)}`;
    default:
      return `${col(parts.c1, parts.absC1)}${row(parts.r1, parts.absR1)}:${col(parts.c2, parts.absC2)}${row(parts.r2, parts.absR2)}`;
  }
}

/**
 * Rewrites every sheet reference. `map` receives the coordinates and the sheet the
 * reference points at (the formula's own sheet when none is written) and returns
 * new coordinates, or null when the target no longer exists (`#REF!`).
 */
export function rewriteRefs(
  formula: string,
  ownerSheet: string,
  map: (parts: RefParts, sheet: string) => RefParts | null,
  renameSheet?: (name: string) => string,
): string {
  let toks: Tok[];
  try {
    toks = tokenize(formula);
  } catch {
    return formula;
  }
  let out = '';
  let cursor = 0;
  for (const tok of toks) {
    if (tok.k !== 'ref') continue;
    const parts = parseRefBody(tok.body);
    if (!parts) continue;
    const sheet = tok.sheet ?? ownerSheet;
    const mapped = map(parts, sheet);
    const prefix = tok.sheet === undefined ? '' : `${quoteSheet(renameSheet ? renameSheet(tok.sheet) : tok.sheet)}!`;
    out += formula.slice(cursor, tok.start);
    out += mapped === null ? '#REF!' : `${prefix}${refBodyText(mapped)}`;
    cursor = tok.end;
  }
  if (cursor === 0 && out === '') return formula;
  return out + formula.slice(cursor);
}

/** A reference after rows or columns were inserted (count > 0) or deleted (count < 0). */
export function shiftParts(parts: RefParts, shift: Shift): RefParts | null {
  const axisRow = shift.axis === 'row';
  // Whole-column references do not move when rows move, and the other way round.
  if (axisRow && parts.kind === 'cols') return parts;
  if (!axisRow && parts.kind === 'rows') return parts;
  const lo = axisRow ? parts.r1 : parts.c1;
  const hi = axisRow ? parts.r2 : parts.c2;
  let nextLo: number | null;
  let nextHi: number | null;
  if (shift.count > 0) {
    nextLo = shiftIndex(lo, shift);
    nextHi = shiftIndex(hi, shift);
  } else {
    const removed = -shift.count;
    const end = shift.at + removed - 1;
    if (lo >= shift.at && hi <= end) return null;
    nextLo = lo < shift.at ? lo : lo > end ? lo - removed : shift.at;
    nextHi = hi < shift.at ? hi : hi > end ? hi - removed : shift.at - 1;
    if (nextHi < nextLo) return null;
  }
  if (nextLo === null || nextHi === null) return null;
  const limit = axisRow ? MAX_ROWS : MAX_COLS;
  if (nextHi >= limit) nextHi = limit - 1;
  return axisRow ? { ...parts, r1: nextLo, r2: nextHi } : { ...parts, c1: nextLo, c2: nextHi };
}

/** A reference moved by a copy: relative parts shift by the offset, `$` parts stay. */
export function offsetParts(parts: RefParts, dRow: number, dCol: number): RefParts | null {
  const r1 = parts.absR1 || parts.kind === 'cols' ? parts.r1 : parts.r1 + dRow;
  const r2 = parts.absR2 || parts.kind === 'cols' ? parts.r2 : parts.r2 + dRow;
  const c1 = parts.absC1 || parts.kind === 'rows' ? parts.c1 : parts.c1 + dCol;
  const c2 = parts.absC2 || parts.kind === 'rows' ? parts.c2 : parts.c2 + dCol;
  if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0 || r1 >= MAX_ROWS || r2 >= MAX_ROWS || c1 >= MAX_COLS || c2 >= MAX_COLS) return null;
  return { ...parts, r1, r2, c1, c2 };
}

/** The formula as it reads after being copied `dRow` rows and `dCol` columns away. */
export function copyFormula(formula: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) return formula;
  return rewriteRefs(formula, '', (parts) => offsetParts(parts, dRow, dCol));
}

/** Every reference a formula contains (for dependency hints and reference colouring). */
export function listRefs(formula: string): Array<{ sheet?: string; parts: RefParts; start: number; end: number }> {
  try {
    return tokenize(formula).flatMap((tok) => {
      if (tok.k !== 'ref') return [];
      const parts = parseRefBody(tok.body);
      return parts ? [{ sheet: tok.sheet, parts, start: tok.start, end: tok.end }] : [];
    });
  } catch {
    return [];
  }
}
