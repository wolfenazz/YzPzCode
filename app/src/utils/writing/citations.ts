// Reference parsing and formatting for APA 7, IEEE, Harvard, MLA 9 and
// Chicago (author-date). Dependency-free (tested by `npm run test:writing`).

import type { CitationStyle, Reference } from './types';

export const CITATION_STYLES: Array<{ id: CitationStyle; label: string; example: string }> = [
  { id: 'apa', label: 'APA 7', example: '(Smith & Lee, 2024)' },
  { id: 'ieee', label: 'IEEE', example: '[1]' },
  { id: 'harvard', label: 'Harvard', example: '(Smith and Lee 2024)' },
  { id: 'mla', label: 'MLA 9', example: '(Smith and Lee 12)' },
  { id: 'chicago', label: 'Chicago', example: '(Smith and Lee 2024)' },
];

export const isNumericStyle = (style: CitationStyle): boolean => style === 'ieee';

export function splitAuthors(authors: string): string[] {
  return authors
    .split(/\s*;\s*|\s+and\s+|\s*&\s*/i)
    .map((author) => author.trim())
    .filter(Boolean);
}

/** "Smith, J. A." or "Jane A. Smith" → "Smith". */
export function surname(author: string): string {
  const trimmed = author.trim();
  if (trimmed.includes(',')) return trimmed.split(',')[0].trim();
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] ?? trimmed;
}

/** "Smith, Jane Anne" or "Jane Anne Smith" → "J. A." */
function initials(author: string): string {
  const trimmed = author.trim();
  const given = trimmed.includes(',') ? trimmed.split(',').slice(1).join(' ') : trimmed.split(/\s+/).slice(0, -1).join(' ');
  return given
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ');
}

const invert = (author: string): string => {
  const init = initials(author);
  return init ? `${surname(author)}, ${init}` : surname(author);
};

const forward = (author: string): string => {
  const init = initials(author);
  return init ? `${init} ${surname(author)}` : surname(author);
};

function joinList(items: string[], conjunction: string, serialComma = true): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}${serialComma ? ',' : ''} ${conjunction} ${items[items.length - 1]}`;
}

const withPeriod = (value: string): string => (value && !/[.?!]$/.test(value.trim()) ? `${value.trim()}.` : value.trim());

/** In-text citation for one or more references. `numbers` maps reference ids to IEEE numbers. */
export function formatInText(
  refs: Reference[],
  style: CitationStyle,
  locator = '',
  numbers: Map<string, number> = new Map(),
): string {
  if (refs.length === 0) return style === 'ieee' ? '[?]' : '(?)';
  if (style === 'ieee') {
    const list = refs.map((ref) => numbers.get(ref.id) ?? '?').join('], [');
    return `[${list}${locator ? `, ${locator}` : ''}]`;
  }
  const one = (ref: Reference): string => {
    const names = splitAuthors(ref.authors).map(surname);
    let who: string;
    if (names.length === 0) who = ref.title.split(/\s+/).slice(0, 3).join(' ');
    else if (names.length === 1) who = names[0];
    else if (names.length === 2) who = style === 'apa' ? `${names[0]} & ${names[1]}` : `${names[0]} and ${names[1]}`;
    else who = `${names[0]} et al.`;
    if (style === 'mla') return locator ? `${who} ${locator}` : who;
    const year = ref.year || 'n.d.';
    if (style === 'apa') return `${who}, ${year}${locator ? `, ${locator}` : ''}`;
    return `${who} ${year}${locator ? `, ${locator}` : ''}`;
  };
  return `(${refs.map(one).join('; ')})`;
}

/** A bibliography entry as plain text with `*italic*` markers around the title or source. */
export function formatReference(ref: Reference, style: CitationStyle, number?: number): string {
  const authors = splitAuthors(ref.authors);
  const year = ref.year || 'n.d.';
  const url = ref.url ? ` ${ref.url}` : '';
  const source = ref.source ? `*${ref.source}*` : '';
  switch (style) {
    case 'apa': {
      const names = authors.length > 20
        ? `${authors.slice(0, 19).map(invert).join(', ')}, … ${invert(authors[authors.length - 1])}`
        : authors.length === 2
          ? `${invert(authors[0])}, & ${invert(authors[1])}`
          : joinList(authors.map(invert), '&');
      const lead = names ? `${names} (${year}).` : `${withPeriod(ref.title)} (${year}).`;
      const title = names ? ` ${withPeriod(ref.title)}` : '';
      return `${lead}${title}${source ? ` ${withPeriod(source)}` : ''}${url}`.trim();
    }
    case 'ieee': {
      const names = authors.length > 6 ? `${forward(authors[0])} et al.` : joinList(authors.map(forward), 'and');
      return `[${number ?? '?'}] ${names ? `${names}, ` : ''}“${ref.title},”${source ? ` ${source},` : ''} ${year}.${url ? ` [Online]. Available:${url}` : ''}`.trim();
    }
    case 'harvard': {
      const names = joinList(authors.map(invert), 'and', false);
      return `${names ? `${names} ` : ''}(${year}) ${source ? `'${ref.title}', ${source}.` : `*${ref.title}*.`}${url ? ` Available at:${url}` : ''}`.trim();
    }
    case 'mla': {
      let names = '';
      if (authors.length === 1) names = `${surname(authors[0])}, ${authors[0].includes(',') ? authors[0].split(',').slice(1).join(',').trim() : authors[0].split(/\s+/).slice(0, -1).join(' ')}`.replace(/,\s*$/, '');
      else if (authors.length === 2) names = `${invert(authors[0])}, and ${forward(authors[1])}`;
      else if (authors.length > 2) names = `${invert(authors[0])}, et al`;
      return `${names ? withPeriod(names) + ' ' : ''}“${withPeriod(ref.title)}”${source ? ` ${source},` : ''} ${year}.${url}`.trim();
    }
    case 'chicago':
    default: {
      const names = joinList(authors.map((author, index) => (index === 0 ? invert(author) : forward(author))), 'and');
      return `${names ? withPeriod(names) + ' ' : ''}${year}. “${withPeriod(ref.title)}”${source ? ` ${withPeriod(source)}` : ''}${url}`.trim();
    }
  }
}

/** Bibliography order: IEEE by first citation, the others alphabetically by first author. */
export function orderReferences(refs: Reference[], style: CitationStyle, citedOrder: string[] = []): Reference[] {
  if (style === 'ieee') {
    const position = new Map(citedOrder.map((id, index) => [id, index]));
    return [...refs].sort((a, b) => (position.get(a.id) ?? 1e9) - (position.get(b.id) ?? 1e9));
  }
  const key = (ref: Reference): string => `${surname(splitAuthors(ref.authors)[0] ?? ref.title)} ${ref.year}`.toLowerCase();
  return [...refs].sort((a, b) => key(a).localeCompare(key(b)));
}

let referenceCounter = 0;
const makeId = (): string => {
  referenceCounter += 1;
  return `ref-${Date.now().toString(36)}-${referenceCounter.toString(36)}`;
};

/** A citation key such as `smith2024`, made unique against `taken`. */
export function makeCitationKey(ref: Pick<Reference, 'authors' | 'year' | 'title'>, taken: Set<string>): string {
  const first = splitAuthors(ref.authors)[0];
  const stem = (first ? surname(first) : ref.title.split(/\s+/)[0] ?? 'ref')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase() || 'ref';
  const base = `${stem}${ref.year.replace(/[^0-9a-z]/gi, '') || 'nd'}`;
  let key = base;
  let suffix = 0;
  while (taken.has(key)) {
    suffix += 1;
    key = `${base}${String.fromCharCode(96 + suffix)}`;
  }
  taken.add(key);
  return key;
}

/**
 * Best-effort parse of a pasted reference list, one reference per line
 * (blank lines and numbering ignored): "Authors (Year). Title. Source. URL".
 */
export function parseReferenceList(input: string, existing: Reference[] = []): Reference[] {
  const taken = new Set(existing.map((ref) => ref.key));
  const refs: Reference[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:\[\d+\]|\d+[.)])\s*/, '').trim();
    if (line.length < 8) continue;
    const urlMatch = line.match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0].replace(/[.,]$/, '') : '';
    const withoutUrl = url ? line.replace(urlMatch![0], '').trim() : line;
    const yearMatch = withoutUrl.match(/\(?\b((?:19|20)\d{2}[a-z]?|n\.d\.)\b\)?/);
    let authors = '';
    let rest = withoutUrl;
    let year = '';
    if (yearMatch && yearMatch.index !== undefined) {
      year = yearMatch[1];
      authors = withoutUrl.slice(0, yearMatch.index).replace(/[.,\s]+$/, '').trim();
      rest = withoutUrl.slice(yearMatch.index + yearMatch[0].length).replace(/^[.,:\s]+/, '');
    }
    const quoted = rest.match(/[“"]([^”"]+)[”"]/);
    let title: string;
    let source: string;
    if (quoted) {
      title = quoted[1].replace(/[.,]$/, '');
      source = rest.slice((quoted.index ?? 0) + quoted[0].length).replace(/^[.,\s]+/, '').replace(/[.\s]+$/, '');
    } else {
      const parts = rest.split(/\.\s+/);
      title = (parts[0] ?? rest).replace(/[.\s]+$/, '');
      source = parts.slice(1).join('. ').replace(/[.\s]+$/, '');
    }
    if (!title) continue;
    const ref = { id: makeId(), key: '', authors, year, title, source, url };
    ref.key = makeCitationKey(ref, taken);
    refs.push(ref);
  }
  return refs;
}
