import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, Check, MagnifyingGlass, TerminalWindow, X } from '@phosphor-icons/react';
import { createPortal } from 'react-dom';
import type { CliType } from '../../types';
import claudeLogo from '../../assets/claude.png';
import codexLogo from '../../assets/codex.png';
import geminiLogo from '../../assets/gemini-cli-logo.svg';
import opencodeLogo from '../../assets/opencode.png';
import cursorLogo from '../../assets/cursor-ai.png';
import kiloLogo from '../../assets/kiloCode.gif';
import hermesLogo from '../../assets/Hermes-logo.png';
import piLogo from '../../assets/pi.svg';
import grokLogo from '../../assets/Grok.png';
import yzpzLogo from '../../assets/YzPzCodeLogo.png';

export interface AgentTargetOption {
  id: string;
  label: string;
  agent: CliType | null;
  /** 'terminal' = a TTY/CLI agent session, 'yzpz' = a built-in YZPZ Agent session. */
  kind?: 'terminal' | 'yzpz';
}

const AGENT_LOGO: Record<string, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  gemini: geminiLogo,
  opencode: opencodeLogo,
  cursor: cursorLogo,
  kilo: kiloLogo,
  hermes: hermesLogo,
  pi: piLogo,
  grok: grokLogo,
};

const optionLogo = (option: AgentTargetOption): string | null => {
  if (option.kind === 'yzpz') return yzpzLogo;
  return option.agent ? AGENT_LOGO[option.agent] : null;
};

interface AgentTargetSelectProps {
  value: string;
  options: AgentTargetOption[];
  onChange: (sessionId: string | null) => void;
}

interface PopupCoords {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

const POPUP_GAP = 6;
const POPUP_MAX_HEIGHT = 360;
const POPUP_MIN_HEIGHT = 120;
const SEARCH_ROW_HEIGHT = 34;

export const AgentTargetSelect: React.FC<AgentTargetSelectProps> = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [coords, setCoords] = useState<PopupCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleResize = () => setOpen(false);

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  const selected = options.find((option) => option.id === value) ?? null;
  const selectedLogo = selected ? optionLogo(selected) : null;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;

    const queryTokens = normalizedQuery.split(/\s+/);
    return options.filter((option) => {
      const searchableLabel = option.label.toLowerCase();
      return queryTokens.every((token) => searchableLabel.includes(token));
    });
  }, [options, query]);

  const openMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const availableBelow = window.innerHeight - rect.bottom - POPUP_GAP;
    const availableAbove = rect.top - POPUP_GAP;
    const openAbove = availableBelow < POPUP_MIN_HEIGHT && availableAbove > availableBelow;
    const availableSpace = openAbove ? availableAbove : availableBelow;
    const maxHeight = Math.max(POPUP_MIN_HEIGHT, Math.min(POPUP_MAX_HEIGHT, availableSpace));

    setCoords(
      openAbove
        ? {
            bottom: window.innerHeight - rect.top + POPUP_GAP,
            left: rect.left,
            width: rect.width,
            maxHeight,
          }
        : { top: rect.bottom + POPUP_GAP, left: rect.left, width: rect.width, maxHeight },
    );
    setQuery('');
    setActiveIndex(Math.max(options.findIndex((option) => option.id === value), 0));
    setOpen(true);
  }, [options, value]);

  const selectOption = useCallback(
    (option: AgentTargetOption | undefined) => {
      if (option) onChange(option.id);
      setOpen(false);
    },
    [onChange],
  );

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filteredOptions.findIndex((option) => option.id === value);
    setActiveIndex((current) => {
      if (current >= 0 && current < filteredOptions.length) return current;
      return selectedIndex;
    });
  }, [filteredOptions, open, value]);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus({ preventScroll: true });
      activeOptionRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [open]);

  useEffect(() => {
    if (open) activeOptionRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const moveActive = useCallback(
    (direction: 1 | -1) => {
      if (filteredOptions.length === 0) return;
      setActiveIndex((current) => {
        const start = current < 0 ? (direction === 1 ? -1 : 0) : current;
        return (start + direction + filteredOptions.length) % filteredOptions.length;
      });
    },
    [filteredOptions.length],
  );

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectOption(filteredOptions[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectOption(filteredOptions[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      if (query) setQuery('');
      else setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] text-[var(--text-primary)] outline-none transition-colors cursor-pointer ${
          open
            ? 'border-[var(--accent-border)] bg-[var(--bg-primary)]'
            : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:border-[var(--accent-border)]'
        }`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {selectedLogo ? (
            <img
              src={selectedLogo}
              alt={selected?.kind === 'yzpz' ? 'YZPZ Agent' : selected?.agent ?? 'terminal'}
              className="h-4 w-4 object-contain"
            />
          ) : (
            <TerminalWindow size={16} className="text-[var(--text-secondary)]/60" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate" title={selected?.label}>
          {selected ? selected.label : options.length === 0 ? 'no session' : 'select agent…'}
        </span>
        <CaretDown
          size={16}
          className={`shrink-0 text-[var(--text-secondary)]/60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popupRef}
            role="listbox"
            aria-label="Target agent sessions"
            style={{
              position: 'fixed',
              zIndex: 10000,
              left: coords.left,
              width: coords.width,
              top: coords.top,
              bottom: coords.bottom,
            }}
            className="premium-menu overflow-hidden"
          >
            <div className="flex h-[34px] items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5">
              <MagnifyingGlass size={12} className="shrink-0 text-[var(--text-secondary)]/60" aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search open agents…"
                spellCheck={false}
                aria-label="Search open agents"
                className="premium-input h-full min-w-0 flex-1 px-1.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/40"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear agent search"
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[var(--text-secondary)]/60 transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X size={10} aria-hidden="true" />
                </button>
              ) : (
                <span className="shrink-0 text-[9px] text-[var(--text-secondary)]/50">{options.length}</span>
              )}
            </div>
            <div
              className="custom-scrollbar premium-scrollbar max-h-56 overflow-y-auto py-1"
              style={{ maxHeight: Math.max(0, coords.maxHeight - SEARCH_ROW_HEIGHT) }}
            >
              {filteredOptions.length === 0 && (
                <div className="px-2.5 py-2 text-[10px] text-[var(--text-secondary)]/50">
                  {query ? 'No matching agent sessions' : 'No agent sessions available'}
                </div>
              )}
              {filteredOptions.map((option, index) => {
                const logo = optionLogo(option);
                const isSelected = option.id === value;
                const isActive = index === activeIndex;

                return (
                  <button
                    key={option.id}
                    ref={isActive ? activeOptionRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                    className={`premium-menu-item flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/60 hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {logo ? (
                        <img src={logo} alt="" className="h-4 w-4 object-contain" />
                      ) : (
                        <TerminalWindow size={16} className="text-[var(--text-secondary)]/60" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={option.label}>
                      {option.label}
                    </span>
                    {isSelected && <Check size={14} weight="bold" className="shrink-0 text-[var(--accent)]" aria-hidden="true" />}
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
