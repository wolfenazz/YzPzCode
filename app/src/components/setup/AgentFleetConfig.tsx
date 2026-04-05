import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { AgentType, AgentFleet } from '../../types';
import { useAgentAllocation } from '../../hooks/useAgentAllocation';
import { useAgentCli } from '../../hooks/useAgentCli';
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

interface AgentFleetConfigProps {
  totalSlots: number;
  onAllocationChange: (fleet: AgentFleet) => void;
  autoFillTrigger?: boolean;
  templateAllocation?: Record<AgentType, number> | null;
  selectedTemplateId?: string;
}

const AGENT_INFO: Record<AgentType, { label: string; color: string; logo: string }> = {
  claude: { label: 'Claude', color: 'bg-orange-500', logo: claudeLogo },
  codex: { label: 'Codex', color: 'bg-green-500', logo: codexLogo },
  gemini: { label: 'Gemini', color: 'bg-blue-500', logo: geminiLogo },
  opencode: { label: 'OpenCode', color: 'bg-purple-500', logo: opencodeLogo },
  cursor: { label: 'Cursor', color: 'bg-pink-500', logo: cursorLogo },
  kilo: { label: 'Kilo', color: 'bg-teal-500', logo: kiloLogo },
};

const ShellOnlyIcon = () => (
  <svg className="w-7 h-7 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
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

  const [installingAgent, setInstallingAgent] = React.useState<AgentType | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const remainingSlots = Math.max(0, totalSlots - allocatedSlots);

  useEffect(() => {
    detectAllClis();
  }, [detectAllClis]);

  useEffect(() => {
    if (installProgress && installProgress.stage === 'Completed') {
      setInstallingAgent(null);
    }
    if (installProgress && installProgress.stage === 'Failed') {
      setInstallingAgent(null);
    }
  }, [installProgress]);

  useEffect(() => {
    if (templateAllocation) {
      setAllocationFromTemplate(templateAllocation);
      onAllocationChange({ totalSlots, allocation: templateAllocation });
    } else {
      onAllocationChange(getAgentFleet());
    }
  }, [templateAllocation, totalSlots, onAllocationChange, setAllocationFromTemplate, getAgentFleet]);

  useEffect(() => {
    if (templateAllocation) return;
    onAllocationChange(getAgentFleet());
  }, [allocation, totalSlots, onAllocationChange, getAgentFleet, templateAllocation]);

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
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const handleInstall = async (agent: AgentType) => {
    if (isLaunchingRef.current) return;

    isLaunchingRef.current = true;
    try {
      await openInstallTerminal(agent);
    } finally {
      setTimeout(() => {
        isLaunchingRef.current = false;
      }, 1000);
    }
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 text-xs font-mono">$</span>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-[0.15em] font-mono">
            Fleet Allocation
          </label>
          <HelpTooltip text="Assign AI CLI agents to your terminal slots. Enable an agent, then set how many terminals should run it. Remaining slots open as plain shells." />
          {(isRefreshing || cliLoading) && (
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
            title="Distribute evenly among enabled agents"
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

      {/* Utilization Bar */}
      <UtilizationBar used={allocatedSlots} total={totalSlots} />

      {isOverAllocated && (
        <p className="text-xs text-rose-400/80 mt-1">
          Cannot allocate more slots than available
        </p>
      )}

      {/* Agent Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(AGENT_INFO).map(([agent, info]) => {
          const isInTemplate = selectedTemplateId
            && selectedTemplateId !== 'custom'
            && templateAllocation
            && (templateAllocation[agent as AgentType] ?? 0) > 0;
          return (
            <div
              key={agent}
              className={`group p-4 rounded-lg border transition-all duration-200 ${
                isInTemplate
                  ? 'border-zinc-400/50 bg-zinc-900/90 shadow-[0_0_24px_rgba(161,161,170,0.06)] ring-1 ring-zinc-500/20'
                  : enabledAgents.has(agent as AgentType)
                    ? 'border-zinc-500/70 bg-zinc-900/80 hover:border-zinc-400 shadow-[0_0_16px_rgba(161,161,170,0.03)]'
                    : 'border-zinc-800/70 bg-zinc-950/50 opacity-50 hover:opacity-70 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 flex items-center justify-center border border-zinc-800 rounded-xl overflow-hidden ${agent === 'opencode' ? 'bg-white' : 'bg-zinc-950'}`}>
                    <img
                      src={info.logo}
                      alt={info.label}
                      className="w-7 h-7 object-contain"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-200 uppercase tracking-[0.1em] text-sm block">{info.label}</span>
                      {isInTemplate && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-700/50 text-[8px] text-zinc-400 font-mono uppercase tracking-wider">tpl</span>
                      )}
                    </div>
                    <span className="text-[9px] text-zinc-600 font-mono">agent::{agent}</span>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabledAgents.has(agent as AgentType)}
                  aria-label={`Toggle ${info.label}`}
                  onClick={() => toggleAgent(agent as AgentType)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 cursor-pointer ${
                    enabledAgents.has(agent as AgentType)
                      ? 'bg-zinc-200'
                      : 'bg-zinc-800 border border-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full transform transition-transform duration-200 ${
                      enabledAgents.has(agent as AgentType)
                        ? 'translate-x-[18px] bg-zinc-900'
                        : 'translate-x-[2px] bg-zinc-500'
                    }`}
                  />
                </button>
              </div>

              <div className="mb-3">
                <AgentCliStatusBadge
                  cliInfo={cliStatuses[agent as AgentType]}
                  onInstall={() => handleInstall(agent as AgentType)}
                  installing={installingAgent === agent}
                />
              </div>

              {enabledAgents.has(agent as AgentType) && (
                <div className="flex items-center justify-center gap-1 pt-3.5 border-t border-zinc-800/60">
                  <button
                    type="button"
                    onClick={() =>
                      updateAllocation(agent as AgentType, allocation[agent as AgentType] - 1)
                    }
                    disabled={allocation[agent as AgentType] <= 0}
                    className="w-8 h-8 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-lg hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 transition-colors duration-150 cursor-pointer"
                  >
                    <span className="text-sm font-mono">-</span>
                  </button>
                  <span className="w-14 text-center font-bold text-zinc-200 bg-zinc-950 border-y border-zinc-800 h-8 flex items-center justify-center text-sm font-mono overflow-hidden relative">
                    <motion.span
                      key={allocation[agent as AgentType]}
                      initial={{ y: -12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      {allocation[agent as AgentType]}
                    </motion.span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateAllocation(agent as AgentType, allocation[agent as AgentType] + 1)
                    }
                    disabled={isOverAllocated}
                    className="w-8 h-8 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-lg hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 transition-colors duration-150 cursor-pointer"
                  >
                    <span className="text-sm font-mono">+</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}

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
    </div>
  );
};
