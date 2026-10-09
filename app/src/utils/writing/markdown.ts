// Converts the Markdown dialect the writing prompts ask for into TipTap JSON,
// and editor JSON back to Markdown (for rewrite prompts). It is tolerant of
// half-written input so it can run on every streamed chunk.
// Dependency-free (tested by `npm run test:writing`).

import type { DocNode } from './types';

type Mark = NonNullable<DocNode['marks']>[number];

export interface MarkdownOptions {
  /** The shallowest heading level the text may produce (section bodies start at 2). */
  minHeadingLevel?: number;
}

const text = (value: string, marks?: Mark[]): DocNode =>
  marks && marks.length > 0 ? { type: 'text', text: value, marks } : { type: 'text', text: value };

const paragraph = (content: DocNode[]): DocNode =>
  content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };

// Inline -----------------------------------------------------------------

interface InlineRule {
  pattern: RegExp;
  build: (match: RegExpExecArray, marks: Mark[]) => DocNode[];
}

const withMark = (marks: Mark[], mark: Mark): Mark[] =>
  marks.some((entry) => entry.type === mark.type) ? marks : [...marks, mark];

const INLINE_RULES: InlineRule[] = [
  {
    // Footnote: [^Footnote text] inline, or [^1] referencing a definition (resolved later).
    pattern: /\[\^([^\]]+)\]/y,
    build: (match) => [{ type: 'footnote', attrs: { text: match[1].trim(), ref: match[1].trim() } }],
  },
  {
    // Citation: [@key] or [@key1; @key2, p. 4]
    pattern: /\[(@[\w:.-]+(?:\s*[;,]\s*@[\w:.-]+)*)([^\]]*)\]/y,
    build: (match) => [{
      type: 'citation',
      attrs: {
        keys: match[1].split(/[;,]/).map((key) => key.trim().replace(/^@/, '')).filter(Boolean),
        locator: match[2].replace(/^[\s,;]+/, '').trim(),
      },
    }],
  },
  {
    pattern: /`([^`\n]+)`/y,
    build: (match, marks) => [text(match[1], withMark(marks, { type: 'code' }))],
  },
  {
    pattern: /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/y,
    build: (match, marks) => parseInline(match[1], withMark(marks, { type: 'bold' })),
  },
  {
    pattern: /__(?=\S)([\s\S]+?)(?<=\S)__/y,
    build: (match, marks) => parseInline(match[1], withMark(marks, { type: 'bold' })),
  },
  {
    pattern: /~~(?=\S)([\s\S]+?)(?<=\S)~~/y,
    build: (match, marks) => parseInline(match[1], withMark(marks, { type: 'strike' })),
  },
  {
    pattern: /==(?=\S)([\s\S]+?)(?<=\S)==/y,
    build: (match, marks) => parseInline(match[1], withMark(marks, { type: 'highlight' })),
  },
  {
    pattern: /\*(?=[^\s*])([^*\n]+?)(?<=\S)\*/y,
    build: (match, marks) => parseInline(match[1], withMark(marks, { type: 'italic' })),
  },
  {
    pattern: /(?<![\w])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w])/y,
    build: (match, marks) => parseInline(match[1], withMark(marks, { type: 'italic' })),
  },
  {
    pattern: /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/y,
    build: (match, marks) => {
      const href = match[2];
      const safe = /^(https?:|mailto:|#)/i.test(href) ? href : null;
      return parseInline(match[1], safe ? withMark(marks, { type: 'link', attrs: { href: safe } }) : marks);
    },
  },
  {
    pattern: /<br\s*\/?>/y,
    build: () => [{ type: 'hardBreak' }],
  },
];

const SPECIAL = /[[`*_~=<]/;

export function parseInline(source: string, marks: Mark[] = []): DocNode[] {
  const nodes: DocNode[] = [];
  let buffer = '';
  let index = 0;
  const flush = (): void => {
    if (buffer) {
      nodes.push(text(buffer, marks));
      buffer = '';
    }
  };
  while (index < source.length) {
    const char = source[index];
    if (char === '\\' && index + 1 < source.length && /[\\`*_[\]~=@^]/.test(source[index + 1])) {
      buffer += source[index + 1];
      index += 2;
      continue;
    }
    if (SPECIAL.test(char)) {
      let matched = false;
      for (const rule of INLINE_RULES) {
        rule.pattern.lastIndex = index;
        const match = rule.pattern.exec(source);
        if (match) {
          flush();
          nodes.push(...rule.build(match, marks));
          index += match[0].length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }
    buffer += char;
    index += 1;
  }
  flush();
  // Merge adjacent text nodes with identical marks.
  const merged: DocNode[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (
      last && last.type === 'text' && node.type === 'text'
      && JSON.stringify(last.marks ?? []) === JSON.stringify(node.marks ?? [])
    ) {
      last.text = (last.text ?? '') + (node.text ?? '');
    } else {
      merged.push(node);
    }
  }
  return merged.filter((node) => node.type !== 'text' || (node.text ?? '') !== '');
}

// Blocks -----------------------------------------------------------------

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^(```|~~~)\s*([\w+-]*)\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,4})[.)]\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const FOOTNOTE_DEF = /^\[\^([^\]]+)\]:\s*(.*)$/;
const FIGURE = /^\s*\[(?:Figure|Fig\.)\s*:?\s*([^\]]+)\]\s*$/i;
const IMAGE = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const TABLE_CAPTION = /^\s*(?:\*\*|_)?Table(?:\s+\d+(?:\.\d+)*)?\s*[:.—-]\s*(.+?)(?:\*\*|_)?\s*$/i;
const BIBLIOGRAPHY = /^\s*\[\[BIBLIOGRAPHY\]\]\s*$/i;
const PAGE_BREAK = /^\s*(?:\\pagebreak|\\newpage|<!--\s*pagebreak\s*-->|\[\[page ?break\]\])\s*$/i;

const isTableRow = (line: string): boolean => /^\s*\|.*\|\s*$/.test(line) || (line.includes('|') && line.trim().split('|').length >= 3);

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === '\\' && row[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (row[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += row[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function cellNode(type: 'tableHeader' | 'tableCell', value: string): DocNode {
  return { type, attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [paragraph(parseInline(value))] };
}

function buildTable(header: string[] | null, rows: string[][]): DocNode {
  const width = Math.max(header?.length ?? 0, ...rows.map((row) => row.length), 1);
  const pad = (cells: string[]): string[] => [...cells, ...Array(Math.max(0, width - cells.length)).fill('')].slice(0, width);
  const tableRows: DocNode[] = [];
  if (header) tableRows.push({ type: 'tableRow', content: pad(header).map((cell) => cellNode('tableHeader', cell)) });
  for (const row of rows) tableRows.push({ type: 'tableRow', content: pad(row).map((cell) => cellNode('tableCell', cell)) });
  return { type: 'table', content: tableRows };
}

interface ListItemDraft {
  indent: number;
  lines: string[];
}

function buildList(lines: string[], start: number, opts: MarkdownOptions): { node: DocNode; next: number } {
  const first = lines[start];
  const ordered = ORDERED.test(first) && !BULLET.test(first);
  const baseIndent = (first.match(/^\s*/)?.[0].length) ?? 0;
  const items: ListItemDraft[] = [];
  let index = start;
  let startNumber = 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      // A blank line ends the list unless the next line continues it.
      const next = lines[index + 1];
      if (next !== undefined && (BULLET.test(next) || ORDERED.test(next)) && ((next.match(/^\s*/)?.[0].length ?? 0) >= baseIndent)) {
        index += 1;
        continue;
      }
      break;
    }
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const bullet = BULLET.exec(line);
    const numbered = ORDERED.exec(line);
    const marker = ordered ? numbered : bullet;
    if (marker && indent <= baseIndent + 1) {
      if (items.length === 0 && ordered && numbered) startNumber = Number(numbered[2]) || 1;
      items.push({ indent, lines: [ordered ? (numbered?.[3] ?? '') : (bullet?.[2] ?? '')] });
    } else if (items.length > 0 && (indent > baseIndent || (!bullet && !numbered))) {
      if (!bullet && !numbered && indent <= baseIndent && (HEADING.test(line) || FENCE.test(line) || isTableRow(line))) break;
      items[items.length - 1].lines.push(line.slice(Math.min(indent, baseIndent + 2)));
    } else {
      break;
    }
    index += 1;
  }
  const content = items.map((item) => {
    const [head, ...rest] = item.lines;
    const children: DocNode[] = [paragraph(parseInline(head))];
    if (rest.length > 0) children.push(...parseBlocks(rest.join('\n'), opts));
    return { type: 'listItem', content: children };
  });
  const node: DocNode = ordered
    ? { type: 'orderedList', attrs: { start: startNumber }, content }
    : { type: 'bulletList', content };
  return { node, next: index };
}

/** Parses Markdown into block nodes. Footnote definitions are folded into their references. */
export function parseBlocks(source: string, opts: MarkdownOptions = {}): DocNode[] {
  const minLevel = opts.minHeadingLevel ?? 1;
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: DocNode[] = [];
  const footnotes = new Map<string, string>();
  let pendingTableCaption: string | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const footnoteDef = FOOTNOTE_DEF.exec(line);
    if (footnoteDef) {
      footnotes.set(footnoteDef[1].trim(), footnoteDef[2].trim());
      index += 1;
      continue;
    }

    if (BIBLIOGRAPHY.test(line)) {
      blocks.push({ type: 'bibliography' });
      index += 1;
      continue;
    }

    if (PAGE_BREAK.test(line)) {
      blocks.push({ type: 'pageBreak' });
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith(fence[1])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({
        type: 'codeBlock',
        attrs: { language: fence[2] || null },
        content: body.length > 0 ? [text(body.join('\n'))] : undefined,
      });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(4, Math.max(minLevel, heading[1].length));
      blocks.push({ type: 'heading', attrs: { level }, content: parseInline(heading[2]) });
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'horizontalRule' });
      index += 1;
      continue;
    }

    const figure = FIGURE.exec(line);
    if (figure) {
      blocks.push({ type: 'figure', attrs: { src: null, alt: figure[1].trim(), caption: figure[1].trim() } });
      index += 1;
      continue;
    }

    const image = IMAGE.exec(line);
    if (image) {
      blocks.push({ type: 'figure', attrs: { src: image[2], alt: image[1], caption: image[1] } });
      index += 1;
      continue;
    }

    const tableCaption = TABLE_CAPTION.exec(line);
    // A caption written after its table (models do this) belongs before it.
    const previous = blocks[blocks.length - 1];
    if (tableCaption && previous?.type === 'table' && blocks[blocks.length - 2]?.type !== 'caption') {
      blocks.splice(blocks.length - 1, 0, { type: 'caption', attrs: { kind: 'table' }, content: parseInline(tableCaption[1].trim()) });
      index += 1;
      continue;
    }
    if (tableCaption && (isTableRow(lines[index + 1] ?? '') || (lines[index + 1] ?? '').trim() === '')) {
      const next = lines.slice(index + 1).find((entry) => entry.trim() !== '') ?? '';
      if (isTableRow(next)) {
        pendingTableCaption = tableCaption[1].trim();
        index += 1;
        continue;
      }
    }

    if (isTableRow(line) && line.includes('|')) {
      const hasDivider = TABLE_DIVIDER.test(lines[index + 1] ?? '');
      const header = hasDivider ? splitRow(line) : null;
      const rows: string[][] = [];
      index += hasDivider ? 2 : 0;
      while (index < lines.length && lines[index].trim() !== '' && isTableRow(lines[index])) {
        if (!TABLE_DIVIDER.test(lines[index])) rows.push(splitRow(lines[index]));
        index += 1;
      }
      if (pendingTableCaption) {
        blocks.push({ type: 'caption', attrs: { kind: 'table' }, content: parseInline(pendingTableCaption) });
        pendingTableCaption = null;
      }
      blocks.push(buildTable(header, rows));
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const { node, next } = buildList(lines, index, opts);
      blocks.push(node);
      index = next;
      continue;
    }

    if (line.trimStart().startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trimStart().startsWith('>')) {
        quote.push(lines[index].trimStart().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', content: parseBlocks(quote.join('\n'), opts) });
      continue;
    }

    const paragraphLines: string[] = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      if (
        next.trim() === '' || HEADING.test(next) || FENCE.test(next) || BULLET.test(next) || ORDERED.test(next)
        || next.trimStart().startsWith('>') || RULE.test(next) || FOOTNOTE_DEF.test(next) || PAGE_BREAK.test(next)
        || FIGURE.test(next) || (isTableRow(next) && TABLE_DIVIDER.test(lines[index + 1] ?? ''))
      ) break;
      paragraphLines.push(next.trim());
      index += 1;
    }
    blocks.push(paragraph(parseInline(paragraphLines.join(' '))));
  }

  if (pendingTableCaption) {
    blocks.push({ type: 'caption', attrs: { kind: 'table' }, content: parseInline(pendingTableCaption) });
  }
  if (footnotes.size > 0) resolveFootnotes(blocks, footnotes);
  return blocks;
}

function resolveFootnotes(nodes: DocNode[], definitions: Map<string, string>): void {
  for (const node of nodes) {
    if (node.type === 'footnote') {
      const ref = String(node.attrs?.ref ?? '');
      const definition = definitions.get(ref);
      if (definition) node.attrs = { ...node.attrs, text: definition };
    }
    if (node.content) resolveFootnotes(node.content, definitions);
  }
}

/** Unresolved numeric footnote refs ([^1] with no definition yet) while streaming. */
export function hasUnresolvedFootnotes(nodes: DocNode[]): boolean {
  return nodes.some((node) =>
    (node.type === 'footnote' && /^\d+$/.test(String(node.attrs?.text ?? '')))
    || (node.content ? hasUnresolvedFootnotes(node.content) : false));
}

export const nodeText = (node: DocNode): string => {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'footnote' || node.type === 'citation') return '';
  return (node.content ?? []).map(nodeText).join('');
};

const normalizeTitle = (value: string): string =>
  value.toLowerCase().replace(/^[\d.\s]+/, '').replace(/^chapter\s+\w+\s*[:.-]?\s*/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * The editor blocks for one written section: its level-1 heading (carrying
 * the section id) followed by the parsed body. A heading the model repeated
 * at the top of its answer is dropped.
 */
export function sectionToNodes(section: { id: string; title: string; unnumbered?: boolean }, markdown: string): DocNode[] {
  const body = parseBlocks(markdown, { minHeadingLevel: 2 });
  const first = body[0];
  if (first?.type === 'heading' && normalizeTitle(nodeText(first)) === normalizeTitle(section.title)) body.shift();
  return [
    {
      type: 'heading',
      attrs: { level: 1, sectionId: section.id, unnumbered: Boolean(section.unnumbered) },
      content: [text(section.title)],
    },
    ...body,
  ];
}

// Back to Markdown -------------------------------------------------------

function inlineToMarkdown(nodes: DocNode[] = []): string {
  return nodes.map((node) => {
    if (node.type === 'hardBreak') return '<br>';
    if (node.type === 'footnote') return `[^${String(node.attrs?.text ?? '')}]`;
    if (node.type === 'citation') {
      const keys = (node.attrs?.keys as string[] | undefined) ?? [];
      const locator = String(node.attrs?.locator ?? '');
      return `[${keys.map((key) => `@${key}`).join('; ')}${locator ? `, ${locator}` : ''}]`;
    }
    if (node.type !== 'text') return inlineToMarkdown(node.content);
    let value = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') value = `**${value}**`;
      else if (mark.type === 'italic') value = `*${value}*`;
      else if (mark.type === 'code') value = `\`${value}\``;
      else if (mark.type === 'strike') value = `~~${value}~~`;
      else if (mark.type === 'link') value = `[${value}](${String(mark.attrs?.href ?? '')})`;
    }
    return value;
  }).join('');
}

export function blocksToMarkdown(nodes: DocNode[], depth = 0): string {
  const indent = '  '.repeat(depth);
  return nodes.map((node) => {
    switch (node.type) {
      case 'heading':
        return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inlineToMarkdown(node.content)}`;
      case 'paragraph':
        return indent + inlineToMarkdown(node.content);
      case 'caption':
        return `Table: ${inlineToMarkdown(node.content)}`;
      case 'bulletList':
      case 'orderedList':
        return (node.content ?? []).map((item, i) => {
          const marker = node.type === 'orderedList' ? `${Number(node.attrs?.start ?? 1) + i}.` : '-';
          const [head, ...rest] = item.content ?? [];
          const first = `${indent}${marker} ${inlineToMarkdown(head?.content)}`;
          return rest.length > 0 ? `${first}\n${blocksToMarkdown(rest, depth + 1)}` : first;
        }).join('\n');
      case 'blockquote':
        return blocksToMarkdown(node.content ?? []).split('\n').map((line) => `> ${line}`).join('\n');
      case 'codeBlock':
        return `\`\`\`${String(node.attrs?.language ?? '')}\n${nodeText(node)}\n\`\`\``;
      case 'horizontalRule':
        return '---';
      case 'pageBreak':
        return '\\pagebreak';
      case 'bibliography':
        return '[[BIBLIOGRAPHY]]';
      case 'figure':
        return `[Figure: ${String(node.attrs?.caption ?? '')}]`;
      case 'table': {
        const rows = (node.content ?? []).map((row) =>
          `| ${(row.content ?? []).map((cell) => inlineToMarkdown(cell.content?.[0]?.content).replace(/\|/g, '\\|')).join(' | ')} |`);
        if (rows.length === 0) return '';
        const width = (node.content?.[0]?.content ?? []).length;
        return [rows[0], `|${' --- |'.repeat(width)}`, ...rows.slice(1)].join('\n');
      }
      default:
        return node.content ? blocksToMarkdown(node.content, depth) : '';
    }
  }).filter((block) => block !== '').join('\n\n');
}

/** Word count of a JSON document or node list. */
export function countWords(nodes: DocNode[]): number {
  let count = 0;
  const visit = (node: DocNode): void => {
    if (node.type === 'text') count += (node.text ?? '').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
    node.content?.forEach(visit);
  };
  nodes.forEach(visit);
  return count;
}
