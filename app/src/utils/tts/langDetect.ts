import type { TtsLang } from './types';

// Arabic Unicode blocks as numeric ranges (ASCII-only source, nothing for
// editors to mangle): basic, supplement, extended, presentation forms A/B.
// Tashkeel (diacritics) lives inside these ranges and is counted, never stripped.
function isArabicCodePoint(code: number): boolean {
  return (
    (code >= 0x0600 && code <= 0x06ff) ||
    (code >= 0x0750 && code <= 0x077f) ||
    (code >= 0x08a0 && code <= 0x08ff) ||
    (code >= 0xfb50 && code <= 0xfdff) ||
    (code >= 0xfe70 && code <= 0xfeff)
  );
}

const LETTER_TEST = /\p{L}/u;

/**
 * Detects Arabic vs English for voice picking: `arabicChars / letters > 0.25`
 * yields `ar`, otherwise `en`. Empty or letter-less text defaults to `en`.
 */
export function detectLang(text: string): TtsLang {
  let letters = 0;
  let arabic = 0;
  for (const char of text) {
    if (!LETTER_TEST.test(char)) continue;
    letters += 1;
    if (isArabicCodePoint(char.codePointAt(0) ?? 0)) arabic += 1;
  }
  if (letters === 0) return 'en';
  return arabic / letters > 0.25 ? 'ar' : 'en';
}
