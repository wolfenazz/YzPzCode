import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { CliType, AgentType, ToolCliType, TerminalSession } from '../../types';
import { QuickActions } from './QuickActions';
import { AGENT_COMMANDS, getCommandIcon } from '../../data/agentCommands';

import claudeLogo from '../../assets/claude.png';
import codexLogo from '../../assets/codex.png';
import geminiLogo from '../../assets/gemini-cli-logo.svg';
import opencodeLogo from '../../assets/opencode.png';
import cursorLogo from '../../assets/cursor-ai.png';
import kiloLogo from '../../assets/kiloCode.gif';
import hermesLogo from '../../assets/Hermes-logo.png';
import piLogo from '../../assets/pi.svg';
import commandCodeLogo from '../../assets/commandcode-logo.svg';

export const AGENT_LOGOS: Record<AgentType, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  gemini: geminiLogo,
  opencode: opencodeLogo,
  cursor: cursorLogo,
  kilo: kiloLogo,
  hermes: hermesLogo,
  pi: piLogo,
  commandcode: commandCodeLogo,
};

const TOOL_ICON_MAP: Record<ToolCliType, { icon: string; color: string }> = {
  gh: { icon: 'simple-icons:github', color: '#ffffff' },
  stripe: { icon: 'simple-icons:stripe', color: '#635BFF' },
  supabase: { icon: 'simple-icons:supabase', color: '#3FCF8E' },
  valyu: { icon: 'simple-icons:search', color: '#F59E0B' },
  posthog: { icon: 'simple-icons:posthog', color: '#1D4AFF' },
  elevenlabs: { icon: 'simple-icons:elevenlabs', color: '#8B5CF6' },
  ramp: { icon: 'simple-icons:creditcard', color: '#1AE65E' },
  gws: { icon: 'simple-icons:google', color: '#4285F4' },
  agentmail: { icon: 'simple-icons:mailgun', color: '#EC4899' },
  vercel: { icon: 'simple-icons:vercel', color: '#ffffff' },
};

export const isAgentType = (cli: CliType): cli is AgentType => cli in AGENT_LOGOS;

const STATUS_COLORS = {
  idle: 'bg-zinc-600',
  running: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]',
  error: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]',
};

interface TerminalHeaderProps {
  session: TerminalSession;
  onRefreshCli: () => void;
  isRefreshing: boolean;
  onClose?: () => void;
  cliStatusBadge: React.ReactNode;
  dragListeners?: Record<string, unknown>;
  mouseTrackingEnabled?: boolean;
  onToggleMouseTracking?: () => void;
  onNewSession?: () => void;
  onRunCommand?: (command: string) => void;
  agentOverride?: CliType | null;
  isActive?: boolean;
}

export const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  session,
  onRefreshCli,
  isRefreshing,
  onClose,
  cliStatusBadge,
  dragListeners,
  mouseTrackingEnabled = false,
  onToggleMouseTracking,
  onNewSession,
  onRunCommand,
  agentOverride,
  isActive = false,
}) => {
  // The effective agent combines the fleet-assigned agent with a runtime
  // detection of an agent launched manually inside the terminal, so the badge
  // and New Session button appear in both cases.
  const effectiveAgent = agentOverride ?? session.agent;
  const isAiAgent = !!effectiveAgent && isAgentType(effectiveAgent);
  const mouseOn = mouseTrackingEnabled;

  const [commandsOpen, setCommandsOpen] = useState(false);
  const commandsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!commandsOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (commandsRef.current && !commandsRef.current.contains(e.target as Node)) {
        setCommandsOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [commandsOpen]);

  const agentCommands = isAiAgent && effectiveAgent ? AGENT_COMMANDS[effectiveAgent as AgentType] : [];
  const runCommand = (command: string) => {
    setCommandsOpen(false);
    onRunCommand?.(command);
  };

  return (
    <div
      className={`drag-handle flex items-center justify-between px-3 py-1.5 select-none shrink-0 cursor-grab active:cursor-grabbing bg-zinc-900 border-b border-zinc-800/80`}
      {...dragListeners}
    >
      <div className="flex items-center gap-3 min-w-0 overflow-hidden">
        <div className="relative flex h-2 w-2 shrink-0">
           <span className={`relative inline-flex h-2 w-2 transition-colors duration-200 ${
             isActive ? 'bg-accent shadow-[0_0_6px_var(--accent-glow)]' : STATUS_COLORS[session.status]
           }`}></span>
        </div>

        <span className="text-xs font-black tracking-[0.2em] uppercase shrink-0">
          <span className="text-zinc-500">TTY::</span>
          <span className="text-accent">{session.index + 1}</span>
        </span>

        <div className="h-3 w-px bg-zinc-700/50 mx-1" />

        {effectiveAgent ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 px-2 py-0.5 shrink-0 border transition-all duration-300 bg-zinc-950/90 border-zinc-800 hover:border-zinc-700 group/agent">
              {isAgentType(effectiveAgent) ? (
                effectiveAgent === 'claude' ? (
                  <Icon
                    icon="simple-icons:anthropic"
                    className="w-3 h-3 transition-transform group-hover/agent:scale-110"
                    style={{ color: '#D97757' }}
                  />
                ) : (
                  <img
                    src={AGENT_LOGOS[effectiveAgent]}
                    alt={effectiveAgent}
                    className={`w-3 h-3 object-contain transition-transform group-hover/agent:scale-110 ${
                        effectiveAgent === 'opencode' || effectiveAgent === 'cursor' || effectiveAgent === 'codex'
                          ? 'invert brightness-[3.5] contrast-[1.5]'
                          : 'brightness-[2.2] contrast-[1.2]'
                      }`}
                  />
                )
              ) : (
                <Icon
                  icon={TOOL_ICON_MAP[effectiveAgent as ToolCliType].icon}
                  style={{ color: TOOL_ICON_MAP[effectiveAgent as ToolCliType].color }}
                  className="w-3 h-3"
                />
              )}
              <span className="text-[9px] uppercase font-black tracking-widest truncate max-w-[80px] text-zinc-400">{effectiveAgent}</span>
            </div>
            <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-1 duration-300">
              {cliStatusBadge}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 shrink-0 border bg-zinc-950 border-zinc-800">
            <svg className="w-3 h-3 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">CORE::SHELL</span>
          </div>
        )}
      </div>

      <div className="flex items-center shrink-0 gap-1 ml-2">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMouseTracking?.();
          }}
          className={`px-2 py-1 border text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
            mouseOn
              ? 'bg-emerald-950/45 border-emerald-800 text-emerald-400'
              : 'bg-rose-950/35 border-rose-900 text-rose-400 hover:bg-rose-950/50'
          }`}
          title={mouseOn
            ? 'Mouse mode enabled (click to disable)'
            : 'Mouse mode disabled (click to enable manually)'}
        >
          Mouse {mouseOn ? 'On' : 'Off'}
        </button>
        {isAiAgent && onNewSession && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onNewSession();
            }}
            className="flex items-center gap-1 px-2 py-1 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer border bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-900 hover:bg-emerald-950/30"
            title="Start a new session"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Session
          </button>
        )}
        {isAiAgent && onRunCommand && (
          <div className="relative" ref={commandsRef}>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setCommandsOpen((open) => !open);
              }}
              className="flex items-center justify-center w-6 h-6 p-1 border transition-colors cursor-pointer bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-cyan-400 hover:border-cyan-900 hover:bg-cyan-950/30"
              title="Agent commands"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 6h14M5 12h14M5 18h14M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </button>
            {commandsOpen && agentCommands.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.15em]">
                    {effectiveAgent} · Commands
                  </span>
                  <span className="text-[10px] text-zinc-700 font-mono">{agentCommands.length}</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {agentCommands.map((cmd) => (
                    <button
                      key={cmd.command}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        runCommand(cmd.command);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 transition-colors duration-100 cursor-pointer flex items-center gap-3 group"
                      title={cmd.description}
                    >
                      <span className="flex items-center justify-center w-4 h-4 shrink-0 text-zinc-500 group-hover:text-cyan-400 transition-colors duration-100">
                        <Icon icon={getCommandIcon(cmd.command)} className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-xs font-mono text-cyan-400 shrink-0 group-hover:text-cyan-300">
                        {cmd.command}
                      </span>
                      <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 truncate">
                        {cmd.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <QuickActions sessionId={session.id} workspaceId={session.workspaceId} cwd={session.cwd} />
        <div className="h-3 w-px bg-zinc-700/50" />
        {session.agent && (
          <button
            onClick={onRefreshCli}
            disabled={isRefreshing}
            className="flex items-center justify-center w-6 h-6 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50"
            title="Restart CLI"
          >
            <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 transition-all duration-200 cursor-pointer text-zinc-600 hover:text-rose-400 hover:bg-rose-950/30"
            title="Terminate process"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
