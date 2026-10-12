// Find and replace over cells. Dependency-free (tested by `npm run test:sheets`).

import { cellKey, parseCell } from './address';
import { formatValue } from './numberFormat';
import type { Sheet, Workbook } from './types';

export interface FindOptions {
  matchCase?: boolean;
  /** The whole cell must equal the text. */
  entireCell?: boolean;
  /** Search the formulas instead of the shown values. */
  inFormulas?: boolean;
}

export interface FindHit {
  sheet: number;
  row: number;
  col: number;
  key: string;
  /** The text that was searched. */
  text: string;
}

function searchText(wb: Workbook, sheet: Sheet, key: string, inFormulas: boolean): string {
  const cell = sheet.cells[key];
  if (!cell) return '';
  if (inFormulas && cell.f !== undefined) return `=${cell.f}`;
  if (cell.e !== undefined) return cell.e;
  if (cell.v === undefined) return '';
  return formatValue(cell.v, cell.s ? wb.styles[cell.s]?.numFmt : undefined).text;
}

/** Every matching cell, in reading order, starting with the given sheets. */
export function findAll(wb: Workbook, query: string, sheets: number[], options: FindOptions = {}): FindHit[] {
  if (query === '') return [];
  const needle = options.matchCase ? query : query.toLowerCase();
  const hits: FindHit[] = [];
  for (const index of sheets) {
    const sheet = wb.sheets[index];
    if (!sheet) continue;
    const keys = Object.keys(sheet.cells).map((key) => ({ key, pos: parseCell(key) })).filter((entry) => entry.pos).sort((a, b) => a.pos!.row - b.pos!.row || a.pos!.col - b.pos!.col);
    for (const { key, pos } of keys) {
      const text = searchText(wb, sheet, key, options.inFormulas === true);
      if (text === '') continue;
      const hay = options.matchCase ? text : text.toLowerCase();
      if (options.entireCell ? hay === needle : hay.includes(needle)) hits.push({ sheet: index, row: pos!.row, col: pos!.col, key, text });
    }
  }
  return hits;
}

/** The next hit after (row, col) on a sheet, wrapping to the start. */
export function nextHit(hits: FindHit[], sheet: number, row: number, col: number): FindHit | null {
  if (hits.length === 0) return null;
  const after = hits.find((hit) => hit.sheet > sheet || (hit.sheet === sheet && (hit.row > row || (hit.row === row && hit.col > col))));
  return after ?? hits[0];
}

/** The text of a cell with the first or every occurrence replaced (formula text when searching formulas). */
export function replaceIn(text: string, query: string, replacement: string, options: FindOptions = {}): string {
  if (options.entireCell) return replacement;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, options.matchCase ? 'g' : 'gi'), () => replacement);
}

export const hitKey = (sheet: number, row: number, col: number): string => `${sheet}:${cellKey(row, col)}`;
