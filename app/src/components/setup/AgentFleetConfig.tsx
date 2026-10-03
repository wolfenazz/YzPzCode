import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '@iconify/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AgentCliStatusBadge } from './AgentCliStatusBadge';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useToolCli } from '../../hooks/useToolCli';
import type { CliType, AgentType, ToolCliType, AgentFleet } from '../../types';
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
import { ADDITIONAL_AGENTS, ADDITIONAL_AGENT_TYPES } from '../../data/additionalAgents';


interface AgentFleetConfigProps {
  fleet: AgentFleet;
  category: 'agents' | 'tools';
  onAllocationChange: (fleet: AgentFleet) => void;
}
const AGENT_INFO: Record<AgentType, { label: string; color: string; logo: string }> = {
  claude: { label: 'Claude', color: 'bg-orange-500', logo: claudeLogo },
  codex: { label: 'Codex', color: 'bg-green-500', logo: codexLogo },
  antigravity: { label: 'Antigravity CLI', color: 'bg-blue-600', logo: antigravityLogo },
  opencode: { label: 'OpenCode', color: 'bg-purple-500', logo: opencodeLogo },
  cursor: { label: 'Cursor', color: 'bg-pink-500', logo: cursorLogo },
  kilo: { label: 'Kilo', color: 'bg-teal-500', logo: kiloLogo },
  hermes: { label: 'Hermes', color: 'bg-amber-500', logo: hermesLogo },
  pi: { label: 'Pi', color: 'bg-zinc-500', logo: piLogo },
  commandcode: { label: 'Command Code', color: 'bg-neutral-500', logo: commandCodeLogo },
  cline: { label: 'Cline', color: 'bg-sky-500', logo: clineLogo },
  grok: { label: 'Grok', color: 'bg-zinc-700', logo: grokLogo },
  ...ADDITIONAL_AGENTS,
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


export function AgentFleetConfig({ fleet, category, onAllocationChange }: AgentFleetConfigProps): React.JSX.Element {
  const { cliStatuses, detectAllClis, openInstallTerminal, loading: cliLoading, error: cliError } = useAgentCli();
  const { toolCliStatuses, detectAllToolClis, openToolInstallTerminal, loading: toolLoading, error: toolError } = useToolCli();
  const [search, setSearch] = useState('');
  const [installingCli, setInstallingCli] = useState<CliType | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const launching = useRef(false);
  const remaining = fleet.totalSlots - Object.values(fleet.allocation).reduce((sum, count) => sum + count, 0);

  useEffect(() => {
    if (category === 'agents') void detectAllClis();
    else void detectAllToolClis();
  }, [category, detectAllClis, detectAllToolClis]);

  const refresh = async (): Promise<void> => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setInstallError(null);
    try {
      await invoke('clear_cli_cache');
      if (category === 'agents') await detectAllClis();
      else await detectAllToolClis();
    } catch (error) { setInstallError(String(error)); }
    finally { setIsRefreshing(false); }
  };

  const install = async (cli: CliType): Promise<void> => {
    if (launching.current) return;
    launching.current = true;
    setInstallingCli(cli);
    setInstallError(null);
    try {
      const agents: AgentType[] = ['claude', 'codex', 'antigravity', 'opencode', 'cursor', 'kilo', 'hermes', 'pi', 'commandcode', 'cline', 'grok', ...ADDITIONAL_AGENT_TYPES];
      if (agents.includes(cli as AgentType)) {
        if (cli === 'amp' && navigator.userAgent.includes('Windows')) await openUrl('https://ampcode.com/docs/cli');
        else await openInstallTerminal(cli as AgentType);
      } else await openToolInstallTerminal(cli as ToolCliType);
    } catch (error) { setInstallError(String(error)); }
    finally { launching.current = false; setInstallingCli(null); }
  };

  const changeCount = (cli: CliType, count: number): void => {
    if (count < 0 || count > fleet.allocation[cli] + remaining) return;
    onAllocationChange({ ...fleet, allocation: { ...fleet.allocation, [cli]: count } });
  };

  const entries = category === 'agents'
    ? (Object.entries(AGENT_INFO) as [AgentType, typeof AGENT_INFO[AgentType]][]).map(([cli, info]) => ({
      cli, label: info.label, installed: cliStatuses[cli]?.status === 'Installed',
      icon: <img src={info.logo} alt="" className={`h-6 w-6 object-contain ${cli === 'opencode' ? 'rounded bg-white' : ''}`} />,
      status: <AgentCliStatusBadge cliInfo={cliStatuses[cli]} onInstall={() => void install(cli)} installing={installingCli === cli}
        installLabel={cli === 'amp' && navigator.userAgent.includes('Windows') ? 'Docs' : 'Install'} />,
    }))
    : (Object.entries(TOOL_INFO) as [ToolCliType, typeof TOOL_INFO[ToolCliType]][]).map(([cli, info]) => ({
      cli, label: info.label, installed: toolCliStatuses[cli]?.status === 'Installed',
      icon: <Icon icon={info.icon} className="h-5 w-5" style={{ color: info.color === '#ffffff' ? 'var(--text-primary)' : info.color }} />,
      status: toolCliStatuses[cli]?.status === 'Installed'
        ? <span className="text-xs text-[var(--text-secondary)]">Installed</span>
        : <button type="button" className="text-xs text-[var(--accent)] disabled:opacity-50" disabled={installingCli === cli || toolLoading}
            onClick={() => void install(cli)}>{installingCli === cli ? 'Installing…' : toolLoading ? 'Checking…' : 'Install'}</button>,
    }));
  const filtered = entries.filter((entry) => entry.label.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(fleet.allocation[b.cli] > 0) - Number(fleet.allocation[a.cli] > 0) || Number(b.installed) - Number(a.installed));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={category === 'agents' ? 'Find a CLI agent…' : 'Find a tool…'}
          aria-label={category === 'agents' ? 'Find a CLI agent' : 'Find a tool'} className="min-w-0 flex-1 rounded-lg border border-theme bg-theme-main px-3 py-2 text-sm text-theme-main" />
        <button type="button" onClick={() => void refresh()} disabled={isRefreshing || cliLoading || toolLoading}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">{isRefreshing || cliLoading || toolLoading ? 'Checking…' : 'Refresh'}</button>
      </div>
      {(installError || (category === 'agents' ? cliError : toolError)) && <p role="alert" className="text-xs text-rose-400">{installError || (category === 'agents' ? cliError : toolError)}</p>}
      <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {filtered.map((entry) => (
          <div key={entry.cli} className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 ${fleet.allocation[entry.cli] > 0 ? 'border-[var(--accent)] bg-[var(--bg-tertiary)]' : 'border-theme'}`}>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center">{entry.icon}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm text-[var(--text-primary)]">{entry.label}</div>{entry.status}</div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" aria-label={`Remove one ${entry.label} terminal`} onClick={() => changeCount(entry.cli, fleet.allocation[entry.cli] - 1)} disabled={fleet.allocation[entry.cli] === 0}
                className="h-7 w-7 rounded border border-theme text-sm disabled:opacity-30">−</button>
              <output aria-label={`${entry.label} terminals`} className="w-5 text-center text-xs tabular-nums">{fleet.allocation[entry.cli]}</output>
              <button type="button" aria-label={`Add one ${entry.label} terminal`} onClick={() => changeCount(entry.cli, fleet.allocation[entry.cli] + 1)} disabled={remaining <= 0 || !entry.installed}
                className="h-7 w-7 rounded border border-theme text-sm disabled:opacity-30">+</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="py-4 text-sm text-[var(--text-secondary)]">No matching tools.</p>}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">{remaining} plain shell{remaining === 1 ? '' : 's'} · {fleet.totalSlots - remaining} assigned terminal{fleet.totalSlots - remaining === 1 ? '' : 's'}</p>
    </div>
  );
}
