import React from 'react';
import { DirectorySelector } from './DirectorySelector';
import { LayoutSelector } from './LayoutSelector';
import { AgentFleetConfig } from './AgentFleetConfig';
import { IdesSelector } from './IdesSelector';
import { HelpTooltip } from '../common/HelpTooltip';
import { LayoutConfig, AgentFleet } from '../../types';

interface WorkspaceConfigFormProps {
  selectedPath: string;
  workspaceName: string;
  selectedLayout: LayoutConfig;
  isAllocationValid: boolean;
  hasOpenWorkspaces?: boolean;
  onSelectDirectory: () => void;
  onWorkspaceNameChange: (name: string) => void;
  onLayoutSelect: (layout: LayoutConfig) => void;
  onAllocationChange: (fleet: AgentFleet) => void;
  onCreateWorkspace: () => void;
  onCancel?: () => void;
  isValid: boolean;
  isLoading?: boolean;
  isExternalMode?: boolean;
}

export const WorkspaceConfigForm: React.FC<WorkspaceConfigFormProps> = ({
  selectedPath,
  workspaceName,
  selectedLayout,
  isAllocationValid,
  hasOpenWorkspaces,
  onSelectDirectory,
  onWorkspaceNameChange,
  onLayoutSelect,
  onAllocationChange,
  onCreateWorkspace,
  onCancel,
  isValid,
  isLoading,
  isExternalMode,
}) => {
  return (
    <div className="w-full bg-theme-card border border-theme rounded-md">
      {/* Header */}
      <div className="px-6 py-5 border-b border-theme">
        <h1 className="text-sm font-mono font-semibold text-theme-main tracking-tight">
          $ yzpz --setup
        </h1>
        <p className="text-zinc-500 font-mono text-xs mt-1 tracking-wide">
          Initialize your multi-terminal AI development environment
        </p>
      </div>

      {/* Form Body */}
      <div className="p-6 space-y-6">
        {/* Workspace Name */}
        {!isExternalMode && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="block text-xs font-medium text-zinc-400 font-mono uppercase tracking-[0.15em]">
                Workspace Name
              </label>
              <HelpTooltip text="A name to identify this workspace. Used as a tab label when switching between multiple workspaces." />
            </div>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => onWorkspaceNameChange(e.target.value)}
              placeholder="Enter workspace name..."
              className="w-full px-3.5 py-2.5 bg-theme-main border border-theme rounded-md text-theme-main placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono text-sm transition-colors duration-150"
            />
          </div>
        )}

        {/* Directory Selector */}
        <DirectorySelector
          selectedPath={selectedPath}
          onSelectDirectory={onSelectDirectory}
        />

        {/* Layout Selector */}
        <LayoutSelector
          selectedLayout={selectedLayout}
          onSelectLayout={onLayoutSelect}
        />

        {/* IDEs Selector */}
        <IdesSelector selectedPath={selectedPath} />

        {/* Agent Fleet Config */}
        <AgentFleetConfig
          totalSlots={selectedLayout.sessions}
          onAllocationChange={onAllocationChange}
        />

        {/* Allocation Error */}
        {!isAllocationValid && (
          <div className="px-3.5 py-2.5 bg-rose-500/[0.06] border border-rose-500/20 rounded-md">
            <p className="text-xs text-rose-400/80 font-mono">
              Error: Agent allocation exceeds available slots.
            </p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-theme flex items-center justify-end gap-3">
        {hasOpenWorkspaces && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 rounded-md font-mono text-xs uppercase tracking-[0.1em] transition-colors duration-150 bg-transparent text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onCreateWorkspace}
          disabled={!isValid || isLoading}
          className={`px-5 py-2 rounded-md font-mono text-xs uppercase tracking-[0.1em] transition-colors duration-150 flex items-center gap-2 cursor-pointer ${
            isValid && !isLoading
              ? 'bg-white text-zinc-900 hover:bg-zinc-200'
              : 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Launching</span>
            </>
          ) : (
            'Execute'
          )}
        </button>
      </div>
    </div>
  );
};
