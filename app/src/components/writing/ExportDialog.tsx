import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { save } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { ArrowRight, FolderOpen, X } from '@phosphor-icons/react';
import LatticeLoader from '../reactbits/LatticeLoader';
import { joinPath, slugify } from '../../utils/writing/document';
import { paginate, printDocument, writeDocx, writeHtml, writePdf, type ExportSource } from '../../utils/writing/exporter';
import { Check } from './controls';

type Format = 'pdf' | 'docx' | 'html';

const FORMATS: Array<{ id: Format; label: string; hint: string; badge: string; color: string }> = [
  { id: 'pdf', label: 'PDF document', hint: 'Print-ready, bookmarks, selectable text', badge: 'PDF', color: '#b42318' },
  { id: 'docx', label: 'Word document', hint: 'Native styles, numbering, TOC, footnotes', badge: 'DOCX', color: '#1d4ed8' },
  { id: 'html', label: 'Web page', hint: 'A single self-contained .html file', badge: 'HTML', color: '#0f766e' },
];

interface ExportDialogProps {
  source: ExportSource;
  title: string;
  onClose: () => void;
  onExported: (path: string, format: Format) => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;

export const ExportDialog: React.FC<ExportDialogProps> = ({ source, title, onClose, onExported }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [format, setFormat] = useState<Format>('pdf');
  const [paged, setPaged] = useState<{ html: string; pages: number } | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [openAfter, setOpenAfter] = useState(true);

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
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onClose]);

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
    setBusy(true);
    try {
      if (format === 'pdf') {
        if (!paged) throw new Error(layoutError ?? 'The pages are still being laid out.');
        const written = await writePdf(paged.html, path);
        if (!written) {
          setDone('Use “Save as PDF” in the print dialog.');
          return;
        }
      } else if (format === 'docx') {
        await writeDocx(source, path);
      } else {
        await writeHtml(source, path);
      }
      setDone(path);
      onExported(path, format);
      if (openAfter) await openPath(path).catch(() => undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wr-modal" role="dialog" aria-modal="true" aria-label="Export report" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="wr-modal__panel">
        <div className="wr-bezel">
          <div className="wr-bezel__core">
            <div className="wr-export__preview">
              <iframe ref={iframeRef} title="Print preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, opacity: paged ? 1 : 0, transition: 'opacity 600ms cubic-bezier(.22,1,.36,1)', background: '#d9d9df' }} />
              {!paged && !layoutError && (
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <LatticeLoader label="Setting the pages" status="working" pattern="sweep" color="var(--wr-gold)" fontSize={14} showTimer />
                  <span className="wr-field__hint">Running heads, footnotes and the table of contents are placed exactly as they will print.</span>
                </div>
              )}
              {layoutError && <div className="wr-ai__error" style={{ position: 'relative', margin: 24 }}>{layoutError}</div>}
              {done && format === 'pdf' && (
                <div className="wr-export__stamp"><span>Pressed</span></div>
              )}
            </div>

            <div className="wr-export__options">
              <div className="wr-row" style={{ minHeight: 0 }}>
                <span className="wr-eyebrow">Export</span>
                <button type="button" className="wr-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={15} /></button>
              </div>
              <h3 className="wr-ai__heading" style={{ fontSize: 22 }}>{title}</h3>
              <p className="wr-ai__sub" style={{ margin: 0 }}>{paged ? `${paged.pages} pages` : 'Laying out pages…'}</p>
              <div className="wr-stack" style={{ gap: 8 }}>
                {FORMATS.map((entry, index) => (
                  <motion.button
                    key={entry.id}
                    type="button"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, ease: EASE, delay: 0.08 + index * 0.05 }}
                    className={`wr-format-card${format === entry.id ? ' is-selected' : ''}`}
                    onClick={() => { setFormat(entry.id); setDone(null); }}
                  >
                    <span className="wr-format-card__icon" style={{ color: entry.color }}>{entry.badge}</span>
                    <span>
                      <strong>{entry.label}</strong>
                      <span>{entry.hint}</span>
                    </span>
                  </motion.button>
                ))}
              </div>
              <Check label="Open the file when it is ready" checked={openAfter} onChange={setOpenAfter} />
              {error && <div className="wr-ai__error">{error}</div>}
              {done && (
                <div className="wr-field__hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <FolderOpen size={14} /> <span style={{ wordBreak: 'break-all' }}>{done}</span>
                </div>
              )}
              <div style={{ marginTop: 'auto' }}>
                <button type="button" className="wr-pill-btn is-gold" style={{ width: '100%', justifyContent: 'center', height: 42 }} disabled={busy || (format === 'pdf' && !paged)} onClick={() => void runExport()}>
                  {busy ? 'Exporting…' : `Export ${FORMATS.find((entry) => entry.id === format)!.badge}`}
                  <span className="wr-pill-btn__orb"><ArrowRight size={12} /></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
