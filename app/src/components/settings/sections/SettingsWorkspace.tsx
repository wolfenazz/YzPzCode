import React from 'react';
import { useAppStore } from '../../../stores/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { SEED_TEMPLATES } from '../../../hooks/useWorkspace';

export const SettingsWorkspace: React.FC = () => {
  const {
    confirmBeforeClose,
    setConfirmBeforeClose,
    saveWorkspaceState,
    setSaveWorkspaceState,
    defaultLayoutTemplate,
    setDefaultLayoutTemplate,
    defaultWorkspaceDirectory,
    setDefaultWorkspaceDirectory,
    recentDirectories,
    clearRecentDirectories,
  } = useAppStore();

  const handleSelectDirectory = async () => {
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: 'Select Default Workspace Directory',
      });
      if (typeof path === 'string') {
        setDefaultWorkspaceDirectory(path);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const Toggle = ({ enabled, onToggle, label, description }: { enabled: boolean; onToggle: () => void; label: string; description?: string }) => (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-zinc-300">{label}</p>
        {description && <p className="text-[10px] text-zinc-600 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
          enabled ? 'bg-emerald-600/60' : 'bg-zinc-800'
        }`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-zinc-300 transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-zinc-100 tracking-widest uppercase mb-1">Workspace</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Configure workspace defaults and behavior</p>
      </div>

      <div className="space-y-6">
        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">General</h3>
          
          <div className="space-y-3">
            <Toggle
              enabled={confirmBeforeClose}
              onToggle={() => setConfirmBeforeClose(!confirmBeforeClose)}
              label="Confirm Before Closing"
              description="Show confirmation dialog when closing workspaces"
            />

            <Toggle
              enabled={saveWorkspaceState}
              onToggle={() => setSaveWorkspaceState(!saveWorkspaceState)}
              label="Save Workspace State"
              description="Remember terminal history and open files"
            />
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Default Template</h3>
          
          <div>
            <p className="text-xs text-zinc-300 mb-2">Layout Template</p>
            <div className="grid grid-cols-2 gap-2">
              {SEED_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setDefaultLayoutTemplate(template.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-[10px] font-mono transition-all duration-150 cursor-pointer text-left ${
                    defaultLayoutTemplate === template.id
                      ? 'bg-theme-main/10 text-theme-main border border-theme-main/20'
                      : 'bg-zinc-900/50 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: template.iconColor }} />
                  <div>
                    <p className="text-xs text-zinc-300">{template.name}</p>
                    <p className="text-[9px] text-zinc-600">{template.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Default Directory</h3>
          
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={defaultWorkspaceDirectory}
              onChange={(e) => setDefaultWorkspaceDirectory(e.target.value)}
              placeholder="No default directory set"
              className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
            <button
              onClick={handleSelectDirectory}
              className="px-3 py-2 rounded-md bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer text-[10px] font-mono uppercase"
            >
              Browse
            </button>
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Recent Directories</h3>
          
          {recentDirectories.length > 0 ? (
            <div className="space-y-1">
              {recentDirectories.map((path, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-2 rounded-md bg-zinc-900/30 border border-zinc-800/50"
                >
                  <span className="text-[10px] text-zinc-400 font-mono truncate flex-1">{path}</span>
                </div>
              ))}
              <button
                onClick={clearRecentDirectories}
                className="mt-3 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                Clear All
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-zinc-600">No recent directories</p>
          )}
        </div>
      </div>
    </div>
  );
};
