export type TerminalLayoutPreset = 'grid' | 'columns' | 'rows' | 'focus-left' | 'focus-right' | 'focus-top' | 'focus-bottom';

export interface TerminalLayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TERMINAL_LAYOUT_PRESETS: { id: TerminalLayoutPreset; label: string }[] = [
  { id: 'grid', label: 'Balanced' },
  { id: 'columns', label: 'Columns' },
  { id: 'rows', label: 'Rows' },
  { id: 'focus-left', label: 'Focus left' },
  { id: 'focus-right', label: 'Focus right' },
  { id: 'focus-top', label: 'Focus top' },
  { id: 'focus-bottom', label: 'Focus bottom' },
];

/** Unit rectangles; callers inset the cells to create pixel-sized gutters. */
export function getTerminalLayoutRects(preset: TerminalLayoutPreset, count: number, focusedIndex: number): TerminalLayoutRect[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: 0, width: 1, height: 1 }];
  const focus = Math.max(0, Math.min(count - 1, focusedIndex));
  const columns = preset === 'columns' ? count : preset === 'rows' ? 1 : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => {
    if (!preset.startsWith('focus-')) {
      return { x: (index % columns) / columns, y: Math.floor(index / columns) / rows, width: 1 / columns, height: 1 / rows };
    }
    const horizontal = preset === 'focus-left' || preset === 'focus-right';
    const reversed = preset === 'focus-right' || preset === 'focus-bottom';
    const main = index === focus;
    const otherIndex = index < focus ? index : index - 1;
    const majorSize = main ? 0.7 : 0.3;
    const majorStart = main ? (reversed ? 0.3 : 0) : (reversed ? 0 : 0.7);
    const minorSize = main ? 1 : 1 / (count - 1);
    const minorStart = main ? 0 : otherIndex / (count - 1);
    return horizontal
      ? { x: majorStart, y: minorStart, width: majorSize, height: minorSize }
      : { x: minorStart, y: majorStart, width: minorSize, height: majorSize };
  });
}
