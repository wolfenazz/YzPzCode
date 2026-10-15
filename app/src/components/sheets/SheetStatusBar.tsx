import React, { useMemo } from 'react';
import { Minus, Plus } from '@phosphor-icons/react';
import { cellKey } from '../../utils/sheets/address';
import { generalText } from '../../utils/sheets/formula/values';
import { formatValue } from '../../utils/sheets/numberFormat';
import type { Workbook } from '../../utils/sheets/types';
import type { GridSelection } from '../../stores/sheetsSessionStore';
import { LiquidSlider } from '../common/LiquidSlider';

interface SheetStatusBarProps {
  wb: Workbook;
  sheetIndex: number;
  selection: GridSelection;
  zoom: number;
  note?: string;
  onZoom: (percent: number) => void;
}

/** Sum, average and count of the selection, and the zoom. */
export const SheetStatusBar: React.FC<SheetStatusBarProps> = ({ wb, sheetIndex, selection, zoom, note, onZoom }) => {
  const stats = useMemo(() => {
    const sheet = wb.sheets[sheetIndex];
    let count = 0;
    let numbers = 0;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    let cells = 0;
    for (const range of selection.ranges) {
      const rows = Math.min(range.r2, range.r1 + 5000);
      const cols = Math.min(range.c2, range.c1 + 200);
      for (let r = range.r1; r <= rows; r += 1) {
        for (let c = range.c1; c <= cols; c += 1) {
          cells += 1;
          const cell = sheet.cells[cellKey(r, c)];
          if (!cell || (cell.v === undefined && cell.e === undefined)) continue;
          count += 1;
          if (typeof cell.v === 'number') {
            numbers += 1;
            sum += cell.v;
            min = Math.min(min, cell.v);
            max = Math.max(max, cell.v);
          }
        }
      }
    }
    return { count, numbers, sum, min, max, cells };
  }, [wb, sheetIndex, selection]);

  const fmt = (value: number): string => formatValue(Math.round(value * 1e8) / 1e8, '#,##0.######').text;
  return (
    <div className="sh-status" data-keep-edit>
      <div className="sh-status__left">
        {note && <span className="sh-status__note">{note}</span>}
        {stats.cells > 1 && stats.count > 0 && (
          <>
            <span>Count <strong>{stats.count}</strong></span>
            {stats.numbers > 0 && (
              <>
                <span>Sum <strong>{fmt(stats.sum)}</strong></span>
                <span>Average <strong>{fmt(stats.sum / stats.numbers)}</strong></span>
                <span>Min <strong>{generalText(stats.min)}</strong></span>
                <span>Max <strong>{generalText(stats.max)}</strong></span>
              </>
            )}
          </>
        )}
      </div>
      <div className="sh-status__zoom">
        <button type="button" aria-label="Zoom out" onClick={() => onZoom(Math.max(25, Math.round((zoom * 100 - 10) / 5) * 5))}><Minus size={11} /></button>
        <LiquidSlider size="sm" min={25} max={300} step={5} value={Math.round(zoom * 100)} aria-label="Zoom" onChange={(event) => onZoom(Number(event.target.value))} />
        <button type="button" aria-label="Zoom in" onClick={() => onZoom(Math.min(300, Math.round((zoom * 100 + 10) / 5) * 5))}><Plus size={11} /></button>
        <button type="button" className="sh-status__percent" onClick={() => onZoom(100)} title="Reset zoom">{Math.round(zoom * 100)}%</button>
      </div>
    </div>
  );
};
