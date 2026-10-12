// The function registry.

import type { FnDef } from '../env';
import { DATETIME_FUNCTIONS } from './datetime';
import { FINANCIAL_FUNCTIONS } from './financial';
import { INFO_FUNCTIONS } from './info';
import { LOGICAL_FUNCTIONS } from './logical';
import { LOOKUP_FUNCTIONS } from './lookup';
import { MATH_FUNCTIONS } from './math';
import { STAT_FUNCTIONS } from './stats';
import { TEXT_FUNCTIONS } from './text';

export const FUNCTIONS: Record<string, FnDef> = {
  ...MATH_FUNCTIONS,
  ...STAT_FUNCTIONS,
  ...TEXT_FUNCTIONS,
  ...LOGICAL_FUNCTIONS,
  ...LOOKUP_FUNCTIONS,
  ...DATETIME_FUNCTIONS,
  ...FINANCIAL_FUNCTIONS,
  ...INFO_FUNCTIONS,
};

/** Function names grouped for the function picker. */
export const FUNCTION_GROUPS: Array<{ id: string; label: string; names: string[] }> = [
  { id: 'math', label: 'Math', names: Object.keys(MATH_FUNCTIONS) },
  { id: 'stats', label: 'Statistical', names: Object.keys(STAT_FUNCTIONS) },
  { id: 'text', label: 'Text', names: Object.keys(TEXT_FUNCTIONS) },
  { id: 'logical', label: 'Logical', names: Object.keys(LOGICAL_FUNCTIONS) },
  { id: 'lookup', label: 'Lookup & reference', names: Object.keys(LOOKUP_FUNCTIONS) },
  { id: 'date', label: 'Date & time', names: Object.keys(DATETIME_FUNCTIONS) },
  { id: 'financial', label: 'Financial', names: Object.keys(FINANCIAL_FUNCTIONS) },
  { id: 'info', label: 'Information', names: Object.keys(INFO_FUNCTIONS) },
];

export const isKnownFunction = (name: string): boolean => name.toUpperCase() in FUNCTIONS;
