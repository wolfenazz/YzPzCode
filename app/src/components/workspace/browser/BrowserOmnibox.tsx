import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Check, Copy, House, LockSimple, MagnifyingGlass, TerminalWindow, Warning } from '@phosphor-icons/react';
import { getUrlSecurity, isNewTabUrl, splitDisplayUrl } from '../../../utils/browserUrl';

export interface BrowserOmniboxHandle {
  focus: () => void;
}

interface BrowserOmniboxProps {
  url: string;
  onSubmit: (input: string) => void;
  onCopy: () => void;
}

const SECURITY_LABEL = {
  secure: 'Connection is secure',
  local: 'Local development server',
  insecure: 'Connection is not secure',
  internal: 'Start page',
} as const;

/**
 * Address bar. While focused it owns its draft, so page events (title or
 * URL updates) never overwrite what the user is typing; on blur it shows the
 * live URL with the host emphasised.
 */
export const BrowserOmnibox = forwardRef<BrowserOmniboxHandle, BrowserOmniboxProps>(({ url, onSubmit, onCopy }, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const isStartPage = isNewTabUrl(url);
  const security = getUrlSecurity(url);
  const { host, rest } = splitDisplayUrl(url);

  const beginEditing = () => {
    setDraft(isStartPage ? '' : url);
    setFocused(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  useImperativeHandle(ref, () => ({ focus: beginEditing }));

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const securityIcon = security === 'secure'
    ? <LockSimple size={13} weight="bold" aria-hidden="true" />
    : security === 'local'
      ? <TerminalWindow size={13} aria-hidden="true" />
      : security === 'internal'
        ? <House size={13} aria-hidden="true" />
        : <Warning size={13} aria-hidden="true" />;

  return (
    <div className={`bx-omnibox${focused ? ' is-focused' : ''}`} onMouseDown={(event) => {
      if (!focused && event.target === event.currentTarget) {
        event.preventDefault();
        beginEditing();
      }
    }}>
      {focused ? (
        <span className="bx-omnibox__security" aria-hidden="true">
          <MagnifyingGlass size={13} />
        </span>
      ) : (
        <span
          className={`bx-omnibox__security bx-omnibox__security--${security}`}
          title={SECURITY_LABEL[security]}
          role="img"
          aria-label={SECURITY_LABEL[security]}
        >
          {securityIcon}
          {security === 'local' && <span className="bx-hide-compact">Local</span>}
        </span>
      )}

      {focused ? (
        <input
          ref={inputRef}
          className="bx-omnibox__input"
          value={draft}
          spellCheck={false}
          autoComplete="off"
          aria-label="Address and search bar"
          placeholder="Search or enter address — try 3000 for localhost:3000"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const value = draft.trim();
              setFocused(false);
              inputRef.current?.blur();
              if (value) onSubmit(value);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(url);
              setFocused(false);
              inputRef.current?.blur();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="bx-omnibox__display"
          onClick={beginEditing}
          onFocus={beginEditing}
          aria-label={isStartPage ? 'Search or enter address' : `Address: ${url}. Click to edit`}
          title={isStartPage ? undefined : url}
        >
          {isStartPage ? (
            <span className="bx-omnibox__rest">Search or enter address</span>
          ) : (
            <>
              <span>{host}</span>
              <span className="bx-omnibox__rest">{rest}</span>
            </>
          )}
        </button>
      )}

      {!isStartPage && !focused && (
        <div className="bx-omnibox__actions">
          <button
            type="button"
            className="bx-btn bx-btn--sm"
            onClick={() => {
              onCopy();
              setCopied(true);
            }}
            aria-label={copied ? 'URL copied' : 'Copy URL'}
            title={copied ? 'Copied' : 'Copy URL'}
          >
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
});

BrowserOmnibox.displayName = 'BrowserOmnibox';
