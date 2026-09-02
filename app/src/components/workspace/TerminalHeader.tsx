import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowClockwise, ListBullets, MouseSimple, Plus, Sparkle, TerminalWindow, X } from '@phosphor-icons/react';
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
import clineLogo from '../../assets/cline.webp';
import grokLogo from '../../assets/Grok.png';

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
  cline: clineLogo,
  grok: grokLogo,
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
  running: 'bg-emerald-500',
  error: 'bg-rose-500',
};

interface TerminalHeaderProps {
  session: TerminalSession;
  onRefreshCli: () => void;
  isRefreshing: boolean;
  onClose?: () => void;
  cliStatusBadge: ReactNode;
  dragListeners?: Record<string, unknown>;
  mouseTrackingEnabled?: boolean;
  onToggleMouseTracking?: () => void;
  onNewSession?: () => void;
  onRunCommand?: (command: string) => void;
  agentOverride?: CliType | null;
  isActive?: boolean;
  showQuickPrompts?: boolean;
  onToggleQuickPrompts?: () => void;
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
  showQuickPrompts = false,
  onToggleQuickPrompts,
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
      className={`drag-handle flex min-h-8 items-center justify-between border-b px-2 py-1 select-none shrink-0 cursor-grab active:cursor-grabbing ${
        isActive
          ? 'border-[var(--accent-border)] bg-[var(--accent-light)]'
          : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
      }`}
      {...dragListeners}
    >
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <div className="relative flex h-2 w-2 shrink-0">
           <span className={`relative inline-flex h-2 w-2 rounded-full transition-colors duration-200 ${
             isActive ? 'bg-[var(--accent)]' : STATUS_COLORS[session.status]
           }`} />
        </div>

        <span className="shrink-0 text-[10px] font-medium text-[var(--text-primary)]">
          Terminal {session.index + 1}
        </span>

        <div className="mx-0.5 h-3 w-px bg-[var(--border-primary)]" />

        {effectiveAgent ? (
            <div className="flex items-center gap-1.5 min-w-0">
            <div className="flex items-center gap-1 px-1.5 py-0 shrink-0 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] transition-colors duration-150 hover:border-[var(--text-secondary)] group/agent">
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
                  <span className="max-w-[80px] truncate text-[9px] font-medium text-[var(--text-secondary)]">{effectiveAgent}</span>
            </div>
            <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-1 duration-300">
              {cliStatusBadge}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-1.5 py-0 shrink-0 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)]">
            <TerminalWindow size={12} className="text-[var(--text-secondary)]" />
            <span className="text-[9px] font-medium text-[var(--text-secondary)]">Shell</span>
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
          aria-pressed={mouseOn}
          className="app-icon-button relative h-5 w-5 rounded-md border transition-all duration-200 cursor-pointer border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          title={mouseOn
            ? 'Mouse mode enabled (click to disable)'
            : 'Mouse mode disabled (click to enable manually)'}
        >
          <MouseSimple
            size={14}
            weight={mouseOn ? 'fill' : 'regular'}
            aria-hidden="true"
            className={mouseOn ? 'text-emerald-300' : ''}
          />
          <span
            className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full border border-[var(--bg-primary)] transition-colors duration-200 ${
              mouseOn ? 'bg-emerald-300 shadow-[0_0_5px_rgba(110,231,183,0.9)]' : 'bg-[var(--text-secondary)]/45'
            }`}
            aria-hidden="true"
          />
          <span className="sr-only">Mouse mode</span>
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
              className="flex h-5 items-center gap-1 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-1.5 text-[9px] font-medium text-[var(--text-secondary)] transition-colors cursor-pointer hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="Start a new session"
          >
            <Plus size={10} />
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
              className="app-icon-button h-5 w-5 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)]"
              title="Agent commands"
            >
              <ListBullets size={12} />
            </button>
            {commandsOpen && agentCommands.length > 0 && (
              <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-[var(--shadow-float)]">
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-3 py-2">
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                    {effectiveAgent} · Commands
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--text-secondary)]">{agentCommands.length}</span>
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
                      className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-100 hover:bg-[var(--bg-tertiary)] cursor-pointer"
                      title={cmd.description}
                    >
                      <span className="flex items-center justify-center w-4 h-4 shrink-0 text-zinc-500 group-hover:text-cyan-400 transition-colors duration-100">
                        {getCommandIcon(cmd.command)}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-[var(--text-primary)] group-hover:text-[var(--text-primary)]">
                        {cmd.command}
                      </span>
                      <span className="truncate text-[10px] text-[var(--text-secondary)]">
                        {cmd.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {isAiAgent && onToggleQuickPrompts && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleQuickPrompts();
            }}
            className={`app-icon-button h-5 w-5 rounded border transition-all duration-150 cursor-pointer ${
              showQuickPrompts
                ? 'border-[var(--accent-border)] bg-[var(--accent-light)] text-[var(--accent-text)]'
                : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title={showQuickPrompts ? 'Hide quick prompts' : 'Show quick prompts'}
          >
            <Sparkle size={12} />
          </button>
        )}
        <QuickActions sessionId={session.id} workspaceId={session.workspaceId} cwd={session.cwd} />
        <div className="h-3 w-px bg-[var(--border-primary)]" />
        {session.agent && (
          <button
            onClick={onRefreshCli}
            disabled={isRefreshing}
            className="app-icon-button h-5 w-5"
            title="Restart CLI"
          >
            <ArrowClockwise size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="app-icon-button h-5 w-5 hover:bg-rose-500/10 hover:text-rose-400"
            title="Terminate process"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
