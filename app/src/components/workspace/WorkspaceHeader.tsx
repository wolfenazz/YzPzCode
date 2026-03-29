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
        className="relative z-[100] flex items-center h-12 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/50 select-none transition-all duration-300 titlebar-drag flex-shrink-0"
      >
        {/* Left: Branding & Core Navigation */}
        <div className="flex items-center h-full titlebar-nodrag pl-1">
          <div className="flex items-center gap-3 px-4 h-9 my-1.5 rounded-r-xl border-r border-zinc-800/50 bg-gradient-to-r from-zinc-900/50 to-transparent hover:from-zinc-900 transition-all duration-500 group cursor-default">
            <div className="relative">
              <img src={logo} alt="YzPzCode" className="h-6 w-auto grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110" />
              <div className="absolute -inset-2 bg-blue-500/10 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>
            <div className="flex flex-col -space-y-0.5">
              <span className="text-[11px] font-mono font-black tracking-tighter text-zinc-100 uppercase group-hover:text-blue-400 transition-colors">YZPZ::CODE</span>
              <span className="text-[7px] font-mono text-zinc-500 tracking-[0.4em] uppercase opacity-70">terminal.v2</span>
            </div>
          </div>

          <div className="flex items-center gap-1 h-full px-2">
            <button
              onClick={onDocsClick}
              className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-zinc-800/50 transition-all duration-200 text-zinc-500 hover:text-zinc-200 group"
              title="Documentation (F1)"
            >
              <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </button>

            <button
              onClick={onSidebarToggle}
              className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-zinc-800/50 transition-all duration-200 text-zinc-500 hover:text-zinc-200 group"
              title="Toggle Sidebar (Ctrl+B)"
            >
              <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                <path strokeWidth="1.5" d="M9 3v18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Middle: Tabs Area */}
        <div className="flex-1 flex items-center h-full overflow-hidden px-4">
          <div className="flex items-center gap-1 h-full overflow-x-auto overflow-y-hidden scrollbar-none titlebar-nodrag py-1.5">
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
              className="flex items-center gap-2 h-8 px-4 rounded-lg bg-zinc-900/40 border border-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all duration-300 text-zinc-500 hover:text-zinc-200 group ml-2 whitespace-nowrap"
              title="Spawn new session"
            >
              <svg className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase">Spawn_TTY</span>
            </button>
          </div>
        </div>

        {/* Right: Tools & Window Controls */}
        <div className="flex items-center h-full titlebar-nodrag pr-1">
          <div className="flex items-center gap-1 h-full px-2 border-l border-zinc-800/50">
            <button
              onClick={() => setIsShortcutOpen(true)}
              className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-zinc-800/50 transition-all duration-200 text-zinc-500 hover:text-blue-400 group"
              title="Command Mapping"
            >
              <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                <rect x="7" y="7" width="10" height="10" rx="1" strokeWidth="1.5" />
              </svg>
            </button>

            <ThemeToggleButton theme={theme} onToggle={onThemeToggle} />

            <button
              onClick={onViewToggle}
              className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300 group ${
                activeView === "terminal"
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
              title={activeView === "terminal" ? "Focus Code (Ctrl+E)" : "Focus TTY (Ctrl+E)"}
            >
              {activeView === "terminal" ? (
                <svg className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              ) : (
                <svg className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>

          {isWindows && (
            <div className="flex items-center gap-0.5 h-full pl-2 border-l border-zinc-800/50 ml-1">
              <button
                onClick={onMinimizeWindow}
                className="w-10 h-9 flex items-center justify-center rounded-lg hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-200 transition-all duration-200"
                title="Minimize"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12">
                  <rect fill="currentColor" width="8" height="1.2" x="2" y="6" />
                </svg>
              </button>
              <button
                onClick={onMaximizeWindow}
                className="w-10 h-9 flex items-center justify-center rounded-lg hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-200 transition-all duration-200"
                title="Maximize"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12">
                  <rect fill="none" stroke="currentColor" width="7" height="7" x="2.5" y="2.5" strokeWidth="1.2" />
                </svg>
              </button>
              <button
                onClick={onCloseWindow}
                className="w-10 h-9 flex items-center justify-center rounded-lg hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-all duration-200"
                title="Terminate"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12">
                  <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M2,2 L10,10 M2,10 L10,2" />
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
