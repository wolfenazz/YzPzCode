// The workbook model to an .xlsx file. When the workbook came from a file, the
// original package is the starting point: parts we model are rewritten and
// everything else (pictures, printer settings, pivot caches, macros, theme…)
// is carried through with its relationships.

import JSZip from 'jszip';
import { cellKey, parseCell } from './address';
import { chartAnchorXml, chartPartXml, DRAWING_ROOT_OPEN, readDrawing } from './xlsxCharts';
import { resolveChart } from './charts';
import { tokenize } from './formula/tokenize';
import type { Cell, CfRule, ChartDef, DataValidation, Sheet, Workbook } from './types';
import { writeStyles } from './xlsxStyles';
import {
  attr, child, children, contentTypesXml, CONTENT_TYPES, escapeXml, localName, nextRelId, NS_MAIN, NS_REL, Package, parseRels, parseXml, readContentTypes,
  REL_TYPES, relsPathOf, relsXml, relId, resolveTarget, serializeXml, xmlText, type ContentTypes, type Relationship,
} from './xlsxXml';

const XLFN: Record<string, string> = {};
for (const name of [
  'XLOOKUP', 'XMATCH', 'SORTBY', 'UNIQUE', 'SEQUENCE', 'RANDARRAY', 'LET', 'LAMBDA', 'IFS', 'SWITCH', 'MAXIFS', 'MINIFS', 'TEXTJOIN', 'CONCAT', 'IFNA', 'XOR', 'DAYS',
  'ISOWEEKNUM', 'NUMBERVALUE', 'TAKE', 'DROP', 'VSTACK', 'HSTACK', 'TOCOL', 'TOROW', 'CHOOSECOLS', 'CHOOSEROWS', 'EXPAND', 'TEXTBEFORE', 'TEXTAFTER', 'TEXTSPLIT',
  'MAP', 'REDUCE', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY', 'ARRAYTOTEXT', 'VALUETOTEXT', 'FORMULATEXT', 'ISFORMULA', 'SHEET', 'SHEETS', 'STDEV.S', 'STDEV.P', 'VAR.S',
  'VAR.P', 'MODE.SNGL', 'RANK.EQ', 'RANK.AVG', 'PERCENTILE.INC', 'PERCENTILE.EXC', 'QUARTILE.INC', 'QUARTILE.EXC', 'NORM.DIST', 'NORM.S.DIST', 'NORM.INV',
  'NORM.S.INV', 'COVARIANCE.P', 'COVARIANCE.S', 'FORECAST.LINEAR', 'CEILING.MATH', 'FLOOR.MATH', 'DECIMAL', 'BASE',
]) XLFN[name] = '_xlfn.';
XLFN.FILTER = '_xlfn._xlws.';
XLFN.SORT = '_xlfn._xlws.';

/** Adds the `_xlfn.` prefixes Excel needs on functions newer than Excel 2007. */
export function addFunctionPrefixes(formula: string): string {
  try {
    let out = '';
    let cursor = 0;
    for (const tok of tokenize(formula)) {
      if (tok.k !== 'func') continue;
      const prefix = XLFN[tok.v];
      if (!prefix) continue;
      out += formula.slice(cursor, tok.start) + prefix + formula.slice(tok.start, tok.end);
      cursor = tok.end;
    }
    return out + formula.slice(cursor);
  } catch {
    return formula;
  }
}

const SHEET_ORDER = [
  'sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter',
  'sortState', 'dataConsolidate', 'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks', 'printOptions',
  'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing',
  'legacyDrawingHF', 'drawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst',
];
/** Elements we always rebuild from the model. */
const MANAGED = new Set(['dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'autoFilter', 'mergeCells', 'conditionalFormatting', 'dataValidations', 'hyperlinks', 'drawing', 'legacyDrawing', 'tableParts']);

const SHEET_ROOT_FALLBACK = `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">`;

class StringTable {
  private readonly index = new Map<string, number>();
  readonly list: string[] = [];
  count = 0;
  add(text: string): number {
    this.count += 1;
    let found = this.index.get(text);
    if (found === undefined) {
      found = this.list.length;
      this.list.push(text);
      this.index.set(text, found);
    }
    return found;
  }
  xml(): string {
    const items = this.list.map((text) => `<si><t${/^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : ''}>${xmlText(text)}</t></si>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="${NS_MAIN}" count="${this.count}" uniqueCount="${this.list.length}">${items}</sst>`;
  }
}

const num = (n: number): string => (Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(17))));

function cellXml(key: string, cell: Cell, strings: StringTable, spillRef: string | undefined): string {
  const s = cell.s ? ` s="${cell.s}"` : '';
  if (cell.f !== undefined) {
    const f = `<f${spillRef ? ` t="array" ref="${spillRef}"` : ''}>${xmlText(addFunctionPrefixes(cell.f))}</f>`;
    if (cell.e !== undefined) return `<c r="${key}"${s} t="e">${f}<v>${cell.e}</v></c>`;
    if (typeof cell.v === 'string') return `<c r="${key}"${s} t="str">${f}<v>${xmlText(cell.v)}</v></c>`;
    if (typeof cell.v === 'boolean') return `<c r="${key}"${s} t="b">${f}<v>${cell.v ? 1 : 0}</v></c>`;
    if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return `<c r="${key}"${s}>${f}<v>${num(cell.v)}</v></c>`;
    return `<c r="${key}"${s}>${f}</c>`;
  }
  if (cell.e !== undefined) return `<c r="${key}"${s} t="e"><v>${cell.e}</v></c>`;
  if (typeof cell.v === 'string') return `<c r="${key}"${s} t="s"><v>${strings.add(cell.v)}</v></c>`;
  if (typeof cell.v === 'boolean') return `<c r="${key}"${s} t="b"><v>${cell.v ? 1 : 0}</v></c>`;
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return `<c r="${key}"${s}><v>${num(cell.v)}</v></c>`;
  return s ? `<c r="${key}"${s}/>` : '';
}

function sheetDataXml(sheet: Sheet, strings: StringTable): { xml: string; used: { r1: number; c1: number; r2: number; c2: number } | null } {
  const rows = new Map<number, Array<{ col: number; key: string; cell: Cell }>>();
  let r1 = Infinity;
  let c1 = Infinity;
  let r2 = -1;
  let c2 = -1;
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const pos = parseCell(key);
    if (!pos) continue;
    let list = rows.get(pos.row);
    if (!list) rows.set(pos.row, (list = []));
    list.push({ col: pos.col, key, cell });
    if (cell.v !== undefined || cell.f !== undefined || cell.e !== undefined) {
      r1 = Math.min(r1, pos.row);
      c1 = Math.min(c1, pos.col);
      r2 = Math.max(r2, pos.row);
      c2 = Math.max(c2, pos.col);
    }
  }
  for (const key of Object.keys(sheet.rows)) if (!rows.has(Number(key))) rows.set(Number(key), []);
  const out: string[] = [];
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    const info = sheet.rows[row];
    const cells = rows.get(row)!.sort((a, b) => a.col - b.col);
    const cellsXml = cells.map(({ key, cell }) => {
      const spillRef = cell.spill && cell.spill.rows * cell.spill.cols > 1
        ? `${key}:${cellKey((parseCell(key)?.row ?? 0) + cell.spill.rows - 1, (parseCell(key)?.col ?? 0) + cell.spill.cols - 1)}`
        : undefined;
      // Spilled children are written as plain values under their anchor's array formula.
      const plain: Cell = cell.sp !== undefined ? { v: cell.v, e: cell.e, s: cell.s } : cell;
      return cellXml(key, plain, strings, spillRef);
    }).join('');
    const attrs = `r="${row + 1}"${info?.style ? ` s="${info.style}" customFormat="1"` : ''}${info?.height !== undefined ? ` ht="${info.height}" customHeight="1"` : ''}${info?.hidden ? ' hidden="1"' : ''}`;
    if (!cellsXml && !info) continue;
    out.push(`<row ${attrs}>${cellsXml}</row>`);
  }
  return { xml: `<sheetData>${out.join('')}</sheetData>`, used: r2 >= 0 ? { r1, c1, r2, c2 } : null };
}

function colsXml(sheet: Sheet): string {
  const indexes = Object.keys(sheet.cols).map(Number).sort((a, b) => a - b);
  if (indexes.length === 0) return '';
  const groups: string[] = [];
  let i = 0;
  while (i < indexes.length) {
    const start = indexes[i];
    const info = sheet.cols[start];
    let end = start;
    while (i + 1 < indexes.length && indexes[i + 1] === end + 1 && JSON.stringify(sheet.cols[indexes[i + 1]]) === JSON.stringify(info)) {
      end += 1;
      i += 1;
    }
    i += 1;
    const width = info.width ?? sheet.defaultColWidth ?? 8.43;
    groups.push(`<col min="${start + 1}" max="${end + 1}" width="${width}" customWidth="1"${info.hidden ? ' hidden="1"' : ''}${info.style ? ` style="${info.style}"` : ''}/>`);
  }
  return `<cols>${groups.join('')}</cols>`;
}

const CF_OP_NAME: Record<string, string> = {
  between: 'between', notBetween: 'notBetween', equal: 'equal', notEqual: 'notEqual', greaterThan: 'greaterThan', lessThan: 'lessThan',
  greaterThanOrEqual: 'greaterThanOrEqual', lessThanOrEqual: 'lessThanOrEqual',
};

function cfRuleXml(rule: CfRule, priority: number, firstCell: string, stop?: boolean): string {
  const base = `priority="${priority}"${stop ? ' stopIfTrue="1"' : ''}`;
  const dxf = (id: number): string => ` dxfId="${id}"`;
  switch (rule.kind) {
    case 'cell':
      return `<cfRule type="cellIs"${dxf(rule.dxf)} ${base} operator="${CF_OP_NAME[rule.op]}"><formula>${xmlText(rule.a)}</formula>${rule.b !== undefined ? `<formula>${xmlText(rule.b)}</formula>` : ''}</cfRule>`;
    case 'expression':
      return `<cfRule type="expression"${dxf(rule.dxf)} ${base}><formula>${xmlText(rule.formula)}</formula></cfRule>`;
    case 'text': {
      const type = { contains: 'containsText', notContains: 'notContainsText', beginsWith: 'beginsWith', endsWith: 'endsWith' }[rule.op];
      const operator = { contains: 'containsText', notContains: 'notContains', beginsWith: 'beginsWith', endsWith: 'endsWith' }[rule.op];
      const quoted = `"${rule.text.replace(/"/g, '""')}"`;
      const formula = { contains: `NOT(ISERROR(SEARCH(${quoted},${firstCell})))`, notContains: `ISERROR(SEARCH(${quoted},${firstCell}))`, beginsWith: `LEFT(${firstCell},LEN(${quoted}))=${quoted}`, endsWith: `RIGHT(${firstCell},LEN(${quoted}))=${quoted}` }[rule.op];
      return `<cfRule type="${type}"${dxf(rule.dxf)} ${base} operator="${operator}" text="${escapeXml(rule.text)}"><formula>${xmlText(formula)}</formula></cfRule>`;
    }
    case 'blanks': return `<cfRule type="containsBlanks"${dxf(rule.dxf)} ${base}><formula>LEN(TRIM(${firstCell}))=0</formula></cfRule>`;
    case 'notBlanks': return `<cfRule type="notContainsBlanks"${dxf(rule.dxf)} ${base}><formula>LEN(TRIM(${firstCell}))&gt;0</formula></cfRule>`;
    case 'errors': return `<cfRule type="containsErrors"${dxf(rule.dxf)} ${base}><formula>ISERROR(${firstCell})</formula></cfRule>`;
    case 'notErrors': return `<cfRule type="notContainsErrors"${dxf(rule.dxf)} ${base}><formula>NOT(ISERROR(${firstCell}))</formula></cfRule>`;
    case 'duplicates': return `<cfRule type="duplicateValues"${dxf(rule.dxf)} ${base}/>`;
    case 'unique': return `<cfRule type="uniqueValues"${dxf(rule.dxf)} ${base}/>`;
    case 'top': return `<cfRule type="top10"${dxf(rule.dxf)} ${base} rank="${rule.n}"${rule.percent ? ' percent="1"' : ''}${rule.bottom ? ' bottom="1"' : ''}/>`;
    case 'aboveAverage': return `<cfRule type="aboveAverage"${dxf(rule.dxf)} ${base}${rule.below ? ' aboveAverage="0"' : ''}/>`;
    case 'colorScale': {
      const three = rule.colors.length >= 3;
      const cfvo = three ? '<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' : '<cfvo type="min"/><cfvo type="max"/>';
      const colors = (three ? [rule.colors[0], rule.colors[1], rule.colors[2]] : [rule.colors[0], rule.colors[rule.colors.length - 1]]).map((c) => `<color rgb="FF${c.replace('#', '')}"/>`).join('');
      return `<cfRule type="colorScale" ${base}><colorScale>${cfvo}${colors}</colorScale></cfRule>`;
    }
    case 'dataBar': return `<cfRule type="dataBar" ${base}><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF${rule.color.replace('#', '')}"/></dataBar></cfRule>`;
    case 'iconSet': {
      const count = Number(rule.set[0]);
      const set = rule.set === '3TrafficLights' ? '3TrafficLights1' : rule.set;
      const cfvo = Array.from({ length: count }, (_, i) => `<cfvo type="percent" val="${Math.round((i / count) * 100)}"/>`).join('');
      return `<cfRule type="iconSet" ${base}><iconSet iconSet="${set}">${cfvo}</iconSet></cfRule>`;
    }
  }
}

function validationXml(v: DataValidation): string {
  const attrs = [
    `type="${v.type}"`,
    v.errorStyle ? `errorStyle="${v.errorStyle}"` : '',
    v.op && v.type !== 'list' && v.type !== 'custom' ? `operator="${v.op}"` : '',
    v.allowBlank !== false ? 'allowBlank="1"' : '',
    v.type === 'list' && v.showDropdown === false ? 'showDropDown="1"' : '',
    v.prompt || v.promptTitle ? 'showInputMessage="1"' : '',
    'showErrorMessage="1"',
    v.errorTitle ? `errorTitle="${escapeXml(v.errorTitle)}"` : '',
    v.error ? `error="${escapeXml(v.error)}"` : '',
    v.promptTitle ? `promptTitle="${escapeXml(v.promptTitle)}"` : '',
    v.prompt ? `prompt="${escapeXml(v.prompt)}"` : '',
    `sqref="${escapeXml(v.sqref)}"`,
  ].filter(Boolean).join(' ');
  const first = v.type === 'list' && v.a !== undefined && !/^[$=A-Za-z'][\w$'!:.]*$/.test(v.a.replace(/^=/, '')) ? `"${v.a.replace(/"/g, '""')}"` : (v.a ?? '').replace(/^=/, '');
  const second = v.b === undefined ? '' : `<formula2>${xmlText(v.b)}</formula2>`;
  return `<dataValidation ${attrs}><formula1>${xmlText(first)}</formula1>${second}</dataValidation>`;
}

function vmlXml(notes: Array<{ row: number; col: number }>): string {
  const shapes = notes.map(({ row, col }, i) =>
    `<v:shape id="_x0000_s${1025 + i}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:5pt;width:140pt;height:60pt;z-index:${i + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${col + 1}, 15, ${row}, 10, ${col + 3}, 15, ${row + 3}, 4</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${row}</x:Row><x:Column>${col}</x:Column></x:ClientData></v:shape>`).join('');
  return `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>${shapes}</xml>`;
}

interface WriteContext {
  pkg: Package;
  types: ContentTypes;
  strings: StringTable;
  wb: Workbook;
  removed: Set<string>;
  counters: { chart: number; drawing: number; table: number; comments: number; vml: number; sheet: number };
  /** Part paths in the original package that belong to modelled content and are rewritten. */
  warnings: string[];
}

const setPart = (ctx: WriteContext, path: string, content: string, contentType?: string): void => {
  ctx.pkg.set(path, content);
  if (contentType) ctx.types.overrides.set(`/${path}`, contentType);
  ctx.removed.delete(path);
};

function dropPart(ctx: WriteContext, path: string): void {
  if (!ctx.pkg.has(path)) return;
  ctx.pkg.remove(path);
  ctx.types.overrides.delete(`/${path}`);
  ctx.removed.add(path);
  const relsPath = relsPathOf(path);
  if (ctx.pkg.has(relsPath)) ctx.pkg.remove(relsPath);
}

const nextCounter = (ctx: WriteContext, kind: keyof WriteContext['counters'], prefix: string, suffix: string): { n: number; path: string } => {
  for (;;) {
    ctx.counters[kind] += 1;
    const path = `${prefix}${ctx.counters[kind]}${suffix}`;
    if (!ctx.pkg.has(path)) return { n: ctx.counters[kind], path };
  }
};

async function writeSheet(ctx: WriteContext, sheet: Sheet, index: number, partPath: string): Promise<void> {
  const originalXml = ctx.pkg.has(partPath) ? await ctx.pkg.text(partPath) : undefined;
  const oldRels: Relationship[] = originalXml ? parseRels(await ctx.pkg.text(relsPathOf(partPath))) : [];
  const keptRels = oldRels.filter((rel) => ![REL_TYPES.hyperlink, REL_TYPES.comments, REL_TYPES.vml, REL_TYPES.table].includes(rel.type as never) && rel.type !== REL_TYPES.drawing);
  const rels: Relationship[] = keptRels.slice();

  // Parts of this sheet that are rebuilt from the model.
  const oldDrawing = oldRels.find((rel) => rel.type === REL_TYPES.drawing);
  const oldPartsToDrop = oldRels.filter((rel) => [REL_TYPES.comments, REL_TYPES.vml, REL_TYPES.table].includes(rel.type as never) && !rel.external).map((rel) => resolveTarget(partPath, rel.target));

  const preservedByName = new Map<string, string[]>();
  let rootOpen = SHEET_ROOT_FALLBACK;
  let originalSheetPr: Element | null = null;
  if (originalXml) {
    const rootMatch = /<worksheet\b[^>]*>/.exec(originalXml);
    if (rootMatch) rootOpen = rootMatch[0];
    if (!/\sxmlns:r=/.test(rootOpen)) rootOpen = rootOpen.replace(/>$/, ` xmlns:r="${NS_REL}">`);
    const root = parseXml(originalXml).documentElement;
    for (let node = root.firstChild; node; node = node.nextSibling) {
      if (node.nodeType !== 1) continue;
      const el = node as Element;
      const name = localName(el);
      if (name === 'sheetPr') originalSheetPr = el;
      if (MANAGED.has(name) || name === 'sheetPr') continue;
      const list = preservedByName.get(name) ?? [];
      list.push(serializeXml(el));
      preservedByName.set(name, list);
    }
  }

  const parts = new Map<string, string>();
  const addRel = (type: string, target: string, external = false): string => {
    const id = nextRelId(rels);
    rels.push({ id, type, target, external });
    return id;
  };

  // sheetPr
  let sheetPr = '';
  if (originalSheetPr) {
    const clone = originalSheetPr.cloneNode(true) as Element;
    const existing = child(clone, 'tabColor');
    if (existing) clone.removeChild(existing);
    if (sheet.tabColor) {
      const tab = clone.ownerDocument.createElementNS(clone.namespaceURI, 'tabColor');
      tab.setAttribute('rgb', `FF${sheet.tabColor.replace('#', '')}`);
      clone.insertBefore(tab, clone.firstChild);
    }
    sheetPr = serializeXml(clone);
  } else if (sheet.tabColor) sheetPr = `<sheetPr><tabColor rgb="FF${sheet.tabColor.replace('#', '')}"/></sheetPr>`;
  if (sheetPr) parts.set('sheetPr', sheetPr);

  const data = sheetDataXml(sheet, ctx.strings);
  const dimension = data.used ? `${cellKey(data.used.r1, data.used.c1)}:${cellKey(data.used.r2, data.used.c2)}` : 'A1';
  parts.set('dimension', `<dimension ref="${dimension === 'A1:A1' ? 'A1' : dimension}"/>`);

  const freeze = sheet.freeze;
  const pane = freeze
    ? `<pane${freeze.cols ? ` xSplit="${freeze.cols}"` : ''}${freeze.rows ? ` ySplit="${freeze.rows}"` : ''} topLeftCell="${cellKey(freeze.rows, freeze.cols)}" activePane="${freeze.rows && freeze.cols ? 'bottomRight' : freeze.rows ? 'bottomLeft' : 'topRight'}" state="frozen"/>`
    : '';
  parts.set('sheetViews', `<sheetViews><sheetView${index === ctx.wb.activeSheet ? ' tabSelected="1"' : ''}${sheet.rtl ? ' rightToLeft="1"' : ''}${sheet.gridlines === false ? ' showGridLines="0"' : ''}${sheet.headings === false ? ' showRowColHeaders="0"' : ''}${sheet.zoom ? ` zoomScale="${sheet.zoom}" zoomScaleNormal="${sheet.zoom}"` : ''} workbookViewId="0">${pane}</sheetView></sheetViews>`);
  parts.set('sheetFormatPr', `<sheetFormatPr defaultRowHeight="${sheet.defaultRowHeight ?? 15}"${sheet.defaultColWidth ? ` defaultColWidth="${sheet.defaultColWidth}"` : ''}/>`);
  const cols = colsXml(sheet);
  if (cols) parts.set('cols', cols);
  parts.set('sheetData', data.xml);
  if (sheet.autoFilter) parts.set('autoFilter', `<autoFilter ref="${escapeXml(sheet.autoFilter)}"/>`);
  if (sheet.merges.length) parts.set('mergeCells', `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${escapeXml(m)}"/>`).join('')}</mergeCells>`);

  if (sheet.cf.length) {
    parts.set('conditionalFormatting', sheet.cf.map((entry, i) => {
      const first = entry.sqref.split(/\s+/)[0].split(':')[0];
      return `<conditionalFormatting sqref="${escapeXml(entry.sqref)}">${cfRuleXml(entry.rule, i + 1, first, entry.stop)}</conditionalFormatting>`;
    }).join(''));
  }
  if (sheet.validations.length) parts.set('dataValidations', `<dataValidations count="${sheet.validations.length}">${sheet.validations.map(validationXml).join('')}</dataValidations>`);

  const links = Object.entries(sheet.links);
  if (links.length) {
    parts.set('hyperlinks', `<hyperlinks>${links.map(([key, target]) => {
      if (target.startsWith('#')) return `<hyperlink ref="${key}" location="${escapeXml(target.slice(1))}" display="${escapeXml(target.slice(1))}"/>`;
      const id = addRel(REL_TYPES.hyperlink, target, true);
      return `<hyperlink ref="${key}" r:id="${id}"/>`;
    }).join('')}</hyperlinks>`);
  }

  // Notes: a comments part plus the legacy drawing Excel needs to show them.
  const noteEntries = Object.entries(sheet.notes).filter(([key]) => parseCell(key));
  if (noteEntries.length) {
    const comments = nextCounter(ctx, 'comments', 'xl/comments', '.xml');
    const list = noteEntries.map(([key, text]) => `<comment ref="${key}" authorId="0"><text><r><t xml:space="preserve">${xmlText(text)}</t></r></text></comment>`).join('');
    setPart(ctx, comments.path, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<comments xmlns="${NS_MAIN}"><authors><author>Author</author></authors><commentList>${list}</commentList></comments>`, CONTENT_TYPES.comments);
    addRel(REL_TYPES.comments, `../${comments.path.slice(3)}`);
    const vml = nextCounter(ctx, 'vml', 'xl/drawings/vmlDrawing', '.vml');
    setPart(ctx, vml.path, vmlXml(noteEntries.map(([key]) => parseCell(key)!)));
    ctx.types.defaults.set('vml', CONTENT_TYPES.vml);
    const vmlId = addRel(REL_TYPES.vml, `../drawings/${vml.path.slice('xl/drawings/'.length)}`);
    parts.set('legacyDrawing', `<legacyDrawing r:id="${vmlId}"/>`);
  }

  // Charts and what else lives in the sheet's drawing.
  let otherAnchors: string[] = [];
  let drawingRels: Relationship[] = [];
  let drawingPath: string | null = null;
  if (oldDrawing) {
    drawingPath = resolveTarget(partPath, oldDrawing.target);
    const drawingXml = await ctx.pkg.text(drawingPath);
    drawingRels = parseRels(await ctx.pkg.text(relsPathOf(drawingPath)));
    if (drawingXml) {
      const read = readDrawing(drawingXml);
      otherAnchors = read.others.map((el) => serializeXml(el));
      for (const anchor of read.charts) {
        const rel = drawingRels.find((r) => r.id === anchor.rid);
        if (rel) dropPart(ctx, resolveTarget(drawingPath, rel.target));
      }
      drawingRels = drawingRels.filter((rel) => rel.type !== REL_TYPES.chart);
    }
  }
  if (sheet.charts.length || otherAnchors.length) {
    if (!drawingPath) drawingPath = nextCounter(ctx, 'drawing', 'xl/drawings/drawing', '.xml').path;
    const anchors: string[] = [...otherAnchors];
    sheet.charts.forEach((chart: ChartDef, i) => {
      const chartPart = nextCounter(ctx, 'chart', 'xl/charts/chart', '.xml');
      const data = resolveChart(ctx.wb, chart, index);
      setPart(ctx, chartPart.path, chartPartXml(chart, data), CONTENT_TYPES.chart);
      const rid = nextRelId(drawingRels);
      drawingRels.push({ id: rid, type: REL_TYPES.chart, target: `../charts/${chartPart.path.slice('xl/charts/'.length)}` });
      anchors.push(chartAnchorXml(chart, rid, 1000 + i));
    });
    setPart(ctx, drawingPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${DRAWING_ROOT_OPEN}${anchors.join('')}</xdr:wsDr>`, CONTENT_TYPES.drawing);
    const drawingRelsPath = relsPathOf(drawingPath);
    if (drawingRels.length) ctx.pkg.set(drawingRelsPath, relsXml(drawingRels));
    else if (ctx.pkg.has(drawingRelsPath)) ctx.pkg.remove(drawingRelsPath);
    const id = addRel(REL_TYPES.drawing, `../${drawingPath.slice(3)}`);
    parts.set('drawing', `<drawing r:id="${id}"/>`);
  } else if (drawingPath) dropPart(ctx, drawingPath);

  // Tables.
  if (sheet.tables.length) {
    const tableParts: string[] = [];
    sheet.tables.forEach((table) => {
      const part = nextCounter(ctx, 'table', 'xl/tables/table', '.xml');
      const id = ctx.counters.table;
      const body = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<table xmlns="${NS_MAIN}" id="${id}" name="${escapeXml(table.name)}" displayName="${escapeXml(table.name)}" ref="${escapeXml(table.ref)}"${table.header ? '' : ' headerRowCount="0"'}${table.totals ? ' totalsRowCount="1"' : ''}>${table.header ? `<autoFilter ref="${escapeXml(table.ref)}"/>` : ''}<tableColumns count="${table.columns.length}">${table.columns.map((name, c) => `<tableColumn id="${c + 1}" name="${escapeXml(name || `Column${c + 1}`)}"/>`).join('')}</tableColumns><tableStyleInfo name="${escapeXml(table.style ?? 'TableStyleMedium2')}" showFirstColumn="0" showLastColumn="0" showRowStripes="${table.banded ? 1 : 0}" showColumnStripes="0"/></table>`;
      setPart(ctx, part.path, body, CONTENT_TYPES.table);
      const rid = addRel(REL_TYPES.table, `../tables/${part.path.slice('xl/tables/'.length)}`);
      tableParts.push(`<tablePart r:id="${rid}"/>`);
    });
    parts.set('tableParts', `<tableParts count="${tableParts.length}">${tableParts.join('')}</tableParts>`);
  }

  // Everything is gathered; drop what was rebuilt and assemble in schema order.
  for (const path of oldPartsToDrop) dropPart(ctx, path);
  const known = new Set(SHEET_ORDER);
  const body: string[] = [];
  for (const name of SHEET_ORDER) {
    if (name === 'pageMargins' && !preservedByName.has(name)) {
      body.push('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>');
      continue;
    }
    const own = parts.get(name);
    if (own) body.push(own);
    else if (!MANAGED.has(name)) for (const kept of preservedByName.get(name) ?? []) body.push(kept);
    if (name === 'tableParts') for (const [other, list] of preservedByName) if (!known.has(other)) body.push(...list);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${rootOpen}${body.join('')}</worksheet>`;
  setPart(ctx, partPath, xml, CONTENT_TYPES.worksheet);
  const relsPath = relsPathOf(partPath);
  if (rels.length) ctx.pkg.set(relsPath, relsXml(rels));
  else if (ctx.pkg.has(relsPath)) ctx.pkg.remove(relsPath);
}

function newPackage(): Package {
  const zip = new JSZip();
  zip.file('_rels/.rels', relsXml([{ id: 'rId1', type: REL_TYPES.officeDocument, target: 'xl/workbook.xml' }]));
  return new Package(zip);
}

function resolveTargetOf(rels: Relationship[], id: string | undefined, owner: string): string | undefined {
  const rel = rels.find((entry) => entry.id === id);
  return rel ? resolveTarget(owner, rel.target) : undefined;
}

/** Writes the workbook. Pass the bytes of the file it was read from to keep what the model does not hold. */
export async function writeXlsx(wb: Workbook, original?: ArrayBuffer | Uint8Array | null): Promise<Uint8Array> {
  const pkg = original ? await Package.open(original) : newPackage();
  const types = original ? await readContentTypes(pkg) : { defaults: new Map([['rels', 'application/vnd.openxmlformats-package.relationships+xml'], ['xml', 'application/xml']]), overrides: new Map<string, string>() };
  const strings = new StringTable();
  const ctx: WriteContext = { pkg, types, strings, wb, removed: new Set(), counters: { chart: 0, drawing: 0, table: 0, comments: 0, vml: 0, sheet: 0 }, warnings: [] };

  const rootRels = parseRels(await pkg.text('_rels/.rels'));
  const workbookPath = resolveTarget('', rootRels.find((rel) => rel.type === REL_TYPES.officeDocument)?.target ?? 'xl/workbook.xml');
  const workbookRels = parseRels(await pkg.text(relsPathOf(workbookPath)));
  const originalWorkbook = await pkg.text(workbookPath);
  const originalDoc = originalWorkbook ? parseXml(originalWorkbook) : null;
  const originalRoot = originalDoc?.documentElement ?? null;

  // Which package part each sheet uses, and which relationship id points at it.
  const sheetRelByPart = new Map<string, string>();
  for (const rel of workbookRels) if (rel.type === REL_TYPES.worksheet) sheetRelByPart.set(resolveTarget(workbookPath, rel.target), rel.id);
  const originalSheetEls = originalRoot ? children(child(originalRoot, 'sheets'), 'sheet') : [];
  const idByRel = new Map<string, number>();
  for (const el of originalSheetEls) {
    const rid = relId(el);
    const sid = Number(attr(el, 'sheetId'));
    if (rid && Number.isFinite(sid)) idByRel.set(rid, sid);
  }
  let maxSheetId = Math.max(0, ...idByRel.values());

  const usedParts = new Set<string>();
  const sheetEntries: Array<{ sheet: Sheet; part: string; rid: string; sheetId: number }> = [];
  const rels = workbookRels.slice();
  // A sheet that was never read from this package (made in the app, saved once) is found again by its name.
  const partByName = new Map<string, string>();
  for (const el of originalSheetEls) {
    const part = resolveTargetOf(rels, relId(el), workbookPath);
    const name = attr(el, 'name');
    if (part && name) partByName.set(name.toLowerCase(), part);
  }
  for (const sheet of wb.sheets) {
    const usable = (candidate: string | undefined): string => (candidate && pkg.has(candidate) && !usedParts.has(candidate) && sheetRelByPart.has(candidate) ? candidate : '');
    let part = usable(sheet.part) || usable(partByName.get(sheet.name.toLowerCase()));
    let rid = part ? sheetRelByPart.get(part)! : '';
    if (!part) {
      const next = nextCounter(ctx, 'sheet', `${workbookPath.slice(0, workbookPath.lastIndexOf('/') + 1)}worksheets/sheet`, '.xml');
      part = next.path;
      rid = nextRelId(rels);
      rels.push({ id: rid, type: REL_TYPES.worksheet, target: part.slice(workbookPath.lastIndexOf('/') + 1) });
    }
    usedParts.add(part);
    let sheetId = idByRel.get(rid);
    if (sheetId === undefined) {
      maxSheetId += 1;
      sheetId = maxSheetId;
    }
    sheetEntries.push({ sheet, part, rid, sheetId });
  }

  // Sheets that were deleted take their parts with them.
  for (const [part, rid] of sheetRelByPart) {
    if (usedParts.has(part)) continue;
    const sheetRels = parseRels(await pkg.text(relsPathOf(part)));
    for (const rel of sheetRels) {
      if (rel.external) continue;
      const target = resolveTarget(part, rel.target);
      if (rel.type === REL_TYPES.drawing) {
        const drawingRels = parseRels(await pkg.text(relsPathOf(target)));
        for (const dr of drawingRels) dropPart(ctx, resolveTarget(target, dr.target));
      }
      dropPart(ctx, target);
    }
    dropPart(ctx, part);
    const at = rels.findIndex((rel) => rel.id === rid);
    if (at >= 0) rels.splice(at, 1);
  }

  for (let i = 0; i < sheetEntries.length; i += 1) await writeSheet(ctx, sheetEntries[i].sheet, i, sheetEntries[i].part);

  // Styles and shared strings.
  const defaultFont = wb.defaultFont ?? { name: 'Calibri', size: 11 };
  const stylesRel = rels.find((rel) => rel.type === REL_TYPES.styles);
  const stylesPath = stylesRel ? resolveTarget(workbookPath, stylesRel.target) : `${workbookPath.slice(0, workbookPath.lastIndexOf('/') + 1)}styles.xml`;
  const originalStyles = stylesRel ? await pkg.text(stylesPath) : undefined;
  setPart(ctx, stylesPath, writeStyles(wb, defaultFont, originalStyles).xml, CONTENT_TYPES.styles);
  if (!stylesRel) rels.push({ id: nextRelId(rels), type: REL_TYPES.styles, target: stylesPath.slice(workbookPath.lastIndexOf('/') + 1) });

  const sharedRel = rels.find((rel) => rel.type === REL_TYPES.sharedStrings);
  const sharedPath = sharedRel ? resolveTarget(workbookPath, sharedRel.target) : `${workbookPath.slice(0, workbookPath.lastIndexOf('/') + 1)}sharedStrings.xml`;
  setPart(ctx, sharedPath, strings.xml(), CONTENT_TYPES.sharedStrings);
  if (!sharedRel) rels.push({ id: nextRelId(rels), type: REL_TYPES.sharedStrings, target: sharedPath.slice(workbookPath.lastIndexOf('/') + 1) });

  // workbook.xml
  const sheetsXml = `<sheets>${sheetEntries.map(({ sheet, rid, sheetId }) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${sheetId}"${sheet.state && sheet.state !== 'visible' ? ` state="${sheet.state}"` : ''} r:id="${rid}"/>`).join('')}</sheets>`;
  const namesXml = wb.names.length
    ? `<definedNames>${wb.names.map((entry) => `<definedName name="${escapeXml(entry.name)}"${entry.scope !== undefined && entry.scope < wb.sheets.length ? ` localSheetId="${entry.scope}"` : ''}>${xmlText(addFunctionPrefixes(entry.ref))}</definedName>`).join('')}</definedNames>`
    : '';
  let workbookXml: string;
  if (originalRoot && originalWorkbook) {
    const rootOpen = /<workbook\b[^>]*>/.exec(originalWorkbook)?.[0] ?? `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">`;
    const kept: Record<string, string> = {};
    for (let node = originalRoot.firstChild; node; node = node.nextSibling) {
      if (node.nodeType !== 1) continue;
      const el = node as Element;
      const name = localName(el);
      if (name === 'sheets' || name === 'definedNames') continue;
      if (name === 'bookViews') {
        const clone = el.cloneNode(true) as Element;
        const view = child(clone, 'workbookView');
        if (view) {
          view.setAttribute('activeTab', String(Math.min(wb.activeSheet, wb.sheets.length - 1)));
          view.removeAttribute('firstSheet');
        }
        kept[name] = serializeXml(clone);
      } else if (name === 'calcPr') {
        const clone = el.cloneNode(true) as Element;
        clone.setAttribute('fullCalcOnLoad', '1');
        kept[name] = serializeXml(clone);
      } else kept[name] = (kept[name] ?? '') + serializeXml(el);
    }
    if (!kept.calcPr) kept.calcPr = '<calcPr calcId="191029" fullCalcOnLoad="1"/>';
    const order = ['fileVersion', 'fileSharing', 'workbookPr', 'workbookProtection', 'bookViews', 'sheets', 'functionGroups', 'externalReferences', 'definedNames', 'calcPr', 'oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'];
    const pieces: string[] = [];
    for (const name of order) {
      if (name === 'sheets') pieces.push(sheetsXml);
      else if (name === 'definedNames') pieces.push(namesXml);
      else if (kept[name]) pieces.push(kept[name]);
    }
    for (const [name, value] of Object.entries(kept)) if (!order.includes(name)) pieces.push(value);
    workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${rootOpen}${pieces.join('')}</workbook>`;
  } else {
    workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><workbookPr${wb.date1904 ? ' date1904="1"' : ''}/><bookViews><workbookView activeTab="${Math.min(wb.activeSheet, wb.sheets.length - 1)}"/></bookViews>${sheetsXml}${namesXml}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  }
  // A macro-enabled workbook (.xlsm) keeps its own main content type, or Excel would refuse to open it.
  setPart(ctx, workbookPath, workbookXml, ctx.types.overrides.get(`/${workbookPath}`) ?? CONTENT_TYPES.workbook);
  pkg.set(relsPathOf(workbookPath), relsXml(rels));
  for (const entry of sheetEntries) ctx.types.overrides.set(`/${entry.part}`, CONTENT_TYPES.worksheet);
  pkg.set('[Content_Types].xml', contentTypesXml(ctx.types));

  return pkg.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

