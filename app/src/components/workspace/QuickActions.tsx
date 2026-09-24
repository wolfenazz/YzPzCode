import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Hammer, Play } from '@phosphor-icons/react';
import { detectProject, ProjectActions } from '../../utils/projectDetect';
import type { ManagedTerminalCommandState } from '../../types';

interface QuickActionsProps {
  sessionId: string;
  workspaceId: string;
  cwd: string;
  managedState: ManagedTerminalCommandState | null;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  sessionId,
  workspaceId,
  cwd,
  managedState,
}) => {
  const [detection, setDetection] = useState<{ cwd: string; actions: ProjectActions | null } | null>(null);

  useEffect(() => {
    let mounted = true;
    detectProject(cwd).then((result) => {
      if (mounted) setDetection({ cwd, actions: result });
    });
    return () => {
      mounted = false;
    };
  }, [cwd]);

  const actions = detection?.cwd === cwd ? detection.actions : null;

  if (!actions) return null;

  const managedBusy = managedState
    ? managedState.status === 'Starting' || managedState.status === 'Running' || managedState.status === 'Stopping'
    : false;

  const runCommand = async (cmd: string) => {
    try {
      await invoke('run_managed_terminal_command', {
        request: {
          sessionId,
          workspaceId,
          cwd,
          command: cmd,
        },
      });
    } catch (e) {
      console.error('Quick action failed:', e);
    }
  };

  const btnBase = `flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] transition-colors duration-150 cursor-pointer shrink-0 hover:border-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40`;

  return (
    <div className="flex items-center gap-1">
      <span
        className={`text-[9px] font-medium uppercase tracking-wider text-[var(--text-secondary)]/70`}
      >
        {actions.label}
      </span>
      {actions.devCmd && (
        <button
          className={btnBase}
          disabled={managedBusy}
          onClick={() => runCommand(actions.devCmd!)}
          title={`Run: ${actions.devCmd}`}
        >
          <Play size={10} weight="fill" aria-hidden="true" />
          <span>Dev</span>
        </button>
      )}
      {actions.buildCmd && (
        <button
          className={btnBase}
          disabled={managedBusy}
          onClick={() => runCommand(actions.buildCmd!)}
          title={`Run: ${actions.buildCmd}`}
        >
          <Hammer size={10} weight="fill" aria-hidden="true" />
          <span>Build</span>
        </button>
      )}
    </div>
  );
};
