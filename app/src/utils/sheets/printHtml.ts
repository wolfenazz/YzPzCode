// A printable (and exportable) HTML view of sheets: used for PDF and the
// standalone HTML export. Dependency-free (tested by `npm run test:sheets`).

import { cellKey, type RangeRef } from './address';
import { chartSvg, resolveChart } from './charts';
import { cellDisplay } from './display';
import { colPixels, rowPixels, sheetMerges } from './gridModel';
import type { Sheet, Workbook } from './types';

export interface PrintOptions {
  sheets: number[];
  orientation: 'portrait' | 'landscape';
  paper: 'a4' | 'letter';
  gridlines: boolean;
  /** Scale a sheet down to the page width. */
  fitWidth: boolean;
  /** Put the frozen rows (or the first row) at the top of every page. */
  repeatHeader: boolean;
  charts: boolean;
  title?: string;
}

export const DEFAULT_PRINT: PrintOptions = { sheets: [], orientation: 'landscape', paper: 'a4', gridlines: false, fitWidth: true, repeatHeader: true, charts: true };

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The block from A1 to the last cell with a value or a visible style. */
function usedRange(sheet: Sheet): RangeRef | null {
  let r2 = -1;
  let c2 = -1;
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const visible = cell.v !== undefined || cell.e !== undefined || cell.f !== undefined || Boolean(cell.s);
    if (!visible) continue;
    const m = /^([A-Z]+)(d+)$/.exec(key);
    if (!m) continue;
    let col = 0;
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    r2 = Math.max(r2, Number(m[2]) - 1);
    c2 = Math.max(c2, col - 1);
  }
  for (const merge of sheetMerges(sheet)) {
    r2 = Math.max(r2, merge.range.r2);
    c2 = Math.max(c2, merge.range.c2);
  }
  return r2 < 0 ? null : { r1: 0, c1: 0, r2, c2 };
}

const BORDER_CSS: Record<string, string> = {
  thin: '1px solid', medium: '2px solid', thick: '3px solid', dashed: '1px dashed', dotted: '1px dotted', double: '3px double', hair: '1px dotted', mediumDashed: '2px dashed', dashDot: '1px dashed', slantDashDot: '1px dashed',
};

function sheetHtml(wb: Workbook, index: number, options: PrintOptions, pageWidthPx: number): string {
  const sheet = wb.sheets[index];
  const range = usedRange(sheet);
  const heading = `<h2 class="sheet-title" dir="auto">${escapeHtml(sheet.name)}</h2>`;
  if (!range) return `<section>${heading}<p class="empty">This sheet is empty.</p></section>`;
  const merges = sheetMerges(sheet);
  const covered = new Set<string>();
  const starts = new Map<string, { rowspan: number; colspan: number }>();
  for (const { range: m } of merges) {
    starts.set(cellKey(m.r1, m.c1), { rowspan: m.r2 - m.r1 + 1, colspan: m.c2 - m.c1 + 1 });
    for (let r = m.r1; r <= m.r2; r += 1) for (let c = m.c1; c <= m.c2; c += 1) if (r !== m.r1 || c !== m.c1) covered.add(cellKey(r, c));
  }
  const cols: number[] = [];
  let totalWidth = 0;
  for (let c = range.c1; c <= range.c2; c += 1) {
    const info = sheet.cols[c];
    if (info?.hidden) continue;
    const width = colPixels(info?.width, sheet.defaultColWidth);
    cols.push(c);
    totalWidth += width;
  }
  const scale = options.fitWidth && totalWidth > pageWidthPx ? pageWidthPx / totalWidth : 1;
  const headerRows = options.repeatHeader ? (sheet.freeze?.rows ?? 0) || 1 : 0;
  const rowsHtml: string[] = [];
  for (let r = range.r1; r <= range.r2; r += 1) {
    if (sheet.rows[r]?.hidden) continue;
    const height = rowPixels(sheet.rows[r]?.height, sheet.defaultRowHeight);
    const cells: string[] = [];
    for (const c of cols) {
      const key = cellKey(r, c);
      if (covered.has(key)) continue;
      const display = cellDisplay(wb, sheet, r, c);
      const style = display.style;
      const css: string[] = [];
      if (style.font?.bold) css.push('font-weight:700');
      if (style.font?.italic) css.push('font-style:italic');
      const decorations = [style.font?.underline ? 'underline' : '', style.font?.strike ? 'line-through' : ''].filter(Boolean).join(' ');
      if (decorations) css.push(`text-decoration:${decorations}`);
      if (style.font?.color) css.push(`color:${style.font.color}`);
      if (style.font?.name) css.push(`font-family:'${style.font.name}',Calibri,Arial,sans-serif`);
      if (style.font?.size) css.push(`font-size:${style.font.size}pt`);
      const fill = style.fill;
      if (fill) css.push(`background:${fill}`);
      const color = display.color;
      if (color) css.push(`color:${color}`);
      css.push(`text-align:${display.align === 'justify' ? 'justify' : display.align === 'fill' ? 'left' : display.align}`);
      css.push(`vertical-align:${style.align?.v === 'top' ? 'top' : style.align?.v === 'center' ? 'middle' : 'bottom'}`);
      if (style.align?.wrap) css.push('white-space:pre-wrap');
      if (style.align?.indent) css.push(`padding-inline-start:${style.align.indent * 9 + 3}px`);
      for (const side of ['left', 'right', 'top', 'bottom'] as const) {
        const edge = style.border?.[side];
        if (edge) css.push(`border-${side}:${BORDER_CSS[edge.style] ?? '1px solid'} ${edge.color ?? '#000'}`);
      }
      const span = starts.get(key);
      const attrs = `${span?.colspan && span.colspan > 1 ? ` colspan="${span.colspan}"` : ''}${span?.rowspan && span.rowspan > 1 ? ` rowspan="${span.rowspan}"` : ''}`;
      cells.push(`<td${attrs} dir="${sheet.rtl || display.rtl ? 'rtl' : 'auto'}" style="${css.join(';')}">${escapeHtml(display.text).replace(/\n/g, '<br>')}</td>`);
    }
    rowsHtml.push(`<tr style="height:${height}px">${cells.join('')}</tr>`);
  }
  const colgroup = `<colgroup>${cols.map((c) => `<col style="width:${colPixels(sheet.cols[c]?.width, sheet.defaultColWidth)}px">`).join('')}</colgroup>`;
  const head = headerRows > 0 ? `<thead>${rowsHtml.slice(0, headerRows).join('')}</thead><tbody>${rowsHtml.slice(headerRows).join('')}</tbody>` : `<tbody>${rowsHtml.join('')}</tbody>`;
  const table = `<table class="grid${options.gridlines ? ' lines' : ''}" dir="${sheet.rtl ? 'rtl' : 'ltr'}" style="width:${totalWidth}px">${colgroup}${head}</table>`;
  const charts = options.charts ? sheet.charts.map((chart) => {
    const data = resolveChart(wb, chart, index);
    return `<figure class="chart">${chartSvg(chart, data, 640, 360)}</figure>`;
  }).join('') : '';
  return `<section>${heading}<div class="wrap" style="zoom:${scale.toFixed(4)}">${table}</div>${charts}</section>`;
}

/** A standalone HTML document for the chosen sheets. */
export function workbookToHtml(wb: Workbook, options: PrintOptions): string {
  const paper = options.paper === 'letter' ? { w: 8.5, h: 11 } : { w: 8.27, h: 11.69 };
  const landscape = options.orientation === 'landscape';
  const widthIn = landscape ? paper.h : paper.w;
  const pageWidthPx = Math.floor((widthIn - 0.8) * 96);
  const sheets = (options.sheets.length ? options.sheets : wb.sheets.map((_, i) => i)).filter((i) => wb.sheets[i]);
  const body = sheets.map((index) => sheetHtml(wb, index, options, pageWidthPx)).join('');
  const rtlDoc = sheets.length > 0 && sheets.every((i) => wb.sheets[i].rtl);
  return `<!doctype html><html lang="en" dir="${rtlDoc ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escapeHtml(options.title ?? 'Workbook')}</title><style>
@page { size: ${options.paper === 'letter' ? 'letter' : 'A4'} ${options.orientation}; margin: 0.4in; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Calibri, 'Segoe UI', Arial, 'Noto Sans Arabic', sans-serif; font-size: 11pt; color: #1f2328; background: #fff; }
section { page-break-after: always; padding: 0; }
section:last-child { page-break-after: auto; }
.sheet-title { font-size: 12pt; font-weight: 600; margin: 0 0 8px; color: #444; }
table.grid { border-collapse: collapse; table-layout: fixed; }
table.grid td { padding: 1px 4px; overflow: hidden; text-overflow: clip; white-space: nowrap; }
table.grid.lines td { border: 1px solid #d0d4da; }
tr { page-break-inside: avoid; }
thead { display: table-header-group; }
figure.chart { margin: 16px 0 0; page-break-inside: avoid; }
.empty { color: #888; }
</style></head><body>${body}</body></html>`;
}
