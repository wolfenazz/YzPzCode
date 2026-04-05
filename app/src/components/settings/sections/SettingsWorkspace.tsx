import React from 'react';
import { useAppStore } from '../../../stores/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { SEED_TEMPLATES } from '../../../hooks/useWorkspace';
import { SettingsToggle } from '../../common/SettingsToggle';

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

  return (
    <div className="space-y-8 font-mono">
      <div>
        <h2 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em] mb-1">Workspace</h2>
        <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Configure workspace defaults and behavior</p>
      </div>

      <div className="space-y-5">
        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">General</h3>
          <div className="space-y-3">
            <SettingsToggle
              enabled={confirmBeforeClose}
              onToggle={() => setConfirmBeforeClose(!confirmBeforeClose)}
              label="Confirm Before Closing"
              description="Show confirmation dialog when closing workspaces"
            />
            <SettingsToggle
              enabled={saveWorkspaceState}
              onToggle={() => setSaveWorkspaceState(!saveWorkspaceState)}
              label="Save Workspace State"
              description="Restore open workspaces with file on app restart"
            />
          </div>
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">Default Template</h3>
          <div>
            <p className="text-xs text-zinc-300 font-mono mb-3">Layout Template</p>
            <div className="grid grid-cols-2 gap-2">
              {SEED_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setDefaultLayoutTemplate(template.id)}
                  className={
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[10px] font-mono transition-all duration-150 cursor-pointer text-left ' +
                    (defaultLayoutTemplate === template.id
                      ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                      : 'bg-[#080810]/40 text-zinc-500 border border-[#1a1a2e]/30 hover:text-zinc-300 hover:border-[#1a1a2e]/60')
                  }
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: template.iconColor }} />
                  <div className="min-w-0">
                    <p className="text-xs font-mono truncate">{template.name}</p>
                    <p className="text-[9px] text-zinc-600 font-mono truncate">{template.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">Default Directory</h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={defaultWorkspaceDirectory}
              onChange={(e) => setDefaultWorkspaceDirectory(e.target.value)}
              placeholder="No default directory set"
              className="flex-1 bg-[#080810]/60 border border-[#1a1a2e]/50 rounded-md px-3 py-2 text-xs text-zinc-300 font-mono placeholder-zinc-700 focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            <button
              onClick={handleSelectDirectory}
              className="px-3 py-2 rounded-md bg-[#1a1a2e] text-zinc-400 hover:text-zinc-200 hover:bg-[#252540] transition-colors cursor-pointer text-[10px] font-mono uppercase"
            >
              Browse
            </button>
          </div>
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">Recent Directories</h3>
          {recentDirectories.length > 0 ? (
            <div className="space-y-1.5">
              {recentDirectories.map((path, index) => (
                <div
                  key={index}
                  className="flex items-center px-3 py-2 rounded-md bg-[#080810]/30 border border-[#1a1a2e]/20 text-zinc-400"
                >
                  <span className="text-[10px] text-zinc-400 font-mono truncate flex-1">{path}</span>
                </div>
              ))}
              <button
                onClick={clearRecentDirectories}
                className="mt-3 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
              >
                Clear All
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-zinc-600 font-mono">No recent directories</p>
          )}
        </div>
      </div>
    </div>
  );
};
