import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  BookOpen,
  Eye,
  EyeSlash,
  Gauge,
  Key,
  MagnifyingGlass,
  PlugsConnected,
  Plus,
  Robot,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  TextAa,
  Trash,
  Wrench,
} from '@phosphor-icons/react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { AgentSelect } from '../../agent/AgentSelect';
import { useAgentHost } from '../../../hooks/useAgentHost';
import { useAppStore } from '../../../stores/appStore';
import type {
  AgentHostStatus,
  AgentMcpServer,
  AgentModelInfo,
  AgentProviderInfo,
  AgentSettings,
  AgentToolInfo,
  AgentUserInstruction,
} from '../../../types';
import {
  Badge,
  Button,
  Field,
  Notice,
  Segmented,
  SettingsBlock,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  SettingsTabs,
  SliderRow,
  StatusDot,
  Switch,
  ToggleRow,
} from '../SettingsKit';

interface ProviderConfigView {
  providerId: string;
  hasApiKey?: boolean;
  hasOAuth?: boolean;
  oauthEmail: string | null;
  baseUrl?: string;
  modelId?: string;
}

/** Supports a live UI update while an older harness is still running. New
 * harnesses send only `hasApiKey`/`hasOAuth`, never credential values. */
const hasSavedProviderAuth = (config: ProviderConfigView): boolean => {
  if (config.hasApiKey === true) return true;
  if (config.hasOAuth === true) return true;
  if (
    !Object.prototype.hasOwnProperty.call(config, 'hasApiKey') &&
    !Object.prototype.hasOwnProperty.call(config, 'hasOAuth') &&
    Object.prototype.hasOwnProperty.call(config, 'apiKey')
  ) {
    return true;
  }
  return false;
}

const PROVIDER_DISPLAY: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  google: 'Google Gemini',
  bedrock: 'AWS Bedrock',
  groq: 'Groq',
  cerebras: 'Cerebras',
  openai_compatible: 'OpenAI-Compatible',
  'openai-codex': 'ChatGPT',
  'opencode-go': 'OpenCode Zen (Go)',
  commandcode: 'Command Code',
  'commandcode-anthropic': 'Command Code · Claude',
};

const INSTRUCTION_TYPES = [
  { id: 'skill', label: 'Skills' },
  { id: 'workflow', label: 'Workflows' },
  { id: 'rule', label: 'Rules' },
] as const;

type InstructionType = (typeof INSTRUCTION_TYPES)[number]['id'];

type AgentTab = 'providers' | 'behavior' | 'tools' | 'mcp' | 'instructions' | 'display';

type ToolMode = 'off' | 'ask' | 'auto';

const TOOL_MODES = [
  { value: 'off' as const, label: 'Off' },
  { value: 'ask' as const, label: 'Ask' },
  { value: 'auto' as const, label: 'Auto' },
];

const MCP_TONE: Record<AgentMcpServer['status'], { tone: 'success' | 'warning' | 'danger'; label: string }> = {
  connected: { tone: 'success', label: 'Connected' },
  connecting: { tone: 'warning', label: 'Connecting' },
  disconnected: { tone: 'danger', label: 'Disconnected' },
};

const MCP_TRANSPORTS = [
  { value: 'stdio', label: 'Local (stdio)' },
  { value: 'sse', label: 'SSE' },
  { value: 'streamableHttp', label: 'HTTP' },
];

const COMPACTION_MODES = [
  { value: 'off' as const, label: 'Off' },
  { value: 'basic' as const, label: 'Basic' },
  { value: 'agentic' as const, label: 'Agentic' },
];

const PLAN_ACT_MODES = [
  { value: 'act' as const, label: 'Act' },
  { value: 'plan' as const, label: 'Plan' },
];

const toolModeOf = (tool: AgentToolInfo): ToolMode => {
  const enabled = tool.policy?.enabled ?? true;
  if (!enabled) return 'off';
  return (tool.policy?.autoApprove ?? false) ? 'auto' : 'ask';
};

export const SettingsAgent: React.FC = () => {
  const {
    agentSessionFontSize,
    agentInterfaceScale,
    agentConversationWidth,
    setAgentSessionFontSize,
    setAgentInterfaceScale,
    setAgentConversationWidth,
    resetAgentDisplayPreferences,
    agentTimeout,
    setAgentTimeout,
  } = useAppStore();
  const {
    getStatus,
    getProviders,
    getModels,
    listProviderConfigs,
    setProviderConfig,
    removeProviderConfig,
    getProviderConfigFields,
    loginOpenAiCodex,
    resolveOAuthPrompt,
    openUrl,
    getSettings,
    updateSettings,
    setToolPolicy,
    clearToolPolicy,
    listUserInstructions,
    toggleUserInstruction,
    addUserInstruction,
    listMcpServers,
    addMcpServer,
    removeMcpServer,
    setMcpServerDisabled,
    refreshCatalogs,
    onCatalogUpdated,
    onOauthAuthUrl,
    onOauthPrompt,
  } = useAgentHost();

  const [status, setStatus] = useState<AgentHostStatus | null>(null);
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [configs, setConfigs] = useState<ProviderConfigView[]>([]);
  const [models, setModels] = useState<AgentModelInfo[]>([]);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [instructions, setInstructions] = useState<Record<InstructionType, AgentUserInstruction[]>>({
    skill: [],
    workflow: [],
    rule: [],
  });
  const [instructionType, setInstructionType] = useState<InstructionType>('skill');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { apiKey: string; baseUrl: string; modelId: string }>>({});
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [savedFlash, setSavedFlash] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);

  // OAuth (ChatGPT / openai-codex) sign-in flow state
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'opening-browser' | 'waiting-for-browser' | 'linking'>(
    'idle'
  );
  const [oauthPrompt, setOauthPrompt] = useState<{ requestId: string; message: string; defaultValue?: string } | null>(
    null
  );
  const [promptAnswer, setPromptAnswer] = useState('');
  // authMethod per provider, fetched lazily from the SDK catalog so the UI can
  // render the OAuth flow for the right providers without hardcoding.
  const [authMethods, setAuthMethods] = useState<Record<string, string>>({});

  // MCP state
  const [mcpServers, setMcpServers] = useState<AgentMcpServer[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [showMcpAdd, setShowMcpAdd] = useState(false);
  const [mcpForm, setMcpForm] = useState({ name: '', transportType: 'stdio', command: '', args: '', url: '' });
  const [mcpBusy, setMcpBusy] = useState<string | null>(null);

  // ── Instructions add form state ────────────────────────────────
  const [addForm, setAddForm] = useState<Record<InstructionType, { name: string; description: string; instructions: string }>>({
    skill: { name: '', description: '', instructions: '' },
    workflow: { name: '', description: '', instructions: '' },
    rule: { name: '', description: '', instructions: '' },
  });
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, prov, cfg, set] = await Promise.all([
        getStatus(),
        getProviders(),
        listProviderConfigs(),
        getSettings(),
      ]);
      setStatus(st);
      setProviders(prov);
      setConfigs(cfg);
      setSettings(set);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [getStatus, getProviders, listProviderConfigs, getSettings]);

  const loadInstructions = useCallback(
    async (type: InstructionType) => {
      try {
        const items = await listUserInstructions(type);
        setInstructions((prev) => ({ ...prev, [type]: items }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [listUserInstructions]
  );

  const loadMcp = useCallback(async () => {
    setMcpLoading(true);
    try {
      setMcpServers(await listMcpServers());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMcpLoading(false);
    }
  }, [listMcpServers]);

  useEffect(() => {
    void load();
    for (const t of INSTRUCTION_TYPES) void loadInstructions(t.id);
    void loadMcp();
  }, [load, loadInstructions, loadMcp]);

  // Refetch the provider list when the sidecar catalog syncs so newly published
  // providers/models appear without leaving the settings screen.
  useEffect(() => {
    let mounted = true;
    let unlisten: UnlistenFn | undefined;
    void onCatalogUpdated(() => {
      void load();
    }).then((u) => {
      if (mounted) unlisten = u;
      else void u();
    });
    return () => {
      mounted = false;
      void unlisten?.();
    };
  }, [onCatalogUpdated, load]);

  // Forward OAuth events from the sidecar. `oauth-auth-url` opens the user's
  // browser; `oauth-prompt` asks for a manual code (device-flow fallback).
  useEffect(() => {
    let authUrlUnlisten: UnlistenFn | undefined;
    let promptUnlisten: UnlistenFn | undefined;
    void onOauthAuthUrl(async (event) => {
      setOauthStatus('opening-browser');
      try {
        await openUrl(event.payload.url);
        setOauthStatus('waiting-for-browser');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }).then((u) => {
      authUrlUnlisten = u;
    });
    void onOauthPrompt((event) => {
      setOauthPrompt(event.payload);
    }).then((u) => {
      promptUnlisten = u;
    });
    return () => {
      void authUrlUnlisten?.();
      void promptUnlisten?.();
    };
  }, [onOauthAuthUrl, onOauthPrompt]);

  // Lazily resolve the auth method for the selected provider so the editor can
  // switch between the API-key form and the OAuth sign-in flow.
  useEffect(() => {
    if (authMethods[selectedProvider]) return;
    let cancelled = false;
    void getProviderConfigFields(selectedProvider)
      .then((fields) => {
        if (cancelled) return;
        setAuthMethods((prev) => ({ ...prev, [selectedProvider]: fields.authMethod }));
      })
      .catch(() => {
        if (!cancelled) setAuthMethods((prev) => ({ ...prev, [selectedProvider]: 'api-key' }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProvider, getProviderConfigFields, authMethods]);

  // ── Provider selection & model loading ─────────────────────────
  const configuredIds = new Set(configs.filter(hasSavedProviderAuth).map((c) => c.providerId));
  const selectedCfg = configs.find((c) => c.providerId === selectedProvider);
  const selectedInfo = providers.find((p) => p.id === selectedProvider);
  const isCustomBaseUrl = !selectedInfo?.baseUrl;

  // Initialize drafts only from persisted configurations. Creating a transient
  // draft for every catalog provider made an unlinked provider look as though
  // it had been restored immediately after removal.
  useEffect(() => {
    setDraft((prev) => {
      if (prev[selectedProvider]) return prev;
      const cfg = configs.find((c) => c.providerId === selectedProvider);
      if (!cfg) return prev;
      return {
        ...prev,
        [selectedProvider]: {
          apiKey: '',
          baseUrl: cfg?.baseUrl ?? '',
          modelId: cfg.modelId ?? '',
        },
      };
    });
  }, [selectedProvider, configs]);

  // Load the model list for the selected provider; auto-pick a default model.
  useEffect(() => {
    let mounted = true;
    setModels([]);
    if (!selectedProvider) return;
    void getModels(selectedProvider)
      .then((m) => {
        if (!mounted) return;
        setModels(m);
        setDraft((prev) => {
          const cur = prev[selectedProvider];
          if (!cur) return prev;
          // A saved model can be a provider alias, preview, or private model
          // that has not reached the catalog yet. Never overwrite that choice.
          if (cur.modelId) return prev;
          const info = providers.find((p) => p.id === selectedProvider);
          const next =
            (info?.defaultModelId && m.some((x) => x.id === info.defaultModelId) ? info.defaultModelId : m[0]?.id) ??
            cur.modelId;
          return { ...prev, [selectedProvider]: { ...cur, modelId: next } };
        });
      })
      .catch(() => {
        if (mounted) setModels([]);
      });
    return () => {
      mounted = false;
    };
  }, [selectedProvider, getModels, providers]);

  const selectedDraft = draft[selectedProvider] ?? {
    apiKey: '',
    baseUrl: '',
    modelId: selectedInfo?.defaultModelId ?? '',
  };
  const modelOptions = models.map((model) => ({
    value: model.id,
    label: model.contextWindow ? `${model.name} (${Math.round(model.contextWindow / 1000)}k ctx)` : model.name,
  }));
  if (selectedDraft.modelId && !modelOptions.some((model) => model.value === selectedDraft.modelId)) {
    modelOptions.unshift({ value: selectedDraft.modelId, label: `${selectedDraft.modelId} (saved custom model)` });
  }
  const editorIsOAuth = authMethods[selectedProvider] === 'oauth';
  const editorIsCommandCode = selectedProvider === 'commandcode' || selectedProvider === 'commandcode-anthropic';
  const oauthEmail = selectedCfg?.oauthEmail;
  const oauthLinked = editorIsOAuth && selectedCfg ? hasSavedProviderAuth(selectedCfg) : false;
  const oauthBusy = oauthStatus !== 'idle';

  // ── Catalog refresh handlers ────────────────────────────────────
  const handleRefreshCatalogs = useCallback(async () => {
    if (catalogRefreshing) return;
    setError(null);
    setCatalogRefreshing(true);
    try {
      await refreshCatalogs(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCatalogRefreshing(false);
    }
  }, [catalogRefreshing, refreshCatalogs, load]);

  // ── OAuth (ChatGPT) sign-in handlers ────────────────────────────
  const handleSignInOAuth = useCallback(async () => {
    if (!status?.connected) {
      setError('Agent host is not connected — connect the harness to sign in with ChatGPT.');
      return;
    }
    setOauthStatus('linking');
    setError(null);
    try {
      await loginOpenAiCodex();
      await load();
      setOauthStatus('idle');
    } catch (err) {
      setOauthStatus('idle');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [status, loginOpenAiCodex, load]);

  const handleResolveOAuthPrompt = useCallback(async () => {
    if (!oauthPrompt) return;
    const answer = promptAnswer.trim() || oauthPrompt.defaultValue || '';
    try {
      await resolveOAuthPrompt(oauthPrompt.requestId, answer);
      setOauthPrompt(null);
      setPromptAnswer('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [oauthPrompt, promptAnswer, resolveOAuthPrompt]);

  const handleSignOutOAuth = useCallback(
    async (providerId: string) => {
      setError(null);
      try {
        await removeProviderConfig(providerId);
        setDraft((prev) => {
          const copy = { ...prev };
          delete copy[providerId];
          return copy;
        });
        if (selectedProvider === providerId) {
          const rest = configs.filter((c) => c.providerId !== providerId);
          setSelectedProvider(rest[0]?.providerId ?? providers[0]?.id ?? 'anthropic');
        }
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [removeProviderConfig, load, selectedProvider, configs, providers]
  );

  // ── Provider credentials handlers ──────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(selectedProvider);
    setError(null);
    try {
      await setProviderConfig(
        selectedProvider,
        selectedDraft.apiKey.trim() || undefined,
        selectedDraft.baseUrl.trim() || undefined,
        selectedDraft.modelId.trim() || undefined
      );
      await load();
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }, [selectedProvider, selectedDraft, load, setProviderConfig]);

  const handleSetDefault = useCallback(
    async (providerId: string | null) => {
      setError(null);
      try {
        const next = await updateSettings({ defaultProviderId: providerId });
        setSettings(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [updateSettings]
  );

  const handleRemoveProvider = useCallback(
    async (providerId: string) => {
      setError(null);
      try {
        await removeProviderConfig(providerId);
        setDraft((prev) => {
          const copy = { ...prev };
          delete copy[providerId];
          return copy;
        });
        if (selectedProvider === providerId) {
          const rest = configs.filter((c) => c.providerId !== providerId);
          setSelectedProvider(rest[0]?.providerId ?? providers[0]?.id ?? 'anthropic');
        }
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [removeProviderConfig, load, selectedProvider, configs, providers]
  );

  // ── MCP handlers ───────────────────────────────────────────────
  const handleAddMcp = useCallback(async () => {
    const name = mcpForm.name.trim();
    if (!name) {
      setError('MCP server name is required');
      return;
    }
    const transport =
      mcpForm.transportType === 'stdio'
        ? {
            type: 'stdio' as const,
            command: mcpForm.command.trim(),
            args: mcpForm.args.split(/\s+/).filter(Boolean),
          }
        : {
            type: mcpForm.transportType as 'sse' | 'streamableHttp',
            url: mcpForm.url.trim(),
          };
    if (mcpForm.transportType === 'stdio' && !transport.command) {
      setError('Command is required for stdio MCP servers');
      return;
    }
    if (mcpForm.transportType !== 'stdio' && !transport.url) {
      setError('URL is required for remote MCP servers');
      return;
    }
    setError(null);
    setMcpBusy('add');
    try {
      await addMcpServer(name, transport);
      setMcpForm({ name: '', transportType: 'stdio', command: '', args: '', url: '' });
      setShowMcpAdd(false);
      await loadMcp();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMcpBusy(null);
    }
  }, [mcpForm, addMcpServer, loadMcp]);

  const handleRemoveMcp = useCallback(
    async (name: string) => {
      setError(null);
      setMcpBusy(name);
      try {
        await removeMcpServer(name);
        await loadMcp();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setMcpBusy(null);
      }
    },
    [removeMcpServer, loadMcp]
  );

  const handleToggleMcp = useCallback(
    async (server: AgentMcpServer) => {
      setError(null);
      setMcpBusy(server.name);
      try {
        await setMcpServerDisabled(server.name, !server.disabled);
        await loadMcp();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setMcpBusy(null);
      }
    },
    [setMcpServerDisabled, loadMcp]
  );

  // ── Global settings ───────────────────────────────────────────────
  const g = settings?.global;
  const compactionMode: 'off' | 'basic' | 'agentic' = g
    ? g.compactionEnabled === false
      ? 'off'
      : (g.compactionStrategy ?? 'basic')
    : 'basic';
  const defaultProviderId = g?.defaultProviderId ?? null;

  const applyGlobal = useCallback(
    async (patch: Record<string, unknown>) => {
      setError(null);
      try {
        const next = await updateSettings(patch);
        setSettings(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [updateSettings]
  );

  // ── Tool policies ─────────────────────────────────────────────────
  const handleToolPolicy = useCallback(
    async (tool: AgentToolInfo, patch: { enabled?: boolean; autoApprove?: boolean }) => {
      setError(null);
      try {
        await setToolPolicy(tool.id, patch);
        const next = await getSettings();
        setSettings(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [setToolPolicy, getSettings]
  );

  const handleClearToolPolicy = useCallback(
    async (tool: AgentToolInfo) => {
      setError(null);
      try {
        await clearToolPolicy(tool.id);
        const next = await getSettings();
        setSettings(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [clearToolPolicy, getSettings]
  );

  // ── Skills / workflows / rules ────────────────────────────────────
  const handleToggleInstruction = useCallback(
    async (item: AgentUserInstruction) => {
      setError(null);
      try {
        await toggleUserInstruction(instructionType, item.id, item.disabled);
        await loadInstructions(instructionType);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [toggleUserInstruction, instructionType, loadInstructions]
  );

  const handleAddInstruction = useCallback(async () => {
    const form = addForm[instructionType];
    if (!form.name.trim()) return;
    setError(null);
    try {
      await addUserInstruction(instructionType, form.name.trim(), form.description.trim() || undefined, form.instructions.trim() || undefined);
      setAddForm((prev) => ({ ...prev, [instructionType]: { name: '', description: '', instructions: '' } }));
      setShowAdd(false);
      await loadInstructions(instructionType);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [addForm, instructionType, addUserInstruction, loadInstructions]);

  const currentInstructions = instructions[instructionType];

  const [tab, setTab] = useState<AgentTab>('providers');
  const [toolQuery, setToolQuery] = useState('');

  const selectedName = PROVIDER_DISPLAY[selectedProvider] ?? selectedInfo?.name ?? selectedProvider;
  const credentialsSet = editorIsOAuth ? oauthLinked : Boolean(selectedCfg && hasSavedProviderAuth(selectedCfg));
  const query = toolQuery.trim().toLowerCase();
  const visibleTools = (settings?.tools ?? []).filter(
    (tool) => !query || tool.id.toLowerCase().includes(query) || (tool.description ?? '').toLowerCase().includes(query),
  );
  const instructionLabel = INSTRUCTION_TYPES.find((t) => t.id === instructionType)?.label ?? instructionType;
  const addDraft = addForm[instructionType];
  const setAddDraft = (patch: Partial<{ name: string; description: string; instructions: string }>) =>
    setAddForm((prev) => ({ ...prev, [instructionType]: { ...prev[instructionType], ...patch } }));

  const hostTone = !status ? 'neutral' : status.connected ? 'success' : status.running ? 'warning' : 'danger';
  const hostLabel = status?.connected ? 'Connected' : status?.running ? 'Starting…' : status ? 'Not running' : 'Checking…';

  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
      <SettingsStack>
        <SettingsGroup footer="Runs locally and needs Node v22 or newer. Its data lives in ~/.yzpzcode/agent.">
          <SettingsRow
            badge={<Badge dot tone={hostTone}>{hostLabel}</Badge>}
            description={
              status
                ? `Node v${status.nodeMajor ?? '?'} · port ${status.port ?? '—'} · ${status.sessions} active session${status.sessions === 1 ? '' : 's'}`
                : 'Waiting for the agent host…'
            }
            icon={<Robot size={16} aria-hidden="true" />}
            label="Agent host"
          />
        </SettingsGroup>

        {error && (
          <Notice
            action={<Button aria-label="Dismiss" onClick={() => setError(null)} size="sm" variant="ghost">Dismiss</Button>}
            tone="danger"
          >
            {error}
          </Notice>
        )}
      </SettingsStack>
      </div>

      <SettingsTabs
        label="Agent settings"
        onChange={setTab}
        tabs={[
          { id: 'providers' as const, label: 'Providers', icon: Key, count: configuredIds.size || undefined },
          { id: 'behavior' as const, label: 'Behavior', icon: SlidersHorizontal },
          { id: 'tools' as const, label: 'Tools', icon: Wrench },
          { id: 'mcp' as const, label: 'MCP servers', icon: PlugsConnected, count: mcpServers.length || undefined },
          { id: 'instructions' as const, label: 'Instructions', icon: BookOpen },
          { id: 'display' as const, label: 'Display', icon: TextAa },
        ]}
        value={tab}
      />

      {/* ── Providers ─────────────────────────────────────────────── */}
      {tab === 'providers' && (
        <SettingsStack>
          <SettingsGroup
            action={
              <Button
                aria-label="Refresh model catalog"
                disabled={!status?.connected}
                icon={ArrowClockwise}
                loading={catalogRefreshing}
                onClick={() => void handleRefreshCatalogs()}
                size="sm"
                title="Refresh the model list from models.dev"
                variant="ghost"
              >
                Refresh models
              </Button>
            }
            description="Link as many as you like. The starred provider is used for new agents."
            title="Linked providers"
          >
            {configs.length === 0 ? (
              <SettingsEmpty icon={Key} title="No providers linked yet">
                Choose a provider below and add your credentials.
              </SettingsEmpty>
            ) : (
              configs.map((cfg) => {
                const isDefault = defaultProviderId === cfg.providerId;
                const isSelected = cfg.providerId === selectedProvider;
                const linked = hasSavedProviderAuth(cfg);
                return (
                  <SettingsRow
                    badge={
                      <>
                        <Badge dot tone={linked ? 'success' : 'neutral'}>{linked ? 'Linked' : 'Not linked'}</Badge>
                        {isDefault && <Badge tone="accent">Default</Badge>}
                      </>
                    }
                    description={cfg.modelId ? `Model: ${cfg.modelId}` : undefined}
                    key={cfg.providerId}
                    label={PROVIDER_DISPLAY[cfg.providerId] ?? cfg.providerId}
                  >
                    <Button
                      aria-label={isDefault ? 'Clear default provider' : 'Make default provider'}
                      aria-pressed={isDefault}
                      icon={Star}
                      iconOnly
                      iconWeight={isDefault ? 'fill' : 'regular'}
                      onClick={() => void handleSetDefault(isDefault ? null : cfg.providerId)}
                      size="sm"
                      title={isDefault ? 'Clear default provider' : 'Make default provider'}
                      variant="ghost"
                    />
                    <Button disabled={isSelected} onClick={() => setSelectedProvider(cfg.providerId)} size="sm">
                      {isSelected ? 'Editing' : 'Edit'}
                    </Button>
                    <Button
                      aria-label={`Unlink ${PROVIDER_DISPLAY[cfg.providerId] ?? cfg.providerId}`}
                      icon={Trash}
                      iconOnly
                      onClick={() => void handleRemoveProvider(cfg.providerId)}
                      size="sm"
                      title="Unlink provider"
                      variant="ghost"
                    />
                  </SettingsRow>
                );
              })
            )}
          </SettingsGroup>

          <SettingsGroup
            footer="Credentials are stored on this computer in ~/.yzpzcode/agent/providers.json and are never sent to YzPzCode servers. Existing Command Code CLI or environment credentials are read in place."
            title="Set up a provider"
          >
            <SettingsRow
              badge={
                <>
                  <Badge dot tone={credentialsSet ? 'success' : 'warning'}>
                    {oauthBusy ? 'Signing in…' : credentialsSet ? (editorIsOAuth ? 'Signed in' : 'Credentials saved') : 'Not linked'}
                  </Badge>
                  {defaultProviderId === selectedProvider && <Badge tone="accent">Default</Badge>}
                </>
              }
              description={selectedProvider}
              label="Provider"
            >
              <div style={{ width: '17rem' }}>
                <AgentSelect
                  onChange={setSelectedProvider}
                  options={providers.map((p) => ({
                    value: p.id,
                    label: `${PROVIDER_DISPLAY[p.id] ?? p.name}${configuredIds.has(p.id) ? ' ✓' : ''}`,
                  }))}
                  searchPlaceholder="Search providers…"
                  value={selectedProvider}
                />
              </div>
            </SettingsRow>

            {editorIsCommandCode && (
              <SettingsBlock>
                <Notice>
                  GOAT and Pro plans support the Provider API. Both Command Code entries share one Studio/CLI key:
                  use <strong>Command Code</strong> for non-Claude models and <strong>Command Code · Claude</strong> for
                  Claude models. An existing cmd/cmdc login or COMMAND_CODE_API_KEY is reused automatically, so the key
                  field can stay empty.
                </Notice>
              </SettingsBlock>
            )}

            {editorIsOAuth ? (
              <SettingsRow
                description={
                  oauthLinked
                    ? `Signed in as ${oauthEmail ?? 'your ChatGPT account'}.`
                    : oauthStatus === 'waiting-for-browser'
                      ? 'Finish signing in in your browser. You’ll be sent back here when it’s done.'
                      : 'Use your ChatGPT (OpenAI Codex) subscription. A browser window opens; YzPzCode never sees your token.'
                }
                label="ChatGPT account"
              >
                {oauthLinked ? (
                  <Button onClick={() => void handleSignOutOAuth(selectedProvider)} size="sm" variant="danger">
                    Sign out
                  </Button>
                ) : (
                  <Button loading={oauthBusy} onClick={() => void handleSignInOAuth()} variant="primary">
                    {oauthStatus === 'opening-browser'
                      ? 'Opening browser…'
                      : oauthStatus === 'waiting-for-browser'
                        ? 'Waiting for browser…'
                        : 'Sign in with ChatGPT'}
                  </Button>
                )}
              </SettingsRow>
            ) : (
              <SettingsBlock>
                <div className="st-form">
                  <Field
                    hint={selectedCfg && hasSavedProviderAuth(selectedCfg) ? 'A key is already saved. Enter a new one to replace it.' : undefined}
                    label="API key"
                  >
                    {(id) => (
                      <div style={{ position: 'relative' }}>
                        <input
                          autoComplete="off"
                          className="st-input st-input--mono"
                          id={id}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, [selectedProvider]: { ...selectedDraft, apiKey: e.target.value } }))
                          }
                          placeholder={editorIsCommandCode ? 'user_…' : 'sk-…'}
                          style={{ paddingRight: '2.25rem' }}
                          type={revealKey ? 'text' : 'password'}
                          value={selectedDraft.apiKey}
                        />
                        <Button
                          aria-label={revealKey ? 'Hide API key' : 'Show API key'}
                          icon={revealKey ? EyeSlash : Eye}
                          iconOnly
                          onClick={() => setRevealKey((v) => !v)}
                          size="sm"
                          style={{ position: 'absolute', top: '50%', right: '0.25rem', transform: 'translateY(-50%)' }}
                          title={revealKey ? 'Hide API key' : 'Show API key'}
                          variant="ghost"
                        />
                      </div>
                    )}
                  </Field>
                </div>
              </SettingsBlock>
            )}

            {oauthPrompt && editorIsOAuth && (
              <SettingsBlock>
                <div className="st-form">
                  <Notice>{oauthPrompt.message}</Notice>
                  <Field label="Code from the browser">
                    {(id) => (
                      <input
                        className="st-input"
                        id={id}
                        onChange={(e) => setPromptAnswer(e.target.value)}
                        placeholder={oauthPrompt.defaultValue ?? 'Paste the code here'}
                        value={promptAnswer}
                      />
                    )}
                  </Field>
                  <div className="st-actions">
                    <Button
                      onClick={() => {
                        setOauthPrompt(null);
                        setPromptAnswer('');
                      }}
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button onClick={() => void handleResolveOAuthPrompt()} variant="primary">Submit</Button>
                  </div>
                </div>
              </SettingsBlock>
            )}

            <SettingsBlock>
              <div className="st-form st-form--2">
                <Field
                  hint={isCustomBaseUrl ? 'Enter the address of your OpenAI-compatible endpoint.' : 'Filled in automatically for this provider.'}
                  label="Base URL"
                >
                  {(id) => (
                    <input
                      className="st-input st-input--mono"
                      id={id}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [selectedProvider]: { ...selectedDraft, baseUrl: e.target.value } }))
                      }
                      placeholder={selectedInfo?.baseUrl ?? 'https://api.example.com/v1'}
                      readOnly={!isCustomBaseUrl}
                      type="text"
                      value={selectedDraft.baseUrl}
                    />
                  )}
                </Field>
                <Field hint={models.length === 0 ? 'Models appear once the provider is available.' : undefined} label="Default model">
                  {() => (
                    <AgentSelect
                      disabled={models.length === 0}
                      onChange={(v) =>
                        setDraft((prev) => ({ ...prev, [selectedProvider]: { ...selectedDraft, modelId: v } }))
                      }
                      options={modelOptions}
                      placeholder={models.length === 0 ? 'No models loaded' : 'Select a model…'}
                      searchPlaceholder="Search models…"
                      value={selectedDraft.modelId}
                    />
                  )}
                </Field>
              </div>
            </SettingsBlock>

            <SettingsBlock>
              <div className="st-actions">
                {savedFlash && <Badge tone="success">Saved</Badge>}
                <Button loading={saving === selectedProvider} onClick={() => void handleSave()} variant="primary">
                  Save {selectedName}
                </Button>
              </div>
            </SettingsBlock>
          </SettingsGroup>
        </SettingsStack>
      )}

      {/* ── Behavior ──────────────────────────────────────────────── */}
      {tab === 'behavior' &&
        (settings ? (
          <SettingsStack>
            <SettingsGroup title="Conversation">
              <SettingsRow
                description="Summarize older messages automatically when the context window is nearly full."
                icon={<Gauge size={16} aria-hidden="true" />}
                label="Context compaction"
              >
                <Segmented
                  label="Context compaction"
                  onChange={(value) => void applyGlobal({ compactionMode: value })}
                  options={COMPACTION_MODES}
                  value={compactionMode}
                />
              </SettingsRow>
              <SettingsRow
                description="Plan mode proposes steps first. Act mode starts working right away."
                icon={<Robot size={16} aria-hidden="true" />}
                label="Starting mode"
              >
                <Segmented
                  label="Starting mode"
                  onChange={(value) => void applyGlobal({ planActMode: value })}
                  options={PLAN_ACT_MODES}
                  value={g?.planActMode ?? 'act'}
                />
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup title="Permissions and privacy">
              <ToggleRow
                checked={g?.toolAutoApprove ?? false}
                description="Let the agent run tools without asking, where a tool’s own setting allows it."
                icon={<ShieldCheck size={16} aria-hidden="true" />}
                label="Auto-approve tools"
                onChange={(value) => void applyGlobal({ toolAutoApprove: value })}
              />
              <ToggleRow
                checked={!(g?.telemetryOptOut ?? false)}
                description="Share anonymous usage statistics to help improve the agent."
                icon={<Gauge size={16} aria-hidden="true" />}
                label="Anonymous usage data"
                onChange={(value) => void applyGlobal({ telemetryOptOut: !value })}
              />
            </SettingsGroup>

            <SettingsGroup title="Safety net">
              <SliderRow
                description="Warn when a running agent turn stays silent this long."
                format={(value) => (value === 0 ? 'Off' : `${value}s`)}
                icon={<Gauge size={16} aria-hidden="true" />}
                label="Inactivity warning"
                max={1800}
                min={0}
                onChange={setAgentTimeout}
                step={60}
                value={agentTimeout}
              />
            </SettingsGroup>
          </SettingsStack>
        ) : (
          <SettingsEmpty icon={SlidersHorizontal} title="Loading agent settings…" />
        ))}

      {/* ── Tools ─────────────────────────────────────────────────── */}
      {tab === 'tools' &&
        (settings ? (
          <SettingsStack>
            <div style={{ position: 'relative' }}>
              <MagnifyingGlass
                aria-hidden="true"
                size={15}
                style={{ position: 'absolute', top: '50%', left: '0.75rem', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
              />
              <input
                aria-label="Search tools"
                className="st-input"
                onChange={(event) => setToolQuery(event.target.value)}
                placeholder={`Search ${settings.tools.length} tools`}
                style={{ paddingLeft: '2.125rem' }}
                type="search"
                value={toolQuery}
              />
            </div>

            <SettingsGroup footer="Off: the agent cannot use the tool. Ask: you approve each use. Auto: it runs without asking.">
              {visibleTools.length === 0 ? (
                <SettingsEmpty icon={Wrench} title="No tools match your search" />
              ) : (
                <div className="st-list custom-scrollbar" style={{ maxHeight: '30rem', overflowY: 'auto' }}>
                  {visibleTools.map((tool) => (
                    <SettingsRow
                      description={
                        tool.description ? (
                          <span className="st-truncate" style={{ display: 'block', maxWidth: '22rem' }} title={tool.description}>
                            {tool.description}
                          </span>
                        ) : undefined
                      }
                      key={tool.id}
                      label={<span className="st-mono">{tool.id}</span>}
                    >
                      <Segmented
                        label={`${tool.id} permission`}
                        onChange={(mode) =>
                          void handleToolPolicy(
                            tool,
                            mode === 'off' ? { enabled: false } : { enabled: true, autoApprove: mode === 'auto' },
                          )
                        }
                        options={TOOL_MODES}
                        value={toolModeOf(tool)}
                      />
                      <Button
                        aria-label={`Reset ${tool.id} to default`}
                        disabled={tool.policy === null}
                        icon={ArrowCounterClockwise}
                        iconOnly
                        onClick={() => void handleClearToolPolicy(tool)}
                        size="sm"
                        title="Reset to default"
                        variant="ghost"
                      />
                    </SettingsRow>
                  ))}
                </div>
              )}
            </SettingsGroup>
          </SettingsStack>
        ) : (
          <SettingsEmpty icon={Wrench} title="Loading tools…" />
        ))}

      {/* ── MCP servers ───────────────────────────────────────────── */}
      {tab === 'mcp' && (
        <SettingsStack>
          <SettingsGroup
            action={
              <Button icon={Plus} onClick={() => setShowMcpAdd((v) => !v)} size="sm" variant={showMcpAdd ? 'default' : 'primary'}>
                {showMcpAdd ? 'Cancel' : 'Add server'}
              </Button>
            }
            description="MCP servers give the agent extra tools, such as files, GitHub or a database."
            footer="Servers are stored in the agent’s data folder (cline_mcp_settings.json)."
            title="Connected servers"
          >
            {showMcpAdd && (
              <SettingsBlock>
                <div className="st-form">
                  <div className="st-form st-form--2">
                    <Field label="Name">
                      {(id) => (
                        <input
                          className="st-input"
                          id={id}
                          onChange={(e) => setMcpForm((p) => ({ ...p, name: e.target.value }))}
                          placeholder="e.g. filesystem"
                          value={mcpForm.name}
                        />
                      )}
                    </Field>
                    <Field label="Connection type">
                      {() => (
                        <Segmented
                          label="Connection type"
                          onChange={(v) => setMcpForm((p) => ({ ...p, transportType: v }))}
                          options={MCP_TRANSPORTS}
                          value={mcpForm.transportType}
                        />
                      )}
                    </Field>
                  </div>
                  {mcpForm.transportType === 'stdio' ? (
                    <div className="st-form st-form--2">
                      <Field label="Command">
                        {(id) => (
                          <input
                            className="st-input st-input--mono"
                            id={id}
                            onChange={(e) => setMcpForm((p) => ({ ...p, command: e.target.value }))}
                            placeholder="npx -y @modelcontextprotocol/server-filesystem"
                            value={mcpForm.command}
                          />
                        )}
                      </Field>
                      <Field hint="Separate with spaces." label="Arguments">
                        {(id) => (
                          <input
                            className="st-input st-input--mono"
                            id={id}
                            onChange={(e) => setMcpForm((p) => ({ ...p, args: e.target.value }))}
                            placeholder="C:\projects\demo"
                            value={mcpForm.args}
                          />
                        )}
                      </Field>
                    </div>
                  ) : (
                    <Field label="Server URL">
                      {(id) => (
                        <input
                          className="st-input st-input--mono"
                          id={id}
                          onChange={(e) => setMcpForm((p) => ({ ...p, url: e.target.value }))}
                          placeholder={mcpForm.transportType === 'sse' ? 'https://server/sse' : 'https://server/mcp'}
                          value={mcpForm.url}
                        />
                      )}
                    </Field>
                  )}
                  <div className="st-actions">
                    <Button loading={mcpBusy === 'add'} onClick={() => void handleAddMcp()} variant="primary">
                      {mcpBusy === 'add' ? 'Connecting…' : 'Add server'}
                    </Button>
                  </div>
                </div>
              </SettingsBlock>
            )}

            {mcpLoading ? (
              <SettingsEmpty icon={PlugsConnected} title="Checking servers…" />
            ) : mcpServers.length === 0 ? (
              !showMcpAdd && (
                <SettingsEmpty icon={PlugsConnected} title="No servers connected">
                  Add one to give the agent more tools.
                </SettingsEmpty>
              )
            ) : (
              mcpServers.map((server) => {
                const meta = server.disabled ? { tone: 'neutral' as const, label: 'Disabled' } : (MCP_TONE[server.status] ?? MCP_TONE.disconnected);
                const detail =
                  server.transport?.type === 'stdio'
                    ? `${server.transport.command ?? ''}${server.transport.args?.length ? ' ' + server.transport.args.join(' ') : ''}`
                    : (server.transport?.url ?? '');
                return (
                  <SettingsRow
                    badge={<Badge dot tone={meta.tone}>{meta.label}</Badge>}
                    description={
                      <>
                        <span className="st-truncate st-mono" style={{ display: 'block', maxWidth: '24rem' }} title={detail}>
                          {server.transport?.type ?? '?'} · {detail}
                          {server.toolCount > 0 ? ` · ${server.toolCount} tool${server.toolCount === 1 ? '' : 's'}` : ''}
                        </span>
                        {server.lastError && (
                          <span className="st-truncate" style={{ display: 'block', color: 'var(--st-danger)' }} title={server.lastError}>
                            {server.lastError}
                          </span>
                        )}
                      </>
                    }
                    icon={<StatusDot tone={meta.tone} />}
                    iconBare
                    key={server.name}
                    label={server.name}
                  >
                    <Switch
                      checked={!server.disabled}
                      disabled={mcpBusy === server.name}
                      label={`${server.disabled ? 'Enable' : 'Disable'} ${server.name}`}
                      onChange={() => void handleToggleMcp(server)}
                    />
                    <Button
                      aria-label={`Remove ${server.name}`}
                      disabled={mcpBusy === server.name}
                      icon={Trash}
                      iconOnly
                      onClick={() => void handleRemoveMcp(server.name)}
                      size="sm"
                      title="Remove server"
                      variant="ghost"
                    />
                  </SettingsRow>
                );
              })
            )}
          </SettingsGroup>
        </SettingsStack>
      )}

      {/* ── Instructions ──────────────────────────────────────────── */}
      {tab === 'instructions' && (
        <SettingsStack>
          <div>
            <Segmented
              label="Instruction type"
              onChange={(value) => {
                setInstructionType(value);
                setShowAdd(false);
              }}
              options={INSTRUCTION_TYPES.map((t) => ({ value: t.id, label: t.label }))}
              value={instructionType}
            />
          </div>

          <SettingsGroup
            action={
              <Button icon={Plus} onClick={() => setShowAdd((v) => !v)} size="sm" variant={showAdd ? 'default' : 'primary'}>
                {showAdd ? 'Cancel' : `Add ${instructionType}`}
              </Button>
            }
            description={
              instructionType === 'skill'
                ? 'Reusable abilities the agent can use when they fit the task.'
                : instructionType === 'workflow'
                  ? 'Step-by-step procedures you can ask the agent to follow.'
                  : 'Standing guidance the agent follows in every conversation.'
            }
            footer={`Files live in ~/.yzpzcode/agent/${instructionType}s and apply to every workspace. You can also drop markdown files in that folder.`}
            title={instructionLabel}
          >
            {showAdd && (
              <SettingsBlock>
                <div className="st-form">
                  <div className="st-form st-form--2">
                    <Field label="Name">
                      {(id) => (
                        <input
                          className="st-input"
                          id={id}
                          onChange={(e) => setAddDraft({ name: e.target.value })}
                          value={addDraft.name}
                        />
                      )}
                    </Field>
                    <Field label="Description (optional)">
                      {(id) => (
                        <input
                          className="st-input"
                          id={id}
                          onChange={(e) => setAddDraft({ description: e.target.value })}
                          value={addDraft.description}
                        />
                      )}
                    </Field>
                  </div>
                  <Field label="Instructions">
                    {(id) => (
                      <textarea
                        className="st-textarea"
                        id={id}
                        onChange={(e) => setAddDraft({ instructions: e.target.value })}
                        placeholder="What should the agent do or know?"
                        rows={5}
                        value={addDraft.instructions}
                      />
                    )}
                  </Field>
                  <div className="st-actions">
                    <Button disabled={!addDraft.name.trim()} onClick={() => void handleAddInstruction()} variant="primary">
                      Save {instructionType}
                    </Button>
                  </div>
                </div>
              </SettingsBlock>
            )}

            {currentInstructions.length === 0 ? (
              !showAdd && (
                <SettingsEmpty icon={BookOpen} title={`No ${instructionType}s yet`}>
                  Add one, or drop markdown files into ~/.yzpzcode/agent/{instructionType}s.
                </SettingsEmpty>
              )
            ) : (
              <div className="st-list custom-scrollbar" style={{ maxHeight: '26rem', overflowY: 'auto' }}>
                {currentInstructions.map((item) => (
                  <SettingsRow
                    description={
                      <>
                        {item.description && <span style={{ display: 'block' }}>{item.description}</span>}
                        <span className="st-truncate st-mono" style={{ display: 'block', maxWidth: '26rem' }} title={item.filePath}>
                          {item.filePath}
                        </span>
                      </>
                    }
                    key={item.id}
                    label={item.name}
                  >
                    <Switch
                      checked={!item.disabled}
                      label={`${item.disabled ? 'Enable' : 'Disable'} ${item.name}`}
                      onChange={() => void handleToggleInstruction(item)}
                    />
                  </SettingsRow>
                ))}
              </div>
            )}
          </SettingsGroup>
        </SettingsStack>
      )}

      {/* ── Display ───────────────────────────────────────────────── */}
      {tab === 'display' && (
        <SettingsStack>
          <SettingsGroup
            description="Applies instantly and is saved on this device for every workspace."
            title="Agent session"
          >
            <SliderRow
              description="Messages, responses and the message box."
              format={(value) => `${value}px`}
              icon={<TextAa size={16} aria-hidden="true" />}
              label="Conversation text"
              max={20}
              min={12}
              onChange={setAgentSessionFontSize}
              value={agentSessionFontSize}
            />
            <SliderRow
              description="Headers, buttons and the session frame."
              format={(value) => `${value}%`}
              icon={<SlidersHorizontal size={16} aria-hidden="true" />}
              label="Interface scale"
              max={125}
              min={90}
              onChange={setAgentInterfaceScale}
              step={5}
              value={agentInterfaceScale}
            />
            <SliderRow
              description="Maximum width of the conversation column."
              format={(value) => `${value}px`}
              icon={<SlidersHorizontal size={16} aria-hidden="true" />}
              label="Reading width"
              max={1200}
              min={640}
              onChange={setAgentConversationWidth}
              step={20}
              value={agentConversationWidth}
            />
            <SettingsRow description="Defaults: 14px text, 100% scale, 860px reading width." label="Reset display">
              <Button icon={ArrowCounterClockwise} onClick={resetAgentDisplayPreferences} size="sm">Reset</Button>
            </SettingsRow>
          </SettingsGroup>
        </SettingsStack>
      )}
    </>
  );
};
