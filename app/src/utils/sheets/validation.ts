// Data validation: finding the rule for a cell, the options of a list and
// whether an entry passes. Dependency-free (tested by `npm run test:sheets`).

import { cellKey, normRange, parseRange, parseSheetRef, type RangeRef } from './address';
import { createEvaluator } from './formula/recalc';
import { generalText, isError, isMatrix, toNumber, type Scalar } from './formula/values';
import { formatValue } from './numberFormat';
import type { DataValidation, Workbook } from './types';

const inRange = (range: RangeRef, row: number, col: number): boolean => row >= range.r1 && row <= range.r2 && col >= range.c1 && col <= range.c2;

/** The rule that covers a cell, if any. */
export function validationAt(wb: Workbook, sheetIndex: number, row: number, col: number): DataValidation | null {
  for (const rule of wb.sheets[sheetIndex].validations) {
    for (const part of rule.sqref.split(/\s+/)) {
      const range = parseRange(part);
      if (range && inRange(normRange(range), row, col)) return rule;
    }
  }
  return null;
}

/** The choices of a list rule: typed items or the cells of a range. */
export function listOptions(wb: Workbook, sheetIndex: number, rule: DataValidation): string[] {
  const source = (rule.a ?? '').trim();
  if (!source) return [];
  // `=A1:A9` or a bare range is a reference; anything with commas is a typed list.
  const ref = /,/.test(source) ? null : parseSheetRef(source.replace(/^=/, ''));
  if (ref) {
    const target = ref.sheet ? wb.sheets.findIndex((s) => s.name.toLowerCase() === ref.sheet!.toLowerCase()) : sheetIndex;
    if (target >= 0) {
      const out: string[] = [];
      const sheet = wb.sheets[target];
      const { r1, c1, r2, c2 } = ref.range;
      for (let r = r1; r <= Math.min(r2, r1 + 500); r += 1) {
        for (let c = c1; c <= c2; c += 1) {
          const cell = sheet.cells[cellKey(r, c)];
          if (cell?.v === undefined) continue;
          out.push(formatValue(cell.v, cell.s ? wb.styles[cell.s]?.numFmt : undefined).text);
        }
      }
      return out;
    }
  }
  return source.split(',').map((item) => item.trim()).filter((item) => item !== '');
}

export interface ValidationResult {
  ok: boolean;
  rule?: DataValidation;
  /** The title and message to show when the entry is refused or questioned. */
  title?: string;
  message?: string;
  /** `stop` refuses the entry; warnings and information let it through after a notice. */
  style?: 'stop' | 'warning' | 'information';
}

const DEFAULT_MESSAGE = 'This value does not match the data validation rules for this cell.';

/** Checks a value typed into a cell against its rule. */
export function validateEntry(wb: Workbook, sheetIndex: number, row: number, col: number, value: Scalar): ValidationResult {
  const rule = validationAt(wb, sheetIndex, row, col);
  if (!rule) return { ok: true };
  if ((value === null || value === '') && rule.allowBlank !== false) return { ok: true, rule };
  const fail = (): ValidationResult => ({ ok: false, rule, title: rule.errorTitle ?? 'Invalid entry', message: rule.error ?? DEFAULT_MESSAGE, style: rule.errorStyle ?? 'stop' });
  if (isError(value)) return fail();

  if (rule.type === 'list') {
    const options = listOptions(wb, sheetIndex, rule);
    const text = typeof value === 'number' ? generalText(value) : String(value);
    const found = options.some((option) => option.toLowerCase() === text.toLowerCase() || (typeof value === 'number' && Number(option) === value));
    return found ? { ok: true, rule } : fail();
  }

  const evaluate = createEvaluator(wb);
  const operand = (text: string | undefined): Scalar => {
    if (text === undefined || text === '') return null;
    const result = evaluate(text.replace(/^=/, ''), sheetIndex, row, col);
    return isMatrix(result) ? result[0]?.[0] ?? null : result;
  };

  if (rule.type === 'custom') {
    const result = operand(rule.a);
    const pass = typeof result === 'boolean' ? result : typeof result === 'number' ? result !== 0 : false;
    return pass ? { ok: true, rule } : fail();
  }

  let n: number;
  if (rule.type === 'textLength') n = (typeof value === 'string' ? value : generalText(Number(value))).length;
  else {
    const coerced = toNumber(value);
    if (isError(coerced) || typeof value === 'string' && rule.type !== 'date' && rule.type !== 'time') return fail();
    n = coerced;
    if (rule.type === 'whole' && !Number.isInteger(n)) return fail();
  }
  const a = toNumber(operand(rule.a));
  const b = toNumber(operand(rule.b));
  const lo = isError(a) ? NaN : a;
  const hi = isError(b) ? NaN : b;
  switch (rule.op ?? 'between') {
    case 'between': return n >= lo && n <= hi ? { ok: true, rule } : fail();
    case 'notBetween': return n < lo || n > hi ? { ok: true, rule } : fail();
    case 'equal': return n === lo ? { ok: true, rule } : fail();
    case 'notEqual': return n !== lo ? { ok: true, rule } : fail();
    case 'greaterThan': return n > lo ? { ok: true, rule } : fail();
    case 'lessThan': return n < lo ? { ok: true, rule } : fail();
    case 'greaterThanOrEqual': return n >= lo ? { ok: true, rule } : fail();
    case 'lessThanOrEqual': return n <= lo ? { ok: true, rule } : fail();
  }
  return { ok: true, rule };
}
