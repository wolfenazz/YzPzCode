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
        group relative flex items-center gap-2 h-full px-3 cursor-pointer select-none
        transition-colors duration-150 whitespace-nowrap border-r border-theme
        ${isActive
          ? 'bg-theme-hover text-theme-main'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-theme-card/40'
        }
      `}
      onClick={onClick}
    >
      <svg className={`w-3 h-3 flex-shrink-0 ${isActive ? 'text-zinc-300' : 'text-zinc-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>

      <span className={`text-[10px] font-mono tracking-[0.1em] truncate max-w-[120px] uppercase ${isActive ? 'text-zinc-200' : 'text-zinc-500'}`}>
        {workspace.name}
      </span>

      {sessionsCount > 0 && (
        <span className={`text-[9px] font-mono ${isActive ? 'text-zinc-400' : 'text-zinc-600'}`}>
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
