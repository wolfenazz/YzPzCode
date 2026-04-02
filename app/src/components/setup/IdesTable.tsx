import React, { useState, useEffect } from 'react';
import { useIde } from '../../hooks/useIde';
import { useAppStore } from '../../stores/appStore';
import { IdeInfo, IdeType } from '../../types';
import { IDE_ORDER, IDE_ICONS, IDE_DISPLAY_NAMES } from './ideConstants';

interface IdesTableProps {
  selectedPath: string;
}

export const IdesTable: React.FC<IdesTableProps> = ({ selectedPath }) => {
  const { ideStatuses, detectAllIdes, launchIde, loading } = useIde();
  const { selectedIdes, toggleIde } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    detectAllIdes();
  }, [detectAllIdes]);

  const ideList = IDE_ORDER.map((ide) => ideStatuses[ide]).filter((ide): ide is IdeInfo => ide !== null);
  const installedCount = ideList.filter((ide) => ide.installed).length;
  const selectedInstalledIdes = selectedIdes.filter((ide) => ideStatuses[ide]?.installed);

  const handleExecute = async () => {
    if (!selectedPath || selectedInstalledIdes.length === 0 || isLaunching) return;

    setIsLaunching(true);
    for (const ide of selectedInstalledIdes) {
      await launchIde(ide, selectedPath);
    }
    setIsLaunching(false);
  };

  const getIdeIcon = (ide: IdeType): string => {
    return IDE_ICONS[ide] || '';
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-theme-secondary font-mono text-xs animate-pulse">
        <span>Detecting IDEs...</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-theme-secondary hover:text-theme-main font-mono text-xs transition-colors group"
      >
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="uppercase tracking-wider">IDEs</span>
        <span className="text-zinc-600">[{installedCount}/{ideList.length} installed]</span>
        <span className="text-zinc-700 group-hover:text-zinc-500 ml-1">[expand]</span>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
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
                    flex flex-col items-center justify-center p-3 rounded-md border transition-all
                    font-mono text-[10px] uppercase tracking-wider
                    ${isInstalled
                      ? isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-sm shadow-emerald-500/20'
                        : 'border-theme hover:border-zinc-500 bg-theme-card hover:bg-theme-hover text-theme-secondary hover:text-theme-main cursor-pointer'
                      : 'border-theme/30 bg-theme-card/50 text-zinc-600 cursor-not-allowed opacity-50'
                    }
                  `}
                  title={isInstalled ? ide.path || ide.name : 'Not installed'}
                >
                  <div className="relative mb-1.5">
                    <img
                      src={getIdeIcon(ide.ide)}
                      alt={ide.name}
                      className={`w-6 h-6 object-contain ${!isInstalled ? 'grayscale opacity-50' : ''}`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {isSelected && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center">
                        <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <span className="truncate w-full text-center">{IDE_DISPLAY_NAMES[ide.ide]}</span>
                  {!isInstalled && (
                    <span className="text-[8px] text-zinc-600 mt-0.5">✗</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between p-3 border border-theme rounded-md bg-theme-card">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-theme-secondary font-mono">
                {selectedInstalledIdes.length > 0 ? (
                  <>
                    <span className="text-emerald-400">{selectedInstalledIdes.length}</span> IDE{selectedInstalledIdes.length !== 1 ? 's' : ''} selected
                  </>
                ) : (
                  <span className="text-zinc-500">No IDEs selected</span>
                )}
              </span>
              {!selectedPath && selectedInstalledIdes.length > 0 && (
                <span className="text-[10px] text-amber-400 font-mono">
                  ⚠ Select a directory first
                </span>
              )}
            </div>
            <button
              onClick={handleExecute}
              disabled={!selectedPath || selectedInstalledIdes.length === 0 || isLaunching}
              className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600 flex items-center gap-2"
            >
              {isLaunching ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Launching...</span>
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Execute</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
