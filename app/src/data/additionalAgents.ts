import type { AgentType } from '../types';

export type AdditionalAgentType = Exclude<AgentType,
  'claude' | 'codex' | 'gemini' | 'opencode' | 'cursor' | 'kilo' |
  'hermes' | 'pi' | 'commandcode' | 'cline' | 'grok'>;

export const ADDITIONAL_AGENTS: Record<AdditionalAgentType, {
  label: string;
  description: string;
  color: string;
  logo: string;
}> = {
  devin: { label: 'Devin for Terminal', description: 'Cognition terminal coding agent', color: '#5267D9', logo: '/assets/devin.png' },
  trae: { label: 'Trae CLI', description: 'TraeCode terminal coding agent', color: '#6155F5', logo: '/assets/trae.png' },
  kimi: { label: 'Kimi Code CLI', description: 'Moonshot terminal coding agent', color: '#814DDB', logo: '/assets/kimi.png' },
  qoder: { label: 'Qoder CLI', description: 'Qoder terminal coding agent', color: '#9A5CE0', logo: '/assets/qoder.png' },
  copilot: { label: 'GitHub Copilot CLI', description: 'GitHub terminal coding agent', color: '#6E7EFF', logo: '/assets/copilot.png' },
  kiro: { label: 'Kiro CLI', description: 'Kiro terminal coding agent', color: '#9354D2', logo: '/assets/kiro.png' },
  mistralvibe: { label: 'Mistral Vibe', description: 'Mistral terminal coding agent', color: '#F7A52C', logo: '/assets/mistralvibe.png' },
  deepseektui: { label: 'DeepSeek TUI', description: 'Community DeepSeek coding TUI', color: '#496FDB', logo: '/assets/deepseektui.png' },
  aider: { label: 'Aider', description: 'Open source AI pair programmer', color: '#54A64F', logo: '/assets/aider.png' },
  antigravity: { label: 'Antigravity CLI', description: 'Google terminal coding agent', color: '#557FF0', logo: '/assets/antigravity-cli.png' },
  reasonix: { label: 'DeepSeek Reasonix', description: 'DeepSeek native coding CLI', color: '#5079D8', logo: '/assets/reasonix.png' },
  amp: { label: 'Amp', description: 'Amp terminal coding agent', color: '#EA6F47', logo: '/assets/amp.png' },
  dsh: { label: 'DeepSeek Harness', description: 'DeepSeek agent harness with Web UI', color: '#4D71D8', logo: '/assets/dsh.png' },
  codebuddy: { label: 'CodeBuddy Code', description: 'Tencent terminal coding agent', color: '#3688D8', logo: '/assets/codebuddy.png' },
  mimo: { label: 'MiMo Code', description: 'Xiaomi terminal coding agent', color: '#F27C36', logo: '/assets/mimo.png' },
  atomcode: { label: 'AtomCode CLI', description: 'AtomGit terminal coding agent', color: '#DE624C', logo: '/assets/atomcode.png' },
};

export const ADDITIONAL_AGENT_TYPES = Object.keys(ADDITIONAL_AGENTS) as AdditionalAgentType[];

export const ADDITIONAL_AGENT_LOGOS: Record<AdditionalAgentType, string> =
  Object.fromEntries(ADDITIONAL_AGENT_TYPES.map((id) => [id, ADDITIONAL_AGENTS[id].logo])) as Record<AdditionalAgentType, string>;

export const ADDITIONAL_AGENT_ZEROS: Record<AdditionalAgentType, number> =
  Object.fromEntries(ADDITIONAL_AGENT_TYPES.map((id) => [id, 0])) as Record<AdditionalAgentType, number>;

export const ADDITIONAL_AGENT_LABELS: Record<AdditionalAgentType, string> =
  Object.fromEntries(ADDITIONAL_AGENT_TYPES.map((id) => [id, ADDITIONAL_AGENTS[id].label])) as Record<AdditionalAgentType, string>;

export const ADDITIONAL_AGENT_COLORS: Record<AdditionalAgentType, string> =
  Object.fromEntries(ADDITIONAL_AGENT_TYPES.map((id) => [id, ADDITIONAL_AGENTS[id].color])) as Record<AdditionalAgentType, string>;

export const ADDITIONAL_AGENT_DESCRIPTIONS: Record<AdditionalAgentType, string> =
  Object.fromEntries(ADDITIONAL_AGENT_TYPES.map((id) => [id, ADDITIONAL_AGENTS[id].description])) as Record<AdditionalAgentType, string>;
