import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass, PencilSimple, Play, Trash, X } from '@phosphor-icons/react';
import { useAgentHost } from '../../hooks/useAgentHost';
import type { AgentSessionSummary } from '../../types';

interface SessionHistoryProps {
  currentWorkspaceId: string;
  openSessionIds: Set<string>;
  onResume: (session: AgentSessionSummary) => void;
  onDelete: (sessionId: string) => void;
  onClose: () => void;
}

const PREVIEW_LIMIT = 40;
const CONFIRM_MS = 2600;

const parseDate = (value?: string | number | null): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
};

const toSummary = (raw: unknown, fallbackWorkspaceId: string): AgentSessionSummary => {
  const s = raw as { sessionId: string; status?: string; createdAt?: string; updatedAt?: string; metadata?: Record<string, unknown> };
  const metadata = s.metadata ?? {};
  const workspaceId = typeof metadata.workspaceId === 'string' ? metadata.workspaceId : fallbackWorkspaceId;
  return {
    sessionId: s.sessionId,
    workspaceId,
    title: typeof metadata.title === 'string' ? metadata.title : null,
    providerId: typeof metadata.providerId === 'string' ? metadata.providerId : null,
    modelId: typeof metadata.modelId === 'string' ? metadata.modelId : null,
    createdAt: parseDate(metadata.createdAt as number | undefined) ?? parseDate(s.createdAt),
    updatedAt: parseDate(s.updatedAt),
    messageCount: null,
    preview: null,
    status: s.status,
    maxTotalTokens: typeof metadata.maxTotalTokens === 'number' && metadata.maxTotalTokens > 0 ? metadata.maxTotalTokens : null,
  };
};

const formatDate = (ts: number | null): string => {
  if (!ts) return '—';
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

export const SessionHistory: React.FC<SessionHistoryProps> = ({
  currentWorkspaceId,
  openSessionIds,
  onResume,
  onDelete,
  onClose,
}) => {
  const { ensureHost, listSessions, getSessionPreview, updateTitle } = useAgentHost();
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'this'>('this');
  const [search, setSearch] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await ensureHost();
        const raw = await listSessions();
        if (!mounted) return;
        const summaries = raw
          .map((s) => toSummary(s, currentWorkspaceId))
          .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
        setSessions(summaries);
        setLoading(false);

        const toPreview = summaries.slice(0, PREVIEW_LIMIT);
        await Promise.all(
          toPreview.map(async (s) => {
            try {
              const preview = await getSessionPreview(s.sessionId);
              if (!mounted) return;
              setSessions((prev) =>
                prev.map((p) =>
                  p.sessionId === s.sessionId
                    ? { ...p, preview: preview.preview, messageCount: preview.messageCount }
                    : p,
                ),
              );
            } catch {
              // preview is best-effort
            }
          }),
        );
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [ensureHost, listSessions, getSessionPreview, currentWorkspaceId]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleDelete = useCallback(
    (sessionId: string) => {
      if (confirmingId !== sessionId) {
        setConfirmingId(sessionId);
        if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = window.setTimeout(() => setConfirmingId(null), CONFIRM_MS);
        return;
      }
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
      setConfirmingId(null);
      onDelete(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    },
    [confirmingId, onDelete],
  );

  const handleRename = useCallback(
    (session: AgentSessionSummary) => {
      const trimmed = renameDraft.trim();
      setRenamingId(null);
      if (!trimmed || trimmed === session.title) return;
      // Persist through the sidecar; reflect the rename locally regardless.
      void updateTitle(session.sessionId, trimmed)
        .then(() => {
          setSessions((prev) => prev.map((s) => (s.sessionId === session.sessionId ? { ...s, title: trimmed } : s)));
        })
        .catch(() => {
          setSessions((prev) => prev.map((s) => (s.sessionId === session.sessionId ? { ...s, title: trimmed } : s)));
        });
    },
    [renameDraft, updateTitle],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filter === 'this' && s.workspaceId !== currentWorkspaceId) return false;
      if (!q) return true;
      const hay = [s.title, s.providerId, s.modelId, s.preview].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, filter, search, currentWorkspaceId]);

  return (
    <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-center justify-center font-mono" onClick={onClose}>
      <div
        className="premium-surface w-[720px] max-w-[94vw] h-[76vh] flex flex-col rounded-2xl border border-theme bg-[var(--bg-card)] shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-theme shrink-0">
          <div>
            <h3 className="text-sm font-bold text-theme-main tracking-widest uppercase">Agent Session History</h3>
            <p className="text-[10px] text-[var(--text-secondary)]">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} · resume any past conversation
            </p>
          </div>
          <button onClick={onClose} className="premium-btn-icon p-1.5 text-[var(--text-secondary)] cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-theme bg-[var(--bg-secondary)]/50 shrink-0">
          <div className="premium-segmented flex items-center">
            {(['all', 'this'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`premium-segmented-item px-2.5 h-6 rounded-[5px] font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer ${
                  filter === f
                    ? 'is-active bg-[var(--accent-light)]/40 text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {f === 'all' ? 'All workspaces' : 'This workspace'}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <MagnifyingGlass size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, model, preview…"
              className="premium-input w-full h-7 pl-7 pr-2.5 text-[10px] text-theme-main placeholder:text-[var(--text-secondary)]/40"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar premium-scrollbar p-3 space-y-2">
          {loading && (
            <div className="py-12 text-center text-[10px] uppercase tracking-widest text-[var(--text-secondary)] animate-pulse">
              Loading sessions…
            </div>
          )}
          {error && (
            <div className="rounded-md border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-[10px] text-rose-500">
              {error}
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div className="py-12 text-center space-y-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">No sessions found</div>
              <p className="text-[10px] text-[var(--text-secondary)]/50">
                Sessions you close stay here so you can pick them back up later.
              </p>
            </div>
          )}
          {visible.map((s) => {
            const isOpen = openSessionIds.has(s.sessionId);
            const isOther = s.workspaceId !== currentWorkspaceId;
            return (
              <div
                key={s.sessionId}
                className="premium-surface premium-lift group flex items-start gap-3 rounded-lg px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {renamingId === s.sessionId ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => handleRename(s)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(s);
                          else if (e.key === 'Escape') setRenamingId(null);
                        }}
                        placeholder="Session title"
                        className="w-full max-w-[260px] h-5 rounded border border-[var(--accent-border)] bg-[var(--bg-main)] px-1.5 font-mono text-[11px] font-bold text-theme-main focus:outline-none"
                      />
                    ) : (
                      <span
                        className="group/title flex items-center gap-1 min-w-0 cursor-text"
                        title="Double-click or click ✎ to rename"
                        onDoubleClick={() => {
                          setRenameDraft(s.title || '');
                          setRenamingId(s.sessionId);
                        }}
                      >
                        <span className="font-mono text-[11px] font-bold text-theme-main truncate">
                          {s.title || `Session ${s.sessionId.slice(0, 8)}`}
                        </span>
                        <button
                          onClick={() => {
                            setRenameDraft(s.title || '');
                            setRenamingId(s.sessionId);
                          }}
                          className="shrink-0 p-0.5 rounded text-[var(--text-secondary)]/0 group-hover/title:text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors duration-100 cursor-pointer"
                          title="Rename session"
                        >
                          <PencilSimple size={12} />
                        </button>
                      </span>
                    )}
                    {isOpen && (
                      <span className="premium-badge shrink-0 h-4 bg-emerald-950/40 text-emerald-500">
                        open
                      </span>
                    )}
                    {isOther && (
                      <span
                        className="premium-badge shrink-0 h-4 bg-[var(--accent-light)]/20 text-[var(--accent)]"
                        title="Belongs to a different workspace — resuming runs it in its original directory"
                      >
                        other ws
                      </span>
                    )}
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-[var(--text-secondary)]/60 tabular-nums">
                      {formatDate(s.updatedAt ?? s.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-[var(--text-secondary)]/70">
                    <span className="truncate">{s.providerId || 'provider'}</span>
                    <span className="text-[var(--text-secondary)]/40">/</span>
                    <span className="truncate">{s.modelId || 'model'}</span>
                    {s.messageCount !== null && (
                      <>
                        <span className="text-[var(--text-secondary)]/40">·</span>
                        <span>{s.messageCount} msg</span>
                      </>
                    )}
                  </div>
                  {s.preview && (
                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-secondary)] line-clamp-2">
                      {s.preview}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onResume(s)}
                    className="premium-btn-ghost flex items-center gap-1.5 h-7 px-2.5 rounded-lg border-[var(--accent-border)]! bg-[var(--accent-light)]/20! text-[var(--accent)]! hover:bg-[var(--accent-light)]/40! font-mono text-[9px] font-bold uppercase tracking-widest cursor-pointer"
                    title={isOther ? 'Open this session in the current grid (runs in its original directory)' : 'Resume this session'}
                  >
                    <Play size={12} weight="fill" />
                    Resume
                  </button>
                  <button
                    onClick={() => void handleDelete(s.sessionId)}
                    className={`premium-btn-ghost flex items-center gap-1.5 h-7 px-2.5 rounded-lg font-mono text-[9px] font-bold uppercase tracking-widest cursor-pointer ${
                      confirmingId === s.sessionId
                        ? 'border-rose-500! bg-rose-950/40! text-rose-400!'
                        : 'text-[var(--text-secondary)]/70 hover:text-rose-400! hover:border-rose-900/60!'
                    }`}
                    title="Permanently delete this session and its history"
                  >
                    {confirmingId === s.sessionId ? (
                      <>Sure?</>
                    ) : (
                      <Trash size={12} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-theme bg-[var(--bg-secondary)]/40 shrink-0">
          <p className="text-[9px] text-[var(--text-secondary)]/60">
            Closing a pane keeps its session here. Deleting removes it permanently.
          </p>
        </div>
      </div>
    </div>
  );
};
