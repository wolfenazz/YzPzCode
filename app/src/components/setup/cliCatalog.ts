import type { AgentFleet, AgentType, CliType, ToolCliType } from '../../types';
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

/** Everything the setup screen needs to draw one agent or tool CLI. */
export interface CliMeta {
  label: string;
  /** Brand color, used for allocation segments and the pane accent line. */
  color: string;
  /** What the preview pane "types" when the workspace opens. */
  command: string;
  description: string;
  logo?: string;
  /** Iconify id for tool CLIs, which ship without bitmap logos. */
  icon?: string;
}

const CORE_AGENTS: Record<Exclude<AgentType, keyof typeof ADDITIONAL_AGENTS>, CliMeta> = {
  claude: { label: 'Claude', color: '#d97706', command: 'claude', description: 'Anthropic coding agent', logo: claudeLogo },
  codex: { label: 'Codex', color: '#10b981', command: 'codex', description: 'OpenAI coding agent', logo: codexLogo },
  antigravity: { label: 'Antigravity CLI', color: '#2563eb', command: 'agy', description: 'Google coding agent', logo: antigravityLogo },
  opencode: { label: 'OpenCode', color: '#a855f7', command: 'opencode', description: 'Open source coding agent', logo: opencodeLogo },
  cursor: { label: 'Cursor', color: '#ec4899', command: 'cursor-agent', description: 'Cursor terminal agent', logo: cursorLogo },
  kilo: { label: 'Kilo', color: '#14b8a6', command: 'kilo', description: 'Kilo Code terminal agent', logo: kiloLogo },
  hermes: { label: 'Hermes', color: '#f59e0b', command: 'hermes', description: 'Nous Research agent', logo: hermesLogo },
  pi: { label: 'Pi', color: '#a1a1aa', command: 'pi', description: 'Minimal coding agent', logo: piLogo },
  commandcode: { label: 'Command Code', color: '#a3a3a3', command: 'cmd', description: 'Command Code agent', logo: commandCodeLogo },
  cline: { label: 'Cline', color: '#0ea5e9', command: 'cline', description: 'Autonomous coding agent', logo: clineLogo },
  grok: { label: 'Grok', color: '#a1a1aa', command: 'grok', description: 'xAI coding agent', logo: grokLogo },
};

export const AGENT_CATALOG: Record<AgentType, CliMeta> = {
  ...CORE_AGENTS,
  ...Object.fromEntries(ADDITIONAL_AGENT_TYPES.map((id) => {
    const agent = ADDITIONAL_AGENTS[id];
    return [id, { label: agent.label, color: agent.color, command: id, description: agent.description, logo: agent.logo }];
  })) as Record<keyof typeof ADDITIONAL_AGENTS, CliMeta>,
};

export const TOOL_CATALOG: Record<ToolCliType, CliMeta> = {
  gh: { label: 'GitHub', icon: 'simple-icons:github', color: '#e5e5e5', command: 'gh', description: 'Repos, pull requests, issues' },
  stripe: { label: 'Stripe', icon: 'simple-icons:stripe', color: '#635BFF', command: 'stripe', description: 'Payments and webhooks' },
  supabase: { label: 'Supabase', icon: 'simple-icons:supabase', color: '#3FCF8E', command: 'supabase', description: 'Database, auth, functions' },
  valyu: { label: 'Valyu', icon: 'ph:magnifying-glass-bold', color: '#F59E0B', command: 'valyu', description: 'Search API' },
  posthog: { label: 'PostHog', icon: 'simple-icons:posthog', color: '#F9BD2B', command: 'posthog', description: 'Product analytics' },
  elevenlabs: { label: 'ElevenLabs', icon: 'simple-icons:elevenlabs', color: '#a3a3a3', command: 'elevenlabs', description: 'Voice and audio' },
  ramp: { label: 'Ramp', icon: 'ph:credit-card-bold', color: '#1AE65E', command: 'ramp', description: 'Spend management' },
  gws: { label: 'Google Workspace', icon: 'simple-icons:google', color: '#4285F4', command: 'gws', description: 'Drive, Gmail, Calendar' },
  agentmail: { label: 'AgentMail', icon: 'ph:envelope-simple-bold', color: '#EC4899', command: 'agentmail', description: 'Inboxes for agents' },
  vercel: { label: 'Vercel', icon: 'simple-icons:vercel', color: '#e5e5e5', command: 'vercel', description: 'Deploys and previews' },
};

export const AGENT_IDS = Object.keys(AGENT_CATALOG) as AgentType[];
export const TOOL_IDS = Object.keys(TOOL_CATALOG) as ToolCliType[];

export function cliMeta(cli: CliType): CliMeta {
  return (AGENT_CATALOG as Record<string, CliMeta>)[cli] ?? (TOOL_CATALOG as Record<string, CliMeta>)[cli];
}

export function isAgent(cli: CliType): cli is AgentType {
  return cli in AGENT_CATALOG;
}

/** One terminal pane in launch order: the CLI it starts, or `null` for a plain shell. */
export function slotAssignments(sessions: number, fleet?: AgentFleet): (CliType | null)[] {
  const assigned: CliType[] = [];
  for (const [cli, count] of Object.entries(fleet?.allocation ?? {}) as [CliType, number][]) {
    for (let i = 0; i < count; i++) assigned.push(cli);
  }
  return Array.from({ length: sessions }, (_, index) => assigned[index] ?? null);
}
