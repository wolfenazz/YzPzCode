import { introductionContent } from './pages/introduction';
import { gettingStartedContent } from './pages/getting-started';
import { aiAgentsContent } from './pages/ai-agents';
import { toolClisContent } from './pages/tool-clis';
import { terminalsContent } from './pages/terminals';
import { editorFilesContent } from './pages/editor-files';
import { sourceControlContent } from './pages/source-control';
import { browserDesignContent } from './pages/browser-design';
import { aiDesignerContent } from './pages/ai-designer';
import { settingsContent } from './pages/settings';
import { integrationsContent } from './pages/integrations';
import { shortcutsHelpContent } from './pages/shortcuts-help';

export interface DocPage {
  id: string;
  title: string;
  category: string;
  description: string;
  content: string;
}

const docPages: DocPage[] = [
  {
    id: 'introduction',
    title: 'Introduction',
    category: 'Getting Started',
    description: 'What YzPzCode is and everything it includes',
    content: introductionContent,
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    category: 'Getting Started',
    description: 'Install, prerequisites, and the workspace setup wizard',
    content: gettingStartedContent,
  },
  {
    id: 'ai-agents',
    title: 'AI Agents',
    category: 'AI Agents',
    description: 'Agent CLIs, the agent harness, queues, and image chat',
    content: aiAgentsContent,
  },
  {
    id: 'tool-clis',
    title: 'Tool CLIs',
    category: 'AI Agents',
    description: 'GitHub, Stripe, Supabase, Vercel, and 6 more SaaS tools',
    content: toolClisContent,
  },
  {
    id: 'terminals',
    title: 'Terminals',
    category: 'Workspace',
    description: 'The terminal grid, colors, quick prompts, and external terminals',
    content: terminalsContent,
  },
  {
    id: 'editor-files',
    title: 'Editor and Files',
    category: 'Workspace',
    description: 'File explorer, code editor, previews, and the image editor',
    content: editorFilesContent,
  },
  {
    id: 'source-control',
    title: 'Source Control',
    category: 'Workspace',
    description: 'Stage, commit, diff, push, and pull from the built-in Git panel',
    content: sourceControlContent,
  },
  {
    id: 'browser-design',
    title: 'Browser and Design',
    category: 'Design',
    description: 'In-app browser, device presets, and the visual design inspector',
    content: browserDesignContent,
  },
  {
    id: 'ai-designer',
    title: 'AI Designer',
    category: 'Design',
    description: 'Prompt-based UI generation, themes, history, and code export',
    content: aiDesignerContent,
  },
  {
    id: 'settings',
    title: 'Settings',
    category: 'Reference',
    description: 'All 13 settings sections explained',
    content: settingsContent,
  },
  {
    id: 'integrations',
    title: 'Integrations',
    category: 'Reference',
    description: 'Discord Rich Presence, IDEs, and workspace templates',
    content: integrationsContent,
  },
  {
    id: 'shortcuts-help',
    title: 'Shortcuts and Help',
    category: 'Reference',
    description: 'Keyboard shortcuts, common tasks, troubleshooting, and FAQ',
    content: shortcutsHelpContent,
  },
];

export const docCategories: string[] = ['Getting Started', 'AI Agents', 'Workspace', 'Design', 'Reference'];

export function getPage(id: string): DocPage | undefined {
  return docPages.find((page) => page.id === id);
}

export { docPages };
