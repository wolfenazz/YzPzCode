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
    <div className="w-full max-w-4xl mx-auto space-y-8 p-8 bg-theme-card border border-theme rounded-sm shadow-2xl">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-theme-main mb-2 font-mono tracking-tight">
          &gt; YzPzCode --setup
        </h1>
        <p className="text-theme-secondary font-mono text-sm opacity-70">
          Initialize your multi-terminal AI development environment
        </p>
      </div>

      {!isExternalMode && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-medium text-theme-secondary font-mono uppercase tracking-widest">
              Workspace Name
            </label>
            <HelpTooltip text="A name to identify this workspace. Used as a tab label when switching between multiple workspaces." />
          </div>
          <input
            type="text"
            value={workspaceName}
            onChange={(e) => onWorkspaceNameChange(e.target.value)}
            placeholder="Enter workspace name..."
            className="w-full px-4 py-3 bg-theme-main border border-theme rounded-sm text-theme-main placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 focus:border-zinc-700 font-mono transition-colors active:bg-theme-hover"
          />
        </div>
      )}

      <DirectorySelector
        selectedPath={selectedPath}
        onSelectDirectory={onSelectDirectory}
      />


      <LayoutSelector
        selectedLayout={selectedLayout}
        onSelectLayout={onLayoutSelect}
      />

      <IdesSelector selectedPath={selectedPath} />

      <AgentFleetConfig
        totalSlots={selectedLayout.sessions}
        onAllocationChange={onAllocationChange}
      />

      {!isAllocationValid && (
        <div className="p-3 bg-rose-950/50 border border-rose-900/50 rounded-sm">
          <p className="text-sm text-rose-400 font-mono">
            Error: Agent allocation exceeds available slots.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-3 mt-12 pt-8 border-t border-zinc-800/50">
        {hasOpenWorkspaces && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-8 py-3 rounded-sm font-mono text-sm uppercase tracking-wider transition-all min-w-[160px] bg-transparent text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200"
          >
            [ Cancel ]
          </button>
        )}
        <button
          type="button"
          onClick={onCreateWorkspace}
          disabled={!isValid || isLoading}
          className={`px-8 py-3 rounded-sm font-mono text-sm uppercase tracking-wider transition-all min-w-[160px] flex items-center justify-center ${isValid && !isLoading
            ? 'bg-zinc-100 text-zinc-900 hover:bg-white box-shadow hover:shadow-[0_0_15px_rgba(255,255,255,0.3)]'
            : 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed'
            }`}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-zinc-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>[ LAUNCHING... ]</span>
            </div>
          ) : (
            '[ Execute ]'
          )}
        </button>
      </div>
    </div>
  );
};
