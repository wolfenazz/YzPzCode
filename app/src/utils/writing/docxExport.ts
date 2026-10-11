// Word export: maps the report to native Word structures — real heading
// styles with multilevel numbering, a TOC field (pre-filled with page
// numbers), real footnotes, captions with SEQ fields, cover / front matter /
// main sections with their own page numbering, and running headers/footers.

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LevelSuffix,
  LineRuleType,
  NumberFormat,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  SequentialIdentifier,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ISectionOptions,
  type ParagraphChild,
} from 'docx';
import { estimatePageNumbersWith } from 'docx/layout';
import { formatInText, formatReference, orderReferences } from './citations';
import { docLabels, type DocLabels } from './labels';
import { getReportType } from './reportTypes';
import { complexScriptFace, firstStrong, hasRtl, isRtlLanguage, languageTag, paragraphDirection, type Direction } from './rtl';
import { headingSizes, mmToTwip, pageDimensions } from './stylePresets';
import type { DocNode, Reference, ReportBrief } from './types';

export interface DocxImage {
  data: Uint8Array;
  width: number;
  height: number;
  type: 'png' | 'jpg' | 'gif' | 'bmp';
}

export interface DocxInput {
  brief: ReportBrief;
  bibliography: Reference[];
  content: DocNode;
  images?: Record<string, DocxImage>;
}

const hex = (color: string): string => color.replace('#', '').slice(0, 6).toUpperCase();
const halfPoints = (pt: number): number => Math.round(pt * 2);
const twipPt = (pt: number): number => Math.round(pt * 20);

const HEADING_LEVELS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4] as const;
const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};
/**
 * In a right-to-left paragraph Word reads left and right as the leading and trailing edge, so a side the
 * author picked is written as the opposite logical edge (start is the right edge, end the left one).
 */
const ALIGN_RTL: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.END,
  center: AlignmentType.CENTER,
  right: AlignmentType.START,
  justify: AlignmentType.JUSTIFIED,
};

/** The first family of a CSS font stack, as Word wants a single font name. */
const firstFont = (stack: unknown): string | undefined => {
  if (typeof stack !== 'string' || !stack) return undefined;
  return stack.split(',')[0].replace(/["']/g, '').trim() || undefined;
};

interface Builder {
  /** The document's own direction: what a block with no letters of its own reads in. */
  base: Direction;
  labels: DocLabels;
  brief: ReportBrief;
  refsByKey: Map<string, Reference>;
  numbers: Map<string, number>;
  images: Record<string, DocxImage>;
  footnotes: Record<string, { children: Paragraph[] }>;
  nextFootnote: number;
  orderedInstance: number;
  bodyWidthPx: number;
  firstSectionInMain: boolean;
  citationOrder: string[];
  /** Whether a heading sits inside an unnumbered section (Abstract, References…). */
  unnumberedScope: (level: number, unnumbered: boolean) => boolean;
}

function runs(nodes: DocNode[] = [], b: Builder, base: { bold?: boolean; italics?: boolean; font?: string } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      out.push(new TextRun({ text: '', break: 1 }));
      continue;
    }
    if (node.type === 'footnote') {
      const id = b.nextFootnote;
      b.nextFootnote += 1;
      b.footnotes[String(id)] = { children: [new Paragraph({ style: 'FootnoteText', children: [new TextRun(String(node.attrs?.text ?? ''))] })] };
      out.push(new FootnoteReferenceRun(id));
      continue;
    }
    if (node.type === 'citation') {
      const refs = ((node.attrs?.keys as string[] | undefined) ?? []).map((key) => b.refsByKey.get(key)).filter((ref): ref is Reference => Boolean(ref));
      const label = refs.length > 0 ? formatInText(refs, b.brief.style.citationStyle, String(node.attrs?.locator ?? ''), b.numbers) : `[${((node.attrs?.keys as string[] | undefined) ?? []).join('; ')}]`;
      out.push(new TextRun({ text: label, ...base }));
      continue;
    }
    if (node.type !== 'text') {
      out.push(...runs(node.content, b, base));
      continue;
    }
    const marks = node.marks ?? [];
    const has = (type: string): boolean => marks.some((mark) => mark.type === type);
    const textStyle = marks.find((mark) => mark.type === 'textStyle')?.attrs ?? {};
    const highlight = marks.find((mark) => mark.type === 'highlight')?.attrs?.color as string | undefined;
    const size = typeof textStyle.fontSize === 'string' && textStyle.fontSize.endsWith('pt') ? halfPoints(parseFloat(textStyle.fontSize)) : undefined;
    const rtlRun = hasRtl(node.text ?? '');
    const face = has('code') ? 'Consolas' : firstFont(textStyle.fontFamily) ?? base.font;
    const bold = has('bold') || base.bold || undefined;
    // Word draws right-to-left letters with the complex-script properties (w:cs, w:szCs, w:bCs, w:iCs, w:rtl).
    const complexScript = rtlRun ? {
      rightToLeft: true,
      boldComplexScript: bold,
      italicsComplexScript: has('italic') || base.italics || undefined,
      sizeComplexScript: size ?? undefined,
      font: { ascii: face ?? b.brief.style.bodyFont, hAnsi: face ?? b.brief.style.bodyFont, cs: complexScriptFace(face ?? b.brief.style.bodyFont) },
    } : {};
    const run = new TextRun({
      text: node.text ?? '',
      bold,
      italics: has('italic') || base.italics || undefined,
      underline: has('underline') ? {} : undefined,
      strike: has('strike') || undefined,
      superScript: has('superscript') || undefined,
      subScript: has('subscript') || undefined,
      font: face,
      size,
      color: typeof textStyle.color === 'string' ? hex(textStyle.color) : undefined,
      shading: highlight ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(highlight) } : has('code') ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F1F4' } : undefined,
      ...complexScript,
    });
    const link = marks.find((mark) => mark.type === 'link')?.attrs?.href as string | undefined;
    if (link && /^(https?:|mailto:)/i.test(link)) {
      out.push(new ExternalHyperlink({ link, children: [new TextRun({ text: node.text ?? '', style: 'Hyperlink', bold: has('bold') || undefined, italics: has('italic') || undefined, ...(rtlRun ? { rightToLeft: true, boldComplexScript: has('bold') || undefined, font: { cs: complexScriptFace(b.brief.style.bodyFont) } } : {}) })] }));
    } else {
      out.push(run);
    }
  }
  return out;
}

const plain = (nodes: DocNode[] = []): string => nodes.map((node) => (node.type === 'text' ? node.text ?? '' : plain(node.content))).join('');

function paragraphAlign(node: DocNode, rtl = false): IParagraphOptions['alignment'] {
  const align = node.attrs?.textAlign;
  return typeof align === 'string' ? (rtl ? ALIGN_RTL : ALIGN)[align] : undefined;
}

/** The direction a text block reads in: the author's choice, else its first strong letter, else the document's. */
function textDirOf(node: DocNode, b: Builder): Direction {
  const chosen = node.attrs?.dir;
  if (chosen === 'rtl' || chosen === 'ltr') return chosen;
  const text = plain(node.content);
  return firstStrong(text) === null ? b.base : paragraphDirection(text);
}

/** A list, quote or table reads in the direction of the first text it holds. */
function leadDirOf(node: DocNode, b: Builder): Direction {
  const chosen = node.attrs?.dir;
  if (chosen === 'rtl' || chosen === 'ltr') return chosen;
  const find = (entry: DocNode): DocNode | null => {
    if (entry.type === 'paragraph' || entry.type === 'heading' || entry.type === 'caption') return entry;
    for (const child of entry.content ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  const lead = (node.content ?? []).map(find).find((entry): entry is DocNode => entry !== null);
  return lead ? textDirOf(lead, b) : b.base;
}

function tableBlock(node: DocNode, b: Builder): Table {
  const rows = node.content ?? [];
  const columns = Math.max(1, ...rows.map((row) => (row.content ?? []).reduce((sum, cell) => sum + Number(cell.attrs?.colspan ?? 1), 0)));
  const accent = hex(b.brief.style.accentColor);
  const ink = hex(b.brief.style.headingColor);
  const thin = { style: BorderStyle.SINGLE, size: 4, color: 'DCDCE3' };
  const strong = { style: BorderStyle.SINGLE, size: 10, color: ink };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return new Table({
    // Right-to-left tables run their columns from the right.
    visuallyRightToLeft: leadDirOf(node, b) === 'rtl' || undefined,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: Array(columns).fill(Math.floor(9000 / columns)),
    borders: { top: strong, bottom: strong, left: none, right: none, insideHorizontal: thin, insideVertical: none },
    rows: rows.map((row, rowIndex) => {
      const header = (row.content ?? []).length > 0 && (row.content ?? []).every((cell) => cell.type === 'tableHeader');
      return new TableRow({
        tableHeader: header && rowIndex === 0,
        cantSplit: true,
        children: (row.content ?? []).map((cell) => new TableCell({
          columnSpan: Number(cell.attrs?.colspan ?? 1) > 1 ? Number(cell.attrs?.colspan) : undefined,
          rowSpan: Number(cell.attrs?.rowspan ?? 1) > 1 ? Number(cell.attrs?.rowspan) : undefined,
          shading: cell.type === 'tableHeader' ? { type: ShadingType.CLEAR, color: 'auto', fill: blend(accent) } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: (cell.content ?? [{ type: 'paragraph' }]).flatMap((child) => blockNodes(child, b, { inTable: true, header: cell.type === 'tableHeader' })) as Paragraph[],
        })),
      });
    }),
  });
}

/** 7% of the accent over white, like the on-screen header row. */
function blend(accent: string): string {
  const channel = (offset: number): string => {
    const value = parseInt(accent.slice(offset, offset + 2), 16);
    return Math.round(255 - (255 - (Number.isNaN(value) ? 255 : value)) * 0.07).toString(16).padStart(2, '0');
  };
  return `${channel(0)}${channel(2)}${channel(4)}`.toUpperCase();
}

interface BlockOptions {
  inTable?: boolean;
  header?: boolean;
  listLevel?: number;
  listRef?: { reference: string; instance?: number };
  quote?: boolean;
}

function blockNodes(node: DocNode, b: Builder, opts: BlockOptions = {}): Array<Paragraph | Table | TableOfContents> {
  const { style } = b.brief;
  switch (node.type) {
    case 'paragraph': {
      const children = runs(node.content, b, opts.header ? { bold: true } : {});
      const rtl = textDirOf(node, b) === 'rtl';
      return [new Paragraph({
        style: opts.quote ? 'Quote' : opts.inTable ? 'TableText' : undefined,
        bidirectional: rtl,
        alignment: paragraphAlign(node, rtl),
        numbering: opts.listRef ? { ...opts.listRef, level: opts.listLevel ?? 0 } : undefined,
        children,
      })];
    }
    case 'heading': {
      const level = Math.min(4, Math.max(1, Number(node.attrs?.level ?? 1)));
      const unnumbered = Boolean(node.attrs?.unnumbered);
      const isSection = Boolean(node.attrs?.sectionId);
      const breakBefore = level === 1 && isSection && style.sectionBreaks && !b.firstSectionInMain;
      if (level === 1 && isSection) b.firstSectionInMain = false;
      const rtl = textDirOf(node, b) === 'rtl';
      return [new Paragraph({
        heading: HEADING_LEVELS[level - 1],
        bidirectional: rtl,
        alignment: unnumbered && level === 1 ? AlignmentType.CENTER : paragraphAlign(node, rtl),
        pageBreakBefore: breakBefore || undefined,
        numbering: style.headingNumbering !== 'none' && !unnumbered && !b.unnumberedScope(level, unnumbered)
          ? { reference: 'headings', level: level - 1 }
          : undefined,
        children: runs(node.content, b),
      })];
    }
    case 'bulletList':
    case 'orderedList': {
      const ordered = node.type === 'orderedList';
      const level = opts.listRef ? (opts.listLevel ?? 0) + 1 : 0;
      let listRef = opts.listRef;
      if (!listRef || (ordered && listRef.reference !== 'ordered') || (!ordered && listRef.reference !== 'bullets')) {
        if (ordered) b.orderedInstance += 1;
        listRef = ordered ? { reference: 'ordered', instance: b.orderedInstance } : { reference: 'bullets' };
      }
      return (node.content ?? []).flatMap((item) => (item.content ?? []).flatMap((child, childIndex) => (
        child.type === 'paragraph'
          ? blockNodes(child, b, { ...opts, listRef: childIndex === 0 ? listRef : undefined, listLevel: Math.min(level, 2) })
          : blockNodes(child, b, { ...opts, listRef, listLevel: Math.min(level, 2) })
      )));
    }
    case 'blockquote':
      return (node.content ?? []).flatMap((child) => blockNodes(child, b, { ...opts, quote: true }));
    case 'codeBlock':
      return plain(node.content).split('\n').map((line) => new Paragraph({ style: 'CodeBlock', bidirectional: false, children: [new TextRun({ text: line || ' ', font: 'Consolas' })] }));
    case 'horizontalRule':
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D6D6DC', space: 1 } }, children: [] })];
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
    case 'table':
      return [tableBlock(node, b)];
    case 'caption': {
      const figure = node.attrs?.kind === 'figure';
      const rtl = textDirOf(node, b) === 'rtl';
      return [new Paragraph({
        style: 'Caption',
        keepNext: !figure,
        bidirectional: rtl,
        alignment: figure ? AlignmentType.CENTER : AlignmentType.START,
        children: [
          new TextRun({ text: `${figure ? b.labels.figure : b.labels.table} `, bold: true, ...(rtl ? { rightToLeft: true, boldComplexScript: true } : {}) }),
          new SequentialIdentifier(figure ? 'Figure' : 'Table'),
          new TextRun({ text: '. ', bold: true }),
          ...runs(node.content, b),
        ],
      })];
    }
    case 'figure': {
      const src = String(node.attrs?.src ?? '');
      const image = src ? b.images[src] : undefined;
      const caption = String(node.attrs?.caption ?? '');
      const out: Paragraph[] = [];
      if (image) {
        const share = Math.min(100, Math.max(20, Number(node.attrs?.width ?? 80))) / 100;
        const width = Math.round(b.bodyWidthPx * share);
        const height = Math.round(width * (image.height / Math.max(1, image.width)));
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          keepNext: true,
          children: [new ImageRun({ type: image.type, data: image.data, transformation: { width, height }, altText: { name: caption || 'Figure', description: String(node.attrs?.alt ?? caption), title: caption } })],
        }));
      } else {
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          keepNext: true,
          border: { top: { style: BorderStyle.DASHED, size: 4, color: 'B4B4BE', space: 8 }, bottom: { style: BorderStyle.DASHED, size: 4, color: 'B4B4BE', space: 8 } },
          children: [new TextRun({ text: `[${b.labels.figure}: ${caption || '...'}]`, italics: !b.base || b.base === 'ltr', color: '6B6B78' })],
        }));
      }
      if (caption) {
        out.push(new Paragraph({
          style: 'Caption',
          alignment: AlignmentType.CENTER,
          bidirectional: (firstStrong(caption) === null ? b.base : paragraphDirection(caption)) === 'rtl',
          children: [new TextRun({ text: `${b.labels.figure} `, bold: true }), new SequentialIdentifier('Figure'), new TextRun({ text: `. ${caption}` })],
        }));
      }
      const credit = image ? String(node.attrs?.credit ?? '') : '';
      if (credit) {
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: credit, size: 16, color: '6B6B78' })],
        }));
      }
      return out;
    }
    case 'bibliography': {
      const order = b.citationOrder;
      const all = [...b.refsByKey.values()];
      const cited = all.filter((ref) => order.includes(ref.id));
      return orderReferences(cited.length > 0 ? cited : all, style.citationStyle, order).map((ref, index) => {
        const text = formatReference(ref, style.citationStyle, b.numbers.get(ref.id) ?? index + 1);
        const entryRtl = (firstStrong(text) === null ? b.base : paragraphDirection(text)) === 'rtl';
        return new Paragraph({
          style: 'Bibliography',
          bidirectional: entryRtl,
          children: text.split(/(\*[^*]+\*)/g).filter(Boolean).map((part) => (part.startsWith('*') && part.endsWith('*') ? new TextRun({ text: part.slice(1, -1), italics: true }) : new TextRun(part))),
        });
      });
    }
    case 'tableOfContents':
      return [
        new Paragraph({ heading: HeadingLevel.TITLE, bidirectional: b.base === 'rtl', children: [new TextRun({ text: b.labels.contents, ...(b.base === 'rtl' ? { rightToLeft: true } : {}) })] }),
        new TableOfContents(b.labels.contents, { hyperlink: true, headingStyleRange: '1-3' }),
      ];
    case 'coverPage':
      return [];
    default:
      return node.content ? node.content.flatMap((child) => blockNodes(child, b, opts)) : [];
  }
}

function coverParagraphs(brief: ReportBrief, labels: DocLabels, rtl: boolean): Paragraph[] {
  const { details, style } = brief;
  const type = getReportType(brief.typeId);
  const field = (key: string): string => details.fields[key]?.trim() ?? '';
  const top = ['institution', 'department', 'course'].map(field).filter(Boolean);
  if (top.length === 0 && details.organization) top.push(details.organization);
  const left = style.cover === 'corporate' || style.cover === 'modern' || style.cover === 'minimal';
  const align = left ? AlignmentType.START : AlignmentType.CENTER;
  const authors = field('team') || details.authors;
  const out: Paragraph[] = [];
  /** A cover line reads in its own direction. */
  const bidi = (text: string): boolean => (firstStrong(text) === null ? rtl : paragraphDirection(text) === 'rtl');
  const spaced = (text: string): { characterSpacing?: number } => (hasRtl(text) || rtl ? {} : { characterSpacing: 60 });
  // A run of right-to-left letters carries the complex-script properties Word draws it with.
  const run = (text: string, options: { bold?: boolean; italics?: boolean; size: number; color?: string; font?: string; characterSpacing?: number }): TextRun => new TextRun({
    text,
    ...options,
    ...(hasRtl(text) ? { rightToLeft: true, boldComplexScript: options.bold, italicsComplexScript: options.italics, sizeComplexScript: options.size, font: { ascii: options.font ?? style.bodyFont, hAnsi: options.font ?? style.bodyFont, cs: complexScriptFace(options.font ?? style.bodyFont) } } : {}),
  });
  top.forEach((line, index) => out.push(new Paragraph({ alignment: align, bidirectional: bidi(line), spacing: { after: 60 }, children: [run(line, { bold: index === 0, size: halfPoints(index === 0 ? 15 : 13) })] })));
  const kind = rtl ? type.name : type.name.toUpperCase();
  out.push(new Paragraph({ spacing: { before: 2400 }, alignment: align, bidirectional: bidi(kind), children: [run(kind, { size: halfPoints(9), color: hex(style.accentColor), bold: true, ...spaced(kind) })] }));
  const title = details.title || type.name;
  out.push(new Paragraph({ alignment: align, bidirectional: bidi(title), spacing: { before: 200, after: 200 }, children: [run(title, { bold: style.cover !== 'classic', size: halfPoints(style.cover === 'minimal' ? 34 : 28), color: hex(style.headingColor), font: style.headingFont })] }));
  if (details.subtitle) out.push(new Paragraph({ alignment: align, bidirectional: bidi(details.subtitle), children: [run(details.subtitle, { italics: !rtl, size: halfPoints(14), color: '4A4A54' })] }));
  const prepared = rtl ? labels.preparedBy : labels.preparedBy.toUpperCase();
  out.push(new Paragraph({ alignment: align, bidirectional: rtl, spacing: { before: 2600 }, children: [run(prepared, { size: halfPoints(8), color: '8A8A96', bold: true, ...spaced(prepared) })] }));
  for (const line of authors.split('\n').filter(Boolean)) out.push(new Paragraph({ alignment: align, bidirectional: bidi(line), children: [run(line, { size: halfPoints(13) })] }));
  for (const key of ['supervisor', 'term', 'company', 'client', 'period', 'reportNumber', 'version']) {
    const value = field(key);
    const label = type.fields.find((entry) => entry.key === key)?.label.replace(/\s*\(.*\)$/, '');
    if (value && label) out.push(new Paragraph({ alignment: align, bidirectional: bidi(`${label} ${value}`), children: [run(`${label}: `, { size: halfPoints(style.bodySize), color: '6B6B78' }), run(value, { size: halfPoints(style.bodySize) })] }));
  }
  if (details.date) out.push(new Paragraph({ alignment: align, bidirectional: bidi(details.date), spacing: { before: 200 }, children: [run(details.date, { size: halfPoints(style.bodySize), color: '4A4A54' })] }));
  return out;
}

function headerFooter(brief: ReportBrief, rtl: boolean): Pick<ISectionOptions, 'headers' | 'footers'> {
  const { style } = brief;
  // A mirrored page puts the number where a left-to-right one has the running text, and the other way round.
  const numberSide = rtl ? AlignmentType.LEFT : AlignmentType.RIGHT;
  const small = halfPoints(8.5);
  const pageRun = new TextRun({ children: [PageNumber.CURRENT], size: halfPoints(9), color: '4A4A54' });
  const headerChildren: ParagraphChild[] = [];
  if (style.headerText) headerChildren.push(new TextRun({ text: style.headerText.replace('{title}', brief.details.title), size: small, color: '6B6B78', ...(rtl ? { rightToLeft: true } : {}) }));
  const header = new Header({
    children: [
      new Paragraph({ bidirectional: rtl, alignment: rtl ? AlignmentType.START : undefined, children: headerChildren }),
      ...(style.pageNumbers === 'top-right' ? [new Paragraph({ alignment: numberSide, children: [pageRun] })] : []),
    ],
  });
  const footerParagraphs: Paragraph[] = [];
  if (style.footerText) footerParagraphs.push(new Paragraph({ bidirectional: rtl, alignment: rtl ? AlignmentType.START : undefined, children: [new TextRun({ text: style.footerText.replace('{title}', brief.details.title), size: small, color: '6B6B78', ...(rtl ? { rightToLeft: true } : {}) })] }));
  if (style.pageNumbers === 'bottom-center' || style.pageNumbers === 'bottom-right') {
    footerParagraphs.push(new Paragraph({ alignment: style.pageNumbers === 'bottom-center' ? AlignmentType.CENTER : numberSide, children: [pageRun] }));
  }
  return { headers: { default: header }, footers: { default: new Footer({ children: footerParagraphs }) } };
}

/** Builds the Word document. */
export function buildDocx({ brief, bibliography, content, images = {} }: DocxInput): Document {
  const { style } = brief;
  const { width, height } = pageDimensions(style.pageSize, style.orientation);
  const [h1, h2, h3, h4] = headingSizes(style);
  const refsByKey = new Map(bibliography.map((ref) => [ref.key, ref]));
  const citationOrder: string[] = [];
  const visit = (node: DocNode): void => {
    if (node.type === 'citation') {
      for (const key of (node.attrs?.keys as string[] | undefined) ?? []) {
        const ref = refsByKey.get(key);
        if (ref && !citationOrder.includes(ref.id)) citationOrder.push(ref.id);
      }
    }
    node.content?.forEach(visit);
  };
  visit(content);

  let inUnnumbered = false;
  const rtlDoc = isRtlLanguage(brief.details.language);
  const labels = docLabels(brief.details.language);
  const builder: Builder = {
    base: rtlDoc ? 'rtl' : 'ltr',
    labels,
    brief,
    refsByKey,
    numbers: new Map(citationOrder.map((id, index) => [id, index + 1])),
    images,
    footnotes: {},
    nextFootnote: 1,
    orderedInstance: 0,
    bodyWidthPx: Math.round(((width - style.margins.left - style.margins.right) / 25.4) * 96),
    firstSectionInMain: true,
    citationOrder,
    unnumberedScope: (level: number, unnumbered: boolean): boolean => {
      if (level === 1) inUnnumbered = unnumbered;
      return inUnnumbered;
    },
  };

  const nodes = (content.content ?? []).filter((node) => node.type !== 'coverPage');
  const firstMain = nodes.findIndex((node) => node.type === 'heading' && node.attrs?.sectionId && !node.attrs?.unnumbered);
  const frontNodes = firstMain < 0 ? [] : nodes.slice(0, firstMain);
  const mainNodes = firstMain < 0 ? nodes : nodes.slice(firstMain);
  if (style.includeToc && !nodes.some((node) => node.type === 'tableOfContents')) frontNodes.push({ type: 'tableOfContents' });

  const page = {
    size: { width: mmToTwip(width), height: mmToTwip(height), orientation: style.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
    margin: {
      top: mmToTwip(style.margins.top),
      right: mmToTwip(style.margins.right),
      bottom: mmToTwip(style.margins.bottom),
      left: mmToTwip(style.margins.left),
      header: mmToTwip(Math.max(8, style.margins.top * 0.45)),
      footer: mmToTwip(Math.max(8, style.margins.bottom * 0.45)),
    },
  };

  const sections: ISectionOptions[] = [];
  if (style.cover !== 'none') {
    sections.push({ properties: { page, titlePage: true }, children: coverParagraphs(brief, labels, rtlDoc) });
  }
  const frontChildren = frontNodes.flatMap((node, index) => {
    const out = blockNodes(node, builder);
    // Each front-matter part starts on its own page.
    if (index > 0 && (node.type === 'tableOfContents' || (node.type === 'heading' && node.attrs?.sectionId))) {
      return [new Paragraph({ children: [new PageBreak()] }), ...out];
    }
    return out;
  });
  if (frontChildren.length > 0) {
    sections.push({
      properties: { page: { ...page, pageNumbers: { start: 1, formatType: style.romanFrontMatter ? NumberFormat.LOWER_ROMAN : NumberFormat.DECIMAL } } },
      ...headerFooter(brief, rtlDoc),
      children: frontChildren,
    });
  }
  builder.firstSectionInMain = true;
  sections.push({
    properties: { page: { ...page, pageNumbers: { start: style.romanFrontMatter || frontChildren.length === 0 ? 1 : undefined, formatType: NumberFormat.DECIMAL } } },
    ...headerFooter(brief, rtlDoc),
    children: mainNodes.flatMap((node) => blockNodes(node, builder)),
  });

  const lineSpacing = { line: Math.round(240 * (rtlDoc ? Math.max(style.lineHeight, 1.25) : style.lineHeight)), lineRule: LineRuleType.AUTO };
  /** A face for Latin text with the complex-script face Word uses for Arabic and Hebrew letters beside it. */
  const complexFont = (face: string) => ({ ascii: face, hAnsi: face, eastAsia: face, cs: complexScriptFace(face) });
  const alignStart = AlignmentType.START;
  const headingStyle = (level: number, size: number) => ({
    id: `Heading${level}`,
    name: `Heading ${level}`,
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: {
      font: complexFont(style.headingFont),
      size: halfPoints(size),
      sizeComplexScript: halfPoints(size),
      bold: true,
      boldComplexScript: true,
      italics: (level === 4 && !rtlDoc) || undefined,
      color: hex(style.headingColor),
    },
    paragraph: {
      spacing: { before: twipPt(level === 1 ? 6 : 12), after: twipPt(level === 1 ? 10 : 5), line: 276, lineRule: LineRuleType.AUTO },
      keepNext: true,
      keepLines: true,
      outlineLevel: level - 1,
      alignment: AlignmentType.START,
      indent: { firstLine: 0 },
    },
  });

  return new Document({
    creator: brief.details.authors || 'YzPzCode',
    title: brief.details.title,
    description: getReportType(brief.typeId).name,
    pageNumbers: estimatePageNumbersWith({ guess: true }),
    footnotes: builder.footnotes,
    styles: {
      default: {
        document: {
          run: {
            font: complexFont(style.bodyFont),
            size: halfPoints(style.bodySize),
            sizeComplexScript: halfPoints(style.bodySize),
            color: '16161A',
            // Proofing: the report's language, for Latin and for right-to-left text.
            language: rtlDoc ? { value: 'en-US', bidirectional: languageTag(brief.details.language) } : { value: languageTag(brief.details.language) },
          },
          paragraph: { spacing: { after: twipPt(style.paragraphSpacing), ...lineSpacing } },
        },
      },
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          quickFormat: true,
          run: { font: complexFont(style.bodyFont), size: halfPoints(style.bodySize), sizeComplexScript: halfPoints(style.bodySize) },
          paragraph: {
            alignment: style.alignment === 'justify' ? AlignmentType.JUSTIFIED : alignStart,
            spacing: { after: twipPt(style.paragraphSpacing), ...lineSpacing },
            indent: style.firstLineIndent ? { firstLine: mmToTwip(12.7) } : undefined,
          },
        },
        headingStyle(1, h1),
        headingStyle(2, h2),
        headingStyle(3, h3),
        headingStyle(4, h4),
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: complexFont(style.headingFont), size: halfPoints(h1), sizeComplexScript: halfPoints(h1), bold: true, boldComplexScript: true, color: hex(style.headingColor) }, paragraph: { spacing: { after: twipPt(14) }, indent: { firstLine: 0 } } },
        { id: 'Caption', name: 'Caption', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: halfPoints(Math.max(8, style.bodySize - 1.5)), sizeComplexScript: halfPoints(Math.max(8, style.bodySize - 1.5)), color: '34343C' }, paragraph: { spacing: { before: twipPt(8), after: twipPt(4) }, indent: { firstLine: 0 } } },
        { id: 'Quote', name: 'Quote', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { italics: !rtlDoc, italicsComplexScript: false, color: '3D3D46' }, paragraph: { indent: { left: mmToTwip(10), firstLine: 0 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: hex(style.accentColor), space: 8 } } } },
        { id: 'TableText', name: 'Table Text', basedOn: 'Normal', run: { size: halfPoints(Math.max(8, style.bodySize - 1)), sizeComplexScript: halfPoints(Math.max(8, style.bodySize - 1)) }, paragraph: { alignment: alignStart, spacing: { before: 0, after: 0, line: 252, lineRule: LineRuleType.AUTO }, indent: { firstLine: 0 } } },
        { id: 'CodeBlock', name: 'Code Block', basedOn: 'Normal', run: { font: 'Consolas', size: halfPoints(Math.max(8, style.bodySize - 2)) }, paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO }, indent: { firstLine: 0 }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F5F8' } } },
        { id: 'Bibliography', name: 'Bibliography', basedOn: 'Normal', run: {}, paragraph: { alignment: alignStart, indent: { left: mmToTwip(10), hanging: mmToTwip(10) }, spacing: { after: twipPt(6) } } },
        { id: 'FootnoteText', name: 'footnote text', basedOn: 'Normal', run: { size: halfPoints(Math.max(7.5, style.bodySize - 2.5)), sizeComplexScript: halfPoints(Math.max(7.5, style.bodySize - 2.5)) }, paragraph: { alignment: alignStart, spacing: { after: 0, line: 240, lineRule: LineRuleType.AUTO }, indent: { firstLine: 0 } } },
      ],
      characterStyles: [
        { id: 'Hyperlink', name: 'Hyperlink', run: { color: hex(style.accentColor), underline: {} } },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'headings',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: style.headingNumbering === 'chapter' ? `${labels.chapter} %1` : '%1', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 0, hanging: 0 } }, run: { color: hex(style.accentColor) } }, suffix: style.headingNumbering === 'chapter' ? LevelSuffix.SPACE : LevelSuffix.TAB },
            { level: 1, format: LevelFormat.DECIMAL, text: '%1.%2', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
            { level: 2, format: LevelFormat.DECIMAL, text: '%1.%2.%3', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
            { level: 3, format: LevelFormat.DECIMAL, text: '%1.%2.%3.%4', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
          ],
        },
        {
          reference: 'bullets',
          levels: [0, 1, 2].map((level) => ({ level, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][level], alignment: AlignmentType.START, style: { paragraph: { indent: { left: mmToTwip(7 + level * 7), hanging: mmToTwip(5) } } } })),
        },
        {
          reference: 'ordered',
          levels: [0, 1, 2].map((level) => ({ level, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level], text: `%${level + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: mmToTwip(7 + level * 7), hanging: mmToTwip(6) } } } })),
        },
      ],
    },
    sections,
  });
}

export async function docxBase64(input: DocxInput): Promise<string> {
  return Packer.toBase64String(buildDocx(input));
}
