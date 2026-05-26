import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { detectProject, ProjectActions } from '../../utils/projectDetect';
import { useAppStore } from '../../stores/appStore';
import type { ManagedTerminalCommandState } from '../../types';

interface QuickActionsProps {
  sessionId: string;
  workspaceId: string;
  cwd: string;
  theme: 'dark' | 'light';
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  sessionId,
  workspaceId,
  cwd,
  theme,
}) => {
  const [actions, setActions] = useState<ProjectActions | null>(null);
  const [managedState, setManagedState] = useState<ManagedTerminalCommandState | null>(null);
  const isLight = theme === 'light';
  const quickActionRunTarget = useAppStore((state) => state.quickActionRunTarget);
  const setQuickActionRunTarget = useAppStore((state) => state.setQuickActionRunTarget);

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
      if (quickActionRunTarget === 'external') {
        await invoke('launch_external_command', {
          request: {
            workspacePath: cwd,
            command: cmd,
          },
        });
        return;
      }

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

  const btnBase = `flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border shrink-0 ${
    isLight
      ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-emerald-400 hover:border-emerald-800 hover:bg-emerald-950/40'
      : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-emerald-400 hover:border-emerald-900 hover:bg-emerald-950/30'
  }`;
  const modeBtn = `px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-[0.18em] transition-all duration-200 cursor-pointer border shrink-0 ${
    quickActionRunTarget === 'external'
      ? (isLight
          ? 'bg-amber-950/40 border-amber-800 text-amber-300 hover:bg-amber-900/50'
          : 'bg-amber-950/30 border-amber-900 text-amber-400 hover:bg-amber-950/50')
      : (isLight
          ? 'bg-sky-950/35 border-sky-800 text-sky-300 hover:bg-sky-900/50'
          : 'bg-sky-950/25 border-sky-900 text-sky-400 hover:bg-sky-950/45')
  }`;

  return (
    <div className="flex items-center gap-1">
      <span
        className={`text-[8px] font-bold uppercase tracking-widest ${
          isLight ? 'text-zinc-600' : 'text-zinc-700'
        }`}
      >
        {actions.label}
      </span>
      <button
        className={modeBtn}
        onClick={() => setQuickActionRunTarget(quickActionRunTarget === 'external' ? 'embedded' : 'external')}
        title={
          quickActionRunTarget === 'external'
            ? 'Quick Actions currently run in an external terminal. Click to switch to the in-app terminal.'
            : 'Quick Actions currently run inside the app terminal. Click to switch to an external terminal.'
        }
      >
        {quickActionRunTarget === 'external' ? 'Ext' : 'App'}
      </button>
      <div className="h-3 w-px bg-zinc-800/50" />
      {actions.devCmd && (
        <button
          className={btnBase}
          disabled={managedBusy}
          onClick={() => runCommand(actions.devCmd!)}
          title={`Run: ${actions.devCmd}`}
        >
          <svg
            className="w-2.5 h-2.5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
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
          <svg
            className="w-2.5 h-2.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
          <span>Build</span>
        </button>
      )}
      {managedBusy && quickActionRunTarget === 'embedded' && (
        <button
          className={`${btnBase} ${
            isLight
              ? 'hover:text-rose-300 hover:border-rose-700 hover:bg-rose-950/35'
              : 'hover:text-rose-400 hover:border-rose-900 hover:bg-rose-950/25'
          }`}
          onClick={stopManagedCommand}
          title={managedState?.command ? `Stop: ${managedState.command}` : 'Stop managed command'}
        >
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 7h10v10H7z" />
          </svg>
          <span>Stop</span>
        </button>
      )}
    </div>
  );
};
