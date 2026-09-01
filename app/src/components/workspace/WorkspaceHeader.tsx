import React, { useEffect, useState } from 'react';
import {
  BookOpenText,
  Code,
  GearSix,
  GitBranch,
  GlobeSimple,
  Keyboard,
  Minus,
  Plus,
  SidebarSimple,
  Sparkle,
  Square,
  TerminalWindow,
  X,
} from '@phosphor-icons/react';
import { WorkspaceConfig, WorkspaceView } from '../../types';
import { WorkspaceTab } from './WorkspaceTab';
import { ThemeModeToggle } from '../common/ThemeModeToggle';
import { useTitlebarDrag } from '../../hooks/useTitlebarDrag';
import logo from '../../assets/YzPzCodeLogo.png';

interface WorkspaceHeaderProps {
  workspaces: WorkspaceConfig[];
  activeWorkspaceId: string | null;
  sessionsByWorkspace: Record<string, number>;
  onWorkspaceClick: (workspaceId: string) => void;
  onWorkspaceClose: (workspaceId: string) => void;
  onNewWorkspace: () => void;
  onDocsClick: () => void;
  onSettingsClick: () => void;
  isWindows: boolean;
  onMinimizeWindow: () => void;
  onMaximizeWindow: () => void;
  onCloseWindow: () => void;
  onSidebarToggle: () => void;
  onSourceControlToggle: () => void;
  sourceControlOpen: boolean;
  onViewChange: (view: WorkspaceView) => void;
  activeView: WorkspaceView;
}

const SHORTCUTS = [
  { category: 'Terminal', items: [{ keys: ['Ctrl', 'C'], action: 'Copy selection' }, { keys: ['Ctrl', 'V'], action: 'Paste' }, { keys: ['Ctrl', 'F'], action: 'Search in terminal' }, { keys: ['Ctrl', 'L'], action: 'Clear terminal' }, { keys: ['Enter'], action: 'Find next match' }, { keys: ['Shift', 'Enter'], action: 'Find previous match' }, { keys: ['Esc'], action: 'Close search' }] },
  { category: 'Navigation', items: [{ keys: ['Ctrl', 'P'], action: 'Command palette' }, { keys: ['Ctrl', 'Tab'], action: 'Switch workspace tab' }, { keys: ['Ctrl', 'B'], action: 'Toggle sidebar' }, { keys: ['Ctrl', 'E'], action: 'Toggle view' }, { keys: ['Ctrl', 'W'], action: 'Close tab' }] },
  { category: 'Window', items: [{ keys: ['F11'], action: 'Toggle fullscreen' }] },
];

interface ShortcutModalProps {
  onClose: () => void;
}

const ShortcutModal: React.FC<ShortcutModalProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="app-surface app-surface--raised max-h-[70vh] w-full max-w-lg overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-5 py-4">
          <div className="flex items-center gap-3">
            <Keyboard size={18} className="text-[var(--text-secondary)]" aria-hidden="true" />
            <div>
              <h2 className="text-sm">Keyboard shortcuts</h2>
              <p className="text-xs text-[var(--text-secondary)]">Quick reference for the workspace</p>
            </div>
          </div>
          <button type="button" className="app-icon-button" onClick={onClose} title="Close shortcuts"><X size={16} aria-hidden="true" /><span className="sr-only">Close shortcuts</span></button>
        </div>
        <div className="max-h-[calc(70vh-78px)] space-y-5 overflow-y-auto p-5">
          {SHORTCUTS.map((group) => (
            <section key={group.category}>
              <h3 className="mb-2 text-xs font-medium text-[var(--text-secondary)]">{group.category}</h3>
              <div className="divide-y divide-[var(--border-primary)] border-y border-[var(--border-primary)]">
                {group.items.map((shortcut) => (
                  <div key={shortcut.action} className="flex items-center justify-between gap-4 py-2.5 text-xs">
                    <span className="text-[var(--text-primary)]">{shortcut.action}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key) => <kbd key={key} className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">{key}</kbd>)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
};

const viewOptions: Array<{ view: WorkspaceView; label: string; icon: React.ElementType }> = [
  { view: 'terminal', label: 'Terminal', icon: TerminalWindow },
  { view: 'agent', label: 'Agent', icon: Sparkle },
  { view: 'editor', label: 'Code', icon: Code },
  { view: 'browser', label: 'Browser', icon: GlobeSimple },
];

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  workspaces,
  activeWorkspaceId,
  sessionsByWorkspace,
  onWorkspaceClick,
  onWorkspaceClose,
  onNewWorkspace,
  onDocsClick,
  onSettingsClick,
  isWindows,
  onMinimizeWindow,
  onMaximizeWindow,
  onCloseWindow,
  onSidebarToggle,
  onSourceControlToggle,
  sourceControlOpen,
  onViewChange,
  activeView,
}) => {
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);
  const titlebarRef = useTitlebarDrag<HTMLElement>();

  return (
    <>
      <header ref={titlebarRef} className="workspace-chrome app-chrome relative z-[100] h-12 select-none">
        <div className="workspace-chrome__brand flex h-full min-w-0 items-center">
          <div className="workspace-chrome__product flex h-full items-center gap-2 border-r border-[var(--border-primary)] px-3">
            <img src={logo} alt="YzPzCode" className="h-4 w-auto opacity-85" draggable={false} />
            <span className="text-[12px] font-medium tracking-[-0.02em] text-[var(--text-primary)]">YzPzCode</span>
          </div>
          <div className="workspace-chrome__utility-cluster flex items-center gap-0.5 px-1.5">
            <button onClick={onDocsClick} className="workspace-chrome__tool app-icon-button" title="Documentation" type="button"><BookOpenText size={16} aria-hidden="true" /><span className="sr-only">Documentation</span></button>
            <button
              onClick={onSourceControlToggle}
              className={`workspace-chrome__tool app-icon-button ${sourceControlOpen ? 'text-[var(--accent)]' : ''}`}
              title="Toggle Source Control"
              type="button"
            >
              <GitBranch size={16} aria-hidden="true" />
              <span className="sr-only">Toggle Source Control</span>
            </button>
            <button onClick={onSidebarToggle} className="workspace-chrome__tool app-icon-button" title="Toggle sidebar (Ctrl+B)" type="button"><SidebarSimple size={16} aria-hidden="true" /><span className="sr-only">Toggle sidebar</span></button>
          </div>
        </div>

        <nav className="workspace-tabs flex min-w-0 flex-1 items-center overflow-hidden" aria-label="Workspaces">
          <div className="workspace-tabs__scroll flex min-w-0 items-center gap-1 overflow-x-auto px-1.5">
            {workspaces.map((workspace) => (
              <WorkspaceTab key={workspace.id} workspace={workspace} isActive={workspace.id === activeWorkspaceId} sessionsCount={sessionsByWorkspace[workspace.id] || 0} onClick={() => onWorkspaceClick(workspace.id)} onClose={(event) => { event.stopPropagation(); onWorkspaceClose(workspace.id); }} />
            ))}
            <button onClick={onNewWorkspace} className="workspace-tabs__new app-icon-button app-icon-button--compact shrink-0" title="New workspace" aria-label="Create workspace" type="button"><Plus size={14} aria-hidden="true" /><span className="sr-only">New workspace</span></button>
          </div>
        </nav>

        <div className="workspace-chrome__controls flex h-full shrink-0 items-center gap-1 border-l border-[var(--border-primary)] pl-1.5">
          <ThemeModeToggle />
          <button onClick={onSettingsClick} className="workspace-chrome__tool app-icon-button" title="Settings (Ctrl+,)" type="button"><GearSix size={16} aria-hidden="true" /><span className="sr-only">Settings</span></button>
          <button onClick={() => setIsShortcutOpen(true)} className="workspace-chrome__tool app-icon-button" title="Keyboard shortcuts" type="button"><Keyboard size={16} aria-hidden="true" /><span className="sr-only">Keyboard shortcuts</span></button>
          <div className="workspace-view-switcher flex h-7 items-center gap-px rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] p-0.5">
            {viewOptions.map(({ view, label, icon: IconComponent }) => (
              <button key={view} onClick={() => onViewChange(view)} className={`workspace-view-switcher__item flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors cursor-pointer ${activeView === view ? 'is-active bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}`} title={label} type="button">
                <IconComponent size={14} weight="duotone" aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {isWindows && (
            <div className="workspace-window-controls ml-1 flex h-full border-l border-[var(--border-primary)]">
              <button onClick={onMinimizeWindow} className="workspace-window-control grid h-full w-10 place-items-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] cursor-pointer" title="Minimize" type="button"><Minus size={13} aria-hidden="true" /></button>
              <button onClick={onMaximizeWindow} className="workspace-window-control grid h-full w-10 place-items-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] cursor-pointer" title="Maximize" type="button"><Square size={12} aria-hidden="true" /></button>
              <button onClick={onCloseWindow} className="workspace-window-control workspace-window-control--close grid h-full w-12 place-items-center text-[var(--text-secondary)] transition-colors hover:bg-[#c42b1c] hover:text-white cursor-pointer" title="Close" type="button"><X size={14} aria-hidden="true" /></button>
            </div>
          )}
        </div>
      </header>
      {isShortcutOpen && <ShortcutModal onClose={() => setIsShortcutOpen(false)} />}
    </>
  );
};
