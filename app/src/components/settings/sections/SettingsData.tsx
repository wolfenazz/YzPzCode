import React from 'react';
import { useAppStore } from '../../../stores/appStore';

export const SettingsData: React.FC = () => {
  const {
    recentDirectories,
    clearRecentDirectories,
    workspaceList,
    openWorkspaces,
  } = useAppStore();

  const [showConfirmReset, setShowConfirmReset] = React.useState(false);
  const [showConfirmWorkspaces, setShowConfirmWorkspaces] = React.useState(false);

  const getStorageUsage = () => {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length * 2;
      }
    }
    return (total / 1024).toFixed(2);
  };

  const handleExportSettings = () => {
    const settings: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('yzpzcode-')) {
        settings[key] = localStorage.getItem(key);
      }
    }
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yzpzcode-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const settings = JSON.parse(event.target?.result as string);
          for (const [key, value] of Object.entries(settings)) {
            if (typeof value === 'string') {
              localStorage.setItem(key, value);
            }
          }
          window.location.reload();
        } catch (err) {
          console.error('Failed to import settings:', err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleResetAll = () => {
    localStorage.clear();
    window.location.reload();
  };

  const handleClearWorkspaces = () => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('workspace')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    window.location.reload();
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-zinc-100 tracking-widest uppercase mb-1">Data & Storage</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Manage application data and storage</p>
      </div>

      <div className="space-y-6">
        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Storage Usage</h3>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Local Storage</p>
              <p className="text-lg font-mono text-zinc-200">{getStorageUsage()} KB</p>
            </div>
            <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Workspaces</p>
              <p className="text-lg font-mono text-zinc-200">{workspaceList.length}</p>
            </div>
            <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Open</p>
              <p className="text-lg font-mono text-zinc-200">{openWorkspaces.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Import / Export</h3>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportSettings}
              className="px-4 py-2 rounded-md bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer text-[10px] font-mono uppercase"
            >
              Export Settings
            </button>
            <button
              onClick={handleImportSettings}
              className="px-4 py-2 rounded-md bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer text-[10px] font-mono uppercase"
            >
              Import Settings
            </button>
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Clear Data</h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-300">Recent Directories</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">{recentDirectories.length} entries</p>
              </div>
              <button
                onClick={clearRecentDirectories}
                className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-300">Workspace History</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">{workspaceList.length} saved workspaces</p>
              </div>
              {!showConfirmWorkspaces ? (
                <button
                  onClick={() => setShowConfirmWorkspaces(true)}
                  className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">Are you sure?</span>
                  <button
                    onClick={handleClearWorkspaces}
                    className="px-2 py-1 rounded-md text-[10px] font-mono uppercase text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowConfirmWorkspaces(false)}
                    className="px-2 py-1 rounded-md text-[10px] font-mono uppercase text-zinc-500 bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
              <div>
                <p className="text-xs text-rose-400/80">Reset All Settings</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">This will clear all data and reload the app</p>
              </div>
              {!showConfirmReset ? (
                <button
                  onClick={() => setShowConfirmReset(true)}
                  className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  Reset All
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">Are you sure?</span>
                  <button
                    onClick={handleResetAll}
                    className="px-2 py-1 rounded-md text-[10px] font-mono uppercase text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowConfirmReset(false)}
                    className="px-2 py-1 rounded-md text-[10px] font-mono uppercase text-zinc-500 bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
