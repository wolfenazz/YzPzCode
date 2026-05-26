import React from 'react';
import { Icon } from '@iconify/react';
import { CliType, AgentType, ToolCliType, TerminalSession } from '../../types';
import { QuickActions } from './QuickActions';

import claudeLogo from '../../assets/claude.png';
import codexLogo from '../../assets/codex.png';
import geminiLogo from '../../assets/gemini-cli-logo.svg';
import opencodeLogo from '../../assets/opencode.png';
import cursorLogo from '../../assets/cursor-ai.png';
import kiloLogo from '../../assets/kiloCode.gif';
import hermesLogo from '../../assets/Hermes-logo.png';

export const AGENT_LOGOS: Record<AgentType, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  gemini: geminiLogo,
  opencode: opencodeLogo,
  cursor: cursorLogo,
  kilo: kiloLogo,
  hermes: hermesLogo,
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

const isAgentType = (cli: CliType): cli is AgentType => cli in AGENT_LOGOS;

const STATUS_COLORS = {
  idle: 'bg-zinc-600',
  running: 'bg-emerald-500',
  error: 'bg-rose-500',
};

interface TerminalHeaderProps {
  session: TerminalSession;
  theme: 'dark' | 'light';
  onRefreshCli: () => void;
  isRefreshing: boolean;
  onClose?: () => void;
  cliStatusBadge: React.ReactNode;
  dragListeners?: Record<string, unknown>;
  mouseTrackingEnabled?: boolean;
  onToggleMouseTracking?: () => void;
}

export const TerminalHeader: React.FC<TerminalHeaderProps> = ({
  session,
  theme,
  onRefreshCli,
  isRefreshing,
  onClose,
  cliStatusBadge,
  dragListeners,
  mouseTrackingEnabled = false,
  onToggleMouseTracking,
}) => {
  const isLight = theme === 'light';

  return (
    <div
      className={`drag-handle flex items-center justify-between px-3 py-1.5 select-none shrink-0 cursor-grab active:cursor-grabbing ${
        isLight
          ? 'bg-zinc-800 border-b border-zinc-700/80'
          : 'bg-zinc-900 border-b border-zinc-800/80'
      }`}
      {...dragListeners}
    >
      <div className="flex items-center gap-3 min-w-0 overflow-hidden">
        <div className="relative flex h-2 w-2 shrink-0">
           <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${
             session.status === 'running' ? 'bg-emerald-400' : session.status === 'error' ? 'bg-rose-400' : 'bg-zinc-400'
           }`}></span>
           <span className={`relative inline-flex rounded-full h-2 w-2 ${STATUS_COLORS[session.status]}`}></span>
        </div>
        
        <span className={`text-[10px] font-black tracking-[0.2em] uppercase shrink-0 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
          TTY::{session.index + 1}
        </span>

        <div className="h-3 w-px bg-zinc-700/50 mx-1" />

        {session.agent ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md shrink-0 border transition-all duration-300 ${
              isLight ? 'bg-zinc-800/90 border-zinc-700' : 'bg-zinc-950/90 border-zinc-800 hover:border-zinc-700 group/agent'
            }`}>
              {isAgentType(session.agent) ? (
                session.agent === 'claude' ? (
                  <Icon
                    icon="simple-icons:anthropic"
                    className="w-3 h-3 transition-transform group-hover/agent:scale-110"
                    style={{ color: '#D97757' }}
                  />
                ) : (
                  <img
                    src={AGENT_LOGOS[session.agent]}
                    alt={session.agent}
                    className={`w-3 h-3 object-contain transition-transform group-hover/agent:scale-110 ${session.agent === 'opencode' || session.agent === 'cursor' || session.agent === 'codex'
                        ? isLight
                          ? 'invert brightness-[3.5] contrast-[1.5]'
                          : 'invert brightness-[3.5] contrast-[1.5]'
                        : isLight
                          ? 'brightness-[2.2] contrast-[1.2]'
                          : 'brightness-[2.2] contrast-[1.2]'
                      }`}
                  />
                )
              ) : (
                <Icon
                  icon={TOOL_ICON_MAP[session.agent as ToolCliType].icon}
                  style={{ color: TOOL_ICON_MAP[session.agent as ToolCliType].color }}
                  className="w-3 h-3"
                />
              )}
              <span className={`text-[9px] uppercase font-black tracking-widest truncate max-w-[80px] ${
                isLight ? 'text-zinc-300' : 'text-zinc-400'
              }`}>{session.agent}</span>
            </div>
            <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-1 duration-300">
              {cliStatusBadge}
            </div>
          </div>
        ) : (
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md shrink-0 border ${
            isLight ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-950 border-zinc-800'
          }`}>
            <svg className={`w-3 h-3 ${isLight ? 'text-zinc-500' : 'text-zinc-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-zinc-500' : 'text-zinc-600'}`}>CORE::SHELL</span>
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
          className={`px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
            mouseTrackingEnabled
              ? (isLight
                  ? 'bg-emerald-900/45 border-emerald-700 text-emerald-300'
                  : 'bg-emerald-950/45 border-emerald-800 text-emerald-400')
              : (isLight
                  ? 'bg-rose-900/35 border-rose-700 text-rose-300 hover:bg-rose-900/50'
                  : 'bg-rose-950/35 border-rose-900 text-rose-400 hover:bg-rose-950/50')
          }`}
          title={mouseTrackingEnabled ? 'Mouse mode enabled (click to disable)' : 'Mouse mode disabled (click to enable manually)'}
        >
          Mouse {mouseTrackingEnabled ? 'On' : 'Off'}
        </button>
        <QuickActions sessionId={session.id} workspaceId={session.workspaceId} cwd={session.cwd} theme={theme} />
        <div className="h-3 w-px bg-zinc-700/50" />
        {session.agent && (
          <button
            onClick={onRefreshCli}
            disabled={isRefreshing}
            className={`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isLight
                ? 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50'
            }`}
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
            className={`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 cursor-pointer ${
              isLight
                ? 'text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30'
                : 'text-zinc-600 hover:text-rose-400 hover:bg-rose-950/30'
            }`}
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
