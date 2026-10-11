// The side panel's building blocks, shared by the Writing and Presentation
// studios: tabs, titled sections, label/control fields, a prompt box and a
// quiet action list. Everything is a plain element with an `sx-*` class, so a
// panel reads as markup rather than as a pile of one-off styles.
import React, { useState } from 'react';
import { ArrowUp, CaretRight, CaretUpDown, Stop } from '@phosphor-icons/react';
import './studio.css';

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
  return (
    <div className="sx-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" className="sx-tab" aria-selected={value === tab.id} onClick={() => onChange(tab.id)}>
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The scrolling body under the tabs. */
export const InspectorBody: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="sx-scroll">{children}</div>;

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
          <h3 className="sx-section__title">{title}</h3>
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

export const ColorInput: React.FC<{ value: string; label: string; onChange: (value: string) => void; text?: string }> = ({ value, label, onChange, text }) => (
  <span className="sx-color">
    <input type="color" value={value} aria-label={label} onChange={(event) => onChange(event.target.value)} />
    <code>{text ?? value.toUpperCase()}</code>
  </span>
);

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
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
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

/** Ask the AI for a change: Enter sends, Shift+Enter breaks the line. */
export const PromptBox: React.FC<PromptBoxProps> = ({ value, onChange, onSubmit, placeholder, disabled, blocked, running, onStop, rows = 3 }) => (
  <div className="sx-prompt">
    <textarea
      className="sx-prompt__input"
      rows={rows}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (value.trim() && !disabled && !blocked) onSubmit();
        }
      }}
    />
    <div className="sx-prompt__foot">
      <span className="sx-prompt__keys">Enter to send</span>
      {running ? (
        <button type="button" className="sx-prompt__send" aria-label="Stop" onClick={onStop}><Stop size={11} weight="fill" /></button>
      ) : (
        <button type="button" className="sx-prompt__send" aria-label="Send" disabled={disabled || blocked || !value.trim()} onClick={onSubmit}><ArrowUp size={13} weight="bold" /></button>
      )}
    </div>
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
