// Builds the print document for PDF export: semantic HTML plus CSS Paged
// Media rules that paged.js lays out into real pages (named cover / front /
// main pages, roman front matter, running heads, footnotes, TOC page
// numbers via target-counter). Dependency-free (tested by `npm run test:writing`).

import { formatInText, formatReference, orderReferences } from './citations';
import { getReportType } from './reportTypes';
import { fontStack, headingSizes, pageDimensions } from './stylePresets';
import type { DocNode, Reference, ReportBrief } from './types';

export interface PrintInput {
  brief: ReportBrief;
  bibliography: Reference[];
  content: DocNode;
  /** Image sources (as stored in the doc) mapped to data URLs. */
  images?: Record<string, string>;
  /** Extra markup for <head>, e.g. the paged.js scripts. */
  headExtra?: string;
}

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));

// A CSS string inside <style>: no quote, newline or tag may break out of it.
const cssString = (value: string): string => `"${value
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\n/g, ' ')
  .replace(/</g, '\\3C ')
  .replace(/>/g, '\\3E ')}"`;

interface Context {
  brief: ReportBrief;
  refsByKey: Map<string, Reference>;
  numbers: Map<string, number>;
  images: Record<string, string>;
  headingIds: Map<DocNode, string>;
  captionIds: Map<DocNode, string>;
}

function citationOrder(content: DocNode, refsByKey: Map<string, Reference>): string[] {
  const order: string[] = [];
  const visit = (node: DocNode): void => {
    if (node.type === 'citation') {
      for (const key of (node.attrs?.keys as string[] | undefined) ?? []) {
        const ref = refsByKey.get(key);
        if (ref && !order.includes(ref.id)) order.push(ref.id);
      }
    }
    node.content?.forEach(visit);
  };
  visit(content);
  return order;
}

function marksToHtml(text: string, marks: DocNode['marks'] = []): string {
  let html = escapeHtml(text);
  for (const mark of marks) {
    const attrs = mark.attrs ?? {};
    switch (mark.type) {
      case 'bold': html = `<strong>${html}</strong>`; break;
      case 'italic': html = `<em>${html}</em>`; break;
      case 'underline': html = `<u>${html}</u>`; break;
      case 'strike': html = `<s>${html}</s>`; break;
      case 'code': html = `<code>${html}</code>`; break;
      case 'superscript': html = `<sup>${html}</sup>`; break;
      case 'subscript': html = `<sub>${html}</sub>`; break;
      case 'highlight': html = `<mark style="background:${escapeHtml(String(attrs.color ?? '#fef08a'))}">${html}</mark>`; break;
      case 'link': {
        const href = String(attrs.href ?? '');
        if (/^(https?:|mailto:|#)/i.test(href)) html = `<a href="${escapeHtml(href)}">${html}</a>`;
        break;
      }
      case 'textStyle': {
        const style: string[] = [];
        if (attrs.fontFamily) style.push(`font-family:${escapeHtml(String(attrs.fontFamily))}`);
        if (attrs.fontSize) style.push(`font-size:${escapeHtml(String(attrs.fontSize))}`);
        if (attrs.color) style.push(`color:${escapeHtml(String(attrs.color))}`);
        if (attrs.backgroundColor) style.push(`background:${escapeHtml(String(attrs.backgroundColor))}`);
        if (attrs.lineHeight) style.push(`line-height:${escapeHtml(String(attrs.lineHeight))}`);
        if (style.length > 0) html = `<span style="${style.join(';')}">${html}</span>`;
        break;
      }
      default:
        break;
    }
  }
  return html;
}

const alignStyle = (node: DocNode): string => {
  const align = node.attrs?.textAlign;
  return align && align !== 'left' ? ` style="text-align:${escapeHtml(String(align))}"` : '';
};

function inline(nodes: DocNode[] = [], ctx: Context): string {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text': return marksToHtml(node.text ?? '', node.marks);
      case 'hardBreak': return '<br>';
      case 'footnote': return `<span class="footnote">${escapeHtml(String(node.attrs?.text ?? ''))}</span>`;
      case 'citation': {
        const refs = ((node.attrs?.keys as string[] | undefined) ?? []).map((key) => ctx.refsByKey.get(key)).filter((ref): ref is Reference => Boolean(ref));
        const label = refs.length > 0
          ? formatInText(refs, ctx.brief.style.citationStyle, String(node.attrs?.locator ?? ''), ctx.numbers)
          : `[${((node.attrs?.keys as string[] | undefined) ?? []).join('; ')}]`;
        return `<span class="citation">${escapeHtml(label)}</span>`;
      }
      default: return inline(node.content, ctx);
    }
  }).join('');
}

const plainText = (nodes: DocNode[] = []): string => nodes.map((node) => (node.type === 'text' ? node.text ?? '' : plainText(node.content))).join('');

function tableHtml(node: DocNode, ctx: Context): string {
  const rows = node.content ?? [];
  const isHeaderRow = (row: DocNode): boolean => (row.content ?? []).length > 0 && (row.content ?? []).every((cell) => cell.type === 'tableHeader');
  const head: DocNode[] = [];
  let index = 0;
  while (index < rows.length && isHeaderRow(rows[index])) head.push(rows[index++]);
  const body = rows.slice(index);
  const row = (entry: DocNode): string => `<tr>${(entry.content ?? []).map((cell) => {
    const tag = cell.type === 'tableHeader' ? 'th' : 'td';
    const span = `${Number(cell.attrs?.colspan ?? 1) > 1 ? ` colspan="${Number(cell.attrs?.colspan)}"` : ''}${Number(cell.attrs?.rowspan ?? 1) > 1 ? ` rowspan="${Number(cell.attrs?.rowspan)}"` : ''}`;
    return `<${tag}${span}>${blocks(cell.content ?? [], ctx)}</${tag}>`;
  }).join('')}</tr>`;
  return `<table>${head.length > 0 ? `<thead>${head.map(row).join('')}</thead>` : ''}<tbody>${body.map(row).join('')}</tbody></table>`;
}

function bibliographyHtml(ctx: Context, order: string[]): string {
  const style = ctx.brief.style.citationStyle;
  const all = [...ctx.refsByKey.values()];
  const cited = all.filter((ref) => order.includes(ref.id));
  const list = orderReferences(cited.length > 0 ? cited : all, style, order);
  if (list.length === 0) return '';
  return `<div class="bibliography">${list.map((ref, i) => {
    const text = formatReference(ref, style, ctx.numbers.get(ref.id) ?? i + 1);
    const html = escapeHtml(text).replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return `<p class="bib-entry${style === 'ieee' ? ' is-numeric' : ''}">${html}</p>`;
  }).join('')}</div>`;
}

function block(node: DocNode, ctx: Context, order: string[]): string {
  switch (node.type) {
    case 'paragraph': {
      const body = inline(node.content, ctx);
      return body ? `<p${alignStyle(node)}>${body}</p>` : '';
    }
    case 'heading': {
      const level = Math.min(4, Math.max(1, Number(node.attrs?.level ?? 1)));
      const id = ctx.headingIds.get(node);
      const classes = [node.attrs?.sectionId ? 'section' : '', node.attrs?.unnumbered ? 'unnumbered' : ''].filter(Boolean).join(' ');
      return `<h${level}${id ? ` id="${id}"` : ''}${classes ? ` class="${classes}"` : ''}${alignStyle(node)}>${inline(node.content, ctx)}</h${level}>`;
    }
    case 'bulletList': return `<ul>${(node.content ?? []).map((item) => block(item, ctx, order)).join('')}</ul>`;
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1);
      return `<ol${start !== 1 ? ` start="${start}"` : ''}>${(node.content ?? []).map((item) => block(item, ctx, order)).join('')}</ol>`;
    }
    case 'listItem': return `<li>${blocks(node.content ?? [], ctx, order)}</li>`;
    case 'taskList': return `<ul class="tasks">${(node.content ?? []).map((item) => block(item, ctx, order)).join('')}</ul>`;
    case 'taskItem': return `<li>${node.attrs?.checked ? '☑' : '☐'} ${blocks(node.content ?? [], ctx, order)}</li>`;
    case 'blockquote': return `<blockquote>${blocks(node.content ?? [], ctx, order)}</blockquote>`;
    case 'codeBlock': return `<pre><code>${escapeHtml(plainText(node.content))}</code></pre>`;
    case 'horizontalRule': return '<hr>';
    case 'pageBreak': return '<div class="page-break"></div>';
    case 'table': return tableHtml(node, ctx);
    case 'caption': {
      const kind = node.attrs?.kind === 'figure' ? 'figure' : 'table';
      const id = ctx.captionIds.get(node);
      return `<p class="caption caption-${kind}"${id ? ` id="${id}"` : ''}>${inline(node.content, ctx)}</p>`;
    }
    case 'figure': {
      const src = String(node.attrs?.src ?? '');
      const data = src ? ctx.images[src] ?? (/^data:/.test(src) ? src : '') : '';
      const id = ctx.captionIds.get(node);
      const width = Number(node.attrs?.width ?? 80);
      const caption = String(node.attrs?.caption ?? '');
      const body = data
        ? `<img src="${escapeHtml(data)}" alt="${escapeHtml(String(node.attrs?.alt ?? caption))}" style="width:${width}%">`
        : `<div class="figure-placeholder">${escapeHtml(caption || 'Figure')}</div>`;
      return `<figure${id ? ` id="${id}"` : ''}>${body}${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
    }
    case 'bibliography': return bibliographyHtml(ctx, order);
    case 'tableOfContents':
    case 'coverPage':
      return '';
    default:
      return node.content ? blocks(node.content, ctx, order) : '';
  }
}

function blocks(nodes: DocNode[], ctx: Context, order: string[] = []): string {
  return nodes.map((node) => block(node, ctx, order)).join('');
}

function coverHtml(brief: ReportBrief): string {
  const { details, style } = brief;
  const type = getReportType(brief.typeId);
  const field = (key: string): string => details.fields[key]?.trim() ?? '';
  const top = ['institution', 'department', 'course'].map(field).filter(Boolean);
  if (top.length === 0 && details.organization) top.push(details.organization);
  const authors = field('team') || details.authors;
  const meta = ['supervisor', 'term', 'company', 'client', 'period', 'reportNumber', 'version']
    .map((key) => ({ key, value: field(key), label: type.fields.find((entry) => entry.key === key)?.label.replace(/\s*\(.*\)$/, '') ?? key }))
    .filter((entry) => entry.value);
  return `<section class="cover cover-${style.cover}">
<div class="cover-band"></div>
<div class="cover-top">${top.map((line, i) => `<div class="${i === 0 ? 'cover-institution' : 'cover-sub'}">${escapeHtml(line)}</div>`).join('')}</div>
<div class="cover-middle">
<div class="cover-kind">${escapeHtml(type.name)}</div>
<h1 class="cover-title">${escapeHtml(details.title || type.name)}</h1>
${details.subtitle ? `<div class="cover-subtitle">${escapeHtml(details.subtitle)}</div>` : ''}
<div class="cover-rule"></div>
</div>
<div class="cover-bottom">
${authors ? `<div class="cover-label">Prepared by</div><div class="cover-authors">${escapeHtml(authors).replace(/\n/g, '<br>')}</div>` : ''}
${meta.map((entry) => `<div class="cover-meta"><span>${escapeHtml(entry.label)}</span> ${escapeHtml(entry.value)}</div>`).join('')}
${details.date ? `<div class="cover-date">${escapeHtml(details.date)}</div>` : ''}
</div>
</section>`;
}

interface HeadingInfo {
  node: DocNode;
  level: number;
  text: string;
  number: string;
  id: string;
  front: boolean;
}

function numberHeadings(nodes: DocNode[], numbering: ReportBrief['style']['headingNumbering'], frontCount: number): HeadingInfo[] {
  const counters = [0, 0, 0, 0];
  let unnumbered = false;
  const result: HeadingInfo[] = [];
  nodes.forEach((node, index) => {
    if (node.type !== 'heading') return;
    const level = Number(node.attrs?.level ?? 1);
    if (level === 1) unnumbered = Boolean(node.attrs?.unnumbered);
    let number = '';
    if (numbering !== 'none' && !unnumbered) {
      counters[level - 1] += 1;
      for (let i = level; i < counters.length; i += 1) counters[i] = 0;
      number = counters.slice(0, level).join('.');
      if (numbering === 'chapter' && level === 1) number = `Chapter ${counters[0]}`;
    }
    result.push({ node, level, text: plainText(node.content).trim(), number, id: `h-${index}`, front: index < frontCount });
  });
  return result;
}

function css(brief: ReportBrief): string {
  const { style } = brief;
  const { width, height } = pageDimensions(style.pageSize, style.orientation);
  const [h1, h2, h3, h4] = headingSizes(style);
  const m = style.margins;
  const pageNumber = (counterStyle: string): string => `counter(page${counterStyle ? `, ${counterStyle}` : ''})`;
  const box = style.pageNumbers === 'bottom-center' ? '@bottom-center' : style.pageNumbers === 'bottom-right' ? '@bottom-right' : style.pageNumbers === 'top-right' ? '@top-right' : null;
  const running = (counterStyle: string): string => [
    style.headerText ? `@top-left { content: ${cssString(style.headerText.replace('{title}', brief.details.title))}; }` : '',
    style.footerText ? `@bottom-left { content: ${cssString(style.footerText.replace('{title}', brief.details.title))}; }` : '',
    box ? `${box} { content: ${pageNumber(counterStyle)}; }` : '',
  ].join('\n  ');
  const numbered = style.headingNumbering !== 'none';
  const chapter = style.headingNumbering === 'chapter';
  return `
@page { size: ${width}mm ${height}mm; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
  ${running('')}
  @top-left { font: 8.5pt ${fontStack(style.bodyFont)}; color: #6b6b74; }
  @top-right { font: 8.5pt ${fontStack(style.bodyFont)}; color: #6b6b74; }
  @bottom-left { font: 8.5pt ${fontStack(style.bodyFont)}; color: #6b6b74; }
  @bottom-center { font: 9pt ${fontStack(style.bodyFont)}; color: #4a4a54; }
  @bottom-right { font: 9pt ${fontStack(style.bodyFont)}; color: #4a4a54; }
  @footnote { border-top: 0.5pt solid #9a9aa6; padding-top: 4pt; margin-top: 8pt; }
}
@page cover { @top-left { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-center { content: none; } @bottom-right { content: none; } }
@page front { ${running(style.romanFrontMatter ? 'lower-roman' : '')} }
@page main { ${running('')} }
.cover { page: cover; break-after: page; }
.front { page: front; }
.main { page: main; ${style.romanFrontMatter ? 'counter-reset: page 1;' : ''} }
.front > h1.section:not(:first-child), .front > .toc, .front > .lists { break-before: page; }
${style.sectionBreaks ? '.main h1.section:not(:first-child) { break-before: page; }' : ''}
.page-break { break-after: page; }

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: ${fontStack(style.bodyFont)}; font-size: ${style.bodySize}pt; line-height: ${style.lineHeight}; color: #16161a; hyphens: auto; font-kerning: normal; counter-reset: h1 table figure; }
p { margin: 0 0 ${style.paragraphSpacing}pt; text-align: ${style.alignment}; text-indent: ${style.firstLineIndent ? '1.27cm' : '0'}; orphans: 2; widows: 2; }
li p, td p, th p, blockquote p, .bibliography p { text-indent: 0; }
h1, h2, h3, h4 { font-family: ${fontStack(style.headingFont)}; color: ${style.headingColor}; line-height: 1.25; break-after: avoid; text-align: left; }
h1 { font-size: ${h1}pt; margin: 0 0 0.7em; }
h2 { font-size: ${h2}pt; margin: 1.1em 0 0.45em; }
h3 { font-size: ${h3}pt; margin: 1em 0 0.35em; }
h4 { font-size: ${h4}pt; font-style: italic; margin: 0.9em 0 0.3em; }
h1.unnumbered { text-align: center; }
${numbered ? `
.main h1.section:not(.unnumbered) { counter-increment: h1; counter-reset: h2 h3; }
.main h1.section:not(.unnumbered)::before { ${chapter ? `content: "Chapter " counter(h1); display: block; font-size: 0.55em; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 0.35em;` : 'content: counter(h1) "\\2002";'} color: ${style.accentColor}; }
.main h2 { counter-increment: h2; counter-reset: h3; }
.main h2::before { content: counter(h1) "." counter(h2) "\\2002"; }
.main h3 { counter-increment: h3; }
.main h3::before { content: counter(h1) "." counter(h2) "." counter(h3) "\\2002"; }
.main h1.unnumbered ~ h2::before, .main h1.unnumbered ~ h3::before { content: none; }
.main h1.section:not(.unnumbered) ~ h2::before { content: counter(h1) "." counter(h2) "\\2002"; }
.main h1.section:not(.unnumbered) ~ h3::before { content: counter(h1) "." counter(h2) "." counter(h3) "\\2002"; }
` : ''}
ul, ol { margin: 0 0 ${style.paragraphSpacing}pt; padding-left: 1.6em; }
li { margin: 0.15em 0; }
li > p { margin: 0; text-align: left; }
blockquote { margin: 0.8em 0; padding-left: 1.1em; border-left: 3px solid ${style.accentColor}; color: #3d3d46; font-style: italic; }
hr { border: 0; border-top: 1px solid #d6d6dc; margin: 1.4em 0; }
a { color: ${style.accentColor}; }
code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 0.88em; }
pre { padding: 0.8em 1em; background: #f5f5f8; border: 1px solid #e4e4ea; border-radius: 4px; font-size: 0.85em; white-space: pre-wrap; break-inside: avoid; }
table { width: 100%; border-collapse: collapse; margin: 0.4em 0 1em; font-size: 0.92em; line-height: 1.35; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { padding: 0.35em 0.6em; border-bottom: 0.75pt solid #dcdce3; text-align: left; vertical-align: top; }
th { background: color-mix(in srgb, ${style.accentColor} 7%, white); color: ${style.headingColor}; font-weight: 700; border-top: 1.25pt solid ${style.headingColor}; }
tbody tr:last-child td { border-bottom: 1.25pt solid ${style.headingColor}; }
th p, td p { margin: 0; text-align: left; }
.caption { margin: 1em 0 0.35em; font-size: 0.88em; text-indent: 0; text-align: left; break-after: avoid; }
.caption-table { counter-increment: table; }
.caption-table::before { content: "Table " counter(table) ". "; font-weight: 700; color: ${style.headingColor}; }
figure { margin: 1em 0; text-align: center; break-inside: avoid; counter-increment: figure; }
figure img { max-width: 100%; }
figcaption { margin-top: 0.4em; font-size: 0.88em; }
figcaption::before { content: "Figure " counter(figure) ". "; font-weight: 700; }
.figure-placeholder { padding: 2.4em 1em; border: 1px dashed #b4b4be; color: #6b6b78; font-style: italic; }
.footnote { float: footnote; font-size: 8.5pt; line-height: 1.3; text-align: left; text-indent: 0; }
::footnote-call { content: counter(footnote); vertical-align: super; font-size: 0.68em; line-height: 0; color: ${style.accentColor}; }
::footnote-marker { content: counter(footnote) ". "; }
.citation { white-space: nowrap; }
.bibliography .bib-entry { padding-left: 2em; text-indent: -2em; text-align: left; margin-bottom: 0.55em; }
.bibliography .bib-entry.is-numeric { padding-left: 2.4em; text-indent: -2.4em; }

.toc h1, .lists h1 { margin-bottom: 1em; }
.toc ol, .lists ol { list-style: none; margin: 0; padding: 0; }
.toc li, .lists li { margin: 0; }
.toc a, .lists a { display: flex; align-items: baseline; gap: 0.5em; padding: 0.2em 0; color: #16161a; text-decoration: none; }
.toc .l1 a { font-weight: 700; margin-top: 0.35em; }
.toc .l2 a { padding-left: 1.4em; }
.toc .l3 a { padding-left: 2.8em; font-size: 0.95em; }
.toc .num { min-width: 2.2em; color: ${style.headingColor}; }
.toc .leader, .lists .leader { flex: 1; border-bottom: 1px dotted #9a9aa6; transform: translateY(-0.25em); }
.toc a::after, .lists a::after { content: target-counter(attr(href), page); min-width: 1.6em; text-align: right; }
.toc a.front::after { content: target-counter(attr(href), page, lower-roman); }

.cover { position: relative; display: flex; flex-direction: column; justify-content: space-between; height: ${height - m.top - m.bottom - 2}mm; text-align: center; font-family: ${fontStack(style.headingFont)}; }
.cover-band { display: none; }
.cover-top { padding-top: 4%; }
.cover-institution { font-size: 1.25em; font-weight: 700; }
.cover-sub { font-size: 1.05em; }
.cover-middle { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.cover-kind { font-family: ${fontStack(style.bodyFont)}; font-size: 0.72em; font-weight: 600; letter-spacing: 0.24em; text-transform: uppercase; color: ${style.accentColor}; }
.cover-title { margin: 0; font-size: 2.15em; line-height: 1.15; color: ${style.headingColor}; text-align: center; }
.cover-title::before { content: none !important; }
.cover-subtitle { font-size: 1.15em; font-style: italic; color: #4a4a54; }
.cover-rule { width: 72px; height: 2px; margin-top: 10px; background: ${style.accentColor}; }
.cover-bottom { display: flex; flex-direction: column; align-items: center; gap: 4px; padding-bottom: 6%; }
.cover-label { font-size: 0.7em; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: #8a8a96; }
.cover-authors { font-size: 1.1em; line-height: 1.5; }
.cover-meta { font-size: 0.95em; }
.cover-meta span { color: #6b6b78; }
.cover-date { margin-top: 10px; color: #4a4a54; }
.cover-corporate, .cover-modern { text-align: left; }
.cover-corporate .cover-middle, .cover-modern .cover-middle, .cover-corporate .cover-bottom, .cover-modern .cover-bottom, .cover-minimal .cover-middle, .cover-minimal .cover-bottom { align-items: flex-start; }
.cover-corporate .cover-title, .cover-modern .cover-title, .cover-minimal .cover-title { text-align: left; }
.cover-corporate .cover-band, .cover-modern .cover-band { display: block; position: absolute; left: -${m.left}mm; top: -${m.top}mm; bottom: -${m.bottom}mm; width: 5mm; background: ${style.accentColor}; }
.cover-corporate .cover-title { font-size: 2.6em; }
.cover-modern .cover-title { font-weight: 300; font-size: 2.8em; letter-spacing: -0.03em; font-family: ${fontStack(style.bodyFont)}; }
.cover-minimal { justify-content: center; gap: 18%; text-align: left; }
.cover-minimal .cover-title { font-size: 3em; letter-spacing: -0.04em; font-family: ${fontStack(style.bodyFont)}; }
.cover-minimal .cover-rule { width: 100%; height: 1px; background: #16161a; }
.cover-classic .cover-middle { padding: 2em 0; border-top: 1px solid #16161a; border-bottom: 1px solid #16161a; }
.cover-classic .cover-title { font-weight: 400; font-size: 2.4em; }
`;
}

/** The complete print document. */
export function buildPrintHtml({ brief, bibliography, content, images = {}, headExtra = '' }: PrintInput): string {
  const nodes = (content.content ?? []).filter((node) => node.type !== 'coverPage');
  const firstMain = nodes.findIndex((node) => node.type === 'heading' && node.attrs?.sectionId && !node.attrs?.unnumbered);
  const frontCount = firstMain < 0 ? 0 : firstMain;
  const headings = numberHeadings(nodes, brief.style.headingNumbering, frontCount);
  const refsByKey = new Map(bibliography.map((ref) => [ref.key, ref]));
  const order = citationOrder(content, refsByKey);
  const ctx: Context = {
    brief,
    refsByKey,
    numbers: new Map(order.map((id, index) => [id, index + 1])),
    images,
    headingIds: new Map(headings.map((entry) => [entry.node, entry.id])),
    captionIds: new Map(),
  };

  const figures: Array<{ id: string; text: string }> = [];
  const tables: Array<{ id: string; text: string }> = [];
  nodes.forEach((node, index) => {
    if (node.type === 'figure') {
      const id = `fig-${index}`;
      ctx.captionIds.set(node, id);
      figures.push({ id, text: String(node.attrs?.caption ?? '') });
    } else if (node.type === 'caption') {
      const id = `cap-${index}`;
      ctx.captionIds.set(node, id);
      if (node.attrs?.kind === 'figure') figures.push({ id, text: plainText(node.content) });
      else tables.push({ id, text: plainText(node.content) });
    }
  });

  const tocEntries = headings.filter((entry) => entry.level <= 3 && entry.text);
  const toc = brief.style.includeToc || nodes.some((node) => node.type === 'tableOfContents')
    ? `<nav class="toc"><h1 class="unnumbered">Table of Contents</h1><ol>${tocEntries.map((entry) => `<li class="l${entry.level}"><a href="#${entry.id}"${entry.front ? ' class="front"' : ''}>${entry.number ? `<span class="num">${escapeHtml(entry.number)}</span>` : ''}<span>${escapeHtml(entry.text)}</span><span class="leader"></span></a></li>`).join('')}</ol></nav>`
    : '';
  const list = (title: string, entries: Array<{ id: string; text: string }>, label: string): string => (entries.length === 0 ? '' : `<nav class="lists"><h1 class="unnumbered">${title}</h1><ol>${entries.map((entry, i) => `<li><a href="#${entry.id}"><span>${label} ${i + 1}. ${escapeHtml(entry.text)}</span><span class="leader"></span></a></li>`).join('')}</ol></nav>`);
  const lists = `${brief.style.includeListOfFigures ? list('List of Figures', figures, 'Figure') : ''}${brief.style.includeListOfTables ? list('List of Tables', tables, 'Table') : ''}`;

  const front = nodes.slice(0, frontCount).filter((node) => node.type !== 'tableOfContents');
  const main = nodes.slice(frontCount);
  const frontHtml = `${blocks(front, ctx, order)}${toc}${lists}`;
  const mainHtml = blocks(main.filter((node) => node.type !== 'tableOfContents'), ctx, order);

  const title = brief.details.title || getReportType(brief.typeId).name;
  return `<!doctype html>
<html lang="${/^en/i.test(brief.details.language) ? 'en' : 'und'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${css(brief)}</style>
${headExtra}
</head>
<body>
${brief.style.cover !== 'none' ? coverHtml(brief) : ''}
${frontHtml.trim() ? `<div class="front">${frontHtml}</div>` : ''}
<div class="main">${mainHtml}</div>
</body>
</html>`;
}
