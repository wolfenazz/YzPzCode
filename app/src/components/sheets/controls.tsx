import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, Check } from '@phosphor-icons/react';

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

interface DropdownProps {
  label: React.ReactNode;
  title: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  width?: number;
  caret?: boolean;
  className?: string;
  children: (close: () => void) => React.ReactNode;
}

/** A button that opens a menu. Opening never takes focus away from the grid. */
export const Dropdown: React.FC<DropdownProps> = ({ label, title, disabled, align = 'left', width, caret = true, className = 'sh-tool', children }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
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

  const toggle = (): void => {
    if (!open && button.current) {
      const rect = button.current.getBoundingClientRect();
      const menuWidth = width ?? 200;
      const left = align === 'right' ? Math.max(8, rect.right - menuWidth) : Math.min(rect.left, window.innerWidth - menuWidth - 8);
      setPosition({ left, top: rect.bottom + 4 });
    }
    setOpen((value) => !value);
  };

  return (
    <div className="sh-dd" ref={root}>
      <button
        ref={button}
        type="button"
        className={`${className}${open ? ' is-open' : ''}`}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        {label}
        {caret && <CaretDown size={9} weight="bold" className="sh-dd__caret" />}
      </button>
      {open && position && createPortal(
        <div
          ref={menu}
          className="sh-menu"
          role="menu"
          style={{ left: position.left, top: position.top, width }}
          onMouseDown={(event) => { if (!isTextField(event.target)) event.preventDefault(); }}
        >
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </div>
  );
};

export const MenuItem: React.FC<{
  icon?: React.ReactNode;
  label: React.ReactNode;
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}> = ({ icon, label, hint, checked, disabled, danger, onSelect }) => (
  <button type="button" role="menuitem" className={`sh-menu__item${danger ? ' is-danger' : ''}`} disabled={disabled} onClick={onSelect}>
    <span className="sh-menu__icon">{checked ? <Check size={13} weight="bold" /> : icon}</span>
    <span className="sh-menu__label">{label}</span>
    {hint && <span className="sh-menu__hint">{hint}</span>}
  </button>
);

export const MenuLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="sh-menu__section">{children}</div>;
export const MenuSep: React.FC = () => <div className="sh-menu__sep" role="separator" />;

/** An icon button of the ribbon. */
export const ToolButton: React.FC<{
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}> = ({ icon, title, active, disabled, onClick, label }) => (
  <button
    type="button"
    className={`sh-tool${active ? ' is-active' : ''}${label ? ' sh-tool--labelled' : ''}`}
    title={title}
    aria-label={title}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
  >
    {icon}
    {label && <span>{label}</span>}
  </button>
);

export const ToolSeparator: React.FC = () => <span className="sh-tools__sep" aria-hidden="true" />;

const PALETTE = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
];

/** A colour picker menu: a palette, "no colour" and a custom value. */
export const ColorMenu: React.FC<{ value?: string; none?: string; onPick: (color: string | null) => void; close: () => void }> = ({ value, none = 'No colour', onPick, close }) => {
  const [custom, setCustom] = useState(value ?? '#3b82f6');
  return (
    <div className="sh-colors">
      <button type="button" className="sh-colors__none" onClick={() => { onPick(null); close(); }}>{none}</button>
      <div className="sh-colors__grid">
        {PALETTE.flat().map((color) => (
          <button
            key={color}
            type="button"
            className="sh-colors__swatch"
            aria-label={color}
            aria-pressed={value?.toLowerCase() === color}
            style={{ background: color }}
            onClick={() => { onPick(color.toUpperCase()); close(); }}
          />
        ))}
      </div>
      <label className="sh-colors__custom">
        <span>Custom</span>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(custom) ? custom : '#3b82f6'} onChange={(event) => setCustom(event.target.value)} />
        <button type="button" onClick={() => { onPick(custom.toUpperCase()); close(); }}>Apply</button>
      </label>
    </div>
  );
};

/** A short message at the bottom of the studio that goes away by itself. */
export const SheetsToast: React.FC<{ message: { text: string; kind: 'info' | 'error' } | null; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onClose, message.kind === 'error' ? 7000 : 3500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className={`sh-toast sh-toast--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
      <span>{message.text}</span>
      <button type="button" aria-label="Dismiss" onClick={onClose}>×</button>
    </div>
  );
};
