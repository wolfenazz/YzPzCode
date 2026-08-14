import React, { useState } from 'react';
import { WorkspaceConfig, WorkspaceView } from '../../types';
import { WorkspaceTab } from './WorkspaceTab';
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
  onViewChange: (view: WorkspaceView) => void;
  activeView: WorkspaceView;
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
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[9999] font-mono animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="relative max-w-lg w-full mx-4 overflow-hidden rounded-xl border border-theme bg-theme-card shadow-[0_32px_80px_-16px_rgba(0,0,0,0.75),0_8px_24px_-8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.03),0_0_64px_-24px_var(--accent-glow)] animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-border)] to-transparent" />
        <div className="absolute inset-x-0 top-[1px] h-[3px] bg-gradient-to-r from-transparent via-[var(--accent-glow)] to-transparent opacity-50" />

        <div className="relative flex items-center justify-between px-6 py-4 border-b border-theme bg-theme-main/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 pr-3 border-r border-theme">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] opacity-70 shadow-[0_0_6px_rgba(255,95,86,0.5)]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] opacity-70 shadow-[0_0_6px_rgba(255,189,46,0.5)]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] opacity-70 shadow-[0_0_6px_rgba(39,201,63,0.5)]" />
            </div>
            <div className="w-8 h-8 rounded-lg bg-theme-hover border border-[var(--accent-border)] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_14px_-2px_var(--accent-glow)]">
              <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth={1.5} />
                <path strokeLinecap="round" strokeWidth={1.5} d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-theme-main tracking-widest uppercase">Command System</h3>
              <p className="text-[10px] text-[var(--accent-text)] uppercase tracking-tighter">Keyboard Shortcut Mappings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-theme-hover hover:border-[var(--accent-border)] rounded-lg border border-transparent text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all duration-200 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {SHORTCUTS.map((group) => (
            <div key={group.category} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className="text-[var(--accent)] font-bold">//</span>
                <div className="h-px flex-1 bg-gradient-to-r from-[var(--accent-border)] via-[var(--bg-tertiary)] to-transparent"></div>
                <h4 className="text-[10px] font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">{group.category}</h4>
                <div className="h-px w-4 bg-theme"></div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {group.items.map((shortcut, i) => (
                  <div key={i} className="group flex items-center justify-between px-3 py-2.5 rounded-lg border border-transparent hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)]/40 transition-all duration-200">
                    <span className="flex items-center gap-2.5">
                      <span className="text-[var(--accent)] text-[10px] opacity-0 group-hover:opacity-100 transition-opacity duration-150">›</span>
                      <span className="text-xs text-theme-secondary group-hover:text-theme-main transition-colors duration-150">{shortcut.action}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {shortcut.keys.map((key, j) => (
                        <React.Fragment key={j}>
                          <kbd className="min-w-[24px] h-6 flex items-center justify-center px-2 text-[10px] font-bold text-theme-main bg-theme-hover border border-theme rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_0_0_var(--accent-border),0_3px_6px_-2px_rgba(0,0,0,0.6)] group-hover:border-[var(--accent-border)] group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_0_0_var(--accent),0_0_10px_-2px_var(--accent-glow)] transition-all duration-200">
                            {key}
                          </kbd>
                          {j < shortcut.keys.length - 1 && (
                            <span className="text-[var(--accent-text)] text-xs font-bold">+</span>
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

        <div className="px-6 py-4 border-t border-theme bg-theme-main/40">
          <div className="flex items-center justify-center gap-2 text-[10px] text-[var(--text-secondary)] uppercase tracking-widest">
            <span className="text-[var(--accent)] font-bold">$</span>
            <span>press</span>
            <kbd className="px-2 py-0.5 text-[var(--accent)] bg-theme-hover border border-[var(--accent-border)] rounded text-[9px] font-bold shadow-[0_0_10px_-2px_var(--accent-glow)]">ESC</kbd>
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
  onSettingsClick,
  isWindows,
  onMinimizeWindow,
  onMaximizeWindow,
  onCloseWindow,
  onSidebarToggle,
  onViewChange,
  activeView,
}) => {
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);

  return (
    <>
      <header 
        data-tauri-drag-region
        className="relative z-[100] flex items-center h-10 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] select-none titlebar-drag flex-shrink-0"
      >
        {/* Left: Branding & Core Navigation */}
        <div className="flex items-center h-full titlebar-nodrag">
          <div className="flex items-center gap-2 px-3.5 h-full border-r border-[var(--border-primary)] cursor-default">
            <button
              className="group flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors duration-100 cursor-pointer"
              title="YzPzCode"
            >
              <img
                src={logo}
                alt="YzPzCode"
                className="h-5 w-auto opacity-70 transition-all duration-200 group-hover:opacity-100 group-hover:scale-110"
              />
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold tracking-tight text-[var(--text-primary)]">YZPZ</span>
              <span className="text-[10px] text-[var(--text-secondary)]/60">/</span>
              <span className="text-[10px] font-mono text-[var(--text-secondary)] tracking-wide">code</span>
            </div>
          </div>

          <div className="flex items-center h-full px-1.5 gap-1">
            <button
              onClick={onDocsClick}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors duration-100 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              title="Documentation"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </button>

            <button
              onClick={onSidebarToggle}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors duration-100 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
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
          <div className="flex items-center h-full overflow-x-auto overflow-y-hidden titlebar-nodrag min-w-0 px-1.5 gap-1">
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
              className="flex items-center gap-1.5 h-6.5 px-2.5 rounded-md border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] transition-colors duration-100 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
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
          <div className="flex items-center h-full border-l border-[var(--border-primary)] pl-1.5 gap-1">
            <button
              onClick={onSettingsClick}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors duration-100 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              title="Settings (Ctrl+,)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            <button
              onClick={() => setIsShortcutOpen(true)}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors duration-100 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              title="Shortcuts"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth={1.5} />
                <path strokeLinecap="round" strokeWidth={1.5} d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
              </svg>
            </button>

            <div className="flex items-center h-6 rounded-md border border-[var(--border-primary)] bg-[var(--border-primary)] gap-px overflow-hidden">
              <button
                onClick={() => onViewChange('terminal')}
                className={`flex items-center gap-1.5 px-2.5 h-full text-[9px] font-bold uppercase tracking-[0.14em] transition-colors duration-100 cursor-pointer ${
                  activeView === 'terminal'
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                title="Terminal"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                TTY
              </button>
              <button
                onClick={() => onViewChange('agent')}
                className={`flex items-center gap-1.5 px-2.5 h-full text-[9px] font-bold uppercase tracking-[0.14em] transition-colors duration-100 cursor-pointer ${
                  activeView === 'agent'
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                title="YZPZ Agent — UI AI agent harness"
              >
                <img src={logo} alt="YZPZ Agent" className="w-3.5 h-3.5 object-contain" draggable={false} />
                Agent
              </button>
              <button
                onClick={() => onViewChange('editor')}
                className={`flex items-center gap-1.5 px-2.5 h-full text-[9px] font-bold uppercase tracking-[0.14em] transition-colors duration-100 cursor-pointer ${
                  activeView === 'editor'
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                title="Editor"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Code
              </button>
              <button
                onClick={() => onViewChange('browser')}
                className={`flex items-center gap-1.5 px-2.5 h-full text-[9px] font-bold uppercase tracking-[0.14em] transition-colors duration-100 cursor-pointer ${
                  activeView === 'browser'
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                title="Built-in browser"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 010 18M12 3a15.3 15.3 0 000 18" />
                </svg>
                Browser
              </button>
              <button
                onClick={() => onViewChange('image')}
                className={`flex items-center gap-1.5 px-2.5 h-full text-[9px] font-bold uppercase tracking-[0.14em] transition-colors duration-100 cursor-pointer ${
                  activeView === 'image'
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                title="Image editor"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} x="3" y="3" width="18" height="18" rx="2" />
                  <circle strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} cx="9" cy="9" r="2" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 15l-4.5-4.5L7 20" />
                </svg>
                Image
              </button>
            </div>
          </div>

          {isWindows && (
            <div className="flex h-full border-l border-[var(--border-primary)] ml-1.5">
              <button
                onClick={onMinimizeWindow}
                className="w-[42px] h-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-100 cursor-pointer"
                title="Minimize"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <rect fill="currentColor" width="10" height="1" x="1" y="5.5" />
                </svg>
              </button>
              <button
                onClick={onMaximizeWindow}
                className="w-[42px] h-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-100 cursor-pointer"
                title="Maximize"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <rect fill="none" stroke="currentColor" width="8" height="8" x="2" y="2" strokeWidth="1" />
                </svg>
              </button>
              <button
                onClick={onCloseWindow}
                className="w-[48px] h-full flex items-center justify-center hover:bg-[#c42b1c] text-[var(--text-secondary)] hover:text-white transition-colors duration-100 cursor-pointer"
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
