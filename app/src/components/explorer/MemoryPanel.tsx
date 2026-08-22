import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, CaretDown, CaretUp, Plus } from '@phosphor-icons/react';
import { useProjectMemory } from '../../hooks/useProjectMemory';

interface MemoryPanelProps {
  workspacePath: string;
}

const MAX_HEIGHT = 220;
const MIN_HEIGHT = 92;

/**
 * Persistent per-workspace project memory (.yzpzcode/memory.md). The agent
 * sees this file in its system prompt on every new session; the panel lets the
 * user read it, add notes, and clear it — the agent itself can edit it too.
 */
export const MemoryPanel: React.FC<MemoryPanelProps> = ({ workspacePath }) => {
  const { readMemory, writeMemoryNote } = useProjectMemory();
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(132);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = React.useRef(0);
  const startHeightRef = React.useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const text = await readMemory();
      setContent(text);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [readMemory]);

  useEffect(() => {
    if (!expanded) return;
    void load();
  }, [expanded, load, workspacePath]);

  const handleAddNote = useCallback(async () => {
    const note = draft.trim();
    if (!note) return;
    setSaving(true);
    setError(null);
    const ok = await writeMemoryNote(note);
    setSaving(false);
    if (ok) {
      setDraft('');
      await load();
    } else {
      setError('Could not save the note. Check that the workspace is writable.');
    }
  }, [draft, writeMemoryNote, load]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  }, [height]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const delta = startYRef.current - e.clientY;
    setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeightRef.current + delta)));
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="shrink-0 border-t border-[var(--border-primary)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex h-8 w-full cursor-pointer items-center gap-2 border-b border-[var(--border-primary)]/60 px-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
        title="Project memory — shared with the agent on every new session"
      >
        <Brain size={13} weight="duotone" className="shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text-primary)]">
          Project Memory
        </span>
        {loading && <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent text-[var(--text-secondary)]/50" />}
        {expanded ? <CaretDown size={12} /> : <CaretUp size={12} />}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="memory-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col bg-[var(--bg-secondary)]/25" style={{ height }}>
              <div className="relative min-h-0 flex-1">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onBlur={() => {
                    // Auto-save direct edits (the agent also edits this file).
                    if (content !== '') {
                      void writeMemoryNote(content).catch(() => undefined);
                    }
                  }}
                  spellCheck={false}
                  className="h-full w-full resize-none bg-transparent px-2.5 py-2 font-mono text-[10px] leading-relaxed text-[var(--text-secondary)] outline-none custom-scrollbar premium-scrollbar"
                  placeholder="Notes the agent should always remember about this project…"
                />
                <div className="pointer-events-none absolute bottom-1.5 right-2.5 font-mono text-[8px] text-[var(--text-secondary)]/35">
                  .yzpzcode/memory.md
                </div>
              </div>

              <div className="flex items-center gap-1.5 border-t border-[var(--border-primary)]/70 px-2.5 py-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleAddNote();
                    }
                  }}
                  placeholder="Add a note the agent should remember…"
                  className="min-w-0 flex-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 py-1.5 font-mono text-[10px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]/40 focus:border-[var(--accent-border)]"
                />
                <button
                  type="button"
                  onClick={() => void handleAddNote()}
                  disabled={saving || !draft.trim()}
                  className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)]/15 px-2.5 text-[10px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-light)]/30 disabled:cursor-default disabled:opacity-40"
                >
                  <Plus size={12} aria-hidden="true" />
                  Add
                </button>
              </div>

              {error && <p className="px-2 pb-1 font-mono text-[8.5px] text-rose-400">{error}</p>}
            </div>
            {/* Resize handle */}
            <div
              onMouseDown={handleMouseDown}
              className="h-1 cursor-row-resize border-t border-[var(--border-primary)]/50 hover:border-[var(--accent-border)] transition-colors"
              title="Drag to resize"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
