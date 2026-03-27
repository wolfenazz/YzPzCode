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
  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      // Re-enable after a short delay
      setTimeout(() => {
        isLaunchingRef.current = false;
      }, 1000);
    }
  };

  return (
    <div className="w-full space-y-4 font-mono">
      <div className="flex items-center justify-between pointer-events-none mb-2">
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="text-zinc-600 text-sm">$</span>
          <label className="block text-sm font-medium text-zinc-400">
            fleet_allocation
          </label>
          <HelpTooltip text="Assign AI CLI agents to your terminal slots. Enable an agent, then set how many terminals should run it. Remaining slots open as plain shells." />
          {(isRefreshing || cliLoading) && (
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-emerald-500 rounded-full animate-cli-dot" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-emerald-500 rounded-full animate-cli-dot" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-emerald-500 rounded-full animate-cli-dot" style={{ animationDelay: '300ms' }} />
              </span>
              <span className="animate-pulse">scanning</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={`pointer-events-auto relative p-1.5 rounded-sm border border-zinc-800 transition-all duration-300 cursor-pointer ${
            isRefreshing
              ? 'border-zinc-700 bg-zinc-900 text-emerald-400'
              : 'hover:bg-zinc-800 hover:border-zinc-600 text-zinc-500 hover:text-zinc-200'
          }`}
          title="Refresh CLI detection"
        >
          <svg
            className={`w-4 h-4 ${isRefreshing ? 'animate-spin-slow' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isRefreshing && (
            <svg className="absolute inset-0 w-full h-full text-emerald-400 opacity-0 animate-cli-ring" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
            </svg>
          )}
        </button>
      </div>
      <UtilizationBar used={allocatedSlots} total={totalSlots} />
      {isOverAllocated && (
        <p className="text-sm text-rose-500 mt-2">
          [ERR] Cannot allocate more slots than available
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(AGENT_INFO).map(([agent, info]) => (
          <div
            key={agent}
            className={`group p-4 rounded-sm border transition-all duration-300 ease-out ${enabledAgents.has(agent as AgentType)
              ? 'border-zinc-400 bg-zinc-900 border-solid hover:border-zinc-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:-translate-y-0.5'
              : 'border-zinc-800 bg-zinc-950 border-dashed opacity-60 hover:opacity-80 hover:border-zinc-700'
              }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-1.5 border border-zinc-800 rounded-sm transition-transform duration-300 group-hover:scale-110 ${agent === 'opencode' ? 'bg-white' : 'bg-zinc-950'}`}>
                  <img
                    src={info.logo}
                    alt={info.label}
                    className="w-6 h-6 object-contain transition-transform duration-200"
                  />
                </div>
                <span className="font-bold text-zinc-200 uppercase tracking-widest text-sm transition-colors duration-200 group-hover:text-white">{info.label}</span>
              </div>
              <button
                type="button"
                onClick={() => toggleAgent(agent as AgentType)}
                className={`relative inline-flex h-5 w-9 items-center rounded-none transition-all duration-300 border ${enabledAgents.has(agent as AgentType)
                  ? 'bg-zinc-200 border-zinc-200 hover:bg-white'
                  : 'bg-zinc-950 border-zinc-700 hover:border-zinc-500'
                  }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform transition-all duration-300 ease-out ${enabledAgents.has(agent as AgentType)
                    ? 'translate-x-[18px] bg-zinc-900'
                    : 'translate-x-1 bg-zinc-600 group-hover:bg-zinc-500'
                    }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between mb-4 mt-2">
              <AgentCliStatusBadge
                cliInfo={cliStatuses[agent as AgentType]}
                onInstall={() => handleInstall(agent as AgentType)}
                installing={installingAgent === agent}
              />
            </div>

            {enabledAgents.has(agent as AgentType) && (
              <div className="flex items-center justify-center gap-1 mt-4 pt-4 border-t border-zinc-800/50">
                <button
                  type="button"
                  onClick={() =>
                    updateAllocation(agent as AgentType, allocation[agent as AgentType] - 1)
                  }
                  disabled={allocation[agent as AgentType] <= 0}
                  className="w-8 h-8 flex items-center justify-center bg-zinc-950 border border-zinc-800 hover:border-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-zinc-400 transition-all duration-200 active:scale-95"
                >
                  -
                </button>
                <span className="w-16 text-center font-bold text-zinc-100 bg-zinc-950 border-y border-zinc-800 h-8 flex items-center justify-center transition-colors duration-200 group-hover:border-zinc-700">
                  {allocation[agent as AgentType]}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateAllocation(agent as AgentType, allocation[agent as AgentType] + 1)
                  }
                  disabled={isOverAllocated}
                  className="w-8 h-8 flex items-center justify-center bg-zinc-950 border border-zinc-800 hover:border-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-zinc-400 transition-all duration-200 active:scale-95"
                >
                  +
                </button>
              </div>
            )}
          </div>
        ))}

        <div
          className={`group p-4 rounded-sm border transition-all duration-300 ease-out ${remainingSlots > 0
            ? 'border-zinc-600 bg-zinc-900 border-dashed hover:border-zinc-500 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:-translate-y-0.5'
            : 'border-zinc-800 bg-zinc-950 border-dotted opacity-50'
            }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-zinc-950 border border-zinc-800 rounded-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                <ShellOnlyIcon />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-zinc-300 uppercase tracking-widest text-sm transition-colors duration-200 group-hover:text-white">/bin/sh</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center mt-6 mb-4">
            <div className="px-6 py-2 bg-zinc-950 border border-zinc-800 rounded-sm text-center min-w-[120px] transition-all duration-200 group-hover:border-zinc-700 group-hover:bg-zinc-900">
              <span className="text-xl font-bold text-zinc-200 transition-colors duration-200 group-hover:text-white">{remainingSlots}</span>
              <span className="text-xs text-zinc-500 ml-2 uppercase transition-colors duration-200 group-hover:text-zinc-400">slot{remainingSlots !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <p className="text-xs text-zinc-500 text-center mt-4 pt-4 border-t border-zinc-800/50 transition-colors duration-200 group-hover:text-zinc-400">
            Unallocated slots -&gt; native shells
          </p>
        </div>
      </div>
    </div>
  );
};
