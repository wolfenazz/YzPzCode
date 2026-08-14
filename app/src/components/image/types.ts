// ─── Image Editor — domain types ────────────────────────────────────────
// Local to the image editor module (src/components/image/). The global
// WorkspaceView union (../types) gains "image" separately.

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

export type LayerKind = 'raster' | 'image' | 'text' | 'shape';

export type ShapeKind = 'rect' | 'ellipse' | 'line';

export interface LayerMeta {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  blendMode: BlendMode;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  // text layers
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontStyle?: 'normal' | 'italic' | 'bold';
  fill?: string;
  // shape layers
  shape?: ShapeKind;
  stroke?: string;
  strokeWidth?: number;
  lineCap?: 'butt' | 'round' | 'square';
}

export interface DocumentMeta {
  width: number;
  height: number;
  background: 'transparent' | 'white' | 'black';
  layers: LayerMeta[]; // bottom → top
}

export type EditorTool =
  | 'move'
  | 'marquee'
  | 'ellipse-marquee'
  | 'lasso'
  | 'crop'
  | 'eyedropper'
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'text'
  | 'shape-rect'
  | 'shape-ellipse'
  | 'shape-line'
  | 'hand'
  | 'zoom';

export interface SelectionOutline {
  kind: 'rect' | 'ellipse' | 'path';
  x: number;
  y: number;
  w: number;
  h: number;
  points?: number[]; // for lasso (closed polygon, doc coords)
}

export interface SelectionMask {
  data: Uint8ClampedArray; // length = w*h, alpha 0..255 (255 = selected)
  w: number;
  h: number;
  bounds: { x: number; y: number; w: number; h: number } | null;
  outline: SelectionOutline | null;
}

export interface Viewport {
  x: number;
  y: number;
}
