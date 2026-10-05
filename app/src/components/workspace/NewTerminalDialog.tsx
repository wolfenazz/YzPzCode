import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '@iconify/react';
import {
  CaretDown,
  Check,
  MagnifyingGlass,
  TerminalWindow,
} from '@phosphor-icons/react';
import { AgentType, ToolCliType, CliType } from '../../types';
import claudeLogo from '../../assets/claude.png';
import codexLogo from '../../assets/codex.png';
import antigravityLogo from '../../assets/antigravity.png';
import opencodeLogo from '../../assets/opencode.png';
import cursorLogo from '../../assets/cursor-ai.png';
import kiloLogo from '../../assets/kiloCode.gif';
import hermesLogo from '../../assets/Hermes-logo.png';
import piLogo from '../../assets/pi.svg';
import commandCodeLogo from '../../assets/commandcode-logo.svg';
import clineLogo from '../../assets/cline.webp';
import grokLogo from '../../assets/Grok.png';
import { ADDITIONAL_AGENTS, ADDITIONAL_AGENT_TYPES, ADDITIONAL_AGENT_DESCRIPTIONS } from '../../data/additionalAgents';

interface AgentOption {
  type: AgentType;
  label: string;
  description: string;
  logo: string;
  color: string;
}

const AGENT_OPTIONS: AgentOption[] = [
  { type: 'claude', label: 'Claude Code', description: 'Anthropic CLI Orchestrator', logo: claudeLogo, color: '#D97757' },
  { type: 'codex', label: 'Codex CLI', description: 'OpenAI Intelligence Engine', logo: codexLogo, color: '#10A37F' },
  { type: 'antigravity', label: 'Antigravity CLI', description: 'Google Antigravity Agent', logo: antigravityLogo, color: '#557FF0' },
  { type: 'opencode', label: 'OpenCode', description: 'Open Source Autonomy', logo: opencodeLogo, color: '#FFFFFF' },
  { type: 'cursor', label: 'Cursor Agent', description: 'Contextual AI Environment', logo: cursorLogo, color: '#3178C6' },
  { type: 'kilo', label: 'Kilo Code', description: 'Lightweight AI Developer', logo: kiloLogo, color: '#8B5CF6' },
  { type: 'hermes', label: 'Hermes Agent', description: 'NousResearch Autonomous Agent', logo: hermesLogo, color: '#F59E0B' },
  { type: 'pi', label: 'Pi Agent', description: 'Minimal Terminal Coding Harness', logo: piLogo, color: '#FFFFFF' },
  { type: 'commandcode', label: 'Command Code', description: 'Taste-Aware Coding Agent', logo: commandCodeLogo, color: '#FFFFFF' },
  { type: 'cline', label: 'Cline CLI', description: 'Agentic TUI with headless automation', logo: clineLogo, color: '#0EA5E9' },
  { type: 'grok', label: 'Grok CLI', description: 'xAI Agentic Coding Assistant', logo: grokLogo, color: '#A1A1AA' },
  ...ADDITIONAL_AGENT_TYPES.map((type) => ({ type, ...ADDITIONAL_AGENTS[type] })),
];

const AGENT_CAPABILITIES: Record<AgentType, string> = {
  claude: 'Code generation, refactoring, debugging, and complex task orchestration via Anthropic Claude models.',
  codex: 'OpenAI-powered coding assistant with deep code understanding. Specializes in code completion and generation.',
  antigravity: "Google's AI-first agentic coding CLI with autonomous workflows, subagent leasing, and deep context management.",
  opencode: 'Fully open-source AI coding agent. Transparent, customizable. Supports multiple model backends.',
  cursor: 'IDE-integrated AI agent with deep codebase awareness. Context-aware suggestions and multi-file edits.',
  kilo: 'Lightweight, fast AI coding assistant optimized for quick tasks. Lower resource usage.',
  hermes: 'NousResearch autonomous AI agent with tool use, messaging integration, and browser automation.',
  pi: 'Minimal terminal coding harness with TypeScript extensions, skills, prompt templates, and pi packages. Supports Claude, OpenAI, Google, and 20+ providers.',
  commandcode: 'Agentic coding CLI that learns your preferences (package managers, libraries, structure) into a taste profile applied across all sessions.',
  cline: 'Agentic coding CLI with an interactive TUI and headless automation. Supports multiple model providers.',
  grok: 'xAI\'s agentic coding assistant. Interactive shell, headless single-prompt mode, streaming JSON output, and ACP for IDE/tool integration.',
  ...ADDITIONAL_AGENT_DESCRIPTIONS,
};

const TOOL_OPTIONS: { type: ToolCliType; label: string; description: string; icon: string; color: string }[] = [
  { type: 'gh', label: 'GitHub CLI', description: 'Repos, PRs, issues', icon: 'simple-icons:github', color: '#ffffff' },
  { type: 'stripe', label: 'Stripe CLI', description: 'Payments, webhooks', icon: 'simple-icons:stripe', color: '#635BFF' },
  { type: 'supabase', label: 'Supabase CLI', description: 'Database, local stack', icon: 'simple-icons:supabase', color: '#3FCF8E' },
  { type: 'vercel', label: 'Vercel CLI', description: 'Deploy, cloud mgmt', icon: 'simple-icons:vercel', color: '#ffffff' },
  { type: 'elevenlabs', label: 'ElevenLabs CLI', description: 'TTS, voice agents', icon: 'simple-icons:elevenlabs', color: '#8B5CF6' },
  { type: 'valyu', label: 'Valyu CLI', description: 'Search, data access', icon: 'simple-icons:search', color: '#F59E0B' },
  { type: 'posthog', label: 'PostHog CLI', description: 'Analytics, SQL', icon: 'simple-icons:posthog', color: '#1D4AFF' },
  { type: 'gws', label: 'Google Workspace', description: 'Gmail, Drive, Docs', icon: 'simple-icons:google', color: '#4285F4' },
  { type: 'ramp', label: 'Ramp CLI', description: 'Expense mgmt', icon: 'simple-icons:creditcard', color: '#1AE65E' },
  { type: 'agentmail', label: 'AgentMail CLI', description: 'Email for AI agents', icon: 'simple-icons:mailgun', color: '#EC4899' },
];

// Monochrome brand icons that would vanish on a dark/light surface; render them in the text colour instead.
const MONO_TOOL_COLORS = new Set(['#ffffff', '#000000']);

type CategoryFilter = 'all' | 'agents' | 'tools' | 'shell';

const CATEGORIES: { id: CategoryFilter; label: string; count: number }[] = [
  { id: 'all', label: 'All', count: AGENT_OPTIONS.length + TOOL_OPTIONS.length + 1 },
  { id: 'agents', label: 'Agents', count: AGENT_OPTIONS.length },
  { id: 'tools', label: 'Tools', count: TOOL_OPTIONS.length },
  { id: 'shell', label: 'Shell', count: 1 },
];

type SectionId = 'shell' | 'agents' | 'tools';

const SECTION_COLUMNS: Record<SectionId, number> = { shell: 1, agents: 2, tools: 2 };

interface PaletteItem {
  key: string;
  section: SectionId;
  indexInSection: number;
  cli: CliType | null;
  label: string;
  detail: string;
}

interface ShellOption {
  name: string;
  path: string;
  isAvailable: boolean;
}

interface NewTerminalDialogProps {
  onClose: () => void;
  onSelect: (agent: CliType | null, shell: string | null) => void;
}

const matches = (q: string, ...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));

export const NewTerminalDialog: React.FC<NewTerminalDialogProps> = ({ onClose, onSelect }) => {
  const [availableShells, setAvailableShells] = useState<ShellOption[]>([]);
  const [selectedShell, setSelectedShell] = useState<string | null>(null);
  const [showShellPicker, setShowShellPicker] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<ShellOption[]>('get_available_shells').then((shells) => {
      setAvailableShells(shells);
      const defaultShell = shells.find((s) => s.isAvailable);
      if (defaultShell) setSelectedShell(defaultShell.path);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const currentShellName = availableShells.find((s) => s.path === selectedShell)?.name || 'Default shell';

  const q = searchQuery.trim().toLowerCase();

  const filteredAgents = useMemo(() => {
    if (category === 'tools' || category === 'shell') return [];
    if (!q) return AGENT_OPTIONS;
    return AGENT_OPTIONS.filter((a) => matches(q, a.label, a.description, a.type));
  }, [category, q]);

  const filteredTools = useMemo(() => {
    if (category === 'agents' || category === 'shell') return [];
    if (!q) return TOOL_OPTIONS;
    return TOOL_OPTIONS.filter((t) => matches(q, t.label, t.description, t.type));
  }, [category, q]);

  const showShellSection =
    (category === 'all' || category === 'shell') &&
    (!q || matches(q, 'system shell', 'terminal', currentShellName));

  // Flat, visually-ordered list used for keyboard navigation.
  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];
    if (showShellSection) {
      list.push({
        key: 'shell',
        section: 'shell',
        indexInSection: 0,
        cli: null,
        label: 'System Shell',
        detail: `Plain terminal session using ${currentShellName}.`,
      });
    }
    filteredAgents.forEach((a, i) => list.push({
      key: `agent:${a.type}`,
      section: 'agents',
      indexInSection: i,
      cli: a.type,
      label: a.label,
      detail: AGENT_CAPABILITIES[a.type] ?? a.description,
    }));
    filteredTools.forEach((t, i) => list.push({
      key: `tool:${t.type}`,
      section: 'tools',
      indexInSection: i,
      cli: t.type,
      label: t.label,
      detail: t.description,
    }));
    return list;
  }, [showShellSection, filteredAgents, filteredTools, currentShellName]);

  // Reset highlight whenever the result set changes shape.
  useEffect(() => {
    setActiveIndex(0);
    listRef.current?.scrollTo({ top: 0 });
  }, [category, q]);

  const activeItem = items[Math.min(activeIndex, items.length - 1)];

  const launch = useCallback((cli: CliType | null) => {
    onSelect(cli, selectedShell);
  }, [onSelect, selectedShell]);

  const scrollActiveIntoView = (index: number) => {
    const key = items[index]?.key;
    if (!key) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  };

  const moveVertical = (dir: 1 | -1): number => {
    const cur = items[activeIndex];
    if (!cur) return 0;
    const sectionItems = items.filter((it) => it.section === cur.section);
    const cols = SECTION_COLUMNS[cur.section];
    const col = cur.indexInSection % cols;
    const target = sectionItems[cur.indexInSection + dir * cols];
    if (target) return items.indexOf(target);

    // Cross into the neighbouring section, keeping the column where possible.
    const sectionOrder = Array.from(new Set(items.map((it) => it.section)));
    const nextSection = sectionOrder[sectionOrder.indexOf(cur.section) + dir];
    if (!nextSection) return activeIndex;
    const nextItems = items.filter((it) => it.section === nextSection);
    const nextCols = SECTION_COLUMNS[nextSection];
    const nextCol = Math.min(col, nextCols - 1);
    let idx: number;
    if (dir === 1) {
      idx = Math.min(nextCol, nextItems.length - 1);
    } else {
      const lastRowStart = Math.floor((nextItems.length - 1) / nextCols) * nextCols;
      idx = Math.min(lastRowStart + nextCol, nextItems.length - 1);
    }
    return items.indexOf(nextItems[idx]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (showShellPicker) setShowShellPicker(false);
      else onClose();
      return;
    }
    if (showShellPicker || items.length === 0) return;

    let next: number | null = null;
    switch (e.key) {
      case 'ArrowDown': next = moveVertical(1); break;
      case 'ArrowUp': next = moveVertical(-1); break;
      case 'ArrowRight':
        if (activeItem && SECTION_COLUMNS[activeItem.section] > 1) next = Math.min(activeIndex + 1, items.length - 1);
        break;
      case 'ArrowLeft':
        if (activeItem && SECTION_COLUMNS[activeItem.section] > 1) next = Math.max(activeIndex - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeItem) launch(activeItem.cli);
        return;
      case 'Tab': {
        e.preventDefault();
        const i = CATEGORIES.findIndex((c) => c.id === category);
        const step = e.shiftKey ? -1 : 1;
        setCategory(CATEGORIES[(i + step + CATEGORIES.length) % CATEGORIES.length].id);
        return;
      }
      default:
        return;
    }
    if (next !== null) {
      e.preventDefault();
      setActiveIndex(next);
      scrollActiveIntoView(next);
    }
  };

  const indexOfKey = (key: string) => items.findIndex((it) => it.key === key);

  const rowProps = (key: string, cli: CliType | null) => {
    const index = indexOfKey(key);
    return {
      'data-key': key,
      role: 'option' as const,
      'aria-selected': index === activeIndex,
      className: `spawn-row ${index === activeIndex ? 'is-active' : ''}`,
      onMouseMove: () => { if (index !== activeIndex) setActiveIndex(index); },
      onClick: () => launch(cli),
    };
  };

  const sectionHeader = (title: string, count?: number) => (
    <div className="spawn-section-label">
      <span>{title}</span>
      {count !== undefined && <span className="spawn-section-count">{count}</span>}
    </div>
  );

  const activeLogo = (() => {
    if (!activeItem) return null;
    if (activeItem.section === 'shell') return <TerminalWindow size={12} weight="bold" />;
    if (activeItem.section === 'agents') {
      const a = AGENT_OPTIONS.find((o) => o.type === activeItem.cli);
      return a ? <img src={a.logo} alt="" className="h-full w-full object-contain" /> : null;
    }
    const t = TOOL_OPTIONS.find((o) => o.type === activeItem.cli);
    return t ? <Icon icon={t.icon} className="h-3 w-3" style={MONO_TOOL_COLORS.has(t.color.toLowerCase()) ? undefined : { color: t.color }} /> : null;
  })();

  const modalContent = (
    <div className="spawn-backdrop" onMouseDown={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New terminal session"
        className="spawn-window"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search */}
        <div className="spawn-search">
          <MagnifyingGlass size={16} className="spawn-search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Start a session with…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="spawn-search-input"
            aria-label="Search agents, tools and shells"
            aria-controls="spawn-results"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="button" onClick={onClose} className="spawn-kbd spawn-kbd--button" aria-label="Close dialog">
            esc
          </button>
        </div>

        {/* Categories */}
        <div className="spawn-tabs" role="tablist" aria-label="Filter categories">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              onClick={() => { setCategory(c.id); searchRef.current?.focus(); }}
              className={`spawn-tab ${category === c.id ? 'is-active' : ''}`}
            >
              {c.label}
              <span className="spawn-tab-count">{c.count}</span>
            </button>
          ))}
        </div>

        {/* Results */}
        <div ref={listRef} id="spawn-results" role="listbox" className="spawn-list">
          {showShellSection && (
            <section>
              {sectionHeader('Shell')}
              <div {...rowProps('shell', null)}>
                <div className="spawn-logo spawn-logo--shell">
                  <TerminalWindow size={15} weight="bold" />
                </div>
                <div className="spawn-row-text">
                  <span className="spawn-row-title">System Shell</span>
                  <span className="spawn-row-desc">Plain terminal, no agent attached</span>
                </div>

                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setShowShellPicker((v) => !v)}
                    className="spawn-shell-picker"
                    aria-haspopup="listbox"
                    aria-expanded={showShellPicker}
                  >
                    <span className="truncate">{currentShellName}</span>
                    <CaretDown size={10} weight="bold" className={`shrink-0 transition-transform ${showShellPicker ? 'rotate-180' : ''}`} />
                  </button>

                  {showShellPicker && (
                    <div className="spawn-shell-menu" role="listbox">
                      {availableShells.map((shell) => (
                        <button
                          key={shell.path}
                          type="button"
                          role="option"
                          aria-selected={selectedShell === shell.path}
                          disabled={!shell.isAvailable}
                          onClick={() => {
                            setSelectedShell(shell.path);
                            setShowShellPicker(false);
                            searchRef.current?.focus();
                          }}
                          className="spawn-shell-option"
                        >
                          <span className="truncate">{shell.name}</span>
                          {selectedShell === shell.path && <Check size={12} weight="bold" className="shrink-0" />}
                          {!shell.isAvailable && <span className="spawn-shell-na">Not found</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {filteredAgents.length > 0 && (
            <section>
              {sectionHeader('Agents', filteredAgents.length)}
              <div className="spawn-grid">
                {filteredAgents.map((agent) => (
                  <div key={agent.type} {...rowProps(`agent:${agent.type}`, agent.type)}>
                    <div className="spawn-logo">
                      <img src={agent.logo} alt="" className="h-full w-full object-contain" />
                    </div>
                    <div className="spawn-row-text">
                      <span className="spawn-row-title">{agent.label}</span>
                      <span className="spawn-row-desc">{agent.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {filteredTools.length > 0 && (
            <section>
              {sectionHeader('Tools', filteredTools.length)}
              <div className="spawn-grid">
                {filteredTools.map((tool) => (
                  <div key={tool.type} {...rowProps(`tool:${tool.type}`, tool.type)}>
                    <div className="spawn-logo">
                      <Icon
                        icon={tool.icon}
                        className="h-4 w-4"
                        style={MONO_TOOL_COLORS.has(tool.color.toLowerCase()) ? undefined : { color: tool.color }}
                      />
                    </div>
                    <div className="spawn-row-text">
                      <span className="spawn-row-title">{tool.label}</span>
                      <span className="spawn-row-desc">{tool.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {items.length === 0 && (
            <div className="spawn-empty">
              <p>No results for &ldquo;{searchQuery}&rdquo;</p>
              <button type="button" onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}>
                Clear search
              </button>
            </div>
          )}
        </div>

        {/* Footer: preview of the highlighted item + key hints */}
        <div className="spawn-footer">
          <div className="spawn-footer-preview" title={activeItem?.detail}>
            {activeItem && (
              <>
                <span className="spawn-footer-logo">{activeLogo}</span>
                <span className="spawn-footer-name">{activeItem.label}</span>
                <span className="spawn-footer-detail">{activeItem.detail}</span>
              </>
            )}
          </div>
          <div className="spawn-footer-keys" aria-hidden="true">
            <span><kbd className="spawn-kbd">↑↓</kbd> Move</span>
            <span><kbd className="spawn-kbd">tab</kbd> Filter</span>
            <span><kbd className="spawn-kbd">↵</kbd> Launch</span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
