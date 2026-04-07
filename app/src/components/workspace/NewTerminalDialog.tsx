import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '@iconify/react';
import { AgentType, ToolCliType } from '../../types';
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
  claude: 'Code generation, refactoring, debugging, and complex task orchestration via Anthropic Claude models. Excels at multi-step reasoning and codebase-wide changes.',
  codex: 'OpenAI-powered coding assistant with deep code understanding. Specializes in code completion, generation, and natural language to code translation.',
  gemini: 'Google\'s multimodal AI with support for code, images, and documents. Strong at cross-modal reasoning, web search integration, and large context windows.',
  opencode: 'Fully open-source AI coding agent. Transparent, customizable, and community-driven. Supports multiple model backends with no vendor lock-in.',
  cursor: 'IDE-integrated AI agent with deep codebase awareness. Context-aware suggestions, multi-file edits, and seamless editor integration.',
  kilo: 'Lightweight, fast AI coding assistant optimized for quick tasks. Lower resource usage while maintaining strong code generation capabilities.',
  hermes: 'NousResearch autonomous AI agent with tool use, messaging platform integration, and multi-modal capabilities. Supports browser automation, web search, and image generation.',
};

const TOOL_OPTIONS: { type: ToolCliType; label: string; description: string; icon: string; color: string }[] = [
  { type: 'gh', label: 'GitHub CLI', description: 'Repos, PRs, and issues', icon: 'simple-icons:github', color: '#ffffff' },
  { type: 'stripe', label: 'Stripe CLI', description: 'Payments and webhooks', icon: 'simple-icons:stripe', color: '#635BFF' },
  { type: 'supabase', label: 'Supabase CLI', description: 'Database and local stack', icon: 'simple-icons:supabase', color: '#3FCF8E' },
  { type: 'vercel', label: 'Vercel CLI', description: 'Deploy and cloud mgmt', icon: 'simple-icons:vercel', color: '#ffffff' },
  { type: 'elevenlabs', label: 'ElevenLabs CLI', description: 'TTS and voice agents', icon: 'simple-icons:elevenlabs', color: '#8B5CF6' },
  { type: 'valyu', label: 'Valyu CLI', description: 'Search and data access', icon: 'simple-icons:search', color: '#F59E0B' },
  { type: 'posthog', label: 'PostHog CLI', description: 'Analytics and SQL', icon: 'simple-icons:posthog', color: '#1D4AFF' },
  { type: 'gws', label: 'Google Workspace', description: 'Gmail, Drive, Docs', icon: 'simple-icons:google', color: '#4285F4' },
  { type: 'ramp', label: 'Ramp CLI', description: 'Expense management', icon: 'simple-icons:creditcard', color: '#1AE65E' },
  { type: 'agentmail', label: 'AgentMail CLI', description: 'Email for AI agents', icon: 'simple-icons:mailgun', color: '#EC4899' },
];

interface ShellOption {
  name: string;
  path: string;
  isAvailable: boolean;
}

interface NewTerminalDialogProps {
  onClose: () => void;
  onSelect: (agent: AgentType | null, shell: string | null) => void;
  theme: 'dark' | 'light';
}

export const NewTerminalDialog: React.FC<NewTerminalDialogProps> = ({ onClose, onSelect, theme }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const [showCapabilities, setShowCapabilities] = useState<AgentType | null>(null);
  const [availableShells, setAvailableShells] = useState<ShellOption[]>([]);
  const [selectedShell, setSelectedShell] = useState<string | null>(null);
  const [showShellPicker, setShowShellPicker] = useState(false);
  const isLight = theme === 'light';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    invoke<ShellOption[]>('get_available_shells').then((shells) => {
      setAvailableShells(shells);
      const defaultShell = shells.find((s) => s.isAvailable);
      if (defaultShell) setSelectedShell(defaultShell.path);
    }).catch(console.error);
  }, []);

  const handleSelect = (agent: AgentType | null) => {
    onSelect(agent, selectedShell);
  };

  const availableShellCount = availableShells.filter((s) => s.isAvailable).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spawn new session"
        className={`relative w-full max-w-[440px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] overflow-hidden animate-popover-in font-mono ${
          isLight
            ? 'bg-zinc-900/95 border border-zinc-700'
            : 'bg-zinc-950/80 border border-white/[0.08]'
        } backdrop-blur-3xl rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-8 pb-4 relative flex flex-col items-center">
          <h2 className={`text-sm font-bold tracking-tight ${isLight ? 'text-zinc-100' : 'text-zinc-100'}`}>
            Spawn New Session
          </h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mt-1 opacity-60">
            Terminal Orchestration
          </p>

          <button
            onClick={onClose}
            className={`absolute right-6 top-6 p-2 rounded-full transition-all duration-200 ${
              isLight ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-white/10 text-zinc-500'
            } hover:text-rose-500`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-3 pb-2 space-y-1.5">
          <button
            onClick={() => handleSelect(null)}
            onMouseEnter={() => setHovered('shell')}
            onMouseLeave={() => setHovered(null)}
            className={`w-full group relative flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 ${
              hovered === 'shell'
                ? isLight
                  ? 'bg-white text-black shadow-xl translate-x-1'
                  : 'bg-white text-black shadow-xl translate-x-1'
                : isLight
                  ? 'hover:bg-white/5 text-zinc-400'
                  : 'hover:bg-white/5 text-zinc-400'
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300 ${
              hovered === 'shell'
                ? isLight ? 'bg-black/20' : 'bg-black/20'
                : isLight ? 'bg-white/5' : 'bg-white/5'
            }`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-left flex-1">
              <div className="text-[11px] font-bold tracking-wider uppercase">System Shell</div>
              <div className={`text-[9px] tracking-wide mt-0.5 opacity-60`}>
                Launch standard tty environment
              </div>
            </div>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowShellPicker(!showShellPicker)}
              onMouseEnter={() => setHovered('shell-picker')}
              onMouseLeave={() => setHovered(null)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                hovered === 'shell-picker'
                  ? isLight ? 'bg-white/10' : 'bg-white/5'
                  : 'bg-transparent'
              }`}
            >
              <svg className={`w-3.5 h-3.5 ${isLight ? 'text-zinc-500' : 'text-zinc-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className={`text-[9px] font-bold uppercase tracking-[0.15em] ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Shell: {availableShells.find((s) => s.path === selectedShell)?.name || 'Default'}
              </span>
              <span className={`text-[8px] px-1.5 py-0.5 rounded border ${
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
              <div className={`absolute left-0 right-0 z-50 mt-1 rounded-lg border shadow-xl overflow-hidden ${
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
                    className={`w-full flex items-center justify-between px-4 py-2 text-left transition-colors ${
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

          <div className="pt-2 pb-2 flex items-center gap-4 px-4">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em] whitespace-nowrap">Agent Fleet</span>
            <div className="h-px w-full bg-current opacity-[0.08]" />
          </div>

          <div className="grid grid-cols-1 gap-1">
            {AGENT_OPTIONS.map((agent) => (
              <div key={agent.type} className="relative">
                <button
                  onClick={() => handleSelect(agent.type)}
                  onMouseEnter={() => { setHovered(agent.type); setShowCapabilities(agent.type); }}
                  onMouseLeave={() => { setHovered(null); setShowCapabilities(null); }}
                  className={`group relative w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 ${
                    hovered === agent.type
                      ? isLight
                        ? 'bg-white/10 shadow-sm translate-x-1'
                        : 'bg-white/5 shadow-sm translate-x-1'
                      : 'bg-transparent'
                  }`}
                >
                  {hovered === agent.type && (
                    <div
                      className="absolute left-0 w-1 h-6 rounded-full"
                      style={{ backgroundColor: agent.color }}
                    />
                  )}

                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300 p-2 ${
                    hovered === agent.type
                      ? 'bg-white shadow-md scale-110'
                      : isLight ? 'bg-white/10 grayscale opacity-60' : 'bg-white/10 grayscale opacity-60'
                  }`}>
                    <img
                      src={agent.logo}
                      alt={agent.label}
                      className={`w-full h-full object-contain ${
                        hovered !== agent.type ? 'brightness-75' : ''
                      }`}
                    />
                  </div>

                  <div className="text-left flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold tracking-wider uppercase ${
                        hovered === agent.type
                          ? isLight ? 'text-zinc-100' : 'text-zinc-100'
                          : isLight ? 'text-zinc-400' : 'text-zinc-400'
                      }`}>
                        {agent.label}
                      </span>
                      {hovered === agent.type && (
                        <span className="text-[8px] font-bold opacity-40 px-1 border border-current rounded uppercase tracking-tighter">AI</span>
                      )}
                    </div>
                    <div className="text-[9px] text-zinc-500 tracking-wide mt-0.5 opacity-60">
                      {agent.description}
                    </div>
                  </div>

                  {hovered === agent.type && (
                    <div className="text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4 animate-bounce-x" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </div>
                  )}
                </button>

                {showCapabilities === agent.type && (
                  <div
                    className={`absolute left-full top-0 ml-2 z-50 w-64 p-3 rounded-lg shadow-xl border animate-popover-in ${
                      isLight
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                    }`}
                    onMouseEnter={() => setShowCapabilities(agent.type)}
                    onMouseLeave={() => setShowCapabilities(null)}
                  >
                    <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                      isLight ? 'text-zinc-100' : 'text-zinc-200'
                    }`}>
                      {agent.label}
                    </div>
                    <div className="text-[10px] leading-relaxed opacity-80">
                      {AGENT_CAPABILITIES[agent.type]}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="pt-2 pb-2 flex items-center gap-4 px-4">
            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.3em] whitespace-nowrap">Tool CLIs</span>
            <div className="h-px w-full bg-current opacity-[0.06]" />
          </div>

          <div className="grid grid-cols-2 gap-1 px-1">
            {TOOL_OPTIONS.map((tool) => (
              <button
                key={tool.type}
                onClick={() => handleSelect(null)}
                onMouseEnter={() => setHovered(`tool-${tool.type}`)}
                onMouseLeave={() => setHovered(null)}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  hovered === `tool-${tool.type}`
                    ? 'bg-white/5 translate-x-0.5'
                    : 'bg-transparent'
                }`}
              >
                <div className={`w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200 ${
                  hovered === `tool-${tool.type}` ? 'scale-110' : 'opacity-50'
                }`}>
                  <Icon icon={tool.icon} style={{ color: tool.color }} className="w-3.5 h-3.5" />
                </div>
                <div className="text-left min-w-0">
                  <span className={`text-[9px] font-bold tracking-wider uppercase block ${
                    hovered === `tool-${tool.type}` ? 'text-zinc-200' : 'text-zinc-500'
                  }`}>
                    {tool.label}
                  </span>
                  <span className="text-[8px] text-zinc-600 tracking-wide">{tool.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`px-6 py-4 flex items-center justify-between border-t ${
          isLight ? 'border-zinc-800 bg-zinc-900/50' : 'border-white/[0.04] bg-white/[0.02]'
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">session_ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-zinc-600 uppercase tracking-widest">dismiss</span>
            <kbd className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${
              isLight ? 'bg-zinc-800 border-zinc-700 text-zinc-500' : 'bg-zinc-900 border-zinc-800 text-zinc-500'
            }`}>ESC</kbd>
          </div>
        </div>
      </div>
    </div>
  );
};
