// Page geometry, document fonts and the template themes a report starts from.
// Dependency-free (tested by `npm run test:writing`).

import type { CitationStyle, CoverStyle, HeadingNumbering, Orientation, PageSizeId, ReportStyle } from './types';

export interface PageSizeDef {
  id: PageSizeId;
  label: string;
  /** Millimetres, portrait. */
  width: number;
  height: number;
}

export const PAGE_SIZES: Record<PageSizeId, PageSizeDef> = {
  a4: { id: 'a4', label: 'A4', width: 210, height: 297 },
  letter: { id: 'letter', label: 'Letter', width: 215.9, height: 279.4 },
  legal: { id: 'legal', label: 'Legal', width: 215.9, height: 355.6 },
  a5: { id: 'a5', label: 'A5', width: 148, height: 210 },
};

/** CSS pixels per millimetre at 96 dpi. */
export const PX_PER_MM = 96 / 25.4;

export const mmToPx = (mm: number): number => Math.round(mm * PX_PER_MM);
/** Twentieths of a point, the unit Word uses for page geometry. */
export const mmToTwip = (mm: number): number => Math.round((mm / 25.4) * 1440);
export const ptToPx = (pt: number): number => (pt * 96) / 72;

export function pageDimensions(size: PageSizeId, orientation: Orientation): { width: number; height: number } {
  const page = PAGE_SIZES[size] ?? PAGE_SIZES.a4;
  return orientation === 'landscape'
    ? { width: page.height, height: page.width }
    : { width: page.width, height: page.height };
}

export interface FontDef {
  family: string;
  kind: 'serif' | 'sans' | 'mono';
  /** CSS fallback stack after the family itself. */
  fallback: string;
}

// Fonts that ship with Windows and Office (and have close macOS fallbacks), so
// the .docx opens with the same faces and the PDF needs nothing embedded.
export const DOCUMENT_FONTS: FontDef[] = [
  { family: 'Times New Roman', kind: 'serif', fallback: '"Tinos", "Liberation Serif", serif' },
  { family: 'Georgia', kind: 'serif', fallback: '"Gelasio", serif' },
  { family: 'Cambria', kind: 'serif', fallback: '"Caladea", Georgia, serif' },
  { family: 'Garamond', kind: 'serif', fallback: '"EB Garamond", "Adobe Garamond Pro", Georgia, serif' },
  { family: 'Palatino Linotype', kind: 'serif', fallback: '"Palatino", "Book Antiqua", Georgia, serif' },
  { family: 'Book Antiqua', kind: 'serif', fallback: '"Palatino Linotype", Palatino, Georgia, serif' },
  { family: 'Constantia', kind: 'serif', fallback: 'Georgia, serif' },
  { family: 'Calibri', kind: 'sans', fallback: '"Carlito", "Segoe UI", sans-serif' },
  { family: 'Aptos', kind: 'sans', fallback: '"Segoe UI", Calibri, sans-serif' },
  { family: 'Segoe UI', kind: 'sans', fallback: '"Helvetica Neue", sans-serif' },
  { family: 'Arial', kind: 'sans', fallback: '"Liberation Sans", Helvetica, sans-serif' },
  { family: 'Verdana', kind: 'sans', fallback: 'Tahoma, sans-serif' },
  { family: 'Franklin Gothic Book', kind: 'sans', fallback: '"Libre Franklin", "Segoe UI", sans-serif' },
  { family: 'Century Gothic', kind: 'sans', fallback: '"Futura", "Segoe UI", sans-serif' },
  { family: 'Consolas', kind: 'mono', fallback: '"Cascadia Mono", Menlo, monospace' },
];

export function fontStack(family: string): string {
  const font = DOCUMENT_FONTS.find((entry) => entry.family === family);
  const quoted = /[\s"]/.test(family) ? `"${family.replace(/"/g, '')}"` : family;
  return font ? `${quoted}, ${font.fallback}` : `${quoted}, serif`;
}

export interface StyleTheme {
  id: string;
  name: string;
  tagline: string;
  bodyFont: string;
  headingFont: string;
  bodySize: number;
  headingSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  alignment: ReportStyle['alignment'];
  firstLineIndent: boolean;
  headingColor: string;
  accentColor: string;
  cover: CoverStyle;
  headingNumbering: HeadingNumbering;
}

export const STYLE_THEMES: StyleTheme[] = [
  {
    id: 'classic-academic',
    name: 'Classic Academic',
    tagline: 'Times, double-spaced rhythm, numbered chapters',
    bodyFont: 'Times New Roman',
    headingFont: 'Times New Roman',
    bodySize: 12,
    headingSize: 16,
    lineHeight: 1.5,
    paragraphSpacing: 6,
    alignment: 'justify',
    firstLineIndent: true,
    headingColor: '#111111',
    accentColor: '#1f3a5f',
    cover: 'academic',
    headingNumbering: 'decimal',
  },
  {
    id: 'modern-corporate',
    name: 'Modern Corporate',
    tagline: 'Clean sans, confident headings, brand accent',
    bodyFont: 'Aptos',
    headingFont: 'Aptos',
    bodySize: 11,
    headingSize: 20,
    lineHeight: 1.4,
    paragraphSpacing: 8,
    alignment: 'left',
    firstLineIndent: false,
    headingColor: '#0f2a4a',
    accentColor: '#2563eb',
    cover: 'corporate',
    headingNumbering: 'decimal',
  },
  {
    id: 'swiss-minimal',
    name: 'Swiss Minimal',
    tagline: 'Grotesk precision with generous white space',
    bodyFont: 'Segoe UI',
    headingFont: 'Segoe UI',
    bodySize: 10.5,
    headingSize: 22,
    lineHeight: 1.45,
    paragraphSpacing: 9,
    alignment: 'left',
    firstLineIndent: false,
    headingColor: '#111111',
    accentColor: '#e11d48',
    cover: 'minimal',
    headingNumbering: 'none',
  },
  {
    id: 'financial-ledger',
    name: 'Financial Ledger',
    tagline: 'Cambria and Calibri, sober navy, tight tables',
    bodyFont: 'Calibri',
    headingFont: 'Cambria',
    bodySize: 11,
    headingSize: 18,
    lineHeight: 1.3,
    paragraphSpacing: 6,
    alignment: 'justify',
    firstLineIndent: false,
    headingColor: '#0b2545',
    accentColor: '#13315c',
    cover: 'corporate',
    headingNumbering: 'decimal',
  },
  {
    id: 'technical',
    name: 'Technical',
    tagline: 'Readable sans, numbered everything, crisp code',
    bodyFont: 'Calibri',
    headingFont: 'Franklin Gothic Book',
    bodySize: 11,
    headingSize: 17,
    lineHeight: 1.35,
    paragraphSpacing: 6,
    alignment: 'left',
    firstLineIndent: false,
    headingColor: '#1e293b',
    accentColor: '#0f766e',
    cover: 'modern',
    headingNumbering: 'decimal',
  },
  {
    id: 'elegant-serif',
    name: 'Elegant Serif',
    tagline: 'Garamond warmth with a refined ink accent',
    bodyFont: 'Garamond',
    headingFont: 'Palatino Linotype',
    bodySize: 12.5,
    headingSize: 20,
    lineHeight: 1.5,
    paragraphSpacing: 6,
    alignment: 'justify',
    firstLineIndent: true,
    headingColor: '#3b2416',
    accentColor: '#9a6b2f',
    cover: 'classic',
    headingNumbering: 'none',
  },
];

export const DEFAULT_THEME_ID = 'classic-academic';

export function getTheme(id: string): StyleTheme {
  return STYLE_THEMES.find((theme) => theme.id === id) ?? STYLE_THEMES[0];
}

export function styleFromTheme(themeId: string, overrides: Partial<ReportStyle> = {}): ReportStyle {
  const theme = getTheme(themeId);
  return {
    themeId: theme.id,
    bodyFont: theme.bodyFont,
    headingFont: theme.headingFont,
    bodySize: theme.bodySize,
    headingSize: theme.headingSize,
    lineHeight: theme.lineHeight,
    paragraphSpacing: theme.paragraphSpacing,
    alignment: theme.alignment,
    firstLineIndent: theme.firstLineIndent,
    headingColor: theme.headingColor,
    accentColor: theme.accentColor,
    pageSize: 'a4',
    orientation: 'portrait',
    margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    headingNumbering: theme.headingNumbering,
    sectionBreaks: true,
    cover: theme.cover,
    includeToc: true,
    includeListOfFigures: false,
    includeListOfTables: false,
    headerText: '',
    footerText: '',
    pageNumbers: 'bottom-center',
    romanFrontMatter: true,
    citationStyle: 'apa' as CitationStyle,
    ...overrides,
  };
}

/** Keeps the theme's look while preserving page and structure choices the user made. */
export function applyTheme(style: ReportStyle, themeId: string): ReportStyle {
  const theme = getTheme(themeId);
  return {
    ...style,
    themeId: theme.id,
    bodyFont: theme.bodyFont,
    headingFont: theme.headingFont,
    bodySize: theme.bodySize,
    headingSize: theme.headingSize,
    lineHeight: theme.lineHeight,
    paragraphSpacing: theme.paragraphSpacing,
    alignment: theme.alignment,
    firstLineIndent: theme.firstLineIndent,
    headingColor: theme.headingColor,
    accentColor: theme.accentColor,
    cover: theme.cover,
    headingNumbering: theme.headingNumbering,
  };
}

/** Heading sizes in points for levels 1–4, scaled from the level-1 size. */
export function headingSizes(style: Pick<ReportStyle, 'headingSize' | 'bodySize'>): [number, number, number, number] {
  const h1 = style.headingSize;
  const body = style.bodySize;
  const step = (h1 - body) / 3;
  return [h1, Math.round((h1 - step) * 2) / 2, Math.round((h1 - step * 2) * 2) / 2, Math.max(body, Math.round((h1 - step * 2.6) * 2) / 2)];
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Repairs a style loaded from disk or a profile import. */
export function sanitizeStyle(value: unknown): ReportStyle {
  const base = styleFromTheme(DEFAULT_THEME_ID);
  if (!value || typeof value !== 'object') return base;
  const raw = value as Partial<ReportStyle>;
  const merged: ReportStyle = { ...base, ...raw, margins: { ...base.margins, ...(raw.margins ?? {}) } };
  merged.bodySize = clamp(Number(merged.bodySize) || base.bodySize, 7, 24);
  merged.headingSize = clamp(Number(merged.headingSize) || base.headingSize, 9, 48);
  merged.lineHeight = clamp(Number(merged.lineHeight) || base.lineHeight, 1, 3);
  merged.paragraphSpacing = clamp(Number(merged.paragraphSpacing) || 0, 0, 36);
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    merged.margins[side] = clamp(Number(merged.margins[side]) || base.margins[side], 5, 60);
  }
  if (!(merged.pageSize in PAGE_SIZES)) merged.pageSize = 'a4';
  if (merged.orientation !== 'landscape') merged.orientation = 'portrait';
  return merged;
}
