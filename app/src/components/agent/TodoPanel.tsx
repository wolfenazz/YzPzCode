import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icon } from '@iconify/react';
import { LineSidebar, type LineSidebarItem } from '../effects/LineSidebar';
import type { AgentTodo } from '../../types';

interface TodoPanelProps {
  todos: AgentTodo[];
  /** Expanded state — drives the enter/exit animation. */
  open: boolean;
  /** True while the agent is actively working. */
  running: boolean;
  onToggle: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Floating task rail that overlays the left gutter of the session chat instead
 * of stealing horizontal space from the conversation. Items are rendered with
 * the LineSidebar (React Bits) proximity list; the whole panel slides in when
 * the run starts, plays a soft completion pulse when every todo is done, then
 * exits to the left.
 */
export const TodoPanel: React.FC<TodoPanelProps> = ({ todos, open, running, onToggle }) => {
  const reduceMotion = useReducedMotion();
  const doneCount = useMemo(() => todos.filter((t) => t.status === 'completed').length, [todos]);
  const pct = todos.length > 0 ? Math.round((doneCount / todos.length) * 100) : 0;
  const allDone = todos.length > 0 && doneCount === todos.length;
  const [completionPulse, setCompletionPulse] = useState(false);

  // Brief emerald glow on the panel once the whole list flips to done, so the
  // finish reads as a distinct, deliberate beat before the panel exits.
  useEffect(() => {
    if (!allDone) return undefined;
    setCompletionPulse(true);
    const t = window.setTimeout(() => setCompletionPulse(false), 900);
    return () => window.clearTimeout(t);
  }, [allDone]);

  const items = useMemo<LineSidebarItem[]>(
    () => todos.map((t) => ({ label: t.content, status: t.status })),
    [todos]
  );
  const activeIndex = useMemo(() => {
    const inProgress = todos.findIndex((t) => t.status === 'in_progress');
    if (inProgress >= 0) return inProgress;
    const pending = todos.findIndex((t) => t.status === 'pending');
    return pending >= 0 ? pending : null;
  }, [todos]);

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: -36, scale: 0.985 },
        animate: { opacity: 1, x: 0, scale: 1 },
        exit: { opacity: 0, x: -36, scale: 0.985 },
      };

  return (
    <>
      {/* Collapsed edge tab — keeps one-tap access to the rail while hidden */}
      <AnimatePresence>
        {!open && todos.length > 0 && (
          <motion.button
            type="button"
            onClick={onToggle}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -16 }}
            transition={{ duration: reduceMotion ? 0 : 0.26, ease: EASE }}
            className="pointer-events-auto absolute left-3 top-3 z-30 flex h-7 cursor-pointer items-center gap-2 rounded-full premium-surface premium-lift px-2.5"
            title="Show task list"
            aria-label="Show task list"
          >
            <Icon icon="material-symbols:checklist-rounded" className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
            <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
              Tasks
            </span>
            <span className="font-mono text-[8px] tabular-nums text-[var(--text-secondary)]/60">
              {doneCount}/{todos.length}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating task rail — a layer on top of the chat, left gutter */}
      <AnimatePresence>
        {open && todos.length > 0 && (
          <motion.div
            key="todo-panel"
            initial={panelMotion.initial}
            animate={panelMotion.animate}
            exit={panelMotion.exit}
            transition={{ duration: reduceMotion ? 0 : 0.5, ease: EASE }}
            className="pointer-events-none absolute inset-y-2 left-3 z-20 flex w-[262px]"
          >
            <div
              className={`pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-xl border backdrop-blur-md transition-shadow duration-500 ${
                completionPulse
                  ? 'border-emerald-500/40 shadow-[0_0_0_1px_rgba(52,211,153,0.25),0_0_46px_-12px_rgba(52,211,153,0.5)]'
                  : 'border-[var(--border-primary)]/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_60px_-24px_rgba(0,0,0,0.8)]'
              }`}
              style={{ background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)' }}
            >
              {/* Header */}
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-primary)]/60 px-2.5">
                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)]/15">
                  <Icon
                    icon={allDone ? 'material-symbols:task-alt-rounded' : 'material-symbols:checklist-rounded'}
                    className={`h-3 w-3 ${allDone ? 'text-emerald-400' : 'text-[var(--accent)]'}`}
                    aria-hidden="true"
                  />
                  {running && !allDone && (
                    <span className="premium-status-dot absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  )}
                  {allDone && (
                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
                  {allDone ? 'All tasks done' : 'Tasks'}
                </span>
                <span className={`font-mono text-[8px] tabular-nums ${allDone ? 'text-emerald-400' : 'text-[var(--text-secondary)]/60'}`}>
                  {doneCount}/{todos.length}
                </span>
                <button
                  type="button"
                  onClick={onToggle}
                  className="premium-btn-icon -mr-0.5 h-5 w-5 shrink-0 cursor-pointer"
                  title="Collapse task list"
                  aria-label="Collapse task list"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>

              {/* Task list */}
              <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar premium-scrollbar">
                <LineSidebar
                  items={items}
                  accentColor="var(--accent)"
                  textColor="var(--text-secondary)"
                  markerColor="var(--text-secondary)"
                  showIndex
                  showMarker
                  proximityRadius={88}
                  maxShift={14}
                  falloff="smooth"
                  markerLength={40}
                  markerGap={10}
                  tickScale={0.5}
                  scaleTick
                  itemGap={9}
                  fontSize={0.74}
                  smoothing={90}
                  defaultActive={activeIndex}
                  animateIn
                  className="line-sidebar--todo"
                />
              </div>

              {/* Footer progress */}
              <div className="shrink-0 px-3 pb-2.5 pt-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/50">
                    Progress
                  </span>
                  <span className={`font-mono text-[8.5px] font-bold tabular-nums ${allDone ? 'text-emerald-400' : 'text-[var(--text-secondary)]'}`}>
                    {allDone ? 'complete' : `${pct}%`}
                  </span>
                </div>
                <div className="premium-track h-1">
                  <div
                    className={`premium-track-fill ${allDone ? 'bg-emerald-500' : 'bg-[var(--accent)]'}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
