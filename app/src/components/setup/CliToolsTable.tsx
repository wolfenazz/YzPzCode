import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useToolCli } from '../../hooks/useToolCli';
import { AgentCliInfo, ToolCliType } from '../../types';
import { InlineTerminal } from './InlineTerminal';

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

const TOOL_DESCRIPTIONS: Record<ToolCliType, string> = {
  gh: 'GitHub CLI — manage PRs, issues, repos',
  stripe: 'Stripe CLI — test webhooks & API calls',
  supabase: 'Supabase CLI — local dev & migrations',
  valyu: 'Valyu CLI — AI knowledge retrieval',
  posthog: 'PostHog CLI — analytics & feature flags',
  elevenlabs: 'ElevenLabs CLI — text-to-speech AI',
  ramp: 'Ramp CLI — spend management APIs',
  gws: 'Google Workspace CLI — admin management',
  agentmail: 'AgentMail CLI — AI email automation',
  vercel: 'Vercel CLI — deploy & manage projects',
};

interface CliCardProps {
  name: string;
  icon: React.ReactNode;
  status: 'Installed' | 'NotInstalled' | 'Checking' | 'Error';
  version: string | null;
  description: string;
  installCommand: string | null;
  isInstalling: boolean;
  onInstall: () => void;
  onCopyCommand: () => void;
}

const CliCard: React.FC<CliCardProps> = ({
  name,
  icon,
  status,
  version,
  description,
  installCommand,
  isInstalling,
  onInstall,
  onCopyCommand,
}) => {
  const isInstalled = status === 'Installed';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!installCommand) return;
    navigator.clipboard.writeText(installCommand).then(() => {
      setCopied(true);
      onCopyCommand();
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className={`group/card relative rounded-lg border transition-all duration-200 ${
        isInstalled
          ? 'border-emerald-500/20 bg-emerald-500/[0.03] hover:border-emerald-500/30'
          : 'border-zinc-800/50 bg-zinc-950/30 hover:border-zinc-700/60 hover:bg-zinc-900/30'
      }`}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="w-8 h-8 flex items-center justify-center rounded-md border border-zinc-800/60 bg-zinc-900/50 shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-mono text-zinc-200 font-medium">{name}</span>
            {isInstalled ? (
              <span className="text-[9px] font-mono text-emerald-500/70">
                {version ? `v${version}` : 'Ready'}
              </span>
            ) : status === 'Checking' ? (
              <span className="text-[9px] font-mono text-amber-400/60 animate-pulse">detecting...</span>
            ) : (
              <span className="text-[9px] font-mono text-zinc-600">Not Found</span>
            )}
          </div>
          <p className="text-[9px] font-mono text-zinc-600 leading-relaxed line-clamp-2">{description}</p>

          {!isInstalled && installCommand && (
            <div className="mt-2 flex items-stretch rounded border border-zinc-800/60 overflow-hidden">
              <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 bg-zinc-950/80 min-w-0">
                <span className="text-zinc-700 text-[9px] font-mono select-none shrink-0">$</span>
                <code className="text-[9px] font-mono text-zinc-400 truncate">{installCommand}</code>
              </div>
              <button
                type="button"
                onClick={onInstall}
                disabled={isInstalling}
                className="px-2 flex items-center bg-zinc-900 border-l border-zinc-800/60 text-emerald-500/70 hover:text-emerald-400 hover:bg-zinc-800/80 transition-colors duration-150 cursor-pointer shrink-0 disabled:opacity-50"
                title="Open terminal & install"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="px-2 flex items-center bg-zinc-900 border-l border-zinc-800/60 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors duration-150 cursor-pointer shrink-0"
                title="Copy install command"
              >
                {copied ? (
                  <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {isInstalled && (
        <div className="absolute top-2.5 right-3">
          <svg className="w-3.5 h-3.5 text-emerald-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
};

export const CliToolsTable: React.FC = () => {
  const { cliStatuses, detectAllClis, getInstallCommand, openInstallTerminal, loading } = useAgentCli();
  const {
    toolCliStatuses,
    detectAllToolClis,
    getToolInstallCommand,
    openToolInstallTerminal,
    loading: toolLoading,
  } = useToolCli();
  const [isOpen, setIsOpen] = useState(true);
  const [installCommands, setInstallCommands] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [activeTerminal, setActiveTerminal] = useState<{ command: string; cwd?: string } | null>(null);
  const [selectedTools, setSelectedTools] = useState<Set<ToolCliType>>(new Set());

  useEffect(() => {
    detectAllClis();
    detectAllToolClis();
  }, [detectAllClis, detectAllToolClis]);

  useEffect(() => {
    const loadCommands = async () => {
      const cmds: Record<string, string> = {};
      const agentTypes = ['claude', 'codex', 'gemini', 'opencode', 'cursor', 'kilo', 'hermes'] as const;
      for (const agent of agentTypes) {
        const cmd = await getInstallCommand(agent);
        if (cmd) cmds[agent] = cmd;
      }
      const toolTypes: ToolCliType[] = ['gh', 'stripe', 'supabase', 'valyu', 'posthog', 'elevenlabs', 'ramp', 'gws', 'agentmail', 'vercel'];
      for (const tool of toolTypes) {
        const cmd = await getToolInstallCommand(tool);
        if (cmd) cmds[tool] = cmd;
      }
      setInstallCommands(cmds);
    };
    loadCommands();
  }, [getInstallCommand, getToolInstallCommand]);

  const cliTools = Object.values(cliStatuses).filter((tool): tool is AgentCliInfo => tool !== null);
  const installedCount = cliTools.filter(t => t.status === 'Installed').length;

  const toolClis = Object.values(toolCliStatuses).filter((t): t is NonNullable<typeof t> => t !== null);
  const installedToolCount = toolClis.filter(t => t.status === 'Installed').length;

  const totalCount = cliTools.length + toolClis.length;
  const totalInstalled = installedCount + installedToolCount;

  const handleInstallAgent = useCallback(async (agent: string) => {
    setInstalling(prev => ({ ...prev, [agent]: true }));
    try {
      await openInstallTerminal(agent as any);
    } finally {
      setTimeout(() => setInstalling(prev => ({ ...prev, [agent]: false })), 1000);
    }
  }, [openInstallTerminal]);

  const handleInstallTool = useCallback(async (tool: ToolCliType) => {
    setInstalling(prev => ({ ...prev, [tool]: true }));
    try {
      await openToolInstallTerminal(tool);
    } finally {
      setTimeout(() => setInstalling(prev => ({ ...prev, [tool]: false })), 1000);
    }
  }, [openToolInstallTerminal]);

  const handleBatchInstall = useCallback(() => {
    const tools = Array.from(selectedTools);
    for (const tool of tools) {
      openToolInstallTerminal(tool);
    }
    setSelectedTools(new Set());
  }, [selectedTools, openToolInstallTerminal]);

  const toggleToolSelection = useCallback((tool: ToolCliType) => {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  }, []);

  const handleRedetect = useCallback(() => {
    detectAllClis();
    detectAllToolClis();
  }, [detectAllClis, detectAllToolClis]);

  if (loading || toolLoading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 font-mono text-xs">
        <span className="animate-pulse">Detecting CLI tools...</span>
      </div>
    );
  }

  if (activeTerminal) {
    return (
      <div className="space-y-3">
        <InlineTerminal
          command={activeTerminal.command}
          cwd={activeTerminal.cwd || '.'}
          autoRun={true}
          onClose={() => setActiveTerminal(null)}
        />
        <button
          type="button"
          onClick={handleRedetect}
          className="px-4 py-2 rounded-md border border-zinc-800 bg-zinc-900/50 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer"
        >
          Re-detect CLIs
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 text-zinc-500 hover:text-zinc-300 font-mono text-xs transition-colors duration-150 cursor-pointer group w-full"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
        </svg>
        <span className="uppercase tracking-[0.1em]">CLI Tools</span>
        <span className="px-2 py-0.5 rounded-full border border-zinc-800 text-[9px] text-zinc-500 bg-zinc-900/50">
          {totalInstalled}/{totalCount}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleRedetect(); }}
          className="px-2.5 py-1 rounded border border-zinc-800 text-[9px] font-mono text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 transition-colors cursor-pointer"
        >
          Re-detect
        </button>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-5">
          {/* AI Agent CLIs */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-3 h-3 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.15em]">AI Agents</span>
              <span className="text-[9px] font-mono text-zinc-600">{installedCount}/{cliTools.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {cliTools.map((tool) => (
                <CliCard
                  key={tool.agent}
                  name={tool.displayName}
                  icon={<span className="text-[10px] font-mono font-bold text-zinc-400">{tool.displayName.charAt(0)}</span>}
                  status={tool.status}
                  version={tool.version}
                  description={tool.description}
                  installCommand={installCommands[tool.agent] || null}
                  isInstalling={!!installing[tool.agent]}
                  onInstall={() => handleInstallAgent(tool.agent)}
                  onCopyCommand={() => {}}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-800/40" />
            <span className="text-[8px] font-mono text-zinc-700 uppercase tracking-[0.2em]">Tools & Infra</span>
            <div className="flex-1 h-px bg-zinc-800/40" />
          </div>

          {/* Tool CLIs */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-3 h-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-.756-.426-.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.15em]">Tool CLIs</span>
              <span className="text-[9px] font-mono text-zinc-600">{installedToolCount}/{toolClis.length}</span>
              <div className="flex-1" />
              {selectedTools.size > 0 && (
                <button
                  type="button"
                  onClick={handleBatchInstall}
                  className="px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[9px] font-mono text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
                >
                  Install {selectedTools.size} selected
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {toolClis.map((tool) => {
                const toolType = tool.tool as ToolCliType;
                const isSelected = selectedTools.has(toolType);
                const isInstalled = tool.status === 'Installed';
                return (
                  <div key={tool.tool} className="relative">
                    {!isInstalled && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleToolSelection(toolType)}
                        className="absolute top-3 right-3 w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-blue-500 z-10"
                      />
                    )}
                    <CliCard
                      name={tool.displayName}
                      icon={<Icon icon={TOOL_ICONS[toolType]} style={{ color: TOOL_COLORS[toolType] }} className="w-4 h-4" />}
                      status={tool.status}
                      version={tool.version}
                      description={TOOL_DESCRIPTIONS[toolType] || tool.description}
                      installCommand={installCommands[toolType] || null}
                      isInstalling={!!installing[toolType]}
                      onInstall={() => handleInstallTool(toolType)}
                      onCopyCommand={() => {}}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {totalCount === 0 && (
            <div className="p-6 text-center text-zinc-500 font-mono text-xs">
              No CLI tools detected
            </div>
          )}
        </div>
      )}
    </div>
  );
};
