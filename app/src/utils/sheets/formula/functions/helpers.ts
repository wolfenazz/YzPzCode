// Shared argument handling for the function library.

import { toMatrix, toScalar } from '../arrays';
import type { Env, FnDef } from '../env';
import {
  NUM, VALUE, compareScalars, isError, isMatrix, isRef, toBool, toNumber, toText,
  type Matrix, type Scalar, type Value, type XlError,
} from '../values';

export type FnTable = Record<string, FnDef>;

/** A function of scalar arguments: arrays are applied element by element, the first error wins. */
export function scalarFn(min: number, max: number, impl: (args: Scalar[], env: Env) => Value): FnDef {
  return {
    min,
    max,
    lift: 'all',
    fn: (args, env) => {
      const values = args.map((arg) => toScalar(arg, env));
      for (const value of values) if (isError(value)) return value;
      return impl(values, env);
    },
  };
}

/** Like `scalarFn`, but every argument is coerced to a number first (an omitted argument is 0). */
export function numFn(min: number, max: number, impl: (nums: number[], env: Env) => Scalar): FnDef {
  return scalarFn(min, max, (args, env) => {
    const nums: number[] = [];
    for (const arg of args) {
      const n = toNumber(arg);
      if (isError(n)) return n;
      nums.push(n);
    }
    const result = impl(nums, env);
    return typeof result === 'number' && !Number.isFinite(result) ? NUM : result;
  });
}

export const num = (value: Value, env: Env): number | XlError => toNumber(toScalar(value, env));
export const text = (value: Value, env: Env): string | XlError => toText(toScalar(value, env));
export const bool = (value: Value, env: Env): boolean | XlError => toBool(toScalar(value, env));

/** Whole number argument (truncated toward zero), or the error. */
export function int(value: Value, env: Env): number | XlError {
  const n = num(value, env);
  return isError(n) ? n : Math.trunc(n);
}

export interface Collected {
  nums: number[];
  error?: XlError;
  /** Cells that were numbers (for COUNT). */
  count: number;
}

/**
 * Numbers out of function arguments with SUM's rules: in a range or array only
 * numbers count (text and logicals are skipped); typed-in arguments are coerced.
 * `text` and `logical` switch on the *A variants (text counts as 0, TRUE as 1).
 */
export function collectNumbers(args: Value[], env: Env, options: { includeText?: boolean; skipErrors?: boolean } = {}): Collected {
  const nums: number[] = [];
  let count = 0;
  for (const arg of args) {
    if (isRef(arg) || isMatrix(arg)) {
      for (const row of toMatrix(arg, env)) {
        for (const cell of row) {
          if (typeof cell === 'number') {
            nums.push(cell);
            count += 1;
          } else if (isError(cell)) {
            if (!options.skipErrors) return { nums, error: cell, count };
          } else if (options.includeText) {
            if (typeof cell === 'string') nums.push(0);
            else if (typeof cell === 'boolean') nums.push(cell ? 1 : 0);
          }
        }
      }
    } else {
      const value = toScalar(arg, env);
      if (value === null) continue;
      if (isError(value)) {
        if (!options.skipErrors) return { nums, error: value, count };
        continue;
      }
      const n = toNumber(value);
      if (isError(n)) {
        if (options.includeText && typeof value === 'string') nums.push(0);
        else if (!options.skipErrors) return { nums, error: n, count };
      } else {
        nums.push(n);
        count += 1;
      }
    }
  }
  return { nums, count };
}

/** All cells of the arguments in row-major order. */
export function flattenCells(args: Value[], env: Env): Scalar[] {
  const out: Scalar[] = [];
  for (const arg of args) for (const row of toMatrix(arg, env)) for (const cell of row) out.push(cell);
  return out;
}

export const sortedCopy = (values: number[]): number[] => values.slice().sort((a, b) => a - b);

// ---- Criteria (COUNTIF, SUMIF, …) ----

const escapeRegex = (text: string): string => text.replace(/[.+^${}()|[\]\\]/g, '\\$&');

function wildcardRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '~' && i + 1 < pattern.length) {
      out += escapeRegex(pattern[i + 1]);
      i += 1;
    } else if (ch === '*') out += '[\\s\\S]*';
    else if (ch === '?') out += '[\\s\\S]';
    else out += escapeRegex(ch);
  }
  return new RegExp(`^${out}$`, 'i');
}

/** Builds the test a criterion such as `">5"`, `"apple*"` or `3` describes. */
export function makeCriterion(criterion: Scalar): (cell: Scalar) => boolean {
  if (typeof criterion === 'number') return (cell) => typeof cell === 'number' && cell === criterion;
  if (typeof criterion === 'boolean') return (cell) => typeof cell === 'boolean' && cell === criterion;
  if (criterion === null) return (cell) => cell === null || cell === 0 || cell === '';
  if (isError(criterion)) return (cell) => isError(cell) && cell.code === criterion.code;
  const match = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(criterion)!;
  const op = match[1] ?? '=';
  const operand = match[2];
  const asNumber = operand.trim() !== '' && !Number.isNaN(Number(operand)) ? Number(operand) : null;
  const wildcard = /[*?~]/.test(operand);
  const compare = (order: number): boolean => {
    switch (op) {
      case '<': return order < 0;
      case '>': return order > 0;
      case '<=': return order <= 0;
      case '>=': return order >= 0;
      case '<>': return order !== 0;
      default: return order === 0;
    }
  };
  if (asNumber !== null) {
    return (cell) => {
      if (typeof cell === 'number') return compare(cell < asNumber ? -1 : cell > asNumber ? 1 : 0);
      if (op === '<>' ) return true;
      return false;
    };
  }
  if (operand === '' && (op === '=' || op === '<>')) {
    return (cell) => (op === '=' ? cell === null || cell === '' : cell !== null && cell !== '');
  }
  if (wildcard && (op === '=' || op === '<>')) {
    const re = wildcardRegex(operand);
    return (cell) => {
      const hit = typeof cell === 'string' && re.test(cell);
      return op === '=' ? hit : !hit;
    };
  }
  const lowerOperand = operand.toLowerCase();
  return (cell) => {
    if (cell === null) return op === '<>' ? true : false;
    if (typeof cell !== 'string') return op === '<>';
    const l = cell.toLowerCase();
    return compare(l < lowerOperand ? -1 : l > lowerOperand ? 1 : 0);
  };
}

/** Pairs of (range, criterion) arguments to a row mask over equally sized ranges. */
export function criteriaMask(pairs: Value[], env: Env): boolean[] | XlError {
  let mask: boolean[] | null = null;
  let size = -1;
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const cells = flattenCells([pairs[i]], env);
    if (size >= 0 && cells.length !== size) return VALUE;
    size = cells.length;
    const criterion = toScalar(pairs[i + 1], env);
    const test = makeCriterion(criterion);
    const next = cells.map((cell) => !isError(cell) && test(cell));
    mask = mask ? mask.map((value, index) => value && next[index]) : next;
  }
  return mask ?? [];
}

export const compare = compareScalars;

export const matrixOfScalars = (rows: Scalar[][]): Matrix => rows;
