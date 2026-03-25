import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { IdeInfo, IdeType } from '../../types';

import vsCodeIcon from '../../assets/Visual_Studio_code.png';
import visualStudioIcon from '../../assets/visual-studio-logo.png';
import cursorIcon from '../../assets/cursor-ai.png';
import zedIcon from '../../assets/zedlogo.png';
import webStormIcon from '../../assets/WebStormLOGO.png';
import intelliJIcon from '../../assets/IntelliJ_IDEA_Logo.png';
import sublimeIcon from '../../assets/sublime_logo.png';
import windsurfIcon from '../../assets/windsufrLogo.jpg';
import perplexityIcon from '../../assets/perplexityLogo.jpg';
import antigravityIcon from '../../assets/antigravity.png';

interface IdesSelectorProps {
  selectedPath: string;
}

const IDE_ORDER: IdeType[] = ['vsCode', 'visualStudio', 'cursor', 'zed', 'webStorm', 'intelliJ', 'sublimeText', 'windsurf', 'perplexity', 'antigravity'];

const IDE_ICONS: Record<IdeType, string> = {
  vsCode: vsCodeIcon,
  visualStudio: visualStudioIcon,
  cursor: cursorIcon,
  zed: zedIcon,
  webStorm: webStormIcon,
  intelliJ: intelliJIcon,
  sublimeText: sublimeIcon,
  windsurf: windsurfIcon,
  perplexity: perplexityIcon,
  antigravity: antigravityIcon,
};

const IDE_DISPLAY_NAMES: Record<IdeType, string> = {
  vsCode: 'VS Code',
  visualStudio: 'Visual Studio',
  cursor: 'Cursor',
  zed: 'Zed',
  webStorm: 'WebStorm',
  intelliJ: 'IntelliJ',
  sublimeText: 'Sublime',
  windsurf: 'Windsurf',
  perplexity: 'Perplexity',
  antigravity: 'Antigravity',
};

export const IdesSelector: React.FC<IdesSelectorProps> = () => {
  const [loading, setLoading] = useState(false);

  const { selectedIdes, toggleIde, ideStatuses, setIdeStatuses } = useAppStore();

  useEffect(() => {
    const detectAllIdes = async () => {
      setLoading(true);
      try {
        const statuses = await invoke<Record<IdeType, IdeInfo>>('detect_all_ides_cmd');
        setIdeStatuses(statuses);
      } catch (err) {
        console.error('Failed to detect IDEs:', err);
      } finally {
        setLoading(false);
      }
    };
    detectAllIdes();
  }, [setIdeStatuses]);

  const ideList = IDE_ORDER.map((ide) => ideStatuses[ide]).filter((ide): ide is IdeInfo => ide !== null);
  const installedCount = ideList.filter((ide) => ide.installed).length;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-theme-secondary font-mono uppercase tracking-widest">
          IDEs
          <span className="ml-2 text-xs text-zinc-500 normal-case">[{installedCount}/{ideList.length} installed]</span>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-theme-secondary font-mono text-xs animate-pulse">
          <span>Detecting IDEs...</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-9 gap-2">
          {ideList.map((ide) => {
            const isSelected = selectedIdes.includes(ide.ide);
            const isInstalled = ide.installed;

            return (
              <button
                key={ide.ide}
                onClick={() => isInstalled && toggleIde(ide.ide)}
                disabled={!isInstalled}
                className={`
                  flex flex-col items-center justify-center p-2 rounded-md border transition-all
                  font-mono text-[9px] uppercase tracking-wider min-h-[60px]
                  ${isInstalled
                    ? isSelected
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-sm shadow-emerald-500/20'
                      : 'border-theme hover:border-zinc-500 bg-theme-card hover:bg-theme-hover text-theme-secondary hover:text-theme-main cursor-pointer'
                    : 'border-theme/30 bg-theme-card/50 text-zinc-600 cursor-not-allowed opacity-40'
                  }
                `}
                title={isInstalled ? ide.path || ide.name : 'Not installed'}
              >
                <div className="relative mb-1">
                  <img
                    src={IDE_ICONS[ide.ide]}
                    alt={ide.name}
                    className={`w-5 h-5 object-contain ${!isInstalled ? 'grayscale opacity-50' : ''}`}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  {isSelected && (
                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-1.5 h-1.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
                <span className="truncate w-full text-center leading-tight">{IDE_DISPLAY_NAMES[ide.ide]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
