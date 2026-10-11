// Small, quiet building blocks for the Writing studio: a dropdown menu that
// keeps the editor selection, the engine fields, and a toast.
import React, { useEffect, useRef, useState } from 'react';
import { CaretDown, Check, X } from '@phosphor-icons/react';
import { usePresentationStore } from '../../stores/presentationStore';
import { listWritingEngines, type WritingEngineInfo } from '../../utils/writing/aiClient';
import { useEngineModels } from '../../utils/writing/useEngineModels';
import type { EngineChoice, WritingEngineId } from '../../utils/writing/types';
import { Field, Hint, Select, Toggle } from '../studio/Inspector';
import { EffortSelect, hasEfforts } from './EffortSelect';
import { ModelInput } from './ModelInput';

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

interface DropdownProps {
  label: React.ReactNode;
  title?: string;
  /** Class of the trigger button. */
  className?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  width?: number;
  caret?: boolean;
  children: (close: () => void) => React.ReactNode;
}

/** A button that opens a menu. Clicks inside never take focus from the editor. */
export const Dropdown: React.FC<DropdownProps> = ({ label, title, className = 'wr-tb', disabled, align = 'left', width, caret = true, children }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="wr-dd" ref={root}>
      <button
        type="button"
        className={`${className}${open ? ' is-open' : ''}`}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        {caret && <CaretDown size={10} weight="bold" className="wr-dd__caret" />}
      </button>
      {open && (
        <div
          className={`wr-dd__menu${align === 'right' ? ' is-right' : ''}`}
          role="menu"
          style={width ? { width } : undefined}
          onMouseDown={(event) => { if (!isTextField(event.target)) event.preventDefault(); }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

export const MenuItem: React.FC<{
  icon?: React.ReactNode;
  label: React.ReactNode;
  hint?: React.ReactNode;
  checked?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  onSelect: () => void;
}> = ({ icon, label, hint, checked, disabled, style, onSelect }) => (
  <button type="button" role="menuitem" className={`wr-dd__item${checked ? ' is-checked' : ''}`} disabled={disabled} onClick={onSelect}>
    <span className="wr-dd__icon">{icon ?? (checked ? <Check size={13} weight="bold" /> : null)}</span>
    <span className="wr-dd__label" style={style}>{label}</span>
    {hint && <span className="wr-dd__hint">{hint}</span>}
  </button>
);

export const MenuLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="wr-dd__section">{children}</div>;
export const MenuSep: React.FC = () => <div className="wr-dd__sep" role="separator" />;

/** Engine, model and thinking effort, laid out as compact rows. */
export const EngineFields: React.FC<{ value: EngineChoice; onChange: (value: EngineChoice) => void }> = ({ value, onChange }) => {
  const [engines, setEngines] = useState<WritingEngineInfo[] | null>(null);
  useEffect(() => {
    let alive = true;
    listWritingEngines().then((list) => { if (alive) setEngines(list); }).catch(() => { if (alive) setEngines([]); });
    return () => { alive = false; };
  }, []);
  const selected = engines?.find((engine) => engine.engine === value.engine);
  const { models, loading } = useEngineModels(value.engine, Boolean(selected?.installed));
  return (
    <>
      <Field label="Writer">
        <Select value={value.engine} onChange={(event) => onChange({ ...value, engine: event.target.value as WritingEngineId, model: '', effort: '' })}>
          {(engines ?? [{ engine: value.engine, displayName: value.engine, installed: true } as WritingEngineInfo]).map((engine) => (
            <option key={engine.engine} value={engine.engine} disabled={!engine.installed}>
              {engine.displayName}{engine.installed ? '' : ' (not installed)'}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Model">
        <ModelInput className="sx-input" value={value.model} onChange={(model) => onChange({ ...value, model })} models={models} loading={loading} placeholder="CLI default" />
      </Field>
      {hasEfforts(models, value.model) && (
        <Field label="Thinking">
          <EffortSelect className="sx-input" value={value.effort ?? ''} onChange={(effort) => onChange({ ...value, effort })} models={models} model={value.model} />
        </Field>
      )}
      {selected && !selected.installed && <Hint error>{selected.displayName} is not installed. Install it from Settings → Agents, or pick another writer.</Hint>}
    </>
  );
};

/** Whether the writer may put real photos from the web into the report. */
export const WebPhotosToggle: React.FC<{ value: boolean; onChange: (value: boolean) => void }> = ({ value, onChange }) => {
  const provider = usePresentationStore((state) => state.stockProvider);
  const keys = usePresentationStore((state) => state.stockKeys);
  const service = provider === 'off' ? null
    : provider === 'ai' ? 'the writer searches the web'
      : provider === 'openverse' || !keys[provider] ? 'Openverse' : provider === 'unsplash' ? 'Unsplash' : 'Pexels';
  return (
    <Toggle
      label="Photos from the web"
      hint={service ? `Where they help · ${service}` : 'Off in Settings → Presentation → Images'}
      checked={Boolean(service) && value}
      disabled={!service}
      onChange={onChange}
    />
  );
};

export interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

/** One quiet message at the bottom of the page; it leaves after a few seconds. */
export const Toast: React.FC<{ toast: ToastMessage | null; onClose: () => void }> = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onClose, toast.action ? 7000 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div key={toast.id} className="wr-toast" role="status" aria-live="polite">
      <span>{toast.text}</span>
      {toast.action && (
        <button type="button" className="wr-toast__action" onClick={() => { toast.action!.run(); onClose(); }}>{toast.action.label}</button>
      )}
      <button type="button" className="wr-toast__close" aria-label="Dismiss" onClick={onClose}><X size={12} /></button>
    </div>
  );
};

export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return total >= 60 ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` : `0:${String(total).padStart(2, '0')}`;
}

export function relativeTime(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
