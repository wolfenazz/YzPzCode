import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowClockwise,
  Check,
  CheckCircle,
  ChatCircleDots,
  Copy,
  Crosshair,
  DownloadSimple,
} from '@phosphor-icons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useUpdaterStore } from '../../stores/updaterStore';
import { useAppStore } from '../../stores/appStore';
import { TerminalStatusBar } from '../workspace/TerminalStatusBar';
import discordLogo from '../../assets/discordLOGO.png';
import instagramLogo from '../../assets/Instagramlogo.png';

const GITHUB_ISSUES_URL = 'https://github.com/wolfenazz/YzPzCode/issues';

type ContactKind = 'discord' | 'instagram';

interface Author {
  name: string;
  discord: string | null;
  instagram: string | null;
}

const authors: Author[] = [
  { name: 'Naseem', discord: '@ws.', instagram: null },
  { name: 'Noor', discord: '@sjc0', instagram: '@luvnoorl' },
  { name: 'Khalid', discord: null, instagram: null },
];

const NOOR_DISCORD_TINT =
  'brightness(0) saturate(100%) invert(47%) sepia(89%) saturate(2878%) hue-rotate(312deg) brightness(99%) contrast(101%)';

function getGridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

interface ContactRowProps {
  icon: string;
  alt: string;
  handle: string;
  copied: boolean;
  tint?: string;
  onCopy: () => void;
}

const ContactRow: React.FC<ContactRowProps> = ({ icon, alt, handle, copied, tint, onCopy }) => (
  <div className="statusbar-popover__row">
    <img src={icon} alt={alt} style={tint ? { filter: tint } : undefined} />
    <span className="statusbar-popover__handle">{handle}</span>
    <button
      type="button"
      onClick={onCopy}
      className={`chrome-btn statusbar-popover__copy ${copied ? 'is-copied' : ''}`}
      title={copied ? 'Copied' : `Copy ${handle.replace('@', '')}`}
      aria-label={copied ? 'Copied' : `Copy ${alt} handle`}
    >
      {copied ? <Check size={13} weight="bold" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  </div>
);

/** "Designed and built by …" — each name with contact details opens a small popover. */
const Credits: React.FC = () => {
  const [openAuthor, setOpenAuthor] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ author: string; kind: ContactKind } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openAuthor) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenAuthor(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenAuthor(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openAuthor]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyHandle = async (handle: string, author: string, kind: ContactKind) => {
    try {
      await navigator.clipboard.writeText(handle.replace('@', ''));
      setCopied({ author, kind });
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div ref={rootRef} className="statusbar-credits">
      <span>Designed and built by</span>
      {authors.map((author, index) => {
        const hasContact = Boolean(author.discord || author.instagram);
        const isOpen = openAuthor === author.name;
        return (
          <React.Fragment key={author.name}>
            <span className="statusbar-credits__person">
              {hasContact ? (
                <button
                  type="button"
                  className="statusbar-credits__name"
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  onClick={() => setOpenAuthor(isOpen ? null : author.name)}
                >
                  {author.name}
                </button>
              ) : (
                <span className="statusbar-credits__plain">{author.name}</span>
              )}
              {isOpen && (
                <div className="statusbar-popover animate-popover-in" role="group" aria-label={`${author.name} contact`}>
                  {author.discord && (
                    <ContactRow
                      icon={discordLogo}
                      alt="Discord"
                      handle={author.discord}
                      tint={author.name === 'Noor' ? NOOR_DISCORD_TINT : undefined}
                      copied={copied?.author === author.name && copied.kind === 'discord'}
                      onCopy={() => copyHandle(author.discord!, author.name, 'discord')}
                    />
                  )}
                  {author.instagram && (
                    <ContactRow
                      icon={instagramLogo}
                      alt="Instagram"
                      handle={author.instagram}
                      copied={copied?.author === author.name && copied.kind === 'instagram'}
                      onCopy={() => copyHandle(author.instagram!, author.name, 'instagram')}
                    />
                  )}
                </div>
              )}
            </span>
            {index < authors.length - 1 && <span className="statusbar-credits__amp" aria-hidden="true">&amp;</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
};

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
  const showWorkspaceStatus = Boolean(currentWorkspace) || sessions.length > 0;

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

  useEffect(() => {
    if (upToDate) {
      const timer = setTimeout(() => {
        resetUpToDate();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [upToDate, resetUpToDate]);

  return (
    <footer className="statusbar" aria-label="Status bar">
      {/* Left: this workspace */}
      <div className="statusbar__group">
        {showWorkspaceStatus && (
          <>
            <div className="statusbar__item" role="status">
              <span className={`statusbar__dot ${sessions.length > 0 ? 'is-live' : ''}`} aria-hidden="true" />
              <span>
                <strong>{sessions.length}</strong> {sessions.length === 1 ? 'session' : 'sessions'}
              </span>
            </div>
            {currentWorkspace && (
              <div className="statusbar__item">
                <span>Layout</span>
                <strong>{cols} × {rows}</strong>
              </div>
            )}
          </>
        )}
        <TerminalStatusBar />
      </div>

      {/* Center: credits, setup screen only */}
      <div className="statusbar__group">{view === 'setup' && <Credits />}</div>

      {/* Right: the app */}
      <div className="statusbar__group statusbar__group--end" role="group" aria-label="Application utilities">
        {checking && (
          <div className="statusbar__item">
            <ArrowClockwise size={12} className="animate-spin-slow" aria-hidden="true" />
            <span>Checking for updates</span>
          </div>
        )}

        {!checking && upToDate && (
          <div className="statusbar__item statusbar__item--ok" role="status">
            <CheckCircle size={12} weight="fill" aria-hidden="true" />
            <span>Up to date</span>
          </div>
        )}

        {!checking && !downloading && updateAvailable && (
          <button
            type="button"
            onClick={downloadAndInstall}
            className="statusbar__item statusbar__item--warn"
            title={`Download and install v${updateAvailable.version}`}
          >
            <DownloadSimple size={12} weight="bold" aria-hidden="true" />
            <span>Update to v{updateAvailable.version}</span>
          </button>
        )}

        {downloading && (
          <div className="statusbar__item statusbar__item--ok" role="status">
            <div className="statusbar__progress" aria-hidden="true">
              <span style={{ width: `${downloadProgress}%` }} />
            </div>
            <span className="tabular-nums">Downloading {downloadProgress}%</span>
          </div>
        )}

        {!checking && !downloading && !updateAvailable && !upToDate && (
          <button type="button" onClick={() => checkForUpdates(true)} className="statusbar__item">
            <ArrowClockwise size={12} aria-hidden="true" />
            <span>Check for updates</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            void openUrl(GITHUB_ISSUES_URL).catch((error: unknown) => {
              console.error('Failed to open GitHub Issues:', error);
            });
          }}
          className="statusbar__item"
          title="Report an issue or share feedback on GitHub"
        >
          <ChatCircleDots size={12} aria-hidden="true" />
          <span>Feedback</span>
        </button>

        <button
          type="button"
          onClick={() => setCustomCursor(!customCursor)}
          className="statusbar__item"
          title={customCursor ? 'Disable custom cursor' : 'Enable custom cursor'}
          aria-pressed={customCursor}
          aria-label="Custom cursor"
        >
          <Crosshair size={12} weight={customCursor ? 'bold' : 'regular'} aria-hidden="true" />
        </button>

        <span className="statusbar__sep" aria-hidden="true" />

        <span className="statusbar__item statusbar__item--version" title={`YzPzCode version ${appVersion || 'development'}`}>
          v{appVersion || '—'}
        </span>
      </div>
    </footer>
  );
};
