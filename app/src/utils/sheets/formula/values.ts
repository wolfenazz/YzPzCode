// Values the formula engine passes around, and Excel's coercion rules.

import { parseDateText } from '../dates';
import type { ErrorCode } from '../types';

export class XlError {
  constructor(readonly code: ErrorCode) {}
  toString(): string {
    return this.code;
  }
}

export const DIV0 = new XlError('#DIV/0!');
export const REF = new XlError('#REF!');
export const NAME = new XlError('#NAME?');
export const VALUE = new XlError('#VALUE!');
export const NA = new XlError('#N/A');
export const SPILL = new XlError('#SPILL!');
export const NUM = new XlError('#NUM!');
export const NULLERR = new XlError('#NULL!');
export const CALC = new XlError('#CALC!');

const BY_CODE: Record<string, XlError> = {
  '#DIV/0!': DIV0, '#REF!': REF, '#NAME?': NAME, '#VALUE!': VALUE, '#N/A': NA, '#SPILL!': SPILL, '#NUM!': NUM, '#NULL!': NULLERR, '#CALC!': CALC,
};
export const errorOf = (code: ErrorCode): XlError => BY_CODE[code] ?? VALUE;

/** Empty cell is `null`. */
export type Scalar = number | string | boolean | null | XlError;
export type Matrix = Scalar[][];

/** A reference to cells; functions that care about where a value lives (ROW, OFFSET…) receive this. */
export interface RefValue {
  kind: 'ref';
  sheet: number;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

/** A LAMBDA: parameters, body and the scope it was made in. */
export interface LambdaValue {
  kind: 'lambda';
  params: string[];
  body: unknown;
  closure: unknown;
}

export type Value = Scalar | Matrix | RefValue | LambdaValue;

export const isError = (value: unknown): value is XlError => value instanceof XlError;
export const isMatrix = (value: unknown): value is Matrix => Array.isArray(value);
export const isRef = (value: unknown): value is RefValue => typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof XlError) && (value as RefValue).kind === 'ref';
export const isLambda = (value: unknown): value is LambdaValue => typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof XlError) && (value as LambdaValue).kind === 'lambda';

/** Excel's General rendering of a number: 15 significant digits, `E+` exponent when long. */
export function generalText(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e11 || abs < 1e-9) {
    const exp = n.toExponential(5).replace(/\.?0+e/, 'e');
    return exp.replace('e', 'E').replace(/E([+-])(\d)$/, 'E$10$2');
  }
  const rounded = Number(n.toPrecision(15));
  const text = String(rounded);
  return text.includes('e') ? rounded.toFixed(10).replace(/\.?0+$/, '') : text;
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
export function westernDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (ch) => String(ch.charCodeAt(0) - (ch.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660))).replace(/٫/g, '.').replace(/٬/g, ',');
}

/** Text that reads as a number: `12`, `1,234.5`, `-3e2`, `12%`, `$5`. Null when it is not one. */
export function parseNumberText(input: string): number | null {
  let text = westernDigits(input.trim());
  if (!text) return null;
  let percent = false;
  if (text.endsWith('%')) {
    percent = true;
    text = text.slice(0, -1).trim();
  }
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/^([+-]?)\s*[$€£¥]\s*/, '$1').replace(/\s*[$€£¥]$/, '');
  if (!/^[+-]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][+-]?\d+)?$/.test(text) || !/\d/.test(text)) return null;
  const value = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const signed = negative ? -value : value;
  return percent ? signed / 100 : signed;
}

/** Excel's coercion of a value used as a number. */
export function toNumber(value: Scalar): number | XlError {
  if (typeof value === 'number') return value;
  if (value === null) return 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (isError(value)) return value;
  const parsed = parseNumberText(value);
  if (parsed !== null) return parsed;
  const date = parseDateText(value);
  if (date) return date.serial;
  return VALUE;
}

export function toText(value: Scalar): string | XlError {
  if (typeof value === 'string') return value;
  if (value === null) return '';
  if (typeof value === 'number') return generalText(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return value;
}

export function toBool(value: Scalar): boolean | XlError {
  if (typeof value === 'boolean') return value;
  if (value === null) return false;
  if (typeof value === 'number') return value !== 0;
  if (isError(value)) return value;
  const upper = value.trim().toUpperCase();
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;
  return VALUE;
}

/** Sort rank for mixed types: numbers, then text, then logicals; blanks sort with their coerced type. */
const typeRank = (value: Scalar): number => (typeof value === 'number' ? 0 : typeof value === 'string' ? 1 : typeof value === 'boolean' ? 2 : 3);

/** Excel comparison: numbers < text < logicals; text compares case-insensitively. Errors are the caller's problem. */
export function compareScalars(a: Scalar, b: Scalar): number {
  const x = a === null ? (typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0) : a;
  const y = b === null ? (typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0) : b;
  const rankA = typeRank(x);
  const rankB = typeRank(y);
  if (rankA !== rankB) return rankA < rankB ? -1 : 1;
  if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : x > y ? 1 : 0;
  if (typeof x === 'string' && typeof y === 'string') {
    const l = x.toLowerCase();
    const r = y.toLowerCase();
    return l < r ? -1 : l > r ? 1 : 0;
  }
  if (typeof x === 'boolean' && typeof y === 'boolean') return x === y ? 0 : x ? 1 : -1;
  return 0;
}

export const matrixSize = (matrix: Matrix): { rows: number; cols: number } => ({ rows: matrix.length, cols: matrix.reduce((max, row) => Math.max(max, row.length), 0) });

export function makeMatrix(rows: number, cols: number, fill: Scalar = null): Matrix {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}
