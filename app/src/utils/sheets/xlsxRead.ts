// .xlsx (Office Open XML) to the workbook model.

import { cellKey, parseCell, parseRange } from './address';
import { parseDateText } from './dates';
import { copyFormula } from './formula/refs';
import { tokenize } from './formula/tokenize';
import {
  emptySheet, type Cell, type CellScalar, type CfOp, type CfRule, type CondFormat, type DataValidation, type ErrorCode, type Sheet, type SheetTable, type Workbook,
} from './types';
import { readChartXml, readDrawing } from './xlsxCharts';
import { newChartId } from './charts';
import { readColor, readStyles, readTheme } from './xlsxStyles';
import {
  attr, boolAttr, child, children, numAttr, Package, parseRels, parseXml, relId, relsPathOf, resolveTarget, textOf, REL_TYPES,
} from './xlsxXml';

export interface XlsxDocument {
  wb: Workbook;
  /** What the importer could not carry over. */
  warnings: string[];
}

const ERROR_SET = new Set<string>(['#DIV/0!', '#REF!', '#NAME?', '#VALUE!', '#N/A', '#SPILL!', '#NUM!', '#NULL!', '#CALC!']);

/** Removes the `_xlfn.` prefixes Excel writes for newer functions. */
export function stripFunctionPrefixes(formula: string): string {
  if (!/_xlfn|_xlws/i.test(formula)) return formula;
  try {
    let out = '';
    let cursor = 0;
    for (const tok of tokenize(formula)) {
      if (tok.k !== 'func') continue;
      const original = formula.slice(tok.start, tok.end);
      const stripped = original.replace(/^_xlfn\.(_xlws\.)?/i, '');
      if (stripped !== original) {
        out += formula.slice(cursor, tok.start) + stripped;
        cursor = tok.end;
      }
    }
    return out + formula.slice(cursor);
  } catch {
    return formula.replace(/_xlfn\.(_xlws\.)?/gi, '');
  }
}

function stringItem(si: Element): string {
  const direct = child(si, 't');
  if (direct) return textOf(direct);
  return children(si, 'r').map((run) => textOf(child(run, 't'))).join('');
}

const CF_OPS: Record<string, CfOp> = {
  between: 'between', notBetween: 'notBetween', equal: 'equal', notEqual: 'notEqual', greaterThan: 'greaterThan', lessThan: 'lessThan',
  greaterThanOrEqual: 'greaterThanOrEqual', lessThanOrEqual: 'lessThanOrEqual',
};

function readCfRule(rule: Element, theme: string[]): CfRule | null {
  const type = attr(rule, 'type');
  const dxf = numAttr(rule, 'dxfId') ?? 0;
  const formulas = children(rule, 'formula').map((f) => textOf(f));
  switch (type) {
    case 'cellIs': {
      const op = CF_OPS[attr(rule, 'operator') ?? ''];
      return op ? { kind: 'cell', op, a: formulas[0] ?? '0', b: formulas[1], dxf } : null;
    }
    case 'expression': return { kind: 'expression', formula: formulas[0] ?? 'FALSE', dxf };
    case 'containsText': return { kind: 'text', op: 'contains', text: attr(rule, 'text') ?? '', dxf };
    case 'notContainsText': return { kind: 'text', op: 'notContains', text: attr(rule, 'text') ?? '', dxf };
    case 'beginsWith': return { kind: 'text', op: 'beginsWith', text: attr(rule, 'text') ?? '', dxf };
    case 'endsWith': return { kind: 'text', op: 'endsWith', text: attr(rule, 'text') ?? '', dxf };
    case 'containsBlanks': return { kind: 'blanks', dxf };
    case 'notContainsBlanks': return { kind: 'notBlanks', dxf };
    case 'containsErrors': return { kind: 'errors', dxf };
    case 'notContainsErrors': return { kind: 'notErrors', dxf };
    case 'duplicateValues': return { kind: 'duplicates', dxf };
    case 'uniqueValues': return { kind: 'unique', dxf };
    case 'top10': return { kind: 'top', n: numAttr(rule, 'rank') ?? 10, bottom: boolAttr(rule, 'bottom') || undefined, percent: boolAttr(rule, 'percent') || undefined, dxf };
    case 'aboveAverage': return { kind: 'aboveAverage', below: attr(rule, 'aboveAverage') === '0' || undefined, dxf };
    case 'colorScale': {
      const colors = children(child(rule, 'colorScale'), 'color').map((c) => readColor(c, theme)).filter((c): c is string => Boolean(c));
      return colors.length >= 2 ? { kind: 'colorScale', colors } : null;
    }
    case 'dataBar': {
      const color = readColor(child(child(rule, 'dataBar'), 'color'), theme);
      return { kind: 'dataBar', color: color ?? '#638EC6' };
    }
    case 'iconSet': {
      const name = attr(child(rule, 'iconSet'), 'iconSet') ?? '3TrafficLights1';
      const known = ['3Arrows', '3TrafficLights', '3Symbols', '3Flags', '4Arrows', '5Arrows'].find((candidate) => name.startsWith(candidate));
      return { kind: 'iconSet', set: (known ?? '3TrafficLights') as Extract<CfRule, { kind: 'iconSet' }>['set'] };
    }
    default: return null;
  }
}

function readValidation(el: Element): DataValidation | null {
  const type = attr(el, 'type');
  const sqref = attr(el, 'sqref');
  if (!sqref) return null;
  const map: Record<string, DataValidation['type']> = { list: 'list', whole: 'whole', decimal: 'decimal', date: 'date', time: 'time', textLength: 'textLength', custom: 'custom' };
  const kind = type ? map[type] : undefined;
  if (!kind) return null;
  const op = CF_OPS[attr(el, 'operator') ?? 'between'];
  const out: DataValidation = { sqref, type: kind, op, a: textOf(child(el, 'formula1')) || undefined, b: textOf(child(el, 'formula2')) || undefined };
  if (kind === 'list' && out.a) out.a = out.a.replace(/^"|"$/g, '');
  out.allowBlank = boolAttr(el, 'allowBlank');
  out.showDropdown = !boolAttr(el, 'showDropDown');
  const style = attr(el, 'errorStyle');
  if (style === 'warning' || style === 'information') out.errorStyle = style;
  for (const [key, name] of [['errorTitle', 'errorTitle'], ['error', 'error'], ['promptTitle', 'promptTitle'], ['prompt', 'prompt']] as const) {
    const value = attr(el, name);
    if (value) out[key] = value;
  }
  return out;
}

async function readSheet(pkg: Package, part: string, name: string, shared: string[], xfToStyle: number[], theme: string[], warnings: string[]): Promise<Sheet> {
  const xml = await pkg.text(part);
  const sheet = emptySheet(name);
  sheet.part = part;
  if (!xml) return sheet;
  const root = parseXml(xml).documentElement;

  const tab = readColor(child(child(root, 'sheetPr'), 'tabColor'), theme);
  if (tab) sheet.tabColor = tab;

  const view = child(child(root, 'sheetViews'), 'sheetView');
  if (view) {
    if (boolAttr(view, 'rightToLeft')) sheet.rtl = true;
    const zoom = numAttr(view, 'zoomScale');
    if (zoom && zoom !== 100) sheet.zoom = zoom;
    if (attr(view, 'showGridLines') === '0') sheet.gridlines = false;
    if (attr(view, 'showRowColHeaders') === '0') sheet.headings = false;
    const pane = child(view, 'pane');
    if (pane && (attr(pane, 'state') === 'frozen' || attr(pane, 'state') === 'frozenSplit')) {
      const cols = Math.round(numAttr(pane, 'xSplit') ?? 0);
      const rows = Math.round(numAttr(pane, 'ySplit') ?? 0);
      if (rows || cols) sheet.freeze = { rows, cols };
    }
  }
  const format = child(root, 'sheetFormatPr');
  const defaultColWidth = numAttr(format, 'defaultColWidth');
  if (defaultColWidth) sheet.defaultColWidth = defaultColWidth;
  const defaultRowHeight = numAttr(format, 'defaultRowHeight');
  if (defaultRowHeight && Math.abs(defaultRowHeight - 15) > 0.01) sheet.defaultRowHeight = defaultRowHeight;

  for (const col of children(child(root, 'cols'), 'col')) {
    const min = (numAttr(col, 'min') ?? 1) - 1;
    const max = (numAttr(col, 'max') ?? min + 1) - 1;
    const width = numAttr(col, 'width');
    const hidden = boolAttr(col, 'hidden');
    const style = numAttr(col, 'style');
    const mapped = style ? xfToStyle[style] : undefined;
    if (max - min > 512) {
      if (width && !sheet.defaultColWidth) sheet.defaultColWidth = width;
      continue;
    }
    for (let c = min; c <= max; c += 1) {
      const info: NonNullable<Sheet['cols'][number]> = {};
      if (width !== undefined) info.width = width;
      if (hidden) info.hidden = true;
      if (mapped) info.style = mapped;
      if (Object.keys(info).length) sheet.cols[c] = info;
    }
  }

  const sharedFormulas = new Map<string, { f: string; row: number; col: number }>();
  const arrays: Array<{ key: string; ref: string }> = [];
  const sheetData = child(root, 'sheetData');
  let rowCursor = 0;
  for (const rowEl of children(sheetData, 'row')) {
    const r = (numAttr(rowEl, 'r') ?? rowCursor + 1) - 1;
    rowCursor = r + 1;
    const ht = numAttr(rowEl, 'ht');
    const hidden = boolAttr(rowEl, 'hidden');
    const rowStyle = boolAttr(rowEl, 'customFormat') ? numAttr(rowEl, 's') : undefined;
    const info: NonNullable<Sheet['rows'][number]> = {};
    if (ht !== undefined && (boolAttr(rowEl, 'customHeight') || Math.abs(ht - 15) > 0.01)) info.height = ht;
    if (hidden) info.hidden = true;
    if (rowStyle && xfToStyle[rowStyle]) info.style = xfToStyle[rowStyle];
    if (Object.keys(info).length) sheet.rows[r] = info;

    let colCursor = 0;
    for (const c of children(rowEl, 'c')) {
      const ref = attr(c, 'r');
      const pos = ref ? parseCell(ref) : null;
      const col = pos ? pos.col : colCursor;
      const row = pos ? pos.row : r;
      colCursor = col + 1;
      const key = cellKey(row, col);
      const cell: Cell = {};
      const s = numAttr(c, 's');
      if (s && xfToStyle[s]) cell.s = xfToStyle[s];

      const t = attr(c, 't');
      const vEl = child(c, 'v');
      const raw = vEl ? textOf(vEl) : undefined;
      let value: CellScalar | undefined;
      let error: ErrorCode | undefined;
      if (t === 's') {
        const index = Number(raw);
        if (Number.isInteger(index) && shared[index] !== undefined) value = shared[index];
      } else if (t === 'str') value = raw ?? '';
      else if (t === 'inlineStr') {
        const is = child(c, 'is');
        value = is ? stringItem(is) : '';
      } else if (t === 'b') value = raw === '1';
      else if (t === 'e') {
        if (raw && ERROR_SET.has(raw)) error = raw as ErrorCode;
        else error = '#VALUE!';
      } else if (t === 'd') {
        const date = raw ? parseDateText(raw) : null;
        if (date) value = date.serial;
      } else if (raw !== undefined && raw !== '') {
        const n = Number(raw);
        if (Number.isFinite(n)) value = n;
      }
      if (error) cell.e = error;
      else if (value !== undefined) cell.v = value;

      const fEl = child(c, 'f');
      if (fEl) {
        const ftype = attr(fEl, 't');
        const text = textOf(fEl);
        if (ftype === 'shared') {
          const si = attr(fEl, 'si') ?? '';
          if (text) {
            const formula = stripFunctionPrefixes(text);
            sharedFormulas.set(si, { f: formula, row, col });
            cell.f = formula;
          } else {
            const master = sharedFormulas.get(si);
            if (master) cell.f = copyFormula(master.f, row - master.row, col - master.col);
          }
        } else if (ftype !== 'dataTable' && text) {
          cell.f = stripFunctionPrefixes(text);
          if (ftype === 'array') {
            const arrayRef = attr(fEl, 'ref');
            if (arrayRef && arrayRef.includes(':')) arrays.push({ key, ref: arrayRef });
          }
        }
      }
      if (cell.v !== undefined || cell.e !== undefined || cell.f !== undefined || cell.s) sheet.cells[key] = cell;
    }
  }
  // Array formulas own the cells they cover; those are rebuilt from the formula.
  for (const array of arrays) {
    const range = parseRange(array.ref);
    const anchor = sheet.cells[array.key];
    if (!range || !anchor) continue;
    anchor.spill = { rows: range.r2 - range.r1 + 1, cols: range.c2 - range.c1 + 1 };
    for (let r = range.r1; r <= range.r2; r += 1) {
      for (let c = range.c1; c <= range.c2; c += 1) {
        const key = cellKey(r, c);
        if (key === array.key) continue;
        const child2 = sheet.cells[key];
        if (child2) sheet.cells[key] = { ...child2, sp: array.key };
      }
    }
  }

  for (const merge of children(child(root, 'mergeCells'), 'mergeCell')) {
    const ref = attr(merge, 'ref');
    if (ref) sheet.merges.push(ref);
  }
  const filter = attr(child(root, 'autoFilter'), 'ref');
  if (filter) sheet.autoFilter = filter;

  let dropped = 0;
  for (const cf of children(root, 'conditionalFormatting')) {
    const sqref = attr(cf, 'sqref');
    if (!sqref) continue;
    for (const ruleEl of children(cf, 'cfRule')) {
      const rule = readCfRule(ruleEl, theme);
      if (rule) {
        const entry: CondFormat = { sqref, rule };
        if (boolAttr(ruleEl, 'stopIfTrue')) entry.stop = true;
        sheet.cf.push(entry);
      } else dropped += 1;
    }
  }
  if (dropped) warnings.push(`${name}: ${dropped} conditional format rule${dropped === 1 ? '' : 's'} could not be read.`);

  for (const dv of children(child(root, 'dataValidations'), 'dataValidation')) {
    const validation = readValidation(dv);
    if (validation) sheet.validations.push(validation);
  }

  const rels = parseRels(await pkg.text(relsPathOf(part)));
  const byId = new Map(rels.map((rel) => [rel.id, rel]));

  for (const link of children(child(root, 'hyperlinks'), 'hyperlink')) {
    const ref = attr(link, 'ref');
    if (!ref) continue;
    const anchor = ref.split(':')[0];
    const id = relId(link);
    const location = attr(link, 'location');
    if (id && byId.get(id)?.external) sheet.links[anchor] = byId.get(id)!.target;
    else if (location) sheet.links[anchor] = `#${location}`;
  }

  for (const rel of rels) {
    const target = resolveTarget(part, rel.target);
    if (rel.type === REL_TYPES.comments) {
      const commentsXml = await pkg.text(target);
      if (commentsXml) {
        for (const comment of children(child(parseXml(commentsXml).documentElement, 'commentList'), 'comment')) {
          const ref = attr(comment, 'ref');
          const text = children(child(comment, 'text'), 'r').map((run) => textOf(child(run, 't'))).join('') || textOf(child(child(comment, 'text'), 't'));
          if (ref && text) sheet.notes[ref] = text;
        }
      }
    }
  }

  for (const part2 of children(child(root, 'tableParts'), 'tablePart')) {
    const rel = byId.get(relId(part2) ?? '');
    if (!rel) continue;
    const tableXml = await pkg.text(resolveTarget(part, rel.target));
    if (!tableXml) continue;
    const table = parseXml(tableXml).documentElement;
    const ref = attr(table, 'ref');
    const tableName = attr(table, 'displayName') ?? attr(table, 'name');
    if (!ref || !tableName) continue;
    const info = child(table, 'tableStyleInfo');
    const entry: SheetTable = {
      name: tableName,
      ref,
      columns: children(child(table, 'tableColumns'), 'tableColumn').map((c) => attr(c, 'name') ?? ''),
      style: attr(info, 'name'),
      header: (numAttr(table, 'headerRowCount') ?? 1) > 0,
      totals: (numAttr(table, 'totalsRowCount') ?? 0) > 0,
      banded: info ? boolAttr(info, 'showRowStripes', true) : true,
    };
    sheet.tables.push(entry);
  }

  const drawingRel = byId.get(relId(child(root, 'drawing')) ?? '');
  if (drawingRel) {
    const drawingPath = resolveTarget(part, drawingRel.target);
    const drawingXml = await pkg.text(drawingPath);
    if (drawingXml) {
      const drawingRels = parseRels(await pkg.text(relsPathOf(drawingPath)));
      for (const anchor of readDrawing(drawingXml).charts) {
        const rel = drawingRels.find((r) => r.id === anchor.rid);
        if (!rel) continue;
        const chartXml = await pkg.text(resolveTarget(drawingPath, rel.target));
        const parsed = chartXml ? readChartXml(chartXml, theme) : null;
        if (parsed) sheet.charts.push({ ...parsed, id: newChartId(), from: anchor.from, to: anchor.to });
        else warnings.push(`${name}: a chart could not be read and was left out.`);
      }
    }
  }
  return sheet;
}

/** Reads an .xlsx file. Throws when the file is not a workbook. */
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<XlsxDocument> {
  const pkg = await Package.open(data);
  const rootRels = parseRels(await pkg.text('_rels/.rels'));
  const workbookPath = resolveTarget('', rootRels.find((rel) => rel.type === REL_TYPES.officeDocument)?.target ?? 'xl/workbook.xml');
  const workbookXml = await pkg.text(workbookPath);
  if (!workbookXml) throw new Error('This file is not an Excel workbook (no workbook part).');
  const workbookEl = parseXml(workbookXml).documentElement;
  const rels = parseRels(await pkg.text(relsPathOf(workbookPath)));
  const target = (id: string | undefined): string | undefined => {
    const rel = rels.find((r) => r.id === id);
    return rel ? resolveTarget(workbookPath, rel.target) : undefined;
  };

  const sharedPath = rels.find((r) => r.type === REL_TYPES.sharedStrings);
  const shared: string[] = [];
  if (sharedPath) {
    const xml = await pkg.text(resolveTarget(workbookPath, sharedPath.target));
    if (xml) for (const si of children(parseXml(xml).documentElement, 'si')) shared.push(stringItem(si));
  }
  const themeRel = rels.find((r) => r.type === REL_TYPES.theme);
  const theme = readTheme(themeRel ? await pkg.text(resolveTarget(workbookPath, themeRel.target)) : undefined);
  const stylesRel = rels.find((r) => r.type === REL_TYPES.styles);
  const stylesXml = stylesRel ? await pkg.text(resolveTarget(workbookPath, stylesRel.target)) : undefined;
  const styles = readStyles(stylesXml, theme);

  const warnings: string[] = [];
  const sheets: Sheet[] = [];
  for (const el of children(child(workbookEl, 'sheets'), 'sheet')) {
    const name = attr(el, 'name') ?? `Sheet${sheets.length + 1}`;
    const part = target(relId(el));
    if (!part) continue;
    const sheet = await readSheet(pkg, part, name, shared, styles.xfToStyle, theme, warnings);
    const state = attr(el, 'state');
    if (state === 'hidden' || state === 'veryHidden') sheet.state = state;
    sheets.push(sheet);
  }
  if (sheets.length === 0) throw new Error('The workbook has no worksheets.');

  const names = children(child(workbookEl, 'definedNames'), 'definedName').flatMap((el) => {
    const name = attr(el, 'name');
    if (!name || name === '_xlnm._FilterDatabase') return [];
    const local = numAttr(el, 'localSheetId');
    return [{ name, ref: stripFunctionPrefixes(textOf(el)), scope: local }];
  });

  const activeTab = numAttr(child(child(workbookEl, 'bookViews'), 'workbookView'), 'activeTab') ?? 0;
  const wb: Workbook = {
    sheets,
    styles: styles.styles,
    dxfs: styles.dxfs,
    names,
    activeSheet: Math.min(activeTab, sheets.length - 1),
    date1904: boolAttr(child(workbookEl, 'workbookPr'), 'date1904') || undefined,
    defaultFont: styles.defaultFont,
  };
  return { wb, warnings };
}
