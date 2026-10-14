// CSV and TSV: parsing into cell inputs and writing a sheet back out.
// Dependency-free (tested by `npm run test:sheets`).

import { cellKey, parseCell } from './address';
import { formatValue } from './numberFormat';
import type { CellStyle, Sheet } from './types';

/** The delimiter a text most likely uses (tab, semicolon, comma, pipe). */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4000).split(/\r?\n/).filter(Boolean).slice(0, 8);
  if (sample.length === 0) return ',';
  let best = ',';
  let bestScore = -1;
  for (const candidate of ['\t', ';', ',', '|']) {
    const counts = sample.map((line) => {
      let inQuotes = false;
      let n = 0;
      for (const ch of line) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === candidate && !inQuotes) n += 1;
      }
      return n;
    });
    const first = counts[0];
    if (first === 0) continue;
    const consistent = counts.filter((n) => n === first).length;
    const score = consistent * 100 + first;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Rows of text from CSV, with quotes, doubled quotes and embedded newlines. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
    i += 1;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const needsQuote = (value: string, delimiter: string): boolean => value.includes(delimiter) || /["\r\n]/.test(value) || /^\s|\s$/.test(value);

/** The tab delimiter, shared by the TSV import, save and export paths. */
export const TSV_DELIMITER = '\t';

/** Rows of text from TSV (tabs, same quoting rules as CSV). */
export function parseTsv(text: string): string[][] {
  return parseCsv(text, TSV_DELIMITER);
}

/** One sheet as CSV text, values shown the way the grid shows them. */
export function sheetToCsv(sheet: Sheet, styles: CellStyle[], delimiter = ','): string {
  let maxRow = -1;
  let maxCol = -1;
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (cell.v === undefined && cell.e === undefined) continue;
    const pos = parseCell(key);
    if (!pos) continue;
    maxRow = Math.max(maxRow, pos.row);
    maxCol = Math.max(maxCol, pos.col);
  }
  const lines: string[] = [];
  for (let r = 0; r <= maxRow; r += 1) {
    const fields: string[] = [];
    for (let c = 0; c <= maxCol; c += 1) {
      const cell = sheet.cells[cellKey(r, c)];
      let text = '';
      if (cell) {
        if (cell.e !== undefined) text = cell.e;
        else if (cell.v !== undefined) text = formatValue(cell.v, cell.s ? styles[cell.s]?.numFmt : undefined).text;
      }
      fields.push(needsQuote(text, delimiter) ? `"${text.replace(/"/g, '""')}"` : text);
    }
    lines.push(fields.join(delimiter));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** One sheet as TSV text, values shown the way the grid shows them. */
export function sheetToTsv(sheet: Sheet, styles: CellStyle[]): string {
  return sheetToCsv(sheet, styles, TSV_DELIMITER);
}
