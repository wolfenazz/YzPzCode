import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface AgentSelectOption {
  value: string;
  label: string;
}

interface AgentSelectProps {
  value: string;
  options: AgentSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

interface PopupCoords {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

const GAP = 6;
const LIST_MAX = 224;

export const AgentSelect: React.FC<AgentSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [coords, setCoords] = useState<PopupCoords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const tokens = q.split(/\s+/);
    const scored: { opt: AgentSelectOption; score: number }[] = [];
    for (const opt of options) {
      const label = opt.label.toLowerCase();
      if (!tokens.every((t) => label.includes(t))) continue;
      let score = 0;
      for (const t of tokens) {
        if (label.startsWith(t)) score += 3;
        else score += 1;
        score += Math.max(0, 10 - label.indexOf(t)) * 0.1;
      }
      scored.push({ opt, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.opt);
  }, [options, query]);

  const openMenu = useCallback(
    (initialQuery = '') => {
      if (disabled) return;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - GAP;
      const above = rect.top - GAP;
      const flip = below < 96 && above > below;
      const maxHeight = Math.max(64, Math.min(LIST_MAX, flip ? above : below));
      setCoords(
        flip
          ? { bottom: window.innerHeight - rect.top + GAP, left: rect.left, width: rect.width, maxHeight }
          : { top: rect.bottom + GAP, left: rect.left, width: rect.width, maxHeight },
      );
      setQuery(initialQuery);
      setActive(initialQuery ? 0 : options.findIndex((o) => o.value === value));
      setOpen(true);
    },
    [disabled, options, value],
  );

  const selectAt = useCallback(
    (opt: AgentSelectOption | undefined) => {
      if (opt) onChange(opt.value);
      setOpen(false);
    },
    [onChange],
  );

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = (e: Event) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onClose = () => setOpen(false);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onGlobalKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onGlobalKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && query.trim() === '') setActive(options.findIndex((o) => o.value === value));
  }, [open, options, query, value]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
  }, [open]);

  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        openMenu(e.key);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % Math.max(filtered.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? Math.max(filtered.length - 1, 0) : a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectAt(filtered[active >= 0 && active < filtered.length ? active : 0]);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.key === 'ArrowDown') setActive((a) => (a + 1) % Math.max(filtered.length, 1));
      else setActive((a) => (a <= 0 ? Math.max(filtered.length - 1, 0) : a - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      selectAt(filtered[active >= 0 && active < filtered.length ? active : 0]);
      return;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (query) setQuery('');
      else setOpen(false);
      return;
    }
    if (e.key === 'Tab') setOpen(false);
  };

  const renderLabel = (label: string): React.ReactNode => {
    const q = query.trim().toLowerCase();
    if (!q) return label;
    const lower = label.toLowerCase();
    const parts: { text: string; hit: boolean }[] = [];
    let i = 0;
    while (i < label.length) {
      const idx = lower.indexOf(q, i);
      if (idx === -1) {
        parts.push({ text: label.slice(i), hit: false });
        break;
      }
      if (idx > i) parts.push({ text: label.slice(i, idx), hit: false });
      parts.push({ text: label.slice(idx, idx + q.length), hit: true });
      i = idx + q.length;
    }
    return parts.map((p, k) =>
      p.hit ? (
        <span key={k} className="text-[var(--accent)] font-bold">
          {p.text}
        </span>
      ) : (
        <span key={k}>{p.text}</span>
      ),
    );
  };

  return (
    <div className="relative">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full h-9 rounded-md border px-2.5 text-[11px] flex items-center justify-between gap-2 transition-colors duration-100 ${
          open
            ? 'border-[var(--accent-border)] bg-[var(--bg-main)]'
            : 'border-[var(--border-primary)] bg-[var(--bg-main)] hover:border-[var(--border-primary)]/70'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`truncate ${selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]/50'}`}
          title={selected?.label}
        >
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`w-3 h-3 flex-shrink-0 text-[var(--text-secondary)] transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popupRef}
            role="listbox"
            style={{
              position: 'fixed',
              zIndex: 10000,
              left: coords.left,
              width: coords.width,
              top: coords.top,
              bottom: coords.bottom,
            }}
            className="font-mono premium-menu overflow-hidden"
          >
            <div className="flex items-center gap-2 px-2.5 h-8 border-b border-[var(--border-primary)] bg-[var(--bg-main)]">
              <svg className="w-3 h-3 flex-shrink-0 text-[var(--text-secondary)]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                spellCheck={false}
                className="premium-input flex-1 min-w-0 h-full px-1.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/40"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="flex items-center justify-center w-4 h-4 rounded-sm text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {query && (
                <span className="flex-shrink-0 text-[9px] text-[var(--text-secondary)]/50">
                  {filtered.length}
                </span>
              )}
            </div>
            <div
              className="max-h-56 overflow-y-auto custom-scrollbar premium-scrollbar py-1"
              style={{ maxHeight: Math.max(0, coords.maxHeight - 32) }}
            >
              {filtered.length === 0 && (
                <div className="px-2.5 py-2 text-[10px] text-[var(--text-secondary)]/50">
                  {query ? 'No results' : 'No options'}
                </div>
              )}
              {filtered.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isActive = idx === active;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    ref={isActive ? activeRef : undefined}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => selectAt(opt)}
                    className={`premium-menu-item w-full text-left px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2 transition-colors duration-75 cursor-pointer ${
                      isActive
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/60 hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="truncate" title={opt.label}>
                      {renderLabel(opt.label)}
                    </span>
                    {isSelected && (
                      <svg
                        className="w-3 h-3 flex-shrink-0 text-[var(--accent)]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
