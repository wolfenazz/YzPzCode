// The environment a formula is evaluated in, and the shape of a function definition.

import type { Workbook } from '../types';
import type { Node } from './parse';
import type { Scalar, Value } from './values';

export interface Env {
  wb: Workbook;
  /** Sheet the formula lives on. */
  sheet: number;
  row: number;
  col: number;
  /** Evaluated value of a cell. */
  cell: (sheet: number, row: number, col: number) => Scalar;
  /** Rows and columns in use on a sheet. */
  bounds: (sheet: number) => { rows: number; cols: number };
  /** Size of the dynamic array spilled from a cell, if any. */
  spillOf: (sheet: number, row: number, col: number) => { rows: number; cols: number } | null;
  now: Date;
  vars: Map<string, Value>;
  depth: number;
}

export interface FnDef {
  min: number;
  max: number;
  /** Receives unevaluated nodes (IF, IFERROR, LET…). */
  lazy?: (args: Node[], env: Env, evaluate: (node: Node, scope?: Env) => Value) => Value;
  fn?: (args: Value[], env: Env) => Value;
  /** Arguments that are applied element by element when given an array: indexes, or 'all'. */
  lift?: 'all' | number[];
}

export const sheetIndex = (wb: Workbook, name: string): number => {
  const lower = name.toLowerCase();
  return wb.sheets.findIndex((sheet) => sheet.name.toLowerCase() === lower);
};
