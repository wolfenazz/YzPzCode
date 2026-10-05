import type { ReactNode } from 'react';

interface EditorActionButtonProps {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

export function EditorActionButton({ label, children, onClick, active, disabled }: EditorActionButtonProps): ReactNode {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
    onClick={onClick}
    className={`inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded px-2 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-35 disabled:cursor-default ${active ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'}`}>
    {children}
  </button>;
}
