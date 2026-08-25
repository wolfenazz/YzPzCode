import React, { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TerminalWindow } from '@phosphor-icons/react';
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
        className="flex h-6 flex-shrink-0 items-center gap-1.5 rounded border border-[var(--border-primary)] px-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
        title="Open a new terminal"
        aria-label="Create terminal"
      >
        <TerminalWindow size={13} weight="regular" />
        <span className="text-[10px] font-medium leading-none">New terminal</span>
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
