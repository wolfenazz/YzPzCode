import { useRef } from 'react';
import { DotsSixVertical, SidebarSimple, X } from '@phosphor-icons/react';
import { useSortable } from '@dnd-kit/sortable';
import { useAppStore } from '../../stores/appStore';
import { useExtensionStore } from '../../stores/extensionStore';
import { useExtensionPanelHost } from '../../hooks/useExtensionPanelHost';
import { ExtensionLogo } from '../common/ExtensionLogo';
import { PaneMaximizeButton, TerminalLayoutPicker } from './TerminalLayoutPicker';
import { AgentActivityAura, AgentActivityChip } from './AgentActivityIndicator';
import { ExtensionPromptNotice } from './ExtensionPromptNotice';
import type { WorkspaceConfig, WorkspaceExtensionPanel } from '../../types';

interface ExtensionPaneProps {
  panel: WorkspaceExtensionPanel;
  workspace: WorkspaceConfig;
  visible: boolean;
  suspended: boolean;
}

export function ExtensionPane({ panel, workspace, visible, suspended }: ExtensionPaneProps): React.JSX.Element {
  const activityGlowEnabled = useAppStore((state) => state.agentActivityGlowEnabled);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const movePanel = useExtensionStore((state) => state.movePanel);
  const contentRef = useRef<HTMLDivElement>(null);
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: panel.id });
  const { ready, error, closing, activity, retry, close } = useExtensionPanelHost({
    panel, workspace, contentRef, active: visible, hidden: suspended || isDragging,
  });

  const showActivity = activityGlowEnabled && activity.phase !== 'idle';

  const moveToSidePanel = (): void => {
    movePanel(panel.id, 'side');
    setActiveView('editor');
  };

  return (
    <section ref={setNodeRef} className={`ext-pane app-surface flex h-full min-h-0 flex-col overflow-hidden border border-[var(--border-primary)] bg-[var(--bg-primary)] ${isDragging ? 'opacity-40' : ''}${showActivity ? ` term-pane--${activity.phase}` : ''}`} aria-label={`${panel.name} extension panel`}>
      <header className="ext-header flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2">
        <button type="button" {...attributes} {...listeners} className="app-icon-button app-icon-button--compact cursor-grab" aria-label={`Move ${panel.name} panel`}><DotsSixVertical size={14} /></button>
        <ExtensionLogo extensionId={panel.extensionId} name={panel.name} small />
        <span className="min-w-0 truncate text-xs font-medium">{panel.name}</span>
        {activityGlowEnabled && <AgentActivityChip activity={activity} />}
        <ExtensionPromptNotice panelId={panel.id} />
        <span className="flex-1" aria-hidden="true" />
        <span className="text-[9px] text-[var(--text-secondary)]">Extension</span>
        <button type="button" className="app-icon-button app-icon-button--compact" onClick={moveToSidePanel} disabled={closing} aria-label={`Move ${panel.name} to the editor side panel`} title="Move to editor side panel"><SidebarSimple size={14} mirrored /></button>
        <TerminalLayoutPicker panelId={panel.id} panelName={panel.name} />
        <PaneMaximizeButton panelId={panel.id} panelName={panel.name} />
        <button type="button" className="app-icon-button app-icon-button--compact" onClick={() => void close()} disabled={closing} aria-label={`Close ${panel.name}`} title={`Close ${panel.name}`}><X size={14} /></button>
      </header>
      {/* The 2px rim keeps the activity ring visible around the native webview. */}
      <div ref={contentRef} className="relative mx-[2px] mb-[2px] min-h-0 flex-1 overflow-hidden">
        {error ? <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center"><p role="alert" className="max-w-sm break-words text-xs leading-5 text-rose-500">{error}</p><button type="button" className="app-button" onClick={retry}>Retry opening</button></div> : !ready ? <p role="status" className="flex h-full items-center justify-center p-4 text-xs text-[var(--text-secondary)]">Starting {panel.name} extension…</p> : null}
      </div>
      {activityGlowEnabled && <AgentActivityAura activity={activity} />}
    </section>
  );
}
