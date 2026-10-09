// Extracts plain text from the workspace files a report draws on, so they
// can be handed to the AI as source material. Heavy parsers load on demand.

import { invoke } from '@tauri-apps/api/core';
import type { FileContent } from '../../types';
import { fileName } from './document';

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'html', 'htm', 'xml', 'yaml', 'yml', 'tex', 'bib', 'rst', 'log']);
export const SOURCE_EXTENSIONS = [...TEXT_EXTENSIONS, 'pdf', 'docx', 'xlsx', 'xls'];
const MAX_CHARS_PER_FILE = 40_000;

const extensionOf = (path: string): string => path.split('.').pop()?.toLowerCase() ?? '';

export async function readBytes(path: string): Promise<Uint8Array> {
  const dataUrl = await invoke<string>('read_file_as_base64', { path });
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pdfText(path: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: await readBytes(path) }).promise;
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    if (pages.join('\n').length > MAX_CHARS_PER_FILE) break;
  }
  return pages.join('\n\n');
}

async function docxText(path: string): Promise<string> {
  const mammoth = await import('mammoth');
  const bytes = await readBytes(path);
  const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
  return result.value;
}

async function sheetText(path: string): Promise<string> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await readBytes(path), { type: 'array' });
  return workbook.SheetNames.map((name) => `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n\n');
}

export async function extractText(path: string): Promise<string> {
  const extension = extensionOf(path);
  if (extension === 'pdf') return pdfText(path);
  if (extension === 'docx') return docxText(path);
  if (extension === 'xlsx' || extension === 'xls') return sheetText(path);
  const file = await invoke<FileContent>('read_file_content', { path });
  return file.content;
}

/** The brief's notes plus the text of every attached file, labelled by file name. */
export async function gatherSources(notes: string, files: string[]): Promise<{ text: string; errors: string[] }> {
  const parts: string[] = [];
  const errors: string[] = [];
  if (notes.trim()) parts.push(`Notes from the author:\n${notes.trim()}`);
  for (const path of files) {
    try {
      let text = (await extractText(path)).trim();
      if (text.length > MAX_CHARS_PER_FILE) text = `${text.slice(0, MAX_CHARS_PER_FILE)}\n[…truncated…]`;
      if (text) parts.push(`File: ${fileName(path)}\n${text}`);
    } catch (error) {
      errors.push(`${fileName(path)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { text: parts.join('\n\n---\n\n'), errors };
}
