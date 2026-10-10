import React, { useState } from 'react';
import { ArrowUp, Stop } from '@phosphor-icons/react';
import { applyTheme, DOCUMENT_FONTS, fontStack, PAGE_SIZES, STYLE_THEMES } from '../../utils/writing/stylePresets';
import { RESTYLE_SUGGESTIONS, type RestyleResult } from '../../utils/writing/styleAi';
import type { CoverStyle, HeadingNumbering, PageNumberPosition, PageSizeId, ReportStyle } from '../../utils/writing/types';

type RestyleReply = { ok: true; result: RestyleResult } | { ok: false; cancelled: boolean; error: string };

interface DesignPanelProps {
  style: ReportStyle;
  /** Another AI run is in progress. */
  busy: boolean;
  onChange: (style: ReportStyle) => void;
  onRestyle: (instruction: string) => Promise<RestyleReply>;
  onCancel: () => void;
}

const MARGINS: Array<{ value: number; label: string }> = [
  { value: 12.7, label: 'Narrow' },
  { value: 19, label: 'Moderate' },
  { value: 25.4, label: 'Normal' },
  { value: 30, label: 'Wide' },
  { value: 38, label: 'Extra wide' },
];

const COVERS: Array<{ value: CoverStyle; label: string }> = [
  { value: 'academic', label: 'Academic' },
  { value: 'classic', label: 'Classic' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'modern', label: 'Modern' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'none', label: 'No cover' },
];

const ColorField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className="wr-row-field">
    <span>{label}</span>
    <span className="wr-color">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
      <code>{value.toUpperCase()}</code>
    </span>
  </label>
);

export const DesignPanel: React.FC<DesignPanelProps> = ({ style, busy, onChange, onRestyle, onCancel }) => {
  const [prompt, setPrompt] = useState('');
  const [restyle, setRestyle] = useState<{ status: 'idle' | 'running' | 'done' | 'failed'; message?: string; changes?: string[]; previous?: ReportStyle }>({ status: 'idle' });
  const set = <K extends keyof ReportStyle>(key: K, value: ReportStyle[K]): void => onChange({ ...style, [key]: value, themeId: key === 'pageSize' || key === 'orientation' || key === 'margins' ? style.themeId : 'custom' });
  const running = restyle.status === 'running';

  const run = async (instruction: string): Promise<void> => {
    const text = instruction.trim();
    if (!text || busy || running) return;
    const previous = style;
    setRestyle({ status: 'running' });
    const reply = await onRestyle(text);
    if (reply.ok) {
      onChange(reply.result.style);
      setRestyle({ status: 'done', message: reply.result.summary, changes: reply.result.changes, previous });
      setPrompt('');
    } else {
      setRestyle(reply.cancelled ? { status: 'idle' } : { status: 'failed', message: reply.error });
    }
  };

  const margin = Math.round(style.margins.left * 10) / 10;

  return (
    <div className="wr-panel-body">
      <section className="wr-section">
        <h3 className="wr-section__title">Restyle with AI</h3>
        <div className="wr-ask">
          <textarea
            className="wr-ask__input"
            rows={2}
            value={prompt}
            disabled={running}
            placeholder="Describe the look, e.g. “Like a consulting report: navy, clean sans serif”"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void run(prompt);
              }
            }}
          />
          {running ? (
            <button type="button" className="wr-ask__send" aria-label="Stop" onClick={onCancel}><Stop size={11} weight="fill" /></button>
          ) : (
            <button type="button" className="wr-ask__send" aria-label="Restyle" disabled={busy || !prompt.trim()} onClick={() => void run(prompt)}><ArrowUp size={13} weight="bold" /></button>
          )}
        </div>
        {running && <p className="wr-note"><span className="wr-pulse" aria-hidden="true" /> Designing a new look…</p>}
        {restyle.status === 'failed' && <p className="wr-note is-error">{restyle.message}</p>}
        {restyle.status === 'done' && (
          <div className="wr-result">
            <p>{restyle.message || 'Restyled.'}</p>
            {restyle.changes && <p className="wr-note">{restyle.changes.join(' · ')}</p>}
            <div className="wr-confirm__row">
              <button type="button" className="wr-btn wr-btn--sm" onClick={() => { if (restyle.previous) onChange(restyle.previous); setRestyle({ status: 'idle' }); }}>Undo</button>
              <button type="button" className="wr-btn wr-btn--sm" onClick={() => setRestyle({ status: 'idle' })}>Keep</button>
            </div>
          </div>
        )}
        {restyle.status === 'idle' && !prompt && (
          <div className="wr-suggestions">
            {RESTYLE_SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" className="wr-suggestion" disabled={busy} onClick={() => void run(suggestion)}>{suggestion}</button>
            ))}
          </div>
        )}
      </section>

      <section className="wr-section">
        <h3 className="wr-section__title">Templates</h3>
        <div className="wr-templates">
          {STYLE_THEMES.map((theme) => (
            <button key={theme.id} type="button" className={`wr-template${style.themeId === theme.id ? ' is-active' : ''}`} onClick={() => onChange(applyTheme(style, theme.id))}>
              <span className="wr-template__sample" aria-hidden="true">
                <span style={{ fontFamily: fontStack(theme.headingFont), color: theme.headingColor }}>Aa</span>
                <i style={{ background: theme.accentColor }} />
              </span>
              <span className="wr-template__text">
                <span className="wr-template__name">{theme.name}</span>
                <span className="wr-template__tagline">{theme.headingFont === theme.bodyFont ? theme.bodyFont : `${theme.headingFont} · ${theme.bodyFont}`}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <details className="wr-section wr-disclosure" open>
        <summary className="wr-section__title">Text</summary>
        <div className="wr-disclosure__body">
          <label className="wr-row-field">
            <span>Headings</span>
            <select className="wr-control" value={style.headingFont} onChange={(event) => set('headingFont', event.target.value)}>
              {DOCUMENT_FONTS.map((font) => <option key={font.family} value={font.family}>{font.family}</option>)}
            </select>
          </label>
          <label className="wr-row-field">
            <span>Body</span>
            <select className="wr-control" value={style.bodyFont} onChange={(event) => set('bodyFont', event.target.value)}>
              {DOCUMENT_FONTS.map((font) => <option key={font.family} value={font.family}>{font.family}</option>)}
            </select>
          </label>
          <label className="wr-row-field">
            <span>Body size</span>
            <select className="wr-control" value={String(style.bodySize)} onChange={(event) => set('bodySize', Number(event.target.value))}>
              {[...new Set([9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, style.bodySize])].sort((a, b) => a - b).map((size) => <option key={size} value={String(size)}>{size} pt</option>)}
            </select>
          </label>
          <label className="wr-row-field">
            <span>Heading size</span>
            <select className="wr-control" value={String(style.headingSize)} onChange={(event) => set('headingSize', Number(event.target.value))}>
              {[...new Set([14, 16, 17, 18, 20, 22, 24, 28, 32, style.headingSize])].sort((a, b) => a - b).map((size) => <option key={size} value={String(size)}>{size} pt</option>)}
            </select>
          </label>
          <label className="wr-row-field">
            <span>Line spacing</span>
            <select className="wr-control" value={String(style.lineHeight)} onChange={(event) => set('lineHeight', Number(event.target.value))}>
              {[...new Set([1, 1.15, 1.3, 1.4, 1.5, 1.75, 2, style.lineHeight])].sort((a, b) => a - b).map((value) => <option key={value} value={String(value)}>{value}</option>)}
            </select>
          </label>
          <label className="wr-row-field">
            <span>After paragraph</span>
            <select className="wr-control" value={String(style.paragraphSpacing)} onChange={(event) => set('paragraphSpacing', Number(event.target.value))}>
              {[...new Set([0, 3, 6, 8, 10, 12, style.paragraphSpacing])].sort((a, b) => a - b).map((value) => <option key={value} value={String(value)}>{value} pt</option>)}
            </select>
          </label>
          <label className="wr-row-field">
            <span>Alignment</span>
            <select className="wr-control" value={style.alignment} onChange={(event) => set('alignment', event.target.value as ReportStyle['alignment'])}>
              <option value="left">Left</option>
              <option value="justify">Justified</option>
            </select>
          </label>
          <label className="wr-switch-row">
            <span>Indent first lines</span>
            <input type="checkbox" className="wr-switch" checked={style.firstLineIndent} onChange={(event) => set('firstLineIndent', event.target.checked)} />
          </label>
          <ColorField label="Heading colour" value={style.headingColor} onChange={(value) => set('headingColor', value)} />
          <ColorField label="Accent" value={style.accentColor} onChange={(value) => set('accentColor', value)} />
        </div>
      </details>

      <details className="wr-section wr-disclosure">
        <summary className="wr-section__title">Page</summary>
        <div className="wr-disclosure__body">
          <label className="wr-row-field">
            <span>Paper</span>
            <select className="wr-control" value={style.pageSize} onChange={(event) => set('pageSize', event.target.value as PageSizeId)}>
              {Object.values(PAGE_SIZES).map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
            </select>
          </label>
          <label className="wr-row-field">
            <span>Orientation</span>
            <select className="wr-control" value={style.orientation} onChange={(event) => set('orientation', event.target.value as ReportStyle['orientation'])}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label className="wr-row-field">
            <span>Margins</span>
            <select className="wr-control" value={String(margin)} onChange={(event) => { const value = Number(event.target.value); set('margins', { top: value, right: value, bottom: value, left: value }); }}>
              {!MARGINS.some((entry) => entry.value === margin) && <option value={String(margin)}>{margin} mm</option>}
              {MARGINS.map((entry) => <option key={entry.value} value={String(entry.value)}>{entry.label} · {Math.round(entry.value)} mm</option>)}
            </select>
          </label>
          <label className="wr-row-field">
            <span>Page numbers</span>
            <select className="wr-control" value={style.pageNumbers} onChange={(event) => set('pageNumbers', event.target.value as PageNumberPosition)}>
              <option value="bottom-center">Bottom centre</option>
              <option value="bottom-right">Bottom right</option>
              <option value="top-right">Top right</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="wr-field">
            <span className="wr-label">Header</span>
            <input className="wr-control" value={style.headerText} placeholder="e.g. {title}" onKeyDown={(event) => event.stopPropagation()} onChange={(event) => set('headerText', event.target.value)} />
          </label>
          <label className="wr-field">
            <span className="wr-label">Footer</span>
            <input className="wr-control" value={style.footerText} placeholder="e.g. Confidential" onKeyDown={(event) => event.stopPropagation()} onChange={(event) => set('footerText', event.target.value)} />
          </label>
        </div>
      </details>

      <details className="wr-section wr-disclosure">
        <summary className="wr-section__title">Structure</summary>
        <div className="wr-disclosure__body">
          <label className="wr-row-field">
            <span>Cover</span>
            <select className="wr-control" value={style.cover} onChange={(event) => set('cover', event.target.value as CoverStyle)}>
              {COVERS.map((cover) => <option key={cover.value} value={cover.value}>{cover.label}</option>)}
            </select>
          </label>
          <label className="wr-row-field">
            <span>Heading numbers</span>
            <select className="wr-control" value={style.headingNumbering} onChange={(event) => set('headingNumbering', event.target.value as HeadingNumbering)}>
              <option value="decimal">1 · 1.1 · 1.1.1</option>
              <option value="chapter">Chapter 1</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="wr-switch-row">
            <span>Chapters start on a new page</span>
            <input type="checkbox" className="wr-switch" checked={style.sectionBreaks} onChange={(event) => set('sectionBreaks', event.target.checked)} />
          </label>
          <label className="wr-switch-row">
            <span>Roman numbers before chapter 1</span>
            <input type="checkbox" className="wr-switch" checked={style.romanFrontMatter} onChange={(event) => set('romanFrontMatter', event.target.checked)} />
          </label>
        </div>
      </details>
    </div>
  );
};
