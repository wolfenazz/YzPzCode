/**
 * SKILL.md preview helpers used by the Skills Market.
 *
 * A SKILL.md opens with a YAML frontmatter block that the catalogue returns
 * verbatim. The panel shows those values as chips and renders the rest as
 * markdown, so the block is split off before the markdown renderer sees it.
 */

/** `---` fenced block at the very start of the file (optionally after a BOM). */
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** A YAML block scalar marker on its own (`>`, `|`, `>-`, `|+`). */
const BLOCK_MARKER = /^[|>][+-]?[ \t]*/;

/** `key: value` at the start of a line. */
const PAIR = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/;

/** An indented continuation line of the previous key. */
const CONTINUATION = /^[ \t]+(\S.*)$/;

export interface SkillFrontmatter {
  /** Frontmatter pairs in file order, minus `name` and `description`. */
  meta: [string, string][];
  /** `description`, folded into one line. Null when the file has none. */
  description: string | null;
  /** Everything after the fence, ready for the markdown renderer. */
  body: string;
}

/** Collapses whitespace and drops one layer of wrapping quotes from a scalar. */
export function formatMetaValue(value: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(collapsed);
  return (quoted ? quoted[2] : collapsed).trim();
}

/** Ordered frontmatter pairs, folding indented continuations into their key. */
function parsePairs(block: string): [string, string][] {
  const pairs: [string, string][] = [];
  for (const line of block.split(/\r?\n/)) {
    const pair = PAIR.exec(line);
    if (pair) {
      pairs.push([pair[1], pair[2]]);
      continue;
    }
    const continuation = CONTINUATION.exec(line);
    const last = pairs[pairs.length - 1];
    if (continuation && last) last[1] = `${last[1]} ${continuation[1]}`;
  }
  return pairs;
}

export function splitFrontmatter(text: string): SkillFrontmatter {
  const match = FRONTMATTER.exec(text);
  if (!match) return { meta: [], description: null, body: text };
  const meta: [string, string][] = [];
  let description: string | null = null;
  for (const [key, raw] of parsePairs(match[1])) {
    const value = formatMetaValue(raw.replace(BLOCK_MARKER, ''));
    if (value === '') continue;
    if (key === 'name') continue; // already the card title
    if (key === 'description') description = description === null ? value : `${description} ${value}`;
    else meta.push([key, value]);
  }
  const body = text.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, '');
  return { meta, description, body };
}
