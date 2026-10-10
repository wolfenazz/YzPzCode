// Reads and edits the words and pictures of a designed slide's SVG, so text
// can be changed in place without asking the AI. A `<text>` is one
// paragraph: its direct text (with inline `<tspan>` runs) is the first line,
// and each positioned `<tspan>` (x / y / dy) is a further line, which is how
// the slide prompt asks the AI to write multi-line text. Uses the global
// DOMParser / XMLSerializer.

export interface SvgTextItem {
  index: number;
  lines: string[];
  /** Font size in SVG px, inherited if not set on the element. */
  fontSize: number;
  bold: boolean;
}

export interface SvgImageItem {
  index: number;
  href: string;
  width: number;
  height: number;
}

const parse = (svg: string): Document => new DOMParser().parseFromString(svg, 'image/svg+xml');
const serialize = (document: Document): string => new XMLSerializer().serializeToString(document.documentElement);
const tagName = (node: Node): string => ((node as Element).localName || node.nodeName).replace(/^.*:/, '').toLowerCase();
const collapse = (text: string): string => text.replace(/\s+/g, ' ');

function styleValue(element: Element, property: string): string | null {
  const style = element.getAttribute('style') || '';
  const match = style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : element.getAttribute(property);
}

function inherited(element: Element, property: string): string | null {
  for (let node: Node | null = element; node && node.nodeType === 1; node = node.parentNode) {
    const value = styleValue(node as Element, property);
    if (value) return value;
  }
  return null;
}

/** A positioned tspan starts a new line; an unpositioned one is an inline run. */
function isLine(node: Node): boolean {
  if (node.nodeType !== 1 || tagName(node) !== 'tspan') return false;
  const element = node as Element;
  return element.hasAttribute('x') || element.hasAttribute('y') || (Number.parseFloat(element.getAttribute('dy') || '') || 0) !== 0;
}

/** The line nodes of a `<text>`: the leading inline content, then each positioned tspan. */
function lineGroups(text: Element): { lead: Node[]; lines: Element[] } {
  const lead: Node[] = [];
  const lines: Element[] = [];
  for (const child of Array.from(text.childNodes)) {
    if (isLine(child)) lines.push(child as Element);
    else if (lines.length === 0) lead.push(child);
    // Inline content after the first positioned line belongs to no line; it is left alone.
  }
  return { lead, lines };
}

const leadText = (lead: Node[]): string => collapse(lead.map((node) => node.textContent ?? '').join('')).trim();

function textLines(text: Element): string[] {
  const { lead, lines } = lineGroups(text);
  const first = leadText(lead);
  const rest = lines.map((line) => collapse(line.textContent ?? '').trim());
  return first || lines.length === 0 ? [first, ...rest] : rest;
}

function fontSizeOf(element: Element): number {
  const value = Number.parseFloat(inherited(element, 'font-size') ?? '');
  return Number.isFinite(value) && value > 0 ? value : 16;
}

function isBold(element: Element): boolean {
  const weight = inherited(element, 'font-weight') ?? '';
  return weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
}

const textElements = (document: Document): Element[] => Array.from(document.getElementsByTagName('*')).filter((node) => tagName(node) === 'text');
const imageElements = (document: Document): Element[] => Array.from(document.getElementsByTagName('*')).filter((node) => tagName(node) === 'image');

export function svgTextItems(svg: string): SvgTextItem[] {
  if (!svg) return [];
  return textElements(parse(svg)).map((element, index) => ({
    index,
    lines: textLines(element),
    fontSize: fontSizeOf(element),
    bold: isBold(element),
  }));
}

/** All the words on a slide, one text element per line group. */
export function svgPlainText(svg: string): string {
  return svgTextItems(svg).map((item) => item.lines.filter(Boolean).join(' ')).filter(Boolean).join('\n');
}

/** Sets one line node's words. A lone styled run keeps its styling; mixed runs become plain text. */
function setNodeText(document: Document, nodes: Node[], parent: Element, before: Node | null, value: string): void {
  const elements = nodes.filter((node) => node.nodeType === 1);
  const texts = nodes.filter((node) => node.nodeType === 3 && (node.textContent ?? '').trim());
  if (elements.length === 1 && texts.length === 0) {
    (elements[0] as Element).textContent = value;
    return;
  }
  nodes.forEach((node) => parent.removeChild(node));
  parent.insertBefore(document.createTextNode(value), before);
}

/**
 * Replaces the lines of the `index`-th `<text>`. Extra lines are added as
 * positioned tspans spaced like the existing ones; an empty list removes the
 * element.
 */
export function setSvgText(svg: string, index: number, lines: string[]): string {
  const document = parse(svg);
  const element = textElements(document)[index];
  if (!element) return svg;
  const wanted = lines.map((line) => line.replace(/\s+/g, ' ').trim());
  while (wanted.length > 0 && !wanted[wanted.length - 1]) wanted.pop();
  if (wanted.length === 0) {
    element.parentNode?.removeChild(element);
    return serialize(document);
  }
  const { lead, lines: lineNodes } = lineGroups(element);
  const hasLead = Boolean(leadText(lead)) || lineNodes.length === 0;
  const size = fontSizeOf(element);
  const firstDy = lineNodes.map((node) => Number.parseFloat(node.getAttribute('dy') || '')).find((value) => Number.isFinite(value) && value > 0);
  const step = firstDy ?? Math.round(size * 1.3 * 10) / 10;

  let cursor = 0;
  if (hasLead) {
    if (leadText(lead) !== wanted[0]) setNodeText(document, lead, element, lineNodes[0] ?? null, wanted[0] ?? '');
    cursor = 1;
  }
  lineNodes.forEach((node, position) => {
    const value = wanted[cursor + position];
    if (value === undefined) {
      element.removeChild(node);
      return;
    }
    if (collapse(node.textContent ?? '').trim() !== value) setNodeText(document, Array.from(node.childNodes), node, null, value);
    if (!node.firstChild) node.appendChild(document.createTextNode(value));
  });
  const template = lineNodes[lineNodes.length - 1] ?? null;
  for (let line = cursor + lineNodes.length; line < wanted.length; line += 1) {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    const x = template?.getAttribute('x') || element.getAttribute('x');
    if (x !== null) tspan.setAttribute('x', x);
    tspan.setAttribute('dy', String(template && Number.parseFloat(template.getAttribute('dy') || '') > 0 ? template.getAttribute('dy') : step));
    tspan.appendChild(document.createTextNode(wanted[line]));
    element.appendChild(tspan);
  }
  return serialize(document);
}

export function svgImageItems(svg: string): SvgImageItem[] {
  if (!svg) return [];
  return imageElements(parse(svg)).map((element, index) => ({
    index,
    href: element.getAttribute('href') || element.getAttribute('xlink:href') || '',
    width: Number.parseFloat(element.getAttribute('width') || '') || 0,
    height: Number.parseFloat(element.getAttribute('height') || '') || 0,
  }));
}

/** Points the `index`-th `<image>` at another picture, keeping its frame and crop. */
export function setSvgImage(svg: string, index: number, href: string): string {
  const document = parse(svg);
  const element = imageElements(document)[index];
  if (!element) return svg;
  element.removeAttribute('xlink:href');
  element.setAttribute('href', href);
  if (!element.getAttribute('preserveAspectRatio')) element.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  return serialize(document);
}
