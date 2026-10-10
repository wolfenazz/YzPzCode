// Fetches real photographs from the stock-photo service chosen in Settings →
// Presentation → Images (Openverse needs no key; Unsplash and Pexels use the
// user's key and fall back to Openverse without one).

import { usePresentationStore } from '../stores/presentationStore';
import { downloadStockImage, searchStockImages, stockCredit, type StockProviderId } from './presentation/stockImages';
import { choosePicture, cleanPictureQuery, pictureStem } from './writing/pictures';
import { joinPath } from './writing/document';

export interface WebPicture {
  /** Absolute path of the downloaded file. */
  path: string;
  credit: string;
  query: string;
  width: number;
  height: number;
}

/** The service to search, or null when web pictures are turned off. */
export function webPictureSource(): { provider: StockProviderId; key: string } | null {
  const { stockProvider, stockKeys } = usePresentationStore.getState();
  if (stockProvider === 'off') return null;
  if (stockProvider === 'openverse') return { provider: 'openverse', key: '' };
  const key = stockKeys[stockProvider];
  return key ? { provider: stockProvider, key } : { provider: 'openverse', key: '' };
}

export const webPicturesEnabled = (): boolean => webPictureSource() !== null;

/** Searches for `query` and downloads the best photo to `folder`. Null when nothing usable turns up. */
export async function fetchWebPicture(query: string, folder: string, prefer: 'landscape' | 'portrait' | 'any' = 'landscape'): Promise<WebPicture | null> {
  const source = webPictureSource();
  const words = cleanPictureQuery(query);
  if (!source || !words) return null;
  const results = await searchStockImages(source.provider, words, 1, source.key);
  const choice = choosePicture(results, prefer);
  if (!choice) return null;
  const stem = joinPath(folder, `web-${pictureStem(words)}-${Date.now().toString(36)}`);
  const path = await downloadStockImage(choice, stem, source.key);
  return { path, credit: stockCredit(choice), query: words, width: choice.width, height: choice.height };
}

/** Fetches several photos, three at a time; a failed one is null, in its place. */
export async function fetchWebPictures(queries: string[], folder: string, prefer: 'landscape' | 'portrait' | 'any' = 'landscape'): Promise<Array<WebPicture | null>> {
  const out: Array<WebPicture | null> = queries.map(() => null);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < queries.length) {
      const index = next;
      next += 1;
      out[index] = await fetchWebPicture(queries[index], folder, prefer).catch((error: unknown) => {
        console.warn(`No web photo for "${queries[index]}":`, error);
        return null;
      });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return out;
}
