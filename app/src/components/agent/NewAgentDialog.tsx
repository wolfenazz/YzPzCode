import React, { useEffect, useState, useCallback } from 'react';
import { useAgentHost, CreateAgentSessionParams } from '../../hooks/useAgentHost';
import { AgentSelect } from './AgentSelect';
import type { AgentModelInfo, AgentProviderInfo } from '../../types';

interface NewAgentDialogProps {
  workspaceId: string;
  cwd: string;
  defaultProviderId?: string;
  defaultModelId?: string;
  onClose: () => void;
  onCreate: (params: CreateAgentSessionParams & { initialPrompt?: string }) => Promise<void>;
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
/** Derive a short session title from the first non-empty line of a prompt. */
const deriveTitle = (prompt: string): string => {
  const line = prompt
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^#+\s*/, ''))
    .find((l) => l.length > 0);
  if (!line) return '';
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
};

export const NewAgentDialog: React.FC<NewAgentDialogProps> = ({
  workspaceId,
  cwd,
  defaultProviderId,
  defaultModelId,
  onClose,
  onCreate,
}) => {
  const { getProviders, getModels, listProviderConfigs, setProviderConfig, getSettings } = useAgentHost();
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
  const [initialPrompt, setInitialPrompt] = useState('');

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
        setHasSavedKey(Boolean(cfg?.hasApiKey));
        setModelId(cfg?.modelId ?? info?.defaultModelId ?? '');
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

  const providerMeta = PROVIDER_DISPLAY[providerId] ?? { name: providerId, needsBaseUrl: false };

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
          setHasSavedKey(Boolean(cfg.hasApiKey));
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
        title: title.trim() || deriveTitle(initialPrompt) || undefined,
        initialPrompt: initialPrompt.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }, [modelId, onCreate, workspaceId, cwd, providerId, apiKey, baseUrl, setProviderConfig, onClose, maxTotalTokens, title, initialPrompt]);

  return (
    <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-center justify-center font-mono" onClick={onClose}>
      <div
        className="w-[460px] max-w-[92vw] rounded-xl border border-theme bg-[var(--bg-card)] shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-theme">
          <div>
            <h3 className="text-sm font-bold text-theme-main tracking-widest uppercase">New YZPZ Agent</h3>
            <p className="text-[10px] text-[var(--text-secondary)]">Configure the agent harness provider</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="py-10 text-center text-[10px] uppercase tracking-widest text-[var(--text-secondary)] animate-pulse">
              Loading providers…
            </div>
          ) : (
            <>
              {/* Session label */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  Session Label <span className="normal-case tracking-normal opacity-60">(optional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Refactor auth flow"
                  className="w-full h-9 rounded-md border border-theme bg-[var(--bg-main)] px-2.5 text-[11px] text-theme-main placeholder:text-[var(--text-secondary)]/40 focus:outline-none focus:border-[var(--accent-border)]"
                />
              </div>

              {/* First task */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  First Task <span className="normal-case tracking-normal opacity-60">(optional — starts immediately)</span>
                </label>
                <textarea
                  value={initialPrompt}
                  onChange={(e) => setInitialPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe what this agent should work on first… leave empty for a blank chat"
                  className="w-full rounded-md border border-theme bg-[var(--bg-main)] px-2.5 py-2 text-[11px] text-theme-main placeholder:text-[var(--text-secondary)]/40 focus:outline-none focus:border-[var(--accent-border)] resize-y min-h-[60px] max-h-[160px] custom-scrollbar"
                />
              </div>

              {hasSavedKey && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-900/50 bg-emerald-950/20">
                  <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-mono text-[10px] text-emerald-500">
                    Using saved credentials for {PROVIDER_DISPLAY[providerId]?.name ?? providerId} ✓
                  </span>
                </div>
              )}

              {/* Provider */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Provider</label>
                <AgentSelect
                  value={providerId}
                  onChange={handleProviderChange}
                  searchPlaceholder="Search providers…"
                  options={providers.map((p) => ({
                    value: p.id,
                    label: `${PROVIDER_DISPLAY[p.id]?.name ?? p.name} (${p.id})`,
                  }))}
                />
              </div>

              {/* Model */}
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
                    label: m.contextWindow ? `${m.name} (${Math.round(m.contextWindow / 1000)}k ctx)` : m.name,
                  }))}
                />
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  API Key {providerMeta.needsBaseUrl ? '(required)' : hasSavedKey ? '(saved ✓ — optional)' : '(optional)'}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasSavedKey ? '•••••••••• (saved key)' : 'sk-…'}
                  className="w-full h-9 rounded-md border border-theme bg-[var(--bg-main)] px-2.5 text-[11px] text-theme-main placeholder:text-[var(--text-secondary)]/40 focus:outline-none focus:border-[var(--accent-border)]"
                />
              </div>

              {/* Base URL (openai-compatible) */}
              {providerMeta.needsBaseUrl && (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Base URL</label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full h-9 rounded-md border border-theme bg-[var(--bg-main)] px-2.5 text-[11px] text-theme-main placeholder:text-[var(--text-secondary)]/40 focus:outline-none focus:border-[var(--accent-border)]"
                  />
                </div>
              )}

              {/* Max total tokens budget (0 = unlimited) */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  Max Total Tokens (0 = unlimited)
                </label>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  value={maxTotalTokens}
                  onChange={(e) => setMaxTotalTokens(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0 = unlimited"
                  className="w-full h-9 rounded-md border border-theme bg-[var(--bg-main)] px-2.5 text-[11px] text-theme-main placeholder:text-[var(--text-secondary)]/40 focus:outline-none focus:border-[var(--accent-border)]"
                />
              </div>

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
            Keys are stored locally in ~/.yzpzcode/agent
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 h-9 rounded-md border border-theme text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[10px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={creating || loading || !modelId}
              className="px-4 h-9 rounded-md bg-[var(--accent)] text-white text-[10px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all duration-100 cursor-pointer"
            >
              {creating ? 'Starting…' : initialPrompt.trim() ? 'Create & Start' : 'Create Agent'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
