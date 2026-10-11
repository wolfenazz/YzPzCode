// Real photographs from the web for reports and decks: cleaning the search
// words the AI wrote, choosing the best search result, and the prompt / reply
// for an AI CLI that finds the photos with its own web search. Dependency-free
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

/* Photos found by the AI's own web search ------------------------------------ */

/** One photo wanted: what it shows (most specific wording first) and its shape. */
export interface PhotoRequest {
  queries: string[];
  prefer: 'landscape' | 'portrait' | 'any';
}

/** A photo the AI found: the image file itself, the page it is on, and who to credit. */
export interface FoundPhoto extends PictureCandidate {
  page: string;
  credit: string;
}

/** Candidates the AI may return per photo; the first that downloads is used. */
export const PHOTOS_PER_REQUEST = 3;

/** Sites that sell or watermark their pictures; their files are never used. */
const PAID_STOCK = /(gettyimages|istockphoto|shutterstock|adobestock|stock\.adobe|alamy|dreamstime|depositphotos|123rf|bigstockphoto|agefotostock|pond5)\./i;

/** Asks an AI CLI with web search to find real photographs for each request. */
export function buildPhotoSearchPrompt(requests: PhotoRequest[]): { system: string; prompt: string } {
  const system = `You find real photographs on the web for a document. Use your web search (and page reading) tools; never answer from memory.

RULES
- Real photographs only: no illustrations, icons, logos, charts, maps, screenshots, AI-generated images or pictures with watermarks or text on them.
- Prefer openly licensed sources: Wikimedia Commons, Unsplash, Pexels, Pixabay, Flickr (Creative Commons), and public-domain archives (NASA, government and museum collections). Never use paid stock sites (Getty, iStock, Shutterstock, Adobe Stock, Alamy, Dreamstime…) or news photos.
- "url" is the image file itself (https), not the page that shows it: it must return the picture when downloaded. Wikimedia: an upload.wikimedia.org address (a /thumb/ version 1600px wide is fine). Unsplash: images.unsplash.com with ?w=1600. Pexels: images.pexels.com with ?auto=compress&w=1600. Pixabay: the cdn.pixabay.com file.
- Large enough to print: about 1200 px or more on the long side. Match the orientation asked for.
- Only give addresses you actually saw in search results or on pages you opened. Never make one up or guess a file name.
- "credit" is "Author / Site, licence" (for example "Jane Doe / Wikimedia Commons, CC BY-SA 4.0" or "John Lee / Unsplash").
- Up to ${PHOTOS_PER_REQUEST} photos per request, best first. If nothing suitable exists, give an empty list for that request.

OUTPUT
Reply with only this JSON, nothing before or after it:
{"results":[{"n":1,"photos":[{"url":"https://…","page":"https://…","credit":"…","width":1600,"height":1067}]}]}`;
  const lines = requests.map((request, index) => {
    const [first, ...more] = request.queries.map(cleanPictureQuery).filter(Boolean);
    const shape = request.prefer === 'any' ? 'any orientation' : request.prefer;
    return `${index + 1}. ${first ?? 'photo'}${more.length ? ` (or: ${more.join('; ')})` : ''}. ${shape}.`;
  });
  return { system, prompt: `Find photographs for these ${requests.length === 1 ? 'request' : `${requests.length} requests`}:\n\n${lines.join('\n')}` };
}

/** Every balanced top-level {...} in a reply, last first (the answer follows any preamble). */
function jsonObjects(text: string): unknown[] {
  const found: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"' && depth > 0) inString = true;
    else if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          found.push(JSON.parse(text.slice(start, index + 1)));
        } catch {
          // Not JSON; keep looking.
        }
      }
    }
  }
  return found.reverse();
}

function foundPhoto(value: unknown): FoundPhoto | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!/^https:\/\/[^\s]+$/i.test(url) || /\.(svg|gif)(\?|#|$)/i.test(url)) return null;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (PAID_STOCK.test(`${host}.`)) return null;
  const size = (key: string): number => {
    const number = Number(raw[key]);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
  };
  const page = typeof raw.page === 'string' && /^https?:\/\//i.test(raw.page.trim()) ? raw.page.trim() : '';
  const credit = typeof raw.credit === 'string' ? raw.credit.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  return { fullUrl: url, width: size('width'), height: size('height'), page, credit: credit || host.replace(/^www\./, '') };
}

/**
 * The photos per request from the AI's reply, in request order (an empty list
 * where it found none). Accepts `{"results":[{"n":1,"photos":[…]}]}`, and a bare
 * `{"photos":[…]}` when only one photo was asked for.
 */
export function parsePhotoSearch(text: string, count: number): FoundPhoto[][] {
  const out: FoundPhoto[][] = Array.from({ length: count }, () => []);
  for (const value of jsonObjects(text)) {
    const object = value as Record<string, unknown>;
    const results = Array.isArray(object.results) ? object.results : Array.isArray(object.photos) && count === 1 ? [{ n: 1, photos: object.photos }] : null;
    if (!results) continue;
    results.forEach((entry, position) => {
      if (!entry || typeof entry !== 'object') return;
      const record = entry as Record<string, unknown>;
      const n = Number(record.n);
      const index = Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : position;
      if (index >= count || !Array.isArray(record.photos)) return;
      for (const photo of record.photos.map(foundPhoto)) {
        if (photo && !out[index].some((known) => known.fullUrl === photo.fullUrl) && out[index].length < PHOTOS_PER_REQUEST) out[index].push(photo);
      }
    });
    return out;
  }
  return out;
}
