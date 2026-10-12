// The edit operations shared by the grid and the AI assistant, plus the
// validator that turns untrusted JSON from a model into safe operations.
// Dependency-free (tested by `npm run test:sheets`).

import { colIndex, parseRange } from './address';
import type { BorderEdge, BorderStyle, CfOp, ChartKind, ChartSeries, DataValidation, Dxf } from './types';

export type CellInput = string | number | boolean | null;

/** Style changes; `null` removes a property. */
export interface StylePatch {
  font?: { name?: string | null; size?: number | null; bold?: boolean | null; italic?: boolean | null; underline?: boolean | null; strike?: boolean | null; color?: string | null } | null;
  fill?: string | null;
  border?: { left?: BorderEdge | null; right?: BorderEdge | null; top?: BorderEdge | null; bottom?: BorderEdge | null } | null;
  numFmt?: string | null;
  align?: {
    h?: 'general' | 'left' | 'center' | 'right' | 'fill' | 'justify' | 'centerContinuous' | 'distributed' | null;
    v?: 'top' | 'center' | 'bottom' | 'justify' | 'distributed' | null;
    wrap?: boolean | null;
    indent?: number | null;
    rotate?: number | null;
    shrink?: boolean | null;
    reading?: 0 | 1 | 2 | null;
  } | null;
  locked?: boolean | null;
}

export type ConditionalRule =
  | { kind: 'cell'; op: CfOp; a: string; b?: string; style: Dxf }
  | { kind: 'text'; op: 'contains' | 'notContains' | 'beginsWith' | 'endsWith'; text: string; style: Dxf }
  | { kind: 'expression'; formula: string; style: Dxf }
  | { kind: 'blanks' | 'notBlanks' | 'errors' | 'notErrors' | 'duplicates' | 'unique'; style: Dxf }
  | { kind: 'top'; n: number; bottom?: boolean; percent?: boolean; style: Dxf }
  | { kind: 'aboveAverage'; below?: boolean; style: Dxf }
  | { kind: 'colorScale'; colors: string[] }
  | { kind: 'dataBar'; color: string }
  | { kind: 'iconSet'; set: '3Arrows' | '3TrafficLights' | '3Symbols' | '3Flags' | '4Arrows' | '5Arrows' };

export interface ChartSpec {
  id?: string;
  kind: ChartKind;
  title?: string;
  /** Data range including headers, e.g. `A1:C10`; series are taken from it. */
  range?: string;
  /** Explicit series when `range` is not enough. */
  series?: ChartSeries[];
  /** Where the top-left corner sits (a cell) and its size in cells. */
  at?: string;
  width?: number;
  height?: number;
  stacked?: boolean;
  percent?: boolean;
  legend?: 'right' | 'bottom' | 'top' | 'left' | 'none';
  xTitle?: string;
  yTitle?: string;
  smooth?: boolean;
  dataLabels?: boolean;
}

export interface PivotSpec {
  /** Source range with a header row. */
  source: string;
  /** Where the result starts (a cell). */
  target: string;
  rows: string[];
  columns?: string[];
  values: Array<{ field: string; agg?: 'sum' | 'count' | 'average' | 'min' | 'max' }>;
  filters?: Array<{ field: string; equals: string[] }>;
  name?: string;
}

export type Op =
  | { op: 'setValues'; sheet?: string; at: string; values: CellInput[][]; parse?: boolean }
  | { op: 'fill'; sheet?: string; source: string; target: string }
  | { op: 'clear'; sheet?: string; range: string; what?: 'all' | 'contents' | 'formats' }
  | { op: 'format'; sheet?: string; range: string; style: StylePatch }
  | { op: 'numberFormat'; sheet?: string; range: string; format: string }
  | { op: 'borders'; sheet?: string; range: string; preset: 'all' | 'outside' | 'inside' | 'top' | 'bottom' | 'left' | 'right' | 'none'; style?: BorderStyle; color?: string }
  | { op: 'merge'; sheet?: string; range: string; unmerge?: boolean }
  | { op: 'insertRows'; sheet?: string; at: number; count?: number }
  | { op: 'deleteRows'; sheet?: string; at: number; count?: number }
  | { op: 'insertCols'; sheet?: string; at: string | number; count?: number }
  | { op: 'deleteCols'; sheet?: string; at: string | number; count?: number }
  | { op: 'copy'; sheet?: string; range: string; to: string; toSheet?: string; what?: 'all' | 'values' | 'formats' }
  | { op: 'move'; sheet?: string; range: string; to: string; toSheet?: string }
  | { op: 'sort'; sheet?: string; range: string; by: Array<{ column: string | number; order?: 'asc' | 'desc' }>; header?: boolean }
  | { op: 'removeDuplicates'; sheet?: string; range: string; columns?: Array<string | number>; header?: boolean }
  | { op: 'textToColumns'; sheet?: string; range: string; delimiter: string; target?: string }
  | { op: 'autoFilter'; sheet?: string; range?: string | null; criteria?: Array<{ column: string | number; values: CellInput[] }> }
  | { op: 'addSheet'; name: string; index?: number }
  | { op: 'renameSheet'; sheet: string; name: string }
  | { op: 'deleteSheet'; sheet: string }
  | { op: 'moveSheet'; sheet: string; index: number }
  | { op: 'duplicateSheet'; sheet: string; name?: string }
  | { op: 'sheetProps'; sheet?: string; tabColor?: string | null; rtl?: boolean; zoom?: number; gridlines?: boolean; headings?: boolean; hidden?: boolean }
  | { op: 'table'; sheet?: string; range: string; name?: string; style?: string; header?: boolean; totals?: boolean; remove?: boolean }
  | { op: 'conditionalFormat'; sheet?: string; range: string; rule?: ConditionalRule; clear?: boolean }
  | { op: 'validation'; sheet?: string; range: string; rule: Omit<DataValidation, 'sqref'> | null }
  | { op: 'chart'; sheet?: string; chart?: ChartSpec; remove?: string }
  | { op: 'freeze'; sheet?: string; rows?: number; cols?: number }
  | { op: 'colWidth'; sheet?: string; cols: string; width: number | 'auto' }
  | { op: 'rowHeight'; sheet?: string; rows: string; height: number | 'auto' }
  | { op: 'visibility'; sheet?: string; rows?: string; cols?: string; hidden: boolean }
  | { op: 'name'; name: string; ref: string | null; sheet?: string }
  | { op: 'note'; sheet?: string; cell: string; text: string | null }
  | { op: 'hyperlink'; sheet?: string; cell: string; url: string | null }
  | { op: 'pivot'; sheet?: string; pivot: PivotSpec }
  | { op: 'restore'; workbook: unknown };

export type OpName = Op['op'];

export const OP_NAMES: OpName[] = [
  'setValues', 'fill', 'clear', 'format', 'numberFormat', 'borders', 'merge', 'insertRows', 'deleteRows', 'insertCols', 'deleteCols', 'copy', 'move',
  'sort', 'removeDuplicates', 'textToColumns', 'autoFilter', 'addSheet', 'renameSheet', 'deleteSheet', 'moveSheet', 'duplicateSheet', 'sheetProps', 'table',
  'conditionalFormat', 'validation', 'chart', 'freeze', 'colWidth', 'rowHeight', 'visibility', 'name', 'note', 'hyperlink', 'pivot',
];

/** Largest block of cells one operation may write. */
export const MAX_OP_CELLS = 50000;
export const MAX_OPS = 200;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown, max = 500): string | undefined => (typeof value === 'string' ? value.slice(0, max) : undefined);
const int = (value: unknown, min: number, max: number): number | undefined => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : undefined;
};
const colSpec = (value: unknown): string | number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.min(16384, Math.max(1, Math.trunc(value)));
  if (typeof value === 'string' && /^[A-Za-z]{1,3}$/.test(value.trim()) && colIndex(value.trim()) >= 0) return value.trim().toUpperCase();
  return undefined;
};
const colorOf = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  return undefined;
};
const rangeOk = (value: unknown): string | undefined => {
  const text = str(value, 60);
  return text && parseRange(text.replace(/^.*!/, '')) ? text.replace(/^.*!/, '').trim() : undefined;
};

const BORDER_STYLES: BorderStyle[] = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double', 'hair', 'mediumDashed', 'dashDot', 'slantDashDot'];
const CF_OPS: CfOp[] = ['between', 'notBetween', 'equal', 'notEqual', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual'];
const CHART_KINDS: ChartKind[] = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'combo'];

function cleanStyle(raw: unknown): StylePatch | undefined {
  if (!isRecord(raw)) return undefined;
  const out: StylePatch = {};
  const bool = (v: unknown): boolean | null | undefined => (typeof v === 'boolean' ? v : v === null ? null : undefined);
  if (raw.font === null) out.font = null;
  else if (isRecord(raw.font)) {
    const f = raw.font;
    const font: NonNullable<StylePatch['font']> = {};
    if (typeof f.name === 'string') font.name = f.name.slice(0, 60);
    else if (f.name === null) font.name = null;
    const size = int(f.size, 1, 409);
    if (size !== undefined) font.size = size;
    else if (f.size === null) font.size = null;
    for (const key of ['bold', 'italic', 'underline', 'strike'] as const) {
      const v = bool(f[key]);
      if (v !== undefined) font[key] = v;
    }
    const color = colorOf(f.color);
    if (color) font.color = color;
    else if (f.color === null) font.color = null;
    out.font = font;
  }
  if (raw.fill === null) out.fill = null;
  else if (colorOf(raw.fill)) out.fill = colorOf(raw.fill);
  if (typeof raw.numFmt === 'string') out.numFmt = raw.numFmt.slice(0, 120);
  else if (raw.numFmt === null) out.numFmt = null;
  if (raw.border === null) out.border = null;
  else if (isRecord(raw.border)) {
    const border: NonNullable<StylePatch['border']> = {};
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      const e = raw.border[edge];
      if (e === null) border[edge] = null;
      else if (isRecord(e) && BORDER_STYLES.includes(e.style as BorderStyle)) border[edge] = { style: e.style as BorderStyle, color: colorOf(e.color) };
    }
    out.border = border;
  }
  if (raw.align === null) out.align = null;
  else if (isRecord(raw.align)) {
    const a = raw.align;
    const align: NonNullable<StylePatch['align']> = {};
    if (['general', 'left', 'center', 'right', 'fill', 'justify', 'centerContinuous', 'distributed'].includes(a.h as string)) align.h = a.h as never;
    if (['top', 'center', 'bottom', 'justify', 'distributed'].includes(a.v as string)) align.v = a.v as never;
    const wrap = bool(a.wrap);
    if (wrap !== undefined) align.wrap = wrap;
    const shrink = bool(a.shrink);
    if (shrink !== undefined) align.shrink = shrink;
    const indent = int(a.indent, 0, 15);
    if (indent !== undefined) align.indent = indent;
    const rotate = int(a.rotate, -90, 180);
    if (rotate !== undefined) align.rotate = rotate;
    if (a.reading === 0 || a.reading === 1 || a.reading === 2) align.reading = a.reading;
    out.align = align;
  }
  const locked = bool(raw.locked);
  if (locked !== undefined) out.locked = locked;
  return out;
}

function cleanDxf(raw: unknown): Dxf {
  if (!isRecord(raw)) return {};
  const out: Dxf = {};
  const font: NonNullable<Dxf['font']> = {};
  const source = isRecord(raw.font) ? raw.font : raw;
  for (const key of ['bold', 'italic', 'underline', 'strike'] as const) if (typeof source[key] === 'boolean') font[key] = source[key] as boolean;
  const color = colorOf(isRecord(raw.font) ? raw.font.color : raw.fontColor ?? raw.color);
  if (color) font.color = color;
  if (Object.keys(font).length) out.font = font;
  const fill = colorOf(raw.fill ?? raw.background);
  if (fill) out.fill = fill;
  if (typeof raw.numFmt === 'string') out.numFmt = raw.numFmt.slice(0, 120);
  return out;
}

function cleanRule(raw: unknown): ConditionalRule | string {
  if (!isRecord(raw)) return 'rule must be an object';
  const style = cleanDxf(raw.style);
  switch (raw.kind) {
    case 'cell': {
      if (!CF_OPS.includes(raw.op as CfOp)) return 'unknown comparison';
      const a = str(raw.a, 200);
      if (a === undefined) return 'cell rule needs a value';
      return { kind: 'cell', op: raw.op as CfOp, a, b: str(raw.b, 200), style };
    }
    case 'text': {
      if (!['contains', 'notContains', 'beginsWith', 'endsWith'].includes(raw.op as string)) return 'unknown text comparison';
      const text = str(raw.text, 200);
      return text === undefined ? 'text rule needs text' : { kind: 'text', op: raw.op as 'contains', text, style };
    }
    case 'expression': {
      const formula = str(raw.formula, 500);
      return formula ? { kind: 'expression', formula: formula.replace(/^=/, ''), style } : 'expression rule needs a formula';
    }
    case 'blanks': case 'notBlanks': case 'errors': case 'notErrors': case 'duplicates': case 'unique':
      return { kind: raw.kind, style };
    case 'top':
      return { kind: 'top', n: int(raw.n, 1, 1000) ?? 10, bottom: raw.bottom === true, percent: raw.percent === true, style };
    case 'aboveAverage':
      return { kind: 'aboveAverage', below: raw.below === true, style };
    case 'colorScale': {
      const colors = Array.isArray(raw.colors) ? raw.colors.map(colorOf).filter((c): c is string => Boolean(c)).slice(0, 3) : [];
      return { kind: 'colorScale', colors: colors.length >= 2 ? colors : ['#F8696B', '#FFEB84', '#63BE7B'] };
    }
    case 'dataBar':
      return { kind: 'dataBar', color: colorOf(raw.color) ?? '#638EC6' };
    case 'iconSet':
      return { kind: 'iconSet', set: (['3Arrows', '3TrafficLights', '3Symbols', '3Flags', '4Arrows', '5Arrows'].includes(raw.set as string) ? raw.set : '3TrafficLights') as '3Arrows' };
    default:
      return `unknown rule kind "${String(raw.kind)}"`;
  }
}

function cleanValues(raw: unknown): CellInput[][] | string {
  if (!Array.isArray(raw)) return 'values must be rows of cells';
  const rows: CellInput[][] = [];
  let total = 0;
  for (const row of raw) {
    const cells = Array.isArray(row) ? row : [row];
    total += cells.length;
    if (total > MAX_OP_CELLS) return `too many cells in one operation (limit ${MAX_OP_CELLS})`;
    rows.push(cells.map((cell): CellInput => (cell === null || cell === undefined ? null : typeof cell === 'number' ? (Number.isFinite(cell) ? cell : null) : typeof cell === 'boolean' ? cell : String(cell).slice(0, 32767))));
  }
  return rows;
}

/** Validates and clamps one operation from untrusted JSON. A string result is the reason it was dropped. */
export function validateOp(raw: unknown): Op | string {
  if (!isRecord(raw)) return 'operation must be an object';
  const name = raw.op === 'setFormulas' ? 'setValues' : raw.op === 'fillDown' || raw.op === 'fillRight' ? 'fill' : raw.op;
  if (name === 'restore') return 'restore is internal';
  if (typeof name !== 'string' || !OP_NAMES.includes(name as OpName)) return `unknown operation "${String(raw.op)}"`;
  const sheet = str(raw.sheet, 64);
  const base = sheet ? { sheet } : {};

  switch (name as OpName) {
    case 'setValues': {
      const at = rangeOk(raw.at ?? raw.range);
      if (!at) return 'setValues: "at" must be a cell such as B2';
      const values = cleanValues(raw.values ?? raw.rows);
      if (typeof values === 'string') return `setValues: ${values}`;
      return { op: 'setValues', ...base, at: at.split(':')[0], values, parse: raw.parse === false ? false : true };
    }
    case 'fill': {
      const source = rangeOk(raw.source);
      const target = rangeOk(raw.target);
      return source && target ? { op: 'fill', ...base, source, target } : 'fill: needs "source" and "target" ranges';
    }
    case 'clear': {
      const range = rangeOk(raw.range);
      if (!range) return 'clear: needs a range';
      const what = raw.what === 'contents' || raw.what === 'formats' ? raw.what : 'all';
      return { op: 'clear', ...base, range, what };
    }
    case 'format': {
      const range = rangeOk(raw.range);
      const style = cleanStyle(raw.style);
      return range && style ? { op: 'format', ...base, range, style } : 'format: needs a range and a style object';
    }
    case 'numberFormat': {
      const range = rangeOk(raw.range);
      const format = str(raw.format, 120);
      return range && format ? { op: 'numberFormat', ...base, range, format } : 'numberFormat: needs a range and a format code';
    }
    case 'borders': {
      const range = rangeOk(raw.range);
      const presets = ['all', 'outside', 'inside', 'top', 'bottom', 'left', 'right', 'none'];
      if (!range || !presets.includes(raw.preset as string)) return 'borders: needs a range and a preset';
      return { op: 'borders', ...base, range, preset: raw.preset as 'all', style: BORDER_STYLES.includes(raw.style as BorderStyle) ? raw.style as BorderStyle : 'thin', color: colorOf(raw.color) };
    }
    case 'merge': {
      const range = rangeOk(raw.range);
      return range ? { op: 'merge', ...base, range, unmerge: raw.unmerge === true } : 'merge: needs a range';
    }
    case 'insertRows': case 'deleteRows': {
      const at = int(raw.at ?? raw.row, 1, 1048576);
      if (at === undefined) return `${name}: needs "at" (1-based row)`;
      return { op: name as 'insertRows', ...base, at, count: int(raw.count, 1, 10000) ?? 1 };
    }
    case 'insertCols': case 'deleteCols': {
      const at = colSpec(raw.at ?? raw.col);
      if (at === undefined) return `${name}: needs "at" (column letter or 1-based number)`;
      return { op: name as 'insertCols', ...base, at, count: int(raw.count, 1, 1000) ?? 1 };
    }
    case 'copy': case 'move': {
      const range = rangeOk(raw.range);
      const to = rangeOk(raw.to);
      if (!range || !to) return `${name}: needs "range" and "to"`;
      const toSheet = str(raw.toSheet, 64);
      if (name === 'move') return { op: 'move', ...base, range, to: to.split(':')[0], toSheet };
      const what = raw.what === 'values' || raw.what === 'formats' ? raw.what : 'all';
      return { op: 'copy', ...base, range, to: to.split(':')[0], toSheet, what };
    }
    case 'sort': {
      const range = rangeOk(raw.range);
      const by = (Array.isArray(raw.by) ? raw.by : isRecord(raw.by) ? [raw.by] : []).flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const column = colSpec(entry.column);
        return column === undefined ? [] : [{ column, order: entry.order === 'desc' ? 'desc' as const : 'asc' as const }];
      }).slice(0, 8);
      if (!range || by.length === 0) return 'sort: needs a range and at least one key';
      return { op: 'sort', ...base, range, by, header: raw.header === false ? false : true };
    }
    case 'removeDuplicates': {
      const range = rangeOk(raw.range);
      if (!range) return 'removeDuplicates: needs a range';
      const columns = Array.isArray(raw.columns) ? raw.columns.map(colSpec).filter((c): c is string | number => c !== undefined) : undefined;
      return { op: 'removeDuplicates', ...base, range, columns, header: raw.header === false ? false : true };
    }
    case 'textToColumns': {
      const range = rangeOk(raw.range);
      if (!range) return 'textToColumns: needs a range';
      let delimiter = typeof raw.delimiter === 'string' ? raw.delimiter : '';
      if (delimiter === '\\t') delimiter = '\t';
      if ([...delimiter].length !== 1) return 'textToColumns: needs a single-character "delimiter" such as ",", ";" or "\\t"';
      const target = raw.target === undefined ? undefined : rangeOk(raw.target)?.split(':')[0];
      if (raw.target !== undefined && !target) return 'textToColumns: "target" must be a cell such as B2';
      return { op: 'textToColumns', ...base, range, delimiter, target };
    }
    case 'autoFilter': {
      if (raw.range === null) return { op: 'autoFilter', ...base, range: null };
      const range = rangeOk(raw.range);
      if (!range) return 'autoFilter: needs a range (or null to remove)';
      const criteria = Array.isArray(raw.criteria) ? raw.criteria.flatMap((entry) => {
        if (!isRecord(entry) || !Array.isArray(entry.values)) return [];
        const column = colSpec(entry.column);
        const values = entry.values.slice(0, 200).map((v): CellInput => (typeof v === 'number' || typeof v === 'boolean' ? v : v === null ? null : String(v)));
        return column === undefined ? [] : [{ column, values }];
      }) : undefined;
      return { op: 'autoFilter', ...base, range, criteria };
    }
    case 'addSheet': {
      const sheetName = str(raw.name, 31);
      return sheetName ? { op: 'addSheet', name: sheetName, index: int(raw.index, 0, 255) } : 'addSheet: needs a name';
    }
    case 'renameSheet': {
      const from = str(raw.sheet, 64);
      const to = str(raw.name, 31);
      return from && to ? { op: 'renameSheet', sheet: from, name: to } : 'renameSheet: needs "sheet" and "name"';
    }
    case 'deleteSheet': {
      const target = str(raw.sheet, 64);
      return target ? { op: 'deleteSheet', sheet: target } : 'deleteSheet: needs "sheet"';
    }
    case 'moveSheet': {
      const target = str(raw.sheet, 64);
      const index = int(raw.index, 0, 255);
      return target && index !== undefined ? { op: 'moveSheet', sheet: target, index } : 'moveSheet: needs "sheet" and "index"';
    }
    case 'duplicateSheet': {
      const target = str(raw.sheet, 64);
      return target ? { op: 'duplicateSheet', sheet: target, name: str(raw.name, 31) } : 'duplicateSheet: needs "sheet"';
    }
    case 'sheetProps': {
      const out: Extract<Op, { op: 'sheetProps' }> = { op: 'sheetProps', ...base };
      if (raw.tabColor === null) out.tabColor = null;
      else if (colorOf(raw.tabColor)) out.tabColor = colorOf(raw.tabColor);
      if (typeof raw.rtl === 'boolean') out.rtl = raw.rtl;
      if (typeof raw.gridlines === 'boolean') out.gridlines = raw.gridlines;
      if (typeof raw.headings === 'boolean') out.headings = raw.headings;
      if (typeof raw.hidden === 'boolean') out.hidden = raw.hidden;
      const zoom = int(raw.zoom, 10, 400);
      if (zoom !== undefined) out.zoom = zoom;
      return out;
    }
    case 'table': {
      const range = rangeOk(raw.range);
      if (!range) return 'table: needs a range';
      return {
        op: 'table', ...base, range, name: str(raw.name, 64)?.replace(/[^\w.]/g, '_'), style: str(raw.style, 60),
        header: raw.header === false ? false : true, totals: raw.totals === true, remove: raw.remove === true,
      };
    }
    case 'conditionalFormat': {
      const range = rangeOk(raw.range ?? raw.sqref);
      if (!range) return 'conditionalFormat: needs a range';
      if (raw.clear === true) return { op: 'conditionalFormat', ...base, range, clear: true };
      const rule = cleanRule(raw.rule);
      return typeof rule === 'string' ? `conditionalFormat: ${rule}` : { op: 'conditionalFormat', ...base, range, rule };
    }
    case 'validation': {
      const range = rangeOk(raw.range);
      if (!range) return 'validation: needs a range';
      if (raw.rule === null) return { op: 'validation', ...base, range, rule: null };
      const rule = isRecord(raw.rule) ? raw.rule : raw;
      const types = ['list', 'whole', 'decimal', 'date', 'time', 'textLength', 'custom'];
      if (!types.includes(rule.type as string)) return 'validation: unknown type';
      const out: Omit<DataValidation, 'sqref'> = { type: rule.type as DataValidation['type'] };
      if (CF_OPS.includes(rule.op as CfOp)) out.op = rule.op as CfOp;
      const a = rule.a ?? rule.list ?? rule.min;
      const b = rule.b ?? rule.max;
      if (a !== undefined && a !== null) out.a = Array.isArray(a) ? a.map(String).join(',') : String(a).slice(0, 255);
      if (b !== undefined && b !== null) out.b = String(b).slice(0, 255);
      out.allowBlank = rule.allowBlank !== false;
      out.showDropdown = rule.showDropdown !== false;
      for (const key of ['errorTitle', 'error', 'promptTitle', 'prompt'] as const) {
        const text = str(rule[key], 255);
        if (text) out[key] = text;
      }
      if (['stop', 'warning', 'information'].includes(rule.errorStyle as string)) out.errorStyle = rule.errorStyle as 'stop';
      return { op: 'validation', ...base, range, rule: out };
    }
    case 'chart': {
      if (typeof raw.remove === 'string') return { op: 'chart', ...base, remove: raw.remove };
      const spec = isRecord(raw.chart) ? raw.chart : raw;
      if (!CHART_KINDS.includes(spec.kind as ChartKind)) return 'chart: unknown kind';
      const range = spec.range === undefined ? undefined : rangeOk(spec.range);
      const series = Array.isArray(spec.series) ? spec.series.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const vals = str(entry.vals, 120);
        return vals ? [{ name: str(entry.name, 100), nameRef: str(entry.nameRef, 120), cats: str(entry.cats, 120), vals, color: colorOf(entry.color), line: entry.line === true }] : [];
      }).slice(0, 24) : undefined;
      if (!range && (!series || series.length === 0)) return 'chart: needs "range" or "series"';
      const legend = ['right', 'bottom', 'top', 'left', 'none'].includes(spec.legend as string) ? spec.legend as 'right' : undefined;
      return {
        op: 'chart', ...base,
        chart: {
          kind: spec.kind as ChartKind, title: str(spec.title, 150), range, series, at: str(spec.at, 12), width: int(spec.width, 2, 40), height: int(spec.height, 4, 80),
          stacked: spec.stacked === true, percent: spec.percent === true, legend, xTitle: str(spec.xTitle, 100), yTitle: str(spec.yTitle, 100), smooth: spec.smooth === true, dataLabels: spec.dataLabels === true,
        },
      };
    }
    case 'freeze':
      return { op: 'freeze', ...base, rows: int(raw.rows, 0, 1000) ?? 0, cols: int(raw.cols, 0, 100) ?? 0 };
    case 'colWidth': {
      const cols = str(raw.cols ?? raw.col, 30);
      const width = raw.width === 'auto' ? 'auto' as const : int(raw.width, 0, 255);
      return cols && width !== undefined ? { op: 'colWidth', ...base, cols, width } : 'colWidth: needs "cols" and "width"';
    }
    case 'rowHeight': {
      const rows = str(raw.rows ?? raw.row, 30);
      const height = raw.height === 'auto' ? 'auto' as const : int(raw.height, 0, 409);
      return rows && height !== undefined ? { op: 'rowHeight', ...base, rows, height } : 'rowHeight: needs "rows" and "height"';
    }
    case 'visibility': {
      const rows = str(raw.rows, 30);
      const cols = str(raw.cols, 30);
      return rows || cols ? { op: 'visibility', ...base, rows, cols, hidden: raw.hidden !== false } : 'visibility: needs "rows" or "cols"';
    }
    case 'name': {
      const nm = str(raw.name, 255);
      if (!nm || !/^[A-Za-z_À-￿][\w.À-￿]*$/.test(nm)) return 'name: invalid name';
      return { op: 'name', ...base, name: nm, ref: raw.ref === null ? null : str(raw.ref, 500) ?? null };
    }
    case 'note': {
      const cell = rangeOk(raw.cell);
      return cell ? { op: 'note', ...base, cell: cell.split(':')[0], text: raw.text === null ? null : str(raw.text, 2000) ?? null } : 'note: needs a cell';
    }
    case 'hyperlink': {
      const cell = rangeOk(raw.cell);
      const url = raw.url === null ? null : str(raw.url, 2000);
      if (!cell || url === undefined) return 'hyperlink: needs a cell and a url';
      if (url !== null && !/^(https?:\/\/|mailto:|#)/i.test(url)) return 'hyperlink: only http, https, mailto and in-workbook links are allowed';
      return { op: 'hyperlink', ...base, cell: cell.split(':')[0], url };
    }
    case 'pivot': {
      const spec = isRecord(raw.pivot) ? raw.pivot : raw;
      const source = rangeOk(spec.source);
      const target = rangeOk(spec.target);
      const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 100)).slice(0, 8) : []);
      const values = Array.isArray(spec.values) ? spec.values.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.field !== 'string') return [];
        const agg = ['sum', 'count', 'average', 'min', 'max'].includes(entry.agg as string) ? entry.agg as 'sum' : 'sum';
        return [{ field: entry.field.slice(0, 100), agg }];
      }).slice(0, 8) : [];
      if (!source || !target || values.length === 0) return 'pivot: needs "source", "target" and "values"';
      const filters = Array.isArray(spec.filters) ? spec.filters.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.field !== 'string' || !Array.isArray(entry.equals)) return [];
        return [{ field: entry.field.slice(0, 100), equals: entry.equals.map((x) => String(x).slice(0, 200)).slice(0, 200) }];
      }).slice(0, 8) : undefined;
      return { op: 'pivot', ...base, pivot: { source, target: target.split(':')[0], rows: list(spec.rows), columns: list(spec.columns), values, filters, name: str(spec.name, 60) } };
    }
    default:
      return `unknown operation "${name}"`;
  }
}

