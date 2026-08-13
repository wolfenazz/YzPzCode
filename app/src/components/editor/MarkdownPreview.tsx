import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Marked, Renderer, type Tokens } from 'marked';
import hljs from 'highlight.js';

interface MarkdownPreviewProps {
  content: string;
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
    const src = isSafeImageSrc(href) ? href : '';
    const altAttr = ` alt="${escapeAttr(text)}"`;
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
    const caption = title ? `<figcaption>${escapeAttr(title)}</figcaption>` : '';
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

const MarkdownPreviewInner: React.FC<MarkdownPreviewProps> = ({ content }) => {
  const debouncedContent = useDebouncedValue(content, 300);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const html = useMemo(() => {
    try {
      return marked.parse(debouncedContent) as string;
    } catch {
      return '<p>Failed to render markdown</p>';
    }
  }, [debouncedContent]);

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
      <article className="md-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

export const MarkdownPreview = memo(MarkdownPreviewInner);
