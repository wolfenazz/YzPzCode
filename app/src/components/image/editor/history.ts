// ─── Image Editor — undo/redo history ────────────────────────────────────
// Full-document snapshots taken at operation boundaries (stroke start, layer
// add/delete/reorder, filters, transforms). Pixels are stored as ImageData.

import type { DocumentMeta } from '../types';
import { cloneDocumentMeta, createCanvas, getLayerCanvas, setLayerCanvas } from './model';

export interface HistorySnapshot {
  meta: DocumentMeta;
  pixels: Record<string, ImageData>;
}

const capturePixels = (doc: DocumentMeta): Record<string, ImageData> => {
  const pixels: Record<string, ImageData> = {};
  for (const layer of doc.layers) {
    if (layer.kind === 'raster' || layer.kind === 'image') {
      const c = getLayerCanvas(layer);
      const ctx = c.getContext('2d')!;
      pixels[layer.id] = ctx.getImageData(0, 0, c.width, c.height);
    }
  }
  return pixels;
};

export class HistoryManager {
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];

  constructor(private readonly limit = 20) {}

  capture(doc: DocumentMeta): void {
    this.undoStack.push({ meta: cloneDocumentMeta(doc), pixels: capturePixels(doc) });
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Pops the most recent snapshot and returns a doc restored from it. */
  undo(doc: DocumentMeta): DocumentMeta | null {
    const snap = this.undoStack.pop();
    if (!snap) return null;
    this.redoStack.push({ meta: cloneDocumentMeta(doc), pixels: capturePixels(doc) });
    return restoreSnapshot(snap);
  }

  redo(doc: DocumentMeta): DocumentMeta | null {
    const snap = this.redoStack.pop();
    if (!snap) return null;
    this.undoStack.push({ meta: cloneDocumentMeta(doc), pixels: capturePixels(doc) });
    return restoreSnapshot(snap);
  }

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

const restoreSnapshot = (snap: HistorySnapshot): DocumentMeta => {
  const meta = cloneDocumentMeta(snap.meta);
  for (const layer of meta.layers) {
    if (layer.kind === 'raster' || layer.kind === 'image') {
      const pixels = snap.pixels[layer.id];
      if (pixels) {
        const c = createCanvas(layer.width, layer.height);
        c.getContext('2d')!.putImageData(pixels, 0, 0);
        setLayerCanvas(layer.id, c);
      } else {
        // Fresh canvas if the layer had no pixels recorded.
        getLayerCanvas(layer);
      }
    }
  }
  return meta;
};
