import React, { useState, useEffect, useRef } from 'react';
import { useUpdaterStore } from '../../stores/updaterStore';
import { useAppStore } from '../../stores/appStore';
import { FeedbackModal } from '../feedback/FeedbackModal';
import { TerminalStatusBar } from '../workspace/TerminalStatusBar';
import discordLogo from '../../assets/discordLOGO.png';
import instagramLogo from '../../assets/Instagramlogo.png';

const authors = [
  { name: 'Naseem', discord: '@ws.', instagram: null },
  { name: 'Noor', discord: '@sjc0', instagram: '@luvnoorl' },
  { name: 'Khalid', discord: null, instagram: null },
];

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

  const { view, customCursor, setCustomCursor } = useAppStore();

  const [appVersion, setAppVersion] = useState<string>('');
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [copiedAuthor, setCopiedAuthor] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'discord' | 'instagram' | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
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
      <footer className="flex-shrink-0 h-10 border-t border-theme bg-theme-card/40 select-none">
        <div className="h-full flex items-center justify-between px-5 font-mono text-[10px] tracking-wider uppercase">
          {/* Left: System Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-emerald-500/70">
              <span className="relative flex h-1.5 w-1.5">
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500/80"></span>
              </span>
              <span>system::ready</span>
            </div>
            <div className="hidden md:flex items-center gap-3 text-zinc-600">
              <span className="text-zinc-800">|</span>
              <span>env::production</span>
              <span className="text-zinc-800">|</span>
              <span>loc::global</span>
            </div>
          </div>

          {/* Center: Branding & Authors (main page only) */}
          {view === 'setup' && (
          <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-2 text-zinc-500">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>Built with </span>
              <svg className="w-3 h-3 text-rose-500/70 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span>by</span>
              <div className="flex items-center gap-1">
                {authors.map((author, index) => (
                  <React.Fragment key={author.name}>
                    <span className="relative inline-flex items-center">
                      {author.discord ? (
                        <>
                          <button
                            onClick={() => setOpenPopover(openPopover === author.name ? null : author.name)}
                            className="text-zinc-300 hover:text-theme-main transition-colors duration-150 cursor-pointer"
                          >
                            {author.name}
                          </button>
                          {openPopover === author.name && (
                            <div
                              ref={popoverRef}
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-theme-card border border-theme rounded-md shadow-lg flex flex-col gap-2 whitespace-nowrap z-50 animate-popover-in"
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
                                  className="p-1 hover:bg-theme-hover rounded transition-colors cursor-pointer"
                                >
                                  {copiedAuthor === author.name && copiedType === 'discord' ? (
                                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : (
                                    <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                              {author.instagram && (
                                <div className="flex items-center gap-2 pt-1 border-t border-theme">
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
                                    className="p-1 hover:bg-theme-hover rounded transition-colors cursor-pointer"
                                  >
                                    {copiedAuthor === author.name && copiedType === 'instagram' ? (
                                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : (
                                      <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              )}
                              <div className="absolute top-full left-1/2 -mt-1 w-2 h-2 bg-theme-card border-r border-b border-theme transform rotate-45 -translate-x-1/2" />
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-zinc-300">{author.name}</span>
                      )}
                    </span>
                    {index < authors.length - 1 && <span className="text-zinc-600 px-0.5">&</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Right: Actions & Version */}
          <div className="flex items-center gap-2">
            <TerminalStatusBar />
            <div className="flex items-center border border-theme rounded-sm overflow-hidden">
              {checking && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800/30">
                  <svg className="w-3 h-3 text-zinc-500 animate-spin-slow" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-zinc-500">checking</span>
                </div>
              )}

              {!checking && upToDate && (
                <div className="flex items-center gap-1 px-2 py-1 text-emerald-500/80">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>up-to-date</span>
                </div>
              )}

              {!checking && !downloading && updateAvailable && (
                <button
                  onClick={downloadAndInstall}
                  className="flex items-center gap-1.5 px-2 py-1 text-amber-500/80 hover:bg-amber-500/10 transition-colors duration-150 cursor-pointer"
                >
                  <span>●</span>
                  <span>update v{updateAvailable.version}</span>
                </button>
              )}

              {downloading && (
                <div className="flex items-center gap-2 px-2 py-1 text-emerald-500/80">
                  <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/70 transition-all duration-200"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <span>{downloadProgress}%</span>
                </div>
              )}

              {!checking && !downloading && !updateAvailable && !upToDate && (
                <button
                  onClick={() => checkForUpdates(true)}
                  className="px-2 py-1 text-zinc-500 hover:text-theme-main hover:bg-theme-hover transition-colors duration-150 cursor-pointer"
                >
                  check_updates
                </button>
              )}

              <button
                onClick={() => setIsFeedbackOpen(true)}
                className="px-2 py-1 text-zinc-500 hover:text-theme-main hover:bg-theme-hover transition-colors duration-150 border-l border-theme cursor-pointer"
              >
                feedback
              </button>

              <button
                onClick={() => setCustomCursor(!customCursor)}
                className={`px-2 py-1 transition-colors duration-150 border-l border-theme cursor-pointer ${
                  customCursor
                    ? 'text-green-500/70 hover:text-green-400 hover:bg-green-500/10'
                    : 'text-zinc-500 hover:text-theme-main hover:bg-theme-hover'
                }`}
                title={customCursor ? 'Disable custom cursor' : 'Enable custom cursor'}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                  <line x1="12" y1="2" x2="12" y2="7" />
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="7" y2="12" />
                  <line x1="17" y1="12" x2="22" y2="12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-zinc-700">
              <span>v</span>
              <span className="text-zinc-500">{appVersion || '---'}</span>
            </div>

            <a
              href="https://github.com/wolfenazz/YzPzCode"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-zinc-500 hover:text-theme-main hover:bg-theme-hover rounded transition-colors duration-150"
              title="GitHub Repository"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
          </div>
        </div>
      </footer>

      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </>
  );
};
