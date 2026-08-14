import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentHost } from './useAgentHost';
import { useAppStore } from '../stores/appStore';
import type {
  AgentAttachment,
  AgentAccumulatedUsage,
  AgentApprovalRequest,
  AgentMode,
  AgentQuestion,
  AgentSubAgentActivity,
  AgentSubAgentEvent,
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
  | { type: 'tool_use'; id: string; name: string; input: unknown; status?: 'running' | 'done'; result?: unknown; isError?: boolean }
  | { type: 'tool_result'; toolUseId?: string; content?: unknown; isError?: boolean }
  | { type: 'thinking' | 'reasoning'; text?: string; thinking?: string; content?: string }
  | { type: 'image'; source?: unknown; mediaType?: string; data?: string; name?: string; path?: string }
  | { type: 'attachment'; attachment: AgentAttachment };

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

export interface AgentCompactionStatus {
  phase: 'working' | 'completed' | 'skipped' | 'failed';
  tokensBefore?: number;
  tokensAfter?: number;
  messagesBefore?: number;
  messagesAfter?: number;
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
  contextTokens: number | null;
  compaction: AgentCompactionStatus | null;
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

/** Runtime adapters may send either a delta or the accumulated text on each event. */
const mergeStreamChunk = (previous: string, chunk: string, accumulated = ''): string => {
  if (accumulated) return accumulated;
  const isRepeatedMessage = chunk.trim().length > 24 && previous.includes(chunk);
  if (!chunk || previous.endsWith(chunk) || isRepeatedMessage) return previous;
  return previous + chunk;
};

const reasoningText = (block: ClineContentBlock | undefined): string => {
  if (!block || (block.type !== 'thinking' && block.type !== 'reasoning')) return '';
  return block.text ?? block.thinking ?? block.content ?? '';
};

const normalizedReasoningText = (text: string): string => text.replace(/\s+/g, ' ').trim();

const MAX_SUB_AGENT_EVENTS = 18;

const summarizeSubAgentEvent = (
  event: Record<string, unknown>,
): { kind: AgentSubAgentEvent['kind']; summary: string; status?: AgentSubAgentActivity['status']; isTask: boolean } => {
  const type = extractString(event, ['type']).toLowerCase();
  const toolName = extractString(event, ['toolName', 'tool_name', 'name']);
  const detail = extractString(event, ['text', 'content', 'message', 'thinking', 'reasoning', 'summary', 'error']);
  const conciseDetail = detail.replace(/\s+/g, ' ').trim().slice(0, 480);

  if (type.includes('error') || type.includes('fail')) {
    return { kind: 'status', summary: conciseDetail || 'Reported an error', status: 'error', isTask: false };
  }
  if (toolName) {
    const finished = type.includes('end') || type.includes('result') || type.includes('complete');
    return {
      kind: finished ? 'result' : 'tool',
      summary: `${finished ? 'Finished' : 'Using'} ${toolName}${conciseDetail ? ` — ${conciseDetail}` : ''}`,
      isTask: false,
    };
  }
  if (type.includes('think') || type.includes('reason')) {
    return { kind: 'reasoning', summary: conciseDetail || 'Reviewing the task', isTask: false };
  }
  if (type.includes('done') || type.includes('agent_end') || type.includes('task_end')) {
    return { kind: 'status', summary: conciseDetail || 'Completed assigned work', status: 'done', isTask: false };
  }
  if (type.includes('task') || type.includes('start')) {
    return { kind: 'status', summary: conciseDetail || 'Started assigned work', status: 'running', isTask: true };
  }
  return { kind: 'message', summary: conciseDetail || 'Working on assigned task', isTask: false };
};

/** Runtime and persisted transports can both report a finalized reasoning item. */
const isRepeatedReasoning = (previous: ClineContentBlock | undefined, next: ClineContentBlock): boolean => {
  const previousText = normalizedReasoningText(reasoningText(previous));
  const nextText = normalizedReasoningText(reasoningText(next));
  return Boolean(previousText && nextText && previousText === nextText);
};

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
      const rawBlocks = Array.isArray(content)
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
      const blocks = rawBlocks.filter((block, index) => {
        const precedingMessage = out[out.length - 1];
        const previous = index > 0
          ? rawBlocks[index - 1]
          : precedingMessage?.role === 'assistant'
            ? precedingMessage.content[precedingMessage.content.length - 1]
            : undefined;
        return !isRepeatedReasoning(previous, block);
      });
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
    onContextUpdated,
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
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  const [compaction, setCompaction] = useState<AgentCompactionStatus | null>(null);
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
  const activeToolIdRef = useRef<string | null>(null);
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

  /** Keep tool activity in the same chronological transcript as the prose. */
  const appendAssistantTool = useCallback((id: string, name: string, input: unknown) => {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      const block: ClineContentBlock = { type: 'tool_use', id, name, input, status: 'running' };
      if (last?.role === 'assistant') {
        copy[copy.length - 1] = { ...last, content: [...last.content, block] };
      } else {
        copy.push({ role: 'assistant', content: [block] });
      }
      return copy;
    });
  }, []);

  const updateAssistantTool = useCallback((id: string, updates: {
    input?: unknown;
    status?: 'running' | 'done';
    result?: unknown;
    isError?: boolean;
  }) => {
    setMessages((prev) => prev.map((message) => {
      if (message.role !== 'assistant') return message;
      const index = message.content.findIndex((block) => block.type === 'tool_use' && block.id === id);
      if (index < 0) return message;
      const content = [...message.content];
      content[index] = { ...content[index], ...updates } as ClineContentBlock;
      return { ...message, content };
    }));
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
        const nextBlock: ClineContentBlock = { type: 'reasoning', text: trimmed };
        const previousBlock = last.content[last.content.length - 1];
        if (isRepeatedReasoning(previousBlock, nextBlock)) return prev;
        copy[copy.length - 1] = { ...last, content: [...last.content, nextBlock] };
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
    activeToolIdRef.current = null;
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
      const noticeMetadata = (pick(event, ['metadata']) ?? {}) as Record<string, unknown>;
      const noticeMessage = extractString(event, ['message', 'notice']);
      const compactionPhase = extractString(noticeMetadata, ['phase']);
      const compactionText = `${type} ${noticeMessage}`.toLowerCase();
      if (compactionPhase || compactionText.includes('compacting') || compactionText.includes('compacted')) {
        const phase: AgentCompactionStatus['phase'] =
          compactionPhase === 'completed' || compactionText.includes('compacted')
            ? 'completed'
            : compactionPhase === 'skipped' || compactionText.includes('compaction-skipped')
              ? 'skipped'
              : compactionPhase === 'failed'
                ? 'failed'
                : 'working';
        setCompaction({
          phase,
          tokensBefore: toNumber(noticeMetadata.tokensBefore),
          tokensAfter: toNumber(noticeMetadata.tokensAfter),
          messagesBefore: toNumber(noticeMetadata.messagesBefore),
          messagesAfter: toNumber(noticeMetadata.messagesAfter),
        });
      }
      switch (type) {
        case 'content_start': {
          const contentType = extractString(event, ['contentType', 'content_type']);
          const toolName = extractString(event, ['toolName', 'tool_name']);
          if (contentType === 'tool' && toolName) {
            const toolInput = pick(event, ['toolInput', 'tool_input', 'input']);
            const id = `t${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            activeToolIdRef.current = id;
            setActiveTool({ name: toolName, input: toolInput });
            appendAssistantTool(id, toolName, toolInput);
            setToolLog((prev) => [
              ...prev,
              { id, name: toolName, input: toolInput, startedAt: Date.now(), status: 'running' },
            ]);
            setToolCount((c) => c + 1);
          } else if (contentType === 'reasoning') {
            const reasoning = extractString(event, ['reasoning', 'text']);
            const accumulated = extractString(event, ['accumulated']);
            if (reasoning) setStreamingThinking((prev) => mergeStreamChunk(prev, reasoning, accumulated));
          } else if (contentType === 'text') {
            const text = extractString(event, ['text']);
            const accumulated = extractString(event, ['accumulated']);
            if (text) setStreamingText((prev) => mergeStreamChunk(prev, text, accumulated));
          }
          break;
        }
        case 'content_update': {
          const contentType = extractString(event, ['contentType', 'content_type']);
          const toolName = extractString(event, ['toolName', 'tool_name']);
          if (contentType === 'tool' && toolName) {
            const toolInput = pick(event, ['toolInput', 'tool_input', 'input', 'update']);
            setActiveTool((prev) => ({ name: toolName, input: toolInput ?? prev?.input }));
            // Tool arguments stream after content_start in some SDK providers.
            // Keep the live activity card in sync so completed editor actions
            // retain their actual patch instead of an empty initial payload.
            if (toolInput !== undefined) {
              const id = activeToolIdRef.current;
              if (id) updateAssistantTool(id, { input: toolInput });
              setToolLog((prev) => {
                const copy = [...prev];
                const latest = copy[copy.length - 1];
                if (latest?.status === 'running' && latest.name === toolName) {
                  copy[copy.length - 1] = { ...latest, input: toolInput };
                }
                return copy;
              });
            }
          } else if (contentType === 'reasoning') {
            const reasoning = extractString(event, ['reasoning', 'text']);
            const accumulated = extractString(event, ['accumulated']);
            if (reasoning) setStreamingThinking((prev) => mergeStreamChunk(prev, reasoning, accumulated));
          } else {
            const text = extractString(event, ['text']);
            const accumulated = extractString(event, ['accumulated']);
            if (text) setStreamingText((prev) => mergeStreamChunk(prev, text, accumulated));
          }
          break;
        }
        case 'content_end': {
          const contentType = extractString(event, ['contentType', 'content_type']);
          if (contentType === 'tool') {
            const output = pick(event, ['output', 'result']);
            const toolError = extractString(event, ['error']);
            const id = activeToolIdRef.current;
            if (id) {
              updateAssistantTool(id, { status: 'done', result: output, isError: !!toolError || undefined });
            }
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
            activeToolIdRef.current = null;
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
          const msg = noticeMessage;
          // SDK compaction notices use concise machine labels such as
          // "auto-compacting". The dedicated lifecycle card is clearer and
          // keeps those internals out of the conversational timeline.
          if (msg && !compactionPhase && !compactionText.includes('compaction') && !compactionText.includes('compacting') && !compactionText.includes('compacted')) setNotice(msg);
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
    [appendAssistantReasoning, appendAssistantText, appendAssistantTool, applyUsageDelta, finalizeStream, finalizeThinking, resetLiveStream, refreshMessages, refreshUsage, updateAssistantTool]
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
              const activity = summarizeSubAgentEvent(inner);
              const now = Date.now();
              setSubAgents((prev) => {
                const existing = prev.find((agent) => agent.agentId === teamAgentId);
                const previousEvents = existing?.events ?? [];
                const lastEvent = previousEvents[previousEvents.length - 1];
                const isDuplicate = lastEvent?.kind === activity.kind && lastEvent.summary === activity.summary;
                const events = isDuplicate
                  ? previousEvents
                  : [...previousEvents, { id: `${teamAgentId}-${now}-${activity.kind}`, kind: activity.kind, summary: activity.summary, ts: now }].slice(-MAX_SUB_AGENT_EVENTS);
                const entry: AgentSubAgentActivity = {
                  agentId: teamAgentId,
                  role: teamRole,
                  task: activity.isTask ? activity.summary : existing?.task ?? activity.summary,
                  status: activity.status ?? existing?.status ?? 'running',
                  ts: now,
                  lastActivity: activity.summary,
                  events,
                };
                return [entry, ...prev.filter((agent) => agent.agentId !== teamAgentId)].slice(0, 20);
              });
              // Teammate output has its own inspector. Keeping it out of the
              // lead transcript prevents interleaved, hard-to-follow chat.
              if (teamRole === 'teammate') return;
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
    unlisteners.push(
      onContextUpdated((event) => {
        if (disposed || event.payload.sessionId !== sessionIdRef.current) return;
        setContextTokens(Number.isFinite(event.payload.totalTokens) ? event.payload.totalTokens : null);
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
    async (prompt: string, attachments: AgentAttachment[] = []) => {
      const sid = sessionIdRef.current;
      if (!sid || !prompt.trim()) return;
      setError(null);
      setNotice(null);
      setCompaction(null);
      setStreamingText('');
      setStreamingThinking('');
      setToolLog([]);
      activeToolIdRef.current = null;
      setStatus('running');
      appendUserMessage(prompt, attachments);
      try {
        const m = modeRef.current;
        const modeToSend = m === 'ask' ? 'ask' : m === 'plan' ? 'plan' : m === 'orchestrator' ? 'act' : undefined;
        await sendMessage(sid, prompt, modeToSend, attachments);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [sendMessage]
  );

  const appendUserMessage = useCallback((prompt: string, attachments: AgentAttachment[] = []) => {
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...attachments.map((attachment): ClineContentBlock => ({ type: 'attachment', attachment })),
        ],
      },
    ]);
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
      if (!sid) return false;
      if (next.providerId) setProviderId(next.providerId);
      if (next.modelId) setModelId(next.modelId);
      if (next.thinkingEffort !== undefined) setThinkingEffort(next.thinkingEffort);
      try {
        await hostUpdateConnection(sid, next);
        return true;
      } catch (err) {
        console.error('[agent] update connection failed:', err);
        setError(err instanceof Error ? err.message : String(err));
        return false;
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
