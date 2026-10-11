// The words a report prints itself (chapter, table and figure labels, the
// contents heading, "prepared by"…) in the report's language. English and the
// right-to-left languages the studio supports; any other language prints the
// English labels. Characters are built from code points so the source stays
// plain ASCII. Dependency-free.

import { foldArabic, isRtlLanguage, languageTag } from './rtl';

export interface DocLabels {
  chapter: string;
  table: string;
  figure: string;
  contents: string;
  listOfFigures: string;
  listOfTables: string;
  preparedBy: string;
  references: string;
  abstract: string;
  figureCaption: string;
  figurePlaceholder: string;
  photo: string;
  page: string;
}

const word = (...codes: number[]): string => String.fromCodePoint(...codes);
const join = (...parts: string[]): string => parts.join(' ');

const ENGLISH: DocLabels = {
  chapter: 'Chapter',
  table: 'Table',
  figure: 'Figure',
  contents: 'Table of Contents',
  listOfFigures: 'List of Figures',
  listOfTables: 'List of Tables',
  preparedBy: 'Prepared by',
  references: 'References',
  abstract: 'Abstract',
  figureCaption: 'Figure caption',
  figurePlaceholder: 'Figure placeholder',
  photo: 'Photo',
  page: 'Page',
};

const ARABIC: DocLabels = {
  chapter: word(0x0627, 0x0644, 0x0641, 0x0635, 0x0644),
  table: word(0x062C, 0x062F, 0x0648, 0x0644),
  figure: word(0x0634, 0x0643, 0x0644),
  contents: word(0x0641, 0x0647, 0x0631, 0x0633) + ' ' + word(0x0627, 0x0644, 0x0645, 0x062D, 0x062A, 0x0648, 0x064A, 0x0627, 0x062A),
  listOfFigures: join(word(0x0642, 0x0627, 0x0626, 0x0645, 0x0629), word(0x0627, 0x0644, 0x0623, 0x0634, 0x0643, 0x0627, 0x0644)),
  listOfTables: join(word(0x0642, 0x0627, 0x0626, 0x0645, 0x0629), word(0x0627, 0x0644, 0x062C, 0x062F, 0x0627, 0x0648, 0x0644)),
  preparedBy: join(word(0x0625, 0x0639, 0x062F, 0x0627, 0x062F)),
  references: word(0x0627, 0x0644, 0x0645, 0x0631, 0x0627, 0x062C, 0x0639),
  abstract: word(0x0645, 0x0644, 0x062E, 0x0635),
  figureCaption: join(word(0x062A, 0x0639, 0x0644, 0x064A, 0x0642), word(0x0627, 0x0644, 0x0634, 0x0643, 0x0644)),
  figurePlaceholder: join(word(0x0645, 0x0643, 0x0627, 0x0646), word(0x0627, 0x0644, 0x0634, 0x0643, 0x0644)),
  photo: word(0x0635, 0x0648, 0x0631, 0x0629),
  page: word(0x0635, 0x0641, 0x062D, 0x0629),
};

const HEBREW: DocLabels = {
  chapter: word(0x05E4, 0x05E8, 0x05E7),
  table: word(0x05D8, 0x05D1, 0x05DC, 0x05D4),
  figure: word(0x05D0, 0x05D9, 0x05D5, 0x05E8),
  contents: join(word(0x05EA, 0x05D5, 0x05DB, 0x05DF), word(0x05E2, 0x05E0, 0x05D9, 0x05D9, 0x05E0, 0x05D9, 0x05DD)),
  listOfFigures: join(word(0x05E8, 0x05E9, 0x05D9, 0x05DE, 0x05EA), word(0x05D0, 0x05D9, 0x05D5, 0x05E8, 0x05D9, 0x05DD)),
  listOfTables: join(word(0x05E8, 0x05E9, 0x05D9, 0x05DE, 0x05EA), word(0x05D8, 0x05D1, 0x05DC, 0x05D0, 0x05D5, 0x05EA)),
  preparedBy: join(word(0x05E0, 0x05E2, 0x05E8, 0x05DA), word(0x05E2, 0x05DC, 0x05D9, 0x05D3, 0x05D9)),
  references: word(0x05DE, 0x05E7, 0x05D5, 0x05E8, 0x05D5, 0x05EA),
  abstract: word(0x05EA, 0x05E7, 0x05E6, 0x05D9, 0x05E8),
  figureCaption: join(word(0x05DB, 0x05D9, 0x05EA, 0x05D5, 0x05D1), word(0x05D4, 0x05D0, 0x05D9, 0x05D5, 0x05E8)),
  figurePlaceholder: join(word(0x05DE, 0x05E7, 0x05D5, 0x05DD), word(0x05D4, 0x05D0, 0x05D9, 0x05D5, 0x05E8)),
  photo: word(0x05EA, 0x05DE, 0x05D5, 0x05E0, 0x05D4),
  page: word(0x05E2, 0x05DE, 0x05D5, 0x05D3),
};

/** Persian and Urdu share most printed labels with Arabic; chapter differs. */
const PERSIAN: DocLabels = {
  ...ARABIC,
  chapter: word(0x0641, 0x0635, 0x0644),
  table: word(0x062C, 0x062F, 0x0648, 0x0644),
  figure: word(0x0634, 0x06A9, 0x0644),
  contents: join(word(0x0641, 0x0647, 0x0631, 0x0633, 0x062A), word(0x0645, 0x0637, 0x0627, 0x0644, 0x0628)),
  references: word(0x0645, 0x0646, 0x0627, 0x0628, 0x0639),
  abstract: word(0x0686, 0x06A9, 0x06CC, 0x062F, 0x0647),
};

/** The labels a report in `language` prints. */
export function docLabels(language: string | null | undefined): DocLabels {
  const tag = languageTag(language, 'en-US');
  if (tag.startsWith('ar')) return ARABIC;
  if (tag.startsWith('he')) return HEBREW;
  if (tag.startsWith('fa')) return PERSIAN;
  return ENGLISH;
}

/** Whether a report in `language` is right to left (its labels, margins and numbering mirror). */
export const docIsRtl = (language: string | null | undefined): boolean => isRtlLanguage(language);

/** `"…"` CSS string literal for a label, for `content:` and custom properties. */
export const cssString = (value: string): string => `"${value.replace(/["\\]/g, '\\$&')} "`;

// Section titles ------------------------------------------------------------------------------

const FRONT_BACK_ENGLISH = /^(abstract|executive summary|summary|acknowledg(e)?ments?|references|bibliography|works cited|reference list|appendix|appendices|glossary|highlights|key messages)$/i;

/** Front and back matter titles in Arabic and Hebrew (compared after `foldArabic`), which a report does not number. */
const FRONT_BACK_RTL = new Set([
  'ملخص', 'الملخص', 'ملخص تنفيذي', 'الملخص التنفيذي', 'خلاصة تنفيذية', 'شكر وتقدير', 'شكر', 'إهداء', 'اهداء',
  'المراجع', 'قائمة المراجع', 'المراجع والمصادر', 'المصادر والمراجع', 'المصادر', 'مراجع', 'قائمة المصادر',
  'الملاحق', 'ملاحق', 'ملحق', 'مسرد المصطلحات', 'المسرد', 'قاموس المصطلحات', 'أبرز النقاط', 'النقاط الرئيسية',
  'תקציר', 'תקציר מנהלים', 'מקורות', 'ביבליוגרפיה', 'נספחים', 'נספח', 'תודות', 'מילון מונחים',
].map(foldArabic));

const REFERENCES_RTL = new Set([
  'المراجع', 'قائمة المراجع', 'المراجع والمصادر', 'المصادر والمراجع', 'المصادر', 'مراجع', 'قائمة المصادر',
  'מקורות', 'ביבליוגרפיה', 'רשימת מקורות',
].map(foldArabic));

const tidyTitle = (title: string): string => foldArabic(title).replace(/^[\d.\s٠-٩]+/, '').replace(/[:：.\s]+$/g, '').trim();

/** Whether a section title names front or back matter (abstract, references, appendix…) in English, Arabic or Hebrew. */
export function isFrontBackTitle(title: string): boolean {
  const value = title.trim();
  return FRONT_BACK_ENGLISH.test(value) || FRONT_BACK_RTL.has(tidyTitle(value));
}

/** Like `isFrontBackTitle`, but a title that merely starts with one ("Appendix A", "ملحق أ") counts. */
export function startsFrontBack(title: string): boolean {
  const value = title.trim();
  if (/^(abstract|acknowledg|references|bibliography|appendix|executive summary)/i.test(value)) return true;
  const folded = tidyTitle(value);
  for (const entry of FRONT_BACK_RTL) {
    if (folded === entry || folded.startsWith(`${entry} `)) return true;
  }
  return false;
}

/** Whether a section title is the reference list. */
export function isReferencesTitle(title: string): boolean {
  const value = title.trim();
  return /^(references|bibliography|works cited|reference list)$/i.test(value) || REFERENCES_RTL.has(tidyTitle(value));
}
