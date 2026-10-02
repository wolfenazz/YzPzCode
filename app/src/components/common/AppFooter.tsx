import React, { useState, useEffect, useRef } from 'react';
import { ArrowClockwise, CheckCircle, DownloadSimple } from '@phosphor-icons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useUpdaterStore } from '../../stores/updaterStore';
import { useAppStore } from '../../stores/appStore';
import { TerminalStatusBar } from '../workspace/TerminalStatusBar';
import discordLogo from '../../assets/discordLOGO.png';
import instagramLogo from '../../assets/Instagramlogo.png';

const GITHUB_ISSUES_URL = 'https://github.com/wolfenazz/YzPzCode/issues';

const authors = [
  { name: 'Naseem', discord: '@ws.', instagram: null },
  { name: 'Noor', discord: '@sjc0', instagram: '@luvnoorl' },
  { name: 'Khalid', discord: null, instagram: null },
];

function getGridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

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

  const { view, customCursor, setCustomCursor, sessions, currentWorkspace } = useAppStore();

  const { cols, rows } = getGridDimensions(sessions.length);

  const [appVersion, setAppVersion] = useState<string>('');
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [copiedAuthor, setCopiedAuthor] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'discord' | 'instagram' | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/app').then(({ getVersion }) => {
        getVersion().then(setAppVersion);
      });
    } else {
      setAppVersion('dev');
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const copyToClipboard = async (text: string, authorName: string, type: 'discord' | 'instagram') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAuthor(authorName);
      setCopiedType(type);
      setTimeout(() => {
        setCopiedAuthor(null);
        setCopiedType(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <>
      <footer className="app-footer select-none">
        <div className="flex h-full items-center justify-between px-3 text-[10px]">
          {/* Left: Sessions & Layout Dock */}
          <div className="app-footer__status-dock" role="status" aria-label="Workspace status">
            <div className="flex items-center gap-1.5">
              <span className={`app-footer__status-dot ${sessions.length > 0 ? 'is-active' : ''}`} aria-hidden="true" />
              <span className="text-[var(--text-secondary)] font-medium">Sessions</span>
              <span className="tabular-nums font-semibold text-[var(--text-primary)]">{sessions.length}</span>
            </div>
            {currentWorkspace && (
              <>
                <div className="app-footer__divider hidden md:block" aria-hidden="true" />
                <div className="hidden items-center gap-1.5 md:flex">
                  <span className="text-[var(--text-secondary)] font-medium">Layout</span>
                  <span className="tabular-nums font-semibold text-[var(--text-primary)]">{cols} × {rows}</span>
                </div>
              </>
            )}
          </div>

          {/* Center: Branding & Authors (main page only) */}
          {view === 'setup' && (
            <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 text-[var(--text-secondary)] lg:flex">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>Designed and built by</span>
                <div className="flex items-center gap-1">
                  {authors.map((author, index) => (
                    <React.Fragment key={author.name}>
                      <span className="relative inline-flex items-center">
                        {author.discord ? (
                          <>
                            <button
                              onClick={() => setOpenPopover(openPopover === author.name ? null : author.name)}
                              className="cursor-pointer text-[var(--text-primary)] transition-colors duration-150 hover:text-theme-main"
                            >
                              {author.name}
                            </button>
                            {openPopover === author.name && (
                              <div
                                ref={popoverRef}
                                className="app-surface absolute bottom-full left-1/2 z-50 mb-2 flex -translate-x-1/2 flex-col gap-2 whitespace-nowrap rounded-md px-3 py-2 shadow-lg animate-popover-in"
                              >
                                <div className="flex items-center gap-2">
                                  <img
                                    src={discordLogo}
                                    alt="Discord"
                                    className="w-4 h-4"
                                    style={{
                                      filter: author.name === 'Noor' ? 'brightness(0) saturate(100%) invert(47%) sepia(89%) saturate(2878%) hue-rotate(312deg) brightness(99%) contrast(101%)' : undefined
                                    }}
                                  />
                                  <span className="text-theme-main font-medium">{author.discord}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(author.discord!.replace('@', ''), author.name, 'discord');
                                    }}
                                    className="app-icon-button h-6 w-6 text-[var(--text-secondary)]"
                                  >
                                    {copiedAuthor === author.name && copiedType === 'discord' ? (
                                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : (
                                      <svg className="h-3.5 w-3.5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                                {author.instagram && (
                                  <div className="flex items-center gap-2 border-t border-[var(--border-primary)] pt-1">
                                    <img
                                      src={instagramLogo}
                                      alt="Instagram"
                                      className="w-4 h-4"
                                    />
                                    <span className="text-theme-main font-medium">{author.instagram}</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(author.instagram!.replace('@', ''), author.name, 'instagram');
                                      }}
                                      className="app-icon-button h-6 w-6 text-[var(--text-secondary)]"
                                    >
                                      {copiedAuthor === author.name && copiedType === 'instagram' ? (
                                        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      ) : (
                                        <svg className="h-3.5 w-3.5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                )}
                                <div className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-[var(--border-primary)] bg-[var(--bg-popover)]" />
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-[var(--text-primary)]">{author.name}</span>
                        )}
                      </span>
                      {index < authors.length - 1 && <span className="px-0.5 text-[var(--text-muted)]">&</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Right: Actions & Version */}
          <div className="flex items-center gap-2">
            <TerminalStatusBar />
            <div className="app-footer__action-dock" role="group" aria-label="Application utilities">
              {checking && (
                <div className="app-footer__action-item text-[var(--text-secondary)]">
                  <ArrowClockwise size={12} className="animate-spin-slow text-[var(--text-secondary)]" />
                  <span>Checking</span>
                </div>
              )}

              {!checking && upToDate && (
                <div className="app-footer__action-item app-footer__action-item--success">
                  <CheckCircle size={12} weight="fill" />
                  <span>Up to date</span>
                </div>
              )}

              {!checking && !downloading && updateAvailable && (
                <button
                  type="button"
                  onClick={downloadAndInstall}
                  className="app-footer__action-item app-footer__action-item--warning cursor-pointer"
                >
                  <DownloadSimple size={12} weight="bold" />
                  <span>Update v{updateAvailable.version}</span>
                </button>
              )}

              {downloading && (
                <div className="app-footer__action-item app-footer__action-item--success">
                  <div className="h-1 w-12 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-200"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <span className="tabular-nums">{downloadProgress}%</span>
                </div>
              )}

              {!checking && !downloading && !updateAvailable && !upToDate && (
                <button
                  type="button"
                  onClick={() => checkForUpdates(true)}
                  className="app-footer__action-item cursor-pointer"
                >
                  Check for updates
                </button>
              )}

              <div className="app-footer__divider" aria-hidden="true" />

              <button
                type="button"
                onClick={() => {
                  void openUrl(GITHUB_ISSUES_URL).catch((error: unknown) => {
                    console.error('Failed to open GitHub Issues:', error);
                  });
                }}
                className="app-footer__action-item cursor-pointer"
                title="Open GitHub Issues"
              >
                Feedback
              </button>

              <div className="app-footer__divider" aria-hidden="true" />

              <button
                type="button"
                onClick={() => setCustomCursor(!customCursor)}
                className={`app-footer__action-item app-footer__cursor-toggle cursor-pointer ${
                  customCursor ? 'is-active' : ''
                }`}
                title={customCursor ? 'Disable custom cursor' : 'Enable custom cursor'}
                aria-pressed={customCursor}
                aria-label="Toggle custom cursor"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                  <line x1="12" y1="2" x2="12" y2="7" />
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="7" y2="12" />
                  <line x1="17" y1="12" x2="22" y2="12" />
                </svg>
              </button>
            </div>

            <div className="app-footer__version-badge" title={`YzPzCode version ${appVersion || 'development'}`}>
              <span className="app-footer__version-prefix">v</span>
              <span className="app-footer__version-num tabular-nums">{appVersion || '—'}</span>
            </div>

          </div>
        </div>
      </footer>
    </>
  );
};
