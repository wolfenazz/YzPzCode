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
import { TerminalSession, AgentType } from '../../types';
import { SortableTerminalPane } from './SortableTerminalPane';
import { NewTerminalDialog } from './NewTerminalDialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';

interface TerminalGridProps {
  sessions: TerminalSession[];
  isLoading?: boolean;
  theme: 'dark' | 'light';
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

interface CellRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MIN_SIZE = 12;
const DIVIDER = 3;
const GAP_PX = 6;

function buildEqualCellRects(count: number, cols: number, rows: number, gap: number): CellRect[] {
  const usable = 100;
  const cellW = (usable - gap * (cols - 1)) / cols;
  const cellH = (usable - gap * (rows - 1)) / rows;
  const rects: CellRect[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    rects.push({
      left: col * (cellW + gap),
      top: row * (cellH + gap),
      width: cellW,
      height: cellH,
    });
  }
  return rects;
}

export const TerminalGrid: React.FC<TerminalGridProps> = ({ sessions, isLoading, theme }) => {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [colSizes, setColSizes] = useState<number[] | null>(null);
  const [rowSizes, setRowSizes] = useState<number[] | null>(null);
  const [cellRects, setCellRects] = useState<CellRect[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    axis: 'col' | 'row';
    index: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);
  const absDragRef = useRef<{
    dividerKey: string;
    startPos: number;
    startRects: CellRect[];
  } | null>(null);

  const isLight = theme === 'light';
  const addSession = useAppStore((s) => s.addSession);
  const removeSession = useAppStore((s) => s.removeSession);
  const reorderSessions = useAppStore((s) => s.reorderSessions);
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const independentResize = useAppStore((s) => s.independentResize);

  const sorted = useMemo(() => [...sessions].sort((a, b) => a.index - b.index), [sessions]);
  const { cols, rows } = getGridDimensions(sorted.length);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

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

  const activeCellRects = useMemo(() => {
    if (cellRects && cellRects.length === sorted.length) {
      return cellRects;
    }
    return buildEqualCellRects(sorted.length, cols, rows, GAP_PX);
  }, [cellRects, sorted.length, cols, rows]);

  const gridTemplateColumns = activeColSizes.map((s) => `${s}%`).join(' ');
  const gridTemplateRows = activeRowSizes.map((s) => `${s}%`).join(' ');

  const handleAddTerminal = useCallback(async (agent: AgentType | null, shell: string | null) => {
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
      setColSizes(null);
      setRowSizes(null);
      setCellRects(null);
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
    setColSizes(null);
    setRowSizes(null);
    setCellRects(null);
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
    dividerIndex: number
  ) => {
    e.preventDefault();
    const sizes = axis === 'col' ? activeColSizes : activeRowSizes;
    dragRef.current = {
      axis,
      index: dividerIndex,
      startPos: getPointerPercent(e.nativeEvent, axis),
      startSizes: [...sizes],
    };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const { axis: a, index: idx, startPos: sp, startSizes: ss } = dragRef.current;
      const pos = getPointerPercent(ev, a);
      const diff = pos - sp;
      const newSizes = [...ss];
      const pairTotal = ss[idx] + ss[idx + 1];
      const newA = Math.max(MIN_SIZE, Math.min(pairTotal - MIN_SIZE, ss[idx] + diff));
      newSizes[idx] = newA;
      newSizes[idx + 1] = pairTotal - newA;

      if (a === 'col') setColSizes(newSizes);
      else setRowSizes(newSizes);
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
  }, [activeColSizes, activeRowSizes, getPointerPercent]);

  const handleAbsDividerDrag = useCallback((
    e: React.MouseEvent,
    dividerKey: string
  ) => {
    e.preventDefault();
    absDragRef.current = {
      dividerKey,
      startPos: getPointerPercent(e.nativeEvent, dividerKey.startsWith('col:') ? 'col' : 'row'),
      startRects: activeCellRects.map((r) => ({ ...r })),
    };

    const handleMove = (ev: MouseEvent) => {
      if (!absDragRef.current) return;
      const { dividerKey: key, startPos: sp, startRects: sr } = absDragRef.current;
      const axis: 'col' | 'row' = key.startsWith('col:') ? 'col' : 'row';
      const pos = getPointerPercent(ev, axis);
      const diff = pos - sp;
      const newRects = sr.map((r) => ({ ...r }));

      if (axis === 'col') {
        const parts = key.split(':');
        const leftIdx = parseInt(parts[1], 10);
        const rightIdx = parseInt(parts[2], 10);
        const pairW = sr[leftIdx].width + sr[rightIdx].width;
        const newLeftW = Math.max(MIN_SIZE, Math.min(pairW - MIN_SIZE, sr[leftIdx].width + diff));
        newRects[leftIdx] = { ...newRects[leftIdx], width: newLeftW };
        newRects[rightIdx] = {
          ...newRects[rightIdx],
          left: newRects[leftIdx].left + newLeftW + GAP_PX,
          width: pairW - newLeftW,
        };
      } else {
        const parts = key.split(':');
        const topIdx = parseInt(parts[1], 10);
        const bottomIdx = parseInt(parts[2], 10);
        const pairH = sr[topIdx].height + sr[bottomIdx].height;
        const newTopH = Math.max(MIN_SIZE, Math.min(pairH - MIN_SIZE, sr[topIdx].height + diff));
        newRects[topIdx] = { ...newRects[topIdx], height: newTopH };
        newRects[bottomIdx] = {
          ...newRects[bottomIdx],
          top: newRects[topIdx].top + newTopH + GAP_PX,
          height: pairH - newTopH,
        };
      }

      setCellRects(newRects);
    };

    const handleUp = () => {
      absDragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    document.body.style.cursor = dividerKey.startsWith('col:') ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [activeCellRects, getPointerPercent]);

  if (isLoading) {
    return (
      <div className={`h-full flex items-center justify-center font-mono ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className={`absolute inset-0 border-2 rounded-full shadow-inner ${isLight ? 'border-zinc-300' : 'border-zinc-800'}`} />
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
      <div className={`h-full flex flex-col items-center justify-center font-mono ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
        <div className="text-center space-y-4">
          <svg className={`w-12 h-12 mx-auto ${isLight ? 'text-zinc-300' : 'text-zinc-800'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div className={`text-[10px] uppercase tracking-widest font-bold ${isLight ? 'text-zinc-400' : 'text-zinc-600'}`}>
            No terminal sessions
          </div>
          <button
            onClick={() => setShowNewDialog(true)}
            className={`px-6 py-2.5 border rounded-sm text-[11px] font-bold uppercase tracking-widest transition-colors duration-200 cursor-pointer ${
              isLight
                ? 'border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-700'
                : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-200'
            }`}
          >
            + New Terminal
          </button>
        </div>
        {showNewDialog && (
          <NewTerminalDialog
            onClose={() => setShowNewDialog(false)}
            onSelect={handleAddTerminal}
            theme={theme}
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
          className="absolute inset-1 z-0"
          style={{
            display: 'grid',
            gridTemplateColumns,
            gridTemplateRows,
            gap: `${GAP_PX}px`,
          }}
        >
          {sorted.map((session, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            return (
              <div
                key={session.id}
                className={`relative overflow-hidden rounded-xl border bg-theme-card shadow-xl border-theme`}
                style={{ gridRow: row + 1, gridColumn: col + 1 }}
              >
                <SortableTerminalPane
                  session={session}
                  onClose={() => handleRemoveTerminal(session.id)}
                  theme={theme}
                />
              </div>
            );
          })}
          {sorted.length < cellCount && (
            <div
              className={`relative overflow-hidden rounded-xl border bg-theme-card shadow-xl border-theme`}
              style={{ gridRow: Math.floor(sorted.length / cols) + 1, gridColumn: (sorted.length % cols) + 1 }}
            >
              <div
                className={`h-full flex items-center justify-center cursor-pointer transition-all duration-300 group/empty ${
                  isLight
                    ? 'bg-zinc-800/10 hover:bg-zinc-800/30'
                    : 'bg-zinc-900/10 hover:bg-zinc-900/30'
                }`}
                onClick={() => setShowNewDialog(true)}
                title="Spawn Terminal"
              >
                <div className="flex flex-col items-center gap-4 transition-all duration-300 group-hover/empty:scale-110">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${
                    isLight
                      ? 'border-zinc-700 text-zinc-500 group-hover/empty:border-zinc-500 group-hover/empty:bg-zinc-800/40'
                      : 'border-zinc-800 text-zinc-700 group-hover/empty:border-zinc-600 group-hover/empty:bg-zinc-800/20 group-hover/empty:text-zinc-400'
                  }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className={`text-[10px] uppercase font-black tracking-[0.3em] transition-colors duration-300 ${
                    isLight ? 'text-zinc-500 group-hover/empty:text-zinc-300' : 'text-zinc-700 group-hover/empty:text-zinc-400'
                  }`}>Spawn_TTY</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeSession ? (
          <div className={`rounded-xl border shadow-2xl overflow-hidden ${
            isLight ? 'bg-zinc-900/90 border-zinc-600' : 'bg-zinc-950/90 border-zinc-700'
          }`}>
            <div className={`flex items-center gap-3 px-3 py-2 ${
              isLight ? 'bg-zinc-800/90' : 'bg-zinc-900/90'
            }`}>
              <span className={`text-[10px] font-black tracking-[0.2em] uppercase ${
                isLight ? 'text-zinc-300' : 'text-zinc-400'
              }`}>
                TTY::{activeSession.index + 1}
              </span>
              {activeSession.agent && (
                <span className={`text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md border ${
                  isLight ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}>
                  {activeSession.agent}
                </span>
              )}
            </div>
            <div className={`h-24 flex items-center justify-center ${
              isLight ? 'bg-zinc-900/80 text-zinc-600' : 'bg-zinc-950/80 text-zinc-700'
            }`}>
              <span className="text-[10px] uppercase tracking-widest font-bold">Moving...</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  const renderGridDividers = () => (
    <>
      {cols > 1 && Array.from({ length: cols - 1 }).map((_, ci) => {
        const leftPercent = activeColSizes.slice(0, ci + 1).reduce((a, b) => a + b, 0);
        return (
          <div
            key={`col-${ci}`}
            onMouseDown={(e) => handleDividerDrag(e, 'col', ci)}
            className="absolute top-2 bottom-2 cursor-col-resize z-30 group/divider"
            style={{
              left: `calc(${leftPercent}% - ${DIVIDER / 2}px)`,
              width: `${DIVIDER}px`,
            }}
          >
            <div className={`w-1 h-full transition-all duration-300 mx-auto rounded-full ${
              isLight
                ? 'bg-transparent group-hover/divider:bg-zinc-600/50'
                : 'bg-transparent group-hover/divider:bg-zinc-700/50 group-active/divider:bg-zinc-500'
            }`} />
          </div>
        );
      })}

      {rows > 1 && Array.from({ length: rows - 1 }).map((_, ri) => {
        const topPercent = activeRowSizes.slice(0, ri + 1).reduce((a, b) => a + b, 0);
        return (
          <div
            key={`row-${ri}`}
            onMouseDown={(e) => handleDividerDrag(e, 'row', ri)}
            className="absolute left-2 right-2 cursor-row-resize z-30 group/divider"
            style={{
              top: `calc(${topPercent}% - ${DIVIDER / 2}px)`,
              height: `${DIVIDER}px`,
            }}
          >
            <div className={`h-1 w-full transition-all duration-300 my-auto rounded-full ${
              isLight
                ? 'bg-transparent group-hover/divider:bg-zinc-600/50'
                : 'bg-transparent group-hover/divider:bg-zinc-700/50 group-active/divider:bg-zinc-500'
            }`} />
          </div>
        );
      })}
    </>
  );

  const renderAbsContent = () => {
    const allRects = [...activeCellRects];
    while (allRects.length < cellCount) {
      allRects.push(buildEqualCellRects(cellCount, cols, rows, GAP_PX)[allRects.length] || { top: 0, left: 0, width: 0, height: 0 });
    }

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
          <div className="absolute inset-1 z-0">
            {sorted.map((session, idx) => {
              const r = allRects[idx];
              return (
                <div
                  key={session.id}
                  className="absolute overflow-hidden rounded-xl border bg-theme-card shadow-xl border-theme"
                  style={{
                    top: `${r.top}%`,
                    left: `${r.left}%`,
                    width: `${r.width}%`,
                    height: `${r.height}%`,
                  }}
                >
                  <SortableTerminalPane
                    session={session}
                    onClose={() => handleRemoveTerminal(session.id)}
                    theme={theme}
                  />
                </div>
              );
            })}
            {sorted.length < cellCount && (() => {
              const r = allRects[sorted.length];
              return (
                <div
                  className="absolute overflow-hidden rounded-xl border bg-theme-card shadow-xl border-theme"
                  style={{
                    top: `${r.top}%`,
                    left: `${r.left}%`,
                    width: `${r.width}%`,
                    height: `${r.height}%`,
                  }}
                >
                  <div
                    className={`h-full flex items-center justify-center cursor-pointer transition-all duration-300 group/empty ${
                      isLight
                        ? 'bg-zinc-800/10 hover:bg-zinc-800/30'
                        : 'bg-zinc-900/10 hover:bg-zinc-900/30'
                    }`}
                    onClick={() => setShowNewDialog(true)}
                    title="Spawn Terminal"
                  >
                    <div className="flex flex-col items-center gap-4 transition-all duration-300 group-hover/empty:scale-110">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${
                        isLight
                          ? 'border-zinc-700 text-zinc-500 group-hover/empty:border-zinc-500 group-hover/empty:bg-zinc-800/40'
                          : 'border-zinc-800 text-zinc-700 group-hover/empty:border-zinc-600 group-hover/empty:bg-zinc-800/20 group-hover/empty:text-zinc-400'
                      }`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <span className={`text-[10px] uppercase font-black tracking-[0.3em] transition-colors duration-300 ${
                        isLight ? 'text-zinc-500 group-hover/empty:text-zinc-300' : 'text-zinc-700 group-hover/empty:text-zinc-400'
                      }`}>Spawn_TTY</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeSession ? (
            <div className={`rounded-xl border shadow-2xl overflow-hidden ${
              isLight ? 'bg-zinc-900/90 border-zinc-600' : 'bg-zinc-950/90 border-zinc-700'
            }`}>
              <div className={`flex items-center gap-3 px-3 py-2 ${
                isLight ? 'bg-zinc-800/90' : 'bg-zinc-900/90'
              }`}>
                <span className={`text-[10px] font-black tracking-[0.2em] uppercase ${
                  isLight ? 'text-zinc-300' : 'text-zinc-400'
                }`}>
                  TTY::{activeSession.index + 1}
                </span>
                {activeSession.agent && (
                  <span className={`text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md border ${
                    isLight ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}>
                    {activeSession.agent}
                  </span>
                )}
              </div>
              <div className={`h-24 flex items-center justify-center ${
                isLight ? 'bg-zinc-900/80 text-zinc-600' : 'bg-zinc-950/80 text-zinc-700'
              }`}>
                <span className="text-[10px] uppercase tracking-widest font-bold">Moving...</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  };

  const renderAbsDividers = () => {
    const allRects = [...activeCellRects];
    while (allRects.length < cellCount) {
      allRects.push(buildEqualCellRects(cellCount, cols, rows, GAP_PX)[allRects.length] || { top: 0, left: 0, width: 0, height: 0 });
    }
    const dividers: React.ReactNode[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const r = allRects[i];

      if (col < cols - 1) {
        const rightIdx = i + 1;
        if (rightIdx < cellCount) {
          const dividerLeft = r.left + r.width + GAP_PX / 2;
          dividers.push(
            <div
              key={`abs-col-${i}-${rightIdx}`}
              onMouseDown={(e) => handleAbsDividerDrag(e, `col:${i}:${rightIdx}`)}
              className="absolute cursor-col-resize z-30 group/divider"
              style={{
                top: `${r.top}%`,
                height: `${r.height}%`,
                left: `calc(${dividerLeft}% - ${DIVIDER / 2}px)`,
                width: `${DIVIDER}px`,
              }}
            >
              <div className={`w-1 h-full transition-all duration-300 mx-auto rounded-full ${
                isLight
                  ? 'bg-transparent group-hover/divider:bg-zinc-600/50'
                  : 'bg-transparent group-hover/divider:bg-zinc-700/50 group-active/divider:bg-zinc-500'
              }`} />
            </div>
          );
        }
      }

      if (row < rows - 1) {
        const bottomIdx = i + cols;
        if (bottomIdx < cellCount) {
          const dividerTop = r.top + r.height + GAP_PX / 2;
          dividers.push(
            <div
              key={`abs-row-${i}-${bottomIdx}`}
              onMouseDown={(e) => handleAbsDividerDrag(e, `row:${i}:${bottomIdx}`)}
              className="absolute cursor-row-resize z-30 group/divider"
              style={{
                left: `${r.left}%`,
                width: `${r.width}%`,
                top: `calc(${dividerTop}% - ${DIVIDER / 2}px)`,
                height: `${DIVIDER}px`,
              }}
            >
              <div className={`h-1 w-full transition-all duration-300 my-auto rounded-full ${
                isLight
                  ? 'bg-transparent group-hover/divider:bg-zinc-600/50'
                  : 'bg-transparent group-hover/divider:bg-zinc-700/50 group-active/divider:bg-zinc-500'
              }`} />
            </div>
          );
        }
      }
    }

    return <>{dividers}</>;
  };

  return (
    <div className={`h-full w-full flex flex-col bg-theme-main`}>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative p-1"
      >
        {independentResize ? renderAbsContent() : renderGridContent()}
        {independentResize ? renderAbsDividers() : renderGridDividers()}
      </div>

      <div className={`flex items-center justify-between px-4 py-2 shrink-0 border-t border-theme bg-theme-card/50 backdrop-blur-sm`}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black tracking-[0.2em] text-theme-secondary uppercase">Sessions</span>
            <span className="text-[10px] font-bold text-theme-main">{sorted.length}</span>
          </div>
          <div className="h-3 w-px bg-theme-hover mx-1" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black tracking-[0.2em] text-theme-secondary uppercase">Layout</span>
            <span className="text-[10px] font-bold text-theme-main">{cols}x{rows}</span>
          </div>
          {independentResize && (
            <>
              <div className="h-3 w-px bg-theme-hover mx-1" />
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black tracking-[0.2em] text-emerald-400 uppercase">Independent</span>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setShowNewDialog(true)}
          className={`group/init relative flex items-center gap-2 px-3.5 py-1.5 ${
            isLight 
              ? 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700' 
              : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
          } border rounded-lg text-[9px] font-bold uppercase tracking-[0.15em] transition-all duration-300 hover:scale-[1.03] hover:-translate-y-0.5 active:scale-95 active:translate-y-0 cursor-pointer shadow-md hover:shadow-xl`}
          title="Initialize new TTY"
        >
          <div className="relative flex items-center justify-center">
            <svg className="w-3 h-3 transition-transform duration-500 group-hover/init:rotate-[360deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="relative">Initialize_TTY</span>
          
          <div className={`absolute inset-0 rounded-lg opacity-0 group-hover/init:opacity-100 transition-opacity duration-500 pointer-events-none ${
            isLight ? 'bg-white/5' : 'bg-white/5'
          }`} />
        </button>
      </div>

      {showNewDialog && (
        <NewTerminalDialog
          onClose={() => setShowNewDialog(false)}
          onSelect={handleAddTerminal}
          theme={theme}
        />
      )}
    </div>
  );
};
