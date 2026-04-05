import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { detectProject, ProjectActions } from '../../utils/projectDetect';

interface QuickActionsProps {
  sessionId: string;
  cwd: string;
  theme: 'dark' | 'light';
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  sessionId,
  cwd,
  theme,
}) => {
  const [actions, setActions] = useState<ProjectActions | null>(null);
  const isLight = theme === 'light';

  useEffect(() => {
    let mounted = true;
    detectProject(cwd).then((result) => {
      if (mounted) setActions(result);
    });
    return () => {
      mounted = false;
    };
  }, [cwd]);

  if (!actions) return null;

  const runCommand = async (cmd: string) => {
    try {
      await invoke('write_to_terminal', {
        sessionId,
        input: '\x1b[200~' + cmd + '\x1b[201~\r',
      });
    } catch (e) {
      console.error('Quick action failed:', e);
    }
  };

  const btnBase = `flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border shrink-0 ${
    isLight
      ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-emerald-400 hover:border-emerald-800 hover:bg-emerald-950/40'
      : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-emerald-400 hover:border-emerald-900 hover:bg-emerald-950/30'
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
      <div className="h-3 w-px bg-zinc-800/50" />
      {actions.devCmd && (
        <button
          className={btnBase}
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
    </div>
  );
};
