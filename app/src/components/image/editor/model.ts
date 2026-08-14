// ─── Image Editor — document model ────────────────────────────────────────
// Owns the pixel cache (offscreen canvases per raster/image layer) and all
// pure document operations. Kept separate from the reactive store so pixel
// buffers never flow through Zustand state.

import type { DocumentMeta, LayerMeta, BlendMode, ShapeKind } from '../types';

let layerIdCounter = 0;
const nextId = (): string => `layer-${++layerIdCounter}-${Math.random().toString(36).slice(2, 7)}`;

// Layer pixel data lives OUTSIDE React state. Layer ids are globally unique.
const pixelCache = new Map<string, HTMLCanvasElement>();

export const createCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

export const getLayerCanvas = (meta: LayerMeta): HTMLCanvasElement => {
  let c = pixelCache.get(meta.id);
  if (!c) {
    c = createCanvas(meta.width, meta.height);
    pixelCache.set(meta.id, c);
  }
  return c;
};

export const hasLayerCanvas = (id: string): boolean => pixelCache.has(id);

export const setLayerCanvas = (id: string, canvas: HTMLCanvasElement): void => {
  pixelCache.set(id, canvas);
};

export const dropLayerCanvas = (id: string): void => {
  pixelCache.delete(id);
};

export const dropAllCanvases = (): void => {
  pixelCache.clear();
};

export const dropCanvasForLayerIds = (ids: string[]): void => {
  ids.forEach((id) => pixelCache.delete(id));
};

const cleanName = (raw: string): string => raw.trim() || 'Layer';

export const newRasterLayer = (width: number, height: number, name: string): LayerMeta => {
  const meta: LayerMeta = {
    id: nextId(),
    name: cleanName(name),
    kind: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
  };
  getLayerCanvas(meta); // allocate
  return meta;
};

export const newImageLayer = (
  width: number,
  height: number,
  name: string,
  source: HTMLCanvasElement | HTMLImageElement,
): LayerMeta => {
  const meta: LayerMeta = {
    id: nextId(),
    name: cleanName(name),
    kind: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
  };
  const c = getLayerCanvas(meta);
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return meta;
};

export const newTextLayer = (
  text: string,
  fontSize: number,
  fontFamily: string,
  fill: string,
): LayerMeta => ({
  id: nextId(),
  name: cleanName(text).slice(0, 18),
  kind: 'text',
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal',
  x: 0,
  y: 0,
  width: Math.max(1, Math.round(fontSize * text.length * 0.6)),
  height: Math.round(fontSize * 1.3),
  rotation: 0,
  text,
  fontSize,
  fontFamily,
  fontStyle: 'normal',
  fill,
});

export const newShapeLayer = (
  shape: ShapeKind,
  width: number,
  height: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
): LayerMeta => ({
  id: nextId(),
  name: shape.charAt(0).toUpperCase() + shape.slice(1),
  kind: 'shape',
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal',
  x: 0,
  y: 0,
  width: Math.max(1, Math.round(width)),
  height: Math.max(1, Math.round(height)),
  rotation: 0,
  shape,
  fill,
  stroke,
  strokeWidth,
  lineCap: 'round',
});

export const createNewDocument = (
  width: number,
  height: number,
  background: DocumentMeta['background'],
): DocumentMeta => ({
  width,
  height,
  background,
  layers: [],
});

export const createDocumentFromImage = (
  img: HTMLImageElement,
  name: string,
): DocumentMeta => {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  return {
    width: w,
    height: h,
    background: 'transparent',
    layers: [newImageLayer(w, h, name, img)],
  };
};

export const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });

// ── Compositing ───────────────────────────────────────────────────────────

const compositeForBlend = (mode: BlendMode): GlobalCompositeOperation =>
  mode === 'normal' ? 'source-over' : (mode as GlobalCompositeOperation);

/** Draws a single layer onto `ctx` (document space), honoring x/y/rotation/opacity/blend. */
export const drawLayerOnto = (
  ctx: CanvasRenderingContext2D,
  layer: LayerMeta,
): void => {
  if (!layer.visible) return;

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = compositeForBlend(layer.blendMode);
  ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.translate(-layer.width / 2, -layer.height / 2);

  if (layer.kind === 'raster' || layer.kind === 'image') {
    ctx.drawImage(getLayerCanvas(layer), 0, 0, layer.width, layer.height);
  } else if (layer.kind === 'text') {
    const weight = layer.fontStyle === 'bold' ? 'bold ' : layer.fontStyle === 'italic' ? 'italic ' : '';
    ctx.font = `${weight}${layer.fontSize ?? 24}px "${layer.fontFamily ?? 'JetBrains Mono'}"`;
    ctx.fillStyle = layer.fill ?? '#ffffff';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(layer.text ?? '', 0, 0);
  } else if (layer.kind === 'shape') {
    const w = layer.width;
    const h = layer.height;
    ctx.fillStyle = layer.fill ?? '#ffffff';
    ctx.strokeStyle = layer.stroke ?? '#000000';
    ctx.lineWidth = layer.strokeWidth ?? 0;
    ctx.lineCap = layer.lineCap ?? 'round';
    const drawShape = () => {
      if (layer.shape === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      } else if (layer.shape === 'line') {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, h);
      } else {
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
      }
    };
    drawShape();
    if (layer.fill && layer.fill !== 'transparent') ctx.fill();
    if (layer.strokeWidth && layer.strokeWidth > 0 && layer.stroke) ctx.stroke();
  }

  ctx.restore();
};

/** Composites the whole document (visible layers) onto a doc-sized canvas. */
export const flattenToCanvas = (doc: DocumentMeta): HTMLCanvasElement => {
  const out = createCanvas(doc.width, doc.height);
  const ctx = out.getContext('2d')!;
  if (doc.background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, doc.width, doc.height);
  } else if (doc.background === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  for (const layer of doc.layers) {
    drawLayerOnto(ctx, layer);
  }
  return out;
};

/** Rasterizes the flattened doc to a PNG data URL. */
export const flattenToPngDataUrl = (doc: DocumentMeta): string =>
  flattenToCanvas(doc).toDataURL('image/png');

export const flattenToDataUrl = (
  doc: DocumentMeta,
  mime: 'image/png' | 'image/jpeg' | 'image/webp',
  quality = 0.92,
): string => {
  const c = flattenToCanvas(doc);
  if (mime === 'image/png') return c.toDataURL('image/png');
  return c.toDataURL(mime, quality);
};

// ── Cloning (for history snapshots) ───────────────────────────────────────

export const cloneLayerMeta = (layer: LayerMeta): LayerMeta => ({ ...layer });

export const cloneDocumentMeta = (doc: DocumentMeta): DocumentMeta => ({
  width: doc.width,
  height: doc.height,
  background: doc.background,
  layers: doc.layers.map(cloneLayerMeta),
});

/** Composites a group of layers (in order) into a single raster layer at their union bounds. */
export const compositeLayers = (layers: LayerMeta[]): LayerMeta => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of layers) {
    if (l.x < minX) minX = l.x;
    if (l.y < minY) minY = l.y;
    if (l.x + l.width > maxX) maxX = l.x + l.width;
    if (l.y + l.height > maxY) maxY = l.y + l.height;
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  const w = Math.max(1, Math.round(maxX - minX));
  const h = Math.max(1, Math.round(maxY - minY));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.translate(-minX, -minY);
  for (const l of layers) {
    drawLayerOnto(ctx, l);
  }
  const meta: LayerMeta = {
    id: nextId(),
    name: layers.length === 1 ? layers[0].name : 'Merged',
    kind: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: minX,
    y: minY,
    width: w,
    height: h,
    rotation: 0,
  };
  setLayerCanvas(meta.id, c);
  return meta;
};

/** Flattens the whole document into a single full-canvas raster layer. */
export const flattenToLayer = (doc: DocumentMeta): LayerMeta => {
  const c = flattenToCanvas(doc);
  const meta: LayerMeta = {
    id: nextId(),
    name: 'Background',
    kind: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: doc.width,
    height: doc.height,
    rotation: 0,
  };
  setLayerCanvas(meta.id, c);
  return meta;
};

/** Converts a text/shape layer to a raster layer so pixel tools can act on it. */
export const rasterizeLayer = (layer: LayerMeta): LayerMeta => {
  if (layer.kind === 'raster' || layer.kind === 'image') return layer;
  const c = createCanvas(layer.width, layer.height);
  const ctx = c.getContext('2d')!;
  // Draw the layer's own content at origin (its own local space).
  const detached: LayerMeta = { ...layer, x: 0, y: 0, rotation: 0 };
  drawLayerOnto(ctx, detached);
  const meta: LayerMeta = {
    ...layer,
    kind: 'raster',
    shape: undefined,
    text: undefined,
    fill: undefined,
    stroke: undefined,
    strokeWidth: undefined,
    lineCap: undefined,
  };
  pixelCache.set(meta.id, c);
  return meta;
};
