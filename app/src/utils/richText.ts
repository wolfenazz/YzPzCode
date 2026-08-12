const UNSAFE_TAGS_PATTERN =
  /<\s*(script|style|iframe|object|embed|link|meta|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*(script|style|iframe|object|embed|link|meta|svg|math)\s*>|<\s*(script|style|iframe|object|embed|link|meta|svg|math)\b[^>]*>/gi;

const UNSAFE_ATTRS_PATTERN = /\s+(?:on\w+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

const BLOCK_BOUNDARY_TAGS = new Set([
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'PRE',
  'HR',
  'TR',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

export const sanitizeRichText = (html: string): string => {
  if (!html) return '';
  return html
    .replace(UNSAFE_TAGS_PATTERN, '')
    .replace(UNSAFE_ATTRS_PATTERN, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '<br>');
};

const collectText = (el: Element): string => {
  const parts: string[] = [];
  el.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent ?? '');
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const childEl = child as HTMLElement;
    const tag = childEl.tagName.toUpperCase();
    if (tag === 'BR') {
      parts.push('\n');
      return;
    }
    if (tag === 'LI') {
      parts.push(`\n- ${collectText(childEl)}`);
      return;
    }
    if (tag === 'PRE') {
      parts.push(`\n${childEl.textContent ?? ''}\n`);
      return;
    }
    if (BLOCK_BOUNDARY_TAGS.has(tag)) {
      parts.push(`\n${collectText(childEl)}\n`);
      return;
    }
    parts.push(collectText(childEl));
  });
  return parts.join('');
};

export const htmlToPlainText = (html: string): string => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const raw = collectText(doc.body);
  return raw
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
