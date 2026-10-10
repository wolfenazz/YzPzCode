import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CaretDown, Check, Code, Feather, PresentationChart, PuzzlePiece, TerminalWindow, WarningCircle } from '@phosphor-icons/react';
import { DirectorySelector } from './DirectorySelector';
import { LayoutSelector } from './LayoutSelector';
import { AgentFleetConfig } from './AgentFleetConfig';
import { WorkspaceExtensionsConfig } from './WorkspaceExtensionsConfig';
import { IdesSelector } from './IdesSelector';
import { WorkspaceTemplatePicker } from './WorkspaceTemplatePicker';
import { InitializeWorkspace } from './InitializeWorkspace';
import { WorkspacePreview } from './WorkspacePreview';
import { WritingSetupSection } from './WritingSetupSection';
import { PresentationSetupSection } from './PresentationSetupSection';
import RubberSegment from '../reactbits/RubberSegment';
import { useWritingStore } from '../../stores/writingStore';
import { usePresentationStore } from '../../stores/presentationStore';
import { AGENT_IDS, cliMeta, slotAssignments } from './cliCatalog';
import { MOD_KEY, SETUP_EASE, useSetupMotion } from './useSetupMotion';
import SpotlightCard from '../reactbits/SpotlightCard';
import CountUp from '../reactbits/CountUp';
import { useAppStore } from '../../stores/appStore';
import { useExtensionStore } from '../../stores/extensionStore';
import { IDE_DISPLAY_NAMES } from './ideConstants';
import type { LayoutConfig, AgentFleet, ExtensionInstallProgress, WorkspaceKind } from '../../types';
import type { WorkspaceTemplate } from '../../hooks/useWorkspace';
import './setup.css';

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
  workspaceKind: WorkspaceKind;
  onWorkspaceKindChange: (kind: WorkspaceKind) => void;
}

type SectionState = 'done' | 'active' | 'todo';
type Tab = 'agents' | 'tools' | 'extensions';

function Section({ number, state, title, description, meta, last, children }: {
  number: number; state: SectionState; title: string; description: string; meta?: ReactNode; last?: boolean; children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="ws-section" aria-label={title} data-last={last || undefined}>
      <div className="ws-rail" aria-hidden="true">
        <motion.span className="ws-rail__fill" initial={false} animate={{ scaleY: state === 'done' ? 1 : 0 }} transition={{ duration: 0.5, ease: SETUP_EASE }} />
        <span className="ws-rail__dot" data-state={state}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={state === 'done' ? 'done' : 'num'} className="flex" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}>
              {state === 'done' ? <Check size={13} weight="bold" /> : number}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
      <div className="min-w-0">
        <div className="ws-section__head">
          <div className="min-w-0">
            <h2 className="ws-section__title">{title}</h2>
            <p className="ws-section__desc">{description}</p>
          </div>
          {meta && <div className="ws-section__meta">{meta}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

function SlotMeter({ sessions, fleet }: { sessions: number; fleet: AgentFleet }): React.JSX.Element {
  const slots = slotAssignments(sessions, fleet);
  const assigned = slots.filter(Boolean).length;
  return (
    <div className="ws-meter">
      <div className="ws-meter__track" aria-hidden="true">
        {slots.map((cli, index) => (
          <span key={index} className="ws-meter__slot" title={cli ? cliMeta(cli).label : 'Plain shell'}>
            <motion.span className="ws-meter__fill" initial={false} style={{ background: cli ? cliMeta(cli).color : 'transparent', transformOrigin: 'left' }}
              animate={{ scaleX: cli ? 1 : 0 }} transition={{ duration: 0.32, ease: SETUP_EASE }} />
          </span>
        ))}
      </div>
      <span className="ws-meter__text" role="status">
        <strong>{assigned}</strong> of {sessions} assigned{sessions - assigned > 0 ? ` · ${sessions - assigned} plain shell${sessions - assigned === 1 ? '' : 's'}` : ''}
      </span>
    </div>
  );
}

export function WorkspaceConfigForm(props: WorkspaceConfigFormProps): React.JSX.Element {
  const motionEnabled = useSetupMotion();
  const [step, setStep] = useState<'project' | 'setup'>('project');
  const [tab, setTab] = useState<Tab>('agents');
  const [moreOpen, setMoreOpen] = useState(false);
  const installing = useExtensionStore((state) => state.installing);
  const catalog = useExtensionStore((state) => state.catalog);
  const backendReady = useExtensionStore((state) => state.backendReady);
  const selectedIdes = useAppStore((state) => state.selectedIdes);
  const ideStatuses = useAppStore((state) => state.ideStatuses);
  const writing = props.workspaceKind === 'writing';
  const presenting = props.workspaceKind === 'presentation';
  // Writing and presentation studios have no terminals, extensions or IDEs.
  const studio = writing || presenting;
  const writerEngine = useWritingStore((state) => state.defaultEngine.engine);
  const writerProfile = useWritingStore((state) => state.profiles.find((profile) => profile.id === state.defaultProfileId)?.name);
  const presenterEngine = usePresentationStore((state) => state.defaultEngine.engine);

  const sessions = props.selectedLayout.sessions;
  const selectedExtensionsReady = studio || props.selectedExtensionIds.every((id) => backendReady && catalog.some((extension) => extension.id === id && extension.installedVersion));
  const canOpen = props.isValid && selectedExtensionsReady && (studio || installing.length === 0) && !props.isLoading;
  const projectReady = Boolean(props.selectedPath && ((!studio && props.isExternalMode) || props.workspaceName.trim()));
  const showProject = !props.guided || step === 'project';
  const showSetup = !props.guided || step === 'setup';
  const continuing = Boolean(props.guided && step === 'project');
  const allocated = Object.values(props.agentFleet.allocation).reduce((sum, count) => sum + count, 0);
  const folderName = props.selectedPath.replace(/\\/g, '/').split('/').filter(Boolean).at(-1);
  const launchTitle = props.workspaceName.trim() || folderName || 'New workspace';
  const selectedTemplate = props.templates.find((template) => template.id === props.selectedTemplateId);
  const extensionNames = props.selectedExtensionIds.map((id) => catalog.find((extension) => extension.id === id)?.name ?? id);
  const launchIdes = selectedIdes.filter((ide) => ideStatuses[ide]?.installed !== false);
  // Only surface the name error once a folder is chosen: an empty name is not
  // invalid while the user is still picking a project.
  const nameError = props.selectedPath ? props.validationErrors.workspaceName : undefined;
  const fleetReady = props.isAllocationValid && selectedExtensionsReady;
  const externalAvailable = sessions > 0 && props.selectedExtensionIds.length === 0;

  const blocker = !props.selectedPath ? 'Choose a project folder to continue.'
    : !projectReady ? 'Give your workspace a name.'
      : continuing ? null
        : !props.isAllocationValid ? (props.validationErrors.allocation || 'Adjust the terminal assignments.')
          : !studio && installing.length > 0 ? 'Waiting for extensions to finish installing…'
            : !selectedExtensionsReady ? 'Install or deselect unavailable extensions.'
              : null;
  const primaryEnabled = continuing ? projectReady && !props.isLoading : canOpen;
  const primaryLabel = props.isLoading ? 'Opening workspace' : continuing ? 'Continue' : writing ? 'Open writing studio' : presenting ? 'Open presentation studio' : props.isExternalMode ? 'Open terminals' : 'Open workspace';

  const primaryAction = (): void => {
    if (!primaryEnabled) return;
    if (continuing) setStep('setup');
    else props.onCreateWorkspace();
  };

  // Keyboard: Ctrl/⌘+Enter launches (or continues), Ctrl/⌘+O picks a folder.
  const shortcuts = useRef({ primaryAction, selectDirectory: props.onSelectDirectory });
  shortcuts.current = { primaryAction, selectDirectory: props.onSelectDirectory };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === 'Enter') { event.preventDefault(); shortcuts.current.primaryAction(); }
      else if (event.key.toLowerCase() === 'o') { event.preventDefault(); shortcuts.current.selectDirectory(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  const states: Record<'project' | 'layout' | 'fleet', SectionState> = {
    project: projectReady ? 'done' : 'active',
    layout: projectReady ? 'done' : 'todo',
    fleet: projectReady && fleetReady ? 'done' : projectReady ? 'active' : 'todo',
  };

  const agentCount = AGENT_IDS.reduce((sum, cli) => sum + (props.agentFleet.allocation[cli] ?? 0), 0);
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'agents', label: 'Agents', count: agentCount },
    { id: 'tools', label: 'Tool CLIs', count: allocated - agentCount },
    { id: 'extensions', label: 'Extensions', count: props.selectedExtensionIds.length },
  ];

  const stagger = (index: number) => ({
    initial: motionEnabled ? { opacity: 0, y: 12 } : false,
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease: SETUP_EASE, delay: motionEnabled ? 0.06 * index : 0 },
  });

  return (
    <MotionConfig reducedMotion={motionEnabled ? 'user' : 'always'}>
      <div className="ws">
        <motion.header className="ws-hero" {...stagger(0)}>
          <div>
            <div className="ws-eyebrow"><span className="ws-eyebrow__dot" />New workspace</div>
            <h1 className="ws-title">{writing ? 'Set up your writing studio' : presenting ? 'Set up your presentation studio' : 'Set up your workspace'}</h1>
            <p className="ws-subtitle">
              {writing
                ? 'Pick a folder for your reports and the AI that writes them. Every report gets its own brief, house style and outline.'
                : presenting
                  ? 'Pick a folder for your decks and the AI that designs them. Describe a deck and the AI invents its look, then draws every slide with speaker notes.'
                  : 'Pick a project, arrange your terminals, and choose which agents start in them. Everything can be changed after it opens.'}
            </p>
            <div className="ws-mode">
              <RubberSegment
                size="md"
                aria-label="Workspace mode"
                items={[
                  { value: 'coding', label: 'Coding', icon: <Code size={15} weight="bold" /> },
                  { value: 'writing', label: 'Writing', icon: <Feather size={15} weight="fill" /> },
                  { value: 'presentation', label: 'Presentation', icon: <PresentationChart size={15} weight="fill" /> },
                ]}
                value={props.workspaceKind}
                onChange={(value) => props.onWorkspaceKindChange(value as WorkspaceKind)}
                trackColor="color-mix(in srgb, var(--text-primary) 7%, transparent)"
                thumbColor="var(--text-primary)"
                textColor="var(--text-secondary)"
                activeTextColor="var(--bg-primary)"
                disabled={props.isLoading}
              />
              <span className="ws-mode__hint">
                {writing
                  ? 'AI-written professional reports: academic, financial, technical and more, with Word-like editing and PDF / Word export.'
                  : presenting
                    ? 'AI-built slide decks in designed themes, plus editing of existing PowerPoint files, with PowerPoint / PDF export.'
                    : 'Terminals with AI coding agents, an editor, a browser and extensions.'}
              </span>
            </div>
          </div>
          {props.guided ? (
            <nav className="ws-steps" aria-label="Setup steps">
              {([{ id: 'project', label: 'Project' }, { id: 'setup', label: writing ? 'Writing setup' : presenting ? 'Presentation setup' : 'Layout & agents' }] as const).map((item, index) => (
                <button key={item.id} type="button" className="ws-steps__item" aria-current={step === item.id ? 'step' : undefined}
                  disabled={props.isLoading || (item.id === 'setup' && !projectReady)} onClick={() => setStep(item.id)}>
                  {step === item.id && <motion.span layoutId="ws-step-pill" className="ws-steps__pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                  <span className="ws-steps__num">{item.id === 'project' && projectReady && step === 'setup' ? <Check size={10} weight="bold" /> : index + 1}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          ) : (
            <div className="ws-hints" aria-hidden="true">
              <span><span className="ws-kbd">{MOD_KEY}</span><span className="ws-kbd">O</span> Choose folder</span>
              <span><span className="ws-kbd">{MOD_KEY}</span><span className="ws-kbd">↵</span> Open</span>
            </div>
          )}
        </motion.header>

        <div className="ws-layout">
          <motion.div className="min-w-0" {...stagger(1)}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={props.guided ? step : 'all'}
                initial={motionEnabled ? { opacity: 0, x: step === 'setup' ? 16 : -16 } : false}
                animate={{ opacity: 1, x: 0 }}
                exit={motionEnabled ? { opacity: 0, x: step === 'setup' ? -16 : 16 } : undefined}
                transition={{ duration: 0.26, ease: SETUP_EASE }}>
                {showProject && (
                  <Section number={1} state={states.project} title={studio ? 'Folder' : 'Project'} description={writing ? 'Reports are saved in a Reports folder inside it, with their images and exports.' : presenting ? 'Decks are saved in a Presentations folder inside it, with their images and exports.' : 'The folder your terminals, agents, and editor open in.'}>
                    <DirectorySelector selectedPath={props.selectedPath} onSelectDirectory={props.onSelectDirectory} onSelectRecentDirectory={props.onSelectRecentDirectory}
                      errorMessage={props.selectedPath ? props.validationErrors.directory : undefined} />
                    <AnimatePresence initial={false}>
                      {props.selectedPath && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: SETUP_EASE }} className="overflow-hidden">
                          <div className="pt-5">
                            <label htmlFor="workspace-name" className="ws-label">Workspace name</label>
                            <input id="workspace-name" className="ws-input" type="text" value={props.workspaceName} onChange={(event) => props.onWorkspaceNameChange(event.target.value)}
                              aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'workspace-name-error' : 'workspace-name-hint'} placeholder={folderName || 'My project'} />
                            {nameError
                              ? <p id="workspace-name-error" role="alert" className="ws-error"><WarningCircle size={14} />{nameError}</p>
                              : <p id="workspace-name-hint" className="ws-help">Shown on the workspace tab. Defaults to the folder name.</p>}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Section>
                )}

                {showSetup && writing && (
                  <Section number={2} last state={projectReady ? 'done' : 'todo'} title="Writer" description="The AI that drafts your reports, and how a new report begins.">
                    <WritingSetupSection />
                  </Section>
                )}

                {showSetup && presenting && (
                  <Section number={2} last state={projectReady ? 'done' : 'todo'} title="Presenter" description="The AI that builds your decks, and how a new one starts.">
                    <PresentationSetupSection />
                  </Section>
                )}

                {showSetup && !studio && (
                  <>
                    <Section number={2} state={states.layout} title="Layout" description="Start from a preset or choose how many terminals open."
                      meta={selectedTemplate ? <span title="Active preset">{selectedTemplate.name}</span> : undefined}>
                      <WorkspaceTemplatePicker selectedTemplateId={props.selectedTemplateId} templates={props.templates} onSelectTemplate={props.onTemplateSelect}
                        onReapplyTemplate={props.onReapplyTemplate} onDeleteTemplate={props.onDeleteTemplate} onSaveCustomTemplate={props.onSaveCustomTemplate}
                        onUpdateTemplate={props.onUpdateTemplate} onRestoreDefaults={props.onRestoreDefaults} />
                      <LayoutSelector selectedLayout={props.selectedLayout} onSelectLayout={props.onLayoutSelect} />
                      <AnimatePresence initial={false}>
                        {sessions > 0 && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.26, ease: SETUP_EASE }} className="overflow-hidden">
                            <div className="ws-switch-row" data-disabled={!externalAvailable}>
                              <div>
                                <div className="ws-switch-row__title" id="ws-external-label">Open in separate windows</div>
                                <div className="ws-switch-row__desc">{externalAvailable ? 'Launch each terminal as its own OS window, tiled across the screen.' : 'Not available while workspace extensions are selected.'}</div>
                              </div>
                              <button type="button" role="switch" className="ws-switch" aria-labelledby="ws-external-label" aria-checked={Boolean(props.selectedLayout.openExternally)}
                                disabled={!externalAvailable} onClick={() => props.onLayoutSelect({ ...props.selectedLayout, openExternally: !props.selectedLayout.openExternally })} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Section>

                    <Section number={3} last state={states.fleet} title="Agents & tools" description="Assign agents and tool CLIs to terminals, or add editor extensions."
                      meta={sessions > 0 ? `${allocated}/${sessions} terminals` : undefined}>
                      {sessions > 0 && tab !== 'extensions' && <SlotMeter sessions={sessions} fleet={props.agentFleet} />}
                      <LayoutGroup id="ws-tabs">
                        <div className="ws-tabs" role="tablist" aria-label="Launch tools">
                          {tabs.map((item) => (
                            <button key={item.id} type="button" role="tab" id={`ws-tab-${item.id}`} aria-controls="ws-tabpanel" aria-selected={tab === item.id} className="ws-tab" onClick={() => setTab(item.id)}>
                              {item.label}
                              {item.count > 0 && <span className="ws-count">{item.count}</span>}
                              {tab === item.id && <motion.span layoutId="ws-tab-line" className="ws-tab__line" transition={{ type: 'spring', stiffness: 520, damping: 42 }} />}
                            </button>
                          ))}
                        </div>
                      </LayoutGroup>
                      <div id="ws-tabpanel" role="tabpanel" aria-labelledby={`ws-tab-${tab}`}>
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.div key={tab} initial={motionEnabled ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} exit={motionEnabled ? { opacity: 0, y: -6 } : undefined}
                            transition={{ duration: 0.18, ease: SETUP_EASE }}>
                            {tab === 'extensions'
                              ? <WorkspaceExtensionsConfig selectedIds={props.selectedExtensionIds} onToggle={props.onToggleExtension} />
                              : sessions === 0
                                ? (
                                  <div className="ws-callout">
                                    <span className="ws-row__logo"><Code size={16} /></span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[0.8125rem] font-medium">This is an editor-only workspace</p>
                                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">Agents and tool CLIs run in terminals. Add a terminal to assign one, or open extensions in the editor instead.</p>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button type="button" className="ws-btn ws-btn--sm" onClick={() => props.onLayoutSelect({ type: 'grid', sessions: 1 })}><TerminalWindow size={13} />Add a terminal</button>
                                        <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={() => setTab('extensions')}><PuzzlePiece size={13} />Browse extensions</button>
                                      </div>
                                    </div>
                                  </div>
                                )
                                : <AgentFleetConfig fleet={props.agentFleet} category={tab} onAllocationChange={props.onAllocationChange} />}
                          </motion.div>
                        </AnimatePresence>
                        {!props.isAllocationValid && props.validationErrors.allocation && <p role="alert" className="ws-error"><WarningCircle size={14} />{props.validationErrors.allocation}</p>}
                        {!selectedExtensionsReady && <p role="alert" className="ws-error"><WarningCircle size={14} />Install or deselect unavailable extensions before opening the workspace.</p>}
                      </div>
                    </Section>

                    <div className="ws-more">
                      <button type="button" className="ws-more__toggle" aria-expanded={moreOpen} aria-controls="ws-more-options" onClick={() => setMoreOpen((open) => !open)}>
                        <span className="min-w-0 flex-1"><strong>More options</strong><span>Open in your editors and scaffold a new project</span></span>
                        <motion.span animate={{ rotate: moreOpen ? 180 : 0 }} transition={{ duration: 0.25, ease: SETUP_EASE }} className="flex"><CaretDown size={14} /></motion.span>
                      </button>
                      <AnimatePresence initial={false}>
                        {moreOpen && (
                          <motion.div id="ws-more-options" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.32, ease: SETUP_EASE }} className="overflow-hidden">
                            <div className="pb-2">
                              <div className="ws-subsection">
                                <div className="ws-subsection__head"><div><div className="ws-subsection__title">Also open in</div><div className="ws-subsection__desc">Launch these editors on the project when the workspace opens.</div></div></div>
                                <IdesSelector />
                              </div>
                              <div className="ws-subsection">
                                <div className="ws-subsection__head"><div><div className="ws-subsection__title">Scaffold a new project</div><div className="ws-subsection__desc">Run a starter template inside the project folder before you open it.</div></div></div>
                                <InitializeWorkspace selectedPath={props.selectedPath} />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* Sticky preview: mirrors every choice live and holds the launch action. */}
          <motion.aside className="ws-aside min-w-0" aria-label="Workspace preview and launch" {...stagger(2)}>
            <SpotlightCard disabled={!motionEnabled} className="ws-panel">
              <div className="ws-panel__section">
                <WorkspacePreview title={launchTitle} folderName={folderName} sessions={sessions} agentFleet={props.agentFleet}
                  extensionNames={extensionNames} external={props.isExternalMode} kind={props.workspaceKind} />
              </div>
              {!studio && <div className="ws-panel__section">
                <dl className="ws-stats">
                  {[{ label: 'Terminals', count: sessions }, { label: 'Assigned', count: allocated }, { label: 'Extensions', count: props.selectedExtensionIds.length }].map(({ label, count }) => (
                    <div key={label}><dt>{label}</dt><dd><span className="sr-only">{count}</span><CountUp to={count} disabled={!motionEnabled} /></dd></div>
                  ))}
                </dl>
              </div>}
              <div className="ws-panel__section">
                <dl className="ws-summary">
                  <div className="ws-summary__row"><dt>Folder</dt><dd className="font-mono text-xs" title={props.selectedPath || undefined}>{folderName ?? '—'}</dd></div>
                  <div className="ws-summary__row"><dt>Opens as</dt><dd>{writing ? 'Writing studio' : presenting ? 'Presentation studio' : sessions === 0 ? 'Editor' : props.isExternalMode ? 'Separate windows' : 'Terminal grid'}</dd></div>
                  {writing && <div className="ws-summary__row"><dt>Writer</dt><dd>{cliMeta(writerEngine)?.label ?? writerEngine}</dd></div>}
                  {writing && <div className="ws-summary__row"><dt>Profile</dt><dd>{writerProfile ?? 'Chosen per report'}</dd></div>}
                  {presenting && <div className="ws-summary__row"><dt>Presenter AI</dt><dd>{cliMeta(presenterEngine)?.label ?? presenterEngine}</dd></div>}
                  {presenting && <div className="ws-summary__row"><dt>Design</dt><dd>Invented per deck</dd></div>}
                  {!studio && selectedTemplate && <div className="ws-summary__row"><dt>Preset</dt><dd>{selectedTemplate.name}</dd></div>}
                  {!studio && launchIdes.length > 0 && <div className="ws-summary__row"><dt>Also opens</dt><dd title={launchIdes.map((ide) => IDE_DISPLAY_NAMES[ide]).join(', ')}>{launchIdes.map((ide) => IDE_DISPLAY_NAMES[ide]).join(', ')}</dd></div>}
                </dl>
              </div>
              <div className="ws-panel__section">
                <AnimatePresence>
                  {props.createError && (
                    <motion.p role="alert" className="ws-error ws-error--block" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <WarningCircle size={14} className="shrink-0" />{props.createError}
                    </motion.p>
                  )}
                </AnimatePresence>
                <button type="button" className="ws-launch" onClick={primaryAction} disabled={!primaryEnabled} aria-keyshortcuts="Control+Enter Meta+Enter">
                  <span className="flex items-center gap-2.5">
                    {props.isLoading && <span className="ws-spinner" />}
                    {primaryLabel}
                  </span>
                  {!props.isLoading && <span className="ws-launch__kbd">{MOD_KEY} ↵</span>}
                  <span className="ws-launch__arrow"><ArrowRight size={16} weight="bold" /></span>
                </button>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p key={blocker ?? (continuing ? 'continue' : 'ready')} className="ws-blocker" role="status"
                    initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.18 }}>
                    {blocker ?? (continuing ? (studio ? 'Next, choose the AI and how new work starts.' : 'Next, choose a layout and your agents.') : 'Ready when you are.')}
                  </motion.p>
                </AnimatePresence>
                {props.guided && step === 'setup'
                  ? <div className="mt-3 text-center"><button type="button" className="ws-link inline-flex items-center gap-1" disabled={props.isLoading} onClick={() => setStep('project')}><ArrowLeft size={12} />Back to project</button></div>
                  : props.hasOpenWorkspaces && props.onCancel && <div className="mt-3 text-center"><button type="button" className="ws-link" disabled={props.isLoading} onClick={props.onCancel}>Cancel and return to workspace</button></div>}
              </div>
            </SpotlightCard>
          </motion.aside>
        </div>
      </div>
    </MotionConfig>
  );
}
