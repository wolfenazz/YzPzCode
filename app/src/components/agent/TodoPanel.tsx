import React, { useMemo } from 'react';
import type { AgentTodo } from '../../types';

interface TodoPanelProps {
  todos: AgentTodo[];
  visible: boolean;
  onToggle: () => void;
}

const STATUS_BADGE: Record<AgentTodo['status'], { label: string; className: string }> = {
  pending: { label: 'pending', className: 'text-[var(--text-secondary)]/50 border-[var(--border-primary)]' },
  in_progress: { label: 'doing', className: 'text-[var(--accent)] border-[var(--accent-border)] bg-[var(--accent-light)]/20' },
  completed: { label: 'done', className: 'text-emerald-500 border-emerald-900/50 bg-emerald-950/20' },
};

const STATUS_DOT: Record<AgentTodo['status'], string> = {
  pending: 'bg-[var(--text-secondary)]/30',
  in_progress: 'bg-[var(--accent)] animate-pulse',
  completed: 'bg-emerald-500',
};

/**
 * Agent-maintained task list, shown as a collapsible panel on the right of the
 * agent pane. Default visible; can be hidden/shown with the toggle.
 */
export const TodoPanel: React.FC<TodoPanelProps> = ({ todos, visible, onToggle }) => {
  const done = useMemo(() => todos.filter((t) => t.status === 'completed').length, [todos]);
  const pct = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;

  return (
    <div className="shrink-0 flex flex-col border-l border-[var(--border-primary)] bg-[var(--bg-secondary)]/40 select-none" style={{ width: visible ? 240 : 30 }}>
      {/* Toggle handle */}
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-1.5 h-8 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 hover:bg-[var(--bg-tertiary)] transition-colors duration-100 cursor-pointer shrink-0"
        title={visible ? 'Hide task list' : 'Show task list'}
      >
        <svg className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        {visible && (
          <>
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)] truncate">
              Tasks
            </span>
            {todos.length > 0 && (
              <span className="font-mono text-[9px] tabular-nums text-[var(--text-secondary)]/60">{done}/{todos.length}</span>
            )}
          </>
        )}
      </button>

      {visible && (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2 px-2 space-y-1.5">
          {todos.length === 0 ? (
            <p className="px-1 font-mono text-[9px] leading-relaxed text-[var(--text-secondary)]/40">
              The agent's task list will appear here as it plans and works.
            </p>
          ) : (
            <>
              {/* Progress bar */}
              <div className="px-1 pb-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/50">Progress</span>
                  <span className="font-mono text-[9px] font-bold tabular-nums text-[var(--text-secondary)]">{pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-[var(--border-primary)] overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              </div>
              {todos.map((todo) => {
                const badge = STATUS_BADGE[todo.status] ?? STATUS_BADGE.pending;
                const dot = STATUS_DOT[todo.status] ?? STATUS_DOT.pending;
                return (
                  <div
                    key={todo.id}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-md border border-[var(--border-primary)]/50 bg-[var(--bg-main)]/60"
                    title={todo.content}
                  >
                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`font-mono text-[9.5px] leading-snug break-words ${todo.status === 'completed' ? 'text-[var(--text-secondary)]/40 line-through' : 'text-[var(--text-primary)]/90'}`}>
                        {todo.content}
                      </p>
                      <span className={`inline-block mt-1 px-1.5 py-px rounded-sm border font-mono text-[7.5px] font-bold uppercase tracking-widest ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};
