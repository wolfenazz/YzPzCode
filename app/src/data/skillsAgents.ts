import type { AgentType } from '../types';

/**
 * Maps each YzPzCode agent to the slug the `npx skills` CLI expects for its
 * `-a` flag (e.g. `npx skills add <source> -a claude-code`).
 *
 * Only agents the CLI knows are listed: it rejects any other slug with
 * "Invalid agents: …" and installs nothing. Check a slug against
 * `npx skills add --help` (the "Valid agents" list in its error) before adding
 * one. The backend also drops a rejected agent and retries, so a CLI release
 * that removes a slug degrades to a note instead of a failed install.
 */
export const AGENT_TO_SKILLS_SLUG: Partial<Record<AgentType, string>> = {
  claude: 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
  opencode: 'opencode',
  kilo: 'kilo',
  cline: 'cline',
  pi: 'pi',
  antigravity: 'antigravity',
  commandcode: 'command-code',
  hermes: 'hermes-agent',
  trae: 'trae',
  kimi: 'kimi-code-cli',
  qoder: 'qoder',
  copilot: 'github-copilot',
  kiro: 'kiro-cli',
  mistralvibe: 'mistral-vibe',
  amp: 'amp',
  devin: 'devin',
  grok: 'grok',
  reasonix: 'reasonix',
  codebuddy: 'codebuddy',
};

/** The `-a` slug for a given agent, or `undefined` when skills.sh has none. */
export function skillsSlugForAgent(agent: AgentType): string | undefined {
  return AGENT_TO_SKILLS_SLUG[agent];
}

/** Agents that can receive skills, in the order of `AGENT_TO_SKILLS_SLUG`. */
export function skillsAgents(): AgentType[] {
  return Object.keys(AGENT_TO_SKILLS_SLUG) as AgentType[];
}

/** Every slug the app can pass to `-a`. */
export const ALL_SKILLS_SLUGS: string[] = [...new Set(Object.values(AGENT_TO_SKILLS_SLUG))] as string[];

/** Friendly names for the folders the installed-skills scan reports. */
const INSTALL_LOCATION_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  agents: 'Shared (.agents)',
  unknown: 'Other',
};

export function installLocationLabel(agent: string): string {
  return INSTALL_LOCATION_LABELS[agent] ?? agent;
}
