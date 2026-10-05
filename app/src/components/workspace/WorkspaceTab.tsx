import React from 'react';
import { FolderSimple, Plus, X } from '@phosphor-icons/react';
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
}) => (
  <div
    role="tab"
    aria-selected={isActive}
    tabIndex={0}
    title={workspace.path ? `${workspace.name}\n${workspace.path}` : workspace.name}
    className={`chrome-tab ${isActive ? 'is-active' : ''}`}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    }}
  >
    <FolderSimple size={14} weight={isActive ? 'fill' : 'regular'} className="chrome-tab__icon" aria-hidden="true" />
    <span className="chrome-tab__label">{workspace.name}</span>
    {/* The terminal count and the close button share one slot: count at rest, × on hover/focus. */}
    <span className="chrome-tab__tail">
      {sessionsCount > 0 && (
        <span
          className="chrome-tab__count"
          title={`${sessionsCount} terminal${sessionsCount === 1 ? '' : 's'}`}
        >
          {sessionsCount}
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        className="chrome-tab__close"
        title="Close workspace"
        aria-label={`Close ${workspace.name}`}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  </div>
);

/** The tab shown while the setup screen is the current page, like a browser's "new tab". */
export const NewWorkspaceTab: React.FC = () => (
  <div role="tab" aria-selected="true" className="chrome-tab chrome-tab--static is-active">
    <Plus size={14} className="chrome-tab__icon" aria-hidden="true" />
    <span className="chrome-tab__label">New workspace</span>
  </div>
);
