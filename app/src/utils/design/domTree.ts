// A read-only map of a sanitized board's markup: which element sits where. The
// sanitizer's output is regular (every element stamped `data-yz`, balanced, double-quoted
// attributes), so a small scanner is enough and no DOM is needed (tests run in Node).

const VOID = new Set(['br', 'hr', 'img', 'input', 'wbr', 'source', 'col']);

export interface MarkupNode {
  id: string;
  tag: string;
  parent: string | null;
  children: string[];
  /** Offsets into the markup: the opening tag, and the closing tag (equal to openEnd for a void element). */
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
  attrs: Record<string, string>;
}

export interface Markup {
  nodes: MarkupNode[];
  byId: Map<string, MarkupNode>;
  roots: string[];
}

export const decodeAttr = (value: string): string => value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export const encodeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s"'<>\/=]+)(?:="([^"]*)")?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) attrs[match[1]] = decodeAttr(match[2] ?? '');
  return attrs;
}

/** Scans sanitized markup into a tree of stamped elements. */
export function parseMarkup(html: string): Markup {
  const nodes: MarkupNode[] = [];
  const byId = new Map<string, MarkupNode>();
  const roots: string[] = [];
  const stack: MarkupNode[] = [];
  const skip: Array<[number, number]> = [];
  const styles = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
  let block: RegExpExecArray | null;
  while ((block = styles.exec(html))) skip.push([block.index, block.index + block[0].length]);
  const insideStyle = (at: number): [number, number] | undefined => skip.find(([from, to]) => at >= from && at < to);

  const pattern = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|[^>"])*)>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const inStyle = insideStyle(match.index);
    if (inStyle) {
      pattern.lastIndex = inStyle[1];
      continue;
    }
    const tag = match[2].toLowerCase();
    if (match[1]) {
      // A closing tag ends the nearest open element of that name.
      for (let at = stack.length - 1; at >= 0; at -= 1) {
        if (stack[at].tag === tag) {
          const node = stack[at];
          node.closeStart = match.index;
          node.closeEnd = pattern.lastIndex;
          stack.length = at;
          break;
        }
      }
      continue;
    }
    const attrs = parseAttrs(match[3]);
    const id = attrs['data-yz'];
    if (!id) continue;
    const parent = stack.length > 0 ? stack[stack.length - 1] : null;
    const end = pattern.lastIndex;
    const node: MarkupNode = {
      id,
      tag,
      parent: parent ? parent.id : null,
      children: [],
      openStart: match.index,
      openEnd: end,
      closeStart: end,
      closeEnd: end,
      attrs,
    };
    nodes.push(node);
    byId.set(id, node);
    if (parent) parent.children.push(id);
    else roots.push(id);
    if (!VOID.has(tag)) stack.push(node);
  }
  // An element never closed ends where the markup does.
  for (const open of stack) {
    open.closeStart = html.length;
    open.closeEnd = html.length;
  }
  return { nodes, byId, roots };
}

export interface TreeNode {
  id: string;
  tag: string;
  label: string;
  /** The first words of the element's own text. */
  text: string;
  children: TreeNode[];
}

const ROLE: Record<string, string> = {
  header: 'Header', nav: 'Navigation', main: 'Main', footer: 'Footer', section: 'Section', article: 'Article', aside: 'Sidebar',
  h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6',
  p: 'Text', span: 'Text', a: 'Link', button: 'Button', img: 'Picture', svg: 'Icon', ul: 'List', ol: 'List', li: 'Item',
  input: 'Input', textarea: 'Input', select: 'Select', label: 'Label', table: 'Table', figure: 'Figure', form: 'Form', div: 'Group',
};

/** The visible text inside a node, tags removed, entities decoded. */
export function textOf(html: string, node: MarkupNode): string {
  return html.slice(node.openEnd, node.closeStart)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Text that belongs to the node itself, not to a child element. */
function ownText(html: string, markup: Markup, node: MarkupNode): string {
  let out = '';
  let at = node.openEnd;
  for (const childId of node.children) {
    const child = markup.byId.get(childId) as MarkupNode;
    out += html.slice(at, child.openStart);
    at = child.closeEnd;
  }
  out += html.slice(at, node.closeStart);
  return out.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function roleLabel(html: string, node: MarkupNode): string {
  const role = ROLE[node.tag] ?? node.tag;
  const text = node.tag === 'img' ? node.attrs.alt ?? '' : textOf(html, node);
  const short = text.length > 28 ? `${text.slice(0, 27)}…` : text;
  if (short && node.tag !== 'div' && node.tag !== 'section') return `${role} “${short}”`;
  const cls = (node.attrs.class ?? '').split(/\s+/)[0];
  return cls && (node.tag === 'div' || node.tag === 'section') ? `${role} · ${cls}` : role;
}

export const MAX_TREE_DEPTH = 8;
export const MAX_TREE_NODES = 300;

/**
 * The element tree a person reads in the Layers list. A wrapper that holds one element and no
 * text of its own is skipped, and an icon's drawing parts are not listed.
 */
export function elementTree(html: string, options: { collapse?: boolean } = {}): TreeNode[] {
  const markup = parseMarkup(html);
  const collapse = options.collapse !== false;
  let budget = MAX_TREE_NODES;

  const build = (id: string, depth: number): TreeNode[] => {
    const node = markup.byId.get(id);
    if (!node || budget <= 0) return [];
    const own = ownText(html, markup, node);
    const kids = node.tag === 'svg' ? [] : node.children;
    if (collapse && kids.length === 1 && !own && depth < MAX_TREE_DEPTH && (node.tag === 'div' || node.tag === 'span')) {
      return build(kids[0], depth);
    }
    budget -= 1;
    const children = depth >= MAX_TREE_DEPTH ? [] : kids.flatMap((child) => build(child, depth + 1));
    return [{ id, tag: node.tag, label: roleLabel(html, node), text: own.slice(0, 60), children }];
  };

  return markup.roots.flatMap((root) => build(root, 0));
}

/** The ids from the root down to an element (for a breadcrumb). */
export function ancestry(html: string, id: string): Array<{ id: string; label: string }> {
  const markup = parseMarkup(html);
  const out: Array<{ id: string; label: string }> = [];
  let current = markup.byId.get(id) ?? null;
  while (current) {
    out.unshift({ id: current.id, label: roleLabel(html, current) });
    current = current.parent ? markup.byId.get(current.parent) ?? null : null;
  }
  return out;
}
