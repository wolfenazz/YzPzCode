import React from 'react';
import { ArrowRight, DownloadSimple, X } from '@phosphor-icons/react';
import { useUpdaterStore } from '../../stores/updaterStore';

export const UpdateNotification: React.FC = () => {
  const {
    checking,
    downloading,
    downloadProgress,
    updateAvailable,
    error,
    checkForUpdates,
    downloadAndInstall,
    dismissUpdate,
  } = useUpdaterStore();

  React.useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  if (!updateAvailable) {
    return null;
  }

  const progress = Math.min(100, Math.max(0, downloadProgress));
  const installing = downloading && progress === 100;

  return (
    <section
      aria-label="Application update"
      className="fixed bottom-12 right-3 z-50 w-[min(368px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-[0_24px_64px_rgba(0,0,0,0.35)] sm:right-4"
    >
      <div className="px-5 pb-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-light)] text-[var(--accent)]">
              <DownloadSimple size={21} weight="duotone" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                YzPzCode / Update
              </p>
              <h2 className="mt-0.5 text-[17px] font-semibold leading-tight tracking-[-0.03em]">
                {installing ? 'Installing update' : downloading ? 'Downloading update' : 'A new version is ready'}
              </h2>
            </div>
          </div>
          {!downloading && (
            <button
              type="button"
              onClick={dismissUpdate}
              aria-label="Dismiss update"
              className="-mr-1 -mt-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-xs tabular-nums">
          <div className="min-w-0">
            <span className="block text-[10px] text-[var(--text-secondary)]">CURRENT</span>
            <span className="block truncate font-semibold">v{updateAvailable.currentVersion}</span>
          </div>
          <div className="flex min-w-4 flex-1 items-center gap-1 text-[var(--text-secondary)]" aria-hidden="true">
            <span className="h-px flex-1 bg-[var(--border-primary)]" />
            <ArrowRight size={13} />
          </div>
          <div className="min-w-0 text-right">
            <span className="block text-[10px] text-[var(--text-secondary)]">NEW BUILD</span>
            <span className="block truncate font-semibold text-[var(--accent)]">v{updateAvailable.version}</span>
          </div>
        </div>

        {downloading ? (
          <div className="mt-5">
            <div className="flex items-end justify-between gap-4">
              <div className="pb-1">
                <p className="text-sm font-medium">
                  {installing ? 'Finalizing installation' : progress === 0 ? 'Preparing download' : 'Update in progress'}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                  {installing ? 'Restarting the app shortly.' : 'The app will restart when it is ready.'}
                </p>
              </div>
              <div className="shrink-0 font-[var(--font-display)] text-[46px] font-semibold leading-none tracking-[-0.07em] tabular-nums">
                {progress}<span className="ml-1 text-lg tracking-normal text-[var(--text-secondary)]">%</span>
              </div>
            </div>
            <div
              role="progressbar"
              aria-label={installing ? 'Update downloaded' : 'Update download'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]"
            >
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              <span>{installing ? 'Download complete' : 'Receiving files'}</span>
              <span>{installing ? 'Restart pending' : 'Install next'}</span>
            </div>
          </div>
        ) : (
          <>
            {updateAvailable.body && (
              <p className="mt-4 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
                {updateAvailable.body}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-400">
                {error}
              </p>
            )}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void downloadAndInstall()}
                disabled={checking}
                className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                {checking ? 'Checking…' : 'Download & install'}
              </button>
              <button
                type="button"
                onClick={dismissUpdate}
                className="h-10 cursor-pointer rounded-lg px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                Later
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
