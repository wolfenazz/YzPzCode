import React, { useEffect, useState, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { useAppStore } from '../../../stores/appStore';
import { useAgentCli } from '../../../hooks/useAgentCli';
import { useToolCli } from '../../../hooks/useToolCli';
import { AgentCliInfo, AgentType, ToolCliType } from '../../../types';
import { SettingsSlider } from '../../common/SettingsSlider';
import claudeLogo from '../../../assets/claude.png';
import codexLogo from '../../../assets/codex.png';
import geminiLogo from '../../../assets/gemini-cli-logo.svg';
import opencodeLogo from '../../../assets/opencode.png';
import cursorLogo from '../../../assets/cursor-ai.png';
import kiloLogo from '../../../assets/kiloCode.gif';
import hermesLogo from '../../../assets/Hermes-logo.png';
import piLogo from '../../../assets/pi.svg';

const AGENT_ICONS: Record<string, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  gemini: geminiLogo,
  opencode: opencodeLogo,
  cursor: cursorLogo,
  kilo: kiloLogo,
  hermes: hermesLogo,
  pi: piLogo,
};

const TOOL_ICONS: Record<ToolCliType, string> = {
  gh: 'simple-icons:github',
  stripe: 'simple-icons:stripe',
  supabase: 'simple-icons:supabase',
  valyu: 'simple-icons:search',
  posthog: 'simple-icons:posthog',
  elevenlabs: 'simple-icons:elevenlabs',
  ramp: 'simple-icons:creditcard',
  gws: 'simple-icons:google',
  agentmail: 'simple-icons:mailgun',
  vercel: 'simple-icons:vercel',
};

const TOOL_COLORS: Record<ToolCliType, string> = {
  gh: '#ffffff',
  stripe: '#635BFF',
  supabase: '#3FCF8E',
  valyu: '#F59E0B',
  posthog: '#1D4AFF',
  elevenlabs: '#8B5CF6',
  ramp: '#1AE65E',
  gws: '#4285F4',
  agentmail: '#EC4899',
  vercel: '#ffffff',
};

export const SettingsAgents: React.FC = () => {
  const { cliStatuses, detectAllClis, openInstallTerminal, getInstallCommand, loading } = useAgentCli();
  const {
    toolCliStatuses,
    detectAllToolClis,
    openToolInstallTerminal,
    getToolInstallCommand,
    loading: toolLoading,
  } = useToolCli();
  const { agentTimeout, setAgentTimeout } = useAppStore();

  useEffect(() => {
    detectAllClis();
    detectAllToolClis();
  }, [detectAllClis, detectAllToolClis]);

  const cliTools = Object.values(cliStatuses).filter((tool): tool is AgentCliInfo => tool !== null);
  const installedCount = cliTools.filter(t => t.status === 'Installed').length;

  const toolClis = Object.values(toolCliStatuses).filter((t): t is NonNullable<typeof t> => t !== null);
  const installedToolCount = toolClis.filter(t => t.status === 'Installed').length;

  const [tooltips, setTooltips] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState<Record<string, boolean>>({});

  const loadTooltip = useCallback(async (key: string, getCmd: () => Promise<string | null>) => {
    if (tooltips[key]) return;
    const cmd = await getCmd();
    if (cmd) setTooltips(prev => ({ ...prev, [key]: cmd }));
  }, [tooltips]);

  const handleInstall = async (key: string, installFn: () => Promise<unknown>) => {
    setInstalling(prev => ({ ...prev, [key]: true }));
    try {
      await installFn();
    } catch (err) {
      console.error(`Failed to install ${key}:`, err);
    } finally {
      setInstalling(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="space-y-8 font-mono">
      <div>
        <h2 className="text-xs font-bold text-[var(--accent-text)] uppercase tracking-[0.2em] mb-1">
          CLI Management
        </h2>
        <p className="text-[10px] text-zinc-600 uppercase tracking-[0.15em]">
          Manage AI agent CLIs, tool CLIs, and configuration
        </p>
      </div>

      {/* AI Agent CLIs Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-3.5 h-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">
            AI Agent CLIs
          </h3>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-mono text-zinc-500 border border-zinc-800 bg-zinc-900/50">
            {installedCount}/{cliTools.length} installed
          </span>
          <button
            onClick={() => { detectAllClis(); }}
            disabled={loading}
            className="ml-auto px-3 py-1 rounded-md bg-[#3e3e38] text-zinc-500 hover:text-zinc-300 hover:bg-[#303030] border border-[#3e3e38] transition-colors cursor-pointer text-[9px] font-mono uppercase disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Detecting...' : 'Re-detect'}
          </button>
        </div>

        <div className="bg-[#262626]/60 border border-[#3e3e38]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 font-mono shrink-0">
              {installedCount}/{cliTools.length}
            </span>
            <div className="flex-1 h-1 bg-zinc-800/80 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${cliTools.length > 0 ? (installedCount / cliTools.length) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, var(--accent-glow), var(--accent))',
                  boxShadow: '0 0 8px var(--accent-glow)',
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            {cliTools.map((tool) => {
              const isInstalled = tool.status === 'Installed';
              const agentKey = tool.agent;
              return (
                <div
                  key={tool.agent}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#262626]/40 border border-[#3e3e38]/30 hover:border-[var(--accent-border)] hover:bg-[#262626]/80 transition-colors duration-200"
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
                  <div className="flex items-center gap-2">
                    {!isInstalled && (
                      <button
                        onClick={() => handleInstall(agentKey, () => openInstallTerminal(agentKey as AgentType))}
                        onMouseEnter={() => loadTooltip(agentKey, () => getInstallCommand(agentKey as AgentType))}
                        disabled={installing[agentKey]}
                        className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors cursor-pointer text-[9px] font-mono uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                        title={tooltips[agentKey] || 'Install via terminal'}
                      >
                        {installing[agentKey] ? 'Opening...' : 'Install'}
                      </button>
                    )}
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
              );
            })}
          </div>

          {loading && (
            <p className="text-[10px] text-[var(--accent)] opacity-60 font-mono animate-pulse">
              Detecting CLI tools...
            </p>
          )}
        </div>


      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-zinc-800/60" />
        <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-[0.3em]">Tools & Infrastructure</span>
        <div className="flex-1 h-px bg-zinc-800/60" />
      </div>

      {/* Tool CLIs Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-.756-.426-.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">
            Tool CLIs
          </h3>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-mono text-zinc-500 border border-zinc-800 bg-zinc-900/50">
            {installedToolCount}/{toolClis.length} installed
          </span>
          <button
            onClick={() => { detectAllToolClis(); }}
            disabled={toolLoading}
            className="ml-auto px-3 py-1 rounded-md bg-[#3e3e38] text-zinc-500 hover:text-zinc-300 hover:bg-[#303030] border border-[#3e3e38] transition-colors cursor-pointer text-[9px] font-mono uppercase disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {toolLoading ? 'Detecting...' : 'Re-detect'}
          </button>
        </div>

        <div className="bg-[#262626]/60 border border-[#3e3e38]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 font-mono shrink-0">
              {installedToolCount}/{toolClis.length}
            </span>
            <div className="flex-1 h-1 bg-zinc-800/80 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${toolClis.length > 0 ? (installedToolCount / toolClis.length) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                  boxShadow: '0 0 8px rgba(59,130,246,0.3)',
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {toolClis.map((tool) => {
              const isInstalled = tool.status === 'Installed';
              const toolKey = tool.tool as ToolCliType;
              const iconName = TOOL_ICONS[toolKey];
              const iconColor = TOOL_COLORS[toolKey];
              return (
                <div
                  key={tool.tool}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#262626]/40 border border-[#3e3e38]/30 hover:border-zinc-700 hover:bg-[#262626]/80 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      <Icon icon={iconName} style={{ color: iconColor }} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-300 font-medium truncate">{tool.displayName}</p>
                      <p className="text-[10px] text-zinc-600 truncate">{tool.provider}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isInstalled && (
                      <button
                        onClick={() => handleInstall(toolKey, () => openToolInstallTerminal(toolKey))}
                        onMouseEnter={() => loadTooltip(`tool-${toolKey}`, () => getToolInstallCommand(toolKey))}
                        disabled={installing[`tool-${toolKey}`]}
                        className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors cursor-pointer text-[9px] font-mono uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                        title={tooltips[`tool-${toolKey}`] || 'Install via terminal'}
                      >
                        {installing[`tool-${toolKey}`] ? 'Opening...' : 'Install'}
                      </button>
                    )}
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
              );
            })}
          </div>

          {toolLoading && (
            <p className="text-[10px] text-blue-400 opacity-60 font-mono animate-pulse">
              Detecting tool CLIs...
            </p>
          )}
        </div>


      </div>

      {/* Timeout */}
      <div className="bg-[#262626]/60 border border-[#3e3e38]/50 backdrop-blur-sm rounded-lg p-5 space-y-5">
        <h3 className="text-xs font-bold text-[var(--accent-text)] uppercase tracking-[0.2em]">
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
  );
};
