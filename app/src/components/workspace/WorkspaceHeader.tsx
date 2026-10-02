import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpenText,
  Code,
  GearSix,
  GitBranch,
  GlobeSimple,
  Keyboard,
  Plus,
  SidebarSimple,
  Sparkle,
  TerminalWindow,
  X,
} from '@phosphor-icons/react';
import type { WorkspaceConfig, WorkspaceView } from '../../types';
import { WorkspaceTab } from './WorkspaceTab';
import { ThemeModeToggle } from '../common/ThemeModeToggle';
import { WindowControls } from '../common/WindowControls';
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
  onExplorerClick: () => void;
  onSourceControlClick: () => void;
  explorerOpen: boolean;
  sourceControlOpen: boolean;
  sourceControlChangeCount: number;
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
  onExplorerClick,
  onSourceControlClick,
  explorerOpen,
  sourceControlOpen,
  sourceControlChangeCount,
  onViewChange,
  activeView,
}) => {
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);
  const titlebarRef = useTitlebarDrag<HTMLElement>();
  const viewButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeViewIndex = viewOptions.findIndex((option) => option.view === activeView);

  const handleViewKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const focusedIndex = viewButtonRefs.current.findIndex((button) => button === event.target);
    if (focusedIndex < 0) return;
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight': nextIndex = (focusedIndex + 1) % viewOptions.length; break;
      case 'ArrowLeft': nextIndex = (focusedIndex - 1 + viewOptions.length) % viewOptions.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = viewOptions.length - 1; break;
      default: return;
    }
    event.preventDefault();
    viewButtonRefs.current[nextIndex]?.focus();
    onViewChange(viewOptions[nextIndex].view);
  };

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
              onClick={onSourceControlClick}
              className={`workspace-chrome__tool app-icon-button relative ${sourceControlOpen ? 'text-[var(--accent)]' : ''}`}
              title={sourceControlChangeCount > 0 ? `Source Control — ${sourceControlChangeCount} changed file${sourceControlChangeCount === 1 ? '' : 's'}` : 'Source Control'}
              aria-label={sourceControlChangeCount > 0 ? `Source Control, ${sourceControlChangeCount} changed file${sourceControlChangeCount === 1 ? '' : 's'}` : 'Source Control'}
              aria-pressed={sourceControlOpen}
              type="button"
            >
              <GitBranch size={16} aria-hidden="true" />
              {sourceControlChangeCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-[var(--bg-secondary)] bg-[var(--accent)] px-0.5 font-mono text-[8px] font-bold leading-none text-[var(--text-primary)] tabular-nums">
                  {sourceControlChangeCount > 99 ? '99+' : sourceControlChangeCount}
                </span>
              )}
              <span className="sr-only">Source Control</span>
            </button>
            <button
              onClick={onExplorerClick}
              className={`workspace-chrome__tool app-icon-button ${explorerOpen ? 'text-[var(--accent)]' : ''}`}
              title="Explorer"
              aria-label="Explorer"
              aria-pressed={explorerOpen}
              type="button"
            >
              <SidebarSimple size={16} aria-hidden="true" />
              <span className="sr-only">Explorer</span>
            </button>
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
          <div
            className="workspace-view-switcher flex shrink-0 items-center"
            role="tablist"
            aria-label="Workspace views"
            style={{ '--active-view-index': activeViewIndex } as React.CSSProperties}
            onKeyDown={handleViewKeyDown}
            onPointerMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              event.currentTarget.style.setProperty('--glass-pointer-x', `${event.clientX - bounds.left}px`);
              event.currentTarget.style.setProperty('--glass-pointer-y', `${event.clientY - bounds.top}px`);
            }}
          >
            <div className="workspace-view-switcher__lens" aria-hidden="true" />
            {viewOptions.map(({ view, label, icon: IconComponent }, index) => {
              const isActive = activeView === view;
              return (
                <button
                  key={view}
                  ref={(button) => { viewButtonRefs.current[index] = button; }}
                  onClick={() => onViewChange(view)}
                  className={`workspace-view-switcher__item inline-flex shrink-0 items-center justify-center ${isActive ? 'is-active' : ''}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={label}
                  title={label}
                  type="button"
                >
                  {isActive && (
                    <motion.div
                      layoutId="workspace-view-active-pill"
                      className="workspace-view-switcher__active-pill"
                      transition={{ type: 'spring', bounce: 0.16, duration: 0.32 }}
                    />
                  )}
                  <span className="workspace-view-switcher__content inline-flex shrink-0 items-center">
                    <IconComponent
                      size={13.5}
                      weight={isActive ? 'fill' : 'regular'}
                      className="workspace-view-switcher__icon shrink-0"
                      aria-hidden="true"
                    />
                    <span className="workspace-view-switcher__label shrink-0 whitespace-nowrap">{label}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {isWindows && (
            <WindowControls
              onMinimize={onMinimizeWindow}
              onMaximize={onMaximizeWindow}
              onClose={onCloseWindow}
            />
          )}
        </div>
      </header>
      {isShortcutOpen && <ShortcutModal onClose={() => setIsShortcutOpen(false)} />}
    </>
  );
};
