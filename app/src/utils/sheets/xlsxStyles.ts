// styles.xml and the theme: reading cell formats into the shared style table and
// writing the table back out.

import { BUILTIN_FORMATS } from './numberFormat';
import type { BorderEdge, BorderStyle, CellStyle, Dxf, Workbook } from './types';
import { attr, boolAttr, child, children, elements, escapeXml, localName, numAttr, parseXml, serializeXml, xmlText } from './xlsxXml';

// ---- colours ----

const INDEXED = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
];

const DEFAULT_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];

/** Theme colours in the order Excel numbers them (light 1, dark 1, light 2, dark 2, accents, links). */
export function readTheme(xml: string | undefined): string[] {
  if (!xml) return DEFAULT_THEME.map((c) => `#${c}`);
  const doc = parseXml(xml);
  const scheme = doc.getElementsByTagName('a:clrScheme')[0] ?? Array.from(doc.getElementsByTagName('*')).find((el) => localName(el) === 'clrScheme');
  if (!scheme) return DEFAULT_THEME.map((c) => `#${c}`);
  const order = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  const found: Record<string, string> = {};
  for (const el of elements(scheme)) {
    const name = localName(el);
    const color = elements(el)[0];
    if (!color) continue;
    const value = attr(color, 'val') ?? attr(color, 'lastClr');
    if (value && /^[0-9A-Fa-f]{6}$/.test(value)) found[name] = value.toUpperCase();
  }
  const get = (name: string, index: number): string => found[name] ?? DEFAULT_THEME[index];
  const list = order.map((name, i) => get(name, i === 0 ? 1 : i === 1 ? 0 : i === 2 ? 3 : i === 3 ? 2 : i));
  // Excel's index 0 is light 1 and 1 is dark 1 (the file lists dark first).
  [list[0], list[1]] = [list[1], list[0]];
  [list[2], list[3]] = [list[3], list[2]];
  return list.map((c) => `#${c}`);
}

function applyTint(hex: string, tint: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p: number, q: number, t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let nr = l;
  let ng = l;
  let nb = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    nr = hue(p, q, h + 1 / 3);
    ng = hue(p, q, h);
    nb = hue(p, q, h - 1 / 3);
  }
  const to = (v: number): string => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(nr)}${to(ng)}${to(nb)}`.toUpperCase();
}

export function readColor(el: Element | null | undefined, theme: string[]): string | undefined {
  if (!el) return undefined;
  const rgb = attr(el, 'rgb');
  if (rgb && /^[0-9A-Fa-f]{6,8}$/.test(rgb)) return `#${rgb.slice(-6)}`.toUpperCase();
  const themeIndex = numAttr(el, 'theme');
  if (themeIndex !== undefined) {
    const base = theme[themeIndex] ?? '#000000';
    const tint = numAttr(el, 'tint');
    return tint ? applyTint(base, tint) : base;
  }
  const indexed = numAttr(el, 'indexed');
  if (indexed !== undefined) return INDEXED[indexed] ? `#${INDEXED[indexed]}` : undefined;
  return undefined;
}

// ---- reading ----

export interface ReadStyles {
  styles: CellStyle[];
  /** Style index for each `cellXfs` entry. */
  xfToStyle: number[];
  dxfs: Dxf[];
  defaultFont: { name: string; size: number };
}

const BORDER_STYLES = new Set<string>(['thin', 'medium', 'thick', 'dashed', 'dotted', 'double', 'hair', 'mediumDashed', 'dashDot', 'slantDashDot']);

function readFont(el: Element | undefined, theme: string[]): NonNullable<CellStyle['font']> & { name?: string } {
  const font: NonNullable<CellStyle['font']> = {};
  if (!el) return font;
  const name = attr(child(el, 'name'), 'val');
  if (name) font.name = name;
  const size = numAttr(child(el, 'sz'), 'val');
  if (size) font.size = size;
  if (child(el, 'b') && boolAttr(child(el, 'b'), 'val', true)) font.bold = true;
  if (child(el, 'i') && boolAttr(child(el, 'i'), 'val', true)) font.italic = true;
  if (child(el, 'strike') && boolAttr(child(el, 'strike'), 'val', true)) font.strike = true;
  const u = child(el, 'u');
  if (u && attr(u, 'val') !== 'none') font.underline = true;
  const color = readColor(child(el, 'color'), theme);
  if (color && color !== '#000000') font.color = color;
  return font;
}

function readBorder(el: Element | undefined, theme: string[]): CellStyle['border'] | undefined {
  if (!el) return undefined;
  const out: NonNullable<CellStyle['border']> = {};
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    const edge = child(el, side) ?? (side === 'left' ? child(el, 'start') : side === 'right' ? child(el, 'end') : null);
    const style = attr(edge, 'style');
    if (edge && style && BORDER_STYLES.has(style)) {
      const color = readColor(child(edge, 'color'), theme);
      out[side] = { style: style as BorderStyle, ...(color && color !== '#000000' ? { color } : {}) };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function readFill(el: Element | undefined, theme: string[]): string | undefined {
  if (!el) return undefined;
  const pattern = child(el, 'patternFill');
  if (pattern) {
    const type = attr(pattern, 'patternType');
    if (!type || type === 'none') return undefined;
    const fg = readColor(child(pattern, 'fgColor'), theme);
    const bg = readColor(child(pattern, 'bgColor'), theme);
    return type === 'solid' ? fg ?? bg : fg ?? bg;
  }
  const gradient = child(el, 'gradientFill');
  if (gradient) return readColor(child(child(gradient, 'stop'), 'color'), theme);
  return undefined;
}

const clean = <T extends object>(value: T): T | undefined => (Object.keys(value).length ? value : undefined);

export function readStyles(xml: string | undefined, theme: string[]): ReadStyles {
  const fallback: ReadStyles = { styles: [{}], xfToStyle: [0], dxfs: [], defaultFont: { name: 'Calibri', size: 11 } };
  if (!xml) return fallback;
  const root = parseXml(xml).documentElement;
  const custom = new Map<number, string>();
  for (const el of children(child(root, 'numFmts'), 'numFmt')) {
    const id = numAttr(el, 'numFmtId');
    const code = attr(el, 'formatCode');
    if (id !== undefined && code !== undefined) custom.set(id, code);
  }
  const fontEls = children(child(root, 'fonts'), 'font');
  const fillEls = children(child(root, 'fills'), 'fill');
  const borderEls = children(child(root, 'borders'), 'border');
  const baseFont = readFont(fontEls[0], theme);
  const defaultFont = { name: baseFont.name ?? 'Calibri', size: baseFont.size ?? 11 };

  const styles: CellStyle[] = [];
  const index = new Map<string, number>();
  const intern = (style: CellStyle): number => {
    const key = JSON.stringify(style);
    const found = index.get(key);
    if (found !== undefined) return found;
    styles.push(style);
    index.set(key, styles.length - 1);
    return styles.length - 1;
  };
  intern({});

  const formatCode = (id: number | undefined): string | undefined => {
    if (id === undefined || id === 0) return undefined;
    return custom.get(id) ?? BUILTIN_FORMATS[id];
  };

  const xfToStyle: number[] = [];
  for (const xf of children(child(root, 'cellXfs'), 'xf')) {
    const style: CellStyle = {};
    const font = readFont(fontEls[numAttr(xf, 'fontId') ?? 0], theme);
    // The workbook's own font is the default, not a choice made on the cell.
    if (font.name && font.name.toLowerCase() === defaultFont.name.toLowerCase()) delete font.name;
    if (font.size === defaultFont.size) delete font.size;
    const fontStyle = clean(font);
    if (fontStyle) style.font = fontStyle;
    const fill = readFill(fillEls[numAttr(xf, 'fillId') ?? 0], theme);
    if (fill) style.fill = fill;
    const border = readBorder(borderEls[numAttr(xf, 'borderId') ?? 0], theme);
    if (border) style.border = border;
    const fmt = formatCode(numAttr(xf, 'numFmtId'));
    if (fmt && fmt !== 'General') style.numFmt = fmt;
    const alignment = child(xf, 'alignment');
    if (alignment) {
      const align: NonNullable<CellStyle['align']> = {};
      const h = attr(alignment, 'horizontal');
      if (h && h !== 'general') align.h = h as NonNullable<CellStyle['align']>['h'];
      const v = attr(alignment, 'vertical');
      if (v && v !== 'bottom') align.v = v as NonNullable<CellStyle['align']>['v'];
      if (boolAttr(alignment, 'wrapText')) align.wrap = true;
      if (boolAttr(alignment, 'shrinkToFit')) align.shrink = true;
      const indent = numAttr(alignment, 'indent');
      if (indent) align.indent = indent;
      const rotate = numAttr(alignment, 'textRotation');
      if (rotate) align.rotate = rotate;
      const reading = numAttr(alignment, 'readingOrder');
      if (reading === 1 || reading === 2) align.reading = reading;
      const aligned = clean(align);
      if (aligned) style.align = aligned;
    }
    const protection = child(xf, 'protection');
    if (protection) {
      if (attr(protection, 'locked') === '0') style.locked = false;
      if (boolAttr(protection, 'hidden')) style.hidden = true;
    }
    xfToStyle.push(intern(style));
  }
  if (xfToStyle.length === 0) xfToStyle.push(0);

  const dxfs: Dxf[] = [];
  for (const el of children(child(root, 'dxfs'), 'dxf')) {
    const dxf: Dxf = {};
    const fontEl = child(el, 'font');
    if (fontEl) {
      const f = readFont(fontEl, theme);
      const out: NonNullable<Dxf['font']> = {};
      if (f.bold) out.bold = true;
      if (f.italic) out.italic = true;
      if (f.underline) out.underline = true;
      if (f.strike) out.strike = true;
      if (f.color) out.color = f.color;
      const colored = readColor(child(fontEl, 'color'), theme);
      if (colored) out.color = colored;
      if (Object.keys(out).length) dxf.font = out;
    }
    const fillEl = child(el, 'fill');
    if (fillEl) {
      const pattern = child(fillEl, 'patternFill');
      const color = readColor(child(pattern, 'bgColor'), theme) ?? readColor(child(pattern, 'fgColor'), theme);
      if (color) dxf.fill = color;
    }
    const border = readBorder(child(el, 'border') ?? undefined, theme);
    if (border) dxf.border = border;
    const numFmt = child(el, 'numFmt');
    if (numFmt) dxf.numFmt = attr(numFmt, 'formatCode') ?? formatCode(numAttr(numFmt, 'numFmtId'));
    dxfs.push(dxf);
  }
  return { styles, xfToStyle, dxfs, defaultFont };
}

// ---- writing ----

const colorAttr = (hex: string | undefined): string => (hex ? `<color rgb="FF${hex.replace('#', '').toUpperCase()}"/>` : '');

function fontXml(style: CellStyle['font'] | undefined, fallback: { name: string; size: number }): string {
  const f = style ?? {};
  return `<font>${f.bold ? '<b/>' : ''}${f.italic ? '<i/>' : ''}${f.strike ? '<strike/>' : ''}${f.underline ? '<u/>' : ''}<sz val="${f.size ?? fallback.size}"/>${f.color ? colorAttr(f.color) : '<color theme="1"/>'}<name val="${escapeXml(f.name ?? fallback.name)}"/><family val="2"/></font>`;
}

function borderXml(border: CellStyle['border'] | undefined): string {
  const edge = (name: string, value: BorderEdge | undefined): string =>
    value ? `<${name} style="${value.style}">${value.color ? colorAttr(value.color) : '<color auto="1"/>'}</${name}>` : `<${name}/>`;
  return `<border>${edge('left', border?.left)}${edge('right', border?.right)}${edge('top', border?.top)}${edge('bottom', border?.bottom)}<diagonal/></border>`;
}

const BUILTIN_BY_CODE = new Map<string, number>(Object.entries(BUILTIN_FORMATS).map(([id, code]) => [code, Number(id)]));

/** Keeps pieces of the original styles.xml we do not model (named cell styles, table styles, colours). */
function preserved(originalXml: string | undefined, names: string[]): string {
  if (!originalXml) return '';
  try {
    const root = parseXml(originalXml).documentElement;
    return names.map((name) => {
      const el = child(root, name);
      return el ? serializeXml(el) : '';
    }).join('');
  } catch {
    return '';
  }
}

export function writeStyles(wb: Workbook, defaultFont: { name: string; size: number }, originalXml?: string): { xml: string } {
  const fonts: string[] = [fontXml(undefined, defaultFont)];
  const fontIndex = new Map<string, number>([[fonts[0], 0]]);
  const fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const fillIndex = new Map<string, number>();
  const borders: string[] = [borderXml(undefined)];
  const borderIndex = new Map<string, number>([[borders[0], 0]]);
  const numFmts = new Map<string, number>();
  let nextFmt = 164;

  const xfs = wb.styles.map((style, i) => {
    if (i === 0 && Object.keys(style).length === 0) return '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    const fontKey = style.font ? fontXml(style.font, defaultFont) : fonts[0];
    let fontId = fontIndex.get(fontKey);
    if (fontId === undefined) {
      fontId = fonts.length;
      fonts.push(fontKey);
      fontIndex.set(fontKey, fontId);
    }
    let fillId = 0;
    if (style.fill) {
      const fillKey = `<fill><patternFill patternType="solid"><fgColor rgb="FF${style.fill.replace('#', '').toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`;
      let found = fillIndex.get(fillKey);
      if (found === undefined) {
        found = fills.length;
        fills.push(fillKey);
        fillIndex.set(fillKey, found);
      }
      fillId = found;
    }
    const borderKey = borderXml(style.border);
    let borderId = borderIndex.get(borderKey);
    if (borderId === undefined) {
      borderId = borders.length;
      borders.push(borderKey);
      borderIndex.set(borderKey, borderId);
    }
    let numFmtId = 0;
    if (style.numFmt && style.numFmt !== 'General') {
      const builtin = BUILTIN_BY_CODE.get(style.numFmt);
      if (builtin !== undefined) numFmtId = builtin;
      else {
        let id = numFmts.get(style.numFmt);
        if (id === undefined) {
          id = nextFmt;
          nextFmt += 1;
          numFmts.set(style.numFmt, id);
        }
        numFmtId = id;
      }
    }
    const a = style.align;
    const alignment = a
      ? `<alignment${a.h && a.h !== 'general' ? ` horizontal="${a.h}"` : ''}${a.v ? ` vertical="${a.v}"` : ''}${a.wrap ? ' wrapText="1"' : ''}${a.shrink ? ' shrinkToFit="1"' : ''}${a.indent ? ` indent="${a.indent}"` : ''}${a.rotate ? ` textRotation="${a.rotate}"` : ''}${a.reading ? ` readingOrder="${a.reading}"` : ''}/>`
      : '';
    const protection = style.locked === false || style.hidden ? `<protection locked="${style.locked === false ? 0 : 1}"${style.hidden ? ' hidden="1"' : ''}/>` : '';
    const attrs = `numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${alignment ? ' applyAlignment="1"' : ''}${protection ? ' applyProtection="1"' : ''}`;
    return alignment || protection ? `<xf ${attrs}>${alignment}${protection}</xf>` : `<xf ${attrs}/>`;
  });

  const dxfs = wb.dxfs.map((dxf) => {
    const font = dxf.font
      ? `<font>${dxf.font.bold ? '<b/>' : ''}${dxf.font.italic ? '<i/>' : ''}${dxf.font.strike ? '<strike/>' : ''}${dxf.font.underline ? '<u/>' : ''}${dxf.font.color ? colorAttr(dxf.font.color) : ''}</font>`
      : '';
    const fill = dxf.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${dxf.fill.replace('#', '').toUpperCase()}"/><bgColor rgb="FF${dxf.fill.replace('#', '').toUpperCase()}"/></patternFill></fill>` : '';
    const border = dxf.border ? borderXml(dxf.border) : '';
    const fmt = dxf.numFmt ? `<numFmt numFmtId="${BUILTIN_BY_CODE.get(dxf.numFmt) ?? 200}" formatCode="${escapeXml(dxf.numFmt)}"/>` : '';
    return `<dxf>${font}${fmt}${fill}${border}</dxf>`;
  });

  const numFmtXml = numFmts.size
    ? `<numFmts count="${numFmts.size}">${[...numFmts].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${xmlText(code)}"/>`).join('')}</numFmts>`
    : '';
  const cellStyleXfs = preserved(originalXml, ['cellStyleXfs']) || '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>';
  const cellStyles = preserved(originalXml, ['cellStyles']) || '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>';
  const tail = preserved(originalXml, ['tableStyles', 'colors', 'extLst']);
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${ns}">${numFmtXml}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders>${cellStyleXfs}<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>${cellStyles}<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs>${tail}</styleSheet>`;
  return { xml };
}
