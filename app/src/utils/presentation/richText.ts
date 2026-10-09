// Rich text runs for slide text: parsing the light Markdown the AI writes,
// flattening to plain text, word budgets and HTML. Dependency-free.

import type { Block, RichPara, TextRun } from './types';

/** Parses **bold**, __bold__ and *italic* into runs. */
export function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*|__)(.+?)\1|\*(?![\s*])(.+?)(?<!\s)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index) });
    if (match[2] !== undefined) runs.push({ text: match[2], bold: true });
    else runs.push({ text: match[3], italic: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return mergeRuns(runs);
}

const sameStyle = (a: TextRun, b: TextRun): boolean =>
  Boolean(a.bold) === Boolean(b.bold) && Boolean(a.italic) === Boolean(b.italic) && (a.color ?? '') === (b.color ?? '');

/** Joins neighbouring runs with the same style and drops empty ones. */
export function mergeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = out[out.length - 1];
    if (previous && sameStyle(previous, run)) previous.text += run.text;
    else {
      const clean: TextRun = { text: run.text };
      if (run.bold) clean.bold = true;
      if (run.italic) clean.italic = true;
      if (run.color) clean.color = run.color;
      out.push(clean);
    }
  }
  return out;
}

export const runsText = (runs: TextRun[]): string => runs.map((run) => run.text).join('');

export const para = (text: string, level = 0): RichPara => ({ runs: parseInline(text.trim()), ...(level > 0 ? { level } : {}) });

export const textBlock = (text: string): Block => ({
  type: 'text',
  items: text.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => para(line)),
});

export const bulletsBlock = (items: Array<string | { text: string; level?: number }>): Block => ({
  type: 'bullets',
  items: items
    .map((item) => (typeof item === 'string' ? { text: item, level: 0 } : item))
    .filter((item) => item.text.trim())
    .map((item) => para(item.text, item.level ?? 0)),
});

/** Plain text of a block, one paragraph or item per line. */
export function blockText(block: Block | undefined): string {
  if (!block) return '';
  switch (block.type) {
    case 'text':
    case 'bullets':
      return block.items.map((item) => `${item.level ? '  ' : ''}${runsText(item.runs)}`).join('\n');
    case 'quote':
      return block.attribution ? `${block.text}\n— ${block.attribution}` : block.text;
    case 'stats':
      return block.items.map((item) => `${item.value} — ${item.label}`).join('\n');
    case 'steps':
      return block.items.map((item) => `${item.title}: ${item.text}`).join('\n');
    case 'table':
      return block.rows.map((row) => row.join(' | ')).join('\n');
    case 'chart':
      return `${block.kind} chart: ${block.series.map((series) => series.name).join(', ')}`;
    case 'image':
      return block.alt ? `[image: ${block.alt}]` : '[image]';
    case 'icon':
      return '';
    default:
      return '';
  }
}

export const wordCount = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Cuts `runs` to at most `maxWords` words, ending with an ellipsis when cut. */
export function clampRunsToWords(runs: TextRun[], maxWords: number): TextRun[] {
  if (wordCount(runsText(runs)) <= maxWords) return runs;
  const out: TextRun[] = [];
  let remaining = maxWords;
  for (const run of runs) {
    if (remaining <= 0) break;
    const words = run.text.split(/(\s+)/);
    let text = '';
    for (const piece of words) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) {
        text += piece;
        continue;
      }
      if (remaining <= 0) break;
      text += piece;
      remaining -= 1;
    }
    out.push({ ...run, text });
  }
  const lastRun = out[out.length - 1];
  if (lastRun) lastRun.text = `${lastRun.text.replace(/[\s,;:.–—-]+$/, '')}…`;
  return mergeRuns(out);
}

/** Cuts `runs` to at most `maxChars` characters at a word boundary. */
export function clampRunsToChars(runs: TextRun[], maxChars: number): TextRun[] {
  const total = runsText(runs).length;
  if (total <= maxChars) return runs;
  const out: TextRun[] = [];
  let used = 0;
  for (const run of runs) {
    if (used >= maxChars) break;
    const room = maxChars - used;
    if (run.text.length <= room) {
      out.push(run);
      used += run.text.length;
    } else {
      const cut = run.text.slice(0, room);
      const boundary = cut.lastIndexOf(' ');
      out.push({ ...run, text: boundary > room * 0.5 ? cut.slice(0, boundary) : cut });
      used = maxChars;
    }
  }
  const lastRun = out[out.length - 1];
  if (lastRun) lastRun.text = `${lastRun.text.replace(/[\s,;:.–—-]+$/, '')}…`;
  return mergeRuns(out);
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Runs as inline HTML (b, i and coloured spans). */
export function runsToHtml(runs: TextRun[]): string {
  return runs.map((run) => {
    let html = escapeHtml(run.text).replace(/\n/g, '<br>');
    if (run.italic) html = `<i>${html}</i>`;
    if (run.bold) html = `<b>${html}</b>`;
    if (run.color) html = `<span style="color:${escapeHtml(run.color)}">${html}</span>`;
    return html;
  }).join('');
}
