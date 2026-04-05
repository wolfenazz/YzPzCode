import React, { useEffect } from 'react';
import { useAppStore } from '../../../stores/appStore';
import { useAgentCli } from '../../../hooks/useAgentCli';
import { AgentCliInfo } from '../../../types';

const AGENT_ICONS: Record<string, string> = {
  claude: '🤖',
  codex: '🧠',
  gemini: '💎',
  opencode: '⚡',
  cursor: '🎯',
  kilo: '📊',
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
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-bold text-zinc-100 tracking-widest uppercase mb-1">AI Agents</h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Manage AI agent CLI tools and configuration</p>
      </div>

      <div className="space-y-6">
        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Installed Agents</h3>
          
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] text-zinc-500 font-mono">
              {installedCount}/{cliTools.length} installed
            </span>
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500/60 transition-all duration-300"
                style={{ width: `${cliTools.length > 0 ? (installedCount / cliTools.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            {cliTools.map((tool) => (
              <div
                key={tool.agent}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm">{AGENT_ICONS[tool.agent] || '🔧'}</span>
                  <div>
                    <p className="text-xs text-zinc-300 font-medium">{tool.displayName}</p>
                    <p className="text-[10px] text-zinc-600">{tool.provider}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${
                      tool.status === 'Installed'
                        ? 'bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20'
                        : tool.status === 'Checking'
                        ? 'bg-amber-500/10 text-amber-400/80 border border-amber-500/20'
                        : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                    }`}
                  >
                    {tool.status === 'Installed' ? (tool.version ? `v${tool.version}` : 'Ready') : tool.status === 'Checking' ? 'Checking...' : 'Not Found'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {loading && (
            <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Detecting CLI tools...</p>
          )}
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Authentication</h3>
          
          <div className="space-y-2">
            {cliTools.map((tool) => {
              const auth = authInfos[tool.agent];
              return (
                <div
                  key={tool.agent}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/30 border border-zinc-800/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{AGENT_ICONS[tool.agent] || '🔧'}</span>
                    <p className="text-xs text-zinc-300 font-medium">{tool.displayName}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ${
                      auth?.status === 'Authenticated'
                        ? 'bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20'
                        : auth?.status === 'NotAuthenticated'
                        ? 'bg-amber-500/10 text-amber-400/80 border border-amber-500/20'
                        : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                    }`}
                  >
                    {auth?.status || 'Unknown'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-theme-card/40 border border-theme rounded-lg p-5 space-y-5">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wide">Timeout</h3>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-300">Agent Response Timeout</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Maximum time to wait for agent response</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="60"
                max="600"
                step="30"
                value={agentTimeout}
                onChange={(e) => setAgentTimeout(Number(e.target.value))}
                className="w-24 accent-zinc-400"
              />
              <span className="text-xs text-zinc-400 w-16 text-right">{agentTimeout}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
