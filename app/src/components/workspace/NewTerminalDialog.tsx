import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '@iconify/react';
import { AgentType, ToolCliType, CliType } from '../../types';
import claudeLogo from '../../assets/claude.png';
import codexLogo from '../../assets/codex.png';
import geminiLogo from '../../assets/gemini-cli-logo.svg';
import opencodeLogo from '../../assets/opencode.png';
import cursorLogo from '../../assets/cursor-ai.png';
import kiloLogo from '../../assets/kiloCode.gif';
import hermesLogo from '../../assets/Hermes-logo.png';

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
  { type: 'gemini', label: 'Gemini CLI', description: 'Google Multimodal Assistant', logo: geminiLogo, color: '#4285F4' },
  { type: 'opencode', label: 'OpenCode', description: 'Open Source Autonomy', logo: opencodeLogo, color: '#FFFFFF' },
  { type: 'cursor', label: 'Cursor Agent', description: 'Contextual AI Environment', logo: cursorLogo, color: '#3178C6' },
  { type: 'kilo', label: 'Kilo Code', description: 'Lightweight AI Developer', logo: kiloLogo, color: '#8B5CF6' },
  { type: 'hermes', label: 'Hermes Agent', description: 'NousResearch Autonomous Agent', logo: hermesLogo, color: '#F59E0B' },
];

const AGENT_CAPABILITIES: Record<AgentType, string> = {
  claude: 'Code generation, refactoring, debugging, and complex task orchestration via Anthropic Claude models.',
  codex: 'OpenAI-powered coding assistant with deep code understanding. Specializes in code completion and generation.',
  gemini: 'Google\'s multimodal AI with support for code, images, and documents. Strong at cross-modal reasoning.',
  opencode: 'Fully open-source AI coding agent. Transparent, customizable. Supports multiple model backends.',
  cursor: 'IDE-integrated AI agent with deep codebase awareness. Context-aware suggestions and multi-file edits.',
  kilo: 'Lightweight, fast AI coding assistant optimized for quick tasks. Lower resource usage.',
  hermes: 'NousResearch autonomous AI agent with tool use, messaging integration, and browser automation.',
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

interface ShellOption {
  name: string;
  path: string;
  isAvailable: boolean;
}

interface NewTerminalDialogProps {
  onClose: () => void;
  onSelect: (agent: CliType | null, shell: string | null) => void;
  theme: 'dark' | 'light';
}

export const NewTerminalDialog: React.FC<NewTerminalDialogProps> = ({ onClose, onSelect, theme }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<AgentType | null>(null);
  const [availableShells, setAvailableShells] = useState<ShellOption[]>([]);
  const [selectedShell, setSelectedShell] = useState<string | null>(null);
  const [showShellPicker, setShowShellPicker] = useState(false);
  const isLight = theme === 'light';

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

  const availableShellCount = availableShells.filter((s) => s.isAvailable).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spawn new terminal session"
        className={`relative w-full max-w-[620px] animate-popover-in font-mono ${
          isLight
            ? 'bg-zinc-900/95 border border-zinc-700'
            : 'bg-zinc-950/80 border border-white/[0.08]'
        } backdrop-blur-3xl`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-3 relative flex flex-col items-center shrink-0">
          <h2 className={`text-sm font-bold tracking-tight ${isLight ? 'text-zinc-100' : 'text-zinc-100'}`}>
            Spawn New Session
          </h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mt-1 opacity-60">
            Terminal Orchestration
          </p>

          <button
            onClick={onClose}
            className={`absolute right-4 top-4 p-2 transition-all duration-200 cursor-pointer ${
              isLight ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-white/10 text-zinc-500'
            } hover:text-rose-500`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div
          className="overflow-y-auto flex-1 min-h-0 px-3"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#3f3f46 transparent',
          }}
        >
          {/* System Shell */}
          <button
            onClick={() => handleSelect(null)}
            onMouseEnter={() => setHovered('shell')}
            onMouseLeave={() => setHovered(null)}
            className={`w-full group relative flex items-center gap-4 px-4 py-3 transition-all duration-200 cursor-pointer ${
              hovered === 'shell'
                ? isLight
                  ? 'bg-white/10 shadow-sm'
                  : 'bg-white/5 shadow-sm'
                : isLight
                  ? 'hover:bg-white/5 text-zinc-400'
                  : 'hover:bg-white/5 text-zinc-400'
            }`}
          >
            <div className={`w-9 h-9 flex items-center justify-center transition-all duration-200 ${
              hovered === 'shell'
                ? 'bg-white/20'
                : 'bg-white/5'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-left flex-1">
              <div className="text-[11px] font-bold tracking-wider uppercase">System Shell</div>
              <div className="text-[9px] tracking-wide mt-0.5 opacity-60">
                Launch standard tty environment
              </div>
            </div>
            <svg className={`w-4 h-4 opacity-0 group-hover:opacity-50 transition-opacity ${
              hovered === 'shell' ? 'opacity-50' : ''
            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>

          {/* Shell picker */}
          <div className="relative mt-1">
            <button
              onClick={() => setShowShellPicker(!showShellPicker)}
              onMouseEnter={() => setHovered('shell-picker')}
              onMouseLeave={() => setHovered(null)}
              className={`w-full flex items-center gap-3 px-4 py-2 transition-all duration-200 cursor-pointer ${
                hovered === 'shell-picker'
                  ? isLight ? 'bg-white/10' : 'bg-white/5'
                  : 'bg-transparent'
              }`}
            >
              <svg className={`w-3 h-3 ${isLight ? 'text-zinc-500' : 'text-zinc-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className={`text-[9px] font-bold uppercase tracking-[0.15em] ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Shell: {availableShells.find((s) => s.path === selectedShell)?.name || 'Default'}
              </span>
              <span className={`text-[8px] px-1.5 py-0.5 border ${
                isLight ? 'border-zinc-700 text-zinc-500' : 'border-zinc-800 text-zinc-600'
              }`}>
                {availableShellCount}
              </span>
              <svg className={`w-3 h-3 ml-auto transition-transform ${showShellPicker ? 'rotate-180' : ''} ${
                isLight ? 'text-zinc-500' : 'text-zinc-600'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showShellPicker && (
              <div className={`absolute left-0 right-0 z-50 mt-1 border shadow-xl overflow-hidden ${
                isLight ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-900 border-zinc-800'
              }`}>
                {availableShells.map((shell) => (
                  <button
                    key={shell.path}
                    onClick={() => {
                      if (shell.isAvailable) {
                        setSelectedShell(shell.path);
                        setShowShellPicker(false);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2 text-left transition-colors cursor-pointer ${
                      shell.isAvailable
                        ? isLight ? 'hover:bg-white/10 text-zinc-300' : 'hover:bg-white/5 text-zinc-400'
                        : 'opacity-40 cursor-not-allowed text-zinc-600'
                    } ${selectedShell === shell.path ? (isLight ? 'bg-white/5' : 'bg-white/5') : ''}`}
                    disabled={!shell.isAvailable}
                  >
                    <span className="text-[10px] font-bold tracking-wider">{shell.name}</span>
                    {selectedShell === shell.path && (
                      <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Agent Fleet Section Header */}
          <div className="pt-3 pb-1.5 flex items-center gap-4 px-4">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em] whitespace-nowrap">Agent Fleet</span>
            <div className="h-px w-full bg-current opacity-[0.08]" />
            <span className="text-[8px] text-zinc-600 tabular-nums">{AGENT_OPTIONS.length}</span>
          </div>

          {/* Agent Fleet Grid — 2 columns for compact layout */}
          <div className="grid grid-cols-2 gap-1">
            {AGENT_OPTIONS.map((agent) => {
              const isExpanded = expandedAgent === agent.type;
              const isHovered = hovered === agent.type;
              return (
                <div key={agent.type} className={agent.type === 'hermes' ? 'col-span-2' : undefined}>
                  <button
                    onClick={() => handleSelect(agent.type)}
                    onMouseEnter={() => setHovered(agent.type)}
                    onMouseLeave={() => setHovered(null)}
                    className={`group relative w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-200 cursor-pointer text-left ${
                      isHovered
                        ? isLight
                          ? 'bg-white/10 shadow-sm'
                          : 'bg-white/5 shadow-sm'
                        : 'bg-transparent'
                    }`}
                  >
                    {isHovered && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5"
                        style={{ backgroundColor: agent.color }}
                      />
                    )}

                    <div className={`w-8 h-8 flex items-center justify-center transition-all duration-200 shrink-0 p-1.5 ${
                      isHovered
                        ? 'bg-white shadow-sm scale-105'
                        : isLight ? 'bg-white/10 opacity-50' : 'bg-white/10 opacity-50'
                    }`}>
                      <img
                        src={agent.logo}
                        alt={agent.label}
                        className={`w-full h-full object-contain transition-all ${
                          isHovered ? 'brightness-100' : 'brightness-75'
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold tracking-wider uppercase truncate ${
                          isHovered ? 'text-zinc-100' : 'text-zinc-400'
                        }`}>
                          {agent.label}
                        </span>
                      </div>
                      <div className="text-[8px] text-zinc-500 tracking-wide mt-0.5 opacity-60 truncate">
                        {agent.description}
                      </div>
                    </div>

                    {/* Info toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedAgent(isExpanded ? null : agent.type);
                      }}
                      className={`shrink-0 p-1 transition-all cursor-pointer ${
                        isExpanded
                          ? 'bg-white/10 text-zinc-300'
                          : 'opacity-0 group-hover:opacity-50 hover:!opacity-80 text-zinc-500'
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </button>

                  {/* Expanded capabilities — inline within the grid */}
                  {isExpanded && (
                    <div className={`mx-3 mb-1 px-3 py-2 text-[9px] leading-relaxed animate-fade-in ${
                      isLight
                        ? 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/50'
                        : 'bg-zinc-900/80 text-zinc-500 border border-zinc-800/50'
                    }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-1.5 h-1.5" style={{ backgroundColor: agent.color }} />
                        <span className={`font-bold uppercase tracking-wider ${
                          isLight ? 'text-zinc-300' : 'text-zinc-300'
                        }`}>{agent.label}</span>
                      </div>
                      {AGENT_CAPABILITIES[agent.type]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tool CLIs Section Header */}
          <div className="pt-3 pb-1.5 flex items-center gap-4 px-4">
            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.3em] whitespace-nowrap">Tool CLIs</span>
            <div className="h-px w-full bg-current opacity-[0.06]" />
            <span className="text-[8px] text-zinc-600 tabular-nums">{TOOL_OPTIONS.length}</span>
          </div>

          {/* Tool CLIs Grid — 2 columns */}
          <div className="grid grid-cols-2 gap-1 px-1 pb-2">
            {TOOL_OPTIONS.map((tool) => (
              <button
                key={tool.type}
                onClick={() => handleSelect(tool.type)}
                onMouseEnter={() => setHovered(`tool-${tool.type}`)}
                onMouseLeave={() => setHovered(null)}
                className={`group relative flex items-center gap-2.5 px-3 py-2 transition-all duration-200 cursor-pointer ${
                  hovered === `tool-${tool.type}`
                    ? 'bg-white/5'
                    : 'bg-transparent'
                }`}
              >
                <div className={`w-6 h-6 flex items-center justify-center transition-all duration-200 shrink-0 ${
                  hovered === `tool-${tool.type}` ? 'scale-110' : 'opacity-50'
                }`}>
                  <Icon icon={tool.icon} style={{ color: tool.color }} className="w-3 h-3" />
                </div>
                <div className="text-left min-w-0 flex-1">
                  <span className={`text-[9px] font-bold tracking-wider uppercase block truncate ${
                    hovered === `tool-${tool.type}` ? 'text-zinc-200' : 'text-zinc-500'
                  }`}>
                    {tool.label}
                  </span>
                  <span className="text-[8px] text-zinc-600 tracking-wide truncate block">{tool.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-3 flex items-center justify-between border-t shrink-0 ${
          isLight ? 'border-zinc-800 bg-zinc-900/50' : 'border-white/[0.04] bg-white/[0.02]'
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 animate-pulse" />
            <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">session_ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-zinc-600 uppercase tracking-widest">dismiss</span>
            <kbd className={`px-1.5 py-0.5 text-[8px] font-bold border ${
              isLight ? 'bg-zinc-800 border-zinc-700 text-zinc-500' : 'bg-zinc-900 border-zinc-800 text-zinc-500'
            }`}>ESC</kbd>
          </div>
        </div>
      </div>
    </div>
  );
};
