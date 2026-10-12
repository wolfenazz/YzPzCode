// What the assistant is told about the workbook: structure, column types,
// samples and the selection, all inside a character budget. Dependency-free.

import { cellKey, colName, normRange, parseRange, rangeText, type RangeRef } from '../address';
import { isDateFormat, formatValue } from '../numberFormat';
import type { Cell, Sheet, Workbook } from '../types';

export type AiScope = 'selection' | 'sheet' | 'workbook';

export interface ContextOptions {
  activeSheet: number;
  /** Selected range on the active sheet (A1 text). */
  selection?: string | null;
  scope: AiScope;
  /** Total characters the context may take. */
  budget?: number;
}

const DEFAULT_BUDGET = 14000;

/** What a cell shows, for the model: the value with its format, formulas as `=… → value`. */
export function cellText(wb: Workbook, cell: Cell | undefined, withFormula = true): string {
  if (!cell) return '';
  const numFmt = cell.s ? wb.styles[cell.s]?.numFmt : undefined;
  let shown: string;
  if (cell.e !== undefined) shown = cell.e;
  else if (cell.v === undefined) shown = '';
  else shown = formatValue(cell.v, numFmt).text;
  if (typeof cell.v === 'string' && shown.length > 120) shown = `${shown.slice(0, 117)}…`;
  if (withFormula && cell.f !== undefined && cell.sp === undefined) return `=${cell.f} → ${shown}`;
  return shown;
}

export function usedRange(sheet: Sheet): RangeRef | null {
  let r1 = Infinity;
  let c1 = Infinity;
  let r2 = -1;
  let c2 = -1;
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (cell.v === undefined && cell.f === undefined && cell.e === undefined) continue;
    const match = /^([A-Z]+)(\d+)$/.exec(key);
    if (!match) continue;
    let col = 0;
    for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    col -= 1;
    const row = Number(match[2]) - 1;
    r1 = Math.min(r1, row);
    c1 = Math.min(c1, col);
    r2 = Math.max(r2, row);
    c2 = Math.max(c2, col);
  }
  return r2 < 0 ? null : { r1, c1, r2, c2 };
}

interface ColumnSummary {
  col: number;
  header: string;
  kind: 'number' | 'text' | 'date' | 'mixed' | 'empty';
  count: number;
  detail: string;
}

function summarizeColumns(wb: Workbook, sheet: Sheet, range: RangeRef, headerRow: number | null): ColumnSummary[] {
  const out: ColumnSummary[] = [];
  const first = range.r1 + (headerRow === null ? 0 : 1);
  for (let c = range.c1; c <= range.c2; c += 1) {
    const header = headerRow === null ? '' : cellText(wb, sheet.cells[cellKey(headerRow, c)], false);
    let numbers = 0;
    let texts = 0;
    let dates = 0;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    const distinct = new Map<string, number>();
    let count = 0;
    for (let r = first; r <= range.r2; r += 1) {
      const cell = sheet.cells[cellKey(r, c)];
      if (!cell || (cell.v === undefined && cell.e === undefined)) continue;
      count += 1;
      if (typeof cell.v === 'number') {
        const fmt = cell.s ? wb.styles[cell.s]?.numFmt : undefined;
        if (isDateFormat(fmt)) dates += 1;
        else numbers += 1;
        min = Math.min(min, cell.v);
        max = Math.max(max, cell.v);
        sum += cell.v;
      } else if (typeof cell.v === 'string') {
        texts += 1;
        if (distinct.size < 30) distinct.set(cell.v, (distinct.get(cell.v) ?? 0) + 1);
      }
    }
    let kind: ColumnSummary['kind'] = 'empty';
    let detail = '';
    if (count > 0) {
      const dominant = Math.max(numbers, texts, dates);
      kind = dominant === dates && dates > 0 ? 'date' : dominant === numbers && numbers > 0 ? 'number' : 'text';
      if (numbers > 0 && texts > 0 && Math.min(numbers, texts) > count * 0.1) kind = 'mixed';
      if (kind === 'number') detail = `min ${+min.toPrecision(8)}, max ${+max.toPrecision(8)}, sum ${+sum.toPrecision(10)}`;
      else if (kind === 'date') {
        const sample = (v: number): string => formatValue(v, 'yyyy-mm-dd').text;
        detail = `${sample(min)} … ${sample(max)}`;
      } else if (distinct.size > 0) {
        const values = [...distinct.keys()].slice(0, 6).map((v) => `"${v.length > 24 ? `${v.slice(0, 21)}…` : v}"`);
        detail = `${distinct.size >= 30 ? '30+' : distinct.size} distinct, e.g. ${values.join(', ')}`;
      }
    }
    out.push({ col: c, header, kind, count, detail });
  }
  return out;
}

/** Rows of a range as lines `row | cell | cell`, cut off at `maxCells`. */
export function dumpRange(wb: Workbook, sheet: Sheet, range: RangeRef, maxCells: number, withFormulas = true): { text: string; truncated: boolean } {
  const lines: string[] = [];
  const cols = range.c2 - range.c1 + 1;
  const maxRows = Math.max(1, Math.floor(maxCells / Math.max(1, cols)));
  let truncated = false;
  lines.push(`     | ${Array.from({ length: cols }, (_, i) => colName(range.c1 + i)).join(' | ')}`);
  for (let r = range.r1; r <= range.r2; r += 1) {
    if (r - range.r1 >= maxRows) {
      truncated = true;
      break;
    }
    const cells = Array.from({ length: cols }, (_, i) => cellText(wb, sheet.cells[cellKey(r, range.c1 + i)], withFormulas).replace(/\n/g, ' '));
    lines.push(`${String(r + 1).padStart(4)} | ${cells.join(' | ')}`);
  }
  return { text: lines.join('\n'), truncated };
}

function describeSheet(wb: Workbook, sheet: Sheet, active: boolean, budget: number): string {
  const used = usedRange(sheet);
  const head: string[] = [];
  const flags = [
    active ? 'active' : '',
    sheet.rtl ? 'right-to-left' : '',
    sheet.state && sheet.state !== 'visible' ? sheet.state : '',
    sheet.freeze ? `frozen ${sheet.freeze.rows} row(s), ${sheet.freeze.cols} column(s)` : '',
  ].filter(Boolean);
  head.push(`Sheet "${sheet.name}"${flags.length ? ` (${flags.join(', ')})` : ''}`);
  if (!used) {
    head.push('  empty');
    return head.join('\n');
  }
  head.push(`  Used range ${rangeText(used)} (${used.r2 - used.r1 + 1} rows × ${used.c2 - used.c1 + 1} columns)`);
  if (sheet.merges.length) head.push(`  Merged: ${sheet.merges.slice(0, 12).join(', ')}${sheet.merges.length > 12 ? '…' : ''}`);
  if (sheet.tables.length) head.push(`  Tables: ${sheet.tables.map((t) => `${t.name} (${t.ref})`).join(', ')}`);
  if (sheet.charts.length) head.push(`  Charts: ${sheet.charts.map((c) => `${c.kind}${c.title ? ` "${c.title}"` : ''}`).join(', ')}`);
  if (sheet.cf.length) head.push(`  Conditional formats on: ${[...new Set(sheet.cf.map((c) => c.sqref))].slice(0, 6).join(', ')}`);
  if (sheet.validations.length) head.push(`  Validation on: ${[...new Set(sheet.validations.map((v) => v.sqref))].slice(0, 6).join(', ')}`);

  // A first row of text over data is the header.
  const firstRowCells = Array.from({ length: used.c2 - used.c1 + 1 }, (_, i) => sheet.cells[cellKey(used.r1, used.c1 + i)]);
  const textHeaders = firstRowCells.filter((c) => typeof c?.v === 'string').length;
  const hasHeader = used.r2 > used.r1 && textHeaders >= Math.ceil(firstRowCells.length / 2);
  const columns = summarizeColumns(wb, sheet, used, hasHeader ? used.r1 : null);
  head.push('  Columns:');
  for (const col of columns.slice(0, 40)) {
    head.push(`    ${colName(col.col)}${col.header ? ` "${col.header}"` : ''}: ${col.kind}, ${col.count} value${col.count === 1 ? '' : 's'}${col.detail ? `, ${col.detail}` : ''}`);
  }
  if (columns.length > 40) head.push(`    … ${columns.length - 40} more columns`);

  const used1 = head.join('\n');
  const remaining = Math.max(600, budget - used1.length);
  const maxCells = Math.max(30, Math.min(400, Math.floor(remaining / 18)));
  const rows = used.r2 - used.r1 + 1;
  const dump = dumpRange(wb, sheet, used, maxCells);
  const note = dump.truncated || rows * (used.c2 - used.c1 + 1) > maxCells
    ? `\n  (showing the first ${Math.max(1, Math.floor(maxCells / (used.c2 - used.c1 + 1)))} of ${rows} rows; ask for more with <read>)`
    : '';
  return `${used1}\n  Cells (formulas shown as =formula → value):\n${dump.text.split('\n').map((line) => `  ${line}`).join('\n')}${note}`;
}

/** The text block that describes the workbook for the model. */
export function buildContext(wb: Workbook, options: ContextOptions): string {
  const budget = options.budget ?? DEFAULT_BUDGET;
  const active = Math.min(options.activeSheet, wb.sheets.length - 1);
  const parts: string[] = [];
  parts.push(`Workbook: ${wb.sheets.length} sheet${wb.sheets.length === 1 ? '' : 's'}: ${wb.sheets.map((s, i) => `"${s.name}"${i === active ? ' (active)' : ''}`).join(', ')}`);
  if (wb.names.length) parts.push(`Named ranges: ${wb.names.slice(0, 20).map((n) => `${n.name} = ${n.ref}`).join('; ')}`);

  const selection = options.selection ? parseRange(options.selection) : null;
  const activeSheet = wb.sheets[active];
  if (selection && options.scope === 'selection') {
    const norm = normRange(selection);
    const size = (norm.r2 - norm.r1 + 1) * (norm.c2 - norm.c1 + 1);
    parts.push(`Selection: "${activeSheet.name}"!${rangeText(norm)} (${norm.r2 - norm.r1 + 1} rows × ${norm.c2 - norm.c1 + 1} columns)`);
    const dump = dumpRange(wb, activeSheet, norm, Math.min(size, 600));
    parts.push(`${dump.text}${dump.truncated ? '\n(selection cut off; ask for the rest with <read>)' : ''}`);
    // The cells around it help with headers and totals.
    const used = usedRange(activeSheet);
    if (used) parts.push(`The sheet's used range is ${rangeText(used)}. Header rows and neighbours are outside the selection; read them with <read> if needed.`);
    return parts.join('\n\n').slice(0, budget * 1.5);
  }

  if (selection) parts.push(`Selection: "${activeSheet.name}"!${rangeText(normRange(selection))}`);
  const targets = options.scope === 'workbook' ? wb.sheets.map((sheet, i) => ({ sheet, i })) : [{ sheet: activeSheet, i: active }];
  const perSheet = Math.floor(budget / Math.max(1, targets.length));
  for (const { sheet, i } of targets) parts.push(describeSheet(wb, sheet, i === active, perSheet));
  if (options.scope === 'sheet' && wb.sheets.length > 1) parts.push('Other sheets exist; name them in <read> or operations when needed.');
  return parts.join('\n\n');
}

/** Cells for a `<read>` request, with formulas, as a text block. */
export function readRequest(wb: Workbook, sheetName: string | undefined, rangeTextValue: string, activeSheet: number, maxCells = 1500): string {
  const index = sheetName === undefined ? activeSheet : wb.sheets.findIndex((s) => s.name.toLowerCase() === sheetName.toLowerCase());
  if (index < 0) return `Sheet "${sheetName}" does not exist.`;
  const range = parseRange(rangeTextValue);
  if (!range) return `"${rangeTextValue}" is not a valid range.`;
  const sheet = wb.sheets[index];
  const used = usedRange(sheet);
  const clamped: RangeRef = used
    ? { r1: range.r1, c1: range.c1, r2: Math.min(range.r2, Math.max(used.r2, range.r1)), c2: Math.min(range.c2, Math.max(used.c2, range.c1)) }
    : range;
  const dump = dumpRange(wb, sheet, normRange(clamped), maxCells);
  return `"${sheet.name}"!${rangeText(normRange(clamped))}${dump.truncated ? ` (first rows only, ${maxCells} cells)` : ''}\n${dump.text}`;
}
