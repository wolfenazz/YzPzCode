// Files given to the assistant: pictures go to engines that can see them, the
// rest is turned into text (PDF, Word, spreadsheets, CSV, notes).

import { invoke } from '@tauri-apps/api/core';
import { fileName, joinPath } from '../../utils/writing/document';
import { extractText, SOURCE_EXTENSIONS } from '../../utils/writing/sources';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'tif', 'tiff'];
export const DOCUMENT_EXTENSIONS = SOURCE_EXTENSIONS;
const MAX_ATTACHMENTS = 8;
const MAX_TEXT_PER_FILE = 30_000;
const MAX_TEXT_TOTAL = 60_000;

export interface SheetAttachment {
  id: string;
  path: string;
  name: string;
  kind: 'image' | 'document';
  /** Thumbnail for pictures (a data URL). */
  preview?: string;
}

const extensionOf = (path: string): string => path.split('.').pop()?.toLowerCase() ?? '';

export const isImagePath = (path: string): boolean => IMAGE_EXTENSIONS.includes(extensionOf(path));
export const isDocumentPath = (path: string): boolean => DOCUMENT_EXTENSIONS.includes(extensionOf(path));

let counter = 0;
export function attachmentFromPath(path: string): SheetAttachment | null {
  counter += 1;
  if (isImagePath(path)) return { id: `a${Date.now().toString(36)}${counter}`, path, name: fileName(path), kind: 'image' };
  if (isDocumentPath(path)) return { id: `a${Date.now().toString(36)}${counter}`, path, name: fileName(path), kind: 'document' };
  return null;
}

/** A dropped or pasted file written next to the studio's workbooks, so the assistant can read it. */
export async function saveDropped(file: File, folder: string): Promise<string> {
  const fromName = file.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase();
  const extension = fromName ?? (file.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const base = (file.name || 'pasted').replace(/\.[^.]+$/, '').replace(/[^\w؀-ۿ-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
  const path = joinPath(folder, `${base}-${Date.now().toString(36)}.${extension}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await invoke('write_file_bytes', { path, base64Data: btoa(binary) });
  return path;
}

export interface PreparedAttachments {
  images: string[];
  documents: Array<{ name: string; kind: string; text: string }>;
  /** Problems worth telling the user about. */
  notes: string[];
}

export async function prepareAttachments(items: SheetAttachment[]): Promise<PreparedAttachments> {
  const images: string[] = [];
  const documents: PreparedAttachments['documents'] = [];
  const notes: string[] = [];
  let total = 0;
  for (const item of items.slice(0, MAX_ATTACHMENTS)) {
    if (item.kind === 'image') {
      images.push(item.path);
      continue;
    }
    try {
      let text = (await extractText(item.path)).trim();
      if (!text) {
        notes.push(`${item.name} has no readable text. If it is a scan, attach it as a picture instead.`);
        continue;
      }
      if (text.length > MAX_TEXT_PER_FILE) {
        text = `${text.slice(0, MAX_TEXT_PER_FILE)}\n[…cut off…]`;
        notes.push(`${item.name} is long; only the first part was sent.`);
      }
      if (total + text.length > MAX_TEXT_TOTAL) {
        notes.push(`${item.name} was left out: too much text for one request.`);
        continue;
      }
      total += text.length;
      documents.push({ name: item.name, kind: extensionOf(item.path), text });
    } catch (error) {
      notes.push(`${item.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (items.length > MAX_ATTACHMENTS) notes.push(`Only the first ${MAX_ATTACHMENTS} files were used.`);
  return { images, documents, notes };
}

export const MAX_ATTACHMENT_COUNT = MAX_ATTACHMENTS;
