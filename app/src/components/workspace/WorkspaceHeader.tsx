import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Sparkle,
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
  skillsOpen?: boolean;
  onSkillsClick?: () => void;
  onSourceControlClick: () => void;
  explorerOpen: boolean;
  sourceControlOpen: boolean;
  sourceControlChangeCount: number;
  onViewChange: (view: WorkspaceView) => void;
  activeView: WorkspaceView;
}

const SHORTCUTS = [
  { category: 'Terminal', items: [{ keys: ['Ctrl', 'C'], action: 'Copy selection' }, { keys: ['Ctrl', 'V'], action: 'Paste' }, { keys: ['Ctrl', 'F'], action: 'Search in terminal' }, { keys: ['Ctrl', 'L'], action: 'Clear terminal' }, { keys: ['Enter'], action: 'Find next match' }, { keys: ['Shift', 'Enter'], action: 'Find previous match' }, { keys: ['Esc'], action: 'Close search' }] },
  { category: 'Navigation', items: [{ keys: ['Ctrl', 'P'], action: 'Command palette' }, { keys: ['Ctrl', 'Tab'], action: 'Switch workspace tab' }, { keys: ['Ctrl', 'B'], action: 'Toggle sidebar' }, { keys: ['Ctrl', 'E'], action: 'Toggle view' }, { keys: ['Ctrl', 'Shift', 'E'], action: 'Export the report, presentation or workbook' }, { keys: ['Ctrl', 'Shift', 'S'], action: 'Toggle skills market' }, { keys: ['Ctrl', 'W'], action: 'Close tab' }] },
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

/** Studio workspaces (writing, presentation, sheets) only show a terminal once one has been opened in them. */
export const getViewOptions = (kind: WorkspaceKind | undefined, sessionCount: number): ViewOption[] => {
  if (kind !== 'writing' && kind !== 'presentation' && kind !== 'sheets' && kind !== 'design') return CODING_VIEWS;
  const views: ViewOption[] = [
    kind === 'presentation' ? { view: 'presentation', label: 'Slides' } : kind === 'sheets' ? { view: 'sheets', label: 'Sheets' } : kind === 'design' ? { view: 'design', label: 'Canvas' } : { view: 'writing', label: 'Write' },
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
  skillsOpen,
  onSkillsClick,
  onSourceControlClick,
  explorerOpen,
  sourceControlOpen,
  sourceControlChangeCount,
  onViewChange,
  activeView,
}) => {
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);
  const [extensionsMenuOpen, setExtensionsMenuOpen] = useState(false);
  const [extensionsMenuPos, setExtensionsMenuPos] = useState<{ left: number; top: number } | null>(null);
  const extensionsAnchorRef = useRef<HTMLDivElement>(null);
  const extensionsMenuRef = useRef<HTMLDivElement>(null);
  const titlebarRef = useTitlebarDrag<HTMLElement>();

  const toggleExtensionsMenu = (): void => {
    if (extensionsMenuOpen) {
      setExtensionsMenuOpen(false);
      return;
    }
    // Measure the toggle button so the portaled menu opens directly beneath
    // it. The menu lives on document.body (position: fixed), so no header
    // ancestor can clip it or trap its stacking order.
    const rect = extensionsAnchorRef.current?.getBoundingClientRect();
    const menuWidth = 192; // min-w-48
    if (rect) {
      setExtensionsMenuPos({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
        top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 120)),
      });
    } else {
      setExtensionsMenuPos({ left: 8, top: 46 });
    }
    setExtensionsMenuOpen(true);
  };

  const closeExtensionsMenu = (): void => setExtensionsMenuOpen(false);

  // Dismiss the Extensions/Skills menu on outside press, Escape, or resize.
  useEffect(() => {
    if (!extensionsMenuOpen) return;
    const isInside = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      return (
        extensionsAnchorRef.current?.contains(target) ||
        extensionsMenuRef.current?.contains(target) ||
        false
      );
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) setExtensionsMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExtensionsMenuOpen(false);
        extensionsAnchorRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    const onResize = (): void => setExtensionsMenuOpen(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [extensionsMenuOpen]);

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
            <div ref={extensionsAnchorRef} className="relative">
              <ChromeButton
                label="Extensions and skills"
                title="Extensions and skills (Ctrl+Shift+X)"
                pressed={extensionsOpen || skillsOpen || extensionsMenuOpen}
                aria-haspopup="menu"
                aria-expanded={extensionsMenuOpen}
                aria-controls="extensions-skills-menu"
                onClick={toggleExtensionsMenu}
              >
                <PuzzlePiece size={16} aria-hidden="true" />
              </ChromeButton>
            </div>
            {extensionsMenuOpen && extensionsMenuPos && createPortal(
              <div
                ref={extensionsMenuRef}
                id="extensions-skills-menu"
                role="menu"
                aria-label="Extensions and skills"
                style={{ left: extensionsMenuPos.left, top: extensionsMenuPos.top }}
                className="app-surface app-surface--raised fixed z-[9000] flex min-w-48 flex-col overflow-hidden whitespace-nowrap py-1"
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                  event.preventDefault();
                  const items = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
                  );
                  if (items.length === 0) return;
                  const index = items.findIndex((item) => item === document.activeElement);
                  const next = event.key === 'ArrowDown'
                    ? items[(index + 1) % items.length]
                    : items[(index - 1 + items.length) % items.length];
                  next?.focus();
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  autoFocus
                  className="flex items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  onClick={() => { closeExtensionsMenu(); onExtensionsClick(); }}
                >
                  <PuzzlePiece size={14} aria-hidden="true" />
                  Extensions
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  onClick={() => { closeExtensionsMenu(); onSkillsClick?.(); }}
                >
                  <Sparkle size={14} aria-hidden="true" />
                  Skills Market
                </button>
              </div>,
              document.body,
            )}
          </div>
        </div>

        <nav className="chrome-tabs" aria-label="Workspaces">
          <div className="chrome-tabs__scroll" role="tablist" data-glass-reorder="workspaces">
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
