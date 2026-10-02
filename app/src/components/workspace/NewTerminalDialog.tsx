import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '@iconify/react';
import {
  CaretDown,
  Check,
  Info,
  MagnifyingGlass,
  Sparkle,
  TerminalWindow,
  Wrench,
  X,
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

type CategoryFilter = 'all' | 'agents' | 'tools' | 'shell';

interface ShellOption {
  name: string;
  path: string;
  isAvailable: boolean;
}

interface NewTerminalDialogProps {
  onClose: () => void;
  onSelect: (agent: CliType | null, shell: string | null) => void;
}

export const NewTerminalDialog: React.FC<NewTerminalDialogProps> = ({ onClose, onSelect }) => {
  const [expandedAgent, setExpandedAgent] = useState<AgentType | null>(null);
  const [availableShells, setAvailableShells] = useState<ShellOption[]>([]);
  const [selectedShell, setSelectedShell] = useState<string | null>(null);
  const [showShellPicker, setShowShellPicker] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showShellPicker) {
          setShowShellPicker(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showShellPicker]);

  useEffect(() => {
    invoke<ShellOption[]>('get_available_shells').then((shells) => {
      setAvailableShells(shells);
      const defaultShell = shells.find((s) => s.isAvailable);
      if (defaultShell) setSelectedShell(defaultShell.path);
    }).catch(console.error);
  }, []);

  const handleSelect = (agent: CliType | null) => {
    onSelect(agent, selectedShell);
  };

  const filteredAgents = useMemo(() => {
    if (category === 'tools' || category === 'shell') return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return AGENT_OPTIONS;
    return AGENT_OPTIONS.filter((a) =>
      a.label.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q)
    );
  }, [category, searchQuery]);

  const filteredTools = useMemo(() => {
    if (category === 'agents' || category === 'shell') return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return TOOL_OPTIONS;
    return TOOL_OPTIONS.filter((t) =>
      t.label.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.type.toLowerCase().includes(q)
    );
  }, [category, searchQuery]);

  const showShellSection = category === 'all' || category === 'shell';
  const availableShellCount = availableShells.filter((s) => s.isAvailable).length;
  const currentShellName = availableShells.find((s) => s.path === selectedShell)?.name || 'Default Shell';

  const modalContent = (
    <div
      className="spawn-session-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spawn new terminal session"
        className="spawn-session-window"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="spawn-session-header">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-sm">
              <TerminalWindow size={18} weight="bold" className="text-[var(--accent)]" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
                Spawn New Session
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Select an AI agent, tool CLI, or system shell
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="workspace-window-control workspace-window-control--close"
            title="Close dialog (Esc)"
            aria-label="Close dialog"
            type="button"
          >
            <X size={13} weight="bold" aria-hidden="true" />
          </button>
        </div>

        {/* Toolbar: Category Switcher & Search Bar */}
        <div className="flex flex-col gap-2.5 px-4 pt-3 pb-2 shrink-0 border-b border-[var(--border-primary)]/50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="spawn-session-filter-dock" role="tablist" aria-label="Filter categories">
              <button
                type="button"
                role="tab"
                aria-selected={category === 'all'}
                onClick={() => setCategory('all')}
                className={`spawn-session-filter-item ${category === 'all' ? 'is-active' : ''}`}
              >
                All ({AGENT_OPTIONS.length + TOOL_OPTIONS.length + 1})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={category === 'agents'}
                onClick={() => setCategory('agents')}
                className={`spawn-session-filter-item flex items-center gap-1 ${category === 'agents' ? 'is-active' : ''}`}
              >
                <Sparkle size={12} weight={category === 'agents' ? 'fill' : 'regular'} aria-hidden="true" />
                Agents ({AGENT_OPTIONS.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={category === 'tools'}
                onClick={() => setCategory('tools')}
                className={`spawn-session-filter-item flex items-center gap-1 ${category === 'tools' ? 'is-active' : ''}`}
              >
                <Wrench size={12} weight="regular" aria-hidden="true" />
                Tools ({TOOL_OPTIONS.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={category === 'shell'}
                onClick={() => setCategory('shell')}
                className={`spawn-session-filter-item flex items-center gap-1 ${category === 'shell' ? 'is-active' : ''}`}
              >
                <TerminalWindow size={12} weight="regular" aria-hidden="true" />
                Shell
              </button>
            </div>

            {/* Quick search input */}
            <div className="spawn-session-search flex-1 min-w-[160px] max-w-[240px]">
              <MagnifyingGlass size={13} className="text-[var(--text-muted)] shrink-0 mr-1.5" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search fleet..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-[11px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X size={11} weight="bold" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4"
          style={{ scrollbarWidth: 'thin' }}
        >
          {/* System Shell Section */}
          {showShellSection && !searchQuery && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  System Environment
                </span>
                {/* Shell selector dropdown pill */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowShellPicker(!showShellPicker)}
                    className="flex h-6 items-center gap-1.5 rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                  >
                    <span>{currentShellName}</span>
                    <span className="rounded-full bg-[var(--bg-tertiary)] px-1 py-0.2 text-[8px] font-mono text-[var(--text-muted)]">
                      {availableShellCount}
                    </span>
                    <CaretDown size={10} weight="bold" className={`transition-transform ${showShellPicker ? 'rotate-180' : ''}`} />
                  </button>

                  {showShellPicker && (
                    <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-xl backdrop-blur-2xl">
                      {availableShells.map((shell) => (
                        <button
                          key={shell.path}
                          type="button"
                          onClick={() => {
                            if (shell.isAvailable) {
                              setSelectedShell(shell.path);
                              setShowShellPicker(false);
                            }
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-[11px] transition-colors ${
                            shell.isAvailable
                              ? 'cursor-pointer hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                              : 'cursor-not-allowed opacity-40 text-[var(--text-muted)]'
                          } ${selectedShell === shell.path ? 'bg-[var(--bg-tertiary)] font-semibold' : ''}`}
                          disabled={!shell.isAvailable}
                        >
                          <span className="truncate">{shell.name}</span>
                          {selectedShell === shell.path && (
                            <Check size={12} weight="bold" className="text-emerald-500 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div
                onClick={() => handleSelect(null)}
                className="spawn-session-card group"
              >
                <div className="spawn-session-logo-tile">
                  <TerminalWindow size={18} weight="bold" className="text-[var(--accent)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">System Shell</span>
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-400">
                      Standard
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">
                    Launch standard system tty terminal using {currentShellName}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                  <span>Launch</span>
                  <span className="text-xs">→</span>
                </div>
              </div>
            </div>
          )}

          {/* Agent Fleet Grid */}
          {filteredAgents.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  AI Agent Fleet
                </span>
                <span className="text-[9px] font-mono text-[var(--text-muted)]">
                  {filteredAgents.length} {filteredAgents.length === 1 ? 'agent' : 'agents'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredAgents.map((agent) => {
                  const isExpanded = expandedAgent === agent.type;
                  return (
                    <div key={agent.type} className="flex flex-col">
                      <div
                        onClick={() => handleSelect(agent.type)}
                        className="spawn-session-card group"
                        style={{
                          borderLeftColor: agent.color ? `color-mix(in srgb, ${agent.color} 50%, var(--border-primary))` : undefined,
                        }}
                      >
                        <div className="spawn-session-logo-tile">
                          <img
                            src={agent.logo}
                            alt={agent.label}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {agent.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">
                            {agent.description}
                          </p>
                        </div>

                        {/* Info trigger */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedAgent(isExpanded ? null : agent.type);
                          }}
                          className={`p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ${
                            isExpanded ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : ''
                          }`}
                          title="View capabilities"
                        >
                          <Info size={14} weight={isExpanded ? 'fill' : 'regular'} />
                        </button>
                      </div>

                      {/* Capabilities dropdown */}
                      {isExpanded && (
                        <div className="mt-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-2.5 text-[10px] text-[var(--text-secondary)] shadow-sm animate-fade-in">
                          <div className="flex items-center gap-1.5 mb-1 font-semibold text-[var(--text-primary)]">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: agent.color }} />
                            <span>{agent.label} Capabilities</span>
                          </div>
                          <p className="leading-relaxed">{AGENT_CAPABILITIES[agent.type]}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tool CLIs Grid */}
          {filteredTools.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Developer &amp; SaaS Tools
                </span>
                <span className="text-[9px] font-mono text-[var(--text-muted)]">
                  {filteredTools.length} {filteredTools.length === 1 ? 'tool' : 'tools'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredTools.map((tool) => (
                  <div
                    key={tool.type}
                    onClick={() => handleSelect(tool.type)}
                    className="spawn-session-card group"
                  >
                    <div className="spawn-session-logo-tile">
                      <Icon icon={tool.icon} style={{ color: tool.color }} className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {tool.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">
                        {tool.description}
                      </p>
                    </div>
                    <div className="text-[11px] font-semibold text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                      →
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty search state */}
          {filteredAgents.length === 0 && filteredTools.length === 0 && !showShellSection && (
            <div className="py-12 text-center text-[var(--text-muted)]">
              <p className="text-xs">No matching agents or tools found for &quot;{searchQuery}&quot;</p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 text-[11px] font-medium text-[var(--accent)] hover:underline"
              >
                Clear search query
              </button>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border-primary)] bg-[var(--bg-primary)]/40 shrink-0 text-[10px] text-[var(--text-secondary)]">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Ready to spawn session</span>
          </div>
          <div className="flex items-center gap-1 text-[var(--text-muted)]">
            <span>Press</span>
            <kbd className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[var(--text-secondary)]">
              ESC
            </kbd>
            <span>to dismiss</span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
