import type { AgentType } from '../types';

/**
 * Maps each YzPzCode agent to the slug the `npx skills` CLI expects
 * for its `-a` flag (e.g. `npx skills add <source> -a claude-code`).
 */
export const AGENT_TO_SKILLS_SLUG: Record<AgentType, string> = {
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
  jcode: 'jcode',
  aider: 'aider',
  reasonix: 'reasonix',
  dsh: 'dsh',
  codebuddy: 'codebuddy',
  mimo: 'mimo',
  atomcode: 'atomcode',
  deepseektui: 'deepseek-tui',
};

/** The `-a` slug for a given agent. */
export function skillsSlugForAgent(agent: AgentType): string {
  return AGENT_TO_SKILLS_SLUG[agent];
}

/** Every distinct skills slug, for pre-selecting agent checkboxes. */
export const ALL_SKILLS_SLUGS: string[] = [...new Set(Object.values(AGENT_TO_SKILLS_SLUG))];
