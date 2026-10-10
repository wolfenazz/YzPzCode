import React, { useMemo, useRef } from 'react';
import { Check, Swatches } from '@phosphor-icons/react';
import { textBlock } from '../../utils/presentation/richText';
import { emptySlide } from '../../utils/presentation/sanitize';
import type { DeckTheme, Slide } from '../../utils/presentation/types';
import { SlideRenderer } from './SlideRenderer';

const noImage = (): string => '';
const CARD_WIDTH = 196;

interface ThemePickerProps {
  themes: DeckTheme[];
  /** Selected theme id; '' selects the optional "keep as is" card. */
  value: string;
  onChange: (themeId: string) => void;
  /** Adds a first card for "no theme" (e.g. keep the imported file's own look). */
  noneLabel?: string;
  noneHint?: string;
  title?: string;
  subtitle?: string;
  label?: string;
}

/** A gallery of themes, each drawn as a real title slide, so the choice is made by eye. */
export function ThemePicker({ themes, value, onChange, noneLabel, noneHint, title = 'Your presentation title', subtitle = 'A one-line promise of what the audience gets', label = 'Theme' }: ThemePickerProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const previewSlide = useMemo<Slide>(() => {
    const slide = emptySlide('title');
    slide.slots.title = textBlock(title);
    slide.slots.subtitle = textBlock(subtitle);
    delete slide.slots.kicker;
    return slide;
  }, [subtitle, title]);

  const ids = useMemo(() => [...(noneLabel ? [''] : []), ...themes.map((theme) => theme.id)], [noneLabel, themes]);
  const selected = themes.find((theme) => theme.id === value) ?? null;
  const tabStop = ids.includes(value) ? value : ids[0];

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = Math.max(0, ids.indexOf(value));
    const next = ids[(index + step + ids.length) % ids.length];
    onChange(next);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };

  return (
    <div className="pr-themepick">
      <div className="pr-themepick__grid" role="radiogroup" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
        {noneLabel && (
          <button type="button" role="radio" aria-checked={value === ''} tabIndex={tabStop === '' ? 0 : -1} className="pr-themepick__card" data-active={value === '' || undefined} onClick={() => onChange('')}>
            <span className="pr-themepick__none" style={{ width: CARD_WIDTH }}>
              <Swatches size={26} weight="duotone" />
              <span>{noneHint}</span>
            </span>
            <span className="pr-themepick__name"><strong>{noneLabel}</strong></span>
            {value === '' && <span className="pr-theme-card__check"><Check size={12} weight="bold" /></span>}
          </button>
        )}
        {themes.map((theme) => {
          const active = theme.id === value;
          return (
            <button key={theme.id} type="button" role="radio" aria-checked={active} tabIndex={tabStop === theme.id ? 0 : -1} className="pr-themepick__card" data-active={active || undefined} onClick={() => onChange(theme.id)} title={theme.tagline}>
              <SlideRenderer context={{ theme, size: '16:9', showNumbers: false }} slide={previewSlide} index={0} width={CARD_WIDTH} resolveImage={noImage} />
              <span className="pr-themepick__name">
                <strong>{theme.name}</strong>
                <span className="pr-theme-card__swatches" aria-hidden="true">
                  {[theme.palette.accent1, theme.palette.accent2, theme.palette.accent3].map((color, index) => <i key={index} style={{ background: color }} />)}
                </span>
              </span>
              {active && <span className="pr-theme-card__check"><Check size={12} weight="bold" /></span>}
            </button>
          );
        })}
      </div>
      <p className="pr-themepick__detail" aria-live="polite">
        {selected
          ? <><strong>{selected.name}</strong> · {selected.tagline} <span>{selected.headingFont} / {selected.bodyFont}</span></>
          : noneHint ?? ''}
      </p>
    </div>
  );
}
