import React, { useEffect, useState, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowsClockwise,
  DownloadSimple,
  Hourglass,
  PlugsConnected,
  Robot,
} from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import { useAgentCli } from '../../../hooks/useAgentCli';
import { useToolCli } from '../../../hooks/useToolCli';
import { AgentCliInfo, AgentType, ToolCliType } from '../../../types';
import claudeLogo from '../../../assets/claude.png';
import codexLogo from '../../../assets/codex.png';
import antigravityLogo from '../../../assets/antigravity.png';
import opencodeLogo from '../../../assets/opencode.png';
import cursorLogo from '../../../assets/cursor-ai.png';
import kiloLogo from '../../../assets/kiloCode.gif';
import hermesLogo from '../../../assets/Hermes-logo.png';
import piLogo from '../../../assets/pi.svg';
import commandCodeLogo from '../../../assets/commandcode-logo.svg';
import clineLogo from '../../../assets/cline.webp';
import grokLogo from '../../../assets/Grok.png';
import { ADDITIONAL_AGENT_LOGOS } from '../../../data/additionalAgents';
import {
  Badge,
  Button,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  SettingsTabs,
  SliderRow,
} from '../SettingsKit';

const AGENT_ICONS: Record<string, string> = {
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

// Brand colors; logos that are plain white follow the theme text color instead
// so they stay visible on light themes.
const TOOL_COLORS: Record<ToolCliType, string> = {
  gh: 'var(--text-primary)',
  stripe: '#635BFF',
  supabase: '#3FCF8E',
  valyu: '#F59E0B',
  posthog: '#1D4AFF',
  elevenlabs: '#8B5CF6',
  ramp: '#1AE65E',
  gws: '#4285F4',
  agentmail: '#EC4899',
  vercel: 'var(--text-primary)',
};

type CliTab = 'agents' | 'tools';

type CliStatus = 'Installed' | 'Checking' | string;

const StatusBadge = ({ status, version }: { status: CliStatus; version?: string | null }) => {
  if (status === 'Installed') {
    return <Badge dot tone="success">{version ? `v${version}` : 'Installed'}</Badge>;
  }
  if (status === 'Checking') return <Badge tone="warning">Checking…</Badge>;
  return <Badge>Not installed</Badge>;
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

  const [tab, setTab] = useState<CliTab>('agents');

  useEffect(() => {
    detectAllClis();
    detectAllToolClis();
  }, [detectAllClis, detectAllToolClis]);

  const cliTools = Object.values(cliStatuses).filter((tool): tool is AgentCliInfo => tool !== null);
  const installedCount = cliTools.filter((t) => t.status === 'Installed').length;

  const toolClis = Object.values(toolCliStatuses).filter((t): t is NonNullable<typeof t> => t !== null);
  const installedToolCount = toolClis.filter((t) => t.status === 'Installed').length;

  const [tooltips, setTooltips] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState<Record<string, boolean>>({});

  const loadTooltip = useCallback(
    async (key: string, getCmd: () => Promise<string | null>) => {
      if (tooltips[key]) return;
      const cmd = await getCmd();
      if (cmd) setTooltips((prev) => ({ ...prev, [key]: cmd }));
    },
    [tooltips],
  );

  const handleInstall = async (key: string, installFn: () => Promise<unknown>) => {
    setInstalling((prev) => ({ ...prev, [key]: true }));
    try {
      await installFn();
    } catch (err) {
      console.error(`Failed to install ${key}:`, err);
    } finally {
      setInstalling((prev) => ({ ...prev, [key]: false }));
    }
  };

  const isWindows = navigator.userAgent.includes('Windows');

  return (
    <>
      <SettingsTabs
        label="CLI tool types"
        onChange={setTab}
        tabs={[
          { id: 'agents' as const, label: 'AI agents', icon: Robot, count: `${installedCount}/${cliTools.length}` },
          { id: 'tools' as const, label: 'Service CLIs', icon: PlugsConnected, count: `${installedToolCount}/${toolClis.length}` },
        ]}
        value={tab}
      />

      {tab === 'agents' && (
        <SettingsStack>
          <SettingsGroup
            action={
              <Button icon={ArrowsClockwise} loading={loading} onClick={() => void detectAllClis()} size="sm">
                {loading ? 'Detecting…' : 'Detect again'}
              </Button>
            }
            description="Command-line coding agents that can run inside your terminals."
            title="Installed agents"
          >
            {cliTools.length === 0 ? (
              <SettingsEmpty icon={Robot} title={loading ? 'Looking for agents…' : 'No agents found'} />
            ) : (
              cliTools.map((tool) => {
                const agentKey = tool.agent;
                const isInstalled = tool.status === 'Installed';
                const docsOnly = agentKey === 'amp' && isWindows;
                const logo = AGENT_ICONS[agentKey];
                return (
                  <SettingsRow
                    badge={<StatusBadge status={tool.status} version={tool.version} />}
                    description={tool.provider}
                    icon={logo ? <img alt="" src={logo} /> : <Robot size={16} aria-hidden="true" />}
                    key={agentKey}
                    label={tool.displayName}
                  >
                    {!isInstalled && tool.status !== 'Checking' && (
                      <Button
                        icon={DownloadSimple}
                        loading={installing[agentKey]}
                        onClick={() =>
                          void handleInstall(agentKey, () =>
                            docsOnly ? openUrl('https://ampcode.com/docs/cli') : openInstallTerminal(agentKey as AgentType),
                          )
                        }
                        onMouseEnter={() => void loadTooltip(agentKey, () => getInstallCommand(agentKey as AgentType))}
                        size="sm"
                        title={docsOnly ? 'Open Amp WSL setup instructions' : tooltips[agentKey] || 'Install in a terminal'}
                      >
                        {docsOnly ? 'Open docs' : 'Install'}
                      </Button>
                    )}
                  </SettingsRow>
                );
              })
            )}
          </SettingsGroup>

          <SettingsGroup title="Limits">
            <SliderRow
              description="How long to wait for an agent to answer before giving up."
              format={(value) => `${value}s`}
              icon={<Hourglass size={16} aria-hidden="true" />}
              label="Response timeout"
              max={600}
              min={60}
              onChange={setAgentTimeout}
              step={30}
              value={agentTimeout}
            />
          </SettingsGroup>
        </SettingsStack>
      )}

      {tab === 'tools' && (
        <SettingsStack>
          <SettingsGroup
            action={
              <Button icon={ArrowsClockwise} loading={toolLoading} onClick={() => void detectAllToolClis()} size="sm">
                {toolLoading ? 'Detecting…' : 'Detect again'}
              </Button>
            }
            description="Command-line tools for services your agents can work with."
            title="Installed tools"
          >
            {toolClis.length === 0 ? (
              <SettingsEmpty icon={PlugsConnected} title={toolLoading ? 'Looking for tools…' : 'No tools found'} />
            ) : (
              toolClis.map((tool) => {
                const toolKey = tool.tool as ToolCliType;
                const isInstalled = tool.status === 'Installed';
                const installKey = `tool-${toolKey}`;
                return (
                  <SettingsRow
                    badge={<StatusBadge status={tool.status} version={tool.version} />}
                    description={tool.provider}
                    icon={<Icon icon={TOOL_ICONS[toolKey]} style={{ color: TOOL_COLORS[toolKey], width: 16, height: 16 }} />}
                    key={tool.tool}
                    label={tool.displayName}
                  >
                    {!isInstalled && tool.status !== 'Checking' && (
                      <Button
                        icon={DownloadSimple}
                        loading={installing[installKey]}
                        onClick={() => void handleInstall(toolKey, () => openToolInstallTerminal(toolKey))}
                        onMouseEnter={() => void loadTooltip(installKey, () => getToolInstallCommand(toolKey))}
                        size="sm"
                        title={tooltips[installKey] || 'Install in a terminal'}
                      >
                        Install
                      </Button>
                    )}
                  </SettingsRow>
                );
              })
            )}
          </SettingsGroup>
        </SettingsStack>
      )}
    </>
  );
};
