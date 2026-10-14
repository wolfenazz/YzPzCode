import React, { useState } from 'react';
import { registerAllBundledFonts } from '../../utils/bundledFonts';
import { applyTheme, fontStack, PAGE_SIZES, STYLE_THEMES } from '../../utils/writing/stylePresets';
import { FontOptions } from '../studio/FontOptions';
import { RESTYLE_SUGGESTIONS, type RestyleResult } from '../../utils/writing/styleAi';
import type { CoverStyle, HeadingNumbering, PageNumberPosition, PageSizeId, ReportStyle } from '../../utils/writing/types';
import { ActionList, ColorInput, Field, Hint, PromptBox, Section, Select, Toggle } from '../studio/Inspector';

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

const sizes = (base: number[], current: number): number[] => [...new Set([...base, current])].sort((a, b) => a - b);

export const DesignPanel: React.FC<DesignPanelProps> = ({ style, busy, onChange, onRestyle, onCancel }) => {
  const [prompt, setPrompt] = useState('');
  const [restyle, setRestyle] = useState<{ status: 'idle' | 'running' | 'done' | 'failed'; message?: string; changes?: string[]; history: ReportStyle[] }>({ status: 'idle', history: [] });
  const set = <K extends keyof ReportStyle>(key: K, value: ReportStyle[K]): void => onChange({ ...style, [key]: value, themeId: key === 'pageSize' || key === 'orientation' || key === 'margins' ? style.themeId : 'custom' });
  const running = restyle.status === 'running';
  /** Style and template controls lock while any AI run is in flight. */
  const locked = busy || running;

  const run = async (instruction: string): Promise<void> => {
    const text = instruction.trim();
    if (!text || busy || running) return;
    const previous = style;
    setRestyle((current) => ({ status: 'running', history: current.history }));
    const reply = await onRestyle(text);
    if (reply.ok) {
      const { summary, changes, style: next } = reply.result;
      onChange(next);
      setPrompt('');
      // Every restyle remembers what it replaced, so a second run cannot eat the first undo.
      setRestyle((current) => ({ status: 'done', message: summary, changes, history: [...current.history, previous].slice(-10) }));
    } else if (reply.cancelled) {
      setRestyle((current) => ({ status: 'idle', history: current.history }));
    } else {
      const message = reply.error;
      setRestyle((current) => ({ status: 'failed', message, history: current.history }));
    }
  };

  const undo = (): void => {
    const last = restyle.history[restyle.history.length - 1];
    if (!last) return;
    onChange(last);
    setRestyle((current) => ({
      status: current.history.length > 1 ? 'done' : 'idle',
      message: current.message,
      changes: current.changes,
      history: current.history.slice(0, -1),
    }));
  };

  const margin = Math.round(style.margins.left * 10) / 10;

  return (
    <>
      <Section title="Restyle with AI">
        <PromptBox
          value={prompt}
          onChange={setPrompt}
          onSubmit={() => void run(prompt)}
          disabled={running || busy}
          running={running}
          onStop={onCancel}
          placeholder="Describe the look, e.g. “Like a consulting report: navy, clean sans serif”"
        />
        {running && <Hint>Designing a new look…</Hint>}
        {restyle.status === 'failed' && <Hint error>{restyle.message}</Hint>}
        {restyle.status === 'done' && (
          <div className="sx-job">
            <div className="sx-job__row"><strong>{restyle.message || 'Restyled'}</strong></div>
            {restyle.changes && restyle.changes.length > 0 && <Hint>{restyle.changes.join(' · ')}</Hint>}
            <div className="sx-row">
              <button type="button" className="sx-btn sx-btn--sm" disabled={restyle.history.length === 0} onClick={undo}>Undo{restyle.history.length > 1 ? ` (${restyle.history.length})` : ''}</button>
              <button type="button" className="sx-btn sx-btn--sm" onClick={() => setRestyle({ status: 'idle', history: [] })}>Keep</button>
            </div>
          </div>
        )}
        {restyle.status === 'idle' && !prompt && (
          <ActionList
            single
            items={RESTYLE_SUGGESTIONS.map((suggestion) => ({ id: suggestion, label: suggestion, disabled: busy || running, onSelect: () => void run(suggestion) }))}
          />
        )}
      </Section>

      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {locked && <Hint>{running ? 'Applying the new look…' : 'Style controls unlock when the writer finishes.'}</Hint>}
      <Section title="Templates">
        <div className="wr-templates">
          {STYLE_THEMES.map((theme) => (
            <button key={theme.id} type="button" className={`wr-template${style.themeId === theme.id ? ' is-active' : ''}`} aria-pressed={style.themeId === theme.id} onClick={() => onChange(applyTheme(style, theme.id))}>
              <span className="wr-template__sample" aria-hidden="true">
                <span style={{ fontFamily: fontStack(theme.headingFont), color: theme.headingColor }}>Aa</span>
                <i style={{ background: theme.accentColor }} />
              </span>
              <span className="wr-template__name">{theme.name}</span>
              <span className="wr-template__tagline">{theme.headingFont === theme.bodyFont ? theme.bodyFont : `${theme.headingFont} · ${theme.bodyFont}`}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Text" collapsible>
        <Field label="Headings">
          <Select value={style.headingFont} onChange={(event) => set('headingFont', event.target.value)} onFocus={() => void registerAllBundledFonts()}>
            <FontOptions current={[style.headingFont, style.bodyFont]} />
          </Select>
        </Field>
        <Field label="Body">
          <Select value={style.bodyFont} onChange={(event) => set('bodyFont', event.target.value)} onFocus={() => void registerAllBundledFonts()}>
            <FontOptions current={[style.bodyFont, style.headingFont]} />
          </Select>
        </Field>
        <Field label="Body size">
          <Select value={String(style.bodySize)} onChange={(event) => set('bodySize', Number(event.target.value))}>
            {sizes([9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14], style.bodySize).map((size) => <option key={size} value={String(size)}>{size} pt</option>)}
          </Select>
        </Field>
        <Field label="Heading size">
          <Select value={String(style.headingSize)} onChange={(event) => set('headingSize', Number(event.target.value))}>
            {sizes([14, 16, 17, 18, 20, 22, 24, 28, 32], style.headingSize).map((size) => <option key={size} value={String(size)}>{size} pt</option>)}
          </Select>
        </Field>
        <Field label="Line spacing">
          <Select value={String(style.lineHeight)} onChange={(event) => set('lineHeight', Number(event.target.value))}>
            {sizes([1, 1.15, 1.3, 1.4, 1.5, 1.75, 2], style.lineHeight).map((value) => <option key={value} value={String(value)}>{value}</option>)}
          </Select>
        </Field>
        <Field label="After paragraph">
          <Select value={String(style.paragraphSpacing)} onChange={(event) => set('paragraphSpacing', Number(event.target.value))}>
            {sizes([0, 3, 6, 8, 10, 12], style.paragraphSpacing).map((value) => <option key={value} value={String(value)}>{value} pt</option>)}
          </Select>
        </Field>
        <Field label="Alignment">
          <Select value={style.alignment} onChange={(event) => set('alignment', event.target.value as ReportStyle['alignment'])}>
            <option value="left">Left</option>
            <option value="justify">Justified</option>
          </Select>
        </Field>
        <Toggle label="Indent first lines" checked={style.firstLineIndent} onChange={(value) => set('firstLineIndent', value)} />
        <Field label="Heading colour">
          <ColorInput label="Heading colour" value={style.headingColor} onChange={(value) => set('headingColor', value)} />
        </Field>
        <Field label="Accent">
          <ColorInput label="Accent" value={style.accentColor} onChange={(value) => set('accentColor', value)} />
        </Field>
      </Section>

      <Section title="Page" collapsible defaultOpen={false}>
        <Field label="Paper">
          <Select value={style.pageSize} onChange={(event) => set('pageSize', event.target.value as PageSizeId)}>
            {Object.values(PAGE_SIZES).map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}
          </Select>
        </Field>
        <Field label="Orientation">
          <Select value={style.orientation} onChange={(event) => set('orientation', event.target.value as ReportStyle['orientation'])}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </Select>
        </Field>
        <Field label="Margins">
          <Select value={String(margin)} onChange={(event) => { const value = Number(event.target.value); set('margins', { top: value, right: value, bottom: value, left: value }); }}>
            {!MARGINS.some((entry) => entry.value === margin) && <option value={String(margin)}>{margin} mm</option>}
            {MARGINS.map((entry) => <option key={entry.value} value={String(entry.value)}>{entry.label} · {Math.round(entry.value)} mm</option>)}
          </Select>
        </Field>
        <Field label="Page numbers">
          <Select value={style.pageNumbers} onChange={(event) => set('pageNumbers', event.target.value as PageNumberPosition)}>
            <option value="bottom-center">Bottom centre</option>
            <option value="bottom-right">Bottom right</option>
            <option value="top-right">Top right</option>
            <option value="none">None</option>
          </Select>
        </Field>
        <Field label="Header">
          <input className="sx-input" value={style.headerText} placeholder="e.g. {title}" onKeyDown={(event) => event.stopPropagation()} onChange={(event) => set('headerText', event.target.value)} />
        </Field>
        <Field label="Footer">
          <input className="sx-input" value={style.footerText} placeholder="e.g. Confidential" onKeyDown={(event) => event.stopPropagation()} onChange={(event) => set('footerText', event.target.value)} />
        </Field>
      </Section>

      <Section title="Structure" collapsible defaultOpen={false}>
        <Field label="Cover">
          <Select value={style.cover} onChange={(event) => set('cover', event.target.value as CoverStyle)}>
            {COVERS.map((cover) => <option key={cover.value} value={cover.value}>{cover.label}</option>)}
          </Select>
        </Field>
        <Field label="Heading numbers">
          <Select value={style.headingNumbering} onChange={(event) => set('headingNumbering', event.target.value as HeadingNumbering)}>
            <option value="decimal">1 · 1.1 · 1.1.1</option>
            <option value="chapter">Chapter 1</option>
            <option value="none">None</option>
          </Select>
        </Field>
        <Toggle label="Chapters start on a new page" checked={style.sectionBreaks} onChange={(value) => set('sectionBreaks', value)} />
        <Toggle label="Roman numbers before chapter 1" checked={style.romanFrontMatter} onChange={(value) => set('romanFrontMatter', value)} />
      </Section>
      </fieldset>
    </>
  );
};
