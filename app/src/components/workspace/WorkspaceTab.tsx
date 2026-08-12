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
        group relative flex items-center gap-2 h-6.5 px-2.5 cursor-pointer select-none
        transition-colors duration-100 whitespace-nowrap rounded-md border
        ${isActive
          ? 'bg-[var(--bg-tertiary)] border-[var(--border-primary)] text-[var(--text-primary)] shadow-[inset_0_2px_0_0_var(--accent)]'
          : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/50'
        }
      `}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <svg className={`w-3 h-3 flex-shrink-0 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]/60'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>

      <span className={`text-[10px] font-mono tracking-[0.12em] truncate max-w-[150px] uppercase ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`} title={workspace.name}>
        {workspace.name}
      </span>

      {sessionsCount > 0 && (
        <span className={`text-[9px] font-mono px-1.5 py-[1px] rounded border ${isActive ? 'text-[var(--text-primary)] border-[var(--border-primary)] bg-[var(--bg-secondary)]' : 'text-[var(--text-secondary)] border-[var(--border-primary)]/60'}`}>
          {sessionsCount}
        </span>
      )}

      <button
        onClick={onClose}
        className={`
          flex items-center justify-center w-4 h-4
          transition-colors duration-100
          ${isActive
            ? 'text-[var(--text-secondary)]/70 hover:text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)]/40 hover:text-[var(--text-primary)] opacity-0 group-hover:opacity-100'
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
