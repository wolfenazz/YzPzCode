import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cellKey, colName, normRange, rangeText, type RangeRef } from '../../utils/sheets/address';
import { parseClipboardText, rangeToHtml, rangeToTsv } from '../../utils/sheets/clipboard';
import { cellDisplay, styleIndexAt } from '../../utils/sheets/display';
import { expandToMerges, stepWithin, mergeAt } from '../../utils/sheets/gridModel';
import { editText, formatValue, parseInput } from '../../utils/sheets/numberFormat';
import { applyOps, type ApplyResult } from '../../utils/sheets/ops';
import type { Op, StylePatch } from '../../utils/sheets/opTypes';
import { validateEntry, type ValidationResult } from '../../utils/sheets/validation';
import { MAX_COLS, MAX_ROWS, type CellStyle, type Workbook } from '../../utils/sheets/types';
import { selectSheetsSession, useSheetsSessionStore, type GridSelection } from '../../stores/sheetsSessionStore';
import type { GridCommands, GridEdit } from './gridTypes';

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export interface EntryAlert {
  validation: ValidationResult;
  row: number;
  col: number;
  text: string;
}

const lastRange = (selection: GridSelection): RangeRef => selection.ranges[selection.ranges.length - 1];

interface InternalClip {
  text: string;
  sheetName: string;
  range: RangeRef;
  cut: boolean;
}

/** The trailing operator that makes a click name a cell while a formula is typed. */
export function wantsReference(text: string): boolean {
  if (!text.startsWith('=')) return false;
  const trimmed = text.replace(/\s+$/, '');
  if (trimmed === '=') return true;
  return /[=(,+\-*/^&<>:;{]$/.test(trimmed);
}

export function useSheetsEditor(workspaceId: string, notify: (text: string, tone?: 'info' | 'error') => void) {
  const session = useSheetsSessionStore(selectSheetsSession(workspaceId));
  const store = useSheetsSessionStore.getState;
  const wb = session.wb;
  const proposal = session.proposal;
  const [peek, setPeek] = useState(false);
  const shown: Workbook | null = proposal && !peek ? proposal.preview : wb;
  // A proposal may add sheets, so the index is clamped to the workbook being shown.
  const sheetIndex = wb ? Math.min(wb.activeSheet, (shown ?? wb).sheets.length - 1) : 0;
  const readOnly = Boolean(proposal);
  const selection = session.selection;
  const [edit, setEdit] = useState<GridEdit | null>(null);
  const [entryAlert, setEntryAlert] = useState<EntryAlert | null>(null);
  const [copied, setCopied] = useState<RangeRef | null>(null);
  const clip = useRef<InternalClip | null>(null);
  const refPick = useRef<{ start: number; end: number } | null>(null);
  const tabOrigin = useRef<{ row: number; col: number } | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [zoomOverrides, setZoomOverrides] = useState<Record<string, number>>({});

  const latest = useRef({ wb, sheetIndex, selection, readOnly, edit, shown });
  latest.current = { wb, sheetIndex, selection, readOnly, edit, shown };

  const sheetName = shown ? shown.sheets[sheetIndex]?.name ?? '' : '';
  const sheetId = shown ? shown.sheets[sheetIndex]?.id ?? '' : '';
  const zoom = (zoomOverrides[sheetId] ?? (shown?.sheets[sheetIndex]?.zoom ?? 100)) / 100;

  // Leaving a sheet or opening another workbook ends an entry in progress.
  useEffect(() => {
    setEdit(null);
    refPick.current = null;
  }, [sheetIndex, session.version]);

  useEffect(() => {
    if (proposal) setEdit(null);
  }, [proposal]);

  const formatCell = useCallback((cell: { v?: number | string | boolean; e?: string }, style: CellStyle): string => (
    cell.e !== undefined ? cell.e : formatValue(cell.v ?? null, style.numFmt).text
  ), []);

  /** Applies operations to the real workbook as one undo step. Returns what the engine said. */
  const apply = useCallback((ops: Op[], options: { coalesce?: string; quiet?: boolean; skipHistory?: boolean } = {}): ApplyResult | null => {
    const { wb: current, readOnly: locked } = latest.current;
    if (!current || locked || ops.length === 0) return null;
    const result = applyOps(current, ops, { formatCell: (cell, style) => formatCell(cell, style) });
    // Opening the new sheet makes an added sheet visible.
    store().commit(workspaceId, result.wb, { coalesce: options.coalesce, skipHistory: options.skipHistory });
    if (result.warnings.length && !options.quiet) notify(result.warnings[0], 'error');
    return result;
  }, [formatCell, notify, store, workspaceId]);

  /** Zoom is a view change: it persists on the sheet (surviving restarts) but never enters the undo history. */
  const setZoom = useCallback((percent: number): void => {
    const next = Math.min(400, Math.max(25, Math.round(percent)));
    setZoomOverrides((current) => ({ ...current, [sheetId]: next }));
    const { shown: view, sheetIndex: index, readOnly: locked } = latest.current;
    const name = view?.sheets[index]?.name;
    if (!view || locked || !name || (view.sheets[index]?.zoom ?? 100) === next) return;
    apply([{ op: 'sheetProps', sheet: name, zoom: next }], { skipHistory: true, quiet: true });
  }, [sheetId, apply]);

  const setSelection = useCallback((next: GridSelection): void => {
    store().setSelection(workspaceId, next);
  }, [store, workspaceId]);

  const select = useCallback((range: RangeRef, active?: { row: number; col: number }): void => {
    const { shown: view, sheetIndex: index } = latest.current;
    const sheet = view?.sheets[index];
    const norm = sheet ? expandToMerges(sheet, normRange(range)) : normRange(range);
    setSelection({ active: active ?? { row: norm.r1, col: norm.c1 }, ranges: [norm] });
  }, [setSelection]);

  // ---- cell editing ----
  const startEdit = useCallback((row: number, col: number, mode: 'enter' | 'edit', initial?: string): void => {
    const { shown: view, sheetIndex: index, readOnly: locked } = latest.current;
    if (!view || locked) return;
    const sheet = view.sheets[index];
    const merge = mergeAt(sheet, row, col);
    const r = merge ? merge.range.r1 : row;
    const c = merge ? merge.range.c1 : col;
    const cell = sheet.cells[cellKey(r, c)];
    const style = view.styles[styleIndexAt(sheet, r, c, cell)] ?? {};
    const text = initial !== undefined ? initial : editText(cell?.v, cell?.f, style.numFmt);
    refPick.current = null;
    setEdit({ row: r, col: c, text, source: 'cell', mode });
  }, []);

  const startBarEdit = useCallback((): void => {
    const { shown: view, sheetIndex: index, selection: sel, readOnly: locked } = latest.current;
    if (!view || locked) return;
    const sheet = view.sheets[index];
    const { row, col } = sel.active;
    const cell = sheet.cells[cellKey(row, col)];
    const style = view.styles[styleIndexAt(sheet, row, col, cell)] ?? {};
    setEdit((current) => current ?? { row, col, text: editText(cell?.v, cell?.f, style.numFmt), source: 'bar', mode: 'edit' });
  }, []);

  const changeEdit = useCallback((text: string): void => {
    refPick.current = null;
    if (latest.current.edit) latest.current.edit = { ...latest.current.edit, text };
    setEdit((current) => (current ? { ...current, text } : current));
  }, []);

  const cancelEdit = useCallback((): void => {
    refPick.current = null;
    // The editor loses focus as it unmounts; that blur must not commit what was cancelled.
    latest.current.edit = null;
    tabOrigin.current = null;
    setEdit(null);
    setFocusTick((tick) => tick + 1);
  }, []);

  const finishEntry = useCallback((current: GridEdit, move: 'down' | 'up' | 'right' | 'left' | 'none'): void => {
    const { wb: committed, sheetIndex: index, selection: sel } = latest.current;
    if (!committed) return;
    const sheet = committed.sheets[index];
    const typed = parseInput(current.text, committed.styles[styleIndexAt(sheet, current.row, current.col, sheet.cells[cellKey(current.row, current.col)])]?.numFmt);
    const original = sheet.cells[cellKey(current.row, current.col)];
    const unchanged = typed.kind === 'formula' ? original?.f === typed.formula
      : typed.kind === 'empty' ? original?.v === undefined && original?.f === undefined
        : original?.f === undefined && original?.v === (typed.value as unknown);
    if (!unchanged) {
      const value = typed.kind === 'empty' ? null : typed.kind === 'formula' ? null : (typed.value as string | number | boolean);
      if (typed.kind !== 'formula') {
        const check = validateEntry(committed, index, current.row, current.col, value);
        if (!check.ok && check.style === 'stop') {
          setEntryAlert({ validation: check, row: current.row, col: current.col, text: current.text });
          return;
        }
      }
      apply([{ op: 'setValues', sheet: sheet.name, at: cellKey(current.row, current.col), values: [[current.text === '' ? null : current.text]], parse: true }], { coalesce: 'typing' });
    }
    refPick.current = null;
    latest.current.edit = null;
    setEdit(null);
    if (move === 'right' || move === 'left') {
      // A run of Tab entries remembers where it began, so Enter returns there like Excel.
      if (tabOrigin.current === null) tabOrigin.current = { row: current.row, col: current.col };
    }
    if (move === 'down' && tabOrigin.current && !(lastRange(sel).r1 !== lastRange(sel).r2 || lastRange(sel).c1 !== lastRange(sel).c2)) {
      const origin = tabOrigin.current;
      tabOrigin.current = null;
      select({ r1: current.row + 1, c1: origin.col, r2: current.row + 1, c2: origin.col });
      setFocusTick((tick) => tick + 1);
      return;
    }
    if (move === 'down' || move === 'up' || move === 'none') tabOrigin.current = null;
    if (move !== 'none') {
      const range = lastRange(sel);
      const multi = range.r1 !== range.r2 || range.c1 !== range.c2;
      const axis = move === 'down' || move === 'up' ? 'row' : 'col';
      const direction = move === 'down' || move === 'right' ? 'next' : 'previous';
      const here = { row: current.row, col: current.col };
      if (multi) setSelection({ active: stepWithin(range, here, direction, axis), ranges: sel.ranges });
      else {
        const next = stepWithin({ r1: here.row, c1: here.col, r2: here.row, c2: here.col }, here, direction, axis);
        select({ r1: next.row, c1: next.col, r2: next.row, c2: next.col });
      }
    }
    setFocusTick((tick) => tick + 1);
  }, [apply, select, setSelection]);

  const commitEdit = useCallback((move: 'down' | 'up' | 'right' | 'left' | 'none'): void => {
    const current = latest.current.edit;
    if (!current) return;
    finishEntry(current, move);
  }, [finishEntry]);

  const acceptAlert = useCallback((action: 'retry' | 'cancel' | 'keep'): void => {
    const pending = entryAlert;
    setEntryAlert(null);
    if (!pending) return;
    if (action === 'cancel') cancelEdit();
    else if (action === 'keep') {
      // The entry goes in despite the rule (a warning the user accepted).
      const { wb: committed, sheetIndex: index } = latest.current;
      if (committed) apply([{ op: 'setValues', sheet: committed.sheets[index].name, at: cellKey(pending.row, pending.col), values: [[pending.text]], parse: true }], { coalesce: 'typing' });
      setEdit(null);
    }
  }, [apply, cancelEdit, entryAlert]);

  const referenceMode = useCallback((): boolean => {
    const current = latest.current.edit;
    return Boolean(current && wantsReference(refPick.current ? current.text.slice(0, refPick.current.start) : current.text));
  }, []);

  const insertReference = useCallback((range: RangeRef): void => {
    const current = latest.current.edit;
    if (!current) return;
    const norm = normRange(range);
    const single = norm.r1 === norm.r2 && norm.c1 === norm.c2;
    const text = single ? cellKey(norm.r1, norm.c1) : `${cellKey(norm.r1, norm.c1)}:${cellKey(norm.r2, norm.c2)}`;
    const pick = refPick.current;
    // A second click or a drag replaces the reference just inserted instead of adding another.
    const start = pick ? pick.start : current.text.length;
    const end = pick ? pick.end : current.text.length;
    const next = { ...current, text: current.text.slice(0, start) + text + current.text.slice(end) };
    refPick.current = { start, end: start + text.length };
    latest.current.edit = next;
    setEdit(next);
  }, []);

  // ---- clipboard ----
  const copySelection = useCallback((event: ClipboardEvent | null, cut: boolean): void => {
    const { shown: view, sheetIndex: index, selection: sel } = latest.current;
    if (!view) return;
    const sheet = view.sheets[index];
    const range = lastRange(sel);
    const clampedR2 = Math.min(range.r2, range.r1 + 5000);
    const clampedC2 = Math.min(range.c2, range.c1 + 200);
    if (clampedR2 !== range.r2 || clampedC2 !== range.c2) notify(`Copied the first ${clampedR2 - range.r1 + 1} rows × ${clampedC2 - range.c1 + 1} columns; the selection was larger.`);
    const clamped = { ...range, r2: clampedR2, c2: clampedC2 };
    const tsv = rangeToTsv(view, sheet, clamped);
    const html = rangeToHtml(view, sheet, clamped);
    if (event?.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', tsv);
      event.clipboardData.setData('text/html', html);
    } else {
      void navigator.clipboard?.write?.([new ClipboardItem({
        'text/plain': new Blob([tsv], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]).catch(() => navigator.clipboard.writeText(tsv));
    }
    clip.current = { text: tsv, sheetName: sheet.name, range: normRange(range), cut: cut && !latest.current.readOnly };
    setCopied(normRange(range));
  }, [notify]);

  const pasteInto = useCallback((text: string, mode: 'all' | 'values' | 'formats' = 'all'): void => {
    const { shown: view, wb: committed, sheetIndex: index, selection: sel, readOnly: locked } = latest.current;
    if (!view || !committed || locked) return;
    const sheet = committed.sheets[index];
    const target = lastRange(sel);
    const origin = { row: target.r1, col: target.c1 };
    const internal = clip.current;
    const same = (value: string): string => value.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (internal && same(internal.text) === same(text)) {
      const size = { rows: internal.range.r2 - internal.range.r1 + 1, cols: internal.range.c2 - internal.range.c1 + 1 };
      const targetRows = target.r2 - target.r1 + 1;
      const targetCols = target.c2 - target.c1 + 1;
      // A selection that is a whole multiple of the copied block tiles it, like Excel.
      const tilesDown = targetRows % size.rows === 0 ? targetRows / size.rows : 1;
      const tilesAcross = targetCols % size.cols === 0 ? targetCols / size.cols : 1;
      const ops: Op[] = [];
      for (let tr = 0; tr < tilesDown; tr += 1) {
        for (let tc = 0; tc < tilesAcross; tc += 1) {
          const to = cellKey(origin.row + tr * size.rows, origin.col + tc * size.cols);
          if (internal.cut) ops.push({ op: 'move', sheet: internal.sheetName, range: rangeText(internal.range), to, toSheet: sheet.name });
          else ops.push({ op: 'copy', sheet: internal.sheetName, range: rangeText(internal.range), to, toSheet: sheet.name, what: mode });
        }
      }
      apply(ops);
      if (internal.cut) {
        clip.current = null;
        setCopied(null);
      }
      select({ r1: origin.row, c1: origin.col, r2: origin.row + size.rows * tilesDown - 1, c2: origin.col + size.cols * tilesAcross - 1 }, { row: origin.row, col: origin.col });
      return;
    }
    const rows = parseClipboardText(text);
    if (rows.length === 0) return;
    const single = rows.length === 1 && rows[0].length === 1;
    const targetRows = target.r2 - target.r1 + 1;
    const targetCols = target.c2 - target.c1 + 1;
    if (single && (targetRows > 1 || targetCols > 1)) {
      const fillRows = Math.min(targetRows, 2000);
      const fillCols = Math.min(targetCols, 100);
      if (fillRows !== targetRows || fillCols !== targetCols) notify(`Filled ${fillRows} rows × ${fillCols} columns; the target was larger.`);
      const filled = Array.from({ length: fillRows }, () => Array.from({ length: fillCols }, () => rows[0][0]));
      apply([{ op: 'setValues', sheet: sheet.name, at: cellKey(origin.row, origin.col), values: filled, parse: true }]);
      return;
    }
    apply([{ op: 'setValues', sheet: sheet.name, at: cellKey(origin.row, origin.col), values: rows.map((row) => row.map((cell) => (cell === '' ? null : cell))), parse: true }]);
    select({ r1: origin.row, c1: origin.col, r2: origin.row + rows.length - 1, c2: origin.col + Math.max(...rows.map((r) => r.length)) - 1 }, { row: origin.row, col: origin.col });
  }, [apply, notify, select]);

  const pasteFromClipboard = useCallback(async (mode: 'all' | 'values' | 'formats' = 'all'): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText();
      pasteInto(text, mode);
    } catch {
      notify('Paste with Ctrl+V; the browser blocked reading the clipboard.', 'info');
    }
  }, [notify, pasteInto]);

  // ---- styles and structure ----
  const targets = useCallback((): RangeRef[] => latest.current.selection.ranges, []);

  const patchStyle = useCallback((patch: StylePatch): void => {
    const { shown: view, sheetIndex: index } = latest.current;
    if (!view) return;
    const name = view.sheets[index].name;
    apply(targets().map((range) => ({ op: 'format' as const, sheet: name, range: rangeText(range), style: patch })));
  }, [apply, targets]);

  const activeStyle = useMemo((): CellStyle => {
    if (!shown) return {};
    const sheet = shown.sheets[sheetIndex];
    if (!sheet) return {};
    const { row, col } = selection.active;
    return shown.styles[styleIndexAt(sheet, row, col, sheet.cells[cellKey(row, col)])] ?? {};
  }, [shown, sheetIndex, selection.active]);

  const toggle = useCallback((kind: 'bold' | 'italic' | 'underline' | 'strike'): void => {
    const current = Boolean(activeStyle.font?.[kind]);
    patchStyle({ font: { [kind]: current ? null : true } });
  }, [activeStyle, patchStyle]);

  const structure = useCallback((action: 'insertRows' | 'deleteRows' | 'insertCols' | 'deleteCols' | 'hideRows' | 'hideCols' | 'showRows' | 'showCols'): void => {
    const { shown: view, sheetIndex: index, selection: sel } = latest.current;
    if (!view) return;
    const name = view.sheets[index].name;
    const range = normRange(lastRange(sel));
    const rowsCount = Math.min(range.r2 - range.r1 + 1, MAX_ROWS);
    const colsCount = Math.min(range.c2 - range.c1 + 1, MAX_COLS);
    switch (action) {
      case 'insertRows': apply([{ op: 'insertRows', sheet: name, at: range.r1 + 1, count: rowsCount }]); break;
      case 'deleteRows': apply([{ op: 'deleteRows', sheet: name, at: range.r1 + 1, count: rowsCount }]); break;
      case 'insertCols': apply([{ op: 'insertCols', sheet: name, at: range.c1 + 1, count: colsCount }]); break;
      case 'deleteCols': apply([{ op: 'deleteCols', sheet: name, at: range.c1 + 1, count: colsCount }]); break;
      case 'hideRows': apply([{ op: 'visibility', sheet: name, rows: `${range.r1 + 1}:${range.r2 + 1}`, hidden: true }]); break;
      case 'showRows': apply([{ op: 'visibility', sheet: name, rows: `${Math.max(1, range.r1)}:${range.r2 + 2}`, hidden: false }]); break;
      case 'hideCols': apply([{ op: 'visibility', sheet: name, cols: `${colName(range.c1)}:${colName(range.c2)}`, hidden: true }]); break;
      case 'showCols': apply([{ op: 'visibility', sheet: name, cols: `${colName(Math.max(0, range.c1 - 1))}:${colName(range.c2 + 1)}`, hidden: false }]); break;
    }
  }, [apply]);

  const clearSelection = useCallback((what: 'contents' | 'all' | 'formats' = 'contents'): void => {
    const { shown: view, sheetIndex: index } = latest.current;
    if (!view) return;
    const name = view.sheets[index].name;
    apply(targets().map((range) => ({ op: 'clear' as const, sheet: name, range: rangeText(range), what })));
  }, [apply, targets]);

  const fill = useCallback((direction: 'down' | 'right'): void => {
    const { shown: view, sheetIndex: index, selection: sel } = latest.current;
    if (!view) return;
    const name = view.sheets[index].name;
    const range = normRange(lastRange(sel));
    if (direction === 'down') {
      if (range.r1 === range.r2) return;
      apply([{ op: 'fill', sheet: name, source: rangeText({ ...range, r2: range.r1 }), target: rangeText(range) }]);
    } else {
      if (range.c1 === range.c2) return;
      apply([{ op: 'fill', sheet: name, source: rangeText({ ...range, c2: range.c1 }), target: rangeText(range) }]);
    }
  }, [apply]);

  const resizeAxis = useCallback((axis: 'col' | 'row', indexes: number[], size: number | 'auto'): void => {
    const { shown: view, sheetIndex: index } = latest.current;
    if (!view || latest.current.readOnly || indexes.length === 0) return;
    const name = view.sheets[index].name;
    const sorted = [...indexes].sort((a, b) => a - b);
    if (axis === 'col') {
      const spec = sorted.length > 1 ? `${colName(sorted[0])}:${colName(sorted[sorted.length - 1])}` : colName(sorted[0]);
      apply([{ op: 'colWidth', sheet: name, cols: spec, width: size === 'auto' ? 'auto' : Math.max(0, Math.round(size * 100) / 100) }]);
    } else {
      const spec = sorted.length > 1 ? `${sorted[0] + 1}:${sorted[sorted.length - 1] + 1}` : String(sorted[0] + 1);
      apply([{ op: 'rowHeight', sheet: name, rows: spec, height: size === 'auto' ? 'auto' : Math.max(0, Math.round(size * 10) / 10) }]);
    }
  }, [apply]);

  const autosum = useCallback((): void => {
    const { shown: view, sheetIndex: index, selection: sel } = latest.current;
    if (!view) return;
    const sheet = view.sheets[index];
    const range = normRange(lastRange(sel));
    const single = range.r1 === range.r2 && range.c1 === range.c2;
    if (!single) {
      // The row or column of totals goes under or beside the selection.
      const ops: Op[] = [];
      if (range.r2 - range.r1 >= 1 || range.c2 - range.c1 === 0) {
        for (let c = range.c1; c <= range.c2; c += 1) ops.push({ op: 'setValues', sheet: sheet.name, at: cellKey(range.r2 + 1, c), values: [[`=SUM(${cellKey(range.r1, c)}:${cellKey(range.r2, c)})`]] });
      } else ops.push({ op: 'setValues', sheet: sheet.name, at: cellKey(range.r1, range.c2 + 1), values: [[`=SUM(${rangeText(range)})`]] });
      apply(ops);
      return;
    }
    // One cell: sum the run of numbers above it, else to its left.
    const { row, col } = sel.active;
    let top = row - 1;
    while (top >= 0 && typeof sheet.cells[cellKey(top, col)]?.v === 'number') top -= 1;
    if (top < row - 1) {
      apply([{ op: 'setValues', sheet: sheet.name, at: cellKey(row, col), values: [[`=SUM(${cellKey(top + 1, col)}:${cellKey(row - 1, col)})`]] }]);
      return;
    }
    let left = col - 1;
    while (left >= 0 && typeof sheet.cells[cellKey(row, left)]?.v === 'number') left -= 1;
    if (left < col - 1) apply([{ op: 'setValues', sheet: sheet.name, at: cellKey(row, col), values: [[`=SUM(${cellKey(row, left + 1)}:${cellKey(row, col - 1)})`]] }]);
    else startEdit(row, col, 'edit', '=SUM(');
  }, [apply, startEdit]);

  const insertDate = useCallback((withTime: boolean): void => {
    const { shown: view, sheetIndex: index, selection: sel } = latest.current;
    if (!view) return;
    const now = new Date();
    const text = withTime
      ? `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    apply([{ op: 'setValues', sheet: view.sheets[index].name, at: cellKey(sel.active.row, sel.active.col), values: [[text]], parse: true }]);
  }, [apply]);

  // Controls that need dialogs are provided by the workspace.
  const handlers = useRef<{ find: (replace: boolean) => void; contextMenu: GridCommands['contextMenu']; save: () => void; openLink: (url: string) => void }>({
    find: () => undefined, contextMenu: () => undefined, save: () => undefined, openLink: () => undefined,
  });

  const commands = useMemo((): GridCommands => ({
    // A cut marks the cells; they move when pasted.
    onCopy: (event, cut) => copySelection(event, cut),
    onPaste: (event) => {
      event.preventDefault();
      pasteInto(event.clipboardData?.getData('text/plain') ?? '');
    },
    clear: () => clearSelection('contents'),
    fill,
    undo: () => store().undo(workspaceId),
    redo: () => store().redo(workspaceId),
    toggle: (kind) => toggle(kind),
    autosum,
    find: (replace) => handlers.current.find(replace),
    insertDate,
    save: () => handlers.current.save(),
    contextMenu: (position, target) => handlers.current.contextMenu(position, target),
    fillRange: (source, target) => {
      const { shown: view, sheetIndex: index } = latest.current;
      if (view) apply([{ op: 'fill', sheet: view.sheets[index].name, source: rangeText(source), target: rangeText(target) }]);
    },
    resize: resizeAxis,
    pick: (row, col, value) => {
      const { shown: view, sheetIndex: index } = latest.current;
      if (view) apply([{ op: 'setValues', sheet: view.sheets[index].name, at: cellKey(row, col), values: [[value]], parse: true }]);
    },
    openLink: (url) => handlers.current.openLink(url),
  }), [apply, autosum, clearSelection, copySelection, fill, insertDate, pasteInto, resizeAxis, store, toggle, workspaceId]);

  const display = useMemo(() => {
    if (!shown) return null;
    const sheet = shown.sheets[sheetIndex];
    if (!sheet) return null;
    return cellDisplay(shown, sheet, selection.active.row, selection.active.col);
  }, [shown, sheetIndex, selection.active.row, selection.active.col]);

  const activeCell = shown?.sheets[sheetIndex]?.cells[cellKey(selection.active.row, selection.active.col)];
  const activeText = edit ? edit.text : editText(activeCell?.v, activeCell?.f, activeStyle.numFmt);

  return {
    session, wb, shown, sheetIndex, sheetName, readOnly, proposal, peek, setPeek,
    selection, setSelection, select, edit, startEdit, startBarEdit, changeEdit, commitEdit, cancelEdit, entryAlert, acceptAlert,
    referenceMode, insertReference, copied, setCopied, copySelection, pasteInto, pasteFromClipboard,
    apply, patchStyle, toggle, activeStyle, activeText, activeCell, display, structure, clearSelection, fill, autosum, resizeAxis,
    commands, handlers, focusTick, requestFocus: () => setFocusTick((tick) => tick + 1), zoom, setZoom,
    activateSheet: (index: number) => store().setActiveSheet(workspaceId, index),
  };
}

export type SheetsEditor = ReturnType<typeof useSheetsEditor>;
