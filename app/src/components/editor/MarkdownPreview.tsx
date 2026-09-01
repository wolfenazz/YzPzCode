import React, { memo, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Marked, Renderer, type Tokens } from 'marked';
import hljs from 'highlight.js';

interface MarkdownPreviewProps {
  content: string;
  /** Absolute path of the markdown file being previewed. Used to resolve relative image references. */
  filePath?: string | null;
  /** Workspace root, used as the base for root-relative image references like "/docs/img.png". */
  workspacePath?: string | null;
}

const LANG_LABELS: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  rs: 'Rust',
  py: 'Python',
  rb: 'Ruby',
  go: 'Golang',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  json: 'JSON',
  jsonc: 'JSON',
  md: 'Markdown',
  yml: 'YAML',
  yaml: 'YAML',
  toml: 'TOML',
  css: 'CSS',
  scss: 'SCSS',
  html: 'HTML',
  htm: 'HTML',
  xml: 'XML',
  svg: 'SVG',
  sql: 'SQL',
  java: 'Java',
  kt: 'Kotlin',
  kts: 'Kotlin',
  c: 'C',
  cpp: 'C++',
  h: 'C',
  hpp: 'C++',
  cs: 'C#',
  swift: 'Swift',
  dart: 'Dart',
  php: 'PHP',
  lua: 'Lua',
  r: 'R',
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  graphql: 'GraphQL',
  proto: 'Protobuf',
  ini: 'INI',
  diff: 'Diff',
  ps1: 'PowerShell',
  powershell: 'PowerShell',
  vue: 'Vue',
  svelte: 'Svelte',
  solidity: 'Solidity',
  plaintext: 'Text',
  text: 'Text',
  txt: 'Text',
};

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isSafeHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith('#') || href.startsWith('/')) return true;
  return /^(https?|mailto|ftp|tel):/i.test(href);
}

function isSafeImageSrc(src: string): boolean {
  if (!src) return false;
  if (src.startsWith('/')) return true;
  return (
    /^https?:/i.test(src)
    || src.startsWith('data:image/')
    || src.startsWith('blob:')
  );
}

/**
 * A relative image reference found in markdown. `sourceHref` keeps the exact
 * text from the document; `resolvedPath` is the absolute candidate path on
 * disk (also used as the data-URL cache key).
 */
interface LocalImageRef {
  sourceHref: string;
  resolvedPath: string;
}

interface ImageResolutionContext {
  markdownDir: string | null;
  workspaceRoot: string | null;
}

/**
 * Set synchronously around each `marked.parse()` call so the image renderers
 * know where the previewed markdown file lives. Parsing is synchronous, so a
 * single module-level slot is race-free.
 */
let activeImageContext: ImageResolutionContext | null = null;

function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Collapses `.` / `..` segments lexically without touching the filesystem.
 * Path traversal can't be escaped into the OS here: the joined path is later
 * rejected by the Rust `read_file_as_base64` command, which forbids `..` and
 * missing files outright — this only exists so `docs/../img/x.png` inside the
 * workspace resolves to `img/x.png` instead of failing.
 */
function collapseRelativeSegments(path: string): string {
  const stack: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join('/');
}

/**
 * Resolves an image reference from a markdown document to an absolute
 * filesystem path. Handles the three flavors that appear in real READMEs:
 * - `docs/capture/img.png`          → relative to the markdown file's folder
 * - `/docs/capture/img.png`         → relative to the workspace root
 * - `https://...` / `data:` / `blob:` → not local, returned untouched
 *
 * Windows-style separators (`docs\capture\img.png`) are normalized, since
 * raw-HTML markdown commonly mixes them.
 */
function resolveLocalImageRef(
  href: string,
  markdownDir: string | null,
  workspaceRoot: string | null,
): LocalImageRef | null {
  const trimmed = href.trim();
  if (!trimmed || /^(https?|data|blob|mailto|ftp|tel):/i.test(trimmed) || trimmed.startsWith('#')) return null;
  if (!markdownDir) return null;

  const decoded = (() => {
    const withoutQuery = trimmed.replace(/[?#].*$/, '');
    try {
      return decodeURIComponent(withoutQuery);
    } catch {
      // Malformed percent-encoding — fall back to the raw text.
      return withoutQuery;
    }
  })();

  let segments: string;
  if (decoded.startsWith('/')) {
    if (!workspaceRoot) return null;
    segments = normalizePathSeparators(workspaceRoot) + decoded;
  } else if (/^[A-Za-z]:/.test(decoded)) {
    // Already-absolute Windows path — use as-is.
    segments = normalizePathSeparators(decoded);
  } else {
    segments = normalizePathSeparators(markdownDir).replace(/\/+$/, '') + '/' + decoded;
  }

  return {
    sourceHref: trimmed,
    resolvedPath: collapseRelativeSegments(segments),
  };
}

/**
 * Cache of resolved image paths → loaded data URLs, shared per webview.
 * Keyed on the absolute resolved path (not the raw href) so identical relative
 * references from markdown files in different folders never collide.
 */
const imageDataUrlCache = new Map<string, string>();
const MAX_IMAGE_CACHE = 40;
const pendingImageLoads = new Map<string, Promise<string>>();

async function loadImageDataUrl(resolvedPath: string): Promise<string> {
  const cached = imageDataUrlCache.get(resolvedPath);
  if (cached) return cached;

  const inFlight = pendingImageLoads.get(resolvedPath);
  if (inFlight) return inFlight;

  const load = invoke<string>('read_file_as_base64', { path: resolvedPath })
    .then((dataUrl) => {
      if (imageDataUrlCache.size >= MAX_IMAGE_CACHE) {
        const oldest = imageDataUrlCache.keys().next().value;
        if (oldest) imageDataUrlCache.delete(oldest);
      }
      imageDataUrlCache.set(resolvedPath, dataUrl);
      return dataUrl;
    })
    .finally(() => {
      pendingImageLoads.delete(resolvedPath);
    });

  pendingImageLoads.set(resolvedPath, load);
  return load;
}

/** Inline SVG shown when a local image can't be loaded (missing file, bad path). */
const BROKEN_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160" viewBox="0 0 280 160">' +
      '<rect width="280" height="160" rx="12" fill="#1f1f1f" stroke="#3e3e38" stroke-dasharray="6 4"/>' +
      '<g fill="none" stroke="#6e6a60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="112" y="52" width="56" height="44" rx="6"/>' +
      '<circle cx="130" cy="66" r="4"/>' +
      '<path d="M112 88l14-12 10 8 12-14 20 18"/>' +
      '</g>' +
      '<text x="140" y="122" text-anchor="middle" font-family="monospace" font-size="11" fill="#8f8b80">image not found</text>' +
    '</svg>',
  );

/**
 * Rewrites raw-HTML `<img>` tags inside markdown documents. READMEs commonly
 * embed screenshots as literal HTML (marked passes these through untouched,
 * bypassing the `image()` renderer above), and the webview can't resolve
 * relative `src` values — so they are converted into hydratable placeholders.
 */
function rewriteRawHtmlImages(rawHtml: string): string {
  const ctx = activeImageContext;
  if (!ctx) return rawHtml;
  return rawHtml.replace(/<img\b([^>]*)>/gi, (match, attrs: string) => {
    if (/\bdata-md-image-src\b/i.test(attrs)) return match;
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!srcMatch) return match;
    const rawSrc = srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? '';
    const localRef = resolveLocalImageRef(rawSrc, ctx.markdownDir, ctx.workspaceRoot);
    if (!localRef) return match;
    // Drop a trailing self-closing slash so appended attributes stay parseable,
    // and make sure the shimmer class lands on the element (original classes,
    // e.g. style helpers in README tables, are preserved).
    const withoutClose = attrs.replace(/\/\s*$/, '');
    const withSrc = withoutClose.replace(
      /\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,
      `data-md-image-src="${escapeAttr(localRef.resolvedPath)}"`,
    );
    const withClass = /\bclass\s*=/i.test(withSrc)
      ? withSrc.replace(/\bclass\s*=\s*"([^"]*)"/i, (_, existing: string) => `class="${existing} md-image-loading"`)
      : `${withSrc} class="md-image-loading"`;
    return `<img${withClass} data-md-image-href="${escapeAttr(localRef.sourceHref)}">`;
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~[\]()#!+]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const COPY_ICON =
  '<svg class="md-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">' +
  '<rect x="9" y="9" width="13" height="13" rx="2" />' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />' +
  '</svg>';

class PreviewRenderer extends Renderer {
  code({ text, lang }: Tokens.Code): string {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(text, { language }).value;
    const label = LANG_LABELS[language] ?? language;
    return (
      '<div class="md-code-wrapper">' +
      '<div class="md-code-head">' +
      `<span class="md-code-lang">${label}</span>` +
      `<button type="button" class="md-copy-btn" aria-label="Copy code">${COPY_ICON}<span class="md-copy-label">Copy</span></button>` +
      '</div>' +
      `<pre class="md-code-block"><code class="hljs language-${language}">${highlighted}</code></pre>` +
      '</div>'
    );
  }

  heading({ tokens, depth, text }: Tokens.Heading): string {
    const slug = slugify(text);
    const inner = this.parser.parseInline(tokens) as string;
    return `<h${depth} id="${slug}"><a class="md-anchor" href="#${slug}" aria-hidden="true"></a>${inner}</h${depth}>`;
  }

  link({ href, title, tokens }: Tokens.Link): string {
    const inner = this.parser.parseInline(tokens) as string;
    const safeHref = isSafeHref(href) ? href : '#';
    const external = /^https?:/i.test(safeHref);
    const target = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
    return `<a class="md-link" href="${escapeAttr(safeHref)}"${titleAttr}${target}>${inner}</a>`;
  }

  image({ href, title, text }: Tokens.Image): string {
    const altAttr = ` alt="${escapeAttr(text)}"`;
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
    const caption = title ? `<figcaption>${escapeAttr(title)}</figcaption>` : '';

    // Local (relative / root-relative / absolute-disk) image references can't be
    // loaded by the webview directly, so emit a placeholder figure. The effect
    // below loads each one via the `read_file_as_base64` Tauri command and
    // swaps in a data URL.
    const localRef = activeImageContext
      ? resolveLocalImageRef(href, activeImageContext.markdownDir, activeImageContext.workspaceRoot)
      : null;

    if (localRef) {
      return (
        `<figure class="md-image md-image-loading">` +
        `<img${altAttr} loading="lazy" referrerPolicy="no-referrer"` +
        ` data-md-image-src="${escapeAttr(localRef.resolvedPath)}"` +
        ` data-md-image-href="${escapeAttr(localRef.sourceHref)}" />` +
        caption +
        '</figure>'
      );
    }

    const src = isSafeImageSrc(href) ? href : '';
    return `<figure class="md-image"><img src="${escapeAttr(src)}"${altAttr}${titleAttr} loading="lazy" referrerPolicy="no-referrer" />${caption}</figure>`;
  }

  table(token: Tokens.Table): string {
    const renderCell = (cell: Tokens.TableCell): string => {
      const tag = cell.header ? 'th' : 'td';
      const align = cell.align ? ` style="text-align:${cell.align}"` : '';
      const inner = this.parser.parseInline(cell.tokens) as string;
      return `<${tag}${align}>${inner}</${tag}>`;
    };
    const header = token.header.map((cell) => renderCell(cell)).join('');
    const rows = token.rows
      .map((row) => `<tr>${row.map((cell) => renderCell(cell)).join('')}</tr>`)
      .join('');
    return (
      '<div class="md-table-wrap">' +
      '<div class="md-table-scroll">' +
      `<table class="md-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>` +
      '</div>' +
      '</div>'
    );
  }
}

const renderer = new PreviewRenderer();

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer,
});

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);
  const lastUpdateRef = useRef(Date.now());

  if (Date.now() - lastUpdateRef.current >= delay || value === debouncedValue) {
    lastUpdateRef.current = Date.now();
    if (value !== debouncedValue) {
      setDebouncedValue(value);
    }
  }

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
      lastUpdateRef.current = Date.now();
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

const MarkdownPreviewInner: React.FC<MarkdownPreviewProps> = ({ content, filePath, workspacePath }) => {
  const debouncedContent = useDebouncedValue(content, 300);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const html = useMemo(() => {
    // Derive the markdown file's folder so relative image refs can be resolved
    // to workspace files. No path → no way to resolve; remote images still work.
    let markdownDir: string | null = null;
    if (filePath) {
      const normalized = filePath.replace(/\\/g, '/');
      const lastSlash = normalized.lastIndexOf('/');
      markdownDir = lastSlash > 0
        ? normalized.slice(0, lastSlash)
        : null;
    }

    activeImageContext = { markdownDir, workspaceRoot: workspacePath ?? null };
    try {
      const parsed = marked.parse(debouncedContent) as string;
      return rewriteRawHtmlImages(parsed);
    } catch {
      return '<p>Failed to render markdown</p>';
    } finally {
      activeImageContext = null;
    }
  }, [debouncedContent, filePath, workspacePath]);

  /**
   * Local images are emitted as placeholders (`data-md-image-src`), then loaded
   * through the `read_file_as_base64` Tauri command and swapped to data URLs.
   * Effects after html changes cover both renderer-produced figures and
   * rewritten raw-HTML `<img>` tags.
   */
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const placeholders = Array.from(
      root.querySelectorAll<HTMLImageElement>('img[data-md-image-src]'),
    );
    if (placeholders.length === 0) return;

    let cancelled = false;
    const failures = new Set<string>();

    placeholders.forEach((img) => {
      const resolvedPath = img.dataset.mdImageSrc ?? '';
      const figure = img.closest<HTMLElement>('.md-image');
      // Raw-HTML images have no figure wrapper; style them via the img itself.
      const holder: HTMLElement = figure ?? img;
      if (!resolvedPath) {
        holder.classList.add('md-image-error');
        holder.classList.remove('md-image-loading');
        img.src = BROKEN_IMAGE_PLACEHOLDER;
        return;
      }

      const cached = imageDataUrlCache.get(resolvedPath);
      if (cached) {
        img.src = cached;
        holder.classList.remove('md-image-loading');
        return;
      }

      if (failures.has(resolvedPath)) {
        holder.classList.add('md-image-error');
        holder.classList.remove('md-image-loading');
        img.src = BROKEN_IMAGE_PLACEHOLDER;
        return;
      }

      loadImageDataUrl(resolvedPath)
        .then((dataUrl) => {
          if (cancelled) return;
          img.src = dataUrl;
          holder.classList.remove('md-image-loading');
        })
        .catch(() => {
          if (cancelled) return;
          failures.add(resolvedPath);
          holder.classList.add('md-image-error');
          holder.classList.remove('md-image-loading');
          img.src = BROKEN_IMAGE_PLACEHOLDER;
        });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  const handleContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('.md-copy-btn');
    if (!button) return;
    const wrapper = button.closest<HTMLElement>('.md-code-wrapper');
    const code = wrapper?.querySelector<HTMLElement>('pre code');
    const text = code?.textContent ?? '';
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      const label = button.querySelector('.md-copy-label');
      if (!label) return;
      const original = label.textContent ?? 'Copy';
      label.textContent = 'Copied';
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        label.textContent = original;
        copyTimerRef.current = null;
      }, 1600);
    });
  };

  return (
    <div
      className="markdown-preview absolute inset-0 overflow-y-auto overflow-x-hidden markdown-dark"
      onClick={handleContainerClick}
    >
      <article ref={containerRef} className="md-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

export const MarkdownPreview = memo(MarkdownPreviewInner);
