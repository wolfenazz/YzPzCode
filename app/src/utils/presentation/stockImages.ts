// Frontend of the stock-photo search (`src-tauri/src/commands/presentation_commands.rs`).

import { invoke } from '@tauri-apps/api/core';

export type StockProviderId = 'openverse' | 'unsplash' | 'pexels';

export interface StockImage {
  id: string;
  provider: StockProviderId;
  thumbUrl: string;
  fullUrl: string;
  width: number;
  height: number;
  title: string;
  author: string;
  license: string;
  sourceUrl: string;
  pingUrl: string | null;
}

export const STOCK_PROVIDERS: Array<{ id: StockProviderId; label: string; needsKey: boolean; hint: string; keyUrl?: string }> = [
  { id: 'openverse', label: 'Openverse', needsKey: false, hint: 'Openly licensed images (Creative Commons and public domain). No account needed; credit the author.' },
  { id: 'unsplash', label: 'Unsplash', needsKey: true, hint: 'High-quality free photos. Needs a free Unsplash developer access key.', keyUrl: 'https://unsplash.com/developers' },
  { id: 'pexels', label: 'Pexels', needsKey: true, hint: 'Free stock photos. Needs a free Pexels API key.', keyUrl: 'https://www.pexels.com/api/' },
];

export function searchStockImages(provider: StockProviderId, query: string, page: number, apiKey: string): Promise<StockImage[]> {
  return invoke<StockImage[]>('stock_image_search', { provider, query, page, apiKey: apiKey || null });
}

/** Downloads the photo to `stem` + the right extension; returns the path written. */
export function downloadStockImage(image: StockImage, stem: string, apiKey: string): Promise<string> {
  return invoke<string>('stock_image_download', { url: image.fullUrl, stem, pingUrl: image.pingUrl, apiKey: apiKey || null });
}

/** The on-slide credit line: "Photo: Ann Lee / Unsplash", "Ann Lee, CC BY 4.0". */
export function stockCredit(image: StockImage): string {
  const author = image.author.trim() || 'Unknown author';
  if (image.provider === 'unsplash') return `Photo: ${author} / Unsplash`;
  if (image.provider === 'pexels') return `Photo: ${author} / Pexels`;
  return `${author}${image.license ? `, ${image.license}` : ''}`;
}
