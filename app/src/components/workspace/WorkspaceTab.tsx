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
        group relative flex items-center gap-1.5 h-6.5 pl-2.5 pr-1 cursor-pointer select-none
        whitespace-nowrap rounded-md border transition-all duration-150
        ${isActive
          ? 'border-[var(--border-primary)] bg-gradient-to-b from-[var(--bg-tertiary)] to-[var(--bg-secondary)] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.2),0_2px_8px_rgba(0,0,0,0.35)]'
          : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-primary)]/50 hover:bg-[var(--bg-tertiary)]/40'
        }
      `}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      {isActive && (
        <span className="absolute top-[2px] left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow),0_0_12px_var(--accent-glow)]" />
      )}

      <svg className={`w-3 h-3 flex-shrink-0 transition-colors duration-150 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/50 group-hover:text-[var(--accent-text)]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>

      <span className={`text-[10px] font-mono font-medium tracking-[0.08em] truncate max-w-[150px] uppercase transition-colors duration-150 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`} title={workspace.name}>
        {workspace.name}
      </span>

      {sessionsCount > 0 && (
        <span className={`text-[8px] font-mono tabular-nums leading-none transition-colors duration-150 ${isActive ? 'text-[var(--text-secondary)]/70' : 'text-[var(--text-secondary)]/40 group-hover:text-[var(--text-secondary)]/60'}`}>
          {sessionsCount}
        </span>
      )}

      <button
        onClick={onClose}
        className={`
          flex items-center justify-center w-4 h-4 rounded
          transition-all duration-150 cursor-pointer
          ${isActive
            ? 'text-[var(--text-secondary)]/60 hover:text-rose-400 hover:bg-rose-500/10'
            : 'text-[var(--text-secondary)]/40 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100'
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
