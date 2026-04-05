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
  { category: 'Navigation', items: [
    { keys: ['Ctrl', 'P'], action: 'Command palette' },
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
        <h2 className="text-sm font-bold text-zinc-100 tracking-widest uppercase mb-1">Keyboard Shortcuts</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">View all available keyboard shortcuts</p>
      </div>

      <div className="space-y-6">
        {SHORTCUTS.map((group) => (
          <div key={group.category} className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-zinc-800"></div>
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">{group.category}</h3>
              <div className="h-px w-4 bg-zinc-800"></div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {group.items.map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-transparent hover:border-zinc-800 hover:bg-zinc-900/30 transition-all duration-200">
                  <span className="text-xs text-zinc-400">{shortcut.action}</span>
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
    </div>
  );
};
