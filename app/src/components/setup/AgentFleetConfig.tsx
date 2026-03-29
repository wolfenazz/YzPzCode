import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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

interface AgentFleetConfigProps {
  totalSlots: number;
  onAllocationChange: (fleet: AgentFleet) => void;
  autoFillTrigger?: boolean;
}

const AGENT_INFO: Record<AgentType, { label: string; color: string; logo: string }> = {
  claude: { label: 'Claude', color: 'bg-orange-500', logo: claudeLogo },
  codex: { label: 'Codex', color: 'bg-green-500', logo: codexLogo },
  gemini: { label: 'Gemini', color: 'bg-blue-500', logo: geminiLogo },
  opencode: { label: 'OpenCode', color: 'bg-purple-500', logo: opencodeLogo },
  cursor: { label: 'Cursor', color: 'bg-pink-500', logo: cursorLogo },
};

const ShellOnlyIcon = () => (
  <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

export const AgentFleetConfig: React.FC<AgentFleetConfigProps> = ({
  totalSlots,
  onAllocationChange,
  autoFillTrigger,
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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-600 text-xs">$</span>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-[0.15em]">
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

      {/* Utilization Bar */}
      <UtilizationBar used={allocatedSlots} total={totalSlots} />

      {isOverAllocated && (
        <p className="text-xs text-rose-400/80 mt-1">
          Cannot allocate more slots than available
        </p>
      )}

      {/* Agent Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(AGENT_INFO).map(([agent, info]) => (
          <div
            key={agent}
            className={`group p-3.5 rounded-md border transition-colors duration-150 ${
              enabledAgents.has(agent as AgentType)
                ? 'border-zinc-500 bg-zinc-900/80 hover:border-zinc-400'
                : 'border-zinc-800 bg-zinc-950 opacity-50 hover:opacity-70 hover:border-zinc-700'
            }`}
          >
            {/* Agent Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 flex items-center justify-center border border-zinc-800 rounded overflow-hidden ${agent === 'opencode' ? 'bg-white' : 'bg-zinc-950'}`}>
                  <img
                    src={info.logo}
                    alt={info.label}
                    className="w-5 h-5 object-contain"
                  />
                </div>
                <span className="font-medium text-zinc-300 uppercase tracking-[0.1em] text-xs">{info.label}</span>
              </div>
              <button
                type="button"
                onClick={() => toggleAgent(agent as AgentType)}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 cursor-pointer ${
                  enabledAgents.has(agent as AgentType)
                    ? 'bg-zinc-200'
                    : 'bg-zinc-800 border border-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full transform transition-transform duration-200 ${
                    enabledAgents.has(agent as AgentType)
                      ? 'translate-x-[14px] bg-zinc-900'
                      : 'translate-x-[2px] bg-zinc-500'
                  }`}
                />
              </button>
            </div>

            {/* Status Badge */}
            <div className="mb-3">
              <AgentCliStatusBadge
                cliInfo={cliStatuses[agent as AgentType]}
                onInstall={() => handleInstall(agent as AgentType)}
                installing={installingAgent === agent}
              />
            </div>

            {/* Slot Counter */}
            {enabledAgents.has(agent as AgentType) && (
              <div className="flex items-center justify-center gap-0.5 pt-3 border-t border-zinc-800/60">
                <button
                  type="button"
                  onClick={() =>
                    updateAllocation(agent as AgentType, allocation[agent as AgentType] - 1)
                  }
                  disabled={allocation[agent as AgentType] <= 0}
                  className="w-7 h-7 flex items-center justify-center bg-zinc-950 border border-zinc-800 hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 transition-colors duration-150 cursor-pointer"
                >
                  <span className="text-xs">-</span>
                </button>
                <span className="w-12 text-center font-semibold text-zinc-200 bg-zinc-950 border-y border-zinc-800 h-7 flex items-center justify-center text-xs">
                  {allocation[agent as AgentType]}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateAllocation(agent as AgentType, allocation[agent as AgentType] + 1)
                  }
                  disabled={isOverAllocated}
                  className="w-7 h-7 flex items-center justify-center bg-zinc-950 border border-zinc-800 hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 transition-colors duration-150 cursor-pointer"
                >
                  <span className="text-xs">+</span>
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Shell Only Card */}
        <div
          className={`group p-3.5 rounded-md border transition-colors duration-150 ${
            remainingSlots > 0
              ? 'border-zinc-700 bg-zinc-900/60 hover:border-zinc-600'
              : 'border-zinc-800 bg-zinc-950 opacity-40'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded">
                <ShellOnlyIcon />
              </div>
              <span className="font-medium text-zinc-400 uppercase tracking-[0.1em] text-xs">/bin/sh</span>
            </div>
          </div>

          <div className="flex items-center justify-center py-3">
            <div className="px-4 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-center">
              <span className="text-lg font-semibold text-zinc-300">{remainingSlots}</span>
              <span className="text-[10px] text-zinc-600 ml-1.5 uppercase">slot{remainingSlots !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <p className="text-[10px] text-zinc-600 text-center mt-3 pt-3 border-t border-zinc-800/60">
            Unallocated slots become native shells
          </p>
        </div>
      </div>
    </div>
  );
};
