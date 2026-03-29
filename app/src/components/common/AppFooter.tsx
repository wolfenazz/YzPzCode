import React, { useState, useEffect } from 'react';
import { useUpdaterStore } from '../../stores/updaterStore';
import { useAppStore } from '../../stores/appStore';

export const AppFooter: React.FC = () => {
  const {
    checking,
    downloading,
    downloadProgress,
    updateAvailable,
    upToDate,
    checkForUpdates,
    downloadAndInstall,
    resetUpToDate,
  } = useUpdaterStore();

  const { currentWorkspace, sessions } = useAppStore();
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/app').then(({ getVersion }) => {
        getVersion().then(setVersion);
      });
    } else {
      setVersion('dev');
    }
  }, []);

  useEffect(() => {
    if (upToDate) {
      const timer = setTimeout(() => {
        resetUpToDate();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [upToDate, resetUpToDate]);

  return (
    <footer className="flex-shrink-0 h-8 border-t border-theme bg-theme-card/40 select-none font-mono">
      <div className="h-full flex items-center justify-between px-4 text-[10px] tracking-wider uppercase">
        {/* Left: System Info */}
        <div className="flex items-center gap-4 text-zinc-500">
          {currentWorkspace && (
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-600">workspace:</span>
              <span className="text-zinc-400">{currentWorkspace.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-600">sessions:</span>
            <span className="text-zinc-400">{sessions.length}</span>
          </div>
        </div>

        {/* Right: Updates & Version */}
        <div className="flex items-center gap-3">
          {checking && (
            <span className="text-zinc-600">checking...</span>
          )}
          {!checking && upToDate && (
            <span className="text-zinc-600">synced</span>
          )}
          {!checking && !downloading && updateAvailable && (
            <button
              onClick={downloadAndInstall}
              className="text-zinc-400 hover:text-theme-main transition-colors duration-150 cursor-pointer"
            >
              update v{updateAvailable.version}
            </button>
          )}
          {downloading && (
            <span className="text-zinc-500">{downloadProgress}%</span>
          )}
          {!checking && !downloading && !updateAvailable && !upToDate && (
            <button
              onClick={() => checkForUpdates(true)}
              className="text-zinc-500 hover:text-theme-main transition-colors duration-150 cursor-pointer"
            >
              check_updates
            </button>
          )}

          <div className="flex items-center gap-1.5 text-zinc-700">
            <span>v</span>
            <span className="text-zinc-500">{version || '---'}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
