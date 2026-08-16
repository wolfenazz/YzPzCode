import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { AgentChat } from './AgentChat';
import { AgentInput } from './AgentInput';
import { AgentApprovalBar } from './AgentApprovalBar';
import { AgentSelect, type AgentSelectOption } from './AgentSelect';
import { AgentPaneMenu } from './AgentPaneMenu';
import { UsageMeter, contextPercent } from './UsageMeter';
import { ContextGauge } from './ContextGauge';
import { TeamProgressPanel } from './TeamProgressPanel';
import { McpStatusStrip } from './McpStatusStrip';
import { TodoPanel } from './TodoPanel';
import { useAgentSession } from '../../hooks/useAgentSession';
import { useAgentHost } from '../../hooks/useAgentHost';
import { useElementSize } from '../../hooks/useElementSize';
import { useAppStore } from '../../stores/appStore';
import type { AgentAttachment, AgentMcpServer, AgentMode, AgentModelInfo, AgentPaneUIMode, AgentProviderInfo, AgentSessionSummary } from '../../types';

interface AgentPaneProps {
  session: AgentSessionSummary;
  index: number;
  onClose: (sessionId: string) => void;
  onNewChat: (sessionId: string) => void;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  idle: { label: 'ready', color: 'text-[var(--text-secondary)]/60' },
  starting: { label: 'starting', color: 'text-[var(--accent)]' },
  running: { label: 'working', color: 'text-[var(--accent)] animate-pulse' },
  done: { label: 'complete', color: 'text-emerald-500' },
  error: { label: 'needs attention', color: 'text-rose-500' },
};

const MODE_ICON_META: Record<AgentMode, { icon: string; colorClass: string; glow: string }> = {
  ask: {
    icon: 'material-symbols:chat-bubble-rounded',
    colorClass: 'text-sky-400',
    glow: 'rgba(56, 189, 248, 0.5)',
  },
  act: {
    icon: 'material-symbols:bolt-rounded',
    colorClass: 'text-emerald-400',
    glow: 'rgba(52, 211, 153, 0.5)',
  },
  plan: {
    icon: 'material-symbols:checklist-rounded',
    colorClass: 'text-amber-400',
    glow: 'rgba(251, 191, 36, 0.5)',
  },
  orchestrator: {
    icon: 'material-symbols:hub-rounded',
    colorClass: 'text-violet-400',
    glow: 'rgba(167, 139, 250, 0.55)',
  },
};

const ModeIcon: React.FC<{ meta: { icon: string; colorClass: string; glow: string } }> = ({ meta }) => (
  <Icon
    icon={meta.icon}
    className={`h-4 w-4 animate-mode-icon ${meta.colorClass}`}
    style={{ '--icon-glow': meta.glow } as React.CSSProperties}
    aria-hidden="true"
  />
);

const MODE_ICON: Record<AgentMode, React.ReactNode> = {
  ask: <ModeIcon meta={MODE_ICON_META.ask} />,
  act: <ModeIcon meta={MODE_ICON_META.act} />,
  plan: <ModeIcon meta={MODE_ICON_META.plan} />,
  orchestrator: <ModeIcon meta={MODE_ICON_META.orchestrator} />,
};

// Responsive breakpoints (mirror how TTY panes re-fit to their grid cell).
const NARROW_WIDTH = 700;
const VERY_NARROW_WIDTH = 430;
const SHORT_HEIGHT = 440;
/** Below this pane width the floating task rail would cover too much chat, so
 *  it collapses to the one-tap edge tab instead. */
const TASK_OVERLAY_MIN_WIDTH = 640;

const MCP_POLL_MS = 10_000;
const OPENROUTER_PROVIDER_ID = 'openrouter';
const OPENROUTER_FREE_MODEL_ID = 'openrouter/free';

/** Supports a running pre-update harness until it is restarted. New harnesses
 * expose only `hasApiKey`; the legacy response included an `apiKey` field. */
const hasSavedProviderKey = (config: { hasApiKey?: boolean }): boolean =>
  config.hasApiKey === true ||
  (!Object.prototype.hasOwnProperty.call(config, 'hasApiKey') && Object.prototype.hasOwnProperty.call(config, 'apiKey'));

/**
 * Compact header control for model thinking effort. A small brain-icon button
 * labeled with the active effort opens a portal dropdown (via AgentPaneMenu) so
 * it fits the 28px pane header where the full-height AgentSelect would not.
 */
const EffortSelect: React.FC<{
  value: string;
  options: AgentSelectOption[];
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <button
        ref={anchorRef}
        onClick={() => setOpen((v) => !v)}
        title="Thinking effort"
        className={`electric-btn flex items-center gap-1 px-1.5 h-6 rounded-md border text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer shrink-0 ${
          open
            ? 'border-[var(--accent-border)] bg-[var(--accent-light)]/20 text-[var(--accent)]'
            : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
        }`}
      >
        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0013 19.5V20a1 1 0 01-1 1 1 1 0 01-1-1v-.5c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span>{selected ? selected.label : 'Default'}</span>
      </button>
      <AgentPaneMenu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} width={140}>
        <div className="p-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2 rounded-md transition-colors duration-75 cursor-pointer ${
                opt.value === value
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/60 hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && (
                <svg className="w-3 h-3 flex-shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </AgentPaneMenu>
    </>
  );
};

export const AgentPane: React.FC<AgentPaneProps> = ({ session, index, onClose, onNewChat }) => {
  const {
    messages,
    streamingText,
    streamingThinking,
    notice,
    activeTool,
    toolLog,
    status,
    error,
    approvals,
    mode,
    setMode,
    usage,
    contextTokens,
    compaction,
    aggregateUsage,
    team,
    subAgents,
    todos,
    pendingQuestion,
    iterations,
    toolCount,
    providerId,
    modelId,
    thinkingEffort,
    fastMode,
    setFastMode,
    queuedPrompts,
    send,
    abort,
    resendLastPrompt,
    approve,
    answerQuestion,
    updateConnection,
    removeQueuedPrompt,
    clearQueue,
  } = useAgentSession(session.sessionId, {
    providerId: session.providerId,
    modelId: session.modelId,
    mode: session.mode,
    fastMode: session.fastMode,
  });

  const { getProviders, getModels, listProviderConfigs, listMcpServers, updateTitle, setToolPolicy } = useAgentHost();
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [models, setModels] = useState<AgentModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());
  const [freeModeNotice, setFreeModeNotice] = useState<string | null>(null);
  const [switchingToFree, setSwitchingToFree] = useState(false);
  /** Provider/model in use before Free mode was toggled ON, so toggling OFF restores it. */
  const freeModePreviousRef = useRef<{ providerId: string | null; modelId: string | null } | null>(null);
  const [mcpServers, setMcpServers] = useState<AgentMcpServer[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const skipTitleCommitRef = useRef(false);

  // Per-pane UI density (defaults to minimal so new agent panes start relaxed).
  const agentPaneUIModes = useAppStore((s) => s.agentPaneUIModes);
  const setAgentPaneUIMode = useAppStore((s) => s.setAgentPaneUIMode);
  const showAgentReasoning = useAppStore((s) => s.showAgentReasoning);
  const setShowAgentReasoning = useAppStore((s) => s.setShowAgentReasoning);
  const agentSessionFontSize = useAppStore((s) => s.agentSessionFontSize);
  const agentInterfaceScale = useAppStore((s) => s.agentInterfaceScale);
  const updateAgentSessionForWorkspace = useAppStore((s) => s.updateAgentSessionForWorkspace);
  const uiMode: AgentPaneUIMode = agentPaneUIModes[session.sessionId] ?? 'minimal';
  const setUiMode = useCallback(
    (next: AgentPaneUIMode) => setAgentPaneUIMode(session.sessionId, next),
    [setAgentPaneUIMode, session.sessionId]
  );

  // Pane size drives responsive collapsing (like a TTY re-fitting its cell).
  const { ref: paneRef, width, height } = useElementSize<HTMLDivElement>();
  const availableWidth = width / (agentInterfaceScale / 100);
  const isNarrow = availableWidth > 0 && availableWidth < NARROW_WIDTH;
  const isVeryNarrow = availableWidth > 0 && availableWidth < VERY_NARROW_WIDTH;
  const isShort = height > 0 && height < SHORT_HEIGHT;

  // Load provider list once.
  useEffect(() => {
    let mounted = true;
    void getProviders()
      .then((p) => {
        if (mounted) setProviders(p);
      })
      .catch(() => undefined);
    void listProviderConfigs()
      .then((cfgs) => {
        if (mounted) setConfiguredProviders(new Set(cfgs.filter(hasSavedProviderKey).map((c) => c.providerId)));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [getProviders, listProviderConfigs]);

  // Load models whenever the selected provider changes.
  useEffect(() => {
    if (!providerId) return;
    let mounted = true;
    setModelsLoading(true);
    void getModels(providerId)
      .then((m) => {
        if (mounted) setModels(m);
      })
      .catch(() => {
        if (mounted) setModels([]);
      })
      .finally(() => {
        if (mounted) setModelsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [providerId, getModels]);

  // MCP server status: load on mount + poll every 10s.
  const refreshMcp = useCallback(async () => {
    setMcpLoading(true);
    try {
      const servers = await listMcpServers();
      setMcpServers(servers);
    } catch {
      // sidecar not ready — keep last state
    } finally {
      setMcpLoading(false);
    }
  }, [listMcpServers]);

  useEffect(() => {
    void refreshMcp();
    const id = window.setInterval(() => void refreshMcp(), MCP_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshMcp]);

  // Elapsed ticker while running.
  useEffect(() => {
    if (status === 'running' && !runStartedAtRef.current) {
      runStartedAtRef.current = Date.now();
      setElapsed(0);
    } else if (status !== 'running') {
      runStartedAtRef.current = null;
    }
    if (status !== 'running') return;
    const id = window.setInterval(() => {
      if (runStartedAtRef.current) setElapsed(Math.floor((Date.now() - runStartedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [status]);

  // ── Floating task rail lifecycle ─────────────────────────────────────
  // Appears over the chat (both minimal & full UI), plays its entrance when a
  // run starts, and collapses back with the completion animation once the
  // whole list is done.
  const allTasksDone = todos.length > 0 && todos.every((t) => t.status === 'completed');
  useEffect(() => {
    if (!allTasksDone) return undefined;
    // Give the emerald completion pulse time to read before sliding away.
    const id = window.setTimeout(() => setTasksOpen(false), 1500);
    return () => window.clearTimeout(id);
  }, [allTasksDone]);

  // Re-open the rail when a brand-new run begins (idle → working) so fresh
  // tasks animate in, without fighting the user if they collapse it mid-run.
  const wasIdleRef = useRef(true);
  useEffect(() => {
    if (status === 'running') {
      if (wasIdleRef.current) setTasksOpen(true);
      wasIdleRef.current = false;
    } else {
      wasIdleRef.current = true;
    }
  }, [status]);

  const handleSend = useCallback(
    async (prompt: string, attachments: AgentAttachment[] = []) => {
      await send(prompt, attachments);
      // Auto-title the session from the first real prompt so the pane header
      // and History list are human-readable without a rename.
      if (!session.title && messages.length === 0) {
        const title =
          prompt.replace(/\s+/g, ' ').trim().slice(0, 48) || 'New task';
        void updateTitle(session.sessionId, title)
          .then(() => {
            updateAgentSessionForWorkspace(session.workspaceId, session.sessionId, { title });
          })
          .catch(() => {
            updateAgentSessionForWorkspace(session.workspaceId, session.sessionId, { title });
          });
      }
    },
    [
      send,
      session.title,
      session.sessionId,
      session.workspaceId,
      messages.length,
      updateTitle,
      updateAgentSessionForWorkspace,
    ]
  );

  const handleRename = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      setEditingTitle(false);
      if (!trimmed || trimmed === (session.title || '')) {
        setTitleDraft(session.title || '');
        return;
      }
      setTitleDraft(trimmed);
      // Persist through the sidecar; update the grid/store locally regardless
      // so the pane label reflects the change even if persistence fails.
      void updateTitle(session.sessionId, trimmed)
        .then(() => {
          updateAgentSessionForWorkspace(session.workspaceId, session.sessionId, { title: trimmed });
        })
        .catch(() => {
          updateAgentSessionForWorkspace(session.workspaceId, session.sessionId, { title: trimmed });
        });
    },
    [session.title, session.sessionId, session.workspaceId, updateTitle, updateAgentSessionForWorkspace]
  );

  const handleAlwaysAllow = useCallback(
    (toolName: string, requestId: string) => {
      // Persist "always allow" through the sidecar's tool-policy store, then
      // approve the pending request so the agent proceeds immediately.
      void setToolPolicy(toolName, { autoApprove: true }).catch((err) => {
        console.error('[agent] failed to set tool policy:', err);
      });
      void approve(requestId, true);
    },
    [setToolPolicy, approve]
  );

  const handleProviderChange = useCallback(
    (next: string) => {
      setModels([]);
      void updateConnection({ providerId: next });
    },
    [updateConnection]
  );

  const handleModelChange = useCallback(
    (next: string) => {
      void updateConnection({ modelId: next });
    },
    [updateConnection]
  );

  /** True while the session is connected to the OpenRouter Free Models Router. */
  const isFreeActive = providerId === OPENROUTER_PROVIDER_ID && modelId === OPENROUTER_FREE_MODEL_ID;

  const handleFreeMode = useCallback(async () => {
    if (switchingToFree) return;
    const configs = await listProviderConfigs().catch(() => []);
    const savedProviders = new Set(configs.filter(hasSavedProviderKey).map((config) => config.providerId));
    setConfiguredProviders(savedProviders);

    // Toggle OFF: restore the connection that was in use before Free mode.
    if (isFreeActive) {
      const previous = freeModePreviousRef.current;
      const restored =
        previous && (previous.providerId || previous.modelId)
          ? previous
          : session.providerId || session.modelId
            ? { providerId: session.providerId, modelId: session.modelId }
            : null;
      freeModePreviousRef.current = null;
      if (!restored?.providerId && !restored?.modelId) {
        setFreeModeNotice('No previous connection to restore — pick a provider and model to leave Free mode.');
        return;
      }
      setSwitchingToFree(true);
      setFreeModeNotice(null);
      setModels([]);
      const switched = await updateConnection({
        providerId: restored.providerId ?? undefined,
        modelId: restored.modelId ?? undefined,
      });
      setSwitchingToFree(false);
      setFreeModeNotice(
        switched
          ? `Free mode is off — restored ${restored.providerId ?? 'previous provider'} · ${restored.modelId ?? 'previous model'}.`
          : 'Could not restore the previous connection. Choose a provider and model manually.'
      );
      return;
    }

    // Toggle ON.
    if (!savedProviders.has(OPENROUTER_PROVIDER_ID)) {
      setFreeModeNotice('Add an OpenRouter API key in the agent provider settings, then try Free mode again.');
      return;
    }
    // Remember what was in use so toggling off can restore it.
    freeModePreviousRef.current = { providerId, modelId };
    setSwitchingToFree(true);
    setFreeModeNotice(null);
    setModels([]);
    const switched = await updateConnection({
      providerId: OPENROUTER_PROVIDER_ID,
      modelId: OPENROUTER_FREE_MODEL_ID,
    });
    setSwitchingToFree(false);
    setFreeModeNotice(
      switched
        ? 'Free mode is active — OpenRouter will route this session to a compatible free model. Click again to restore your previous connection.'
        : 'Could not switch to Free mode. Check the OpenRouter provider connection and try again.'
    );
  }, [
    isFreeActive,
    listProviderConfigs,
    switchingToFree,
    updateConnection,
    providerId,
    modelId,
    session.providerId,
    session.modelId,
  ]);

  const handleAnswerQuestion = useCallback(
    (requestId: string, answer: string) => {
      void answerQuestion(requestId, answer);
    },
    [answerQuestion]
  );

  const teamHasActiveWork = mode === 'orchestrator' && (
    (team?.runs?.activeRunIds?.length ?? 0) > 0 || subAgents.some((agent) => agent.status === 'running')
  );
  const isWorking = status === 'running' || status === 'starting' || teamHasActiveWork;
  const statusMeta = isWorking
    ? { label: 'working', color: 'text-[var(--accent)] animate-pulse' }
    : STATUS_LABEL[status] ?? STATUS_LABEL.idle;
  const title = session.title || `YZPZ Agent ${index + 1}`;
  const providerName = providers.find((provider) => provider.id === providerId)?.name ?? providerId ?? session.providerId ?? 'Provider';
  const availableModels = providerId === OPENROUTER_PROVIDER_ID && !models.some((model) => model.id === OPENROUTER_FREE_MODEL_ID)
    ? [{ id: OPENROUTER_FREE_MODEL_ID, name: 'Free Models Router', contextWindow: null, maxOutput: null }, ...models]
    : models;
  const modelName = modelId === OPENROUTER_FREE_MODEL_ID
    ? 'Free Models Router'
    : availableModels.find((model) => model.id === modelId)?.name ?? modelId ?? session.modelId ?? 'Model';
  const connectionLabel = `${providerName} · ${modelName}`;
  const contextWindow = availableModels.find((m) => m.id === modelId)?.contextWindow ?? null;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  // Full mode keeps every control in the header; minimal mode moves them into
  // the "⋯" overflow menu and only shows a slim status line while active.
  const showHeaderExtras = uiMode === 'full' && !isNarrow;
  const inputCompact = uiMode === 'minimal' || isShort;
  const showSlimLine =
    uiMode === 'minimal' &&
    (isWorking || status === 'error' || !!error || approvals.length > 0 || !!activeTool);
  // Orchestrator work needs an always-visible activity surface. Replace the
  // otherwise-empty task rail with the teammate rail when there is enough
  // room, and keep a compact disclosure above the composer in narrow panes.
  const showTeamSidebar = mode === 'orchestrator' && width >= NARROW_WIDTH;
  const ctxPct = contextPercent(
    contextTokens === null ? usage : { inputTokens: contextTokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0 },
    contextWindow,
  );

  const providerOptions = providers.map((p) => ({
    value: p.id,
    label: configuredProviders.has(p.id) ? `${p.name} ✓` : p.name,
  }));
  const modelOptions = availableModels.map((m) => ({
    value: m.id,
    label: m.contextWindow ? `${m.name} (${Math.round(m.contextWindow / 1000)}k)` : m.name,
  }));

  const EFFORT_LABELS: Record<string, string> = {
    none: 'Off',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'X-High',
    max: 'Max',
  };
  const activeModel = availableModels.find((m) => m.id === modelId) ?? null;
  const modelCapabilities = activeModel?.capabilities ?? [];
  const supportsImages = modelCapabilities.length === 0 || modelCapabilities.some((capability) => /image|vision|multimodal/i.test(capability));
  const reasoningOptions = activeModel?.reasoningOptions ?? [];
  const effortOption = reasoningOptions.find((o) => o.type === 'effort');
  const hasReasoning = !!(activeModel?.capabilities ?? []).includes('reasoning') || reasoningOptions.length > 0;
  const effortValues: string[] = effortOption
    ? (effortOption.values ?? []).filter((v): v is string => typeof v === 'string' && v !== 'default')
    : hasReasoning
      ? ['minimal', 'low', 'medium', 'high']
      : [];
  const effortOptions = [
    { value: 'none', label: 'Off' },
    ...effortValues.map((v) => ({ value: v, label: EFFORT_LABELS[v] ?? v })),
  ];

  const handleEffortChange = useCallback(
    (next: string) => {
      if (next === 'none') {
        void updateConnection({ thinking: false, thinkingEffort: 'none' });
      } else {
        void updateConnection({ thinking: true, reasoningEffort: next, thinkingEffort: next });
      }
    },
    [updateConnection]
  );

  return (
    <div
      ref={paneRef}
      className={`premium-pane agent-pane-scale flex flex-col h-full w-full overflow-hidden ${isWorking ? 'premium-pane--active' : ''}`}
      style={{
        '--agent-interface-scale': agentInterfaceScale / 100,
        '--agent-session-text-size': `${agentSessionFontSize}px`,
      } as React.CSSProperties}
    >
      {/* Pane header */}
      <div className="premium-header flex items-center gap-1.5 px-2 py-1 select-none shrink-0">
        {/* UI density toggle: minimize / maximize the number of options */}
        <button
          onClick={() => setUiMode(uiMode === 'full' ? 'minimal' : 'full')}
          title={uiMode === 'full' ? 'Collapse controls (minimal UI)' : 'Expand controls (full UI)'}
          className="electric-btn w-5 h-5 flex items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-100 cursor-pointer shrink-0"
        >
          {uiMode === 'full' ? (
            <svg className="electric-icon w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
            </svg>
          ) : (
            <svg className="electric-icon w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>

        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (skipTitleCommitRef.current) {
                skipTitleCommitRef.current = false;
                return;
              }
              handleRename(titleDraft);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename(titleDraft);
              if (e.key === 'Escape') {
                skipTitleCommitRef.current = true;
                setEditingTitle(false);
                setTitleDraft(title);
              }
            }}
            maxLength={80}
            className="min-w-0 flex-1 max-w-[160px] md:max-w-[280px] h-6 rounded-md border border-[var(--accent-border)] bg-[var(--bg-main)] px-1.5 text-[11px] font-medium text-[var(--text-primary)] focus:outline-none"
            aria-label="Rename session"
          />
        ) : (
          <span
            className="group flex items-center gap-1 text-[11px] font-medium text-[var(--text-primary)] truncate min-w-0 flex-1 max-w-[160px] md:max-w-[280px] cursor-text"
            title={`${title} — double-click to rename`}
            onDoubleClick={() => {
              setTitleDraft(title);
              setEditingTitle(true);
            }}
          >
            {title}
            <svg
              className="w-3 h-3 shrink-0 text-[var(--text-secondary)]/50 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </span>
        )}
        {showHeaderExtras && <span className="hidden xl:inline-flex items-center gap-1 shrink-0">{MODE_ICON[mode]}</span>}
        {!showHeaderExtras && (
          <span
            className="min-w-0 max-w-[min(38vw,260px)] flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)]/45 px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-secondary)]"
            title={`Provider: ${providerName}\nModel: ${modelName}`}
            aria-label={`Provider ${providerName}; model ${modelName}`}
          >
            <Icon icon="material-symbols:memory-alt-rounded" className="h-3 w-3 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <span className="truncate">{connectionLabel}</span>
          </span>
        )}

        {/* Right-side controls */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0 min-w-0">
          {showHeaderExtras && (
            <>
              {iterations > 0 && (
                <span className="font-mono text-[9px] text-[var(--text-secondary)]/60 tabular-nums hidden md:inline" title="Iterations">
                  itr {iterations}
                </span>
              )}
              {toolCount > 0 && (
                <span className="font-mono text-[9px] text-[var(--text-secondary)]/60 tabular-nums hidden lg:inline" title="Tool calls">
                  tools {toolCount}
                </span>
              )}
              <span className="font-mono text-[9px] text-[var(--text-secondary)]/50 tabular-nums hidden sm:inline" title="Elapsed">
                {mm}:{ss}
              </span>
              <UsageMeter usage={usage} aggregateUsage={aggregateUsage} contextWindow={contextWindow} contextTokens={contextTokens} budget={session.maxTotalTokens ?? null} />
              <AgentSelect
                value={providerId ?? ''}
                onChange={handleProviderChange}
                searchPlaceholder="Search providers…"
                options={providerOptions}
              />
              <AgentSelect
                value={modelId ?? ''}
                onChange={handleModelChange}
                disabled={!providerId || modelsLoading || availableModels.length === 0}
                placeholder={modelsLoading ? 'Loading…' : 'Model'}
                searchPlaceholder="Search models…"
                options={modelOptions}
              />
              <button
                onClick={() => setShowAgentReasoning(!showAgentReasoning)}
                title={showAgentReasoning ? 'Hide reasoning/thinking blocks' : 'Show reasoning/thinking blocks'}
                className={`electric-btn w-5 h-5 flex items-center justify-center rounded-md border transition-colors duration-100 cursor-pointer shrink-0 ${
                  showAgentReasoning
                    ? 'border-[var(--accent-border)] bg-[var(--accent-light)]/20 text-[var(--accent)]'
                    : 'border-[var(--border-primary)] text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)]'
                }`}
              >
                {showAgentReasoning ? (
                  <svg className="electric-icon w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : (
                  <svg className="electric-icon w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                )}
              </button>
              {hasReasoning && effortValues.length > 0 && (
                <EffortSelect
                  value={thinkingEffort ?? 'default'}
                  onChange={handleEffortChange}
                  options={[
                    { value: 'default', label: 'Default' },
                    ...effortOptions,
                  ]}
                />
              )}
              {hasReasoning && effortValues.length === 0 && (
                <button
                  onClick={() => {
                    const enabled = thinkingEffort !== 'none';
                    void updateConnection({ thinking: !enabled, reasoningEffort: !enabled ? 'medium' : undefined });
                  }}
                  title="Toggle model thinking/reasoning"
                  className={`electric-btn px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded-md border cursor-pointer transition-colors duration-100 shrink-0 ${
                    thinkingEffort !== 'none'
                      ? 'border-[var(--accent-border)] bg-[var(--accent-light)]/20 text-[var(--accent)]'
                      : 'border-[var(--border-primary)] text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)]'
                  }`}
                >
                  Think {thinkingEffort !== 'none' ? 'On' : 'Off'}
                </button>
              )}
            </>
          )}
          {!isVeryNarrow && (
            <span className={`flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-widest ${statusMeta.color}`}>
              <span
                className={`premium-status-dot w-1.5 h-1.5 rounded-full shrink-0 ${
                  isWorking
                    ? 'bg-[var(--accent)]'
                    : status === 'error'
                      ? 'bg-rose-500'
                      : status === 'done'
                        ? 'bg-emerald-500'
                        : 'bg-[var(--text-secondary)]/40'
                }`}
              />
              {statusMeta.label}
            </span>
          )}
          {fastMode && (
            <span
              className="electric-chip font-mono text-[9px] font-bold uppercase tracking-widest rounded-md border px-1.5 py-0.5 shrink-0"
              title="Fast mode is ON — the agent skips extra thinking and works as fast as possible (toggle in ⋯ menu)."
            >
              <Icon icon="lucide:zap" className="electric-icon h-3 w-3" aria-hidden="true" />
              {!isVeryNarrow && <span>Fast</span>}
            </span>
          )}
          {error && uiMode === 'full' && !isVeryNarrow && (
            <span className="font-mono text-[9px] text-rose-500 truncate max-w-[100px]" title={error}>
              {error}
            </span>
          )}

          <button
            type="button"
            onClick={() => void handleFreeMode()}
            disabled={switchingToFree}
            title={
              isFreeActive
                ? 'Free mode is active. Click to switch back to your previous provider and model.'
                : 'Switch this session to OpenRouter Free Models Router (click again to restore your previous connection)'
            }
            className={`electric-btn h-6 flex items-center gap-1 rounded-md border px-1.5 text-[9px] font-bold uppercase tracking-wider transition-all duration-150 shrink-0 ${
              isFreeActive
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400'
            } ${switchingToFree ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
          >
            <Icon
              icon={switchingToFree ? 'svg-spinners:3-dots-fade' : 'material-symbols:bolt-rounded'}
              className="electric-icon h-3.5 w-3.5"
              aria-hidden="true"
            />
            {!isVeryNarrow && <span>{isFreeActive ? 'Free active' : 'Free mode'}</span>}
          </button>

          {/* Start a new chat (clears all context for this agent) */}
          <button
            onClick={() => onNewChat(session.sessionId)}
            className="electric-btn w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors duration-100 cursor-pointer"
            title="Start a new chat (clear context)"
          >
            <svg className="electric-icon w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h8m-4-4v8" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9 9 0 10-8.5-6L2 22l7.1-1.5a9 9 0 002.9.5z" />
            </svg>
          </button>

          {/* Overflow menu */}
          <button
            ref={menuAnchorRef}
            onClick={() => setMenuOpen((v) => !v)}
            className="electric-btn w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-100 cursor-pointer"
            title="More options"
          >
            <svg className="electric-icon w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
          <button
            onClick={() => onClose(session.sessionId)}
            className="electric-btn w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-100 cursor-pointer"
            title="Close agent"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {freeModeNotice && (
        <div
          role="status"
          className="shrink-0 flex items-center gap-2 px-2.5 py-1 border-b border-[var(--border-primary)] bg-emerald-500/[0.045] text-[10px] text-[var(--text-secondary)]"
        >
          <Icon icon={configuredProviders.has(OPENROUTER_PROVIDER_ID) ? 'material-symbols:verified-rounded' : 'material-symbols:info-rounded'} className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
          <span className="min-w-0 truncate">{freeModeNotice}</span>
          <button
            type="button"
            onClick={() => setFreeModeNotice(null)}
            className="ml-auto shrink-0 rounded p-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Dismiss"
            aria-label="Dismiss Free mode notice"
          >
            <Icon icon="material-symbols:close-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Slim status line (minimal mode, only while the agent is active) */}
      {showSlimLine && (
        <div className="shrink-0 flex items-center gap-2 px-2.5 py-1 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/25 select-none overflow-hidden">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isWorking
                ? 'bg-[var(--accent)] animate-pulse'
                : status === 'error'
                  ? 'bg-rose-500'
                  : 'bg-[var(--text-secondary)]/40'
            }`}
          />
          <span className={`font-mono text-[9px] font-bold uppercase tracking-widest shrink-0 ${statusMeta.color}`}>
            {statusMeta.label}
          </span>
          {activeTool && (
            <span className="flex items-center gap-1.5 text-[10px] text-[var(--accent)] shrink-0">
              <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-[var(--accent-border)] border-t-transparent animate-spin" />
              Working on your request
            </span>
          )}
          {error && (
            <span className="font-mono text-[9px] text-rose-500 truncate max-w-[140px] shrink-0" title={error}>
              {error}
            </span>
          )}
        </div>
      )}

      {/* Context window gauge — always visible because it is critical to track;
          collapses to a slim one-line readout in minimal mode or when the pane is short */}
      <ContextGauge usage={usage} aggregateUsage={aggregateUsage} contextWindow={contextWindow} contextTokens={contextTokens} slim={uiMode === 'minimal' || isShort} />

      {/* Linked MCP servers status (full mode; collapses to one chip when tight) */}
      {uiMode === 'full' && (
        <McpStatusStrip
          servers={mcpServers}
          loading={mcpLoading}
          onRefresh={() => void refreshMcp()}
          slim={isNarrow || isShort}
        />
      )}

      {/* The lead conversation keeps its own stable column. Orchestrator
          details live in a side rail rather than displacing the composer or
          flooding the transcript with teammate event noise. */}
      <div className="flex flex-1 min-h-0">
        <div className="flex min-w-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {/* The floating task rail layers on top of the chat (left gutter),
                so it never steals width from the conversation. It is available
                in both minimal and full UI modes. */}
            <div className="relative flex min-h-0 flex-1">
              <AgentChat
                messages={messages}
                streamingText={streamingText}
                streamingThinking={streamingThinking}
                activeTool={activeTool}
                toolLog={toolLog}
                isThinking={isWorking && !streamingText && !streamingThinking && !activeTool}
                notice={notice}
                compaction={compaction}
                pendingQuestion={pendingQuestion}
                onAnswerQuestion={handleAnswerQuestion}
                error={error}
                onContinue={() => void resendLastPrompt()}
                onSuggestion={(prompt) => void send(prompt)}
                completed={status === 'done' && messages.length > 0}
                elapsedSec={elapsed}
                toolCount={toolCount}
                composerOverlay
              />
              <TodoPanel
                todos={todos}
                open={tasksOpen && availableWidth >= TASK_OVERLAY_MIN_WIDTH}
                running={isWorking}
                onToggle={() => setTasksOpen((v) => !v)}
              />
              {/* The composer overlays the transcript rather than consuming a
                  solid footer. AgentChat reserves scroll room for it, while
                  transparent gaps between controls reveal the conversation. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
                <div className="pointer-events-auto">
                  <AgentInput
                    disabled={!session.sessionId}
                    isRunning={isWorking}
                    mode={mode}
                    onModeChange={setMode}
                    onSend={handleSend}
                    onAbort={abort}
                    placeholder={mode === 'ask' ? 'Ask a question about this project…' : undefined}
                    compact={inputCompact}
                    supportsImages={supportsImages}
                    fastMode={fastMode}
                    onToggleFastMode={() => void setFastMode(!fastMode)}
                    queuedPrompts={queuedPrompts}
                    onRemoveQueued={(id) => void removeQueuedPrompt(id)}
                    onClearQueue={() => void clearQueue()}
                  />
                </div>
              </div>
            </div>

            <AgentApprovalBar
              approvals={approvals}
              onApprove={(rid, ok) => void approve(rid, ok)}
              onAlwaysAllow={handleAlwaysAllow}
            />

            {mode === 'orchestrator' && !showTeamSidebar && (
              <TeamProgressPanel team={team} subAgents={subAgents} layout="inline" />
            )}

          </div>

          {showTeamSidebar && <TeamProgressPanel team={team} subAgents={subAgents} layout="sidebar" />}
        </div>
      </div>

      {/* Overflow menu: providers, models, usage, context, UI mode */}
      <AgentPaneMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuAnchorRef} width={300}>
        <div className="flex items-center justify-between px-2.5 h-8 border-b border-[var(--border-primary)] bg-[var(--bg-main)]">
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]/70">
            Agent Controls
          </span>
          <button
            onClick={() => setMenuOpen(false)}
            className="flex items-center justify-center w-5 h-5 rounded-sm text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
            title="Close"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-2 space-y-2">
          <button
            onClick={() => {
              setMenuOpen(false);
              onNewChat(session.sessionId);
            }}
            className="premium-btn-ghost w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border-[var(--accent-border)] bg-[var(--accent-light)]/15 hover:bg-[var(--accent-light)]/30 cursor-pointer text-left"
            title="Clear all context and start a fresh conversation"
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--accent)]">
              New chat
            </span>
            <span className="ml-auto font-mono text-[8px] text-[var(--text-secondary)]/50">
              clear context
            </span>
          </button>

          <button
            onClick={() => {
              setUiMode(uiMode === 'full' ? 'minimal' : 'full');
              setMenuOpen(false);
            }}
            className="premium-btn-ghost w-full flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-left"
            title={uiMode === 'full' ? 'Hide extra controls and focus on the chat' : 'Show all agent controls'}
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
              {uiMode === 'full' ? 'Collapse UI' : 'Expand UI'}
            </span>
            <span className="ml-auto font-mono text-[8px] text-[var(--text-secondary)]/50">
              {uiMode === 'full' ? 'relaxed view' : 'all controls'}
            </span>
          </button>

          <button
            onClick={() => {
              setShowAgentReasoning(!showAgentReasoning);
              setMenuOpen(false);
            }}
            className="premium-btn-ghost w-full flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-left"
            title="Show or hide the model's reasoning/thinking blocks in the chat"
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
              {showAgentReasoning ? 'Hide reasoning' : 'Show reasoning'}
            </span>
            <span className="ml-auto font-mono text-[8px] text-[var(--text-secondary)]/50">
              {showAgentReasoning ? 'on' : 'off'}
            </span>
          </button>

          <button
            onClick={() => {
              setTitleDraft(title);
              setEditingTitle(true);
              setMenuOpen(false);
            }}
            className="premium-btn-ghost w-full flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-left"
            title="Rename this session"
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
              Rename session
            </span>
            <span className="ml-auto font-mono text-[8px] text-[var(--text-secondary)]/50">
              double-click title
            </span>
          </button>

          <AgentSelect
            value={providerId ?? ''}
            onChange={handleProviderChange}
            searchPlaceholder="Search providers…"
            options={providerOptions}
          />
          <AgentSelect
            value={modelId ?? ''}
            onChange={handleModelChange}
            disabled={!providerId || modelsLoading || availableModels.length === 0}
            placeholder={modelsLoading ? 'Loading…' : 'Model'}
            searchPlaceholder="Search models…"
            options={modelOptions}
          />
          {hasReasoning && effortValues.length > 0 && (
            <AgentSelect
              value={thinkingEffort ?? 'default'}
              onChange={handleEffortChange}
              searchPlaceholder="Effort…"
              options={[
                { value: 'default', label: 'Default' },
                ...effortOptions,
              ]}
            />
          )}

          <UsageMeter usage={usage} aggregateUsage={aggregateUsage} contextWindow={contextWindow} contextTokens={contextTokens} budget={session.maxTotalTokens ?? null} />

          <div className="flex items-center justify-between px-1 font-mono text-[9px] text-[var(--text-secondary)]/60 tabular-nums">
            <span>iterations <b className="text-[var(--text-primary)]">{iterations}</b></span>
            <span>tools <b className="text-[var(--text-primary)]">{toolCount}</b></span>
            <span>elapsed <b className="text-[var(--text-primary)]">{mm}:{ss}</b></span>
          </div>

          <div className="flex items-center gap-2 px-1">
            <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--text-secondary)]/60 shrink-0">
              Context
            </span>
            <div className="flex-1 h-1 rounded-full bg-[var(--border-primary)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${Math.max(2, ctxPct)}%` }} />
            </div>
            <span className="font-mono text-[9px] tabular-nums text-[var(--text-secondary)] shrink-0">{ctxPct.toFixed(0)}%</span>
          </div>

          {error && (
            <div className="px-1 font-mono text-[9px] text-rose-500 break-words">{error}</div>
          )}
        </div>
      </AgentPaneMenu>
    </div>
  );
};
