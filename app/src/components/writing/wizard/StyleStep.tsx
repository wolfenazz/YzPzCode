import React, { useEffect, useState } from 'react';
import { CITATION_STYLES } from '../../../utils/writing/citations';
import {
  applyTheme,
  DOCUMENT_FONTS,
  fontStack,
  headingSizes,
  pageDimensions,
  PAGE_SIZES,
  STYLE_THEMES,
} from '../../../utils/writing/stylePresets';
import type { CitationStyle, CoverStyle, HeadingNumbering, PageNumberPosition, PageSizeId, ReportStyle } from '../../../utils/writing/types';
import { Check, Chips, NumberField, Segmented, Select } from '../controls';

const FONT_OPTIONS = DOCUMENT_FONTS.map((font) => ({ value: font.family, label: <span style={{ fontFamily: fontStack(font.family) }}>{font.family}</span>, tag: font.kind }));

const COVERS: Array<{ value: CoverStyle; label: string }> = [
  { value: 'academic', label: 'Academic' },
  { value: 'classic', label: 'Classic' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'modern', label: 'Modern' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'none', label: 'None' },
];

interface SpecimenPageProps {
  style: ReportStyle;
  title: string;
  /** The sheet is scaled to fit inside this box, in CSS pixels. */
  maxWidth?: number;
  maxHeight?: number;
}

export const SpecimenPage: React.FC<SpecimenPageProps> = ({ style, title, maxWidth = 400, maxHeight = 540 }) => {
  const { width, height } = pageDimensions(style.pageSize, style.orientation);
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const [h1, h2] = headingSizes(style);
  const pt = (value: number): string => `${value * scale * 0.3528}px`;
  const mm = (value: number): string => `${value * scale}px`;
  const number = style.headingNumbering === 'none' ? '' : style.headingNumbering === 'chapter' ? '' : '1 ';
  return (
    <div className="wr-specimen" aria-label="Style preview">
      <div
        className="wr-specimen__sheet"
        style={{
          width: mm(width),
          height: mm(height),
          padding: `${mm(style.margins.top)} ${mm(style.margins.right)} ${mm(style.margins.bottom)} ${mm(style.margins.left)}`,
          fontFamily: fontStack(style.bodyFont),
          fontSize: pt(style.bodySize),
          lineHeight: style.lineHeight,
        }}
      >
        {style.headerText && <div className="wr-specimen__head" style={{ fontSize: pt(8) }}><span>{style.headerText.replace('{title}', title)}</span></div>}
        {style.headingNumbering === 'chapter' && (
          <div style={{ fontFamily: fontStack(style.headingFont), fontSize: pt(h1 * 0.55), letterSpacing: '0.16em', textTransform: 'uppercase', color: style.accentColor, marginTop: 4 }}>Chapter 1</div>
        )}
        <div className="wr-specimen__h1" style={{ fontFamily: fontStack(style.headingFont), fontSize: pt(h1), color: style.headingColor }}>
          {number && <span style={{ color: style.accentColor }}>{number}</span>}Introduction
        </div>
        <p className="wr-specimen__p" style={{ textAlign: style.alignment, textIndent: style.firstLineIndent ? '1.2em' : 0, marginBottom: pt(style.paragraphSpacing) }}>
          Irrigation accounts for roughly 70% of freshwater withdrawals worldwide. In arid regions the share is higher, and most of it is still scheduled by hand.
        </p>
        <p className="wr-specimen__p" style={{ textAlign: style.alignment, textIndent: style.firstLineIndent ? '1.2em' : 0, marginBottom: pt(style.paragraphSpacing) }}>
          This report describes a controller that waters only when the soil asks for it — and what that changed on three test farms.
        </p>
        <div className="wr-specimen__h2" style={{ fontFamily: fontStack(style.headingFont), fontSize: pt(h2), color: style.headingColor }}>
          {style.headingNumbering !== 'none' && '1.1 '}Results
        </div>
        <table className="wr-specimen__table">
          <thead>
            <tr style={{ borderTop: `1px solid ${style.headingColor}` }}>
              <th style={{ color: style.headingColor, background: `color-mix(in oklab, ${style.accentColor} 8%, white)` }}>Farm</th>
              <th style={{ color: style.headingColor, background: `color-mix(in oklab, ${style.accentColor} 8%, white)` }}>Water saved</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>North plot</td><td>31%</td></tr>
            <tr style={{ borderBottom: `1px solid ${style.headingColor}` }}><td>River plot</td><td>24%</td></tr>
          </tbody>
        </table>
        {style.pageNumbers !== 'none' && (
          <div className="wr-specimen__foot" style={{ fontSize: pt(8), textAlign: style.pageNumbers === 'bottom-right' ? 'right' : 'center', paddingRight: style.pageNumbers === 'bottom-right' ? mm(style.margins.right) : 0, top: style.pageNumbers === 'top-right' ? mm(6) : undefined, bottom: style.pageNumbers === 'top-right' ? undefined : mm(6) }}>
            {style.footerText ? `${style.footerText.replace('{title}', title)}   ·   ` : ''}1
          </div>
        )}
      </div>
    </div>
  );
};

interface StyleStepProps {
  style: ReportStyle;
  title: string;
  onChange: (style: ReportStyle) => void;
}

export const StyleStep: React.FC<StyleStepProps> = ({ style, title, onChange }) => {
  const set = <K extends keyof ReportStyle>(key: K, value: ReportStyle[K]): void => onChange({ ...style, [key]: value });
  const uniformMargin = Math.round(style.margins.top);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    if (!zoomed) return;
    const close = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setZoomed(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [zoomed]);

  return (
    <div className="wr-wizard__step">
      <span className="wr-eyebrow">Step three · House style</span>
      <h2 className="wr-wizard__question">How should it <em>look</em>?</h2>
      <p className="wr-wizard__lede">Start from a template, then tune the type, the page and the apparatus. The specimen on the right re-typesets as you go.</p>

      <div className="wr-step-columns">
        <div className="wr-stack">
          <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
            <h3 className="wr-panel-card__title">Template</h3>
            <div className="wr-theme-grid">
              {STYLE_THEMES.map((theme) => (
                <button key={theme.id} type="button" className={`wr-theme-card${style.themeId === theme.id ? ' is-selected' : ''}`} onClick={() => onChange(applyTheme(style, theme.id))}>
                  <span className="wr-theme-card__swatch">
                    <strong style={{ fontFamily: fontStack(theme.headingFont), color: theme.headingColor }}>Aa</strong>
                    <i style={{ background: theme.accentColor }} />
                  </span>
                  <span className="wr-theme-card__name">{theme.name}</span>
                  <span className="wr-theme-card__tagline">{theme.tagline}</span>
                </button>
              ))}
            </div>
          </div></div>

          <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
            <h3 className="wr-panel-card__title">Typography</h3>
            <div className="wr-stack">
              <div className="wr-row"><span className="wr-row__label">Body font</span><Select options={FONT_OPTIONS} value={style.bodyFont} onChange={(value) => set('bodyFont', value)} menuWidth={240} align="right" label="Body font" /></div>
              <div className="wr-row"><span className="wr-row__label">Heading font</span><Select options={FONT_OPTIONS} value={style.headingFont} onChange={(value) => set('headingFont', value)} menuWidth={240} align="right" label="Heading font" /></div>
              <div className="wr-row"><span className="wr-row__label">Body size</span><NumberField value={style.bodySize} min={8} max={16} step={0.5} suffix="pt" onChange={(value) => set('bodySize', value)} /></div>
              <div className="wr-row"><span className="wr-row__label">Chapter heading size</span><NumberField value={style.headingSize} min={11} max={36} step={0.5} suffix="pt" onChange={(value) => set('headingSize', value)} /></div>
              <div className="wr-row"><span className="wr-row__label">Line spacing</span><NumberField value={style.lineHeight} min={1} max={2.5} step={0.05} suffix="×" onChange={(value) => set('lineHeight', value)} /></div>
              <div className="wr-row"><span className="wr-row__label">Space after paragraphs</span><NumberField value={style.paragraphSpacing} min={0} max={24} step={1} suffix="pt" onChange={(value) => set('paragraphSpacing', value)} /></div>
              <div className="wr-row">
                <span className="wr-row__label">Alignment</span>
                <Segmented items={[{ value: 'left', label: 'Left' }, { value: 'justify', label: 'Justified' }]} value={style.alignment} onChange={(value) => set('alignment', value)} label="Alignment" />
              </div>
              <Check label="Indent the first line of paragraphs" checked={style.firstLineIndent} onChange={(value) => set('firstLineIndent', value)} />
              <div className="wr-row">
                <span className="wr-row__label">Heading colour · accent</span>
                <span className="wr-color-input">
                  <input type="color" value={style.headingColor} onChange={(event) => set('headingColor', event.target.value)} aria-label="Heading colour" />
                  <input type="color" value={style.accentColor} onChange={(event) => set('accentColor', event.target.value)} aria-label="Accent colour" />
                </span>
              </div>
            </div>
          </div></div>

          <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
            <h3 className="wr-panel-card__title">Page</h3>
            <div className="wr-stack">
              <div className="wr-row">
                <span className="wr-row__label">Paper</span>
                <Segmented items={Object.values(PAGE_SIZES).map((page) => ({ value: page.id, label: page.label }))} value={style.pageSize} onChange={(value) => set('pageSize', value as PageSizeId)} label="Paper size" />
              </div>
              <div className="wr-row">
                <span className="wr-row__label">Orientation</span>
                <Segmented items={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} value={style.orientation} onChange={(value) => set('orientation', value)} label="Orientation" />
              </div>
              <div className="wr-row">
                <span className="wr-row__label">Margins (all sides)</span>
                <NumberField value={uniformMargin} min={10} max={50} step={1} suffix="mm" onChange={(value) => set('margins', { top: value, right: value, bottom: value, left: value })} />
              </div>
              <div className="wr-row">
                <span className="wr-row__label">Binding margin (left)</span>
                <NumberField value={Math.round(style.margins.left)} min={10} max={50} step={1} suffix="mm" onChange={(value) => set('margins', { ...style.margins, left: value })} />
              </div>
              <div className="wr-row">
                <span className="wr-row__label">Page numbers</span>
                <Chips
                  items={[{ value: 'bottom-center', label: 'Bottom centre' }, { value: 'bottom-right', label: 'Bottom right' }, { value: 'top-right', label: 'Top right' }, { value: 'none', label: 'None' }]}
                  value={style.pageNumbers}
                  onChange={(value) => set('pageNumbers', value as PageNumberPosition)}
                  label="Page numbers"
                />
              </div>
              <label className="wr-field">
                <span className="wr-field__label">Running header <span className="wr-field__hint">— {'{title}'} inserts the report title</span></span>
                <input className="wr-input" value={style.headerText} onChange={(event) => set('headerText', event.target.value)} placeholder="e.g. {title}" />
              </label>
              <label className="wr-field">
                <span className="wr-field__label">Footer text</span>
                <input className="wr-input" value={style.footerText} onChange={(event) => set('footerText', event.target.value)} placeholder="e.g. Confidential" />
              </label>
            </div>
          </div></div>

          <div className="wr-bezel"><div className="wr-bezel__core wr-panel-card">
            <h3 className="wr-panel-card__title">Structure & apparatus</h3>
            <div className="wr-stack">
              <div className="wr-row">
                <span className="wr-row__label">Cover page</span>
                <Chips items={COVERS} value={style.cover} onChange={(value) => set('cover', value)} label="Cover page" />
              </div>
              <div className="wr-row">
                <span className="wr-row__label">Heading numbers</span>
                <Segmented items={[{ value: 'decimal', label: '1 · 1.1' }, { value: 'chapter', label: 'Chapter 1' }, { value: 'none', label: 'None' }]} value={style.headingNumbering} onChange={(value) => set('headingNumbering', value as HeadingNumbering)} label="Heading numbering" />
              </div>
              <div className="wr-row">
                <span className="wr-row__label">Citation style</span>
                <Chips items={CITATION_STYLES.map((entry) => ({ value: entry.id, label: entry.label }))} value={style.citationStyle} onChange={(value) => set('citationStyle', value as CitationStyle)} label="Citation style" />
              </div>
              <Check label="Table of contents" checked={style.includeToc} onChange={(value) => set('includeToc', value)} />
              <Check label="Start every chapter on a new page" checked={style.sectionBreaks} onChange={(value) => set('sectionBreaks', value)} />
              <Check label="Roman page numbers for front matter (in exports)" checked={style.romanFrontMatter} onChange={(value) => set('romanFrontMatter', value)} />
              <Check label="List of figures (in exports)" checked={style.includeListOfFigures} onChange={(value) => set('includeListOfFigures', value)} />
              <Check label="List of tables (in exports)" checked={style.includeListOfTables} onChange={(value) => set('includeListOfTables', value)} />
            </div>
          </div></div>
        </div>

        <aside>
          <div className="wr-bezel"><div className="wr-bezel__core" style={{ padding: '6px 14px 16px' }}>
            <button type="button" className="wr-specimen__open" onClick={() => setZoomed(true)} aria-label="Enlarge the style preview" title="Click to enlarge">
              <SpecimenPage style={style} title={title || 'Report title'} />
            </button>
            <p className="wr-field__hint" style={{ textAlign: 'center' }}>
              {PAGE_SIZES[style.pageSize].label} · {style.bodyFont} {style.bodySize}pt · {style.lineHeight}× spacing · click to enlarge
            </p>
          </div></div>
        </aside>
        {zoomed && (
          <div className="wr-specimen-zoom" role="dialog" aria-label="Style preview" onClick={() => setZoomed(false)}>
            <SpecimenPage style={style} title={title || 'Report title'} maxWidth={Math.max(360, window.innerWidth - 120)} maxHeight={Math.max(360, window.innerHeight - 100)} />
          </div>
        )}
      </div>
    </div>
  );
};
