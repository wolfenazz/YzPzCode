// Reading cells and arrays out of values, and element-wise application.

import { MAX_COLS, MAX_ROWS } from '../types';
import type { Env } from './env';
import { NA, VALUE, isLambda, isMatrix, isRef, type Matrix, type Scalar, type Value } from './values';

export const isMultiCell = (value: Value): boolean => {
  if (isMatrix(value)) return value.length > 1 || (value[0]?.length ?? 0) > 1;
  if (isRef(value)) return value.r1 !== value.r2 || value.c1 !== value.c2;
  return false;
};

/** Cells of a reference or array as a matrix. Whole-column and whole-row references stop at the used range. */
export function toMatrix(value: Value, env: Env): Matrix {
  if (isMatrix(value)) return value;
  if (isRef(value)) {
    const bounds = env.bounds(value.sheet);
    const r2 = value.r2 >= MAX_ROWS - 1 ? Math.max(value.r1, Math.min(value.r2, bounds.rows - 1)) : value.r2;
    const c2 = value.c2 >= MAX_COLS - 1 ? Math.max(value.c1, Math.min(value.c2, bounds.cols - 1)) : value.c2;
    const rows: Matrix = [];
    for (let r = value.r1; r <= r2; r += 1) {
      const line: Scalar[] = [];
      for (let c = value.c1; c <= c2; c += 1) line.push(env.cell(value.sheet, r, c));
      rows.push(line);
    }
    return rows;
  }
  if (isLambda(value)) return [[VALUE]];
  return [[value]];
}

/** A single value: a cell's content, or the one cell of a range that shares the formula's row or column. */
export function toScalar(value: Value, env: Env): Scalar {
  if (isMatrix(value)) return value[0]?.[0] ?? null;
  if (isRef(value)) {
    if (value.r1 === value.r2 && value.c1 === value.c2) return env.cell(value.sheet, value.r1, value.c1);
    if (value.c1 === value.c2 && value.sheet === env.sheet && env.row >= value.r1 && env.row <= value.r2) return env.cell(value.sheet, env.row, value.c1);
    if (value.r1 === value.r2 && value.sheet === env.sheet && env.col >= value.c1 && env.col <= value.c2) return env.cell(value.sheet, value.r1, env.col);
    return VALUE;
  }
  if (isLambda(value)) return VALUE;
  return value;
}

/** Applies `f` over matrices, stretching one-row and one-column operands like Excel does. */
export function broadcast(operands: Matrix[], f: (values: Scalar[]) => Scalar): Matrix {
  const rows = Math.max(...operands.map((m) => m.length));
  const cols = Math.max(...operands.map((m) => m.reduce((max, row) => Math.max(max, row.length), 0)));
  const out: Matrix = [];
  for (let r = 0; r < rows; r += 1) {
    const line: Scalar[] = [];
    for (let c = 0; c < cols; c += 1) {
      let missing = false;
      const picked = operands.map((m) => {
        const row = m[m.length === 1 ? 0 : r];
        const cc = row && row.length === 1 ? 0 : c;
        if (!row || cc >= row.length) {
          missing = true;
          return null;
        }
        return row[cc];
      });
      line.push(missing ? NA : f(picked));
    }
    out.push(line);
  }
  return out;
}

/** Row count and column count of a value as a block of cells. */
export function dims(value: Value, env: Env): { rows: number; cols: number } {
  if (isRef(value)) {
    const matrix = toMatrix(value, env);
    return { rows: matrix.length, cols: matrix[0]?.length ?? 0 };
  }
  if (isMatrix(value)) return { rows: value.length, cols: value[0]?.length ?? 0 };
  return { rows: 1, cols: 1 };
}

export const transpose = (matrix: Matrix): Matrix => {
  const cols = matrix[0]?.length ?? 0;
  return Array.from({ length: cols }, (_, c) => matrix.map((row) => row[c] ?? null));
};
