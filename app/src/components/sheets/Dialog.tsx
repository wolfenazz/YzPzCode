import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  /** Called when Enter is pressed outside a multi-line field. */
  onEnter?: () => void;
}

/** A modal panel over the studio. Escape closes it; focus starts inside. */
export const Dialog: React.FC<DialogProps> = ({ title, onClose, children, footer, width = 460, onEnter }) => {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const target = root.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]), select, textarea');
    target?.focus();
    return () => previous?.focus?.();
  }, []);
  return createPortal(
    <div
      className="sh-dialog"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={root}
        className="sh-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        data-keep-edit
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
          else if (event.key === 'Enter' && onEnter && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLButtonElement)) {
            event.preventDefault();
            onEnter();
          }
        }}
      >
        <header className="sh-dialog__head">
          <h2>{title}</h2>
          <button type="button" className="sh-dialog__close" aria-label="Close" onClick={onClose}><X size={14} /></button>
        </header>
        <div className="sh-dialog__body">{children}</div>
        {footer && <footer className="sh-dialog__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
};

export const FieldRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="sh-field">
    <span className="sh-field__label">{label}{hint && <span className="sh-field__hint"> {hint}</span>}</span>
    {children}
  </label>
);

export const CheckRow: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="sh-check">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span>{label}</span>
  </label>
);

export const DialogButtons: React.FC<{ primary: string; onPrimary: () => void; onCancel: () => void; disabled?: boolean; secondary?: React.ReactNode }> = ({ primary, onPrimary, onCancel, disabled, secondary }) => (
  <>
    <span className="sh-dialog__spacer">{secondary}</span>
    <button type="button" className="sx-btn" onClick={onCancel}>Cancel</button>
    <button type="button" className="sx-btn sx-btn--primary" disabled={disabled} onClick={onPrimary}>{primary}</button>
  </>
);
