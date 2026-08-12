import React, { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CliType, TerminalSession } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { NewTerminalDialog } from './NewTerminalDialog';
function getGridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

export const TerminalStatusBar: React.FC = () => {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const sessions = useAppStore((s) => s.sessions);
  const addSession = useAppStore((s) => s.addSession);

  const { cols, rows } = getGridDimensions(sessions.length);

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

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black tracking-[0.22em] text-zinc-500 uppercase">Sessions</span>
          <span className="text-[10px] font-bold text-zinc-200">{sessions.length}</span>
        </div>
        <div className="h-3 w-px bg-zinc-700/70" />
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black tracking-[0.22em] text-zinc-500 uppercase">Layout</span>
          <span className="text-[10px] font-bold text-zinc-200">{cols}x{rows}</span>
        </div>
        <button
          onClick={() => setShowNewDialog(true)}
          className="group/init relative flex items-center gap-1.5 px-2 py-1 bg-zinc-900/90 text-zinc-200 border-zinc-700/90 hover:bg-zinc-800/95 border text-[9px] font-bold uppercase tracking-[0.15em] transition-all duration-300 cursor-pointer"
          title="Initialize new TTY"
        >
          <svg className="w-3 h-3 transition-transform duration-500 group-hover/init:rotate-[360deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="relative">Initialize_TTY</span>
        </button>
      </div>

      {showNewDialog && (
        <NewTerminalDialog
          onClose={() => setShowNewDialog(false)}
          onSelect={handleAddTerminal}
        />
      )}
    </>
  );
};
