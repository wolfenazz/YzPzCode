import { useMemo, useState } from 'react';
import type { CSSProperties, SVGProps } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { closeWindow, maximizeWindow, minimizeWindow } from '../../utils/window';
import { useAppStore } from '../../stores/appStore';
import type { AgentType, TerminalSession } from '../../types';
import {
  DEFAULT_BREAKPOINTS,
  DESIGNER_SYSTEM_PROMPT,
  DESIGNER_THEMES,
  PAGE_TYPE_OPTIONS,
  createDefaultDesignerSkills,
  createInitialDesignerForm,
  generateDesign,
} from './designerGenerator';
import type {
  DesignerCodeTab,
  DesignerDevice,
  DesignerFormState,
  DesignerPageType,
  DesignerThemeId,
  GeneratedDesign,
} from './types';
import './DesignerPage.css';

interface DesignerPageProps {
  isWindows: boolean;
  onBack: () => void;
}

type EntryView = 'home' | 'projects' | 'tasks' | 'design-systems' | 'plugins' | 'integrations';
type ProjectStatus = 'running' | 'awaiting_input' | 'queued' | 'succeeded' | 'published';
type IconName =
  | 'arrow-left'
  | 'arrow-up'
  | 'attach'
  | 'blocks'
  | 'check'
  | 'close'
  | 'discord'
  | 'edit'
  | 'external-link'
  | 'file-code'
  | 'folder'
  | 'grid'
  | 'help-circle'
  | 'home'
  | 'image'
  | 'import'
  | 'kanban'
  | 'link'
  | 'mic'
  | 'moon'
  | 'orbit'
  | 'palette'
  | 'play'
  | 'plus'
  | 'present'
  | 'refresh'
  | 'search'
  | 'settings'
  | 'sparkles'
  | 'star';

interface NavItem {
  id: EntryView;
  label: string;
  icon: IconName;
}

interface DesignerChip {
  id: string;
  label: string;
  icon: IconName;
  category: string;
  promptExamples: string[];
}

interface DesignProject {
  id: string;
  title: string;
  prompt: string;
  kind: string;
  status: ProjectStatus;
  updatedAt: number;
  accent: string;
  design: GeneratedDesign | null;
  savedFolderPath: string | null;
  agentSessionId: string | null;
}

interface WorkflowCard {
  id: string;
  title: string;
  description: string;
  category: string;
  mode: string;
  accent: string;
  tags: string[];
}

interface DesignSystemCard {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches: string[];
}

interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  message: string;
}

const AGENT_OPTIONS: Array<{ id: AgentType; label: string }> = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'kilo', label: 'Kilo' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'hermes', label: 'Hermes' },
];

const PAGE_TYPE_BY_CATEGORY: Record<string, DesignerPageType> = {
  prototype: 'landing',
  'live-artifact': 'dashboard',
  deck: 'website',
  image: 'product',
  video: 'website',
  hyperframes: 'website',
  audio: 'product',
  plugin: 'admin',
  import: 'website',
  template: 'landing',
};

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'tasks', label: 'Automations', icon: 'kanban' },
  { id: 'design-systems', label: 'Design systems', icon: 'blocks' },
  { id: 'plugins', label: 'Plugins', icon: 'grid' },
  { id: 'integrations', label: 'Integrations', icon: 'link' },
];

const DESIGNER_CHIPS: DesignerChip[] = [
  {
    id: 'prototype',
    label: 'Prototype',
    icon: 'palette',
    category: 'prototype',
    promptExamples: [
      'Design a high-converting website for an AI CRM with a clear hero, feature story, proof points, and trial CTA',
      'Create a desktop dashboard for a team knowledge base with search, recent updates, permissions, and collaboration entry points',
      'Prototype a mobile fitness coaching app covering goal setup, weekly plans, workout check-ins, and progress review',
    ],
  },
  {
    id: 'live-artifact',
    label: 'Live artifact',
    icon: 'refresh',
    category: 'live-artifact',
    promptExamples: [
      'Build a refreshable executive operations brief with revenue, activation, risk, and next-action panels',
      'Create a connector-ready customer health artifact with alerts, trend cards, and a weekly summary',
    ],
  },
  {
    id: 'deck',
    label: 'Slide deck',
    icon: 'present',
    category: 'deck',
    promptExamples: [
      'Design an investor pitch with market sizing, growth model, product advantage, and three-year forecast data',
      'Generate a weekly team status report with progress, risks, metric changes, and next-week priorities',
    ],
  },
  {
    id: 'image',
    label: 'Image',
    icon: 'image',
    category: 'image',
    promptExamples: [
      'Generate a glassmorphism AI workspace poster with multi-screen collaboration and a premium launch mood',
      'Create an ecommerce hero image for new wireless headphones that highlights materials and core benefits',
    ],
  },
  {
    id: 'video',
    label: 'Video',
    icon: 'play',
    category: 'video',
    promptExamples: [
      'Make an 8-second product reveal film that moves from silhouette to close-up detail and ends on the brand mark',
      'Turn a website into a 15-second social ad by extracting the hero claim, interaction highlights, and a clear CTA',
    ],
  },
  {
    id: 'hyperframes',
    label: 'HyperFrames',
    icon: 'orbit',
    category: 'hyperframes',
    promptExamples: [
      'Build a captioned product launch short with title cards, feature shots, rhythmic transitions, and an ending CTA',
      'Make an animated flight-route map showing city nodes, route growth, mileage data, and a final summary frame',
    ],
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: 'mic',
    category: 'audio',
    promptExamples: [
      'Generate a product startup sound that feels light, trustworthy, slightly futuristic, and suitable for a desktop app launch',
      'Create a 20-second podcast intro bed with a warm opening, clear pulse, and a clean handoff into voiceover',
    ],
  },
  {
    id: 'create-plugin',
    label: 'Create plugin',
    icon: 'edit',
    category: 'plugin',
    promptExamples: [
      'Create a YzPzDesgin plugin that generates an interactive prototype from a product brief',
      'Create a YzPzDesgin plugin for reports, documents, case studies, specs, invoices, or resumes',
    ],
  },
  {
    id: 'figma',
    label: 'From Figma',
    icon: 'import',
    category: 'import',
    promptExamples: [
      'Migrate a Figma marketing page into a responsive React and Tailwind implementation',
      'Extract a Figma dashboard frame into a clean product UI with reusable components',
    ],
  },
  {
    id: 'template',
    label: 'From template',
    icon: 'file-code',
    category: 'template',
    promptExamples: [
      'Start from a bundled SaaS landing template and adapt it for an AI support product',
      'Use a magazine deck template to create a product launch narrative with speaker notes',
    ],
  },
];

const WORKFLOW_CARDS: WorkflowCard[] = [
  {
    id: 'example-web-prototype',
    title: 'Web prototype',
    description: 'Single-file HTML prototype seed with layout recipes and a visual QA checklist.',
    category: 'prototype',
    mode: 'Prototype',
    accent: '#10b981',
    tags: ['HTML', 'Responsive', 'Product'],
  },
  {
    id: 'example-live-artifact',
    title: 'Live artifact',
    description: 'Refreshable artifact flow for dashboards, briefs, and data-backed workspaces.',
    category: 'live-artifact',
    mode: 'Artifact',
    accent: '#22d3ee',
    tags: ['Data', 'Connectors', 'Refresh'],
  },
  {
    id: 'example-simple-deck',
    title: 'Simple deck',
    description: 'Slide framework with print-ready sizing, navigation chrome, and dense layouts.',
    category: 'deck',
    mode: 'Deck',
    accent: '#a3e635',
    tags: ['Slides', 'Narrative', 'PDF'],
  },
  {
    id: 'example-hyperframes',
    title: 'HyperFrames',
    description: 'HTML-based motion graphics for captions, product reveals, maps, and data scenes.',
    category: 'hyperframes',
    mode: 'Video',
    accent: '#14b8a6',
    tags: ['Motion', 'HTML', 'MP4'],
  },
  {
    id: 'image-poster',
    title: 'Image poster',
    description: 'Poster, hero, and social image prompts with structured creative direction.',
    category: 'image',
    mode: 'Image',
    accent: '#f472b6',
    tags: ['Poster', 'Social', 'Visual'],
  },
  {
    id: 'kanban-board',
    title: 'Kanban board',
    description: 'Operational board pattern with lanes, swimlanes, counters, and work-in-progress states.',
    category: 'prototype',
    mode: 'Prototype',
    accent: '#f59e0b',
    tags: ['Ops', 'Board', 'Workflow'],
  },
  {
    id: 'invoice',
    title: 'Invoice',
    description: 'Document-like artifact template tuned for clean typography and export fidelity.',
    category: 'template',
    mode: 'Template',
    accent: '#94a3b8',
    tags: ['Document', 'Finance', 'PDF'],
  },
  {
    id: 'yzpzdesgin-landing',
    title: 'YzPzDesgin landing',
    description: 'Full landing-page example with method blocks, lab assets, testimonial, and CTA.',
    category: 'prototype',
    mode: 'Example',
    accent: '#38bdf8',
    tags: ['Landing', 'Brand', 'Campaign'],
  },
];

const DESIGN_SYSTEMS: DesignSystemCard[] = [
  {
    id: 'linear',
    title: 'Linear app',
    category: 'Product system',
    summary: 'Precise grayscale surfaces, restrained contrast, and focused productivity patterns.',
    swatches: ['#0f1115', '#f7f8fa', '#5e6ad2', '#d8dbe7'],
  },
  {
    id: 'stripe',
    title: 'Stripe',
    category: 'Fintech',
    summary: 'Crisp product gradients, structured documentation rhythm, and confident CTA hierarchy.',
    swatches: ['#635bff', '#00d4ff', '#f6f9fc', '#0a2540'],
  },
  {
    id: 'apple',
    title: 'Apple',
    category: 'Platform',
    summary: 'Highly polished product staging, airy typography, and detail-led visual storytelling.',
    swatches: ['#f5f5f7', '#1d1d1f', '#0071e3', '#86868b'],
  },
  {
    id: 'openai',
    title: 'OpenAI',
    category: 'AI',
    summary: 'Calm editorial surfaces, readable prose blocks, and quiet technical confidence.',
    swatches: ['#111111', '#f5f5f0', '#10a37f', '#d9d9d0'],
  },
  {
    id: 'raycast',
    title: 'Raycast',
    category: 'Developer tools',
    summary: 'Command-forward UI, vivid red accents, compact cards, and fast scanning.',
    swatches: ['#ff6363', '#111113', '#ffffff', '#2f3137'],
  },
  {
    id: 'neon',
    title: 'Neon',
    category: 'Database',
    summary: 'Dark technical chrome, luminous green highlights, and database-native visuals.',
    swatches: ['#00e599', '#0b0f13', '#f0f9ff', '#1f2937'],
  },
  {
    id: 'notion',
    title: 'Notion',
    category: 'Knowledge',
    summary: 'Document-first layout, simple controls, neutral surfaces, and editorial density.',
    swatches: ['#ffffff', '#191919', '#f1f1ef', '#787774'],
  },
  {
    id: 'figma',
    title: 'Figma',
    category: 'Design tooling',
    summary: 'Collaborative canvas language with colorful nodes, panels, and creative controls.',
    swatches: ['#0acf83', '#a259ff', '#f24e1e', '#1abcfe'],
  },
];

const TASKS = [
  { title: 'Nightly design-system audit', state: 'Ready', detail: 'Review generated assets, token drift, and missing documentation.' },
  { title: 'Plugin catalog refresh', state: 'Paused', detail: 'Scan bundled workflows and surface new examples in the gallery.' },
  { title: 'Preview QA pass', state: 'Ready', detail: 'Check exported HTML, PDF, and deck previews across desktop and mobile widths.' },
];

const normalizePath = (path: string): string => path.replace(/[\\/]+$/g, '').replace(/\\/g, '/');

const sanitizeFolderName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 58) || 'yzpzdesgin-project';

const formatStamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('');
};

const timeAgo = (timestamp: number): string => {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const titleFromPrompt = (prompt: string, fallback: string): string => {
  const cleaned = prompt
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9 ]+/g, '')
    .trim();
  if (!cleaned) return fallback;
  const words = cleaned.split(' ').slice(0, 6);
  return words
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
};

const buildBriefContent = (project: DesignProject, workspacePath: string | null): string => {
  const workspaceLine = workspacePath ? `Workspace: ${workspacePath}` : 'Workspace: not selected';
  return [
    '# YzPzDesgin Brief',
    '',
    `Title: ${project.title}`,
    `Kind: ${project.kind}`,
    `Status: ${project.status}`,
    workspaceLine,
    `Created: ${new Date(project.updatedAt).toISOString()}`,
    '',
    '## Prompt',
    '',
    project.prompt,
    project.design ? ['', '## Generated Summary', '', project.design.summary].join('\n') : '',
    project.design ? ['', '## Responsive Notes', '', ...project.design.responsiveNotes.map((note) => `- ${note}`)].join('\n') : '',
    '',
    '## YzPzDesgin Source',
    '',
    'This project was created from the YzPzDesgin section ported from app/desgin/.',
  ].filter(Boolean).join('\n');
};

const buildPreviewDocument = (design: GeneratedDesign): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${design.css}</style>
  </head>
  <body>${design.html}</body>
</html>`;

const buildExportDocument = (design: GeneratedDesign): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${design.title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>${design.html}</body>
</html>`;

const buildBracketedPasteInput = (value: string): string => `\x1b[200~${value}\x1b[201~\r`;

const sessionDisplayName = (session: TerminalSession): string =>
  session.agent ? `TTY ${session.index + 1} · ${session.agent}` : `TTY ${session.index + 1} · shell`;

const buildAgentPrompt = (
  project: DesignProject,
  design: GeneratedDesign,
  workspacePath: string | null,
  savedFolderPath: string | null,
): string => [
  'YzPzDesgin implementation request.',
  '',
  'Please inspect this workspace, follow the existing stack and style, and integrate the generated design into the app in a maintainable way.',
  '',
  'Project context:',
  `- Title: ${project.title}`,
  `- Kind: ${project.kind}`,
  `- Workspace: ${workspacePath ?? 'not selected'}`,
  `- Export folder: ${savedFolderPath ?? 'not exported yet'}`,
  `- Theme: ${design.selectedTheme.label}`,
  '',
  'User brief:',
  project.prompt,
  '',
  'Generated summary:',
  design.summary,
  '',
  'Responsive notes:',
  ...design.responsiveNotes.map((note) => `- ${note}`),
  '',
  'Accessibility checks:',
  ...design.accessibilityChecks.map((check) => `- ${check}`),
  '',
  'Implementation instructions:',
  '- Prefer project-native React/Tauri patterns over pasting static HTML blindly.',
  '- Preserve existing routing, state, stores, and terminal/browser workflows.',
  '- Use the exported files if present; otherwise use the HTML/CSS below as the source reference.',
  '- Keep the design responsive and verify with the local app.',
  '',
  'Generated HTML:',
  '```html',
  design.html,
  '```',
  '',
  'Generated CSS:',
  '```css',
  design.css,
  '```',
].join('\n');

const createInitialProjects = (): DesignProject[] => {
  const now = Date.now();
  return [
    {
      id: 'welcome-yzpzdesgin',
      title: 'YzPzDesgin Entry View',
      prompt: 'Pick a skill, pick a design system, type the brief, and render a sandboxed preview.',
      kind: 'Prototype',
      status: 'published',
      updatedAt: now - 1000 * 60 * 28,
      accent: '#10b981',
      design: null,
      savedFolderPath: null,
      agentSessionId: null,
    },
    {
      id: 'design-system-library',
      title: 'Design Systems Library',
      prompt: 'Browse official product systems, inspect swatches, and apply a visual direction.',
      kind: 'Design system',
      status: 'succeeded',
      updatedAt: now - 1000 * 60 * 74,
      accent: '#22d3ee',
      design: null,
      savedFolderPath: null,
      agentSessionId: null,
    },
    {
      id: 'magazine-deck',
      title: 'Magazine Deck',
      prompt: 'Create a polished slide deck with cover, stats, quote, CTA, and end card.',
      kind: 'Slide deck',
      status: 'awaiting_input',
      updatedAt: now - 1000 * 60 * 180,
      accent: '#a3e635',
      design: null,
      savedFolderPath: null,
      agentSessionId: null,
    },
  ];
};

export const DesignerPage: React.FC<DesignerPageProps> = ({ isWindows, onBack }) => {
  const currentWorkspace = useAppStore((state) => state.currentWorkspace);
  const openWorkspaces = useAppStore((state) => state.openWorkspaces);
  const sessions = useAppStore((state) => state.sessions);
  const sessionsByWorkspace = useAppStore((state) => state.sessionsByWorkspace);
  const addSession = useAppStore((state) => state.addSession);
  const setActiveSessionForWorkspace = useAppStore((state) => state.setActiveSessionForWorkspace);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  const workspacePath = currentWorkspace?.path ?? openWorkspaces[0]?.path ?? null;
  const workspaceId = currentWorkspace?.id ?? openWorkspaces[0]?.id ?? null;
  const availableSessions = workspaceId ? (sessionsByWorkspace[workspaceId] ?? sessions) : [];
  const [activeView, setActiveView] = useState<EntryView>('home');
  const [activeChipId, setActiveChipId] = useState('prototype');
  const [prompt, setPrompt] = useState('');
  const [projects, setProjects] = useState<DesignProject[]>(() => createInitialProjects());
  const [pluginFilter, setPluginFilter] = useState('all');
  const [pluginSearch, setPluginSearch] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle', message: '' });
  const [designerForm, setDesignerForm] = useState<DesignerFormState>(() => createInitialDesignerForm());
  const [currentProject, setCurrentProject] = useState<DesignProject | null>(null);
  const [currentDesign, setCurrentDesign] = useState<GeneratedDesign | null>(null);
  const [activeCodeTab, setActiveCodeTab] = useState<DesignerCodeTab>('html');
  const [previewDevice, setPreviewDevice] = useState<DesignerDevice>('responsive');
  const [generationCount, setGenerationCount] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('codex');
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<SaveState>({ status: 'idle', message: '' });
  const [isSendingToAgent, setIsSendingToAgent] = useState(false);

  const activeChip = useMemo(
    () => DESIGNER_CHIPS.find((chip) => chip.id === activeChipId) ?? DESIGNER_CHIPS[0]!,
    [activeChipId],
  );

  const designerSkills = useMemo(() => createDefaultDesignerSkills(), []);

  const effectiveTargetSessionId = useMemo(() => {
    if (targetSessionId && availableSessions.some((session) => session.id === targetSessionId)) {
      return targetSessionId;
    }
    return availableSessions[0]?.id ?? null;
  }, [availableSessions, targetSessionId]);

  const filteredWorkflows = useMemo(() => {
    const query = pluginSearch.trim().toLowerCase();
    return WORKFLOW_CARDS.filter((card) => {
      const categoryMatches = pluginFilter === 'all' || card.category === pluginFilter;
      if (!categoryMatches) return false;
      if (!query) return true;
      return [card.title, card.description, card.mode, ...card.tags]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [pluginFilter, pluginSearch]);

  const recentProjects = useMemo(() => projects.slice(0, 4), [projects]);

  const updateDesignerForm = (updates: Partial<DesignerFormState>): void => {
    setDesignerForm((current) => ({ ...current, ...updates }));
  };

  const saveProjectFiles = async (project: DesignProject, design: GeneratedDesign): Promise<string | null> => {
    if (!workspacePath) {
      setSaveState({ status: 'idle', message: 'Preview generated. Open a workspace to export files.' });
      return null;
    }

    setSaveState({ status: 'saving', message: 'Saving generated HTML, CSS, and metadata...' });
    const root = normalizePath(workspacePath);
    const folderPath = `${root}/Design/${sanitizeFolderName(project.title)}-${formatStamp(project.updatedAt)}`;
    await invoke<void>('write_file_content', {
      path: `${folderPath}/index.html`,
      content: buildExportDocument(design),
    });
    await invoke<void>('write_file_content', {
      path: `${folderPath}/styles.css`,
      content: design.css,
    });
    await invoke<void>('write_file_content', {
      path: `${folderPath}/DESIGN.md`,
      content: buildBriefContent({ ...project, savedFolderPath: folderPath }, workspacePath),
    });
    await invoke<void>('write_file_content', {
      path: `${folderPath}/yzpzdesgin-meta.json`,
      content: JSON.stringify(
        {
          ...project,
          savedFolderPath: folderPath,
          design: {
            id: design.id,
            title: design.title,
            summary: design.summary,
            selectedTheme: design.selectedTheme,
            responsiveNotes: design.responsiveNotes,
            accessibilityChecks: design.accessibilityChecks,
            suggestedImprovements: design.suggestedImprovements,
            layers: design.layers,
          },
        },
        null,
        2,
      ),
    });
    setSaveState({ status: 'saved', message: `Exported to ${folderPath.replace(/\//g, '\\')}` });
    return folderPath;
  };

  const handleRun = async (): Promise<void> => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const createdAt = Date.now();
    const nextForm: DesignerFormState = {
      ...designerForm,
      prompt: trimmed,
      themeId: designerForm.themeId || 'terminal-pro',
      pageType: PAGE_TYPE_BY_CATEGORY[activeChip.category] ?? designerForm.pageType,
      requiredSections: designerForm.requiredSections || 'Hero, Features, Proof metrics, Lead form, Final CTA',
      mood: designerForm.mood || 'precise, confident, fast, and terminal-inspired',
    };
    const nextGeneration = generationCount + 1;
    const design = generateDesign(nextForm, designerSkills, nextGeneration, undefined, DEFAULT_BREAKPOINTS);
    const project: DesignProject = {
      id: `yzpzdesgin-${createdAt}`,
      title: design.title || titleFromPrompt(trimmed, `${activeChip.label} Project`),
      prompt: trimmed,
      kind: activeChip.label,
      status: 'succeeded',
      updatedAt: createdAt,
      accent: WORKFLOW_CARDS.find((card) => card.category === activeChip.category)?.accent ?? '#10b981',
      design,
      savedFolderPath: null,
      agentSessionId: null,
    };

    setDesignerForm(nextForm);
    setCurrentDesign(design);
    setCurrentProject(project);
    setGenerationCount(nextGeneration);
    setActiveView('home');
    setProjects((current) => [project, ...current].slice(0, 50));
    setPrompt('');

    try {
      const savedFolderPath = await saveProjectFiles(project, design);
      if (savedFolderPath) {
        const savedProject = { ...project, savedFolderPath };
        setCurrentProject(savedProject);
        setProjects((current) =>
          current.map((item) => (item.id === project.id ? savedProject : item)),
        );
      }
    } catch (error) {
      setSaveState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleExportCurrent = async (): Promise<void> => {
    if (!currentProject || !currentDesign) {
      setSaveState({ status: 'error', message: 'Generate or open a design before exporting.' });
      return;
    }
    try {
      const savedFolderPath = await saveProjectFiles(currentProject, currentDesign);
      if (savedFolderPath) {
        const savedProject = { ...currentProject, savedFolderPath };
        setCurrentProject(savedProject);
        setProjects((current) =>
          current.map((item) => (item.id === currentProject.id ? savedProject : item)),
        );
      }
    } catch (error) {
      setSaveState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleOpenProject = (project: DesignProject): void => {
    setCurrentProject(project);
    setCurrentDesign(project.design);
    setPrompt(project.design ? '' : project.prompt);
    setActiveView('home');
    setSaveState({
      status: project.savedFolderPath ? 'saved' : 'idle',
      message: project.savedFolderPath
        ? `Exported to ${project.savedFolderPath.replace(/\//g, '\\')}`
        : project.design
          ? 'Project opened. Export when ready.'
          : 'Project brief opened. Run it to generate a preview.',
    });
  };

  const handleSendToAgent = async (): Promise<void> => {
    if (!currentProject || !currentDesign) {
      setAgentState({ status: 'error', message: 'Generate or open a design before sending it to an agent CLI.' });
      return;
    }
    if (!workspaceId || !workspacePath || !currentWorkspace) {
      setAgentState({ status: 'error', message: 'Open a workspace before sending designs to agent CLIs.' });
      return;
    }

    setIsSendingToAgent(true);
    setAgentState({ status: 'saving', message: 'Preparing terminal handoff...' });
    try {
      let targetId = effectiveTargetSessionId;
      if (!targetId) {
        const session = await invoke<TerminalSession>('create_single_terminal_session', {
          request: {
            workspaceId,
            workspacePath,
            index: availableSessions.length,
            agent: selectedAgent,
          },
        });
        addSession(session);
        setActiveSessionForWorkspace(workspaceId, session.id);
        targetId = session.id;
      }

      const promptForAgent = buildAgentPrompt(
        currentProject,
        currentDesign,
        workspacePath,
        currentProject.savedFolderPath,
      );
      await invoke<void>('write_to_terminal', {
        sessionId: targetId,
        input: buildBracketedPasteInput(promptForAgent),
      });
      const sentProject = { ...currentProject, agentSessionId: targetId, status: 'running' as ProjectStatus };
      setCurrentProject(sentProject);
      setProjects((current) =>
        current.map((item) => (item.id === currentProject.id ? sentProject : item)),
      );
      setTargetSessionId(targetId);
      setAgentState({ status: 'saved', message: `Sent to ${targetId}. Check the target terminal to continue.` });
    } catch (error) {
      setAgentState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSendingToAgent(false);
    }
  };

  return (
    <div className="od-designer" data-theme={theme === 'light' ? 'light' : 'dark'}>
      <header data-tauri-drag-region className="od-window-bar titlebar-drag">
        <div className="od-window-left titlebar-nodrag">
          <button type="button" className="od-window-back" onClick={onBack} title="Back" aria-label="Back">
            <Icon name="arrow-left" size={15} />
          </button>
          <div className="od-window-brand">
            <YzPzDesginMark size={24} />
            <span>YzPzDesgin</span>
          </div>
        </div>

        <div className="od-window-center">
          {workspacePath ? `Workspace YzPzDesgin folder: ${workspacePath}\\Design` : 'Preview mode'}
        </div>

        <div className="od-window-actions titlebar-nodrag">
          <button type="button" className="od-icon-button" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            <Icon name="moon" size={15} />
          </button>
          {isWindows && (
            <div className="od-win-controls">
              <button type="button" onClick={minimizeWindow} title="Minimize" aria-label="Minimize">
                <span />
              </button>
              <button type="button" onClick={maximizeWindow} title="Maximize" aria-label="Maximize">
                <i />
              </button>
              <button type="button" className="od-win-close" onClick={closeWindow} title="Close" aria-label="Close">
                <Icon name="close" size={12} />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="od-entry-shell">
        <nav className="od-rail" aria-label="YzPzDesgin navigation">
          <div className="od-rail__group">
            <button
              type="button"
              className={`od-rail__logo${activeView === 'home' ? ' is-active' : ''}`}
              onClick={() => setActiveView('home')}
              data-tooltip="YzPzDesgin"
              aria-label="YzPzDesgin"
            >
              <YzPzDesginMark size={30} />
            </button>
            <div className="od-rail__divider" />
            <button
              type="button"
              className="od-rail__btn"
              onClick={() => {
                setActiveView('home');
                setActiveChipId('prototype');
              }}
              data-tooltip="New project"
              aria-label="New project"
            >
              <Icon name="plus" size={18} />
            </button>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`od-rail__btn${activeView === item.id ? ' is-active' : ''}`}
                onClick={() => setActiveView(item.id)}
                data-tooltip={item.label}
                aria-label={item.label}
                aria-current={activeView === item.id ? 'page' : undefined}
              >
                <Icon name={item.icon} size={18} />
              </button>
            ))}
          </div>
          <div className="od-rail__footer">
            <div className="od-rail__divider" />
            <button
              type="button"
              className="od-rail__btn"
              onClick={() => setActiveView('integrations')}
              data-tooltip="Integrations"
              aria-label="Integrations"
            >
              <Icon name="help-circle" size={18} />
            </button>
          </div>
        </nav>

        <main className="od-main">
          <div className="od-topbar">
            <div className="od-topbar__chips">
              <button type="button" className="od-top-pill" onClick={() => setActiveView('projects')} title="Open YzPzDesgin projects">
                <Icon name="star" size={14} />
                <span>YzPzDesgin</span>
                <strong>workspace</strong>
              </button>
              <button type="button" className="od-top-pill" onClick={() => setActiveView('design-systems')} title="Open terminal design systems">
                <Icon name="blocks" size={14} />
                <span>Systems</span>
              </button>
              <button type="button" className="od-top-pill" onClick={() => setActiveView('integrations')}>
                <Icon name="sparkles" size={14} />
                <span>Codex</span>
                <strong>local CLI</strong>
              </button>
              <button type="button" className="od-top-pill" onClick={() => setActiveView('integrations')}>
                <Icon name="link" size={14} />
                <span>Use everywhere</span>
              </button>
            </div>
            <button type="button" className="od-settings-button" onClick={() => setActiveView('integrations')} aria-label="Settings">
              <Icon name="settings" size={17} />
            </button>
          </div>

          {activeView === 'home' && (
            <div className="od-main__inner">
              <HomeComposer
                activeChip={activeChip}
                activeChipId={activeChipId}
                designerForm={designerForm}
                prompt={prompt}
                saveState={saveState}
                onDesignerFormChange={updateDesignerForm}
                onPromptChange={setPrompt}
                onPickChip={setActiveChipId}
                onRun={() => void handleRun()}
              />
              <DesignerWorkbench
                design={currentDesign}
                project={currentProject}
                activeCodeTab={activeCodeTab}
                previewDevice={previewDevice}
                saveState={saveState}
                onActiveCodeTabChange={setActiveCodeTab}
                onPreviewDeviceChange={setPreviewDevice}
                onExport={() => void handleExportCurrent()}
              />
              <AgentHandoffPanel
                design={currentDesign}
                sessions={availableSessions}
                selectedAgent={selectedAgent}
                selectedSessionId={effectiveTargetSessionId}
                agentState={agentState}
                isSending={isSendingToAgent}
                onAgentChange={setSelectedAgent}
                onSessionChange={setTargetSessionId}
                onSend={() => void handleSendToAgent()}
              />
              <RecentProjectsStrip
                projects={recentProjects}
                onOpenProject={handleOpenProject}
                onOpenProjects={() => setActiveView('projects')}
              />
              <WorkflowGallery
                cards={filteredWorkflows}
                activeChipId={activeChipId}
                filter={pluginFilter}
                search={pluginSearch}
                onFilterChange={setPluginFilter}
                onSearchChange={setPluginSearch}
                onPick={(card) => {
                  setActiveView('home');
                  const chip = DESIGNER_CHIPS.find((item) => item.category === card.category);
                  if (chip) setActiveChipId(chip.id);
                  setPrompt(card.description);
                }}
              />
            </div>
          )}

          {activeView === 'projects' && (
            <div className="od-main__inner od-main__inner--wide">
              <SectionHeader title="Projects" subtitle="Saved YzPzDesgin workspaces and active generation runs." />
              <div className="od-project-grid">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} onOpen={handleOpenProject} />
                ))}
              </div>
            </div>
          )}

          {activeView === 'tasks' && (
            <div className="od-main__inner od-main__inner--wide">
              <SectionHeader title="Automations" subtitle="Recurring checks and design workflow maintenance." />
              <div className="od-task-grid">
                {TASKS.map((task) => (
                  <article key={task.title} className="od-task-card">
                    <span>{task.state}</span>
                    <h3>{task.title}</h3>
                    <p>{task.detail}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeView === 'design-systems' && (
            <div className="od-main__inner od-main__inner--wide">
              <SectionHeader title="Design systems" subtitle="Terminal-modern visual systems imported from app/desgin/." />
              <div className="od-system-grid">
                {DESIGN_SYSTEMS.map((system) => (
                  <article key={system.id} className="od-system-card">
                    <div className="od-system-card__swatches">
                      {system.swatches.map((swatch) => (
                        <span key={swatch} style={{ '--swatch': swatch } as CSSProperties} />
                      ))}
                    </div>
                    <span>{system.category}</span>
                    <h3>{system.title}</h3>
                    <p>{system.summary}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeView === 'plugins' && (
            <div className="od-main__inner od-main__inner--wide">
              <WorkflowGallery
                cards={filteredWorkflows}
                activeChipId={activeChipId}
                filter={pluginFilter}
                search={pluginSearch}
                onFilterChange={setPluginFilter}
                onSearchChange={setPluginSearch}
                onPick={(card) => {
                  const chip = DESIGNER_CHIPS.find((item) => item.category === card.category);
                  if (chip) setActiveChipId(chip.id);
                  setActiveView('home');
                  setPrompt(card.description);
                }}
              />
            </div>
          )}

          {activeView === 'integrations' && (
            <div className="od-main__inner od-main__inner--wide">
              <SectionHeader title="Integrations" subtitle="Local CLI, BYOK proxy, MCP, and workspace handoff surfaces." />
              <div className="od-integration-grid">
                {[
                  ['Local CLI', 'Claude Code, Codex, Gemini, OpenCode, Kilo, Cursor, and more on PATH.'],
                  ['BYOK proxy', 'OpenAI-compatible, Anthropic, Google, Azure, Ollama, and media providers.'],
                  ['MCP server', 'Expose skills, design systems, projects, and artifacts to external coding agents.'],
                  ['Workspace handoff', 'Persist prompts and briefs into the active YzPzCode Design folder.'],
                ].map(([title, body]) => (
                  <article key={title} className="od-integration-card">
                    <Icon name="link" size={18} />
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

interface HomeComposerProps {
  activeChip: DesignerChip;
  activeChipId: string;
  designerForm: DesignerFormState;
  prompt: string;
  saveState: SaveState;
  onDesignerFormChange: (updates: Partial<DesignerFormState>) => void;
  onPromptChange: (value: string) => void;
  onPickChip: (id: string) => void;
  onRun: () => void;
}

const HomeComposer: React.FC<HomeComposerProps> = ({
  activeChip,
  activeChipId,
  designerForm,
  prompt,
  saveState,
  onDesignerFormChange,
  onPromptChange,
  onPickChip,
  onRun,
}) => (
  <section className="od-home-hero" data-testid="home-hero">
    <div className="od-home-hero__brand" aria-hidden="true">
      <span className="od-home-hero__brand-mark">
        <YzPzDesginMark size={22} />
      </span>
      <span className="od-home-hero__brand-name">YzPzDesgin</span>
    </div>
    <h1>What do you want to design?</h1>
    <p>Terminal-modern design generation for YzPzCode.</p>

    <div className="od-composer-card">
      <div className="od-active-chip">
        <span className="od-active-dot" />
        <span>{activeChip.label}</span>
      </div>
      <textarea
        value={prompt}
        rows={3}
        spellCheck={false}
        placeholder="Describe what you want to generate..."
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            onRun();
          }
        }}
      />
      <div className="od-composer-foot">
        <div className="od-composer-left">
          <label className="od-composer-select">
            <span>theme</span>
            <select
              value={designerForm.themeId}
              onChange={(event) => onDesignerFormChange({ themeId: event.target.value as DesignerThemeId })}
            >
              {DESIGNER_THEMES.map((themeOption) => (
                <option key={themeOption.id} value={themeOption.id}>
                  {themeOption.label}
                </option>
              ))}
            </select>
          </label>
          <label className="od-composer-select">
            <span>type</span>
            <select
              value={designerForm.pageType}
              onChange={(event) => onDesignerFormChange({ pageType: event.target.value as DesignerPageType })}
            >
              {PAGE_TYPE_OPTIONS.map((pageType) => (
                <option key={pageType.id} value={pageType.id}>
                  {pageType.label}
                </option>
              ))}
            </select>
          </label>
          <label className="od-composer-select">
            <span>device</span>
            <select
              value={designerForm.targetDevice}
              onChange={(event) => onDesignerFormChange({ targetDevice: event.target.value as DesignerDevice })}
            >
              {['responsive', 'desktop', 'tablet', 'mobile'].map((device) => (
                <option key={device} value={device}>
                  {device}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="od-submit-button"
          onClick={onRun}
          disabled={!prompt.trim()}
          title="Run"
          aria-label="Run"
        >
          <Icon name="arrow-up" size={17} />
        </button>
      </div>
    </div>

    <div className="od-type-tabs" aria-label="Pick a project category">
      {DESIGNER_CHIPS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={`od-type-tab${activeChipId === chip.id ? ' is-active' : ''}`}
          onClick={() => onPickChip(chip.id)}
          title={chip.label}
        >
          <Icon name={chip.icon} size={14} />
          <span>{chip.label}</span>
        </button>
      ))}
    </div>

    <div className="od-prompt-examples">
      <div className="od-prompt-examples__title">Example prompts</div>
      <div className="od-prompt-examples__grid">
        {activeChip.promptExamples.map((example) => (
          <button key={example} type="button" onClick={() => onPromptChange(example)}>
            <span>{example}</span>
            <Icon name="external-link" size={14} />
          </button>
        ))}
      </div>
    </div>

    {saveState.message && (
      <div className={`od-save-state is-${saveState.status}`} role={saveState.status === 'error' ? 'alert' : 'status'}>
        {saveState.message}
      </div>
    )}
  </section>
);

interface DesignerWorkbenchProps {
  design: GeneratedDesign | null;
  project: DesignProject | null;
  activeCodeTab: DesignerCodeTab;
  previewDevice: DesignerDevice;
  saveState: SaveState;
  onActiveCodeTabChange: (tab: DesignerCodeTab) => void;
  onPreviewDeviceChange: (device: DesignerDevice) => void;
  onExport: () => void;
}

const codeForTab = (design: GeneratedDesign | null, activeCodeTab: DesignerCodeTab): string => {
  if (activeCodeTab === 'system') return DESIGNER_SYSTEM_PROMPT;
  if (!design) return '';
  if (activeCodeTab === 'html') return design.html;
  if (activeCodeTab === 'css') return design.css;
  return design.customizationMap;
};

const DesignerWorkbench: React.FC<DesignerWorkbenchProps> = ({
  design,
  project,
  activeCodeTab,
  previewDevice,
  saveState,
  onActiveCodeTabChange,
  onPreviewDeviceChange,
  onExport,
}) => {
  const code = codeForTab(design, activeCodeTab);

  const copyCode = (): void => {
    if (!code) return;
    navigator.clipboard.writeText(code).catch(() => undefined);
  };

  return (
    <section className="od-workbench">
      <div className="od-workbench__head">
        <div>
          <span>live output</span>
          <h2>{project?.title ?? 'No generated design yet'}</h2>
          <p>{design?.summary ?? 'Run the composer to generate responsive HTML, CSS, metadata, and exportable files.'}</p>
        </div>
        <div className="od-workbench__actions">
          <select
            value={previewDevice}
            onChange={(event) => onPreviewDeviceChange(event.target.value as DesignerDevice)}
            aria-label="Preview device"
          >
            {['responsive', 'desktop', 'tablet', 'mobile'].map((device) => (
              <option key={device} value={device}>
                {device}
              </option>
            ))}
          </select>
          <button type="button" onClick={onExport} disabled={!design}>
            Export files
          </button>
        </div>
      </div>

      <div className="od-workbench__grid">
        <div className="od-preview-shell" data-device={previewDevice}>
          {design ? (
            <iframe
              title="YzPzDesgin generated preview"
              sandbox="allow-same-origin"
              srcDoc={buildPreviewDocument(design)}
            />
          ) : (
            <div className="od-preview-empty">
              <Icon name="file-code" size={22} />
              <strong>Preview waiting</strong>
              <span>Generated designs render here as sandboxed HTML/CSS.</span>
            </div>
          )}
        </div>

        <aside className="od-code-panel">
          <div className="od-code-tabs" aria-label="Generated code tabs">
            {(['html', 'css', 'map', 'system'] as DesignerCodeTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={activeCodeTab === tab ? 'is-active' : ''}
                onClick={() => onActiveCodeTabChange(tab)}
              >
                {tab}
              </button>
            ))}
            <button type="button" className="od-code-copy" onClick={copyCode} disabled={!code}>
              copy
            </button>
          </div>
          <pre>
            <code>{code || 'Generate a design to produce editable HTML, CSS, customization map, and system prompt.'}</code>
          </pre>
        </aside>
      </div>

      {saveState.message && (
        <div className={`od-save-state is-${saveState.status}`} role={saveState.status === 'error' ? 'alert' : 'status'}>
          {saveState.message}
        </div>
      )}
    </section>
  );
};

interface AgentHandoffPanelProps {
  design: GeneratedDesign | null;
  sessions: TerminalSession[];
  selectedAgent: AgentType;
  selectedSessionId: string | null;
  agentState: SaveState;
  isSending: boolean;
  onAgentChange: (agent: AgentType) => void;
  onSessionChange: (sessionId: string | null) => void;
  onSend: () => void;
}

const AgentHandoffPanel: React.FC<AgentHandoffPanelProps> = ({
  design,
  sessions,
  selectedAgent,
  selectedSessionId,
  agentState,
  isSending,
  onAgentChange,
  onSessionChange,
  onSend,
}) => (
  <section className="od-agent-panel">
    <div className="od-agent-panel__copy">
      <span>agent cli handoff</span>
      <h2>Send this design into a terminal agent</h2>
      <p>
        YzPzDesgin can paste an implementation-ready prompt into an existing TTY, or create a new agent session when no
        terminal is available.
      </p>
    </div>
    <div className="od-agent-panel__controls">
      <label>
        <span>target tty</span>
        <select value={selectedSessionId ?? 'new'} onChange={(event) => onSessionChange(event.target.value === 'new' ? null : event.target.value)}>
          <option value="new">Create new agent TTY</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {sessionDisplayName(session)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>new agent</span>
        <select value={selectedAgent} onChange={(event) => onAgentChange(event.target.value as AgentType)}>
          {AGENT_OPTIONS.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onSend} disabled={!design || isSending}>
        {isSending ? 'Sending...' : 'Send to agent'}
      </button>
    </div>
    {agentState.message && (
      <div className={`od-save-state is-${agentState.status}`} role={agentState.status === 'error' ? 'alert' : 'status'}>
        {agentState.message}
      </div>
    )}
  </section>
);

interface RecentProjectsStripProps {
  projects: DesignProject[];
  onOpenProject: (project: DesignProject) => void;
  onOpenProjects: () => void;
}

const RecentProjectsStrip: React.FC<RecentProjectsStripProps> = ({ projects, onOpenProject, onOpenProjects }) => (
  <section className="od-recent">
    <div className="od-section-head">
      <h2>Recent projects</h2>
      <button type="button" onClick={onOpenProjects}>
        View all <Icon name="external-link" size={13} />
      </button>
    </div>
    <div className="od-recent__row">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} compact onOpen={onOpenProject} />
      ))}
    </div>
  </section>
);

interface WorkflowGalleryProps {
  cards: WorkflowCard[];
  activeChipId: string;
  filter: string;
  search: string;
  onFilterChange: (filter: string) => void;
  onSearchChange: (search: string) => void;
  onPick: (card: WorkflowCard) => void;
}

const WorkflowGallery: React.FC<WorkflowGalleryProps> = ({
  cards,
  activeChipId,
  filter,
  search,
  onFilterChange,
  onSearchChange,
  onPick,
}) => {
  const categories = ['all', ...Array.from(new Set(WORKFLOW_CARDS.map((card) => card.category)))];
  const activeCategory = DESIGNER_CHIPS.find((chip) => chip.id === activeChipId)?.category;

  return (
    <section className="od-workflows">
      <div className="od-workflows__head">
        <div>
          <h2>Community starters</h2>
          <p>Ready-to-use YzPzDesgin workflows bundled with this runtime.</p>
        </div>
        <div className="od-workflows__tools">
          <label className="od-search">
            <Icon name="search" size={14} />
            <input
              value={search}
              type="search"
              placeholder="Search"
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
          <span>{cards.length} shown</span>
        </div>
      </div>

      <div className="od-filter-row">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={`${filter === category ? 'is-active' : ''}${activeCategory === category ? ' is-suggested' : ''}`}
            onClick={() => onFilterChange(category)}
          >
            {category === 'all' ? 'All' : category}
          </button>
        ))}
      </div>

      <div className="od-workflow-grid">
        {cards.map((card) => (
          <button key={card.id} type="button" className="od-workflow-card" onClick={() => onPick(card)}>
            <span className="od-workflow-card__preview" style={{ '--card-accent': card.accent } as CSSProperties}>
              <span className="od-workflow-card__glyph">{card.title.slice(0, 2)}</span>
              <span className="od-workflow-card__chrome">
                <i />
                <i />
                <i />
                <em>{card.mode.toLowerCase()}</em>
              </span>
            </span>
            <span className="od-workflow-card__body">
              <strong>{card.title}</strong>
              <small>{card.description}</small>
              <span>
                {card.tags.map((tag) => (
                  <em key={tag}>{tag}</em>
                ))}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

interface ProjectCardProps {
  project: DesignProject;
  compact?: boolean;
  onOpen: (project: DesignProject) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, compact = false, onOpen }) => (
  <button type="button" className={`od-project-card${compact ? ' od-project-card--compact' : ''}`} onClick={() => onOpen(project)}>
    <div className="od-project-card__thumb" style={{ '--project-accent': project.accent } as CSSProperties}>
      <span>{project.title.slice(0, 2)}</span>
    </div>
    <div className="od-project-card__meta">
      <strong>{project.title}</strong>
      <p>{project.prompt}</p>
      <span className={`od-status od-status--${project.status}`}>
        <i />
        {project.status.replace('_', ' ')}
        <em>{timeAgo(project.updatedAt)}</em>
      </span>
    </div>
  </button>
);

interface SectionHeaderProps {
  title: string;
  subtitle: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle }) => (
  <div className="od-page-head">
    <h1>{title}</h1>
    <p>{subtitle}</p>
  </div>
);

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

const Icon: React.FC<IconProps> = ({ name, size = 14, strokeWidth = 1.7, ...rest }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
    ...rest,
  };

  switch (name) {
    case 'arrow-left':
      return <svg {...common}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>;
    case 'arrow-up':
      return <svg {...common}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>;
    case 'attach':
      return <svg {...common}><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>;
    case 'blocks':
      return <svg {...common}><path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2" /><rect x="14" y="2" width="8" height="8" rx="1" /></svg>;
    case 'check':
      return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
    case 'close':
      return <svg {...common}><path d="M20 4 4 20" /><path d="m4 4 16 16" /></svg>;
    case 'discord':
      return <svg {...common} fill="currentColor" stroke="none"><path d="M8.5 13.8c-1 0-1.9-.9-1.9-2.1 0-1.1.8-2.1 1.9-2.1 1.1 0 1.9.9 1.9 2.1 0 1.2-.8 2.1-1.9 2.1Zm7 0c-1 0-1.9-.9-1.9-2.1 0-1.1.8-2.1 1.9-2.1 1.1 0 1.9.9 1.9 2.1 0 1.2-.8 2.1-1.9 2.1ZM10.1 4.3l-.3-.6-.6.1a18 18 0 0 0-4.2 1.3l-.2.1-.1.2c-2.7 3.9-3.4 7.7-3 11.4l.1.4.3.2c1.7 1.3 3.4 2 5 2.5l.8.2 1.1-2.7a12.7 12.7 0 0 0 6 0l1.1 2.7.8-.2c1.7-.5 3.4-1.3 5.1-2.5l.3-.2v-.4c.5-4.3-.6-8.1-2.9-11.4l-.1-.2-.2-.1a18 18 0 0 0-4.2-1.3l-.6-.1-.4.6-.3.5a15 15 0 0 0-3.3 0l-.3-.5Z" /></svg>;
    case 'edit':
      return <svg {...common}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" /></svg>;
    case 'external-link':
      return <svg {...common}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>;
    case 'file-code':
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="m10 13-2 2 2 2" /><path d="m14 17 2-2-2-2" /></svg>;
    case 'folder':
      return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>;
    case 'grid':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>;
    case 'help-circle':
      return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 1 1 5.8 1c-.5 1.1-1.7 1.6-2.3 2.3-.4.4-.6.9-.6 1.7" /><path d="M12 18h.01" /></svg>;
    case 'home':
      return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
    case 'image':
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>;
    case 'import':
      return <svg {...common}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
    case 'kanban':
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M15 4v16" /></svg>;
    case 'link':
      return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></svg>;
    case 'mic':
      return <svg {...common}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></svg>;
    case 'moon':
      return <svg {...common}><path d="M20 14.4A8 8 0 0 1 9.6 4 8 8 0 1 0 20 14.4Z" /></svg>;
    case 'orbit':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5-4 4.5-9 4.5-9-2-9-4.5Z" /><path d="M6.6 5.4c1.8-1.8 6-.4 9.6 3.2s5 7.8 3.2 9.6-6 .4-9.6-3.2-5-7.8-3.2-9.6Z" /></svg>;
    case 'palette':
      return <svg {...common}><path d="M12 22a10 10 0 1 1 10-10 3.5 3.5 0 0 1-3.5 3.5h-1.7a1.8 1.8 0 0 0-1.3 3l.3.4A1.9 1.9 0 0 1 14.2 22Z" /><circle cx="7.5" cy="10" r=".7" /><circle cx="10" cy="6.5" r=".7" /><circle cx="14" cy="6.5" r=".7" /><circle cx="16.5" cy="10" r=".7" /></svg>;
    case 'play':
      return <svg {...common}><path d="m8 5 11 7-11 7Z" /></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
    case 'present':
      return <svg {...common}><path d="M3 4h18" /><path d="M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4" /><path d="m12 16-4 4" /><path d="m12 16 4 4" /></svg>;
    case 'refresh':
      return <svg {...common}><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 21v-5h5" /><path d="M3 12A9 9 0 0 1 18.5 5.7L21 8" /><path d="M21 3v5h-5" /></svg>;
    case 'search':
      return <svg {...common}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
    case 'settings':
      return <svg {...common}><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
    case 'sparkles':
      return <svg {...common}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z" /><path d="m5 2 .7 2.3L8 5l-2.3.7L5 8l-.7-2.3L2 5l2.3-.7Z" /></svg>;
    case 'star':
      return <svg {...common}><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1Z" /></svg>;
  }
};

interface YzPzDesginMarkProps {
  size?: number;
}

const YzPzDesginMark: React.FC<YzPzDesginMarkProps> = ({ size = 28 }) => (
  <svg className="od-mark" width={size} height={size} viewBox="0 0 444 444" fill="none" aria-hidden="true">
    <rect width="444" height="444" rx="88" fill="#09090B" />
    <rect x="58" y="70" width="328" height="304" rx="44" fill="#0F1115" stroke="#27272A" strokeWidth="18" />
    <path d="M100 144H344" stroke="#10B981" strokeWidth="24" strokeLinecap="round" />
    <path d="M125 218L178 270L125 322" stroke="#F4F4F5" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M215 318H318" stroke="#10B981" strokeWidth="30" strokeLinecap="round" />
    <circle cx="128" cy="144" r="14" fill="#F4F4F5" opacity=".9" />
    <circle cx="176" cy="144" r="14" fill="#10B981" opacity=".9" />
    <circle cx="224" cy="144" r="14" fill="#22D3EE" opacity=".85" />
  </svg>
);
