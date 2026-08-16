import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '@iconify/react';
import { motion } from 'framer-motion';
import { CliType, AgentType, ToolCliType, AgentFleet } from '../../types';
import { useAgentAllocation } from '../../hooks/useAgentAllocation';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useToolCli } from '../../hooks/useToolCli';
import { useAppStore } from '../../stores/appStore';
import { UtilizationBar } from '../common/UtilizationBar';
import { HelpTooltip } from '../common/HelpTooltip';
import { AgentCliStatusBadge } from './AgentCliStatusBadge';

import claudeLogo from '../../assets/claude.png';
import codexLogo from '../../assets/codex.png';
import geminiLogo from '../../assets/gemini-cli-logo.svg';
import opencodeLogo from '../../assets/opencode.png';
import cursorLogo from '../../assets/cursor-ai.png';
import kiloLogo from '../../assets/kiloCode.gif';
import hermesLogo from '../../assets/Hermes-logo.png';
import piLogo from '../../assets/pi.svg';
import commandCodeLogo from '../../assets/commandcode-logo.svg';

interface AgentFleetConfigProps {
  totalSlots: number;
  onAllocationChange: (fleet: AgentFleet) => void;
  autoFillTrigger?: boolean;
  templateAllocation?: Record<CliType, number> | null;
  selectedTemplateId?: string;
}

const AGENT_INFO: Record<AgentType, { label: string; color: string; logo: string }> = {
  claude: { label: 'Claude', color: 'bg-orange-500', logo: claudeLogo },
  codex: { label: 'Codex', color: 'bg-green-500', logo: codexLogo },
  gemini: { label: 'Gemini', color: 'bg-blue-500', logo: geminiLogo },
  opencode: { label: 'OpenCode', color: 'bg-purple-500', logo: opencodeLogo },
  cursor: { label: 'Cursor', color: 'bg-pink-500', logo: cursorLogo },
  kilo: { label: 'Kilo', color: 'bg-teal-500', logo: kiloLogo },
  hermes: { label: 'Hermes', color: 'bg-amber-500', logo: hermesLogo },
  pi: { label: 'Pi', color: 'bg-zinc-500', logo: piLogo },
  commandcode: { label: 'Command Code', color: 'bg-neutral-500', logo: commandCodeLogo },
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

const ShellOnlyIcon = () => (
  <svg className="w-7 h-7 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

interface CliCardProps {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  isEnabled: boolean;
  isInTemplate: boolean;
  count: number;
  isOverAllocated: boolean;
  cliStatusBadge: React.ReactNode;
  onToggle: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}

const CliCard: React.FC<CliCardProps> = ({
  label,
  sublabel,
  icon,
  isEnabled,
  isInTemplate,
  count,
  isOverAllocated,
  cliStatusBadge,
  onToggle,
  onIncrement,
  onDecrement,
}) => (
  <div
    className={`group p-4 rounded-lg border transition-all duration-200 ${
      isInTemplate
        ? 'border-zinc-400/50 bg-zinc-900/90 shadow-[0_0_24px_rgba(161,161,170,0.06)] ring-1 ring-zinc-500/20'
        : isEnabled
          ? 'border-zinc-500/70 bg-zinc-900/80 hover:border-zinc-400 shadow-[0_0_16px_rgba(161,161,170,0.03)]'
          : 'border-zinc-800/70 bg-zinc-950/50 opacity-50 hover:opacity-70 hover:border-zinc-700'
    }`}
  >
    <div className="flex items-center justify-between mb-3.5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 flex items-center justify-center border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-200 uppercase tracking-[0.1em] text-sm block">{label}</span>
            {isInTemplate && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-700/50 text-[8px] text-zinc-400 font-mono uppercase tracking-wider">tpl</span>
            )}
          </div>
          <span className="text-[9px] text-zinc-600 font-mono">{sublabel}</span>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        aria-label={`Toggle ${label}`}
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 cursor-pointer ${
          isEnabled ? 'bg-zinc-200' : 'bg-zinc-800 border border-zinc-700'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full transform transition-transform duration-200 ${
            isEnabled ? 'translate-x-[18px] bg-zinc-900' : 'translate-x-[2px] bg-zinc-500'
          }`}
        />
      </button>
    </div>

    <div className="mb-3">
      {cliStatusBadge}
    </div>

    {isEnabled && (
      <div className="flex items-center justify-center gap-1 pt-3.5 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={onDecrement}
          disabled={count <= 0}
          className="w-8 h-8 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-lg hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 transition-colors duration-150 cursor-pointer"
        >
          <span className="text-sm font-mono">-</span>
        </button>
        <span className="w-14 text-center font-bold text-zinc-200 bg-zinc-950 border-y border-zinc-800 h-8 flex items-center justify-center text-sm font-mono overflow-hidden relative">
          <motion.span
            key={count}
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {count}
          </motion.span>
        </span>
        <button
          type="button"
          onClick={onIncrement}
          disabled={isOverAllocated}
          className="w-8 h-8 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-lg hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 transition-colors duration-150 cursor-pointer"
        >
          <span className="text-sm font-mono">+</span>
        </button>
      </div>
    )}
  </div>
);

export const AgentFleetConfig: React.FC<AgentFleetConfigProps> = ({
  totalSlots,
  onAllocationChange,
  autoFillTrigger,
  templateAllocation,
  selectedTemplateId,
}) => {
  const {
    allocation,
    enabledAgents,
    allocatedSlots,
    isOverAllocated,
    updateAllocation,
    toggleAgent,
    getAgentFleet,
    autoFillFromInstalled,
    distributeEvenly,
    setAllocationFromTemplate,
  } = useAgentAllocation(totalSlots);

  const {
    cliStatuses,
    detectAllClis,
    openInstallTerminal,
    installProgress,
    loading: cliLoading,
  } = useAgentCli();

  const {
    toolCliStatuses,
    detectAllToolClis,
    openToolInstallTerminal,
    loading: toolLoading,
  } = useToolCli();

  const [installingCli, setInstallingCli] = React.useState<CliType | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const remainingSlots = Math.max(0, totalSlots - allocatedSlots);

  useEffect(() => {
    detectAllClis();
    detectAllToolClis();
  }, [detectAllClis, detectAllToolClis]);

  useEffect(() => {
    if (installProgress && (installProgress.stage === 'Completed' || installProgress.stage === 'Failed')) {
      setInstallingCli(null);
    }
  }, [installProgress]);

  useEffect(() => {
    if (templateAllocation) {
      setAllocationFromTemplate(templateAllocation);
    }
  }, [selectedTemplateId, templateAllocation, setAllocationFromTemplate]);

  useEffect(() => {
    onAllocationChange(getAgentFleet());
  }, [allocation, totalSlots, onAllocationChange, getAgentFleet]);

  useEffect(() => {
    if (!autoFillTrigger) return;
    let cancelled = false;
    (async () => {
      await detectAllClis();
      if (cancelled) return;
      const latestStatuses = useAppStore.getState().cliStatuses;
      autoFillFromInstalled(latestStatuses);
    })();
    return () => { cancelled = true; };
  }, [autoFillTrigger, detectAllClis, autoFillFromInstalled]);

  const isLaunchingRef = React.useRef(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await invoke('clear_cli_cache');
      await detectAllClis();
      await detectAllToolClis();
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const handleInstall = async (cli: CliType) => {
    if (isLaunchingRef.current) return;
    isLaunchingRef.current = true;
    setInstallingCli(cli);
    try {
      const agentTypes: AgentType[] = ['claude', 'codex', 'gemini', 'opencode', 'cursor', 'kilo', 'hermes', 'pi', 'commandcode'];
      if (agentTypes.includes(cli as AgentType)) {
        await openInstallTerminal(cli as AgentType);
      } else {
        await openToolInstallTerminal(cli as ToolCliType);
      }
    } finally {
      setTimeout(() => {
        isLaunchingRef.current = false;
        setInstallingCli(null);
      }, 1000);
    }
  };

  return (
    <div className="space-y-4 font-mono">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 text-xs font-mono">$</span>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-[0.15em] font-mono">
            Fleet Allocation
          </label>
          <HelpTooltip text="Assign CLI agents and tools to your terminal slots. Enable a CLI, then set how many terminals should run it. Remaining slots open as plain shells." />
          {(isRefreshing || cliLoading || toolLoading) && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-600">
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-zinc-500 rounded-full animate-cli-dot" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-zinc-500 rounded-full animate-cli-dot" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-zinc-500 rounded-full animate-cli-dot" style={{ animationDelay: '300ms' }} />
              </span>
              <span>scanning</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={distributeEvenly}
            disabled={enabledAgents.size === 0}
            className="relative p-1.5 rounded border border-zinc-800 transition-colors duration-150 cursor-pointer hover:bg-zinc-800 hover:border-zinc-600 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-zinc-800 disabled:hover:text-zinc-500"
            title="Distribute evenly among enabled CLIs"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`relative p-1.5 rounded border border-zinc-800 transition-colors duration-150 cursor-pointer ${
              isRefreshing
                ? 'border-zinc-700 bg-zinc-900 text-zinc-400'
                : 'hover:bg-zinc-800 hover:border-zinc-600 text-zinc-500 hover:text-zinc-300'
            }`}
            title="Refresh CLI detection"
          >
            <svg
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin-slow' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <UtilizationBar used={allocatedSlots} total={totalSlots} />

      {isOverAllocated && (
        <p className="text-xs text-rose-400/80 mt-1">
          Cannot allocate more slots than available
        </p>
      )}

      {/* AI Agent Cards Grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-3 h-3 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.15em]">AI Agents</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.entries(AGENT_INFO) as [AgentType, typeof AGENT_INFO[AgentType]][]).map(([agent, info]) => {
            const isInTemplate = selectedTemplateId
              && selectedTemplateId !== 'custom'
              && templateAllocation
              && (templateAllocation[agent] ?? 0) > 0;
            return (
              <CliCard
                key={agent}
                label={info.label}
                sublabel={`agent::${agent}`}
                icon={
                  <img
                    src={info.logo}
                    alt={info.label}
                    className={`w-7 h-7 object-contain ${agent === 'opencode' ? 'bg-white rounded-sm' : ''}`}
                  />
                }
                isEnabled={enabledAgents.has(agent)}
                isInTemplate={!!isInTemplate}
                count={allocation[agent]}
                isOverAllocated={isOverAllocated}
                cliStatusBadge={
                  <AgentCliStatusBadge
                    cliInfo={cliStatuses[agent]}
                    onInstall={() => handleInstall(agent)}
                    installing={installingCli === agent}
                  />
                }
                onToggle={() => toggleAgent(agent)}
                onIncrement={() => updateAllocation(agent, allocation[agent] + 1)}
                onDecrement={() => updateAllocation(agent, allocation[agent] - 1)}
              />
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-zinc-800/40" />
        <div className="flex items-center gap-2">
          <svg className="w-3 h-3 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-.756-.426-.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em]">Tool CLIs</span>
        </div>
        <div className="flex-1 h-px bg-zinc-800/40" />
      </div>

      {/* Tool CLI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(Object.entries(TOOL_INFO) as [ToolCliType, typeof TOOL_INFO[ToolCliType]][]).map(([tool, info]) => {
          const isInTemplate = selectedTemplateId
            && selectedTemplateId !== 'custom'
            && templateAllocation
            && (templateAllocation[tool] ?? 0) > 0;
          const toolStatus = toolCliStatuses[tool];
          const isInstalled = toolStatus?.status === 'Installed';
          return (
            <CliCard
              key={tool}
              label={info.label}
              sublabel={`tool::${tool}`}
              icon={
                <div className="w-7 h-7 flex items-center justify-center">
                  <Icon icon={info.icon} style={{ color: info.color }} className="w-5 h-5" />
                </div>
              }
              isEnabled={enabledAgents.has(tool)}
              isInTemplate={!!isInTemplate}
              count={allocation[tool]}
              isOverAllocated={isOverAllocated}
              cliStatusBadge={
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm font-mono text-[10px] uppercase ${
                    isInstalled
                      ? 'bg-emerald-950/30 border border-emerald-900/50 text-emerald-400'
                      : toolStatus?.status === 'Checking'
                        ? 'bg-zinc-900 border border-zinc-800 text-zinc-400 animate-pulse'
                        : 'bg-rose-950/30 border border-rose-900/50 text-rose-400'
                  }`}
                >
                  {isInstalled ? (
                    <>
                      <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {toolStatus?.version ? `v${toolStatus.version}` : 'Installed'}
                    </>
                  ) : !isInstalled && !toolStatus?.status || toolStatus?.status === 'NotInstalled' ? (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleInstall(tool); }}
                        disabled={installingCli === tool}
                        className="hover:text-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {installingCli === tool ? 'Installing...' : 'Install'}
                      </button>
                    </>
                  ) : (
                    'Checking...'
                  )}
                </span>
              }
              onToggle={() => toggleAgent(tool)}
              onIncrement={() => updateAllocation(tool, allocation[tool] + 1)}
              onDecrement={() => updateAllocation(tool, allocation[tool] - 1)}
            />
          );
        })}
      </div>

      {/* Shell Only Card */}
      <div
        className={`group p-4 rounded-lg border transition-all duration-200 ${
          remainingSlots > 0
            ? 'border-zinc-700/70 bg-zinc-900/60 hover:border-zinc-600 shadow-[0_0_16px_rgba(161,161,170,0.02)]'
            : 'border-zinc-800/70 bg-zinc-950/50 opacity-40'
        }`}
      >
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-xl">
              <ShellOnlyIcon />
            </div>
            <div>
              <span className="font-semibold text-zinc-300 uppercase tracking-[0.1em] text-sm block">/bin/sh</span>
              <span className="text-[9px] text-zinc-600 font-mono">shell::native</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center py-4">
          <div className="px-5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-center">
            <span className="text-xl font-bold text-zinc-300 font-mono relative">
              <motion.span
                key={remainingSlots}
                initial={{ y: -12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {remainingSlots}
              </motion.span>
            </span>
            <span className="text-[10px] text-zinc-600 ml-2 uppercase font-mono">slot{remainingSlots !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <p className="text-[10px] text-zinc-600 text-center mt-3 pt-3.5 border-t border-zinc-800/60 font-mono">
          Unallocated slots become native shells
        </p>
      </div>
    </div>
  );
};
