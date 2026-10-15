// Email-safe output: style rules moved into `style=""` attributes and `var(--ds-*)` replaced
// by the values, since mail clients drop both `<style>` selectors and custom properties.
// Works on the sanitized markup of a board. Dependency-free (`npm run test:design`).

import { parseMarkup } from './domTree';
import { getInlineStyle, setElementStyle } from './styleEdit';
import { tokensToCss } from './tokensCss';
import type { DesignTokens } from './types';

/** The `--ds-*` variables of a system with their values (light palette). */
export function tokenValues(tokens: DesignTokens): Record<string, string> {
  const root = /:root\{([^}]*)\}/.exec(tokensToCss(tokens))?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const part of root.split(';')) {
    const at = part.indexOf(':');
    if (at < 1) continue;
    out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

/** `var(--ds-primary)` → the colour, everywhere in a piece of markup or CSS. */
export function resolveTokenVars(text: string, values: Record<string, string>): string {
  return text.replace(/var\(\s*(--ds-[\w-]+)\s*\)/g, (whole, name: string) => values[name] ?? whole);
}

interface Rule {
  selector: string;
  tag: string | null;
  classes: string[];
  id: string | null;
  specificity: number;
  order: number;
  declarations: Array<[string, string]>;
}

const SIMPLE = /^([a-z][a-z0-9]*)?((?:\.[\w-]+)*)(?:#([\w-]+))?$/i;

/** Splits a declaration list at `;`, not inside parentheses or quotes. */
function splitDeclarations(body: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  const flush = (end: number): void => {
    const part = body.slice(start, end);
    const at = part.indexOf(':');
    if (at > 0) {
      const name = part.slice(0, at).trim().toLowerCase();
      const value = part.slice(at + 1).trim().replace(/\s*!important$/i, '');
      if (name && value) out.push([name, value]);
    }
    start = end + 1;
  };
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === ';' && depth === 0) flush(index);
  }
  flush(body.length);
  return out;
}

/** Top-level rules: simple selectors become `Rule`s, the rest (at-rules, combinators, pseudo-classes) come back as text to keep. */
function readRules(css: string): { rules: Rule[]; kept: string } {
  const rules: Rule[] = [];
  const kept: string[] = [];
  let order = 0;
  let index = 0;
  while (index < css.length) {
    const open = css.indexOf('{', index);
    if (open === -1) break;
    const prelude = css.slice(index, open).trim();
    let depth = 1;
    let end = open + 1;
    while (end < css.length && depth > 0) {
      if (css[end] === '{') depth += 1;
      else if (css[end] === '}') depth -= 1;
      end += 1;
    }
    const body = css.slice(open + 1, end - 1);
    index = end;
    if (!prelude) continue;
    if (prelude.startsWith('@')) {
      kept.push(`${prelude}{${body}}`);
      continue;
    }
    const selectors = prelude.split(',').map((entry) => entry.trim()).filter(Boolean);
    const simple = selectors.every((entry) => entry !== '*' && SIMPLE.test(entry) && entry !== '');
    if (!simple) {
      kept.push(`${prelude}{${body}}`);
      continue;
    }
    const declarations = splitDeclarations(body);
    for (const selector of selectors) {
      const match = SIMPLE.exec(selector) as RegExpExecArray;
      const classes = (match[2] ?? '').split('.').filter(Boolean);
      rules.push({
        selector,
        tag: match[1] ? match[1].toLowerCase() : null,
        classes,
        id: match[3] ?? null,
        specificity: (match[3] ? 100 : 0) + classes.length * 10 + (match[1] ? 1 : 0),
        order: order,
        declarations,
      });
    }
    order += 1;
  }
  return { rules, kept: kept.join('\n') };
}

/**
 * Moves the `<style>` rules that have simple selectors into the elements' `style` attributes
 * (what is already inline wins). Rules that cannot be inlined (media queries, descendant
 * selectors, pseudo-classes) stay in one `<style>` block at the front.
 */
export function inlineStyles(html: string): string {
  const blocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
  if (blocks.length === 0) return html;
  const css = blocks.map((block) => block[1]).join('\n');
  let markup = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const { rules, kept } = readRules(css);
  const sorted = rules.slice().sort((a, b) => a.specificity - b.specificity || a.order - b.order);

  const patches = new Map<string, Record<string, string>>();
  for (const node of parseMarkup(markup).nodes) {
    const classes = (node.attrs.class ?? '').split(/\s+/).filter(Boolean);
    const merged: Record<string, string> = {};
    for (const rule of sorted) {
      if (rule.tag && rule.tag !== node.tag) continue;
      if (rule.id && rule.id !== node.attrs.id) continue;
      if (!rule.classes.every((name) => classes.includes(name))) continue;
      for (const [name, value] of rule.declarations) merged[name] = value;
    }
    if (Object.keys(merged).length > 0) patches.set(node.id, merged);
  }
  for (const [id, merged] of patches) {
    const existing = getInlineStyle(markup, id);
    const patch: Record<string, string> = {};
    for (const [name, value] of Object.entries(merged)) if (!(name in existing)) patch[name] = value;
    if (Object.keys(patch).length === 0) continue;
    markup = setElementStyle(markup, id, patch) ?? markup;
  }
  return kept.trim() ? `<style>${kept}</style>${markup}` : markup;
}

/** The email body of a board: styles inlined and the system's variables written out. */
export function emailMarkup(html: string, tokens: DesignTokens): string {
  return resolveTokenVars(inlineStyles(html), tokenValues(tokens));
}
