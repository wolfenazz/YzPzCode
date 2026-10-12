// Information functions. Unlike most functions these look at errors instead of passing them on.

import { colName } from '../../address';
import { toScalar } from '../arrays';
import type { FnDef } from '../env';
import { NA, VALUE, isError, isMatrix, isRef, toNumber, type Scalar } from '../values';
import type { FnTable } from './helpers';

/** A one-argument test applied to each cell, with errors passed to the test rather than returned. */
const probe = (test: (value: Scalar) => boolean | number | string): FnDef => ({
  min: 1,
  max: 1,
  lift: 'all',
  fn: (args, env) => test(toScalar(args[0], env)),
});

const ERROR_TYPES: Record<string, number> = { '#NULL!': 1, '#DIV/0!': 2, '#VALUE!': 3, '#REF!': 4, '#NAME?': 5, '#NUM!': 6, '#N/A': 7, '#SPILL!': 9, '#CALC!': 14 };

export const INFO_FUNCTIONS: FnTable = {
  ISBLANK: probe((v) => v === null),
  ISERROR: probe((v) => isError(v)),
  ISERR: probe((v) => isError(v) && v.code !== '#N/A'),
  ISNA: probe((v) => isError(v) && v.code === '#N/A'),
  ISNUMBER: probe((v) => typeof v === 'number'),
  ISTEXT: probe((v) => typeof v === 'string'),
  ISNONTEXT: probe((v) => typeof v !== 'string'),
  ISLOGICAL: probe((v) => typeof v === 'boolean'),
  ISEVEN: {
    min: 1, max: 1, lift: 'all',
    fn: (args, env) => {
      const n = toNumber(toScalar(args[0], env));
      return isError(n) ? n : Math.trunc(Math.abs(n)) % 2 === 0;
    },
  },
  ISODD: {
    min: 1, max: 1, lift: 'all',
    fn: (args, env) => {
      const n = toNumber(toScalar(args[0], env));
      return isError(n) ? n : Math.trunc(Math.abs(n)) % 2 === 1;
    },
  },
  ISREF: { min: 1, max: 1, fn: (args) => isRef(args[0]) },
  ISFORMULA: {
    min: 1, max: 1,
    fn: (args, env) => {
      const ref = args[0];
      if (!isRef(ref)) return VALUE;
      return env.wb.sheets[ref.sheet]?.cells[`${colName(ref.c1)}${ref.r1 + 1}`]?.f !== undefined;
    },
  },
  N: {
    min: 1, max: 1,
    fn: (args, env) => {
      const v = toScalar(args[0], env);
      if (isError(v)) return v;
      return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0;
    },
  },
  NA: { min: 0, max: 0, fn: () => NA },
  TYPE: {
    min: 1, max: 1,
    fn: (args, env) => {
      if (isMatrix(args[0])) return 64;
      const v = toScalar(args[0], env);
      return isError(v) ? 16 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : 1;
    },
  },
  'ERROR.TYPE': {
    min: 1, max: 1,
    fn: (args, env) => {
      const v = toScalar(args[0], env);
      return isError(v) ? ERROR_TYPES[v.code] ?? NA : NA;
    },
  },
  SHEET: {
    min: 0, max: 1,
    fn: (args, env) => (args.length && isRef(args[0]) ? args[0].sheet + 1 : env.sheet + 1),
  },
  SHEETS: { min: 0, max: 1, fn: (_args, env) => env.wb.sheets.length },
};
