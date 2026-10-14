import React, { useEffect, useRef, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { FolderOpen, X } from '@phosphor-icons/react';
import { joinPath, slugify } from '../../utils/writing/document';
import { paginate, printDocument, writeDocx, writeHtml, writePdf, type ExportSource } from '../../utils/writing/exporter';

type Format = 'pdf' | 'docx' | 'html';

const FORMATS: Array<{ id: Format; label: string; hint: string; badge: string }> = [
  { id: 'pdf', label: 'PDF', hint: 'Print-ready, with bookmarks and selectable text', badge: 'PDF' },
  { id: 'docx', label: 'Word', hint: 'Native styles, numbering, contents and footnotes', badge: 'DOCX' },
  { id: 'html', label: 'Web page', hint: 'One self-contained .html file', badge: 'HTML' },
];

interface ExportDialogProps {
  source: ExportSource;
  title: string;
  onClose: () => void;
  onExported: (path: string, format: Format) => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ source, title, onClose, onExported }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [format, setFormat] = useState<Format>('pdf');
  const [paged, setPaged] = useState<{ html: string; pages: number } | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [openAfter, setOpenAfter] = useState(true);
  /** Closing the dialog mid-export aborts it: nothing is applied afterwards. */
  const abort = useRef(false);
  /** What the running (or finished) export was built from, to notice later edits. */
  const [exportedFrom, setExportedFrom] = useState<ExportSource | null>(null);

  const requestClose = (): void => {
    abort.current = true;
    onClose();
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const html = await printDocument(source, true);
        if (cancelled || !iframeRef.current) return;
        const result = await paginate(iframeRef.current, html);
        if (!cancelled) setPaged(result);
      } catch (reason) {
        if (!cancelled) setLayoutError(reason instanceof Error ? reason.message : String(reason));
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const runExport = async (): Promise<void> => {
    setError(null);
    const extension = format;
    const defaultPath = joinPath(source.docDir, 'exports', `${slugify(title)}.${extension}`);
    const path = await save({
      title: 'Export report',
      defaultPath,
      filters: [{ name: FORMATS.find((entry) => entry.id === format)!.label, extensions: [extension] }],
    });
    if (!path) return;
    abort.current = false;
    setExportedFrom(source);
    setBusy(true);
    try {
      if (format === 'pdf') {
        if (!paged) throw new Error(layoutError ?? 'The pages are still being laid out.');
        const written = await writePdf(paged.html, path);
        if (abort.current) return;
        if (!written) {
          setDone('Use “Save as PDF” in the print dialog.');
          return;
        }
      } else if (format === 'docx') {
        await writeDocx(source, path);
        if (abort.current) return;
      } else {
        await writeHtml(source, path);
        if (abort.current) return;
      }
      setDone(path);
      onExported(path, format);
      if (openAfter) await openPath(path).catch(() => undefined);
    } catch (reason) {
      if (!abort.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!abort.current) setBusy(false);
    }
  };

  return (
    <div className="wr-modal" role="dialog" aria-modal="true" aria-label="Export" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <div className="wr-modal__panel">
        <div className="wr-export__preview">
          <iframe ref={iframeRef} title="Print preview" className="wr-export__frame" style={{ opacity: paged ? 1 : 0 }} />
          {!paged && !layoutError && (
            <div className="wr-export__wait">
              <span className="wr-pulse" aria-hidden="true" /> Laying out the pages as they will print…
            </div>
          )}
          {layoutError && <p className="wr-note is-error wr-export__wait">{layoutError}</p>}
        </div>

        <div className="wr-export__options">
          <div className="wr-export__head">
            <div>
              <div className="wr-export__kicker">Export</div>
              <h3 className="wr-export__title">{title}</h3>
              <p className="wr-note">{paged ? `${paged.pages} pages` : 'Laying out pages…'}</p>
            </div>
            <button type="button" className="wr-icon" onClick={requestClose} aria-label="Close"><X size={14} /></button>
          </div>
          <div className="wr-formats" role="radiogroup" aria-label="Format">
            {FORMATS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={format === entry.id}
                className={`wr-format${format === entry.id ? ' is-selected' : ''}`}
                onClick={() => { setFormat(entry.id); setDone(null); }}
              >
                <span className="wr-format__badge">{entry.badge}</span>
                <span className="wr-format__text">
                  <strong>{entry.label}</strong>
                  <span>{entry.hint}</span>
                </span>
              </button>
            ))}
          </div>
          <label className="wr-switch-row">
            <span>Open the file when it is ready</span>
            <input type="checkbox" className="wr-switch" checked={openAfter} onChange={(event) => setOpenAfter(event.target.checked)} />
          </label>
          {error && <p className="wr-note is-error">{error}</p>}
          {exportedFrom && exportedFrom !== source && <p className="wr-note">The document changed; export again for the latest text.</p>}
          {busy && <p className="wr-note">Closing the dialog stops the export.</p>}
          {done && (
            <p className="wr-note wr-export__done">
              <FolderOpen size={13} /> <span>{done}</span>
            </p>
          )}
          <button type="button" className="wr-btn wr-btn--primary wr-btn--block wr-export__go" disabled={busy || (format === 'pdf' && !paged)} onClick={() => void runExport()}>
            {busy ? 'Exporting…' : `Export ${FORMATS.find((entry) => entry.id === format)!.badge}`}
          </button>
        </div>
      </div>
    </div>
  );
};
