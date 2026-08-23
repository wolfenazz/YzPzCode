import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Hammer, Play, Square } from '@phosphor-icons/react';
import { detectProject, ProjectActions } from '../../utils/projectDetect';
import type { ManagedTerminalCommandState } from '../../types';

interface QuickActionsProps {
  sessionId: string;
  workspaceId: string;
  cwd: string;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  sessionId,
  workspaceId,
  cwd,
}) => {
  const [actions, setActions] = useState<ProjectActions | null>(null);
  const [managedState, setManagedState] = useState<ManagedTerminalCommandState | null>(null);

  useEffect(() => {
    let mounted = true;
    detectProject(cwd).then((result) => {
      if (mounted) setActions(result);
    });
    return () => {
      mounted = false;
    };
  }, [cwd]);

  useEffect(() => {
    let mounted = true;
    let unlisten: UnlistenFn | null = null;

    invoke<ManagedTerminalCommandState | null>('get_managed_terminal_command_state', {
      sessionId,
    }).then((state) => {
      if (mounted) {
        setManagedState(state);
      }
    }).catch(() => undefined);

    listen<ManagedTerminalCommandState>('managed-command-state-changed', (event) => {
      if (!mounted || event.payload.sessionId !== sessionId) return;
      setManagedState(event.payload);
    }).then((fn) => {
      if (mounted) {
        unlisten = fn;
      } else {
        fn();
      }
    });

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, [sessionId]);

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

  const stopManagedCommand = async () => {
    try {
      await invoke('stop_managed_terminal_command', { sessionId });
    } catch (e) {
      console.error('Failed to stop managed command:', e);
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
      {managedBusy && (
        <button
          className={`${btnBase} hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-400`}
          onClick={stopManagedCommand}
          title={managedState?.command ? `Stop: ${managedState.command}` : 'Stop managed command'}
        >
          <Square size={10} weight="fill" aria-hidden="true" />
          <span>Stop</span>
        </button>
      )}
    </div>
  );
};
