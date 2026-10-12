// Pivot tables computed into a block of cells. The definition lives in the
// workbook's sidecar; in Excel the result appears as plain values.

import type { CellScalar, Pivot } from './types';

export type PivotCell = CellScalar | null;

export interface PivotResult {
  /** Rows of the result, header row first. */
  rows: PivotCell[][];
  /** Rows (from the top) that are headers or totals, for styling. */
  headerRows: number;
  totalRow: number | null;
  /** Columns that hold aggregated numbers. */
  valueColumnStart: number;
}

const AGG_LABEL: Record<string, string> = { sum: 'Sum', count: 'Count', average: 'Average', min: 'Min', max: 'Max' };

interface Acc {
  sum: number;
  count: number;
  min: number;
  max: number;
}

const key = (value: PivotCell): string => (value === null ? '' : String(value));

const compareKeys = (a: PivotCell, b: PivotCell): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a === null) return 1;
  if (b === null) return -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

const finish = (acc: Acc | undefined, agg: string): PivotCell => {
  if (!acc) return null;
  switch (agg) {
    case 'count': return acc.count;
    case 'average': return acc.count ? acc.sum / acc.count : null;
    case 'min': return acc.min;
    case 'max': return acc.max;
    default: return acc.sum;
  }
};

/** Cross-tabulates `source` (a header row followed by records) as `spec` describes. */
export function computePivot(source: PivotCell[][], spec: Pick<Pivot, 'rows' | 'columns' | 'values' | 'filters'>): PivotResult | string {
  if (source.length < 2) return 'The source needs a header row and at least one record.';
  const headers = source[0].map((cell) => key(cell).trim());
  const find = (name: string): number => headers.findIndex((h) => h.toLowerCase() === name.trim().toLowerCase());
  const rowFields = spec.rows.map(find);
  const colFields = spec.columns.map(find);
  const valueFields = spec.values.map((value) => find(value.field));
  for (const [list, names] of [[rowFields, spec.rows], [colFields, spec.columns], [valueFields, spec.values.map((v) => v.field)]] as const) {
    const missing = list.findIndex((index) => index < 0);
    if (missing >= 0) return `Field "${names[missing]}" is not in the source header.`;
  }
  if (spec.values.length === 0) return 'Choose at least one value to summarise.';

  const records = source.slice(1).filter((row) => row.some((cell) => cell !== null && cell !== ''));
  const filtered = records.filter((row) => (spec.filters ?? []).every((filter) => {
    const index = find(filter.field);
    return index < 0 || filter.equals.length === 0 || filter.equals.includes(key(row[index]));
  }));

  const rowKeys = new Map<string, PivotCell[]>();
  const colKeys = new Map<string, PivotCell[]>();
  const cells = new Map<string, Acc>();
  const rowTotals = new Map<string, Acc>();
  const colTotals = new Map<string, Acc>();
  const grand = new Map<number, Acc>();

  function add<K>(map: Map<K, Acc>, mapKey: K, value: number): void {
    const acc = map.get(mapKey);
    if (acc) {
      acc.sum += value;
      acc.count += 1;
      acc.min = Math.min(acc.min, value);
      acc.max = Math.max(acc.max, value);
    } else map.set(mapKey, { sum: value, count: 1, min: value, max: value });
  }

  for (const row of filtered) {
    const rowTuple = rowFields.map((index) => row[index] ?? null);
    const colTuple = colFields.map((index) => row[index] ?? null);
    const rk = rowTuple.map(key).join('\u0001');
    const ck = colTuple.map(key).join('\u0001');
    if (!rowKeys.has(rk)) rowKeys.set(rk, rowTuple);
    if (!colKeys.has(ck)) colKeys.set(ck, colTuple);
    valueFields.forEach((index, v) => {
      const raw = row[index];
      const isCount = spec.values[v].agg === 'count';
      const number = typeof raw === 'number' ? raw : isCount && raw !== null && raw !== '' ? 1 : null;
      if (number === null) return;
      add(cells, `${rk}|${ck}|${v}`, number);
      add(rowTotals, `${rk}|${v}`, number);
      add(colTotals, `${ck}|${v}`, number);
      add(grand, v, number);
    });
  }

  const sortedRows = [...rowKeys.entries()].sort((a, b) => {
    for (let i = 0; i < rowFields.length; i += 1) {
      const order = compareKeys(a[1][i], b[1][i]);
      if (order !== 0) return order;
    }
    return 0;
  });
  const sortedCols = [...colKeys.entries()].sort((a, b) => {
    for (let i = 0; i < colFields.length; i += 1) {
      const order = compareKeys(a[1][i], b[1][i]);
      if (order !== 0) return order;
    }
    return 0;
  });

  const valueLabel = (v: number): string => `${AGG_LABEL[spec.values[v].agg ?? 'sum']} of ${spec.values[v].field}`;
  const hasColumns = colFields.length > 0;
  const header: PivotCell[] = spec.rows.map((name) => name);
  if (hasColumns) {
    for (const [, tuple] of sortedCols) {
      spec.values.forEach((_, v) => header.push(spec.values.length > 1 ? `${tuple.map(key).join(' / ') || '(blank)'} · ${valueLabel(v)}` : tuple.map(key).join(' / ') || '(blank)'));
    }
    spec.values.forEach((_, v) => header.push(spec.values.length > 1 ? `Grand Total · ${valueLabel(v)}` : 'Grand Total'));
  } else {
    spec.values.forEach((_, v) => header.push(valueLabel(v)));
  }

  const out: PivotCell[][] = [header];
  for (const [rk, tuple] of sortedRows) {
    const line: PivotCell[] = tuple.map((cell) => cell ?? '(blank)');
    if (hasColumns) {
      for (const [ck] of sortedCols) spec.values.forEach((value, v) => line.push(finish(cells.get(`${rk}|${ck}|${v}`), value.agg ?? 'sum')));
      spec.values.forEach((value, v) => line.push(finish(rowTotals.get(`${rk}|${v}`), value.agg ?? 'sum')));
    } else {
      spec.values.forEach((value, v) => line.push(finish(cells.get(`${rk}||${v}`), value.agg ?? 'sum')));
    }
    out.push(line);
  }

  const total: PivotCell[] = spec.rows.map((_, i) => (i === 0 ? 'Grand Total' : ''));
  if (hasColumns) {
    for (const [ck] of sortedCols) spec.values.forEach((value, v) => total.push(finish(colTotals.get(`${ck}|${v}`), value.agg ?? 'sum')));
  }
  spec.values.forEach((value, v) => total.push(finish(grand.get(v), value.agg ?? 'sum')));
  if (spec.rows.length > 0) out.push(total);

  return { rows: out, headerRows: 1, totalRow: spec.rows.length > 0 ? out.length - 1 : null, valueColumnStart: Math.max(1, spec.rows.length) };
}
