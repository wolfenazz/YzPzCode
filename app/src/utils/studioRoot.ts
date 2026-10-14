import { invoke } from '@tauri-apps/api/core';

let cached: Promise<string> | null = null;

/**
 * The one folder the Writing, Presentation and Sheets studios save into
 * (Documents/YzPzCode, created on first use; the OS home folder is the
 * fallback when Documents is unavailable). It is outside the app's install
 * and data directories, so reports, decks and workbooks are still there
 * after the app is removed and installed again.
 * A failure is not cached, so the next call tries again. Call
 * `forgetStudioRoot()` to drop a cached success (e.g. after the folder was
 * deleted or moved) so the next call re-resolves it.
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

/** Drops the cached studio folder so the next `getStudioRoot()` re-resolves it. */
export function forgetStudioRoot(): void {
  cached = null;
}
