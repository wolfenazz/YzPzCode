// Text functions.

import { toMatrix, toScalar } from '../arrays';
import { formatValue } from '../../numberFormat';
import { NA, VALUE, isError, isMatrix, isRef, parseNumberText, toNumber, toText, westernDigits, type Matrix, type Scalar } from '../values';
import { flattenCells, scalarFn, text, type FnTable } from './helpers';

const textOf = (value: Scalar): string => {
  const t = toText(value);
  return isError(t) ? t.code : t;
};

function wildcardToRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '~' && i + 1 < pattern.length) {
      out += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    } else if (ch === '*') out += '[\\s\\S]*';
    else if (ch === '?') out += '[\\s\\S]';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(out, 'i');
}

const joinCells = (cells: Scalar[], delimiter: string, skipEmpty: boolean): Scalar => {
  const parts: string[] = [];
  for (const cell of cells) {
    if (isError(cell)) return cell;
    const t = textOf(cell);
    if (skipEmpty && t === '') continue;
    parts.push(t);
  }
  return parts.join(delimiter);
};

export const TEXT_FUNCTIONS: FnTable = {
  LEN: scalarFn(1, 1, ([s]) => [...textOf(s)].length),
  LENB: scalarFn(1, 1, ([s]) => new TextEncoder().encode(textOf(s)).length),
  LEFT: scalarFn(1, 2, ([s, n]) => {
    const count = n === undefined ? 1 : toNumber(n);
    if (isError(count)) return count;
    return count < 0 ? VALUE : [...textOf(s)].slice(0, Math.trunc(count)).join('');
  }),
  RIGHT: scalarFn(1, 2, ([s, n]) => {
    const count = n === undefined ? 1 : toNumber(n);
    if (isError(count)) return count;
    if (count < 0) return VALUE;
    const chars = [...textOf(s)];
    return count === 0 ? '' : chars.slice(-Math.trunc(count)).join('');
  }),
  MID: scalarFn(3, 3, ([s, start, n]) => {
    const from = toNumber(start);
    const count = toNumber(n);
    if (isError(from)) return from;
    if (isError(count)) return count;
    if (from < 1 || count < 0) return VALUE;
    return [...textOf(s)].slice(Math.trunc(from) - 1, Math.trunc(from) - 1 + Math.trunc(count)).join('');
  }),
  UPPER: scalarFn(1, 1, ([s]) => textOf(s).toUpperCase()),
  LOWER: scalarFn(1, 1, ([s]) => textOf(s).toLowerCase()),
  PROPER: scalarFn(1, 1, ([s]) => textOf(s).toLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase())),
  TRIM: scalarFn(1, 1, ([s]) => textOf(s).replace(/^ +| +$/g, '').replace(/ {2,}/g, ' ')),
  CLEAN: scalarFn(1, 1, ([s]) => textOf(s).replace(/[\u0000-\u001f]/g, '')),
  CONCATENATE: scalarFn(1, 255, (args) => args.map(textOf).join('')),
  CONCAT: {
    min: 1, max: 255,
    fn: (args, env) => {
      const cells = flattenCells(args.map((arg) => (isRef(arg) || isMatrix(arg) ? arg : toScalar(arg, env))), env);
      return joinCells(cells, '', false);
    },
  },
  TEXTJOIN: {
    min: 3, max: 255,
    fn: (args, env) => {
      const delimiter = text(args[0], env);
      if (isError(delimiter)) return delimiter;
      const skip = toScalar(args[1], env) === true || (typeof toScalar(args[1], env) === 'number' && toScalar(args[1], env) !== 0);
      return joinCells(flattenCells(args.slice(2), env), delimiter, skip);
    },
  },
  TEXT: scalarFn(2, 2, ([value, format]) => {
    const code = textOf(format);
    if (typeof value === 'string') {
      const n = parseNumberText(value);
      return n === null ? formatValue(value, code).text : formatValue(n, code).text;
    }
    return formatValue(value as number | boolean | null, code).text;
  }),
  VALUE: scalarFn(1, 1, ([s]) => {
    if (typeof s === 'number') return s;
    const n = toNumber(s);
    return isError(n) ? VALUE : n;
  }),
  NUMBERVALUE: scalarFn(1, 3, ([s, decimal, group]) => {
    let t = westernDigits(textOf(s)).replace(/\s/g, '');
    const dec = decimal === undefined || decimal === null ? '.' : textOf(decimal);
    const grp = group === undefined || group === null ? ',' : textOf(group);
    if (grp) t = t.split(grp).join('');
    if (dec && dec !== '.') t = t.split(dec).join('.');
    let percent = 0;
    while (t.endsWith('%')) { percent += 1; t = t.slice(0, -1); }
    if (t === '') return 0;
    const n = Number(t);
    return Number.isNaN(n) ? VALUE : n / 100 ** percent;
  }),
  FIND: scalarFn(2, 3, ([find, within, start]) => {
    const from = start === undefined ? 1 : toNumber(start);
    if (isError(from)) return from;
    const haystack = textOf(within);
    if (from < 1 || from > haystack.length + 1) return VALUE;
    const index = haystack.indexOf(textOf(find), Math.trunc(from) - 1);
    return index < 0 ? VALUE : index + 1;
  }),
  SEARCH: scalarFn(2, 3, ([find, within, start]) => {
    const from = start === undefined ? 1 : toNumber(start);
    if (isError(from)) return from;
    const haystack = textOf(within);
    if (from < 1 || from > haystack.length + 1) return VALUE;
    const match = wildcardToRegex(textOf(find)).exec(haystack.slice(Math.trunc(from) - 1));
    return match ? match.index + Math.trunc(from) : VALUE;
  }),
  SUBSTITUTE: scalarFn(3, 4, ([s, oldText, newText, instance]) => {
    const source = textOf(s);
    const from = textOf(oldText);
    const to = textOf(newText);
    if (from === '') return source;
    if (instance === undefined || instance === null) return source.split(from).join(to);
    const n = toNumber(instance);
    if (isError(n)) return n;
    if (n < 1) return VALUE;
    let index = -1;
    let found = 0;
    for (;;) {
      index = source.indexOf(from, index + 1);
      if (index < 0) return source;
      found += 1;
      if (found === Math.trunc(n)) return source.slice(0, index) + to + source.slice(index + from.length);
    }
  }),
  REPLACE: scalarFn(4, 4, ([s, start, count, newText]) => {
    const from = toNumber(start);
    const n = toNumber(count);
    if (isError(from)) return from;
    if (isError(n)) return n;
    if (from < 1 || n < 0) return VALUE;
    const chars = [...textOf(s)];
    return chars.slice(0, Math.trunc(from) - 1).join('') + textOf(newText) + chars.slice(Math.trunc(from) - 1 + Math.trunc(n)).join('');
  }),
  REPT: scalarFn(2, 2, ([s, n]) => {
    const count = toNumber(n);
    if (isError(count)) return count;
    if (count < 0 || textOf(s).length * count > 32767) return VALUE;
    return textOf(s).repeat(Math.trunc(count));
  }),
  EXACT: scalarFn(2, 2, ([a, b]) => textOf(a) === textOf(b)),
  CHAR: scalarFn(1, 1, ([n]) => {
    const code = toNumber(n);
    return isError(code) ? code : code < 1 || code > 255 ? VALUE : String.fromCharCode(Math.trunc(code));
  }),
  CODE: scalarFn(1, 1, ([s]) => (textOf(s) === '' ? VALUE : textOf(s).charCodeAt(0))),
  UNICHAR: scalarFn(1, 1, ([n]) => {
    const code = toNumber(n);
    return isError(code) ? code : code < 1 || code > 0x10ffff ? VALUE : String.fromCodePoint(Math.trunc(code));
  }),
  UNICODE: scalarFn(1, 1, ([s]) => (textOf(s) === '' ? VALUE : textOf(s).codePointAt(0)!)),
  T: scalarFn(1, 1, ([s]) => (typeof s === 'string' ? s : '')),
  DOLLAR: scalarFn(1, 2, ([x, d]) => {
    const n = toNumber(x);
    const digits = d === undefined ? 2 : toNumber(d);
    if (isError(n)) return n;
    if (isError(digits)) return digits;
    const places = Math.max(0, Math.trunc(digits));
    return formatValue(n, `$#,##0${places ? `.${'0'.repeat(places)}` : ''};($#,##0${places ? `.${'0'.repeat(places)}` : ''})`).text;
  }),
  FIXED: scalarFn(1, 3, ([x, d, noCommas]) => {
    const n = toNumber(x);
    const digits = d === undefined ? 2 : toNumber(d);
    if (isError(n)) return n;
    if (isError(digits)) return digits;
    const places = Math.max(0, Math.trunc(digits));
    const grouping = noCommas === true ? '0' : '#,##0';
    return formatValue(n, `${grouping}${places ? `.${'0'.repeat(places)}` : ''}`).text;
  }),
  TEXTBEFORE: scalarFn(2, 4, ([s, delimiter, instance]) => {
    const source = textOf(s);
    const delim = textOf(delimiter);
    if (delim === '') return '';
    const n = instance === undefined ? 1 : Number(toNumber(instance));
    let index = -1;
    let found = 0;
    const from = n < 0 ? source.length : 0;
    if (n < 0) {
      let pos = from;
      while (found < -n) {
        pos = source.lastIndexOf(delim, pos - 1);
        if (pos < 0) return NA;
        found += 1;
        index = pos;
      }
    } else {
      let pos = -1;
      while (found < n) {
        pos = source.indexOf(delim, pos + 1);
        if (pos < 0) return NA;
        found += 1;
        index = pos;
      }
    }
    return source.slice(0, index);
  }),
  TEXTAFTER: scalarFn(2, 4, ([s, delimiter, instance]) => {
    const source = textOf(s);
    const delim = textOf(delimiter);
    if (delim === '') return source;
    const n = instance === undefined ? 1 : Number(toNumber(instance));
    let index = -1;
    let found = 0;
    if (n < 0) {
      let pos = source.length;
      while (found < -n) {
        pos = source.lastIndexOf(delim, pos - 1);
        if (pos < 0) return NA;
        found += 1;
        index = pos;
      }
    } else {
      let pos = -1;
      while (found < n) {
        pos = source.indexOf(delim, pos + 1);
        if (pos < 0) return NA;
        found += 1;
        index = pos;
      }
    }
    return source.slice(index + delim.length);
  }),
  TEXTSPLIT: {
    min: 2, max: 6,
    fn: (args, env) => {
      const source = text(args[0], env);
      const colDelim = text(args[1], env);
      if (isError(source)) return source;
      if (isError(colDelim)) return colDelim;
      const rowDelim = args[2] === undefined ? null : text(args[2], env);
      if (rowDelim !== null && isError(rowDelim)) return rowDelim;
      const rows = rowDelim ? source.split(rowDelim) : [source];
      const matrix: Matrix = rows.map((row) => (colDelim ? row.split(colDelim) : [row]));
      const width = Math.max(...matrix.map((row) => row.length));
      return matrix.map((row) => [...row, ...Array(width - row.length).fill(NA)]) as Matrix;
    },
  },
  VALUETOTEXT: scalarFn(1, 2, ([v]) => textOf(v)),
  ARRAYTOTEXT: {
    min: 1, max: 2,
    fn: (args, env) => toMatrix(args[0], env).map((row) => row.map(textOf).join(', ')).join(', '),
  },
};

