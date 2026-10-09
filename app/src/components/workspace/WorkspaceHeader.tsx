import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '@iconify/react';
import {
  BookOpenText,
  GearSix,
  GitBranch,
  Keyboard,
  Plus,
  PuzzlePiece,
  SidebarSimple,
  X,
} from '@phosphor-icons/react';
import type { WorkspaceConfig, WorkspaceKind, WorkspaceView } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { WorkspaceTab } from './WorkspaceTab';
import { DevicePanelToggle } from './device/DevicePanel';
import { viewIconName } from './viewIcons';
import { ChromeBrand, ChromeButton, ChromeDivider } from '../common/ChromeParts';
import { ThemeModeToggle } from '../common/ThemeModeToggle';
import { WindowControls } from '../common/WindowControls';
import { useTitlebarDrag } from '../../hooks/useTitlebarDrag';

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
  onExtensionsClick: () => void;
  extensionsOpen: boolean;
  onSourceControlClick: () => void;
  explorerOpen: boolean;
  sourceControlOpen: boolean;
  sourceControlChangeCount: number;
  onViewChange: (view: WorkspaceView) => void;
  activeView: WorkspaceView;
}

const SHORTCUTS = [
  { category: 'Terminal', items: [{ keys: ['Ctrl', 'C'], action: 'Copy selection' }, { keys: ['Ctrl', 'V'], action: 'Paste' }, { keys: ['Ctrl', 'F'], action: 'Search in terminal' }, { keys: ['Ctrl', 'L'], action: 'Clear terminal' }, { keys: ['Enter'], action: 'Find next match' }, { keys: ['Shift', 'Enter'], action: 'Find previous match' }, { keys: ['Esc'], action: 'Close search' }] },
  { category: 'Navigation', items: [{ keys: ['Ctrl', 'P'], action: 'Command palette' }, { keys: ['Ctrl', 'Tab'], action: 'Switch workspace tab' }, { keys: ['Ctrl', 'B'], action: 'Toggle sidebar' }, { keys: ['Ctrl', 'E'], action: 'Toggle view' }, { keys: ['Ctrl', 'Shift', 'E'], action: 'Export report (Writing)' }, { keys: ['Ctrl', 'W'], action: 'Close tab' }] },
  { category: 'Device', items: [{ keys: ['Ctrl', 'Alt', 'M'], action: 'Show or hide the device (Android emulator / iOS simulator)' }] },
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
      <section role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="app-surface app-surface--raised flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
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
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
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

type ViewOption = { view: WorkspaceView; label: string };

const CODING_VIEWS: ViewOption[] = [
  { view: 'terminal', label: 'Terminal' },
  { view: 'extensions', label: 'Extensions' },
  { view: 'editor', label: 'Code' },
  { view: 'browser', label: 'Browser' },
];

/** Writing workspaces only show a terminal once one has been opened in them. */
export const getViewOptions = (kind: WorkspaceKind | undefined, sessionCount: number): ViewOption[] => {
  if (kind !== 'writing') return CODING_VIEWS;
  const views: ViewOption[] = [
    { view: 'writing', label: 'Write' },
    { view: 'editor', label: 'Files' },
    { view: 'browser', label: 'Research' },
  ];
  if (sessionCount > 0) views.push({ view: 'terminal', label: 'Terminal' });
  return views;
};

interface ViewSwitcherProps {
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
}

const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ activeView, onViewChange }) => {
  const kind = useAppStore((state) => state.currentWorkspace?.kind);
  const sessionCount = useAppStore((state) => state.sessions.length);
  const viewOptions = getViewOptions(kind, sessionCount);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const focusedIndex = buttonRefs.current.findIndex((button) => button === event.target);
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
    buttonRefs.current[nextIndex]?.focus();
    onViewChange(viewOptions[nextIndex].view);
  };

  return (
    <div className="view-switch" role="tablist" aria-label="Workspace views" onKeyDown={handleKeyDown}>
      {viewOptions.map(({ view, label }, index) => {
        const isActive = activeView === view;
        return (
          <button
            key={view}
            ref={(button) => { buttonRefs.current[index] = button; }}
            onClick={() => onViewChange(view)}
            className={`view-switch__item ${isActive ? 'is-active' : ''}`}
            role="tab"
            aria-selected={isActive}
            aria-label={label}
            title={label}
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            {isActive && (
              <motion.div
                layoutId="workspace-view-active-pill"
                className="view-switch__pill"
                transition={{ type: 'spring', bounce: 0.12, duration: 0.3 }}
              />
            )}
            <span className="view-switch__content">
              {view === 'extensions' ? <PuzzlePiece size={16} weight={isActive ? 'fill' : 'regular'} className="view-switch__icon" aria-hidden="true" /> : <Icon
                icon={viewIconName(view, isActive)}
                width={16}
                height={16}
                className="view-switch__icon"
                aria-hidden="true"
              />}
              <span className="view-switch__label">{label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

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
  onExtensionsClick,
  extensionsOpen,
  onSourceControlClick,
  explorerOpen,
  sourceControlOpen,
  sourceControlChangeCount,
  onViewChange,
  activeView,
}) => {
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);
  const titlebarRef = useTitlebarDrag<HTMLElement>();

  const changeLabel = `${sourceControlChangeCount} changed file${sourceControlChangeCount === 1 ? '' : 's'}`;

  return (
    <>
      <header ref={titlebarRef} className="chrome chrome--workspace">
        <div className="chrome__start">
          <ChromeBrand />
          <ChromeDivider />
          <div className="chrome__group" role="group" aria-label="Side panels">
            <ChromeButton label="Explorer" pressed={explorerOpen} onClick={onExplorerClick}>
              <SidebarSimple size={16} aria-hidden="true" />
            </ChromeButton>
            <ChromeButton
              label={sourceControlChangeCount > 0 ? `Source Control, ${changeLabel}` : 'Source Control'}
              title={sourceControlChangeCount > 0 ? `Source Control — ${changeLabel}` : 'Source Control'}
              pressed={sourceControlOpen}
              badge={sourceControlChangeCount > 99 ? '99+' : sourceControlChangeCount > 0 ? sourceControlChangeCount : null}
              onClick={onSourceControlClick}
            >
              <GitBranch size={16} aria-hidden="true" />
            </ChromeButton>
            <ChromeButton label="Extensions" title="Extensions (Ctrl+Shift+X)" pressed={extensionsOpen} onClick={onExtensionsClick}>
              <PuzzlePiece size={16} aria-hidden="true" />
            </ChromeButton>
          </div>
        </div>

        <nav className="chrome-tabs" aria-label="Workspaces">
          <div className="chrome-tabs__scroll" role="tablist">
            {workspaces.map((workspace) => (
              <WorkspaceTab
                key={workspace.id}
                workspace={workspace}
                isActive={workspace.id === activeWorkspaceId}
                sessionsCount={sessionsByWorkspace[workspace.id] || 0}
                onClick={() => onWorkspaceClick(workspace.id)}
                onClose={(event) => {
                  event.stopPropagation();
                  onWorkspaceClose(workspace.id);
                }}
              />
            ))}
          </div>
          <ChromeButton label="New workspace" onClick={onNewWorkspace}>
            <Plus size={14} aria-hidden="true" />
          </ChromeButton>
        </nav>

        <div className="chrome__end">
          <ViewSwitcher activeView={activeView} onViewChange={onViewChange} />
          <DevicePanelToggle workspaceId={activeWorkspaceId} />
          <ChromeDivider />
          <ChromeButton label="Documentation" onClick={onDocsClick}>
            <BookOpenText size={16} aria-hidden="true" />
          </ChromeButton>
          <ChromeButton label="Keyboard shortcuts" onClick={() => setIsShortcutOpen(true)}>
            <Keyboard size={16} aria-hidden="true" />
          </ChromeButton>
          <ThemeModeToggle />
          <ChromeButton label="Settings" title="Settings (Ctrl+,)" onClick={onSettingsClick}>
            <GearSix size={16} aria-hidden="true" />
          </ChromeButton>
        </div>

        {isWindows && (
          <WindowControls
            onMinimize={onMinimizeWindow}
            onMaximize={onMaximizeWindow}
            onClose={onCloseWindow}
          />
        )}
      </header>
      {isShortcutOpen && <ShortcutModal onClose={() => setIsShortcutOpen(false)} />}
    </>
  );
};
