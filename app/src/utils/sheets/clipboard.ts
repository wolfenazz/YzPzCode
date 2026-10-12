// Clipboard text for ranges: tab-separated text and a styled HTML table (what
// Excel, Word and mail clients read), and the reverse for pasted text.
// Dependency-free (tested by `npm run test:sheets`).

import { cellKey, normRange, type RangeRef } from './address';
import { parseCsv } from './csv';
import { cellDisplay } from './display';
import type { Sheet, Workbook } from './types';

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The cells of a range as tab-separated rows, shown the way the grid shows them. */
export function rangeToTsv(wb: Workbook, sheet: Sheet, range: RangeRef): string {
  const { r1, c1, r2, c2 } = normRange(range);
  const lines: string[] = [];
  for (let r = r1; r <= r2; r += 1) {
    const fields: string[] = [];
    for (let c = c1; c <= c2; c += 1) {
      const text = cellDisplay(wb, sheet, r, c).text;
      fields.push(/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
    }
    lines.push(fields.join('\t'));
  }
  return lines.join('\r\n');
}

/** A table with inline styles for font, colour, fill and alignment. */
export function rangeToHtml(wb: Workbook, sheet: Sheet, range: RangeRef): string {
  const { r1, c1, r2, c2 } = normRange(range);
  const rows: string[] = [];
  for (let r = r1; r <= r2; r += 1) {
    const cells: string[] = [];
    for (let c = c1; c <= c2; c += 1) {
      const display = cellDisplay(wb, sheet, r, c);
      const style = display.style;
      const css: string[] = [];
      if (style.font?.bold) css.push('font-weight:700');
      if (style.font?.italic) css.push('font-style:italic');
      if (style.font?.underline) css.push('text-decoration:underline');
      if (style.font?.color) css.push(`color:${style.font.color}`);
      if (style.font?.name) css.push(`font-family:${style.font.name}`);
      if (style.font?.size) css.push(`font-size:${style.font.size}pt`);
      if (style.fill) css.push(`background:${style.fill}`);
      css.push(`text-align:${display.align === 'justify' || display.align === 'fill' ? 'left' : display.align}`);
      if (sheet.rtl || display.rtl) css.push('direction:rtl');
      cells.push(`<td style="${css.join(';')}">${escapeHtml(display.text).replace(/\n/g, '<br>')}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table>${rows.join('')}</table>`;
}

/** Rows of text from pasted clipboard text: tab-separated, or the delimiter it appears to use. */
export function parseClipboardText(text: string): string[][] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (normalized === '') return [];
  if (normalized.includes('\t')) return parseCsv(normalized, '\t');
  return normalized.split('\n').map((line) => [line]);
}

/** Cells of a range with their address, for copying inside the workbook. */
export function snapshotRange(sheet: Sheet, range: RangeRef): Array<{ row: number; col: number; key: string }> {
  const { r1, c1, r2, c2 } = normRange(range);
  const out: Array<{ row: number; col: number; key: string }> = [];
  for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) if (sheet.cells[cellKey(r, c)]) out.push({ row: r, col: c, key: cellKey(r, c) });
  return out;
}
