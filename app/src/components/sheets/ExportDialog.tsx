import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { sheetToCsv } from '../../utils/sheets/csv';
import { DEFAULT_PRINT, workbookToHtml, type PrintOptions } from '../../utils/sheets/printHtml';
import type { Workbook } from '../../utils/sheets/types';
import { writeXlsx } from '../../utils/sheets/xlsxWrite';
import { fileName, joinPath, parentPath } from '../../utils/writing/document';
import { CheckRow, Dialog, FieldRow } from './Dialog';
import { bytesToBase64 } from './useWorkbookDocument';

type Format = 'xlsx' | 'csv' | 'pdf' | 'html';

interface ExportDialogProps {
  wb: Workbook;
  sheetIndex: number;
  title: string;
  path: string | null;
  original: Uint8Array | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

const FORMATS: Array<{ id: Format; label: string; hint: string }> = [
  { id: 'xlsx', label: 'Excel workbook', hint: '.xlsx, opens in Excel with formulas, formats and charts' },
  { id: 'pdf', label: 'PDF', hint: 'Print layout, fit to the page width' },
  { id: 'csv', label: 'CSV', hint: 'Values only, one file per sheet' },
  { id: 'html', label: 'Web page', hint: 'A standalone .html file' },
];

const safeName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'workbook';

export const ExportDialog: React.FC<ExportDialogProps> = ({ wb, sheetIndex, title, path, original, onClose, onDone }) => {
  const [format, setFormat] = useState<Format>('xlsx');
  const [print, setPrint] = useState<PrintOptions>({ ...DEFAULT_PRINT });
  const [allSheets, setAllSheets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = safeName(title);
  const exportsDir = path ? joinPath(parentPath(path), 'exports') : undefined;

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (format === 'xlsx') {
        const target = await save({ defaultPath: exportsDir ? joinPath(exportsDir, `${base}.xlsx`) : `${base}.xlsx`, filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] });
        if (!target) return;
        const bytes = await writeXlsx(wb, original);
        await invoke('write_file_bytes', { path: target, base64Data: bytesToBase64(bytes) });
        onDone(`Saved ${fileName(target)}`);
      } else if (format === 'csv') {
        const indexes = allSheets ? wb.sheets.map((_, i) => i) : [sheetIndex];
        if (indexes.length === 1) {
          const target = await save({ defaultPath: exportsDir ? joinPath(exportsDir, `${safeName(wb.sheets[indexes[0]].name)}.csv`) : `${safeName(wb.sheets[indexes[0]].name)}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
          if (!target) return;
          await invoke('write_file_content', { path: target, content: `﻿${sheetToCsv(wb.sheets[indexes[0]], wb.styles)}` });
          onDone(`Saved ${fileName(target)}`);
        } else {
          const folder = await open({ directory: true, defaultPath: exportsDir });
          if (!folder || Array.isArray(folder)) return;
          for (const index of indexes) {
            await invoke('write_file_content', { path: joinPath(folder, `${safeName(wb.sheets[index].name)}.csv`), content: `﻿${sheetToCsv(wb.sheets[index], wb.styles)}` });
          }
          onDone(`Saved ${indexes.length} CSV files`);
        }
      } else {
        const html = workbookToHtml(wb, { ...print, sheets: allSheets ? wb.sheets.map((_, i) => i) : [sheetIndex], title });
        if (format === 'html') {
          const target = await save({ defaultPath: exportsDir ? joinPath(exportsDir, `${base}.html`) : `${base}.html`, filters: [{ name: 'Web page', extensions: ['html'] }] });
          if (!target) return;
          await invoke('write_file_content', { path: target, content: html });
          onDone(`Saved ${fileName(target)}`);
        } else {
          const target = await save({ defaultPath: exportsDir ? joinPath(exportsDir, `${base}.pdf`) : `${base}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
          if (!target) return;
          const written = await invoke<boolean>('export_writing_pdf', { html, outputPath: target });
          onDone(written ? `Saved ${fileName(target)}` : 'Use the print dialog to save the PDF');
        }
      }
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Export"
      onClose={onClose}
      onEnter={() => void run()}
      footer={(
        <>
          <span className="sh-dialog__spacer">{error && <span className="sh-note sh-note--error">{error}</span>}</span>
          <button type="button" className="sx-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="sx-btn sx-btn--primary" disabled={busy} onClick={() => void run()}>{busy ? 'Exporting…' : 'Export'}</button>
        </>
      )}
    >
      <div className="sh-form">
        <div className="sh-exports" role="radiogroup" aria-label="Format">
          {FORMATS.map((entry) => (
            <button key={entry.id} type="button" role="radio" aria-checked={format === entry.id} onClick={() => setFormat(entry.id)}>
              <strong>{entry.label}</strong>
              <span>{entry.hint}</span>
            </button>
          ))}
        </div>
        {format !== 'xlsx' && wb.sheets.length > 1 && <CheckRow label="Every sheet (otherwise only the open one)" checked={allSheets} onChange={setAllSheets} />}
        {(format === 'pdf' || format === 'html') && (
          <>
            {format === 'pdf' && (
              <div className="sh-form--grid">
                <FieldRow label="Orientation">
                  <select className="sh-input" value={print.orientation} onChange={(event) => setPrint({ ...print, orientation: event.target.value as PrintOptions['orientation'] })}>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </FieldRow>
                <FieldRow label="Paper">
                  <select className="sh-input" value={print.paper} onChange={(event) => setPrint({ ...print, paper: event.target.value as PrintOptions['paper'] })}>
                    <option value="a4">A4</option>
                    <option value="letter">Letter</option>
                  </select>
                </FieldRow>
              </div>
            )}
            <div className="sh-form__row">
              <CheckRow label="Print gridlines" checked={print.gridlines} onChange={(value) => setPrint({ ...print, gridlines: value })} />
              <CheckRow label="Fit to page width" checked={print.fitWidth} onChange={(value) => setPrint({ ...print, fitWidth: value })} />
              <CheckRow label="Repeat header rows" checked={print.repeatHeader} onChange={(value) => setPrint({ ...print, repeatHeader: value })} />
              <CheckRow label="Include charts" checked={print.charts} onChange={(value) => setPrint({ ...print, charts: value })} />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};
