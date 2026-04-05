import { useState, useCallback, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { WorkspaceConfig, LayoutConfig, AgentFleet, AgentType } from '../types';
import { useAppStore } from '../stores/appStore';

const CUSTOM_TEMPLATES_KEY = 'yzpzcode-custom-templates';

const DEFAULT_AGENT_FLEET: AgentFleet = {
  totalSlots: 4,
  allocation: {
    claude: 0,
    codex: 0,
    gemini: 0,
    opencode: 0,
    cursor: 0,
    kilo: 0,
  },
};

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconColor: string;
  layout: LayoutConfig;
  allocation: Record<AgentType, number>;
}

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'react',
    name: 'React',
    description: 'Frontend development with 4 terminals',
    icon: 'react',
    iconColor: '#61DAFB',
    layout: { type: 'grid', sessions: 4 },
    allocation: { claude: 2, codex: 1, gemini: 0, opencode: 0, cursor: 0, kilo: 0 },
  },
  {
    id: 'rust',
    name: 'Rust',
    description: 'Systems programming with 4 terminals',
    icon: 'rust',
    iconColor: '#CE422B',
    layout: { type: 'grid', sessions: 4 },
    allocation: { claude: 2, codex: 0, gemini: 0, opencode: 0, cursor: 0, kilo: 0 },
  },
  {
    id: 'python',
    name: 'Python',
    description: 'Data & backend development with 4 terminals',
    icon: 'python',
    iconColor: '#3776AB',
    layout: { type: 'grid', sessions: 4 },
    allocation: { claude: 1, codex: 0, gemini: 2, opencode: 0, cursor: 0, kilo: 0 },
  },
  {
    id: 'fullstack',
    name: 'Full-Stack',
    description: 'End-to-end development with 6 terminals',
    icon: 'fullstack',
    iconColor: '#A855F7',
    layout: { type: 'grid', sessions: 6 },
    allocation: { claude: 2, codex: 1, gemini: 1, opencode: 0, cursor: 0, kilo: 0 },
  },
  {
    id: 'quick',
    name: 'Quick Edit',
    description: 'Single terminal for quick tasks',
    icon: 'quick',
    iconColor: '#10B981',
    layout: { type: 'grid', sessions: 1 },
    allocation: { claude: 1, codex: 0, gemini: 0, opencode: 0, cursor: 0, kilo: 0 },
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Configure everything manually',
    icon: 'custom',
    iconColor: '#71717A',
    layout: { type: 'grid', sessions: 4 },
    allocation: { claude: 0, codex: 0, gemini: 0, opencode: 0, cursor: 0, kilo: 0 },
  },
];

function loadCustomTemplates(): WorkspaceTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: WorkspaceTemplate[]) {
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
}

export const useWorkspace = () => {
  const { openWorkspace, addRecentDirectory } = useAppStore();
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [selectedLayout, setSelectedLayout] = useState<LayoutConfig>({
    type: 'grid',
    sessions: 4,
    openExternally: false,
  });
  const [agentFleet, setAgentFleet] = useState<AgentFleet>(DEFAULT_AGENT_FLEET);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('custom');
  const [customTemplates, setCustomTemplates] = useState<WorkspaceTemplate[]>(loadCustomTemplates);

  const selectDirectory = useCallback(async () => {
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: 'Select Workspace Directory',
      });
      
      if (typeof path === 'string') {
        setSelectedPath(path);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  }, []);

  const selectRecentDirectory = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const updateAgentFleet = useCallback((fleet: AgentFleet) => {
    setAgentFleet(fleet);
  }, []);

  const applyTemplate = useCallback((templateId: string) => {
    const allTemplates = [...WORKSPACE_TEMPLATES, ...loadCustomTemplates()];
    const template = allTemplates.find((t) => t.id === templateId);
    if (!template) return;
    setSelectedTemplateId(templateId);
    setSelectedLayout(template.layout);
    setAgentFleet((prev) => ({
      ...prev,
      totalSlots: template.layout.sessions,
      allocation: { ...template.allocation },
    }));
    if (templateId !== 'custom') {
      setWorkspaceName(template.name);
    }
  }, []);

  const saveAsCustomTemplate = useCallback((name: string) => {
    const id = `custom-${Date.now()}`;
    const iconNames = ['react', 'rust', 'python', 'typescript', 'nodejs', 'go', 'vue', 'svelte'];
    const colors = ['#61DAFB', '#CE422B', '#3776AB', '#3178C6', '#339933', '#00ADD8', '#4FC08D', '#FF3E00'];
    const idx = Math.floor(Math.random() * iconNames.length);
    const newTemplate: WorkspaceTemplate = {
      id,
      name,
      description: `Custom template: ${name}`,
      icon: iconNames[idx],
      iconColor: colors[idx],
      layout: { ...selectedLayout },
      allocation: { ...agentFleet.allocation },
    };
    const updated = [...loadCustomTemplates(), newTemplate];
    saveCustomTemplates(updated);
    setCustomTemplates(updated);
    setSelectedTemplateId(id);
  }, [selectedLayout, agentFleet]);

  const deleteCustomTemplate = useCallback((id: string) => {
    const updated = loadCustomTemplates().filter((t) => t.id !== id);
    saveCustomTemplates(updated);
    setCustomTemplates(updated);
    if (selectedTemplateId === id) {
      setSelectedTemplateId('custom');
    }
  }, [selectedTemplateId]);

  const createWorkspace = useCallback(async () => {
    if (!selectedPath || (!selectedLayout.openExternally && !workspaceName)) {
      throw new Error('Please select a directory and enter a workspace name');
    }

    addRecentDirectory(selectedPath);

    const workspace: WorkspaceConfig = {
      id: crypto.randomUUID(),
      name: workspaceName,
      path: selectedPath,
      layout: selectedLayout,
      agentFleet: {
        ...agentFleet,
        totalSlots: selectedLayout.sessions,
      },
      createdAt: Date.now(),
    };

    openWorkspace(workspace);
    return workspace;
  }, [selectedPath, workspaceName, selectedLayout, agentFleet, openWorkspace, addRecentDirectory]);

  const totalAllocated = useMemo(
    () => (agentFleet ? Object.values(agentFleet.allocation).reduce((sum, count) => sum + count, 0) : 0),
    [agentFleet]
  );

  const isAllocationValid = totalAllocated <= selectedLayout.sessions;

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!selectedLayout.openExternally && workspaceName.trim().length === 0) {
      errors.workspaceName = 'Workspace name is required';
    }
    if (selectedPath.length === 0) {
      errors.directory = 'Please select a workspace directory';
    }
    if (!isAllocationValid) {
      errors.allocation = 'Agent allocation exceeds available slots';
    }
    return errors;
  }, [workspaceName, selectedPath, isAllocationValid, selectedLayout.openExternally]);

  const isValid = selectedPath.length > 0 && isAllocationValid && 
    (selectedLayout.openExternally || workspaceName.trim().length > 0);

  const currentTemplateAllocation = useMemo(() => {
    const all = [...WORKSPACE_TEMPLATES, ...customTemplates];
    const t = all.find((tpl) => tpl.id === selectedTemplateId);
    return t ? t.allocation : null;
  }, [selectedTemplateId, customTemplates]);

  return {
    selectedPath,
    workspaceName,
    selectedLayout,
    agentFleet,
    selectedTemplateId,
    customTemplates,
    selectDirectory,
    selectRecentDirectory,
    setWorkspaceName,
    setSelectedLayout,
    updateAgentFleet,
    applyTemplate,
    saveAsCustomTemplate,
    deleteCustomTemplate,
    createWorkspace,
    isValid,
    isAllocationValid,
    validationErrors,
    currentTemplateAllocation,
  };
};
