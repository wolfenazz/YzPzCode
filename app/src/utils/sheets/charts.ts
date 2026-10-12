// Charts: building them from a range, resolving their data from the workbook
// and drawing them as SVG (in the grid, in PDF and HTML export). The xlsx
// writer turns the same model into native DrawingML. Dependency-free.

import { cellKey, parseCell, parseSheetRef, quoteSheet, rangeText, type RangeRef } from './address';
import { formatValue } from './numberFormat';
import type { ChartDef, ChartKind, ChartSeries, Workbook } from './types';
import type { ChartSpec } from './opTypes';

export const CHART_COLORS = ['#3B5BDB', '#0CA678', '#F59F00', '#E03131', '#7048E8', '#1098AD', '#D6336C', '#868E96'];

let counter = 0;
export const newChartId = (): string => {
  counter += 1;
  return `ch-${Date.now().toString(36)}-${counter.toString(36)}`;
};

const absoluteRef = (sheet: string, range: RangeRef): string => {
  const text = rangeText(range).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
  return `${quoteSheet(sheet)}!${text}`;
};

/** Series for a chart over `range` (header row and category column detected like Excel does). */
export function seriesFromRange(wb: Workbook, sheetIndex: number, range: RangeRef, kind: ChartKind): ChartSeries[] {
  const sheet = wb.sheets[sheetIndex];
  const cell = (r: number, c: number) => sheet.cells[cellKey(r, c)];
  const isNumber = (r: number, c: number): boolean => typeof cell(r, c)?.v === 'number';
  const rows = range.r2 - range.r1 + 1;
  const cols = range.c2 - range.c1 + 1;
  if (rows < 1 || cols < 1) return [];

  // A first row of text above numbers is the header.
  const firstRowText = Array.from({ length: cols }, (_, i) => cell(range.r1, range.c1 + i)).filter((c) => typeof c?.v === 'string').length;
  const header = rows > 1 && firstRowText >= Math.ceil(cols / 2) && Array.from({ length: cols }, (_, i) => isNumber(range.r1 + 1, range.c1 + i)).some(Boolean);
  const dataStart = range.r1 + (header ? 1 : 0);
  // A first column of text (or dates) is the categories.
  const firstColText = Array.from({ length: Math.min(rows - (header ? 1 : 0), 6) }, (_, i) => cell(dataStart + i, range.c1)).filter((c) => c && typeof c.v !== 'number').length;
  const categoryColumn = cols > 1 && firstColText > 0;
  const firstValueCol = range.c1 + (categoryColumn ? 1 : 0);

  const catRange: RangeRef | null = categoryColumn ? { r1: dataStart, c1: range.c1, r2: range.r2, c2: range.c1 } : null;
  const out: ChartSeries[] = [];
  for (let c = firstValueCol; c <= range.c2; c += 1) {
    // A column with no numbers (a second label column) is not a series.
    let hasNumbers = false;
    for (let r = dataStart; r <= range.r2 && !hasNumbers; r += 1) hasNumbers = isNumber(r, c);
    if (!hasNumbers) continue;
    const vals: RangeRef = { r1: dataStart, c1: c, r2: range.r2, c2: c };
    const series: ChartSeries = { vals: absoluteRef(sheet.name, vals) };
    if (header) series.nameRef = absoluteRef(sheet.name, { r1: range.r1, c1: c, r2: range.r1, c2: c });
    if (catRange) series.cats = absoluteRef(sheet.name, catRange);
    // Scatter takes the first column as X for every series.
    if (kind === 'scatter' && catRange === null && c > firstValueCol) series.cats = absoluteRef(sheet.name, { r1: dataStart, c1: firstValueCol, r2: range.r2, c2: firstValueCol });
    out.push(series);
  }
  if (kind === 'scatter' && !categoryColumn && out.length > 1) {
    const x = out[0].vals;
    return out.slice(1).map((entry) => ({ ...entry, cats: x }));
  }
  return kind === 'pie' || kind === 'doughnut' ? out.slice(0, 1) : out;
}

/** A chart placed to the right of its data (or at `spec.at`). */
export function chartFromSpec(wb: Workbook, sheetIndex: number, spec: ChartSpec): ChartDef | string {
  let series = spec.series ?? [];
  let anchor: { col: number; row: number } | null = null;
  if (spec.range) {
    const parsed = parseSheetRef(spec.range);
    if (!parsed) return `The range "${spec.range}" is not valid.`;
    const target = parsed.sheet ? wb.sheets.findIndex((s) => s.name.toLowerCase() === parsed.sheet!.toLowerCase()) : sheetIndex;
    if (target < 0) return `Sheet "${parsed.sheet}" does not exist.`;
    if (series.length === 0) series = seriesFromRange(wb, target, parsed.range, spec.kind);
    anchor = { col: parsed.range.c2 + 2, row: parsed.range.r1 };
  }
  if (series.length === 0) return 'The chart has no numeric data to plot.';
  if (spec.at) {
    const pos = parseCell(spec.at);
    if (pos) anchor = { col: pos.col, row: pos.row };
  }
  const from = anchor ?? { col: 0, row: 0 };
  const width = spec.width ?? 8;
  const height = spec.height ?? 16;
  return {
    id: spec.id ?? newChartId(),
    kind: spec.kind,
    title: spec.title,
    series: series.map((entry, index) => ({ ...entry, color: entry.color ?? CHART_COLORS[index % CHART_COLORS.length] })),
    from,
    to: { col: from.col + width, row: from.row + height },
    stacked: spec.stacked,
    percent: spec.percent,
    legend: spec.legend ?? (series.length > 1 || spec.kind === 'pie' || spec.kind === 'doughnut' ? 'bottom' : 'none'),
    xTitle: spec.xTitle,
    yTitle: spec.yTitle,
    smooth: spec.smooth,
    gridlines: true,
    dataLabels: spec.dataLabels,
  };
}

export interface ChartData {
  categories: string[];
  series: Array<{ name: string; values: number[]; xs?: number[]; color: string; line?: boolean }>;
}

function readRef(wb: Workbook, ref: string | undefined, fallbackSheet: number): { sheet: number; range: RangeRef } | null {
  if (!ref) return null;
  const parsed = parseSheetRef(ref);
  if (!parsed) return null;
  const sheet = parsed.sheet ? wb.sheets.findIndex((s) => s.name.toLowerCase() === parsed.sheet!.toLowerCase()) : fallbackSheet;
  return sheet < 0 ? null : { sheet, range: parsed.range };
}

function cellsOf(wb: Workbook, ref: string | undefined, fallbackSheet: number): Array<{ v: number | string | boolean | null; fmt?: string }> {
  const located = readRef(wb, ref, fallbackSheet);
  if (!located) return [];
  const sheet = wb.sheets[located.sheet];
  const out: Array<{ v: number | string | boolean | null; fmt?: string }> = [];
  const { r1, c1, r2, c2 } = located.range;
  for (let r = r1; r <= Math.min(r2, r1 + 4999); r += 1) {
    for (let c = c1; c <= c2; c += 1) {
      const cell = sheet.cells[cellKey(r, c)];
      out.push({ v: cell?.e !== undefined ? null : cell?.v ?? null, fmt: cell?.s ? wb.styles[cell.s]?.numFmt : undefined });
    }
  }
  return out;
}

/** The numbers and labels a chart draws, read from the workbook. */
export function resolveChart(wb: Workbook, chart: ChartDef, sheetIndex: number): ChartData {
  const series = chart.series.map((entry, index) => {
    const values = cellsOf(wb, entry.vals, sheetIndex).map((cell) => (typeof cell.v === 'number' ? cell.v : 0));
    const nameCell = cellsOf(wb, entry.nameRef, sheetIndex)[0];
    const name = entry.name ?? (nameCell && nameCell.v !== null ? String(nameCell.v) : `Series ${index + 1}`);
    const xs = chart.kind === 'scatter' ? cellsOf(wb, entry.cats, sheetIndex).map((cell) => (typeof cell.v === 'number' ? cell.v : 0)) : undefined;
    return { name, values, xs, color: entry.color ?? CHART_COLORS[index % CHART_COLORS.length], line: entry.line };
  });
  const catSource = chart.series.find((entry) => entry.cats)?.cats;
  const categories = chart.kind === 'scatter' ? [] : cellsOf(wb, catSource, sheetIndex).map((cell) => (cell.v === null ? '' : formatValue(cell.v, cell.fmt).text));
  const count = Math.max(0, ...series.map((entry) => entry.values.length));
  while (categories.length < count) categories.push(String(categories.length + 1));
  return { categories, series };
}

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A round axis maximum and its tick step. */
export function niceScale(max: number, ticks = 5): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 0.2 };
  const raw = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw;
  return { max: Math.ceil(max / step) * step, step };
}

const short = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${+(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${+(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${+(value / 1e3).toFixed(1)}k`;
  return String(+value.toFixed(2));
};

export interface ChartTheme {
  text: string;
  muted: string;
  grid: string;
  background: string;
  font: string;
}

export const LIGHT_CHART_THEME: ChartTheme = { text: '#1f2328', muted: '#6b7280', grid: '#e5e7eb', background: '#ffffff', font: "'Segoe UI', Calibri, Arial, sans-serif" };

/** The chart as a standalone SVG of the given pixel size. */
export function chartSvg(chart: ChartDef, data: ChartData, width: number, height: number, theme: ChartTheme = LIGHT_CHART_THEME): string {
  const font = 11;
  const parts: string[] = [];
  const base = `font-family="${esc(theme.font)}" font-size="${font}"`;
  const text = (x: number, y: number, value: string, attrs = ''): void => {
    parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${base} ${attrs}>${esc(value)}</text>`);
  };
  parts.push(`<rect width="${width}" height="${height}" fill="${theme.background}"/>`);
  let top = 10;
  if (chart.title) {
    text(width / 2, 22, chart.title, `fill="${theme.text}" text-anchor="middle" font-size="14" font-weight="600"`);
    top = 38;
  }
  const legendBottom = chart.legend === 'bottom' || (!chart.legend && data.series.length > 1);
  const legendItems = chart.kind === 'pie' || chart.kind === 'doughnut' ? data.categories.map((name, i) => ({ name, color: CHART_COLORS[i % CHART_COLORS.length] })) : data.series.map((entry) => ({ name: entry.name, color: entry.color }));
  const legendHeight = chart.legend === 'none' || legendItems.length <= 1 ? 0 : 22;
  if (legendHeight && (legendBottom || chart.legend === 'top' || chart.legend === 'right' || chart.legend === 'left')) {
    const y = chart.legend === 'top' ? top + 10 : height - 10;
    let x = 14;
    for (const item of legendItems.slice(0, 12)) {
      parts.push(`<rect x="${x}" y="${y - 9}" width="10" height="10" rx="2" fill="${item.color}"/>`);
      text(x + 15, y, item.name, `fill="${theme.muted}"`);
      x += 24 + item.name.length * 6;
      if (x > width - 40) break;
    }
    if (chart.legend === 'top') top += legendHeight;
  }
  const bottomPad = (legendHeight && chart.legend !== 'top' ? legendHeight : 0) + (chart.xTitle ? 18 : 0);

  if (chart.kind === 'pie' || chart.kind === 'doughnut') {
    const values = (data.series[0]?.values ?? []).map((v) => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = width / 2;
    const cy = top + (height - top - bottomPad) / 2;
    const radius = Math.max(10, Math.min(width, height - top - bottomPad) / 2 - 14);
    let angle = -Math.PI / 2;
    values.forEach((value, i) => {
      const sweep = (value / total) * Math.PI * 2;
      if (sweep <= 0) return;
      const end = angle + sweep;
      const x1 = cx + radius * Math.cos(angle);
      const y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(end);
      const y2 = cy + radius * Math.sin(end);
      const large = sweep > Math.PI ? 1 : 0;
      const color = CHART_COLORS[i % CHART_COLORS.length];
      if (values.filter((v) => v > 0).length === 1) parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"/>`);
      else parts.push(`<path d="M${cx.toFixed(1)} ${cy.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)} A${radius} ${radius} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${color}" stroke="${theme.background}" stroke-width="1.5"/>`);
      if (chart.dataLabels && sweep > 0.25) {
        const mid = angle + sweep / 2;
        text(cx + radius * 0.62 * Math.cos(mid), cy + radius * 0.62 * Math.sin(mid) + 4, `${Math.round((value / total) * 100)}%`, 'fill="#ffffff" text-anchor="middle" font-weight="600"');
      }
      angle = end;
    });
    if (chart.kind === 'doughnut') parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius * 0.55}" fill="${theme.background}"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${parts.join('')}</svg>`;
  }

  const all = data.series.flatMap((entry) => entry.values);
  const stacked = chart.stacked || chart.percent;
  let min = Math.min(0, ...all, 0);
  let maxValue = Math.max(...all, 0);
  if (stacked && data.series.length) {
    const count = Math.max(...data.series.map((entry) => entry.values.length));
    let stackMax = 0;
    let stackMin = 0;
    for (let i = 0; i < count; i += 1) {
      const positives = data.series.reduce((s, entry) => s + Math.max(0, entry.values[i] ?? 0), 0);
      const negatives = data.series.reduce((s, entry) => s + Math.min(0, entry.values[i] ?? 0), 0);
      stackMax = Math.max(stackMax, positives);
      stackMin = Math.min(stackMin, negatives);
    }
    maxValue = chart.percent ? 1 : stackMax;
    min = chart.percent ? 0 : stackMin;
  }
  const isScatter = chart.kind === 'scatter';
  const xsAll = isScatter ? data.series.flatMap((entry) => entry.xs ?? []) : [];
  const xMin = isScatter ? Math.min(...xsAll, 0) : 0;
  const xMax = isScatter ? Math.max(...xsAll, 1) : 0;
  const scale = niceScale(maxValue - Math.min(0, min));
  const floor = min < 0 ? -niceScale(-min).max : 0;
  const span = scale.max - floor || 1;
  const labelWidth = Math.max(34, Math.min(70, short(scale.max).length * 7 + 12));
  const left = labelWidth + (chart.yTitle ? 14 : 0);
  const bottom = bottomPad + 24;
  const plotW = width - left - 14;
  const plotH = height - top - bottom;
  const horizontal = chart.kind === 'bar';
  const y = (value: number): number => top + plotH - ((value - floor) / span) * plotH;
  const x = (value: number): number => left + ((value - floor) / span) * plotW;

  // Grid and value axis.
  for (let value = floor; value <= scale.max + 1e-9; value += scale.step) {
    const label = chart.percent ? `${Math.round(value * 100)}%` : short(value);
    if (horizontal) {
      parts.push(`<line x1="${x(value).toFixed(1)}" y1="${top}" x2="${x(value).toFixed(1)}" y2="${top + plotH}" stroke="${theme.grid}"/>`);
      text(x(value), top + plotH + 14, label, `fill="${theme.muted}" text-anchor="middle"`);
    } else {
      parts.push(`<line x1="${left}" y1="${y(value).toFixed(1)}" x2="${left + plotW}" y2="${y(value).toFixed(1)}" stroke="${theme.grid}"/>`);
      text(left - 6, y(value) + 4, label, `fill="${theme.muted}" text-anchor="end"`);
    }
  }
  if (chart.yTitle) parts.push(`<text transform="translate(12 ${top + plotH / 2}) rotate(-90)" ${base} fill="${theme.muted}" text-anchor="middle">${esc(chart.yTitle)}</text>`);
  if (chart.xTitle) text(left + plotW / 2, height - (legendHeight && chart.legend !== 'top' ? legendHeight : 0) - 6, chart.xTitle, `fill="${theme.muted}" text-anchor="middle"`);

  const count = Math.max(1, data.categories.length);
  if (isScatter) {
    const sx = (v: number): number => left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
    data.series.forEach((entry) => {
      (entry.values).forEach((value, i) => {
        parts.push(`<circle cx="${sx(entry.xs?.[i] ?? i).toFixed(1)}" cy="${y(value).toFixed(1)}" r="3.5" fill="${entry.color}" fill-opacity="0.85"/>`);
      });
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${parts.join('')}</svg>`;
  }

  const slot = (horizontal ? plotH : plotW) / count;
  const labelEvery = Math.max(1, Math.ceil((count * 48) / (horizontal ? plotH : plotW)));
  data.categories.forEach((category, i) => {
    if (i % labelEvery !== 0) return;
    const clipped = category.length > 14 ? `${category.slice(0, 13)}…` : category;
    if (horizontal) text(left - 6, top + slot * i + slot / 2 + 4, clipped, `fill="${theme.muted}" text-anchor="end"`);
    else text(left + slot * i + slot / 2, top + plotH + 14, clipped, `fill="${theme.muted}" text-anchor="middle"`);
  });
  if (min < 0 && !horizontal) parts.push(`<line x1="${left}" y1="${y(0).toFixed(1)}" x2="${left + plotW}" y2="${y(0).toFixed(1)}" stroke="${theme.muted}"/>`);

  const barSeries = data.series.filter((entry) => !(chart.kind === 'combo' && entry.line));
  const lineSeries = chart.kind === 'line' || chart.kind === 'area' ? data.series : chart.kind === 'combo' ? data.series.filter((entry) => entry.line) : [];
  if (chart.kind === 'column' || chart.kind === 'bar' || chart.kind === 'combo') {
    const groupWidth = slot * 0.72;
    const barWidth = stacked ? groupWidth : groupWidth / Math.max(1, barSeries.length);
    for (let i = 0; i < count; i += 1) {
      let positive = 0;
      let negative = 0;
      const total = chart.percent ? barSeries.reduce((s, entry) => s + Math.abs(entry.values[i] ?? 0), 0) || 1 : 1;
      barSeries.forEach((entry, s) => {
        const raw = entry.values[i] ?? 0;
        const value = chart.percent ? raw / total : raw;
        const start = stacked ? (value >= 0 ? positive : negative) : 0;
        const end = start + value;
        if (stacked) {
          if (value >= 0) positive = end;
          else negative = end;
        }
        const offset = slot * 0.14 + (stacked ? 0 : s * barWidth);
        if (horizontal) {
          const x0 = x(Math.min(start, end));
          const x1 = x(Math.max(start, end));
          parts.push(`<rect x="${x0.toFixed(1)}" y="${(top + slot * i + offset).toFixed(1)}" width="${Math.max(0.5, x1 - x0).toFixed(1)}" height="${(barWidth - 1).toFixed(1)}" fill="${entry.color}" rx="1.5"/>`);
        } else {
          const y0 = y(Math.max(start, end));
          const y1 = y(Math.min(start, end));
          parts.push(`<rect x="${(left + slot * i + offset).toFixed(1)}" y="${y0.toFixed(1)}" width="${(barWidth - 1).toFixed(1)}" height="${Math.max(0.5, y1 - y0).toFixed(1)}" fill="${entry.color}" rx="1.5"/>`);
          if (chart.dataLabels && !stacked) text(left + slot * i + offset + barWidth / 2, y0 - 4, short(value), `fill="${theme.muted}" text-anchor="middle" font-size="10"`);
        }
      });
    }
  }
  for (const entry of lineSeries) {
    const points = entry.values.map((value, i) => [left + slot * i + slot / 2, y(value)] as const);
    if (points.length === 0) continue;
    const path = chart.smooth && points.length > 2
      ? points.reduce((d, [px, py], i) => {
        if (i === 0) return `M${px.toFixed(1)} ${py.toFixed(1)}`;
        const [qx, qy] = points[i - 1];
        const mx = (qx + px) / 2;
        return `${d} C${mx.toFixed(1)} ${qy.toFixed(1)} ${mx.toFixed(1)} ${py.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`;
      }, '')
      : points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
    if (chart.kind === 'area') {
      parts.push(`<path d="${path} L${points[points.length - 1][0].toFixed(1)} ${y(0).toFixed(1)} L${points[0][0].toFixed(1)} ${y(0).toFixed(1)} Z" fill="${entry.color}" fill-opacity="0.22"/>`);
    }
    parts.push(`<path d="${path}" fill="none" stroke="${entry.color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`);
    if (points.length <= 40) for (const [px, py] of points) parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${theme.background}" stroke="${entry.color}" stroke-width="2"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${parts.join('')}</svg>`;
}
