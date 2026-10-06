import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowsClockwise, ArrowUpRight, CircleNotch, MagnifyingGlass, TerminalWindow } from '@phosphor-icons/react';
import { getLocalhostLabel } from './browserModel';

export interface DevServerEntry {
  url: string;
  /** Answered the most recent probe. */
  live: boolean;
}

interface BrowserStartPageProps {
  servers: DevServerEntry[];
  scanning: boolean;
  onScan: () => void;
  onOpen: (input: string) => void;
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Ctrl', 'L'], label: 'Focus address bar' },
  { keys: ['Ctrl', 'T'], label: 'New tab' },
  { keys: ['Ctrl', 'W'], label: 'Close tab' },
  { keys: ['Ctrl', 'R'], label: 'Reload' },
  { keys: ['Alt', '←'], label: 'Back' },
  { keys: ['Ctrl', 'PgDn'], label: 'Next tab' },
  { keys: ['Ctrl', 'Shift', 'C'], label: 'Inspect element' },
  { keys: ['Ctrl', '+ / −'], label: 'Zoom' },
];

const RESCAN_INTERVAL_MS = 5000;

export const BrowserStartPage: React.FC<BrowserStartPageProps> = ({ servers, scanning, onScan, onOpen }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Keep the server list live while the start page is visible.
  useEffect(() => {
    onScan();
    const timer = window.setInterval(onScan, RESCAN_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [onScan]);

  return (
    <div className="bx-start">
      <div className="bx-start__inner">
        <div className="bx-start__hero">
          <h2 className="bx-start__title">New tab</h2>
          <p className="bx-start__subtitle">Preview a local dev server, or search and browse the web.</p>
        </div>

        <form
          className="bx-start__search"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim()) onOpen(query.trim());
          }}
        >
          <MagnifyingGlass size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search, enter an address, or a port like 5173"
            aria-label="Search or enter address"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="bx-btn" disabled={!query.trim()} aria-label="Go">
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </form>

        <section className="bx-start__section" aria-label="Local dev servers">
          <div className="bx-start__section-head">
            <span>Local servers</span>
            <button type="button" className="bx-btn bx-btn--sm bx-btn--label" onClick={onScan} disabled={scanning}>
              {scanning
                ? <CircleNotch size={12} className="bx-spinner" aria-hidden="true" />
                : <ArrowsClockwise size={12} aria-hidden="true" />}
              {scanning ? 'Scanning' : 'Scan'}
            </button>
          </div>
          {servers.length > 0 ? (
            <div className="bx-start__grid">
              {servers.map(({ url, live }) => (
                <button key={url} type="button" className="bx-server" onClick={() => onOpen(url)} title={`Open ${url}`}>
                  <span className="bx-server__top">
                    <span className={`bx-dot${live ? '' : ' bx-dot--idle'}`} aria-hidden="true" />
                    {live ? 'Running' : 'Not responding'}
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </span>
                  <span className="bx-server__name">{getLocalhostLabel(url)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="bx-start__empty">
              <TerminalWindow size={18} aria-hidden="true" />
              <span>
                No dev server detected yet. Start one in a terminal (for example <span className="bx-kbd">npm run dev</span>)
                and it appears here automatically.
              </span>
            </div>
          )}
        </section>

        <section className="bx-start__section" aria-label="Keyboard shortcuts">
          <div className="bx-start__section-head"><span>Shortcuts</span></div>
          <div className="bx-start__shortcuts">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.label}>
                <span>{shortcut.label}</span>
                <span className="bx-start__keys">
                  {shortcut.keys.map((key) => <span key={key} className="bx-kbd">{key}</span>)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
