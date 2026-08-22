import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../../stores/appStore';
import { useUpdaterStore } from '../../../stores/updaterStore';
import { SettingsToggle } from '../../common/SettingsToggle';

export const SettingsUpdates: React.FC = () => {
  const {
    autoCheckUpdates,
    setAutoCheckUpdates,
    autoDownloadUpdates,
    setAutoDownloadUpdates,
    updateChannel,
    setUpdateChannel,
  } = useAppStore();

  const {
    checking,
    downloading,
    downloadProgress,
    updateAvailable,
    upToDate,
    error,
    lastChecked,
    checkForUpdates,
    downloadAndInstall,
    clearError,
  } = useUpdaterStore();

  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/app').then(({ getVersion }) => {
        getVersion().then(setAppVersion);
      });
    } else {
      setAppVersion('dev');
    }
  }, []);

  const formatLastChecked = (timestamp: number) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-8 font-mono">
      <div>
        <h2 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em] mb-1">Updates</h2>
        <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-mono">Manage application updates</p>
      </div>

      <div className="space-y-6">
        <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">Current Version</h3>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--text-primary)] font-mono">Version</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 font-mono">v{appVersion || '---'}</p>
            </div>
            <button
              onClick={() => checkForUpdates(true)}
              disabled={checking || downloading}
              className="px-4 py-2 rounded-md bg-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[#303030] border border-[var(--border-primary)] transition-colors cursor-pointer text-[10px] font-mono uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checking ? 'Checking...' : 'Check for Updates'}
            </button>
          </div>

          {lastChecked > 0 && (
            <p className="text-[10px] text-[var(--text-secondary)] font-mono">Last checked: {formatLastChecked(lastChecked)}</p>
          )}

          {upToDate && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-xs text-emerald-400/80 font-mono">You are up to date</span>
            </div>
          )}

          {updateAvailable && (
            <div className="flex items-center justify-between px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
              <span className="text-xs text-amber-400/80 font-mono">Update v{updateAvailable.version} available</span>
              <button
                onClick={() => downloadAndInstall()}
                className="px-3 py-1 rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer text-[10px] font-mono uppercase"
              >
                {downloading ? `Downloading ${downloadProgress}%` : 'Install'}
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between px-3 py-2 rounded-md bg-rose-500/10 border border-rose-500/20">
              <span className="text-xs text-rose-400/80 font-mono">{error}</span>
              <button
                onClick={clearError}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">Preferences</h3>

          <div className="space-y-3">
            <SettingsToggle
              enabled={autoCheckUpdates}
              onToggle={() => setAutoCheckUpdates(!autoCheckUpdates)}
              label="Auto-check for Updates"
              description="Automatically check for updates on startup"
            />

            <SettingsToggle
              enabled={autoDownloadUpdates}
              onToggle={() => setAutoDownloadUpdates(!autoDownloadUpdates)}
              label="Auto-download Updates"
              description="Download updates automatically in background"
            />
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)]/80 border border-[var(--border-primary)] backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-mono font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">Update Channel</h3>

          <div className="flex items-center gap-2">
            {(['stable', 'beta', 'nightly'] as const).map((channel) => (
              <button
                key={channel}
                onClick={() => setUpdateChannel(channel)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                  updateChannel === channel
                    ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                    : 'bg-[var(--bg-primary)]/60 text-[var(--text-secondary)] border border-[var(--border-primary)]/70 hover:text-[var(--text-primary)] hover:border-[var(--border-primary)]'
                }`}
              >
                {channel}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
