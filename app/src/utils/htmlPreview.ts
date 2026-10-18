/**
 * Helpers for the editor's HTML preview (`components/editor/HtmlPreview.tsx`).
 *
 * The page is drawn in a sandboxed `srcdoc` frame, so it has no location of its
 * own: files it links to by a relative path (`./style.css`, `img/logo.png`) are
 * rewritten here to URLs the `yzpzmedia` protocol can serve.
 */

export const HTML_EXTENSIONS = new Set(['html', 'htm', 'xhtml']);

export const isHtmlExtension = (extension: string | null | undefined): boolean =>
  Boolean(extension) && HTML_EXTENSIONS.has(extension!.toLowerCase());

// Anything with a scheme (`https:`, `data:`, `mailto:`), a protocol-relative `//host`,
// a bare `#fragment`, or a root-relative `/path` is not a file next to the page.
const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/i;

const splitPath = (path: string): string[] => path.split(/[\\/]+/);

/**
 * Absolute file path a relative reference in `filePath`'s page points to, or null
 * when the reference is not a relative file path.
 */
export const resolveLocalReference = (reference: string, filePath: string): string | null => {
  const trimmed = reference.trim();
  if (!trimmed || NOT_RELATIVE.test(trimmed)) return null;
  const withoutSuffix = trimmed.replace(/[?#].*$/, '');
  if (!withoutSuffix) return null;

  let decoded = withoutSuffix;
  try { decoded = decodeURIComponent(withoutSuffix); } catch { /* keep the raw text */ }

  const separator = filePath.includes('\\') ? '\\' : '/';
  const parts = splitPath(filePath);
  parts.pop(); // the file name
  for (const segment of splitPath(decoded)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length > 1) parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join(separator);
};

/** Rewrites `url(…)` references in CSS text. `toUrl` maps an absolute file path to a loadable URL. */
export const rewriteCssUrls = (css: string, filePath: string, toUrl: (path: string) => string): string =>
  css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (match, quote: string, reference: string) => {
    const resolved = resolveLocalReference(reference, filePath);
    return resolved ? `url(${quote}${toUrl(resolved)}${quote})` : match;
  });

// Attributes that load a file, per element. Links (`<a href>`) are left alone.
const FILE_ATTRIBUTES: Array<[selector: string, attribute: string]> = [
  ['img[src]', 'src'],
  ['script[src]', 'src'],
  ['link[href]', 'href'],
  ['source[src]', 'src'],
  ['video[src]', 'src'],
  ['video[poster]', 'poster'],
  ['audio[src]', 'src'],
  ['track[src]', 'src'],
  ['image[href]', 'href'],
  ['use[href]', 'href'],
];

// Runs first in the frame: a click on a link scrolls to its anchor, anything else is
// dropped, because a relative link would otherwise navigate the frame away from the page.
const LINK_GUARD = `document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'';if(h.charAt(0)==='#'){e.preventDefault();var id=decodeURIComponent(h.slice(1));var t=id?document.getElementById(id)||document.getElementsByName(id)[0]:document.documentElement;if(t&&t.scrollIntoView)t.scrollIntoView();return;}e.preventDefault();},true);`;

/** The `srcdoc` for a page: relative files rewritten to loadable URLs and links held in place. */
export const buildHtmlPreview = (html: string, filePath: string, toUrl: (path: string) => string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  for (const [selector, attribute] of FILE_ATTRIBUTES) {
    doc.querySelectorAll(selector).forEach((element) => {
      const resolved = resolveLocalReference(element.getAttribute(attribute) ?? '', filePath);
      if (!resolved) return;
      element.setAttribute(attribute, toUrl(resolved));
      // A hash check cannot be made on a cross-origin file the page did not request with CORS.
      element.removeAttribute('integrity');
    });
  }
  doc.querySelectorAll('style').forEach((style) => {
    if (style.textContent) style.textContent = rewriteCssUrls(style.textContent, filePath, toUrl);
  });
  doc.querySelectorAll('[style]').forEach((element) => {
    element.setAttribute('style', rewriteCssUrls(element.getAttribute('style') ?? '', filePath, toUrl));
  });

  const guard = doc.createElement('script');
  guard.textContent = LINK_GUARD;
  doc.head.insertBefore(guard, doc.head.firstChild);

  return `<!doctype html>${doc.documentElement.outerHTML}`;
};
