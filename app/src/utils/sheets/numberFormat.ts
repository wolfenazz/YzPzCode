// Excel number format codes: rendering and the parsing of typed input.
// Dependency-free (tested by `npm run test:sheets`).

import { DAY_NAMES, MONTH_NAMES, parseDateText, serialToHms, serialToYmd, weekdayOf } from './dates';
import { generalText, parseNumberText, westernDigits } from './formula/values';

export const BUILTIN_FORMATS: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'm/d/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yyyy h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)', 42: '_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)',
  43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)', 44: '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@',
};

/** Formats the Home ribbon offers. */
export const FORMAT_PRESETS: Array<{ id: string; label: string; code: string; sample: string }> = [
  { id: 'general', label: 'General', code: 'General', sample: '1234.5' },
  { id: 'number', label: 'Number', code: '#,##0.00', sample: '1,234.50' },
  { id: 'integer', label: 'Integer', code: '0', sample: '1235' },
  { id: 'currency', label: 'Currency', code: '$#,##0.00', sample: '$1,234.50' },
  { id: 'accounting', label: 'Accounting', code: BUILTIN_FORMATS[44], sample: '$ 1,234.50' },
  { id: 'percent', label: 'Percent', code: '0.00%', sample: '123450.00%' },
  { id: 'date', label: 'Short date', code: 'm/d/yyyy', sample: '3/4/2026' },
  { id: 'longdate', label: 'Long date', code: 'dddd, mmmm d, yyyy', sample: 'Wednesday, March 4, 2026' },
  { id: 'time', label: 'Time', code: 'h:mm AM/PM', sample: '1:30 PM' },
  { id: 'scientific', label: 'Scientific', code: '0.00E+00', sample: '1.23E+03' },
  { id: 'text', label: 'Text', code: '@', sample: 'Text' },
];

type DateCode = 'yyyy' | 'yy' | 'mmmmm' | 'mmmm' | 'mmm' | 'mm' | 'm' | 'dddd' | 'ddd' | 'dd' | 'd' | 'hh' | 'h' | 'ss' | 's' | 'ampm' | 'ap' | 'eh' | 'em' | 'es';
type Token =
  | { t: 'lit'; s: string }
  | { t: 'digit'; ch: '0' | '#' | '?' }
  | { t: 'point' }
  | { t: 'comma' }
  | { t: 'pct' }
  | { t: 'exp'; sign: boolean }
  | { t: 'date'; code: DateCode; minute?: boolean }
  | { t: 'frac'; digits: number }
  | { t: 'text' }
  | { t: 'general' };

interface Section {
  tokens: Token[];
  cond?: { op: string; value: number };
  color?: string;
  isDate: boolean;
  hasText: boolean;
  thousands: boolean;
  percents: number;
  /** Trailing commas: each divides by 1000. */
  scale: number;
  fraction?: { whole: boolean; digits: number; fixed?: number };
}

const COLORS: Record<string, string> = {
  black: '#000000', blue: '#0000FF', cyan: '#00B7C3', green: '#008A00', magenta: '#FF00FF', red: '#FF0000', white: '#FFFFFF', yellow: '#B8A000',
};

function splitSections(code: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  let bracket = false;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === '\\' && !quoted && i + 1 < code.length) {
      current += ch + code[i + 1];
      i += 1;
      continue;
    }
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '[') bracket = true;
    else if (!quoted && ch === ']') bracket = false;
    if (ch === ';' && !quoted && !bracket) {
      out.push(current);
      current = '';
    } else current += ch;
  }
  out.push(current);
  return out;
}

function parseSection(s: string): Section {
  const tokens: Token[] = [];
  const section: Section = { tokens, isDate: false, hasText: false, thousands: false, percents: 0, scale: 0 };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"') {
      const end = s.indexOf('"', i + 1);
      tokens.push({ t: 'lit', s: s.slice(i + 1, end < 0 ? s.length : end) });
      i = end < 0 ? s.length : end + 1;
    } else if (ch === '\\') {
      if (i + 1 < s.length) tokens.push({ t: 'lit', s: s[i + 1] });
      i += 2;
    } else if (ch === '_') {
      tokens.push({ t: 'lit', s: ' ' });
      i += 2;
    } else if (ch === '*') {
      i += 2;
    } else if (ch === '[') {
      const end = s.indexOf(']', i);
      const inner = s.slice(i + 1, end < 0 ? s.length : end);
      i = end < 0 ? s.length : end + 1;
      const lower = inner.toLowerCase();
      if (/^h+$/.test(lower)) tokens.push({ t: 'date', code: 'eh' });
      else if (/^m+$/.test(lower)) tokens.push({ t: 'date', code: 'em' });
      else if (/^s+$/.test(lower)) tokens.push({ t: 'date', code: 'es' });
      else if (COLORS[lower]) section.color = COLORS[lower];
      else if (/^color\s*\d+$/.test(lower)) section.color = '#0000FF';
      else if (/^[<>=]/.test(inner)) {
        const match = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+)/.exec(inner);
        if (match) section.cond = { op: match[1], value: Number(match[2]) };
      } else if (inner.startsWith('$')) {
        const symbol = inner.slice(1).split('-')[0];
        if (symbol) tokens.push({ t: 'lit', s: symbol });
        if (/-F800$/i.test(inner)) tokens.push(...parseSection('dddd, mmmm d, yyyy').tokens);
        else if (/-F400$/i.test(inner)) tokens.push(...parseSection('h:mm:ss AM/PM').tokens);
      }
    } else if (ch === '0' || ch === '#' || ch === '?') {
      tokens.push({ t: 'digit', ch });
      i += 1;
    } else if (ch === '.') {
      // `.0` straight after seconds is a fraction of a second.
      const prev = tokens[tokens.length - 1];
      if (prev && prev.t === 'date' && (prev.code === 's' || prev.code === 'ss') && s[i + 1] === '0') {
        let n = 0;
        while (s[i + 1 + n] === '0') n += 1;
        tokens.push({ t: 'frac', digits: n });
        i += 1 + n;
      } else {
        tokens.push({ t: 'point' });
        i += 1;
      }
    } else if (ch === ',') {
      tokens.push({ t: 'comma' });
      i += 1;
    } else if (ch === '%') {
      tokens.push({ t: 'pct' });
      section.percents += 1;
      i += 1;
    } else if ((ch === 'E' || ch === 'e') && (s[i + 1] === '+' || s[i + 1] === '-')) {
      tokens.push({ t: 'exp', sign: s[i + 1] === '+' });
      i += 2;
    } else if (/^general/i.test(s.slice(i, i + 7))) {
      tokens.push({ t: 'general' });
      i += 7;
    } else if (ch === '@') {
      tokens.push({ t: 'text' });
      section.hasText = true;
      i += 1;
    } else if (/^am\/pm/i.test(s.slice(i, i + 5))) {
      tokens.push({ t: 'date', code: 'ampm' });
      i += 5;
    } else if (/^a\/p/i.test(s.slice(i, i + 3))) {
      tokens.push({ t: 'date', code: 'ap' });
      i += 3;
    } else if (/[ymdhsYMDHS]/.test(ch)) {
      const letter = ch.toLowerCase();
      let n = 1;
      while (s[i + n] && s[i + n].toLowerCase() === letter) n += 1;
      let code: DateCode;
      switch (letter) {
        case 'y': code = n <= 2 ? 'yy' : 'yyyy'; break;
        case 'm': code = n >= 5 ? 'mmmmm' : n === 4 ? 'mmmm' : n === 3 ? 'mmm' : n === 2 ? 'mm' : 'm'; break;
        case 'd': code = n >= 4 ? 'dddd' : n === 3 ? 'ddd' : n === 2 ? 'dd' : 'd'; break;
        case 'h': code = n >= 2 ? 'hh' : 'h'; break;
        default: code = n >= 2 ? 'ss' : 's';
      }
      tokens.push({ t: 'date', code });
      i += n;
    } else {
      tokens.push({ t: 'lit', s: ch });
      i += 1;
    }
  }

  section.isDate = tokens.some((token) => token.t === 'date');
  if (section.isDate) {
    // Separators in a date format are plain text.
    tokens.forEach((token, index) => {
      if (token.t === 'point') tokens[index] = { t: 'lit', s: '.' };
      else if (token.t === 'comma') tokens[index] = { t: 'lit', s: ',' };
      else if (token.t === 'pct') tokens[index] = { t: 'lit', s: '%' };
    });
    // `m` is minutes when it follows hours or precedes seconds, otherwise the month.
    const dates = tokens.filter((token): token is Extract<Token, { t: 'date' }> => token.t === 'date');
    dates.forEach((token, position) => {
      if (token.code !== 'm' && token.code !== 'mm') return;
      const previous = dates[position - 1];
      const next = dates[position + 1];
      if ((previous && (previous.code === 'h' || previous.code === 'hh' || previous.code === 'eh')) || (next && (next.code === 's' || next.code === 'ss' || next.code === 'es'))) token.minute = true;
    });
    return section;
  }

  const first = tokens.findIndex((token) => token.t === 'digit');
  let last = -1;
  for (let k = tokens.length - 1; k >= 0; k -= 1) if (tokens[k].t === 'digit') { last = k; break; }
  if (first >= 0) {
    // Commas straight after the last digit placeholder scale by 1000; commas between placeholders group thousands.
    for (let k = last + 1; k < tokens.length; k += 1) {
      if (tokens[k].t === 'comma') section.scale += 1;
      else if (tokens[k].t !== 'lit') break;
    }
    section.thousands = tokens.some((token, index) => token.t === 'comma' && index > first && index < last);
  }

  // Fractions: `# ?/?`, `# ??/??`, `?/8`.
  const slash = tokens.findIndex((token) => token.t === 'lit' && token.s === '/');
  if (slash > 0 && tokens[slash - 1].t === 'digit' && !tokens.some((token) => token.t === 'exp' || token.t === 'point')) {
    let den = 0;
    let k = slash + 1;
    while (tokens[k]?.t === 'digit') { den += 1; k += 1; }
    let fixed = '';
    while (den === 0 && tokens[k]?.t === 'lit' && /^\d+$/.test((tokens[k] as { s: string }).s)) { fixed += (tokens[k] as { s: string }).s; k += 1; }
    if (den > 0 || fixed) {
      const whole = tokens.slice(0, slash).some((token, index, all) => token.t === 'lit' && token.s === ' ' && all.slice(0, index).some((before) => before.t === 'digit'));
      section.fraction = { whole, digits: den || fixed.length, fixed: fixed ? Number(fixed) : undefined };
    }
  }
  return section;
}

interface ParsedFormat {
  sections: Section[];
  general: boolean;
}

const cache = new Map<string, ParsedFormat>();

function parseFormat(code: string): ParsedFormat {
  let parsed = cache.get(code);
  if (!parsed) {
    const trimmed = code.trim();
    if (!trimmed || trimmed.toLowerCase() === 'general') parsed = { sections: [], general: true };
    else parsed = { sections: splitSections(code).slice(0, 4).map(parseSection), general: false };
    if (cache.size > 500) cache.clear();
    cache.set(code, parsed);
  }
  return parsed;
}

/** True when the code shows dates or times. */
export function isDateFormat(code: string | undefined): boolean {
  if (!code) return false;
  return parseFormat(code).sections.some((section) => section.isDate);
}

/** True when the code shows percentages. */
export function isPercentFormat(code: string | undefined): boolean {
  if (!code) return false;
  return parseFormat(code).sections.some((section) => section.percents > 0);
}

function roundTo(x: number, digits: number): number {
  const text = x.toPrecision(15);
  if (text.includes('e')) return Number(x.toFixed(Math.min(Math.max(digits, 0), 100)));
  return Number(`${Math.round(Number(`${text}e${digits}`))}e-${digits}`);
}

/** The number part of a digit format (`#,##0.00`, `0.0E+00`, `(###) ###-####`). */
function renderDigits(section: Section, magnitude: number): string {
  const tokens = section.tokens;
  let value = magnitude;
  for (let n = 0; n < section.percents; n += 1) value *= 100;
  for (let n = 0; n < section.scale; n += 1) value /= 1000;

  const expIndex = tokens.findIndex((token) => token.t === 'exp');
  const mantissa = expIndex >= 0 ? tokens.slice(0, expIndex) : tokens;
  const first = mantissa.findIndex((token) => token.t === 'digit');
  const literals = (list: Token[]): string => list.map((token) => (token.t === 'lit' ? token.s : token.t === 'pct' ? '%' : '')).join('');
  if (first < 0) return literals(tokens);
  let last = mantissa.length - 1;
  while (mantissa[last].t !== 'digit') last -= 1;
  const prefix = literals(mantissa.slice(0, first));
  const suffix = literals(mantissa.slice(last + 1));
  const core = mantissa.slice(first, last + 1);
  const pointIndex = core.findIndex((token) => token.t === 'point');
  const intTokens = pointIndex >= 0 ? core.slice(0, pointIndex) : core;
  const decTokens = pointIndex >= 0 ? core.slice(pointIndex + 1) : [];
  const intCount = intTokens.filter((token) => token.t === 'digit').length;
  const decimals = decTokens.filter((token) => token.t === 'digit').length;

  let exponent = 0;
  if (expIndex >= 0) {
    const step = Math.max(1, intCount);
    if (value !== 0) {
      exponent = Math.floor(Math.floor(Math.log10(value)) / step) * step;
      value /= 10 ** exponent;
    }
    if (roundTo(value, decimals) >= 10 ** step) {
      exponent += step;
      value /= 10 ** step;
    }
  }

  const fixed = roundTo(value, decimals).toFixed(Math.min(decimals, 100));
  const [intPart, decPart = ''] = fixed.split('.');

  // Integer digits, right to left; literals between placeholders stay in place.
  let remaining = intPart === '0' ? '' : intPart;
  const out: string[] = [];
  let position = 0;
  const emit = (digit: string): void => {
    if (section.thousands && position > 0 && position % 3 === 0) out.push(',');
    out.push(digit);
    position += 1;
  };
  let seen = 0;
  for (let k = intTokens.length - 1; k >= 0; k -= 1) {
    const token = intTokens[k];
    if (token.t === 'digit') {
      seen += 1;
      if (remaining.length > 0) {
        const leftmost = seen === intCount;
        do {
          emit(remaining[remaining.length - 1]);
          remaining = remaining.slice(0, -1);
        } while (leftmost && remaining.length > 0);
      } else if (token.ch === '0') emit('0');
      else if (token.ch === '?') emit(' ');
    } else if (token.t === 'lit') out.push([...token.s].reverse().join(''));
    else if (token.t === 'pct') out.push('%');
  }
  let text = out.reverse().join('');

  if (pointIndex >= 0 && decimals > 0) {
    let lastNonZero = -1;
    for (let k = 0; k < decPart.length; k += 1) if (decPart[k] !== '0') lastNonZero = k;
    let decimal = '';
    let digitIndex = 0;
    for (const token of decTokens) {
      if (token.t === 'digit') {
        const digit = decPart[digitIndex] ?? '0';
        const trailingZero = digitIndex > lastNonZero;
        decimal += token.ch === '0' ? digit : trailingZero ? (token.ch === '?' ? ' ' : '') : digit;
        digitIndex += 1;
      } else if (token.t === 'lit') decimal += token.s;
      else if (token.t === 'pct') decimal += '%';
    }
    // `0.##` of a whole number shows no point at all.
    text += (lastNonZero >= 0 || decTokens.some((token) => token.t === 'digit' && token.ch === '0') || decimal.trim() !== '' ? '.' : '') + decimal;
  } else if (pointIndex >= 0) text += '.';

  if (expIndex >= 0) {
    const tail = tokens.slice(expIndex + 1);
    const expDigits = tail.filter((token) => token.t === 'digit').length;
    const sign = (tokens[expIndex] as { sign: boolean }).sign;
    text += `E${exponent < 0 ? '-' : sign ? '+' : ''}${String(Math.abs(exponent)).padStart(Math.max(1, expDigits), '0')}${literals(tail)}`;
    return prefix + text + suffix;
  }
  return prefix + text + suffix;
}

function renderFraction(section: Section, magnitude: number): string {
  const fraction = section.fraction!;
  const maxDen = fraction.fixed ?? 10 ** fraction.digits - 1;
  let whole = fraction.whole ? Math.floor(magnitude) : 0;
  const rest = magnitude - whole;
  let bestN = 0;
  let bestD = fraction.fixed ?? 1;
  if (fraction.fixed) bestN = Math.round(rest * bestD);
  else {
    let bestErr = Infinity;
    for (let d = 1; d <= maxDen; d += 1) {
      const n = Math.round(rest * d);
      const err = Math.abs(rest - n / d);
      if (err < bestErr - 1e-12) {
        bestErr = err;
        bestN = n;
        bestD = d;
        if (err < 1e-12) break;
      }
    }
  }
  if (fraction.whole && bestN >= bestD) {
    whole += 1;
    bestN = 0;
  }
  if (fraction.whole) return bestN === 0 ? String(whole) : whole === 0 ? `${bestN}/${bestD}` : `${whole} ${bestN}/${bestD}`;
  return `${bestN}/${bestD}`;
}

function renderDate(section: Section, serial: number): string {
  const ymd = serialToYmd(serial);
  const hms = serialToHms(serial);
  const twelve = section.tokens.some((token) => token.t === 'date' && (token.code === 'ampm' || token.code === 'ap'));
  const totalSeconds = Math.round(serial * 86400);
  const weekday = weekdayOf(serial) - 1;
  const out: string[] = [];
  for (const token of section.tokens) {
    if (token.t === 'lit') out.push(token.s);
    else if (token.t === 'frac') out.push(`.${(((serial * 86400) % 1)).toFixed(token.digits).slice(2)}`);
    else if (token.t === 'date') {
      switch (token.code) {
        case 'yyyy': out.push(String(ymd.y).padStart(4, '0')); break;
        case 'yy': out.push(String(ymd.y % 100).padStart(2, '0')); break;
        case 'mmmmm': out.push(MONTH_NAMES[ymd.m - 1]?.[0] ?? ''); break;
        case 'mmmm': out.push(MONTH_NAMES[ymd.m - 1] ?? ''); break;
        case 'mmm': out.push(MONTH_NAMES[ymd.m - 1]?.slice(0, 3) ?? ''); break;
        case 'mm': out.push(String(token.minute ? hms.m : ymd.m).padStart(2, '0')); break;
        case 'm': out.push(String(token.minute ? hms.m : ymd.m)); break;
        case 'dddd': out.push(DAY_NAMES[weekday] ?? ''); break;
        case 'ddd': out.push(DAY_NAMES[weekday]?.slice(0, 3) ?? ''); break;
        case 'dd': out.push(String(ymd.d).padStart(2, '0')); break;
        case 'd': out.push(String(ymd.d)); break;
        case 'hh': case 'h': {
          const hour = twelve ? (hms.h % 12 === 0 ? 12 : hms.h % 12) : hms.h;
          out.push(token.code === 'hh' ? String(hour).padStart(2, '0') : String(hour));
          break;
        }
        case 'ss': out.push(String(hms.s).padStart(2, '0')); break;
        case 's': out.push(String(hms.s)); break;
        case 'ampm': out.push(hms.h < 12 ? 'AM' : 'PM'); break;
        case 'ap': out.push(hms.h < 12 ? 'A' : 'P'); break;
        case 'eh': out.push(String(Math.floor(totalSeconds / 3600))); break;
        case 'em': out.push(String(Math.floor(totalSeconds / 60))); break;
        case 'es': out.push(String(totalSeconds)); break;
      }
    }
  }
  return out.join('');
}

export interface FormattedValue {
  text: string;
  /** Colour from a `[Red]` section. */
  color?: string;
}

const matchesCondition = (cond: { op: string; value: number }, value: number): boolean => {
  switch (cond.op) {
    case '<': return value < cond.value;
    case '>': return value > cond.value;
    case '<=': return value <= cond.value;
    case '>=': return value >= cond.value;
    case '=': return value === cond.value;
    case '<>': return value !== cond.value;
    default: return false;
  }
};

/** The section a number uses, and whether the sign is already part of it (a separate negative section). */
function pickSection(sections: Section[], value: number): { section: Section; signShown: boolean } {
  if (sections.some((section) => section.cond)) {
    for (let k = 0; k < sections.length; k += 1) {
      const section = sections[k];
      const last = k === sections.length - 1;
      if (section.cond ? matchesCondition(section.cond, value) : last || k >= 2 || !sections.slice(k + 1).some((later) => later.cond)) {
        return { section, signShown: value < 0 && k > 0 };
      }
    }
    return { section: sections[0], signShown: false };
  }
  if (value < 0 && sections.length > 1) return { section: sections[1], signShown: true };
  if (value === 0 && sections.length > 2) return { section: sections[2], signShown: false };
  return { section: sections[0], signShown: false };
}

/** Renders a number with a format code. */
export function formatNumber(value: number, code: string): FormattedValue {
  const parsed = parseFormat(code || 'General');
  if (parsed.general || parsed.sections.length === 0) return { text: generalText(value) };
  if (!Number.isFinite(value)) return { text: '#NUM!' };
  const { section, signShown } = pickSection(parsed.sections, value);
  const magnitude = Math.abs(value);
  const hasDigits = section.tokens.some((token) => token.t === 'digit');
  // A section with only `@` leaves numbers as General.
  if (section.hasText && !hasDigits && !section.isDate) return { text: generalText(value), color: section.color };
  let text: string;
  if (section.isDate) {
    if (value < 0) return { text: '########', color: section.color };
    text = renderDate(section, value);
  } else if (section.tokens.some((token) => token.t === 'general')) {
    text = section.tokens.map((token) => (token.t === 'general' ? generalText(magnitude) : token.t === 'lit' ? token.s : '')).join('');
    if (value < 0 && !signShown) text = `-${text}`;
  } else if (section.fraction) {
    text = renderFraction(section, magnitude);
    if (value < 0 && !signShown) text = `-${text}`;
  } else {
    text = renderDigits(section, magnitude);
    if (value < 0 && !signShown) text = `-${text}`;
  }
  return { text, color: section.color };
}

/** Renders any cell value with a format code; text goes through the `@` section when there is one. */
export function formatValue(value: number | string | boolean | null | undefined, code: string | undefined): FormattedValue {
  if (value === null || value === undefined) return { text: '' };
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE' };
  if (typeof value === 'number') return code && code !== 'General' ? formatNumber(value, code) : { text: generalText(value) };
  if (!code || code === 'General') return { text: value };
  const parsed = parseFormat(code);
  const textSection = parsed.sections.length >= 4 ? parsed.sections[3] : parsed.sections.find((section) => section.hasText);
  if (!textSection) return { text: value };
  return {
    text: textSection.tokens.map((token) => (token.t === 'text' ? value : token.t === 'lit' ? token.s : '')).join(''),
    color: textSection.color,
  };
}

export interface TypedInput {
  kind: 'empty' | 'number' | 'text' | 'bool' | 'formula';
  value?: number | string | boolean;
  formula?: string;
  /** A number format the typed text implies (`12%` → `0%`, `3/4/2026` → a date format). */
  numFmt?: string;
}

const CURRENCY = /^([+-]?)\s*([$€£¥])\s*([+-]?)(\d[\d,]*(?:\.\d+)?)$/;

/** Turns text typed into a cell into a value, formula or text with the format Excel would pick. */
export function parseInput(raw: string, currentFormat?: string): TypedInput {
  if (raw === '') return { kind: 'empty' };
  if (currentFormat === '@') return { kind: 'text', value: raw };
  if (raw.startsWith("'")) return { kind: 'text', value: raw.slice(1) };
  const text = raw.trim();
  if (text.startsWith('=') && text.length > 1) return { kind: 'formula', formula: text.slice(1) };
  const upper = text.toUpperCase();
  if (upper === 'TRUE') return { kind: 'bool', value: true };
  if (upper === 'FALSE') return { kind: 'bool', value: false };
  if (!text) return { kind: 'text', value: raw };

  const western = westernDigits(text);
  const currency = CURRENCY.exec(western);
  if (currency) {
    const number = Number(currency[4].replace(/,/g, ''));
    if (Number.isFinite(number)) {
      const negative = currency[1] === '-' || currency[3] === '-';
      const decimals = /\.(\d+)$/.exec(currency[4])?.[1].length ?? 0;
      const symbol = currency[2] === '$' ? '$' : `"${currency[2]}"`;
      return { kind: 'number', value: negative ? -number : number, numFmt: `${symbol}#,##0${decimals > 0 ? `.${'0'.repeat(Math.min(decimals, 4))}` : ''}` };
    }
  }
  if (/^[+-]?(\d[\d,]*)?\.?\d+\s*%$/.test(western)) {
    const number = parseNumberText(western);
    if (number !== null) {
      const decimals = /\.(\d+)\s*%$/.exec(western)?.[1].length ?? 0;
      return { kind: 'number', value: Math.round(number * 1e12) / 1e12, numFmt: decimals > 0 ? `0.${'0'.repeat(Math.min(decimals, 4))}%` : '0%' };
    }
  }
  const number = parseNumberText(western);
  if (number !== null && !/[$€£¥%]/.test(western)) {
    if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(western)) {
      const decimals = /\.(\d+)$/.exec(western)?.[1].length ?? 0;
      return { kind: 'number', value: number, numFmt: decimals > 0 ? `#,##0.${'0'.repeat(Math.min(decimals, 4))}` : '#,##0' };
    }
    return { kind: 'number', value: number };
  }
  if (/\d/.test(text) && /[/\-:.]|\s[A-Za-z]{3}/.test(text) && text.length <= 40) {
    const date = parseDateText(text);
    if (date) return { kind: 'number', value: date.serial, numFmt: date.format };
  }
  return { kind: 'text', value: raw };
}

/** The text a cell shows when it is edited: the formula, or the value as it would be typed. */
export function editText(value: number | string | boolean | null | undefined, formula: string | undefined, numFmt: string | undefined): string {
  if (formula !== undefined) return `=${formula}`;
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string') return value;
  if (numFmt && isPercentFormat(numFmt) && !isDateFormat(numFmt)) return `${generalText(Math.round(value * 1e14) / 1e12)}%`;
  if (numFmt && isDateFormat(numFmt)) {
    const date = formatNumber(value, numFmt).text;
    return date.includes('#') ? generalText(value) : date;
  }
  return generalText(value);
}

/**
 * The code with one more or one fewer decimal place, like the Increase and
 * Decrease Decimal buttons: `General` becomes `0.0`, `#,##0` becomes `#,##0.0`.
 */
export function adjustDecimals(code: string | undefined, delta: 1 | -1): string {
  const base = !code || code === 'General' ? '0' : code;
  const [positive, ...rest] = base.split(';');
  const match = /^(.*?[0#])(?:\.([0#]+))?([^0#]*)$/.exec(positive);
  if (!match || /[ymdhs]/i.test(positive.replace(/"[^"]*"/g, ''))) return code ?? 'General';
  const [, head, decimals = '', tail] = match;
  const places = Math.max(0, decimals.length + delta);
  const next = `${head}${places > 0 ? `.${'0'.repeat(places)}` : ''}${tail}`;
  return [next, ...rest].join(';');
}

/**
 * A number in General format cut to `maxChars` characters by giving up
 * decimals (then switching to scientific), like Excel does to fit a column.
 */
export function generalFit(value: number, maxChars: number): string {
  const full = generalText(value);
  if (full.length <= maxChars || !Number.isFinite(value)) return full;
  for (let digits = 14; digits >= 1; digits -= 1) {
    const text = generalText(Number(value.toPrecision(digits)));
    if (text.length <= maxChars && !/E/i.test(text)) return text;
  }
  const rounded = String(Math.round(value));
  if (rounded.length <= maxChars) return rounded;
  for (let digits = 5; digits >= 0; digits -= 1) {
    const text = value.toExponential(digits).replace('e', 'E').replace(/E([+-])(\d)$/, 'E$10$2');
    if (text.length <= maxChars) return text;
  }
  return full;
}
