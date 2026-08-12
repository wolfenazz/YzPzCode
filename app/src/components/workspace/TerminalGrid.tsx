import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { TerminalSession, CliType } from '../../types';
import { SortableTerminalPane } from './SortableTerminalPane';
import { NewTerminalDialog } from './NewTerminalDialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';

interface TerminalGridProps {
  sessions: TerminalSession[];
  isLoading?: boolean;
}

function getGridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

function makeEqualSizes(n: number): number[] {
  const s = 100 / n;
  return Array.from({ length: n }, () => s);
}

const MIN_SIZE = 12;
const DIVIDER = 3;
const GAP_PX = 8;

export const TerminalGrid: React.FC<TerminalGridProps> = ({ sessions, isLoading }) => {
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
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const independentGridResize = useAppStore((s) => s.independentGridResize);

  const sorted = useMemo(() => [...sessions].sort((a, b) => a.index - b.index), [sessions]);
  const { cols, rows } = getGridDimensions(sorted.length);

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
    if (!currentWorkspace) return;
    setShowNewDialog(false);
    try {
      const newSession = await invoke<TerminalSession>('create_single_terminal_session', {
        request: {
          workspaceId: currentWorkspace.id,
          workspacePath: currentWorkspace.path,
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
  }, [currentWorkspace, sessions.length, addSession]);

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
      reorderSessions(fromIndex, toIndex);
    }
  }, [sorted, reorderSessions]);

  const activeSession = useMemo(
    () => (activeId ? sorted.find((s) => s.id === activeId) ?? null : null),
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

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-zinc-500">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-2 rounded-full shadow-inner border-zinc-800" />
            <div className="absolute inset-0 border-2 border-t-emerald-500 rounded-full animate-spin shadow-[0_0_10px_rgba(16,185,129,0.2)]" />
          </div>
          <div className="text-[10px] uppercase tracking-widest opacity-60 animate-pulse">
            [ Initializing TTY Sessions ]
          </div>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center font-mono text-zinc-500">
        <div className="text-center space-y-4">
          <svg className="w-12 h-12 mx-auto text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-600">
            No terminal sessions
          </div>
          <button
            onClick={() => setShowNewDialog(true)}
            className="px-6 py-2.5 border text-[11px] font-bold uppercase tracking-widest transition-colors duration-200 cursor-pointer border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-200"
          >
            + New Terminal
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

  const renderGridContent = () => (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div
          className="absolute z-0"
          style={{
            top: GAP_PX,
            right: GAP_PX,
            bottom: GAP_PX,
            left: GAP_PX,
          }}
        >
          {sorted.map((session, idx) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const leftPct = cellRowColSizes[r].slice(0, c).reduce((a, b) => a + b, 0);
            const topPct = cellColRowSizes[c].slice(0, r).reduce((a, b) => a + b, 0);
            return (
              <div
                key={session.id}
                className="absolute overflow-hidden"
                style={{
                  left: `calc(${leftPct}% + ${c * GAP_PX}px)`,
                  top: `calc(${topPct}% + ${r * GAP_PX}px)`,
                  width: `${cellRowColSizes[r][c]}%`,
                  height: `${cellColRowSizes[c][r]}%`,
                }}
              >
                <SortableTerminalPane
                  session={session}
                  onClose={() => handleRemoveTerminal(session.id)}
                />
              </div>
            );
          })}

          {sorted.length < cellCount &&
            (() => {
              const r = Math.floor(sorted.length / cols);
              const c = sorted.length % cols;
              const leftPct = cellRowColSizes[r].slice(0, c).reduce((a, b) => a + b, 0);
              const topPct = cellColRowSizes[c].slice(0, r).reduce((a, b) => a + b, 0);
              return (
                <div
                  className={`absolute overflow-hidden border bg-zinc-950/30 border-zinc-800`}
                  style={{
                    left: `calc(${leftPct}% + ${c * GAP_PX}px)`,
                    top: `calc(${topPct}% + ${r * GAP_PX}px)`,
                    width: `${cellRowColSizes[r][c]}%`,
                    height: `${cellColRowSizes[c][r]}%`,
                  }}
                >
                  <div
                    className="h-full flex items-center justify-center cursor-pointer transition-all duration-300 group/empty bg-zinc-900/20 hover:bg-zinc-900/40"
                    onClick={() => setShowNewDialog(true)}
                    title="Spawn Terminal"
                  >
                    <div className="flex flex-col items-center gap-4 transition-all duration-300 group-hover/empty:scale-110">
                      <div className="w-12 h-12 flex items-center justify-center border-2 transition-all duration-300 border-zinc-700 text-zinc-500 group-hover/empty:border-zinc-500 group-hover/empty:bg-zinc-800/35 group-hover/empty:text-zinc-300">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <span className="text-[10px] uppercase font-black tracking-[0.3em] transition-colors duration-300 text-zinc-700 group-hover/empty:text-zinc-400">Spawn_TTY</span>
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Vertical dividers (independent): one segment per row, confined to that row's band */}
          {independentGridResize && cols > 1 &&
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
          {independentGridResize && rows > 1 &&
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
          {!independentGridResize && cols > 1 && Array.from({ length: cols - 1 }).map((_, ci) => {
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

          {!independentGridResize && rows > 1 && Array.from({ length: rows - 1 }).map((_, ri) => {
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

      <DragOverlay dropAnimation={null}>
        {activeSession ? (
          <div className="border border-zinc-700 overflow-hidden bg-zinc-950/90 border-zinc-700">
            <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900/90">
              <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-400">
                TTY::{activeSession.index + 1}
              </span>
              {activeSession.agent && (
                <span className="text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 border bg-zinc-950 border-zinc-800 text-zinc-400">
                  {activeSession.agent}
                </span>
              )}
            </div>
            <div className="h-24 flex items-center justify-center bg-zinc-950/80 text-zinc-700">
              <span className="text-[10px] uppercase tracking-widest font-bold">Moving...</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <div className="h-full w-full flex flex-col bg-theme-main relative overflow-hidden">
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative"
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
  );
};
