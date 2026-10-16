// The side panel's building blocks, shared by the Writing, Presentation and
// Sheets studios: tabs, titled sections, label/control fields, a prompt box and a
// quiet action list. Everything is a plain element with an `sx-*` class, so a
// panel reads as markup rather than as a pile of one-off styles.
import React, { useState } from 'react';
import { CaretRight, CaretUpDown } from '@phosphor-icons/react';
import './studio.css';
import { LiquidSlider } from '../common/LiquidSlider';
import PromptBar, { type PromptBarSource } from '../reactbits/PromptBar';

interface InspectorProps {
  label: string;
  side?: 'left' | 'right';
  width?: number;
  children: React.ReactNode;
}

export const Inspector: React.FC<InspectorProps> = ({ label, side = 'right', width, children }) => (
  <aside className="sx-inspector" data-side={side} aria-label={label} style={width ? { width } : undefined}>{children}</aside>
);

export interface InspectorTab<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

export function InspectorTabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<InspectorTab<T>>; value: T; onChange: (id: T) => void; label: string }): React.JSX.Element {
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === value));
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    let next = activeIndex;
    if (event.key === 'ArrowRight') next = (activeIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (activeIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    const target = tabs[next];
    if (target && target.id !== value) onChange(target.id);
    requestAnimationFrame(() => {
      (event.currentTarget.querySelector(`#sx-tab-${String(tabs[next]?.id)}`) as HTMLElement | null)?.focus();
    });
  };
  return (
    <div className="sx-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={`sx-tab-${tab.id}`}
          type="button"
          role="tab"
          className="sx-tab"
          aria-selected={value === tab.id}
          aria-controls={`sx-panel-${tab.id}`}
          tabIndex={index === activeIndex ? 0 : -1}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The scrolling body under the tabs. */
export const InspectorBody: React.FC<{ children: React.ReactNode; id?: string; labelledBy?: string }> = ({ children, id, labelledBy }) => (
  <div className="sx-scroll" role="tabpanel" id={id} aria-labelledby={labelledBy} tabIndex={0}>{children}</div>
);

/** A plain heading row for a panel without tabs (the outline, the filmstrip). */
export const InspectorHead: React.FC<{ title: string; count?: React.ReactNode; children?: React.ReactNode }> = ({ title, count, children }) => (
  <div className="sx-head">
    <span>{title}{count !== undefined && <span className="sx-head__count"> {count}</span>}</span>
    {children}
  </div>
);

interface SectionProps {
  title?: string;
  /** Something small at the right of the title: a count, a link, an icon button. */
  aside?: React.ReactNode;
  /** Makes the title a toggle; the section starts open or closed as given. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, aside, collapsible, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const shown = !collapsible || open;
  return (
    <section className={`sx-section${title ? '' : ' sx-section--bare'}`} data-open={shown}>
      {title && (collapsible ? (
        <button type="button" className="sx-section__head" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span className="sx-section__title">{title}</span>
          <span className="sx-section__aside">{aside}<CaretRight size={12} weight="bold" className="sx-section__caret" /></span>
        </button>
      ) : (
        <div className="sx-section__head">
          <h3 className="sx-section__title">{title}</h3>
          {aside && <span className="sx-section__aside">{aside}</span>}
        </div>
      ))}
      {shown && <div className="sx-section__body">{children}</div>}
    </section>
  );
};

export const Hint: React.FC<{ error?: boolean; children: React.ReactNode }> = ({ error, children }) => (
  <p className={`sx-hint${error ? ' sx-hint--error' : ''}`}>{children}</p>
);

/** A label with its control. */
export const Field: React.FC<{ label: string; stack?: boolean; children: React.ReactNode }> = ({ label, stack, children }) => (
  <label className={`sx-field${stack ? ' sx-field--stack' : ''}`}>
    <span>{label}</span>
    {children}
  </label>
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ children, ...props }) => (
  <span className="sx-select">
    <select {...props}>{children}</select>
    <CaretUpDown size={11} />
  </span>
);

/** Normalizes any stored colour to #rrggbb so the native picker never throws. */
function normalizeHexColor(value: string): string {
  const raw = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) return `#${raw.split('').map((c) => c + c).join('').toLowerCase()}`;
  return '#000000';
}

export const ColorInput: React.FC<{ value: string; label: string; onChange: (value: string) => void; text?: string }> = ({ value, label, onChange, text }) => {
  const safe = normalizeHexColor(value);
  return (
    <span className="sx-color">
      <input type="color" value={safe} aria-label={label} onChange={(event) => onChange(event.target.value)} />
      <code>{text ?? (safe === '#000000' && value.trim().toLowerCase() !== '#000000' ? value : safe.toUpperCase())}</code>
    </span>
  );
};

export const Toggle: React.FC<{ label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }> = ({ label, hint, checked, disabled, onChange }) => (
  <label className="sx-toggle">
    <span className="sx-toggle__text">
      <span>{label}</span>
      {hint && <span className="sx-toggle__hint">{hint}</span>}
    </span>
    <input type="checkbox" className="sx-switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
  </label>
);

export const Slider: React.FC<{ label: string; value: number; display?: string; min?: number; max?: number; step?: number; onChange: (value: number) => void }> = ({ label, value, display, min = 0, max = 100, step = 1, onChange }) => (
  <label className="sx-range">
    <span className="sx-range__head"><span>{label}</span>{display && <span className="sx-range__value">{display}</span>}</span>
    <LiquidSlider min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>
);

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string; icon?: React.ReactNode }>; onChange: (id: T) => void; label: string }): React.JSX.Element {
  return (
    <div className="sx-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={value === option.id} onClick={() => onChange(option.id)}>
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface PromptBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled?: boolean;
  /** Nothing to send to yet (no section or slide to act on). */
  blocked?: boolean;
  running?: boolean;
  onStop?: () => void;
  rows?: number;
}

/** No "+" sources in a panel: its attachments sit in the panel's own rows. */
const NO_SOURCES: PromptBarSource[] = [];

/**
 * Ask the AI for a change in a side panel: the React Bits prompt bar, the same
 * one the studios' home composers use. Enter sends, Shift+Enter breaks the line.
 * `rows` is kept for callers; the field grows with its text.
 */
export const PromptBox: React.FC<PromptBoxProps> = ({ value, onChange, onSubmit, placeholder, disabled, blocked, running, onStop }) => (
  <div className="sx-prompt" onKeyDown={(event) => event.stopPropagation()}>
    <PromptBar
      placeholder={placeholder}
      inputLabel={placeholder}
      sources={NO_SOURCES}
      commands={[]}
      models={[]}
      efforts={[]}
      draft={value}
      onDraftChange={onChange}
      busy={running}
      disabled={disabled}
      canSend={!disabled && !blocked && value.trim().length > 0}
      onSend={() => onSubmit()}
      onStop={onStop}
      width="100%"
      maxRows={6}
      radius={10}
      background="var(--sx-surface)"
      color="var(--sx-ink)"
      menuBackground="var(--sx-surface)"
      sparkColor="var(--accent)"
    />
  </div>
);

/** What an AI action will change: "Selected text · 12 words", "Section · Introduction". */
export const Target: React.FC<{ label?: string; value: string; empty?: boolean }> = ({ label = 'Applies to', value, empty }) => (
  <div className="sx-target" data-empty={empty || undefined}>
    <span className="sx-target__label">{label}</span>
    <span className="sx-target__value" title={value}>{value}</span>
  </div>
);

export interface ActionItem {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

export const ActionList: React.FC<{ items: ActionItem[]; single?: boolean }> = ({ items, single }) => (
  <div className={`sx-actions${single ? ' sx-actions--single' : ''}`}>
    {items.map((item) => (
      <button key={item.id} type="button" className="sx-action" title={item.hint} disabled={item.disabled} onClick={item.onSelect}>
        {item.icon}
        <span>{item.label}</span>
      </button>
    ))}
  </div>
);

export const Facts: React.FC<{ items: Array<[string, React.ReactNode]>; stack?: boolean }> = ({ items, stack }) => (
  <dl className={`sx-facts${stack ? ' sx-facts--stack' : ''}`}>
    {items.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}
  </dl>
);
