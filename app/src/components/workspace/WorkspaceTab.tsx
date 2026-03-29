import React from 'react';
import { WorkspaceConfig } from '../../types';

interface WorkspaceTabProps {
  workspace: WorkspaceConfig;
  isActive: boolean;
  sessionsCount: number;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}

export const WorkspaceTab: React.FC<WorkspaceTabProps> = ({
  workspace,
  isActive,
  sessionsCount,
  onClick,
  onClose,
}) => {
  return (
    <div
      className={`
        group relative flex items-center gap-2.5 h-8 px-4 rounded-lg cursor-pointer select-none
        transition-all duration-300 whitespace-nowrap
        ${isActive
          ? 'bg-zinc-800 text-zinc-100 shadow-lg border border-zinc-700/50'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 border border-transparent'
        }
      `}
      onClick={onClick}
    >
      <div className={`
        flex items-center justify-center w-5 h-5 rounded-md transition-colors
        ${isActive ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-600 group-hover:text-zinc-400'}
      `}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </div>

      <div className="flex flex-col -space-y-1">
        <span className="text-[10px] font-bold tracking-wider truncate max-w-[120px] uppercase">
          {workspace.name}
        </span>
        {isActive && (
          <span className="text-[7px] text-blue-500 font-mono tracking-widest uppercase opacity-80">active.session</span>
        )}
      </div>

      {sessionsCount > 0 && (
        <div className={`
          flex items-center gap-1 px-1.5 py-0.5 rounded-md font-mono text-[9px] font-bold transition-all duration-300
          ${isActive
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'bg-zinc-800/50 text-zinc-600 border border-zinc-700/30'
          }
        `}>
          <span className="w-1 h-1 rounded-full bg-current animate-pulse"></span>
          {sessionsCount}
        </div>
      )}

      <button
        onClick={onClose}
        className={`
          ml-1 flex items-center justify-center w-5 h-5 rounded-md
          transition-all duration-200
          ${isActive
            ? 'hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400'
            : 'hover:bg-zinc-800 text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100'
          }
        `}
        title="Terminate workspace"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {isActive && (
        <div className="absolute -bottom-[8.5px] left-2 right-2 h-0.5 bg-blue-500 rounded-t-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
      )}
    </div>
  );
};
