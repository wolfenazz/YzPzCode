import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { DirectorySelector } from './DirectorySelector';
import { LayoutSelector } from './LayoutSelector';
import { AgentFleetConfig } from './AgentFleetConfig';
import { WorkspaceExtensionsConfig } from './WorkspaceExtensionsConfig';
import { IdesSelector } from './IdesSelector';
import { WorkspaceTemplatePicker } from './WorkspaceTemplatePicker';
import { InitializeWorkspace } from './InitializeWorkspace';
import { useExtensionStore } from '../../stores/extensionStore';
import type { LayoutConfig, AgentFleet, ExtensionInstallProgress } from '../../types';
import type { WorkspaceTemplate } from '../../hooks/useWorkspace';

export interface WorkspaceConfigFormProps {
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
  agentFleet: AgentFleet;
  selectedExtensionIds: string[];
  onToggleExtension: (id: string, selected?: boolean) => void;
  guided?: boolean;
  createError?: string | null;
}


export function WorkspaceConfigForm(props: WorkspaceConfigFormProps): React.JSX.Element {
  const [step, setStep] = useState<'project' | 'tools'>('project');
  const [tab, setTab] = useState<'agents' | 'extensions' | 'tools'>('agents');
  const [advanced, setAdvanced] = useState(false);
  const [advancedVisited, setAdvancedVisited] = useState(false);
  const installing = useExtensionStore((state) => state.installing);
  const catalog = useExtensionStore((state) => state.catalog);
  const backendReady = useExtensionStore((state) => state.backendReady);
  const selectedExtensionsReady = props.selectedExtensionIds.every((id) => backendReady && catalog.some((extension) => extension.id === id && extension.installedVersion));
  const canOpen = props.isValid && selectedExtensionsReady && installing.length === 0 && !props.isLoading;
  const projectReady = Boolean(props.selectedPath && (props.isExternalMode || props.workspaceName.trim()));
  const showProject = !props.guided || step === 'project';
  const showTools = !props.guided || step === 'tools';
  const allocated = Object.values(props.agentFleet.allocation).reduce((sum, count) => sum + count, 0);

  useEffect(() => {
    void useExtensionStore.getState().refreshCatalog();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<ExtensionInstallProgress>('extension-install-progress', (event) => {
      useExtensionStore.getState().setProgress(event.payload);
    }).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
    }).catch((error: unknown) => console.error('Could not subscribe to extension installation:', error));
    return () => { disposed = true; unlisten?.(); };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl border border-theme bg-theme-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-theme px-5 py-4">
        <div>
          <h1 className="text-base font-semibold text-[var(--text-primary)]">Configure workspace</h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Choose a folder, pick your tools, and start working.</p>
        </div>
        {props.guided && <nav aria-label="Setup steps" className="flex gap-2 text-xs">
          <button type="button" aria-current={step === 'project' ? 'step' : undefined} disabled={props.isLoading} onClick={() => setStep('project')}
            className={step === 'project' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>1 · Project</button>
          <span aria-hidden="true" className="text-[var(--text-secondary)]">/</span>
          <button type="button" aria-current={step === 'tools' ? 'step' : undefined} disabled={!projectReady || props.isLoading} onClick={() => setStep('tools')}
            className={step === 'tools' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] disabled:opacity-40'}>2 · Tools</button>
        </nav>}
      </div>
      <div className="space-y-5 p-5">
        <div hidden={!showProject} className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <DirectorySelector selectedPath={props.selectedPath} onSelectDirectory={props.onSelectDirectory} onSelectRecentDirectory={props.onSelectRecentDirectory} />
          <div>
            <label htmlFor="workspace-name" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Workspace name</label>
            <input id="workspace-name" type="text" value={props.workspaceName} onChange={(event) => props.onWorkspaceNameChange(event.target.value)}
              placeholder="Filled from your folder" className="w-full rounded-lg border border-theme bg-theme-main px-3 py-2.5 text-sm text-theme-main" />
          </div>
        </div>

        <div hidden={!showTools} className="space-y-4">
          <LayoutSelector selectedLayout={props.selectedLayout} onSelectLayout={props.onLayoutSelect} />
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1 border-b border-theme pb-2" role="group" aria-label="Launch tools">
              {([{ id: 'agents', label: 'CLI agents' }, { id: 'extensions', label: 'Extensions' }, { id: 'tools', label: 'Tool CLIs' }] as const).map((item) => (
                <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}
                  className={`rounded-lg px-3 py-2 text-sm ${tab === item.id ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                  {item.label}{item.id === 'extensions' && props.selectedExtensionIds.length > 0 ? ` (${props.selectedExtensionIds.length})` : ''}
                </button>
              ))}
            </div>
            {showTools && (tab === 'extensions'
              ? <WorkspaceExtensionsConfig selectedIds={props.selectedExtensionIds} onToggle={props.onToggleExtension} />
              : props.selectedLayout.sessions === 0
                ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-theme p-4 text-sm text-[var(--text-secondary)]">
                    <span>No terminals will open. Add extensions or use the editor.</span>
                    <button type="button" className="text-[var(--accent)]" onClick={() => setTab('extensions')}>Choose extensions</button>
                  </div>
                : <AgentFleetConfig key={tab} fleet={props.agentFleet} category={tab} onAllocationChange={props.onAllocationChange} />)}
            {!props.isAllocationValid && <p role="alert" className="text-xs text-rose-400">{props.validationErrors.allocation}</p>}
            {!selectedExtensionsReady && <p role="alert" className="text-xs text-rose-400">Install or deselect unavailable extensions before opening the workspace.</p>}
          </div>
        </div>

        <div className="border-t border-theme pt-3">
          <button type="button" aria-expanded={advanced} aria-controls="workspace-more-options" onClick={() => { setAdvanced(!advanced); setAdvancedVisited(true); }}
            className="flex w-full items-center justify-between text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <span>More options <span className="hidden text-xs sm:inline">· Templates, project setup & IDEs</span></span>
            <span aria-hidden="true">{advanced ? '−' : '+'}</span>
          </button>
          {advancedVisited && <div id="workspace-more-options" hidden={!advanced} className="space-y-5 pt-5">
            <WorkspaceTemplatePicker selectedTemplateId={props.selectedTemplateId} templates={props.templates} onSelectTemplate={props.onTemplateSelect}
              onReapplyTemplate={props.onReapplyTemplate} onDeleteTemplate={props.onDeleteTemplate} onSaveCustomTemplate={props.onSaveCustomTemplate}
              onUpdateTemplate={props.onUpdateTemplate} onRestoreDefaults={props.onRestoreDefaults} />
            <InitializeWorkspace selectedPath={props.selectedPath} />
            <IdesSelector selectedPath={props.selectedPath} />
            <label className="flex items-start gap-3 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={Boolean(props.selectedLayout.openExternally)}
                disabled={props.selectedLayout.sessions === 0 || props.selectedExtensionIds.length > 0}
                onChange={(event) => props.onLayoutSelect({ ...props.selectedLayout, openExternally: event.target.checked })} />
              <span>Open terminals in external windows
                {(props.selectedLayout.sessions === 0 || props.selectedExtensionIds.length > 0) && <span className="mt-1 block text-xs">Available with terminals and no workspace extensions selected.</span>}
              </span>
            </label>
          </div>}
        </div>
        {props.createError && <p role="alert" className="text-sm text-rose-400">{props.createError}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-theme px-5 py-4">
        <p className="text-xs text-[var(--text-secondary)]" role="status">
          {props.selectedLayout.sessions === 0 ? 'No terminals' : `${allocated} agent/tool · ${props.selectedLayout.sessions - allocated} shell`}
          {props.selectedExtensionIds.length > 0 && ` · ${props.selectedExtensionIds.length} extension${props.selectedExtensionIds.length === 1 ? '' : 's'}`}
        </p>
        <div className="flex items-center gap-3">
          {props.guided && step === 'tools'
            ? <button type="button" disabled={props.isLoading} onClick={() => setStep('project')} className="text-sm text-[var(--text-secondary)]">Back</button>
            : props.hasOpenWorkspaces && props.onCancel && <button type="button" disabled={props.isLoading} onClick={props.onCancel} className="text-sm text-[var(--text-secondary)]">Cancel</button>}
          <button type="button" onClick={props.guided && step === 'project' ? () => setStep('tools') : props.onCreateWorkspace}
            disabled={props.guided && step === 'project' ? !projectReady || props.isLoading : !canOpen}
            className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {props.isLoading ? 'Opening…' : props.guided && step === 'project' ? 'Continue' : installing.length > 0 ? 'Installing…' : props.isExternalMode ? 'Open terminals' : 'Open workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
