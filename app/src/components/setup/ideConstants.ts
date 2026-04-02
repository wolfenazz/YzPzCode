import { IdeType } from '../../types';

import vsCodeIcon from '../../assets/Visual_Studio_code.png';
import visualStudioIcon from '../../assets/visual-studio-logo.png';
import cursorIcon from '../../assets/cursor-ai.png';
import zedIcon from '../../assets/zedlogo.png';
import webStormIcon from '../../assets/WebStormLOGO.png';
import intelliJIcon from '../../assets/IntelliJ_IDEA_Logo.png';
import sublimeIcon from '../../assets/sublime_logo.png';
import windsurfIcon from '../../assets/windsufrLogo.jpg';
import perplexityIcon from '../../assets/perplexityLogo.jpg';
import antigravityIcon from '../../assets/antigravity.png';

export const IDE_ORDER: IdeType[] = ['vsCode', 'visualStudio', 'cursor', 'zed', 'webStorm', 'intelliJ', 'sublimeText', 'windsurf', 'perplexity', 'antigravity'];

export const IDE_ICONS: Record<IdeType, string> = {
  vsCode: vsCodeIcon,
  visualStudio: visualStudioIcon,
  cursor: cursorIcon,
  zed: zedIcon,
  webStorm: webStormIcon,
  intelliJ: intelliJIcon,
  sublimeText: sublimeIcon,
  windsurf: windsurfIcon,
  perplexity: perplexityIcon,
  antigravity: antigravityIcon,
};

export const IDE_DISPLAY_NAMES: Record<IdeType, string> = {
  vsCode: 'VS Code',
  visualStudio: 'Visual Studio',
  cursor: 'Cursor',
  zed: 'Zed',
  webStorm: 'WebStorm',
  intelliJ: 'IntelliJ',
  sublimeText: 'Sublime',
  windsurf: 'Windsurf',
  perplexity: 'Perplexity',
  antigravity: 'Antigravity',
};
