import { invoke } from '@tauri-apps/api/core';

let cached: Promise<string> | null = null;

/**
 * The one folder the Writing and Presentation studios save into (Documents/YzPzCode,
 * created on first use). It is outside the app's install and data directories, so
 * reports and decks are still there after the app is removed and installed again.
 * A failure is not cached, so the next call tries again.
 */
export function getStudioRoot(): Promise<string> {
  if (!cached) {
    cached = invoke<string>('get_studio_root').catch((error: unknown) => {
      cached = null;
      throw error instanceof Error ? error : new Error(String(error));
    });
  }
  return cached;
}
