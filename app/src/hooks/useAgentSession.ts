import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentHost } from './useAgentHost';
import { useAppStore } from '../stores/appStore';
import type {
  AgentAccumulatedUsage,
  AgentApprovalRequest,
  AgentMode,
  AgentQuestion,
  AgentSubAgentActivity,
  AgentTeamProgressSummary,
  AgentTodo,
} from '../types';

// ── Duck-typed Cline message shapes (from @cline/llms) ─────────────
export interface ClineMessage {
  role: 'user' | 'assistant';
  content: ClineContentBlock[];
  modelId?: string;
  providerId?: string;
}

export type ClineContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId?: string; content?: unknown; isError?: boolean }
  | { type: 'thinking' | 'reasoning'; text?: string; thinking?: string; content?: string }
  | { type: 'image'; source?: unknown; mediaType?: string; data?: string };

export type AgentPaneStatus = 'idle' | 'starting' | 'running' | 'done' | 'error';

export interface ToolLogEntry {
  id: string;
  name: string;
  input: unknown;
  startedAt: number;
  status: 'running' | 'done';
  result?: unknown;
  isError?: boolean;
}

export interface AgentSessionState {
  messages: ClineMessage[];
  streamingText: string;
  activeTool: { name: string; input: unknown } | null;
  toolLog: ToolLogEntry[];
  status: AgentPaneStatus;
  error: string | null;
  approvals: AgentApprovalRequest[];
  mode: AgentMode;
  usage: AgentAccumulatedUsage | null;
  aggregateUsage: AgentAccumulatedUsage | null;
  team: AgentTeamProgressSummary | null;
  subAgents: AgentSubAgentActivity[];
  todos: AgentTodo[];
  pendingQuestion: AgentQuestion | null;
  iterations: number;
  toolCount: number;
  providerId: string | null;
  modelId: string | null;
}

interface TeamProgressEvent {
  sessionId: string;
  teamName: string;
  summary: AgentTeamProgressSummary;
}

const extractString = (obj: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
  }
  return '';
};

const pick = (obj: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (key in obj) return obj[key];
  }
  return undefined;
};

const toNumber = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Strip runtime-injected XML wrappers from persisted user text. */
const cleanUserText = (text: string): string => {
  let t = text;
  t = t.replace(/<mode_notice\b[^>]*>[\s\S]*?<\/mode_notice>/gi, '');
  t = t.replace(/<user_input\b[^>]*>/gi, '');
  t = t.replace(/<\/user_input>/gi, '');
  t = t.replace(/<user_command\b[^>]*>/gi, '');
  t = t.replace(/<\/user_command>/gi, '');
  // Collapse HORIZONTAL whitespace only — never newlines. Fenced code blocks
  // rely on `\n`, so collapsing `\s+` here would flatten them into one line
  // after the transcript is re-read. Normalize line endings, strip trailing
  // spaces per line, and cap runs of blank lines instead.
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\r\n?/g, '\n');
  t = t.replace(/[ \t]+\n/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
};

/**
 * Reconstruct a clean, human-readable chat from the SDK's persisted transcript.
 * Strips mode-notice/user_input XML, collapses duplicate text blocks, and drops
 * internal runtime messages (empty user texts, system prompts, tool-only noise).
 */
const normalizeClineMessages = (raw: ClineMessage[]): ClineMessage[] => {
  const out: ClineMessage[] = [];
  for (const msg of raw) {
    if (msg.role === 'user') {
      const content: unknown = msg.content;
      let text = '';
      const toolResults: ClineContentBlock[] = [];
      if (typeof content === 'string') {
        text = cleanUserText(content);
      } else if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const b of content) {
          const block = b as ClineContentBlock;
          if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            parts.push(block.text);
          } else if (block.type === 'tool_result') {
            toolResults.push(block);
          }
        }
        text = cleanUserText(parts.join('\n'));
      }
      if (text) {
        out.push({ role: 'user', content: [{ type: 'text', text }] });
      } else if (toolResults.length > 0) {
        // Tool outputs arrive as `role: "user"` messages holding tool_result
        // blocks — keep them so the transcript still shows tool activity.
        out.push({ role: 'user', content: toolResults });
      }
      // empty/internal runtime messages are dropped
    } else if (msg.role === 'assistant') {
      const content: unknown = msg.content;
      const blocks = Array.isArray(content)
        ? (content as ClineContentBlock[])
            .map((b) => {
              if (b.type === 'text' && typeof b.text === 'string') {
                const cleaned = cleanUserText(b.text);
                return cleaned ? ({ type: 'text', text: cleaned } as ClineContentBlock) : null;
              }
              return b;
            })
            .filter((b): b is ClineContentBlock => b !== null)
        : typeof content === 'string' && content.trim()
          ? [{ type: 'text' as const, text: cleanUserText(content) }]
          : [];
      if (blocks.length === 0) continue;
      out.push({ role: 'assistant', content: blocks, providerId: msg.providerId, modelId: msg.modelId });
    }
    // system / tool-only roles are not rendered
  }
  return out;
};

export const useAgentSession = (
  sessionId: string | null,
  initial?: { providerId?: string | null; modelId?: string | null },
) => {
  const {
    sendMessage,
    abortSession,
    approveTool,
    readMessages,
    updateConnection: hostUpdateConnection,
    getUsage,
    answerQuestion: hostAnswerQuestion,
    onSessionEvent,
    onApprovalRequest,
    onSessionStatus,
    onSessionError,
    onSessionEnded,
    onApprovalResolved,
    onTeamProgress,
    onQuestionRequest,
    onTodoUpdated,
  } = useAgentHost();
  const removeAgentSessionForWorkspace = useAppStore((s) => s.removeAgentSessionForWorkspace);

  const [messages, setMessages] = useState<ClineMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<{ name: string; input: unknown } | null>(null);
  const [toolLog, setToolLog] = useState<ToolLogEntry[]>([]);
  const [status, setStatus] = useState<AgentPaneStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<AgentApprovalRequest[]>([]);
  const [mode, setMode] = useState<AgentMode>('act');
  const [usage, setUsage] = useState<AgentAccumulatedUsage | null>(null);
  const [aggregateUsage, setAggregateUsage] = useState<AgentAccumulatedUsage | null>(null);
  const [team, setTeam] = useState<AgentTeamProgressSummary | null>(null);
  const [subAgents, setSubAgents] = useState<AgentSubAgentActivity[]>([]);
  const [todos, setTodos] = useState<AgentTodo[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<AgentQuestion | null>(null);
  const [iterations, setIterations] = useState(0);
  const [toolCount, setToolCount] = useState(0);
  const [providerId, setProviderId] = useState<string | null>(initial?.providerId ?? null);
  const [modelId, setModelId] = useState<string | null>(initial?.modelId ?? null);
  const [thinkingEffort, setThinkingEffort] = useState<string | null>(null);

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // ── Message helpers ────────────────────────────────────────────────
  const appendAssistantText = useCallback((text: string, providerId?: string, modelId?: string) => {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.role === 'assistant') {
        const lastBlock = last.content[last.content.length - 1];
        if (lastBlock && lastBlock.type === 'text') {
          lastBlock.text += text;
          return copy;
        }
        last.content.push({ type: 'text', text });
        return copy;
      }
      copy.push({ role: 'assistant', content: [{ type: 'text', text }], providerId, modelId });
      return copy;
    });
  }, []);

  const finalizeStream = useCallback((providerId?: string, modelId?: string) => {
    setStreamingText((stream) => {
      const text = stream.trim();
      if (text) {
        appendAssistantText(text, providerId, modelId);
      }
      return '';
    });
    setActiveTool(null);
  }, [appendAssistantText]);

  /** Append a finalized reasoning/thinking block to the running assistant message. */
  const appendAssistantReasoning = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.role === 'assistant') {
        last.content.push({ type: 'reasoning', text: trimmed });
        return copy;
      }
      copy.push({ role: 'assistant', content: [{ type: 'reasoning', text: trimmed }] });
      return copy;
    });
  }, []);

  const finalizeThinking = useCallback(() => {
    setStreamingThinking((stream) => {
      const text = stream.trim();
      if (text) {
        appendAssistantReasoning(text);
      }
      return '';
    });
  }, [appendAssistantReasoning]);

  /** Clear live-render state (persisted history covers it after completion). */
  const resetLiveStream = useCallback(() => {
    setToolLog([]);
    setStreamingThinking('');
    setActiveTool(null);
  }, []);

  const refreshMessages = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      const msgs = (await readMessages(sid)) as ClineMessage[];
      if (Array.isArray(msgs) && msgs.length > 0) {
        setMessages(normalizeClineMessages(msgs));
      }
    } catch (err) {
      console.error('[agent] failed to read messages:', err);
    }
  }, [readMessages]);

  const refreshUsage = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      const summary = await getUsage(sid);
      setUsage(summary?.usage ?? null);
      setAggregateUsage(summary?.aggregateUsage ?? null);
    } catch (err) {
      console.error('[agent] failed to read usage:', err);
    }
  }, [getUsage]);

  const applyUsageDelta = useCallback((delta: Partial<AgentAccumulatedUsage>) => {
    setUsage((prev) => {
      const base = prev ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0 };
      return {
        inputTokens: base.inputTokens + toNumber(delta.inputTokens),
        outputTokens: base.outputTokens + toNumber(delta.outputTokens),
        cacheReadTokens: base.cacheReadTokens + toNumber(delta.cacheReadTokens),
        cacheWriteTokens: base.cacheWriteTokens + toNumber(delta.cacheWriteTokens),
        totalCost: base.totalCost + toNumber(delta.totalCost),
      };
    });
  }, []);

  // ── Event dispatch ─────────────────────────────────────────────────
  const handleAgentEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = extractString(event, ['type']);
      switch (type) {
        case 'content_start': {
          const contentType = extractString(event, ['contentType', 'content_type']);
          const toolName = extractString(event, ['toolName', 'tool_name']);
          if (contentType === 'tool' && toolName) {
            const toolInput = pick(event, ['toolInput', 'tool_input', 'input']);
            setActiveTool({ name: toolName, input: toolInput });
            const id = `t${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            setToolLog((prev) => [
              ...prev,
              { id, name: toolName, input: toolInput, startedAt: Date.now(), status: 'running' },
            ]);
            setToolCount((c) => c + 1);
          } else if (contentType === 'reasoning') {
            const reasoning = extractString(event, ['reasoning', 'text']);
            if (reasoning) setStreamingThinking((prev) => prev + reasoning);
          } else if (contentType === 'text') {
            const text = extractString(event, ['text']);
            if (text) setStreamingText((prev) => prev + text);
          }
          break;
        }
        case 'content_update': {
          const contentType = extractString(event, ['contentType', 'content_type']);
          const toolName = extractString(event, ['toolName', 'tool_name']);
          if (contentType === 'tool' && toolName) {
            const toolInput = pick(event, ['toolInput', 'tool_input', 'input', 'update']);
            setActiveTool((prev) => ({ name: toolName, input: toolInput ?? prev?.input }));
          } else if (contentType === 'reasoning') {
            const reasoning = extractString(event, ['reasoning', 'text']);
            if (reasoning) setStreamingThinking((prev) => prev + reasoning);
          } else {
            const text = extractString(event, ['text']);
            if (text) setStreamingText((prev) => prev + text);
          }
          break;
        }
        case 'content_end': {
          const contentType = extractString(event, ['contentType', 'content_type']);
          if (contentType === 'tool') {
            const output = pick(event, ['output', 'result']);
            const toolError = extractString(event, ['error']);
            setToolLog((prev) => {
              if (prev.length === 0) return prev;
              const copy = [...prev];
              const latest = copy[copy.length - 1];
              if (latest && latest.status === 'running') {
                copy[copy.length - 1] = {
                  ...latest,
                  status: 'done',
                  result: output,
                  isError: !!toolError || undefined,
                };
              }
              return copy;
            });
            setActiveTool(null);
          } else if (contentType === 'reasoning') {
            setStreamingThinking((prev) => {
              const text = prev.trim();
              if (text) appendAssistantReasoning(text);
              return '';
            });
          } else {
            setStreamingText((prev) => {
              const text = prev.trim();
              if (text) {
                const providerId = extractString(event, ['providerId', 'provider_id']) || undefined;
                const modelId = extractString(event, ['modelId', 'model_id']) || undefined;
                appendAssistantText(text, providerId, modelId);
              }
              return '';
            });
          }
          break;
        }
        case 'iteration_start':
          setIterations((i) => i + 1);
          setStatus('running');
          break;
        case 'usage':
        case 'usage-updated': {
          const usageObj = (pick(event, ['usage', 'delta']) ?? event) as Record<string, unknown>;
          applyUsageDelta({
            inputTokens: toNumber(usageObj.inputTokens),
            outputTokens: toNumber(usageObj.outputTokens),
            cacheReadTokens: toNumber(usageObj.cacheReadTokens),
            cacheWriteTokens: toNumber(usageObj.cacheWriteTokens),
            totalCost: toNumber(usageObj.totalCost ?? usageObj.cost),
          });
          break;
        }
        case 'notice': {
          const msg = extractString(event, ['message', 'notice']);
          if (msg) setNotice(msg);
          break;
        }
        case 'done': {
          finalizeStream(
            extractString(event, ['providerId', 'provider_id']) || undefined,
            extractString(event, ['modelId', 'model_id']) || undefined,
          );
          finalizeThinking();
          resetLiveStream();
          setStatus('done');
          setNotice(null);
          void refreshMessages();
          void refreshUsage();
          break;
        }
        case 'error': {
          finalizeStream();
          finalizeThinking();
          resetLiveStream();
          const msg = extractString(event, ['message', 'error']) || 'Agent error';
          setError(msg);
          setStatus('error');
          break;
        }
        default:
          break;
      }
    },
    [appendAssistantReasoning, appendAssistantText, applyUsageDelta, finalizeStream, finalizeThinking, resetLiveStream, refreshMessages, refreshUsage]
  );

  const modeRef = useRef(mode);
  modeRef.current = mode;

  // ── Subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(
      onSessionEvent(async (event) => {
        if (disposed) return;
        const payload = event.payload as { type: string; payload?: Record<string, unknown> };
        const payloadSessionId = (payload.payload as Record<string, unknown> | undefined)?.sessionId;
        if (payloadSessionId !== sessionIdRef.current) return;

        if (payload.type === 'agent_event') {
          const innerPayload = (payload.payload as Record<string, unknown>) ?? {};
          const inner = innerPayload.event as Record<string, unknown> | undefined;
          if (inner) {
            const teamRole = innerPayload.teamRole as 'lead' | 'teammate' | undefined;
            const teamAgentId = innerPayload.teamAgentId as string | undefined;
            if (teamRole && teamAgentId) {
              const toolName = extractString(inner, ['toolName', 'tool_name']);
              const type = extractString(inner, ['type']);
              if (toolName) {
                if (type.includes('start')) {
                  setSubAgents((prev) => {
                    const existing = prev.find((a) => a.agentId === teamAgentId);
                    const entry: AgentSubAgentActivity = {
                      agentId: teamAgentId,
                      role: teamRole,
                      task: toolName,
                      status: 'running',
                      ts: Date.now(),
                    };
                    const rest = existing ? prev.filter((a) => a.agentId !== teamAgentId) : prev;
                    return [entry, ...rest].slice(0, 20);
                  });
                } else if (type.includes('end') || type.includes('finish') || type.includes('result')) {
                  setSubAgents((prev) =>
                    prev.map((a) =>
                      a.agentId === teamAgentId && a.status === 'running' ? { ...a, status: 'done' } : a,
                    ),
                  );
                }
              }
            }
            handleAgentEvent(inner);
          }
        } else if (payload.type === 'status') {
          const st = extractString((payload.payload ?? {}) as Record<string, unknown>, ['status']);
          if (st === 'running' || st === 'working') setStatus('running');
        }
      })
    );
    unlisteners.push(
      onApprovalRequest((event) => {
        if (disposed) return;
        if (event.payload.sessionId !== sessionIdRef.current) return;
        setApprovals((prev) => [...prev.filter((a) => a.requestId !== event.payload.requestId), event.payload]);
        setStatus('running');
      })
    );
    unlisteners.push(
      onSessionStatus((event) => {
        if (disposed || event.payload.sessionId !== sessionIdRef.current) return;
        if (event.payload.status === 'running' || event.payload.status === 'working') {
          setStatus('running');
        } else if (event.payload.status === 'idle') {
          setStatus('idle');
        }
      })
    );
    unlisteners.push(
      onSessionError((event) => {
        if (disposed || event.payload.sessionId !== sessionIdRef.current) return;
        finalizeStream();
        finalizeThinking();
        resetLiveStream();
        setError(event.payload.error || 'Agent failed');
        setStatus('error');
        setNotice(null);
      })
    );
    unlisteners.push(
    onSessionEnded((event) => {
      if (disposed || event.payload.sessionId !== sessionIdRef.current) return;
      setStatus('done');
      setToolLog([]);
      setStreamingThinking('');
      setActiveTool(null);
      void refreshMessages();
      void refreshUsage();
    })
    );
    unlisteners.push(
      onApprovalResolved((event) => {
        if (disposed || event.payload.sessionId !== sessionIdRef.current) return;
        setApprovals((prev) => prev.filter((a) => a.requestId !== event.payload.requestId));
      })
    );
    unlisteners.push(
      onTeamProgress((event) => {
        if (disposed) return;
        const payload = event.payload as unknown as TeamProgressEvent;
        if (payload.sessionId !== sessionIdRef.current) return;
        setTeam(payload.summary ?? null);
      })
    );
    unlisteners.push(
      onQuestionRequest((event) => {
        if (disposed) return;
        if (event.payload.sessionId !== sessionIdRef.current) return;
        setPendingQuestion(event.payload);
        setStatus('running');
      })
    );
    unlisteners.push(
      onTodoUpdated((event) => {
        if (disposed) return;
        if (event.payload.sessionId !== sessionIdRef.current) return;
        setTodos(Array.isArray(event.payload.todos) ? event.payload.todos : []);
      })
    );

    void refreshMessages();
    void refreshUsage();

    return () => {
      disposed = true;
      void Promise.all(unlisteners).then((resolved) => resolved.forEach((unlisten) => unlisten()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Actions ────────────────────────────────────────────────────────
  const send = useCallback(
    async (prompt: string) => {
      const sid = sessionIdRef.current;
      if (!sid || !prompt.trim()) return;
      setError(null);
      setNotice(null);
      setStreamingText('');
      setStreamingThinking('');
      setToolLog([]);
      setStatus('running');
      appendUserMessage(prompt);
      try {
        const m = modeRef.current;
        const modeToSend = m === 'ask' ? 'ask' : m === 'plan' ? 'plan' : m === 'orchestrator' ? 'act' : undefined;
        await sendMessage(sid, prompt, modeToSend);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [sendMessage]
  );

  const appendUserMessage = useCallback((prompt: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: [{ type: 'text', text: prompt }] }]);
  }, []);

  const abort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await abortSession(sid);
    } catch (err) {
      console.error('[agent] abort failed:', err);
    }
    finalizeStream();
    setStatus('idle');
    setActiveTool(null);
    setToolLog([]);
    setStreamingThinking('');
  }, [abortSession, finalizeStream]);

  const approve = useCallback(
    async (requestId: string, approved: boolean, reason?: string) => {
      setApprovals((prev) => prev.filter((a) => a.requestId !== requestId));
      try {
        await approveTool(requestId, approved, reason);
      } catch (err) {
        console.error('[agent] approve failed:', err);
      }
    },
    [approveTool]
  );

  const answerQuestion = useCallback(
    async (requestId: string, answer: string) => {
      setPendingQuestion((prev) => (prev && prev.requestId === requestId ? null : prev));
      try {
        await hostAnswerQuestion(requestId, answer);
      } catch (err) {
        console.error('[agent] answer question failed:', err);
      }
    },
    [hostAnswerQuestion]
  );

  const updateConnection = useCallback(
    async (next: {
      providerId?: string;
      modelId?: string;
      apiKey?: string;
      baseUrl?: string;
      thinking?: boolean;
      reasoningEffort?: string;
      thinkingEffort?: string;
    }) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      if (next.providerId) setProviderId(next.providerId);
      if (next.modelId) setModelId(next.modelId);
      if (next.thinkingEffort !== undefined) setThinkingEffort(next.thinkingEffort);
      try {
        await hostUpdateConnection(sid, next);
      } catch (err) {
        console.error('[agent] update connection failed:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [hostUpdateConnection]
  );

  const removeSession = useCallback(
    (workspaceId: string) => {
      if (sessionIdRef.current) {
        removeAgentSessionForWorkspace(workspaceId, sessionIdRef.current);
      }
    },
    [removeAgentSessionForWorkspace]
  );

  return {
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
    send,
    abort,
    approve,
    answerQuestion,
    updateConnection,
    removeSession,
    refreshMessages,
    refreshUsage,
  };
};
