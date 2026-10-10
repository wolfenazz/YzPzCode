// Restyling a report with AI: the prompt, and a strict parser that turns the
// reply into a valid `ReportStyle` (known fonts, known options, clamped sizes,
// colours readable on white paper). Dependency-free (tested by `npm run test:writing`).

import { CITATION_STYLES } from './citations';
import { DOCUMENT_FONTS, PAGE_SIZES, sanitizeStyle } from './stylePresets';
import { extractJson, type AiPrompt } from './prompts';
import type { CitationStyle, CoverStyle, HeadingNumbering, PageNumberPosition, ReportStyle } from './types';

const COVERS: CoverStyle[] = ['none', 'classic', 'academic', 'corporate', 'modern', 'minimal'];
const NUMBERING: HeadingNumbering[] = ['none', 'decimal', 'chapter'];
const PAGE_NUMBERS: PageNumberPosition[] = ['none', 'bottom-center', 'bottom-right', 'top-right'];

export const RESTYLE_SUGGESTIONS = [
  'Corporate and clean: sans serif, navy headings, generous spacing',
  'Classic academic: Times New Roman, 12 pt, 1.5 spacing, numbered chapters',
  'Editorial: Garamond body, refined headings, warm dark accent',
  'Swiss minimal: Segoe UI, no numbering, black and one red accent',
];

const STYLE_SYSTEM_PROMPT = [
  'You are a senior document designer who sets professional reports for print.',
  'You choose type, spacing, colour and page furniture with restraint: high contrast, a clear hierarchy, at most one accent colour.',
  'You answer with a single JSON object and nothing else.',
].join('\n');

/** The style fields the AI may change, as it sees them. */
function describeStyle(style: ReportStyle): Record<string, unknown> {
  return {
    bodyFont: style.bodyFont,
    headingFont: style.headingFont,
    bodySize: style.bodySize,
    headingSize: style.headingSize,
    lineHeight: style.lineHeight,
    paragraphSpacing: style.paragraphSpacing,
    alignment: style.alignment,
    firstLineIndent: style.firstLineIndent,
    headingColor: style.headingColor,
    accentColor: style.accentColor,
    headingNumbering: style.headingNumbering,
    cover: style.cover,
    includeToc: style.includeToc,
    sectionBreaks: style.sectionBreaks,
    pageSize: style.pageSize,
    orientation: style.orientation,
    margins: Math.round(style.margins.left * 10) / 10,
    pageNumbers: style.pageNumbers,
    headerText: style.headerText,
    footerText: style.footerText,
    citationStyle: style.citationStyle,
  };
}

export function buildRestylePrompt(style: ReportStyle, instruction: string, context: { typeName: string; title: string }): AiPrompt {
  const prompt = [
    `Restyle a ${context.typeName}${context.title ? ` titled "${context.title}"` : ''}.`,
    '',
    `The author asks: ${instruction.trim()}`,
    '',
    'The current style:',
    JSON.stringify(describeStyle(style)),
    '',
    'What each field accepts:',
    `- bodyFont, headingFont: one of ${DOCUMENT_FONTS.map((font) => font.family).join(', ')}`,
    '- bodySize: 9 to 14 (points); headingSize: 12 to 32 (points, the level-1 heading)',
    '- lineHeight: 1 to 2.2; paragraphSpacing: 0 to 18 (points after each paragraph)',
    '- alignment: "left" or "justify"; firstLineIndent: true or false',
    '- headingColor, accentColor: #rrggbb, dark enough to read on white paper',
    `- headingNumbering: ${NUMBERING.map((value) => `"${value}"`).join(', ')}`,
    `- cover: ${COVERS.map((value) => `"${value}"`).join(', ')}`,
    '- includeToc, sectionBreaks (start each chapter on a new page): true or false',
    `- pageSize: ${Object.keys(PAGE_SIZES).map((value) => `"${value}"`).join(', ')}; orientation: "portrait" or "landscape"`,
    '- margins: 12 to 40 (millimetres, all sides)',
    `- pageNumbers: ${PAGE_NUMBERS.map((value) => `"${value}"`).join(', ')}`,
    '- headerText, footerText: short running text; {title} stands for the report title',
    `- citationStyle: ${CITATION_STYLES.map((entry) => `"${entry.id}"`).join(', ')} (change only if asked)`,
    '',
    'Return ONLY a JSON object holding the fields you change, plus "summary": one short sentence describing the new look.',
    'Change only what serves the request; keep everything else as it is.',
  ].join('\n');
  return { system: STYLE_SYSTEM_PROMPT, prompt };
}

// Parsing ---------------------------------------------------------------------

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = HEX.exec(value.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].split('').map((char) => char + char).join('') : match[1];
  return `#${digits.toLowerCase()}`;
}

/** WCAG contrast of a colour against white paper. */
export function contrastOnWhite(hex: string): number {
  const value = normalizeHex(hex);
  if (!value) return 1;
  const channel = (offset: number): number => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (luminance + 0.05);
}

const toNumber = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
};
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const toBool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : null);
const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | null => (typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : null);

function font(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const wanted = value.trim().toLowerCase();
  return DOCUMENT_FONTS.find((entry) => entry.family.toLowerCase() === wanted)?.family ?? null;
}

const LABELS: Partial<Record<keyof ReportStyle, string>> = {
  bodyFont: 'Body font',
  headingFont: 'Heading font',
  bodySize: 'Body size',
  headingSize: 'Heading size',
  lineHeight: 'Line spacing',
  paragraphSpacing: 'Paragraph spacing',
  alignment: 'Alignment',
  firstLineIndent: 'First-line indent',
  headingColor: 'Heading colour',
  accentColor: 'Accent colour',
  headingNumbering: 'Heading numbers',
  cover: 'Cover',
  includeToc: 'Contents page',
  sectionBreaks: 'Chapters on new pages',
  pageSize: 'Paper',
  orientation: 'Orientation',
  margins: 'Margins',
  pageNumbers: 'Page numbers',
  headerText: 'Header',
  footerText: 'Footer',
  citationStyle: 'Citation style',
};

export interface RestyleResult {
  style: ReportStyle;
  /** Human-readable names of the fields that changed. */
  changes: string[];
  summary: string;
}

/** Applies the AI's reply to `current`. Returns null when the reply holds no usable change. */
export function parseRestyle(text: string, current: ReportStyle): RestyleResult | null {
  const raw = extractJson(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const reply = raw as Record<string, unknown>;
  const next: ReportStyle = { ...current, margins: { ...current.margins } };

  const bodyFont = font(reply.bodyFont);
  if (bodyFont) next.bodyFont = bodyFont;
  const headingFont = font(reply.headingFont);
  if (headingFont) next.headingFont = headingFont;

  const bodySize = toNumber(reply.bodySize);
  if (bodySize !== null) next.bodySize = Math.round(clamp(bodySize, 9, 14) * 2) / 2;
  const headingSize = toNumber(reply.headingSize);
  if (headingSize !== null) next.headingSize = Math.round(clamp(headingSize, 12, 32) * 2) / 2;
  if (next.headingSize <= next.bodySize) next.headingSize = next.bodySize + 4;
  const lineHeight = toNumber(reply.lineHeight);
  if (lineHeight !== null) next.lineHeight = Math.round(clamp(lineHeight, 1, 2.2) * 100) / 100;
  const paragraphSpacing = toNumber(reply.paragraphSpacing);
  if (paragraphSpacing !== null) next.paragraphSpacing = Math.round(clamp(paragraphSpacing, 0, 18));

  const alignment = pick(reply.alignment, ['left', 'justify'] as const);
  if (alignment) next.alignment = alignment;
  const indent = toBool(reply.firstLineIndent);
  if (indent !== null) next.firstLineIndent = indent;

  // Colours must stay readable on white paper; an unreadable one is ignored.
  const headingColor = normalizeHex(reply.headingColor);
  if (headingColor && contrastOnWhite(headingColor) >= 4.5) next.headingColor = headingColor;
  const accentColor = normalizeHex(reply.accentColor);
  if (accentColor && contrastOnWhite(accentColor) >= 3) next.accentColor = accentColor;

  const numbering = pick(reply.headingNumbering, NUMBERING);
  if (numbering) next.headingNumbering = numbering;
  const cover = pick(reply.cover, COVERS);
  if (cover) next.cover = cover;
  const toc = toBool(reply.includeToc);
  if (toc !== null) next.includeToc = toc;
  const breaks = toBool(reply.sectionBreaks);
  if (breaks !== null) next.sectionBreaks = breaks;

  const pageSize = pick(reply.pageSize, Object.keys(PAGE_SIZES) as Array<ReportStyle['pageSize']>);
  if (pageSize) next.pageSize = pageSize;
  const orientation = pick(reply.orientation, ['portrait', 'landscape'] as const);
  if (orientation) next.orientation = orientation;
  const margin = toNumber(reply.margins && typeof reply.margins === 'object' ? (reply.margins as { left?: unknown }).left : reply.margins);
  if (margin !== null) {
    const value = clamp(margin, 12, 40);
    next.margins = { top: value, right: value, bottom: value, left: value };
  }
  const pageNumbers = pick(reply.pageNumbers, PAGE_NUMBERS);
  if (pageNumbers) next.pageNumbers = pageNumbers;
  if (typeof reply.headerText === 'string') next.headerText = reply.headerText.trim().slice(0, 120);
  if (typeof reply.footerText === 'string') next.footerText = reply.footerText.trim().slice(0, 120);
  const citation = pick(reply.citationStyle, CITATION_STYLES.map((entry) => entry.id) as CitationStyle[]);
  if (citation) next.citationStyle = citation;

  const style = sanitizeStyle(next);
  // A restyle no longer matches a preset theme.
  const changes = (Object.keys(LABELS) as Array<keyof ReportStyle>)
    .filter((key) => JSON.stringify(style[key]) !== JSON.stringify(current[key]))
    .map((key) => LABELS[key]!);
  if (changes.length === 0) return null;
  style.themeId = 'custom';
  const summary = typeof reply.summary === 'string' ? reply.summary.trim().slice(0, 240) : '';
  return { style, changes, summary };
}
