// Formula text to tokens. Every token keeps its source span so references can be
// rewritten (insert, delete, copy, rename) without disturbing the rest of the text.

import { colIndex } from '../address';
import { MAX_COLS, MAX_ROWS } from '../types';
import type { ErrorCode } from '../types';

export type Tok =
  | { k: 'num'; v: number; start: number; end: number }
  | { k: 'str'; v: string; start: number; end: number }
  | { k: 'bool'; v: boolean; start: number; end: number }
  | { k: 'err'; v: ErrorCode; start: number; end: number }
  | { k: 'ref'; sheet?: string; body: string; start: number; end: number }
  | { k: 'name'; v: string; start: number; end: number }
  | { k: 'func'; v: string; start: number; end: number }
  | { k: 'struct'; table: string; spec: string; start: number; end: number }
  | { k: 'op'; v: string; start: number; end: number }
  | { k: 'lp' | 'rp' | 'comma' | 'semi' | 'lb' | 'rb'; start: number; end: number }
  | { k: 'eof'; start: number; end: number };

export class FormulaSyntaxError extends Error {}

const ERRORS: ErrorCode[] = ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#NULL!', '#N/A', '#SPILL!', '#CALC!'];
const NAME_START = /[A-Za-z_\\À-￿]/;
const NAME_PART = /[\w.\\À-￿]/;
const REF_BODY = /^(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)/;

export interface RefParts {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  absR1: boolean;
  absC1: boolean;
  absR2: boolean;
  absC2: boolean;
  kind: 'cell' | 'range' | 'cols' | 'rows';
}

const parseCorner = (text: string): { col?: number; row?: number; absC: boolean; absR: boolean } | null => {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(text);
  if (m) {
    const col = colIndex(m[2]);
    const row = Number(m[4]) - 1;
    return col < 0 || row < 0 || row >= MAX_ROWS ? null : { col, row, absC: m[1] === '$', absR: m[3] === '$' };
  }
  const c = /^(\$?)([A-Za-z]{1,3})$/.exec(text);
  if (c) {
    const col = colIndex(c[2]);
    return col < 0 ? null : { col, absC: c[1] === '$', absR: false };
  }
  const r = /^(\$?)(\d+)$/.exec(text);
  if (r) {
    const row = Number(r[2]) - 1;
    return row < 0 || row >= MAX_ROWS ? null : { row, absC: false, absR: r[1] === '$' };
  }
  return null;
};

/** `$A$1`, `A1:B2`, `C:E`, `3:5` to coordinates and `$` flags. */
export function parseRefBody(body: string): RefParts | null {
  const parts = body.split(':');
  if (parts.length === 1) {
    const corner = parseCorner(parts[0]);
    if (!corner || corner.col === undefined || corner.row === undefined) return null;
    return { r1: corner.row, c1: corner.col, r2: corner.row, c2: corner.col, absR1: corner.absR, absC1: corner.absC, absR2: corner.absR, absC2: corner.absC, kind: 'cell' };
  }
  if (parts.length !== 2) return null;
  const a = parseCorner(parts[0]);
  const b = parseCorner(parts[1]);
  if (!a || !b) return null;
  if (a.col !== undefined && a.row !== undefined && b.col !== undefined && b.row !== undefined) {
    return { r1: a.row, c1: a.col, r2: b.row, c2: b.col, absR1: a.absR, absC1: a.absC, absR2: b.absR, absC2: b.absC, kind: 'range' };
  }
  if (a.col !== undefined && a.row === undefined && b.col !== undefined && b.row === undefined) {
    return { r1: 0, c1: a.col, r2: MAX_ROWS - 1, c2: b.col, absR1: true, absC1: a.absC, absR2: true, absC2: b.absC, kind: 'cols' };
  }
  if (a.row !== undefined && a.col === undefined && b.row !== undefined && b.col === undefined) {
    return { r1: a.row, c1: 0, r2: b.row, c2: MAX_COLS - 1, absR1: a.absR, absC1: true, absR2: b.absR, absC2: true, kind: 'rows' };
  }
  return null;
}

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const start = i;
    if (ch === '"') {
      let value = '';
      i += 1;
      for (;;) {
        if (i >= n) throw new FormulaSyntaxError('Unterminated text');
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        value += src[i];
        i += 1;
      }
      out.push({ k: 'str', v: value, start, end: i });
      continue;
    }
    if (ch === '#') {
      const rest = src.slice(i).toUpperCase();
      const found = ERRORS.find((code) => rest.startsWith(code));
      if (found) {
        out.push({ k: 'err', v: found, start, end: i + found.length });
        i += found.length;
        continue;
      }
      // Spill reference operator: `A1#`.
      out.push({ k: 'op', v: '#', start, end: i + 1 });
      i += 1;
      continue;
    }

    // Sheet-qualified reference: 'My Sheet'!A1 or Sheet1!A1:B2.
    let sheet: string | undefined;
    let cursor = i;
    if (ch === "'") {
      let j = i + 1;
      let name = '';
      while (j < n) {
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            name += "'";
            j += 2;
            continue;
          }
          break;
        }
        name += src[j];
        j += 1;
      }
      if (src[j] === "'" && src[j + 1] === '!') {
        sheet = name;
        cursor = j + 2;
      } else throw new FormulaSyntaxError('Unterminated sheet name');
    } else if (NAME_START.test(ch)) {
      let j = i;
      while (j < n && NAME_PART.test(src[j])) j += 1;
      if (src[j] === '!') {
        sheet = src.slice(i, j);
        cursor = j + 1;
      }
    }
    if (sheet !== undefined || /[A-Za-z$\d]/.test(src[cursor] ?? '')) {
      const match = REF_BODY.exec(src.slice(cursor));
      if (match) {
        const after = src[cursor + match[0].length];
        // `A1` followed by an identifier character or `(` is a name or a function (`LOG10(`), not a reference.
        const identTail = after !== undefined && (/[\wÀ-￿]/.test(after) || after === '(');
        if (sheet !== undefined || !identTail) {
          out.push({ k: 'ref', sheet, body: match[0], start, end: cursor + match[0].length });
          i = cursor + match[0].length;
          continue;
        }
      }
      if (sheet !== undefined) throw new FormulaSyntaxError('Bad reference');
    }

    if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const match = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))!;
      out.push({ k: 'num', v: Number(match[0]), start, end: i + match[0].length });
      i += match[0].length;
      continue;
    }

    if (NAME_START.test(ch)) {
      let j = i;
      while (j < n && NAME_PART.test(src[j])) j += 1;
      const word = src.slice(i, j);
      const upper = word.toUpperCase();
      if (src[j] === '[') {
        // Structured reference: Table1[Column], Table1[[#This Row],[Column]].
        let depth = 0;
        let k = j;
        for (; k < n; k += 1) {
          if (src[k] === '[') depth += 1;
          else if (src[k] === ']') {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        if (depth !== 0) throw new FormulaSyntaxError('Unclosed table reference');
        out.push({ k: 'struct', table: word, spec: src.slice(j, k + 1), start, end: k + 1 });
        i = k + 1;
        continue;
      }
      if (src[j] === '(') {
        out.push({ k: 'func', v: upper.replace(/^_XLFN\.(_XLWS\.)?/, ''), start, end: j });
        i = j;
        continue;
      }
      if (upper === 'TRUE' || upper === 'FALSE') {
        out.push({ k: 'bool', v: upper === 'TRUE', start, end: j });
        i = j;
        continue;
      }
      out.push({ k: 'name', v: word, start, end: j });
      i = j;
      continue;
    }

    if (ch === '[') {
      let k = i;
      let depth = 0;
      for (; k < n; k += 1) {
        if (src[k] === '[') depth += 1;
        else if (src[k] === ']') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (depth !== 0) throw new FormulaSyntaxError('Unclosed table reference');
      out.push({ k: 'struct', table: '', spec: src.slice(i, k + 1), start, end: k + 1 });
      i = k + 1;
      continue;
    }

    const two = src.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=') {
      out.push({ k: 'op', v: two, start, end: i + 2 });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%:@'.includes(ch)) {
      out.push({ k: 'op', v: ch, start, end: i + 1 });
      i += 1;
      continue;
    }
    if (ch === '(') out.push({ k: 'lp', start, end: i + 1 });
    else if (ch === ')') out.push({ k: 'rp', start, end: i + 1 });
    else if (ch === ',') out.push({ k: 'comma', start, end: i + 1 });
    else if (ch === ';') out.push({ k: 'semi', start, end: i + 1 });
    else if (ch === '{') out.push({ k: 'lb', start, end: i + 1 });
    else if (ch === '}') out.push({ k: 'rb', start, end: i + 1 });
    else throw new FormulaSyntaxError(`Unexpected "${ch}"`);
    i += 1;
  }
  out.push({ k: 'eof', start: n, end: n });
  return out;
}
