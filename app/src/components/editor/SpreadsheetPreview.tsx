import React, { memo, useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as XLSX from 'xlsx';

interface SpreadsheetPreviewProps {
  filePath: string;
  fileName: string;
  theme: 'dark' | 'light';
}

interface SheetData {
  name: string;
  rows: (string | number | boolean | null)[][];
  headers: (string | number | boolean | null)[];
  colCount: number;
  rowCount: number;
}

const SpreadsheetPreviewInner: React.FC<SpreadsheetPreviewProps> = ({ filePath, fileName, theme }) => {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    invoke<string>('read_file_as_base64', { path: filePath })
      .then((dataUrl) => {
        if (cancelled) return;
        const rawBase64 = dataUrl.split(',')[1];
        const binaryString = atob(rawBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const parseWork = () => {
          if (cancelled) return;
          const workbook = XLSX.read(bytes, { type: 'array' });
          const sheetDataList: SheetData[] = workbook.SheetNames.map((name) => {
            const ws = workbook.Sheets[name];
            const jsonData: (string | number | boolean | null)[][] = XLSX.utils.sheet_to_json(ws, {
              header: 1,
              defval: null,
            });

            const maxCols = jsonData.reduce((max, row) => Math.max(max, row.length), 0);
            const headers = jsonData.length > 0 ? jsonData[0] : [];
            const rows = jsonData.slice(1);

            return {
              name,
              headers,
              rows,
              colCount: maxCols,
              rowCount: rows.length,
            };
          });

          if (!cancelled) {
            setSheets(sheetDataList);
            setActiveSheet(0);
            setLoading(false);
          }
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          requestIdleCallback(parseWork);
        } else {
          setTimeout(parseWork, 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [filePath]);

  const currentSheet = sheets[activeSheet] ?? null;

  const formatCell = useCallback((value: string | number | boolean | null): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return value.toString();
      return value.toFixed(2);
    }
    return String(value);
  }, []);

  const getColLetter = useCallback((index: number): string => {
    let result = '';
    let n = index;
    while (n >= 0) {
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26) - 1;
    }
    return result;
  }, []);

  if (error) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center ${theme === 'light' ? 'bg-zinc-100' : 'bg-zinc-950'}`}>
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
    <div className={`absolute inset-0 flex flex-col overflow-hidden ${theme === 'light' ? 'bg-zinc-100' : 'bg-[#09090b]'}`}>
      <div className={`flex items-center justify-between px-3 py-1.5 border-b shrink-0 ${theme === 'light' ? 'border-zinc-300 bg-zinc-200/60' : 'border-zinc-800/60 bg-zinc-950'}`}>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-600'} font-mono tracking-wider`}>
            {fileName}
          </span>
          {loading && (
            <svg className="w-3 h-3 animate-spin text-zinc-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        {!loading && currentSheet && (
          <div className="flex items-center gap-2">
            <span className={`text-[9px] ${theme === 'light' ? 'text-zinc-400' : 'text-zinc-700'} font-mono`}>
              {currentSheet.rowCount} rows x {currentSheet.colCount} cols
            </span>
          </div>
        )}
      </div>

      {sheets.length > 1 && (
        <div className={`flex items-center gap-0 border-b shrink-0 overflow-x-auto ${theme === 'light' ? 'border-zinc-300 bg-zinc-200/60' : 'border-zinc-800/60 bg-zinc-950/80'}`}>
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(idx)}
              className={`px-3 py-1.5 text-[10px] font-mono tracking-wide whitespace-nowrap transition-colors cursor-pointer border-b-2 ${
                idx === activeSheet
                  ? theme === 'light'
                    ? 'text-blue-600 border-blue-500 bg-zinc-100'
                    : 'text-emerald-400 border-emerald-500 bg-zinc-900'
                  : theme === 'light'
                    ? 'text-zinc-400 border-transparent hover:text-zinc-600 hover:bg-zinc-200'
                    : 'text-zinc-600 border-transparent hover:text-zinc-400 hover:bg-zinc-800/50'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0">
        {!loading && currentSheet && (
          <table className={`w-full border-collapse spreadsheet-table ${theme === 'light' ? 'spreadsheet-light' : 'spreadsheet-dark'}`}>
            <thead className={`sticky top-0 z-10 ${theme === 'light' ? 'bg-zinc-200' : 'bg-zinc-900'}`}>
              <tr>
                <th className={`px-2 py-1 text-[9px] font-mono text-center w-12 shrink-0 border-r border-b ${theme === 'light' ? 'text-zinc-400 border-zinc-300 bg-zinc-200/80' : 'text-zinc-600 border-zinc-800 bg-zinc-950/80'}`}>
                  #
                </th>
                {Array.from({ length: currentSheet.colCount }, (_, i) => (
                  <th
                    key={i}
                    className={`px-2 py-1 text-[9px] font-mono text-center font-semibold border-r border-b min-w-[80px] ${
                      theme === 'light'
                        ? 'text-zinc-500 border-zinc-300 bg-zinc-200/80'
                        : 'text-zinc-500 border-zinc-800 bg-zinc-950/80'
                    }`}
                  >
                    {i < currentSheet.headers.length && currentSheet.headers[i] !== null
                      ? formatCell(currentSheet.headers[i])
                      : getColLetter(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentSheet.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className={`transition-colors ${theme === 'light' ? 'hover:bg-zinc-200/50' : 'hover:bg-zinc-900/50'}`}>
                  <td className={`px-2 py-1 text-[9px] font-mono text-center border-r border-b ${theme === 'light' ? 'text-zinc-400 border-zinc-300 bg-zinc-200/30' : 'text-zinc-700 border-zinc-800 bg-zinc-950/50'}`}>
                    {rowIdx + 2}
                  </td>
                  {Array.from({ length: currentSheet.colCount }, (_, colIdx) => {
                    const value = colIdx < row.length ? row[colIdx] : null;
                    const isHeaderRow = rowIdx === 0;
                    const isNumeric = typeof value === 'number';
                    return (
                      <td
                        key={colIdx}
                        className={`px-2 py-1 text-[11px] font-mono border-r border-b truncate max-w-[200px] ${
                          isHeaderRow
                            ? theme === 'light' ? 'font-semibold text-zinc-700 border-zinc-300' : 'font-semibold text-zinc-300 border-zinc-800'
                            : isNumeric
                              ? 'text-right ' + (theme === 'light' ? 'text-blue-600 border-zinc-300' : 'text-blue-400 border-zinc-800')
                              : theme === 'light' ? 'text-zinc-700 border-zinc-300' : 'text-zinc-300 border-zinc-800'
                        } ${theme === 'light' ? 'border-zinc-300' : 'border-zinc-800'}`}
                        title={formatCell(value)}
                      >
                        {formatCell(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {currentSheet.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={currentSheet.colCount + 1}
                    className={`px-4 py-8 text-center text-[10px] uppercase tracking-widest ${theme === 'light' ? 'text-zinc-400' : 'text-zinc-600'}`}
                  >
                    Empty sheet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export const SpreadsheetPreview = memo(SpreadsheetPreviewInner);
