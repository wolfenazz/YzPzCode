import kiloIcon from '../assets/kiloCode.gif';
import clineIcon from '../assets/cline.webp';
import codexIcon from '../assets/codex.png';
import claudeIcon from '../assets/claude.png';
import antigravityIcon from '../assets/antigravity.png';
import windsurfIcon from '../assets/windsufrLogo.jpg';

const extensionIcons: Record<string, string> = {
  'kilocode.Kilo-Code': kiloIcon,
  'saoudrizwan.claude-dev': clineIcon,
  'openai.chatgpt': codexIcon,
  'Anthropic.claude-code': claudeIcon,
  'Continue.continue': '/assets/extensions/continue.png',
  'Google.google-antigravity': antigravityIcon,
  'amazonwebservices.amazon-q-vscode': '/assets/extensions/amazon-q.png',
  'TabbyML.vscode-tabby': '/assets/extensions/tabby.png',
  'Codeium.codeium': windsurfIcon,
  'mistralai.mistral-vibe-code': '/assets/mistralvibe.png',
  'RooVeterinaryInc.roo-cline': '/assets/extensions/roo-code.png',
  'Alibaba-Cloud.tongyi-lingma': '/assets/extensions/qoder-cn.png',
  'Augment.vscode-augment': '/assets/extensions/augment.png',
  'NexrallCode.nexrall-code-vscode': '/assets/extensions/nexrall.png',
};

export function getExtensionIcon(extensionId: string): string | undefined {
  return iconsById.get(extensionId.toLowerCase());
}

const iconsById = new Map(Object.entries(extensionIcons).map(([id, icon]) => [id.toLowerCase(), icon]));
