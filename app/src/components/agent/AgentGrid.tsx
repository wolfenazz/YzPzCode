import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentPane } from './AgentPane';
import { AgentCommandDrawer } from './AgentCommandDrawer';
import { NewAgentDialog } from './NewAgentDialog';
import { SessionHistory } from './SessionHistory';
import { useAgentHost, CreateAgentSessionParams } from '../../hooks/useAgentHost';
import { useAppStore } from '../../stores/appStore';
import SoftAurora from '../effects/SoftAurora';
import logo from '../../assets/YzPzCodeLogo.png';
import type { AgentMode, AgentSessionSummary } from '../../types';

interface AgentGridProps {
  workspaceId: string;
}

const MIN_GRID_SIZE = 12;
const GRID_GAP = 8;
const GRID_DIVIDER = 3;

const makeEqualSizes = (count: number): number[] => Array.from({ length: count }, () => 100 / count);

function getDims(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

export const AgentGrid: React.FC<AgentGridProps> = ({ workspaceId }) => {
  const {
    ensureHost,
    onBootstrap,
    createSession,
    listSessions,
    stopSession,
    closeSession,
    deleteSession,
    resumeSession,
    getProviders,
    getModels,
    listProviderConfigs,
    getSettings,
  } = useAgentHost();
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const independentGridResize = useAppStore((s) => s.independentGridResize);
  const agentSessionsByWorkspace = useAppStore((s) => s.agentSessionsByWorkspace);
  const setAgentSessionsForWorkspace = useAppStore((s) => s.setAgentSessionsForWorkspace);
  const addAgentSessionForWorkspace = useAppStore((s) => s.addAgentSessionForWorkspace);
  const removeAgentSessionForWorkspace = useAppStore((s) => s.removeAgentSessionForWorkspace);

  const sessions = agentSessionsByWorkspace[workspaceId] || [];
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [creating, setCreating] = useState(false);
  const initializedRef = useRef(false);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridResizeRef = useRef<{
    axis: 'col' | 'row';
    index: number;
    row: number;
    col: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);
  const [rowColumnSizes, setRowColumnSizes] = useState<number[][] | null>(null);
  const [columnRowSizes, setColumnRowSizes] = useState<number[][] | null>(null);
  const [columnSizes, setColumnSizes] = useState<number[] | null>(null);
  const [rowSizes, setRowSizes] = useState<number[] | null>(null);

  // Track backend-side harness bootstrap (local rebuild of dist) so the UI can
  // show progress instead of a silent wait.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onBootstrap((e) => {
      const { phase, message } = e.payload;
      setPreparing(phase === 'building');
      if (phase === 'error' && message) {
        setHostReady(false);
        setPreparing(false);
        setHostError(message);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [onBootstrap]);

  const init = useCallback(async () => {
    try {
      await ensureHost();
      setHostReady(true);
      setHostError(null);
      setPreparing(false);

      // The full history lives on disk and is shown via the History modal.
      // Here we must only restore the panes the user had OPEN before the app
      // was closed — not reopen every session ever created.
      const restored = useAppStore.getState().agentSessionsByWorkspace[workspaceId] ?? [];

      if (restored.length > 0) {
        const existing = await listSessions(workspaceId);
        const summaries: AgentSessionSummary[] = existing.map((s) => {
          const record = s as { sessionId: string; status?: string; createdAt?: string; updatedAt?: string; metadata?: Record<string, unknown> };
          const metadata = record.metadata ?? {};
          const workspaceOf = typeof metadata.workspaceId === 'string' ? metadata.workspaceId : workspaceId;
          return {
            sessionId: record.sessionId,
            workspaceId: workspaceOf,
            title: typeof metadata.title === 'string' ? metadata.title : null,
            providerId: typeof metadata.providerId === 'string' ? metadata.providerId : null,
            modelId: typeof metadata.modelId === 'string' ? metadata.modelId : null,
            createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : parseDate(record.createdAt),
            updatedAt: parseDate(record.updatedAt),
            messageCount: null,
            preview: null,
            status: record.status,
            maxTotalTokens: typeof metadata.maxTotalTokens === 'number' && metadata.maxTotalTokens > 0 ? metadata.maxTotalTokens : null,
            mode: typeof metadata.mode === 'string' ? (metadata.mode as AgentMode) : null,
            fastMode: metadata.fastMode === true,
          };
        });
        // Keep only previously-open panes (preserving their order), and drop
        // any whose session no longer exists on disk. Refresh metadata from
        // disk so titles/models stay current.
        const byId = new Map(summaries.map((s) => [s.sessionId, s]));
        const open = restored
          .map((p) => byId.get(p.sessionId))
          .filter((s): s is AgentSessionSummary => Boolean(s));
        setAgentSessionsForWorkspace(workspaceId, open);
        // Rehydrate any session that is no longer alive in the sidecar (e.g.
        // after an app/sidecar restart) so re-attached panes can accept
        // messages again. Already-alive sessions are cheap no-ops.
        void Promise.allSettled(
          open.map((s) => resumeSession(s.sessionId))
        );
      } else {
        // Nothing was open before — start with a clean grid rather than
        // auto-opening the entire session history.
        setAgentSessionsForWorkspace(workspaceId, []);
      }
    } catch (err) {
      setHostReady(false);
      setPreparing(false);
      setHostError(err instanceof Error ? err.message : String(err));
    }
  }, [ensureHost, listSessions, setAgentSessionsForWorkspace, workspaceId, resumeSession]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void init();
  }, [init]);

  const handleCreate = useCallback(
    async (params: CreateAgentSessionParams) => {
      setCreating(true);
      setHostError(null);
      try {
        const result = await createSession(params);
        const now = Date.now();
        const summary: AgentSessionSummary = {
          sessionId: result.sessionId,
          workspaceId: params.workspaceId,
          title: params.title ?? null,
          providerId: params.providerId,
          modelId: params.modelId,
          createdAt: now,
          updatedAt: now,
          messageCount: 0,
          preview: null,
          maxTotalTokens: params.maxTotalTokens ?? null,
          mode: null,
        };
        addAgentSessionForWorkspace(params.workspaceId, summary);

      } catch (err) {
        setHostError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setCreating(false);
      }
    },
    [createSession, addAgentSessionForWorkspace]
  );

  const handleNewAgent = useCallback(async () => {
    if (!hostReady || creating) return;
    setCreating(true);
    setHostError(null);
    try {
      const [providers, configs, settings] = await Promise.all([getProviders(), listProviderConfigs(), getSettings()]);
      const providerId = settings.global.defaultProviderId ?? configs[0]?.providerId ?? providers[0]?.id ?? 'anthropic';
      const config = configs.find((item) => item.providerId === providerId);
      const provider = providers.find((item) => item.id === providerId);
      const models = await getModels(providerId);
      const modelId = config?.modelId ?? provider?.defaultModelId ?? models[0]?.id ?? '';

      // Keep the quick path truly one-click when a saved connection exists.
      // If setup is incomplete, let the focused dialog collect it instead.
      if (!(config?.hasApiKey || config?.hasOAuth) || !modelId) {
        setShowNewDialog(true);
        return;
      }

      await handleCreate({
        workspaceId,
        cwd: currentWorkspace?.path ?? '',
        providerId,
        modelId,
      });
    } catch (err) {
      setHostError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }, [
    hostReady,
    creating,
    getProviders,
    listProviderConfigs,
    getSettings,
    getModels,
    handleCreate,
    workspaceId,
    currentWorkspace?.path,
  ]);

  const handleClose = useCallback(
    async (sessionId: string) => {
      // Close detaches the pane but KEEPS the session persisted so it can be
      // resumed later from History. Use History → Delete to destroy it.
      // The backend stops the session and, if this was the last one open,
      // shuts down the agent-harness sidecar process.
      try {
        await closeSession(sessionId);
      } catch (err) {
        console.error('[agent] close failed:', err);
      }
      removeAgentSessionForWorkspace(workspaceId, sessionId);
    },
    [closeSession, removeAgentSessionForWorkspace, workspaceId]
  );

  const handleResume = useCallback(
    (session: AgentSessionSummary) => {
      // Rehydrate the persisted session in the sidecar so it accepts messages
      // again (no-op when it's already alive). Fire-and-forget: the pane
      // attaches and reads history from disk regardless.
      void resumeSession(session.sessionId).catch((err) => {
        console.error('[agent] resume failed:', err);
      });
      addAgentSessionForWorkspace(workspaceId, session);
      setShowHistory(false);
    },
    [addAgentSessionForWorkspace, resumeSession, workspaceId]
  );

  const handleDelete = useCallback(
    async (sessionId: string) => {
      try {
        await deleteSession(sessionId);
      } catch (err) {
        console.error('[agent] delete failed:', err);
      }
      removeAgentSessionForWorkspace(workspaceId, sessionId);
    },
    [deleteSession, removeAgentSessionForWorkspace, workspaceId]
  );

  const handleNewChat = useCallback(
    async (sessionId: string) => {
      const existing = sessions.find((s) => s.sessionId === sessionId);
      // Gracefully stop + detach the current chat (it stays in History).
      try {
        await stopSession(sessionId);
      } catch (err) {
        console.error('[agent] stop failed:', err);
      }
      removeAgentSessionForWorkspace(workspaceId, sessionId);
      if (!existing?.providerId || !existing?.modelId) return;
      try {
        const result = await createSession({
          workspaceId,
          cwd: currentWorkspace?.path ?? '',
          providerId: existing.providerId,
          modelId: existing.modelId,
          title: existing.title ?? undefined,
          maxTotalTokens: existing.maxTotalTokens ?? undefined,
        });
        const now = Date.now();
        addAgentSessionForWorkspace(workspaceId, {
          sessionId: result.sessionId,
          workspaceId,
          title: existing.title,
          providerId: existing.providerId,
          modelId: existing.modelId,
          createdAt: now,
          updatedAt: now,
          messageCount: 0,
          preview: null,
          maxTotalTokens: existing.maxTotalTokens ?? null,
          mode: null,
          fastMode: existing.fastMode === true,
        });
      } catch (err) {
        setHostError(err instanceof Error ? err.message : String(err));
      }
    },
    [
      sessions,
      stopSession,
      removeAgentSessionForWorkspace,
      createSession,
      addAgentSessionForWorkspace,
      workspaceId,
      currentWorkspace?.path,
    ]
  );

  const { cols, rows } = getDims(sessions.length);
  const cellCount = cols * rows;
  const hasSpareCell = sessions.length < cellCount;

  // Match the terminal grid's resize model: normal mode keeps every row and
  // column aligned, while Independent Grid Resize allows one divider segment
  // to affect only its own row or column.
  const activeRowColumnSizes = useMemo(() => {
    if (rowColumnSizes?.length === rows && rowColumnSizes.every((sizes) => sizes.length === cols)) {
      return rowColumnSizes.map((sizes) => {
        const total = sizes.reduce((sum, size) => sum + size, 0);
        return sizes.map((size) => (size / total) * 100);
      });
    }
    return Array.from({ length: rows }, () => makeEqualSizes(cols));
  }, [rowColumnSizes, rows, cols]);

  const activeColumnRowSizes = useMemo(() => {
    if (columnRowSizes?.length === cols && columnRowSizes.every((sizes) => sizes.length === rows)) {
      return columnRowSizes.map((sizes) => {
        const total = sizes.reduce((sum, size) => sum + size, 0);
        return sizes.map((size) => (size / total) * 100);
      });
    }
    return Array.from({ length: cols }, () => makeEqualSizes(rows));
  }, [columnRowSizes, rows, cols]);

  const activeColumnSizes = useMemo(() => {
    if (columnSizes?.length === cols) {
      const total = columnSizes.reduce((sum, size) => sum + size, 0);
      return columnSizes.map((size) => (size / total) * 100);
    }
    return makeEqualSizes(cols);
  }, [columnSizes, cols]);

  const activeRowSizes = useMemo(() => {
    if (rowSizes?.length === rows) {
      const total = rowSizes.reduce((sum, size) => sum + size, 0);
      return rowSizes.map((size) => (size / total) * 100);
    }
    return makeEqualSizes(rows);
  }, [rowSizes, rows]);

  const cellColumnSizes = useMemo(
    () => (independentGridResize ? activeRowColumnSizes : Array.from({ length: rows }, () => activeColumnSizes)),
    [independentGridResize, activeRowColumnSizes, activeColumnSizes, rows]
  );
  const cellRowSizes = useMemo(
    () => (independentGridResize ? activeColumnRowSizes : Array.from({ length: cols }, () => activeRowSizes)),
    [independentGridResize, activeColumnRowSizes, activeRowSizes, cols]
  );

  useEffect(() => {
    setRowColumnSizes(null);
    setColumnRowSizes(null);
    setColumnSizes(null);
    setRowSizes(null);
  }, [sessions.length]);

  const getPointerPercent = useCallback((event: MouseEvent, axis: 'col' | 'row'): number => {
    const rect = gridContainerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return axis === 'col'
      ? ((event.clientX - rect.left) / rect.width) * 100
      : ((event.clientY - rect.top) / rect.height) * 100;
  }, []);

  const handleDividerDrag = useCallback((event: React.MouseEvent, axis: 'col' | 'row', dividerIndex: number, lineIndex = 0): void => {
    event.preventDefault();
    const row = axis === 'col' ? lineIndex : -1;
    const col = axis === 'row' ? lineIndex : -1;
    const sizes = axis === 'col'
      ? (independentGridResize ? activeRowColumnSizes[row] : activeColumnSizes)
      : (independentGridResize ? activeColumnRowSizes[col] : activeRowSizes);
    gridResizeRef.current = {
      axis,
      index: dividerIndex,
      row,
      col,
      startPos: getPointerPercent(event.nativeEvent, axis),
      startSizes: [...sizes],
    };

    const handleMove = (moveEvent: MouseEvent): void => {
      const drag = gridResizeRef.current;
      if (!drag) return;
      const difference = getPointerPercent(moveEvent, drag.axis) - drag.startPos;
      const nextSizes = [...drag.startSizes];
      const pairTotal = drag.startSizes[drag.index] + drag.startSizes[drag.index + 1];
      nextSizes[drag.index] = Math.max(MIN_GRID_SIZE, Math.min(pairTotal - MIN_GRID_SIZE, drag.startSizes[drag.index] + difference));
      nextSizes[drag.index + 1] = pairTotal - nextSizes[drag.index];

      if (drag.axis === 'col') {
        if (!independentGridResize) {
          setColumnSizes(nextSizes);
          return;
        }
        setRowColumnSizes((previous) => {
          const base = previous?.length === rows && previous.every((sizes) => sizes.length === cols)
            ? previous.map((sizes) => [...sizes])
            : Array.from({ length: rows }, () => makeEqualSizes(cols));
          base[drag.row] = nextSizes;
          return base;
        });
        return;
      }

      if (!independentGridResize) {
        setRowSizes(nextSizes);
        return;
      }
      setColumnRowSizes((previous) => {
        const base = previous?.length === cols && previous.every((sizes) => sizes.length === rows)
          ? previous.map((sizes) => [...sizes])
          : Array.from({ length: cols }, () => makeEqualSizes(rows));
        base[drag.col] = nextSizes;
        return base;
      });
    };

    const handleUp = (): void => {
      gridResizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    document.body.style.cursor = axis === 'col' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [activeRowColumnSizes, activeColumnRowSizes, activeColumnSizes, activeRowSizes, cols, getPointerPercent, independentGridResize, rows]);

  const resetDivider = useCallback((axis: 'col' | 'row', lineIndex = 0): void => {
    if (axis === 'col') {
      if (!independentGridResize) {
        setColumnSizes(makeEqualSizes(cols));
        return;
      }
      setRowColumnSizes((previous) => {
        const base = previous?.length === rows && previous.every((sizes) => sizes.length === cols)
          ? previous.map((sizes) => [...sizes])
          : Array.from({ length: rows }, () => makeEqualSizes(cols));
        base[lineIndex] = makeEqualSizes(cols);
        return base;
      });
      return;
    }

    if (!independentGridResize) {
      setRowSizes(makeEqualSizes(rows));
      return;
    }
    setColumnRowSizes((previous) => {
      const base = previous?.length === cols && previous.every((sizes) => sizes.length === rows)
        ? previous.map((sizes) => [...sizes])
        : Array.from({ length: cols }, () => makeEqualSizes(rows));
      base[lineIndex] = makeEqualSizes(rows);
      return base;
    });
  }, [cols, independentGridResize, rows]);

  return (
    <div className="h-full w-full flex flex-col bg-[var(--bg-main)] relative overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] select-none shrink-0">
        <span className="font-mono text-[10px] font-black tracking-[0.2em] uppercase text-[var(--text-primary)] premium-shimmer">
          YZPZ Agent
        </span>
        <span className="w-px h-3.5 bg-[var(--border-primary)]" />
        <span className="font-mono text-[10px] text-[var(--text-secondary)]">
          {sessions.length} agent{sessions.length !== 1 ? 's' : ''} · {currentWorkspace?.name ?? 'workspace'}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {!hostReady && !hostError && (
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[var(--accent)]">
              <svg className="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {preparing ? 'preparing harness…' : 'starting harness…'}
            </span>
          )}
          {hostError && (
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-[9px] text-rose-500 truncate max-w-[260px]" title={hostError}>
                {hostError}
              </span>
              <button
                onClick={() => {
                  setHostError(null);
                  void init();
                }}
                className="premium-btn-ghost shrink-0 h-5 px-2 rounded-md font-mono text-[9px] font-bold uppercase tracking-widest cursor-pointer"
                title="Retry starting the YZPZ Agent"
              >
                Retry
              </button>
            </span>
          )}
          <button
            onClick={() => setShowHistory(true)}
            disabled={!hostReady}
            className="premium-btn-ghost flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Browse previous agent sessions and resume or delete them"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </button>
          <button
            onClick={() => void handleNewAgent()}
            disabled={!hostReady || creating}
            className="premium-btn-primary flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[9px] font-bold uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Agent
          </button>
        </span>
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 relative p-2">
        {/* Ambient aurora backdrop — faint WebGL glow over a CSS fallback so
            there is never a hard void when motion is reduced or GL fails. */}
        <div className="absolute inset-0 aurora-fallback" aria-hidden="true">
          {animationsEnabled && (
            <SoftAurora
              speed={0.5}
              brightness={0.42}
              scale={1.4}
              color1="#d87757"
              color2="#547ea8"
              noiseFrequency={2.2}
              bandHeight={0.42}
              bandSpread={1.0}
              octaveDecay={0.12}
              layerOffset={0.35}
              colorSpeed={1.0}
              enableMouseInteraction={false}
            />
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="relative h-full flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-light)]/20 overflow-hidden">
              <img src={logo} alt="YzPzCode Agent" className="w-9 h-9 object-contain" draggable={false} />
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              No AI agents running
            </div>
            <p className="max-w-sm text-center font-mono text-[10px] text-[var(--text-secondary)]/50">
              Spawn a YZPZ Agent to edit files, run commands, and inspect your codebase with a visual chat interface.
            </p>
            {!hostReady && !hostError ? (
              <div className="flex items-center gap-2 text-[var(--accent)]">
                <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="font-mono text-[10px] uppercase tracking-widest">
                  {preparing ? 'Preparing agent runtime…' : 'Starting agent runtime…'}
                </span>
              </div>
            ) : (
              <button
                onClick={() => void handleNewAgent()}
                disabled={!hostReady}
                className="premium-btn-primary px-6 py-2.5 rounded-lg font-mono text-[11px] font-bold uppercase tracking-widest disabled:opacity-40 cursor-pointer"
              >
                + New Agent
              </button>
            )}
          </div>
        ) : (
          <div
            ref={gridContainerRef}
            className="relative h-full w-full"
          >
            <div className="absolute inset-0">
              {sessions.map((session, index) => {
                const row = Math.floor(index / cols);
                const column = index % cols;
                const left = cellColumnSizes[row].slice(0, column).reduce((sum, size) => sum + size, 0);
                const top = cellRowSizes[column].slice(0, row).reduce((sum, size) => sum + size, 0);
                return (
                  <div
                    key={session.sessionId}
                    className="absolute min-h-0 min-w-0 overflow-hidden"
                    style={{
                      left: `calc(${left}% + ${column * GRID_GAP}px)`,
                      top: `calc(${top}% + ${row * GRID_GAP}px)`,
                      width: `${cellColumnSizes[row][column]}%`,
                      height: `${cellRowSizes[column][row]}%`,
                    }}
                  >
                    <AgentPane
                      session={session}
                      index={index}
                      onClose={handleClose}
                      onNewChat={handleNewChat}
                    />
                  </div>
                );
              })}

              {hasSpareCell && (() => {
                const row = Math.floor(sessions.length / cols);
                const column = sessions.length % cols;
                const left = cellColumnSizes[row].slice(0, column).reduce((sum, size) => sum + size, 0);
                const top = cellRowSizes[column].slice(0, row).reduce((sum, size) => sum + size, 0);
                return (
                  <button
                    onClick={() => void handleNewAgent()}
                    disabled={!hostReady}
                    className="absolute flex min-h-0 min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-[var(--border-primary)] bg-[var(--bg-tertiary)]/30 transition-colors duration-200 hover:border-[var(--accent-border)] hover:bg-[var(--bg-tertiary)]/60 disabled:opacity-40 cursor-pointer"
                    style={{
                      left: `calc(${left}% + ${column * GRID_GAP}px)`,
                      top: `calc(${top}% + ${row * GRID_GAP}px)`,
                      width: `${cellColumnSizes[row][column]}%`,
                      height: `${cellRowSizes[column][row]}%`,
                    }}
                  >
                    <svg className="h-6 w-6 text-[var(--text-secondary)]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="font-mono text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)]/50">Spawn Agent</span>
                  </button>
                );
              })()}

              {independentGridResize && cols > 1 && Array.from({ length: rows }).flatMap((_, row) =>
                Array.from({ length: cols - 1 }).map((_, divider) => {
                  const left = activeRowColumnSizes[row].slice(0, divider + 1).reduce((sum, size) => sum + size, 0);
                  const top = activeColumnRowSizes[divider].slice(0, row).reduce((sum, size) => sum + size, 0);
                  return (
                    <div
                      key={`agent-v-divider-${row}-${divider}`}
                      onMouseDown={(event) => handleDividerDrag(event, 'col', divider, row)}
                      onDoubleClick={() => resetDivider('col', row)}
                      title="Drag to resize. Double-click to reset equal widths."
                      className="absolute z-20 cursor-col-resize group/divider"
                      style={{
                        left: `calc(${left}% + ${divider * GRID_GAP}px + ${(GRID_GAP - GRID_DIVIDER) / 2}px)`,
                        top: `calc(${top}% + ${row * GRID_GAP}px)`,
                        width: `${GRID_DIVIDER}px`,
                        height: `${activeColumnRowSizes[divider][row]}%`,
                      }}
                    >
                      <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover/divider:bg-[var(--accent)]/70 group-active/divider:bg-[var(--accent)]" />
                    </div>
                  );
                })
              )}

              {independentGridResize && rows > 1 && Array.from({ length: cols }).flatMap((_, column) =>
                Array.from({ length: rows - 1 }).map((_, divider) => {
                  const top = activeColumnRowSizes[column].slice(0, divider + 1).reduce((sum, size) => sum + size, 0);
                  const left = activeRowColumnSizes[divider].slice(0, column).reduce((sum, size) => sum + size, 0);
                  return (
                    <div
                      key={`agent-h-divider-${column}-${divider}`}
                      onMouseDown={(event) => handleDividerDrag(event, 'row', divider, column)}
                      onDoubleClick={() => resetDivider('row', column)}
                      title="Drag to resize. Double-click to reset equal heights."
                      className="absolute z-20 cursor-row-resize group/divider"
                      style={{
                        left: `calc(${left}% + ${column * GRID_GAP}px)`,
                        top: `calc(${top}% + ${divider * GRID_GAP}px + ${(GRID_GAP - GRID_DIVIDER) / 2}px)`,
                        width: `${activeRowColumnSizes[divider][column]}%`,
                        height: `${GRID_DIVIDER}px`,
                      }}
                    >
                      <div className="my-auto h-px w-full bg-transparent transition-colors group-hover/divider:bg-[var(--accent)]/70 group-active/divider:bg-[var(--accent)]" />
                    </div>
                  );
                })
              )}

              {!independentGridResize && cols > 1 && Array.from({ length: cols - 1 }).map((_, divider) => {
                const left = activeColumnSizes.slice(0, divider + 1).reduce((sum, size) => sum + size, 0);
                return (
                  <div
                    key={`agent-v-divider-${divider}`}
                    onMouseDown={(event) => handleDividerDrag(event, 'col', divider)}
                    onDoubleClick={() => resetDivider('col')}
                    title="Drag to resize. Double-click to reset equal widths."
                    className="absolute inset-y-0 z-20 cursor-col-resize group/divider"
                    style={{ left: `calc(${left}% + ${divider * GRID_GAP}px + ${(GRID_GAP - GRID_DIVIDER) / 2}px)`, width: `${GRID_DIVIDER}px` }}
                  >
                    <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover/divider:bg-[var(--accent)]/70 group-active/divider:bg-[var(--accent)]" />
                  </div>
                );
              })}

              {!independentGridResize && rows > 1 && Array.from({ length: rows - 1 }).map((_, divider) => {
                const top = activeRowSizes.slice(0, divider + 1).reduce((sum, size) => sum + size, 0);
                return (
                  <div
                    key={`agent-h-divider-${divider}`}
                    onMouseDown={(event) => handleDividerDrag(event, 'row', divider)}
                    onDoubleClick={() => resetDivider('row')}
                    title="Drag to resize. Double-click to reset equal heights."
                    className="absolute inset-x-0 z-20 cursor-row-resize group/divider"
                    style={{ top: `calc(${top}% + ${divider * GRID_GAP}px + ${(GRID_GAP - GRID_DIVIDER) / 2}px)`, height: `${GRID_DIVIDER}px` }}
                  >
                    <div className="my-auto h-px w-full bg-transparent transition-colors group-hover/divider:bg-[var(--accent)]/70 group-active/divider:bg-[var(--accent)]" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-xl premium-surface">
            <svg className="animate-spin h-7 w-7 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Creating agent session…
            </span>
          </div>
        </div>
      )}

      {showNewDialog && (
        <NewAgentDialog
          workspaceId={workspaceId}
          cwd={currentWorkspace?.path ?? ''}
          onClose={() => setShowNewDialog(false)}
          onCreate={handleCreate}
        />
      )}

      {showHistory && (
        <SessionHistory
          currentWorkspaceId={workspaceId}
          openSessionIds={new Set(sessions.map((s) => s.sessionId))}
          onResume={handleResume}
          onDelete={handleDelete}
          onClose={() => setShowHistory(false)}
        />
      )}

      <AgentCommandDrawer
        key={workspaceId}
        workspaceId={workspaceId}
        workspacePath={currentWorkspace?.path ?? ''}
      />
    </div>
  );
};

const parseDate = (value?: string | number | null): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
};
