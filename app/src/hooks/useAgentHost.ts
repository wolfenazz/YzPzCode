import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AgentAccumulatedUsage,
  AgentAttachment,
  AgentApprovalRequest,
  AgentCatalogSyncResult,
  AgentCatalogUpdate,
  AgentCoreSessionEvent,
  AgentHostStatus,
  AgentMcpServer,
  AgentModelInfo,
  AgentProviderInfo,
  AgentQuestion,
  AgentSettings,
  AgentSessionUsage,
  AgentTeamProgressSummary,
  AgentTodo,
  AgentUserInstruction,
} from '../types';

export interface CreateAgentSessionParams {
  workspaceId: string;
  cwd: string;
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  title?: string;
  enableAgentTeams?: boolean;
  teamName?: string;
  compactionStrategy?: 'basic' | 'agentic';
  maxTotalTokens?: number;
}

export interface CreateAgentSessionResult {
  sessionId: string;
  manifestPath: string;
  messagesPath: string;
}

export const useAgentHost = () => {
  const ensureHost = useCallback(async (): Promise<AgentHostStatus> => {
    return invoke<AgentHostStatus>('ensure_agent_host');
  }, []);

  const getStatus = useCallback(async (): Promise<AgentHostStatus> => {
    return invoke<AgentHostStatus>('get_agent_host_status');
  }, []);

  const createSession = useCallback(
    async (request: CreateAgentSessionParams): Promise<CreateAgentSessionResult> => {
      return invoke<CreateAgentSessionResult>('create_agent_session', {
        request: {
          ...request,
          maxTotalTokens: request.maxTotalTokens ?? null,
        },
      });
    },
    []
  );

  const sendMessage = useCallback(async (sessionId: string, prompt: string, mode?: string, attachments: AgentAttachment[] = []) => {
    return invoke('send_agent_message', {
      sessionId,
      prompt,
      mode: mode ?? null,
      userImages: attachments.filter((attachment) => attachment.kind === 'image').map((attachment) => attachment.path),
      userFiles: attachments.filter((attachment) => attachment.kind === 'file').map((attachment) => attachment.path),
    });
  }, []);

  const resumeSession = useCallback(async (sessionId: string) => {
    return invoke('resume_agent_session', { sessionId });
  }, []);

  const abortSession = useCallback(async (sessionId: string) => {
    return invoke('abort_agent_session', { sessionId });
  }, []);

  const stopSession = useCallback(async (sessionId: string) => {
    return invoke('stop_agent_session', { sessionId });
  }, []);

  const closeSession = useCallback(async (sessionId: string) => {
    return invoke('close_agent_session', { sessionId });
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    return invoke('delete_agent_session', { sessionId });
  }, []);

  const listSessions = useCallback(async (workspaceId?: string) => {
    const result = await invoke<{ sessions: unknown[] }>('list_agent_sessions', {
      workspaceId: workspaceId ?? null,
    });
    return result.sessions;
  }, []);

  const readMessages = useCallback(async (sessionId: string) => {
    const result = await invoke<{ messages: unknown[] }>('read_agent_messages', { sessionId });
    return result.messages;
  }, []);

  const getSessionPreview = useCallback(async (sessionId: string) => {
    const result = await invoke<{ preview: { messageCount: number; preview: string } }>('get_agent_session_preview', {
      sessionId,
    });
    return result.preview;
  }, []);

  const updateTitle = useCallback(async (sessionId: string, title: string) => {
    return invoke('update_agent_session_title', { sessionId, title });
  }, []);

  const updateModel = useCallback(async (sessionId: string, modelId: string) => {
    return invoke('update_agent_session_model', { sessionId, modelId });
  }, []);

  const setFastMode = useCallback(async (sessionId: string, enabled: boolean) => {
    return invoke('set_agent_fast_mode', { sessionId, enabled });
  }, []);

  const updateConnection = useCallback(
    async (
      sessionId: string,
      update: {
        providerId?: string;
        modelId?: string;
        apiKey?: string;
        baseUrl?: string;
        thinking?: boolean;
        reasoningEffort?: string;
      },
    ) => {
      const args: Record<string, unknown> = {
        sessionId,
        providerId: update.providerId ?? null,
        modelId: update.modelId ?? null,
        apiKey: update.apiKey ?? null,
        baseUrl: update.baseUrl ?? null,
      };
      if (update.thinking !== undefined) args.thinking = update.thinking;
      if (update.reasoningEffort !== undefined) args.reasoningEffort = update.reasoningEffort;
      return invoke('update_agent_session_connection', args);
    },
    []
  );

  const getSettings = useCallback(async (): Promise<AgentSettings> => {
    return invoke<AgentSettings>('get_agent_settings');
  }, []);

  const updateSettings = useCallback(async (update: Record<string, unknown>): Promise<AgentSettings> => {
    return invoke<AgentSettings>('update_agent_settings', { update });
  }, []);

  const setToolPolicy = useCallback(
    async (toolName: string, policy: { enabled?: boolean; autoApprove?: boolean }) => {
      return invoke('set_agent_tool_policy', {
        toolName,
        enabled: policy.enabled ?? null,
        autoApprove: policy.autoApprove ?? null,
      });
    },
    []
  );

  const clearToolPolicy = useCallback(async (toolName: string) => {
    return invoke('clear_agent_tool_policy', { toolName });
  }, []);

  const listUserInstructions = useCallback(async (kind: 'skill' | 'workflow' | 'rule') => {
    const result = await invoke<{ items: AgentUserInstruction[] }>('list_agent_user_instructions', { kind });
    return result.items;
  }, []);

  const addUserInstruction = useCallback(
    async (kind: 'skill' | 'workflow' | 'rule', name: string, description?: string, instructions?: string) => {
      return invoke('add_agent_user_instruction', {
        kind,
        name,
        description: description ?? null,
        instructions: instructions ?? null,
      });
    },
    []
  );

  const toggleUserInstruction = useCallback(
    async (kind: 'skill' | 'workflow' | 'rule', id: string, enabled: boolean) => {
      return invoke('toggle_agent_user_instruction', { kind, id, enabled });
    },
    []
  );

  const listRuntimeCommands = useCallback(async () => {
    const result = await invoke<{ commands: unknown[] }>('list_agent_runtime_commands');
    return result.commands;
  }, []);

  const answerQuestion = useCallback(async (requestId: string, answer: string) => {
    return invoke('answer_agent_question', { requestId, answer });
  }, []);

  const listMcpServers = useCallback(async (): Promise<AgentMcpServer[]> => {
    const result = await invoke<{ servers: AgentMcpServer[] }>('list_agent_mcp_servers');
    return result.servers;
  }, []);

  const addMcpServer = useCallback(
    async (name: string, transport: AgentMcpServer['transport']): Promise<AgentMcpServer> => {
      const result = await invoke<{ server: AgentMcpServer }>('add_agent_mcp_server', { name, transport });
      return result.server;
    },
    []
  );

  const removeMcpServer = useCallback(async (name: string) => {
    return invoke<{ removed: boolean }>('remove_agent_mcp_server', { name });
  }, []);

  const setMcpServerDisabled = useCallback(
    async (name: string, disabled: boolean): Promise<AgentMcpServer> => {
      const result = await invoke<{ server: AgentMcpServer }>('set_agent_mcp_server_disabled', { name, disabled });
      return result.server;
    },
    []
  );

  const approveTool = useCallback(async (requestId: string, approved: boolean, reason?: string) => {
    return invoke('approve_agent_tool', { requestId, approved, reason: reason ?? null });
  }, []);

  const getProviders = useCallback(async (): Promise<AgentProviderInfo[]> => {
    const result = await invoke<{ providers: AgentProviderInfo[] }>('get_agent_providers');
    return result.providers;
  }, []);

  const getModels = useCallback(
    async (providerId: string): Promise<AgentModelInfo[]> => {
      const result = await invoke<{ models: AgentModelInfo[] }>('get_agent_models', { providerId });
      return result.models;
    },
    []
  );

  const refreshCatalogs = useCallback(
    async (force = false): Promise<AgentCatalogSyncResult> => {
      return invoke<AgentCatalogSyncResult>('refresh_agent_catalogs', { force: force ?? null });
    },
    []
  );

  const setProviderConfig = useCallback(
    async (providerId: string, apiKey?: string, baseUrl?: string, modelId?: string) => {
      return invoke('set_agent_provider_config', {
        providerId,
        apiKey: apiKey ?? null,
        baseUrl: baseUrl ?? null,
        modelId: modelId ?? null,
      });
    },
    []
  );

  const listProviderConfigs = useCallback(async () => {
    const result = await invoke<{ configs: Array<{ providerId: string; hasApiKey: boolean; baseUrl?: string; modelId?: string }> }>(
      'list_agent_provider_configs'
    );
    return result.configs;
  }, []);

  const removeProviderConfig = useCallback(async (providerId: string) => {
    return invoke<{ removed: boolean }>('remove_agent_provider_config', { providerId });
  }, []);

  const getUsage = useCallback(async (sessionId: string): Promise<AgentSessionUsage | null> => {
    const result = await invoke<{ usage: AgentSessionUsage | null }>('get_agent_session_usage', { sessionId });
    return result.usage;
  }, []);

  const listPendingPrompts = useCallback(async (sessionId: string) => {
    const result = await invoke<{ prompts: unknown[] }>('list_pending_prompts', { sessionId });
    return result.prompts;
  }, []);

  const removePendingPrompt = useCallback(async (sessionId: string, promptId: string) => {
    return invoke('remove_pending_prompt', { sessionId, promptId });
  }, []);

  const shutdown = useCallback(async () => {
    return invoke('shutdown_agent_host');
  }, []);

  // Event listeners (Rust forwards sidecar events under yzpz-agent:*)
  const onSessionEvent = useCallback(
    (cb: (event: { payload: AgentCoreSessionEvent }) => void): Promise<UnlistenFn> =>
      listen<AgentCoreSessionEvent>('yzpz-agent:session-event', cb),
    []
  );
  const onApprovalRequest = useCallback(
    (cb: (event: { payload: AgentApprovalRequest }) => void): Promise<UnlistenFn> =>
      listen<AgentApprovalRequest>('yzpz-agent:approval-request', cb),
    []
  );
  const onSessionStatus = useCallback(
    (cb: (event: { payload: { sessionId: string; status: string } }) => void): Promise<UnlistenFn> =>
      listen<{ sessionId: string; status: string }>('yzpz-agent:session-status', cb),
    []
  );
  const onSessionError = useCallback(
    (cb: (event: { payload: { sessionId: string; error: string } }) => void): Promise<UnlistenFn> =>
      listen<{ sessionId: string; error: string }>('yzpz-agent:session-error', cb),
    []
  );
  const onNotice = useCallback(
    (cb: (event: { payload: { sessionId: string; message: string } }) => void): Promise<UnlistenFn> =>
      listen<{ sessionId: string; message: string }>('yzpz-agent:notice', cb),
    []
  );
  const onSessionEnded = useCallback(
    (cb: (event: { payload: { sessionId: string; reason: string; ts: number } }) => void): Promise<UnlistenFn> =>
      listen<{ sessionId: string; reason: string; ts: number }>('yzpz-agent:session-ended', cb),
    []
  );
  const onApprovalResolved = useCallback(
    (cb: (event: { payload: { requestId: string; sessionId: string } }) => void): Promise<UnlistenFn> =>
      listen<{ requestId: string; sessionId: string }>('yzpz-agent:approval-resolved', cb),
    []
  );
  const onLog = useCallback(
    (cb: (event: { payload: { message: string } }) => void): Promise<UnlistenFn> =>
      listen<{ message: string }>('yzpz-agent:log', cb),
    []
  );
  const onBootstrap = useCallback(
    (cb: (event: { payload: { phase: string; message: string } }) => void): Promise<UnlistenFn> =>
      listen<{ phase: string; message: string }>('yzpz-agent:bootstrap', cb),
    []
  );
  const onTeamProgress = useCallback(
    (cb: (event: { payload: AgentTeamProgressSummary }) => void): Promise<UnlistenFn> =>
      listen<AgentTeamProgressSummary>('yzpz-agent:team-progress', cb),
    []
  );
  const onQuestionRequest = useCallback(
    (cb: (event: { payload: AgentQuestion }) => void): Promise<UnlistenFn> =>
      listen<AgentQuestion>('yzpz-agent:question-request', cb),
    []
  );
  const onTodoUpdated = useCallback(
    (cb: (event: { payload: { sessionId: string; todos: AgentTodo[] } }) => void): Promise<UnlistenFn> =>
      listen<{ sessionId: string; todos: AgentTodo[] }>('yzpz-agent:todo-updated', cb),
    []
  );
  const onContextUpdated = useCallback(
    (cb: (event: { payload: { sessionId: string; inputTokens: number; cacheReadTokens: number; totalTokens: number } }) => void): Promise<UnlistenFn> =>
      listen<{ sessionId: string; inputTokens: number; cacheReadTokens: number; totalTokens: number }>('yzpz-agent:context-updated', cb),
    []
  );
  const onUsageUpdated = useCallback(
    (cb: (event: { payload: { sessionId: string; usage: AgentAccumulatedUsage } }) => void): Promise<UnlistenFn> =>
      listen<{ sessionId: string; usage: AgentAccumulatedUsage }>('yzpz-agent:usage-updated', cb),
    []
  );
  const onCatalogUpdated = useCallback(
    (cb: (event: { payload: AgentCatalogUpdate }) => void): Promise<UnlistenFn> =>
      listen<AgentCatalogUpdate>('yzpz-agent:catalog-updated', cb),
    []
  );

  return {
    ensureHost,
    getStatus,
    createSession,
    sendMessage,
    resumeSession,
    abortSession,
    stopSession,
    closeSession,
    deleteSession,
    listSessions,
    readMessages,
    getSessionPreview,
    updateTitle,
    updateModel,
    setFastMode,
    updateConnection,
    approveTool,
    getProviders,
    getModels,
    refreshCatalogs,
    setProviderConfig,
    listProviderConfigs,
    removeProviderConfig,
    getUsage,
    listPendingPrompts,
    removePendingPrompt,
    getSettings,
    updateSettings,
    setToolPolicy,
    clearToolPolicy,
    listUserInstructions,
    addUserInstruction,
    toggleUserInstruction,
    listRuntimeCommands,
    answerQuestion,
    listMcpServers,
    addMcpServer,
    removeMcpServer,
    setMcpServerDisabled,
    shutdown,
    onSessionEvent,
    onApprovalRequest,
    onSessionStatus,
    onSessionError,
    onNotice,
    onSessionEnded,
    onApprovalResolved,
    onLog,
    onBootstrap,
    onTeamProgress,
    onQuestionRequest,
    onTodoUpdated,
    onContextUpdated,
    onUsageUpdated,
    onCatalogUpdated,
  };
};
