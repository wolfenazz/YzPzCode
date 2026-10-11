// Fetches real photographs from the web. By default the deck's or report's own
// AI CLI finds them with its web search (Claude Code, Codex, Grok; no account
// or key) and the app downloads the file it names. Settings → Presentation →
// Images can pick a photo service instead (Openverse needs no key; Unsplash and
// Pexels use the user's key); engines without web search use Openverse.

import { invoke } from '@tauri-apps/api/core';
import { usePresentationStore } from '../stores/presentationStore';
import { localFileUrl } from './mediaFiles';
import { downloadStockImage, searchStockImages, stockCredit, type StockImage, type StockProviderId } from './presentation/stockImages';
import { startAiRun, type AiRunResult } from './writing/aiClient';
import { buildPhotoSearchPrompt, choosePicture, cleanPictureQuery, parsePhotoSearch, pictureStem, type FoundPhoto, type PhotoRequest } from './writing/pictures';
import { joinPath } from './writing/document';
import type { EngineChoice, WritingEngineId } from './writing/types';

export interface WebPicture {
  /** Absolute path of the downloaded file. */
  path: string;
  credit: string;
  query: string;
  width: number;
  height: number;
}

type Prefer = PhotoRequest['prefer'];

/** Runs one photo search with web search on; callers pass their own to get Stop and the run trace. */
export type PhotoSearchRun = (system: string, prompt: string) => Promise<AiRunResult>;

/** Engines whose runs can be given web search (mirrors `searches_web` in `src-tauri/src/writing/engines.rs`). */
export const WEB_SEARCH_ENGINES: WritingEngineId[] = ['claude', 'codex', 'grok'];

/** Photos asked of the AI in one run, and runs at once. */
const PHOTOS_PER_RUN = 4;
const PARALLEL_RUNS = 2;
/** A found file smaller than this on its long side is skipped for the next candidate. */
const MIN_LONG_SIDE = 640;

type Source = { kind: 'ai' } | { kind: 'service'; provider: StockProviderId; key: string };

/** Where photos come from for this engine, or null when web photos are turned off. */
export function webPictureSource(engine?: WritingEngineId): Source | null {
  const { stockProvider, stockKeys } = usePresentationStore.getState();
  if (stockProvider === 'off') return null;
  if (stockProvider === 'ai') return engine && WEB_SEARCH_ENGINES.includes(engine) ? { kind: 'ai' } : { kind: 'service', provider: 'openverse', key: '' };
  if (stockProvider === 'openverse') return { kind: 'service', provider: 'openverse', key: '' };
  const key = stockKeys[stockProvider];
  return key ? { kind: 'service', provider: stockProvider, key } : { kind: 'service', provider: 'openverse', key: '' };
}

export const webPicturesEnabled = (): boolean => usePresentationStore.getState().stockProvider !== 'off';

/** The words to try for a query, most specific first: the full query, then its first four, then first two words. */
export function queryVariants(queries: string | string[]): string[] {
  const variants: string[] = [];
  for (const query of Array.isArray(queries) ? queries : [queries]) {
    const words = cleanPictureQuery(query);
    if (!words) continue;
    const list = words.split(' ');
    for (const count of [list.length, 4, 2]) {
      const variant = list.slice(0, count).join(' ');
      if (variant && !variants.includes(variant)) variants.push(variant);
    }
  }
  return variants;
}

const asList = (query: string | string[]): string[] => (Array.isArray(query) ? query : [query]).map(cleanPictureQuery).filter(Boolean);

/** The pixel size of a downloaded picture, or null when it does not decode. */
function measure(path: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = localFileUrl(path);
  });
}

/** Downloads the first candidate that is a real, big-enough picture; null when none is. */
async function downloadFound(candidates: FoundPhoto[], query: string, folder: string): Promise<WebPicture | null> {
  for (const candidate of candidates) {
    const stem = joinPath(folder, `web-${pictureStem(query)}-${Date.now().toString(36)}`);
    const path = await invoke<string>('stock_image_download', { url: candidate.fullUrl, stem, pingUrl: null, apiKey: null }).catch((error: unknown) => {
      console.warn(`Could not download ${candidate.fullUrl}:`, error);
      return null;
    });
    if (!path) continue;
    const size = await measure(path);
    if (!size || Math.max(size.width, size.height) < MIN_LONG_SIDE) {
      await invoke('delete_entry', { path }).catch(() => undefined);
      continue;
    }
    return { path, credit: candidate.credit, query, width: size.width, height: size.height };
  }
  return null;
}

/** The default search run: a headless run of the engine with only its web tools on. */
const runFor = (engine: EngineChoice): PhotoSearchRun => (system, prompt) => startAiRun({
  engine: engine.engine,
  model: engine.model,
  effort: engine.effort,
  system,
  prompt,
  webSearch: true,
  timeoutSecs: usePresentationStore.getState().aiTimeoutSecs,
}).result;

/** The AI finds the photos (a few per run, two runs at once); the app downloads them. */
async function fetchWithAi(queries: Array<string | string[]>, folder: string, prefer: Prefer, run: PhotoSearchRun): Promise<Array<WebPicture | null>> {
  const out: Array<WebPicture | null> = queries.map(() => null);
  const groups: number[][] = [];
  for (let start = 0; start < queries.length; start += PHOTOS_PER_RUN) groups.push(queries.slice(start, start + PHOTOS_PER_RUN).map((_, offset) => start + offset));
  // Set inside the workers, so TypeScript must not narrow it to null here.
  let failure = null as string | null;
  let answered = 0;
  const worker = async (): Promise<void> => {
    while (groups.length > 0) {
      const group = groups.shift()!;
      const requests = group.map((index): PhotoRequest => ({ queries: asList(queries[index]), prefer }));
      const { system, prompt } = buildPhotoSearchPrompt(requests);
      const result = await run(system, prompt);
      if (result.cancelled) return;
      if (!result.ok) {
        failure = result.error ?? 'The AI run failed.';
        continue;
      }
      answered += 1;
      const found = parsePhotoSearch(result.text, requests.length);
      await Promise.all(group.map(async (index, position) => {
        out[index] = await downloadFound(found[position], requests[position].queries[0] ?? 'photo', folder);
      }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_RUNS, groups.length) }, worker));
  // Every run failed: say why, so a caller can tell "offline" from "nothing found".
  if (answered === 0 && failure) throw new Error(failure);
  return out;
}

/** One photo from a photo service: each query, then shorter forms, until one has a usable result. */
async function fetchFromService(query: string | string[], folder: string, prefer: Prefer, provider: StockProviderId, key: string): Promise<WebPicture | null> {
  let failure: unknown = null;
  let searched = 0;
  for (const words of queryVariants(query).slice(0, 6)) {
    let choice: StockImage | null;
    try {
      choice = choosePicture(await searchStockImages(provider, words, 1, key), prefer);
      searched += 1;
    } catch (error) {
      failure = error;
      continue;
    }
    if (!choice) continue;
    const stem = joinPath(folder, `web-${pictureStem(words)}-${Date.now().toString(36)}`);
    const path = await downloadStockImage(choice, stem, key);
    return { path, credit: stockCredit(choice), query: words, width: choice.width, height: choice.height };
  }
  if (searched === 0 && failure) throw failure;
  return null;
}

/**
 * Fetches a photo per query into `folder` (a query may list several wordings,
 * most specific first). A photo that could not be found is null in its place;
 * throws only when every search failed (offline, the AI run failed), so a
 * caller can tell that from "nothing found".
 */
export async function fetchWebPictures(
  queries: Array<string | string[]>,
  folder: string,
  engine: EngineChoice,
  options: { prefer?: Prefer; run?: PhotoSearchRun } = {},
): Promise<Array<WebPicture | null>> {
  const prefer = options.prefer ?? 'landscape';
  const source = webPictureSource(engine.engine);
  if (!source || queries.length === 0) return queries.map(() => null);
  if (source.kind === 'ai') return fetchWithAi(queries, folder, prefer, options.run ?? runFor(engine));

  const out: Array<WebPicture | null> = queries.map(() => null);
  let next = 0;
  let failure: unknown = null;
  let reached = 0;
  const worker = async (): Promise<void> => {
    while (next < queries.length) {
      const index = next;
      next += 1;
      try {
        out[index] = await fetchFromService(queries[index], folder, prefer, source.provider, source.key);
        reached += 1;
      } catch (error) {
        failure = error;
        console.warn(`No web photo for "${queries[index]}":`, error);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (reached === 0 && failure) throw failure;
  return out;
}

/** One photo; see `fetchWebPictures`. */
export async function fetchWebPicture(query: string | string[], folder: string, engine: EngineChoice, options: { prefer?: Prefer; run?: PhotoSearchRun } = {}): Promise<WebPicture | null> {
  return (await fetchWebPictures([query], folder, engine, options))[0];
}
