// Browser-side helpers for exports: deck images as data URLs, Iconify icons
// as SVG/PNG, and gradient fills painted to PNG (PowerPoint shapes take only
// solid fills from pptxgenjs).

import { invoke } from '@tauri-apps/api/core';
import { joinPath } from '../writing/document';
import type { Fill } from './render';
import type { Slide } from './types';

export const isAbsolutePath = (path: string): boolean => /^([A-Za-z]:[\\/]|\/|\\\\)/.test(path);

/** A slide image src (relative to the deck folder, absolute, or data:) as a path to read. */
export const resolveAssetPath = (src: string, deckDir: string): string => (isAbsolutePath(src) ? src : joinPath(deckDir, src));

export function imageSources(slides: Slide[]): string[] {
  const set = new Set<string>();
  for (const slide of slides) {
    for (const block of Object.values(slide.slots)) if (block.type === 'image' && block.src) set.add(block.src);
  }
  return [...set];
}

export function iconNames(slides: Slide[]): string[] {
  const set = new Set<string>();
  for (const slide of slides) {
    for (const block of Object.values(slide.slots)) {
      if (block.type === 'icon') set.add(block.name);
      if (block.type === 'stats' || block.type === 'steps') block.items.forEach((item) => { if (item.icon) set.add(item.icon); });
    }
  }
  return [...set];
}

export async function loadImageDataUrls(sources: string[], deckDir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(sources.map(async (src) => {
    try {
      out[src] = /^data:/.test(src) ? src : await invoke<string>('read_file_as_base64', { path: resolveAssetPath(src, deckDir) });
    } catch (error) {
      console.warn(`Could not load image ${src}:`, error);
    }
  }));
  return out;
}

export async function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  const image = new Image();
  image.decoding = 'async';
  image.src = dataUrl;
  await image.decode();
  return { width: image.naturalWidth || 800, height: image.naturalHeight || 600 };
}

/** Re-encodes an image PowerPoint may not read (SVG, WebP, AVIF) as PNG. */
export async function toPowerPointImage(dataUrl: string): Promise<string> {
  if (/^data:image\/(png|jpe?g|gif|bmp)/i.test(dataUrl)) return dataUrl;
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || 1200;
  canvas.height = image.naturalHeight || 900;
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** Iconify icons as SVG markup (coloured with currentColor). */
export async function loadIconSvgs(names: string[]): Promise<Record<string, string>> {
  if (names.length === 0) return {};
  const { loadIcon, buildIcon } = await import('@iconify/react');
  const out: Record<string, string> = {};
  await Promise.all(names.map(async (name) => {
    try {
      const icon = await loadIcon(name);
      const built = buildIcon(icon, { width: '100%', height: '100%' });
      const attrs = Object.entries(built.attributes).map(([key, value]) => `${key}="${String(value)}"`).join(' ');
      out[name] = `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${built.body}</svg>`;
    } catch (error) {
      console.warn(`Could not load icon ${name}:`, error);
    }
  }));
  return out;
}

/** An SVG icon painted to a square PNG in `color`. */
export async function iconPng(svg: string, color: string, pixels = 256): Promise<string> {
  const coloured = svg
    .replace(/width="[^"]*"/, `width="${pixels}"`)
    .replace(/height="[^"]*"/, `height="${pixels}"`)
    .replace(/currentColor/g, color);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coloured)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;
  canvas.getContext('2d')!.drawImage(image, 0, 0, pixels, pixels);
  return canvas.toDataURL('image/png');
}

/** A gradient fill painted to PNG at `widthIn × heightIn` inches. */
export function gradientPng(fill: Extract<Fill, { gradient: unknown }>, widthIn: number, heightIn: number): string {
  const scale = Math.min(120, 2400 / Math.max(widthIn, heightIn));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(widthIn * scale));
  canvas.height = Math.max(2, Math.round(heightIn * scale));
  const context = canvas.getContext('2d')!;
  // CSS angles: 0deg points up, 90deg right, 180deg down.
  const radians = ((fill.angle - 90) * Math.PI) / 180;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const half = (Math.abs(canvas.width * Math.cos(radians)) + Math.abs(canvas.height * Math.sin(radians))) / 2;
  const gradient = context.createLinearGradient(cx - Math.cos(radians) * half, cy - Math.sin(radians) * half, cx + Math.cos(radians) * half, cy + Math.sin(radians) * half);
  gradient.addColorStop(0, fill.gradient[0]);
  gradient.addColorStop(1, fill.gradient[1]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** Bytes → base64 without blowing the call stack on large files. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.slice(base64.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Reads a file as bytes through the backend. */
export async function readFileBytes(path: string): Promise<Uint8Array> {
  return base64ToBytes(await invoke<string>('read_file_as_base64', { path }));
}

export async function writeFileBytes(path: string, bytes: Uint8Array): Promise<void> {
  await invoke('write_file_bytes', { path, base64Data: bytesToBase64(bytes) });
}
