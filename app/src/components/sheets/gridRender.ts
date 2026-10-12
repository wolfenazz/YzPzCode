// Draws the grid on a canvas: frozen panes, headers, fills, borders, text with
// overflow and wrap, conditional formats, selection and proposal tints.

import { cellKey, colName, type RangeRef } from '../../utils/sheets/address';
import type { CfEffect, CfEvaluator } from '../../utils/sheets/cfEngine';
import { cellDisplay, styleIndexAt, type CellDisplay } from '../../utils/sheets/display';
import { mergeAt, sheetAxes, sheetMerges } from '../../utils/sheets/gridModel';
import { generalFit } from '../../utils/sheets/numberFormat';
import type { BorderEdge, CellStyle, Sheet, Workbook } from '../../utils/sheets/types';
import type { GridSelection } from '../../stores/sheetsSessionStore';
import { validationAt } from '../../utils/sheets/validation';

export interface GridTheme {
  dark: boolean;
  paper: string;
  ink: string;
  grid: string;
  headerBg: string;
  headerInk: string;
  headerLine: string;
  accent: string;
  fontFamily: string;
}

export const ROW_HEADER_MIN = 40;

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  wb: Workbook;
  sheet: Sheet;
  sheetIndex: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
  selection: GridSelection;
  theme: GridTheme;
  /** Cells the assistant changed (tinted) and cells it added. */
  tint: Set<string> | null;
  /** The cell being edited: its text is not drawn under the editor. */
  editing: { row: number; col: number } | null;
  /** The copied range (dashed outline). */
  copied: RangeRef | null;
  /** Ranges referenced by the formula being edited, with their colours. */
  references: Array<{ range: RangeRef; color: string }>;
  showFormulas: boolean;
  cf: CfEvaluator | null;
}

export interface Layout {
  headerW: number;
  headerH: number;
  frozenW: number;
  frozenH: number;
  frozenCols: number;
  frozenRows: number;
  firstCol: number;
  lastCol: number;
  firstRow: number;
  lastRow: number;
  rtl: boolean;
}

/** Row header width grows with the number of digits in the last visible row. */
export function headerWidth(lastRow: number, zoom: number): number {
  return Math.max(ROW_HEADER_MIN, 12 + String(lastRow + 1).length * 8) * zoom;
}

/** Visible index ranges and pane sizes for a scroll position. */
export function computeLayout(sheet: Sheet, width: number, height: number, zoom: number, scrollX: number, scrollY: number, headings: boolean): Layout {
  const { cols, rows } = sheetAxes(sheet);
  const frozenCols = sheet.freeze?.cols ?? 0;
  const frozenRows = sheet.freeze?.rows ?? 0;
  const approxRow = rows.indexAt(rows.offset(frozenRows) + scrollY / zoom);
  const headerW = headings ? headerWidth(approxRow + Math.ceil(height / (20 * zoom)), zoom) : 0;
  const headerH = headings ? 22 * zoom : 0;
  const frozenW = cols.offset(frozenCols) * zoom;
  const frozenH = rows.offset(frozenRows) * zoom;
  const firstCol = cols.indexAt(cols.offset(frozenCols) + scrollX / zoom);
  const firstRow = rows.indexAt(rows.offset(frozenRows) + scrollY / zoom);
  let x = headerW + frozenW;
  let lastCol = firstCol;
  while (x < width && lastCol < 16383) {
    x += cols.size(lastCol) * zoom;
    if (x >= width) break;
    lastCol += 1;
  }
  let y = headerH + frozenH;
  let lastRow = firstRow;
  while (y < height && lastRow < 1048575) {
    y += rows.size(lastRow) * zoom;
    if (y >= height) break;
    lastRow += 1;
  }
  return { headerW, headerH, frozenW, frozenH, frozenCols, frozenRows, firstCol, lastCol, firstRow, lastRow, rtl: Boolean(sheet.rtl) };
}

/** Screen x of the left edge of a column (logical, before RTL mirroring). */
export function colScreenX(sheet: Sheet, layout: Layout, zoom: number, scrollX: number, col: number): number {
  const { cols } = sheetAxes(sheet);
  if (col < layout.frozenCols) return layout.headerW + cols.offset(col) * zoom;
  return layout.headerW + layout.frozenW + (cols.offset(col) - cols.offset(layout.frozenCols)) * zoom - scrollX;
}

export function rowScreenY(sheet: Sheet, layout: Layout, zoom: number, scrollY: number, row: number): number {
  const { rows } = sheetAxes(sheet);
  if (row < layout.frozenRows) return layout.headerH + rows.offset(row) * zoom;
  return layout.headerH + layout.frozenH + (rows.offset(row) - rows.offset(layout.frozenRows)) * zoom - scrollY;
}

export function readGridTheme(element: HTMLElement): GridTheme {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  const paper = read('--bg-primary', '#ffffff');
  const dark = luminance(paper) < 0.4;
  const ink = read('--text-primary', '#1f2328');
  return {
    dark,
    paper: dark ? paper : '#ffffff',
    ink: dark ? ink : '#1f2328',
    grid: dark ? 'rgba(255,255,255,0.09)' : '#dcdfe4',
    headerBg: dark ? 'rgba(255,255,255,0.045)' : '#f5f6f8',
    headerInk: dark ? 'rgba(255,255,255,0.62)' : '#5f6672',
    headerLine: dark ? 'rgba(255,255,255,0.12)' : '#d3d7dd',
    accent: read('--accent', '#3b82f6'),
    fontFamily: read('--font-ui', "'Segoe UI', system-ui, sans-serif"),
  };
}

function luminance(color: string): number {
  const probe = color.trim();
  let r = 255;
  let g = 255;
  let b = 255;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(probe);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const rgb = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(probe);
    if (rgb) [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const FONT_STACK = "Calibri, 'Segoe UI', Arial, 'Noto Sans', 'Noto Sans Arabic', sans-serif";

function fontString(style: CellStyle, defaults: { name: string; size: number }, zoom: number, cf?: CfEffect | null): string {
  const f = style.font ?? {};
  const bold = f.bold || cf?.font?.bold;
  const italic = f.italic || cf?.font?.italic;
  const px = (f.size ?? defaults.size) * (96 / 72) * zoom;
  const name = f.name ?? defaults.name;
  return `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${px.toFixed(2)}px ${/\s/.test(name) ? `'${name}'` : name}, ${FONT_STACK}`;
}

const BORDER_WIDTH: Record<string, number> = { thin: 1, hair: 1, dotted: 1, dashed: 1, dashDot: 1, slantDashDot: 1, medium: 2, mediumDashed: 2, thick: 3, double: 3 };

function inkColor(color: string | undefined, theme: GridTheme): string {
  if (!color) return theme.ink;
  if (theme.dark && luminance(color) < 0.28) return theme.ink;
  return color;
}

function fillColor(color: string | undefined, theme: GridTheme): string | undefined {
  if (!color) return undefined;
  // A white fill on a dark sheet would shout; keep it as the paper.
  if (theme.dark && luminance(color) > 0.97) return undefined;
  return color;
}

interface DrawCell {
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Merge (when this is the top-left of one). */
  merged: boolean;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    const words = paragraph.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (ctx.measureText(candidate).width <= maxWidth || line === '') {
        line = candidate;
        if (ctx.measureText(line).width > maxWidth && word.length > 1) {
          // A single long word breaks by character.
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
              out.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        }
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export function renderGrid(input: RenderInput): Layout {
  const { ctx, width, height, dpr, wb, sheet, zoom, scrollX, scrollY, theme } = input;
  const headings = sheet.headings !== false;
  const layout = computeLayout(sheet, width, height, zoom, scrollX, scrollY, headings);
  const { cols, rows } = sheetAxes(sheet);
  const defaults = wb.defaultFont ?? { name: 'Calibri', size: 11 };
  const rtl = layout.rtl;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, width, height);

  /** Mirrors a horizontal span for right-to-left sheets. */
  const mx = (x: number, w: number): number => (rtl ? width - x - w : x);
  const gridlines = sheet.gridlines !== false;
  const merges = sheetMerges(sheet);
  const hiddenByMerge = (row: number, col: number): boolean => {
    if (merges.length === 0) return false;
    const merge = mergeAt(sheet, row, col);
    return merge !== null && !(merge.range.r1 === row && merge.range.c1 === col);
  };

  const regions: Array<{ clip: [number, number, number, number]; rowFrom: number; rowTo: number; colFrom: number; colTo: number }> = [];
  const bodyX = layout.headerW + layout.frozenW;
  const bodyY = layout.headerH + layout.frozenH;
  const colsFrozen = layout.frozenCols > 0;
  const rowsFrozen = layout.frozenRows > 0;
  regions.push({ clip: [bodyX, bodyY, width - bodyX, height - bodyY], rowFrom: layout.firstRow, rowTo: layout.lastRow, colFrom: layout.firstCol, colTo: layout.lastCol });
  if (colsFrozen) regions.push({ clip: [layout.headerW, bodyY, layout.frozenW, height - bodyY], rowFrom: layout.firstRow, rowTo: layout.lastRow, colFrom: 0, colTo: layout.frozenCols - 1 });
  if (rowsFrozen) regions.push({ clip: [bodyX, layout.headerH, width - bodyX, layout.frozenH], rowFrom: 0, rowTo: layout.frozenRows - 1, colFrom: layout.firstCol, colTo: layout.lastCol });
  if (colsFrozen && rowsFrozen) regions.push({ clip: [layout.headerW, layout.headerH, layout.frozenW, layout.frozenH], rowFrom: 0, rowTo: layout.frozenRows - 1, colFrom: 0, colTo: layout.frozenCols - 1 });

  const xOf = (col: number): number => colScreenX(sheet, layout, zoom, scrollX, col);
  const yOf = (row: number): number => rowScreenY(sheet, layout, zoom, scrollY, row);
  const emptyAt = (row: number, col: number): boolean => {
    const cell = sheet.cells[cellKey(row, col)];
    return !cell || (cell.v === undefined && cell.e === undefined && cell.f === undefined);
  };

  for (const region of regions) {
    const [cx, cy, cw, ch] = region.clip;
    if (cw <= 0 || ch <= 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx(cx, cw), cy, cw, ch);
    ctx.clip();

    const drawCells: DrawCell[] = [];
    for (let row = region.rowFrom; row <= region.rowTo; row += 1) {
      const h = rows.size(row) * zoom;
      if (h === 0) continue;
      const y = yOf(row);
      for (let col = region.colFrom; col <= region.colTo; col += 1) {
        const w = cols.size(col) * zoom;
        if (w === 0) continue;
        const x = xOf(col);
        let rect: DrawCell = { row, col, x, y, w, h, merged: false };
        if (merges.length) {
          const merge = mergeAt(sheet, row, col);
          if (merge) {
            if (merge.range.r1 !== row || merge.range.c1 !== col) {
              // Only the corner draws; a merge that starts before the region still needs its visible part drawn once.
              const startsBefore = merge.range.r1 < region.rowFrom || merge.range.c1 < region.colFrom;
              const firstVisible = row === Math.max(merge.range.r1, region.rowFrom) && col === Math.max(merge.range.c1, region.colFrom);
              if (!(startsBefore && firstVisible)) continue;
            }
            const mx1 = xOf(merge.range.c1);
            const my1 = yOf(merge.range.r1);
            const w2 = (cols.offset(merge.range.c2 + 1) - cols.offset(merge.range.c1)) * zoom;
            const h2 = (rows.offset(merge.range.r2 + 1) - rows.offset(merge.range.r1)) * zoom;
            rect = { row: merge.range.r1, col: merge.range.c1, x: mx1, y: my1, w: w2, h: h2, merged: true };
          }
        }
        drawCells.push(rect);
      }
    }

    // Gridlines.
    if (gridlines) {
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let col = region.colFrom; col <= region.colTo + 1; col += 1) {
        const x = Math.round(xOf(col)) + 0.5;
        ctx.moveTo(mx(x, 0), cy);
        ctx.lineTo(mx(x, 0), cy + ch);
      }
      for (let row = region.rowFrom; row <= region.rowTo + 1; row += 1) {
        const y = Math.round(yOf(row)) + 0.5;
        ctx.moveTo(mx(cx, cw), y);
        ctx.lineTo(mx(cx, cw) + cw, y);
      }
      ctx.stroke();
    }

    // Fills, conditional fills, proposal tints and data bars.
    const effects = new Map<DrawCell, CfEffect | null>();
    for (const rect of drawCells) {
      const cell = sheet.cells[cellKey(rect.row, rect.col)];
      const style = wb.styles[styleIndexAt(sheet, rect.row, rect.col, cell)] ?? {};
      const effect = input.cf?.active ? input.cf.effect(rect.row, rect.col) : null;
      effects.set(rect, effect);
      const fill = fillColor(effect?.fill ?? style.fill, theme);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(mx(rect.x, rect.w), rect.y, rect.w, rect.h);
        if (gridlines) {
          // The gridline between two filled cells stays quiet; the edge keeps the grid colour.
        }
      }
      if (effect?.bar) {
        ctx.fillStyle = effect.bar.color;
        ctx.globalAlpha = 0.45;
        const bw = Math.max(2, (rect.w - 4) * effect.bar.ratio);
        ctx.fillRect(mx(rect.x + 2, bw), rect.y + 2, bw, rect.h - 4);
        ctx.globalAlpha = 1;
      }
      if (input.tint?.has(cellKey(rect.row, rect.col))) {
        ctx.fillStyle = theme.dark ? 'rgba(74, 190, 120, 0.22)' : 'rgba(46, 160, 90, 0.17)';
        ctx.fillRect(mx(rect.x, rect.w), rect.y, rect.w, rect.h);
      }
    }

    // Borders.
    const drawEdge = (edge: BorderEdge | undefined, x1: number, y1: number, x2: number, y2: number): void => {
      if (!edge) return;
      ctx.strokeStyle = inkColor(edge.color, theme);
      ctx.lineWidth = Math.max(1, (BORDER_WIDTH[edge.style] ?? 1) * (zoom >= 1 ? 1 : zoom));
      ctx.setLineDash(edge.style === 'dashed' || edge.style === 'mediumDashed' ? [4, 3] : edge.style === 'dotted' || edge.style === 'hair' ? [1.5, 2] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    for (const rect of drawCells) {
      const cell = sheet.cells[cellKey(rect.row, rect.col)];
      const style = wb.styles[styleIndexAt(sheet, rect.row, rect.col, cell)] ?? {};
      const border = effects.get(rect)?.border ?? style.border;
      if (!border) continue;
      const x0 = Math.round(mx(rect.x, rect.w)) + 0.5;
      const x1 = Math.round(mx(rect.x, rect.w) + rect.w) + 0.5;
      const y0 = Math.round(rect.y) + 0.5;
      const y1 = Math.round(rect.y + rect.h) + 0.5;
      // Physical sides: "left" is the leading side of the column, mirrored on RTL sheets.
      drawEdge(rtl ? border.right : border.left, x0, y0, x0, y1);
      drawEdge(rtl ? border.left : border.right, x1, y0, x1, y1);
      drawEdge(border.top, x0, y0, x1, y0);
      drawEdge(border.bottom, x0, y1, x1, y1);
    }

    // Text.
    for (const rect of drawCells) {
      if (input.editing && input.editing.row === rect.row && input.editing.col === rect.col) continue;
      const key = cellKey(rect.row, rect.col);
      const cell = sheet.cells[key];
      if (!cell) {
        continue;
      }
      if (hiddenByMerge(rect.row, rect.col) && !rect.merged) continue;
      let display: CellDisplay = cellDisplay(wb, sheet, rect.row, rect.col);
      if (input.showFormulas && cell.f !== undefined) display = { ...display, text: `=${cell.f}`, kind: 'text', align: 'left' };
      const effect = effects.get(rect) ?? null;
      if (effect?.numFmt && typeof cell.v === 'number') {
        // A conditional number format changes only what is shown.
        display = { ...display };
      }
      if (display.text === '' && !effect?.icon) continue;
      drawCellText(ctx, input, display, rect, effect, defaults, mx, emptyAt);
    }

    // Icons (conditional icon sets) are drawn over the text's start.
    for (const rect of drawCells) {
      const icon = effects.get(rect)?.icon;
      if (!icon) continue;
      const size = Math.min(rect.h - 6, 14 * zoom);
      const palette = ['#2e9e5b', '#e0a100', '#d64545', '#8a8f98', '#3b82f6'];
      const color = icon.count === 3 ? palette[icon.index] : palette[Math.min(4, icon.index)];
      ctx.fillStyle = color;
      ctx.beginPath();
      const cxm = mx(rect.x + 4 * zoom + size / 2, 0);
      ctx.arc(cxm, rect.y + rect.h / 2, size / 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Pane dividers.
  ctx.strokeStyle = theme.dark ? 'rgba(255,255,255,0.28)' : '#9aa1ab';
  ctx.lineWidth = 1;
  if (colsFrozen) {
    const x = Math.round(mx(layout.headerW + layout.frozenW, 0)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, layout.headerH);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  if (rowsFrozen) {
    const y = Math.round(layout.headerH + layout.frozenH) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  drawOverlays(ctx, input, layout, mx);
  if (headings) drawHeaders(ctx, input, layout, mx, xOf, yOf);
  return layout;
}

function drawCellText(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
  display: CellDisplay,
  rect: DrawCell,
  effect: CfEffect | null,
  defaults: { name: string; size: number },
  mx: (x: number, w: number) => number,
  emptyAt: (row: number, col: number) => boolean,
): void {
  const { zoom, theme } = input;
  const style = display.style;
  ctx.save();
  const pad = 3 * zoom;
  const indent = (style.align?.indent ?? 0) * 9 * zoom;
  const font = fontString(style, defaults, zoom, effect);
  ctx.font = font;
  // A dark colour is lightened on a dark sheet only when nothing is painted behind it.
  const background = effect?.fill ?? style.fill;
  const wanted = effect?.font?.color ?? display.color ?? style.font?.color;
  if (background) {
    // Text on a painted cell: its own colour, else black or white by the fill's brightness.
    ctx.fillStyle = wanted ?? (luminance(background) > 0.5 ? '#1f2328' : '#ffffff');
  } else ctx.fillStyle = inkColor(wanted, theme);
  ctx.textBaseline = 'alphabetic';
  ctx.direction = display.rtl || (input.sheet.rtl && display.kind !== 'number') ? 'rtl' : 'ltr';
  const px = (style.font?.size ?? defaults.size) * (96 / 72) * zoom;
  let text = display.text;
  const wrap = style.align?.wrap === true && display.kind === 'text';
  const align = display.align;
  const vAlign = style.align?.v ?? 'bottom';

  // Numbers that do not fit show as hashes, like Excel.
  const innerW = rect.w - pad * 2 - indent;
  if (display.kind === 'number' && ctx.measureText(text).width > innerW) {
    // General numbers give up decimals first, like Excel; formatted ones become hashes.
    const general = !display.style.numFmt || display.style.numFmt === 'General';
    let fitted: string | null = null;
    if (general && display.value !== undefined) {
      for (let chars = 14; chars >= 1 && fitted === null; chars -= 1) {
        const candidate = generalFit(display.value, chars);
        if (ctx.measureText(candidate).width <= innerW) fitted = candidate;
      }
    }
    if (fitted !== null) text = fitted;
    else {
      const hash = Math.max(1, Math.floor(innerW / ctx.measureText('#').width));
      text = '#'.repeat(hash);
    }
  }

  const lineHeight = px * 1.22;
  let lines: string[];
  if (wrap) lines = wrapLines(ctx, text, Math.max(10, innerW));
  else lines = [text.replace(/\n/g, ' ')];
  if (style.align?.shrink && !wrap) {
    const widthNeeded = ctx.measureText(lines[0]).width;
    if (widthNeeded > innerW && innerW > 4) {
      const scale = innerW / widthNeeded;
      ctx.font = font.replace(/([\d.]+)px/, (_m, size: string) => `${(Number(size) * scale).toFixed(2)}px`);
    }
  }

  // Free space next to a left or right aligned value, for overflow.
  let leftExtra = 0;
  let rightExtra = 0;
  if (!wrap && display.kind === 'text' && !rect.merged) {
    const needed = ctx.measureText(lines[0]).width + pad * 2 + indent;
    if (needed > rect.w) {
      const { cols } = sheetAxes(input.sheet);
      const reach = (step: 1 | -1): number => {
        let extra = 0;
        let col = rect.col + step;
        while (col >= 0 && col < 16384 && extra + rect.w < needed && Math.abs(col - rect.col) < 40) {
          if (!emptyAt(rect.row, col) || mergeAt(input.sheet, rect.row, col)) break;
          if (rect.x + (step > 0 ? rect.w + extra : -extra) > input.width + 200) break;
          extra += cols.size(col) * zoom;
          col += step;
        }
        return extra;
      };
      // Text flows to the right for left/leading alignment, to the left for right alignment, both ways when centred.
      const flowsRight = align === 'left';
      const flowsLeft = align === 'right';
      if (align === 'center') {
        leftExtra = reach(-1) / 2;
        rightExtra = reach(1) / 2;
      } else if (flowsRight) rightExtra = reach(1);
      else if (flowsLeft) leftExtra = reach(-1);
    }
  }

  const clipX = rect.x - leftExtra;
  const clipW = rect.w + leftExtra + rightExtra;
  ctx.beginPath();
  ctx.rect(mx(clipX, clipW), rect.y, clipW, rect.h);
  ctx.clip();

  const total = lines.length * lineHeight;
  let top: number;
  if (vAlign === 'top') top = rect.y + 2 * zoom;
  else if (vAlign === 'center') top = rect.y + (rect.h - total) / 2;
  else top = rect.y + rect.h - total - 2 * zoom;
  if (!wrap) top = vAlign === 'top' ? rect.y + 2 * zoom : vAlign === 'center' ? rect.y + (rect.h - lineHeight) / 2 : rect.y + rect.h - lineHeight - 2 * zoom;

  lines.forEach((line, index) => {
    const baseline = top + index * lineHeight + lineHeight * 0.78;
    const width = ctx.measureText(line).width;
    let x: number;
    if (align === 'right') x = rect.x + rect.w - pad - indent - width;
    else if (align === 'center' || align === 'fill') x = rect.x + (rect.w - width) / 2;
    else x = rect.x + pad + indent;
    // Overflowing text of a left-aligned cell in a RTL sheet stays anchored to its edge.
    ctx.textAlign = 'left';
    const screenX = mx(x, width);
    ctx.fillText(line, screenX, baseline);
    const fontStyle = style.font ?? {};
    const underline = fontStyle.underline || effect?.font?.underline;
    const strike = fontStyle.strike || effect?.font?.strike;
    if (underline || strike) {
      ctx.strokeStyle = ctx.fillStyle as string;
      ctx.lineWidth = Math.max(1, px / 14);
      ctx.beginPath();
      if (underline) {
        ctx.moveTo(screenX, baseline + px * 0.12);
        ctx.lineTo(screenX + width, baseline + px * 0.12);
      }
      if (strike) {
        ctx.moveTo(screenX, baseline - px * 0.3);
        ctx.lineTo(screenX + width, baseline - px * 0.3);
      }
      ctx.stroke();
    }
  });

  // Marks in the corner: a note, a validation arrow when selected is drawn by the overlay.
  ctx.restore();
  const key = cellKey(rect.row, rect.col);
  if (input.sheet.notes[key]) {
    ctx.fillStyle = '#d64545';
    const x = mx(rect.x + rect.w - 1, 0);
    const size = 5 * Math.max(0.8, zoom);
    ctx.beginPath();
    ctx.moveTo(x - (input.sheet.rtl ? -size : size), rect.y + 1);
    ctx.lineTo(x, rect.y + 1);
    ctx.lineTo(x, rect.y + 1 + size);
    ctx.closePath();
    ctx.fill();
  }
}

function rangeRect(sheet: Sheet, layout: Layout, zoom: number, scrollX: number, scrollY: number, range: RangeRef): { x: number; y: number; w: number; h: number } {
  const { cols, rows } = sheetAxes(sheet);
  const x = colScreenX(sheet, layout, zoom, scrollX, range.c1);
  const y = rowScreenY(sheet, layout, zoom, scrollY, range.r1);
  const w = (cols.offset(range.c2 + 1) - cols.offset(range.c1)) * zoom;
  const h = (rows.offset(range.r2 + 1) - rows.offset(range.r1)) * zoom;
  return { x, y, w, h };
}

export { rangeRect };

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
  layout: Layout,
  mx: (x: number, w: number) => number,
): void {
  const { sheet, zoom, scrollX, scrollY, theme, selection, width, height } = input;
  ctx.save();
  // Keep selection out of the headers.
  ctx.beginPath();
  ctx.rect(0, layout.headerH, width, height - layout.headerH);
  ctx.clip();
  const clipTo = (fn: () => void): void => {
    // A range may span the frozen divider; each pane draws its part.
    const panes: Array<[number, number, number, number]> = [];
    const bodyX = layout.headerW + layout.frozenW;
    const bodyY = layout.headerH + layout.frozenH;
    panes.push([bodyX, bodyY, width - bodyX, height - bodyY]);
    if (layout.frozenCols) panes.push([layout.headerW, bodyY, layout.frozenW, height - bodyY]);
    if (layout.frozenRows) panes.push([bodyX, layout.headerH, width - bodyX, layout.frozenH]);
    if (layout.frozenCols && layout.frozenRows) panes.push([layout.headerW, layout.headerH, layout.frozenW, layout.frozenH]);
    for (const [px, py, pw, ph] of panes) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(mx(px, pw), py, pw, ph);
      ctx.clip();
      fn();
      ctx.restore();
    }
  };

  // Ranges referenced while a formula is edited.
  for (const reference of input.references) {
    const r = rangeRect(sheet, layout, zoom, scrollX, scrollY, reference.range);
    clipTo(() => {
      ctx.strokeStyle = reference.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(mx(r.x, r.w) + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.fillStyle = reference.color;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(mx(r.x, r.w), r.y, r.w, r.h);
      ctx.globalAlpha = 1;
    });
  }

  if (input.copied) {
    const r = rangeRect(sheet, layout, zoom, scrollX, scrollY, input.copied);
    clipTo(() => {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(mx(r.x, r.w) + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.setLineDash([]);
    });
  }

  selection.ranges.forEach((range, index) => {
    const r = rangeRect(sheet, layout, zoom, scrollX, scrollY, range);
    const last = index === selection.ranges.length - 1;
    clipTo(() => {
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.13;
      ctx.fillRect(mx(r.x, r.w), r.y, r.w, r.h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(mx(r.x, r.w) + 1, r.y + 1, r.w - 2, r.h - 2);
      if (last) {
        const size = 7;
        ctx.fillStyle = theme.accent;
        ctx.fillRect(mx(r.x + r.w, 0) - size / 2, r.y + r.h - size / 2, size, size);
      }
    });
  });

  // The active cell shows its own background through the selection tint.
  const active = selection.active;
  const merge = mergeAt(sheet, active.row, active.col);
  const cellRange: RangeRef = merge ? merge.range : { r1: active.row, c1: active.col, r2: active.row, c2: active.col };
  const ar = rangeRect(sheet, layout, zoom, scrollX, scrollY, cellRange);
  clipTo(() => {
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(mx(ar.x, ar.w) + 1, ar.y + 1, ar.w - 2, ar.h - 2);
    const display = validationAt(input.wb, input.sheetIndex, active.row, active.col);
    if (display?.type === 'list' && display.showDropdown !== false) {
      const size = Math.min(18 * zoom, ar.h - 4);
      const bx = mx(ar.x + ar.w - size - 1, size);
      ctx.fillStyle = theme.headerBg;
      ctx.fillRect(bx, ar.y + 2, size, ar.h - 4);
      ctx.strokeStyle = theme.headerLine;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, ar.y + 2.5, size - 1, ar.h - 5);
      ctx.fillStyle = theme.headerInk;
      ctx.beginPath();
      ctx.moveTo(bx + size * 0.28, ar.y + ar.h / 2 - 2);
      ctx.lineTo(bx + size * 0.72, ar.y + ar.h / 2 - 2);
      ctx.lineTo(bx + size * 0.5, ar.y + ar.h / 2 + 3);
      ctx.closePath();
      ctx.fill();
    }
  });
  ctx.restore();
}

function drawHeaders(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
  layout: Layout,
  mx: (x: number, w: number) => number,
  xOf: (col: number) => number,
  yOf: (row: number) => number,
): void {
  const { sheet, zoom, theme, selection, width, height } = input;
  const { cols, rows } = sheetAxes(sheet);
  const selectedCols = new Set<number>();
  const selectedRows = new Set<number>();
  const wholeCols = new Set<number>();
  const wholeRows = new Set<number>();
  for (const range of selection.ranges) {
    for (let c = range.c1; c <= Math.min(range.c2, range.c1 + 400); c += 1) selectedCols.add(c);
    for (let r = range.r1; r <= Math.min(range.r2, range.r1 + 2000); r += 1) selectedRows.add(r);
    if (range.r1 === 0 && range.r2 >= 1048575) for (let c = range.c1; c <= Math.min(range.c2, range.c1 + 400); c += 1) wholeCols.add(c);
    if (range.c1 === 0 && range.c2 >= 16383) for (let r = range.r1; r <= Math.min(range.r2, range.r1 + 2000); r += 1) wholeRows.add(r);
  }
  const fontPx = 11 * zoom;
  ctx.save();
  ctx.font = `${fontPx.toFixed(1)}px ${theme.fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.direction = 'ltr';

  // Column headers.
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(0, 0, width, layout.headerH);
  ctx.strokeStyle = theme.headerLine;
  ctx.lineWidth = 1;
  const drawColHeader = (col: number): void => {
    const w = cols.size(col) * zoom;
    if (w === 0) return;
    const x = xOf(col);
    if (x + w < layout.headerW || x > width) return;
    const selected = selectedCols.has(col);
    if (selected) {
      ctx.fillStyle = wholeCols.has(col) ? theme.accent : `${theme.accent}33`;
      ctx.globalAlpha = wholeCols.has(col) ? 0.9 : 1;
      ctx.fillRect(mx(x, w), 0, w, layout.headerH);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = wholeCols.has(col) ? '#ffffff' : selected ? theme.ink : theme.headerInk;
    ctx.fillText(colName(col), mx(x, w) + w / 2, layout.headerH / 2 + 1);
    ctx.beginPath();
    const lx = Math.round(mx(x, w) + (input.sheet.rtl ? 0 : w)) + 0.5;
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, layout.headerH);
    ctx.stroke();
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx(layout.headerW + layout.frozenW, width - layout.headerW - layout.frozenW), 0, width - layout.headerW - layout.frozenW, layout.headerH);
  ctx.clip();
  for (let c = layout.firstCol; c <= layout.lastCol; c += 1) drawColHeader(c);
  ctx.restore();
  for (let c = 0; c < layout.frozenCols; c += 1) drawColHeader(c);

  // Row headers.
  const rx = input.sheet.rtl ? width - layout.headerW : 0;
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(rx, layout.headerH, layout.headerW, height - layout.headerH);
  const drawRowHeader = (row: number): void => {
    const h = rows.size(row) * zoom;
    if (h === 0) return;
    const y = yOf(row);
    if (y + h < layout.headerH || y > height) return;
    const selected = selectedRows.has(row);
    if (selected) {
      ctx.fillStyle = wholeRows.has(row) ? theme.accent : `${theme.accent}33`;
      ctx.globalAlpha = wholeRows.has(row) ? 0.9 : 1;
      ctx.fillRect(rx, y, layout.headerW, h);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = wholeRows.has(row) ? '#ffffff' : selected ? theme.ink : theme.headerInk;
    ctx.fillText(String(row + 1), rx + layout.headerW / 2, y + h / 2 + 1);
    ctx.beginPath();
    ctx.moveTo(rx, Math.round(y + h) + 0.5);
    ctx.lineTo(rx + layout.headerW, Math.round(y + h) + 0.5);
    ctx.stroke();
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, layout.headerH + layout.frozenH, layout.headerW, height - layout.headerH - layout.frozenH);
  ctx.clip();
  for (let r = layout.firstRow; r <= layout.lastRow; r += 1) drawRowHeader(r);
  ctx.restore();
  for (let r = 0; r < layout.frozenRows; r += 1) drawRowHeader(r);

  // The corner and the lines that close the header band.
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(rx, 0, layout.headerW, layout.headerH);
  ctx.strokeStyle = theme.headerLine;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(layout.headerH) + 0.5);
  ctx.lineTo(width, Math.round(layout.headerH) + 0.5);
  const edge = input.sheet.rtl ? Math.round(width - layout.headerW) + 0.5 : Math.round(layout.headerW) + 0.5;
  ctx.moveTo(edge, 0);
  ctx.lineTo(edge, height);
  ctx.stroke();
  ctx.restore();
}

