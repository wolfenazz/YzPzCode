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
  onMinimizeWindow: () => void;
  onMaximizeWindow: () => void;
  onCloseWindow: () => void;
  onSidebarToggle: () => void;
  onViewToggle: () => void;
  activeView: "terminal" | "editor";
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
    { keys: ['Ctrl', 'B'], action: 'Toggle Sidebar' },
    { keys: ['Ctrl', 'E'], action: 'Toggle View' },
    { keys: ['Ctrl', 'W'], action: 'Close tab' },
  ]},
  { category: 'Window', items: [
    { keys: ['F11'], action: 'Toggle fullscreen' },
  ]},
];

interface ShortcutModalProps {
  onClose: () => void;
}

const ShortcutModal: React.FC<ShortcutModalProps> = ({ onClose }) => {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] font-mono animate-fade-in" 
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth="2" />
                <path strokeLinecap="round" strokeWidth="2" d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100 tracking-widest uppercase">Command System</h3>
              <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">Keyboard Shortcut Mappings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {SHORTCUTS.map((group) => (
            <div key={group.category} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-zinc-800"></div>
                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">{group.category}</h4>
                <div className="h-px w-4 bg-zinc-800"></div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {group.items.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-transparent hover:border-zinc-800 hover:bg-zinc-900/30 transition-all duration-200 group">
                    <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">{shortcut.action}</span>
                    <div className="flex items-center gap-1.5">
                      {shortcut.keys.map((key, j) => (
                        <React.Fragment key={j}>
                          <kbd className="min-w-[24px] h-6 flex items-center justify-center px-2 text-[10px] font-bold text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-md shadow-[0_2px_0_0_rgba(0,0,0,0.4)]">
                            {key}
                          </kbd>
                          {j < shortcut.keys.length - 1 && (
                            <span className="text-zinc-700 text-xs font-bold">+</span>
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

        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/20">
          <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-600 uppercase tracking-widest">
            <span>Press</span>
            <kbd className="px-2 py-0.5 text-zinc-400 bg-zinc-800 border border-zinc-700 rounded text-[9px] font-bold">ESC</kbd>
            <span>to terminate process</span>
          </div>
        </div>
      </div>
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
  isWindows,
  onThemeToggle,
  theme,
  onMinimizeWindow,
  onMaximizeWindow,
  onCloseWindow,
  onSidebarToggle,
  onViewToggle,
  activeView,
}) => {
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);

  return (
    <>
      <header 
        data-tauri-drag-region
        className="relative z-[100] flex items-center h-11 bg-theme-card/60 backdrop-blur-md border-b border-theme select-none titlebar-drag flex-shrink-0"
      >
        {/* Left: Branding & Core Navigation */}
        <div className="flex items-center h-full titlebar-nodrag">
          <div className="flex items-center gap-2.5 px-4 h-full border-r border-theme bg-theme-card/40 group cursor-default">
            <img src={logo} alt="YzPzCode" className="h-5 w-auto opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold tracking-tight text-theme-main">YZPZ</span>
              <span className="text-[9px] text-zinc-600">/</span>
              <span className="text-[10px] font-mono text-theme-secondary tracking-wide">code</span>
            </div>
          </div>

          <div className="flex items-center h-full">
            <button
              onClick={onDocsClick}
              className="flex items-center justify-center w-10 h-full border-r border-theme hover:bg-theme-hover transition-colors duration-150 text-zinc-500 hover:text-theme-main cursor-pointer"
              title="Documentation"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </button>

            <button
              onClick={onSidebarToggle}
              className="flex items-center justify-center w-10 h-full border-r border-theme hover:bg-theme-hover transition-colors duration-150 text-zinc-500 hover:text-theme-main cursor-pointer"
              title="Toggle Sidebar (Ctrl+B)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.5} />
                <path strokeWidth={1.5} d="M9 3v18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Middle: Tabs Area */}
        <div className="flex-1 flex items-center h-full overflow-hidden">
          <div className="flex items-center h-full overflow-x-auto overflow-y-hidden titlebar-nodrag min-w-0">
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
              className="flex items-center gap-1.5 h-full px-3 border-l border-theme hover:bg-theme-hover transition-colors duration-150 text-zinc-500 hover:text-theme-main cursor-pointer whitespace-nowrap"
              title="New Session"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[9px] font-mono tracking-[0.15em] uppercase">new</span>
            </button>
          </div>
        </div>

        {/* Right: Tools & Window Controls */}
        <div className="flex items-center h-full titlebar-nodrag">
          <div className="flex items-center h-full border-l border-theme">
            <button
              disabled
              className="flex items-center justify-center w-10 h-full hover:bg-theme-hover transition-colors duration-150 text-zinc-500 hover:text-zinc-200 cursor-not-allowed group"
              title="Settings (coming soon)"
            >
              <svg className="w-4 h-4 transition-transform duration-500 group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            <button
              onClick={() => setIsShortcutOpen(true)}
              className="flex items-center justify-center w-10 h-full hover:bg-theme-hover transition-colors duration-150 text-zinc-500 hover:text-theme-main cursor-pointer"
              title="Shortcuts"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth={1.5} />
                <path strokeLinecap="round" strokeWidth={1.5} d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
              </svg>
            </button>

            <ThemeToggleButton theme={theme} onToggle={onThemeToggle} />

            <button
              onClick={onViewToggle}
              className="flex items-center justify-center w-10 h-full hover:bg-theme-hover transition-colors duration-150 text-zinc-500 hover:text-theme-main cursor-pointer"
              title={activeView === "terminal" ? "Editor (Ctrl+E)" : "Terminal (Ctrl+E)"}
            >
              {activeView === "terminal" ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>

          {isWindows && (
            <div className="flex h-full border-l border-theme">
              <button
                onClick={onMinimizeWindow}
                className="w-[42px] h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
                title="Minimize"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <rect fill="currentColor" width="10" height="1" x="1" y="5.5" />
                </svg>
              </button>
              <button
                onClick={onMaximizeWindow}
                className="w-[42px] h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
                title="Maximize"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <rect fill="none" stroke="currentColor" width="8" height="8" x="2" y="2" strokeWidth="1" />
                </svg>
              </button>
              <button
                onClick={onCloseWindow}
                className="w-[48px] h-full flex items-center justify-center hover:bg-[#c42b1c] text-zinc-500 hover:text-white transition-colors duration-150 cursor-pointer"
                title="Close"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <path fill="none" stroke="currentColor" strokeWidth="1.2" d="M2.5,2.5 L9.5,9.5 M2.5,9.5 L9.5,2.5" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>
      {isShortcutOpen && <ShortcutModal onClose={() => setIsShortcutOpen(false)} />}
    </>
  );
};
