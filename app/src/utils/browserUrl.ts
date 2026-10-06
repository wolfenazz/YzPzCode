/**
 * URL helpers for the in-app browser. Kept dependency-free so the store, the
 * browser pane and node tests can all share them.
 */

/** Sentinel URL for the built-in start page. It never reaches the native webview. */
export const BROWSER_NEW_TAB_URL = 'yzpz://newtab';

export const BROWSER_SEARCH_URL = 'https://www.google.com/search?q=';

export const isNewTabUrl = (value: string | null | undefined): boolean =>
  (value ?? '').trim().toLowerCase() === BROWSER_NEW_TAB_URL;

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const LOCAL_HOST = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d{1,5})?(?:[/?#]|$)/i;
const IPV4_HOST = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?(?:[/?#]|$)/;
const PORT_ONLY = /^:?(\d{2,5})(\/.*)?$/;
const DOMAIN_LIKE = /^[^\s/?#]+\.[a-z][a-z\d-]{1,62}\.?(?::\d{1,5})?(?:[/?#]|$)/i;

/**
 * Turns whatever was typed in the address bar into a URL, the way desktop
 * browsers do:
 *  - `3000` or `:3000`        → http://localhost:3000
 *  - `localhost:5173/app`     → http://localhost:5173/app
 *  - `example.com`            → https://example.com
 *  - `how to center a div`    → a web search
 * Returns null for empty input.
 */
export const resolveOmniboxInput = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null;
  if (isNewTabUrl(value)) return BROWSER_NEW_TAB_URL;
  if (HAS_SCHEME.test(value) || /^(about|data|file|mailto):/i.test(value)) return value;

  const port = PORT_ONLY.exec(value);
  if (port) {
    const portNumber = Number(port[1]);
    if (portNumber > 0 && portNumber < 65536) return `http://localhost:${portNumber}${port[2] ?? ''}`;
  }

  if (!/\s/.test(value)) {
    if (LOCAL_HOST.test(value) || IPV4_HOST.test(value)) return `http://${value}`;
    if (DOMAIN_LIKE.test(value)) return `https://${value}`;
  }

  return `${BROWSER_SEARCH_URL}${encodeURIComponent(value)}`;
};

export const isLocalUrl = (value: string): boolean => {
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost'
      || hostname === '0.0.0.0'
      || hostname === '[::1]'
      || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  } catch {
    return false;
  }
};

export type UrlSecurity = 'secure' | 'local' | 'insecure' | 'internal';

export const getUrlSecurity = (value: string): UrlSecurity => {
  if (isNewTabUrl(value)) return 'internal';
  if (isLocalUrl(value)) return 'local';
  return value.startsWith('https://') ? 'secure' : 'insecure';
};

/** Splits a URL into the parts the address bar renders with emphasis. */
export const splitDisplayUrl = (value: string): { host: string; rest: string } => {
  if (isNewTabUrl(value)) return { host: '', rest: '' };
  try {
    const url = new URL(value);
    const rest = `${url.pathname === '/' ? '' : url.pathname}${url.search}${url.hash}`;
    return { host: url.host || url.href, rest };
  } catch {
    return { host: value.replace(/^https?:\/\//, ''), rest: '' };
  }
};

/** Short label for a tab before the page reports its own title. */
export const getUrlTabLabel = (value: string): string => {
  if (isNewTabUrl(value)) return 'New Tab';
  try {
    const url = new URL(value);
    return url.host || value;
  } catch {
    return value;
  }
};
