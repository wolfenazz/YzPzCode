// How a cell looks on the grid, in print and in exports: the shown text, its
// alignment and colour. Dependency-free (tested by `npm run test:sheets`).

import { cellKey } from './address';
import { formatValue } from './numberFormat';
import { hasRtl } from '../writing/rtl';
import type { Cell, CellStyle, Sheet, Workbook } from './types';

export type HAlign = 'left' | 'center' | 'right' | 'fill' | 'justify';

export interface CellDisplay {
  text: string;
  kind: 'empty' | 'number' | 'text' | 'bool' | 'error';
  /** Resolved horizontal alignment (General becomes left, right or the sheet's trailing side). */
  align: HAlign;
  /** Colour from a `[Red]` section of the number format. */
  color?: string;
  style: CellStyle;
  /** The text runs right to left. */
  rtl: boolean;
  /** The number a numeric cell holds (to refit General numbers to a narrow column). */
  value?: number;
}

/** The style index a cell shows: its own, else its row's, else its column's. */
export function styleIndexAt(sheet: Sheet, row: number, col: number, cell?: Cell): number {
  if (cell?.s) return cell.s;
  return sheet.rows[row]?.style ?? sheet.cols[col]?.style ?? 0;
}

export function cellDisplay(wb: Workbook, sheet: Sheet, row: number, col: number): CellDisplay {
  const cell = sheet.cells[cellKey(row, col)];
  const style = wb.styles[styleIndexAt(sheet, row, col, cell)] ?? {};
  const h = style.align?.h ?? 'general';
  const sheetRtl = Boolean(sheet.rtl);
  if (!cell || (cell.v === undefined && cell.e === undefined)) {
    return { text: '', kind: 'empty', align: h === 'general' ? 'left' : (h as HAlign), style, rtl: false };
  }
  let text: string;
  let kind: CellDisplay['kind'];
  let color: string | undefined;
  let numeric: number | undefined;
  if (cell.e !== undefined) {
    text = cell.e;
    kind = 'error';
  } else if (typeof cell.v === 'number') {
    const formatted = formatValue(cell.v, style.numFmt);
    text = formatted.text;
    color = formatted.color;
    kind = 'number';
    numeric = cell.v;
  } else if (typeof cell.v === 'boolean') {
    text = cell.v ? 'TRUE' : 'FALSE';
    kind = 'bool';
  } else {
    const formatted = formatValue(cell.v ?? '', style.numFmt);
    text = formatted.text;
    color = formatted.color;
    kind = 'text';
  }
  const rtl = kind === 'text' && hasRtl(text);
  let align: HAlign;
  if (h === 'general') {
    if (kind === 'text') align = sheetRtl || rtl ? 'right' : 'left';
    else align = kind === 'number' ? (sheetRtl ? 'left' : 'right') : 'center';
  } else if (h === 'centerContinuous') align = 'center';
  else if (h === 'distributed') align = 'justify';
  else align = h as HAlign;
  return { text, kind, align, color, style, rtl, value: numeric };
}

/** Plain text of a cell the way it is shown (clipboard, CSV, auto-fit). */
export const shownText = (wb: Workbook, sheet: Sheet, row: number, col: number): string => cellDisplay(wb, sheet, row, col).text;
