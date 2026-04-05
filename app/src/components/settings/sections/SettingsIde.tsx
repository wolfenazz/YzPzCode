import React, { useEffect } from 'react';
import { useAppStore } from '../../../stores/appStore';
import { useIde } from '../../../hooks/useIde';
import { IdeInfo, IdeType } from '../../../types';
import { IDE_DISPLAY_NAMES, IDE_ICONS, IDE_ORDER } from '../../setup/ideConstants';
import { SettingsToggle } from '../../common/SettingsToggle';

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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xs font-mono font-bold text-cyan-400/70 uppercase tracking-[0.2em] mb-1">IDE Integration</h2>
        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Configure external IDE launching and integration</p>
      </div>

      <div className="space-y-6">
        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-cyan-400/70 uppercase tracking-[0.2em]">Installed IDEs</h3>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] text-zinc-500 font-mono">
              {installedCount}/{ideList.length} detected
            </span>
          </div>

          <div className="space-y-2">
            {ideList.map((ide) => (
              <div
                key={ide.ide}
                className="flex items-center justify-between px-4 py-3 bg-[#080810]/40 border border-[#1a1a2e]/30 rounded-lg hover:border-cyan-500/10 transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <img src={IDE_ICONS[ide.ide as IdeType]} alt={ide.name} className="w-5 h-5 object-contain" />
                  <div>
                    <p className="text-xs text-zinc-300 font-mono font-medium">{IDE_DISPLAY_NAMES[ide.ide as IdeType] || ide.name}</p>
                    {ide.path && (
                      <p className="text-[10px] text-zinc-600 font-mono truncate max-w-xs">{ide.path}</p>
                    )}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${
                    ide.installed
                      ? 'bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20'
                      : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50'
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

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-cyan-400/70 uppercase tracking-[0.2em]">Default IDEs</h3>
          <p className="text-[10px] text-zinc-600 font-mono">Select which IDEs to launch automatically with new workspaces</p>

          <div className="grid grid-cols-2 gap-2">
            {ideList.filter(ide => ide.installed).map((ide) => (
              <button
                key={ide.ide}
                onClick={() => handleToggleIde(ide.ide)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-mono transition-all duration-200 cursor-pointer text-left ${
                  selectedIdes.includes(ide.ide)
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                    : 'bg-[#080810]/40 text-zinc-500 border border-[#1a1a2e]/30 hover:border-zinc-700'
                }`}
              >
                <img src={IDE_ICONS[ide.ide as IdeType]} alt={ide.name} className="w-4 h-4 object-contain" />
                <span>{IDE_DISPLAY_NAMES[ide.ide as IdeType] || ide.name}</span>
              </button>
            ))}
          </div>

          {ideList.filter(ide => ide.installed).length === 0 && (
            <p className="text-[10px] text-zinc-600 font-mono">No IDEs detected. Install an IDE to configure auto-launch.</p>
          )}
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-cyan-400/70 uppercase tracking-[0.2em]">Behavior</h3>

          <SettingsToggle
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
