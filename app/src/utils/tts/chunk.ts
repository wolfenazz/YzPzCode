/** Default backend-friendly chunk budget (see plan: ~250 chars, sentence split). */
export const TTS_CHUNK_MAX_CHARS = 250;

// Sentence-boundary characters, built from code points so the source stays
// plain ASCII: Latin `.?!`, Arabic question mark (U+061F), Quranic stop
// (U+06D6), and newline. Splitting keeps the delimiter with its sentence.
const AR_QMARK: string = String.fromCharCode(0x061f);
const QURAN_STOP: string = String.fromCharCode(0x06d6);
const NEWLINE: string = String.fromCharCode(0x0a);
const BOUNDARY_CHARS: string = '.?!' + AR_QMARK + QURAN_STOP + NEWLINE;
const SENTENCE_RE: RegExp = new RegExp(
  '[^' + BOUNDARY_CHARS + ']+[' + BOUNDARY_CHARS + ']+|[^' + BOUNDARY_CHARS + ']+$',
  'g',
);

function splitLongSentence(sentence: string, limit: number): string[] {
  const words: string[] = sentence.split(/\s+/).filter((word) => word.length > 0);
  const pieces: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate: string = current ? current + ' ' + word : word;
    if (candidate.length > limit && current) {
      pieces.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Splits long narration text into sentence-packed chunks of at most `maxChars`
 * characters. Splits on newlines and sentence punctuation (Latin + Arabic),
 * packs whole sentences greedily, and hard-splits a lone over-long sentence on
 * word boundaries so no chunk ever exceeds the budget by much. Pure and
 * unit-testable: no DOM, no Tauri.
 */
export function splitChunks(text: string, maxChars: number = TTS_CHUNK_MAX_CHARS): string[] {
  const clean: string = text.trim();
  if (!clean) return [];
  const limit: number = Math.max(50, Math.floor(maxChars));
  const sentences: string[] =
    clean
      .match(SENTENCE_RE)
      ?.map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0) ?? [clean];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(...splitLongSentence(sentence, limit));
    } else if (current && (current + ' ' + sentence).length > limit) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
