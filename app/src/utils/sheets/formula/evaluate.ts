// Evaluates a parsed formula against a workbook. The calculation order and the
// memo table live in `recalc.ts`; this file only knows how to evaluate nodes.

import { parseRange, parseSheetRef } from '../address';
import type { Workbook } from '../types';
import { broadcast, isMultiCell, toMatrix, toScalar } from './arrays';
import { sheetIndex, type Env } from './env';
import { FUNCTIONS } from './functions';
import { parseFormula, type Node } from './parse';
import {
  CALC, DIV0, NAME, NUM, REF, VALUE, compareScalars, errorOf, isError, isLambda, isMatrix, isRef, toNumber, toText,
  type LambdaValue, type Scalar, type Value,
} from './values';

export { sheetIndex, toMatrix, toScalar, broadcast, isMultiCell };
export type { Env };

const MAX_DEPTH = 64;

const finite = (n: number): Scalar => (Number.isFinite(n) ? n : NUM);

function arithmetic(op: string, a: Scalar, b: Scalar): Scalar {
  if (isError(a)) return a;
  if (isError(b)) return b;
  if (op === '&') {
    const x = toText(a);
    const y = toText(b);
    if (isError(x)) return x;
    if (isError(y)) return y;
    return x + y;
  }
  if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
    const order = compareScalars(a, b);
    switch (op) {
      case '=': return order === 0;
      case '<>': return order !== 0;
      case '<': return order < 0;
      case '>': return order > 0;
      case '<=': return order <= 0;
      default: return order >= 0;
    }
  }
  const x = toNumber(a);
  if (isError(x)) return x;
  const y = toNumber(b);
  if (isError(y)) return y;
  switch (op) {
    case '+': return finite(x + y);
    case '-': return finite(x - y);
    case '*': return finite(x * y);
    case '/': return y === 0 ? DIV0 : finite(x / y);
    case '^': {
      if (x === 0 && y === 0) return NUM;
      if (x === 0 && y < 0) return DIV0;
      const result = x ** y;
      return Number.isNaN(result) ? NUM : finite(result);
    }
    default: return VALUE;
  }
}

type TableInfo = Workbook['sheets'][number]['tables'][number];

function tableRange(env: Env, tableName: string, spec: string): Value {
  const lower = tableName.toLowerCase();
  let found: { table: TableInfo; sheet: number } | null = null;
  env.wb.sheets.forEach((sheet, index) => {
    for (const table of sheet.tables) if (table.name.toLowerCase() === lower) found = { table, sheet: index };
  });
  if (!found) {
    // `[@Col]` inside a table: the table that holds the formula cell.
    if (tableName) return REF;
    for (const table of env.wb.sheets[env.sheet].tables) {
      const range = parseRange(table.ref);
      if (range && env.row >= range.r1 && env.row <= range.r2 && env.col >= range.c1 && env.col <= range.c2) found = { table, sheet: env.sheet };
    }
    if (!found) return REF;
  }
  const { table, sheet } = found as { table: TableInfo; sheet: number };
  const range = parseRange(table.ref);
  if (!range) return REF;
  const first = table.header ? range.r1 + 1 : range.r1;
  const last = table.totals ? range.r2 - 1 : range.r2;
  const inner = spec.replace(/^\[|\]$/g, '').trim();
  let area: 'data' | 'all' | 'headers' | 'totals' | 'row' = 'data';
  let column: string | null = null;
  const parts = inner.match(/\[[^\]]*\]|[^,[\]]+/g)?.map((part) => part.replace(/^\[|\]$/g, '').trim()).filter(Boolean) ?? [];
  for (const part of parts) {
    const lowerPart = part.toLowerCase();
    if (lowerPart === '#all') area = 'all';
    else if (lowerPart === '#headers') area = 'headers';
    else if (lowerPart === '#totals') area = 'totals';
    else if (lowerPart === '#data') area = 'data';
    else if (lowerPart === '#this row') area = 'row';
    else if (part.startsWith('@')) {
      area = 'row';
      column = part.slice(1).replace(/^\[|\]$/g, '');
    } else column = part;
  }
  let c1 = range.c1;
  let c2 = range.c2;
  if (column !== null && column !== '') {
    const index = table.columns.findIndex((name) => name.toLowerCase() === column!.toLowerCase());
    if (index < 0) return REF;
    c1 = range.c1 + index;
    c2 = c1;
  }
  let r1 = first;
  let r2 = last;
  if (area === 'all') { r1 = range.r1; r2 = range.r2; }
  else if (area === 'headers') { r1 = range.r1; r2 = range.r1; }
  else if (area === 'totals') { r1 = range.r2; r2 = range.r2; }
  else if (area === 'row') { r1 = env.row; r2 = env.row; }
  return { kind: 'ref', sheet, r1, c1, r2, c2 };
}

function resolveName(name: string, env: Env): Value {
  const lower = name.toLowerCase();
  if (env.vars.has(lower)) return env.vars.get(lower) as Value;
  const names = env.wb.names;
  const entry = names.find((n) => n.name.toLowerCase() === lower && n.scope === env.sheet) ?? names.find((n) => n.name.toLowerCase() === lower && n.scope === undefined);
  if (entry) {
    const ref = parseSheetRef(entry.ref);
    if (ref) {
      const sheet = ref.sheet === undefined ? env.sheet : sheetIndex(env.wb, ref.sheet);
      if (sheet < 0) return REF;
      return { kind: 'ref', sheet, ...ref.range };
    }
    if (env.depth > MAX_DEPTH) return VALUE;
    try {
      return evaluate(parseFormula(entry.ref), { ...env, depth: env.depth + 1, vars: new Map() });
    } catch {
      return NAME;
    }
  }
  // A table's name on its own is its data body.
  for (const sheet of env.wb.sheets) {
    const table = sheet.tables.find((t) => t.name.toLowerCase() === lower);
    if (table) return tableRange(env, table.name, '[]');
  }
  return NAME;
}

export function invokeLambda(lambda: LambdaValue, args: Value[], env: Env): Value {
  const closure = lambda.closure as Env;
  const vars = new Map(closure.vars);
  lambda.params.forEach((param, index) => vars.set(param.toLowerCase(), args[index] ?? null));
  if (env.depth > MAX_DEPTH) return CALC;
  return evaluate(lambda.body as Node, { ...closure, row: env.row, col: env.col, vars, depth: env.depth + 1 });
}

function callFunction(name: string, args: Node[], env: Env): Value {
  const local = env.vars.get(name.toLowerCase());
  if (local && isLambda(local)) {
    if (env.depth > MAX_DEPTH) return CALC;
    return invokeLambda(local, args.map((arg) => evaluate(arg, env)), env);
  }
  const def = FUNCTIONS[name];
  if (!def) return NAME;
  if (args.length < def.min || args.length > def.max) return VALUE;
  if (def.lazy) return def.lazy(args, env, (node, scope) => evaluate(node, scope ?? env));
  const values = args.map((arg) => (arg.t === 'empty' ? (null as Scalar) : evaluate(arg, env)));
  const fn = def.fn!;
  if (def.lift) {
    const indexes = def.lift === 'all' ? values.map((_, i) => i) : def.lift;
    const lifted = indexes.filter((i) => i < values.length && isMultiCell(values[i]));
    if (lifted.length > 0) {
      const operands = lifted.map((i) => toMatrix(values[i], env));
      return broadcast(operands, (picked) => {
        const call = values.slice();
        lifted.forEach((position, k) => { call[position] = picked[k]; });
        const result = fn(call, env);
        return isMatrix(result) || isRef(result) || isLambda(result) ? toScalar(result, env) : result;
      });
    }
  }
  return fn(values, env);
}

/** Evaluates one node. Ranges stay references until a function needs their cells. */
export function evaluate(node: Node, env: Env): Value {
  switch (node.t) {
    case 'num': return node.v;
    case 'str': return node.v;
    case 'bool': return node.v;
    case 'err': return errorOf(node.v);
    case 'empty': return null;
    case 'ref': {
      const sheet = node.sheet === undefined ? env.sheet : sheetIndex(env.wb, node.sheet);
      if (sheet < 0) return REF;
      const { r1, c1, r2, c2 } = node.ref;
      return { kind: 'ref', sheet, r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
    }
    case 'name': return resolveName(node.name, env);
    case 'struct': return tableRange(env, node.table, node.spec);
    case 'call': return callFunction(node.name, node.args, env);
    case 'un': {
      const value = evaluate(node.arg, env);
      const apply = (v: Scalar): Scalar => {
        if (node.op === '+') return v;
        const n = toNumber(v);
        return isError(n) ? n : -n;
      };
      return isMultiCell(value) ? toMatrix(value, env).map((row) => row.map(apply)) : apply(toScalar(value, env));
    }
    case 'pct': {
      const value = evaluate(node.arg, env);
      const apply = (v: Scalar): Scalar => {
        const n = toNumber(v);
        return isError(n) ? n : n / 100;
      };
      return isMultiCell(value) ? toMatrix(value, env).map((row) => row.map(apply)) : apply(toScalar(value, env));
    }
    case 'spill': {
      const target = evaluate(node.arg, env);
      if (!isRef(target)) return VALUE;
      const size = env.spillOf(target.sheet, target.r1, target.c1);
      if (!size) return REF;
      return { kind: 'ref', sheet: target.sheet, r1: target.r1, c1: target.c1, r2: target.r1 + size.rows - 1, c2: target.c1 + size.cols - 1 };
    }
    case 'bin': {
      const left = evaluate(node.l, env);
      const right = evaluate(node.r, env);
      if (isLambda(left) || isLambda(right)) return VALUE;
      if (isMultiCell(left) || isMultiCell(right)) {
        return broadcast([toMatrix(left, env), toMatrix(right, env)], ([a, b]) => arithmetic(node.op, a, b));
      }
      return arithmetic(node.op, toScalar(left, env), toScalar(right, env));
    }
    case 'range': {
      const left = evaluate(node.l, env);
      const right = evaluate(node.r, env);
      if (!isRef(left) || !isRef(right)) return isError(left) ? left : isError(right) ? right : VALUE;
      if (left.sheet !== right.sheet) return REF;
      return {
        kind: 'ref',
        sheet: left.sheet,
        r1: Math.min(left.r1, right.r1),
        c1: Math.min(left.c1, right.c1),
        r2: Math.max(left.r2, right.r2),
        c2: Math.max(left.c2, right.c2),
      };
    }
    case 'arr':
      return node.rows.map((row) => row.map((cell) => toScalar(evaluate(cell, env), env)));
    default:
      return VALUE;
  }
}
