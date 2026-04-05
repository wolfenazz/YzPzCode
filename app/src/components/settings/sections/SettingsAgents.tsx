import React, { useEffect } from 'react';
import { useAppStore } from '../../../stores/appStore';
import { useAgentCli } from '../../../hooks/useAgentCli';
import { AgentCliInfo } from '../../../types';
import claudeLogo from '../../../assets/claude.png';
import codexLogo from '../../../assets/codex.png';
import geminiLogo from '../../../assets/gemini-cli-logo.svg';
import opencodeLogo from '../../../assets/opencode.png';
import cursorLogo from '../../../assets/cursor-ai.png';
import kiloLogo from '../../../assets/kiloCode.gif';
import { SettingsSlider } from '../../common/SettingsSlider';

const AGENT_ICONS: Record<string, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  gemini: geminiLogo,
  opencode: opencodeLogo,
  cursor: cursorLogo,
  kilo: kiloLogo,
};

export const SettingsAgents: React.FC = () => {
  const { cliStatuses, detectAllClis, loading } = useAgentCli();
  const { agentTimeout, setAgentTimeout, authInfos } = useAppStore();

  useEffect(() => {
    detectAllClis();
  }, [detectAllClis]);

  const cliTools = Object.values(cliStatuses).filter((tool): tool is AgentCliInfo => tool !== null);
  const installedCount = cliTools.filter(t => t.status === 'Installed').length;

  return (
    <div className="space-y-8 font-mono">
      <div>
        <h2 className="text-xs font-bold text-cyan-400/70 uppercase tracking-[0.2em] mb-1">
          AI Agents
        </h2>
        <p className="text-[10px] text-zinc-600 uppercase tracking-[0.15em]">
          Manage AI agent CLI tools and configuration
        </p>
      </div>

      <div className="space-y-6">
        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-bold text-cyan-400/70 uppercase tracking-[0.2em]">
            Installed Agents
          </h3>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 font-mono shrink-0">
              {installedCount}/{cliTools.length}
            </span>
            <div className="flex-1 h-1 bg-zinc-800/80 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${cliTools.length > 0 ? (installedCount / cliTools.length) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, rgba(6,182,212,0.4), rgba(6,182,212,0.8))',
                  boxShadow: '0 0 8px rgba(6,182,212,0.3)',
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            {cliTools.map((tool) => (
              <div
                key={tool.agent}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#0a0a0f]/40 border border-[#1a1a2e]/30 hover:border-cyan-500/10 hover:bg-[#0a0a0f]/80 transition-colors duration-200"
              >
                <div className="flex items-center gap-3">
                  {AGENT_ICONS[tool.agent] && (
                    <img
                      src={AGENT_ICONS[tool.agent]}
                      alt={tool.displayName}
                      className="w-5 h-5 object-contain rounded-sm"
                    />
                  )}
                  <div>
                    <p className="text-xs text-zinc-300 font-medium">{tool.displayName}</p>
                    <p className="text-[10px] text-zinc-600">{tool.provider}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${
                      tool.status === 'Installed'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : tool.status === 'Checking'
                        ? 'bg-amber-500/10 text-amber-400/80 border border-amber-500/20'
                        : 'bg-zinc-800/50 text-zinc-600 border border-zinc-700/50'
                    }`}
                  >
                    {tool.status === 'Installed'
                      ? tool.version
                        ? `v${tool.version}`
                        : 'Ready'
                      : tool.status === 'Checking'
                      ? 'Checking...'
                      : 'Not Found'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {loading && (
            <p className="text-[10px] text-cyan-500/60 font-mono animate-pulse">
              Detecting CLI tools...
            </p>
          )}
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-bold text-cyan-400/70 uppercase tracking-[0.2em]">
            Authentication
          </h3>

          <div className="space-y-1.5">
            {cliTools.map((tool) => {
              const auth = authInfos[tool.agent];
              return (
                <div
                  key={tool.agent}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#0a0a0f]/40 border border-[#1a1a2e]/30 hover:border-cyan-500/10 hover:bg-[#0a0a0f]/80 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3">
                    {AGENT_ICONS[tool.agent] && (
                      <img
                        src={AGENT_ICONS[tool.agent]}
                        alt={tool.displayName}
                        className="w-5 h-5 object-contain rounded-sm"
                      />
                    )}
                    <p className="text-xs text-zinc-300 font-medium">{tool.displayName}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${
                      auth?.status === 'Authenticated'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : auth?.status === 'NotAuthenticated'
                        ? 'bg-amber-500/10 text-amber-400/80 border border-amber-500/20'
                        : 'bg-zinc-800/50 text-zinc-600 border border-zinc-700/50'
                    }`}
                  >
                    {auth?.status || 'Unknown'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#0a0a0f]/60 border border-[#1a1a2e]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-bold text-cyan-400/70 uppercase tracking-[0.2em]">
            Timeout
          </h3>

          <SettingsSlider
            label="Agent Response Timeout"
            description="Maximum time to wait for agent response"
            value={agentTimeout}
            displayValue={`${agentTimeout}s`}
            min={60}
            max={600}
            step={30}
            onChange={setAgentTimeout}
          />
        </div>
      </div>
    </div>
  );
};
