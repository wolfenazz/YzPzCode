import React, { useState } from 'react';
import {
  ArrowArcLeft,
  ArrowArcRight,
  CaretDown,
  DotsThree,
  ChartBar,
  Export,
  ImageSquare,
  ListBullets,
  Palette,
  PencilSimple,
  Play,
  BookmarkSimple,
  SidebarSimple,
  Sparkle,
  SquaresFour,
  Table,
  TextB,
  TextItalic,
} from '@phosphor-icons/react';
import type { PlanContext } from '../../utils/presentation/render';
import { DECK_THEMES } from '../../utils/presentation/themes';
import type { DeckSize, DeckTheme, LayoutId, Slide, SlideTransition } from '../../utils/presentation/types';
import { LayoutGrid, Popover } from './LayoutPicker';
import { formatSelection } from './RichTextEditor';
import { SlideRenderer } from './SlideRenderer';

export type InsertKind = 'image' | 'chart' | 'table';

interface DeckToolbarProps {
  title: string;
  context: PlanContext;
  slide: Slide | null;
  editing: boolean;
  /** The selected slot holds bullets (true), plain text (false), or neither (null). */
  bullets: boolean | null;
  canUndo: boolean;
  canRedo: boolean;
  aiOpen: boolean;
  filmstripOpen: boolean;
  customThemes: DeckTheme[];
  transition: SlideTransition;
  resolveImage: (src: string) => string;
  onTitle: (title: string) => void;
  onLayout: (layout: LayoutId) => void;
  onTheme: (theme: DeckTheme) => void;
  onSize: (size: DeckSize) => void;
  onShowNumbers: (show: boolean) => void;
  onToggleBullets: () => void;
  onInsert: (kind: InsertKind) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleAi: () => void;
  onToggleFilmstrip: () => void;
  onExport: () => void;
  onTransition: (transition: SlideTransition) => void;
  onPresent: (fromCurrent: boolean) => void;
  onCustomizeTheme: () => void;
  onSaveTemplate: () => void;
}

const keepFocus = (event: React.MouseEvent): void => event.preventDefault();

export const DeckToolbar: React.FC<DeckToolbarProps> = ({
  title, context, slide, editing, bullets, canUndo, canRedo, aiOpen, filmstripOpen, customThemes, transition, resolveImage,
  onTitle, onLayout, onTheme, onSize, onShowNumbers, onToggleBullets, onInsert, onUndo, onRedo, onToggleAi, onToggleFilmstrip, onExport,
  onTransition, onPresent, onCustomizeTheme, onSaveTemplate,
}) => {
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [layoutAnchor, setLayoutAnchor] = useState<HTMLElement | null>(null);
  const [themeAnchor, setThemeAnchor] = useState<HTMLElement | null>(null);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const palette = context.theme.palette;
  const swatches = [palette.text, palette.accent1, palette.accent2, palette.accent3, palette.muted, '#ffffff'];

  return (
    <div className="pr-toolbar" role="toolbar" aria-label="Presentation tools">
      <div className="pr-toolbar__group">
        <button type="button" className="pr-icon-btn" data-active={filmstripOpen || undefined} title="Show slides" onClick={onToggleFilmstrip}><SidebarSimple size={15} /></button>
        <input
          className="pr-toolbar__title"
          value={draftTitle ?? title}
          aria-label="Presentation title"
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={() => { if (draftTitle !== null && draftTitle.trim() && draftTitle !== title) onTitle(draftTitle.trim()); setDraftTitle(null); }}
          onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); if (event.key === 'Escape') { setDraftTitle(null); (event.target as HTMLInputElement).blur(); } }}
        />
      </div>

      <div className="pr-toolbar__group">
        <button type="button" className="pr-tool" disabled={!slide} onClick={(event) => setLayoutAnchor(layoutAnchor ? null : event.currentTarget)}>
          <SquaresFour size={15} /> Layout <CaretDown size={10} />
        </button>
        <button type="button" className="pr-tool" onClick={(event) => setThemeAnchor(themeAnchor ? null : event.currentTarget)}>
          <Palette size={15} /> Theme <CaretDown size={10} />
        </button>
        <span className="pr-toolbar__sep" />
        <button type="button" className="pr-icon-btn" title="Bold (Ctrl B)" disabled={!editing} onMouseDown={keepFocus} onClick={() => formatSelection('bold')}><TextB size={15} weight="bold" /></button>
        <button type="button" className="pr-icon-btn" title="Italic (Ctrl I)" disabled={!editing} onMouseDown={keepFocus} onClick={() => formatSelection('italic')}><TextItalic size={15} /></button>
        <button type="button" className="pr-icon-btn pr-color-btn" title="Text colour" disabled={!editing} onMouseDown={keepFocus} onClick={(event) => setColorAnchor(colorAnchor ? null : event.currentTarget)}>
          <span className="pr-color-btn__a">A</span><span className="pr-color-btn__bar" style={{ background: palette.accent1 }} />
        </button>
        <button type="button" className="pr-icon-btn" title={bullets ? 'Plain paragraphs' : 'Bullets'} data-active={bullets || undefined} disabled={bullets === null} onClick={onToggleBullets}><ListBullets size={15} /></button>
        <span className="pr-toolbar__sep" />
        <button type="button" className="pr-icon-btn" title="Insert an image" disabled={!slide} onClick={() => onInsert('image')}><ImageSquare size={15} /></button>
        <button type="button" className="pr-icon-btn" title="Insert a chart" disabled={!slide} onClick={() => onInsert('chart')}><ChartBar size={15} /></button>
        <button type="button" className="pr-icon-btn" title="Insert a table" disabled={!slide} onClick={() => onInsert('table')}><Table size={15} /></button>
      </div>

      <div className="pr-toolbar__group">
        <button type="button" className="pr-icon-btn" title="Undo (Ctrl Z)" disabled={!canUndo} onClick={onUndo}><ArrowArcLeft size={15} /></button>
        <button type="button" className="pr-icon-btn" title="Redo (Ctrl Y)" disabled={!canRedo} onClick={onRedo}><ArrowArcRight size={15} /></button>
        <button type="button" className="pr-icon-btn" data-active={aiOpen || undefined} title="AI presenter" onClick={onToggleAi}><Sparkle size={15} weight={aiOpen ? 'fill' : 'regular'} /></button>
        <button type="button" className="pr-icon-btn" title="More" onClick={(event) => setMoreAnchor(moreAnchor ? null : event.currentTarget)}><DotsThree size={17} weight="bold" /></button>
        <button type="button" className="pr-btn pr-btn--sm" title="Present from the start (F5) · Shift F5 from this slide" onClick={(event) => onPresent(event.shiftKey)}><Play size={13} weight="fill" /> Present</button>
        <button type="button" className="pr-btn pr-btn--primary pr-btn--sm" title="Export (Ctrl Shift E)" onClick={onExport}><Export size={14} /> Export</button>
      </div>

      {layoutAnchor && slide && (
        <Popover anchor={layoutAnchor} onClose={() => setLayoutAnchor(null)} className="pr-popover--layouts">
          <div className="pr-popover__title">Layout for this slide</div>
          <LayoutGrid context={context} current={slide.layout} onPick={(layout) => { onLayout(layout); setLayoutAnchor(null); }} />
        </Popover>
      )}

      {themeAnchor && (
        <Popover anchor={themeAnchor} onClose={() => setThemeAnchor(null)} className="pr-popover--themes">
          <div className="pr-popover__row">
            <div className="pr-popover__title">Theme</div>
            <div className="pr-segmented">
              {(['16:9', '4:3'] as const).map((value) => (
                <button key={value} type="button" className="pr-segmented__item" data-active={context.size === value || undefined} onClick={() => onSize(value)}>{value}</button>
              ))}
            </div>
            <label className="pr-check"><input type="checkbox" checked={context.showNumbers} onChange={(event) => onShowNumbers(event.target.checked)} /> Slide numbers</label>
            <select className="pr-select pr-select--inline" value={transition} aria-label="Slide transition" onChange={(event) => onTransition(event.target.value as SlideTransition)}>
              <option value="fade">Fade transition</option>
              <option value="slide">Slide transition</option>
              <option value="none">No transition</option>
            </select>
            <button type="button" className="pr-btn pr-btn--sm" onClick={() => { setThemeAnchor(null); onCustomizeTheme(); }}><PencilSimple size={12} /> Customize…</button>
          </div>
          {customThemes.length > 0 && <div className="pr-popover__title">Your themes</div>}
          {customThemes.length > 0 && (
            <div className="pr-theme-grid pr-theme-grid--compact" style={{ marginBottom: 12 }}>
              {customThemes.map((theme) => (
                <button key={theme.id} type="button" className="pr-theme-card" data-active={theme.id === context.theme.id || undefined} title={theme.tagline} onClick={() => onTheme(theme)}>
                  {slide && <SlideRenderer context={{ ...context, theme }} slide={slide} index={0} width={150} resolveImage={resolveImage} />}
                  <span className="pr-theme-card__meta"><strong>{theme.name}</strong></span>
                </button>
              ))}
            </div>
          )}
          {customThemes.length > 0 && <div className="pr-popover__title">Built in</div>}
          <div className="pr-theme-grid pr-theme-grid--compact">
            {DECK_THEMES.map((theme) => (
              <button key={theme.id} type="button" className="pr-theme-card" data-active={theme.id === context.theme.id || undefined} title={theme.tagline} onClick={() => onTheme(theme)}>
                {slide && <SlideRenderer context={{ ...context, theme }} slide={slide} index={0} width={150} resolveImage={resolveImage} />}
                <span className="pr-theme-card__meta"><strong>{theme.name}</strong></span>
              </button>
            ))}
            {!DECK_THEMES.some((theme) => theme.id === context.theme.id) && !customThemes.some((theme) => theme.id === context.theme.id) && (
              <button type="button" className="pr-theme-card" data-active title={context.theme.tagline}>
                {slide && <SlideRenderer context={context} slide={slide} index={0} width={150} resolveImage={resolveImage} />}
                <span className="pr-theme-card__meta"><strong>{context.theme.name}</strong></span>
              </button>
            )}
          </div>
        </Popover>
      )}

      {moreAnchor && (
        <Popover anchor={moreAnchor} onClose={() => setMoreAnchor(null)} align="right" className="pr-popover--menu">
          <div className="pr-menu-list">
            <button type="button" onClick={() => { setMoreAnchor(null); onPresent(true); }}><Play size={13} /> Present from this slide <kbd>Shift F5</kbd></button>
            <button type="button" onClick={() => { setMoreAnchor(null); onCustomizeTheme(); }}><Palette size={13} /> Customize the theme…</button>
            <button type="button" onClick={() => { setMoreAnchor(null); onSaveTemplate(); }}><BookmarkSimple size={13} /> Save as template…</button>
          </div>
        </Popover>
      )}

      {colorAnchor && (
        <Popover anchor={colorAnchor} onClose={() => setColorAnchor(null)}>
          <div className="pr-swatches" onMouseDown={keepFocus}>
            {swatches.map((color) => (
              <button key={color} type="button" className="pr-swatch" style={{ background: color }} title={color} onMouseDown={keepFocus} onClick={() => { formatSelection('color', color); setColorAnchor(null); }} />
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
};

