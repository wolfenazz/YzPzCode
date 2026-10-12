// Conditional formatting: which rules apply to a cell and what they change.
// Dependency-free (tested by `npm run test:sheets`).

import { cellKey, normRange, parseRange, type RangeRef } from './address';
import { createEvaluator } from './formula/recalc';
import { copyFormula } from './formula/refs';
import { compareScalars, isError, isMatrix, toNumber, type Scalar } from './formula/values';
import { cellDisplay } from './display';
import type { CfRule, CondFormat, Dxf, Sheet, Workbook } from './types';

export interface CfEffect {
  fill?: string;
  font?: Dxf['font'];
  border?: Dxf['border'];
  numFmt?: string;
  /** A data bar: how much of the cell it fills (0 to 1). */
  bar?: { ratio: number; color: string };
  /** An icon from a set: position `index` of `count` (0 is the best). */
  icon?: { set: string; index: number; count: number };
}

interface Entry {
  cf: CondFormat;
  ranges: RangeRef[];
  /** Top-left of the first range: formulas are written relative to it. */
  origin: { row: number; col: number };
  numbers?: number[];
  sorted?: number[];
  min?: number;
  max?: number;
  mid?: number;
  mean?: number;
  counts?: Map<string, number>;
  operands?: [Scalar, Scalar];
}

const inside = (range: RangeRef, row: number, col: number): boolean => row >= range.r1 && row <= range.r2 && col >= range.c1 && col <= range.c2;

const hexToRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mix = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const to = (x: number): string => Math.round(x).toString(16).padStart(2, '0');
  return `#${to(r1 + (r2 - r1) * t)}${to(g1 + (g2 - g1) * t)}${to(b1 + (b2 - b1) * t)}`.toUpperCase();
};

const keyOf = (value: Scalar): string => (typeof value === 'string' ? `s:${value.toLowerCase()}` : `${typeof value}:${String(value)}`);

/** Evaluates the conditional formats of one sheet cell by cell (visible cells only, with per-rule statistics cached). */
export class CfEvaluator {
  private readonly entries: Entry[];
  private readonly evaluate: ReturnType<typeof createEvaluator>;

  constructor(private readonly wb: Workbook, private readonly sheetIndex: number) {
    const sheet = wb.sheets[sheetIndex];
    this.entries = sheet.cf.flatMap((cf): Entry[] => {
      const ranges = cf.sqref.split(/\s+/).map(parseRange).filter((r): r is RangeRef => r !== null).map(normRange);
      return ranges.length ? [{ cf, ranges, origin: { row: ranges[0].r1, col: ranges[0].c1 } }] : [];
    });
    this.evaluate = createEvaluator(wb);
  }

  get active(): boolean {
    return this.entries.length > 0;
  }

  private sheet(): Sheet {
    return this.wb.sheets[this.sheetIndex];
  }

  private values(entry: Entry): Scalar[] {
    const sheet = this.sheet();
    const out: Scalar[] = [];
    for (const range of entry.ranges) {
      const rows = Math.min(range.r2, range.r1 + 20000);
      for (let r = range.r1; r <= rows; r += 1) {
        for (let c = range.c1; c <= range.c2; c += 1) {
          const cell = sheet.cells[cellKey(r, c)];
          if (!cell) continue;
          if (cell.e !== undefined) out.push(null);
          else if (cell.v !== undefined) out.push(cell.v);
        }
      }
    }
    return out;
  }

  private stats(entry: Entry): void {
    if (entry.numbers) return;
    const numbers = this.values(entry).filter((v): v is number => typeof v === 'number');
    entry.numbers = numbers;
    entry.sorted = numbers.slice().sort((a, b) => a - b);
    entry.min = entry.sorted[0];
    entry.max = entry.sorted[entry.sorted.length - 1];
    entry.mid = entry.sorted.length ? entry.sorted[Math.floor((entry.sorted.length - 1) / 2)] : 0;
    entry.mean = numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
  }

  private operand(entry: Entry, which: 0 | 1, text: string | undefined): Scalar {
    if (!entry.operands) entry.operands = [null, null];
    const cached = entry.operands[which];
    if (cached !== null || text === undefined) return cached;
    const value = this.evaluate(text, this.sheetIndex, entry.origin.row, entry.origin.col);
    const scalar = isMatrix(value) ? value[0]?.[0] ?? null : value;
    entry.operands[which] = scalar;
    return scalar;
  }

  private matches(entry: Entry, rule: CfRule, row: number, col: number, value: Scalar, shown: string): boolean {
    switch (rule.kind) {
      case 'cell': {
        if (value === null || isError(value)) return false;
        const a = this.operand(entry, 0, rule.a);
        const b = rule.b === undefined ? null : this.operand(entry, 1, rule.b);
        const order = (x: Scalar, y: Scalar): number => {
          if (typeof x === 'number' && typeof y === 'number') return x - y;
          return compareScalars(x, y);
        };
        switch (rule.op) {
          case 'equal': return order(value, a) === 0;
          case 'notEqual': return order(value, a) !== 0;
          case 'greaterThan': return order(value, a) > 0;
          case 'lessThan': return order(value, a) < 0;
          case 'greaterThanOrEqual': return order(value, a) >= 0;
          case 'lessThanOrEqual': return order(value, a) <= 0;
          case 'between': return order(value, a) >= 0 && order(value, b) <= 0;
          case 'notBetween': return order(value, a) < 0 || order(value, b) > 0;
        }
        return false;
      }
      case 'text': {
        const text = shown.toLowerCase();
        const needle = rule.text.toLowerCase();
        if (rule.op === 'contains') return text.includes(needle);
        if (rule.op === 'notContains') return !text.includes(needle);
        if (rule.op === 'beginsWith') return text.startsWith(needle);
        return text.endsWith(needle);
      }
      case 'expression': {
        const formula = copyFormula(rule.formula, row - entry.origin.row, col - entry.origin.col);
        const result = this.evaluate(formula, this.sheetIndex, row, col);
        const scalar = isMatrix(result) ? result[0]?.[0] ?? null : result;
        if (isError(scalar)) return false;
        if (typeof scalar === 'boolean') return scalar;
        const n = toNumber(scalar);
        return !isError(n) && n !== 0;
      }
      case 'blanks': return value === null || value === '';
      case 'notBlanks': return value !== null && value !== '';
      case 'errors': return this.sheet().cells[cellKey(row, col)]?.e !== undefined;
      case 'notErrors': return this.sheet().cells[cellKey(row, col)]?.e === undefined && value !== null;
      case 'duplicates':
      case 'unique': {
        if (value === null || value === '') return false;
        if (!entry.counts) {
          entry.counts = new Map();
          for (const v of this.values(entry)) entry.counts.set(keyOf(v), (entry.counts.get(keyOf(v)) ?? 0) + 1);
        }
        const count = entry.counts.get(keyOf(value)) ?? 0;
        return rule.kind === 'duplicates' ? count > 1 : count === 1;
      }
      case 'top': {
        if (typeof value !== 'number') return false;
        this.stats(entry);
        const sorted = entry.sorted!;
        const n = rule.percent ? Math.max(1, Math.round((sorted.length * rule.n) / 100)) : rule.n;
        const threshold = rule.bottom ? sorted[Math.min(sorted.length, n) - 1] : sorted[Math.max(0, sorted.length - n)];
        return threshold === undefined ? false : rule.bottom ? value <= threshold : value >= threshold;
      }
      case 'aboveAverage': {
        if (typeof value !== 'number') return false;
        this.stats(entry);
        return rule.below ? value < entry.mean! : value > entry.mean!;
      }
      default:
        return false;
    }
  }

  /** What the rules do to the cell at (row, col), or null. */
  effect(row: number, col: number): CfEffect | null {
    let result: CfEffect | null = null;
    const cell = this.sheet().cells[cellKey(row, col)];
    for (const entry of this.entries) {
      if (!entry.ranges.some((range) => inside(range, row, col))) continue;
      const rule = entry.cf.rule;
      const value: Scalar = cell === undefined ? null : cell.e !== undefined ? null : cell.v ?? null;
      if (rule.kind === 'colorScale' || rule.kind === 'dataBar' || rule.kind === 'iconSet') {
        if (typeof value !== 'number') continue;
        this.stats(entry);
        const min = entry.min ?? 0;
        const max = entry.max ?? 0;
        const span = max - min;
        const ratio = span === 0 ? 0.5 : (value - min) / span;
        result ??= {};
        if (rule.kind === 'colorScale') {
          const colors = rule.colors;
          if (colors.length >= 3) {
            const t = ratio <= 0.5 ? ratio * 2 : (ratio - 0.5) * 2;
            result.fill ??= ratio <= 0.5 ? mix(colors[0], colors[1], t) : mix(colors[1], colors[2], t);
          } else result.fill ??= mix(colors[0], colors[1], ratio);
        } else if (rule.kind === 'dataBar') result.bar ??= { ratio: Math.max(0.02, ratio), color: rule.color };
        else {
          const count = Number(rule.set[0]);
          const index = Math.min(count - 1, Math.floor((1 - ratio) * count - 1e-9));
          result.icon ??= { set: rule.set, index: Math.max(0, index), count };
        }
        continue;
      }
      const shown = cell ? cellDisplay(this.wb, this.sheet(), row, col).text : '';
      if (!this.matches(entry, rule, row, col, value, shown)) continue;
      const dxf = this.wb.dxfs[rule.dxf] ?? {};
      result ??= {};
      result.fill ??= dxf.fill;
      if (dxf.font) result.font = { ...dxf.font, ...(result.font ?? {}) };
      result.border ??= dxf.border;
      result.numFmt ??= dxf.numFmt;
      if (entry.cf.stop) break;
    }
    return result;
  }
}
