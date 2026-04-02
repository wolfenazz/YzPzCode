import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { IdeInfo, IdeType } from '../../types';
import { HelpTooltip } from '../common/HelpTooltip';
import { IDE_ORDER, IDE_ICONS, IDE_DISPLAY_NAMES } from './ideConstants';

interface IdesSelectorProps {
  selectedPath: string;
}

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
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <label className="block text-xs font-medium text-zinc-400 font-mono uppercase tracking-[0.15em]">
            IDEs
            <span className="ml-2 text-[10px] text-zinc-600 normal-case">[{installedCount}/{ideList.length} installed]</span>
          </label>
          <HelpTooltip text="Select which code editors to launch alongside your workspace. Only installed IDEs can be selected." />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-zinc-500 font-mono text-xs">
          <span className="animate-pulse">Detecting IDEs...</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-9 gap-1.5">
          {ideList.map((ide) => {
            const isSelected = selectedIdes.includes(ide.ide);
            const isInstalled = ide.installed;

            return (
              <button
                key={ide.ide}
                onClick={() => isInstalled && toggleIde(ide.ide)}
                disabled={!isInstalled}
                className={`
                  group relative flex flex-col items-center justify-center p-2 rounded-md border
                  font-mono text-[9px] uppercase tracking-[0.1em] min-h-[56px]
                  transition-colors duration-150 cursor-pointer
                  ${isInstalled
                    ? isSelected
                      ? 'border-zinc-400 bg-zinc-800/60 text-zinc-200'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-600 hover:bg-zinc-900/40 hover:text-zinc-300'
                    : 'border-zinc-800/40 bg-zinc-950/50 text-zinc-700 cursor-not-allowed opacity-40'
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
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-zinc-200 rounded-full flex items-center justify-center">
                      <svg className="w-1 h-1 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
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
