import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowClockwise, CaretDown, CaretUp, Cube, Play, TerminalWindow } from '@phosphor-icons/react';
import { useTerminal } from '../../hooks/useTerminal';

export interface DockerContainer {
  id: string;
  image: string;
  status: string;
  names: string;
}

interface DockerPanelProps {
  workspaceId: string;
  workspacePath: string;
}

/**
 * Lightweight Docker helper: list running containers, start/stop them, open
 * live logs in a terminal session, and run docker compose up. Logs/Compose
 * deliberately reuse the app's terminal sessions instead of custom streaming.
 */
export const DockerPanel: React.FC<DockerPanelProps> = ({ workspaceId, workspacePath }) => {
  const [expanded, setExpanded] = useState(false);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { createSingleSession, writeToTerminal } = useTerminal();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await invoke<DockerContainer[]>('list_docker_containers');
      setContainers(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setContainers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!expanded) return;
    void refresh();
  }, [expanded, refresh]);

  const handleStartStop = useCallback(
    async (container: DockerContainer, start: boolean) => {
      setBusyId(container.id);
      setError(null);
      try {
        await invoke(start ? 'docker_start' : 'docker_stop', { name: container.names || container.id });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  const openLogs = useCallback(
    async (container: DockerContainer) => {
      try {
        const session = await createSingleSession({
          workspaceId,
          workspacePath,
          agent: null,
        });
        // The PTY session starts in the workspace shell; typing the command
        // after a short settle runs `docker logs -f`.
        await writeToTerminal(session.id, `docker logs -f ${container.names || container.id}\n`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [createSingleSession, writeToTerminal, workspaceId, workspacePath]
  );

  const runCompose = useCallback(async () => {
    try {
      const session = await createSingleSession({
        workspaceId,
        workspacePath,
        agent: null,
      });
      await writeToTerminal(session.id, 'docker compose up --build\n');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [createSingleSession, writeToTerminal, workspaceId, workspacePath]);

  return (
    <div className="shrink-0 border-t border-[var(--border-primary)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex h-8 w-full cursor-pointer items-center gap-2 border-b border-[var(--border-primary)]/60 px-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
        title="Docker — running containers, logs, compose"
      >
        <Cube size={13} weight="duotone" className="shrink-0 text-cyan-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text-primary)]">
          Docker
        </span>
        {containers.length > 0 && (
          <span className="font-mono text-[8px] tabular-nums text-cyan-400/80">{containers.length}</span>
        )}
        {loading && <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent text-[var(--text-secondary)]/50" />}
        {expanded ? <CaretDown size={12} /> : <CaretUp size={12} />}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="docker-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-[var(--border-primary)]"
          >
            <div className="max-h-44 overflow-y-auto custom-scrollbar premium-scrollbar bg-[var(--bg-secondary)]/25 px-2.5 py-2">
              {error && !containers.length && (
                <p className="px-1 py-1 font-mono text-[8.5px] text-rose-400">{error}</p>
              )}
              {!error && containers.length === 0 && (
                <p className="px-1 py-1 font-mono text-[8.5px] text-[var(--text-secondary)]/50">
                  No running containers. Start Docker and run docker compose up (or any container) in a terminal.
                </p>
              )}
              {containers.map((container) => (
                <div key={container.id} className="flex items-center gap-2 px-1 py-1">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${container.status.toLowerCase().includes('up') ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[9px] font-bold text-[var(--text-primary)]">
                      {container.names || container.id.slice(0, 12)}
                    </p>
                    <p className="truncate font-mono text-[8px] text-[var(--text-secondary)]/60">
                      {container.image} · {container.status}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void openLogs(container)}
                      title="Tail logs in a new terminal"
                      className="inline-flex h-5 cursor-pointer items-center gap-1 rounded border border-[var(--border-primary)] px-1.5 font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--text-secondary)] transition-colors hover:border-cyan-500/40 hover:text-cyan-400"
                    >
                      <TerminalWindow size={10} aria-hidden="true" />
                      Logs
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStartStop(container, !container.status.toLowerCase().includes('up'))}
                      disabled={busyId === container.id}
                      className={`inline-flex h-5 cursor-pointer items-center gap-1 rounded border px-1.5 font-mono text-[8px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 ${
                        container.status.toLowerCase().includes('up')
                          ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                          : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                    >
                      {container.status.toLowerCase().includes('up') ? 'Stop' : 'Start'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 border-t border-[var(--border-primary)]/70 px-2.5 py-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-[var(--border-primary)] px-2 font-mono text-[8.5px] font-bold uppercase tracking-widest text-[var(--text-secondary)] transition-colors hover:border-cyan-500/40 hover:text-cyan-400"
              >
                <ArrowClockwise size={12} aria-hidden="true" />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void runCompose()}
                className="inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-[var(--accent-border)] bg-[var(--accent-light)]/10 px-2 font-mono text-[8.5px] font-bold uppercase tracking-widest text-[var(--accent)] transition-colors hover:bg-[var(--accent-light)]/25"
              >
                <Play size={12} aria-hidden="true" />
                Compose Up
              </button>
              {error && containers.length > 0 && (
                <span className="min-w-0 flex-1 truncate text-right font-mono text-[8px] text-rose-400">{error}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};