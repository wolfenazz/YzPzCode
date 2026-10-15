// Carries design-system changes into drawn graphics (SVG boards). HTML boards follow the `--ds-*`
// variables on their own; a graphic has its values written into the drawing, so a change of type,
// weight, line height, corner radius, border width or shadow is applied here, by the difference
// between the system before and after. Dependency-free string work, tested by `npm run test:design`.

import type { DesignTokens, ShadowLevel } from './types';

const TAG = /<(text|tspan|rect|circle|ellipse|path|line|polyline|polygon)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const SHADOW_ID = 'yzShadow';

const SHADOWS: Record<Exclude<ShadowLevel, 'none'>, { dy: number; blur: number; opacity: number }> = {
  soft: { dy: 2, blur: 4, opacity: 0.14 },
  medium: { dy: 6, blur: 10, opacity: 0.2 },
  strong: { dy: 12, blur: 18, opacity: 0.3 },
};

const norm = (name: string): string => name.replace(/['"]/g, '').split(',')[0].trim().toLowerCase();
const num = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
};
const round = (value: number): string => String(Math.round(value * 100) / 100);

/** Reads an attribute or an inline-style declaration of a tag's attribute text. */
function read(attrs: string, name: string): string | null {
  const attribute = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  if (attribute) return attribute[1] ?? attribute[2] ?? '';
  const style = /(?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  if (style) {
    const declaration = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(style[1] ?? style[2] ?? '');
    if (declaration) return declaration[1].trim();
  }
  return null;
}

/** Writes a value where it was found (attribute or style), or adds an attribute. */
function write(attrs: string, name: string, value: string): string {
  const attribute = new RegExp(`((?:^|\\s)${name}\\s*=\\s*)(?:"[^"]*"|'[^']*')`, 'i');
  if (attribute.test(attrs)) return attrs.replace(attribute, `$1"${value}"`);
  const style = /((?:^|\s)style\s*=\s*)(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  if (style) {
    const body = style[2] ?? style[3] ?? '';
    const declaration = new RegExp(`((?:^|;)\\s*${name}\\s*:\\s*)[^;]+`, 'i');
    if (declaration.test(body)) return attrs.replace(style[0], `${style[1]}"${body.replace(declaration, `$1${value}`)}"`);
  }
  return `${attrs} ${name}="${value}"`;
}

const closestKey = (size: number, tokens: DesignTokens['type'], keys: Array<keyof DesignTokens['type']>): keyof DesignTokens['type'] =>
  keys.reduce((best, key) => (Math.abs(tokens[key] - size) < Math.abs(tokens[best] - size) ? key : best), keys[0]);

/** Whether anything `restyleSvg` handles differs between two systems. */
export function svgStyleChanged(before: DesignTokens, after: DesignTokens): boolean {
  return (['display', 'h1', 'h2', 'body', 'caption'] as const).some((key) => before.type[key] !== after.type[key])
    || before.headingWeight !== after.headingWeight || before.lineHeight !== after.lineHeight
    || before.radius !== after.radius || before.borderWidth !== after.borderWidth || before.shadow !== after.shadow;
}

/** The drawing with the type, weight, line height, radius, border and shadow changes of the system written in. */
export function restyleSvg(svg: string, before: DesignTokens, after: DesignTokens, canvas?: { width: number; height: number }): string {
  if (!svg || !svgStyleChanged(before, after)) return svg;
  const headingFace = norm(before.fonts.heading);
  const sameFace = headingFace === norm(before.fonts.body);
  const radiusRatio = before.radius > 0 ? after.radius / before.radius : null;
  const border = (value: number): number => Math.max(value, 0.25);
  const borderRatio = border(after.borderWidth) / border(before.borderWidth);
  const lineRatio = after.lineHeight / before.lineHeight;
  const surface = after.palette.surface.toUpperCase();
  let role: 'heading' | 'body' = 'body';
  const typeKeys = (['display', 'h1', 'h2', 'body', 'caption'] as const).filter((key) => before.type[key] !== after.type[key]);

  let out = svg.replace(TAG, (whole, tag: string, attrsRaw: string, close: string) => {
    let attrs = attrsRaw;
    const name = tag.toLowerCase();
    if (name === 'text' || name === 'tspan') {
      const family = read(attrs, 'font-family');
      const size = num(read(attrs, 'font-size'));
      if (family) {
        const face = norm(family);
        const weight = num(read(attrs, 'font-weight')) ?? 400;
        // A face the system never named (the AI picked its own) is read by its size.
        const foreign = face !== headingFace && face !== norm(before.fonts.body);
        role = foreign
          ? ((size ?? 0) >= before.type.h2 * 0.9 ? 'heading' : 'body')
          : face === headingFace && (!sameFace || (size ?? 0) >= before.type.h2 * 0.9 || weight >= 600) ? 'heading' : 'body';
      } else if (name === 'text') {
        role = 'body';
      }
      if (size !== null && typeKeys.length > 0) {
        const key = role === 'heading' ? closestKey(size, before.type, ['display', 'h1', 'h2']) : closestKey(size, before.type, ['body', 'caption']);
        if (before.type[key] !== after.type[key] && before.type[key] > 0) attrs = write(attrs, 'font-size', round(size * (after.type[key] / before.type[key])));
      }
      if (role === 'heading' && before.headingWeight !== after.headingWeight && (family || name === 'text') && (read(attrs, 'font-weight') !== null || family)) {
        attrs = write(attrs, 'font-weight', String(after.headingWeight));
      }
      if (name === 'tspan' && lineRatio !== 1) {
        const dy = read(attrs, 'dy');
        const value = num(dy);
        if (dy !== null && value !== null && value !== 0 && !/%/.test(dy)) attrs = write(attrs, 'dy', `${round(value * lineRatio)}${/em$/.test(dy.trim()) ? 'em' : ''}`);
      }
    } else {
      if (name === 'rect' && before.radius !== after.radius) {
        const rx = num(read(attrs, 'rx'));
        const ry = num(read(attrs, 'ry'));
        const width = num(read(attrs, 'width'));
        const height = num(read(attrs, 'height'));
        const limit = width !== null && height !== null ? Math.min(width, height) / 2 : Infinity;
        if (radiusRatio !== null) {
          if (rx !== null && rx > 0) attrs = write(attrs, 'rx', round(Math.min(rx * radiusRatio, limit)));
          if (ry !== null && ry > 0) attrs = write(attrs, 'ry', round(Math.min(ry * radiusRatio, limit)));
        }
      }
      if (before.borderWidth !== after.borderWidth) {
        const stroke = read(attrs, 'stroke');
        const width = num(read(attrs, 'stroke-width'));
        if (stroke && stroke !== 'none' && width !== null && width > 0) attrs = write(attrs, 'stroke-width', round(width * borderRatio));
      }
      if (before.shadow !== after.shadow && name === 'rect') {
        const fill = (read(attrs, 'fill') ?? '').toUpperCase();
        const width = num(read(attrs, 'width'));
        const height = num(read(attrs, 'height'));
        const cardlike = fill === surface && width !== null && height !== null && (!canvas || width < canvas.width * 0.98 || height < canvas.height * 0.98);
        const marked = /\sdata-shadow=/.test(attrs);
        if (after.shadow === 'none') {
          if (marked) attrs = attrs.replace(/\sfilter\s*=\s*"url\(#yzShadow\)"/, '').replace(/\sdata-shadow\s*=\s*"[^"]*"/, '');
        } else if (cardlike || marked) {
          if (!marked) attrs = `${attrs} data-shadow="1"`;
          if (!/\sfilter\s*=/.test(attrs)) attrs = `${attrs} filter="url(#${SHADOW_ID})"`;
        }
      }
    }
    return attrs === attrsRaw ? whole : `<${tag}${attrs}${close}>`;
  });

  if (before.shadow !== after.shadow) {
    out = out.replace(new RegExp(`<filter\\b[^>]*\\bid="${SHADOW_ID}"[\\s\\S]*?</filter>`, 'g'), '');
    if (after.shadow !== 'none' && /data-shadow=/.test(out)) {
      const level = SHADOWS[after.shadow];
      const filter = `<filter id="${SHADOW_ID}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="${level.dy}" stdDeviation="${level.blur}" flood-color="#000000" flood-opacity="${level.opacity}"/></filter>`;
      if (/<defs\b[^>]*>/.test(out)) out = out.replace(/<defs\b[^>]*>/, (open) => `${open}${filter}`);
      else out = out.replace(/<svg\b[^>]*>/, (open) => `${open}<defs>${filter}</defs>`);
    }
  }
  return out;
}
