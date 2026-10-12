// What the fill handle writes: copies, number and date series, and names that
// cycle (months and weekdays in English and Arabic). Dependency-free.

import { MONTH_NAMES, DAY_NAMES, serialToYmd, ymdToSerial } from './dates';
import { copyFormula } from './formula/refs';

export interface FillCell {
  v?: number | string | boolean;
  f?: string;
}

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_LEVANT_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const CYCLES: string[][] = [
  MONTH_NAMES,
  MONTH_NAMES.map((name) => name.slice(0, 3)),
  DAY_NAMES,
  DAY_NAMES.map((name) => name.slice(0, 3)),
  AR_MONTHS,
  AR_LEVANT_MONTHS,
  AR_DAYS,
];

const norm = (text: string): string => text.trim().toLowerCase();

function cycleOf(text: string): { list: string[]; index: number } | null {
  const key = norm(text);
  for (const list of CYCLES) {
    const index = list.findIndex((entry) => norm(entry) === key);
    if (index >= 0) return { list, index };
  }
  return null;
}

/** Keeps the capitalisation style of the typed name (JAN, jan, Jan). */
function matchCase(sample: string, text: string): string {
  if (sample === sample.toUpperCase() && sample !== sample.toLowerCase()) return text.toUpperCase();
  if (sample === sample.toLowerCase()) return text.toLowerCase();
  return text;
}

const TRAILING_NUMBER = /^(.*?)(\d+)(\D*)$/;

function linear(values: number[]): { step: number; at: (index: number) => number } {
  const n = values.length;
  if (n === 1) return { step: 0, at: () => values[0] };
  const diffs = values.slice(1).map((value, i) => value - values[i]);
  if (diffs.every((d) => Math.abs(d - diffs[0]) < 1e-9)) return { step: diffs[0], at: (index) => values[0] + diffs[0] * index };
  // Least squares line, as Excel uses for uneven numbers.
  const xs = values.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (values[i] - my);
    sxx += (x - mx) ** 2;
  });
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { step: slope, at: (index) => my + slope * (index - mx) };
}

export interface FillOptions {
  /** `row` when filling down or up, `col` when filling right or left. */
  axis: 'row' | 'col';
  /** Filling up or left. */
  backward?: boolean;
  /** Source cells carry a date format. */
  dates?: boolean;
  /** Copy without extending series (Ctrl held). */
  copyOnly?: boolean;
}

/**
 * Cells to write after (or before, when backward) a line of source cells.
 * Result order is the order the cells are produced in: nearest to the source first.
 */
export function fillSeries(source: FillCell[], count: number, options: FillOptions): FillCell[] {
  const n = source.length;
  const out: FillCell[] = [];
  if (n === 0 || count <= 0) return out;
  const dir = options.backward ? -1 : 1;

  if (options.copyOnly || source.some((cell) => cell.f !== undefined)) {
    for (let i = 0; i < count; i += 1) {
      // Forward fills cycle the source from its first cell, backward fills from its last.
      const k = options.backward ? n - 1 - (i % n) : i % n;
      const position = options.backward ? -(i + 1) : n + i;
      const cell = source[k];
      if (cell.f === undefined) out.push({ ...cell });
      else {
        const offset = position - k;
        out.push({ f: copyFormula(cell.f, options.axis === 'row' ? offset : 0, options.axis === 'col' ? offset : 0) });
      }
    }
    return out;
  }

  const values = source.map((cell) => cell.v);
  const allNumbers = values.every((value): value is number => typeof value === 'number');
  if (allNumbers) {
    const nums = values as number[];
    if (nums.length === 1) {
      if (options.dates) {
        for (let i = 1; i <= count; i += 1) out.push({ v: nums[0] + dir * i });
      } else {
        for (let i = 0; i < count; i += 1) out.push({ v: nums[0] });
      }
      return out;
    }
    if (options.dates) {
      const ymds = nums.map(serialToYmd);
      const monthSteps = ymds.slice(1).map((d, i) => (d.y - ymds[i].y) * 12 + d.m - ymds[i].m);
      const sameDay = ymds.every((d) => d.d === ymds[0].d);
      if (sameDay && monthSteps.every((s) => s === monthSteps[0]) && monthSteps[0] !== 0 && Math.abs(nums[1] - nums[0]) > 27) {
        for (let i = 1; i <= count; i += 1) {
          const anchor = options.backward ? ymds[0] : ymds[n - 1];
          const total = anchor.y * 12 + anchor.m - 1 + dir * i * monthSteps[0];
          out.push({ v: ymdToSerial(Math.floor(total / 12), (((total % 12) + 12) % 12) + 1, anchor.d) });
        }
        return out;
      }
    }
    const line = linear(nums);
    for (let i = 0; i < count; i += 1) {
      const index = options.backward ? -(i + 1) : n + i;
      const value = line.at(index);
      out.push({ v: Math.round(value * 1e10) / 1e10 });
    }
    return out;
  }

  // One text cell that is a month or weekday name, or ends in a number.
  const texts = values.map((value) => (typeof value === 'string' ? value : null));
  if (texts.every((t): t is string => t !== null)) {
    const names = texts as string[];
    const first = cycleOf(names[0]);
    if (first && names.every((name) => cycleOf(name)?.list === first.list)) {
      const last = cycleOf(names[n - 1])!;
      const step = n > 1 ? (((last.index - first.index) / (n - 1)) % first.list.length + first.list.length) % first.list.length || 1 : 1;
      const length = first.list.length;
      for (let i = 1; i <= count; i += 1) {
        const base = options.backward ? first.index : last.index;
        const index = (((base + dir * i * step) % length) + length) % length;
        out.push({ v: matchCase(names[0], first.list[index]) });
      }
      return out;
    }
    const match = TRAILING_NUMBER.exec(names[n - 1]);
    if (match && names.every((name) => TRAILING_NUMBER.test(name))) {
      const parsed = names.map((name) => {
        const m = TRAILING_NUMBER.exec(name)!;
        return { prefix: m[1], digits: m[2], suffix: m[3] };
      });
      const numbers = parsed.map((p) => Number(p.digits));
      const step = n > 1 ? numbers[1] - numbers[0] : 1;
      const width = parsed[0].digits.length;
      const padded = parsed[0].digits.startsWith('0') && width > 1;
      for (let i = 1; i <= count; i += 1) {
        const base = options.backward ? parsed[0] : parsed[n - 1];
        const value = Number(base.digits) + dir * i * step;
        const text = padded ? String(Math.max(0, value)).padStart(width, '0') : String(value);
        out.push({ v: `${base.prefix}${text}${base.suffix}` });
      }
      return out;
    }
  }

  for (let i = 0; i < count; i += 1) {
    const k = options.backward ? n - 1 - (i % n) : i % n;
    out.push({ ...source[k] });
  }
  return out;
}
