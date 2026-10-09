import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { ArrowRight, FolderOpen, PresentationChart, X } from '@phosphor-icons/react';
import { iconNames, imageSources, loadIconSvgs, loadImageDataUrls } from '../../utils/presentation/assets';
import { buildStandaloneDeckHtml } from '../../utils/presentation/htmlDeck';
import { buildDeckPrintHtml } from '../../utils/presentation/printHtml';
import { slideToPng } from '../../utils/presentation/rasterize';
import { writeFileBytes } from '../../utils/presentation/assets';
import type { PlanContext } from '../../utils/presentation/render';
import type { YzDeck } from '../../utils/presentation/types';
import { joinPath, slugify } from '../../utils/writing/document';
import { SlideRenderer } from './SlideRenderer';

type Format = 'pptx' | 'pdf' | 'png' | 'html';

const FORMATS: Array<{ id: Format; label: string; hint: string; badge: string; color: string }> = [
  { id: 'pptx', label: 'PowerPoint', hint: 'Editable text, native charts and tables, speaker notes', badge: 'PPTX', color: '#c43e1c' },
  { id: 'pdf', label: 'PDF', hint: 'One page per slide, exactly as designed', badge: 'PDF', color: '#b42318' },
  { id: 'png', label: 'Images', hint: 'A 1920 × 1080 PNG for every slide, into a folder', badge: 'PNG', color: '#0f766e' },
  { id: 'html', label: 'Web page', hint: 'One self-contained .html slideshow (arrow keys, fullscreen)', badge: 'HTML', color: '#6d28d9' },
];

interface ExportDialogProps {
  deck: YzDeck;
  deckDir: string;
  context: PlanContext;
  resolveImage: (src: string) => string;
  /** Original-design decks export the patched file (PowerPoint only). */
  writePreserved?: (outputPath: string) => Promise<void>;
  onClose: () => void;
  onExported: (path: string) => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;

export const ExportDialog: React.FC<ExportDialogProps> = ({ deck, deckDir, context, resolveImage, writePreserved, onClose, onExported }) => {
  const preserve = Boolean(writePreserved);
  const [format, setFormat] = useState<Format>('pptx');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const formats = preserve ? FORMATS.filter((entry) => entry.id === 'pptx') : FORMATS;
  const visible = deck.slides.filter((slide) => !slide.hidden);

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

  const run = async (): Promise<void> => {
    setError(null);
    const entry = FORMATS.find((item) => item.id === format)!;
    if (format === 'png') {
      const folder = await open({ directory: true, title: 'Choose a folder for the slide images', defaultPath: joinPath(deckDir, 'exports') });
      if (typeof folder !== 'string') return;
      setBusy(true);
      try {
        const [images, icons] = await Promise.all([loadImageDataUrls(imageSources(deck.slides), deckDir), loadIconSvgs(iconNames(deck.slides))]);
        const base = slugify(deck.meta.title);
        let number = 0;
        for (const [index, slide] of deck.slides.entries()) {
          if (slide.hidden) continue;
          number += 1;
          setProgress(`Slide ${number} of ${visible.length}`);
          const bytes = await slideToPng(context, slide, index, { images, icons });
          await writeFileBytes(joinPath(folder, `${base}-${String(number).padStart(2, '0')}.png`), bytes);
        }
        setDone(folder);
        onExported(folder);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setProgress(null);
        setBusy(false);
      }
      return;
    }
    const path = await save({
      title: `Export ${entry.label}`,
      defaultPath: joinPath(deckDir, 'exports', `${slugify(deck.meta.title)}.${format}`),
      filters: [{ name: entry.label, extensions: [format] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      if (format === 'pptx') {
        if (writePreserved) await writePreserved(path);
        else {
          const { exportPptx } = await import('../../utils/presentation/pptxExport');
          await exportPptx(deck, deckDir, path);
        }
      } else if (format === 'html') {
        const [images, icons] = await Promise.all([loadImageDataUrls(imageSources(deck.slides), deckDir), loadIconSvgs(iconNames(deck.slides))]);
        await invoke('write_file_content', { path, content: buildStandaloneDeckHtml({ ...context, title: deck.meta.title, transition: deck.transition }, deck.slides, { images, icons }) });
      } else {
        const [images, icons] = await Promise.all([loadImageDataUrls(imageSources(deck.slides), deckDir), loadIconSvgs(iconNames(deck.slides))]);
        const html = buildDeckPrintHtml({ ...context, title: deck.meta.title }, deck.slides, { images, icons });
        const written = await invoke<boolean>('export_writing_pdf', { html, outputPath: path });
        if (!written) {
          setDone('Use “Save as PDF” in the print dialog.');
          return;
        }
      }
      setDone(path);
      onExported(path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const exported = done && /[\\/]/.test(done) ? done : null;

  return (
    <div className="pr-modal" role="dialog" aria-modal="true" aria-label="Export presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <motion.div className="pr-modal__panel pr-export" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: EASE }}>
        <div className="pr-export__preview">
          {!preserve && visible[0] ? (
            <div className="pr-export__stack">
              {visible.slice(0, 3).reverse().map((slide, index, list) => (
                <div key={slide.id} className="pr-export__sheet" style={{ transform: `translate(${(list.length - 1 - index) * -14}px, ${(list.length - 1 - index) * -12}px)` }}>
                  <SlideRenderer context={context} slide={slide} index={deck.slides.indexOf(slide)} width={320} resolveImage={resolveImage} />
                </div>
              ))}
            </div>
          ) : (
            <div className="pr-export__glyph"><PresentationChart size={56} weight="duotone" /></div>
          )}
        </div>
        <div className="pr-export__options">
          <div className="pr-row">
            <span className="pr-eyebrow">Export</span>
            <button type="button" className="pr-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={15} /></button>
          </div>
          <h3 className="pr-export__title">{deck.meta.title}</h3>
          <p className="pr-hint">{preserve ? `${deck.source?.slides.length ?? 0} slides · original design kept` : `${visible.length} slide${visible.length === 1 ? '' : 's'}${visible.length < deck.slides.length ? ` (${deck.slides.length - visible.length} hidden left out of the PDF)` : ''} · ${context.theme.name} · ${context.size}`}</p>
          <div className="pr-stack">
            {formats.map((entry) => (
              <button key={entry.id} type="button" className="pr-format" data-active={format === entry.id || undefined} onClick={() => { setFormat(entry.id); setDone(null); }}>
                <span className="pr-format__badge" style={{ color: entry.color }}>{entry.badge}</span>
                <span><strong>{entry.label}</strong><span>{entry.hint}</span></span>
              </button>
            ))}
          </div>
          {error && <div className="pr-error">{error}</div>}
          {done && (
            <div className="pr-export__done">
              {exported ? <span className="pr-export__path" title={exported}>{exported}</span> : <span>{done}</span>}
              {exported && (
                <span className="pr-inline-actions">
                  <button type="button" className="pr-btn pr-btn--sm" onClick={() => void openPath(exported).catch(() => undefined)}>{format === 'pptx' ? 'Open in PowerPoint' : format === 'png' ? 'Open folder' : format === 'html' ? 'Open in browser' : 'Open'}</button>
                  <button type="button" className="pr-btn pr-btn--sm" onClick={() => void invoke('reveal_in_file_manager', { path: exported }).catch(() => undefined)}><FolderOpen size={13} /> Reveal</button>
                </span>
              )}
            </div>
          )}
          <button type="button" className="pr-btn pr-btn--primary pr-btn--lg pr-export__go" disabled={busy} onClick={() => void run()}>
            {busy ? progress ?? 'Exporting…' : `Export ${formats.find((entry) => entry.id === format)!.badge}`} <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
