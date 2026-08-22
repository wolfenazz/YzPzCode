import React, { useEffect, useState, useCallback } from 'react';
import { ArrowClockwise, Eye, EyeSlash } from '@phosphor-icons/react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { AgentSelect } from '../../agent/AgentSelect';
import { useAgentHost } from '../../../hooks/useAgentHost';
import { useAppStore } from '../../../stores/appStore';
import { SettingsSlider } from '../../common/SettingsSlider';
import type {
  AgentHostStatus,
  AgentMcpServer,
  AgentModelInfo,
  AgentProviderInfo,
  AgentSettings,
  AgentToolInfo,
  AgentUserInstruction,
} from '../../../types';

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
};

const INSTRUCTION_TYPES = [
  { id: 'skill', label: 'Skills' },
  { id: 'workflow', label: 'Workflows' },
  { id: 'rule', label: 'Rules' },
] as const;

type InstructionType = (typeof INSTRUCTION_TYPES)[number]['id'];

const MCP_STATUS: Record<AgentMcpServer['status'], { dot: string; label: string }> = {
  connected: { dot: 'bg-emerald-500', label: 'Connected' },
  connecting: { dot: 'bg-[var(--accent)] mcp-dot-connecting', label: 'Connecting' },
  disconnected: { dot: 'bg-rose-500', label: 'Disconnected' },
};

const Segment: React.FC<{
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => (
  <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] w-fit">
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 h-6 rounded-[5px] font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer ${
            active ? 'bg-[var(--accent-light)]/40 text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }> = ({
  label,
  checked,
  onChange,
  hint,
}) => (
  <div className="flex items-center justify-between gap-3 py-1">
    <div className="min-w-0">
      <div className="font-mono text-[10px] text-[var(--text-primary)]">{label}</div>
      {hint && <div className="font-mono text-[9px] text-[var(--text-secondary)]/50">{hint}</div>}
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-150 cursor-pointer flex-shrink-0 ${
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-primary)]'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-150 ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  </div>
);

const DisplaySlider: React.FC<{
  label: string;
  description: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, description, value, displayValue, min, max, step = 1, onChange }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2">
    <div className="min-w-0">
      <div className="font-mono text-[10px] text-[var(--text-primary)]">{label}</div>
      <div className="font-mono text-[9px] text-[var(--text-secondary)]/50">{description}</div>
    </div>
    <output className="font-mono text-[10px] tabular-nums text-[var(--accent)]">{displayValue}</output>
    <input
      className="col-span-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--border-primary)] accent-[var(--accent)]"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-label={label}
    />
  </div>
);

export const SettingsAgent: React.FC = () => {
  const {
    agentSessionFontSize,
    agentInterfaceScale,
    agentConversationWidth,
    setAgentSessionFontSize,
    setAgentInterfaceScale,
    setAgentConversationWidth,
    resetAgentDisplayPreferences,
    autoOpenPreview,
    setAutoOpenPreview,
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

  // Initialize the draft for the selected provider (from saved config or provider defaults).
  useEffect(() => {
    setDraft((prev) => {
      if (prev[selectedProvider]) return prev;
      const cfg = configs.find((c) => c.providerId === selectedProvider);
      const info = providers.find((p) => p.id === selectedProvider);
      return {
        ...prev,
        [selectedProvider]: {
          apiKey: '',
          baseUrl: cfg?.baseUrl ?? '',
          modelId: cfg?.modelId ?? info?.defaultModelId ?? '',
        },
      };
    });
  }, [selectedProvider, configs, providers]);

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
          if (cur.modelId && m.some((x) => x.id === cur.modelId)) return prev;
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

  const selectedDraft = draft[selectedProvider] ?? { apiKey: '', baseUrl: '', modelId: '' };
  const editorIsOAuth = authMethods[selectedProvider] === 'oauth';
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-widest uppercase">YZPZ Agent</h2>
        <p className="mt-1 text-[11px] text-[var(--text-secondary)]/70">
          UI AI agent harness — runs as a local Node sidecar. Settings are global across all workspaces.
        </p>
      </div>

      {/* Session display */}
      <section className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Session Display</span>
          <span className="ml-auto font-mono text-[9px] text-[var(--text-secondary)]/50">applies instantly</span>
        </div>
        <div className="px-4 py-4 space-y-5">
          <p className="max-w-xl font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]/65">
            Tune the YZPZ Agent session for easier reading. These preferences are saved on this device and apply to every workspace.
          </p>

          <DisplaySlider
            label="Conversation text"
            description="Message, response, and composer text"
            value={agentSessionFontSize}
            displayValue={`${agentSessionFontSize}px`}
            min={12}
            max={20}
            onChange={setAgentSessionFontSize}
          />
          <DisplaySlider
            label="Agent interface scale"
            description="Headers, controls, and session chrome"
            value={agentInterfaceScale}
            displayValue={`${agentInterfaceScale}%`}
            min={90}
            max={125}
            step={5}
            onChange={setAgentInterfaceScale}
          />
          <DisplaySlider
            label="Reading width"
            description="Maximum width of the conversation column"
            value={agentConversationWidth}
            displayValue={`${agentConversationWidth}px`}
            min={640}
            max={1200}
            step={20}
            onChange={setAgentConversationWidth}
          />

          <div className="flex items-center justify-between gap-4 border-t border-[var(--border-primary)] pt-3">
            <span className="font-mono text-[9px] text-[var(--text-secondary)]/50">Default: 14px text · 100% UI · 860px reading width</span>
            <button
              type="button"
              onClick={resetAgentDisplayPreferences}
              className="rounded-md border border-[var(--border-primary)] px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)]/15 hover:text-[var(--accent)] cursor-pointer"
            >
              Reset display
            </button>
          </div>
        </div>
      </section>

      {/* Harness status */}
      <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${status?.connected ? 'bg-emerald-500' : status?.running ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'}`} />
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
            Harness Status
          </span>
          <span className="ml-auto font-mono text-[9px] text-[var(--text-secondary)]/60">
            {status ? `node v${status.nodeMajor ?? '?'} · port ${status.port ?? '—'} · ${status.sessions} sessions` : 'loading…'}
          </span>
        </div>
        <div className="px-4 py-3 space-y-1">
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-[var(--text-secondary)]">Transport</span>
            <span className={status?.connected ? 'text-emerald-500' : 'text-[var(--text-secondary)]/50'}>
              {status?.connected ? 'websocket connected' : 'starting…'}
            </span>
          </div>
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-[var(--text-secondary)]">Data directory</span>
            <span className="text-[var(--text-secondary)]/70">~/.yzpzcode/agent</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-[var(--text-secondary)]">Minimum Node</span>
            <span className="text-[var(--text-secondary)]/70">v22+</span>
          </div>
        </div>
      </div>

      {/* General */}
      {settings && (
        <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]">General</span>
          </div>
          <div className="px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] text-[var(--text-primary)]">Compaction</div>
                <div className="font-mono text-[9px] text-[var(--text-secondary)]/50">Auto-compact near the context limit</div>
              </div>
              <Segment
                value={compactionMode}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'basic', label: 'Basic' },
                  { value: 'agentic', label: 'Agentic' },
                ]}
                onChange={(v) => void applyGlobal({ compactionMode: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] text-[var(--text-primary)]">Default mode</div>
                <div className="font-mono text-[9px] text-[var(--text-secondary)]/50">Initial plan/act behavior for new sessions</div>
              </div>
              <Segment
                value={g?.planActMode ?? 'act'}
                options={[
                  { value: 'act', label: 'Act' },
                  { value: 'plan', label: 'Plan' },
                ]}
                onChange={(v) => void applyGlobal({ planActMode: v })}
              />
            </div>
            <div className="border-t border-[var(--border-primary)]/50 my-1" />
            <Toggle
              label="Global tool auto-approve"
              hint="Run tools without asking when allowed by per-tool policy"
              checked={g?.toolAutoApprove ?? false}
              onChange={(v) => void applyGlobal({ toolAutoApprove: v })}
            />
            <Toggle
              label="Telemetry opt-out"
              hint="Disable anonymous usage telemetry"
              checked={g?.telemetryOptOut ?? false}
              onChange={(v) => void applyGlobal({ telemetryOptOut: v })}
            />
            <Toggle
              label="Auto-open live preview"
              hint="When a dev-server URL appears in terminal output, open it in the embedded browser automatically"
              checked={autoOpenPreview}
              onChange={(v) => setAutoOpenPreview(v)}
            />
            <div className="pt-1">
              <SettingsSlider
                label="No-activity watchdog"
                description="Warn when a running agent turn stays silent this long (0 disables)"
                value={agentTimeout}
                min={0}
                max={1800}
                step={60}
                displayValue={agentTimeout === 0 ? 'off' : `${agentTimeout}s`}
                onChange={setAgentTimeout}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tools */}
      {settings && (
        <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Tools</span>
            <span className="ml-auto font-mono text-[9px] text-[var(--text-secondary)]/50">per-tool execution policy</span>
          </div>
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {settings.tools.map((tool) => {
              const p = tool.policy;
              const isCustom = p !== null;
              return (
                <div key={tool.id} className="px-4 py-2 border-b border-[var(--border-primary)]/40 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-[var(--text-primary)]">{tool.id}</div>
                    <div className="font-mono text-[9px] text-[var(--text-secondary)]/50 truncate" title={tool.description}>
                      {tool.description || '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => void handleToolPolicy(tool, { enabled: !(p?.enabled ?? true) })}
                      className={`px-2 h-6 rounded-md border font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer ${
                        (p?.enabled ?? true)
                          ? 'border-emerald-900/50 text-emerald-500 bg-emerald-950/20'
                          : 'border-rose-900/50 text-rose-500 bg-rose-950/20'
                      }`}
                    >
                      {(p?.enabled ?? true) ? 'On' : 'Off'}
                    </button>
                    <button
                      onClick={() => void handleToolPolicy(tool, { autoApprove: !(p?.autoApprove ?? false) })}
                      className={`px-2 h-6 rounded-md border font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer ${
                        (p?.autoApprove ?? false)
                          ? 'border-[var(--accent-border)] text-[var(--accent)] bg-[var(--accent-light)]/20'
                          : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Auto
                    </button>
                    {isCustom && (
                      <button
                        onClick={() => void handleClearToolPolicy(tool)}
                        title="Reset to default"
                        className="px-1.5 h-6 rounded-md font-mono text-[9px] text-[var(--text-secondary)]/40 hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        ↺
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MCP Servers */}
      <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]">MCP Servers</span>
          <span className="ml-auto font-mono text-[9px] text-[var(--text-secondary)]/50">
            {mcpServers.length} linked · stored in the YZPZ Agent data dir
          </span>
          <button
            onClick={() => setShowMcpAdd((v) => !v)}
            className="h-6 px-2.5 rounded-md border border-[var(--accent-border)] text-[var(--accent)] hover:bg-[var(--accent-light)]/30 text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
          >
            {showMcpAdd ? 'Close' : '+ Add'}
          </button>
        </div>

        {showMcpAdd && (
          <div className="px-4 py-3.5 border-b border-[var(--border-primary)] space-y-2.5 bg-[var(--bg-main)] animate-fade-in-up">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <label className="space-y-1">
                <span className="block font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/60">Name</span>
                <input
                  value={mcpForm.name}
                  onChange={(e) => setMcpForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. filesystem"
                  className="w-full h-8 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:outline-none focus:border-[var(--accent-border)]"
                />
              </label>
              <label className="space-y-1">
                <span className="block font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/60">Transport</span>
                <Segment
                  value={mcpForm.transportType}
                  options={[
                    { value: 'stdio', label: 'stdio' },
                    { value: 'sse', label: 'SSE' },
                    { value: 'streamableHttp', label: 'HTTP' },
                  ]}
                  onChange={(v) => setMcpForm((p) => ({ ...p, transportType: v }))}
                />
              </label>
            </div>
            {mcpForm.transportType === 'stdio' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <label className="space-y-1">
                  <span className="block font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/60">Command</span>
                  <input
                    value={mcpForm.command}
                    onChange={(e) => setMcpForm((p) => ({ ...p, command: e.target.value }))}
                    placeholder="npx -y @modelcontextprotocol/server-filesystem"
                    className="w-full h-8 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:outline-none focus:border-[var(--accent-border)]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/60">Args (space separated)</span>
                  <input
                    value={mcpForm.args}
                    onChange={(e) => setMcpForm((p) => ({ ...p, args: e.target.value }))}
                    placeholder="C:\projects\demo"
                    className="w-full h-8 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:outline-none focus:border-[var(--accent-border)]"
                  />
                </label>
              </div>
            ) : (
              <label className="space-y-1">
                <span className="block font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/60">URL</span>
                <input
                  value={mcpForm.url}
                  onChange={(e) => setMcpForm((p) => ({ ...p, url: e.target.value }))}
                  placeholder={mcpForm.transportType === 'sse' ? 'https://server/sse' : 'https://server/mcp'}
                  className="w-full h-8 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:outline-none focus:border-[var(--accent-border)]"
                />
              </label>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => void handleAddMcp()}
                disabled={mcpBusy === 'add'}
                className="h-8 px-4 rounded-md bg-[var(--accent)] text-white text-[9px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all duration-100 cursor-pointer"
              >
                {mcpBusy === 'add' ? 'Connecting…' : 'Add Server'}
              </button>
            </div>
          </div>
        )}

        {mcpLoading ? (
          <div className="px-4 py-6 text-center font-mono text-[10px] text-[var(--text-secondary)]/50 animate-pulse">
            Checking MCP servers…
          </div>
        ) : mcpServers.length === 0 ? (
          <div className="px-4 py-6 text-center font-mono text-[10px] text-[var(--text-secondary)]/50">
            No MCP servers linked. Add one to give the agent extra tools (filesystem, GitHub, Postgres…).
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-primary)]/40">
            {mcpServers.map((server) => {
              const meta = server.disabled
                ? { dot: 'bg-[var(--text-secondary)]/30', label: 'Disabled' }
                : MCP_STATUS[server.status] ?? MCP_STATUS.disconnected;
              return (
                <div key={server.name} className="px-4 py-3 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] font-bold text-[var(--text-primary)] truncate">{server.name}</div>
                    <div className="font-mono text-[9px] text-[var(--text-secondary)]/50 truncate">
                      {server.transport?.type === 'stdio'
                        ? `${server.transport.type} · ${server.transport.command ?? ''}${server.transport.args?.length ? ' ' + server.transport.args.join(' ') : ''}`
                        : `${server.transport?.type ?? '?'} · ${server.transport?.url ?? ''}`}
                      {server.toolCount > 0 ? ` · ${server.toolCount} tool${server.toolCount === 1 ? '' : 's'}` : ''}
                    </div>
                    {server.lastError && (
                      <div className="font-mono text-[9px] text-rose-500/80 truncate" title={server.lastError}>
                        {server.lastError}
                      </div>
                    )}
                  </div>
                  <span className={`font-mono text-[9px] shrink-0 ${meta.label === 'Connected' ? 'text-emerald-500' : meta.label === 'Disabled' ? 'text-[var(--text-secondary)]/50' : 'text-rose-500'}`}>
                    {meta.label}
                  </span>
                  <button
                    onClick={() => void handleToggleMcp(server)}
                    disabled={mcpBusy === server.name}
                    className={`px-2 h-6 rounded-md border font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer shrink-0 ${
                      !server.disabled
                        ? 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        : 'border-emerald-900/50 text-emerald-500 bg-emerald-950/20'
                    }`}
                  >
                    {server.disabled ? 'Enable' : 'Disable'}
                  </button>
                  <button
                    onClick={() => void handleRemoveMcp(server.name)}
                    disabled={mcpBusy === server.name}
                    title="Remove MCP server"
                    className="px-1.5 h-6 rounded-md font-mono text-[9px] text-[var(--text-secondary)]/40 hover:text-rose-500 transition-colors duration-100 cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Skills / Workflows / Rules */}
      <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
            Instructions
          </span>
          <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)]">
            {INSTRUCTION_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setInstructionType(t.id)}
                className={`px-2.5 h-6 rounded-[5px] font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer ${
                  instructionType === t.id
                    ? 'bg-[var(--accent-light)]/40 text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="ml-auto h-6 px-2.5 rounded-md border border-[var(--accent-border)] text-[var(--accent)] hover:bg-[var(--accent-light)]/30 text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
          >
            {showAdd ? 'Close' : '+ Add'}
          </button>
        </div>

        {showAdd && (
          <div className="px-4 py-3 border-b border-[var(--border-primary)] space-y-2 bg-[var(--bg-main)]">
            <input
              value={addForm[instructionType].name}
              onChange={(e) => setAddForm((prev) => ({ ...prev, [instructionType]: { ...prev[instructionType], name: e.target.value } }))}
              placeholder="Name"
              className="w-full h-8 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:outline-none focus:border-[var(--accent-border)]"
            />
            <input
              value={addForm[instructionType].description}
              onChange={(e) => setAddForm((prev) => ({ ...prev, [instructionType]: { ...prev[instructionType], description: e.target.value } }))}
              placeholder="Description (optional)"
              className="w-full h-8 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2.5 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:outline-none focus:border-[var(--accent-border)]"
            />
            <textarea
              value={addForm[instructionType].instructions}
              onChange={(e) => setAddForm((prev) => ({ ...prev, [instructionType]: { ...prev[instructionType], instructions: e.target.value } }))}
              placeholder="Instructions the agent will follow…"
              rows={4}
              className="w-full rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2.5 py-2 font-mono text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:outline-none focus:border-[var(--accent-border)] resize-y"
            />
            <button
              onClick={() => void handleAddInstruction()}
              disabled={!addForm[instructionType].name.trim()}
              className="h-8 px-4 rounded-md bg-[var(--accent)] text-white text-[9px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-40 transition-all duration-100 cursor-pointer"
            >
              Save {instructionType}
            </button>
          </div>
        )}

        {currentInstructions.length === 0 ? (
          <div className="px-4 py-6 text-center font-mono text-[10px] text-[var(--text-secondary)]/50">
            No {instructionType}s configured. Add one, or drop markdown files into ~/.yzpzcode/agent/{instructionType}s.
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {currentInstructions.map((item) => (
              <div key={item.id} className="px-4 py-2 border-b border-[var(--border-primary)]/40 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] text-[var(--text-primary)]">
                    {item.name}
                    {item.description ? (
                      <span className="ml-2 text-[var(--text-secondary)]/60 text-[9px]">{item.description}</span>
                    ) : null}
                  </div>
                  <div className="font-mono text-[9px] text-[var(--text-secondary)]/40 truncate" title={item.filePath}>
                    {item.filePath}
                  </div>
                </div>
                <button
                  onClick={() => void handleToggleInstruction(item)}
                  className={`px-2 h-6 rounded-md border font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer shrink-0 ${
                    !item.disabled
                      ? 'border-emerald-900/50 text-emerald-500 bg-emerald-950/20'
                      : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.disabled ? 'Disabled' : 'Enabled'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provider configs */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Provider Credentials
            </h3>
            <p className="mt-1 font-mono text-[9px] text-[var(--text-secondary)]/50 leading-relaxed">
              Link as many providers as you like — the ★ default is used when creating a new agent. Keys are global and usable immediately from the Agent view.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleRefreshCatalogs()}
              disabled={catalogRefreshing || !status?.connected}
              title="Refresh model catalog from models.dev"
              aria-label="Refresh model catalog"
              className={`h-6 w-6 flex items-center justify-center rounded-md border border-[var(--border-primary)] text-[var(--text-secondary)] transition-colors duration-100 cursor-pointer disabled:opacity-40 disabled:cursor-default ${
                catalogRefreshing ? 'text-[var(--accent)]' : 'hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <ArrowClockwise
                size={14}
                className={catalogRefreshing ? 'animate-spin' : ''}
                aria-hidden="true"
              />
            </button>
            <div className="w-64 shrink-0">
              <AgentSelect
                value={selectedProvider}
                onChange={setSelectedProvider}
                searchPlaceholder="Search providers…"
                options={providers.map((p) => ({
                  value: p.id,
                  label: `${PROVIDER_DISPLAY[p.id] ?? p.name} (${p.id})${configuredIds.has(p.id) ? ' ✓' : ''}`,
                }))}
              />
            </div>
          </div>
        </div>

        {configs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/50">
              Linked:
            </span>
            {configs.map((cfg) => {
              const isDefault = defaultProviderId === cfg.providerId;
              const isSelected = cfg.providerId === selectedProvider;
              return (
                <div key={cfg.providerId} className="flex items-center">
                  <button
                    onClick={() => setSelectedProvider(cfg.providerId)}
                    title={hasSavedProviderAuth(cfg) ? 'Credentials saved' : 'Not linked'}
                    className={`px-2 h-6 rounded-l-md border font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer ${
                      isSelected
                        ? 'border-[var(--accent-border)] text-[var(--accent)] bg-[var(--accent-light)]/20'
                        : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {PROVIDER_DISPLAY[cfg.providerId] ?? cfg.providerId}
                    {hasSavedProviderAuth(cfg) ? <span className="text-emerald-500"> ✓</span> : <span className="text-[var(--text-secondary)]/40"> ○</span>}
                  </button>
                  <button
                    onClick={() => void handleSetDefault(isDefault ? null : cfg.providerId)}
                    title={isDefault ? 'Clear default provider' : 'Set as default provider'}
                    className={`h-6 px-1.5 border border-l-0 font-mono text-[10px] transition-colors duration-100 cursor-pointer ${
                      isSelected ? 'border-[var(--accent-border)]' : 'border-[var(--border-primary)]'
                    } ${isDefault ? 'text-amber-400' : 'text-[var(--text-secondary)]/40 hover:text-[var(--text-primary)]'}`}
                  >
                    {isDefault ? '★' : '☆'}
                  </button>
                  <button
                    onClick={() => void handleRemoveProvider(cfg.providerId)}
                    title="Unlink provider"
                    className={`h-6 px-1.5 rounded-r-md border border-l-0 font-mono text-[9px] text-[var(--text-secondary)]/40 hover:text-rose-500 transition-colors duration-100 cursor-pointer ${
                      isSelected ? 'border-[var(--accent-border)]' : 'border-[var(--border-primary)]'
                    }`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Selected provider editor */}
        <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/30 flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold text-[var(--text-primary)]">
              {PROVIDER_DISPLAY[selectedProvider] ?? selectedProvider}
            </span>
            <span className="font-mono text-[9px] text-[var(--text-secondary)]/50">{selectedProvider}</span>
            {defaultProviderId === selectedProvider && (
              <span className="px-1.5 h-4 rounded-sm bg-amber-400/15 text-amber-400 font-mono text-[8px] font-bold uppercase tracking-widest">
                ★ default
              </span>
            )}
            <span
              className={`ml-auto font-mono text-[9px] ${
                editorIsOAuth
                  ? oauthLinked
                    ? 'text-emerald-500'
                    : 'text-amber-400'
                  : selectedCfg && hasSavedProviderAuth(selectedCfg)
                    ? 'text-emerald-500'
                    : 'text-amber-400'
              }`}
            >
              {editorIsOAuth
                ? oauthBusy
                  ? 'signing in…'
                  : oauthLinked
                    ? 'linked'
                    : 'not linked'
                : selectedCfg && hasSavedProviderAuth(selectedCfg)
                  ? 'credentials set'
                  : 'not linked'}
            </span>
          </div>
          <div className="px-5 py-4 space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {editorIsOAuth ? (
                <div className="flex flex-col gap-3">
                  {!oauthLinked ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleSignInOAuth()}
                        disabled={oauthBusy}
                        className="h-8 px-3 rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)]/20 text-[var(--accent)] text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer hover:bg-[var(--accent-light)]/30 disabled:opacity-60 disabled:cursor-default"
                      >
                        {oauthStatus === 'opening-browser'
                          ? 'Opening browser…'
                          : oauthStatus === 'waiting-for-browser'
                            ? 'Waiting for browser…'
                            : 'Sign in with ChatGPT'}
                      </button>
                      <p className="font-mono text-[9px] text-[var(--text-secondary)]/50 leading-relaxed max-w-sm">
                        {oauthStatus === 'waiting-for-browser'
                          ? 'Complete ChatGPT sign-in in your browser. You’ll be redirected back here when it finishes.'
                          : 'Sign in with your ChatGPT (OpenAI Codex) subscription. A browser window will open — YzPzCode never sees your token.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500 font-mono text-[10px]">✓ Linked</span>
                        <span className="font-mono text-[10px] text-[var(--text-secondary)]/70">
                          as {oauthEmail ?? 'ChatGPT'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSignOutOAuth(selectedProvider)}
                        className="self-start h-6 px-2 rounded-md border border-rose-900/50 text-rose-500 hover:bg-rose-950/20 font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
                      >
                        Sign out
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <label className="space-y-1.5">
                  <span className="block font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/60">API Key</span>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <input
                        type={revealKey ? 'text' : 'password'}
                        value={selectedDraft.apiKey}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [selectedProvider]: { ...selectedDraft, apiKey: e.target.value } }))}
                        placeholder="sk-…"
                        autoComplete="off"
                        className="w-full h-8 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2.5 pr-8 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:outline-none focus:border-[var(--accent-border)]"
                      />
                      <button
                        type="button"
                        onClick={() => setRevealKey((v) => !v)}
                        title={revealKey ? 'Hide API key' : 'Reveal API key'}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors duration-100 cursor-pointer"
                      >
                        {revealKey ? (
                          <EyeSlash size={14} aria-hidden="true" />
                        ) : (
                          <Eye size={14} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                </label>
              )}
              <label className="space-y-1.5">
                <span className="block font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/60">
                  Base URL {isCustomBaseUrl ? '' : '(auto-filled)'}
                </span>
                <input
                  type="text"
                  value={selectedDraft.baseUrl}
                  readOnly={!isCustomBaseUrl}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [selectedProvider]: { ...selectedDraft, baseUrl: e.target.value } }))}
                  placeholder={selectedInfo?.baseUrl ?? 'https://api.example.com/v1'}
                  title={
                    isCustomBaseUrl
                      ? 'Custom/openai-compatible endpoint — enter the base URL'
                      : `Default endpoint for ${PROVIDER_DISPLAY[selectedProvider] ?? selectedProvider}`
                  }
                  className={`w-full h-8 rounded-md border px-2.5 text-[11px] bg-[var(--bg-main)] focus:outline-none ${
                    isCustomBaseUrl
                      ? 'border-[var(--border-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:border-[var(--accent-border)]'
                      : 'border-[var(--border-primary)]/40 text-[var(--text-secondary)]/70 cursor-default'
                  }`}
                />
              </label>
            </div>
            {oauthPrompt && editorIsOAuth && (
              <div className="md:col-span-2 rounded-md border border-[var(--accent-border)]/50 bg-[var(--accent-light)]/10 px-3 py-2.5 space-y-2">
                <p className="font-mono text-[9px] text-[var(--text-secondary)]/70 leading-relaxed">
                  {oauthPrompt.message}
                </p>
                <div className="flex items-end gap-2">
                  <input
                    value={promptAnswer}
                    onChange={(e) => setPromptAnswer(e.target.value)}
                    placeholder={oauthPrompt.defaultValue ?? 'Enter the code from the browser…'}
                    className="flex-1 h-7 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] px-2 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:outline-none focus:border-[var(--accent-border)]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleResolveOAuthPrompt()}
                    className="h-7 px-2.5 rounded-md bg-[var(--accent)] text-white text-[9px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity duration-100 cursor-pointer"
                  >
                    Submit
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setOauthPrompt(null); setPromptAnswer(''); }}
                    className="h-6 px-2 rounded-md border border-[var(--border-primary)] text-[var(--text-secondary)] font-mono text-[9px] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors duration-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <label className="flex-1 space-y-1.5">
                <span className="block font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/60">Default Model</span>
                <AgentSelect
                  value={selectedDraft.modelId}
                  onChange={(v) => setDraft((prev) => ({ ...prev, [selectedProvider]: { ...selectedDraft, modelId: v } }))}
                  disabled={models.length === 0}
                  placeholder={models.length === 0 ? 'No models loaded' : 'Select a model…'}
                  searchPlaceholder="Search models…"
                  options={models.map((m) => ({
                    value: m.id,
                    label: m.contextWindow ? `${m.name} (${Math.round(m.contextWindow / 1000)}k ctx)` : m.name,
                  }))}
                />
              </label>
              <button
                onClick={() => void handleSave()}
                disabled={saving === selectedProvider}
                className="h-8 px-5 rounded-md bg-[var(--accent)] text-white text-[9px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all duration-100 cursor-pointer mt-5"
              >
                {saving === selectedProvider ? 'Saving…' : 'Save'}
              </button>
              {savedFlash && <span className="font-mono text-[9px] text-emerald-500 shrink-0 mt-5">Saved ✓</span>}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-[10px] text-rose-500">
          {error}
        </div>
      )}

      {/* Attribution */}
      <div className="rounded-md border border-[var(--border-primary)]/60 bg-[var(--bg-tertiary)]/30 px-4 py-3">
        <p className="font-mono text-[9px] leading-relaxed text-[var(--text-secondary)]/60">
          YZPZ Agent runs 100% locally on your machine. Provider API keys are stored in ~/.yzpzcode/agent/providers.json and are
          never transmitted to YzPzCode servers. MCP servers live in the YZPZ Agent data dir
          (cline_mcp_settings.json). Skills, workflows, and rules live in
          ~/.yzpzcode/agent/{'{skills,workflows,rules}'} and apply to every workspace.
        </p>
      </div>
    </div>
  );
};
