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
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      title={workspace.name}
      className={`
        group relative flex items-center gap-2 h-8.5 px-3 cursor-pointer select-none
        transition-all duration-200 whitespace-nowrap rounded-lg border
        ${isActive
          ? 'bg-zinc-800/85 border-zinc-700/90 text-zinc-100 shadow-[0_8px_18px_rgba(0,0,0,0.35)]'
          : 'text-zinc-500 border-zinc-800/70 bg-zinc-900/35 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/70'
        }
      `}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      {isActive && (
        <span className="absolute inset-x-2 -bottom-[1px] h-px bg-gradient-to-r from-transparent via-zinc-300/60 to-transparent" />
      )}
      <svg className={`w-3 h-3 flex-shrink-0 ${isActive ? 'text-zinc-300' : 'text-zinc-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>

      <span className={`text-[10px] font-mono tracking-[0.12em] truncate max-w-[150px] uppercase ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`} title={workspace.name}>
        {workspace.name}
      </span>

      {sessionsCount > 0 && (
        <span className={`text-[9px] font-mono px-1.5 py-[1px] rounded border ${isActive ? 'text-zinc-300 border-zinc-600 bg-zinc-700/40' : 'text-zinc-500 border-zinc-700/70 bg-zinc-900/50'}`}>
          {sessionsCount}
        </span>
      )}

      <button
        onClick={onClose}
        className={`
          flex items-center justify-center w-4 h-4
          transition-colors duration-150
          ${isActive
            ? 'text-zinc-600 hover:text-zinc-300'
            : 'text-zinc-700 hover:text-zinc-400 opacity-0 group-hover:opacity-100'
          }
        `}
        title="Close"
      >
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};
