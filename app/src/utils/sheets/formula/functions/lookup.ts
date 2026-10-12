// Lookup, reference and dynamic-array functions.

import { colName, parseSheetRef, quoteSheet } from '../../address';
import { MAX_COLS, MAX_ROWS } from '../../types';
import { dims, toMatrix, toScalar, transpose } from '../arrays';
import { sheetIndex } from '../env';
import {
  CALC, NA, REF, VALUE, compareScalars, isError, isRef, toBool,
  type Matrix, type RefValue, type Scalar, type Value,
} from '../values';
import { flattenCells, int, num, text, type FnTable } from './helpers';

function wildcardTest(pattern: string): (cell: Scalar) => boolean {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '~' && i + 1 < pattern.length) {
      out += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    } else if (ch === '*') out += '[\\s\\S]*';
    else if (ch === '?') out += '[\\s\\S]';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const re = new RegExp(`^${out}$`, 'i');
  return (cell) => typeof cell === 'string' && re.test(cell);
}

const sameValue = (a: Scalar, b: Scalar): boolean => !isError(a) && !isError(b) && typeof a === typeof b && compareScalars(a, b) === 0 || (a === null && (b === '' || b === 0)) || (b === null && (a === '' || a === 0));

/**
 * Position of `target` in `cells`. `mode`: 0 exact, -1 exact or next smaller, 1 exact or next larger, 2 wildcard exact.
 * Approximate modes on sorted data use the linear "largest value not above" rule of MATCH.
 */
function findIndex(target: Scalar, cells: Scalar[], mode: number, fromEnd = false): number {
  const indexes = cells.map((_, i) => i);
  if (fromEnd) indexes.reverse();
  if (mode === 0 || mode === 2) {
    const test = mode === 2 && typeof target === 'string' && /[*?~]/.test(target) ? wildcardTest(target) : null;
    for (const i of indexes) {
      const cell = cells[i];
      if (test ? test(cell) : sameValue(cell, target)) return i;
    }
    return -1;
  }
  let best = -1;
  for (const i of indexes) {
    const cell = cells[i];
    if (isError(cell) || cell === null) continue;
    const order = compareScalars(cell, target);
    if (typeof cell !== typeof target) continue;
    if (order === 0) return i;
    if (mode === -1 && order < 0 && (best < 0 || compareScalars(cell, cells[best]) > 0)) best = i;
    if (mode === 1 && order > 0 && (best < 0 || compareScalars(cell, cells[best]) < 0)) best = i;
  }
  return best;
}

/** Binary-search semantics of an ascending sorted list: last position whose value is not above the target. */
function approximateIndex(target: Scalar, cells: Scalar[]): number {
  let result = -1;
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (cell === null || isError(cell) || typeof cell !== typeof target) continue;
    if (compareScalars(cell, target) <= 0) result = i;
    else break;
  }
  return result;
}

const column = (matrix: Matrix, c: number): Scalar[] => matrix.map((row) => row[c] ?? null);

/** A vector's cells, whichever way it lies. */
const vectorOf = (matrix: Matrix): Scalar[] => (matrix.length === 1 ? matrix[0] : matrix.map((row) => row[0] ?? null));

function sliceValue(source: Value, r1: number, c1: number, r2: number, c2: number, env: Parameters<typeof toMatrix>[1]): Value {
  if (isRef(source)) return { kind: 'ref', sheet: source.sheet, r1: source.r1 + r1, c1: source.c1 + c1, r2: source.r1 + r2, c2: source.c1 + c2 };
  return toMatrix(source, env).slice(r1, r2 + 1).map((row) => row.slice(c1, c2 + 1));
}

function sortRows(matrix: Matrix, keys: Array<{ index: number; order: number }>): Matrix {
  return matrix.map((row, i) => ({ row, i })).sort((a, b) => {
    for (const key of keys) {
      const x = a.row[key.index] ?? null;
      const y = b.row[key.index] ?? null;
      if (x === null && y === null) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      const order = compareScalars(x, y) * key.order;
      if (order !== 0) return order;
    }
    return a.i - b.i;
  }).map((entry) => entry.row);
}

export const LOOKUP_FUNCTIONS: FnTable = {
  VLOOKUP: {
    min: 3, max: 4,
    fn: (args, env) => {
      const target = toScalar(args[0], env);
      if (isError(target)) return target;
      const table = toMatrix(args[1], env);
      const col = int(args[2], env);
      if (isError(col)) return col;
      if (col < 1 || col > (table[0]?.length ?? 0)) return REF;
      const approx = args[3] === undefined ? true : toBool(toScalar(args[3], env)) !== false;
      const keys = column(table, 0);
      const index = approx ? approximateIndex(target, keys) : findIndex(target, keys, 2);
      return index < 0 ? NA : table[index][col - 1] ?? null;
    },
  },
  HLOOKUP: {
    min: 3, max: 4,
    fn: (args, env) => {
      const target = toScalar(args[0], env);
      if (isError(target)) return target;
      const table = toMatrix(args[1], env);
      const row = int(args[2], env);
      if (isError(row)) return row;
      if (row < 1 || row > table.length) return REF;
      const approx = args[3] === undefined ? true : toBool(toScalar(args[3], env)) !== false;
      const keys = table[0] ?? [];
      const index = approx ? approximateIndex(target, keys) : findIndex(target, keys, 2);
      return index < 0 ? NA : table[row - 1][index] ?? null;
    },
  },
  MATCH: {
    min: 2, max: 3,
    fn: (args, env) => {
      const target = toScalar(args[0], env);
      if (isError(target)) return target;
      const cells = vectorOf(toMatrix(args[1], env));
      const type = args[2] === undefined ? 1 : num(args[2], env);
      if (isError(type)) return type;
      const index = type === 0 ? findIndex(target, cells, 2) : type > 0 ? approximateIndex(target, cells) : findIndex(target, cells, 1);
      return index < 0 ? NA : index + 1;
    },
  },
  XMATCH: {
    min: 2, max: 4,
    fn: (args, env) => {
      const target = toScalar(args[0], env);
      if (isError(target)) return target;
      const cells = vectorOf(toMatrix(args[1], env));
      const mode = args[2] === undefined ? 0 : num(args[2], env);
      const search = args[3] === undefined ? 1 : num(args[3], env);
      if (isError(mode)) return mode;
      if (isError(search)) return search;
      const index = findIndex(target, cells, mode, search < 0);
      return index < 0 ? NA : index + 1;
    },
  },
  XLOOKUP: {
    min: 3, max: 6,
    fn: (args, env) => {
      const target = toScalar(args[0], env);
      if (isError(target)) return target;
      const keys = toMatrix(args[1], env);
      const mode = args[4] === undefined || args[4] === null ? 0 : num(args[4], env);
      const search = args[5] === undefined || args[5] === null ? 1 : num(args[5], env);
      if (isError(mode)) return mode;
      if (isError(search)) return search;
      const vertical = keys.length > 1 || (keys[0]?.length ?? 0) <= 1;
      const cells = vertical ? column(keys, 0) : keys[0];
      const index = findIndex(target, cells, mode, search < 0);
      if (index < 0) return args[3] === undefined || args[3] === null ? NA : args[3];
      const returns = toMatrix(args[2], env);
      if (vertical) {
        const row = returns[index];
        if (!row) return NA;
        return row.length === 1 ? row[0] : [row];
      }
      const picked = returns.map((row) => [row[index] ?? null]);
      return picked.length === 1 ? picked[0][0] : picked;
    },
  },
  LOOKUP: {
    min: 2, max: 3,
    fn: (args, env) => {
      const target = toScalar(args[0], env);
      if (isError(target)) return target;
      const keys = vectorOf(toMatrix(args[1], env));
      const index = approximateIndex(target, keys);
      if (index < 0) return NA;
      const results = args[2] === undefined ? keys : vectorOf(toMatrix(args[2], env));
      return results[index] ?? NA;
    },
  },
  INDEX: {
    min: 2, max: 4,
    fn: (args, env) => {
      const source = args[0];
      const { rows, cols } = dims(source, env);
      let row = int(args[1], env);
      let col = args[2] === undefined || args[2] === null ? (rows === 1 && cols > 1 ? null : 0) : int(args[2], env);
      if (isError(row)) return row;
      if (col !== null && isError(col)) return col;
      // A single row or column takes its position from the one index given.
      if (rows === 1 && cols > 1 && (args[2] === undefined || args[2] === null)) {
        col = row;
        row = 1;
      }
      const c = col as number;
      if (row < 0 || c < 0 || row > rows || c > cols) return REF;
      if (row === 0 && c === 0) return source;
      if (row === 0) return sliceValue(source, 0, c - 1, rows - 1, c - 1, env);
      if (c === 0) return sliceValue(source, row - 1, 0, row - 1, cols - 1, env);
      const picked = sliceValue(source, row - 1, c - 1, row - 1, c - 1, env);
      return picked;
    },
  },
  ROW: {
    min: 0, max: 1,
    fn: (args, env) => {
      if (args.length === 0 || args[0] === null) return env.row + 1;
      const ref = args[0];
      if (!isRef(ref)) return NA;
      return ref.r1 === ref.r2 ? ref.r1 + 1 : Array.from({ length: ref.r2 - ref.r1 + 1 }, (_, i) => [ref.r1 + i + 1]);
    },
  },
  COLUMN: {
    min: 0, max: 1,
    fn: (args, env) => {
      if (args.length === 0 || args[0] === null) return env.col + 1;
      const ref = args[0];
      if (!isRef(ref)) return NA;
      return ref.c1 === ref.c2 ? ref.c1 + 1 : [Array.from({ length: ref.c2 - ref.c1 + 1 }, (_, i) => ref.c1 + i + 1)];
    },
  },
  ROWS: { min: 1, max: 1, fn: (args, env) => (isRef(args[0]) ? args[0].r2 - args[0].r1 + 1 : dims(args[0], env).rows) },
  COLUMNS: { min: 1, max: 1, fn: (args, env) => (isRef(args[0]) ? args[0].c2 - args[0].c1 + 1 : dims(args[0], env).cols) },
  OFFSET: {
    min: 3, max: 5,
    fn: (args, env) => {
      const base = args[0];
      if (!isRef(base)) return VALUE;
      const dr = int(args[1], env);
      const dc = int(args[2], env);
      if (isError(dr)) return dr;
      if (isError(dc)) return dc;
      const height = args[3] === undefined || args[3] === null ? base.r2 - base.r1 + 1 : int(args[3], env);
      const width = args[4] === undefined || args[4] === null ? base.c2 - base.c1 + 1 : int(args[4], env);
      if (isError(height)) return height;
      if (isError(width)) return width;
      if (height < 1 || width < 1) return REF;
      const r1 = base.r1 + dr;
      const c1 = base.c1 + dc;
      if (r1 < 0 || c1 < 0 || r1 + height > MAX_ROWS || c1 + width > MAX_COLS) return REF;
      return { kind: 'ref', sheet: base.sheet, r1, c1, r2: r1 + height - 1, c2: c1 + width - 1 } as RefValue;
    },
  },
  INDIRECT: {
    min: 1, max: 2,
    fn: (args, env) => {
      const reference = text(args[0], env);
      if (isError(reference)) return reference;
      const parsed = parseSheetRef(reference);
      if (!parsed) {
        const entry = env.wb.names.find((n) => n.name.toLowerCase() === reference.toLowerCase());
        const named = entry ? parseSheetRef(entry.ref) : null;
        if (!named) return REF;
        const sheet = named.sheet === undefined ? env.sheet : sheetIndex(env.wb, named.sheet);
        return sheet < 0 ? REF : { kind: 'ref', sheet, ...named.range };
      }
      const sheet = parsed.sheet === undefined ? env.sheet : sheetIndex(env.wb, parsed.sheet);
      return sheet < 0 ? REF : { kind: 'ref', sheet, ...parsed.range };
    },
  },
  ADDRESS: {
    min: 2, max: 5,
    fn: (args, env) => {
      const row = int(args[0], env);
      const col = int(args[1], env);
      if (isError(row)) return row;
      if (isError(col)) return col;
      const absolute = args[2] === undefined || args[2] === null ? 1 : int(args[2], env);
      if (isError(absolute)) return absolute;
      if (row < 1 || col < 1) return VALUE;
      const c = `${absolute === 1 || absolute === 3 ? '$' : ''}${colName(col - 1)}`;
      const r = `${absolute === 1 || absolute === 2 ? '$' : ''}${row}`;
      const sheet = args[4] === undefined || args[4] === null ? '' : `${quoteSheet(String(toScalar(args[4], env)))}!`;
      return `${sheet}${c}${r}`;
    },
  },
  TRANSPOSE: { min: 1, max: 1, fn: (args, env) => transpose(toMatrix(args[0], env)) },
  FILTER: {
    min: 2, max: 3,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const include = toMatrix(args[1], env);
      const byRow = include.length === source.length && (include[0]?.length ?? 0) <= 1;
      let result: Matrix;
      if (byRow) {
        result = source.filter((_, i) => {
          const test = toBool(include[i][0] ?? null);
          return test === true;
        });
      } else {
        const keep = (include[0] ?? []).map((cell) => toBool(cell) === true);
        result = source.map((row) => row.filter((_, c) => keep[c]));
        if ((result[0]?.length ?? 0) === 0) result = [];
      }
      if (result.length === 0) return args[2] === undefined ? CALC : args[2];
      return result;
    },
  },
  SORT: {
    min: 1, max: 4,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const index = args[1] === undefined || args[1] === null ? 1 : int(args[1], env);
      const order = args[2] === undefined || args[2] === null ? 1 : num(args[2], env);
      if (isError(index)) return index;
      if (isError(order)) return order;
      const byCol = args[3] !== undefined && toBool(toScalar(args[3], env)) === true;
      const data = byCol ? transpose(source) : source;
      if (index < 1 || index > (data[0]?.length ?? 0)) return VALUE;
      const sorted = sortRows(data, [{ index: index - 1, order: order < 0 ? -1 : 1 }]);
      return byCol ? transpose(sorted) : sorted;
    },
  },
  SORTBY: {
    min: 2, max: 255,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const keys: Array<{ values: Scalar[]; order: number }> = [];
      for (let i = 1; i < args.length; i += 2) {
        const values = vectorOf(toMatrix(args[i], env));
        if (values.length !== source.length) return VALUE;
        const order = args[i + 1] === undefined ? 1 : num(args[i + 1], env);
        if (isError(order)) return order;
        keys.push({ values, order: order < 0 ? -1 : 1 });
      }
      return source.map((row, i) => ({ row, i })).sort((a, b) => {
        for (const key of keys) {
          const x = key.values[a.i];
          const y = key.values[b.i];
          const order = compareScalars(x, y) * key.order;
          if (order !== 0) return order;
        }
        return a.i - b.i;
      }).map((entry) => entry.row);
    },
  },
  UNIQUE: {
    min: 1, max: 3,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const byCol = args[1] !== undefined && args[1] !== null && toBool(toScalar(args[1], env)) === true;
      const once = args[2] !== undefined && args[2] !== null && toBool(toScalar(args[2], env)) === true;
      const data = byCol ? transpose(source) : source;
      const counts = new Map<string, number>();
      const keyOf = (row: Scalar[]): string => row.map((cell) => (typeof cell === 'string' ? `s:${cell.toLowerCase()}` : `${typeof cell}:${String(cell)}`)).join('\u0001');
      for (const row of data) counts.set(keyOf(row), (counts.get(keyOf(row)) ?? 0) + 1);
      const seen = new Set<string>();
      const out: Matrix = [];
      for (const row of data) {
        const key = keyOf(row);
        if (seen.has(key)) continue;
        seen.add(key);
        if (once && counts.get(key) !== 1) continue;
        out.push(row);
      }
      if (out.length === 0) return CALC;
      return byCol ? transpose(out) : out;
    },
  },
  TAKE: {
    min: 2, max: 3,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const rows = int(args[1], env);
      if (isError(rows)) return rows;
      const cols = args[2] === undefined || args[2] === null ? null : int(args[2], env);
      if (cols !== null && isError(cols)) return cols;
      let out = rows === 0 ? source : rows > 0 ? source.slice(0, rows) : source.slice(rows);
      if (cols !== null && cols !== 0) out = out.map((row) => (cols > 0 ? row.slice(0, cols) : row.slice(cols)));
      return out.length ? out : CALC;
    },
  },
  DROP: {
    min: 2, max: 3,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const rows = int(args[1], env);
      if (isError(rows)) return rows;
      const cols = args[2] === undefined || args[2] === null ? 0 : int(args[2], env);
      if (isError(cols)) return cols;
      let out = rows >= 0 ? source.slice(rows) : source.slice(0, rows);
      out = out.map((row) => (cols >= 0 ? row.slice(cols) : row.slice(0, cols)));
      return out.length && out[0].length ? out : CALC;
    },
  },
  VSTACK: {
    min: 1, max: 255,
    fn: (args, env) => {
      const parts = args.map((arg) => toMatrix(arg, env));
      const width = Math.max(...parts.map((part) => part[0]?.length ?? 0));
      return parts.flatMap((part) => part.map((row) => [...row, ...Array(width - row.length).fill(NA)])) as Matrix;
    },
  },
  HSTACK: {
    min: 1, max: 255,
    fn: (args, env) => {
      const parts = args.map((arg) => toMatrix(arg, env));
      const height = Math.max(...parts.map((part) => part.length));
      return Array.from({ length: height }, (_, r) => parts.flatMap((part) => part[r] ?? Array(part[0]?.length ?? 0).fill(NA))) as Matrix;
    },
  },
  TOCOL: {
    min: 1, max: 3,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const ignore = args[1] === undefined ? 0 : num(args[1], env);
      if (isError(ignore)) return ignore;
      const byCol = args[2] !== undefined && toBool(toScalar(args[2], env)) === true;
      const cells = byCol ? flattenCells([transpose(source)], env) : flattenCells([source], env);
      const kept = cells.filter((cell) => !((ignore === 1 || ignore === 3) && cell === null) && !((ignore === 2 || ignore === 3) && isError(cell)));
      return kept.map((cell) => [cell]);
    },
  },
  TOROW: {
    min: 1, max: 3,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const ignore = args[1] === undefined ? 0 : num(args[1], env);
      if (isError(ignore)) return ignore;
      const byCol = args[2] !== undefined && toBool(toScalar(args[2], env)) === true;
      const cells = byCol ? flattenCells([transpose(source)], env) : flattenCells([source], env);
      return [cells.filter((cell) => !((ignore === 1 || ignore === 3) && cell === null) && !((ignore === 2 || ignore === 3) && isError(cell)))];
    },
  },
  CHOOSECOLS: {
    min: 2, max: 255,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const width = source[0]?.length ?? 0;
      const picks: number[] = [];
      for (const arg of args.slice(1)) {
        const n = int(arg, env);
        if (isError(n)) return n;
        const index = n < 0 ? width + n : n - 1;
        if (n === 0 || index < 0 || index >= width) return VALUE;
        picks.push(index);
      }
      return source.map((row) => picks.map((index) => row[index] ?? null));
    },
  },
  CHOOSEROWS: {
    min: 2, max: 255,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const out: Matrix = [];
      for (const arg of args.slice(1)) {
        const n = int(arg, env);
        if (isError(n)) return n;
        const index = n < 0 ? source.length + n : n - 1;
        if (n === 0 || index < 0 || index >= source.length) return VALUE;
        out.push(source[index]);
      }
      return out;
    },
  },
  EXPAND: {
    min: 2, max: 4,
    fn: (args, env) => {
      const source = toMatrix(args[0], env);
      const rows = int(args[1], env);
      if (isError(rows)) return rows;
      const cols = args[2] === undefined || args[2] === null ? source[0]?.length ?? 0 : int(args[2], env);
      if (isError(cols)) return cols;
      const pad = args[3] === undefined ? NA : toScalar(args[3], env);
      if (rows < source.length || cols < (source[0]?.length ?? 0)) return VALUE;
      return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (source[r]?.[c] !== undefined ? source[r][c] : pad)));
    },
  },
  FORMULATEXT: {
    min: 1, max: 1,
    fn: (args, env) => {
      const ref = args[0];
      if (!isRef(ref)) return NA;
      const cell = env.wb.sheets[ref.sheet]?.cells[`${colName(ref.c1)}${ref.r1 + 1}`];
      return cell?.f !== undefined ? `=${cell.f}` : NA;
    },
  },
};
