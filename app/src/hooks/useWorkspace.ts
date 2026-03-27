import { useState, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { WorkspaceConfig, LayoutConfig, AgentFleet } from '../types';
import { useAppStore } from '../stores/appStore';

const DEFAULT_AGENT_FLEET: AgentFleet = {
  totalSlots: 4,
  allocation: {
    claude: 0,
    codex: 0,
    gemini: 0,
    opencode: 0,
    cursor: 0,
  },
};

export const useWorkspace = () => {
  const { openWorkspace } = useAppStore();
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [selectedLayout, setSelectedLayout] = useState<LayoutConfig>({
    type: 'grid',
    sessions: 4,
    openExternally: false,
  });
  const [agentFleet, setAgentFleet] = useState<AgentFleet>(DEFAULT_AGENT_FLEET);

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

  const updateAgentFleet = useCallback((fleet: AgentFleet) => {
    setAgentFleet(fleet);
  }, []);

  const createWorkspace = useCallback(async () => {
    if (!selectedPath || !workspaceName) {
      throw new Error('Please select a directory and enter a workspace name');
    }

    const workspace: WorkspaceConfig = {
      id: `workspace-${Date.now()}`,
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
  }, [selectedPath, workspaceName, selectedLayout, agentFleet, openWorkspace]);

  const isAllocationValid = agentFleet
    ? Object.values(agentFleet.allocation).reduce((sum, count) => sum + count, 0) <= selectedLayout.sessions
    : true;

  const isValid = selectedPath.length > 0 && isAllocationValid && 
    (selectedLayout.openExternally || workspaceName.length > 0);

  return {
    selectedPath,
    workspaceName,
    selectedLayout,
    agentFleet,
    selectDirectory,
    setWorkspaceName,
    setSelectedLayout,
    updateAgentFleet,
    createWorkspace,
    isValid,
    isAllocationValid,
  };
};
