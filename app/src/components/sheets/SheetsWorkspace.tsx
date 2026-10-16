import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { DownloadSimple, Sparkle } from '@phosphor-icons/react';
import type { WorkspaceConfig } from '../../types';
import { selectSheetsSession, useSheetsSessionStore } from '../../stores/sheetsSessionStore';
import { useSheetsStore } from '../../stores/sheetsStore';
import { cellKey, normRange, parseCell, parseSheetRef, rangesIntersect, rangeText, type RangeRef } from '../../utils/sheets/address';
import type { AiScope } from '../../utils/sheets/ai/context';
import { currentRegion, usedBounds } from '../../utils/sheets/gridModel';
import { adjustDecimals } from '../../utils/sheets/numberFormat';
import type { Op } from '../../utils/sheets/opTypes';
import { recalculate } from '../../utils/sheets/formula/recalc';
import { emptyWorkbook, type ChartDef, type Pivot, type Workbook } from '../../utils/sheets/types';
import { fileName, joinPath, parentPath, slugify } from '../../utils/writing/document';
import type { EngineChoice } from '../../utils/writing/types';
import { getStudioRoot } from '../../utils/studioRoot';
import { BarSeparator, StudioTopBar } from '../studio/StudioTopBar';
import { Inspector, InspectorBody, InspectorTabs } from '../studio/Inspector';
import { ChartLayer } from './ChartLayer';
import { SheetsToast } from './controls';
import {
  ChartDialog, ConditionalFormatDialog, EntryAlertDialog, FindDialog, FormatCellsDialog, FunctionDialog, NamesDialog, PivotDialog, TextPromptDialog, TextToColumnsDialog, ValidationDialog,
} from './dialogs';
import { ExportDialog } from './ExportDialog';
import { FormulaBar } from './FormulaBar';
import { SheetGrid } from './SheetGrid';
import { SheetStatusBar } from './SheetStatusBar';
import { ContextMenu, SheetTabs, type MenuEntry } from './SheetTabs';
import { SheetsAssistant } from './SheetsAssistant';
import { SheetsHome } from './SheetsHome';
import { DataInspector, FormatInspector } from './SheetsInspector';
import { SheetsRibbon, type RibbonActions, type RibbonTab } from './SheetsRibbon';
import type { ContextTarget } from './gridTypes';
import { SHEETS_FOLDER, useWorkbookDocument } from './useWorkbookDocument';
import { useSheetsAssistant } from './useSheetsAssistant';
import { useSheetsEditor } from './useSheetsEditor';
import { type SheetAttachment } from './attachments';
import './sheets.css';

interface SheetsWorkspaceProps {
  workspace: WorkspaceConfig;
  visible: boolean;
}

type DialogState =
  | null
  | { kind: 'format'; tab?: 'number' | 'align' | 'font' | 'border' | 'fill' }
  | { kind: 'cf' }
  | { kind: 'validation' }
  | { kind: 'chart' }
  | { kind: 'pivot' }
  | { kind: 'textColumns' }
  | { kind: 'find'; replace: boolean }
  | { kind: 'functions' }
  | { kind: 'names' }
  | { kind: 'note' }
  | { kind: 'link' }
  | { kind: 'export' };

type PanelTab = 'assistant' | 'format' | 'data';

const titleFromPrompt = (prompt: string, fallback: string): string => {
  const words = prompt.replace(/[\r\n]+/g, ' ').replace(/[.,;:!?()[\]{}"“”]+/g, ' ').trim().split(/\s+/).slice(0, 6).join(' ');
  return words || fallback;
};

/** A first row of text (blanks allowed) over data is a header, as Excel guesses. */
const looksLikeHeader = (cells: Array<string | number | boolean | undefined>, below: Array<string | number | boolean | undefined>): boolean => {
  const filled = cells.filter((c) => c !== undefined);
  if (filled.length === 0 || !filled.every((c) => typeof c === 'string')) return false;
  return below.some((c) => c !== undefined);
};

const unquoteSheet = (name: string): string => (name.startsWith("'") && name.endsWith("'") && name.length >= 2 ? name.slice(1, -1).replace(/''/g, "'") : name);

/** The solid block of cells from `origin` (right along the header row, down the first column). */
const measureBlock = (wb: Workbook, sheetName: string, origin: { row: number; col: number }): { rows: number; cols: number } | null => {
  const sheet = wb.sheets.find((s) => s.name.toLowerCase() === sheetName.toLowerCase());
  if (!sheet) return null;
  const filled = (r: number, c: number): boolean => {
    const cell = sheet.cells[cellKey(r, c)];
    return cell !== undefined && (cell.v !== undefined || cell.e !== undefined || cell.f !== undefined);
  };
  if (!filled(origin.row, origin.col)) return null;
  let cols = 0;
  while (cols < 64 && filled(origin.row, origin.col + cols)) cols += 1;
  let rows = 0;
  while (rows < 500 && filled(origin.row + rows, origin.col)) rows += 1;
  return { rows: Math.max(1, rows), cols: Math.max(1, cols) };
};

/** The studio attachments folder once resolved, reused as the initial value on remounts. */
let cachedAttachmentsFolder: string | null = null;

const SheetsWorkspace: React.FC<SheetsWorkspaceProps> = ({ workspace, visible }) => {
  const workspaceId = workspace.id;
  const workspacePath = workspace.path;
  const [toast, setToast] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => setToast({ text, kind: tone }), []);
  const doc = useWorkbookDocument(workspaceId, workspacePath);
  const editor = useSheetsEditor(workspaceId, notify);
  const assistant = useSheetsAssistant(workspaceId);
  const session = editor.session;
  const prefs = useSheetsStore();
  const [tab, setTab] = useState<RibbonTab>('home');
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>('assistant');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
  const [scope, setScope] = useState<AiScope>('sheet');
  const [attachments, setAttachments] = useState<SheetAttachment[]>([]);
  const [showFormulas, setShowFormulas] = useState(false);
  const [title, setTitle] = useState('');
  const [homeBusy, setHomeBusy] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  // The studio root resolves async; a previous resolution is reused so the
  // first render already points at the right folder on remounts.
  const [attachmentsFolder, setAttachmentsFolder] = useState(() => cachedAttachmentsFolder ?? joinPath(workspacePath, SHEETS_FOLDER, '.attachments'));
  const openedRef = useRef(false);
  const wb = editor.shown;
  const sheet = wb?.sheets[editor.sheetIndex];

  useEffect(() => {
    let live = true;
    void getStudioRoot().then((root) => {
      const next = joinPath(root, SHEETS_FOLDER, '.attachments');
      cachedAttachmentsFolder = next;
      if (live) setAttachmentsFolder(next);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  // Reopen the workbook this workspace was left on.
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    const last = useSheetsStore.getState().lastWorkbookByWorkspace[workspaceId];
    if (last && !selectSheetsSession(workspaceId)(useSheetsSessionStore.getState()).path) void doc.open(last);
  }, [doc, workspaceId]);

  // "Open in Sheets studio" from elsewhere in the app.
  const request = useSheetsSessionStore((state) => state.requests[workspaceId]);
  useEffect(() => {
    if (!request) return;
    // A review in progress is read-only: opening now would drop it, so the
    // request stays pending until the proposal is kept or discarded.
    if (session.proposal) return;
    useSheetsSessionStore.getState().clearRequest(workspaceId);
    void doc.open(request.path);
  }, [doc, request, workspaceId, session.proposal]);

  useEffect(() => {
    setTitle(session.path ? fileName(session.path).replace(/\.[^.]+$/, '') : '');
  }, [session.path]);

  const renameWorkbook = useCallback(async (): Promise<void> => {
    const current = selectSheetsSession(workspaceId)(useSheetsSessionStore.getState());
    if (!current.path || current.external) return;
    const trimmed = title.trim();
    const oldName = fileName(current.path).replace(/\.[^.]+$/, '');
    if (!trimmed || trimmed === oldName) {
      setTitle(oldName);
      return;
    }
    const slug = slugify(trimmed);
    if (slug === oldName) return;
    try {
      await doc.flush();
      const folder = parentPath(current.path);
      const extension = current.path.slice(current.path.lastIndexOf('.'));
      await invoke('rename_entry', { oldPath: current.path, newName: `${slug}${extension}` });
      await invoke('rename_entry', { oldPath: folder, newName: slug });
      const next = joinPath(parentPath(folder), slug, `${slug}${extension}`);
      useSheetsSessionStore.getState().update(workspaceId, { path: next });
      useSheetsStore.getState().setLastWorkbook(workspaceId, next);
      setTitle(slug);
      void doc.refresh();
    } catch (error) {
      setTitle(oldName);
      notify(`Could not rename: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [doc, notify, title, workspaceId]);

  // ---- helpers over the selection ----
  const lastRange = (): RangeRef => normRange(editor.selection.ranges[editor.selection.ranges.length - 1]);

  /** The selected range, or the block of data around the active cell when one cell is selected. */
  const dataRange = (): RangeRef => {
    const range = lastRange();
    const base = range.r1 === range.r2 && range.c1 === range.c2 && sheet ? currentRegion(sheet, editor.selection.active) : range;
    if (!sheet) return base;
    // A full-column, full-row or Ctrl+A selection must not dispatch
    // million-row sort/filter/dedup operations: stay inside what is used.
    const used = usedBounds(sheet);
    const maxRow = Math.max(0, used.rows - 1);
    const maxCol = Math.max(0, used.cols - 1);
    return { r1: Math.min(base.r1, maxRow), c1: Math.min(base.c1, maxCol), r2: Math.min(base.r2, maxRow), c2: Math.min(base.c2, maxCol) };
  };

  const askAi = useCallback((instruction: string, label?: string, forcedScope?: AiScope): void => {
    setPanelOpen(true);
    setPanelTab('assistant');
    void assistant.ask({ instruction, label, scope: forcedScope ?? scope, attachments });
    setAttachments([]);
  }, [assistant, attachments, scope]);

  const splitTarget = (target: string, fallbackSheet: string): { sheet: string; origin: { row: number; col: number } } | null => {
    const bang = target.lastIndexOf('!');
    const sheet = bang >= 0 ? unquoteSheet(target.slice(0, bang)) : fallbackSheet;
    const origin = parseCell(bang >= 0 ? target.slice(bang + 1).split(':')[0] : target.split(':')[0]);
    return origin ? { sheet, origin } : null;
  };

  /** Remembers a pivot definition (with its current output size) so it can be rebuilt later. */
  const handlePivotCreated = useCallback((def: Pivot): void => {
    const current = selectSheetsSession(workspaceId)(useSheetsSessionStore.getState()).wb;
    const placed = current ? splitTarget(def.target, '') : null;
    const extent = current && placed ? measureBlock(current, placed.sheet, placed.origin) ?? undefined : undefined;
    doc.recordPivot(extent ? { ...def, extent } : def);
  }, [doc, workspaceId]);

  /** Rebuilds saved pivot tables from their sources: clears each one's last output, then recomputes it. */
  const refreshPivots = useCallback((ids?: string[]): void => {
    const state = selectSheetsSession(workspaceId)(useSheetsSessionStore.getState());
    const wb = state.wb ?? editor.shown;
    if (!wb) return;
    const defs = ids ? state.pivots.filter((def) => ids.includes(def.id)) : state.pivots;
    if (defs.length === 0) {
      notify(ids ? 'That pivot table is no longer saved.' : 'No saved pivot tables yet — create one from Insert > Pivot table.', 'error');
      return;
    }
    const ops: Op[] = [];
    const skipped: string[] = [];
    for (const def of defs) {
      const placed = splitTarget(def.target, editor.sheetName);
      if (!placed) {
        skipped.push(def.name);
        continue;
      }
      const extent = def.extent ?? { rows: 100, cols: 20 };
      const clearRange = `${cellKey(placed.origin.row, placed.origin.col)}:${cellKey(placed.origin.row + extent.rows - 1, placed.origin.col + extent.cols - 1)}`;
      // Never wipe the source to rebuild the pivot: overlapping targets keep their stale cells.
      const parsedSource = parseSheetRef(def.source);
      const sourceSheet = parsedSource?.sheet ? unquoteSheet(parsedSource.sheet) : placed.sheet;
      const overlaps = parsedSource && sourceSheet.toLowerCase() === placed.sheet.toLowerCase() && rangesIntersect(parsedSource.range, normRange({ r1: placed.origin.row, c1: placed.origin.col, r2: placed.origin.row + extent.rows - 1, c2: placed.origin.col + extent.cols - 1 }));
      if (!overlaps) ops.push({ op: 'clear', sheet: placed.sheet, range: clearRange, what: 'contents' });
      ops.push({ op: 'pivot', sheet: placed.sheet, pivot: { source: def.source, target: cellKey(placed.origin.row, placed.origin.col), rows: def.rows, columns: def.columns, values: def.values, filters: def.filters, name: def.name } });
    }
    if (ops.length === 0) {
      notify(`Could not refresh ${skipped.join(', ')}.`, 'error');
      return;
    }
    const result = editor.apply(ops);
    if (!result) return;
    for (const def of defs) {
      const placed = splitTarget(def.target, '');
      const extent = placed ? measureBlock(result.wb, placed.sheet, placed.origin) ?? undefined : undefined;
      if (extent) doc.recordPivot({ ...def, extent });
    }
    notify(skipped.length ? `Refreshed ${defs.length - skipped.length}, skipped ${skipped.join(', ')}.` : `Refreshed ${defs.length} pivot table${defs.length === 1 ? '' : 's'}.`, skipped.length ? 'error' : 'info');
  }, [doc, editor, notify, workspaceId]);

  // ---- ribbon actions ----
  const actions = useMemo((): RibbonActions => {
    const name = editor.sheetName;
    const ranges = (): RangeRef[] => editor.selection.ranges.map(normRange);
    return {
      formatCells: () => setDialog({ kind: 'format' }),
      conditionalFormat: () => setDialog({ kind: 'cf' }),
      validation: () => setDialog({ kind: 'validation' }),
      chart: () => setDialog({ kind: 'chart' }),
      pivot: () => setDialog({ kind: 'pivot' }),
      find: (replace) => setDialog({ kind: 'find', replace }),
      functions: () => setDialog({ kind: 'functions' }),
      names: () => setDialog({ kind: 'names' }),
      note: () => setDialog({ kind: 'note' }),
      link: () => setDialog({ kind: 'link' }),
      table: () => {
        const range = dataRange();
        editor.apply([{ op: 'table', sheet: name, range: rangeText(range) }]);
      },
      sort: (order) => {
        const range = dataRange();
        if (!sheet) return;
        const first = Array.from({ length: range.c2 - range.c1 + 1 }, (_, i) => sheet.cells[cellKey(range.r1, range.c1 + i)]?.v);
        const second = Array.from({ length: range.c2 - range.c1 + 1 }, (_, i) => sheet.cells[cellKey(range.r1 + 1, range.c1 + i)]?.v);
        const column = Math.min(range.c2, Math.max(range.c1, editor.selection.active.col));
        editor.apply([{ op: 'sort', sheet: name, range: rangeText(range), by: [{ column: column + 1, order }], header: looksLikeHeader(first, second) }]);
      },
      filter: () => {
        if (!sheet) return;
        if (sheet.autoFilter) editor.apply([{ op: 'autoFilter', sheet: name, range: null }]);
        else editor.apply([{ op: 'autoFilter', sheet: name, range: rangeText(dataRange()) }]);
      },
      removeDuplicates: () => {
        const range = dataRange();
        editor.apply([{ op: 'removeDuplicates', sheet: name, range: rangeText(range), header: true }]);
      },
      textToColumns: () => setDialog({ kind: 'textColumns' }),
      refreshPivots: () => refreshPivots(),
      pivotCount: session.pivots.length,
      freeze: (mode) => {
        const { row, col } = editor.selection.active;
        const rows = mode === 'row' ? 1 : mode === 'both' ? row : 0;
        const cols = mode === 'col' ? 1 : mode === 'both' ? col : 0;
        editor.apply([{ op: 'freeze', sheet: name, rows: mode === 'none' ? 0 : rows, cols: mode === 'none' ? 0 : cols }]);
      },
      toggleFormulas: () => setShowFormulas((value) => !value),
      toggleGridlines: () => editor.apply([{ op: 'sheetProps', sheet: name, gridlines: sheet?.gridlines === false }]),
      toggleHeadings: () => editor.apply([{ op: 'sheetProps', sheet: name, headings: sheet?.headings === false }]),
      toggleRtl: () => editor.apply([{ op: 'sheetProps', sheet: name, rtl: !sheet?.rtl }]),
      recalculate: () => {
        const current = selectSheetsSession(workspaceId)(useSheetsSessionStore.getState()).wb;
        if (current) useSheetsSessionStore.getState().commit(workspaceId, recalculate(current), { skipHistory: true });
      },
      askAi: (prompt) => askAi(prompt, undefined, 'selection'),
      mergeCells: (mode) => {
        const ops: Op[] = [];
        for (const range of ranges()) {
          ops.push({ op: 'merge', sheet: name, range: rangeText(range), unmerge: mode === 'unmerge' });
          if (mode === 'center') ops.push({ op: 'format', sheet: name, range: rangeText(range), style: { align: { h: 'center' } } });
        }
        editor.apply(ops);
      },
      borders: (preset) => editor.apply(ranges().map((range) => ({ op: 'borders' as const, sheet: name, range: rangeText(range), preset }))),
      cellStyle: (kind) => {
        const patches: Record<string, Parameters<typeof editor.patchStyle>[0]> = {
          header: { font: { bold: true, color: '#FFFFFF' }, fill: '#1F3A5F', align: { h: 'center' } },
          total: { font: { bold: true }, border: { top: { style: 'thin' } } },
          note: { font: { italic: true, color: '#666666' }, fill: '#F7F7F7' },
          good: { font: { color: '#006100' }, fill: '#C6EFCE' },
          bad: { font: { color: '#9C0006' }, fill: '#FFC7CE' },
        };
        if (kind === 'clear') editor.clearSelection('formats');
        else editor.patchStyle(patches[kind]);
      },
      decimals: (delta) => editor.patchStyle({ numFmt: adjustDecimals(editor.activeStyle.numFmt, delta) }),
      showFormulas,
      gridlines: sheet?.gridlines !== false,
      headings: sheet?.headings !== false,
      rtl: Boolean(sheet?.rtl),
      hasFilter: Boolean(sheet?.autoFilter),
      frozen: Boolean(sheet?.freeze),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, sheet, showFormulas, askAi, refreshPivots, session.pivots.length, workspaceId]);

  // ---- context menus ----
  useEffect(() => {
    editor.handlers.current = {
      find: (replace) => setDialog({ kind: 'find', replace }),
      save: () => void doc.save(),
      openLink: (url) => { void openUrl(url).catch(() => notify('Could not open that link.', 'error')); },
      contextMenu: (position, target: ContextTarget) => {
        const ro = editor.readOnly;
        const items: MenuEntry[] = [];
        if (target.kind === 'cell') {
          items.push(
            { label: 'Cut', hint: 'Ctrl+X', disabled: ro, onSelect: () => editor.copySelection(null, true) },
            { label: 'Copy', hint: 'Ctrl+C', onSelect: () => editor.copySelection(null, false) },
            { label: 'Paste', hint: 'Ctrl+V', disabled: ro, onSelect: () => void editor.pasteFromClipboard('all') },
            { label: 'Paste values only', disabled: ro, onSelect: () => void editor.pasteFromClipboard('values') },
            { separator: true },
            { label: 'Insert row', disabled: ro, onSelect: () => editor.structure('insertRows') },
            { label: 'Insert column', disabled: ro, onSelect: () => editor.structure('insertCols') },
            { label: 'Delete row', danger: true, disabled: ro, onSelect: () => editor.structure('deleteRows') },
            { label: 'Delete column', danger: true, disabled: ro, onSelect: () => editor.structure('deleteCols') },
            { separator: true },
            { label: 'Clear contents', hint: 'Del', disabled: ro, onSelect: () => editor.clearSelection('contents') },
            { label: 'Format cells…', disabled: ro, onSelect: () => setDialog({ kind: 'format' }) },
            { label: 'Add note…', disabled: ro, onSelect: () => setDialog({ kind: 'note' }) },
            { separator: true },
            { label: 'Ask the assistant about this', onSelect: () => { setPanelOpen(true); setPanelTab('assistant'); setScope('selection'); } },
          );
        } else if (target.kind === 'col') {
          items.push(
            { label: 'Cut', disabled: ro, onSelect: () => editor.copySelection(null, true) },
            { label: 'Copy', onSelect: () => editor.copySelection(null, false) },
            { label: 'Paste', disabled: ro, onSelect: () => void editor.pasteFromClipboard('all') },
            { separator: true },
            { label: 'Insert column', disabled: ro, onSelect: () => editor.structure('insertCols') },
            { label: 'Delete column', danger: true, disabled: ro, onSelect: () => editor.structure('deleteCols') },
            { separator: true },
            { label: 'Hide', disabled: ro, onSelect: () => editor.structure('hideCols') },
            { label: 'Unhide', disabled: ro, onSelect: () => editor.structure('showCols') },
            { label: 'Fit width to content', disabled: ro, onSelect: () => editor.commands.resize('col', Array.from({ length: lastRange().c2 - lastRange().c1 + 1 }, (_, i) => lastRange().c1 + i), 'auto') },
          );
        } else {
          items.push(
            { label: 'Cut', disabled: ro, onSelect: () => editor.copySelection(null, true) },
            { label: 'Copy', onSelect: () => editor.copySelection(null, false) },
            { label: 'Paste', disabled: ro, onSelect: () => void editor.pasteFromClipboard('all') },
            { separator: true },
            { label: 'Insert row', disabled: ro, onSelect: () => editor.structure('insertRows') },
            { label: 'Delete row', danger: true, disabled: ro, onSelect: () => editor.structure('deleteRows') },
            { separator: true },
            { label: 'Hide', disabled: ro, onSelect: () => editor.structure('hideRows') },
            { label: 'Unhide', disabled: ro, onSelect: () => editor.structure('showRows') },
          );
        }
        setMenu({ ...position, items });
      },
    };
  });

  const openSheetMenu = (index: number, position: { x: number; y: number }): void => {
    if (!wb) return;
    const target = wb.sheets[index];
    const ro = editor.readOnly;
    const hidden = wb.sheets.filter((s) => s.state && s.state !== 'visible');
    setMenu({
      ...position,
      items: [
        { label: 'Rename', disabled: ro, onSelect: () => { /* double-click renames in place */ notify('Double-click the tab to rename it.'); } },
        { label: 'Duplicate', disabled: ro, onSelect: () => editor.apply([{ op: 'duplicateSheet', sheet: target.name }]) },
        { label: 'Move left', disabled: ro || index === 0, onSelect: () => editor.apply([{ op: 'moveSheet', sheet: target.name, index: index - 1 }]) },
        { label: 'Move right', disabled: ro || index === wb.sheets.length - 1, onSelect: () => editor.apply([{ op: 'moveSheet', sheet: target.name, index: index + 1 }]) },
        { separator: true },
        { label: target.rtl ? 'Make left to right' : 'Make right to left', disabled: ro, onSelect: () => editor.apply([{ op: 'sheetProps', sheet: target.name, rtl: !target.rtl }]) },
        { label: 'Hide', disabled: ro || wb.sheets.filter((s) => !s.state || s.state === 'visible').length < 2, onSelect: () => editor.apply([{ op: 'sheetProps', sheet: target.name, hidden: true }]) },
        ...hidden.map((s): MenuEntry => ({ label: `Unhide “${s.name}”`, disabled: ro, onSelect: () => editor.apply([{ op: 'sheetProps', sheet: s.name, hidden: false }]) })),
        { separator: true },
        { label: 'Delete', danger: true, disabled: ro || wb.sheets.length < 2, onSelect: () => editor.apply([{ op: 'deleteSheet', sheet: target.name }]) },
      ],
    });
  };

  // ---- home ----
  const createFromPrompt = async (prompt: string, files: SheetAttachment[]): Promise<void> => {
    setHomeBusy(true);
    setHomeError(null);
    try {
      const book = emptyWorkbook();
      if (prefs.newSheetsRtl) book.sheets[0].rtl = true;
      await doc.create(book, titleFromPrompt(prompt, files[0]?.name.replace(/\.[^.]+$/, '') ?? 'Workbook'));
      setPanelOpen(true);
      setPanelTab('assistant');
      void assistant.ask({ instruction: prompt || 'Build a workbook from the attached files.', scope: 'workbook', attachments: files });
    } catch (error) {
      setHomeError(error instanceof Error ? error.message : String(error));
    } finally {
      setHomeBusy(false);
    }
  };

  const createBlank = async (): Promise<void> => {
    setHomeBusy(true);
    try {
      const book = emptyWorkbook();
      if (prefs.newSheetsRtl) book.sheets[0].rtl = true;
      await doc.create(book, 'Untitled workbook');
    } catch (error) {
      setHomeError(error instanceof Error ? error.message : String(error));
    } finally {
      setHomeBusy(false);
    }
  };

  const onEngine = (engine: EngineChoice): void => prefs.setDefaultEngine(engine);

  // ---- chart changes ----
  const onChartChange = useCallback((chart: ChartDef, remove: boolean): void => {
    if (!sheet) return;
    if (remove) {
      editor.apply([{ op: 'chart', sheet: sheet.name, remove: chart.id }]);
      return;
    }
    editor.apply([{
      op: 'chart',
      sheet: sheet.name,
      chart: {
        id: chart.id, kind: chart.kind, title: chart.title, series: chart.series, at: cellKey(chart.from.row, chart.from.col),
        width: chart.to.col - chart.from.col, height: chart.to.row - chart.from.row, stacked: chart.stacked, percent: chart.percent, legend: chart.legend,
        xTitle: chart.xTitle, yTitle: chart.yTitle, smooth: chart.smooth, dataLabels: chart.dataLabels,
      },
    }]);
  }, [editor, sheet]);

  // Ctrl+wheel zooms the grid.
  const onWheel = (event: React.WheelEvent): void => {
    if (!event.ctrlKey) return;
    editor.setZoom(editor.zoom * 100 + (event.deltaY < 0 ? 10 : -10));
  };

  // Global shortcuts that belong to the studio.
  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.shiftKey && event.key.toLowerCase() === 'e' && session.wb) {
        event.preventDefault();
        setDialog({ kind: 'export' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session.wb, visible]);

  const saveState = session.saving
    ? { text: 'Saving…', state: 'saving' as const }
    : session.error
      ? { text: 'Not saved', state: 'error' as const, title: session.error }
      : session.dirty
        ? { text: 'Unsaved changes', state: 'unsaved' as const }
        : { text: session.lastSavedAt ? 'Saved' : 'Up to date', state: 'saved' as const };

  const run = session.run
    ? { label: session.run.label, elapsed: undefined, progress: null as number | null, onStop: assistant.stop, detail: session.run.streamed ? `${Math.round(session.run.streamed.length / 100) / 10}k characters` : undefined }
    : null;

  // ---- render ----
  if (!session.wb || !wb || !sheet) {
    return (
      <div className="sh-root" data-visible={visible || undefined}>
        <SheetsHome
          workspaceName={workspace.name}
          attachmentsFolder={attachmentsFolder}
          workbooks={doc.workbooks}
          engine={prefs.defaultEngine}
          onEngineChange={onEngine}
          busy={homeBusy}
          error={homeError ?? session.error}
          onCreate={(prompt, files) => void createFromPrompt(prompt, files)}
          onBlank={() => void createBlank()}
          onOpenFile={(path) => void doc.open(path)}
          onOpen={(path) => void doc.open(path)}
          onDelete={(path) => void doc.remove(path)}
        />
        <SheetsToast message={toast} onClose={() => setToast(null)} />
      </div>
    );
  }

  const used = usedBounds(sheet);
  const selectionLabel = `${sheet.name}!${rangeText(lastRange())}`;
  const proposalCells = editor.proposal && !editor.peek
    ? new Set<string>(Object.entries(editor.proposal.changed.cells).filter(([id]) => id === sheet.id).flatMap(([, keys]) => keys))
    : null;

  return (
    <div className="sh-root" data-visible={visible || undefined} onWheel={onWheel}>
      <StudioTopBar
        backLabel="Workbooks"
        onBack={() => void doc.close()}
        title={title}
        titlePlaceholder="Untitled workbook"
        onTitle={setTitle}
        onTitleCommit={() => void renameWorkbook()}
        meta={`${session.external ? 'Excel file' : 'Workbook'} · ${wb.sheets.length} sheet${wb.sheets.length === 1 ? '' : 's'} · ${used.rows.toLocaleString()} rows`}
        save={saveState}
        run={run ? { ...run, elapsed: undefined } : null}
      >
        {session.external && (
          <button type="button" className="sx-btn sx-btn--sm" onClick={() => void doc.saveCopy().then((path) => path && notify('Saved a copy in your Sheets folder.'))} title="Keep a copy in the studio's folder">Save a copy</button>
        )}
        <BarSeparator />
        <button type="button" className="sx-btn sx-btn--sm" onClick={() => setDialog({ kind: 'export' })} title="Export (Ctrl+Shift+E)"><DownloadSimple size={13} /> Export</button>
        <button type="button" className={`sx-btn sx-btn--sm${panelOpen ? ' sx-btn--primary' : ''}`} onClick={() => setPanelOpen((open) => !open)} aria-pressed={panelOpen} title="Assistant"><Sparkle size={13} weight="fill" /> Assistant</button>
      </StudioTopBar>

      <SheetsRibbon editor={editor} tab={tab} onTab={setTab} actions={actions} disabled={editor.readOnly} />
      {prefs.showFormulaBar && (
        <FormulaBar
          wb={wb}
          sheetIndex={editor.sheetIndex}
          selection={editor.selection}
          text={editor.edit ? editor.edit.text : editor.activeText}
          editing={editor.edit?.source === 'bar'}
          readOnly={editor.readOnly}
          onFocusEdit={editor.startBarEdit}
          onChange={editor.changeEdit}
          onCommit={() => editor.commitEdit('down')}
          onCancel={editor.cancelEdit}
          onJump={(range, sheetIdx) => {
            if (sheetIdx !== undefined && sheetIdx !== editor.sheetIndex) editor.activateSheet(sheetIdx);
            editor.select(range);
            editor.requestFocus();
          }}
          onPickFunction={() => setDialog({ kind: 'functions' })}
        />
      )}

      {editor.proposal && (
        <div className="sh-banner" role="status">
          <span>Reviewing the assistant’s changes. Tinted cells are new or changed.</span>
          <span className="sh-banner__actions">
            <button type="button" className="sx-btn sx-btn--sm sx-btn--primary" onClick={assistant.keep}>Keep</button>
            <button type="button" className="sx-btn sx-btn--sm" onClick={assistant.discard}>Discard</button>
          </span>
        </div>
      )}

      {session.recovery && (
        <div className="sh-banner" role="alert">
          <span>Unsaved changes from {new Date(session.recovery.savedAt).toLocaleString()} were found — the app closed before they were saved.</span>
          <span className="sh-banner__actions">
            <button type="button" className="sx-btn sx-btn--sm sx-btn--primary" onClick={() => { doc.restoreRecovery(); notify('Unsaved changes restored.'); }}>Restore</button>
            <button type="button" className="sx-btn sx-btn--sm" onClick={() => doc.discardRecovery()}>Discard</button>
          </span>
        </div>
      )}

      {session.error && (
        <div className="sh-banner" role="alert">
          <span>{session.error}</span>
          <span className="sh-banner__actions">
            <button type="button" className="sx-btn sx-btn--sm sx-btn--primary" onClick={() => void doc.save()}>Retry save</button>
          </span>
        </div>
      )}

      <div className="sh-main">
        <div className="sh-sheetwrap">
          <SheetGrid
            wb={wb}
            sheetIndex={editor.sheetIndex}
            selection={editor.selection}
            edit={editor.edit}
            zoom={editor.zoom}
            readOnly={editor.readOnly}
            tint={proposalCells}
            copied={editor.copied}
            showFormulas={showFormulas}
            commands={editor.commands}
            onSelect={editor.setSelection}
            onEditStart={editor.startEdit}
            onEditChange={editor.changeEdit}
            onEditCommit={editor.commitEdit}
            onEditCancel={editor.cancelEdit}
            referenceMode={editor.referenceMode}
            onReference={editor.insertReference}
            focusTick={editor.focusTick}
            overlay={(api) => (
              <ChartLayer
                wb={wb}
                sheetIndex={editor.sheetIndex}
                api={api}
                readOnly={editor.readOnly}
                version={sheet.charts.length}
                onChange={onChartChange}
                onEdit={() => setDialog({ kind: 'chart' })}
              />
            )}
          />
        </div>
        {panelOpen && (
          <Inspector label="Sheets assistant" width={348}>
            <InspectorTabs
              label="Panel"
              value={panelTab}
              onChange={setPanelTab}
              tabs={[{ id: 'assistant', label: 'Assistant' }, { id: 'format', label: 'Format' }, { id: 'data', label: 'Data' }]}
            />
            {panelTab === 'assistant' ? (
              <InspectorBody id={`sx-panel-${panelTab}`} labelledBy={`sx-tab-${panelTab}`}>
              <SheetsAssistant
                turns={session.chat}
                run={session.run}
                proposal={editor.proposal}
                scope={scope}
                onScope={setScope}
                targetLabel={selectionLabel}
                engine={prefs.defaultEngine}
                onEngine={onEngine}
                readOnly={editor.readOnly}
                attachments={attachments}
                onAttachments={setAttachments}
                folder={attachmentsFolder}
                onAsk={(instruction, label, forced) => askAi(instruction, label, forced)}
                onStop={assistant.stop}
                onKeep={assistant.keep}
                onDiscard={assistant.discard}
                onPeek={editor.setPeek}
              />
              </InspectorBody>
            ) : (
              <InspectorBody id={`sx-panel-${panelTab}`} labelledBy={`sx-tab-${panelTab}`}>
                {panelTab === 'format'
                  ? <FormatInspector editor={editor} onMore={() => setDialog({ kind: 'format' })} />
                  : <DataInspector editor={editor} onNames={() => setDialog({ kind: 'names' })} onFormat={() => setDialog({ kind: 'format' })} pivots={session.pivots} onRefreshPivot={(id) => refreshPivots([id])} onRefreshAllPivots={() => refreshPivots()} onRemovePivot={(id) => { doc.removePivot(id); notify('Pivot table forgotten. Its cells stay.'); }} />}
              </InspectorBody>
            )}
          </Inspector>
        )}
      </div>

      <SheetTabs
        wb={wb}
        activeIndex={editor.sheetIndex}
        readOnly={editor.readOnly}
        onSelect={editor.activateSheet}
        onAdd={() => editor.apply([{ op: 'addSheet', name: `Sheet${wb.sheets.length + 1}` }])}
        onRename={(index, name) => editor.apply([{ op: 'renameSheet', sheet: wb.sheets[index].name, name }])}
        onMenu={openSheetMenu}
      />
      <SheetStatusBar
        wb={wb}
        sheetIndex={editor.sheetIndex}
        selection={editor.selection}
        zoom={editor.zoom}
        note={session.importNotes[0] ?? (used.rows === 0 ? 'Empty sheet — click a cell and start typing, or paste data from another app.' : undefined)}
        onZoom={editor.setZoom}
      />

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => { setMenu(null); editor.requestFocus(); }} />}
      {dialog?.kind === 'format' && <FormatCellsDialog editor={editor} initialTab={dialog.tab} onClose={() => { setDialog(null); editor.requestFocus(); }} />}
      {dialog?.kind === 'cf' && <ConditionalFormatDialog editor={editor} onClose={() => { setDialog(null); editor.requestFocus(); }} />}
      {dialog?.kind === 'validation' && <ValidationDialog editor={editor} onClose={() => { setDialog(null); editor.requestFocus(); }} />}
      {dialog?.kind === 'chart' && <ChartDialog editor={editor} onClose={() => { setDialog(null); editor.requestFocus(); }} />}
      {dialog?.kind === 'pivot' && <PivotDialog editor={editor} onClose={() => { setDialog(null); editor.requestFocus(); }} onCreated={(def) => { handlePivotCreated(def); setDialog(null); editor.requestFocus(); }} />}
      {dialog?.kind === 'textColumns' && <TextToColumnsDialog editor={editor} onClose={() => { setDialog(null); editor.requestFocus(); }} />}
      {dialog?.kind === 'find' && <FindDialog editor={editor} replace={dialog.replace} onClose={() => { setDialog(null); editor.requestFocus(); }} />}
      {dialog?.kind === 'names' && <NamesDialog editor={editor} onClose={() => { setDialog(null); editor.requestFocus(); }} />}
      {dialog?.kind === 'functions' && (
        <FunctionDialog
          onClose={() => { setDialog(null); editor.requestFocus(); }}
          onPick={(fn) => {
            setDialog(null);
            const { row, col } = editor.selection.active;
            editor.startEdit(row, col, 'edit', `=${fn}(`);
          }}
        />
      )}
      {dialog?.kind === 'note' && (
        <TextPromptDialog
          title="Note"
          label={`Note for ${cellKey(editor.selection.active.row, editor.selection.active.col)}`}
          initial={sheet.notes[cellKey(editor.selection.active.row, editor.selection.active.col)] ?? ''}
          multiline
          confirm="Save"
          onClose={() => { setDialog(null); editor.requestFocus(); }}
          onSubmit={(text) => { editor.apply([{ op: 'note', sheet: sheet.name, cell: cellKey(editor.selection.active.row, editor.selection.active.col), text: text.trim() === '' ? null : text }]); setDialog(null); editor.requestFocus(); }}
          onClear={() => { editor.apply([{ op: 'note', sheet: sheet.name, cell: cellKey(editor.selection.active.row, editor.selection.active.col), text: null }]); setDialog(null); }}
        />
      )}
      {dialog?.kind === 'link' && (
        <TextPromptDialog
          title="Link"
          label="Address (https://…, mailto:…)"
          initial={sheet.links[cellKey(editor.selection.active.row, editor.selection.active.col)] ?? ''}
          confirm="Save"
          onClose={() => { setDialog(null); editor.requestFocus(); }}
          onSubmit={(url) => {
            const clean = url.trim();
            editor.apply([{ op: 'hyperlink', sheet: sheet.name, cell: cellKey(editor.selection.active.row, editor.selection.active.col), url: clean === '' ? null : /^[a-z][\w+.-]*:/i.test(clean) ? clean : `https://${clean}` }]);
            setDialog(null);
            editor.requestFocus();
          }}
          onClear={() => { editor.apply([{ op: 'hyperlink', sheet: sheet.name, cell: cellKey(editor.selection.active.row, editor.selection.active.col), url: null }]); setDialog(null); }}
        />
      )}
      {dialog?.kind === 'export' && session.wb && (
        <ExportDialog
          wb={session.wb}
          sheetIndex={Math.min(session.wb.activeSheet, session.wb.sheets.length - 1)}
          title={title || 'Workbook'}
          path={session.path}
          original={session.original}
          initialFormat={session.format === 'csv' || session.format === 'tsv' ? session.format : undefined}
          onClose={() => { setDialog(null); editor.requestFocus(); }}
          onDone={(message) => notify(message)}
        />
      )}
      {editor.entryAlert && (
        <EntryAlertDialog
          title={editor.entryAlert.validation.title ?? 'Invalid entry'}
          message={editor.entryAlert.validation.message ?? ''}
          style={editor.entryAlert.validation.style ?? 'stop'}
          onAction={editor.acceptAlert}
        />
      )}
      <SheetsToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
};

export default SheetsWorkspace;
