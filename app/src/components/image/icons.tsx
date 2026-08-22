// ─── Image Editor — centralized Phosphor icon set ──────────────────────────
// Keep image-editor glyphs on the same quiet, regular-weight icon system as the
// rest of the application. Brand marks are intentionally kept elsewhere.

import React from 'react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowsDownUp,
  ArrowsIn,
  ArrowsOutCardinal,
  Check,
  Circle,
  CircleDashed,
  Copy,
  Crop,
  DownloadSimple,
  Drop,
  Eraser,
  Eye,
  EyeSlash,
  Eyedropper,
  FilePlus,
  FlipHorizontal,
  FlipVertical,
  FloppyDisk,
  FolderOpen,
  Hand,
  Images,
  Lasso,
  Lock,
  LockOpen,
  MagnifyingGlass,
  Minus,
  PaintBrush,
  PaintBucket,
  Palette,
  Plus,
  Scan,
  SelectionAll,
  SlidersHorizontal,
  Sparkle,
  Square,
  Stack,
  Sun,
  TextT,
  Trash,
  MagicWand,
  X,
  type IconProps,
} from '@phosphor-icons/react';

const iconProps: IconProps = { weight: 'regular' };

export const IMG_ICONS = {
  newFile: FilePlus, openFile: FolderOpen, save: FloppyDisk, saveAs: FloppyDisk,
  undo: ArrowCounterClockwise, redo: ArrowClockwise, close: X, back: ArrowLeft,
  sparkles: Sparkle, wand: MagicWand, palette: Palette, rotateCcw: ArrowCounterClockwise,
  rotateCw: ArrowClockwise, flipH: FlipHorizontal, flipV: FlipVertical,
  download: DownloadSimple, check: Check, trash: Trash, plus: Plus, copy: Copy,
  layers: Stack, sliders: SlidersHorizontal, fit: ArrowsIn, zoomIn: MagnifyingGlass,
  zoomOut: MagnifyingGlass, hand: Hand, move: ArrowsOutCardinal, marquee: Scan,
  ellipseMarquee: CircleDashed, lasso: Lasso, crop: Crop, eyedropper: Eyedropper,
  brush: PaintBrush, eraser: Eraser, fill: PaintBucket, text: TextT,
  shapeRect: Square, shapeEllipse: Circle, shapeLine: Minus, zoom: MagnifyingGlass,
  visibilityOn: Eye, visibilityOff: EyeSlash, lock: Lock, unlock: LockOpen,
  mergeDown: ArrowDown, flatten: Images, swap: ArrowsDownUp, selectAll: SelectionAll,
  deselect: X, invert: CircleDashed, brightness: Sun, contrast: SlidersHorizontal,
  saturation: Drop, blur: Drop, grayscale: SlidersHorizontal,
  invertColors: SlidersHorizontal, sepia: SlidersHorizontal,
} as const;

export type ImageIconName = keyof typeof IMG_ICONS;

interface ImgIconProps { name: ImageIconName; className?: string; }

export const ImgIcon: React.FC<ImgIconProps> = ({ name, className }) => {
  const IconComponent = IMG_ICONS[name];
  return <IconComponent {...iconProps} className={className ?? 'h-3.5 w-3.5'} aria-hidden="true" />;
};
