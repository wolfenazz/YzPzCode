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
};

export function getExtensionIcon(extensionId: string): string | undefined {
  return extensionIcons[extensionId];
}
