// ─── Image Editor — premium icon set (Lucide via Iconify) ─────────────────
// Centralized icon names so the whole editor uses ONE consistent set.

import React from 'react';
import { Icon } from '@iconify/react';

export const IMG_ICONS = {
  // File / actions
  newFile: 'lucide:file-plus',
  openFile: 'lucide:folder-open',
  save: 'lucide:save',
  saveAs: 'lucide:save-all',
  undo: 'lucide:undo-2',
  redo: 'lucide:redo-2',
  close: 'lucide:x',
  back: 'lucide:arrow-left',
  sparkles: 'lucide:sparkles',
  wand: 'lucide:wand-sparkles',
  palette: 'lucide:palette',
  rotateCcw: 'lucide:rotate-ccw',
  rotateCw: 'lucide:rotate-cw',
  flipH: 'lucide:flip-horizontal',
  flipV: 'lucide:flip-vertical',
  download: 'lucide:download',
  check: 'lucide:check',
  trash: 'lucide:trash-2',
  plus: 'lucide:plus',
  copy: 'lucide:copy',
  layers: 'lucide:layers',
  sliders: 'lucide:sliders-horizontal',
  // View / zoom
  fit: 'lucide:maximize',
  zoomIn: 'lucide:zoom-in',
  zoomOut: 'lucide:zoom-out',
  hand: 'lucide:hand',
  move: 'lucide:move',
  // Tools
  marquee: 'lucide:scan',
  ellipseMarquee: 'lucide:circle-dashed',
  lasso: 'lucide:lasso-select',
  crop: 'lucide:crop',
  eyedropper: 'lucide:eyedropper',
  brush: 'lucide:brush',
  eraser: 'lucide:eraser',
  fill: 'lucide:paint-bucket',
  text: 'lucide:type',
  shapeRect: 'lucide:square',
  shapeEllipse: 'lucide:circle',
  shapeLine: 'lucide:minus',
  zoom: 'lucide:search',
  visibilityOn: 'lucide:eye',
  visibilityOff: 'lucide:eye-off',
  lock: 'lucide:lock',
  unlock: 'lucide:lock-open',
  mergeDown: 'lucide:arrow-down-to-line',
  flatten: 'lucide:images',
  swap: 'lucide:arrow-up-down',
  selectAll: 'lucide:square-dashed-mouse-pointer',
  deselect: 'lucide:mouse-pointer-2-off',
  invert: 'lucide:circle-dashed',
  // Filters / adjustments
  brightness: 'lucide:sun',
  contrast: 'lucide:contrast',
  saturation: 'lucide:droplet',
  blur: 'lucide:droplet',
  grayscale: 'lucide:contrast',
  invertColors: 'lucide:contrast',
  sepia: 'lucide:contrast',
} as const;

export type ImageIconName = keyof typeof IMG_ICONS;

interface ImgIconProps {
  name: ImageIconName;
  className?: string;
}

/** Renders a Lucide icon at the given size using Iconify. */
export const ImgIcon: React.FC<ImgIconProps> = ({ name, className }) => (
  <Icon icon={IMG_ICONS[name]} className={className ?? 'h-3.5 w-3.5'} aria-hidden="true" />
);
