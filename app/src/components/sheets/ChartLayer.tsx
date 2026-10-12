import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { chartSvg, LIGHT_CHART_THEME, resolveChart, type ChartTheme } from '../../utils/sheets/charts';
import type { ChartDef, Workbook } from '../../utils/sheets/types';

export interface OverlayApi {
  /** Pixel rectangle (relative to the grid frame) of a cell. */
  cellRect: (row: number, col: number) => { x: number; y: number; w: number; h: number };
  colAt: (x: number) => number;
  rowAt: (y: number) => number;
  size: { w: number; h: number };
  rtl: boolean;
  dark: boolean;
}

interface ChartLayerProps {
  wb: Workbook;
  sheetIndex: number;
  api: OverlayApi;
  readOnly: boolean;
  /** Called with the changed chart (moved or resized) or null to delete it. */
  onChange: (chart: ChartDef, remove: boolean) => void;
  onEdit: (chart: ChartDef) => void;
  /** Cells that sit under the chart anchor the layer to the grid. */
  version: number;
}

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  dx: number;
  dy: number;
}

/** Charts drawn over the grid: selectable, movable and resizable by cell. */
export const ChartLayer: React.FC<ChartLayerProps> = ({ wb, sheetIndex, api, readOnly, onChange, onEdit, version }) => {
  const dark = api.dark;
  const sheet = wb.sheets[sheetIndex];
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const theme: ChartTheme = dark
    ? { text: '#e6e8eb', muted: '#9aa1ab', grid: 'rgba(255,255,255,0.09)', background: 'transparent', font: LIGHT_CHART_THEME.font }
    : LIGHT_CHART_THEME;

  const items = useMemo(() => sheet.charts.map((chart) => {
    const topLeft = api.cellRect(chart.from.row, chart.from.col);
    const bottomRight = api.cellRect(Math.max(chart.from.row, chart.to.row - 1), Math.max(chart.from.col, chart.to.col - 1));
    const left = Math.min(topLeft.x, bottomRight.x);
    const right = Math.max(topLeft.x + topLeft.w, bottomRight.x + bottomRight.w);
    const top = topLeft.y;
    const bottom = bottomRight.y + bottomRight.h;
    return { chart, x: left, y: top, w: Math.max(120, right - left), h: Math.max(90, bottom - top) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sheet.charts, api, version]);

  useEffect(() => setSelected(null), [sheetIndex]);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && !readOnly && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        const chart = sheet.charts.find((entry) => entry.id === selected);
        if (chart) {
          event.preventDefault();
          event.stopPropagation();
          onChange(chart, true);
          setSelected(null);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selected, readOnly, sheet.charts, onChange]);

  useEffect(() => {
    if (!drag) return undefined;
    const move = (event: MouseEvent): void => {
      const state = dragRef.current;
      if (!state) return;
      state.dx = event.clientX - state.startX;
      state.dy = event.clientY - state.startY;
      setDrag({ ...state });
    };
    const up = (): void => {
      const state = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!state || (Math.abs(state.dx) < 3 && Math.abs(state.dy) < 3)) return;
      const item = items.find((entry) => entry.chart.id === state.id);
      if (!item) return;
      if (state.mode === 'move') {
        // The anchor cell is the chart's leading corner: its right edge on a right-to-left sheet.
        const probe = api.rtl ? item.x + item.w + state.dx - 1 : item.x + state.dx + 1;
        const col = api.colAt(Math.min(api.size.w - 1, Math.max(0, probe)));
        const row = api.rowAt(Math.max(0, item.y + state.dy + 1));
        const width = item.chart.to.col - item.chart.from.col;
        const height = item.chart.to.row - item.chart.from.row;
        onChange({ ...item.chart, from: { col, row }, to: { col: col + width, row: row + height } }, false);
      } else {
        const probe = api.rtl ? item.x + state.dx + 1 : item.x + item.w + state.dx - 1;
        const col = api.colAt(Math.min(api.size.w - 1, Math.max(0, probe)));
        const row = api.rowAt(Math.max(0, item.y + item.h + state.dy - 1));
        onChange({ ...item.chart, to: { col: Math.max(item.chart.from.col + 2, col + 1), row: Math.max(item.chart.from.row + 3, row + 1) } }, false);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [drag, items, api, onChange]);

  const start = (event: React.MouseEvent, id: string, mode: DragState['mode']): void => {
    event.stopPropagation();
    setSelected(id);
    if (readOnly) return;
    const state: DragState = { id, mode, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 };
    dragRef.current = state;
    setDrag(state);
  };

  if (items.length === 0) return null;
  return (
    <div className="sh-charts">
      {items.map(({ chart, x, y, w, h }) => {
        const moving = drag && drag.id === chart.id;
        const dx = moving ? drag!.dx : 0;
        const dy = moving ? drag!.dy : 0;
        const width = Math.round(w + (moving && drag!.mode === 'resize' ? dx * (api.rtl ? -1 : 1) : 0));
        const height = Math.round(h + (moving && drag!.mode === 'resize' ? dy : 0));
        const left = moving && drag!.mode === 'move' ? x + dx : x;
        const top = moving && drag!.mode === 'move' ? y + dy : y;
        const svg = chartSvg(chart, resolveChart(wb, chart, sheetIndex), Math.max(120, width), Math.max(90, height), theme);
        return (
          <div
            key={chart.id}
            className={`sh-chart${selected === chart.id ? ' is-selected' : ''}`}
            style={{ left, top, width, height }}
            onMouseDown={(event) => start(event, chart.id, 'move')}
            onDoubleClick={(event) => { event.stopPropagation(); if (!readOnly) onEdit(chart); }}
            onContextMenu={(event) => event.stopPropagation()}
          >
            <div className="sh-chart__svg" dangerouslySetInnerHTML={{ __html: svg }} />
            {selected === chart.id && !readOnly && (
              <>
                <button type="button" className="sh-chart__delete" aria-label="Delete chart" onMouseDown={(event) => event.stopPropagation()} onClick={() => { onChange(chart, true); setSelected(null); }}><Trash size={12} /></button>
                <span className="sh-chart__handle" onMouseDown={(event) => start(event, chart.id, 'resize')} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};
