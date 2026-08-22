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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <label className="block text-xs font-medium text-[var(--text-secondary)] font-mono uppercase tracking-[0.15em]">
            IDEs
            <span className="ml-2 text-[10px] text-[var(--text-secondary)] normal-case">[{installedCount}/{ideList.length} installed]</span>
          </label>
          <HelpTooltip text="Select which code editors to launch alongside your workspace. Only installed IDEs can be selected." />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-[var(--text-secondary)] font-mono text-xs">
          <span className="animate-pulse">Detecting IDEs...</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-9 gap-2.5">
          {ideList.map((ide) => {
            const isSelected = selectedIdes.includes(ide.ide);
            const isInstalled = ide.installed;

            return (
              <button
                key={ide.ide}
                onClick={() => isInstalled && toggleIde(ide.ide)}
                disabled={!isInstalled}
                className={`
                  group relative flex flex-col items-center justify-center p-3 rounded-lg border
                  font-mono text-[10px] uppercase tracking-[0.1em] min-h-[72px]
                  transition-all duration-200 cursor-pointer
                  ${isInstalled
                    ? isSelected
                      ? 'border-zinc-400/70 bg-zinc-800/70 text-zinc-200 shadow-[0_0_12px_rgba(161,161,170,0.04)]'
                      : 'border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:border-zinc-600 hover:bg-zinc-900/50 hover:text-zinc-300'
                    : 'border-zinc-800/40 bg-zinc-950/30 text-[var(--text-secondary)]/50 cursor-not-allowed opacity-40'
                  }
                `}
                title={isInstalled ? ide.path || ide.name : 'Not installed'}
              >
                <div className="relative mb-2">
                  <img
                    src={IDE_ICONS[ide.ide]}
                    alt={ide.name}
                    className={`w-8 h-8 object-contain transition-transform duration-200 ${!isInstalled ? 'grayscale opacity-50' : 'group-hover:scale-110'}`}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-zinc-200 rounded-full flex items-center justify-center shadow-sm">
                      <svg className="w-1.5 h-1.5 text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
                <span className="truncate w-full text-center leading-tight text-[9px]">{IDE_DISPLAY_NAMES[ide.ide]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
