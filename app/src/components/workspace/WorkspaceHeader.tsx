import React, { useState } from 'react';
import { WorkspaceConfig } from '../../types';
import { WorkspaceTab } from './WorkspaceTab';
import { ThemeToggleButton } from '../common/ThemeToggleButton';
import logo from '../../assets/YzPzCodeLogo.png';

interface WorkspaceHeaderProps {
  workspaces: WorkspaceConfig[];
  activeWorkspaceId: string | null;
  sessionsByWorkspace: Record<string, number>;
  onWorkspaceClick: (workspaceId: string) => void;
  onWorkspaceClose: (workspaceId: string) => void;
  onNewWorkspace: () => void;
  onDocsClick: () => void;
  isWindows: boolean;
  onThemeToggle: () => void;
  theme: 'dark' | 'light';
  onTerminate: () => void;
  onMinimizeWindow: () => void;
  onMaximizeWindow: () => void;
  onCloseWindow: () => void;
}

const SHORTCUTS = [
  { category: 'Terminal', items: [
    { keys: ['Ctrl', 'C'], action: 'Copy selection' },
    { keys: ['Ctrl', 'V'], action: 'Paste' },
    { keys: ['Ctrl', 'F'], action: 'Search in terminal' },
    { keys: ['Ctrl', 'L'], action: 'Clear terminal' },
    { keys: ['Enter'], action: 'Find next match' },
    { keys: ['Shift', 'Enter'], action: 'Find previous match' },
    { keys: ['Esc'], action: 'Close search' },
  ]},
  { category: 'Navigation', items: [
    { keys: ['Ctrl', 'P'], action: 'Command palette' },
    { keys: ['Ctrl', 'Tab'], action: 'Switch workspace tab' },
  ]},
  { category: 'Window', items: [
    { keys: ['F11'], action: 'Toggle fullscreen' },
  ]},
];

const ShortcutHelp: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center w-10 h-full hover:bg-theme-hover transition-colors text-theme-secondary hover:text-theme-main titlebar-nodrag"
        title="Keyboard Shortcuts"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
          <rect x="7" y="7" width="10" height="10" rx="1" strokeWidth="2" />
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] font-mono" onClick={() => setIsOpen(false)}>
          <div 
            className="bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth="2" />
                  <path strokeLinecap="round" strokeWidth="2" d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
                </svg>
                <h3 className="text-sm font-bold text-zinc-200 tracking-widest uppercase">Keyboard Shortcuts</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {SHORTCUTS.map((group) => (
                <div key={group.category}>
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">{group.category}</h4>
                  <div className="space-y-1">
                    {group.items.map((shortcut, i) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-900/50">
                        <span className="text-xs text-zinc-400">{shortcut.action}</span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, j) => (
                            <React.Fragment key={j}>
                              <kbd className="px-1.5 py-0.5 text-[10px] font-bold text-zinc-300 bg-zinc-800 border border-zinc-700 rounded shadow-sm">
                                {key}
                              </kbd>
                              {j < shortcut.keys.length - 1 && (
                                <span className="text-zinc-600 text-xs">+</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/30">
              <p className="text-[10px] text-zinc-600 text-center">
                Press <kbd className="px-1 py-0.5 text-[10px] font-bold text-zinc-400 bg-zinc-800 border border-zinc-700 rounded mx-1">Esc</kbd> to close
              </p>
            </div>
          </div>
        </div>
      )}
    </>
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
  isWindows,
  onThemeToggle,
  theme,
  onTerminate,
  onMinimizeWindow,
  onMaximizeWindow,
  onCloseWindow,
}) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center h-10 bg-theme-main border-b border-theme select-none transition-colors titlebar-nodrag">
      <div className="flex items-center px-3 h-full border-r border-theme bg-theme-card cursor-default">
        <img src={logo} alt="YzPzCode" className="h-6 w-auto" />
      </div>

      <button
        onClick={onDocsClick}
        className="flex items-center justify-center w-10 h-full hover:bg-theme-hover transition-colors text-theme-secondary hover:text-theme-main titlebar-nodrag"
        title="Documentation"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </button>

      <div className="flex items-center h-full overflow-x-auto overflow-y-hidden titlebar-nodrag">
        {workspaces.map((workspace) => (
          <WorkspaceTab
            key={workspace.id}
            workspace={workspace}
            isActive={workspace.id === activeWorkspaceId}
            sessionsCount={sessionsByWorkspace[workspace.id] || 0}
            onClick={() => onWorkspaceClick(workspace.id)}
            onClose={(e) => {
              e.stopPropagation();
              onWorkspaceClose(workspace.id);
            }}
          />
        ))}

        <button
          onClick={onNewWorkspace}
          className="flex items-center gap-1 h-10 px-4 border-l border-theme bg-theme-card hover:bg-theme-card-hover transition-all duration-200 text-zinc-500 hover:text-zinc-300 titlebar-nodrag"
          title="Create new workspace"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-xs font-bold tracking-wider uppercase">New</span>
        </button>
      </div>

      <div className="flex-1 h-full" />

      <div className="flex items-center h-full gap-0 titlebar-nodrag">
        <ShortcutHelp />
        <ThemeToggleButton theme={theme} onToggle={onThemeToggle} />

        <button
          onClick={onTerminate}
          className="flex items-center px-5 h-full border-l border-theme bg-zinc-900/50 hover:bg-rose-950/30 text-[10px] text-zinc-500 hover:text-rose-500 transition-all font-bold uppercase tracking-widest"
          title="Terminate Session"
        >
          Terminate
        </button>

        {isWindows && (
          <div className="flex h-full border-l border-theme">
            <button
              onClick={onMinimizeWindow}
              className="w-10 h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Minimize"
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6" /></svg>
            </button>
            <button
              onClick={onMaximizeWindow}
              className="w-10 h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Maximize"
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12"><rect fill="none" stroke="currentColor" width="9" height="9" x="1.5" y="1.5" strokeWidth="1" /></svg>
            </button>
            <button
              onClick={onCloseWindow}
              className="w-12 h-full flex items-center justify-center hover:bg-rose-600 text-zinc-500 hover:text-white transition-colors"
              title="Close"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 12 12">
                <path fill="none" stroke="currentColor" strokeWidth="1.2" d="M1,1 L11,11 M1,11 L11,1" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
