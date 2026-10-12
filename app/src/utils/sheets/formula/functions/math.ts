// Math and trigonometry.

import { toMatrix, toScalar } from '../arrays';
import { DIV0, NUM, VALUE, isError, toNumber, type Matrix, type Scalar } from '../values';
import { collectNumbers, criteriaMask, flattenCells, int, num, numFn, scalarFn, type FnTable } from './helpers';

/** Rounds half away from zero at `digits` decimal places (negative digits round to tens, hundreds…). */
export function roundHalfAway(x: number, digits: number): number {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  if (digits >= 0) {
    const text = abs.toPrecision(15);
    if (text.includes('e')) return sign * Number(abs.toFixed(Math.min(digits, 100)));
    return sign * Number(`${Math.round(Number(`${text}e${digits}`))}e-${digits}`);
  }
  const factor = 10 ** -digits;
  return sign * Math.round(abs / factor) * factor;
}

const roundDirected = (x: number, digits: number, up: boolean): number => {
  const factor = 10 ** digits;
  const scaled = Number((Math.abs(x) * factor).toPrecision(15));
  const rounded = up ? Math.ceil(scaled) : Math.floor(scaled);
  return Math.sign(x) * rounded / factor;
};

const factorial = (n: number): number => {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
};

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};

const mod = (n: number, d: number): number => n - d * Math.floor(n / d);

const unary = (f: (x: number) => number): ReturnType<typeof numFn> => numFn(1, 1, ([x]) => f(x));

export const MATH_FUNCTIONS: FnTable = {
  SUM: {
    min: 1, max: 255,
    fn: (args, env) => {
      const { nums, error } = collectNumbers(args, env);
      return error ?? nums.reduce((a, b) => a + b, 0);
    },
  },
  PRODUCT: {
    min: 1, max: 255,
    fn: (args, env) => {
      const { nums, error } = collectNumbers(args, env);
      if (error) return error;
      return nums.length ? nums.reduce((a, b) => a * b, 1) : 0;
    },
  },
  SUMSQ: {
    min: 1, max: 255,
    fn: (args, env) => {
      const { nums, error } = collectNumbers(args, env);
      return error ?? nums.reduce((a, b) => a + b * b, 0);
    },
  },
  SUMPRODUCT: {
    min: 1, max: 255,
    fn: (args, env) => {
      const arrays = args.map((arg) => toMatrix(arg, env));
      const rows = arrays[0].length;
      const cols = arrays[0][0]?.length ?? 0;
      if (arrays.some((m) => m.length !== rows || (m[0]?.length ?? 0) !== cols)) return VALUE;
      let total = 0;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          let product = 1;
          for (const m of arrays) {
            const cell = m[r][c];
            if (isError(cell)) return cell;
            product *= typeof cell === 'number' ? cell : 0;
          }
          total += product;
        }
      }
      return total;
    },
  },
  SUMIF: {
    min: 2, max: 3,
    fn: (args, env) => {
      const mask = criteriaMask([args[0], args[1]], env);
      if (isError(mask)) return mask;
      const sums = flattenCells([args[2] ?? args[0]], env);
      let total = 0;
      mask.forEach((hit, i) => {
        const cell = sums[i];
        if (hit && typeof cell === 'number') total += cell;
      });
      return total;
    },
  },
  SUMIFS: {
    min: 3, max: 255,
    fn: (args, env) => {
      const mask = criteriaMask(args.slice(1), env);
      if (isError(mask)) return mask;
      const sums = flattenCells([args[0]], env);
      if (sums.length !== mask.length) return VALUE;
      let total = 0;
      mask.forEach((hit, i) => {
        const cell = sums[i];
        if (hit && typeof cell === 'number') total += cell;
      });
      return total;
    },
  },
  ABS: unary(Math.abs),
  SIGN: unary(Math.sign),
  SQRT: numFn(1, 1, ([x]) => (x < 0 ? NUM : Math.sqrt(x))),
  SQRTPI: numFn(1, 1, ([x]) => (x < 0 ? NUM : Math.sqrt(x * Math.PI))),
  EXP: unary(Math.exp),
  LN: numFn(1, 1, ([x]) => (x <= 0 ? NUM : Math.log(x))),
  LOG10: numFn(1, 1, ([x]) => (x <= 0 ? NUM : Math.log10(x))),
  LOG: numFn(1, 2, ([x, base]) => (x <= 0 || (base !== undefined && base <= 0) ? NUM : base === 1 ? DIV0 : Math.log(x) / Math.log(base ?? 10))),
  PI: { min: 0, max: 0, fn: () => Math.PI },
  SIN: unary(Math.sin),
  COS: unary(Math.cos),
  TAN: unary(Math.tan),
  ASIN: numFn(1, 1, ([x]) => (Math.abs(x) > 1 ? NUM : Math.asin(x))),
  ACOS: numFn(1, 1, ([x]) => (Math.abs(x) > 1 ? NUM : Math.acos(x))),
  ATAN: unary(Math.atan),
  ATAN2: numFn(2, 2, ([x, y]) => (x === 0 && y === 0 ? DIV0 : Math.atan2(y, x))),
  SINH: unary(Math.sinh),
  COSH: unary(Math.cosh),
  TANH: unary(Math.tanh),
  DEGREES: unary((x) => (x * 180) / Math.PI),
  RADIANS: unary((x) => (x * Math.PI) / 180),
  INT: unary(Math.floor),
  TRUNC: numFn(1, 2, ([x, digits]) => {
    const factor = 10 ** (digits || 0);
    return Math.trunc(Number((x * factor).toPrecision(15))) / factor;
  }),
  ROUND: numFn(2, 2, ([x, digits]) => roundHalfAway(x, Math.trunc(digits))),
  ROUNDUP: numFn(2, 2, ([x, digits]) => roundDirected(x, Math.trunc(digits), true)),
  ROUNDDOWN: numFn(2, 2, ([x, digits]) => roundDirected(x, Math.trunc(digits), false)),
  MROUND: numFn(2, 2, ([x, m]) => (m === 0 ? 0 : x * m < 0 ? NUM : roundHalfAway(x / m, 0) * m)),
  CEILING: numFn(1, 2, ([x, s]) => {
    const step = s === undefined || s === 0 ? (x === 0 ? 0 : 1) : s;
    return step === 0 ? 0 : Math.ceil(Number((x / step).toPrecision(15))) * step;
  }),
  'CEILING.MATH': numFn(1, 3, ([x, s]) => {
    const step = Math.abs(s || 1);
    return Math.ceil(Number((x / step).toPrecision(15))) * step;
  }),
  FLOOR: numFn(1, 2, ([x, s]) => {
    const step = s === undefined || s === 0 ? (x === 0 ? 0 : 1) : s;
    return step === 0 ? 0 : Math.floor(Number((x / step).toPrecision(15))) * step;
  }),
  'FLOOR.MATH': numFn(1, 3, ([x, s]) => {
    const step = Math.abs(s || 1);
    return Math.floor(Number((x / step).toPrecision(15))) * step;
  }),
  EVEN: unary((x) => { const r = Math.ceil(Math.abs(x) / 2) * 2; return x < 0 ? -r : r; }),
  ODD: unary((x) => { const r = Math.abs(x); const o = Math.ceil((r - 1) / 2) * 2 + 1; return x < 0 ? -o : o; }),
  MOD: numFn(2, 2, ([n, d]) => (d === 0 ? DIV0 : mod(n, d))),
  QUOTIENT: numFn(2, 2, ([n, d]) => (d === 0 ? DIV0 : Math.trunc(n / d))),
  POWER: numFn(2, 2, ([x, y]) => (x === 0 && y === 0 ? NUM : x === 0 && y < 0 ? DIV0 : Number.isNaN(x ** y) ? NUM : x ** y)),
  FACT: numFn(1, 1, ([x]) => (x < 0 ? NUM : factorial(Math.trunc(x)))),
  FACTDOUBLE: numFn(1, 1, ([x]) => {
    if (x < 0) return NUM;
    let r = 1;
    for (let i = Math.trunc(x); i > 1; i -= 2) r *= i;
    return r;
  }),
  COMBIN: numFn(2, 2, ([n, k]) => (n < 0 || k < 0 || k > n ? NUM : Math.round(factorial(Math.trunc(n)) / (factorial(Math.trunc(k)) * factorial(Math.trunc(n) - Math.trunc(k)))))),
  PERMUT: numFn(2, 2, ([n, k]) => (n < 0 || k < 0 || k > n ? NUM : Math.round(factorial(Math.trunc(n)) / factorial(Math.trunc(n) - Math.trunc(k))))),
  GCD: { min: 1, max: 255, fn: (args, env) => { const { nums, error } = collectNumbers(args, env); return error ?? (nums.some((n) => n < 0) ? NUM : nums.map(Math.trunc).reduce(gcd, 0)); } },
  LCM: {
    min: 1, max: 255,
    fn: (args, env) => {
      const { nums, error } = collectNumbers(args, env);
      if (error) return error;
      if (nums.some((n) => n < 0)) return NUM;
      return nums.map(Math.trunc).reduce((a, b) => (a === 0 || b === 0 ? 0 : (a * b) / gcd(a, b)), 1);
    },
  },
  RAND: { min: 0, max: 0, fn: () => Math.random() },
  RANDBETWEEN: numFn(2, 2, ([lo, hi]) => (lo > hi ? NUM : Math.floor(Math.random() * (Math.floor(hi) - Math.ceil(lo) + 1)) + Math.ceil(lo))),
  RANDARRAY: {
    min: 0, max: 5,
    fn: (args, env) => {
      const rows = args[0] === undefined ? 1 : int(args[0], env);
      const cols = args[1] === undefined ? 1 : int(args[1], env);
      if (isError(rows)) return rows;
      if (isError(cols)) return cols;
      const lo = args[2] === undefined ? 0 : num(args[2], env);
      const hi = args[3] === undefined ? 1 : num(args[3], env);
      if (isError(lo)) return lo;
      if (isError(hi)) return hi;
      const whole = args[4] !== undefined && toScalar(args[4], env) === true;
      if (rows < 1 || cols < 1 || rows * cols > 100000) return VALUE;
      return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (whole ? Math.floor(Math.random() * (hi - lo + 1)) + lo : lo + Math.random() * (hi - lo))));
    },
  },
  SEQUENCE: {
    min: 1, max: 4,
    fn: (args, env) => {
      const rows = int(args[0], env);
      const cols = args[1] === undefined || args[1] === null ? 1 : int(args[1], env);
      const start = args[2] === undefined || args[2] === null ? 1 : num(args[2], env);
      const step = args[3] === undefined || args[3] === null ? 1 : num(args[3], env);
      if (isError(rows)) return rows;
      if (isError(cols)) return cols;
      if (isError(start)) return start;
      if (isError(step)) return step;
      if (rows < 1 || cols < 1 || rows * cols > 1000000) return VALUE;
      return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => start + (r * cols + c) * step));
    },
  },
  SUBTOTAL: {
    min: 2, max: 255,
    fn: (args, env) => {
      const code = int(args[0], env);
      if (isError(code)) return code;
      const { nums, error } = collectNumbers(args.slice(1), env);
      if (error) return error;
      const fn = code % 100;
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = nums.length ? sum / nums.length : DIV0;
      switch (fn) {
        case 1: return mean;
        case 2: return nums.length;
        case 3: return flattenCells(args.slice(1), env).filter((c) => c !== null && c !== '').length;
        case 4: return nums.length ? Math.max(...nums) : 0;
        case 5: return nums.length ? Math.min(...nums) : 0;
        case 6: return nums.reduce((a, b) => a * b, 1);
        case 7: case 8: {
          if (nums.length < 2) return DIV0;
          const m = sum / nums.length;
          const v = nums.reduce((a, b) => a + (b - m) ** 2, 0) / (fn === 7 ? nums.length - 1 : nums.length);
          return Math.sqrt(v);
        }
        case 9: return sum;
        case 10: case 11: {
          if (nums.length < 2) return DIV0;
          const m = sum / nums.length;
          return nums.reduce((a, b) => a + (b - m) ** 2, 0) / (fn === 10 ? nums.length - 1 : nums.length);
        }
        default: return VALUE;
      }
    },
  },
  AGGREGATE: {
    min: 3, max: 255,
    fn: (args, env) => {
      const code = int(args[0], env);
      if (isError(code)) return code;
      const { nums, error } = collectNumbers(args.slice(2), env, { skipErrors: true });
      if (error) return error;
      const sum = nums.reduce((a, b) => a + b, 0);
      switch (code) {
        case 1: return nums.length ? sum / nums.length : DIV0;
        case 2: case 3: return nums.length;
        case 4: return nums.length ? Math.max(...nums) : 0;
        case 5: return nums.length ? Math.min(...nums) : 0;
        case 6: return nums.reduce((a, b) => a * b, 1);
        case 9: return sum;
        case 12: {
          const sorted = nums.slice().sort((a, b) => a - b);
          if (!sorted.length) return NUM;
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }
        default: return VALUE;
      }
    },
  },
  MMULT: {
    min: 2, max: 2,
    fn: (args, env) => {
      const a = toMatrix(args[0], env);
      const b = toMatrix(args[1], env);
      const n = a[0]?.length ?? 0;
      if (n !== b.length) return VALUE;
      const out: Matrix = [];
      for (let r = 0; r < a.length; r += 1) {
        const line: Scalar[] = [];
        for (let c = 0; c < (b[0]?.length ?? 0); c += 1) {
          let sum = 0;
          for (let k = 0; k < n; k += 1) {
            const x = a[r][k];
            const y = b[k][c];
            if (typeof x !== 'number' || typeof y !== 'number') return VALUE;
            sum += x * y;
          }
          line.push(sum);
        }
        out.push(line);
      }
      return out;
    },
  },
  ROMAN: numFn(1, 2, ([x]) => {
    if (x < 0 || x > 3999) return VALUE;
    const table: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let n = Math.trunc(x);
    let out = '';
    for (const [value, glyph] of table) while (n >= value) { out += glyph; n -= value; }
    return out;
  }),
  BASE: scalarFn(2, 3, ([x, radix, min]) => {
    const n = toNumber(x);
    const r = toNumber(radix);
    if (isError(n) || isError(r) || r < 2 || r > 36 || n < 0) return NUM;
    const width = min === null || min === undefined ? 0 : Number(toNumber(min));
    return Math.trunc(n).toString(r).toUpperCase().padStart(width || 0, '0');
  }),
  DECIMAL: scalarFn(2, 2, ([s, radix]) => {
    const r = toNumber(radix);
    if (isError(r) || r < 2 || r > 36) return NUM;
    const value = parseInt(String(s), r);
    return Number.isNaN(value) ? NUM : value;
  }),
};

