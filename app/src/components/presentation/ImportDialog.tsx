import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowRight, FileArrowUp, Warning, X } from '@phosphor-icons/react';
import { readFileBytes } from '../../utils/presentation/assets';
import { fileName } from '../../utils/writing/document';
import { ensureFonts, measureSlideText, pptxFontFamilies } from './deckFonts';
import { SvgSlide } from './SvgSlide';

interface ImportDialogProps {
  workspacePath: string;
  initialPath?: string | null;
  busy: boolean;
  /** Slides read so far while opening. */
  progress: { done: number; total: number } | null;
  error: string | null;
  onClose: () => void;
  onImport: (path: string) => void;
}

interface Preview {
  path: string;
  slides: Array<{ svg: string; title: string }>;
  total: number;
  size: string;
  canvas: { width: number; height: number };
  fonts: string[];
  warnings: string[];
  urls: Record<string, string>;
}

const EASE = [0.32, 0.72, 0, 1] as const;
const PREVIEW_COUNT = 6;

/** Reads the first slides for the preview (pictures as blob URLs, nothing written to disk). */
async function readPreview(path: string): Promise<Preview> {
  const bytes = await readFileBytes(path);
  const { openPptx } = await import('../../utils/presentation/pptxPackage');
  const { importPptx } = await import('../../utils/presentation/pptxRender');
  const pkg = await openPptx(bytes);
  const families = await pptxFontFamilies(pkg.zip);
  await ensureFonts(families);
  const count = Math.min(PREVIEW_COUNT, pkg.slides.length);
  const deck = await importPptx(bytes, { fileTitle: fileName(path), measure: measureSlideText, only: Array.from({ length: count }, (_, index) => index) });
  const urls: Record<string, string> = {};
  for (const [name, data] of Object.entries(deck.assets)) {
    const extension = name.split('.').pop()!.toLowerCase();
    const type = extension === 'svg' ? 'image/svg+xml' : `image/${extension === 'jpg' ? 'jpeg' : extension}`;
    urls[`assets/${name}`] = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  }
  return {
    path,
    slides: deck.slides.map((slide) => ({ svg: slide.svg, title: slide.title })),
    total: pkg.slides.length,
    size: `${deck.size} · ${(pkg.width).toFixed(2).replace(/\.?0+$/, '')} × ${(pkg.height).toFixed(2).replace(/\.?0+$/, '')} in`,
    canvas: deck.canvas,
    fonts: [deck.theme.fonts.heading, deck.theme.fonts.body].filter((value, index, list) => value && list.indexOf(value) === index),
    warnings: deck.warnings,
    urls,
  };
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ workspacePath, initialPath, busy, progress, error, onClose, onImport }) => {
  const [path, setPath] = useState<string | null>(initialPath ?? null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reading, setReading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!path) return;
    let alive = true;
    setReading(true);
    setPreviewError(null);
    setPreview(null);
    readPreview(path)
      .then((result) => { if (alive) setPreview(result); else Object.values(result.urls).forEach(URL.revokeObjectURL); })
      .catch((reason: unknown) => { if (alive) setPreviewError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (alive) setReading(false); });
    return () => { alive = false; };
  }, [path]);

  useEffect(() => () => { if (preview) Object.values(preview.urls).forEach(URL.revokeObjectURL); }, [preview]);

  const pick = async (): Promise<void> => {
    const picked = await open({ multiple: false, defaultPath: workspacePath, filters: [{ name: 'PowerPoint', extensions: ['pptx'] }] });
    if (typeof picked === 'string') setPath(picked);
  };

  const resolve = useCallback((href: string): string => preview?.urls[href] ?? href, [preview]);
  const canOpen = Boolean(path && preview && !busy && !previewError);
  const percent = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="pr-modal" role="dialog" aria-modal="true" aria-label="Open a PowerPoint file" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <motion.div className="pr-modal__panel pi-dialog" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: EASE }}>
        <header className="pi-head">
          <div>
            <h2 className="pi-title">Open a PowerPoint file</h2>
            <p className="pi-sub">Every slide comes in as it looks in PowerPoint, ready to edit: text, pictures, shapes, tables and the theme.</p>
          </div>
          <button type="button" className="pr-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={15} /></button>
        </header>

        <button type="button" className="pi-file" onClick={() => void pick()} disabled={busy}>
          <span className="pi-file__icon"><FileArrowUp size={18} /></span>
          {path ? (
            <span className="pi-file__text"><strong>{fileName(path)}</strong><span>{path}</span></span>
          ) : (
            <span className="pi-file__text"><strong>Choose a .pptx file…</strong><span>Old .ppt files must be saved as .pptx in PowerPoint first.</span></span>
          )}
          <span className="pi-file__change">{path ? 'Change' : 'Browse'}</span>
        </button>

        {path && (
          <div className="pi-preview" aria-busy={reading || undefined}>
            {previewError ? (
              <div className="pi-error"><Warning size={14} /> {previewError}</div>
            ) : (
              <>
                <div className="pi-grid" style={{ ['--pi-aspect' as string]: preview ? `${preview.canvas.width} / ${preview.canvas.height}` : '16 / 9' }}>
                  {(preview?.slides ?? Array.from({ length: PREVIEW_COUNT }, () => null)).map((slide, index) => (
                    <figure key={index} className="pi-thumb" data-loading={!slide || undefined}>
                      {slide ? <SvgSlide svg={slide.svg} width={176} canvas={preview!.canvas} resolveHref={resolve} /> : <span className="pi-thumb__shimmer" />}
                      <figcaption>{index + 1}</figcaption>
                    </figure>
                  ))}
                </div>
                <div className="pi-facts">
                  {preview ? (
                    <>
                      <span><strong>{preview.total}</strong> slide{preview.total === 1 ? '' : 's'}</span>
                      <span>{preview.size}</span>
                      {preview.fonts.length > 0 && <span>{preview.fonts.join(' · ')}</span>}
                      {preview.total > preview.slides.length && <span className="pi-more">+ {preview.total - preview.slides.length} more</span>}
                    </>
                  ) : <span>Reading the slides…</span>}
                </div>
                {preview?.warnings.map((warning) => <p key={warning} className="pi-warning"><Warning size={12} /> {warning}</p>)}
              </>
            )}
          </div>
        )}

        {error && <div className="pr-error">{error}</div>}

        <footer className="pi-foot">
          {busy && progress ? (
            <div className="pi-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <span className="pi-progress__bar"><i style={{ width: `${percent}%` }} /></span>
              <span>Opening slide {Math.min(progress.total, progress.done + 1)} of {progress.total}</span>
            </div>
          ) : (
            <span className="pr-hint">The original file is never changed. Edits stay in the app until you export.</span>
          )}
          <button type="button" className="pr-btn pr-btn--primary" disabled={!canOpen} onClick={() => path && onImport(path)}>
            {busy ? 'Opening…' : 'Open and edit'} <ArrowRight size={14} />
          </button>
        </footer>
      </motion.div>
    </div>
  );
};
