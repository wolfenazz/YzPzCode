import React, { useEffect, useState, useCallback } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useAgentHost, CreateAgentSessionParams } from '../../hooks/useAgentHost';
import { AgentSelect } from './AgentSelect';
import type { AgentModelInfo, AgentProviderInfo } from '../../types';

interface NewAgentDialogProps {
  workspaceId: string;
  cwd: string;
  defaultProviderId?: string;
  defaultModelId?: string;
  onClose: () => void;
  onCreate: (params: CreateAgentSessionParams) => Promise<void>;
}

const PROVIDER_DISPLAY: Record<string, { name: string; needsBaseUrl: boolean }> = {
  anthropic: { name: 'Anthropic', needsBaseUrl: false },
  openai: { name: 'OpenAI', needsBaseUrl: false },
  openrouter: { name: 'OpenRouter', needsBaseUrl: false },
  google: { name: 'Google Gemini', needsBaseUrl: false },
  bedrock: { name: 'AWS Bedrock', needsBaseUrl: false },
  groq: { name: 'Groq', needsBaseUrl: false },
  cerebras: { name: 'Cerebras', needsBaseUrl: false },
  openai_compatible: { name: 'OpenAI-Compatible', needsBaseUrl: true },
};

/**
 * New Agent dialog. Uses saved credentials from Settings when available: the ★
 * default provider (or first saved provider), its saved model and API key, so
 * creating an agent normally requires just clicking "Create Agent".
 */
export const NewAgentDialog: React.FC<NewAgentDialogProps> = ({
  workspaceId,
  cwd,
  defaultProviderId,
  defaultModelId,
  onClose,
  onCreate,
}) => {
  const { getProviders, getModels, listProviderConfigs, setProviderConfig, getSettings, onCatalogUpdated } = useAgentHost();
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [models, setModels] = useState<AgentModelInfo[]>([]);
  const [providerId, setProviderId] = useState(defaultProviderId ?? 'anthropic');
  const [modelId, setModelId] = useState(defaultModelId ?? '');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxTotalTokens, setMaxTotalTokens] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [prov, configs, settings] = await Promise.all([getProviders(), listProviderConfigs(), getSettings()]);
        if (!mounted) return;
        setProviders(prov);

        // Pick the default provider: explicit prop > ★ default from settings > first saved > anthropic.
        const defaultId =
          defaultProviderId ??
          (settings?.global?.defaultProviderId ?? configs[0]?.providerId ?? 'anthropic');
        const cfg = configs.find((c) => c.providerId === defaultId);
        const info = prov.find((p) => p.id === defaultId);

        setProviderId(defaultId);
        setApiKey('');
        setBaseUrl(cfg?.baseUrl ?? '');
        setHasSavedKey(Boolean(cfg?.hasApiKey || cfg?.hasOAuth));
        setModelId(cfg?.modelId ?? info?.defaultModelId ?? '');
        // A saved default makes the normal path a one-field flow. Open the
        // connection controls only when the user still needs to configure it.
        setShowAdvanced(!cfg?.hasApiKey);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [getProviders, listProviderConfigs, getSettings, defaultProviderId]);

  useEffect(() => {
    let mounted = true;
    if (!providerId) return;
    setModels([]);
    void getModels(providerId)
      .then((m) => {
        if (!mounted) return;
        setModels(m);
        setModelId((cur) => {
          if (cur && m.some((x) => x.id === cur)) return cur;
          return m[0]?.id ?? '';
        });
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      mounted = false;
    };
  }, [providerId, getModels]);

  // While the dialog is open, refetch providers/models when the sidecar catalog
  // syncs so newly published models appear without reopening the dialog.
  useEffect(() => {
    let mounted = true;
    let unlisten: UnlistenFn | undefined;
    void onCatalogUpdated(() => {
      void getProviders()
        .then((p) => {
          if (mounted) setProviders(p);
        })
        .catch(() => undefined);
      if (providerId) {
        void getModels(providerId)
          .then((m) => {
            if (mounted) {
              setModels(m);
              setModelId((cur) => (cur && m.some((x) => x.id === cur) ? cur : m[0]?.id ?? ''));
            }
          })
          .catch(() => undefined);
      }
    }).then((u) => {
      if (mounted) unlisten = u;
      else void u();
    });
    return () => {
      mounted = false;
      void unlisten?.();
    };
  }, [onCatalogUpdated, getProviders, getModels, providerId]);

  const providerMeta = PROVIDER_DISPLAY[providerId] ?? { name: providerId, needsBaseUrl: false };
  const providerName = PROVIDER_DISPLAY[providerId]?.name ?? providerId;
  const selectedModel = models.find((model) => model.id === modelId);
  const modelName = selectedModel?.name ?? modelId;

  const handleProviderChange = useCallback((next: string) => {
    setProviderId(next);
    setApiKey('');
    setBaseUrl('');
    setHasSavedKey(false);
    setModelId('');
    void listProviderConfigs()
      .then((configs) => {
        const cfg = configs.find((c) => c.providerId === next);
        if (cfg) {
          setBaseUrl(cfg.baseUrl ?? '');
          setHasSavedKey(Boolean(cfg.hasApiKey || cfg.hasOAuth));
          setModelId(cfg.modelId ?? '');
        }
      })
      .catch(() => undefined);
  }, [listProviderConfigs]);

  const handleCreate = useCallback(async () => {
    if (!modelId) {
      setError('Select a model first.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // Persist credentials globally (~/.yzpzcode/agent/providers.json) so they
      // apply to every workspace, not just this session.
      if (apiKey.trim() || baseUrl.trim()) {
        await setProviderConfig(
          providerId,
          apiKey.trim() || undefined,
          baseUrl.trim() || undefined,
          modelId,
        );
      }
      await onCreate({
        workspaceId,
        cwd,
        providerId,
        modelId,
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        maxTotalTokens: maxTotalTokens > 0 ? maxTotalTokens : undefined,
        title: title.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }, [modelId, onCreate, workspaceId, cwd, providerId, apiKey, baseUrl, setProviderConfig, onClose, maxTotalTokens, title]);

  return (
    <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-center justify-center font-mono" onClick={onClose}>
      <div
        className="premium-surface w-[460px] max-w-[92vw] rounded-2xl border border-theme bg-[var(--bg-card)] shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-theme">
          <div>
            <h3 className="text-sm font-bold text-theme-main tracking-widest uppercase">New YZPZ Agent</h3>
            <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">Start with your saved setup. Change it only when you need to.</p>
          </div>
          <button onClick={onClose} className="premium-btn-icon p-1.5 text-[var(--text-secondary)] cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar premium-scrollbar">
          {loading ? (
            <div className="py-10 flex flex-col items-center gap-2.5 text-[var(--text-secondary)]">
              <svg className="animate-spin h-5 w-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-[10px] uppercase tracking-widest">Loading providers…</span>
            </div>
          ) : (
            <>
              <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${hasSavedKey ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-amber-900/50 bg-amber-950/20'}`}>
                <div className="min-w-0 flex items-center gap-2">
                  <svg className={`h-3.5 w-3.5 shrink-0 ${hasSavedKey ? 'text-emerald-500' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    {hasSavedKey ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 3h.01M10.3 3.9l-7.1 12.3A2 2 0 004.9 19h14.2a2 2 0 001.7-2.8l-7.1-12.3a2 2 0 00-3.4 0z" />}
                  </svg>
                  <div className="min-w-0">
                    <p className={`truncate text-[10px] font-medium ${hasSavedKey ? 'text-emerald-500' : 'text-amber-300'}`}>
                      {hasSavedKey ? 'Ready to start' : 'Connection needs an API key'}
                    </p>
                    <p className="truncate text-[9px] text-[var(--text-secondary)]">{providerName}{modelName ? ` · ${modelName}` : ''}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((visible) => !visible)}
                  className="shrink-0 text-[9px] font-bold text-[var(--accent)] hover:opacity-80 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded-sm cursor-pointer"
                  aria-expanded={showAdvanced}
                >
                  {showAdvanced ? 'Hide setup' : hasSavedKey ? 'Change setup' : 'Set up'}
                </button>
              </div>

              {showAdvanced && (
                <div className="space-y-4 border-l border-[var(--border-primary)] pl-3.5 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Customize setup</span>
                    <span className="h-px flex-1 bg-[var(--border-primary)]" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Provider</label>
                    <AgentSelect
                      value={providerId}
                      onChange={handleProviderChange}
                      searchPlaceholder="Search providers…"
                      options={providers.map((p) => ({
                        value: p.id,
                        label: PROVIDER_DISPLAY[p.id]?.name ?? p.name,
                      }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Model</label>
                    <AgentSelect
                      value={modelId}
                      onChange={setModelId}
                      disabled={models.length === 0}
                      placeholder="No models for provider"
                      searchPlaceholder="Search models…"
                      options={models.map((m) => ({
                        value: m.id,
                        label: m.contextWindow ? `${m.name} (${Math.round(m.contextWindow / 1000)}k context)` : m.name,
                      }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                      API Key {providerMeta.needsBaseUrl ? '(required)' : hasSavedKey ? '(saved)' : '(add a key)'}
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={hasSavedKey ? '•••••••••• Saved securely' : 'Paste your API key'}
                      className="premium-input h-9 px-2.5 text-[11px] text-theme-main placeholder:text-[var(--text-secondary)]/40"
                    />
                  </div>

                  {providerMeta.needsBaseUrl && (
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Base URL</label>
                      <input
                        type="text"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.example.com/v1"
                        className="premium-input h-9 px-2.5 text-[11px] text-theme-main placeholder:text-[var(--text-secondary)]/40"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Session name</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={80}
                        placeholder="Auto from task"
                        className="premium-input h-9 px-2.5 text-[11px] text-theme-main placeholder:text-[var(--text-secondary)]/40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Token limit</label>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={maxTotalTokens}
                        onChange={(e) => setMaxTotalTokens(Math.max(0, Number(e.target.value) || 0))}
                        placeholder="Unlimited"
                        aria-label="Token limit, zero for unlimited"
                        className="premium-input h-9 px-2.5 text-[11px] text-theme-main placeholder:text-[var(--text-secondary)]/40"
                      />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-md border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-[10px] text-rose-500">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-theme flex items-center justify-between gap-3">
          <span className="text-[9px] text-[var(--text-secondary)]/60">
            {hasSavedKey ? 'Uses your saved connection' : 'Your key is saved locally'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="premium-btn-ghost px-4 h-9 text-[10px] font-bold uppercase tracking-widest cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={creating || loading || !modelId}
              className="premium-btn-primary flex items-center gap-1.5 px-4 h-9 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 cursor-pointer"
            >
              {creating ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating…
                </>
              ) : (
                'Create Session'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
