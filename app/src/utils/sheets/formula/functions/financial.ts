// Financial functions.

import { DIV0, NUM } from '../values';
import { collectNumbers, numFn, type FnTable } from './helpers';

/** Payment per period of an annuity. */
function payment(rate: number, nper: number, pv: number, fv: number, type: number): number {
  if (rate === 0) return -(pv + fv) / nper;
  const growth = (1 + rate) ** nper;
  return -(rate * (pv * growth + fv)) / ((1 + rate * type) * (growth - 1));
}

function futureValue(rate: number, nper: number, pmt: number, pv: number, type: number): number {
  if (rate === 0) return -(pv + pmt * nper);
  const growth = (1 + rate) ** nper;
  return -(pv * growth + (pmt * (1 + rate * type) * (growth - 1)) / rate);
}

/** Newton iteration with a bisection fallback for the rate that zeroes `f`. */
function solve(f: (rate: number) => number, guess: number): number | null {
  let rate = guess;
  for (let i = 0; i < 100; i += 1) {
    const value = f(rate);
    const step = 1e-6;
    const slope = (f(rate + step) - value) / step;
    if (!Number.isFinite(slope) || slope === 0) break;
    const next = rate - value / slope;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-10) return next;
    rate = next;
  }
  let lo = -0.99;
  let hi = 10;
  let fLo = f(lo);
  const fHi = f(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < 1e-10) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export const FINANCIAL_FUNCTIONS: FnTable = {
  PMT: numFn(3, 5, ([rate, nper, pv, fv, type]) => (nper === 0 ? NUM : payment(rate, nper, pv, fv ?? 0, type ? 1 : 0))),
  FV: numFn(3, 5, ([rate, nper, pmt, pv, type]) => futureValue(rate, nper, pmt, pv ?? 0, type ? 1 : 0)),
  PV: numFn(3, 5, ([rate, nper, pmt, fv, type]) => {
    const t = type ? 1 : 0;
    if (rate === 0) return -((fv ?? 0) + pmt * nper);
    const growth = (1 + rate) ** nper;
    return -((fv ?? 0) + (pmt * (1 + rate * t) * (growth - 1)) / rate) / growth;
  }),
  NPER: numFn(3, 5, ([rate, pmt, pv, fv, type]) => {
    const t = type ? 1 : 0;
    const future = fv ?? 0;
    if (rate === 0) return pmt === 0 ? NUM : -(pv + future) / pmt;
    const adjusted = pmt * (1 + rate * t);
    const numerator = adjusted - future * rate;
    const denominator = adjusted + pv * rate;
    if (numerator / denominator <= 0) return NUM;
    return Math.log(numerator / denominator) / Math.log(1 + rate);
  }),
  RATE: numFn(3, 6, ([nper, pmt, pv, fv, type, guess]) => {
    const t = type ? 1 : 0;
    const result = solve((rate) => pv * (1 + rate) ** nper + pmt * (1 + rate * t) * (((1 + rate) ** nper - 1) / (rate || 1e-12)) + (fv ?? 0), guess ?? 0.1);
    return result === null ? NUM : result;
  }),
  IPMT: numFn(4, 6, ([rate, per, nper, pv, fv, type]) => {
    if (per < 1 || per > nper) return NUM;
    const pmt = payment(rate, nper, pv, fv ?? 0, type ? 1 : 0);
    if (type && per === 1) return 0;
    const offset = type ? 2 : 1;
    const balance = futureValue(rate, per - offset, pmt, pv, type ? 1 : 0);
    return balance * rate;
  }),
  PPMT: numFn(4, 6, ([rate, per, nper, pv, fv, type]) => {
    if (per < 1 || per > nper) return NUM;
    const pmt = payment(rate, nper, pv, fv ?? 0, type ? 1 : 0);
    if (type && per === 1) return pmt;
    const offset = type ? 2 : 1;
    const interest = futureValue(rate, per - offset, pmt, pv, type ? 1 : 0) * rate;
    return pmt - interest;
  }),
  NPV: {
    min: 2, max: 255,
    fn: (args, env) => {
      const rate = collectNumbers([args[0]], env);
      if (rate.error) return rate.error;
      const { nums, error } = collectNumbers(args.slice(1), env);
      if (error) return error;
      const r = rate.nums[0];
      return nums.reduce((total, value, i) => total + value / (1 + r) ** (i + 1), 0);
    },
  },
  IRR: {
    min: 1, max: 2,
    fn: (args, env) => {
      const { nums, error } = collectNumbers([args[0]], env);
      if (error) return error;
      if (!nums.some((n) => n > 0) || !nums.some((n) => n < 0)) return NUM;
      const guess = args[1] === undefined ? 0.1 : collectNumbers([args[1]], env).nums[0] ?? 0.1;
      const result = solve((rate) => nums.reduce((total, value, i) => total + value / (1 + rate) ** i, 0), guess);
      return result === null ? NUM : result;
    },
  },
  XNPV: {
    min: 3, max: 3,
    fn: (args, env) => {
      const rate = collectNumbers([args[0]], env);
      const values = collectNumbers([args[1]], env);
      const dates = collectNumbers([args[2]], env);
      if (rate.error) return rate.error;
      if (values.error) return values.error;
      if (dates.error) return dates.error;
      if (values.nums.length !== dates.nums.length) return NUM;
      const first = dates.nums[0];
      return values.nums.reduce((total, value, i) => total + value / (1 + rate.nums[0]) ** ((dates.nums[i] - first) / 365), 0);
    },
  },
  XIRR: {
    min: 2, max: 3,
    fn: (args, env) => {
      const values = collectNumbers([args[0]], env);
      const dates = collectNumbers([args[1]], env);
      if (values.error) return values.error;
      if (dates.error) return dates.error;
      if (values.nums.length !== dates.nums.length || values.nums.length < 2) return NUM;
      if (!values.nums.some((n) => n > 0) || !values.nums.some((n) => n < 0)) return NUM;
      const first = dates.nums[0];
      const result = solve((rate) => values.nums.reduce((total, value, i) => total + value / (1 + rate) ** ((dates.nums[i] - first) / 365), 0), 0.1);
      return result === null ? NUM : result;
    },
  },
  MIRR: {
    min: 3, max: 3,
    fn: (args, env) => {
      const values = collectNumbers([args[0]], env);
      const finance = collectNumbers([args[1]], env);
      const reinvest = collectNumbers([args[2]], env);
      if (values.error) return values.error;
      if (finance.error) return finance.error;
      if (reinvest.error) return reinvest.error;
      const n = values.nums.length;
      const fr = finance.nums[0];
      const rr = reinvest.nums[0];
      const positives = values.nums.reduce((total, v, i) => total + (v > 0 ? v * (1 + rr) ** (n - 1 - i) : 0), 0);
      const negatives = values.nums.reduce((total, v, i) => total + (v < 0 ? v / (1 + fr) ** i : 0), 0);
      if (positives === 0 || negatives === 0) return DIV0;
      return (positives / -negatives) ** (1 / (n - 1)) - 1;
    },
  },
  SLN: numFn(3, 3, ([cost, salvage, life]) => (life === 0 ? DIV0 : (cost - salvage) / life)),
  SYD: numFn(4, 4, ([cost, salvage, life, per]) => (life <= 0 || per < 1 || per > life ? NUM : ((cost - salvage) * (life - per + 1) * 2) / (life * (life + 1)))),
  DDB: numFn(4, 5, ([cost, salvage, life, period, factor]) => {
    if (life <= 0 || period < 1 || period > life || cost < 0 || salvage < 0) return NUM;
    const f = factor ?? 2;
    let book = cost;
    let depreciation = 0;
    for (let p = 1; p <= period; p += 1) {
      depreciation = Math.min(book * (f / life), Math.max(0, book - salvage));
      book -= depreciation;
    }
    return depreciation;
  }),
  EFFECT: numFn(2, 2, ([nominal, periods]) => (nominal <= 0 || periods < 1 ? NUM : (1 + nominal / Math.trunc(periods)) ** Math.trunc(periods) - 1)),
  NOMINAL: numFn(2, 2, ([effective, periods]) => (effective <= 0 || periods < 1 ? NUM : Math.trunc(periods) * ((1 + effective) ** (1 / Math.trunc(periods)) - 1))),
  CUMIPMT: numFn(6, 6, ([rate, nper, pv, start, end, type]) => {
    if (rate <= 0 || nper <= 0 || pv <= 0 || start < 1 || end < start || end > nper) return NUM;
    const t = type ? 1 : 0;
    const pmt = payment(rate, nper, pv, 0, t);
    let total = 0;
    for (let per = Math.trunc(start); per <= Math.trunc(end); per += 1) {
      if (t && per === 1) continue;
      total += futureValue(rate, per - (t ? 2 : 1), pmt, pv, t) * rate;
    }
    return total;
  }),
  CUMPRINC: numFn(6, 6, ([rate, nper, pv, start, end, type]) => {
    if (rate <= 0 || nper <= 0 || pv <= 0 || start < 1 || end < start || end > nper) return NUM;
    const t = type ? 1 : 0;
    const pmt = payment(rate, nper, pv, 0, t);
    let total = 0;
    for (let per = Math.trunc(start); per <= Math.trunc(end); per += 1) {
      const interest = t && per === 1 ? 0 : futureValue(rate, per - (t ? 2 : 1), pmt, pv, t) * rate;
      total += pmt - interest;
    }
    return total;
  }),
};

