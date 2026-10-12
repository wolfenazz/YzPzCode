// Logical functions, conditionals, LET / LAMBDA and the array-lambda helpers.

import { broadcast, isMultiCell, toMatrix, toScalar } from '../arrays';
import { invokeLambda } from '../evaluate';
import {
  NA, VALUE, isError, isLambda, isMatrix, isRef, toBool, compareScalars,
  type Matrix, type Scalar, type Value,
} from '../values';
import { int, scalarFn, type FnTable } from './helpers';

/** Booleans out of AND / OR arguments: ranges skip text and blanks, typed arguments are coerced. */
function collectBooleans(args: Value[], env: Parameters<typeof toMatrix>[1]): boolean[] | Scalar {
  const out: boolean[] = [];
  for (const arg of args) {
    if (isRef(arg) || isMatrix(arg)) {
      for (const row of toMatrix(arg, env)) {
        for (const cell of row) {
          if (isError(cell)) return cell;
          if (typeof cell === 'boolean') out.push(cell);
          else if (typeof cell === 'number') out.push(cell !== 0);
        }
      }
    } else {
      const value = toScalar(arg, env);
      if (value === null) continue;
      const parsed = toBool(value);
      if (isError(parsed)) return parsed;
      out.push(parsed);
    }
  }
  return out.length ? out : VALUE;
}

export const LOGICAL_FUNCTIONS: FnTable = {
  TRUE: { min: 0, max: 0, fn: () => true },
  FALSE: { min: 0, max: 0, fn: () => false },
  NOT: scalarFn(1, 1, ([v]) => {
    const b = toBool(v);
    return isError(b) ? b : !b;
  }),
  AND: {
    min: 1, max: 255,
    fn: (args, env) => {
      const list = collectBooleans(args, env);
      return Array.isArray(list) ? list.every(Boolean) : (list as Scalar);
    },
  },
  OR: {
    min: 1, max: 255,
    fn: (args, env) => {
      const list = collectBooleans(args, env);
      return Array.isArray(list) ? list.some(Boolean) : (list as Scalar);
    },
  },
  XOR: {
    min: 1, max: 255,
    fn: (args, env) => {
      const list = collectBooleans(args, env);
      return Array.isArray(list) ? list.filter(Boolean).length % 2 === 1 : (list as Scalar);
    },
  },
  IF: {
    min: 2, max: 3,
    lazy: (args, env, ev) => {
      const condition = ev(args[0]);
      const pick = (index: number): Value => {
        if (index >= args.length) return false;
        return args[index].t === 'empty' ? 0 : ev(args[index]);
      };
      if (isMultiCell(condition)) {
        const whenTrue = toMatrix(pick(1), env);
        const whenFalse = toMatrix(pick(2), env);
        return broadcast([toMatrix(condition, env), whenTrue, whenFalse], ([c, x, y]) => {
          const test = toBool(c);
          return isError(test) ? test : test ? x : y;
        });
      }
      const test = toBool(toScalar(condition, env));
      if (isError(test)) return test;
      return test ? pick(1) : pick(2);
    },
  },
  IFS: {
    min: 2, max: 254,
    lazy: (args, env, ev) => {
      if (args.length % 2 !== 0) return NA;
      for (let i = 0; i < args.length; i += 2) {
        const test = toBool(toScalar(ev(args[i]), env));
        if (isError(test)) return test;
        if (test) return ev(args[i + 1]);
      }
      return NA;
    },
  },
  IFERROR: {
    min: 2, max: 2,
    lazy: (args, env, ev) => {
      const value = ev(args[0]);
      if (isMultiCell(value)) {
        const alt = toScalar(ev(args[1]), env);
        return toMatrix(value, env).map((row) => row.map((cell) => (isError(cell) ? alt : cell)));
      }
      const scalar = isLambda(value) ? VALUE : toScalar(value, env);
      return isError(scalar) ? ev(args[1]) : isRef(value) ? scalar : value;
    },
  },
  IFNA: {
    min: 2, max: 2,
    lazy: (args, env, ev) => {
      const value = ev(args[0]);
      if (isMultiCell(value)) {
        const alt = toScalar(ev(args[1]), env);
        return toMatrix(value, env).map((row) => row.map((cell) => (isError(cell) && cell.code === '#N/A' ? alt : cell)));
      }
      const scalar = toScalar(value, env);
      return isError(scalar) && scalar.code === '#N/A' ? ev(args[1]) : scalar;
    },
  },
  SWITCH: {
    min: 3, max: 255,
    lazy: (args, env, ev) => {
      const target = toScalar(ev(args[0]), env);
      if (isError(target)) return target;
      const hasDefault = (args.length - 1) % 2 === 1;
      const pairsEnd = hasDefault ? args.length - 1 : args.length;
      for (let i = 1; i + 1 < pairsEnd; i += 2) {
        const candidate = toScalar(ev(args[i]), env);
        if (isError(candidate)) return candidate;
        if (compareScalars(target, candidate) === 0) return ev(args[i + 1]);
      }
      return hasDefault ? ev(args[args.length - 1]) : NA;
    },
  },
  CHOOSE: {
    min: 2, max: 255,
    lazy: (args, env, ev) => {
      const index = toScalar(ev(args[0]), env);
      if (isError(index)) return index;
      const n = typeof index === 'number' ? Math.trunc(index) : Number(index);
      if (!Number.isFinite(n) || n < 1 || n >= args.length) return VALUE;
      return ev(args[n]);
    },
  },
  LET: {
    min: 3, max: 255,
    lazy: (args, env, ev) => {
      if (args.length % 2 === 0) return VALUE;
      const scope = { ...env, vars: new Map(env.vars) };
      for (let i = 0; i + 1 < args.length; i += 2) {
        const nameNode = args[i];
        if (nameNode.t !== 'name') return VALUE;
        scope.vars.set(nameNode.name.toLowerCase(), ev(args[i + 1], scope));
      }
      return ev(args[args.length - 1], scope);
    },
  },
  LAMBDA: {
    min: 1, max: 254,
    lazy: (args, env) => {
      const params: string[] = [];
      for (let i = 0; i < args.length - 1; i += 1) {
        const node = args[i];
        if (node.t !== 'name') return VALUE;
        params.push(node.name);
      }
      return { kind: 'lambda', params, body: args[args.length - 1], closure: env };
    },
  },
  MAP: {
    min: 2, max: 255,
    fn: (args, env) => {
      const lambda = args[args.length - 1];
      if (!isLambda(lambda)) return VALUE;
      const arrays = args.slice(0, -1).map((arg) => toMatrix(arg, env));
      return broadcast(arrays, (cells) => toScalar(invokeLambda(lambda, cells, env), env));
    },
  },
  REDUCE: {
    min: 3, max: 3,
    fn: (args, env) => {
      const lambda = args[2];
      if (!isLambda(lambda)) return VALUE;
      let accumulator: Value = toScalar(args[0], env);
      for (const row of toMatrix(args[1], env)) for (const cell of row) accumulator = invokeLambda(lambda, [accumulator, cell], env);
      return accumulator;
    },
  },
  SCAN: {
    min: 3, max: 3,
    fn: (args, env) => {
      const lambda = args[2];
      if (!isLambda(lambda)) return VALUE;
      let accumulator: Value = toScalar(args[0], env);
      return toMatrix(args[1], env).map((row) => row.map((cell) => {
        accumulator = toScalar(invokeLambda(lambda, [accumulator, cell], env), env);
        return accumulator as Scalar;
      }));
    },
  },
  BYROW: {
    min: 2, max: 2,
    fn: (args, env) => {
      const lambda = args[1];
      if (!isLambda(lambda)) return VALUE;
      return toMatrix(args[0], env).map((row) => [toScalar(invokeLambda(lambda, [[row]], env), env)]);
    },
  },
  BYCOL: {
    min: 2, max: 2,
    fn: (args, env) => {
      const lambda = args[1];
      if (!isLambda(lambda)) return VALUE;
      const matrix = toMatrix(args[0], env);
      const cols = matrix[0]?.length ?? 0;
      const out: Scalar[] = [];
      for (let c = 0; c < cols; c += 1) out.push(toScalar(invokeLambda(lambda, [matrix.map((row) => [row[c]])], env), env));
      return [out] as Matrix;
    },
  },
  MAKEARRAY: {
    min: 3, max: 3,
    fn: (args, env) => {
      const rows = int(args[0], env);
      const cols = int(args[1], env);
      const lambda = args[2];
      if (isError(rows)) return rows;
      if (isError(cols)) return cols;
      if (!isLambda(lambda) || rows < 1 || cols < 1 || rows * cols > 100000) return VALUE;
      return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => toScalar(invokeLambda(lambda, [r + 1, c + 1], env), env)));
    },
  },
};

