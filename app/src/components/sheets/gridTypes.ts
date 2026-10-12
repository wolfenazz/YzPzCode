import type { RangeRef } from '../../utils/sheets/address';

/** The cell being edited, in the grid or in the formula bar. */
export interface GridEdit {
  row: number;
  col: number;
  text: string;
  source: 'cell' | 'bar';
  /** `enter`: arrow keys finish the entry; `edit`: arrow keys move the caret. */
  mode: 'enter' | 'edit';
  /** Where the caret sits, when the other editor changed the text. */
  caret?: number;
}

export type ContextTarget =
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'col'; index: number }
  | { kind: 'row'; index: number };

export interface GridCommands {
  onCopy: (event: ClipboardEvent, cut: boolean) => void;
  onPaste: (event: ClipboardEvent) => void;
  clear: () => void;
  fill: (direction: 'down' | 'right') => void;
  undo: () => void;
  redo: () => void;
  toggle: (kind: 'bold' | 'italic' | 'underline') => void;
  autosum: () => void;
  find: (replace: boolean) => void;
  insertDate: (withTime: boolean) => void;
  save: () => void;
  contextMenu: (position: { x: number; y: number }, target: ContextTarget) => void;
  /** Fills `source` out to `target` (fill handle). */
  fillRange: (source: RangeRef, target: RangeRef) => void;
  /** Sets a width (columns) or height (rows) in the unit of the file (`auto` fits the content). */
  resize: (axis: 'col' | 'row', indexes: number[], size: number | 'auto') => void;
  /** A value picked from a validation list. */
  pick: (row: number, col: number, value: string) => void;
  openLink: (url: string) => void;
}
