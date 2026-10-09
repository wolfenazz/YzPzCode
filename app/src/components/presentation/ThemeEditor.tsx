import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Check, DownloadSimple, Palette, UploadSimple, Warning, X } from '@phosphor-icons/react';
import type { FileContent } from '../../types';
import { emptySlide } from '../../utils/presentation/sanitize';
import { newThemeId, parseThemeFile, serializeTheme } from '../../utils/presentation/templates';
import { contrastRatio, DECK_THEMES, SAFE_FONTS, sanitizeTheme } from '../../utils/presentation/themes';
import type { DeckSize, DeckTheme, ThemePalette } from '../../utils/presentation/types';
import { slugify } from '../../utils/writing/document';
import { SlideRenderer } from './SlideRenderer';

interface ThemeEditorProps {
  theme: DeckTheme;
  size: DeckSize;
  /** Offer "Save and apply" (editing from a deck). */
  canApply: boolean;
  onClose: () => void;
  onSave: (theme: DeckTheme, apply: boolean) => void;
}

const PALETTE_FIELDS: Array<{ key: keyof ThemePalette; label: string }> = [
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Cards and panels' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Secondary text' },
  { key: 'accent1', label: 'Accent 1' },
  { key: 'accent2', label: 'Accent 2' },
  { key: 'accent3', label: 'Accent 3' },
  { key: 'onAccent', label: 'Text on accent' },
];

const EASE = [0.32, 0.72, 0, 1] as const;
const noImage = (): string => '';

/** The contrast checks a theme must pass to be readable. */
export function themeChecks(theme: DeckTheme): Array<{ label: string; ratio: number; min: number }> {
  const { palette } = theme;
  const checks = [
    { label: 'Text on background', ratio: contrastRatio(palette.text, palette.background), min: 4.5 },
    { label: 'Secondary text on background', ratio: contrastRatio(palette.muted, palette.background), min: 3 },
    { label: 'Text on cards', ratio: contrastRatio(palette.text, palette.surface), min: 4.5 },
    { label: 'Accent 1 on background (charts, figures)', ratio: contrastRatio(palette.accent1, palette.background), min: 3 },
  ];
  if (theme.titleFill !== 'background') checks.push({ label: 'Title text on accent', ratio: contrastRatio(palette.onAccent, palette.accent1), min: 4.5 });
  return checks;
}

function FontField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  const known = (SAFE_FONTS as readonly string[]).includes(value);
  return (
    <label className="pr-field">
      <span className="pr-field__label">{label}</span>
      <select className="pr-select" value={known ? value : '__other'} onChange={(event) => onChange(event.target.value === '__other' ? (known ? '' : value) : event.target.value)}>
        {SAFE_FONTS.map((font) => <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>)}
        <option value="__other">Other font…</option>
      </select>
      {!known && <input className="pr-input" value={value} placeholder="Font name, e.g. Montserrat" onChange={(event) => onChange(event.target.value)} />}
      {!known && <span className="pr-hint">Fonts outside the list only look right where they are installed.</span>}
    </label>
  );
}

export const ThemeEditor: React.FC<ThemeEditorProps> = ({ theme, size, canApply, onClose, onSave }) => {
  const isPreset = DECK_THEMES.some((preset) => preset.id === theme.id);
  const [draft, setDraft] = useState<DeckTheme>(() => ({
    ...theme,
    id: isPreset ? newThemeId() : theme.id,
    name: isPreset ? `${theme.name} (custom)` : theme.name,
    tagline: isPreset ? 'A custom theme.' : theme.tagline,
  }));
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const checks = themeChecks(draft);
  const failing = checks.filter((check) => check.ratio < check.min);
  // The title must be readable; everything else is a warning.
  const blocked = checks[0].ratio < 3 || (draft.titleFill !== 'background' && checks[checks.length - 1].ratio < 3);
  const samples = useMemo(() => ['title', 'bullets', 'stats', 'chart'].map((layout) => emptySlide(layout as 'title')), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const setPalette = (key: keyof ThemePalette, value: string): void =>
    setDraft((current) => {
      const palette = { ...current.palette, [key]: value };
      const chartColors = [palette.accent1, palette.accent2, palette.accent3, ...current.chartColors.slice(3)];
      return { ...current, palette, chartColors };
    });

  const finish = (apply: boolean): void => {
    const clean = { ...sanitizeTheme(draft), id: draft.id, name: draft.name.trim() || 'Custom theme' };
    onSave({ ...clean, dark: contrastRatio(clean.palette.background, '#000000') < contrastRatio(clean.palette.background, '#ffffff') }, apply);
  };

  const exportTheme = async (): Promise<void> => {
    const path = await save({ title: 'Export theme', defaultPath: `${slugify(draft.name)}.yzdeck-theme.json`, filters: [{ name: 'Deck theme', extensions: ['json'] }] });
    if (!path) return;
    try {
      await invoke('write_file_content', { path, content: serializeTheme(draft) });
      setMessage({ tone: 'ok', text: 'Theme exported.' });
    } catch (error) {
      setMessage({ tone: 'error', text: `Could not export: ${String(error)}` });
    }
  };

  const importTheme = async (): Promise<void> => {
    const path = await open({ multiple: false, filters: [{ name: 'Deck theme', extensions: ['json'] }] });
    if (typeof path !== 'string') return;
    try {
      const file = await invoke<FileContent>('read_file_content', { path });
      setDraft(parseThemeFile(file.content));
      setMessage({ tone: 'ok', text: 'Theme imported. Save it to keep it.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <div className="pr-modal" role="dialog" aria-modal="true" aria-label="Theme editor" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div className="pr-modal__panel pr-theme-editor" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: EASE }}>
        <div className="pr-theme-editor__form">
          <div className="pr-row">
            <span className="pr-eyebrow"><Palette size={12} /> Theme</span>
            <button type="button" className="pr-icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
          </div>
          <label className="pr-field">
            <span className="pr-field__label">Name</span>
            <input className="pr-input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onKeyDown={(event) => event.stopPropagation()} />
          </label>
          <div className="pr-colors">
            {PALETTE_FIELDS.map((field) => (
              <label key={field.key} className="pr-colors__item">
                <input type="color" value={draft.palette[field.key]} onChange={(event) => setPalette(field.key, event.target.value)} />
                <span>{field.label}</span>
              </label>
            ))}
          </div>
          <div className="pr-grid-2">
            <FontField label="Heading font" value={draft.headingFont} onChange={(headingFont) => setDraft({ ...draft, headingFont })} />
            <FontField label="Body font" value={draft.bodyFont} onChange={(bodyFont) => setDraft({ ...draft, bodyFont })} />
          </div>
          <div className="pr-grid-2">
            <label className="pr-field">
              <span className="pr-field__label">Title size · {draft.titleSize} pt</span>
              <input type="range" className="pr-range" min={24} max={48} value={draft.titleSize} onChange={(event) => setDraft({ ...draft, titleSize: Number(event.target.value) })} />
            </label>
            <label className="pr-field">
              <span className="pr-field__label">Body size · {draft.bodySize} pt</span>
              <input type="range" className="pr-range" min={14} max={28} value={draft.bodySize} onChange={(event) => setDraft({ ...draft, bodySize: Number(event.target.value) })} />
            </label>
          </div>
          <div className="pr-field">
            <span className="pr-field__label">Decoration</span>
            <div className="pr-segmented">
              {(['rule', 'corner', 'band', 'none'] as const).map((value) => (
                <button key={value} type="button" className="pr-segmented__item" data-active={draft.decoration === value || undefined} onClick={() => setDraft({ ...draft, decoration: value })}>
                  {value === 'rule' ? 'Title rule' : value === 'corner' ? 'Corner' : value === 'band' ? 'Gradient band' : 'None'}
                </button>
              ))}
            </div>
          </div>
          <div className="pr-field">
            <span className="pr-field__label">Title and section slides</span>
            <div className="pr-segmented">
              {(['background', 'accent', 'gradient'] as const).map((value) => (
                <button key={value} type="button" className="pr-segmented__item" data-active={draft.titleFill === value || undefined} onClick={() => setDraft({ ...draft, titleFill: value })}>
                  {value === 'background' ? 'Plain' : value === 'accent' ? 'Accent colour' : 'Gradient'}
                </button>
              ))}
            </div>
          </div>
          <div className="pr-checks">
            {checks.map((check) => (
              <div key={check.label} className="pr-checks__item" data-ok={check.ratio >= check.min || undefined}>
                {check.ratio >= check.min ? <Check size={12} weight="bold" /> : <Warning size={12} weight="fill" />}
                <span>{check.label}</span>
                <strong>{check.ratio.toFixed(1)}:1</strong>
              </div>
            ))}
            {failing.length > 0 && <p className="pr-hint">{blocked ? 'Titles would be hard to read. Raise the contrast to save.' : 'Some colours are low in contrast; the theme can still be saved.'}</p>}
          </div>
          {message && <div className={message.tone === 'error' ? 'pr-error' : 'pr-hint'}>{message.text}</div>}
          <div className="pr-theme-editor__foot">
            <span className="pr-inline-actions">
              <button type="button" className="pr-btn pr-btn--sm" onClick={() => void importTheme()}><UploadSimple size={13} /> Import</button>
              <button type="button" className="pr-btn pr-btn--sm" onClick={() => void exportTheme()}><DownloadSimple size={13} /> Export</button>
            </span>
            <span className="pr-inline-actions">
              <button type="button" className="pr-btn" disabled={blocked} onClick={() => finish(false)}>Save theme</button>
              {canApply && <button type="button" className="pr-btn pr-btn--primary" disabled={blocked} onClick={() => finish(true)}>Save and apply</button>}
            </span>
          </div>
        </div>
        <div className="pr-theme-editor__preview">
          {samples.map((slide, index) => (
            <SlideRenderer key={slide.id} context={{ theme: draft, size, showNumbers: true }} slide={slide} index={index} width={300} resolveImage={noImage} />
          ))}
        </div>
      </motion.div>
    </div>
  );
};
