// Applies edit operations to a workbook. One operation set serves the grid, the
// ribbon and the AI, so a proposal from the assistant is the same data as a
// click. Dependency-free (tested by `npm run test:sheets`).

import {
  cellKey, colIndex, colName, normRange, parseCell, parseRange, parseSheetRef, quoteSheet, rangeText, shiftRange, type RangeRef, type Shift,
} from './address';
import { chartFromSpec } from './charts';
import { generalFit, isDateFormat, parseInput } from './numberFormat';
import { fillSeries, type FillCell } from './fillSeries';
import { copyFormula, rewriteRefs, shiftParts } from './formula/refs';
import { tryParseFormula } from './formula/parse';
import { recalculate } from './formula/recalc';
import type { Op, StylePatch, CellInput, ConditionalRule } from './opTypes';
import { computePivot, type PivotCell } from './pivot';
import {
  emptySheet, MAX_COLS, MAX_ROWS,
  type BorderEdge, type Cell, type CellStyle, type ChartDef, type CondFormat, type Dxf, type Sheet, type Workbook,
} from './types';
import { compareScalars } from './formula/values';

export interface ChangeSet {
  /** Changed cell addresses by sheet id. */
  cells: Record<string, string[]>;
  /** Sheets that were added. */
  sheets: string[];
  /** Charts that were added. */
  charts: string[];
  /** Rows or columns moved, sheets removed or renamed: everything may have shifted. */
  structural: boolean;
}

export interface ApplyResult {
  wb: Workbook;
  /** Operations that put the workbook back as it was. */
  inverse: Op[];
  changed: ChangeSet;
  warnings: string[];
}

const clampStyleSize = (value: number): number => Math.min(409, Math.max(1, value));

/** Deep-merges a style patch into a style; `null` removes a property. */
export function mergeStyle(base: CellStyle, patch: StylePatch): CellStyle {
  const out: CellStyle = { ...base };
  if (patch.font === null) delete out.font;
  else if (patch.font) {
    const font = { ...(out.font ?? {}) } as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch.font)) {
      if (value === null) delete font[key];
      else if (value !== undefined) font[key] = key === 'size' ? clampStyleSize(value as number) : value;
    }
    // Defaults are not stored.
    for (const flag of ['bold', 'italic', 'underline', 'strike']) if (font[flag] === false) delete font[flag];
    if (Object.keys(font).length) out.font = font as CellStyle['font'];
    else delete out.font;
  }
  if (patch.fill === null) delete out.fill;
  else if (typeof patch.fill === 'string') out.fill = patch.fill;
  if (patch.numFmt === null) delete out.numFmt;
  else if (typeof patch.numFmt === 'string') out.numFmt = patch.numFmt === 'General' ? undefined : patch.numFmt;
  if (out.numFmt === undefined) delete out.numFmt;
  if (patch.border === null) delete out.border;
  else if (patch.border) {
    const border = { ...(out.border ?? {}) } as Record<string, BorderEdge | undefined>;
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      const value = patch.border[edge];
      if (value === null) delete border[edge];
      else if (value) border[edge] = value;
    }
    if (Object.keys(border).length) out.border = border;
    else delete out.border;
  }
  if (patch.align === null) delete out.align;
  else if (patch.align) {
    const align = { ...(out.align ?? {}) } as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch.align)) {
      if (value === null) delete align[key];
      else if (value !== undefined) align[key] = value;
    }
    if (align.wrap === false) delete align.wrap;
    if (align.h === 'general') delete align.h;
    if (Object.keys(align).length) out.align = align as CellStyle['align'];
    else delete out.align;
  }
  if (typeof patch.locked === 'boolean') {
    if (patch.locked) delete out.locked;
    else out.locked = false;
  } else if (patch.locked === null) delete out.locked;
  return out;
}

const styleKey = (style: CellStyle): string => JSON.stringify(style);

/** True when two cells show the same value (a pure style change leaves values alone). */
function sameValue(old: Cell | undefined, next: Cell | null): boolean {
  return (old?.v ?? undefined) === (next?.v ?? undefined)
    && (old?.f ?? undefined) === (next?.f ?? undefined)
    && (old?.e ?? undefined) === (next?.e ?? undefined)
    && (old?.sp ?? undefined) === (next?.sp ?? undefined)
    && (old?.spill?.rows ?? 0) === (next?.spill?.rows ?? 0)
    && (old?.spill?.cols ?? 0) === (next?.spill?.cols ?? 0);
}

class Editor {
  sheets: Sheet[];
  styles: CellStyle[];
  dxfs: Dxf[];
  names: Workbook['names'];
  activeSheet: number;
  private readonly cloned = new Set<string>();
  private readonly styleIndex = new Map<string, number>();
  private readonly dxfIndex = new Map<string, number>();
  readonly changed: ChangeSet = { cells: {}, sheets: [], charts: [], structural: false };
  readonly warnings: string[] = [];
  /** Whether the workbook needs a recalculation afterwards. */
  dirty = false;
  /** Whether values or formulas changed (style-only edits leave this false so recalc is skipped). */
  valuesDirty = false;

  constructor(readonly original: Workbook) {
    this.sheets = original.sheets.slice();
    this.styles = original.styles.slice();
    this.dxfs = original.dxfs.slice();
    this.names = original.names.slice();
    this.activeSheet = original.activeSheet;
    this.styles.forEach((style, index) => {
      const key = styleKey(style);
      if (!this.styleIndex.has(key)) this.styleIndex.set(key, index);
    });
    this.dxfs.forEach((dxf, index) => {
      const key = JSON.stringify(dxf);
      if (!this.dxfIndex.has(key)) this.dxfIndex.set(key, index);
    });
    if (this.styles.length === 0) this.styles.push({});
  }

  /** Recalculates the working copy so a later operation (auto-fit) sees computed values. */
  refresh(): void {
    if (!this.valuesDirty) return;
    const next = recalculate(this.workbook());
    next.sheets.forEach((sheet, index) => {
      if (sheet !== this.sheets[index]) {
        this.sheets[index] = sheet;
        this.cloned.add(sheet.id);
      }
    });
  }

  workbook(): Workbook {
    return { ...this.original, sheets: this.sheets, styles: this.styles, dxfs: this.dxfs, names: this.names, activeSheet: Math.min(this.activeSheet, this.sheets.length - 1) };
  }

  // ---- sheet access ----

  findSheet(name: string | undefined): number {
    if (name === undefined) return Math.min(this.activeSheet, this.sheets.length - 1);
    const lower = name.toLowerCase();
    return this.sheets.findIndex((sheet) => sheet.name.toLowerCase() === lower);
  }

  /** The sheet to change: copied on first touch so the original workbook is never modified. */
  touch(index: number): Sheet {
    const sheet = this.sheets[index];
    if (!this.cloned.has(sheet.id)) {
      const copy: Sheet = {
        ...sheet,
        cells: { ...sheet.cells },
        cols: { ...sheet.cols },
        rows: { ...sheet.rows },
        merges: sheet.merges.slice(),
        tables: sheet.tables.slice(),
        cf: sheet.cf.slice(),
        validations: sheet.validations.slice(),
        charts: sheet.charts.slice(),
        notes: { ...sheet.notes },
        links: { ...sheet.links },
      };
      this.sheets[index] = copy;
      this.cloned.add(sheet.id);
      return copy;
    }
    return sheet;
  }

  mark(sheet: Sheet, key: string): void {
    (this.changed.cells[sheet.id] ??= []).push(key);
  }

  warn(message: string): void {
    this.warnings.push(message);
  }

  // ---- styles ----

  internStyle(style: CellStyle): number {
    const key = styleKey(style);
    const found = this.styleIndex.get(key);
    if (found !== undefined) return found;
    this.styles.push(style);
    this.styleIndex.set(key, this.styles.length - 1);
    return this.styles.length - 1;
  }

  internDxf(dxf: Dxf): number {
    const key = JSON.stringify(dxf);
    const found = this.dxfIndex.get(key);
    if (found !== undefined) return found;
    this.dxfs.push(dxf);
    this.dxfIndex.set(key, this.dxfs.length - 1);
    return this.dxfs.length - 1;
  }

  styleOf(cell: Cell | undefined): CellStyle {
    return this.styles[cell?.s ?? 0] ?? {};
  }

  /** Writes a cell, dropping it when nothing is left. */
  put(sheet: Sheet, key: string, cell: Cell | null): void {
    const old = sheet.cells[key];
    if (cell === null || (cell.v === undefined && cell.f === undefined && cell.e === undefined && !cell.s && cell.sp === undefined)) delete sheet.cells[key];
    else sheet.cells[key] = cell;
    this.mark(sheet, key);
    this.dirty = true;
    if (!sameValue(old, cell)) this.valuesDirty = true;
  }

  restyle(sheet: Sheet, key: string, patch: StylePatch, memo: Map<number, number>): void {
    const cell = sheet.cells[key];
    const oldIndex = cell?.s ?? 0;
    let next = memo.get(oldIndex);
    if (next === undefined) {
      next = this.internStyle(mergeStyle(this.styles[oldIndex] ?? {}, patch));
      memo.set(oldIndex, next);
    }
    if (next === oldIndex) return;
    const updated: Cell = { ...(cell ?? {}) };
    if (next) updated.s = next;
    else delete updated.s;
    this.put(sheet, key, updated);
  }
}

// ---- helpers ----

const resolveRange = (text: string): RangeRef | null => parseRange(text.includes('!') ? text.slice(text.lastIndexOf('!') + 1) : text);

const colFromSpec = (spec: string | number, base: RangeRef | null = null): number => {
  if (typeof spec === 'number') return base ? base.c1 + spec - 1 : spec - 1;
  return colIndex(spec);
};

function* cellsIn(range: RangeRef, limit = MAX_ROWS * 4): Generator<{ row: number; col: number; key: string }> {
  let n = 0;
  for (let row = range.r1; row <= range.r2; row += 1) {
    for (let col = range.c1; col <= range.c2; col += 1) {
      if (n++ >= limit) return;
      yield { row, col, key: cellKey(row, col) };
    }
  }
}

/** Existing cell keys inside a range, cheaper than walking a huge empty range. */
function existingIn(sheet: Sheet, range: RangeRef): Array<{ row: number; col: number; key: string }> {
  const area = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
  const out: Array<{ row: number; col: number; key: string }> = [];
  if (area <= Object.keys(sheet.cells).length * 2) {
    for (const entry of cellsIn(range)) if (sheet.cells[entry.key]) out.push(entry);
    return out;
  }
  for (const key of Object.keys(sheet.cells)) {
    const pos = parseCell(key);
    if (pos && pos.row >= range.r1 && pos.row <= range.r2 && pos.col >= range.c1 && pos.col <= range.c2) out.push({ row: pos.row, col: pos.col, key });
  }
  return out;
}

/** Limits a whole-column or whole-row range to what the sheet uses (plus nothing), so style ops stay finite. */
function usedClamp(sheet: Sheet, range: RangeRef): RangeRef {
  if (range.r2 < MAX_ROWS - 1 && range.c2 < MAX_COLS - 1) return range;
  let maxRow = 0;
  let maxCol = 0;
  for (const key of Object.keys(sheet.cells)) {
    const pos = parseCell(key);
    if (pos) {
      if (pos.row > maxRow) maxRow = pos.row;
      if (pos.col > maxCol) maxCol = pos.col;
    }
  }
  return { ...range, r2: Math.min(range.r2, Math.max(range.r1, maxRow)), c2: Math.min(range.c2, Math.max(range.c1, maxCol)) };
}

function rangeCount(range: RangeRef): number {
  return (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
}

const MAX_STYLE_CELLS = 200000;

/** All range texts of a `sqref` (space separated). */
const sqrefRanges = (sqref: string): RangeRef[] => sqref.split(/\s+/).map(resolveRange).filter((r): r is RangeRef => r !== null);

function shiftRangeText(text: string, shift: Shift): string | null {
  const parts = sqrefRanges(text).map((range) => shiftRange(range, shift)).filter((r): r is RangeRef => r !== null);
  return parts.length ? parts.map(rangeText).join(' ') : null;
}

// ---- operations ----

function sheetOrWarn(ed: Editor, name: string | undefined, what: string): number {
  const index = ed.findSheet(name);
  if (index < 0) ed.warn(`${what}: sheet "${name}" does not exist.`);
  return index;
}

function applySetValues(ed: Editor, op: Extract<Op, { op: 'setValues' }>): void {
  const index = sheetOrWarn(ed, op.sheet, 'setValues');
  if (index < 0) return;
  const origin = parseCell(op.at);
  if (!origin) return ed.warn(`setValues: "${op.at}" is not a cell.`);
  const sheet = ed.touch(index);
  op.values.forEach((line, r) => {
    line.forEach((input, c) => {
      const row = origin.row + r;
      const col = origin.col + c;
      if (row >= MAX_ROWS || col >= MAX_COLS) return;
      writeInput(ed, sheet, cellKey(row, col), input, op.parse !== false);
    });
  });
}

/** Writes one typed input (value, text or formula) keeping the cell's style. */
function writeInput(ed: Editor, sheet: Sheet, key: string, input: CellInput, parse: boolean): void {
  const old = sheet.cells[key];
  const style = old?.s;
  const base: Cell = style ? { s: style } : {};
  if (input === null || input === '') {
    ed.put(sheet, key, base.s ? base : null);
    return;
  }
  if (typeof input === 'number') return ed.put(sheet, key, { ...base, v: input });
  if (typeof input === 'boolean') return ed.put(sheet, key, { ...base, v: input });
  const currentFormat = ed.styleOf(old).numFmt;
  const typed = parse ? parseInput(input, currentFormat) : input.startsWith('=') && input.length > 1 ? { kind: 'formula' as const, formula: input.slice(1) } : { kind: 'text' as const, value: input };
  switch (typed.kind) {
    case 'formula':
      // A leading `=` that is not a valid formula (CSV text such as `=hello`)
      // stays text instead of becoming a broken formula cell.
      if (typed.formula !== undefined && tryParseFormula(typed.formula).ok) ed.put(sheet, key, { ...base, f: typed.formula });
      else ed.put(sheet, key, { ...base, v: input });
      break;
    case 'number':
    case 'bool':
    case 'text': {
      const cell: Cell = { ...base, v: typed.value as number };
      // A typed percentage, date or currency formats a General cell the way Excel does.
      if (typed.kind === 'number' && typed.numFmt && (!currentFormat || currentFormat === 'General')) {
        cell.s = ed.internStyle(mergeStyle(ed.styles[old?.s ?? 0] ?? {}, { numFmt: typed.numFmt }));
      }
      ed.put(sheet, key, cell);
      break;
    }
    default:
      ed.put(sheet, key, base.s ? base : null);
  }
}

/** Splits one column of text into adjacent columns on a delimiter, like Excel's Text to Columns. */
function applyTextToColumns(ed: Editor, op: Extract<Op, { op: 'textToColumns' }>): void {
  const index = sheetOrWarn(ed, op.sheet, 'textToColumns');
  const range = resolveRange(op.range);
  if (index < 0 || !range) return;
  const norm = normRange(range);
  if (norm.c1 !== norm.c2) ed.warn('textToColumns: only the first column of the range is split.');
  const target = op.target ? parseCell(op.target) : { row: norm.r1, col: norm.c1 };
  if (!target) return ed.warn('textToColumns: the target is not a cell.');
  const sheet = ed.touch(index);
  const clamped = usedClamp(sheet, { ...norm, c2: norm.c1 });
  const delim = op.delimiter === '\\t' ? '\t' : op.delimiter;
  let truncated = false;
  for (let r = clamped.r1; r <= clamped.r2; r += 1) {
    const source = sheet.cells[cellKey(r, norm.c1)];
    if (source?.e !== undefined || source?.f !== undefined) continue;
    if (source?.v === undefined) continue;
    const pieces = String(source.v).split(delim).map((part) => part.trim());
    if (pieces.length <= 1 && pieces[0] === String(source.v)) {
      // No delimiter found: leave the cell as it is when splitting in place.
      if (target.row + (r - clamped.r1) !== r || target.col !== norm.c1) {
        writeInput(ed, sheet, cellKey(target.row + (r - clamped.r1), target.col), pieces[0], true);
      }
      continue;
    }
    const originRow = target.row + (r - clamped.r1);
    if (originRow >= MAX_ROWS) continue;
    pieces.forEach((piece, i) => {
      const col = target.col + i;
      if (col >= MAX_COLS) {
        truncated = true;
        return;
      }
      if (i > 100) {
        truncated = true;
        return;
      }
      const key = cellKey(originRow, col);
      const sourceStyle = source.s;
      writeInput(ed, sheet, key, piece === '' ? null : piece, true);
      // New columns inherit the source column's look.
      if (sourceStyle !== undefined && sheet.cells[key]?.s === undefined) {
        const cell = sheet.cells[key];
        if (cell) cell.s = sourceStyle;
        else sheet.cells[key] = { s: sourceStyle };
      }
    });
  }
  if (truncated) ed.warn('textToColumns: some rows were wider than the sheet allows and were cut off.');
}

function applyClear(ed: Editor, op: Extract<Op, { op: 'clear' }>): void {
  const index = sheetOrWarn(ed, op.sheet, 'clear');
  const range = resolveRange(op.range);
  if (index < 0 || !range) return;
  const sheet = ed.touch(index);
  const what = op.what ?? 'all';
  for (const { key } of existingIn(sheet, usedClamp(sheet, range))) {
    const cell = sheet.cells[key];
    if (what === 'all') ed.put(sheet, key, null);
    else if (what === 'contents') ed.put(sheet, key, cell.s ? { s: cell.s } : null);
    else {
      const { s: _s, ...rest } = cell;
      void _s;
      ed.put(sheet, key, Object.keys(rest).length ? rest : null);
    }
  }
  if (what === 'all') {
    sheet.merges = sheet.merges.filter((m) => {
      const r = resolveRange(m);
      return !r || r.r1 < range.r1 || r.r2 > range.r2 || r.c1 < range.c1 || r.c2 > range.c2;
    });
    for (const key of Object.keys(sheet.notes)) {
      const pos = parseCell(key);
      if (pos && pos.row >= range.r1 && pos.row <= range.r2 && pos.col >= range.c1 && pos.col <= range.c2) delete sheet.notes[key];
    }
  }
}

function applyFormat(ed: Editor, sheetIndex: number, range: RangeRef, patch: StylePatch): void {
  const sheet = ed.touch(sheetIndex);
  const clamped = usedClamp(sheet, range);
  if (rangeCount(clamped) > MAX_STYLE_CELLS) return ed.warn('That range is too large to format in one step.');
  const memo = new Map<number, number>();
  for (const { key } of cellsIn(clamped)) ed.restyle(sheet, key, patch, memo);
  // A whole column or row also styles what is typed there later.
  if (range.r1 === 0 && range.r2 >= MAX_ROWS - 1) {
    for (let c = range.c1; c <= range.c2; c += 1) {
      const info = sheet.cols[c] ?? {};
      const next = ed.internStyle(mergeStyle(ed.styles[info.style ?? 0] ?? {}, patch));
      sheet.cols[c] = { ...info, style: next || undefined };
    }
  }
}

function applyBorders(ed: Editor, op: Extract<Op, { op: 'borders' }>, sheetIndex: number, range: RangeRef): void {
  const sheet = ed.touch(sheetIndex);
  const clamped = usedClamp(sheet, range);
  if (rangeCount(clamped) > MAX_STYLE_CELLS) return ed.warn('That range is too large to format in one step.');
  const edge: BorderEdge = { style: op.style ?? 'thin', color: op.color };
  const memos = new Map<string, Map<number, number>>();
  const patchFor = (patch: StylePatch): Map<number, number> => {
    const k = JSON.stringify(patch);
    let m = memos.get(k);
    if (!m) memos.set(k, (m = new Map()));
    return m;
  };
  for (const { row, col, key } of cellsIn(clamped)) {
    const top = row === clamped.r1;
    const bottom = row === clamped.r2;
    const left = col === clamped.c1;
    const right = col === clamped.c2;
    const border: NonNullable<StylePatch['border']> = {};
    const set = (side: 'left' | 'right' | 'top' | 'bottom', on: boolean): void => {
      if (on) border[side] = op.preset === 'none' ? null : edge;
    };
    switch (op.preset) {
      case 'all': set('left', true); set('right', true); set('top', true); set('bottom', true); break;
      case 'outside': set('left', left); set('right', right); set('top', top); set('bottom', bottom); break;
      case 'inside': set('left', !left); set('right', !right); set('top', !top); set('bottom', !bottom); break;
      case 'top': set('top', top); break;
      case 'bottom': set('bottom', bottom); break;
      case 'left': set('left', left); break;
      case 'right': set('right', right); break;
      default: border.left = null; border.right = null; border.top = null; border.bottom = null;
    }
    if (Object.keys(border).length === 0) continue;
    const patch: StylePatch = { border };
    ed.restyle(sheet, key, patch, patchFor(patch));
  }
}

function adjustFormulas(ed: Editor, rewrite: (formula: string, ownerSheet: string) => string): void {
  ed.sheets.forEach((_, index) => {
    const original = ed.sheets[index];
    let touched: Sheet | null = null;
    for (const [key, cell] of Object.entries(original.cells)) {
      if (cell.f === undefined) continue;
      const next = rewrite(cell.f, original.name);
      if (next !== cell.f) {
        touched ??= ed.touch(index);
        touched.cells[key] = { ...cell, f: next };
        ed.mark(touched, key);
      }
    }
  });
  ed.names = ed.names.map((entry) => ({ ...entry, ref: rewrite(entry.ref, entry.scope !== undefined ? ed.sheets[entry.scope]?.name ?? '' : '') }));
  ed.dirty = true;
  // Rewritten references change what formulas compute.
  ed.valuesDirty = true;
}

function rewriteChartRefs(ed: Editor, rewrite: (ref: string, ownerSheet: string) => string): void {
  ed.sheets.forEach((sheet, index) => {
    if (sheet.charts.length === 0) return;
    const touched = ed.touch(index);
    touched.charts = touched.charts.map((chart): ChartDef => ({
      ...chart,
      series: chart.series.map((entry) => ({
        ...entry,
        vals: rewrite(entry.vals, sheet.name),
        cats: entry.cats ? rewrite(entry.cats, sheet.name) : undefined,
        nameRef: entry.nameRef ? rewrite(entry.nameRef, sheet.name) : undefined,
      })),
    }));
  });
}

/** Insert (count > 0) or delete (count < 0) rows or columns on one sheet, fixing everything that points there. */
function applyShift(ed: Editor, sheetIndex: number, shift: Shift): void {
  const sheet = ed.touch(sheetIndex);
  const sheetName = sheet.name.toLowerCase();
  const shiftRef = (parts: Parameters<typeof shiftParts>[0], target: string): ReturnType<typeof shiftParts> =>
    (target.toLowerCase() === sheetName ? shiftParts(parts, shift) : parts);

  adjustFormulas(ed, (formula, owner) => rewriteRefs(formula, owner, (parts, target) => shiftRef(parts, target)));
  rewriteChartRefs(ed, (ref, owner) => rewriteRefs(ref, owner, (parts, target) => shiftRef(parts, target)));

  const axisRow = shift.axis === 'row';
  const shiftKey = (key: string): string | null => {
    const pos = parseCell(key);
    if (!pos) return null;
    const next = axisRow ? shiftRangeIndex(pos.row, shift) : shiftRangeIndex(pos.col, shift);
    if (next === null) return null;
    return axisRow ? cellKey(next, pos.col) : cellKey(pos.row, next);
  };

  // Spilled children and spill sizes are regenerated by the recalculation.
  const moved: Record<string, Cell> = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (cell.sp !== undefined) continue;
    const next = shiftKey(key);
    if (!next) continue;
    if (cell.spill) {
      const { spill: _spill, ...rest } = cell;
      void _spill;
      moved[next] = rest;
    } else moved[next] = cell;
  }
  sheet.cells = moved;

  const remap = <T,>(source: Record<number, T>): Record<number, T> => {
    const out: Record<number, T> = {};
    for (const [k, value] of Object.entries(source)) {
      const next = shiftRangeIndex(Number(k), shift);
      if (next !== null) out[next] = value;
    }
    return out;
  };
  if (axisRow) sheet.rows = remap(sheet.rows);
  else sheet.cols = remap(sheet.cols);

  const remapKeyed = <T,>(source: Record<string, T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const [key, value] of Object.entries(source)) {
      const next = shiftKey(key);
      if (next) out[next] = value;
    }
    return out;
  };
  sheet.notes = remapKeyed(sheet.notes);
  sheet.links = remapKeyed(sheet.links);
  sheet.merges = sheet.merges.map((m) => shiftRangeText(m, shift)).filter((m): m is string => m !== null && m.includes(':'));
  sheet.cf = sheet.cf.flatMap((entry) => {
    const sqref = shiftRangeText(entry.sqref, shift);
    return sqref ? [{ ...entry, sqref }] : [];
  });
  sheet.validations = sheet.validations.flatMap((entry) => {
    const sqref = shiftRangeText(entry.sqref, shift);
    return sqref ? [{ ...entry, sqref }] : [];
  });
  sheet.tables = sheet.tables.flatMap((table) => {
    const ref = shiftRangeText(table.ref, shift);
    return ref ? [{ ...table, ref }] : [];
  });
  if (sheet.autoFilter) sheet.autoFilter = shiftRangeText(sheet.autoFilter, shift) ?? undefined;
  sheet.charts = sheet.charts.map((chart) => {
    const move = (pos: { col: number; row: number }): { col: number; row: number } => {
      const index = axisRow ? pos.row : pos.col;
      const next = shiftRangeIndex(index, shift) ?? Math.min(index, shift.at);
      return axisRow ? { ...pos, row: next } : { ...pos, col: next };
    };
    return { ...chart, from: move(chart.from), to: move(chart.to) };
  });
  ed.changed.structural = true;
  ed.dirty = true;
  // Moved cells carry (rewritten) formulas whose results must be recomputed.
  ed.valuesDirty = true;
}

function shiftRangeIndex(index: number, shift: Shift): number | null {
  if (shift.count > 0) return index >= shift.at ? index + shift.count : index;
  const removed = -shift.count;
  if (index < shift.at) return index;
  if (index >= shift.at + removed) return index - removed;
  return null;
}

function applySort(ed: Editor, op: Extract<Op, { op: 'sort' }>): void {
  const index = sheetOrWarn(ed, op.sheet, 'sort');
  const range = resolveRange(op.range);
  if (index < 0 || !range) return;
  const sheet = ed.touch(index);
  const clamped = usedClamp(sheet, range);
  const first = clamped.r1 + (op.header === false ? 0 : 1);
  if (first >= clamped.r2) return;
  const keys = op.by.map((entry) => ({ col: colFromSpec(entry.column), order: entry.order === 'desc' ? -1 : 1 })).filter((k) => k.col >= clamped.c1 && k.col <= clamped.c2);
  if (keys.length === 0) return ed.warn('sort: the sort column is outside the range.');
  const rows: Array<{ row: number; cells: Record<number, Cell | undefined> }> = [];
  for (let r = first; r <= clamped.r2; r += 1) {
    const cells: Record<number, Cell | undefined> = {};
    for (let c = clamped.c1; c <= clamped.c2; c += 1) cells[c] = sheet.cells[cellKey(r, c)];
    rows.push({ row: r, cells });
  }
  const valueOf = (cell: Cell | undefined): number | string | boolean | null => (cell === undefined ? null : cell.e !== undefined ? cell.e : cell.v ?? null);
  const sorted = rows.slice().sort((a, b) => {
    for (const key of keys) {
      const x = valueOf(a.cells[key.col]);
      const y = valueOf(b.cells[key.col]);
      if (x === null && y === null) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      const order = compareScalars(x, y) * key.order;
      if (order !== 0) return order;
    }
    return a.row - b.row;
  });
  sorted.forEach((entry, i) => {
    const target = first + i;
    for (let c = clamped.c1; c <= clamped.c2; c += 1) {
      const cell = entry.cells[c];
      const key = cellKey(target, c);
      if (!cell) {
        if (sheet.cells[key]) ed.put(sheet, key, null);
        continue;
      }
      const moved: Cell = cell.f !== undefined ? { ...cell, f: copyFormula(cell.f, target - entry.row, 0) } : { ...cell };
      delete moved.sp;
      delete moved.spill;
      ed.put(sheet, key, moved);
    }
  });
}

function applyFill(ed: Editor, op: Extract<Op, { op: 'fill' }>): void {
  const index = sheetOrWarn(ed, op.sheet, 'fill');
  const source = resolveRange(op.source);
  const target = resolveRange(op.target);
  if (index < 0 || !source || !target) return;
  const sheet = ed.touch(index);
  const vertical = target.r2 > source.r2 || target.r1 < source.r1;
  const horizontal = target.c2 > source.c2 || target.c1 < source.c1;
  if (!vertical && !horizontal) return;
  const cellsOfLine = (positions: Array<{ r: number; c: number }>): { fills: FillCell[]; styles: Array<number | undefined> } => ({
    fills: positions.map(({ r, c }) => {
      const cell = sheet.cells[cellKey(r, c)];
      if (cell?.f !== undefined) return { f: cell.f };
      return cell?.v === undefined ? {} : { v: cell.v };
    }),
    styles: positions.map(({ r, c }) => sheet.cells[cellKey(r, c)]?.s),
  });
  const write = (r: number, c: number, fill: FillCell, style: number | undefined): void => {
    const key = cellKey(r, c);
    const cell: Cell = {};
    if (style) cell.s = style;
    if (fill.f !== undefined) cell.f = fill.f;
    else if (fill.v !== undefined) cell.v = fill.v;
    ed.put(sheet, key, cell);
  };
  if (vertical && !horizontal) {
    const down = target.r2 > source.r2;
    const count = down ? target.r2 - source.r2 : source.r1 - target.r1;
    for (let c = source.c1; c <= source.c2; c += 1) {
      const positions = Array.from({ length: source.r2 - source.r1 + 1 }, (_, i) => ({ r: source.r1 + i, c }));
      const { fills, styles } = cellsOfLine(positions);
      const dates = isDateFormat(ed.styleOf(sheet.cells[cellKey(source.r1, c)]).numFmt);
      const result = fillSeries(fills, count, { axis: 'row', backward: !down, dates });
      result.forEach((fill, i) => {
        const r = down ? source.r2 + 1 + i : source.r1 - 1 - i;
        if (r >= 0 && r < MAX_ROWS) write(r, c, fill, styles[(down ? i : positions.length - 1 - (i % positions.length)) % positions.length]);
      });
    }
  } else if (horizontal && !vertical) {
    const right = target.c2 > source.c2;
    const count = right ? target.c2 - source.c2 : source.c1 - target.c1;
    for (let r = source.r1; r <= source.r2; r += 1) {
      const positions = Array.from({ length: source.c2 - source.c1 + 1 }, (_, i) => ({ r, c: source.c1 + i }));
      const { fills, styles } = cellsOfLine(positions);
      const dates = isDateFormat(ed.styleOf(sheet.cells[cellKey(r, source.c1)]).numFmt);
      const result = fillSeries(fills, count, { axis: 'col', backward: !right, dates });
      result.forEach((fill, i) => {
        const c = right ? source.c2 + 1 + i : source.c1 - 1 - i;
        if (c >= 0 && c < MAX_COLS) write(r, c, fill, styles[(right ? i : positions.length - 1 - (i % positions.length)) % positions.length]);
      });
    }
  } else {
    ed.warn('fill: choose a target that extends the source in one direction.');
  }
}

function applyCopy(ed: Editor, op: Extract<Op, { op: 'copy' }> | Extract<Op, { op: 'move' }>): void {
  const index = sheetOrWarn(ed, op.sheet, op.op);
  const range = resolveRange(op.range);
  const origin = parseCell(op.to);
  const toIndex = op.toSheet === undefined ? index : sheetOrWarn(ed, op.toSheet, op.op);
  if (index < 0 || toIndex < 0 || !range || !origin) return;
  const norm = normRange(range);
  const dRow = origin.row - norm.r1;
  const dCol = origin.col - norm.c1;
  if (norm.r2 + dRow >= MAX_ROWS || norm.c2 + dCol >= MAX_COLS) return ed.warn(`${op.op}: the destination runs off the sheet.`);
  const sourceSheet = ed.sheets[index];
  const area = usedClamp(sourceSheet, norm);
  const snapshot = new Map<string, Cell | undefined>();
  for (const { key } of cellsIn(area, 400000)) snapshot.set(key, sourceSheet.cells[key]);
  const isMove = op.op === 'move';
  const what = op.op === 'copy' ? op.what ?? 'all' : 'all';
  const target = ed.touch(toIndex);
  const source = toIndex === index ? target : ed.touch(index);

  if (isMove) for (const key of snapshot.keys()) if (source.cells[key]) ed.put(source, key, null);
  for (const [key, cell] of snapshot) {
    const pos = parseCell(key)!;
    const destKey = cellKey(pos.row + dRow, pos.col + dCol);
    const existing = target.cells[destKey];
    if (what === 'formats') {
      // Only the look comes across; what the destination holds stays.
      const next: Cell = { ...(existing ?? {}) };
      if (cell?.s) next.s = cell.s;
      else delete next.s;
      ed.put(target, destKey, next);
      continue;
    }
    if (what === 'values') {
      // Results come across, not formulas; the destination keeps its own look.
      const next: Cell = existing?.s ? { s: existing.s } : {};
      if (cell?.e !== undefined) next.e = cell.e;
      else if (cell?.v !== undefined) next.v = cell.v;
      ed.put(target, destKey, next);
      continue;
    }
    if (!cell) {
      if (existing) ed.put(target, destKey, null);
      continue;
    }
    const next: Cell = { ...cell };
    delete next.sp;
    delete next.spill;
    if (cell.f !== undefined && !isMove) next.f = copyFormula(cell.f, dRow, dCol);
    ed.put(target, destKey, next);
  }
  if (what === 'all') {
    for (const merge of source.merges.slice()) {
      const r = resolveRange(merge);
      if (r && r.r1 >= norm.r1 && r.r2 <= norm.r2 && r.c1 >= norm.c1 && r.c2 <= norm.c2) {
        target.merges.push(rangeText({ r1: r.r1 + dRow, r2: r.r2 + dRow, c1: r.c1 + dCol, c2: r.c2 + dCol }));
        if (isMove) source.merges = source.merges.filter((m) => m !== merge);
      }
    }
  }
  if (isMove) {
    const sameSheet = toIndex === index;
    const name = source.name.toLowerCase();
    // References into the moved block follow it.
    adjustFormulas(ed, (formula, owner) => rewriteRefs(formula, owner, (parts, targetSheet) => {
      if (targetSheet.toLowerCase() !== name || !sameSheet) return parts;
      const inside = parts.r1 >= norm.r1 && parts.r2 <= norm.r2 && parts.c1 >= norm.c1 && parts.c2 <= norm.c2 && parts.kind !== 'cols' && parts.kind !== 'rows';
      return inside ? { ...parts, r1: parts.r1 + dRow, r2: parts.r2 + dRow, c1: parts.c1 + dCol, c2: parts.c2 + dCol } : parts;
    }));
    if (!sameSheet) ed.warn('move: references to the moved cells from other sheets were left as they were.');
  }
  ed.dirty = true;
}

function uniqueSheetName(ed: Editor, wanted: string): string {
  const clean = wanted.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
  const taken = new Set(ed.sheets.map((sheet) => sheet.name.toLowerCase()));
  if (!taken.has(clean.toLowerCase())) return clean;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${clean.slice(0, 31 - String(n).length - 1)} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return clean;
}

function colList(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split(':').map((s) => s.trim());
    const from = colIndex(a);
    const to = b === undefined ? from : colIndex(b);
    if (from < 0 || to < 0) continue;
    for (let c = Math.min(from, to); c <= Math.max(from, to) && out.length < 1000; c += 1) out.push(c);
  }
  return out;
}

function rowList(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split(':').map((s) => Number(s.trim()));
    if (!Number.isFinite(a)) continue;
    const to = b === undefined || !Number.isFinite(b) ? a : b;
    for (let r = Math.min(a, to); r <= Math.max(a, to) && out.length < 5000; r += 1) if (r >= 1) out.push(r - 1);
  }
  return out;
}

/** Width in characters that fits what a column shows. */
function fitColumn(ed: Editor, sheet: Sheet, col: number, format: (cell: Cell) => string): number {
  let longest = 0;
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const pos = parseCell(key);
    if (!pos || pos.col !== col) continue;
    if (cell.v === undefined && cell.e === undefined) continue;
    const style = ed.styleOf(cell);
    // A General number is shown with as many decimals as fit, so it needs at most 11 characters.
    const text = typeof cell.v === 'number' && (!style.numFmt || style.numFmt === 'General') ? generalFit(cell.v, 11) : format(cell);
    const bold = style.font?.bold ? 1.1 : 1;
    longest = Math.max(longest, [...text].reduce((w, ch) => w + (/[؀-ۿ　-鿿]/.test(ch) ? 1.15 : 1), 0) * bold);
  }
  return Math.min(60, Math.max(6, Math.round((longest + 2) * 10) / 10));
}

export interface ApplyOptions {
  /** Skip the recalculation (the caller does it once for several batches). */
  skipRecalc?: boolean;
  /** Text of a cell for column auto-fit; the grid passes its formatter. */
  formatCell?: (cell: Cell, style: CellStyle) => string;
}

/** Applies operations in order. Invalid operations are skipped with a warning. */
export function applyOps(wb: Workbook, ops: Op[], options: ApplyOptions = {}): ApplyResult {
  const ed = new Editor(wb);
  for (const op of ops) {
    try {
      applyOne(ed, op, options);
    } catch (error) {
      ed.warn(`${op.op}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
  let result = ed.workbook();
  // Style-only batches (formats, sizes, views) skip the recalculation: no
  // value or formula changed, so cached results are still current.
  if (ed.valuesDirty && !options.skipRecalc) {
    const cycleWarnings: string[] = [];
    result = recalculate(result, { warnings: cycleWarnings });
    ed.warnings.push(...cycleWarnings);
  }
  return { wb: result, inverse: [{ op: 'restore', workbook: wb }], changed: ed.changed, warnings: ed.warnings };
}

function applyOne(ed: Editor, op: Op, options: ApplyOptions): void {
  switch (op.op) {
    case 'restore':
      throw new Error('restore is applied by the caller');
    case 'setValues':
      return applySetValues(ed, op);
    case 'fill':
      return applyFill(ed, op);
    case 'clear':
      return applyClear(ed, op);
    case 'format':
    case 'numberFormat':
    case 'borders': {
      const index = sheetOrWarn(ed, op.sheet, op.op);
      const range = resolveRange(op.range);
      if (index < 0 || !range) return;
      if (op.op === 'format') return applyFormat(ed, index, range, op.style);
      if (op.op === 'numberFormat') return applyFormat(ed, index, range, { numFmt: op.format });
      return applyBorders(ed, op, index, range);
    }
    case 'merge': {
      const index = sheetOrWarn(ed, op.sheet, 'merge');
      const range = resolveRange(op.range);
      if (index < 0 || !range) return;
      const sheet = ed.touch(index);
      const norm = normRange(range);
      const overlaps = (m: string): boolean => {
        const r = resolveRange(m);
        return r !== null && r.r1 <= norm.r2 && r.r2 >= norm.r1 && r.c1 <= norm.c2 && r.c2 >= norm.c1;
      };
      sheet.merges = sheet.merges.filter((m) => !overlaps(m));
      if (op.unmerge) return;
      if (norm.r1 === norm.r2 && norm.c1 === norm.c2) return;
      sheet.merges.push(rangeText(norm));
      // Only the top-left value survives, like Excel.
      for (const { key } of cellsIn(norm, 100000)) {
        if (key === cellKey(norm.r1, norm.c1)) continue;
        const cell = sheet.cells[key];
        if (cell && (cell.v !== undefined || cell.f !== undefined)) ed.put(sheet, key, cell.s ? { s: cell.s } : null);
      }
      return;
    }
    case 'insertRows':
    case 'deleteRows': {
      const index = sheetOrWarn(ed, op.sheet, op.op);
      if (index < 0) return;
      const count = Math.max(1, op.count ?? 1);
      return applyShift(ed, index, { axis: 'row', at: op.at - 1, count: op.op === 'insertRows' ? count : -count });
    }
    case 'insertCols':
    case 'deleteCols': {
      const index = sheetOrWarn(ed, op.sheet, op.op);
      if (index < 0) return;
      const at = colFromSpec(op.at);
      if (at < 0) return ed.warn(`${op.op}: invalid column.`);
      const count = Math.max(1, op.count ?? 1);
      return applyShift(ed, index, { axis: 'col', at, count: op.op === 'insertCols' ? count : -count });
    }
    case 'copy':
    case 'move':
      return applyCopy(ed, op);
    case 'textToColumns':
      return applyTextToColumns(ed, op);
    case 'sort':
      return applySort(ed, op);
    case 'removeDuplicates': {
      const index = sheetOrWarn(ed, op.sheet, 'removeDuplicates');
      const range = resolveRange(op.range);
      if (index < 0 || !range) return;
      const sheet = ed.touch(index);
      const clamped = usedClamp(sheet, range);
      const first = clamped.r1 + (op.header === false ? 0 : 1);
      const columns = (op.columns?.length ? op.columns.map((c) => colFromSpec(c)) : Array.from({ length: clamped.c2 - clamped.c1 + 1 }, (_, i) => clamped.c1 + i));
      const seen = new Set<string>();
      const keep: number[] = [];
      for (let r = first; r <= clamped.r2; r += 1) {
        const signature = columns.map((c) => {
          const cell = sheet.cells[cellKey(r, c)];
          const v = cell?.e ?? cell?.v ?? '';
          return typeof v === 'string' ? v.toLowerCase() : String(v);
        }).join('\u0001');
        if (seen.has(signature)) continue;
        seen.add(signature);
        keep.push(r);
      }
      const removed = clamped.r2 - first + 1 - keep.length;
      if (removed === 0) return;
      const rows = keep.map((r) => Array.from({ length: clamped.c2 - clamped.c1 + 1 }, (_, i) => sheet.cells[cellKey(r, clamped.c1 + i)]));
      for (let r = first; r <= clamped.r2; r += 1) {
        for (let c = clamped.c1; c <= clamped.c2; c += 1) {
          const source = rows[r - first]?.[c - clamped.c1];
          const key = cellKey(r, c);
          if (source) ed.put(sheet, key, source.f !== undefined ? { ...source, f: copyFormula(source.f, r - keep[r - first], 0) } : source);
          else if (sheet.cells[key]) ed.put(sheet, key, null);
        }
      }
      ed.warn(`Removed ${removed} duplicate row${removed === 1 ? '' : 's'}.`);
      return;
    }
    case 'autoFilter': {
      const index = sheetOrWarn(ed, op.sheet, 'autoFilter');
      if (index < 0) return;
      const sheet = ed.touch(index);
      if (op.range === null || op.range === undefined) {
        sheet.autoFilter = undefined;
        for (const r of Object.keys(sheet.rows)) {
          const info = sheet.rows[Number(r)];
          if (info.hidden) sheet.rows[Number(r)] = { ...info, hidden: undefined };
        }
        return;
      }
      const range = resolveRange(op.range);
      if (!range) return;
      sheet.autoFilter = rangeText(range);
      if (op.criteria?.length) {
        const clamped = usedClamp(sheet, range);
        for (let r = clamped.r1 + 1; r <= clamped.r2; r += 1) {
          const visible = op.criteria.every((criterion) => {
            const cell = sheet.cells[cellKey(r, colFromSpec(criterion.column))];
            const value = cell?.v ?? '';
            return criterion.values.some((candidate) => String(candidate ?? '').toLowerCase() === String(value).toLowerCase());
          });
          const info = sheet.rows[r] ?? {};
          if (!visible) sheet.rows[r] = { ...info, hidden: true };
          else if (info.hidden) sheet.rows[r] = { ...info, hidden: undefined };
        }
      }
      return;
    }
    case 'addSheet': {
      const sheet = emptySheet(uniqueSheetName(ed, op.name));
      const at = op.index === undefined ? ed.sheets.length : Math.min(Math.max(0, op.index), ed.sheets.length);
      ed.sheets.splice(at, 0, sheet);
      ed.changed.sheets.push(sheet.id);
      ed.changed.structural = true;
      ed.activeSheet = at;
      return;
    }
    case 'renameSheet': {
      const index = sheetOrWarn(ed, op.sheet, 'renameSheet');
      if (index < 0) return;
      const oldName = ed.sheets[index].name;
      const taken = ed.sheets.some((s, i) => i !== index && s.name.toLowerCase() === op.name.toLowerCase());
      if (taken) return ed.warn(`renameSheet: a sheet named "${op.name}" already exists.`);
      const newName = op.name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
      if (!newName) return;
      ed.touch(index).name = newName;
      const rename = (name: string): string => (name.toLowerCase() === oldName.toLowerCase() ? newName : name);
      adjustFormulas(ed, (formula, owner) => rewriteRefs(formula, owner, (parts) => parts, rename));
      rewriteChartRefs(ed, (ref, owner) => rewriteRefs(ref, owner, (parts) => parts, rename));
      ed.changed.structural = true;
      return;
    }
    case 'deleteSheet': {
      const index = sheetOrWarn(ed, op.sheet, 'deleteSheet');
      if (index < 0) return;
      if (ed.sheets.length === 1) return ed.warn('deleteSheet: a workbook needs at least one sheet.');
      const name = ed.sheets[index].name.toLowerCase();
      ed.sheets.splice(index, 1);
      ed.names = ed.names.filter((entry) => entry.scope !== index).map((entry) => ({ ...entry, scope: entry.scope !== undefined && entry.scope > index ? entry.scope - 1 : entry.scope }));
      adjustFormulas(ed, (formula, owner) => rewriteRefs(formula, owner, (parts, target) => (target.toLowerCase() === name ? null : parts)));
      if (ed.activeSheet >= ed.sheets.length) ed.activeSheet = ed.sheets.length - 1;
      ed.changed.structural = true;
      return;
    }
    case 'moveSheet': {
      const index = sheetOrWarn(ed, op.sheet, 'moveSheet');
      if (index < 0) return;
      const [sheet] = ed.sheets.splice(index, 1);
      ed.sheets.splice(Math.min(Math.max(0, op.index), ed.sheets.length), 0, sheet);
      ed.changed.structural = true;
      return;
    }
    case 'duplicateSheet': {
      const index = sheetOrWarn(ed, op.sheet, 'duplicateSheet');
      if (index < 0) return;
      const source = ed.sheets[index];
      const copy: Sheet = {
        ...source,
        id: emptySheet('x').id,
        name: uniqueSheetName(ed, op.name ?? `${source.name} (2)`),
        cells: { ...source.cells },
        cols: { ...source.cols },
        rows: { ...source.rows },
        notes: { ...source.notes },
        links: { ...source.links },
        charts: source.charts.map((chart) => ({ ...chart, id: `${chart.id}-copy` })),
        part: undefined,
      };
      ed.sheets.splice(index + 1, 0, copy);
      ed.changed.sheets.push(copy.id);
      ed.changed.structural = true;
      ed.dirty = true;
      // Spill links are dropped on copy and regenerated by the recalculation.
      ed.valuesDirty = true;
      return;
    }
    case 'sheetProps': {
      const index = sheetOrWarn(ed, op.sheet, 'sheetProps');
      if (index < 0) return;
      const sheet = ed.touch(index);
      if (op.tabColor !== undefined) sheet.tabColor = op.tabColor ?? undefined;
      if (op.rtl !== undefined) sheet.rtl = op.rtl || undefined;
      if (op.zoom !== undefined) sheet.zoom = op.zoom;
      if (op.gridlines !== undefined) sheet.gridlines = op.gridlines;
      if (op.headings !== undefined) sheet.headings = op.headings;
      if (op.hidden !== undefined) sheet.state = op.hidden ? 'hidden' : undefined;
      return;
    }
    case 'table': {
      const index = sheetOrWarn(ed, op.sheet, 'table');
      const range = resolveRange(op.range);
      if (index < 0 || !range) return;
      const sheet = ed.touch(index);
      const norm = normRange(usedClamp(sheet, range));
      if (op.remove) {
        sheet.tables = sheet.tables.filter((t) => {
          const r = resolveRange(t.ref);
          return !(r && r.r1 <= norm.r2 && r.r2 >= norm.r1 && r.c1 <= norm.c2 && r.c2 >= norm.c1);
        });
        return;
      }
      const header = op.header !== false;
      const columns: string[] = [];
      for (let c = norm.c1; c <= norm.c2; c += 1) {
        const cell = sheet.cells[cellKey(norm.r1, c)];
        let name = header && cell?.v !== undefined ? String(cell.v) : `Column${c - norm.c1 + 1}`;
        while (columns.includes(name)) name = `${name}_`;
        columns.push(name);
        if (header && cell?.v === undefined) ed.put(sheet, cellKey(norm.r1, c), { ...(cell ?? {}), v: name });
      }
      const taken = new Set(ed.sheets.flatMap((s) => s.tables.map((t) => t.name.toLowerCase())));
      let name = op.name ?? 'Table1';
      for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${op.name ?? 'Table'}${n}`;
      sheet.tables.push({ name, ref: rangeText(norm), columns, style: op.style ?? 'TableStyleMedium2', header, totals: op.totals === true, banded: true });
      return;
    }
    case 'conditionalFormat': {
      const index = sheetOrWarn(ed, op.sheet, 'conditionalFormat');
      const ranges = sqrefRanges(op.range);
      if (index < 0 || ranges.length === 0) return;
      const sheet = ed.touch(index);
      if (op.clear) {
        const target = ranges[0];
        sheet.cf = sheet.cf.filter((entry) => !sqrefRanges(entry.sqref).some((r) => r.r1 <= target.r2 && r.r2 >= target.r1 && r.c1 <= target.c2 && r.c2 >= target.c1));
        return;
      }
      if (!op.rule) return;
      const rule: ConditionalRule = op.rule;
      let stored: CondFormat['rule'];
      if ('style' in rule) {
        const { style, ...rest } = rule;
        stored = { ...rest, dxf: ed.internDxf(style) } as CondFormat['rule'];
      } else stored = rule as CondFormat['rule'];
      sheet.cf.push({ sqref: ranges.map(rangeText).join(' '), rule: stored });
      return;
    }
    case 'validation': {
      const index = sheetOrWarn(ed, op.sheet, 'validation');
      const ranges = sqrefRanges(op.range);
      if (index < 0 || ranges.length === 0) return;
      const sheet = ed.touch(index);
      const target = ranges[0];
      sheet.validations = sheet.validations.filter((entry) => !sqrefRanges(entry.sqref).some((r) => r.r1 <= target.r2 && r.r2 >= target.r1 && r.c1 <= target.c2 && r.c2 >= target.c1));
      if (op.rule) sheet.validations.push({ ...op.rule, sqref: ranges.map(rangeText).join(' ') });
      return;
    }
    case 'chart': {
      const index = sheetOrWarn(ed, op.sheet, 'chart');
      if (index < 0) return;
      const sheet = ed.touch(index);
      if (op.remove) {
        sheet.charts = sheet.charts.filter((chart) => chart.id !== op.remove);
        return;
      }
      if (!op.chart) return;
      const chart = chartFromSpec({ ...ed.workbook(), sheets: ed.sheets }, index, op.chart);
      if (typeof chart === 'string') return ed.warn(`chart: ${chart}`);
      const existing = sheet.charts.findIndex((entry) => entry.id === chart.id);
      if (existing >= 0) sheet.charts[existing] = chart;
      else {
        sheet.charts.push(chart);
        ed.changed.charts.push(chart.id);
      }
      return;
    }
    case 'freeze': {
      const index = sheetOrWarn(ed, op.sheet, 'freeze');
      if (index < 0) return;
      const sheet = ed.touch(index);
      const rows = op.rows ?? 0;
      const cols = op.cols ?? 0;
      sheet.freeze = rows || cols ? { rows, cols } : undefined;
      return;
    }
    case 'colWidth': {
      const index = sheetOrWarn(ed, op.sheet, 'colWidth');
      if (index < 0) return;
      if (op.width === 'auto') ed.refresh();
      const sheet = ed.touch(index);
      const format = options.formatCell;
      for (const c of colList(op.cols)) {
        const info = sheet.cols[c] ?? {};
        const width = op.width === 'auto'
          ? fitColumn(ed, sheet, c, (cell) => (format ? format(cell, ed.styleOf(cell)) : String(cell.e ?? cell.v ?? '')))
          : op.width;
        sheet.cols[c] = { ...info, width: width === 0 ? undefined : width, hidden: width === 0 ? true : info.hidden };
      }
      return;
    }
    case 'rowHeight': {
      const index = sheetOrWarn(ed, op.sheet, 'rowHeight');
      if (index < 0) return;
      const sheet = ed.touch(index);
      for (const r of rowList(op.rows)) {
        const info = sheet.rows[r] ?? {};
        sheet.rows[r] = { ...info, height: op.height === 'auto' ? undefined : op.height };
      }
      return;
    }
    case 'visibility': {
      const index = sheetOrWarn(ed, op.sheet, 'visibility');
      if (index < 0) return;
      const sheet = ed.touch(index);
      if (op.rows) for (const r of rowList(op.rows)) sheet.rows[r] = { ...(sheet.rows[r] ?? {}), hidden: op.hidden || undefined };
      if (op.cols) for (const c of colList(op.cols)) sheet.cols[c] = { ...(sheet.cols[c] ?? {}), hidden: op.hidden || undefined };
      return;
    }
    case 'name': {
      const scope = op.sheet === undefined ? undefined : ed.findSheet(op.sheet);
      const rest = ed.names.filter((entry) => !(entry.name.toLowerCase() === op.name.toLowerCase() && entry.scope === (scope && scope >= 0 ? scope : undefined)));
      if (op.ref === null) ed.names = rest;
      else {
        const parsed = parseSheetRef(op.ref.replace(/^=/, ''));
        const ref = parsed ? `${parsed.sheet ? `${quoteSheet(parsed.sheet)}!` : `${quoteSheet(ed.sheets[Math.min(ed.activeSheet, ed.sheets.length - 1)].name)}!`}${rangeText(parsed.range).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}` : op.ref.replace(/^=/, '');
        ed.names = [...rest, { name: op.name, ref, scope: scope !== undefined && scope >= 0 ? scope : undefined }];
      }
      ed.dirty = true;
      // A (re)defined name can change what existing formulas compute.
      ed.valuesDirty = true;
      return;
    }
    case 'note': {
      const index = sheetOrWarn(ed, op.sheet, 'note');
      if (index < 0) return;
      const sheet = ed.touch(index);
      const key = op.cell.toUpperCase().replace(/\$/g, '');
      if (op.text === null || op.text === '') delete sheet.notes[key];
      else sheet.notes[key] = op.text;
      return;
    }
    case 'hyperlink': {
      const index = sheetOrWarn(ed, op.sheet, 'hyperlink');
      if (index < 0) return;
      const sheet = ed.touch(index);
      const key = op.cell.toUpperCase().replace(/\$/g, '');
      if (op.url === null) delete sheet.links[key];
      else sheet.links[key] = op.url;
      return;
    }
    case 'pivot': {
      const index = sheetOrWarn(ed, op.sheet, 'pivot');
      if (index < 0) return;
      const parsedSource = parseSheetRef(op.pivot.source);
      const sourceIndex = parsedSource?.sheet ? ed.findSheet(parsedSource.sheet) : index;
      const origin = parseCell(op.pivot.target);
      if (!parsedSource || sourceIndex < 0 || !origin) return ed.warn('pivot: the source or target is not valid.');
      const source = ed.sheets[sourceIndex];
      const range = normRange(usedClamp(source, parsedSource.range));
      const table: PivotCell[][] = [];
      for (let r = range.r1; r <= range.r2; r += 1) {
        const line: PivotCell[] = [];
        for (let c = range.c1; c <= range.c2; c += 1) {
          const cell = source.cells[cellKey(r, c)];
          line.push(cell === undefined || cell.e !== undefined ? null : cell.v ?? null);
        }
        table.push(line);
      }
      const result = computePivot(table, { rows: op.pivot.rows, columns: op.pivot.columns ?? [], values: op.pivot.values.map((v) => ({ field: v.field, agg: v.agg ?? 'sum' })), filters: op.pivot.filters });
      if (typeof result === 'string') return ed.warn(`pivot: ${result}`);
      const sheet = ed.touch(index);
      const boldPatch: StylePatch = { font: { bold: true } };
      const memo = new Map<number, number>();
      result.rows.forEach((line, r) => {
        line.forEach((value, c) => {
          const key = cellKey(origin.row + r, origin.col + c);
          ed.put(sheet, key, value === null ? { ...(sheet.cells[key]?.s ? { s: sheet.cells[key].s } : {}) } : { ...(sheet.cells[key]?.s ? { s: sheet.cells[key].s } : {}), v: value });
          if (r < result.headerRows || r === result.totalRow) ed.restyle(sheet, key, boldPatch, memo);
        });
      });
      return;
    }
    default:
      return;
  }
}

/** Convenience: an A1 range label for UI messages. */
export const describeRange = (range: RangeRef): string => `${colName(range.c1)}${range.r1 + 1}:${colName(range.c2)}${range.r2 + 1}`;
