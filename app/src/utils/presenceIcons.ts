/**
 * Discord Rich Presence badge icons. Discord fetches each badge from a URL, so
 * the icon is named by its path in the GitHub repo (the backend proxies it from
 * jsDelivr, see discord_presence.rs). Vite-imported logos have hashed URLs at
 * build time, which Discord cannot use, so the repo paths are listed here.
 *
 * Pure data, no imports: tested by scripts/discord-presence.test.mjs, which also
 * checks every path exists in the repo.
 */

export interface PresenceIcon {
  /** Repo path under `app/`, e.g. `app/src/assets/claude.png`. */
  path: string;
  label: string;
}

/** AI coding agents, by CLI id (the `CliType` of the terminal session). */
const AGENT_ICONS: Record<string, PresenceIcon> = {
  claude: { path: 'app/src/assets/claude.png', label: 'Claude' },
  codex: { path: 'app/src/assets/codex.png', label: 'Codex' },
  antigravity: { path: 'app/src/assets/antigravity.png', label: 'Antigravity CLI' },
  opencode: { path: 'app/src/assets/opencode.png', label: 'OpenCode' },
  cursor: { path: 'app/src/assets/cursor-ai.png', label: 'Cursor' },
  kilo: { path: 'app/src/assets/kiloCode.gif', label: 'Kilo' },
  hermes: { path: 'app/src/assets/Hermes-logo.png', label: 'Hermes' },
  pi: { path: 'app/src/assets/pi.svg', label: 'Pi' },
  commandcode: { path: 'app/src/assets/commandcode-logo.svg', label: 'Command Code' },
  cline: { path: 'app/src/assets/cline.webp', label: 'Cline' },
  grok: { path: 'app/src/assets/Grok.png', label: 'Grok' },
  jcode: { path: 'app/src/assets/jcode.svg', label: 'Jcode' },
  devin: { path: 'app/public/assets/devin.png', label: 'Devin for Terminal' },
  trae: { path: 'app/public/assets/trae.png', label: 'Trae CLI' },
  kimi: { path: 'app/public/assets/kimi.png', label: 'Kimi Code CLI' },
  qoder: { path: 'app/public/assets/qoder.png', label: 'Qoder CLI' },
  copilot: { path: 'app/public/assets/copilot.png', label: 'GitHub Copilot CLI' },
  kiro: { path: 'app/public/assets/kiro.png', label: 'Kiro CLI' },
  mistralvibe: { path: 'app/public/assets/mistralvibe.png', label: 'Mistral Vibe' },
  deepseektui: { path: 'app/public/assets/deepseektui.png', label: 'DeepSeek TUI' },
  aider: { path: 'app/public/assets/aider.png', label: 'Aider' },
  reasonix: { path: 'app/public/assets/reasonix.png', label: 'DeepSeek Reasonix' },
  amp: { path: 'app/public/assets/amp.png', label: 'Amp' },
  dsh: { path: 'app/public/assets/dsh.png', label: 'DeepSeek Harness' },
  codebuddy: { path: 'app/public/assets/codebuddy.png', label: 'CodeBuddy Code' },
  mimo: { path: 'app/public/assets/mimo.png', label: 'MiMo Code' },
  atomcode: { path: 'app/public/assets/atomcode.png', label: 'AtomCode CLI' },
};

/** Extensions by lower-cased id, mirroring data/extensionIcons.ts. */
const EXTENSION_ICONS: Record<string, string> = {
  'kilocode.kilo-code': 'app/src/assets/kiloCode.gif',
  'saoudrizwan.claude-dev': 'app/src/assets/cline.webp',
  'openai.chatgpt': 'app/src/assets/codex.png',
  'anthropic.claude-code': 'app/src/assets/claude.png',
  'google.google-antigravity': 'app/src/assets/antigravity.png',
  'codeium.codeium': 'app/src/assets/windsufrLogo.jpg',
  'continue.continue': 'app/public/assets/extensions/continue.png',
  'amazonwebservices.amazon-q-vscode': 'app/public/assets/extensions/amazon-q.png',
  'tabbyml.vscode-tabby': 'app/public/assets/extensions/tabby.png',
  'mistralai.mistral-vibe-code': 'app/public/assets/mistralvibe.png',
  'rooveterinaryinc.roo-cline': 'app/public/assets/extensions/roo-code.png',
  'alibaba-cloud.tongyi-lingma': 'app/public/assets/extensions/qoder-cn.png',
  'augment.vscode-augment': 'app/public/assets/extensions/augment.png',
  'nexrallcode.nexrall-code-vscode': 'app/public/assets/extensions/nexrall.png',
};

/** The badge for a focused AI agent, or null for a plain shell or a tool CLI. */
export function agentPresenceIcon(agent: string): PresenceIcon | null {
  return AGENT_ICONS[agent] ?? null;
}

/** The badge for an extension panel, or null when the extension has no logo. */
export function extensionPresenceIcon(extensionId: string): string | null {
  return EXTENSION_ICONS[extensionId.toLowerCase()] ?? null;
}

/** The badge for a file, from its Material icon name (`react_ts`, `file`…). */
export function materialIconPresenceIcon(iconName: string): string {
  return `app/public/material-icons/${iconName}.svg`;
}
