// Statistics and counting.

import { toMatrix, toScalar } from '../arrays';
import type { Env } from '../env';
import { DIV0, NA, NUM, isError, isMatrix, isRef, type Matrix, type Scalar, type Value } from '../values';
import { collectNumbers, criteriaMask, flattenCells, int, num, numFn, sortedCopy, type FnTable } from './helpers';

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]): number => sum(xs) / xs.length;

function variance(xs: number[], sample: boolean): number | null {
  const n = xs.length;
  if (n < (sample ? 2 : 1)) return null;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (sample ? n - 1 : n);
}

/** Linear interpolation percentile of sorted values, `k` in 0..1 (inclusive method). */
function percentileInc(sorted: number[], k: number): number {
  const pos = k * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function percentileExc(sorted: number[], k: number): number | null {
  const n = sorted.length;
  const pos = k * (n + 1) - 1;
  if (pos < 0 || pos > n - 1) return null;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const erf = (x: number): number => {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
};

const normCdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2));

/** Acklam's rational approximation of the inverse normal CDF. */
function normInv(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Two equally long numeric columns (pairs with a non-number are dropped). */
function pairs(a: Value, b: Value, env: Env): { xs: number[]; ys: number[] } | null {
  const left = flattenCells([a], env);
  const right = flattenCells([b], env);
  if (left.length !== right.length) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  left.forEach((x, i) => {
    const y = right[i];
    if (typeof x === 'number' && typeof y === 'number') {
      xs.push(x);
      ys.push(y);
    }
  });
  return { xs, ys };
}

function regression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

const aggregate = (impl: (nums: number[]) => Scalar, options: { includeText?: boolean } = {}) => ({
  min: 1,
  max: 255,
  fn: (args: Value[], env: Env): Value => {
    const { nums, error } = collectNumbers(args, env, options);
    if (error) return error;
    return impl(nums);
  },
});

/** Numbers of a range argument for LARGE, SMALL, PERCENTILE and friends. */
function rangeNumbers(arg: Value, env: Env): number[] | ReturnType<typeof toScalar> {
  const { nums, error } = collectNumbers([arg], env);
  return error ?? nums;
}

function rankOf(x: number, values: number[], descending: boolean): { first: number; count: number } | null {
  let better = 0;
  let equal = 0;
  for (const v of values) {
    if (v === x) equal += 1;
    else if (descending ? v > x : v < x) better += 1;
  }
  return equal === 0 ? null : { first: better + 1, count: equal };
}

export const STAT_FUNCTIONS: FnTable = {
  AVERAGE: aggregate((nums) => (nums.length ? mean(nums) : DIV0)),
  AVERAGEA: aggregate((nums) => (nums.length ? mean(nums) : DIV0), { includeText: true }),
  MIN: aggregate((nums) => (nums.length ? Math.min(...nums) : 0)),
  MAX: aggregate((nums) => (nums.length ? Math.max(...nums) : 0)),
  MINA: aggregate((nums) => (nums.length ? Math.min(...nums) : 0), { includeText: true }),
  MAXA: aggregate((nums) => (nums.length ? Math.max(...nums) : 0), { includeText: true }),
  MEDIAN: aggregate((nums) => {
    if (!nums.length) return NUM;
    const sorted = sortedCopy(nums);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }),
  MODE: aggregate((nums) => modeOf(nums)),
  'MODE.SNGL': aggregate((nums) => modeOf(nums)),
  GEOMEAN: aggregate((nums) => (!nums.length || nums.some((n) => n <= 0) ? NUM : Math.exp(mean(nums.map(Math.log))))),
  HARMEAN: aggregate((nums) => (!nums.length || nums.some((n) => n <= 0) ? NUM : nums.length / sum(nums.map((n) => 1 / n)))),
  DEVSQ: aggregate((nums) => { if (!nums.length) return NUM; const m = mean(nums); return sum(nums.map((n) => (n - m) ** 2)); }),
  AVEDEV: aggregate((nums) => { if (!nums.length) return NUM; const m = mean(nums); return mean(nums.map((n) => Math.abs(n - m))); }),
  STDEV: aggregate((nums) => { const v = variance(nums, true); return v === null ? DIV0 : Math.sqrt(v); }),
  'STDEV.S': aggregate((nums) => { const v = variance(nums, true); return v === null ? DIV0 : Math.sqrt(v); }),
  STDEVP: aggregate((nums) => { const v = variance(nums, false); return v === null ? DIV0 : Math.sqrt(v); }),
  'STDEV.P': aggregate((nums) => { const v = variance(nums, false); return v === null ? DIV0 : Math.sqrt(v); }),
  VAR: aggregate((nums) => variance(nums, true) ?? DIV0),
  'VAR.S': aggregate((nums) => variance(nums, true) ?? DIV0),
  VARP: aggregate((nums) => variance(nums, false) ?? DIV0),
  'VAR.P': aggregate((nums) => variance(nums, false) ?? DIV0),
  SKEW: aggregate((nums) => {
    const n = nums.length;
    if (n < 3) return DIV0;
    const m = mean(nums);
    const s = Math.sqrt(variance(nums, true)!);
    if (s === 0) return DIV0;
    return (n / ((n - 1) * (n - 2))) * sum(nums.map((x) => ((x - m) / s) ** 3));
  }),
  KURT: aggregate((nums) => {
    const n = nums.length;
    if (n < 4) return DIV0;
    const m = mean(nums);
    const s = Math.sqrt(variance(nums, true)!);
    if (s === 0) return DIV0;
    const fourth = sum(nums.map((x) => ((x - m) / s) ** 4));
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * fourth - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  }),
  COUNT: { min: 1, max: 255, fn: (args, env) => collectNumbers(args, env, { skipErrors: true }).count },
  COUNTA: {
    min: 1, max: 255,
    fn: (args, env) => {
      let count = 0;
      for (const arg of args) {
        if (isRef(arg) || isMatrix(arg)) for (const row of toMatrix(arg, env)) for (const cell of row) { if (cell !== null) count += 1; }
        else if (toScalar(arg, env) !== null) count += 1;
      }
      return count;
    },
  },
  COUNTBLANK: { min: 1, max: 1, fn: (args, env) => flattenCells(args, env).filter((cell) => cell === null || cell === '').length },
  COUNTIF: {
    min: 2, max: 2,
    fn: (args, env) => {
      const mask = criteriaMask(args, env);
      return isError(mask) ? mask : mask.filter(Boolean).length;
    },
  },
  COUNTIFS: {
    min: 2, max: 254,
    fn: (args, env) => {
      const mask = criteriaMask(args, env);
      return isError(mask) ? mask : mask.filter(Boolean).length;
    },
  },
  AVERAGEIF: {
    min: 2, max: 3,
    fn: (args, env) => {
      const mask = criteriaMask([args[0], args[1]], env);
      if (isError(mask)) return mask;
      const cells = flattenCells([args[2] ?? args[0]], env);
      const picked = cells.filter((cell, i) => mask[i] && typeof cell === 'number') as number[];
      return picked.length ? mean(picked) : DIV0;
    },
  },
  AVERAGEIFS: {
    min: 3, max: 255,
    fn: (args, env) => {
      const mask = criteriaMask(args.slice(1), env);
      if (isError(mask)) return mask;
      const cells = flattenCells([args[0]], env);
      const picked = cells.filter((cell, i) => mask[i] && typeof cell === 'number') as number[];
      return picked.length ? mean(picked) : DIV0;
    },
  },
  MAXIFS: {
    min: 3, max: 255,
    fn: (args, env) => {
      const mask = criteriaMask(args.slice(1), env);
      if (isError(mask)) return mask;
      const picked = flattenCells([args[0]], env).filter((cell, i) => mask[i] && typeof cell === 'number') as number[];
      return picked.length ? Math.max(...picked) : 0;
    },
  },
  MINIFS: {
    min: 3, max: 255,
    fn: (args, env) => {
      const mask = criteriaMask(args.slice(1), env);
      if (isError(mask)) return mask;
      const picked = flattenCells([args[0]], env).filter((cell, i) => mask[i] && typeof cell === 'number') as number[];
      return picked.length ? Math.min(...picked) : 0;
    },
  },
  LARGE: {
    min: 2, max: 2,
    fn: (args, env) => {
      const nums = rangeNumbers(args[0], env);
      if (!Array.isArray(nums)) return nums as Scalar;
      const k = int(args[1], env);
      if (isError(k)) return k;
      if (k < 1 || k > nums.length) return NUM;
      return sortedCopy(nums)[nums.length - k];
    },
  },
  SMALL: {
    min: 2, max: 2,
    fn: (args, env) => {
      const nums = rangeNumbers(args[0], env);
      if (!Array.isArray(nums)) return nums as Scalar;
      const k = int(args[1], env);
      if (isError(k)) return k;
      if (k < 1 || k > nums.length) return NUM;
      return sortedCopy(nums)[k - 1];
    },
  },
  RANK: rankFn('eq'),
  'RANK.EQ': rankFn('eq'),
  'RANK.AVG': rankFn('avg'),
  PERCENTILE: percentileFn(false),
  'PERCENTILE.INC': percentileFn(false),
  'PERCENTILE.EXC': percentileFn(true),
  QUARTILE: quartileFn(false),
  'QUARTILE.INC': quartileFn(false),
  'QUARTILE.EXC': quartileFn(true),
  PERCENTRANK: {
    min: 2, max: 3,
    fn: (args, env) => {
      const nums = rangeNumbers(args[0], env);
      if (!Array.isArray(nums)) return nums as Scalar;
      const x = num(args[1], env);
      if (isError(x)) return x;
      const sorted = sortedCopy(nums);
      if (!sorted.length || x < sorted[0] || x > sorted[sorted.length - 1]) return NA;
      const below = sorted.filter((v) => v < x).length;
      const exact = sorted.indexOf(x);
      const rank = exact >= 0 ? below / (sorted.length - 1) : (() => {
        const lo = sorted[below - 1];
        const hi = sorted[below];
        return (below - 1 + (x - lo) / (hi - lo)) / (sorted.length - 1);
      })();
      return Math.floor(rank * 1000) / 1000;
    },
  },
  CORREL: {
    min: 2, max: 2,
    fn: (args, env) => {
      const p = pairs(args[0], args[1], env);
      if (!p) return NA;
      const r = regression(p.xs, p.ys);
      if (!r) return DIV0;
      return Math.sign(r.slope) * Math.sqrt(r.r2);
    },
  },
  RSQ: {
    min: 2, max: 2,
    fn: (args, env) => {
      const p = pairs(args[1], args[0], env);
      const r = p && regression(p.xs, p.ys);
      return r ? r.r2 : p ? DIV0 : NA;
    },
  },
  SLOPE: {
    min: 2, max: 2,
    fn: (args, env) => {
      const p = pairs(args[1], args[0], env);
      const r = p && regression(p.xs, p.ys);
      return r ? r.slope : p ? DIV0 : NA;
    },
  },
  INTERCEPT: {
    min: 2, max: 2,
    fn: (args, env) => {
      const p = pairs(args[1], args[0], env);
      const r = p && regression(p.xs, p.ys);
      return r ? r.intercept : p ? DIV0 : NA;
    },
  },
  FORECAST: forecastFn(),
  'FORECAST.LINEAR': forecastFn(),
  'COVARIANCE.P': covarianceFn(false),
  'COVARIANCE.S': covarianceFn(true),
  'NORM.S.DIST': { min: 2, max: 2, fn: (args, env) => { const z = num(args[0], env); if (isError(z)) return z; return toScalar(args[1], env) === true ? normCdf(z) : Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); } },
  'NORM.DIST': {
    min: 4, max: 4,
    fn: (args, env) => {
      const x = num(args[0], env);
      const mu = num(args[1], env);
      const sigma = num(args[2], env);
      if (isError(x)) return x;
      if (isError(mu)) return mu;
      if (isError(sigma)) return sigma;
      if (sigma <= 0) return NUM;
      const z = (x - mu) / sigma;
      return toScalar(args[3], env) === true ? normCdf(z) : Math.exp(-z * z / 2) / (sigma * Math.sqrt(2 * Math.PI));
    },
  },
  NORMSDIST: numFn(1, 1, ([z]) => normCdf(z)),
  'NORM.S.INV': numFn(1, 1, ([p]) => (p <= 0 || p >= 1 ? NUM : normInv(p))),
  NORMSINV: numFn(1, 1, ([p]) => (p <= 0 || p >= 1 ? NUM : normInv(p))),
  'NORM.INV': numFn(3, 3, ([p, mu, sigma]) => (p <= 0 || p >= 1 || sigma <= 0 ? NUM : mu + sigma * normInv(p))),
  STANDARDIZE: numFn(3, 3, ([x, mu, sigma]) => (sigma <= 0 ? NUM : (x - mu) / sigma)),
  FREQUENCY: {
    min: 2, max: 2,
    fn: (args, env) => {
      const data = flattenCells([args[0]], env).filter((c): c is number => typeof c === 'number');
      const bins = flattenCells([args[1]], env).filter((c): c is number => typeof c === 'number').sort((a, b) => a - b);
      const counts = new Array(bins.length + 1).fill(0) as number[];
      for (const value of data) {
        let index = bins.findIndex((bin) => value <= bin);
        if (index < 0) index = bins.length;
        counts[index] += 1;
      }
      return counts.map((count) => [count]) as Matrix;
    },
  },
};

function modeOf(nums: number[]): Scalar {
  const counts = new Map<number, number>();
  let best = 0;
  let result: number | null = null;
  for (const n of nums) {
    const count = (counts.get(n) ?? 0) + 1;
    counts.set(n, count);
    if (count > best) {
      best = count;
      result = n;
    }
  }
  return best < 2 || result === null ? NA : result;
}

function rankFn(mode: 'eq' | 'avg'): { min: number; max: number; fn: (args: Value[], env: Env) => Value } {
  return {
    min: 2, max: 3,
    fn: (args, env) => {
      const x = num(args[0], env);
      if (isError(x)) return x;
      const values = flattenCells([args[1]], env).filter((c): c is number => typeof c === 'number');
      const ascending = args[2] !== undefined && toScalar(args[2], env) !== null && Number(toScalar(args[2], env)) !== 0;
      const result = rankOf(x, values, !ascending);
      if (!result) return NA;
      return mode === 'eq' ? result.first : result.first + (result.count - 1) / 2;
    },
  };
}

function percentileFn(exclusive: boolean): { min: number; max: number; fn: (args: Value[], env: Env) => Value } {
  return {
    min: 2, max: 2,
    fn: (args, env) => {
      const nums = rangeNumbers(args[0], env);
      if (!Array.isArray(nums)) return nums as Scalar;
      const k = num(args[1], env);
      if (isError(k)) return k;
      if (!nums.length || k < 0 || k > 1) return NUM;
      const sorted = sortedCopy(nums);
      return exclusive ? percentileExc(sorted, k) ?? NUM : percentileInc(sorted, k);
    },
  };
}

function quartileFn(exclusive: boolean): { min: number; max: number; fn: (args: Value[], env: Env) => Value } {
  return {
    min: 2, max: 2,
    fn: (args, env) => {
      const nums = rangeNumbers(args[0], env);
      if (!Array.isArray(nums)) return nums as Scalar;
      const q = int(args[1], env);
      if (isError(q)) return q;
      if (!nums.length || q < (exclusive ? 1 : 0) || q > (exclusive ? 3 : 4)) return NUM;
      const sorted = sortedCopy(nums);
      return exclusive ? percentileExc(sorted, q / 4) ?? NUM : percentileInc(sorted, q / 4);
    },
  };
}

function forecastFn(): { min: number; max: number; fn: (args: Value[], env: Env) => Value } {
  return {
    min: 3, max: 3,
    fn: (args, env) => {
      const x = num(args[0], env);
      if (isError(x)) return x;
      const p = pairs(args[2], args[1], env);
      const r = p && regression(p.xs, p.ys);
      if (!r) return p ? DIV0 : NA;
      return r.intercept + r.slope * x;
    },
  };
}

function covarianceFn(sample: boolean): { min: number; max: number; fn: (args: Value[], env: Env) => Value } {
  return {
    min: 2, max: 2,
    fn: (args, env) => {
      const p = pairs(args[0], args[1], env);
      if (!p) return NA;
      const n = p.xs.length;
      if (n < (sample ? 2 : 1)) return DIV0;
      const mx = mean(p.xs);
      const my = mean(p.ys);
      let total = 0;
      for (let i = 0; i < n; i += 1) total += (p.xs[i] - mx) * (p.ys[i] - my);
      return total / (sample ? n - 1 : n);
    },
  };
}

