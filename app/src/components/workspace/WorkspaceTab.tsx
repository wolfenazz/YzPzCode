import React from 'react';
import { FolderSimple, X } from '@phosphor-icons/react';
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
        workspace-tab group relative flex items-center gap-1.5 h-6.5 pl-2.5 pr-1 cursor-pointer select-none
        whitespace-nowrap rounded-md border transition-all duration-150
        ${isActive
          ? 'is-active border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
          : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border-primary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
        }
      `}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <FolderSimple size={13} weight={isActive ? 'fill' : 'regular'} className={`shrink-0 transition-colors duration-150 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]/60'}`} aria-hidden="true" />

      <span className={`max-w-[150px] truncate text-[11px] font-medium transition-colors duration-150 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`} title={workspace.name}>
        {workspace.name}
      </span>

      {sessionsCount > 0 && (
        <span className={`workspace-tab__count text-[10px] tabular-nums leading-none transition-colors duration-150 ${isActive ? 'text-[var(--text-secondary)]' : 'text-[var(--text-secondary)]/60'}`}>
          {sessionsCount}
        </span>
      )}

      <button
        onClick={onClose}
        className={`
          workspace-tab__close flex items-center justify-center w-4 h-4 rounded
          transition-all duration-150 cursor-pointer
          ${isActive
            ? 'text-[var(--text-secondary)]/60 hover:text-rose-400 hover:bg-rose-500/10'
            : 'text-[var(--text-secondary)]/40 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100'
          }
        `}
        title="Close"
      >
        <X size={11} aria-hidden="true" />
      </button>
    </div>
  );
};
