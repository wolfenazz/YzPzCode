import React from 'react';
import { DirectorySelector } from './DirectorySelector';
import { LayoutSelector } from './LayoutSelector';
import { AgentFleetConfig } from './AgentFleetConfig';
import { IdesSelector } from './IdesSelector';
import { WorkspaceTemplatePicker } from './WorkspaceTemplatePicker';
import { InitializeWorkspace } from './InitializeWorkspace';
import { HelpTooltip } from '../common/HelpTooltip';
import { LayoutConfig, AgentFleet } from '../../types';
import { WorkspaceTemplate } from '../../hooks/useWorkspace';

interface WorkspaceConfigFormProps {
  selectedPath: string;
  workspaceName: string;
  selectedLayout: LayoutConfig;
  isAllocationValid: boolean;
  hasOpenWorkspaces?: boolean;
  onSelectDirectory: () => void;
  onSelectRecentDirectory: (path: string) => void;
  onWorkspaceNameChange: (name: string) => void;
  onLayoutSelect: (layout: LayoutConfig) => void;
  onAllocationChange: (fleet: AgentFleet) => void;
  onTemplateSelect: (templateId: string) => void;
  onReapplyTemplate?: (templateId: string) => void;
  onSaveCustomTemplate: (name: string) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateTemplate: (id: string, updates: Partial<Omit<WorkspaceTemplate, 'id'>>) => void;
  onRestoreDefaults: () => void;
  templates: WorkspaceTemplate[];
  onCreateWorkspace: () => void;
  onCancel?: () => void;
  isValid: boolean;
  isLoading?: boolean;
  isExternalMode?: boolean;
  validationErrors: Record<string, string>;
  selectedTemplateId: string;
  templateAllocation?: Record<string, number> | null;
}

const ValidationError: React.FC<{ message?: string }> = ({ message }) => {
  if (!message) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <svg className="w-3 h-3 text-rose-400/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span className="text-[10px] text-rose-400/80 font-mono">{message}</span>
    </div>
  );
};

export const WorkspaceConfigForm: React.FC<WorkspaceConfigFormProps> = ({
  selectedPath,
  workspaceName,
  selectedLayout,
  isAllocationValid,
  hasOpenWorkspaces,
  onSelectDirectory,
  onSelectRecentDirectory,
  onWorkspaceNameChange,
  onLayoutSelect,
  onAllocationChange,
  onTemplateSelect,
  onReapplyTemplate,
  onSaveCustomTemplate,
  onDeleteTemplate,
  onUpdateTemplate,
  onRestoreDefaults,
  templates,
  onCreateWorkspace,
  onCancel,
  isValid,
  isLoading,
  isExternalMode,
  validationErrors,
  selectedTemplateId,
  templateAllocation,
}) => {
  return (
    <div className="setup-config w-full bg-theme-card border border-theme rounded-lg overflow-hidden">
      {/* Header */}
      <div className="setup-config__header px-8 py-6 border-b border-theme">
        <div className="flex items-center gap-3">
          <div className="setup-config__mark w-8 h-8 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-lg">
            <svg className="w-4 h-4 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="setup-config__title text-sm font-mono font-bold text-theme-main tracking-tight">
              Configure workspace
            </h1>
            <p className="setup-config__description text-[var(--text-secondary)] font-mono text-xs mt-0.5 tracking-wide">
              Choose where you will work and how the workspace should open.
            </p>
          </div>
        </div>
      </div>

      {/* Form Body */}
      <div className="setup-config__body p-8 space-y-8">
        {/* Section: Template */}
        <div className="setup-config__section space-y-4">
          <WorkspaceTemplatePicker
            selectedTemplateId={selectedTemplateId}
            templates={templates}
            onSelectTemplate={onTemplateSelect}
            onReapplyTemplate={onReapplyTemplate}
            onDeleteTemplate={onDeleteTemplate}
            onSaveCustomTemplate={onSaveCustomTemplate}
            onUpdateTemplate={onUpdateTemplate}
            onRestoreDefaults={onRestoreDefaults}
          />
        </div>

        <div className="setup-config__divider border-t border-zinc-800/60" />

        {/* Section: Workspace Details */}
        <div className="setup-config__section space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-[10px] font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-[0.2em]">Workspace details</h2>
          </div>

          {!isExternalMode && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <label className="block text-xs font-medium text-[var(--text-secondary)] font-mono uppercase tracking-[0.15em]">
                  Workspace Name
                </label>
                <HelpTooltip text="A name to identify this workspace. Used as a tab label when switching between multiple workspaces." />
              </div>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => onWorkspaceNameChange(e.target.value)}
                placeholder="Enter workspace name..."
                className={`w-full px-4 py-3 bg-theme-main border rounded-lg text-theme-main placeholder:text-[var(--text-secondary)] focus:outline-none font-mono text-sm transition-colors duration-150 ${
                  validationErrors.workspaceName
                    ? 'border-rose-500/40 focus:border-rose-500'
                    : 'border-theme focus:border-zinc-500'
                }`}
              />
              <ValidationError message={validationErrors.workspaceName} />
            </div>
          )}

          <DirectorySelector
            selectedPath={selectedPath}
            onSelectDirectory={onSelectDirectory}
            onSelectRecentDirectory={onSelectRecentDirectory}
            errorMessage={validationErrors.directory}
          />
        </div>

        <div className="setup-config__divider border-t border-zinc-800/60" />

        {/* Section: Project Init */}
        <div className="setup-config__section space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-[10px] font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-[0.2em]">Project initialization</h2>
          </div>
          <InitializeWorkspace selectedPath={selectedPath} />
        </div>

        <div className="setup-config__divider border-t border-zinc-800/60" />

        {/* Section: Layout & Environment */}
        <div className="setup-config__section space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-[10px] font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-[0.2em]">Layout and environment</h2>
          </div>

          <LayoutSelector
            selectedLayout={selectedLayout}
            onSelectLayout={onLayoutSelect}
          />

          <IdesSelector selectedPath={selectedPath} />
        </div>

        <div className="setup-config__divider border-t border-zinc-800/60" />

        {/* Section: Agent Fleet */}
        <div className="setup-config__section space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-[10px] font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-[0.2em]">Agent fleet</h2>
          </div>

          <AgentFleetConfig
            totalSlots={selectedLayout.sessions}
            onAllocationChange={onAllocationChange}
            templateAllocation={templateAllocation as any}
            selectedTemplateId={selectedTemplateId}
          />

          {!isAllocationValid && (
            <div className="px-4 py-3 bg-rose-500/[0.06] border border-rose-500/20 rounded-lg">
              <p className="text-xs text-rose-400/80 font-mono">
                Error: Agent allocation exceeds available slots.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="setup-config__footer px-8 py-5 border-t border-theme bg-zinc-900/30 flex items-center justify-between">
        <div className="setup-config__status flex items-center gap-2 text-[10px] text-[var(--text-secondary)] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
          <span>{selectedLayout.sessions} slots configured</span>
        </div>
        <div className="flex items-center gap-3">
          {hasOpenWorkspaces && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="setup-config__action px-6 py-2.5 rounded-lg font-mono text-xs uppercase tracking-[0.1em] transition-colors duration-150 bg-transparent text-[var(--text-secondary)] border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={onCreateWorkspace}
            disabled={!isValid || isLoading}
            className={`setup-config__action setup-config__action--primary px-8 py-2.5 rounded-lg font-mono text-xs uppercase tracking-[0.1em] transition-all duration-200 flex items-center gap-2 cursor-pointer ${
              isValid && !isLoading
                ? 'bg-white text-zinc-900 hover:bg-zinc-200 hover:shadow-[0_0_20px_rgba(255,255,255,0.08)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)] cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Launching</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Execute
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
