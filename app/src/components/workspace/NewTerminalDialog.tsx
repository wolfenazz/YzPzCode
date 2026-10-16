import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '@iconify/react';
import {
  CaretDown,
  Check,
  MagnifyingGlass,
  Minus,
  Plus,
  Stack,
  TerminalWindow,
  X,
} from '@phosphor-icons/react';
import { AgentType, ToolCliType, CliType } from '../../types';
import { useAppStore } from '../../stores/appStore';
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
import jcodeLogo from '../../assets/jcode.svg';
import { ADDITIONAL_AGENTS, ADDITIONAL_AGENT_TYPES, ADDITIONAL_AGENT_DESCRIPTIONS } from '../../data/additionalAgents';
import type { LaunchSpec } from '../../utils/launchTerminals';

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
  { type: 'jcode', label: 'Jcode', description: 'High-Performance Rust Coding Agent', logo: jcodeLogo, color: '#FF6B35' },
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
  jcode: 'High-performance Rust coding agent harness with swarm collaboration, semantic memory, and multi-provider OAuth (Claude, OpenAI, Gemini, Copilot, and 20+ more).',
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
type SectionId = 'recents' | 'shell' | 'agents' | 'tools';

/** Items per row, used for both the grid layout and keyboard navigation. */
const SECTION_COLUMNS: Record<SectionId, number> = { recents: 3, shell: 1, agents: 3, tools: 3 };

const SECTION_TITLES: Record<SectionId, string> = {
  recents: 'Recently launched',
  shell: 'Shell',
  agents: 'Agents',
  tools: 'Tools',
};

/** A launch can carry several terminals; a single launch carries exactly one. */
export const MAX_LAUNCH_SESSIONS = 16;
const QUICK_COUNTS = [1, 2, 3, 4, 6, 8];
/** Distinct agents a single launch list can hold before it gets unreadable. */
const MAX_QUEUE_ENTRIES = 8;
const RECENTS_KEY = 'yzpzcode-launcher-recents';
const MAX_RECENTS = 4;

interface ShellOption {
  name: string;
  path: string;
  isAvailable: boolean;
}

/** A selectable entry, normalised so every section can share one renderer. */
interface Descriptor {
  key: string;
  section: 'shell' | 'agents' | 'tools';
  cli: CliType | null;
  label: string;
  detail: string;
  logo: React.ReactNode;
}

interface PaletteItem {
  key: string;
  section: SectionId;
  indexInSection: number;
  cli: CliType | null;
  label: string;
  detail: string;
}

interface QueueEntry {
  key: string;
  cli: CliType | null;
  label: string;
  count: number;
}

interface NewTerminalDialogProps {
  onClose: () => void;
  /**
   * Called once per launch action with every terminal to open. The dialog
   * closes itself through the parent, so a rejected promise keeps it usable.
   */
  onLaunch: (specs: LaunchSpec[]) => void | Promise<void>;
}

const matches = (q: string, ...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));

const loadRecents = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, MAX_RECENTS);
  } catch (error) {
    console.warn('Failed to load recent launches:', error);
    return [];
  }
};

const saveRecents = (keys: string[]) => {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(keys));
  } catch (error) {
    console.warn('Failed to persist recent launches:', error);
  }
};

export const NewTerminalDialog: React.FC<NewTerminalDialogProps> = ({ onClose, onLaunch }) => {
  const [availableShells, setAvailableShells] = useState<ShellOption[]>([]);
  const [selectedShell, setSelectedShell] = useState<string | null>(null);
  const [showShellPicker, setShowShellPicker] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [count, setCount] = useState(1);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [installedOnly, setInstalledOnly] = useState(false);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [launching, setLaunching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const cliStatuses = useAppStore((state) => state.cliStatuses);

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

  const shellDescriptor = useMemo<Descriptor>(() => ({
    key: 'shell',
    section: 'shell',
    cli: null,
    label: 'System Shell',
    detail: `Plain terminal session using ${currentShellName}.`,
    logo: <TerminalWindow size={15} weight="bold" />,
  }), [currentShellName]);

  const agentDescriptors = useMemo<Descriptor[]>(() => AGENT_OPTIONS.map((agent) => ({
    key: `agent:${agent.type}`,
    section: 'agents' as const,
    cli: agent.type,
    label: agent.label,
    detail: AGENT_CAPABILITIES[agent.type] ?? agent.description,
    logo: <img src={agent.logo} alt="" className="h-full w-full object-contain" />,
  })), []);

  const toolDescriptors = useMemo<Descriptor[]>(() => TOOL_OPTIONS.map((tool) => ({
    key: `tool:${tool.type}`,
    section: 'tools' as const,
    cli: tool.type,
    label: tool.label,
    detail: tool.description,
    logo: (
      <Icon
        icon={tool.icon}
        className="h-4 w-4"
        style={MONO_TOOL_COLORS.has(tool.color.toLowerCase()) ? undefined : { color: tool.color }}
      />
    ),
  })), []);

  const descriptorsByKey = useMemo(() => {
    const map = new Map<string, Descriptor>();
    [shellDescriptor, ...agentDescriptors, ...toolDescriptors].forEach((d) => map.set(d.key, d));
    return map;
  }, [shellDescriptor, agentDescriptors, toolDescriptors]);

  /** Sections, section visibility and per-tab counts for the current filters. */
  const view = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const installedOk = (d: Descriptor) => {
      if (!installedOnly || d.cli === null) return true;
      // An undetected CLI is unknown, not absent: keep it visible.
      return cliStatuses[d.cli]?.status !== 'NotInstalled';
    };

    // Counts ignore the active category so every tab always reports its own size.
    const shellMatch = !q || matches(q, 'system shell', 'terminal', currentShellName, 'shell');
    const agentMatches = agentDescriptors.filter((d) => (!q || matches(q, d.label, d.detail, d.key)) && installedOk(d));
    const toolMatches = toolDescriptors.filter((d) => (!q || matches(q, d.label, d.detail, d.key)) && installedOk(d));

    const counts: Record<CategoryFilter, number> = {
      shell: shellMatch ? 1 : 0,
      agents: agentMatches.length,
      tools: toolMatches.length,
      all: 0,
    };
    counts.all = counts.shell + counts.agents + counts.tools;

    const inCategory = (section: SectionId) => category === 'all' || category === section;
    const shellVisible = inCategory('shell') && shellMatch;
    const agentsVisible = inCategory('agents') ? agentMatches : [];
    const toolsVisible = inCategory('tools') ? toolMatches : [];

    // Recents only appear without a query so search results stay predictable.
    const recentList = (!q && recents.length > 0)
      ? recents
        .map((key) => descriptorsByKey.get(key))
        .filter((d): d is Descriptor => d !== undefined && inCategory(d.section) && installedOk(d))
      : [];
    const recentKeys = new Set(recentList.map((d) => d.key));

    const items: PaletteItem[] = [];
    const push = (section: SectionId, list: Descriptor[]) => {
      list.forEach((d, index) => items.push({
        key: d.key,
        section,
        indexInSection: index,
        cli: d.cli,
        label: d.label,
        detail: d.detail,
      }));
    };
    push('recents', recentList);
    push('shell', shellVisible ? [shellDescriptor] : []);
    const agentList = agentsVisible.filter((d) => !recentKeys.has(d.key));
    const toolList = toolsVisible.filter((d) => !recentKeys.has(d.key));
    push('agents', agentList);
    push('tools', toolList);

    return { items, recentList, agentList, toolList, counts, shellVisible, visibleCount: items.length };
  }, [agentDescriptors, toolDescriptors, shellDescriptor, descriptorsByKey, category, searchQuery, installedOnly, cliStatuses, recents, currentShellName]);

  const { items, recentList, agentList, toolList, counts, shellVisible, visibleCount } = view;

  // Reset the highlight whenever the result set changes shape.
  useEffect(() => {
    setActiveIndex(0);
    listRef.current?.scrollTo({ top: 0 });
  }, [category, searchQuery, installedOnly]);

  const activeItem = items[Math.min(activeIndex, items.length - 1)];
  const activeDescriptor = activeItem ? descriptorsByKey.get(activeItem.key) : undefined;
  const queuedCounts = useMemo(() => {
    const map = new Map<string, number>();
    queue.forEach((entry) => map.set(entry.key, entry.count));
    return map;
  }, [queue]);
  const queueTotal = useMemo(() => queue.reduce((sum, entry) => sum + entry.count, 0), [queue]);

  const notInstalled = useCallback((cli: CliType | null) => (
    cli !== null && cliStatuses[cli]?.status === 'NotInstalled'
  ), [cliStatuses]);

  const stepCount = useCallback((delta: number) => {
    setCount((current) => Math.min(MAX_LAUNCH_SESSIONS, Math.max(1, current + delta)));
  }, []);

  const addToQueue = useCallback((key: string) => {
    const descriptor = descriptorsByKey.get(key);
    if (!descriptor) return;
    setQueue((previous) => {
      const total = previous.reduce((sum, entry) => sum + entry.count, 0);
      if (total >= MAX_LAUNCH_SESSIONS) return previous;
      const existing = previous.find((entry) => entry.key === key);
      if (existing) {
        return previous.map((entry) => (entry.key === key ? { ...entry, count: entry.count + 1 } : entry));
      }
      if (previous.length >= MAX_QUEUE_ENTRIES) return previous;
      return [...previous, { key, cli: descriptor.cli, label: descriptor.label, count: 1 }];
    });
  }, [descriptorsByKey]);

  const setQueueEntryCount = useCallback((key: string, next: number) => {
    setQueue((previous) => {
      if (next <= 0) return previous.filter((entry) => entry.key !== key);
      const clamped = Math.min(next, MAX_LAUNCH_SESSIONS);
      const others = previous.filter((entry) => entry.key !== key).reduce((sum, entry) => sum + entry.count, 0);
      return previous.map((entry) => (
        entry.key === key ? { ...entry, count: Math.min(clamped, MAX_LAUNCH_SESSIONS - others) } : entry
      ));
    });
  }, []);

  const removeFromQueue = useCallback((key: string) => {
    setQueue((previous) => previous.filter((entry) => entry.key !== key));
  }, []);

  const clearQueue = useCallback(() => setQueue([]), []);

  const rememberRecents = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setRecents((previous) => {
      const next = [...keys, ...previous.filter((key) => !keys.includes(key))].slice(0, MAX_RECENTS);
      saveRecents(next);
      return next;
    });
  }, []);

  const launchSpecs = useCallback((specs: LaunchSpec[], keys: string[]) => {
    if (specs.length === 0 || launching) return;
    setLaunching(true);
    rememberRecents(keys);
    void Promise.resolve(onLaunch(specs)).catch((error: unknown) => {
      console.error('Failed to launch terminals:', error);
      setLaunching(false);
    });
  }, [launching, onLaunch, rememberRecents]);

  const launchQueue = useCallback(() => {
    const specs: LaunchSpec[] = [];
    queue.forEach((entry) => {
      for (let i = 0; i < entry.count; i += 1) specs.push({ agent: entry.cli, shell: selectedShell });
    });
    launchSpecs(specs, queue.map((entry) => entry.key));
  }, [queue, selectedShell, launchSpecs]);

  const launchOne = useCallback((key: string, cli: CliType | null, copies: number) => {
    const specs = Array.from({ length: copies }, () => ({ agent: cli, shell: selectedShell }));
    launchSpecs(specs, [key]);
  }, [selectedShell, launchSpecs]);

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
      else if (queue.length > 0) clearQueue();
      else onClose();
      return;
    }
    if (showShellPicker) return;

    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      stepCount(1);
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      stepCount(-1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (!activeItem && queue.length === 0) return;
      if (e.shiftKey && activeItem) {
        addToQueue(activeItem.key);
        return;
      }
      if (queue.length > 0) launchQueue();
      else if (activeItem) launchOne(activeItem.key, activeItem.cli, count);
      return;
    }

    if (items.length === 0) return;

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
      case 'Tab': {
        e.preventDefault();
        const order: CategoryFilter[] = ['all', 'agents', 'tools', 'shell'];
        const step = e.shiftKey ? -1 : 1;
        const i = order.indexOf(category);
        setCategory(order[(i + step + order.length) % order.length]);
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
      className: `spawn-row ${index === activeIndex ? 'is-active' : ''} ${notInstalled(cli) ? 'is-missing' : ''}`,
      onMouseMove: () => { if (index !== activeIndex) setActiveIndex(index); },
      onClick: () => launchOne(key, cli, count),
    };
  };

  const sectionHeader = (section: SectionId, count?: number) => (
    <div className="spawn-section-label">
      <span>{SECTION_TITLES[section]}</span>
      {count !== undefined && <span className="spawn-section-count">{count}</span>}
    </div>
  );

  const renderRow = (descriptor: Descriptor) => {
    const queued = queuedCounts.get(descriptor.key) ?? 0;
    const missing = notInstalled(descriptor.cli);
    return (
      <div key={descriptor.key} {...rowProps(descriptor.key, descriptor.cli)} title={descriptor.detail}>
        <div className="spawn-logo">{descriptor.logo}</div>
        <div className="spawn-row-text">
          <span className="spawn-row-title">
            {descriptor.label}
            {missing && <span className="spawn-row-flag">Not installed</span>}
          </span>
          <span className="spawn-row-desc">{descriptor.detail}</span>
        </div>
        {queued > 0 && <span className="spawn-row-badge" title={`${queued} in the launch list`}>×{queued}</span>}
        <button
          type="button"
          tabIndex={-1}
          className="spawn-row-add"
          aria-label={`Add ${descriptor.label} to the launch list`}
          title="Add to launch list (Shift+Enter)"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); addToQueue(descriptor.key); }}
        >
          <Plus size={11} weight="bold" />
        </button>
      </div>
    );
  };

  const launchLabel = queue.length > 0
    ? `Launch ${queueTotal} terminal${queueTotal === 1 ? '' : 's'}`
    : activeItem
      ? (count === 1 ? 'Launch' : `Launch ×${count}`)
      : 'Launch';

  const primaryLaunch = () => {
    if (queue.length > 0) {
      launchQueue();
      return;
    }
    if (activeItem) launchOne(activeItem.key, activeItem.cli, count);
  };

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
          {(['all', 'agents', 'tools', 'shell'] as CategoryFilter[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={category === id}
              onClick={() => { setCategory(id); searchRef.current?.focus(); }}
              className={`spawn-tab ${category === id ? 'is-active' : ''}`}
            >
              {id === 'all' ? 'All' : id[0].toUpperCase() + id.slice(1)}
              <span className="spawn-tab-count">{counts[id]}</span>
            </button>
          ))}
          <button
            type="button"
            role="switch"
            aria-checked={installedOnly}
            onClick={() => { setInstalledOnly((v) => !v); searchRef.current?.focus(); }}
            className={`spawn-filter ${installedOnly ? 'is-active' : ''}`}
            title="Hide agent and tool CLIs that are not installed"
          >
            <span className="spawn-filter-dot" aria-hidden="true" />
            Installed only
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} id="spawn-results" role="listbox" aria-multiselectable className="spawn-list">
          {recentList.length > 0 && (
            <section>
              {sectionHeader('recents')}
              <div className="spawn-grid">{recentList.map(renderRow)}</div>
            </section>
          )}

          {shellVisible && (
            <section>
              {sectionHeader('shell')}
              <div className="spawn-grid spawn-grid--wide">
                <div {...rowProps(shellDescriptor.key, null)} title={shellDescriptor.detail}>
                  <div className="spawn-logo spawn-logo--shell">{shellDescriptor.logo}</div>
                  <div className="spawn-row-text">
                    <span className="spawn-row-title">System Shell</span>
                    <span className="spawn-row-desc">Plain terminal, no agent attached</span>
                  </div>
                  {(queuedCounts.get('shell') ?? 0) > 0 && (
                    <span className="spawn-row-badge">×{queuedCounts.get('shell')}</span>
                  )}
                  <button
                    type="button"
                    tabIndex={-1}
                    className="spawn-row-add"
                    aria-label="Add a plain shell to the launch list"
                    title="Add to launch list (Shift+Enter)"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); addToQueue('shell'); }}
                  >
                    <Plus size={11} weight="bold" />
                  </button>

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
              </div>
            </section>
          )}

          {agentList.length > 0 && (
            <section>
              {sectionHeader('agents', agentList.length)}
              <div className="spawn-grid">{agentList.map(renderRow)}</div>
            </section>
          )}

          {toolList.length > 0 && (
            <section>
              {sectionHeader('tools', toolList.length)}
              <div className="spawn-grid">{toolList.map(renderRow)}</div>
            </section>
          )}

          {visibleCount === 0 && (
            <div className="spawn-empty">
              <p>
                {searchQuery
                  ? <>No results for &ldquo;{searchQuery}&rdquo;</>
                  : installedOnly
                    ? 'Nothing installed matches this filter'
                    : 'Nothing to launch here'}
              </p>
              <div className="spawn-empty-actions">
                {searchQuery && (
                  <button type="button" onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}>
                    Clear search
                  </button>
                )}
                {installedOnly && (
                  <button type="button" onClick={() => { setInstalledOnly(false); searchRef.current?.focus(); }}>
                    Show all CLIs
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Launch list: several terminals, launched or queued in one go */}
        {queue.length > 0 && (
          <div className="spawn-queue">
            <div className="spawn-queue-head">
              <Stack size={12} weight="bold" aria-hidden="true" />
              <span>{queueTotal} queued</span>
              <button type="button" className="spawn-queue-clear" onClick={clearQueue}>Clear</button>
            </div>
            <div className="spawn-queue-chips">
              {queue.map((entry) => (
                <div key={entry.key} className="spawn-chip">
                  <span className="spawn-chip-logo">{descriptorsByKey.get(entry.key)?.logo}</span>
                  <span className="spawn-chip-label">{entry.label}</span>
                  <span className="spawn-chip-stepper">
                    <button type="button" onClick={() => setQueueEntryCount(entry.key, entry.count - 1)} aria-label={`One fewer ${entry.label}`}>
                      <Minus size={9} weight="bold" />
                    </button>
                    <span className="spawn-chip-count">{entry.count}</span>
                    <button
                      type="button"
                      onClick={() => setQueueEntryCount(entry.key, entry.count + 1)}
                      disabled={queueTotal >= MAX_LAUNCH_SESSIONS}
                      aria-label={`One more ${entry.label}`}
                    >
                      <Plus size={9} weight="bold" />
                    </button>
                  </span>
                  <button type="button" className="spawn-chip-remove" onClick={() => removeFromQueue(entry.key)} aria-label={`Remove ${entry.label}`}>
                    <X size={9} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer: preview of the highlight + how many to open */}
        <div className="spawn-footer">
          <div className="spawn-footer-preview" title={activeItem?.detail}>
            {activeItem && (
              <>
                <span className="spawn-footer-logo">{activeDescriptor?.logo}</span>
                <span className="spawn-footer-name">{activeItem.label}</span>
                <span className="spawn-footer-detail">{activeItem.detail}</span>
              </>
            )}
          </div>

          <div className="spawn-count" role="group" aria-label="Number of terminals to open" onWheel={(e) => stepCount(e.deltaY > 0 ? -1 : 1)}>
            <span className="spawn-count-label">Sessions</span>
            <button type="button" className="spawn-count-btn" onClick={() => stepCount(-1)} disabled={count <= 1} aria-label="One fewer terminal">
              <Minus size={11} weight="bold" />
            </button>
            <span className="spawn-count-value" aria-live="polite">{count}</span>
            <button type="button" className="spawn-count-btn" onClick={() => stepCount(1)} disabled={count >= MAX_LAUNCH_SESSIONS} aria-label="One more terminal">
              <Plus size={11} weight="bold" />
            </button>
          </div>

          <div className="spawn-presets" role="group" aria-label="Quick terminal counts">
            {QUICK_COUNTS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`spawn-preset ${count === preset ? 'is-active' : ''}`}
                onClick={() => setCount(preset)}
                aria-label={`Open ${preset} terminal${preset === 1 ? '' : 's'}`}
              >
                {preset}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="spawn-launch"
            onClick={primaryLaunch}
            disabled={(queue.length === 0 && !activeItem) || launching}
          >
            {launchLabel}
          </button>
        </div>

        <div className="spawn-hints" aria-hidden="true">
          <span><kbd className="spawn-kbd">↑↓</kbd> Move</span>
          <span><kbd className="spawn-kbd">tab</kbd> Filter</span>
          <span><kbd className="spawn-kbd">+ / −</kbd> Count</span>
          <span><kbd className="spawn-kbd">shift ↵</kbd> Queue</span>
          <span><kbd className="spawn-kbd">↵</kbd> {queue.length > 0 ? 'Launch all' : 'Launch'}</span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
