import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CaretLeft, CaretRight, TerminalWindow, TextT, X } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { TerminalPane } from '../workspace/TerminalPane';
import type { TerminalSession } from '../../types';

interface AgentCommandDrawerProps {
  workspaceId: string;
  workspacePath: string;
}

const getTerminalLabel = (shell: string): string =>
  /powershell|pwsh/i.test(shell) ? 'PowerShell terminal' : 'System terminal';

/**
 * One independent shell for the Agent workspace. It deliberately lives outside
 * the agent-session store: opening or hiding it never creates, changes, or
 * closes an AI conversation.
 */
export const AgentCommandDrawer: React.FC<AgentCommandDrawerProps> = ({ workspaceId, workspacePath }) => {
  const [open, setOpen] = useState(false);
  const [terminalSession, setTerminalSession] = useState<TerminalSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminalLabel, setTerminalLabel] = useState('Command terminal');
  const sessionRef = useRef<TerminalSession | null>(null);
  const creatingRef = useRef(false);

  const terminateShell = useCallback(async (): Promise<void> => {
    const session = sessionRef.current;
    if (!session) return;

    sessionRef.current = null;
    setTerminalSession(null);
    try {
      await invoke('kill_session', { sessionId: session.id });
    } catch {
      // The PTY may already have exited while the Agent screen was closing.
    }
  }, []);

  useEffect(() => {
    return () => {
      void terminateShell();
    };
  }, [terminateShell]);

  const openDrawer = useCallback(async (): Promise<void> => {
    setOpen(true);
    if (sessionRef.current || creatingRef.current || !workspacePath) return;

    creatingRef.current = true;
    setStarting(true);
    setError(null);
    try {
      const session = await invoke<TerminalSession>('create_single_terminal_session', {
        request: {
          workspaceId,
          workspacePath,
          index: 0,
          agent: null,
          // The backend prefers PowerShell 7, then Windows PowerShell, and
          // falls back to the platform's system shell when neither exists.
          shell: null,
        },
      });
      sessionRef.current = session;
      setTerminalSession(session);
      setTerminalLabel(getTerminalLabel(session.shell));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      creatingRef.current = false;
      setStarting(false);
    }
  }, [workspaceId, workspacePath]);

  return (
    <aside
      className={`absolute inset-y-2 right-0 z-40 flex w-[min(30rem,calc(100%-1rem))] flex-col overflow-visible transition-transform duration-300 ease-out motion-reduce:transition-none ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-label={terminalLabel}
    >
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void openDrawer())}
        aria-expanded={open}
        aria-controls="agent-command-terminal"
        className="absolute left-[-34px] top-1/2 flex h-20 w-[34px] -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-l-lg border border-r-0 border-[var(--accent-border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] shadow-[-8px_0_24px_rgba(0,0,0,0.22)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] cursor-pointer"
        title={open ? 'Hide command terminal' : 'Open command terminal'}
      >
        <TextT size={16} aria-hidden="true" />
        {open ? <CaretRight size={14} /> : <CaretLeft size={14} />}
        <span className="sr-only">{open ? 'Hide command terminal' : 'Open command terminal'}</span>
      </button>

      <div
        id="agent-command-terminal"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-l-xl border border-r-0 border-[var(--accent-border)] bg-[var(--bg-main)] shadow-[-16px_0_40px_rgba(0,0,0,0.32)]"
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3">
          <TerminalWindow size={14} className="text-[var(--accent)]" aria-hidden="true" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]">{terminalLabel}</span>
          <span className="ml-auto font-mono text-[9px] text-[var(--text-secondary)]/50">independent shell</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Hide command terminal"
            aria-label="Hide command terminal"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1">
          {terminalSession ? (
            <TerminalPane session={terminalSession} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              {starting ? (
                <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--accent)]">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                  Starting shell…
                </div>
              ) : error ? (
                <div className="space-y-3">
                  <p className="font-mono text-[10px] leading-relaxed text-rose-400">Could not start the command terminal: {error}</p>
                  <button
                    type="button"
                    onClick={() => void openDrawer()}
                    className="rounded-md border border-[var(--accent-border)] px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--accent)] hover:bg-[var(--accent-light)]/15 cursor-pointer"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <p className="font-mono text-[10px] text-[var(--text-secondary)]/60">Open the drawer to start a command shell.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
