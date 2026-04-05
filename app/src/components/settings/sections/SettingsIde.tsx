import React, { useEffect } from 'react';
import { useAppStore } from '../../../stores/appStore';
import { useIde } from '../../../hooks/useIde';
import { IdeInfo, IdeType } from '../../../types';
import { IDE_DISPLAY_NAMES, IDE_ICONS, IDE_ORDER } from '../../setup/ideConstants';

export const SettingsIde: React.FC = () => {
  const { ideStatuses, detectAllIdes, loading } = useIde();
  const { selectedIdes, setSelectedIdes, launchIdeOnWorkspaceCreation, setLaunchIdeOnWorkspaceCreation } = useAppStore();

  useEffect(() => {
    detectAllIdes();
  }, [detectAllIdes]);

  const ideList = IDE_ORDER.map(ide => ideStatuses[ide]).filter((ide): ide is IdeInfo => ide !== null);
  const installedCount = ideList.filter(i => i.installed).length;

  const handleToggleIde = (ide: IdeType) => {
    if (selectedIdes.includes(ide)) {
      setSelectedIdes(selectedIdes.filter((i) => i !== ide));
    } else {
      setSelectedIdes([...selectedIdes, ide]);
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
        <h2 className="text-sm font-bold text-zinc-100 tracking-widest uppercase mb-1">IDE Integration</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Configure external IDE launching and integration</p>
      </div>

      <div className="space-y-6">
        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Installed IDEs</h3>
          
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] text-zinc-500 font-mono">
              {installedCount}/{ideList.length} detected
            </span>
          </div>

          <div className="space-y-2">
            {ideList.map((ide) => (
              <div
                key={ide.ide}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50"
              >
                <div className="flex items-center gap-3">
                  <img src={IDE_ICONS[ide.ide as IdeType]} alt={ide.name} className="w-5 h-5 object-contain" />
                  <div>
                    <p className="text-xs text-zinc-300 font-medium">{IDE_DISPLAY_NAMES[ide.ide as IdeType] || ide.name}</p>
                    {ide.path && (
                      <p className="text-[10px] text-zinc-600 font-mono truncate max-w-xs">{ide.path}</p>
                    )}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${
                    ide.installed
                      ? 'bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                  }`}
                >
                  {ide.installed ? 'Installed' : 'Not Found'}
                </span>
              </div>
            ))}
          </div>

          {loading && (
            <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Detecting IDEs...</p>
          )}
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Default IDEs</h3>
          <p className="text-[10px] text-zinc-600">Select which IDEs to launch automatically with new workspaces</p>
          
          <div className="grid grid-cols-2 gap-2">
            {ideList.filter(ide => ide.installed).map((ide) => (
              <button
                key={ide.ide}
                onClick={() => handleToggleIde(ide.ide)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-[10px] font-mono transition-all duration-150 cursor-pointer text-left ${
                  selectedIdes.includes(ide.ide)
                    ? 'bg-theme-main/10 text-theme-main border border-theme-main/20'
                    : 'bg-zinc-900/50 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <span>{IDE_ICONS[ide.ide as IdeType] || '💻'}</span>
                <span>{IDE_DISPLAY_NAMES[ide.ide as IdeType] || ide.name}</span>
              </button>
            ))}
          </div>

          {ideList.filter(ide => ide.installed).length === 0 && (
            <p className="text-[10px] text-zinc-600">No IDEs detected. Install an IDE to configure auto-launch.</p>
          )}
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Behavior</h3>
          
          <Toggle
            enabled={launchIdeOnWorkspaceCreation}
            onToggle={() => setLaunchIdeOnWorkspaceCreation(!launchIdeOnWorkspaceCreation)}
            label="Auto-launch IDEs"
            description="Launch selected IDEs when creating a new workspace"
          />
        </div>
      </div>
    </div>
  );
};
