import React, { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as XLSX from 'xlsx';
import { DataEditor, GridCellKind } from '@glideapps/glide-data-grid';
import type { EditableGridCell, GridCell, GridColumn, Item } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useAppStore } from '../../stores/appStore';
import type { FileContent } from '../../types';
import { OpenInOfficeButton } from './OpenInOfficeButton';
import { usePreviewRefresh } from '../../hooks/usePreviewRefresh';

interface SpreadsheetEditorProps {
  filePath: string;
  fileName: string;
}

interface SheetData {
  name: string;
  rows: (string | number | boolean | null)[][];
  colCount: number;
}

type CellValue = string | number | boolean | null;

const COLUMN_COUNT_PAD = 8;
const DEFAULT_COLUMN_COUNT = 12;

const darkTheme = {
  accentColor: '#34d399',
  accentFg: '#0a0a0a',
  accentLight: 'rgba(52, 211, 153, 0.15)',
  textDark: '#e4e4e7',
  textMedium: '#a1a1aa',
  textLight: '#71717a',
  textBubble: '#e4e4e7',
  bgIconHeader: '#18181b',
  fgIconHeader: '#a1a1aa',
  textHeader: '#a1a1aa',
  textHeaderSelected: '#e4e4e7',
  bgCell: '#1c1c1f',
  bgCellMedium: '#212124',
  bgHeader: '#18181b',
  bgHeaderHasFocus: '#1f1f22',
  bgHeaderHovered: '#26262a',
  bgBubble: '#27272a',
  bgBubbleSelected: '#3f3f46',
  bgSearchResult: 'rgba(52, 211, 153, 0.2)',
  borderColor: '#2d2d31',
  drilldownBorder: '#3f3f46',
  linkColor: '#34d399',
  cellHorizontalPadding: 8,
  cellVerticalPadding: 4,
  headerFontStyle: '10px "JetBrains Mono", monospace',
  headerIconSize: 14,
  baseFontStyle: '12px "JetBrains Mono", monospace',
  markerFontStyle: '10px "JetBrains Mono", monospace',
  fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
  editorFontSize: '12px',
  lineHeight: 1.4,
};

const getColLetter = (index: number): string => {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
};

const formatCell = (value: CellValue): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(4).replace(/\.?0+$/, '');
  }
  return String(value);
};

const SpreadsheetEditorInner: React.FC<SpreadsheetEditorProps> = ({ filePath, fileName }) => {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dataRef = useRef<SheetData[]>([]);
  const filePathRef = useRef(filePath);
  const markFileSaved = useAppStore((s) => s.markFileSaved);
  const { refreshKey } = usePreviewRefresh(filePath);
  // When we save in-app, the fs watcher fires too — suppress the redundant
  // reload so we don't flash the spinner or reset the active sheet.
  const suppressRefreshRef = useRef(false);

  filePathRef.current = filePath;
  dataRef.current = sheets;

  const isCsv = fileName.toLowerCase().endsWith('.csv');

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(false);
    setSaveError(null);
    try {
      let workbook: XLSX.WorkBook;
      if (isCsv) {
        const result = await invoke<FileContent>('read_file_content', { path: filePath });
        workbook = XLSX.read(result.content, { type: 'string' });
      } else {
        const dataUrl = await invoke<string>('read_file_as_base64', { path: filePath });
        const rawBase64 = dataUrl.split(',')[1];
        const binaryString = atob(rawBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        workbook = XLSX.read(bytes, { type: 'array' });
      }

      const sheetDataList: SheetData[] = workbook.SheetNames.map((name) => {
        const ws = workbook.Sheets[name];
        const jsonData: CellValue[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: null,
          raw: true,
        });
        const maxCols = jsonData.reduce((max, row) => Math.max(max, row.length), 0);
        return {
          name,
          rows: jsonData,
          colCount: Math.max(maxCols + COLUMN_COUNT_PAD, DEFAULT_COLUMN_COUNT),
        };
      });

      setSheets(sheetDataList);
      setActiveSheet(0);
      setIsDirty(false);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [filePath, isCsv]);

  useEffect(() => {
    if (suppressRefreshRef.current) {
      suppressRefreshRef.current = false;
      return;
    }
    void loadFile();
  }, [loadFile, refreshKey]);

  const currentSheet = sheets[activeSheet] ?? null;

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      const value = currentSheet?.rows[row]?.[col] ?? null;
      if (value === null || value === undefined) {
        return {
          kind: GridCellKind.Text,
          data: '',
          displayData: '',
          allowOverlay: true,
        };
      }
      if (typeof value === 'number') {
        return {
          kind: GridCellKind.Number,
          data: value,
          displayData: formatCell(value),
          allowOverlay: true,
        };
      }
      return {
        kind: GridCellKind.Text,
        data: String(value),
        displayData: String(value),
        allowOverlay: true,
      };
    },
    [currentSheet]
  );

  const handleCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      const [col, row] = cell;
      const raw = (newValue as { data?: unknown }).data;
      const value: CellValue =
        raw === undefined || raw === null
          ? null
          : typeof raw === 'boolean' || typeof raw === 'number'
            ? raw
            : String(raw);
      setSheets((prev) => {
        const next = prev.map((s, si) => {
          if (si !== activeSheet) return s;
          const rows = s.rows.map((r) => r.slice());
          while (rows.length <= row) rows.push([]);
          const target = rows[row].slice();
          while (target.length <= col) target.push(null);
          target[col] = value;
          rows[row] = target;
          return { ...s, rows, colCount: Math.max(s.colCount, col + 1) };
        });
        return next;
      });
      setIsDirty(true);
      setSaveError(null);
    },
    [activeSheet]
  );

  const handleSave = useCallback(async () => {
    if (!currentSheet || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const workbook = XLSX.utils.book_new();
      dataRef.current.forEach((sheet) => {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
        XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
      });
      const bookType = isCsv ? 'csv' : 'xlsx';
      const base64 = XLSX.write(workbook, { bookType, type: 'base64' });
      // Our own write also triggers the fs watcher → suppress the redundant reload.
      suppressRefreshRef.current = true;
      await invoke('write_file_bytes', { path: filePathRef.current, base64Data: base64 });
      setIsDirty(false);
      markFileSaved(filePathRef.current);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(`Failed to save: ${message}`);
    } finally {
      setSaving(false);
    }
  }, [currentSheet, saving, isCsv, markFileSaved]);

  const columns = useMemo<GridColumn[]>(() => {
    const count = currentSheet?.colCount ?? DEFAULT_COLUMN_COUNT;
    return Array.from({ length: count }, (_, i) => ({
      id: String(i),
      title: getColLetter(i),
      width: 120,
    }));
  }, [currentSheet?.colCount]);

  const rowCount = currentSheet?.rows.length ?? 0;

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <div className="text-[10px] uppercase tracking-widest opacity-50">Failed to load spreadsheet</div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-[#262626]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0 border-zinc-800/60 bg-zinc-950">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-600 font-mono tracking-wider">
            {fileName}
          </span>
          {loading && (
            <svg className="w-3 h-3 animate-spin text-zinc-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {isDirty && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-[9px] font-mono text-red-400">{saveError}</span>
          )}
          <button
            onClick={() => {
              if (isDirty && !window.confirm('Discard unsaved changes and reload from disk?')) return;
              suppressRefreshRef.current = false;
              void loadFile();
            }}
            disabled={loading || saving}
            title="Reload from disk"
            aria-label="Reload spreadsheet from disk"
            className="p-1 rounded transition-colors cursor-pointer hover:bg-zinc-800 text-zinc-500 disabled:opacity-30"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4.58 9a8 8 0 0114.42 1M19.42 15a8 8 0 01-14.42-1" />
            </svg>
          </button>
          <OpenInOfficeButton filePath={filePath} appName="Excel" />
          <button
            onClick={() => void handleSave()}
            disabled={!isDirty || saving || loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-[5px] text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-emerald-400 transition-all duration-150 cursor-pointer select-none hover:bg-emerald-500/15 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {sheets.length > 1 && (
        <div className="flex items-center gap-0 border-b shrink-0 overflow-x-auto border-zinc-800/60 bg-zinc-950/80">
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(idx)}
              className={`px-3 py-1.5 text-[10px] font-mono tracking-wide whitespace-nowrap transition-colors cursor-pointer border-b-2 ${
                idx === activeSheet
                  ? 'text-emerald-400 border-emerald-500 bg-zinc-900'
                  : 'text-zinc-600 border-transparent hover:text-zinc-400 hover:bg-zinc-800/50'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {!loading && currentSheet && (
          <DataEditor
            getCellContent={getCellContent}
            columns={columns}
            rows={rowCount}
            onCellEdited={handleCellEdited}
            theme={darkTheme}
            rowMarkers="number"
            smoothScrollX
            smoothScrollY
            width="100%"
            height="100%"
            rowHeight={28}
            headerHeight={28}
          />
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-1 border-t shrink-0 border-zinc-800/60 bg-zinc-950">
        <span className="text-[9px] text-zinc-700 font-mono">
          {currentSheet ? `${rowCount} rows × ${currentSheet.colCount} cols` : ''}
        </span>
        <span className="text-[9px] text-zinc-700 font-mono">
          {isCsv ? 'CSV' : 'XLSX'} · click a cell to edit · Ctrl+S to save
        </span>
      </div>
    </div>
  );
};

export const SpreadsheetEditor = memo(SpreadsheetEditorInner);
