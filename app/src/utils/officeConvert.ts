// Older Word and PowerPoint files (.doc, .ppt) are not Open XML, so the previews and the
// Writing / Presentation studios cannot read them. The backend converts them to .docx /
// .pptx with whatever the machine has (Word, PowerPoint or LibreOffice) and caches the result.

import { invoke } from '@tauri-apps/api/core';

const LEGACY_EXTENSIONS = new Set(['doc', 'dot', 'ppt', 'pps']);

const extensionOf = (path: string): string => path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';

export const isLegacyOffice = (path: string): boolean => LEGACY_EXTENSIONS.has(extensionOf(path));

const inFlight = new Map<string, Promise<string>>();

/**
 * The path to read for a Word or PowerPoint file: the file itself when it is already
 * Open XML, else its converted copy. Rejects with a readable reason when no converter works.
 */
export function modernOfficePath(path: string): Promise<string> {
  if (!isLegacyOffice(path)) return Promise.resolve(path);
  let pending = inFlight.get(path);
  if (!pending) {
    pending = invoke<string>('convert_legacy_office', { path })
      .catch((error: unknown) => { throw new Error(typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)); })
      .finally(() => { inFlight.delete(path); });
    inFlight.set(path, pending);
  }
  return pending;
}
