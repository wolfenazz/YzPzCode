// ─── Image Editor — non-persisted reactive store ──────────────────────────
// Holds document METADATA + UI state. Pixel buffers live in model.ts's
// module cache and never flow through this store. History is per-workspace.

import { create } from 'zustand';
import type {
  DocumentMeta,
  EditorTool,
  LayerMeta,
  SelectionMask,
  Viewport,
} from '../components/image/types';
import {
  cloneDocumentMeta,
  compositeLayers,
  createCanvas,
  dropCanvasForLayerIds,
  flattenToLayer,
  flattenToCanvas,
  newImageLayer,
  newRasterLayer,
  rasterizeLayer,
  getLayerCanvas,
  setLayerCanvas,
} from '../components/image/editor/model';
import { HistoryManager } from '../components/image/editor/history';
import { emptySelection } from '../components/image/editor/selection';
import { buildMaskCanvas } from '../components/image/editor/paintEngine';

const defaultZoom = 1;
const defaultPan: Viewport = { x: 0, y: 0 };

const topLayerId = (doc: DocumentMeta): string | null =>
  doc.layers.length > 0 ? doc.layers[doc.layers.length - 1].id : null;

const ensureActive = (doc: DocumentMeta, current: string | null): string | null => {
  if (current && doc.layers.some((l) => l.id === current)) return current;
  return topLayerId(doc);
};

interface ImageEditorStore {
  docs: Record<string, DocumentMeta>;
  activeLayerId: Record<string, string | null>;
  zoom: Record<string, number>;
  pan: Record<string, Viewport>;
  isDirty: Record<string, boolean>;
  history: Record<string, HistoryManager>;

  selection: SelectionMask | null;
  tool: EditorTool;
  fgColor: string;
  bgColor: string;
  brushSize: number;
  brushOpacity: number;
  brushHardness: number;
  canUndo: boolean;
  canRedo: boolean;
  redrawTick: number;

  loadDocument: (wsId: string, doc: DocumentMeta) => void;
  closeDocument: (wsId: string) => void;
  setTool: (tool: EditorTool) => void;
  setFgColor: (color: string) => void;
  setBgColor: (color: string) => void;
  swapColors: () => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setBrushHardness: (hardness: number) => void;
  setSelection: (sel: SelectionMask | null) => void;
  setZoom: (wsId: string, zoom: number) => void;
  setPan: (wsId: string, pan: Viewport) => void;

  setActiveLayer: (wsId: string, id: string | null) => void;
  updateLayer: (wsId: string, layerId: string, patch: Partial<LayerMeta>) => void;
  addLayer: (wsId: string, layer: LayerMeta) => void;
  removeLayer: (wsId: string, layerId: string) => void;
  duplicateLayer: (wsId: string, layerId: string) => void;
  mergeDown: (wsId: string, layerId: string) => void;
  flatten: (wsId: string) => void;
  reorderLayer: (wsId: string, fromIndex: number, toIndex: number) => void;
  updateDocument: (wsId: string, patch: Partial<Pick<DocumentMeta, 'width' | 'height' | 'background'>>) => void;
  cropDocument: (wsId: string, bounds: { x: number; y: number; w: number; h: number }) => void;
  deleteSelection: (wsId: string) => void;
  flipLayer: (wsId: string, direction: 'h' | 'v') => void;
  rotateLayer: (wsId: string, degrees: number) => void;
  applyFilter: (wsId: string, filter: 'grayscale' | 'sepia' | 'invert' | 'brightness' | 'contrast' | 'saturate', amount?: number) => void;

  commit: (wsId: string) => void;
  undo: (wsId: string) => void;
  redo: (wsId: string) => void;
  markDirty: (wsId: string, dirty: boolean) => void;

  /** Ensures the active layer is raster (for pixel tools); returns its meta. */
  ensureActiveRaster: (wsId: string) => LayerMeta | null;
}

const setFlag = (state: ImageEditorStore, wsId: string): Pick<ImageEditorStore, 'canUndo' | 'canRedo'> => {
  const h = state.history[wsId];
  return { canUndo: h ? h.canUndo() : false, canRedo: h ? h.canRedo() : false };
};

export const useImageEditorStore = create<ImageEditorStore>()((set, get) => ({
  docs: {},
  activeLayerId: {},
  zoom: {},
  pan: {},
  isDirty: {},
  history: {},

  selection: null,
  tool: 'move',
  fgColor: '#d87757',
  bgColor: '#ffffff',
  brushSize: 24,
  brushOpacity: 1,
  brushHardness: 0.75,
  canUndo: false,
  canRedo: false,
  redrawTick: 0,

  loadDocument: (wsId, doc) => {
    const prev = get().docs[wsId];
    if (prev) {
      dropCanvasForLayerIds(prev.layers.map((l) => l.id));
    }
    set((state) => ({
      docs: { ...state.docs, [wsId]: doc },
      activeLayerId: { ...state.activeLayerId, [wsId]: topLayerId(doc) },
      zoom: { ...state.zoom, [wsId]: state.zoom[wsId] ?? defaultZoom },
      pan: { ...state.pan, [wsId]: state.pan[wsId] ?? defaultPan },
      isDirty: { ...state.isDirty, [wsId]: false },
      history: { ...state.history, [wsId]: new HistoryManager() },
      selection: null,
      canUndo: false,
      canRedo: false,
    }));
  },

  closeDocument: (wsId) => {
    const doc = get().docs[wsId];
    if (doc) dropCanvasForLayerIds(doc.layers.map((l) => l.id));
    set((state) => {
      const docs = { ...state.docs };
      const activeLayerId = { ...state.activeLayerId };
      const zoom = { ...state.zoom };
      const pan = { ...state.pan };
      const isDirty = { ...state.isDirty };
      const history = { ...state.history };
      delete docs[wsId];
      delete activeLayerId[wsId];
      delete zoom[wsId];
      delete pan[wsId];
      delete isDirty[wsId];
      delete history[wsId];
      return {
        docs,
        activeLayerId,
        zoom,
        pan,
        isDirty,
        history,
        selection: null,
        canUndo: false,
        canRedo: false,
      };
    });
  },

  setTool: (tool) => set({ tool }),
  setFgColor: (color) => set({ fgColor: color }),
  setBgColor: (color) => set({ bgColor: color }),
  swapColors: () => set((s) => ({ fgColor: s.bgColor, bgColor: s.fgColor })),
  setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(500, size)) }),
  setBrushOpacity: (opacity) => set({ brushOpacity: Math.max(0.01, Math.min(1, opacity)) }),
  setBrushHardness: (hardness) => set({ brushHardness: Math.max(0, Math.min(1, hardness)) }),
  setSelection: (sel) => set({ selection: sel }),
  setZoom: (wsId, zoom) => set((s) => ({ zoom: { ...s.zoom, [wsId]: zoom } })),
  setPan: (wsId, pan) => set((s) => ({ pan: { ...s.pan, [wsId]: pan } })),

  setActiveLayer: (wsId, id) => set((s) => ({ activeLayerId: { ...s.activeLayerId, [wsId]: id } })),

  updateLayer: (wsId, layerId, patch) =>
    set((state) => {
      const doc = state.docs[wsId];
      if (!doc) return state;
      const hist = state.history[wsId];
      hist?.capture(doc);
      const layers = doc.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l));
      const newDoc: DocumentMeta = { ...doc, layers };
      return {
        docs: { ...state.docs, [wsId]: newDoc },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  addLayer: (wsId, layer) =>
    set((state) => {
      const doc = state.docs[wsId];
      if (!doc) return state;
      const hist = state.history[wsId];
      hist?.capture(doc);
      const newDoc: DocumentMeta = { ...doc, layers: [...doc.layers, layer] };
      return {
        docs: { ...state.docs, [wsId]: newDoc },
        activeLayerId: { ...state.activeLayerId, [wsId]: layer.id },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  removeLayer: (wsId, layerId) =>
    set((state) => {
      const doc = state.docs[wsId];
      if (!doc) return state;
      const hist = state.history[wsId];
      hist?.capture(doc);
      dropCanvasForLayerIds([layerId]);
      const layers = doc.layers.filter((l) => l.id !== layerId);
      const newDoc: DocumentMeta = { ...doc, layers };
      return {
        docs: { ...state.docs, [wsId]: newDoc },
        activeLayerId: { ...state.activeLayerId, [wsId]: ensureActive(newDoc, state.activeLayerId[wsId] ?? null) },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  duplicateLayer: (wsId, layerId) =>
    set((state) => {
      const doc = state.docs[wsId];
      if (!doc) return state;
      const idx = doc.layers.findIndex((l) => l.id === layerId);
      if (idx < 0) return state;
      const hist = state.history[wsId];
      hist?.capture(doc);
      const src = doc.layers[idx];
      const copy: LayerMeta = {
        ...cloneDocumentMeta({ width: 1, height: 1, background: 'transparent', layers: [src] }).layers[0],
        id: `copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `${src.name} copy`,
        x: src.x + 16,
        y: src.y + 16,
      };
      if (src.kind === 'raster' || src.kind === 'image') {
        const srcC = getLayerCanvas(src);
        const c = document.createElement('canvas');
        c.width = srcC.width;
        c.height = srcC.height;
        c.getContext('2d')!.drawImage(srcC, 0, 0);
        setLayerCanvas(copy.id, c);
      }
      const layers = [...doc.layers];
      layers.splice(idx + 1, 0, copy);
      const newDoc: DocumentMeta = { ...doc, layers };
      return {
        docs: { ...state.docs, [wsId]: newDoc },
        activeLayerId: { ...state.activeLayerId, [wsId]: copy.id },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  mergeDown: (wsId, layerId) =>
    set((state) => {
      const doc = state.docs[wsId];
      if (!doc) return state;
      const idx = doc.layers.findIndex((l) => l.id === layerId);
      if (idx <= 0) return state;
      const hist = state.history[wsId];
      hist?.capture(doc);
      const below = doc.layers[idx - 1];
      const active = doc.layers[idx];
      dropCanvasForLayerIds([below.id, active.id]);
      const merged = compositeLayers([below, active]);
      const layers = [...doc.layers];
      layers.splice(idx - 1, 2, merged);
      const newDoc: DocumentMeta = { ...doc, layers };
      return {
        docs: { ...state.docs, [wsId]: newDoc },
        activeLayerId: { ...state.activeLayerId, [wsId]: merged.id },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  flatten: (wsId) =>
    set((state) => {
      const doc = state.docs[wsId];
      if (!doc) return state;
      const hist = state.history[wsId];
      hist?.capture(doc);
      dropCanvasForLayerIds(doc.layers.map((l) => l.id));
      const flat = flattenToLayer(doc);
      const newDoc: DocumentMeta = {
        width: doc.width,
        height: doc.height,
        background: 'transparent',
        layers: [flat],
      };
      return {
        docs: { ...state.docs, [wsId]: newDoc },
        activeLayerId: { ...state.activeLayerId, [wsId]: flat.id },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  reorderLayer: (wsId, fromIndex, toIndex) =>
    set((state) => {
      const doc = state.docs[wsId];
      if (!doc) return state;
      if (fromIndex < 0 || fromIndex >= doc.layers.length || toIndex < 0 || toIndex >= doc.layers.length) return state;
      const hist = state.history[wsId];
      hist?.capture(doc);
      const layers = [...doc.layers];
      const [moved] = layers.splice(fromIndex, 1);
      layers.splice(toIndex, 0, moved);
      const newDoc: DocumentMeta = { ...doc, layers };
      return {
        docs: { ...state.docs, [wsId]: newDoc },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  updateDocument: (wsId, patch) =>
    set((state) => {
      const doc = state.docs[wsId];
      if (!doc) return state;
      const hist = state.history[wsId];
      hist?.capture(doc);
      const newDoc: DocumentMeta = { ...doc, ...patch };
      return {
        docs: { ...state.docs, [wsId]: newDoc },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  cropDocument: (wsId, bounds) =>
    set((state) => {
      const doc = state.docs[wsId];
      if (!doc) return state;
      const hist = state.history[wsId];
      hist?.capture(doc);
      const bw = Math.max(1, Math.round(bounds.w));
      const bh = Math.max(1, Math.round(bounds.h));
      const flat = flattenToCanvas(doc);
      const c = createCanvas(bw, bh);
      c.getContext('2d')!.drawImage(flat, -Math.round(bounds.x), -Math.round(bounds.y));
      dropCanvasForLayerIds(doc.layers.map((l) => l.id));
      const layer = newImageLayer(bw, bh, 'Background', c);
      const newDoc: DocumentMeta = { width: bw, height: bh, background: 'transparent', layers: [layer] };
      return {
        docs: { ...state.docs, [wsId]: newDoc },
        activeLayerId: { ...state.activeLayerId, [wsId]: layer.id },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  deleteSelection: (wsId) => {
    const state = get();
    const doc = state.docs[wsId];
    const sel = state.selection;
    if (!doc || !sel || !sel.bounds) return;
    const id = ensureActive(doc, state.activeLayerId[wsId] ?? null);
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    state.commit(wsId);
    const raster = layer.kind === 'raster' || layer.kind === 'image' ? layer : rasterizeLayer(layer);
    if (raster !== layer) {
      set((s) => ({
        docs: {
          ...s.docs,
          [wsId]: { ...s.docs[wsId]!, layers: s.docs[wsId]!.layers.map((l) => (l.id === id ? raster : l)) },
        },
      }));
    }
    const ctx = getLayerCanvas(raster).getContext('2d')!;
    const mask = buildMaskCanvas(sel, doc.width, doc.height);
    if (mask) {
      ctx.save();
      ctx.translate(-raster.x, -raster.y);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(mask, 0, 0);
      ctx.restore();
    }
    set((s) => ({
      selection: null,
      isDirty: { ...s.isDirty, [wsId]: true },
      redrawTick: s.redrawTick + 1,
    }));
  },

  flipLayer: (wsId, direction) => {
    const state = get();
    const doc = state.docs[wsId];
    if (!doc) return;
    const id = ensureActive(doc, state.activeLayerId[wsId] ?? null);
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    const hist = state.history[wsId];
    hist?.capture(doc);
    const raster = layer.kind === 'raster' || layer.kind === 'image' ? layer : rasterizeLayer(layer);
    const c = getLayerCanvas(raster);
    const ctx = c.getContext('2d')!;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const out = ctx.createImageData(c.width, c.height);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const sx = direction === 'h' ? c.width - 1 - x : x;
        const sy = direction === 'v' ? c.height - 1 - y : y;
        const si = (sy * c.width + sx) * 4;
        const di = (y * c.width + x) * 4;
        out.data[di] = img.data[si];
        out.data[di + 1] = img.data[si + 1];
        out.data[di + 2] = img.data[si + 2];
        out.data[di + 3] = img.data[si + 3];
      }
    }
    ctx.putImageData(out, 0, 0);
    set((s) => ({
      docs: { ...s.docs, [wsId]: { ...s.docs[wsId]!, layers: s.docs[wsId]!.layers.map((l) => (l.id === id ? raster : l)) } },
      isDirty: { ...s.isDirty, [wsId]: true },
      redrawTick: s.redrawTick + 1,
      ...setFlag(s, wsId),
    }));
  },

  rotateLayer: (wsId, degrees) => {
    const state = get();
    const doc = state.docs[wsId];
    if (!doc) return;
    const id = ensureActive(doc, state.activeLayerId[wsId] ?? null);
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    const hist = state.history[wsId];
    hist?.capture(doc);
    // Rasterize text/shape so the transform is baked into pixels, then rotate.
    const raster = layer.kind === 'raster' || layer.kind === 'image' ? layer : rasterizeLayer(layer);
    const src = getLayerCanvas(raster);
    const rad = (degrees * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const nw = Math.max(1, Math.round(src.width * cos + src.height * sin));
    const nh = Math.max(1, Math.round(src.width * sin + src.height * cos));
    const out = createCanvas(nw, nh);
    const octx = out.getContext('2d')!;
    octx.translate(nw / 2, nh / 2);
    octx.rotate(rad);
    octx.drawImage(src, -src.width / 2, -src.height / 2);
    // Re-center rotated pixels so the layer stays under the cursor.
    const dx = (nw - src.width) / 2;
    const dy = (nh - src.height) / 2;
    const replaced: LayerMeta = { ...raster, width: nw, height: nh, rotation: 0, x: Math.round(raster.x - dx), y: Math.round(raster.y - dy) };
    setLayerCanvas(replaced.id, out);
    set((s) => ({
      docs: { ...s.docs, [wsId]: { ...s.docs[wsId]!, layers: s.docs[wsId]!.layers.map((l) => (l.id === id ? replaced : l)) } },
      isDirty: { ...s.isDirty, [wsId]: true },
      redrawTick: s.redrawTick + 1,
      ...setFlag(s, wsId),
    }));
  },

  applyFilter: (wsId, filter, amount = 1) => {
    const state = get();
    const doc = state.docs[wsId];
    if (!doc) return;
    const id = ensureActive(doc, state.activeLayerId[wsId] ?? null);
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return;
    const hist = state.history[wsId];
    hist?.capture(doc);
    const raster = layer.kind === 'raster' || layer.kind === 'image' ? layer : rasterizeLayer(layer);
    const c = getLayerCanvas(raster);
    const ctx = c.getContext('2d')!;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) continue;
      if (filter === 'grayscale') {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        data[i] = data[i + 1] = data[i + 2] = lum;
      } else if (filter === 'sepia') {
        data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      } else if (filter === 'invert') {
        data[i] = 255 - r;
        data[i + 1] = 255 - g;
        data[i + 2] = 255 - b;
      } else if (filter === 'brightness') {
        data[i] = Math.min(255, r * amount);
        data[i + 1] = Math.min(255, g * amount);
        data[i + 2] = Math.min(255, b * amount);
      } else if (filter === 'contrast') {
        const factor = (259 * (amount * 255 - 255)) / (255 * (259 - amount * 255));
        data[i] = Math.max(0, Math.min(255, factor * (r - 128) + 128));
        data[i + 1] = Math.max(0, Math.min(255, factor * (g - 128) + 128));
        data[i + 2] = Math.max(0, Math.min(255, factor * (b - 128) + 128));
      } else if (filter === 'saturate') {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        data[i] = Math.max(0, Math.min(255, gray + (r - gray) * amount));
        data[i + 1] = Math.max(0, Math.min(255, gray + (g - gray) * amount));
        data[i + 2] = Math.max(0, Math.min(255, gray + (b - gray) * amount));
      }
    }
    ctx.putImageData(img, 0, 0);
    set((s) => ({
      docs: { ...s.docs, [wsId]: { ...s.docs[wsId]!, layers: s.docs[wsId]!.layers.map((l) => (l.id === id ? raster : l)) } },
      isDirty: { ...s.isDirty, [wsId]: true },
      redrawTick: s.redrawTick + 1,
      ...setFlag(s, wsId),
    }));
  },

  commit: (wsId) =>
    set((state) => {
      const doc = state.docs[wsId];
      const hist = state.history[wsId];
      if (!doc || !hist) return state;
      hist.capture(doc);
      return setFlag(state, wsId);
    }),

  undo: (wsId) =>
    set((state) => {
      const doc = state.docs[wsId];
      const hist = state.history[wsId];
      if (!doc || !hist) return state;
      const restored = hist.undo(doc);
      if (!restored) return state;
      return {
        docs: { ...state.docs, [wsId]: restored },
        activeLayerId: { ...state.activeLayerId, [wsId]: ensureActive(restored, state.activeLayerId[wsId] ?? null) },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  redo: (wsId) =>
    set((state) => {
      const doc = state.docs[wsId];
      const hist = state.history[wsId];
      if (!doc || !hist) return state;
      const restored = hist.redo(doc);
      if (!restored) return state;
      return {
        docs: { ...state.docs, [wsId]: restored },
        activeLayerId: { ...state.activeLayerId, [wsId]: ensureActive(restored, state.activeLayerId[wsId] ?? null) },
        isDirty: { ...state.isDirty, [wsId]: true },
        ...setFlag(state, wsId),
      };
    }),

  markDirty: (wsId, dirty) =>
    set((state) => ({ isDirty: { ...state.isDirty, [wsId]: dirty } })),

  ensureActiveRaster: (wsId) => {
    const state = get();
    const doc = state.docs[wsId];
    if (!doc) return null;
    const id = ensureActive(doc, state.activeLayerId[wsId] ?? null);
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) return null;
    if (layer.kind === 'raster' || layer.kind === 'image') return layer;
    // Rasterize text/shape so pixel tools can act on it.
    state.commit(wsId);
    const raster = rasterizeLayer(layer);
    set((s) => {
      const d = s.docs[wsId];
      if (!d) return s;
      const layers = d.layers.map((l) => (l.id === layer.id ? raster : l));
      return { docs: { ...s.docs, [wsId]: { ...d, layers } }, isDirty: { ...s.isDirty, [wsId]: true } };
    });
    return raster;
  },
}));

// ── Convenience selectors ─────────────────────────────────────────────────

export const getActiveLayer = (wsId: string): LayerMeta | null => {
  const state = useImageEditorStore.getState();
  const doc = state.docs[wsId];
  if (!doc) return null;
  const id = ensureActive(doc, state.activeLayerId[wsId] ?? null);
  return doc.layers.find((l) => l.id === id) ?? null;
};

export const getDocument = (wsId: string): DocumentMeta | null =>
  useImageEditorStore.getState().docs[wsId] ?? null;

// Re-export the flattened preview used by the layers panel + save flow.
export { flattenToCanvas };
export const makeEmptySelection = emptySelection;
export const newEmptyRasterLayer = (w: number, h: number, name: string) => newRasterLayer(w, h, name);
