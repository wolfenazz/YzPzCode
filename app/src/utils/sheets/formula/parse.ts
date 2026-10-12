// Tokens to an abstract syntax tree (Excel operator precedence).

import type { ErrorCode } from '../types';
import { FormulaSyntaxError, parseRefBody, tokenize, type RefParts, type Tok } from './tokenize';

export type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'err'; v: ErrorCode }
  | { t: 'empty' }
  | { t: 'ref'; sheet?: string; ref: RefParts }
  | { t: 'name'; name: string }
  | { t: 'struct'; table: string; spec: string }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'un'; op: '-' | '+'; arg: Node }
  | { t: 'pct'; arg: Node }
  | { t: 'spill'; arg: Node }
  | { t: 'bin'; op: string; l: Node; r: Node }
  | { t: 'range'; l: Node; r: Node }
  | { t: 'arr'; rows: Node[][] };

const PRECEDENCE: Record<string, number> = {
  '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1,
  '&': 2,
  '+': 3, '-': 3,
  '*': 4, '/': 4,
  '^': 5,
};

class Parser {
  private pos = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok {
    return this.toks[this.pos];
  }

  private next(): Tok {
    return this.toks[this.pos++];
  }

  parse(): Node {
    const node = this.binary(1);
    if (this.peek().k !== 'eof') throw new FormulaSyntaxError('Unexpected token');
    return node;
  }

  private binary(min: number): Node {
    let left = this.unary();
    for (;;) {
      const tok = this.peek();
      if (tok.k !== 'op') break;
      const prec = PRECEDENCE[tok.v];
      if (prec === undefined || prec < min) break;
      this.next();
      const right = this.binary(prec + 1);
      left = { t: 'bin', op: tok.v, l: left, r: right };
    }
    return left;
  }

  private unary(): Node {
    const tok = this.peek();
    if (tok.k === 'op' && (tok.v === '-' || tok.v === '+')) {
      this.next();
      return { t: 'un', op: tok.v, arg: this.unary() };
    }
    if (tok.k === 'op' && tok.v === '@') {
      // Implicit intersection marker: the value is used as a single cell.
      this.next();
      return this.unary();
    }
    return this.postfix();
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      const tok = this.peek();
      if (tok.k === 'op' && tok.v === ':') {
        this.next();
        const right = this.primary();
        node = { t: 'range', l: node, r: right };
      } else if (tok.k === 'op' && tok.v === '%') {
        this.next();
        node = { t: 'pct', arg: node };
      } else if (tok.k === 'op' && tok.v === '#') {
        this.next();
        node = { t: 'spill', arg: node };
      } else break;
    }
    return node;
  }

  private primary(): Node {
    const tok = this.next();
    switch (tok.k) {
      case 'num': return { t: 'num', v: tok.v };
      case 'str': return { t: 'str', v: tok.v };
      case 'bool': return { t: 'bool', v: tok.v };
      case 'err': return { t: 'err', v: tok.v };
      case 'name': return { t: 'name', name: tok.v };
      case 'struct': return { t: 'struct', table: tok.table, spec: tok.spec };
      case 'ref': {
        const ref = parseRefBody(tok.body);
        if (!ref) throw new FormulaSyntaxError('Bad reference');
        return { t: 'ref', sheet: tok.sheet, ref };
      }
      case 'func': {
        this.next(); // (
        const args: Node[] = [];
        if (this.peek().k === 'rp') {
          this.next();
          return { t: 'call', name: tok.v, args };
        }
        for (;;) {
          const peeked = this.peek();
          if (peeked.k === 'comma' || peeked.k === 'semi' || peeked.k === 'rp') args.push({ t: 'empty' });
          else args.push(this.binary(1));
          const sep = this.next();
          if (sep.k === 'rp') break;
          if (sep.k !== 'comma' && sep.k !== 'semi') throw new FormulaSyntaxError('Expected , or )');
        }
        return { t: 'call', name: tok.v, args };
      }
      case 'lp': {
        const inner = this.binary(1);
        if (this.next().k !== 'rp') throw new FormulaSyntaxError('Missing )');
        return inner;
      }
      case 'lb': {
        const rows: Node[][] = [[]];
        for (;;) {
          rows[rows.length - 1].push(this.binary(1));
          const sep = this.next();
          if (sep.k === 'rb') break;
          if (sep.k === 'comma') continue;
          if (sep.k === 'semi') rows.push([]);
          else throw new FormulaSyntaxError('Bad array constant');
        }
        return { t: 'arr', rows };
      }
      default:
        throw new FormulaSyntaxError('Unexpected token');
    }
  }
}

const parseCache = new Map<string, Node | FormulaSyntaxError>();

export function parseFormula(text: string): Node {
  const source = text.startsWith('=') ? text.slice(1) : text;
  const cached = parseCache.get(source);
  if (cached) {
    if (cached instanceof FormulaSyntaxError) throw cached;
    return cached;
  }
  try {
    const node = new Parser(tokenize(source)).parse();
    if (parseCache.size > 20000) parseCache.clear();
    parseCache.set(source, node);
    return node;
  } catch (error) {
    const wrapped = error instanceof FormulaSyntaxError ? error : new FormulaSyntaxError(String(error));
    if (parseCache.size > 20000) parseCache.clear();
    parseCache.set(source, wrapped);
    throw wrapped;
  }
}

/** Parses without throwing; the message is for the editor to show. */
export function tryParseFormula(text: string): { ok: true; node: Node } | { ok: false; error: string } {
  try {
    return { ok: true, node: parseFormula(text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid formula' };
  }
}
