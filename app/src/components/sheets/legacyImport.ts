// Older spreadsheet formats (.xls, .ods) through SheetJS: values, formulas,
// number formats, merges and column widths. Styling beyond that is not carried.

import { cellKey, colName } from '../../utils/sheets/address';
import { emptySheet, emptyWorkbook, type Cell, type CellStyle, type ErrorCode, type Workbook } from '../../utils/sheets/types';

const ERROR_BY_CODE: Record<number, ErrorCode> = { 0: '#NULL!', 7: '#DIV/0!', 15: '#VALUE!', 23: '#REF!', 29: '#NAME?', 36: '#NUM!', 42: '#N/A' };

export async function importLegacySpreadsheet(bytes: Uint8Array): Promise<{ wb: Workbook; notes: string[] }> {
  const XLSX = await import('xlsx');
  const book = XLSX.read(bytes, { type: 'array', cellFormula: true, cellDates: false, cellNF: true });
  const wb = emptyWorkbook();
  const notes: string[] = [];
  const styleIndex = new Map<string, number>([['{}', 0]]);
  const intern = (style: CellStyle): number => {
    const key = JSON.stringify(style);
    let index = styleIndex.get(key);
    if (index === undefined) {
      wb.styles.push(style);
      index = wb.styles.length - 1;
      styleIndex.set(key, index);
    }
    return index;
  };
  wb.sheets = book.SheetNames.map((name) => {
    const source = book.Sheets[name];
    const sheet = emptySheet(name.slice(0, 31));
    const ref = source['!ref'];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      for (let r = range.s.r; r <= range.e.r; r += 1) {
        for (let c = range.s.c; c <= range.e.c; c += 1) {
          const cell = source[XLSX.utils.encode_cell({ r, c })] as { v?: unknown; t?: string; f?: string; z?: string; w?: string } | undefined;
          if (!cell) continue;
          const out: Cell = {};
          if (cell.t === 'e' && typeof cell.v === 'number') out.e = ERROR_BY_CODE[cell.v] ?? '#VALUE!';
          else if (cell.t === 'b') out.v = Boolean(cell.v);
          else if (cell.t === 'n' && typeof cell.v === 'number') out.v = cell.v;
          else if (cell.v !== undefined && cell.v !== null) out.v = String(cell.v);
          if (cell.f) out.f = cell.f;
          if (cell.z && cell.z !== 'General') out.s = intern({ numFmt: cell.z });
          if (out.v !== undefined || out.e !== undefined || out.f !== undefined || out.s) sheet.cells[cellKey(r, c)] = out;
        }
      }
    }
    for (const merge of (source['!merges'] ?? []) as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>) {
      sheet.merges.push(`${colName(merge.s.c)}${merge.s.r + 1}:${colName(merge.e.c)}${merge.e.r + 1}`);
    }
    ((source['!cols'] ?? []) as Array<{ wpx?: number; wch?: number; hidden?: boolean } | undefined>).forEach((col, index) => {
      if (!col) return;
      const width = col.wpx ? col.wpx / 7 : col.wch ? col.wch + 0.71 : undefined;
      if (width || col.hidden) sheet.cols[index] = { width, hidden: col.hidden || undefined };
    });
    ((source['!rows'] ?? []) as Array<{ hpt?: number; hpx?: number; hidden?: boolean } | undefined>).forEach((row, index) => {
      if (!row) return;
      const height = row.hpt ?? (row.hpx ? (row.hpx * 72) / 96 : undefined);
      if (height || row.hidden) sheet.rows[index] = { height, hidden: row.hidden || undefined };
    });
    return sheet;
  });
  if (wb.sheets.length === 0) wb.sheets = [emptySheet('Sheet1')];
  notes.push('Fonts, fills and borders of this older format were not carried over.');
  return { wb, notes };
}
