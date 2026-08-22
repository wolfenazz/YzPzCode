import React from 'react';

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
  { category: 'Editor & Files', items: [
    { keys: ['Ctrl', 'P'], action: 'Quick open file' },
    { keys: ['Ctrl', 'Shift', 'F'], action: 'Find in files' },
    { keys: ['Ctrl', 'S'], action: 'Save file' },
    { keys: ['Ctrl', 'G'], action: 'Go to line' },
    { keys: ['Ctrl', 'Z'], action: 'Undo last explorer action' },
  ]},
  { category: 'Navigation', items: [
    { keys: ['Ctrl', 'Tab'], action: 'Switch workspace tab' },
    { keys: ['Ctrl', 'B'], action: 'Toggle Sidebar' },
    { keys: ['Ctrl', 'E'], action: 'Toggle View' },
    { keys: ['Ctrl', 'W'], action: 'Close tab' },
    { keys: ['Ctrl', ','], action: 'Open Settings' },
  ]},
  { category: 'Window', items: [
    { keys: ['F11'], action: 'Toggle fullscreen' },
  ]},
];

export const SettingsShortcuts: React.FC = () => {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-zinc-100 tracking-widest uppercase font-mono mb-1">Keyboard Shortcuts</h2>
        <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-mono">View all available keyboard shortcuts</p>
      </div>

      <div className="space-y-6">
        {SHORTCUTS.map((group) => (
          <div key={group.category} className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--accent-border)]"></div>
              <h3 className="text-[10px] font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">{group.category}</h3>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--accent-border)]"></div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {group.items.map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-transparent hover:border-[var(--border-primary)] hover:bg-[var(--bg-primary)]/60 transition-all duration-200">
                  <span className="text-xs text-[var(--text-secondary)] font-mono">{shortcut.action}</span>
                  <div className="flex items-center gap-1.5">
                    {shortcut.keys.map((key, j) => (
                      <React.Fragment key={j}>
                        <kbd className="min-w-[24px] h-6 flex items-center justify-center px-2 text-[10px] font-mono font-bold text-[var(--text-primary)] bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-md shadow-[0_2px_0_0_#262626]">
                          {key}
                        </kbd>
                        {j < shortcut.keys.length - 1 && (
                          <span className="text-[#3e3e38] text-xs font-bold">+</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-[var(--accent-border)] to-transparent"></div>
          </div>
        ))}
      </div>
    </div>
  );
};
