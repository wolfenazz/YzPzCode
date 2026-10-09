import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowRight, FileArrowUp, MagicWand, PaintBrushBroad, X } from '@phosphor-icons/react';
import { DECK_THEMES } from '../../utils/presentation/themes';
import { fileName } from '../../utils/writing/document';

export type ImportMode = 'preserve' | 'rebuild';

interface ImportDialogProps {
  workspacePath: string;
  initialPath?: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onImport: (path: string, mode: ImportMode, themeId: string | null) => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;

export const ImportDialog: React.FC<ImportDialogProps> = ({ workspacePath, initialPath, busy, error, onClose, onImport }) => {
  const [path, setPath] = useState<string | null>(initialPath ?? null);
  const [mode, setMode] = useState<ImportMode>('preserve');
  const [themeId, setThemeId] = useState<string>('');

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

  const pick = async (): Promise<void> => {
    const picked = await open({ multiple: false, defaultPath: workspacePath, filters: [{ name: 'PowerPoint', extensions: ['pptx'] }] });
    if (typeof picked === 'string') setPath(picked);
  };

  return (
    <div className="pr-modal" role="dialog" aria-modal="true" aria-label="Open PowerPoint" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <motion.div className="pr-modal__panel pr-import" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: EASE }}>
        <div className="pr-row">
          <span className="pr-eyebrow"><FileArrowUp size={12} /> Open PowerPoint</span>
          <button type="button" className="pr-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={15} /></button>
        </div>
        <button type="button" className="pr-import__file" onClick={() => void pick()} disabled={busy}>
          {path ? <><strong>{fileName(path)}</strong><span>{path}</span></> : <><strong>Choose a .pptx file…</strong><span>Old .ppt files must be saved as .pptx in PowerPoint first.</span></>}
        </button>
        <div className="pr-import__modes">
          <button type="button" className="pr-mode-card" data-active={mode === 'preserve' || undefined} onClick={() => setMode('preserve')}>
            <PaintBrushBroad size={22} weight="duotone" />
            <strong>Keep original design</strong>
            <span>Edit the text and speaker notes, reorder, duplicate, hide or delete slides. Masters, fonts, colours and layouts stay exactly as they are. The AI can rewrite, shorten, translate and write notes.</span>
          </button>
          <button type="button" className="pr-mode-card" data-active={mode === 'rebuild' || undefined} onClick={() => setMode('rebuild')}>
            <MagicWand size={22} weight="duotone" />
            <strong>Rebuild in a theme</strong>
            <span>Convert every slide to the studio's layouts: titles, bullets, pictures, charts and tables come across. Then restyle, change layouts and redesign freely with the AI.</span>
          </button>
        </div>
        {mode === 'rebuild' && (
          <label className="pr-field">
            <span className="pr-field__label">Theme</span>
            <select className="pr-select" value={themeId} onChange={(event) => setThemeId(event.target.value)}>
              <option value="">The file's own colours and fonts</option>
              {DECK_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
            </select>
          </label>
        )}
        {error && <div className="pr-error">{error}</div>}
        <div className="pr-import__foot">
          <span className="pr-hint">The original file is never changed: a copy goes into the presentation's folder.</span>
          <button type="button" className="pr-btn pr-btn--primary" disabled={!path || busy} onClick={() => path && onImport(path, mode, themeId || null)}>
            {busy ? 'Opening…' : 'Open'} <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
