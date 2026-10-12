// The assistant's reply: prose, operations and read requests. Tolerant of the
// ways models wrap JSON. Dependency-free (tested by `npm run test:sheets`).

import { colName, parseRange } from '../address';
import { MAX_OPS, validateOp, type Op } from '../opTypes';

export interface ReadRequest {
  sheet?: string;
  range: string;
}

export interface ParsedReply {
  reply: string;
  ops: Op[];
  reads: ReadRequest[];
  warnings: string[];
  /** The reply carried an <ops> block (even an empty one). */
  hasOps: boolean;
}

function tagContent(text: string, tag: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<${tag}>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = open.exec(text))) {
    const start = match.index + match[0].length;
    const close = text.toLowerCase().indexOf(`</${tag}>`, start);
    out.push(text.slice(start, close < 0 ? text.length : close));
  }
  return out;
}

/** JSON from a block that may be fenced or have prose around it. */
export function extractJson(block: string): unknown {
  let text = block.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) text = fenced[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    // Fall back to the outermost bracket pair.
    const open = text.search(/[[{]/);
    if (open < 0) return undefined;
    const closer = text[open] === '[' ? ']' : '}';
    const end = text.lastIndexOf(closer);
    if (end <= open) return undefined;
    try {
      return JSON.parse(text.slice(open, end + 1));
    } catch {
      return undefined;
    }
  }
}

/** Parses a reply. Operations are validated and clamped; the rest is dropped with a warning. */
export function parseReply(text: string): ParsedReply {
  const warnings: string[] = [];
  const replyBlocks = tagContent(text, 'reply');
  let reply = replyBlocks.length ? replyBlocks.join('\n').trim() : '';
  const opsBlocks = tagContent(text, 'ops');
  const readBlocks = tagContent(text, 'read');
  if (!reply) {
    // No tags: treat everything outside <ops>/<read> as the reply.
    reply = text.replace(/<ops>[\s\S]*?(<\/ops>|$)/gi, '').replace(/<read>[\s\S]*?(<\/read>|$)/gi, '').trim();
  }

  const ops: Op[] = [];
  let hasOps = false;
  for (const block of opsBlocks) {
    hasOps = true;
    const data = extractJson(block);
    const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { ops?: unknown }).ops) ? (data as { ops: unknown[] }).ops : data ? [data] : [];
    if (data === undefined && block.trim()) warnings.push('The operations in the reply could not be read.');
    for (const raw of list.slice(0, MAX_OPS)) {
      const checked = validateOp(raw);
      if (typeof checked === 'string') warnings.push(checked);
      else ops.push(checked);
    }
    if (list.length > MAX_OPS) warnings.push(`Only the first ${MAX_OPS} operations were used.`);
  }

  const reads: ReadRequest[] = [];
  for (const block of readBlocks) {
    const data = extractJson(block);
    const entries = Array.isArray(data) ? data : data ? [data] : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as { sheet?: unknown; range?: unknown };
      const range = typeof e.range === 'string' ? e.range.replace(/^.*!/, '').trim() : '';
      if (!parseRange(range)) continue;
      reads.push({ sheet: typeof e.sheet === 'string' ? e.sheet : undefined, range });
    }
  }
  return { reply, ops, reads: reads.slice(0, 4), warnings, hasOps };
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One short line per operation, for the proposal card. */
export function summarizeOps(ops: Op[]): string[] {
  return ops.map((op): string => {
    const where = 'sheet' in op && op.sheet ? ` on ${op.sheet}` : '';
    switch (op.op) {
      case 'setValues': {
        const cells = op.values.reduce((n, row) => n + row.length, 0);
        const formulas = op.values.reduce((n, row) => n + row.filter((c) => typeof c === 'string' && c.startsWith('=')).length, 0);
        return `Write ${plural(cells, 'cell')} at ${op.at}${formulas ? ` (${plural(formulas, 'formula')})` : ''}${where}`;
      }
      case 'fill': return `Fill ${op.source} to ${op.target}${where}`;
      case 'clear': return `Clear ${op.what === 'formats' ? 'formatting of' : op.what === 'contents' ? 'contents of' : ''} ${op.range}${where}`.replace(/\s+/g, ' ');
      case 'format': return `Format ${op.range}${where}`;
      case 'numberFormat': return `Number format ${op.format} on ${op.range}${where}`;
      case 'borders': return `Borders (${op.preset}) on ${op.range}${where}`;
      case 'merge': return `${op.unmerge ? 'Unmerge' : 'Merge'} ${op.range}${where}`;
      case 'insertRows': return `Insert ${plural(op.count ?? 1, 'row')} at ${op.at}${where}`;
      case 'deleteRows': return `Delete ${plural(op.count ?? 1, 'row')} from ${op.at}${where}`;
      case 'insertCols': return `Insert ${plural(op.count ?? 1, 'column')} at ${typeof op.at === 'number' ? colName(op.at - 1) : op.at}${where}`;
      case 'deleteCols': return `Delete ${plural(op.count ?? 1, 'column')} from ${typeof op.at === 'number' ? colName(op.at - 1) : op.at}${where}`;
      case 'copy': return `Copy ${op.range} to ${op.to}${where}`;
      case 'move': return `Move ${op.range} to ${op.to}${where}`;
      case 'sort': return `Sort ${op.range} by ${op.by.map((b) => `${b.column}${b.order === 'desc' ? ' ↓' : ''}`).join(', ')}${where}`;
      case 'removeDuplicates': return `Remove duplicates in ${op.range}${where}`;
      case 'textToColumns': return `Split ${op.range} into columns on “${op.delimiter === '\t' ? '\\t' : op.delimiter}”${where}`;
      case 'autoFilter': return op.range ? `Filter ${op.range}${where}` : `Remove filter${where}`;
      case 'addSheet': return `Add sheet “${op.name}”`;
      case 'renameSheet': return `Rename “${op.sheet}” to “${op.name}”`;
      case 'deleteSheet': return `Delete sheet “${op.sheet}”`;
      case 'moveSheet': return `Move sheet “${op.sheet}”`;
      case 'duplicateSheet': return `Duplicate sheet “${op.sheet}”`;
      case 'sheetProps': return `Sheet settings${where}${op.rtl ? ' (right to left)' : ''}`;
      case 'table': return op.remove ? `Remove table at ${op.range}${where}` : `Format ${op.range} as a table${where}`;
      case 'conditionalFormat': return op.clear ? `Clear conditional formats on ${op.range}${where}` : `Conditional format on ${op.range}${where}`;
      case 'validation': return op.rule ? `Data validation on ${op.range}${where}` : `Remove validation on ${op.range}${where}`;
      case 'chart': return op.remove ? 'Remove a chart' : `Add a ${op.chart?.kind ?? ''} chart${op.chart?.title ? ` “${op.chart.title}”` : ''}${where}`;
      case 'freeze': return `Freeze ${plural(op.rows ?? 0, 'row')} and ${plural(op.cols ?? 0, 'column')}${where}`;
      case 'colWidth': return `Column width ${op.cols}${where}`;
      case 'rowHeight': return `Row height ${op.rows}${where}`;
      case 'visibility': return `${op.hidden ? 'Hide' : 'Show'} ${op.rows ? `rows ${op.rows}` : `columns ${op.cols}`}${where}`;
      case 'name': return op.ref === null ? `Remove name ${op.name}` : `Name ${op.name} = ${op.ref}`;
      case 'note': return `Note on ${op.cell}${where}`;
      case 'hyperlink': return `Link on ${op.cell}${where}`;
      case 'pivot': return `Pivot table at ${op.pivot.target}${where}`;
      default: return 'Edit';
    }
  });
}
