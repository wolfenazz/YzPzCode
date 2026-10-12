import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cellKey, normRange, type RangeRef } from '../../utils/sheets/address';
import { CfEvaluator } from '../../utils/sheets/cfEngine';
import { cellDisplay } from '../../utils/sheets/display';
import { ctrlArrow, currentRegion, expandToMerges, mergeAt, sheetAxes, stepWithin, usedBounds } from '../../utils/sheets/gridModel';
import { listRefs } from '../../utils/sheets/formula/refs';
import { MAX_COLS, MAX_ROWS, type Workbook } from '../../utils/sheets/types';
import { validationAt, listOptions } from '../../utils/sheets/validation';
import type { GridSelection } from '../../stores/sheetsSessionStore';
import { FunctionHints } from './FunctionHints';
import type { OverlayApi } from './ChartLayer';
import { colScreenX, computeLayout, readGridTheme, renderGrid, rowScreenY, type GridTheme, type Layout } from './gridRender';
import type { ContextTarget, GridCommands, GridEdit } from './gridTypes';

export const REFERENCE_COLORS = ['#3b82f6', '#e5484d', '#8e4ec6', '#2f9e68', '#d9822b', '#0aa5a8'];

interface SheetGridProps {
  wb: Workbook;
  sheetIndex: number;
  selection: GridSelection;
  edit: GridEdit | null;
  zoom: number;
  readOnly: boolean;
  tint: Set<string> | null;
  copied: RangeRef | null;
  showFormulas: boolean;
  commands: GridCommands;
  onSelect: (selection: GridSelection) => void;
  onEditStart: (row: number, col: number, mode: 'enter' | 'edit', initial?: string) => void;
  onEditChange: (text: string) => void;
  /** Finishes the entry and moves the selection. */
  onEditCommit: (move: 'down' | 'up' | 'right' | 'left' | 'none') => void;
  onEditCancel: () => void;
  /** While a formula is edited, a click names a cell instead of selecting it. */
  referenceMode: () => boolean;
  onReference: (range: RangeRef, extend: boolean) => void;
  /** Bumped when the surrounding view wants the grid to take focus. */
  focusTick: number;
  /** Drawn over the cells (charts). */
  overlay?: (api: OverlayApi) => React.ReactNode;
}

const HIT = 4;

const single = (row: number, col: number): RangeRef => ({ r1: row, c1: col, r2: row, c2: col });

function useSize(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 800, h: 480 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = (): void => setSize({ w: Math.max(100, el.clientWidth), h: Math.max(80, el.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export const SheetGrid: React.FC<SheetGridProps> = (props) => {
  const { wb, sheetIndex, selection, edit, zoom, readOnly, tint, copied, showFormulas, commands } = props;
  const sheet = wb.sheets[sheetIndex];
  const scroller = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const size = useSize(scroller);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [theme, setTheme] = useState<GridTheme | null>(null);
  const [drag, setDrag] = useState<null | { kind: 'select' | 'fill' | 'col' | 'row' | 'resize'; guide?: { axis: 'col' | 'row'; at: number } }>(null);
  const dragRef = useRef<{ kind: string; anchor: { row: number; col: number }; source?: RangeRef; index?: number; start?: number; startSize?: number; moved?: boolean } | null>(null);
  const [fillPreview, setFillPreview] = useState<RangeRef | null>(null);
  const [listMenu, setListMenu] = useState<{ row: number; col: number; options: string[]; x: number; y: number } | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const [extentBoost, setExtentBoost] = useState(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const axes = useMemo(() => sheetAxes(sheet), [sheet.cols, sheet.rows, sheet.defaultColWidth, sheet.defaultRowHeight]); // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => usedBounds(sheet), [sheet.cells]); // eslint-disable-line react-hooks/exhaustive-deps
  const cf = useMemo(() => (sheet.cf.length ? new CfEvaluator(wb, sheetIndex) : null), [wb, sheetIndex, sheet.cf]);
  const headings = sheet.headings !== false;
  const frozenCols = sheet.freeze?.cols ?? 0;
  const frozenRows = sheet.freeze?.rows ?? 0;
  const rtl = Boolean(sheet.rtl);

  // Scrollable extent: the data plus room to keep going.
  const extentCols = Math.min(MAX_COLS, Math.max(30, bounds.cols + 10, selection.active.col + 6, frozenCols + 20) + extentBoost);
  const extentRows = Math.min(MAX_ROWS, Math.max(120, bounds.rows + 40, selection.active.row + 25, frozenRows + 60) + extentBoost * 4);
  const headerW = headings ? Math.max(40, 12 + String(extentRows).length * 8) * zoom : 0;
  const headerH = headings ? 22 * zoom : 0;
  const frozenW = axes.cols.offset(frozenCols) * zoom;
  const frozenH = axes.rows.offset(frozenRows) * zoom;
  const spacerW = headerW + frozenW + (axes.cols.offset(extentCols) - axes.cols.offset(frozenCols)) * zoom;
  const spacerH = headerH + frozenH + (axes.rows.offset(extentRows) - axes.rows.offset(frozenRows)) * zoom;

  useEffect(() => {
    if (!frame.current) return;
    setTheme(readGridTheme(frame.current));
    const observer = new MutationObserver(() => frame.current && setTheme(readGridTheme(frame.current)));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, []);

  const references = useMemo(() => {
    if (!edit || !edit.text.startsWith('=')) return [];
    return listRefs(edit.text.slice(1)).filter((ref) => ref.sheet === undefined || ref.sheet.toLowerCase() === sheet.name.toLowerCase()).map((ref, index) => ({
      range: { r1: ref.parts.r1, c1: ref.parts.c1, r2: ref.parts.r2, c2: ref.parts.c2 },
      color: REFERENCE_COLORS[index % REFERENCE_COLORS.length],
    }));
  }, [edit, sheet.name]);

  // ---- drawing ----
  const draw = useCallback(() => {
    const el = canvas.current;
    if (!el || !theme) return;
    const dpr = window.devicePixelRatio || 1;
    if (el.width !== Math.round(size.w * dpr) || el.height !== Math.round(size.h * dpr)) {
      el.width = Math.round(size.w * dpr);
      el.height = Math.round(size.h * dpr);
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    layoutRef.current = renderGrid({
      ctx, width: size.w, height: size.h, dpr, wb, sheet, sheetIndex, zoom, scrollX: scroll.x, scrollY: scroll.y,
      selection: fillPreview ? { ...selection, ranges: [...selection.ranges.slice(0, -1), fillPreview] } : selection,
      theme, tint, editing: edit ? { row: edit.row, col: edit.col } : null, copied, references, showFormulas, cf,
    });
  }, [theme, size, wb, sheet, sheetIndex, zoom, scroll, selection, fillPreview, tint, edit, copied, references, showFormulas, cf]);

  const raf = useRef(0);
  useLayoutEffect(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [draw]);

  const onScroll = (): void => {
    const el = scroller.current;
    if (!el) return;
    setScroll({ x: el.scrollLeft, y: el.scrollTop });
    if (el.scrollLeft + el.clientWidth > el.scrollWidth - 120 || el.scrollTop + el.clientHeight > el.scrollHeight - 120) {
      setExtentBoost((boost) => Math.min(boost + 10, 4000));
    }
  };

  // Reset the scroll position when the sheet changes.
  useEffect(() => {
    const el = scroller.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
    setScroll({ x: 0, y: 0 });
    setExtentBoost(0);
  }, [sheetIndex]);

  // ---- geometry ----
  const toLogicalX = useCallback((px: number): number => (rtl ? size.w - px : px), [rtl, size.w]);

  /** Column at a screen x, with the fractional part inside the column. */
  const colAt = useCallback((px: number): number => {
    const x = toLogicalX(px);
    if (x < headerW + frozenW && frozenCols > 0 && x >= headerW) return Math.min(frozenCols - 1, axes.cols.indexAt((x - headerW) / zoom, MAX_COLS));
    const logical = axes.cols.offset(frozenCols) + (x - headerW - frozenW + scroll.x) / zoom;
    return axes.cols.indexAt(Math.max(0, logical), MAX_COLS);
  }, [axes, frozenCols, frozenW, headerW, scroll.x, toLogicalX, zoom]);

  const rowAt = useCallback((py: number): number => {
    if (py < headerH + frozenH && frozenRows > 0 && py >= headerH) return Math.min(frozenRows - 1, axes.rows.indexAt((py - headerH) / zoom, MAX_ROWS));
    const logical = axes.rows.offset(frozenRows) + (py - headerH - frozenH + scroll.y) / zoom;
    return axes.rows.indexAt(Math.max(0, logical), MAX_ROWS);
  }, [axes, frozenRows, frozenH, headerH, scroll.y, zoom]);

  const layout = (): Layout => layoutRef.current ?? computeLayout(sheet, size.w, size.h, zoom, scroll.x, scroll.y, headings);

  const cellRect = useCallback((row: number, col: number): { x: number; y: number; w: number; h: number } => {
    const l = layoutRef.current ?? computeLayout(sheet, size.w, size.h, zoom, scroll.x, scroll.y, headings);
    const merge = mergeAt(sheet, row, col);
    const r = merge ? merge.range : single(row, col);
    const x = colScreenX(sheet, l, zoom, scroll.x, r.c1);
    const y = rowScreenY(sheet, l, zoom, scroll.y, r.r1);
    const w = (axes.cols.offset(r.c2 + 1) - axes.cols.offset(r.c1)) * zoom;
    const h = (axes.rows.offset(r.r2 + 1) - axes.rows.offset(r.r1)) * zoom;
    return { x: rtl ? size.w - x - w : x, y, w, h };
  }, [axes, headings, rtl, scroll.x, scroll.y, sheet, size.h, size.w, zoom]);

  // Keep the active cell visible.
  const lastActive = useRef({ row: -1, col: -1, sheet: -1 });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const { row, col } = selection.active;
    if (lastActive.current.row === row && lastActive.current.col === col && lastActive.current.sheet === sheetIndex) return;
    lastActive.current = { row, col, sheet: sheetIndex };
    const merge = mergeAt(sheet, row, col);
    const r = merge ? merge.range : single(row, col);
    if (col >= frozenCols) {
      const left = (axes.cols.offset(r.c1) - axes.cols.offset(frozenCols)) * zoom;
      const right = (axes.cols.offset(r.c2 + 1) - axes.cols.offset(frozenCols)) * zoom;
      const viewport = el.clientWidth - headerW - frozenW;
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + viewport) el.scrollLeft = right - viewport;
    }
    if (row >= frozenRows) {
      const top = (axes.rows.offset(r.r1) - axes.rows.offset(frozenRows)) * zoom;
      const bottom = (axes.rows.offset(r.r2 + 1) - axes.rows.offset(frozenRows)) * zoom;
      const viewport = el.clientHeight - headerH - frozenH;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bottom > el.scrollTop + viewport) el.scrollTop = bottom - viewport;
    }
  }, [axes, frozenCols, frozenH, frozenRows, frozenW, headerH, headerW, selection.active, sheet, sheetIndex, zoom]);

  // Focus follows requests from outside (after a ribbon command or a closed dialog).
  useEffect(() => {
    if (!edit) scroller.current?.focus({ preventScroll: true });
  }, [props.focusTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the editor when an edit begins in the grid.
  useEffect(() => {
    if (edit && edit.source === 'cell') {
      const el = editor.current;
      if (el && document.activeElement !== el) {
        el.focus({ preventScroll: true });
        const end = edit.caret ?? el.value.length;
        el.setSelectionRange(end, end);
      }
    }
  }, [edit?.row, edit?.col, edit?.source]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- selection helpers ----
  const select = (range: RangeRef, active: { row: number; col: number }, add = false): void => {
    const expanded = expandToMerges(sheet, normRange(range));
    props.onSelect({ active, ranges: add ? [...selection.ranges, expanded] : [expanded] });
  };

  const extendTo = (row: number, col: number): void => {
    const anchor = dragRef.current?.anchor ?? selection.active;
    const range = { r1: anchor.row, c1: anchor.col, r2: row, c2: col };
    props.onSelect({ active: selection.active, ranges: [...selection.ranges.slice(0, -1), expandToMerges(sheet, normRange(range))] });
  };

  // ---- mouse ----
  const localPoint = (event: React.MouseEvent | MouseEvent): { x: number; y: number } => {
    const rect = frame.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const edgeHit = (x: number, y: number): { axis: 'col' | 'row'; index: number } | null => {
    const lx = toLogicalX(x);
    if (headings && y < headerH && lx > headerW) {
      const col = colAt(x);
      const right = colScreenX(sheet, layout(), zoom, scroll.x, col) + axes.cols.size(col) * zoom;
      if (Math.abs(lx - right) <= HIT) return { axis: 'col', index: col };
      const left = colScreenX(sheet, layout(), zoom, scroll.x, col);
      if (Math.abs(lx - left) <= HIT && col > 0) return { axis: 'col', index: col - 1 };
    }
    if (headings && lx < headerW && y > headerH) {
      const row = rowAt(y);
      const bottom = rowScreenY(sheet, layout(), zoom, scroll.y, row) + axes.rows.size(row) * zoom;
      if (Math.abs(y - bottom) <= HIT) return { axis: 'row', index: row };
    }
    return null;
  };

  const fillHandleAt = (x: number, y: number): boolean => {
    const last = selection.ranges[selection.ranges.length - 1];
    if (!last) return false;
    const l = layout();
    const x1 = colScreenX(sheet, l, zoom, scroll.x, last.c1);
    const w = (axes.cols.offset(last.c2 + 1) - axes.cols.offset(last.c1)) * zoom;
    const y1 = rowScreenY(sheet, l, zoom, scroll.y, last.r1);
    const h = (axes.rows.offset(last.r2 + 1) - axes.rows.offset(last.r1)) * zoom;
    const hx = rtl ? size.w - (x1 + w) : x1 + w;
    return Math.abs(x - hx) <= 5 && Math.abs(y - (y1 + h)) <= 5;
  };

  const onMouseDown = (event: React.MouseEvent): void => {
    if (event.button === 2) return;
    if (event.button !== 0) return;
    const { x, y } = localPoint(event);
    if (x > size.w || y > size.h) return;
    setListMenu(null);
    // While a formula is typed a click names a cell, so the editor keeps focus and the entry stays open.
    const naming = Boolean(edit) && props.referenceMode();
    if (edit && !naming) props.onEditCommit('none');
    if (!naming) scroller.current?.focus({ preventScroll: true });
    const lx = toLogicalX(x);

    const edge = edgeHit(x, y);
    if (edge && !readOnly) {
      const startSize = (edge.axis === 'col' ? axes.cols.size(edge.index) : axes.rows.size(edge.index)) / 1;
      if (event.detail >= 2) {
        commands.resize(edge.axis, [edge.index], 'auto');
        return;
      }
      dragRef.current = { kind: 'resize', anchor: { row: 0, col: 0 }, index: edge.index, start: edge.axis === 'col' ? lx : y, startSize };
      setDrag({ kind: 'resize', guide: { axis: edge.axis, at: edge.axis === 'col' ? x : y } });
      (dragRef.current as { axis?: string }).axis = edge.axis;
      return;
    }
    if (fillHandleAt(x, y) && !readOnly && !edit) {
      const last = selection.ranges[selection.ranges.length - 1];
      dragRef.current = { kind: 'fill', anchor: selection.active, source: last };
      setDrag({ kind: 'fill' });
      return;
    }

    // Corner selects everything.
    if (headings && lx < headerW && y < headerH) {
      select({ r1: 0, c1: 0, r2: MAX_ROWS - 1, c2: MAX_COLS - 1 }, { row: 0, col: 0 });
      return;
    }
    if (headings && y < headerH && lx >= headerW) {
      const col = colAt(x);
      const anchor = event.shiftKey ? selection.active.col : col;
      dragRef.current = { kind: 'col', anchor: { row: 0, col: anchor } };
      select({ r1: 0, c1: anchor, r2: MAX_ROWS - 1, c2: col }, { row: selection.active.row, col: anchor }, event.ctrlKey || event.metaKey);
      setDrag({ kind: 'col' });
      return;
    }
    if (headings && lx < headerW && y >= headerH) {
      const row = rowAt(y);
      const anchor = event.shiftKey ? selection.active.row : row;
      dragRef.current = { kind: 'row', anchor: { row: anchor, col: 0 } };
      select({ r1: anchor, c1: 0, r2: row, c2: MAX_COLS - 1 }, { row: anchor, col: selection.active.col }, event.ctrlKey || event.metaKey);
      setDrag({ kind: 'row' });
      return;
    }

    const col = colAt(x);
    const row = rowAt(y);

    // The arrow of a validation list.
    const rule = validationAt(wb, sheetIndex, row, col);
    if (rule?.type === 'list' && rule.showDropdown !== false && row === selection.active.row && col === selection.active.col && !readOnly) {
      const rect = cellRect(row, col);
      if (x >= rect.x + rect.w - 20 * zoom && x <= rect.x + rect.w) {
        setListMenu({ row, col, options: listOptions(wb, sheetIndex, rule), x: rect.x, y: rect.y + rect.h });
        return;
      }
    }

    // Link cells open on Ctrl+click.
    const link = sheet.links[cellKey(row, col)];
    if (link && (event.ctrlKey || event.metaKey)) {
      commands.openLink(link);
      return;
    }

    if (naming) {
      // Keep focus in the editor: a click names a cell, it does not finish the entry.
      event.preventDefault();
      props.onReference(single(row, col), event.shiftKey);
      dragRef.current = { kind: 'reference', anchor: { row, col } };
      setDrag({ kind: 'select' });
      return;
    }

    if (event.detail >= 2 && !readOnly) {
      props.onEditStart(row, col, 'edit');
      return;
    }
    if (event.shiftKey) {
      dragRef.current = { kind: 'select', anchor: selection.active };
      extendTo(row, col);
    } else {
      dragRef.current = { kind: 'select', anchor: { row, col } };
      select(single(row, col), { row, col }, event.ctrlKey || event.metaKey);
    }
    setDrag({ kind: 'select' });
  };

  useEffect(() => {
    if (!drag) return undefined;
    const timer = window.setInterval(() => {
      // Scroll while the pointer rests near an edge during a drag.
      const p = pointer.current;
      const el = scroller.current;
      if (!p || !el || dragRef.current?.kind === 'resize') return;
      const margin = 24;
      if (p.x > size.w - margin) el.scrollLeft += 24;
      else if (p.x < headerW + frozenW + margin && !rtl) el.scrollLeft -= 24;
      if (p.y > size.h - margin) el.scrollTop += 24;
      else if (p.y < headerH + frozenH + margin) el.scrollTop -= 24;
    }, 40);
    const move = (event: MouseEvent): void => {
      const { x, y } = localPoint(event);
      pointer.current = { x, y };
      const state = dragRef.current;
      if (!state) return;
      if (state.kind === 'resize') {
        const axis = (state as { axis?: string }).axis as 'col' | 'row';
        setDrag({ kind: 'resize', guide: { axis, at: axis === 'col' ? x : y } });
        return;
      }
      const col = colAt(Math.min(size.w - 1, Math.max(0, x)));
      const row = rowAt(Math.min(size.h - 1, Math.max(0, y)));
      state.moved = true;
      if (state.kind === 'select') extendTo(row, col);
      else if (state.kind === 'reference') props.onReference({ r1: Math.min(state.anchor.row, row), c1: Math.min(state.anchor.col, col), r2: Math.max(state.anchor.row, row), c2: Math.max(state.anchor.col, col) }, true);
      else if (state.kind === 'col') props.onSelect({ active: selection.active, ranges: [{ r1: 0, c1: Math.min(state.anchor.col, col), r2: MAX_ROWS - 1, c2: Math.max(state.anchor.col, col) }] });
      else if (state.kind === 'row') props.onSelect({ active: selection.active, ranges: [{ r1: Math.min(state.anchor.row, row), c1: 0, r2: Math.max(state.anchor.row, row), c2: MAX_COLS - 1 }] });
      else if (state.kind === 'fill' && state.source) {
        const s = state.source;
        // Extend along the axis the pointer moved furthest from the source.
        const dRow = row > s.r2 ? row - s.r2 : row < s.r1 ? s.r1 - row : 0;
        const dCol = col > s.c2 ? col - s.c2 : col < s.c1 ? s.c1 - col : 0;
        let target = s;
        if (dRow >= dCol && dRow > 0) target = row > s.r2 ? { ...s, r2: row } : { ...s, r1: row };
        else if (dCol > 0) target = col > s.c2 ? { ...s, c2: col } : { ...s, c1: col };
        setFillPreview(target);
      }
    };
    const up = (event: MouseEvent): void => {
      const state = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      const preview = fillPreview;
      setFillPreview(null);
      if (!state) return;
      if (state.kind === 'resize') {
        const axis = (state as { axis?: string }).axis as 'col' | 'row';
        const { x, y } = localPoint(event);
        const delta = axis === 'col' ? (toLogicalX(x) - (state.start ?? 0)) : y - (state.start ?? 0);
        const next = Math.max(0, Math.round(((state.startSize ?? 0) * zoom + delta) / zoom));
        const picked = selection.ranges.find((r) => (axis === 'col' ? state.index! >= r.c1 && state.index! <= r.c2 && r.r1 === 0 && r.r2 >= MAX_ROWS - 1 : state.index! >= r.r1 && state.index! <= r.r2 && r.c1 === 0 && r.c2 >= MAX_COLS - 1));
        const indexes: number[] = [];
        if (picked) for (let i = axis === 'col' ? picked.c1 : picked.r1; i <= (axis === 'col' ? picked.c2 : picked.r2); i += 1) indexes.push(i);
        else indexes.push(state.index!);
        // Pixels to the file's units: columns are 7 px per width unit, rows are points.
        commands.resize(axis, indexes, axis === 'col' ? next / 7 : (next * 72) / 96);
      } else if (state.kind === 'fill' && state.source && preview) {
        commands.fillRange(state.source, preview);
        props.onSelect({ active: selection.active, ranges: [...selection.ranges.slice(0, -1), preview] });
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }); // re-bound every render so handlers see current state

  const onContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    const { x, y } = localPoint(event);
    const lx = toLogicalX(x);
    let target: ContextTarget;
    if (headings && y < headerH && lx >= headerW) {
      const index = colAt(x);
      const inSelection = selection.ranges.some((r) => r.r1 === 0 && r.r2 >= MAX_ROWS - 1 && index >= r.c1 && index <= r.c2);
      if (!inSelection) select({ r1: 0, c1: index, r2: MAX_ROWS - 1, c2: index }, { row: 0, col: index });
      target = { kind: 'col', index };
    } else if (headings && lx < headerW && y >= headerH) {
      const index = rowAt(y);
      const inSelection = selection.ranges.some((r) => r.c1 === 0 && r.c2 >= MAX_COLS - 1 && index >= r.r1 && index <= r.r2);
      if (!inSelection) select({ r1: index, c1: 0, r2: index, c2: MAX_COLS - 1 }, { row: index, col: 0 });
      target = { kind: 'row', index };
    } else {
      const col = colAt(x);
      const row = rowAt(y);
      const inSelection = selection.ranges.some((r) => row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2);
      if (!inSelection) select(single(row, col), { row, col });
      target = { kind: 'cell', row, col };
    }
    commands.contextMenu({ x: event.clientX, y: event.clientY }, target);
  };

  const onMouseMoveHover = (event: React.MouseEvent): void => {
    const { x, y } = localPoint(event);
    pointer.current = { x, y };
    const el = scroller.current;
    if (!el || dragRef.current) return;
    const edge = edgeHit(x, y);
    el.style.cursor = edge ? (edge.axis === 'col' ? 'col-resize' : 'row-resize') : fillHandleAt(x, y) && !readOnly ? 'crosshair' : headings && (y < headerH || toLogicalX(x) < headerW) ? 'default' : 'cell';
  };

  // ---- keyboard ----
  const move = (row: number, col: number): void => {
    const r = Math.min(MAX_ROWS - 1, Math.max(0, row));
    const c = Math.min(MAX_COLS - 1, Math.max(0, col));
    select(single(r, c), { row: r, col: c });
  };

  /** The corner of the selection that moves when Shift is held. */
  const movingCorner = (): { row: number; col: number } => {
    const last = selection.ranges[selection.ranges.length - 1];
    return {
      row: last.r1 === selection.active.row ? last.r2 : last.r1,
      col: last.c1 === selection.active.col ? last.c2 : last.c1,
    };
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (edit?.source === 'cell') return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    const active = selection.active;
    const corner = event.shiftKey ? movingCorner() : active;
    const merge = mergeAt(sheet, corner.row, corner.col);
    const arrow = (dr: number, dc: number, dir: 'up' | 'down' | 'left' | 'right'): void => {
      event.preventDefault();
      let target: { row: number; col: number };
      if (mod) target = ctrlArrow(sheet, corner, dir, bounds);
      else {
        // Moving past a merged cell skips the whole merge.
        const r = dr > 0 && merge ? merge.range.r2 : dr < 0 && merge ? merge.range.r1 : corner.row;
        const c = dc > 0 && merge ? merge.range.c2 : dc < 0 && merge ? merge.range.c1 : corner.col;
        target = { row: r + dr, col: c + dc };
        // Hidden rows and columns are stepped over.
        while (target.row > 0 && target.row < MAX_ROWS - 1 && axes.rows.size(target.row) === 0) target.row += dr || 1;
        while (target.col > 0 && target.col < MAX_COLS - 1 && axes.cols.size(target.col) === 0) target.col += dc || 1;
      }
      if (event.shiftKey) {
        const anchor = active;
        props.onSelect({ active, ranges: [...selection.ranges.slice(0, -1), expandToMerges(sheet, normRange({ r1: anchor.row, c1: anchor.col, r2: Math.max(0, target.row), c2: Math.max(0, target.col) }))] });
      } else move(target.row, target.col);
    };

    if (key === 'ArrowDown') return arrow(1, 0, 'down');
    if (key === 'ArrowUp') return arrow(-1, 0, 'up');
    if (key === 'ArrowLeft') return arrow(0, rtl ? 1 : -1, rtl ? 'right' : 'left');
    if (key === 'ArrowRight') return arrow(0, rtl ? -1 : 1, rtl ? 'left' : 'right');
    if (key === 'Tab') {
      event.preventDefault();
      const last = selection.ranges[selection.ranges.length - 1];
      const next = stepWithin(last, active, event.shiftKey ? 'previous' : 'next', 'col');
      props.onSelect({ active: next, ranges: selection.ranges });
      if (last.r1 === last.r2 && last.c1 === last.c2) select(single(next.row, next.col), next);
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      if (readOnly) return;
      if (event.altKey) return;
      const last = selection.ranges[selection.ranges.length - 1];
      const multi = last.r1 !== last.r2 || last.c1 !== last.c2;
      if (!multi && !event.shiftKey) {
        props.onEditStart(active.row, active.col, 'edit');
        return;
      }
      const next = stepWithin(last, active, event.shiftKey ? 'previous' : 'next', 'row');
      props.onSelect({ active: next, ranges: selection.ranges });
      return;
    }
    if (key === 'F2') {
      event.preventDefault();
      if (!readOnly) props.onEditStart(active.row, active.col, 'edit');
      return;
    }
    if (key === 'Escape') return;
    if (key === 'Home') {
      event.preventDefault();
      move(mod ? 0 : active.row, 0);
      return;
    }
    if (key === 'End' && mod) {
      event.preventDefault();
      move(Math.max(0, bounds.rows - 1), Math.max(0, bounds.cols - 1));
      return;
    }
    if (key === 'PageDown' || key === 'PageUp') {
      event.preventDefault();
      const rowsPerPage = Math.max(1, Math.floor((size.h - headerH - frozenH) / (20 * zoom)));
      move(active.row + (key === 'PageDown' ? rowsPerPage : -rowsPerPage), active.col);
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      if (!readOnly) commands.clear();
      return;
    }
    if (mod) {
      const k = key.toLowerCase();
      if (k === 'a') {
        event.preventDefault();
        const region = currentRegion(sheet, active);
        const whole = selection.ranges.length === 1 && selection.ranges[0].r1 === region.r1 && selection.ranges[0].c1 === region.c1 && selection.ranges[0].r2 === region.r2 && selection.ranges[0].c2 === region.c2;
        select(whole ? { r1: 0, c1: 0, r2: MAX_ROWS - 1, c2: MAX_COLS - 1 } : region, active);
        return;
      }
      if (k === 'z' && !event.shiftKey) { event.preventDefault(); commands.undo(); return; }
      if (k === 'y' || (k === 'z' && event.shiftKey)) { event.preventDefault(); commands.redo(); return; }
      // The studio's own shortcuts must not reach the app-wide ones (Ctrl+B toggles the sidebar there).
      if (k === 'b') { event.preventDefault(); event.stopPropagation(); commands.toggle('bold'); return; }
      if (k === 'i') { event.preventDefault(); commands.toggle('italic'); return; }
      if (k === 'u') { event.preventDefault(); commands.toggle('underline'); return; }
      if (k === 'd') { event.preventDefault(); commands.fill('down'); return; }
      if (k === 'r') { event.preventDefault(); commands.fill('right'); return; }
      if (k === 's') { event.preventDefault(); commands.save(); return; }
      if (k === 'f') { event.preventDefault(); commands.find(false); return; }
      if (k === 'h') { event.preventDefault(); commands.find(true); return; }
      if (k === ';') { event.preventDefault(); commands.insertDate(event.shiftKey); return; }
      if (key === ' ') {
        event.preventDefault();
        const last = selection.ranges[selection.ranges.length - 1];
        select({ r1: 0, c1: last.c1, r2: MAX_ROWS - 1, c2: last.c2 }, active);
        return;
      }
      return;
    }
    if (key === ' ' && event.shiftKey) {
      event.preventDefault();
      const last = selection.ranges[selection.ranges.length - 1];
      select({ r1: last.r1, c1: 0, r2: last.r2, c2: MAX_COLS - 1 }, active);
      return;
    }
    if (event.altKey && key === '=') {
      event.preventDefault();
      commands.autosum();
      return;
    }
    if (!event.altKey && key.length === 1 && !readOnly) {
      event.preventDefault();
      props.onEditStart(active.row, active.col, 'enter', key);
    }
  };

  // ---- editor overlay ----
  const editorRect = edit && edit.source === 'cell' ? cellRect(edit.row, edit.col) : null;
  const editorStyle = useMemo((): React.CSSProperties | undefined => {
    if (!editorRect || !edit) return undefined;
    const display = cellDisplay(wb, sheet, edit.row, edit.col);
    const font = display.style.font ?? {};
    const px = (font.size ?? wb.defaultFont?.size ?? 11) * (96 / 72) * zoom;
    const width = Math.max(editorRect.w, Math.min(size.w - editorRect.x - 8, Math.max(editorRect.w, edit.text.length * px * 0.62 + 20)));
    return {
      left: rtl ? undefined : editorRect.x,
      right: rtl ? size.w - editorRect.x - editorRect.w : undefined,
      top: editorRect.y,
      width: rtl ? Math.max(editorRect.w, width) : width,
      minHeight: editorRect.h,
      fontFamily: `${font.name ?? wb.defaultFont?.name ?? 'Calibri'}, 'Segoe UI', Arial, sans-serif`,
      fontSize: px,
      fontWeight: font.bold ? 700 : 400,
      fontStyle: font.italic ? 'italic' : 'normal',
      textAlign: display.align === 'right' ? 'right' : display.align === 'center' ? 'center' : 'left',
    };
  }, [editorRect, edit, wb, sheet, zoom, size.w, rtl]);

  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation();
    if (!edit) return;
    const key = event.key;
    if (event.nativeEvent.isComposing) return;
    if (key === 'Enter') {
      if (event.altKey) {
        // A new line inside the cell.
        event.preventDefault();
        const el = event.currentTarget;
        const next = `${el.value.slice(0, el.selectionStart)}\n${el.value.slice(el.selectionEnd)}`;
        props.onEditChange(next);
        return;
      }
      event.preventDefault();
      props.onEditCommit(event.shiftKey ? 'up' : 'down');
    } else if (key === 'Tab') {
      event.preventDefault();
      props.onEditCommit(event.shiftKey ? 'left' : 'right');
    } else if (key === 'Escape') {
      event.preventDefault();
      props.onEditCancel();
      scroller.current?.focus({ preventScroll: true });
    } else if (key === 'F2') {
      event.preventDefault();
      props.onEditStart(edit.row, edit.col, edit.mode === 'enter' ? 'edit' : 'enter');
    } else if (edit.mode === 'enter' && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(key) && !props.referenceMode()) {
      event.preventDefault();
      props.onEditCommit(key === 'ArrowDown' ? 'down' : key === 'ArrowUp' ? 'up' : key === 'ArrowLeft' ? 'left' : 'right');
    }
  };

  const pickOption = (value: string): void => {
    if (!listMenu) return;
    commands.pick(listMenu.row, listMenu.col, value);
    setListMenu(null);
    scroller.current?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={scroller}
      className="sh-grid"
      tabIndex={0}
      role="grid"
      aria-label={`${sheet.name} worksheet`}
      aria-rowcount={bounds.rows}
      aria-colcount={bounds.cols}
      data-rtl={rtl || undefined}
      data-readonly={readOnly || undefined}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMoveHover}
      onContextMenu={onContextMenu}
      onCopy={(event) => commands.onCopy(event.nativeEvent, false)}
      onCut={(event) => commands.onCopy(event.nativeEvent, true)}
      onPaste={(event) => commands.onPaste(event.nativeEvent)}
      onWheel={(event) => {
        if (event.ctrlKey) event.preventDefault();
      }}
    >
      <div className="sh-grid__frame" ref={frame} style={{ width: size.w, height: size.h }}>
        <canvas ref={canvas} className="sh-grid__canvas" style={{ width: size.w, height: size.h }} />
        {props.overlay?.({ cellRect, colAt, rowAt, size: { w: size.w, h: size.h }, rtl, dark: Boolean(theme?.dark) })}
        {edit?.source === 'cell' && editorStyle && (
          <textarea
            ref={editor}
            className="sh-grid__editor"
            dir="auto"
            spellCheck={false}
            value={edit.text}
            style={editorStyle}
            rows={Math.max(1, edit.text.split('\n').length)}
            onChange={(event) => props.onEditChange(event.target.value)}
            onKeyDown={onEditorKeyDown}
            onBlur={(event) => {
              // Clicking the formula bar or a dialog keeps the edit; leaving for anything else commits it.
              const next = event.relatedTarget as HTMLElement | null;
              if (next?.closest('[data-keep-edit]')) return;
              if (!next) return;
              props.onEditCommit('none');
            }}
          />
        )}
        {edit?.source === 'cell' && editorRect && <FunctionHints text={edit.text} x={editorRect.x} y={editorRect.y + editorRect.h + 2} onPick={(text) => props.onEditChange(text)} />}
        {drag?.guide && (
          <div
            className="sh-grid__guide"
            data-axis={drag.guide.axis}
            style={drag.guide.axis === 'col' ? { left: drag.guide.at, top: 0, bottom: 0 } : { top: drag.guide.at, left: 0, right: 0 }}
          />
        )}
        {listMenu && (
          <div className="sh-listmenu" role="listbox" style={{ left: rtl ? undefined : listMenu.x, right: rtl ? size.w - listMenu.x - 140 : undefined, top: listMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
            {listMenu.options.length === 0 && <div className="sh-listmenu__empty">No choices</div>}
            {listMenu.options.map((option) => (
              <button key={option} type="button" role="option" aria-selected={false} className="sh-listmenu__item" onClick={() => pickOption(option)} dir="auto">{option}</button>
            ))}
          </div>
        )}
      </div>
      <div className="sh-grid__spacer" style={{ width: spacerW, height: spacerH }} aria-hidden="true" />
    </div>
  );
};
