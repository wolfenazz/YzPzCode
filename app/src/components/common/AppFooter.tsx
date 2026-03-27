import React, { useState, useEffect } from 'react';
import { useUpdater } from '../../hooks/useUpdater';

export const AppFooter: React.FC = () => {
  const {
    checking,
    downloading,
    downloadProgress,
    updateAvailable,
    upToDate,
    error,
    checkForUpdates,
    downloadAndInstall,
  } = useUpdater();

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

  const handleCheck = () => {
    checkForUpdates(true);
  };

  const handleUpdate = async () => {
    await downloadAndInstall();
  };

  return (
    <footer className="flex-shrink-0 h-7 flex items-center justify-between px-3 border-t border-theme bg-theme-card select-none">
      <span className="text-[10px] text-theme-secondary font-mono uppercase tracking-widest">
        v{version || '...'}
      </span>

      <div className="flex items-center gap-2">
        {error && (
          <span className="text-[10px] text-red-400 font-mono">{error}</span>
        )}

        {checking && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-theme-secondary animate-spin-slow" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-[10px] text-theme-secondary font-mono">Checking...</span>
          </div>
        )}

        {!checking && upToDate && (
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-[10px] text-emerald-500 font-mono">Up to date</span>
          </div>
        )}

        {!checking && !downloading && updateAvailable && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-amber-400 font-mono">
              v{updateAvailable.version} available
            </span>
            <button
              onClick={handleUpdate}
              className="px-1.5 py-0.5 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors font-mono uppercase tracking-wider"
            >
              Update
            </button>
          </div>
        )}

        {downloading && (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1 bg-theme-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-200"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <span className="text-[10px] text-theme-secondary font-mono">{downloadProgress}%</span>
          </div>
        )}

        {!checking && !downloading && !updateAvailable && !upToDate && (
          <button
            onClick={handleCheck}
            className="px-1.5 py-0.5 text-[10px] text-theme-secondary hover:text-theme-main hover:bg-theme-hover border border-theme hover:border-theme-main/30 rounded transition-colors font-mono uppercase tracking-wider"
          >
            Check Updates
          </button>
        )}
      </div>
    </footer>
  );
};
