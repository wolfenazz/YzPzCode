import React, { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CliType, TerminalSession } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { NewTerminalDialog } from './NewTerminalDialog';

export const TerminalStatusBar: React.FC = () => {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const activeView = useAppStore((s) => s.activeView);
  const sessions = useAppStore((s) => s.sessions);
  const addSession = useAppStore((s) => s.addSession);

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
    } catch (err) {
      console.error('Failed to create terminal:', err);
    }
  }, [currentWorkspace, sessions.length, addSession]);

  if (!currentWorkspace) return null;
  if (activeView !== 'terminal') return null;

  return (
    <>
      <button
        onClick={() => setShowNewDialog(true)}
        className="group/init relative flex items-center gap-1.5 px-2 py-1 bg-[var(--accent)] text-zinc-950 border-[var(--accent-border)] hover:brightness-110 shadow-[0_0_10px_-2px_var(--accent-glow)] border text-[9px] font-bold uppercase tracking-[0.15em] transition-all duration-300 cursor-pointer"
        title="Initialize new TTY"
      >
        <svg className="w-3 h-3 transition-transform duration-500 group-hover/init:rotate-[360deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="relative">Initialize_TTY</span>
      </button>

      {showNewDialog && (
        <NewTerminalDialog
          onClose={() => setShowNewDialog(false)}
          onSelect={handleAddTerminal}
        />
      )}
    </>
  );
};
