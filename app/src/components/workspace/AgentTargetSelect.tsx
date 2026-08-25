import React, { useEffect, useRef, useState } from 'react';
import { CaretDown, Check, TerminalWindow } from '@phosphor-icons/react';
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

export const AgentTargetSelect: React.FC<AgentTargetSelectProps> = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const selected = options.find((option) => option.id === value) ?? null;
  const selectedLogo = selected ? optionLogo(selected) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2.5 py-2 text-left text-[11px] text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--accent-border)] cursor-pointer"
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
        <span className="min-w-0 flex-1 truncate">
          {selected ? selected.label : options.length === 0 ? 'no session' : 'select agent…'}
        </span>
        <CaretDown
          size={16}
          className={`shrink-0 text-[var(--text-secondary)]/60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] py-1 shadow-lg shadow-black/25 backdrop-blur-md">
          {options.length === 0 && (
            <div className="px-2.5 py-2 text-[10px] text-[var(--text-secondary)]/50">no agent sessions available</div>
          )}
          {options.map((option) => {
            const logo = optionLogo(option);
            const isSelected = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--accent-light)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {logo ? (
                    <img
                      src={logo}
                      alt={option.kind === 'yzpz' ? 'YZPZ Agent' : option.agent ?? 'terminal'}
                      className="h-4 w-4 object-contain"
                    />
                  ) : (
                    <TerminalWindow size={16} className="text-[var(--text-secondary)]/60" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected && (
                  <Check size={14} weight="bold" className="shrink-0 text-[var(--accent)]" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
