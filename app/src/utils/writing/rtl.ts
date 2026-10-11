// Right-to-left support shared by the Writing and Presentation studios:
// which text and which languages are right-to-left, paragraph direction
// (Unicode's first-strong rule with a majority fallback), locale tags,
// Unicode-aware word counting, Arabic folding for comparisons and the faces
// that carry Arabic letters. Characters are built from code points so the
// source stays plain ASCII. Dependency-free (tested by `npm run test:writing`
// and `npm run test:presentation`).

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const span = (from: number, to: number): string => `${cp(from)}-${cp(to)}`;

/** Scripts written right to left. Arabic covers Persian, Urdu, Pashto, Kurdish (Sorani), Sindhi and Uyghur. */
const RTL_SCRIPT = '\\p{Script=Arabic}\\p{Script=Hebrew}\\p{Script=Syriac}\\p{Script=Thaana}\\p{Script=Nko}';
const RTL_LETTER = new RegExp(`[${RTL_SCRIPT}]`, 'u');
const ANY_LETTER = /\p{L}/u;

export type Direction = 'ltr' | 'rtl';

/** Whether `text` holds at least one right-to-left letter. */
export const hasRtl = (text: string): boolean => RTL_LETTER.test(text);

/** How many right-to-left letters and how many letters in all `text` has. */
export function letterCounts(text: string): { rtl: number; letters: number } {
  let rtl = 0;
  let letters = 0;
  for (const ch of text) {
    if (!ANY_LETTER.test(ch)) continue;
    letters += 1;
    if (RTL_LETTER.test(ch)) rtl += 1;
  }
  return { rtl, letters };
}

/** Share (0 to 1) of the letters of `text` that are right-to-left. */
export function rtlShare(text: string): number {
  const { rtl, letters } = letterCounts(text);
  return letters === 0 ? 0 : rtl / letters;
}

/** Direction of the first strong letter (Unicode UAX #9 rules P2 and P3), or null when there is none. */
export function firstStrong(text: string): Direction | null {
  for (const ch of text) {
    if (!ANY_LETTER.test(ch)) continue;
    return RTL_LETTER.test(ch) ? 'rtl' : 'ltr';
  }
  return null;
}

/**
 * The direction a paragraph reads in. The first strong letter decides, as in
 * the Unicode algorithm; a paragraph that opens with a brand or a number in
 * Latin letters but is mostly Arabic is right-to-left too. Text with no
 * letters is `fallback`.
 */
export function paragraphDirection(text: string, fallback: Direction = 'ltr'): Direction {
  const first = firstStrong(text);
  if (first === null) return fallback;
  if (first === 'rtl') return 'rtl';
  return rtlShare(text) >= 0.5 ? 'rtl' : 'ltr';
}

// Languages ----------------------------------------------------------------------------------

/** English names, native names (any name in a right-to-left script) and BCP-47 primary subtags of the right-to-left languages. */
const RTL_LANGUAGE = /\b(arabic|hebrew|persian|farsi|dari|urdu|pashto|pushto|sindhi|kurdish|sorani|uyghur|uighur|yiddish|dhivehi|maldivian|syriac|aramaic|assyrian|jawi)\b|^(ar|he|iw|fa|prs|ur|ps|sd|ug|yi|dv|ckb|syr|arc|ks|ku-arab)(?:[-_]|$)|[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/iu;

/** Whether a language name or tag ("Arabic", "ar-EG", an Arabic-script name, "Persian (Farsi)") is written right to left. */
export function isRtlLanguage(language: string | null | undefined): boolean {
  const value = String(language ?? '').trim();
  return value.length > 0 && RTL_LANGUAGE.test(value);
}

// "Persian", "Urdu" and "Pashto" in their own script.
const PERSIAN_NATIVE = cp(0x0641, 0x0627, 0x0631, 0x0633, 0x06CC);
const URDU_NATIVE = cp(0x0627, 0x0631, 0x062F, 0x0648);
const PASHTO_NATIVE = cp(0x067E, 0x069A, 0x062A, 0x0648);

const LOCALES: Array<[RegExp, string]> = [
  // Persian, Urdu, Pashto and Kurdish are written in Arabic script, so they come before the Arabic test.
  [new RegExp(`persian|farsi|^fa(?:[-_]|$)|${PERSIAN_NATIVE}`, 'iu'), 'fa-IR'],
  [new RegExp(`urdu|^ur(?:[-_]|$)|${URDU_NATIVE}`, 'iu'), 'ur-PK'],
  [new RegExp(`pashto|pushto|^ps(?:[-_]|$)|${PASHTO_NATIVE}`, 'iu'), 'ps-AF'],
  [/kurdish|sorani|^ckb(?:[-_]|$)/i, 'ckb-IQ'],
  [/arabic|^ar(?:[-_]|$)|\p{Script=Arabic}/iu, 'ar-SA'],
  [/hebrew|^he(?:[-_]|$)|^iw$|\p{Script=Hebrew}/iu, 'he-IL'],
  [/english|^en(?:[-_]|$)/i, 'en-US'],
  [/french|^fr(?:[-_]|$)|fran.ais/i, 'fr-FR'],
  [/german|^de(?:[-_]|$)|deutsch/i, 'de-DE'],
  [/spanish|^es(?:[-_]|$)|espa.ol/i, 'es-ES'],
  [/italian|^it(?:[-_]|$)/i, 'it-IT'],
  [/portuguese|^pt(?:[-_]|$)/i, 'pt-PT'],
  [/dutch|^nl(?:[-_]|$)/i, 'nl-NL'],
  [/chinese|^zh(?:[-_]|$)/i, 'zh-CN'],
  [/japanese|^ja(?:[-_]|$)/i, 'ja-JP'],
  [/korean|^ko(?:[-_]|$)/i, 'ko-KR'],
  [/russian|^ru(?:[-_]|$)/i, 'ru-RU'],
  [/turkish|^tr(?:[-_]|$)/i, 'tr-TR'],
  [/hindi|^hi(?:[-_]|$)/i, 'hi-IN'],
  [/indonesian|^id(?:[-_]|$)/i, 'id-ID'],
];

/** A BCP-47 tag for a language name, for PowerPoint `lang`, Word `w:lang` and HTML `lang`. Unknown names are `fallback`. */
export function languageTag(language: string | null | undefined, fallback = 'en-US'): string {
  const value = String(language ?? '').trim();
  if (!value) return fallback;
  if (/^[a-z]{2,3}-[A-Za-z0-9]{2,4}$/.test(value)) return value.replace('_', '-');
  for (const [pattern, tag] of LOCALES) if (pattern.test(value)) return tag;
  return fallback;
}

/** The language a run of text is written in, by its script, or null for Latin and unknown scripts. */
export function languageOfScript(text: string): string | null {
  let arabic = 0;
  let hebrew = 0;
  for (const ch of text) {
    if (/\p{Script=Arabic}/u.test(ch)) arabic += 1;
    else if (/\p{Script=Hebrew}/u.test(ch)) hebrew += 1;
  }
  if (arabic === 0 && hebrew === 0) return null;
  return arabic >= hebrew ? 'Arabic' : 'Hebrew';
}

/**
 * The language to write in. What the user chose, unless that is empty or the
 * default (English) while the description itself is written in a
 * right-to-left script: then the description's language.
 */
export function languageFor(description: string, chosen: string): string {
  const wanted = chosen.trim();
  if (wanted && !/^(english|en|en-\w+|auto)$/i.test(wanted)) return wanted;
  const script = languageOfScript(description);
  return rtlShare(description) >= 0.4 && script ? script : wanted;
}

// Words --------------------------------------------------------------------------------------

const WORD = new RegExp(`[\\p{L}\\p{N}\\p{M}]+(?:['${cp(0x2019, 0x2010)}-][\\p{L}\\p{N}\\p{M}]+)*`, 'gu');

/** Words of `text` in any script (the Latin-only `\w` finds none in Arabic). */
export function wordsOf(text: string): string[] {
  return text.match(WORD) ?? [];
}

export const countWordsIn = (text: string): number => wordsOf(text).length;

/** Whether a whitespace-separated token holds a letter or digit in any script. */
export const isWordLike = (token: string): boolean => /[\p{L}\p{N}]/u.test(token);

// Folding ------------------------------------------------------------------------------------

/** Tashkeel (harakat), the dagger alef, Quranic marks and tatweel. */
const ARABIC_MARKS = new RegExp(`[${span(0x064B, 0x065F)}${cp(0x0670)}${span(0x06D6, 0x06ED)}${cp(0x0640)}]`, 'g');
const ALEF_VARIANTS = new RegExp(`[${cp(0x0622, 0x0623, 0x0625, 0x0671)}]`, 'g');
const ARABIC_INDIC = new RegExp(`[${span(0x0660, 0x0669)}]`, 'g');
const EXTENDED_INDIC = new RegExp(`[${span(0x06F0, 0x06F9)}]`, 'g');

/**
 * Arabic text reduced for comparing and searching: marks and tatweel removed,
 * alef, yeh and teh marbuta folded, Arabic-Indic digits written as 0-9.
 */
export function foldArabic(text: string): string {
  return text
    .replace(ARABIC_MARKS, '')
    .replace(ALEF_VARIANTS, cp(0x0627))
    .replaceAll(cp(0x0649), cp(0x064A))
    .replaceAll(cp(0x0629), cp(0x0647))
    .replace(ARABIC_INDIC, (digit) => String((digit.codePointAt(0) ?? 0x0660) - 0x0660))
    .replace(EXTENDED_INDIC, (digit) => String((digit.codePointAt(0) ?? 0x06F0) - 0x06F0));
}

/** Arabic-Indic and Persian digits written as 0-9; nothing else changes. */
export function westernDigits(text: string): string {
  return text
    .replace(ARABIC_INDIC, (digit) => String((digit.codePointAt(0) ?? 0x0660) - 0x0660))
    .replace(EXTENDED_INDIC, (digit) => String((digit.codePointAt(0) ?? 0x06F0) - 0x06F0));
}

/**
 * Arabic letters folded one for one (alef and yeh variants, teh marbuta), so
 * the text keeps its length and offsets into it stay valid.
 */
export function foldLetters(text: string): string {
  return text
    .replace(ALEF_VARIANTS, cp(0x0627))
    .replaceAll(cp(0x0649), cp(0x064A))
    .replaceAll(cp(0x0629), cp(0x0647));
}

// Isolates -----------------------------------------------------------------------------------

/** `text` as an isolated run (first-strong isolate), so a name or number inside a sentence of the other direction keeps its own order. */
export const isolate = (text: string): string => `${cp(0x2068)}${text}${cp(0x2069)}`;

// Faces --------------------------------------------------------------------------------------

/** Faces with Arabic letters that Windows and Office both carry (lower case). */
const ARABIC_FACES = new Set([
  'segoe ui', 'segoe ui semibold', 'segoe ui light', 'segoe ui black', 'segoe ui variable', 'tahoma', 'arial', 'times new roman',
  'courier new', 'lucida sans unicode', 'microsoft sans serif', 'sakkal majalla', 'traditional arabic', 'simplified arabic',
  'arabic typesetting', 'andalus', 'aldhabi', 'dubai', 'dubai medium', 'urdu typesetting', 'cairo', 'noto sans arabic',
  'noto naskh arabic', 'amiri', 'david', 'miriam', 'narkisim', 'gisha', 'aharoni', 'arial unicode ms',
]);

/** Whether a face is known to draw Arabic (or Hebrew) letters itself. */
export const faceHasArabic = (face: string): boolean => ARABIC_FACES.has(face.replace(/['"]/g, '').trim().toLowerCase());

/**
 * The face PowerPoint and Word should use for right-to-left letters when the
 * run's own face has none (Calibri, Cambria, Georgia have no Arabic): a face
 * with Arabic of the same character.
 */
export function complexScriptFace(face: string): string {
  const clean = face.replace(/['"]/g, '').trim();
  if (!clean) return 'Segoe UI';
  if (faceHasArabic(clean)) return clean;
  const lower = clean.toLowerCase();
  if (/mono|consolas|courier|code/.test(lower)) return 'Courier New';
  if (/times|georgia|garamond|cambria|book|serif|palatino|baskerville|didot|constantia|rockwell|minion|merriweather|gabriola/.test(lower) && !/sans/.test(lower)) return 'Times New Roman';
  if (/black|impact|heavy/.test(lower)) return 'Segoe UI Black';
  if (/semibold|medium|demi/.test(lower)) return 'Segoe UI Semibold';
  if (/light|thin/.test(lower)) return 'Segoe UI Light';
  return 'Segoe UI';
}

/** A CSS font stack with an Arabic-capable face behind it, so Arabic letters never fall to a random system face. */
export function withArabicFallback(stack: string): string {
  return /segoe ui|tahoma|arial|times new roman/i.test(stack) ? stack : `${stack}, 'Segoe UI', Tahoma, Arial`;
}
