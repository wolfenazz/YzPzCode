import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ArrowRight, Check, CaretDown, FolderSimple, SlidersHorizontal, TerminalWindow } from '@phosphor-icons/react';
import { MotionConfig, useReducedMotion } from 'framer-motion';
import { DirectorySelector } from './DirectorySelector';
import { LayoutSelector } from './LayoutSelector';
import { AgentFleetConfig } from './AgentFleetConfig';
import { WorkspaceExtensionsConfig } from './WorkspaceExtensionsConfig';
import { IdesSelector } from './IdesSelector';
import { WorkspaceTemplatePicker } from './WorkspaceTemplatePicker';
import { InitializeWorkspace } from './InitializeWorkspace';
import { TerminalPreviewDemo } from './TerminalPreviewDemo';
import SpotlightCard from '../reactbits/SpotlightCard';
import CountUp from '../reactbits/CountUp';
import { useAppStore } from '../../stores/appStore';
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
  // Setup motion honours both the app-level "animations" preference and the OS
  // reduced-motion setting, so the preview card and count-ups stay static when
  // either one asks for it.
  const animationsEnabled = useAppStore((state) => state.animationsEnabled);
  const reduceMotion = useReducedMotion();
  const motionEnabled = animationsEnabled && !reduceMotion;
  const installing = useExtensionStore((state) => state.installing);
  const catalog = useExtensionStore((state) => state.catalog);
  const backendReady = useExtensionStore((state) => state.backendReady);
  const selectedExtensionsReady = props.selectedExtensionIds.every((id) => backendReady && catalog.some((extension) => extension.id === id && extension.installedVersion));
  const canOpen = props.isValid && selectedExtensionsReady && installing.length === 0 && !props.isLoading;
  const projectReady = Boolean(props.selectedPath && (props.isExternalMode || props.workspaceName.trim()));
  const showProject = !props.guided || step === 'project';
  const showTools = !props.guided || step === 'tools';
  // Derived values shared by the preview sidebar: how many terminals are claimed
  // by agents and tool CLIs, how many stay plain shells, and what the workspace
  // will be called once it opens (falling back to the folder name).
  const allocated = Object.values(props.agentFleet.allocation).reduce((sum, count) => sum + count, 0);
  const shells = Math.max(0, props.selectedLayout.sessions - allocated);
  const folderName = props.selectedPath.replace(/\\/g, '/').split('/').filter(Boolean).at(-1);
  const launchTitle = props.workspaceName.trim() || folderName || 'Your workspace';
  const selectedTemplate = props.templates.find((template) => template.id === props.selectedTemplateId);
  // Only surface the name error once a folder is chosen — an empty name is not
  // invalid while the user is still filling in the project step.
  const nameError = props.selectedPath ? props.validationErrors.workspaceName : undefined;

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
    <MotionConfig reducedMotion={motionEnabled ? 'user' : 'always'} transition={motionEnabled ? undefined : { duration: 0 }}>
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-5 text-[var(--text-primary)] sm:p-8 [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[var(--accent)] [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[var(--accent)]">
        <header className="mb-9 flex flex-wrap items-end justify-between gap-5 border-b border-[var(--border-primary)] pb-7">
          <div>
            <p className="mb-3 text-xs font-medium text-[var(--text-secondary)]">Workspace setup</p>
            <h1 className="font-[var(--font-display)] text-[clamp(1.75rem,3.4vw,2.75rem)] font-semibold leading-tight tracking-[-0.045em]">Configure workspace</h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--text-secondary)]">Choose a project and the tools you want ready at launch.</p>
          </div>
          {props.guided ? <nav aria-label="Setup steps" className="flex items-center gap-3 text-xs">
            <button type="button" aria-current={step === 'project' ? 'step' : undefined} disabled={props.isLoading} onClick={() => setStep('project')}
              className={`flex items-center gap-2 rounded-md p-2 ${step === 'project' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${step === 'project' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border-primary)]'}`}>{projectReady && step === 'tools' ? <Check size={12} /> : '1'}</span>Project
            </button>
            <span aria-hidden="true" className="h-px w-6 bg-[var(--border-primary)]" />
            <button type="button" aria-current={step === 'tools' ? 'step' : undefined} disabled={!projectReady || props.isLoading} onClick={() => setStep('tools')}
              className={`flex items-center gap-2 rounded-md p-2 disabled:opacity-40 ${step === 'tools' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${step === 'tools' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border-primary)]'}`}>2</span>Tools
            </button>
          </nav> : <span className="flex items-center gap-1.5 pb-1 text-xs text-[var(--text-secondary)]"><FolderSimple size={14} /> Local workspace</span>}
        </header>

        {/* Two-column shell: numbered setup steps on the left, sticky preview +
          launch controls on the right (single column below the lg breakpoint). */}
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
          <div className="min-w-0 space-y-7">
            <section hidden={!showProject} aria-labelledby="workspace-project-heading">
              <div className="mb-5 flex items-start gap-3">
                <span aria-hidden="true" className="pt-0.5 font-mono text-xs text-[var(--text-secondary)]/60">01</span>
                <div><h2 id="workspace-project-heading" className="text-base font-semibold tracking-tight">Project details</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Choose where your workspace lives.</p></div>
              </div>
              <div className="space-y-4">
                <DirectorySelector selectedPath={props.selectedPath} onSelectDirectory={props.onSelectDirectory} onSelectRecentDirectory={props.onSelectRecentDirectory} errorMessage={props.selectedPath ? props.validationErrors.directory : undefined} />
                <div>
                  <label htmlFor="workspace-name" className="mb-2 block text-sm font-medium">Workspace name</label>
                  <input id="workspace-name" type="text" value={props.workspaceName} onChange={(event) => props.onWorkspaceNameChange(event.target.value)}
                    aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'workspace-name-error' : 'workspace-name-hint'}
                    placeholder="e.g. My next project" className="h-11 w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3.5 text-sm placeholder:text-[var(--text-secondary)]/60" />
                  {nameError ? <p id="workspace-name-error" role="alert" className="mt-2 text-xs text-rose-400">{nameError}</p>
                    : <p id="workspace-name-hint" className="mt-2 text-xs text-[var(--text-secondary)]">Filled from your folder. Use a name you'll recognize.</p>}
                </div>
              </div>
            </section>

            <section hidden={!showTools} aria-labelledby="workspace-tools-heading" className={`${showProject ? 'border-t border-[var(--border-primary)] pt-7' : ''} space-y-5`}>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="pt-0.5 font-mono text-xs text-[var(--text-secondary)]/60">02</span>
                <div><h2 id="workspace-tools-heading" className="text-base font-semibold tracking-tight">Build your setup</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Set your layout and choose what runs inside it.</p></div>
              </div>
              {/* The live layout preview lives in the sidebar, so the inline preview is
                disabled here to avoid showing the same mock twice. */}
              <LayoutSelector selectedLayout={props.selectedLayout} onSelectLayout={props.onLayoutSelect} agentFleet={props.agentFleet} showPreview={false} />
              <div className="space-y-4">
                <div className="flex gap-5 border-b border-[var(--border-primary)]" role="group" aria-label="Launch tools">
                  {([{ id: 'agents', label: 'CLI agents' }, { id: 'extensions', label: 'Extensions' }, { id: 'tools', label: 'Tool CLIs' }] as const).map((item) => (
                    <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}
                      className={`relative border-b-2 px-0.5 pb-3 pt-1 text-sm font-medium transition-colors ${tab === item.id ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                      {item.label}{item.id === 'extensions' && props.selectedExtensionIds.length > 0 && <span className="ml-1.5 rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] tabular-nums">{props.selectedExtensionIds.length}</span>}
                    </button>
                  ))}
                </div>
                {/* Agent allocation is pointless with zero terminals, so that case gets an
                editor-first prompt instead. The allocation list is keyed by tab
                to reset its internal scroll/expansion state on switch. */}
                {showTools && (tab === 'extensions'
                  ? <WorkspaceExtensionsConfig selectedIds={props.selectedExtensionIds} onToggle={props.onToggleExtension} />
                  : props.selectedLayout.sessions === 0
                    ? <div className="rounded-lg border border-dashed border-[var(--border-primary)] p-5">
                        <TerminalWindow size={22} className="mb-3 text-[var(--text-secondary)]" />
                        <p className="text-sm font-medium">An editor-first workspace</p>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">Add extensions, or choose a terminal layout to run CLI agents.</p>
                        <button type="button" className="mt-3 text-xs font-medium text-[var(--accent)]" onClick={() => setTab('extensions')}>Explore extensions <span aria-hidden="true">→</span></button>
                      </div>
                    : <AgentFleetConfig key={tab} fleet={props.agentFleet} category={tab} onAllocationChange={props.onAllocationChange} />)}
                {!props.isAllocationValid && <p role="alert" className="text-xs text-rose-400">{props.validationErrors.allocation}</p>}
                {!selectedExtensionsReady && <p role="alert" className="text-xs text-rose-400">Install or deselect unavailable extensions before opening the workspace.</p>}
              </div>
            </section>

            <div className="border-t border-[var(--border-primary)] pt-5">
              <button type="button" aria-expanded={advanced} aria-controls="workspace-more-options" onClick={() => { setAdvanced(!advanced); setAdvancedVisited(true); }}
                className="flex w-full items-center gap-3 rounded-md py-1 text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
                <SlidersHorizontal size={18} className="shrink-0" />
                <span className="flex-1"><span className="block text-sm font-medium">More options</span><span className="mt-1 block text-xs">Templates, project setup & IDEs</span></span>
                <CaretDown size={14} className={`transition-transform ${advanced ? 'rotate-180' : ''}`} />
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
          </div>

          {/* Sticky preview sidebar: mirrors the chosen layout, the launch summary, and
              the primary launch action so it stays visible while scrolling. */}
          <aside aria-label="Workspace preview and launch" className="min-w-0 lg:sticky lg:top-8">
            <SpotlightCard disabled={!motionEnabled} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 sm:p-6">
              <div className="mb-6 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]"><TerminalWindow size={15} /> Workspace preview</span>
                <span className="font-mono text-[10px] text-[var(--text-secondary)]/65">{props.selectedLayout.sessions === 0 ? 'EDITOR' : props.selectedLayout.openExternally ? 'EXTERNAL' : 'GRID'}</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)]"><FolderSimple size={21} weight="duotone" /></div>
                <div className="min-w-0"><h2 className="truncate text-lg font-semibold tracking-tight" title={launchTitle}>{launchTitle}</h2>
                  <p className="mt-1 truncate font-mono text-[10px] text-[var(--text-secondary)]" title={props.selectedPath || undefined}>{props.selectedPath || 'Choose a project folder to begin'}</p></div>
              </div>
              <div className="mt-5"><TerminalPreviewDemo sessions={props.selectedLayout.sessions} agentFleet={props.agentFleet} /></div>
              {/* Animated tallies. Each CountUp keeps an sr-only copy of the value so screen
                readers still announce the number when motion is disabled. */}
              <dl className="mt-5 grid grid-cols-3 divide-x divide-[var(--border-primary)] border-y border-[var(--border-primary)] py-4">
                {([{ label: 'Terminals', count: props.selectedLayout.sessions }, { label: 'Assigned', count: allocated }, { label: 'Extensions', count: props.selectedExtensionIds.length }]).map(({ label, count }) => (
                  <div key={label} className="px-3 first:pl-0 last:pr-0"><dt className="text-[11px] text-[var(--text-secondary)]">{label}</dt><dd className="mt-1.5 text-2xl font-medium leading-none tracking-tight tabular-nums"><span className="sr-only">{count}</span><CountUp to={count} disabled={!motionEnabled} /></dd></div>
                ))}
              </dl>
              <div className="mt-4 flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-secondary)]">Launch mode</span><span>{props.isExternalMode ? 'External terminals' : props.selectedLayout.sessions === 0 ? 'Editor & extensions' : 'In-app terminals'}</span></div>
              {selectedTemplate && <div className="mt-2.5 flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-secondary)]">Template</span><span className="truncate">{selectedTemplate.name}</span></div>}
              <p className="mt-4 text-xs leading-relaxed text-[var(--text-secondary)]" role="status">{props.selectedLayout.sessions === 0 ? 'Your editor opens with the selected extensions.' : `${allocated} assigned ${allocated === 1 ? 'terminal' : 'terminals'} · ${shells} ${shells === 1 ? 'plain shell' : 'plain shells'}`}</p>

              <div className="mt-6 border-t border-[var(--border-primary)] pt-5">
                {props.createError && <p role="alert" className="mb-3 text-xs leading-relaxed text-rose-400">{props.createError}</p>}
                <button type="button" onClick={props.guided && step === 'project' ? () => setStep('tools') : props.onCreateWorkspace}
                  disabled={props.guided && step === 'project' ? !projectReady || props.isLoading : !canOpen}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-[var(--text-primary)] px-4 py-3 text-sm font-semibold text-[var(--bg-primary)] transition-opacity hover:opacity-85 active:opacity-70 disabled:opacity-35">
                  <span>{props.isLoading ? 'Opening…' : props.guided && step === 'project' ? 'Continue to tools' : installing.length > 0 ? 'Installing…' : props.isExternalMode ? 'Open terminals' : 'Open workspace'}</span>
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
                <p className="mt-3 text-center text-[11px] text-[var(--text-secondary)]">{!projectReady ? 'Select a folder and name your workspace.' : props.guided && step === 'project' ? 'Next, choose your layout and launch tools.' : !selectedExtensionsReady ? 'Install selected extensions to continue.' : !props.isAllocationValid ? 'Adjust your terminal allocation to continue.' : 'You can change your setup after opening.'}</p>
                {props.guided && step === 'tools'
                  ? <button type="button" disabled={props.isLoading} onClick={() => setStep('project')} className="mt-4 w-full rounded-md py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Back to project</button>
                  : props.hasOpenWorkspaces && props.onCancel && <button type="button" disabled={props.isLoading} onClick={props.onCancel} className="mt-4 w-full rounded-md py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel and return to workspace</button>}
              </div>
            </SpotlightCard>
          </aside>
        </div>
      </div>
    </MotionConfig>
  );
}
