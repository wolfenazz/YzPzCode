// Real photographs from the web for reports and decks: cleaning the search
// words the AI wrote and choosing the best search result. Dependency-free
// (tested by `npm run test:writing`); the fetching lives in `utils/webPictures.ts`.

/** At most this many web photos go into one report or deck. */
export const MAX_WEB_PHOTOS = 6;

export interface PictureCandidate {
  fullUrl: string;
  width: number;
  height: number;
}

/** Plain search words: no quotes or punctuation, at most six words. */
export function cleanPictureQuery(query: string): string {
  return query
    .replace(/["'“”‘’`]/g, '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
    .slice(0, 80)
    .trim();
}

/**
 * The best result for a page or a figure: large enough to print, a photo
 * format (not SVG or GIF), the wanted orientation first, search order after that.
 */
export function choosePicture<T extends PictureCandidate>(results: T[], prefer: 'landscape' | 'portrait' | 'any' = 'landscape', minWidth = 900): T | null {
  const usable = results.filter((result) => /^https:\/\//i.test(result.fullUrl) && !/\.(svg|gif)(\?|$)/i.test(result.fullUrl));
  if (usable.length === 0) return null;
  const score = (result: T, index: number): number => {
    const ratio = result.width / Math.max(1, result.height);
    const big = result.width >= minWidth || result.height >= minWidth;
    const fits = prefer === 'any' || (prefer === 'landscape' ? ratio >= 1.2 : ratio <= 0.85);
    const extreme = ratio > 3 || ratio < 0.33;
    return (big ? 100 : result.width > 0 ? 0 : 40) + (fits ? 50 : 0) - (extreme ? 80 : 0) - index;
  };
  return usable.map((result, index) => ({ result, score: score(result, index) })).sort((a, b) => b.score - a.score)[0].result;
}

/** A short file-name stem from search words. */
export function pictureStem(query: string): string {
  return cleanPictureQuery(query).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';
}
