// Recalculates a workbook: evaluates every formula once (dependencies first),
// writes the results into the cells and lays out dynamic-array spills.

import { cellKey, parseCell } from '../address';
import { MAX_COLS, MAX_ROWS, type Cell, type Sheet, type Workbook } from '../types';
import { toMatrix } from './arrays';
import type { Env } from './env';
import { evaluate } from './evaluate';
import { FormulaSyntaxError } from './tokenize';
import { parseFormula } from './parse';
import { CALC, NAME, REF, SPILL, VALUE, XlError, errorOf, isError, isLambda, isMatrix, isRef, type Matrix, type Scalar } from './values';

const MAX_NESTING = 120;

class Defer {
  constructor(readonly sheet: number, readonly key: string) {}
}

export interface RecalcOptions {
  now?: Date;
  /** Read formula cells as stored instead of evaluating them (for per-cell lookups on an already calculated workbook). */
  trustCached?: boolean;
}

class Calculator {
  readonly cells: Array<Record<string, Cell>>;
  private readonly state = new Map<string, 0 | 1 | 2>();
  private readonly boundsCache = new Map<number, { rows: number; cols: number }>();
  private nesting = 0;
  readonly view: Workbook;
  readonly now: Date;
  private readonly trusted: boolean;

  constructor(readonly wb: Workbook, options: RecalcOptions) {
    this.now = options.now ?? new Date();
    this.trusted = options.trustCached === true;
    this.cells = wb.sheets.map((sheet) => ({ ...sheet.cells }));
    this.view = { ...wb, sheets: wb.sheets.map((sheet, index) => ({ ...sheet, cells: this.cells[index] })) };
  }

  bounds = (sheet: number): { rows: number; cols: number } => {
    let cached = this.boundsCache.get(sheet);
    if (!cached) {
      let rows = 0;
      let cols = 0;
      for (const [key, cell] of Object.entries(this.cells[sheet] ?? {})) {
        if (cell.v === undefined && cell.f === undefined && cell.e === undefined) continue;
        const pos = parseCell(key);
        if (!pos) continue;
        if (pos.row + 1 > rows) rows = pos.row + 1;
        if (pos.col + 1 > cols) cols = pos.col + 1;
      }
      cached = { rows, cols };
      this.boundsCache.set(sheet, cached);
    }
    return cached;
  };

  spillOf = (sheet: number, row: number, col: number): { rows: number; cols: number } | null => {
    const cell = this.cells[sheet]?.[cellKey(row, col)];
    if (!cell) return null;
    if (cell.f !== undefined) this.ensure(sheet, cellKey(row, col));
    return this.cells[sheet][cellKey(row, col)]?.spill ?? null;
  };

  cell = (sheet: number, row: number, col: number): Scalar => {
    const cells = this.cells[sheet];
    if (!cells) return REF;
    const key = cellKey(row, col);
    let cell = cells[key];
    if (!cell) return null;
    if (cell.f !== undefined) this.ensure(sheet, key);
    else if (cell.sp !== undefined) {
      const anchor = cells[cell.sp];
      if (anchor?.f !== undefined) this.ensure(sheet, cell.sp);
    }
    cell = cells[key];
    if (!cell) return null;
    if (cell.e !== undefined) return errorOf(cell.e);
    return cell.v ?? null;
  };

  /** Makes sure the formula at `key` has been evaluated. */
  private ensure(sheet: number, key: string): void {
    if (this.trusted) return;
    const id = `${sheet}|${key}`;
    const state = this.state.get(id) ?? 0;
    if (state === 2) return;
    if (state === 1) {
      // Circular reference: show it instead of a stale number.
      const cell = this.cells[sheet][key];
      if (cell) this.cells[sheet][key] = { ...cell, v: undefined, e: '#REF!' };
      return;
    }
    if (this.nesting > MAX_NESTING) throw new Defer(sheet, key);
    this.state.set(id, 1);
    this.nesting += 1;
    let finished = false;
    try {
      this.compute(sheet, key);
      finished = true;
    } finally {
      this.nesting -= 1;
      if (finished) this.state.set(id, 2);
      else this.state.delete(id);
    }
  }

  private compute(sheet: number, key: string): void {
    const cells = this.cells[sheet];
    const cell = cells[key];
    if (!cell || cell.f === undefined) return;
    const pos = parseCell(key);
    if (!pos) return;
    let result: Scalar | Matrix;
    try {
      const node = parseFormula(cell.f);
      const env: Env = {
        wb: this.view, sheet, row: pos.row, col: pos.col, cell: this.cell, bounds: this.bounds, spillOf: this.spillOf, now: this.now, vars: new Map(), depth: 0,
      };
      const value = evaluate(node, env);
      if (isRef(value)) result = value.r1 === value.r2 && value.c1 === value.c2 ? this.cell(value.sheet, value.r1, value.c1) : toMatrix(value, env);
      else if (isLambda(value)) result = CALC;
      else result = value;
    } catch (error) {
      if (error instanceof Defer) throw error;
      result = error instanceof FormulaSyntaxError ? NAME : VALUE;
    }
    this.store(sheet, key, pos.row, pos.col, result);
  }

  private clearSpill(sheet: number, key: string, rows: number, cols: number): void {
    const cells = this.cells[sheet];
    const pos = parseCell(key);
    if (!pos) return;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (r === 0 && c === 0) continue;
        const childKey = cellKey(pos.row + r, pos.col + c);
        const child = cells[childKey];
        if (child?.sp === key) {
          if (child.s) cells[childKey] = { s: child.s };
          else delete cells[childKey];
        }
      }
    }
  }

  private store(sheet: number, key: string, row: number, col: number, result: Scalar | Matrix): void {
    const cells = this.cells[sheet];
    const anchor = cells[key];
    const previous = anchor.spill;
    const next: Cell = { ...anchor };
    delete next.v;
    delete next.e;
    delete next.spill;

    const writeScalar = (target: Cell, value: Scalar): void => {
      if (isError(value)) target.e = value.code;
      else target.v = value === null ? 0 : value;
    };

    if (!isMatrix(result) || (result.length <= 1 && (result[0]?.length ?? 0) <= 1)) {
      if (previous) this.clearSpill(sheet, key, previous.rows, previous.cols);
      const scalar = isMatrix(result) ? result[0]?.[0] ?? null : result;
      writeScalar(next, scalar);
      cells[key] = next;
      return;
    }

    const rows = result.length;
    const cols = result.reduce((max, line) => Math.max(max, line.length), 0);
    let blocked = row + rows > MAX_ROWS || col + cols > MAX_COLS;
    if (!blocked) {
      outer: for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (r === 0 && c === 0) continue;
          const existing = cells[cellKey(row + r, col + c)];
          if (existing && existing.sp !== key && (existing.f !== undefined || existing.v !== undefined || existing.e !== undefined)) {
            blocked = true;
            break outer;
          }
        }
      }
    }
    if (previous) this.clearSpill(sheet, key, previous.rows, previous.cols);
    if (blocked) {
      next.e = SPILL.code;
      cells[key] = next;
      return;
    }
    writeScalar(next, result[0]?.[0] ?? null);
    next.spill = { rows, cols };
    cells[key] = next;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (r === 0 && c === 0) continue;
        const childKey = cellKey(row + r, col + c);
        const child: Cell = { sp: key };
        const old = cells[childKey];
        if (old?.s) child.s = old.s;
        writeScalar(child, result[r]?.[c] ?? null);
        cells[childKey] = child;
      }
    }
    this.boundsCache.delete(sheet);
  }

  /** Evaluates one formula cell from a fresh stack, first evaluating whatever was too deep to reach. */
  top(sheet: number, key: string): void {
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      this.nesting = 0;
      try {
        this.ensure(sheet, key);
        return;
      } catch (error) {
        if (!(error instanceof Defer)) throw error;
        this.top(error.sheet, error.key);
      }
    }
  }
}

/** Evaluates every formula in the workbook and returns it with fresh values. */
export function recalculate(wb: Workbook, options: RecalcOptions = {}): Workbook {
  const calc = new Calculator(wb, options);
  const order: Array<{ sheet: number; key: string; row: number; col: number }> = [];
  wb.sheets.forEach((sheet, index) => {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (cell.f === undefined) continue;
      const pos = parseCell(key);
      if (pos) order.push({ sheet: index, key, row: pos.row, col: pos.col });
    }
  });
  order.sort((a, b) => a.sheet - b.sheet || a.row - b.row || a.col - b.col);
  for (const entry of order) calc.top(entry.sheet, entry.key);

  // Spilled cells whose anchor stopped claiming them go away.
  calc.cells.forEach((cells) => {
    for (const [key, cell] of Object.entries(cells)) {
      if (cell.sp === undefined) continue;
      const anchor = cells[cell.sp];
      const anchorPos = anchor && parseCell(cell.sp);
      const pos = parseCell(key);
      const inside = anchor?.spill && anchorPos && pos
        && pos.row >= anchorPos.row && pos.row < anchorPos.row + anchor.spill.rows
        && pos.col >= anchorPos.col && pos.col < anchorPos.col + anchor.spill.cols;
      if (!inside) {
        if (cell.s) cells[key] = { s: cell.s };
        else delete cells[key];
      }
    }
  });

  return {
    ...wb,
    sheets: wb.sheets.map((sheet, index): Sheet => {
      const before = sheet.cells;
      const after = calc.cells[index];
      // Keep the original map when nothing changed so unchanged sheets stay shared.
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const key of keys) if (before[key] !== after[key]) return { ...sheet, cells: after };
      return sheet;
    }),
  };
}

/** Evaluates formula text as if it were typed in a cell (for previews and tests). */
export function evaluateFormula(wb: Workbook, sheetIndex: number, formula: string, row = 0, col = 0): Scalar | Matrix {
  const calc = new Calculator(wb, {});
  const env: Env = {
    wb: calc.view, sheet: sheetIndex, row, col, cell: calc.cell, bounds: calc.bounds, spillOf: calc.spillOf, now: calc.now, vars: new Map(), depth: 0,
  };
  try {
    const value = evaluate(parseFormula(formula), env);
    if (isRef(value)) return value.r1 === value.r2 && value.c1 === value.c2 ? calc.cell(value.sheet, value.r1, value.c1) : toMatrix(value, env);
    if (isLambda(value)) return CALC;
    return value;
  } catch (error) {
    if (error instanceof Defer) return VALUE;
    return error instanceof FormulaSyntaxError ? NAME : VALUE;
  }
}

/**
 * A function that evaluates formula text at a cell of an already calculated
 * workbook, reusing one calculator (conditional formats, validation, previews).
 */
export function createEvaluator(wb: Workbook): (formula: string, sheetIndex: number, row: number, col: number) => Scalar | Matrix {
  const calc = new Calculator(wb, { trustCached: true });
  return (formula, sheetIndex, row, col) => {
    const env: Env = {
      wb: calc.view, sheet: sheetIndex, row, col, cell: calc.cell, bounds: calc.bounds, spillOf: calc.spillOf, now: calc.now, vars: new Map(), depth: 0,
    };
    try {
      const value = evaluate(parseFormula(formula), env);
      if (isRef(value)) return value.r1 === value.r2 && value.c1 === value.c2 ? calc.cell(value.sheet, value.r1, value.c1) : toMatrix(value, env);
      if (isLambda(value)) return CALC;
      return value;
    } catch (error) {
      return error instanceof FormulaSyntaxError ? NAME : VALUE;
    }
  };
}

/** The value a cell currently shows (error values as `XlError`). */
export function cellValue(sheet: Sheet, key: string): Scalar {
  const cell = sheet.cells[key];
  if (!cell) return null;
  if (cell.e !== undefined) return errorOf(cell.e);
  return cell.v ?? null;
}

export { XlError };
