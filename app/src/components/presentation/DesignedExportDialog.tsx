import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { ArrowRight, FolderOpen, X } from '@phosphor-icons/react';
import { writeFileBytes } from '../../utils/presentation/assets';
import { designCanvas } from '../../utils/presentation/designStyles';
import type { YzDeck } from '../../utils/presentation/types';
import { joinPath, slugify } from '../../utils/writing/document';
import { designedHtmlDeck, designedPrintHtml, loadSlidePictures, measureText, pptxPictures, slideSvgToPng } from './designAssets';
import { SvgSlide } from './SvgSlide';

type Format = 'pptx' | 'pptx-pictures' | 'pdf' | 'png' | 'html';

const FORMATS: Array<{ id: Format; label: string; hint: string; badge: string; color: string; extension: string }> = [
  { id: 'pptx', label: 'PowerPoint', hint: 'Native, editable shapes and text, speaker notes, the deck colours in the theme', badge: 'PPTX', color: '#c43e1c', extension: 'pptx' },
  { id: 'pptx-pictures', label: 'PowerPoint, exact look', hint: 'Each slide as one picture: looks identical everywhere, text not editable', badge: 'PPTX', color: '#a4373a', extension: 'pptx' },
  { id: 'pdf', label: 'PDF', hint: 'One page per slide, exactly as designed', badge: 'PDF', color: '#b42318', extension: 'pdf' },
  { id: 'png', label: 'Images', hint: 'A 1920-wide PNG for every slide, into a folder', badge: 'PNG', color: '#0f766e', extension: 'png' },
  { id: 'html', label: 'Web page', hint: 'One self-contained .html slideshow (arrow keys, F for fullscreen)', badge: 'HTML', color: '#6d28d9', extension: 'html' },
];

interface DesignedExportDialogProps {
  deck: YzDeck;
  deckDir: string;
  resolveHref: (href: string) => string;
  onClose: () => void;
  onExported: (path: string) => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;

const langTag = (language: string): string => {
  const known: Record<string, string> = { english: 'en-US', arabic: 'ar-SA', french: 'fr-FR', german: 'de-DE', spanish: 'es-ES', italian: 'it-IT', portuguese: 'pt-PT', dutch: 'nl-NL', chinese: 'zh-CN', japanese: 'ja-JP', korean: 'ko-KR', russian: 'ru-RU', turkish: 'tr-TR', hindi: 'hi-IN' };
  return known[language.trim().toLowerCase()] ?? 'en-US';
};

export const DesignedExportDialog: React.FC<DesignedExportDialogProps> = ({ deck, deckDir, resolveHref, onClose, onExported }) => {
  const design = deck.design!;
  const canvas = designCanvas(deck.size);
  const [format, setFormat] = useState<Format>('pptx');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const drawn = design.slides.filter((slide) => slide.svg);
  const visible = drawn.filter((slide) => !slide.hidden);

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
    setNotices([]);
    const entry = FORMATS.find((item) => item.id === format)!;
    const base = slugify(deck.meta.title);
    if (format === 'png') {
      const folder = await open({ directory: true, title: 'Choose a folder for the slide images', defaultPath: joinPath(deckDir, 'exports') });
      if (typeof folder !== 'string') return;
      setBusy(true);
      try {
        const pictures = await loadSlidePictures(visible, deckDir);
        for (const [index, slide] of visible.entries()) {
          setProgress(`Slide ${index + 1} of ${visible.length}`);
          await writeFileBytes(joinPath(folder, `${base}-${String(index + 1).padStart(2, '0')}.png`), await slideSvgToPng(slide.svg, deck.size, pictures));
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
      defaultPath: joinPath(deckDir, 'exports', `${base}.${entry.extension}`),
      filters: [{ name: entry.label, extensions: [entry.extension] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      // Hidden slides stay in the PowerPoint file (hidden there too); the other formats leave them out.
      const slides = format === 'pptx' || format === 'pptx-pictures' ? drawn : visible;
      const pictures = await loadSlidePictures(slides, deckDir);
      if (format === 'pptx' || format === 'pptx-pictures') {
        const { buildDesignedPptx } = await import('../../utils/presentation/svgDeckExport');
        let pngs: Uint8Array[] = [];
        if (format === 'pptx-pictures') {
          for (const [index, slide] of slides.entries()) {
            setProgress(`Painting slide ${index + 1} of ${slides.length}`);
            pngs.push(await slideSvgToPng(slide.svg, deck.size, pictures, 2400));
          }
        }
        setProgress('Building the PowerPoint file');
        const usable = await pptxPictures(pictures, slides);
        const { bytes, warnings } = await buildDesignedPptx({
          title: deck.meta.title,
          size: deck.size,
          system: design.system,
          mode: format === 'pptx' ? 'editable' : 'pictures',
          slides: slides.map((slide, index) => ({ svg: slide.svg, notes: slide.notes, hidden: slide.hidden, png: pngs[index] })),
          picture: (href) => usable.get(href) ?? null,
          measure: measureText,
          lang: langTag(design.language),
        });
        pngs = [];
        await writeFileBytes(path, bytes);
        setNotices(warnings.slice(0, 6));
      } else if (format === 'html') {
        await invoke('write_file_content', { path, content: designedHtmlDeck(deck.meta.title, deck.size, slides, pictures, deck.transition) });
      } else {
        const written = await invoke<boolean>('export_writing_pdf', { html: designedPrintHtml(deck.meta.title, deck.size, slides, pictures), outputPath: path });
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
      setProgress(null);
      setBusy(false);
    }
  };

  const exported = done && /[\\/]/.test(done) ? done : null;
  const current = FORMATS.find((entry) => entry.id === format)!;

  return (
    <div className="pr-modal" role="dialog" aria-modal="true" aria-label="Export presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <motion.div className="pr-modal__panel pr-export" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: EASE }}>
        <div className="pr-export__preview">
          <div className="pr-export__stack">
            {visible.slice(0, 3).reverse().map((slide, index, list) => (
              <div key={slide.id} className="pr-export__sheet" style={{ transform: `translate(${(list.length - 1 - index) * -14}px, ${(list.length - 1 - index) * -12}px)` }}>
                <SvgSlide svg={slide.svg} width={320} canvas={canvas} resolveHref={resolveHref} />
              </div>
            ))}
          </div>
        </div>
        <div className="pr-export__options">
          <div className="pr-row">
            <span className="pr-eyebrow">Export</span>
            <button type="button" className="pr-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={15} /></button>
          </div>
          <h3 className="pr-export__title">{deck.meta.title}</h3>
          <p className="pr-hint">{visible.length} slide{visible.length === 1 ? '' : 's'}{drawn.length < design.slides.length ? ` (${design.slides.length - drawn.length} not drawn yet, left out)` : ''} · {design.system.name} · {deck.size}</p>
          <div className="pr-stack">
            {FORMATS.map((entry) => (
              <button key={entry.id} type="button" className="pr-format" data-active={format === entry.id || undefined} onClick={() => { setFormat(entry.id); setDone(null); setNotices([]); }}>
                <span className="pr-format__badge" style={{ color: entry.color }}>{entry.badge}</span>
                <span><strong>{entry.label}</strong><span>{entry.hint}</span></span>
              </button>
            ))}
          </div>
          {error && <div className="pr-error">{error}</div>}
          {notices.length > 0 && (
            <div className="pd-notices">
              <strong>Some details were simplified for PowerPoint</strong>
              {notices.map((notice) => <span key={notice}>{notice}</span>)}
              <span>Choose “PowerPoint, exact look” for a pixel-perfect copy.</span>
            </div>
          )}
          {done && (
            <div className="pr-export__done">
              {exported ? <span className="pr-export__path" title={exported}>{exported}</span> : <span>{done}</span>}
              {exported && (
                <span className="pr-inline-actions">
                  <button type="button" className="pr-btn pr-btn--sm" onClick={() => void openPath(exported).catch(() => undefined)}>{format.startsWith('pptx') ? 'Open in PowerPoint' : format === 'png' ? 'Open folder' : format === 'html' ? 'Open in browser' : 'Open'}</button>
                  <button type="button" className="pr-btn pr-btn--sm" onClick={() => void invoke('reveal_in_file_manager', { path: exported }).catch(() => undefined)}><FolderOpen size={13} /> Reveal</button>
                </span>
              )}
            </div>
          )}
          <button type="button" className="pr-btn pr-btn--primary pr-btn--lg pr-export__go" disabled={busy || visible.length === 0} onClick={() => void run()}>
            {busy ? progress ?? 'Exporting…' : `Export ${current.badge}`} <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

