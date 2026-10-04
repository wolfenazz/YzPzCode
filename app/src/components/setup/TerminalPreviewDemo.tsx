import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { TerminalWindow, SquaresFour, Stack, Code } from '@phosphor-icons/react';
import { Icon } from '@iconify/react';
import type { AgentFleet, CliType, ToolCliType } from '../../types';

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
import { ADDITIONAL_AGENTS, ADDITIONAL_AGENT_LOGOS } from '../../data/additionalAgents';
import { useAppStore } from '../../stores/appStore';

const AGENT_LOGOS: Record<string, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  antigravity: antigravityLogo,
  opencode: opencodeLogo,
  cursor: cursorLogo,
  kilo: kiloLogo,
  hermes: hermesLogo,
  pi: piLogo,
  commandcode: commandCodeLogo,
  cline: clineLogo,
  grok: grokLogo,
  ...ADDITIONAL_AGENT_LOGOS,
};

const AGENT_META: Record<string, { label: string; color: string; command: string; tagline: string }> = {
  claude: { label: 'Claude', color: '#d97706', command: 'claude', tagline: 'Claude Code CLI ready' },
  codex: { label: 'Codex', color: '#10b981', command: 'codex', tagline: 'Codex AI assistant active' },
  antigravity: { label: 'Antigravity CLI', color: '#2563eb', command: 'agy', tagline: 'Antigravity CLI workspace' },
  opencode: { label: 'OpenCode', color: '#a855f7', command: 'opencode', tagline: 'OpenCode session ready' },
  cursor: { label: 'Cursor', color: '#ec4899', command: 'cursor', tagline: 'Cursor agent active' },
  kilo: { label: 'Kilo', color: '#14b8a6', command: 'kilo', tagline: 'KiloCode harness active' },
  hermes: { label: 'Hermes', color: '#f59e0b', command: 'hermes', tagline: 'Hermes agent session' },
  pi: { label: 'Pi', color: '#71717a', command: 'pi', tagline: 'Pi developer agent ready' },
  commandcode: { label: 'Command Code', color: '#737373', command: 'cmdcode', tagline: 'Command Code harness' },
  cline: { label: 'Cline', color: '#0ea5e9', command: 'cline', tagline: 'Cline autonomous agent' },
  grok: { label: 'Grok', color: '#52525b', command: 'grok', tagline: 'Grok coding model' },
};

const TOOL_INFO: Record<ToolCliType, { label: string; icon: string; color: string }> = {
  gh: { label: 'GitHub', icon: 'simple-icons:github', color: '#ffffff' },
  stripe: { label: 'Stripe', icon: 'simple-icons:stripe', color: '#635BFF' },
  supabase: { label: 'Supabase', icon: 'simple-icons:supabase', color: '#3FCF8E' },
  valyu: { label: 'Valyu', icon: 'simple-icons:search', color: '#F59E0B' },
  posthog: { label: 'PostHog', icon: 'simple-icons:posthog', color: '#1D4AFF' },
  elevenlabs: { label: 'ElevenLabs', icon: 'simple-icons:elevenlabs', color: '#8B5CF6' },
  ramp: { label: 'Ramp', icon: 'simple-icons:creditcard', color: '#1AE65E' },
  gws: { label: 'Google WS', icon: 'simple-icons:google', color: '#4285F4' },
  agentmail: { label: 'AgentMail', icon: 'simple-icons:mailgun', color: '#EC4899' },
  vercel: { label: 'Vercel', icon: 'simple-icons:vercel', color: '#ffffff' },
};

export interface TerminalSlotInfo {
  index: number;
  cli: CliType | null;
  label: string;
  logo?: string;
  icon?: string;
  color: string;
  command: string;
  tagline: string;
  isShell: boolean;
}

const SHELL_COMMANDS = ['pnpm dev', 'git status', 'cargo check', 'npm test', 'vite', 'python app.py', 'docker ps', 'cat README.md'];

function getSlotInfo(index: number, fleet?: AgentFleet): TerminalSlotInfo {
  const allocatedList: CliType[] = [];
  if (fleet?.allocation) {
    for (const [cli, count] of Object.entries(fleet.allocation)) {
      if (typeof count === 'number' && count > 0) {
        for (let i = 0; i < count; i++) {
          allocatedList.push(cli as CliType);
        }
      }
    }
  }

  const assignedCli = allocatedList[index] ?? null;

  if (assignedCli && assignedCli in AGENT_META) {
    const meta = AGENT_META[assignedCli];
    return {
      index,
      cli: assignedCli,
      label: meta.label,
      logo: AGENT_LOGOS[assignedCli],
      color: meta.color,
      command: meta.command,
      tagline: meta.tagline,
      isShell: false,
    };
  }

  if (assignedCli && assignedCli in ADDITIONAL_AGENTS) {
    const add = ADDITIONAL_AGENTS[assignedCli as keyof typeof ADDITIONAL_AGENTS];
    return {
      index,
      cli: assignedCli,
      label: add.label,
      logo: add.logo,
      color: add.color,
      command: assignedCli,
      tagline: add.description,
      isShell: false,
    };
  }

  if (assignedCli && assignedCli in TOOL_INFO) {
    const tool = TOOL_INFO[assignedCli as ToolCliType];
    return {
      index,
      cli: assignedCli,
      label: tool.label,
      icon: tool.icon,
      color: tool.color,
      command: assignedCli,
      tagline: `${tool.label} CLI tool ready`,
      isShell: false,
    };
  }

  const cmd = SHELL_COMMANDS[index % SHELL_COMMANDS.length];
  return {
    index,
    cli: null,
    label: `Terminal ${index + 1}`,
    color: 'var(--accent)',
    command: cmd,
    tagline: 'A shell for your project commands',
    isShell: true,
  };
}

interface TerminalMockWindowProps {
  slot: TerminalSlotInfo;
  sessions: number;
  isActive: boolean;
  onClick: () => void;
  compact?: boolean;
}

function TerminalMockWindow({
  slot,
  sessions,
  isActive,
  onClick,
  compact = false,
}: TerminalMockWindowProps): React.JSX.Element {
  return (
    <div
      onClick={onClick}
      role="button"
      aria-pressed={isActive}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`group relative flex flex-col h-full w-full rounded-lg border text-left cursor-pointer transition-all duration-200 overflow-hidden select-none ${
        isActive
          ? 'border-[var(--accent)] bg-[var(--bg-terminal)]'
          : 'border-[var(--border-primary)] bg-[var(--bg-terminal)] hover:border-[var(--accent)]/50'
      }`}
    >
      {/* Title Bar */}
      <div className="flex h-6 items-center justify-between border-b border-[var(--border-primary)]/70 bg-[var(--bg-secondary)]/90 px-2 text-xs">
        {/* Window controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="h-2 w-2 rounded-full bg-[var(--text-secondary)]/30" />
          <span className="h-2 w-2 rounded-full bg-[var(--text-secondary)]/30" />
          <span className="h-2 w-2 rounded-full bg-[var(--text-secondary)]/30" />
        </div>

        {/* Center Title / Badge */}
        <div className="flex items-center gap-1.5 min-w-0 px-1">
          {slot.logo ? (
            <img src={slot.logo} alt="" className="h-3 w-3 rounded-xs object-contain shrink-0" />
          ) : slot.icon ? (
            <Icon icon={slot.icon} className="h-3 w-3 shrink-0" style={{ color: slot.color }} />
          ) : (
            <TerminalWindow size={11} className="text-[var(--text-secondary)] shrink-0" />
          )}
          <span className="truncate text-[10px] font-medium text-[var(--text-primary)]">
            {slot.label}
          </span>
          <span className="text-[9px] font-mono text-[var(--text-secondary)] opacity-60">
            #{slot.index + 1}
          </span>
        </div>

        {/* Right Status */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          {!compact && sessions <= 2 && (
            <span className="font-mono text-[9px] text-[var(--text-secondary)] opacity-60">
              preview
            </span>
          )}
        </div>
      </div>

      {/* Terminal Screen Body */}
      <div className="flex flex-1 flex-col justify-between p-2 font-mono text-[10px] leading-snug overflow-hidden bg-[var(--bg-terminal)]">
        <div>
          {/* Prompt line */}
          <div className="flex items-center gap-1 text-[#c4c4c4] truncate">
            <span className="font-semibold text-[var(--accent)] shrink-0">yzpz</span>
            <span className="text-[#737373] shrink-0">:</span>
            <span className="text-[var(--text-secondary)] shrink-0">~</span>
            <span className="text-[#8b8b8b] shrink-0">$</span>
            <span className="truncate font-medium text-[#ededed]">{slot.command}</span>
            <span className="inline-block h-2.5 w-1 bg-[var(--accent)] shrink-0 align-middle" />
          </div>

          {/* Subtitle / greeting line */}
          {!compact && (
            <div className="mt-1 flex items-center gap-1 text-[9px] text-[#a3a3a3] truncate">
              <span className="text-[var(--accent)] font-bold shrink-0">✓</span>
              <span className="truncate">{slot.tagline}</span>
            </div>
          )}

          {/* Activity line for 1-2 terminals */}
          {sessions <= 2 && (
            <div className="mt-1 flex items-center justify-between text-[8px] text-[#8b8b8b] truncate">
              <span>Opens when you launch the workspace</span>
              <span className="text-[#737373]">utf-8</span>
            </div>
          )}
        </div>

        {/* Footer pane status */}
        <div className="mt-auto pt-1 flex items-center justify-between border-t border-zinc-800/60 text-[8px] text-[#8b8b8b] select-none">
          <span className="truncate">{slot.isShell ? 'plain shell' : 'agent process'}</span>
          <span className="shrink-0 font-mono">pane {slot.index + 1}/{sessions}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Animated mock of the workspace terminal grid used during setup.
 *
 * It renders the same grid/stacked arrangement the real workspace will use and
 * fills each pane with the agent or tool CLI assigned to it, so users can see
 * the result of their layout + allocation choices before opening the workspace.
 * Purely presentational: it never spawns a process.
 */
interface TerminalPreviewDemoProps {
  sessions: number;
  agentFleet?: AgentFleet;
  onSelectSessions?: (sessions: number) => void;
}

export function TerminalPreviewDemo({
  sessions,
  agentFleet,
}: TerminalPreviewDemoProps): React.JSX.Element {
  const [viewMode, setViewMode] = useState<'grid' | 'stacked'>('grid');
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const animationsEnabled = useAppStore((state) => state.animationsEnabled);
  const reduceMotion = useReducedMotion();
  // Pane transitions respect the app animation toggle and the OS setting.
  const motionEnabled = animationsEnabled && !reduceMotion;

  // One pane per session; the slot knows whether it runs an agent or a plain shell.
  const slots = useMemo<TerminalSlotInfo[]>(() => {
    return Array.from({ length: sessions }, (_, i) => getSlotInfo(i, agentFleet));
  }, [sessions, agentFleet]);

  const allocatedCount = useMemo(() => {
    if (!agentFleet?.allocation) return 0;
    return Object.values(agentFleet.allocation).reduce((sum, count) => sum + count, 0);
  }, [agentFleet]);

  // Adjust focused index if out of bounds
  const currentFocused = Math.min(focusedIndex, Math.max(0, sessions - 1));

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-theme bg-[var(--bg-terminal)]">
      {/* Demo Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-theme/60 bg-[var(--bg-secondary)]/60 px-3.5 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--bg-tertiary)] text-[var(--accent)]">
            <TerminalWindow size={13} weight="bold" />
          </div>
          <span className="text-[11px] font-medium text-[var(--text-primary)]">Layout preview</span>
          <span className="font-mono text-[9px] text-[var(--text-secondary)]">
            {sessions === 0 && '0 Sessions · Editor'}
            {sessions === 1 && '1 Session · Single'}
            {sessions === 2 && (viewMode === 'stacked' ? '2 Sessions · Stacked Behind Each Other' : '2 Sessions · Split')}
            {sessions === 4 && (viewMode === 'stacked' ? '4 Sessions · Cascaded Stack' : '4 Sessions · 2×2 Grid')}
            {sessions === 6 && (viewMode === 'stacked' ? '6 Sessions · Cascaded Stack' : '6 Sessions · 3×2 Grid')}
            {sessions === 8 && (viewMode === 'stacked' ? '8 Sessions · Cascaded Stack' : '8 Sessions · 4×2 Grid')}
          </span>
          {sessions > 0 && allocatedCount > 0 && (
            <span className="hidden sm:inline-block text-[10px] text-[var(--text-secondary)]">
              ({allocatedCount} assigned, {Math.max(0, sessions - allocatedCount)} shell)
            </span>
          )}
        </div>

        {sessions > 1 && (
          <div className="flex items-center gap-1 rounded-lg border border-theme bg-[var(--bg-secondary)] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="View terminals as split grid panes"
            >
              <SquaresFour size={12} weight={viewMode === 'grid' ? 'bold' : 'regular'} />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('stacked')}
              aria-pressed={viewMode === 'stacked'}
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                viewMode === 'stacked'
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="View terminals stacked behind each other"
            >
              <Stack size={12} weight={viewMode === 'stacked' ? 'bold' : 'regular'} />
              <span>Stacked</span>
            </button>
          </div>
        )}
      </div>

      {/* Demo Canvas Canvas */}
      <div className={`relative h-44 w-full overflow-hidden p-3 ${sessions === 0 ? 'bg-[var(--bg-secondary)]' : 'bg-[var(--bg-terminal)]'}`}>
        <AnimatePresence mode="wait">
          {/* CASE 0: No terminals */}
          {sessions === 0 && (
            <motion.div
              key="zero-sessions"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: motionEnabled ? 0.2 : 0 }}
              className="flex h-full w-full flex-col items-center justify-center text-center select-none"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-theme bg-[var(--bg-tertiary)] text-[var(--accent)] mb-2 shadow-sm">
                <Code size={22} weight="bold" />
              </div>
              <p className="text-[11px] font-medium text-[var(--text-primary)]">
                Editor workspace
              </p>
              <p className="mt-0.5 max-w-sm text-[11px] text-[var(--text-secondary)]">
                Your project editor and selected extensions, without terminals.
              </p>
              <span className="mt-2 rounded-md border border-theme bg-[var(--bg-secondary)] px-2.5 py-0.5 font-mono text-[9px] text-[#a3a3a3]">
                Editor only · No terminals
              </span>
            </motion.div>
          )}

          {/* CASE 1: 1 Terminal */}
          {sessions === 1 && (
            <motion.div
              key="one-session"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: motionEnabled ? 0.2 : 0 }}
              className="mx-auto h-full w-full max-w-lg"
            >
              <TerminalMockWindow
                slot={slots[0]}
                sessions={1}
                isActive={true}
                onClick={() => setFocusedIndex(0)}
              />
            </motion.div>
          )}

          {/* CASE 2+: Grid View */}
          {sessions > 1 && viewMode === 'grid' && (
            <motion.div
              key={`grid-${sessions}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: motionEnabled ? 0.2 : 0 }}
              className={`h-full w-full ${
                sessions === 2
                  ? 'grid grid-cols-2 gap-3'
                  : sessions === 4
                  ? 'grid grid-cols-2 grid-rows-2 gap-2'
                  : sessions === 6
                  ? 'grid grid-cols-3 grid-rows-2 gap-2'
                  : 'grid grid-cols-4 grid-rows-2 gap-1.5'
              }`}
            >
              {slots.map((slot) => (
                <div key={slot.index} className="h-full min-h-0">
                  <TerminalMockWindow
                    slot={slot}
                    sessions={sessions}
                    isActive={currentFocused === slot.index}
                    onClick={() => setFocusedIndex(slot.index)}
                    compact={sessions >= 6}
                  />
                </div>
              ))}
            </motion.div>
          )}

          {/* CASE 2+: Stacked View ("behind each other") */}
          {sessions > 1 && viewMode === 'stacked' && (
            <motion.div
              key={`stacked-${sessions}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: motionEnabled ? 0.2 : 0 }}
              className="relative h-full w-full flex items-center justify-center overflow-hidden"
            >
              {/* If 2 terminals: Special 2-card overlapping stage */}
              {sessions === 2 ? (
                <div className="relative h-full w-full max-w-xl">
                  {/* Window 1 (first slot) */}
                  <div
                    style={{
                      position: 'absolute',
                      top: currentFocused === 0 ? '12px' : '4px',
                      left: currentFocused === 0 ? '16px' : '64px',
                      right: currentFocused === 0 ? '64px' : '16px',
                      bottom: currentFocused === 0 ? '12px' : '20px',
                      zIndex: currentFocused === 0 ? 20 : 10,
                      transform: currentFocused === 0 ? 'scale(1)' : 'scale(0.96)',
                      opacity: currentFocused === 0 ? 1 : 0.85,
                      filter: currentFocused === 0 ? 'none' : 'brightness(0.85)',
                      transition: motionEnabled ? 'transform 0.25s ease-out, opacity 0.25s ease-out' : 'none',
                    }}
                  >
                    <TerminalMockWindow
                      slot={slots[0]}
                      sessions={2}
                      isActive={currentFocused === 0}
                      onClick={() => setFocusedIndex(0)}
                    />
                  </div>

                  {/* Window 2 (second slot - behind Window 1) */}
                  <div
                    style={{
                      position: 'absolute',
                      top: currentFocused === 1 ? '12px' : '4px',
                      left: currentFocused === 1 ? '16px' : '64px',
                      right: currentFocused === 1 ? '64px' : '16px',
                      bottom: currentFocused === 1 ? '12px' : '20px',
                      zIndex: currentFocused === 1 ? 20 : 10,
                      transform: currentFocused === 1 ? 'scale(1)' : 'scale(0.96)',
                      opacity: currentFocused === 1 ? 1 : 0.85,
                      filter: currentFocused === 1 ? 'none' : 'brightness(0.85)',
                      transition: motionEnabled ? 'transform 0.25s ease-out, opacity 0.25s ease-out' : 'none',
                    }}
                  >
                    <TerminalMockWindow
                      slot={slots[1]}
                      sessions={2}
                      isActive={currentFocused === 1}
                      onClick={() => setFocusedIndex(1)}
                    />
                  </div>

                  {/* Hint overlay */}
                  <div className="pointer-events-none absolute bottom-1 right-2 z-30 font-mono text-[9px] text-[#8b8b8b] bg-black/40 px-2 py-0.5 rounded-full border border-theme/40">
                    Click a window to bring it forward
                  </div>
                </div>
              ) : (
                /* Multi-window cascade stack for 4, 6, 8 terminals */
                <div className="relative h-full w-full max-w-xl">
                  {slots.map((slot) => {
                    const isFront = currentFocused === slot.index;
                    const step = Math.min(slot.index, 6);
                    const offsetLeft = 12 + step * 20;
                    const offsetTop = 4 + step * 8;
                    const offsetRight = Math.max(12, (sessions - step) * 20);
                    const zIndex = isFront ? 40 : 10 + slot.index;

                    return (
                      <div
                        key={slot.index}
                        style={{
                          position: 'absolute',
                          top: isFront ? '8px' : `${offsetTop}px`,
                          left: isFront ? '12px' : `${offsetLeft}px`,
                          right: isFront ? '12px' : `${offsetRight}px`,
                          bottom: isFront ? '8px' : '16px',
                          zIndex,
                          transform: isFront ? 'scale(1)' : 'scale(0.97)',
                          opacity: isFront ? 1 : 0.88,
                          filter: isFront ? 'none' : 'brightness(0.9)',
                          transition: motionEnabled ? 'transform 0.22s ease-out, opacity 0.22s ease-out' : 'none',
                        }}
                      >
                        <TerminalMockWindow
                          slot={slot}
                          sessions={sessions}
                          isActive={isFront}
                          onClick={() => setFocusedIndex(slot.index)}
                          compact={true}
                        />
                      </div>
                    );
                  })}
                  <div className="pointer-events-none absolute bottom-1 right-2 z-50 font-mono text-[9px] text-[#8b8b8b] bg-black/40 px-2 py-0.5 rounded-full border border-theme/40">
                    Click any window to bring forward
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
