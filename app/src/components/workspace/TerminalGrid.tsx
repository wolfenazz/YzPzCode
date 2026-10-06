import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { TerminalSession, CliType } from '../../types';
import { SortableTerminalPane } from './SortableTerminalPane';
import { ExtensionPane } from './ExtensionPane';
import { NewTerminalDialog } from './NewTerminalDialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { EMPTY_EXTENSION_PANELS, isSidePanel, useExtensionStore } from '../../stores/extensionStore';
import { BoxLoader } from '../common/BoxLoader';
import { ExtensionLogo } from '../common/ExtensionLogo';
import { Plus, PuzzlePiece, TerminalWindow } from '@phosphor-icons/react';
import { TerminalLayoutContext } from './TerminalLayoutContext';
import { DEFAULT_TERMINAL_ARRANGEMENT, useTerminalLayoutStore } from '../../stores/terminalLayoutStore';
import { getTerminalLayoutRects } from '../../utils/terminalLayouts';
import type { TerminalLayoutPreset, TerminalLayoutRect } from '../../utils/terminalLayouts';
import './terminal-grid.css';
import type { WorkspaceConfig, WorkspaceExtensionPanel } from '../../types';

interface TerminalGridProps {
  workspace: WorkspaceConfig;
  sessions: TerminalSession[];
  isLoading?: boolean;
  visible?: boolean;
  mode?: 'terminal' | 'extensions';
  onBrowseExtensions?: () => void;
}

interface WorkspacePane {
  id: string;
  terminal: TerminalSession | null;
  extension: WorkspaceExtensionPanel | null;
}

function getGridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  // Square-ish grid that grows with the session count, so any number of
  // terminals has a cell to occupy (previously capped at 3x3 = 9).
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

function makeEqualSizes(n: number): number[] {
  const s = 100 / n;
  return Array.from({ length: n }, () => s);
}

const MIN_SIZE = 12;
const DIVIDER = 3;
const GAP_PX = 8;
/** Maximize preset: minimized panes keep just their header (plus borders) visible. */
const STRIP_PX = 38;
/** Keep in sync with the transition duration in terminal-grid.css. */
const MORPH_MS = 560;
const MORPH_STAGGER_MS = 40;
const MORPH_MAX_DELAY_MS = 200;

/** Absolute placement for a preset cell; the inset math surrenders each cell's share of the gutters. */
function presetCellStyle(rect: TerminalLayoutRect): React.CSSProperties {
  if (rect.maximized) {
    return { left: 'calc(0% + 0px)', top: 'calc(0% + 0px)', width: 'calc(100% - 0px)', height: `calc(100% - ${STRIP_PX + GAP_PX}px)` };
  }
  const horizontal = {
    left: `calc(${rect.x * 100}% + ${rect.x * GAP_PX}px)`,
    width: `calc(${rect.width * 100}% - ${(1 - rect.width) * GAP_PX}px)`,
  };
  if (rect.minimized) {
    return { ...horizontal, top: `calc(100% - ${STRIP_PX}px)`, height: `calc(0% + ${STRIP_PX}px)` };
  }
  return {
    ...horizontal,
    top: `calc(${rect.y * 100}% + ${rect.y * GAP_PX}px)`,
    height: `calc(${rect.height * 100}% - ${(1 - rect.height) * GAP_PX}px)`,
  };
}

/** Width of `.terminal-drag-preview` (19rem) — keep in sync with premium-system.css. */
const DRAG_PREVIEW_WIDTH_REM = 19;
/** The preview is grabbed by its header, so never hold it lower than this. */
const DRAG_PREVIEW_MAX_GRAB_Y = 44;

/**
 * dnd-kit sizes and places the DragOverlay wrapper to match the dragged pane,
 * but the preview is a small fixed-width card pinned to that wrapper's top-left.
 * Grabbing a wide pane anywhere but its left edge therefore left the card far
 * from the pointer. Shift the overlay so the card sits under the pointer at the
 * same relative spot where the pane was grabbed.
 */
const anchorPreviewToPointer: Modifier = ({ transform, activatorEvent, activeNodeRect }) => {
  if (!activatorEvent || !activeNodeRect || activeNodeRect.width <= 0) return transform;
  const pointer = getEventCoordinates(activatorEvent);
  if (!pointer) return transform;

  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const previewWidth = DRAG_PREVIEW_WIDTH_REM * rootFontSize;

  const grabX = Math.min(Math.max(pointer.x - activeNodeRect.left, 0), activeNodeRect.width);
  const grabY = Math.max(pointer.y - activeNodeRect.top, 0);
  const previewGrabX = (grabX / activeNodeRect.width) * previewWidth;
  const previewGrabY = Math.min(grabY, DRAG_PREVIEW_MAX_GRAB_Y);

  return {
    ...transform,
    x: transform.x + grabX - previewGrabX,
    y: transform.y + grabY - previewGrabY,
  };
};

const DRAG_OVERLAY_MODIFIERS = [anchorPreviewToPointer];

export const TerminalGrid: React.FC<TerminalGridProps> = ({ workspace, sessions, isLoading, visible = true, mode = 'terminal', onBrowseExtensions }) => {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [rowColSizes, setRowColSizes] = useState<number[][] | null>(null);
  const [colRowSizes, setColRowSizes] = useState<number[][] | null>(null);
  const [colSizes, setColSizes] = useState<number[] | null>(null);
  const [rowSizes, setRowSizes] = useState<number[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    axis: 'col' | 'row';
    index: number;
    row: number;
    col: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);

  const addSession = useAppStore((s) => s.addSession);
  const removeSession = useAppStore((s) => s.removeSession);
  const reorderSessions = useAppStore((s) => s.reorderSessions);
  const independentGridResize = useAppStore((s) => s.independentGridResize);
  const workspaceId = workspace.id;
  const isExtensions = mode === 'extensions';
  const layoutId = isExtensions ? `extensions:${workspaceId}` : workspaceId;
  const allExtensionPanels = useExtensionStore((state) => state.panelsByWorkspace[workspaceId] ?? EMPTY_EXTENSION_PANELS);
  // Panels docked in the editor's side panel are hosted there, not in the grid.
  const extensionPanels = useMemo(() => isExtensions ? allExtensionPanels.filter((panel) => !isSidePanel(panel)) : EMPTY_EXTENSION_PANELS, [isExtensions, allExtensionPanels]);
  const paneOrder = useExtensionStore((state) => state.paneOrderByWorkspace[layoutId] ?? (isExtensions ? state.paneOrderByWorkspace[workspaceId] : undefined));
  const setPaneOrder = useExtensionStore((state) => state.setPaneOrder);
  const arrangement = useTerminalLayoutStore((s) => s.arrangements[layoutId] ?? DEFAULT_TERMINAL_ARRANGEMENT);
  const setArrangement = useTerminalLayoutStore((s) => s.setArrangement);
  const setActiveSession = useAppStore((s) => s.setActiveSession);

  const sorted = useMemo(() => {
    const panes: WorkspacePane[] = [
      ...[...(isExtensions ? [] : sessions)].sort((a, b) => a.index - b.index).map((terminal) => ({ id: terminal.id, terminal, extension: null })),
      ...extensionPanels.map((extension) => ({ id: extension.id, terminal: null, extension })),
    ];
    if (!paneOrder?.length) return panes;
    const order = new Map(paneOrder.map((id, index) => [id, index]));
    return panes.sort((a, b) => (order.get(a.id) ?? paneOrder.length) - (order.get(b.id) ?? paneOrder.length));
  }, [sessions, extensionPanels, paneOrder, isExtensions]);
  const { cols, rows } = getGridDimensions(sorted.length);
  const preset = arrangement.preset;
  const customLayout = preset !== 'grid';
  const focusedIndex = Math.max(0, sorted.findIndex((session) => session.id === arrangement.focusedSessionId));
  const focusedSessionId = sorted[focusedIndex]?.id ?? null;
  const presetRects = useMemo(
    () => getTerminalLayoutRects(preset, sorted.length, focusedIndex),
    [preset, sorted.length, focusedIndex],
  );
  const selectPreset = useCallback((next: TerminalLayoutPreset, sessionId: string) => {
    setArrangement(layoutId, next, sessionId);
    if (sessions.some((session) => session.id === sessionId)) setActiveSession(sessionId);
    setRowColSizes(null);
    setColRowSizes(null);
    setColSizes(null);
    setRowSizes(null);
  }, [layoutId, setArrangement, setActiveSession, sessions]);
  const restorePreset = arrangement.restorePreset ?? 'grid';
  const toggleMaximize = useCallback((sessionId: string) => {
    const maximized = preset === 'maximize' && focusedSessionId === sessionId;
    selectPreset(maximized ? restorePreset : 'maximize', sessionId);
  }, [preset, focusedSessionId, restorePreset, selectPreset]);
  const paneIdsKey = sorted.map((pane) => pane.id).join(',');
  const layoutControls = useMemo(
    () => ({ preset, focusedSessionId, paneIds: paneIdsKey ? paneIdsKey.split(',') : [], selectPreset, toggleMaximize }),
    [preset, focusedSessionId, paneIdsKey, selectPreset, toggleMaximize],
  );

  // Morph: when the arrangement changes (preset, focus, panes added, removed or
  // reordered) the cells glide to their new rects instead of jumping. The class
  // must land in the same commit as the new rects, so a pending change counts as
  // morphing during render; the timer then keeps it on until the last cell lands.
  // Divider drags are not part of the key, so resizing stays immediate.
  const layoutKey = `${preset}|${focusedSessionId ?? ''}|${paneIdsKey}`;
  const committedLayoutKey = useRef(layoutKey);
  const [morphActive, setMorphActive] = useState(false);
  const morphTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const morphing = morphActive || committedLayoutKey.current !== layoutKey;
  useLayoutEffect(() => {
    if (committedLayoutKey.current === layoutKey) return;
    committedLayoutKey.current = layoutKey;
    setMorphActive(true);
    if (morphTimer.current) clearTimeout(morphTimer.current);
    morphTimer.current = setTimeout(() => setMorphActive(false), MORPH_MS + MORPH_MAX_DELAY_MS + 80);
  }, [layoutKey]);
  useEffect(() => () => { if (morphTimer.current) clearTimeout(morphTimer.current); }, []);
  // Scroll when a preset would otherwise make the smaller terminals unusable.
  const focusBeside = preset === 'focus-left' || preset === 'focus-right';
  const focusAbove = preset === 'focus-top' || preset === 'focus-bottom';
  const minSurfaceWidth = sorted.length <= 1 ? 0 : preset === 'columns' ? sorted.length * 320
    : focusBeside ? 1080 : focusAbove ? (sorted.length - 1) * 320
    : preset === 'maximize' ? (sorted.length - 1) * 220 : 0;
  const minSurfaceHeight = sorted.length <= 1 ? 0 : preset === 'rows' ? sorted.length * 140
    : focusBeside ? (sorted.length - 1) * 140 : focusAbove ? 480
    : preset === 'maximize' ? 320 : 0;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const activeRowColSizes = useMemo(() => {
    if (
      rowColSizes &&
      rowColSizes.length === rows &&
      rowColSizes.every((rowArr) => rowArr.length === cols)
    ) {
      return rowColSizes.map((rowArr) => {
        const total = rowArr.reduce((a, b) => a + b, 0);
        return rowArr.map((s) => (s / total) * 100);
      });
    }
    return Array.from({ length: rows }, () => makeEqualSizes(cols));
  }, [rowColSizes, rows, cols]);

  const activeColRowSizes = useMemo(() => {
    if (
      colRowSizes &&
      colRowSizes.length === cols &&
      colRowSizes.every((colArr) => colArr.length === rows)
    ) {
      return colRowSizes.map((colArr) => {
        const total = colArr.reduce((a, b) => a + b, 0);
        return colArr.map((s) => (s / total) * 100);
      });
    }
    return Array.from({ length: cols }, () => makeEqualSizes(rows));
  }, [colRowSizes, cols, rows]);

  // Classic global sizes: one column split applied to every row, and one row
  // split applied to every column.
  const activeColSizes = useMemo(() => {
    if (colSizes && colSizes.length === cols) {
      const total = colSizes.reduce((a, b) => a + b, 0);
      return colSizes.map((s) => (s / total) * 100);
    }
    return makeEqualSizes(cols);
  }, [colSizes, cols]);

  const activeRowSizes = useMemo(() => {
    if (rowSizes && rowSizes.length === rows) {
      const total = rowSizes.reduce((a, b) => a + b, 0);
      return rowSizes.map((s) => (s / total) * 100);
    }
    return makeEqualSizes(rows);
  }, [rowSizes, rows]);

  // Effective per-cell sizes. Independent mode gives every row/column its own
  // split; classic mode applies the same global sizes to every row/column.
  const cellRowColSizes = useMemo(() => {
    if (independentGridResize) return activeRowColSizes;
    return Array.from({ length: rows }, () => activeColSizes);
  }, [independentGridResize, activeRowColSizes, activeColSizes, rows]);

  const cellColRowSizes = useMemo(() => {
    if (independentGridResize) return activeColRowSizes;
    return Array.from({ length: cols }, () => activeRowSizes);
  }, [independentGridResize, activeColRowSizes, activeRowSizes, cols]);

  const handleAddTerminal = useCallback(async (agent: CliType | null, shell: string | null) => {
    setShowNewDialog(false);
    try {
      const newSession = await invoke<TerminalSession>('create_single_terminal_session', {
        request: {
          workspaceId: workspace.id,
          workspacePath: workspace.path,
          index: sessions.length,
          agent,
          shell,
        },
      });
      addSession(newSession);
      setRowColSizes(null);
      setColRowSizes(null);
      setColSizes(null);
      setRowSizes(null);
    } catch (err) {
      console.error('Failed to create terminal:', err);
    }
  }, [workspace.id, workspace.path, sessions.length, addSession]);

  const handleRemoveTerminal = useCallback(async (sessionId: string) => {
    try {
      await invoke('kill_session', { sessionId });
    } catch (err) {
      console.error('Failed to kill session:', err);
    }
    removeSession(sessionId);
    setRowColSizes(null);
    setColRowSizes(null);
    setColSizes(null);
    setRowSizes(null);
  }, [removeSession]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const fromIndex = sorted.findIndex((s) => s.id === active.id);
    const toIndex = sorted.findIndex((s) => s.id === over.id);

    if (fromIndex !== -1 && toIndex !== -1) {
      const order = sorted.map((pane) => pane.id);
      const [moved] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, moved);
      setPaneOrder(layoutId, order);
      if (extensionPanels.length === 0) reorderSessions(fromIndex, toIndex);
    }
  }, [sorted, reorderSessions, setPaneOrder, layoutId, extensionPanels.length]);

  const activeExtension = activeId ? sorted.find((pane) => pane.id === activeId)?.extension ?? null : null;
  const activeSession = useMemo(
    () => (activeId ? sorted.find((s) => s.id === activeId)?.terminal ?? null : null),
    [activeId, sorted]
  );

  const getPointerPercent = useCallback((e: MouseEvent, axis: 'col' | 'row') => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    if (axis === 'col') {
      return ((e.clientX - rect.left) / rect.width) * 100;
    }
    return ((e.clientY - rect.top) / rect.height) * 100;
  }, []);

  const handleDividerDrag = useCallback((
    e: React.MouseEvent,
    axis: 'col' | 'row',
    dividerIndex: number,
    lineIndex?: number
  ) => {
    e.preventDefault();
    // lineIndex is the row for column dividers, and the column for row dividers.
    const r = axis === 'col' ? (lineIndex ?? 0) : 0;
    const c = axis === 'row' ? (lineIndex ?? 0) : 0;
    const sizes = axis === 'col'
      ? (independentGridResize ? activeRowColSizes[r] : activeColSizes)
      : (independentGridResize ? activeColRowSizes[c] : activeRowSizes);
    dragRef.current = {
      axis,
      index: dividerIndex,
      row: axis === 'col' ? r : -1,
      col: axis === 'row' ? c : -1,
      startPos: getPointerPercent(e.nativeEvent, axis),
      startSizes: [...sizes],
    };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const { axis: a, index: idx, row, col, startPos: sp, startSizes: ss } = dragRef.current;
      const pos = getPointerPercent(ev, a);
      const diff = pos - sp;
      const newSizes = [...ss];
      const pairTotal = ss[idx] + ss[idx + 1];
      const newA = Math.max(MIN_SIZE, Math.min(pairTotal - MIN_SIZE, ss[idx] + diff));
      newSizes[idx] = newA;
      newSizes[idx + 1] = pairTotal - newA;

      if (a === 'col') {
        if (independentGridResize) {
          // Resize only the columns of the dragged row, never other rows.
          setRowColSizes((prev) => {
            const base =
              prev && prev.length === rows && prev.every((rowArr) => rowArr.length === cols)
                ? prev.map((rowArr) => [...rowArr])
                : Array.from({ length: rows }, () => makeEqualSizes(cols));
            base[row] = newSizes;
            return base;
          });
        } else {
          // Classic mode: resize the column across every row.
          setColSizes(newSizes);
        }
      } else {
        if (independentGridResize) {
          // Resize only the rows of the dragged column, never other columns.
          setColRowSizes((prev) => {
            const base =
              prev && prev.length === cols && prev.every((colArr) => colArr.length === rows)
                ? prev.map((colArr) => [...colArr])
                : Array.from({ length: cols }, () => makeEqualSizes(rows));
            base[col] = newSizes;
            return base;
          });
        } else {
          // Classic mode: resize the row across every column.
          setRowSizes(newSizes);
        }
      }
    };

    const handleUp = () => {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    document.body.style.cursor = axis === 'col' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [activeRowColSizes, activeColRowSizes, activeColSizes, activeRowSizes, independentGridResize, getPointerPercent, rows, cols]);

  // Double-clicking a divider resets the split it controls back to equal sizes.
  // lineIndex is the row for column dividers, and the column for row dividers.
  const handleDividerReset = useCallback((axis: 'col' | 'row', lineIndex?: number) => {
    if (axis === 'col') {
      if (independentGridResize) {
        const r = lineIndex ?? 0;
        setRowColSizes((prev) => {
          const base =
            prev && prev.length === rows && prev.every((rowArr) => rowArr.length === cols)
              ? prev.map((rowArr) => [...rowArr])
              : Array.from({ length: rows }, () => makeEqualSizes(cols));
          base[r] = makeEqualSizes(cols);
          return base;
        });
      } else {
        setColSizes(makeEqualSizes(cols));
      }
    } else {
      if (independentGridResize) {
        const c = lineIndex ?? 0;
        setColRowSizes((prev) => {
          const base =
            prev && prev.length === cols && prev.every((colArr) => colArr.length === rows)
              ? prev.map((colArr) => [...colArr])
              : Array.from({ length: cols }, () => makeEqualSizes(rows));
          base[c] = makeEqualSizes(rows);
          return base;
        });
      } else {
        setRowSizes(makeEqualSizes(rows));
      }
    }
  }, [independentGridResize, rows, cols]);

  if (!isExtensions && isLoading) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-zinc-500">
        <div className="flex flex-col items-center gap-4">
          <BoxLoader />
          <div className="text-[10px] uppercase tracking-widest opacity-60 animate-pulse">
            [ Initializing TTY Sessions ]
          </div>
        </div>
      </div>
    );
  }

  if (isExtensions && sorted.length === 0) {
    return (
      <section className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center" aria-label="Extension workspace">
        <PuzzlePiece size={36} weight="light" className="text-[var(--text-secondary)]" aria-hidden="true" />
        <div className="max-w-sm space-y-2">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">Open an AI extension</h2>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">Choose an assistant from the extensions catalog. Its panel opens here, ready to work in {workspace.name}.</p>
        </div>
        <button type="button" className="app-button" onClick={onBrowseExtensions}><Plus size={16} aria-hidden="true" />Browse extensions</button>
      </section>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center font-mono text-[var(--text-secondary)]">
        <div className="text-center space-y-4">
          <svg className="w-12 h-12 mx-auto text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">
            No terminal sessions
          </div>
          <button
            onClick={() => setShowNewDialog(true)}
            className="px-6 py-2.5 border text-[11px] font-bold uppercase tracking-widest transition-colors duration-200 cursor-pointer border-[var(--border-primary)] text-[var(--text-primary)] hover:border-[var(--text-secondary)]"
          >
            + {isExtensions ? 'Open extension' : 'New Terminal'}
          </button>
        </div>
        {showNewDialog && (
          <NewTerminalDialog
            onClose={() => setShowNewDialog(false)}
            onSelect={handleAddTerminal}
          />
        )}
      </div>
    );
  }

  const cellCount = cols * rows;
  const sortableIds = sorted.map((s) => s.id);
  // The grid surface already has an outer inset. Each cell also needs to
  // surrender its share of the internal gaps, otherwise the last column and
  // row extend all the way to the surface edge while the first ones do not.
  const cellWidthGap = cols > 1 ? (GAP_PX * (cols - 1)) / cols : 0;
  const cellHeightGap = rows > 1 ? (GAP_PX * (rows - 1)) / rows : 0;

  const renderGridContent = () => (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div
          className={`terminal-grid-surface absolute z-0${morphing ? ' terminal-grid-surface--morphing' : ''}`}
          style={{
            top: GAP_PX,
            right: GAP_PX,
            bottom: GAP_PX,
            left: GAP_PX,
            minWidth: minSurfaceWidth,
            minHeight: minSurfaceHeight,
          }}
        >
          {sorted.map((session, idx) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const leftPct = cellRowColSizes[r].slice(0, c).reduce((a, b) => a + b, 0);
            const topPct = cellColRowSizes[c].slice(0, r).reduce((a, b) => a + b, 0);
            const minimized = customLayout && presetRects[idx].minimized === true;
            // The focused pane leads the morph; the rest follow outward from it.
            const morphDelay = Math.min(Math.abs(idx - focusedIndex) * MORPH_STAGGER_MS, MORPH_MAX_DELAY_MS);
            return (
              <div
                key={session.id}
                className={`terminal-cell absolute overflow-hidden${idx === focusedIndex ? ' terminal-cell--lead' : ''}${minimized ? ' terminal-cell--minimized' : ''}`}
                data-terminal-session={session.id}
                title={minimized ? 'Click to maximize this pane' : undefined}
                onClick={minimized ? (event) => {
                  // Header controls keep working; clicking anywhere else swaps this pane in.
                  if ((event.target as Element).closest('button, a, input, select, textarea, [role="menuitem"]')) return;
                  selectPreset('maximize', session.id);
                } : undefined}
                style={{
                  left: `calc(${leftPct}% + ${c * GAP_PX}px)`,
                  top: `calc(${topPct}% + ${r * GAP_PX}px)`,
                  width: `calc(${cellRowColSizes[r][c]}% - ${cellWidthGap}px)`,
                  height: `calc(${cellColRowSizes[c][r]}% - ${cellHeightGap}px)`,
                  ...(customLayout ? presetCellStyle(presetRects[idx]) : {}),
                  ['--morph-delay' as string]: `${morphDelay}ms`,
                }}
              >
                {session.terminal ? (
                  <SortableTerminalPane
                    session={session.terminal}
                    onClose={() => handleRemoveTerminal(session.id)}
                  />
                ) : session.extension ? (
                  <ExtensionPane
                    panel={session.extension}
                    workspace={workspace}
                    visible={visible}
                    suspended={activeId !== null || showNewDialog || morphing}
                  />
                ) : null}
              </div>
            );
          })}

          {!customLayout && sorted.length < cellCount &&
            (() => {
              const r = Math.floor(sorted.length / cols);
              const c = sorted.length % cols;
              const leftPct = cellRowColSizes[r].slice(0, c).reduce((a, b) => a + b, 0);
              const topPct = cellColRowSizes[c].slice(0, r).reduce((a, b) => a + b, 0);
              return (
                <div
                  className="terminal-cell terminal-cell--placeholder absolute overflow-hidden rounded-[10px] border bg-zinc-950/30 border-zinc-800"
                  style={{
                    left: `calc(${leftPct}% + ${c * GAP_PX}px)`,
                    top: `calc(${topPct}% + ${r * GAP_PX}px)`,
                    width: `calc(${cellRowColSizes[r][c]}% - ${cellWidthGap}px)`,
                    height: `calc(${cellColRowSizes[c][r]}% - ${cellHeightGap}px)`,
                  }}
                >
                  <button
                    type="button"
                    className="group/empty flex h-full w-full cursor-pointer items-center justify-center border-0 bg-[var(--bg-secondary)]/45 text-left transition-colors duration-200 hover:bg-[var(--bg-tertiary)]/70"
                    onClick={() => isExtensions ? onBrowseExtensions?.() : setShowNewDialog(true)}
                    title={isExtensions ? 'Open extension' : 'Spawn Terminal'}
                    aria-label={isExtensions ? 'Open an extension' : 'Spawn a new terminal'}
                  >
                    <div className="flex flex-col items-center gap-3 transition-transform duration-200 group-hover/empty:-translate-y-0.5">
                      <div className="flex h-10 w-10 items-center justify-center border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] transition-colors duration-200 group-hover/empty:border-[var(--accent-border)] group-hover/empty:text-[var(--text-primary)]">
                        {isExtensions ? <PuzzlePiece size={18} aria-hidden="true" /> : <TerminalWindow size={18} weight="regular" aria-hidden="true" />}
                        <Plus className="-ml-1.5 -mt-3" size={10} weight="bold" aria-hidden="true" />
                      </div>
                      <span className="text-xs font-medium tracking-tight text-[var(--text-secondary)] transition-colors duration-200 group-hover/empty:text-[var(--text-primary)]">{isExtensions ? 'Open extension' : 'New terminal'}</span>
                      <span className="-mt-1 text-[11px] text-[var(--text-secondary)]/65">{isExtensions ? 'Choose an AI assistant' : 'Open a shell session'}</span>
                    </div>
                  </button>
                </div>
              );
            })()}

          {/* Vertical dividers (independent): one segment per row, confined to that row's band */}
          {!customLayout && independentGridResize && cols > 1 &&
            Array.from({ length: rows }).flatMap((_, r) =>
              Array.from({ length: cols - 1 }).map((_, ci) => {
                const leftPct = activeRowColSizes[r].slice(0, ci + 1).reduce((a, b) => a + b, 0);
                const topPct = activeColRowSizes[ci].slice(0, r).reduce((a, b) => a + b, 0);
                return (
                  <div
                    key={`vdiv-${r}-${ci}`}
                    onMouseDown={(e) => handleDividerDrag(e, 'col', ci, r)}
                    onDoubleClick={() => handleDividerReset('col', r)}
                    title="Double-click to reset to equal widths"
                    className="absolute cursor-col-resize z-10 group/divider"
                    style={{
                      left: `calc(${leftPct}% + ${ci * GAP_PX}px + ${(GAP_PX - DIVIDER) / 2}px)`,
                      width: `${DIVIDER}px`,
                      top: `calc(${topPct}% + ${r * GAP_PX}px)`,
                      height: `${activeColRowSizes[ci][r]}%`,
                      // Only capture pointer events when hovering the divider
                      pointerEvents: 'auto',
                    }}
                  >
                    <div className="w-1 h-full transition-all duration-300 mx-auto bg-transparent group-hover/divider:bg-zinc-500/60 group-active/divider:bg-zinc-400/70" />
                  </div>
                );
              })
            )}

          {/* Horizontal dividers (independent): one segment per column, confined to that column's band */}
          {!customLayout && independentGridResize && rows > 1 &&
            Array.from({ length: cols }).flatMap((_, c) =>
              Array.from({ length: rows - 1 }).map((_, ri) => {
                const topPct = activeColRowSizes[c].slice(0, ri + 1).reduce((a, b) => a + b, 0);
                const leftPct = activeRowColSizes[ri].slice(0, c).reduce((a, b) => a + b, 0);
                return (
                  <div
                    key={`hdiv-${c}-${ri}`}
                    onMouseDown={(e) => handleDividerDrag(e, 'row', ri, c)}
                    onDoubleClick={() => handleDividerReset('row', c)}
                    title="Double-click to reset to equal heights"
                    className="absolute cursor-row-resize z-10 group/divider"
                    style={{
                      top: `calc(${topPct}% + ${ri * GAP_PX}px + ${(GAP_PX - DIVIDER) / 2}px)`,
                      height: `${DIVIDER}px`,
                      left: `calc(${leftPct}% + ${c * GAP_PX}px)`,
                      width: `${activeRowColSizes[ri][c]}%`,
                      // Only capture pointer events when hovering the divider
                      pointerEvents: 'auto',
                    }}
                  >
                    <div className="h-1 w-full transition-all duration-300 my-auto bg-transparent group-hover/divider:bg-zinc-500/60 group-active/divider:bg-zinc-400/70" />
                  </div>
                );
              })
            )}

          {/* Classic dividers (global resize): one full-height line per column
              and one full-width line per row, matching the original behavior */}
          {!customLayout && !independentGridResize && cols > 1 && Array.from({ length: cols - 1 }).map((_, ci) => {
            const leftPct = cellRowColSizes[0].slice(0, ci + 1).reduce((a, b) => a + b, 0);
            return (
              <div
                key={`vdiv-classic-${ci}`}
                onMouseDown={(e) => handleDividerDrag(e, 'col', ci)}
                onDoubleClick={() => handleDividerReset('col')}
                title="Double-click to reset to equal widths"
                className="absolute cursor-col-resize z-10 group/divider"
                style={{
                  left: `calc(${leftPct}% + ${ci * GAP_PX}px + ${(GAP_PX - DIVIDER) / 2}px)`,
                  width: `${DIVIDER}px`,
                  top: 0,
                  bottom: 0,
                  // Only capture pointer events when hovering the divider
                  pointerEvents: 'auto',
                }}
              >
                <div className="w-1 h-full transition-all duration-300 mx-auto bg-transparent group-hover/divider:bg-zinc-500/60 group-active/divider:bg-zinc-400/70" />
              </div>
            );
          })}

          {!customLayout && !independentGridResize && rows > 1 && Array.from({ length: rows - 1 }).map((_, ri) => {
            const topPct = cellColRowSizes[0].slice(0, ri + 1).reduce((a, b) => a + b, 0);
            return (
              <div
                key={`hdiv-classic-${ri}`}
                onMouseDown={(e) => handleDividerDrag(e, 'row', ri)}
                onDoubleClick={() => handleDividerReset('row')}
                title="Double-click to reset to equal heights"
                className="absolute cursor-row-resize z-10 group/divider"
                style={{
                  top: `calc(${topPct}% + ${ri * GAP_PX}px + ${(GAP_PX - DIVIDER) / 2}px)`,
                  height: `${DIVIDER}px`,
                  left: 0,
                  right: 0,
                  // Only capture pointer events when hovering the divider
                  pointerEvents: 'auto',
                }}
              >
                <div className="h-1 w-full transition-all duration-300 my-auto bg-transparent group-hover/divider:bg-zinc-500/60 group-active/divider:bg-zinc-400/70" />
              </div>
            );
          })}
        </div>
      </SortableContext>

      <DragOverlay
        modifiers={DRAG_OVERLAY_MODIFIERS}
        dropAnimation={{
          duration: 240,
          easing: 'cubic-bezier(0.18, 0.89, 0.32, 1.28)',
        }}
      >
        {activeSession ? (
          <div className="terminal-drag-preview select-none pointer-events-none">
            <div className="terminal-drag-preview__header">
              <div className="flex items-center gap-2 min-w-0">
                <div className="terminal-drag-preview__icon-badge">
                  <TerminalWindow size={13} weight="bold" />
                </div>
                <span className="terminal-drag-preview__tty-badge">
                  TTY:{activeSession.index + 1}
                </span>
                {activeSession.agent ? (
                  <span className="terminal-drag-preview__agent-badge">
                    {activeSession.agent}
                  </span>
                ) : (
                  <span className="terminal-drag-preview__shell-badge">
                    {activeSession.shell ? activeSession.shell.split(/[\\/]/).pop() : 'Shell'}
                  </span>
                )}
              </div>
              <div className="terminal-drag-preview__status">
                <span className="terminal-drag-preview__pulse-dot" />
                <span>Moving</span>
              </div>
            </div>
            <div className="terminal-drag-preview__body">
              <div className="terminal-drag-preview__line">
                <span className="terminal-drag-preview__prompt">&gt;</span>
                <span className="text-[var(--text-secondary)] truncate">
                  {activeSession.agent ? `${activeSession.agent} session` : (activeSession.shell ? activeSession.shell.split(/[\\/]/).pop() : 'terminal')}
                </span>
                <span className="terminal-drag-preview__cursor">_</span>
              </div>
              <div className="terminal-drag-preview__hint">
                Drag to swap or reposition in grid
              </div>
            </div>
          </div>
        ) : activeExtension ? (
          <div className="terminal-drag-preview select-none pointer-events-none">
            <div className="terminal-drag-preview__header">
              <div className="flex min-w-0 items-center gap-2">
                <ExtensionLogo extensionId={activeExtension.extensionId} name={activeExtension.name} small />
                <span className="truncate text-xs font-medium">{activeExtension.name}</span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Moving</span>
            </div>
            <div className="terminal-drag-preview__body text-xs text-[var(--text-secondary)]">Drag to reorder extension panels</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <TerminalLayoutContext.Provider value={layoutControls}>
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      {isExtensions && (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
            <PuzzlePiece size={16} aria-hidden="true" />
            <span>{sorted.length} {sorted.length === 1 ? 'extension' : 'extensions'} open</span>
          </div>
          <button type="button" className="app-button h-7 min-h-0 px-2.5 text-xs" onClick={onBrowseExtensions}><Plus size={14} aria-hidden="true" />Open extension</button>
        </header>
      )}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative overflow-auto"
        data-terminal-layout={preset}
      >
        {renderGridContent()}
      </div>

      {showNewDialog && (
        <NewTerminalDialog
          onClose={() => setShowNewDialog(false)}
          onSelect={handleAddTerminal}
        />
      )}
    </div>
    </TerminalLayoutContext.Provider>
  );
};
