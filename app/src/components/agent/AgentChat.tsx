import React, { useId, useMemo, useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js';
import {
  ArrowClockwise,
  BookOpenText,
  BookmarkSimple,
  Bug,
  ChatCircle,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  ClockCountdown,
  Code,
  Copy,
  FileText,
  Flask,
  GitCommit,
  Image,
  PaperPlaneRight,
  Sparkle,
  Square,
  Stack,
  Translate,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { ClineContentBlock, ClineMessage, ToolLogEntry } from '../../hooks/useAgentSession';
import type { AgentCompactionStatus } from '../../hooks/useAgentSession';
import { DiffView, isEditTool } from './DiffView';
import { QuestionCard } from './QuestionCard';
import { parseUiEditRequest, UiEditRequestCard } from './UiEditRequestCard';
import {
  Conversation as AiConversation,
  ConversationContent as AiConversationContent,
  ConversationEmptyState as AiConversationEmptyState,
  ConversationScrollButton as AiConversationScrollButton,
} from '../ai-elements/conversation';
import { Message as AiMessage, MessageContent as AiMessageContent } from '../ai-elements/message';
import {
  Reasoning as AiReasoning,
  ReasoningContent as AiReasoningContent,
  ReasoningTrigger as AiReasoningTrigger,
} from '../ai-elements/reasoning';
import { Tool as AiTool, ToolContent as AiToolContent, ToolHeader as AiToolHeader } from '../ai-elements/tool';
import { useProjectMemory } from '../../hooks/useProjectMemory';
import { useAppStore } from '../../stores/appStore';
import logo from '../../assets/YzPzCodeLogo.png';
import type { AgentAttachment, AgentQuestion } from '../../types';

interface AgentChatProps {
  messages: ClineMessage[];
  streamingText: string;
  streamingThinking?: string;
  activeTool: { name: string; input: unknown } | null;
  toolLog?: ToolLogEntry[];
  isThinking?: boolean;
  notice?: string | null;
  compaction?: AgentCompactionStatus | null;
  pendingQuestion?: AgentQuestion | null;
  onAnswerQuestion?: (requestId: string, answer: string) => void;
  /** Last error from the current turn (auto-cleared when the agent resumes). */
  error?: string | null;
  /** One-click recovery: re-send the last user prompt. */
  onContinue?: () => void;
  /** Set when a running turn has been silent for longer than agentTimeout. */
  turnIdle?: { minutes: number } | null;
  /** Dismiss the idle warning and keep waiting. */
  onClearIdleTurn?: () => void;
  /** Stop the currently running (silent) turn. */
  onStopTurn?: () => void;
  /** Clickable example prompts shown when the conversation is empty. */
  onSuggestion?: (prompt: string) => void;
  /** True when the last run finished successfully (drives the done banner). */
  completed?: boolean;
  elapsedSec?: number;
  toolCount?: number;
  /** Reserves scroll room when the transparent composer overlays this chat. */
  composerOverlay?: boolean;
  onReply?: (text: string) => void;
}

const toolLabel = (name: string): string => {
  const map: Record<string, string> = {
    run_commands: 'Ran a command',
    read_files: 'Read project files',
    search_codebase: 'Searched the codebase',
    search_web: 'Searched the web',
    fetch_web: 'Checked a web page',
    fetch_web_content: 'Checked a web page',
    editor: 'Changed files',
    apply_patch: 'Changed files',
    write_file: 'Created or replaced a file',
    create_file: 'Created a file',
    create_directory: 'Created a folder',
    mkdir: 'Created a folder',
    delete_file: 'Deleted a file',
    rename_file: 'Moved a file',
    list_files: 'Looked through the project',
    skills: 'Used a skill',
    skill: 'Used a skill',
    todo_write: 'Updated the plan',
    ask_question: 'Needs your input',
  };
  return map[name] || name;
};

/**
 * Map raw harness/sidecar error strings to a plain-language explanation. The
 * original technical text stays visible in the card, but the headline/reason
 * the user reads should say what happened and reassure that work is safe.
 */
const humanizeAgentError = (raw: string): string => {
  const low = raw.toLowerCase();
  if (low.includes('upgrade_required') || (low.includes('command code') && low.includes('403'))) {
    return 'Command Code API access is not enabled for this account. Use a GOAT, Pro, Max, Team, or Provider plan, then continue.';
  }
  if (low.includes('cmd_zdr_no_providers') || (low.includes('command code') && low.includes('422'))) {
    return 'This Command Code model is unavailable with zero-data retention. Switch models or disable CMD_ZDR, then continue.';
  }
  if (low.includes('unsupported_model') || low.includes('wrong endpoint')) {
    return 'This model does not match the selected provider endpoint. Refresh models, then use Command Code for non-Claude models or Command Code · Claude for Claude models.';
  }
  if (low.includes('unknown or disabled provider')) {
    return 'The selected provider is visible in the catalog but is not loaded by the running agent engine. Restart YzPzCode to reload the provider runtime, then continue.';
  }
  if (low.includes('rate') || low.includes('429') || low.includes('too many requests')) {
    return 'The model provider is rate-limiting requests or a usage window has been reached. Wait for the window to reset, add credits, or switch models; your work is safe.';
  }
  if (low.includes('unauthorized') || low.includes('401') || low.includes('invalid api key') || low.includes('authentication')) {
    return 'The model provider rejected the connection — likely an expired or invalid API key. Check your provider settings, then continue.';
  }
  if (low.includes('econnrefused') || low.includes('econnreset') || low.includes('network') || low.includes('fetch failed') || low.includes('socket')) {
    return 'The connection to the model provider dropped. Your work and conversation are safe — continue to resume.';
  }
  if (low.includes('timeout') || low.includes('timed out')) {
    return 'The model provider didn\u2019t respond in time. Your work and conversation are safe — continue to resume.';
  }
  if (low.includes('sidecar') || low.includes('disconnected') || low.includes('ws ') || low.includes('websocket')) {
    return 'The agent engine connection dropped. It reconnects automatically — if it doesn\u2019t, press Continue below.';
  }
  if (low.includes('balance') || low.includes('insufficient') || low.includes('quota')) {
    return 'The model provider reported insufficient balance or quota. Top up or switch providers, then continue.';
  }
  if (low.includes('context length') || low.includes('context window') || low.includes('max tokens') || low.includes('tokens')) {
    return 'The conversation outgrew the model\u2019s context window. The agent will try to compact it — continue when ready.';
  }
  return 'The agent hit a hiccup while working. Your work and conversation are safe — continue to resume.';
};

const formatToolResult = (content: unknown): string => {
  if (content == null) return '';
  if (Array.isArray(content)) {
    const parts = content
      .map((c) => (typeof c === 'string' ? c : (c as { text?: string })?.text ?? ''))
      .filter(Boolean);
    if (parts.length > 0) return parts.join('\n').slice(0, 20000);
  }
  const str = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  return str.length > 20000 ? `${str.slice(0, 20000)}\n… (truncated)` : str;
};

const asImageSource = (value: string, mediaType?: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^data:image\//i.test(trimmed) || /^https?:\/\//i.test(trimmed)) return trimmed;
  if (mediaType && /^image\//i.test(mediaType)) return `data:${mediaType};base64,${trimmed}`;
  return null;
};

/** Extract image outputs from provider-native and tool-result shapes. */
const collectImageSources = (value: unknown, output: string[] = [], seen = new Set<unknown>()): string[] => {
  if (output.length >= 8 || value == null) return output;
  if (typeof value === 'string') {
    const source = asImageSource(value);
    if (source && !output.includes(source)) output.push(source);
    return output;
  }
  if (typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageSources(item, output, seen));
    return output;
  }

  const record = value as Record<string, unknown>;
  const mediaType = typeof record.mediaType === 'string'
    ? record.mediaType
    : typeof record.media_type === 'string'
      ? record.media_type
      : typeof record.mimeType === 'string'
        ? record.mimeType
        : typeof record.mime_type === 'string'
          ? record.mime_type
          : undefined;
  const inferredMediaType = mediaType ?? (
    typeof record.type === 'string' && /image/i.test(record.type) ? 'image/png' : undefined
  );
  const directData = record.data;
  if (typeof directData === 'string') {
    const source = asImageSource(directData, inferredMediaType);
    if (source && !output.includes(source)) output.push(source);
  } else if (directData && typeof directData === 'object') {
    collectImageSources(directData, output, seen);
  }
  for (const key of ['image_url', 'imageUrl', 'url', 'output', 'result', 'content', 'images', 'b64_json', 'base64']) {
    if (!(key in record)) continue;
    const nested = record[key];
    const source = typeof nested === 'string' && inferredMediaType && ['output', 'result', 'b64_json', 'base64'].includes(key)
      ? asImageSource(nested, inferredMediaType)
      : null;
    if (source && !output.includes(source)) output.push(source);
    else collectImageSources(nested, output, seen);
  }
  return output;
};

const GeneratedImageBlock = React.memo(function GeneratedImageBlock({ source, label = 'Generated image' }: { source: string; label?: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-[var(--accent-border)]/70 bg-[var(--bg-tertiary)]/35 shadow-[0_8px_24px_-18px_var(--accent)]">
      <img src={source} alt={label} loading="lazy" className="max-h-96 w-full max-w-[520px] object-contain" />
      <figcaption className="flex items-center gap-1.5 border-t border-[var(--accent-border)]/45 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/70">
        <Image size={12} className="text-[var(--accent)]" aria-hidden="true" />
        {label}
      </figcaption>
    </figure>
  );
});

const isRemoteImageUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(url.pathname + url.search);
  } catch {
    return false;
  }
};

const RemoteImageCard: React.FC<{ src?: string; alt?: string }> = ({ src, alt = 'Image from the agent' }) => {
  if (!src || !isRemoteImageUrl(src)) return <span>{alt}</span>;
  return (
    <figure className="agent-remote-image group my-3 max-w-[min(100%,620px)] overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)]/45 shadow-[0_14px_34px_-24px_rgba(0,0,0,0.7)]">
      <a href={src} target="_blank" rel="noreferrer" className="block" title="Open image in a new window">
        <img src={src} alt={alt} loading="lazy" className="block max-h-[460px] w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]" />
      </a>
      <figcaption className="flex items-center gap-2 border-t border-[var(--border-primary)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-secondary)]/75">
        <Image size={13} className="shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <span className="truncate">Image · click to open full size</span>
      </figcaption>
    </figure>
  );
};

const markdownPlugins = [remarkGfm, remarkMath];
const markdownRehype = [rehypeKatex];

const hasArabicText = (text: string): boolean => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

const richTextDirection = (text: string): { dir: 'rtl' | 'auto'; lang?: string } =>
  hasArabicText(text) ? { dir: 'rtl', lang: 'ar' } : { dir: 'auto' };

const invokeErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
};

const TRANSLATION_LANGUAGES = [
  { code: 'ar', label: 'Arabic' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'tr', label: 'Turkish' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ja', label: 'Japanese' },
] as const;

type TranslationLanguageCode = (typeof TRANSLATION_LANGUAGES)[number]['code'];

const TranslatableAgentText: React.FC<{ text: string }> = ({ text }) => {
  const languageControlId = useId();
  const [targetLanguage, setTargetLanguage] = useState<TranslationLanguageCode>(hasArabicText(text) ? 'en' : 'ar');
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [remembered, setRemembered] = useState(false);
  const { writeMemoryNote } = useProjectMemory();

  const remember = async (): Promise<void> => {
    if (remembered) return;
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!snippet) return;
    const ok = await writeMemoryNote(snippet);
    if (ok) {
      setRemembered(true);
      window.setTimeout(() => setRemembered(false), 1800);
    }
  };

  const selectedLanguage = TRANSLATION_LANGUAGES.find((language) => language.code === targetLanguage);

  const translate = async (): Promise<void> => {
    if (isTranslating) return;
    setIsTranslating(true);
    setTranslationError(null);
    try {
      setTranslation(await invoke<string>('translate_text', { text, targetLanguage }));
    } catch (error) {
      setTranslationError(invokeErrorMessage(error, 'Could not translate this response.'));
    } finally {
      setIsTranslating(false);
    }
  };

  const copyResponse = async (): Promise<void> => {
    setCopyError(null);

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyError('Could not copy this response.');
    }
  };

  return (
    <div className="agent-rich-text text-[length:var(--agent-session-text-size)] leading-relaxed text-[var(--text-primary)] markdown-body animate-fade-in-up">
      <div {...richTextDirection(text)}>
        <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={markdownRehype} components={markdownComponents}>
          {text}
        </ReactMarkdown>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 not-prose">
        <label className="sr-only" htmlFor={languageControlId}>Translation language</label>
        <select
          id={languageControlId}
          value={targetLanguage}
          onChange={(event) => setTargetLanguage(event.target.value as TranslationLanguageCode)}
          disabled={isTranslating}
          aria-label="Translation language"
          className="h-6 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1.5 font-mono text-[9px] text-[var(--text-secondary)] outline-none transition-colors hover:border-[var(--accent-border)] focus:border-[var(--accent-border)] disabled:opacity-50"
        >
          {TRANSLATION_LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>{language.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void translate()}
          disabled={isTranslating}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 font-mono text-[9px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)]/15 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          title={`Translate this section to ${selectedLanguage?.label ?? targetLanguage}`}
        >
          {isTranslating ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <Translate size={14} />}
          {isTranslating ? 'Translating' : 'Translate'}
        </button>
        <button
          type="button"
          onClick={() => void copyResponse()}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 font-mono text-[9px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)]/15 hover:text-[var(--accent)]"
          title={copied ? 'Copied agent response' : 'Copy agent response'}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => void remember()}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 font-mono text-[9px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)]/15 hover:text-[var(--accent)]"
          title={remembered ? 'Saved to project memory' : 'Save this response to project memory (.yzpzcode/memory.md)'}
        >
          {remembered ? <Check size={14} /> : <BookmarkSimple size={14} />}
          {remembered ? 'Remembered' : 'Remember'}
        </button>
      </div>

      {translationError && (
        <p className="mt-1.5 font-mono text-[9px] text-rose-400 not-prose" role="status">{translationError}</p>
      )}

      {copyError && (
        <p className="mt-1.5 font-mono text-[9px] text-rose-400 not-prose" role="status">{copyError}</p>
      )}

      {translation && (
        <section className="mt-2 rounded-lg border border-[var(--accent-border)]/35 bg-[var(--accent-light)]/[0.06] px-3 py-2.5 not-prose">
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">
            <Translate size={14} className="text-[var(--accent)]" aria-hidden="true" />
            Translated to {selectedLanguage?.label}
            <button
              type="button"
              onClick={() => setTranslation(null)}
              className="ml-auto text-[var(--text-secondary)]/60 transition-colors hover:text-[var(--text-primary)]"
              title="Hide translation"
              aria-label="Hide translation"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="agent-rich-text text-[length:var(--agent-session-text-size)] leading-relaxed text-[var(--text-primary)] markdown-body" {...richTextDirection(translation)}>
            <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={markdownRehype} components={markdownComponents}>
              {translation}
            </ReactMarkdown>
          </div>
        </section>
      )}
    </div>
  );
};

/** Render fenced ```mermaid blocks as live diagrams (lazy-loaded). */
const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSource, setShowSource] = useState(false);
  const renderId = useRef(`mmd-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSvg(null);
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        const isLight =
          typeof document !== 'undefined' && document.documentElement.classList.contains('light-theme');
        mermaid.initialize({
          startOnLoad: false,
          theme: isLight ? 'neutral' : 'dark',
          securityLevel: 'loose',
          themeVariables: {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          },
        });
        const rendered = await mermaid.render(renderId.current, code);
        if (cancelled) return;
        const svgString =
          typeof rendered === 'string' ? rendered : ((rendered as { svg?: string }).svg ?? '');
        setSvg(svgString);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (showSource) {
    return (
    <div className="premium-surface rounded-xl overflow-hidden my-2">
      <div className="flex items-center justify-between px-2.5 py-1 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)]">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]/70">
          mermaid
        </span>
        <button
          onClick={() => setShowSource(false)}
            className="font-mono text-[8px] text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)] cursor-pointer"
          >
            Render diagram
          </button>
        </div>
        <pre className="p-2.5 overflow-x-auto bg-[var(--bg-main)]">
          <code className="font-mono text-[10.5px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="premium-surface rounded-xl overflow-hidden my-2">
      <div className="flex items-center justify-between px-2.5 py-1 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)]">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]/70">
          mermaid
        </span>
        {error ? (
          <span className="font-mono text-[8px] text-rose-500">render failed</span>
        ) : (
          <button
            onClick={() => setShowSource(true)}
            className="font-mono text-[8px] text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)] cursor-pointer"
          >
            View source
          </button>
        )}
      </div>
      <div className="p-2.5 overflow-x-auto">
        {loading ? (
          <div className="flex items-center gap-2 py-3 font-mono text-[9px] text-[var(--text-secondary)]/50 animate-pulse">
            <span className="w-3 h-3 rounded-full border-[1.5px] border-[var(--accent-border)] border-t-transparent animate-spin" />
            rendering diagram…
          </div>
        ) : error ? (
          <div className="space-y-1.5">
            <div className="font-mono text-[9px] text-rose-500">{error}</div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-[var(--text-secondary)]">{code}</pre>
          </div>
        ) : svg ? (
          <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : null}
      </div>
    </div>
  );
};

/** Long snippets collapse to a scrollable window with an expand toggle. */
const EXPAND_LINE_THRESHOLD = 30;
const EXPAND_MAX_HEIGHT = 420;

const CodeBlock: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className, children }) => {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match?.[1];
  const code = String(children ?? '').replace(/\n$/, '');
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (lang === 'mermaid') {
    return <MermaidBlock code={code} />;
  }

  let html = '';
  try {
    html = lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value;
  } catch {
    html = code;
  }

  // hljs output is line-based (token spans never cross `\n`), so we can split
  // the highlighted HTML per line and wrap each in a `.code-line` span — the
  // gutter numbers are driven by a CSS counter, keeping the DOM light.
  const lineHtml = html
    .split('\n')
    .map((line) => `<span class="code-line">${line}</span>`)
    .join('\n');
  const lineCount = code.split('\n').length;
  const isLong = lineCount > EXPAND_LINE_THRESHOLD;

  // Agents often use a fenced block merely to mention a file or command. A
  // large code panel makes that look much more technical than it is.
  if (!lang && lineCount <= 2 && code.length <= 180) {
    return (
      <span className="my-1 inline-flex max-w-full items-center rounded-full premium-chip px-2.5 py-1 font-mono text-[10px] text-[var(--text-secondary)]">
        <span className="truncate">{code}</span>
      </span>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable
    }
  };

  const langName = lang ? (hljs.getLanguage(lang)?.name ?? lang) : 'text';

  return (
    <div className="premium-surface rounded-xl overflow-hidden my-2">
      <div className="flex items-center justify-between px-2.5 py-1 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)]">
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]/70 shrink-0" />
          <span className="truncate font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]/70">
            {lang ?? 'code'}
          </span>
          <span className="font-mono text-[8px] text-[var(--text-secondary)]/40 hidden sm:inline">{langName}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[8px] tabular-nums text-[var(--text-secondary)]/40">{lineCount} lines</span>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/50 hover:text-[var(--accent)] cursor-pointer"
            >
              {expanded ? 'collapse' : 'expand'}
            </button>
          )}
          <button
            onClick={() => void handleCopy()}
            className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)] cursor-pointer"
          >
            {copied ? 'copied ✓' : 'copy'}
          </button>
        </span>
      </div>
      <pre
        className="agent-code-pre overflow-x-auto bg-[var(--bg-main)] text-[10.5px] leading-[1.7] premium-scrollbar"
        style={!expanded && isLong ? { maxHeight: EXPAND_MAX_HEIGHT, overflowY: 'auto' } : undefined}
      >
        <code className="font-mono block min-w-full w-fit" dangerouslySetInnerHTML={{ __html: lineHtml }} />
      </pre>
    </div>
  );
};

const isToolInputRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringListFromInput = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : typeof item === 'object' && item !== null ? String((item as { path?: unknown }).path ?? '') : ''))
    .filter(Boolean);
};

/** First shell command in a tool input, when there is one. Lets a running
    activity row show exactly what is executing. */
const getRunningCommand = (input: unknown): string | undefined => {
  if (!isToolInputRecord(input)) return undefined;
  const commandValue = input.commands ?? input.command ?? input.cmd;
  return stringListFromInput(commandValue)[0];
};

/** Bordered output card: header (label + expand + copy) over a scrollable body. */
const OutputBlock = React.memo(function OutputBlock({
  label,
  text,
  isError,
  highlight,
}: {
  label: string;
  text: string;
  isError?: boolean;
  highlight?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isLong = text.split('\n').length > 40 || text.length > 1200;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable
    }
  };

  let html = '';
  if (highlight && hljs.getLanguage(highlight)) {
    try {
      html = hljs.highlight(text, { language: highlight }).value;
    } catch {
      html = '';
    }
  }

  return (
    <div
      className={`premium-surface rounded-xl overflow-hidden ${
        isError ? '!border-rose-900/50 !bg-rose-950/20' : ''
      }`}
    >
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 border-b font-mono text-[9px] font-bold uppercase tracking-widest ${
          isError ? 'text-rose-500 border-rose-900/30' : 'text-[var(--text-secondary)]/60 border-[var(--border-primary)]/70'
        }`}
      >
        {isError ? (
          <WarningCircle size={12} className="shrink-0" />
        ) : (
          <PaperPlaneRight size={12} className="shrink-0" />
        )}
        <span className="truncate">{label}</span>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/50 hover:text-[var(--accent)] cursor-pointer"
            >
              {expanded ? 'collapse' : 'expand'}
            </button>
          )}
          <button
            onClick={() => void handleCopy()}
            className="text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/60 hover:text-[var(--text-primary)] cursor-pointer"
          >
            {copied ? 'copied ✓' : 'copy'}
          </button>
        </span>
      </div>
      <div className="premium-scrollbar" style={!expanded && isLong ? { maxHeight: 320, overflowY: 'auto' } : undefined}>
        {html ? (
          <pre className="px-3 py-2 overflow-x-auto font-mono text-[10px] leading-relaxed">
            <code dangerouslySetInnerHTML={{ __html: html }} />
          </pre>
        ) : (
          <pre className="px-3 py-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
            {text}
          </pre>
        )}
      </div>
    </div>
  );
});

const markdownComponents = {
  code: CodeBlock,
  img: ({ src, alt }: React.ImgHTMLAttributes<HTMLImageElement>) => <RemoteImageCard src={src} alt={alt} />,
  a: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    href && isRemoteImageUrl(href) ? <RemoteImageCard src={href} /> : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
} as const;

const MessageActions: React.FC<{ text: string; onReply?: (text: string) => void; showCopy?: boolean }> = ({ text, onReply, showCopy = false }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {onReply && <button type="button" onClick={() => onReply(text)} className="app-icon-button h-6 w-6" title="Reply to this message" aria-label="Reply to this message"><ChatCircle size={12} /></button>}
      {showCopy && <button type="button" onClick={() => void copy()} className="app-icon-button h-6 w-6" title="Copy message" aria-label="Copy message">{copied ? <Check size={12} /> : <Copy size={12} />}</button>}
    </div>
  );
};

const UserBubble = React.memo(function UserBubble({ text, attachments = [], onReply }: { text: string; attachments?: AgentAttachment[]; onReply?: (text: string) => void }) {
  return (
    <div className="group ml-auto flex w-fit max-w-[70%] justify-end animate-fade-in-up">
    <div className="w-fit max-w-full rounded-2xl rounded-br-md bg-[var(--bg-tertiary)] px-4 py-3">
      <div className="agent-rich-text text-[length:var(--agent-session-text-size)] leading-relaxed text-[var(--text-primary)] markdown-body" {...richTextDirection(text)}>
        <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={markdownRehype} components={markdownComponents}>
          {text}
        </ReactMarkdown>
      </div>
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--accent-border)]/40 pt-2">
          {attachments.map((attachment) => (
            attachment.kind === 'image' && attachment.previewData ? (
              <div key={attachment.path} className="group relative overflow-hidden rounded-lg border border-[var(--accent-border)]/60 bg-[var(--bg-main)]/45" title={attachment.name}>
                <img
                  src={attachment.previewData}
                  alt={attachment.name}
                  loading="lazy"
                  className="h-20 w-28 object-cover transition-transform duration-150 group-hover:scale-[1.03]"
                />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 font-mono text-[8px] text-white/85">
                  {attachment.name}
                </span>
              </div>
            ) : (
              <span key={attachment.path} className="inline-flex max-w-full items-center gap-1 rounded-md bg-[var(--bg-main)]/45 px-1.5 py-1 font-mono text-[9px] text-[var(--text-secondary)]" title={attachment.path}>
                {attachment.kind === 'image' ? <Image size={12} /> : <FileText size={12} />}
                <span className="max-w-44 truncate">{attachment.name}</span>
              </span>
            )
          ))}
        </div>
      )}
      <MessageActions text={text} onReply={onReply} showCopy />
    </div>
  </div>
  );
});

const AgentAvatar: React.FC = () => (
  <div className="agent-avatar mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center" title="YzPzCode Agent">
    <img src={logo} alt="YzPzCode Agent" className="agent-avatar__logo h-6 w-6 object-contain" draggable={false} />
  </div>
);

const ReasoningBlock = React.memo(function ReasoningBlock({ text, active }: { text: string; active?: boolean }) {
  const [copied, setCopied] = useState(false);
  const hasReasoning = Boolean(text.trim());
  const wordCount = useMemo(() => (hasReasoning ? text.trim().split(/\s+/).length : 0), [text, hasReasoning]);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can be unavailable in an embedded webview.
    }
  };

  return (
    <AiReasoning
      className={`agent-ai-reasoning app-surface mb-0 overflow-hidden ${active ? 'border-[var(--accent-border)]' : ''}`}
      defaultOpen={false}
      isStreaming={active}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <AiReasoningTrigger
          className="min-w-0 flex-1 text-left text-xs"
          getThinkingMessage={(streaming) => (
            <span>{streaming ? 'Thinking through the next step' : `${wordCount} word${wordCount === 1 ? '' : 's'} of reasoning`}</span>
          )}
        />
        {hasReasoning && !active && (
          <button
            type="button"
            onClick={() => void handleCopy()}
            title="Copy thinking text"
            className="app-icon-button h-6 w-6 shrink-0"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        )}
      </div>
      <AiReasoningContent className="mx-3 mb-3 mt-0 border-t border-[var(--border-primary)] pt-3 text-xs leading-relaxed">
        {hasReasoning ? text : 'Reviewing the request and preparing the next action.'}
      </AiReasoningContent>
    </AiReasoning>
  );
});

/** Transient one-line activity row for a tool executing right now. Non-edit
    tools never get a card — only file edits get the diff surface; while a
    command is actually running this row shows it inline without card chrome. */
const ToolActivityRow = React.memo(function ToolActivityRow({ name, input }: { name: string; input: unknown }) {
  const command = getRunningCommand(input);
  return (
    <div
      className="flex min-w-0 items-center gap-2 py-0.5 text-[11px] text-[var(--text-secondary)] animate-fade-in"
      aria-live="polite"
    >
      <CircleNotch size={12} weight="bold" className="shrink-0 animate-spin text-[var(--accent)]" aria-hidden="true" />
      <span className="truncate font-medium text-[var(--text-primary)]">{toolLabel(name)}</span>
      {command && <code className="min-w-0 truncate font-mono text-[10px]">{`$ ${command}`}</code>}
    </div>
  );
});

const ToolBlock = React.memo(function ToolBlock({ name, input, result, running }: { name: string; input: unknown; result?: unknown; running?: boolean }) {
  const editTool = isEditTool(name);

  // Quiet by default: finished non-edit tools leave the transcript (the agent's
  // next message explains the result). While running they are one quiet line.
  if (!editTool) {
    if (!running) return null;
    return <ToolActivityRow name={name} input={input} />;
  }

  // The one card that deserves a surface: a real file diff.
  return (
    <AiTool
      className="agent-ai-tool mb-0 overflow-hidden rounded-xl border-[var(--border-primary)] bg-[var(--bg-secondary)]"
      open
      onOpenChange={() => undefined}
    >
      <AiToolHeader
        className="bg-[var(--bg-tertiary)]/50"
        state="output-available"
        title={toolLabel(name)}
        toolName={name}
        type="dynamic-tool"
        showStatus={false}
      />
      <AiToolContent className="border-t border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
        <DiffView toolName={name} input={input} result={result} />
      </AiToolContent>
    </AiTool>
  );
});

const ToolResultBlock = React.memo(function ToolResultBlock({ content, isError }: { content: unknown; isError?: boolean }) {
  const [open, setOpen] = useState(false);
  const text = formatToolResult(content);
  const images = collectImageSources(content);
  if (images.length > 0) {
    return (
      <div className="space-y-2">
        {images.map((source, index) => <GeneratedImageBlock key={`${source.slice(0, 32)}-${index}`} source={source} label={isError ? 'Image output (with warning)' : 'Generated image'} />)}
        {isError && text && <OutputBlock label="Image generation warning" text={text} isError />}
      </div>
    );
  }
  if (!text) return null;
  // Successful tool output is implementation noise in a chat UI. The agent's
  // next sentence explains its meaning; retain failures for troubleshooting.
  if (!isError) return null;
  const lineCount = text.split('\n').length;
  const preview = (text.split('\n')[0] ?? '').trim().slice(0, 120);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 rounded-xl premium-surface premium-lift px-2.5 py-1.5 text-left cursor-pointer transition-colors duration-100"
        title="Click to view full output"
      >
        {isError ? <WarningCircle size={12} /> : <Check size={12} />}
        <span className={`font-mono text-[9px] font-bold uppercase tracking-widest shrink-0 ${isError ? 'text-amber-500/70' : 'text-[var(--text-secondary)]/60'}`}>
          {isError ? 'A step needs attention' : `Output · ${lineCount} line${lineCount === 1 ? '' : 's'}`}
        </span>
        {preview && <span className="font-mono text-[9px] text-[var(--text-secondary)]/40 truncate min-w-0">{preview}</span>}
        <span className="ml-auto font-mono text-[9px] text-[var(--text-secondary)]/40 shrink-0">▸</span>
      </button>
    );
  }
  return <OutputBlock label={isError ? 'Error' : 'Output'} text={text} isError={isError} />;
});

const ThinkingLoader = React.memo(function ThinkingLoader() {
  const [phase, setPhase] = useState(0);
  const labels = ['Understanding your request', 'Checking the project', 'Preparing the next step'];

  useEffect(() => {
    const timer = window.setInterval(() => setPhase((current) => (current + 1) % labels.length), 2200);
    return () => window.clearInterval(timer);
  }, [labels.length]);

  return (
    <div className="flex items-center gap-2 px-1 py-1.5 animate-fade-in-up text-[11px] text-[var(--text-secondary)]" aria-live="polite">
      <AgentAvatar />
      <span>{labels[phase]}…</span>
      <span className="flex gap-0.5" aria-hidden="true">
        <span className="typing-dot bg-[var(--accent)]" />
        <span className="typing-dot bg-[var(--accent)]" style={{ animationDelay: '150ms' }} />
        <span className="typing-dot bg-[var(--accent)]" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
});

const StreamingCursor: React.FC = () => (
  <span className="inline-block w-[7px] h-[13px] rounded-[1px] ml-0.5 align-middle streaming-cursor bg-[var(--accent)]" />
);

/**
 * Graceful failure card. Shown only after the harness's automatic recovery
 * budget is exhausted (or the run was deliberately stopped), so this is a
 * last-resort manual nudge — not the dead-end it used to be. Offers a one-click
 * Continue that re-sends the last prompt. Auto-disappears when a new turn
 * starts (the harness clears the error state on resume).
 */
const ErrorCard = React.memo(function ErrorCard({ message, onContinue }: { message: string; onContinue?: () => void }) {
  const reason = humanizeAgentError(message);
  return (
    <div className="rounded-lg border border-rose-500/25 bg-rose-950/10 px-3 py-2.5 animate-fade-in-up" role="alert">
      <div className="flex items-center gap-2">
        <WarningCircle size={14} className="shrink-0 text-rose-400" aria-hidden="true" />
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-rose-400">
          The agent needs attention
        </span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--text-primary)] break-words">
        {reason}
      </p>
      <p className="mt-1 font-mono text-[9px] leading-relaxed text-[var(--text-secondary)]/50 break-words whitespace-pre-wrap max-h-24 overflow-y-auto">
        {message}
      </p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--text-secondary)]/60">
        The agent tried to recover automatically and will also pick up again on your next message.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {onContinue && (
          <button
            type="button"
            onClick={() => onContinue()}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)]/15 text-[var(--accent)] hover:bg-[var(--accent-light)]/30 font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
          >
            <ArrowClockwise size={12} aria-hidden="true" />
            Continue task
          </button>
        )}
        <span className="font-mono text-[9px] text-[var(--text-secondary)]/50">
          You can also just type a new message.
        </span>
      </div>
    </div>
  );
});

/**
 * Idle-turn warning. The watchdog only sets this after a running turn has been
 * completely silent for `agentTimeout` — while any stream/tool/approval is
 * live the clock keeps resetting. The harness turn is left untouched; the user
 * picks "Keep waiting" (dismiss) or "Stop turn".
 */
const IdleTurnCard = React.memo(function IdleTurnCard({
  minutes,
  onKeepWaiting,
  onStopTurn,
}: {
  minutes: number;
  onKeepWaiting?: () => void;
  onStopTurn?: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-950/10 px-3 py-2.5 animate-fade-in-up" role="alert">
      <div className="flex items-center gap-2">
        <ClockCountdown size={14} className="shrink-0 text-amber-400" aria-hidden="true" />
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-amber-400">
          No activity for {minutes} min
        </span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--text-secondary)] break-words">
        The agent hasn't produced any output for a while. It may still be working — wait longer, or stop the turn
        and rephrase your request.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {onKeepWaiting && (
          <button
            type="button"
            onClick={() => onKeepWaiting()}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)]/15 text-[var(--accent)] hover:bg-[var(--accent-light)]/30 font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
          >
            <Clock size={12} aria-hidden="true" />
            Keep waiting
          </button>
        )}
        {onStopTurn && (
          <button
            type="button"
            onClick={() => onStopTurn()}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-rose-500/30 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
          >
            <Square size={12} weight="fill" aria-hidden="true" />
            Stop turn
          </button>
        )}
      </div>
    </div>
  );
});

const CompactionStatusCard = React.memo(function CompactionStatusCard({ status }: { status: AgentCompactionStatus }) {
  const details =
    status.phase === 'completed' && status.tokensBefore && status.tokensAfter
      ? `Reduced the prompt from ${(status.tokensBefore / 1000).toFixed(1)}k to ${(status.tokensAfter / 1000).toFixed(1)}k tokens.`
      : status.phase === 'completed'
        ? 'Conversation context is ready for the next step.'
        : status.phase === 'skipped'
          ? 'The transcript was already within the target size.'
          : status.phase === 'failed'
            ? 'Could not reduce context automatically. The agent will surface the next safe recovery step.'
            : 'Preserving the recent work and reducing older conversation context.';
  const active = status.phase === 'working';
  const phaseIcon =
    status.phase === 'failed' ? (
      <WarningCircle size={14} />
    ) : status.phase === 'completed' ? (
      <CheckCircle size={14} />
    ) : (
      <Stack size={14} />
    );
  const tone = status.phase === 'failed' ? 'text-rose-400 border-rose-500/30 bg-rose-500/5' : active ? 'text-[var(--accent)] border-[var(--accent-border)] bg-[var(--accent-light)]/10' : 'text-emerald-400 border-emerald-500/25 bg-emerald-500/5';
  const title = active ? 'Compacting conversation' : status.phase === 'completed' ? 'Conversation compacted' : status.phase === 'skipped' ? 'Context check complete' : 'Compaction needs attention';

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 animate-fade-in-up ${tone}`} aria-live="polite">
      <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-current/10 ${active ? 'animate-pulse' : ''}`}>
        {phaseIcon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-[var(--text-primary)]">{title}</div>
        <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--text-secondary)]">{details}</p>
      </div>
      {active && <span className="ml-auto mt-1 h-3 w-3 shrink-0 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" aria-label="In progress" />}
    </div>
  );
});

const AssistantBlock = React.memo(function AssistantBlock({ block }: { block: ClineMessage['content'][number] }) {
  const showAgentReasoning = useAppStore((s) => s.showAgentReasoning);
  if (block.type === 'text' && typeof block.text === 'string') {
    if (!block.text.trim()) return null;
    return <TranslatableAgentText text={block.text} />;
  }
  if (block.type === 'tool_use') {
    const tool = block as {
      type: 'tool_use'; name?: string; toolName?: string; input: unknown;
      status?: 'running' | 'done'; result?: unknown;
    };
    return <ToolBlock name={tool.name ?? tool.toolName ?? 'tool'} input={tool.input} result={tool.result} running={tool.status === 'running'} />;
  }
  if (block.type === 'tool_result') {
    const result = block as { type: 'tool_result'; content?: unknown; isError?: boolean };
    return <ToolResultBlock content={result.content} isError={result.isError} />;
  }
  if (block.type === 'image') {
    const source = collectImageSources(block)[0];
    return source ? <GeneratedImageBlock source={source} /> : null;
  }
  if (block.type === 'thinking' || block.type === 'reasoning') {
    const text =
      (block as { text?: string; thinking?: string; content?: string }).text ??
      (block as { text?: string; thinking?: string; content?: string }).thinking ??
      (block as { text?: string; thinking?: string; content?: string }).content ??
      '';
    if (!text || !showAgentReasoning) return null;
    return <ReasoningBlock text={text} />;
  }
  return null;
});

/** Keep message chrome out of the transcript when every provider block is intentionally hidden. */
const isVisibleAssistantBlock = (
  block: ClineMessage['content'][number],
  showAgentReasoning: boolean,
): boolean => {
  if (block.type === 'text') {
    return typeof block.text === 'string' && block.text.trim().length > 0;
  }
  if (block.type === 'tool_use') {
    const tool = block as { name?: string; toolName?: string; status?: 'running' | 'done' };
    return tool.status === 'running' || isEditTool(tool.name ?? tool.toolName ?? 'tool');
  }
  if (block.type === 'tool_result') {
    const result = block as { content?: unknown; isError?: boolean };
    return collectImageSources(result.content).length > 0
      || Boolean(result.isError && formatToolResult(result.content).trim());
  }
  if (block.type === 'image') {
    return collectImageSources(block).length > 0;
  }
  if (block.type === 'thinking' || block.type === 'reasoning') {
    const reasoning = block as { text?: string; thinking?: string; content?: string };
    const text = reasoning.text ?? reasoning.thinking ?? reasoning.content ?? '';
    return showAgentReasoning && text.trim().length > 0;
  }
  return false;
};

export /**
 * Example prompts for first-time users. Clicking one sends it as a normal
 * message in the current mode — no need to know the tools or the mode system.
 */
const SUGGESTIONS: Array<{ prompt: string; hint: string; icon: React.ReactNode }> = [
  { prompt: "What's in this project?", hint: 'short summary', icon: <BookOpenText size={14} /> },
  { prompt: 'Explain the code in simple words', hint: 'no jargon', icon: <ChatCircle size={14} /> },
  { prompt: 'Find any bugs and fix them', hint: 'review + fix', icon: <Bug size={14} /> },
  { prompt: 'Make the tests pass', hint: 'run + fix failures', icon: <Flask size={14} /> },
  { prompt: 'Add a new feature', hint: 'describe what you want', icon: <Sparkle size={14} /> },
  { prompt: 'Summarize my recent changes', hint: 'git history', icon: <GitCommit size={14} /> },
];

const SuggestionGrid: React.FC<{ onSuggestion: (prompt: string) => void }> = ({ onSuggestion }) => (
  <div className="app-surface mt-6 grid w-full max-w-xl grid-cols-1 overflow-hidden sm:grid-cols-2">
    {SUGGESTIONS.map((suggestion) => (
      <button
        key={suggestion.prompt}
        type="button"
        onClick={() => onSuggestion(suggestion.prompt)}
        className="group flex items-start gap-2.5 border-b border-[var(--border-primary)] px-4 py-3 text-left transition-colors hover:bg-[var(--bg-tertiary)] sm:odd:border-r"
      >
        <span className="mt-0.5 flex shrink-0 text-[var(--accent)]">{suggestion.icon}</span>
        <span className="min-w-0">
          <span className="block text-[10.5px] leading-snug text-[var(--text-primary)]">{suggestion.prompt}</span>
          <span className="mt-1 block text-[10px] text-[var(--text-secondary)]/65">
            {suggestion.hint}
          </span>
        </span>
      </button>
    ))}
  </div>
);

export const AgentChat: React.FC<AgentChatProps> = ({
  messages,
  streamingText,
  streamingThinking = '',
  activeTool,
  toolLog = [],
  isThinking = false,
  notice,
  compaction,
  pendingQuestion,
  onAnswerQuestion,
  error,
  onContinue,
  turnIdle = null,
  onClearIdleTurn,
  onStopTurn,
  onSuggestion,
  completed,
  elapsedSec,
  toolCount,
  composerOverlay = false,
  onReply,
}) => {
  const showAgentReasoning = useAppStore((s) => s.showAgentReasoning);
  const agentConversationWidth = useAppStore((s) => s.agentConversationWidth);
  const showLiveReasoning = showAgentReasoning && (isThinking || streamingThinking.trim().length > 0);
  const hasNewContent =
    streamingText.length > 0 || streamingThinking.length > 0 || toolLog.length > 0 || !!activeTool || isThinking || !!pendingQuestion || !!compaction;
  const inlineToolIds = useMemo(() => new Set(
    messages.flatMap((message) => message.content
      .filter((block): block is Extract<ClineContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
      .map((block) => block.id)),
  ), [messages]);
  const unplacedToolLog = toolLog.filter((tool) => !inlineToolIds.has(tool.id));

  const content = useMemo(() => {
    return messages.map((message, i) => {
      if (message.role === 'user') {
        const text = message.content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => (b as { text: string }).text)
          .join('\n')
          .trim();
        const toolResults = message.content.filter((b) => b.type === 'tool_result');
        const localAttachments = message.content
          .filter((b): b is Extract<ClineMessage['content'][number], { type: 'attachment' }> => b.type === 'attachment')
          .map((b) => b.attachment);
        const imageAttachments = message.content
          .filter((b): b is Extract<ClineMessage['content'][number], { type: 'image' }> => b.type === 'image')
          .map((b, imageIndex): AgentAttachment => ({
            path: b.path ?? `image-${imageIndex + 1}`,
            name: b.name ?? `Image attachment ${imageIndex + 1}`,
            kind: 'image',
            previewData: collectImageSources(b)[0],
          }));
        const attachments = [...localAttachments, ...imageAttachments];
        if (!text && toolResults.length > 0) {
          // Tool outputs arrive as `role: "user"` messages — render them as
          // result blocks beneath the tool that produced them, not as bubbles.
          return (
            <div key={i} className="pl-8 -mt-1">
              {toolResults.map((b, j) => {
                const r = b as { content?: unknown; isError?: boolean };
                return <ToolResultBlock key={j} content={r.content} isError={r.isError} />;
              })}
            </div>
          );
        }
        if (!text) return null;
        const uiEditRequest = parseUiEditRequest(text);
        if (uiEditRequest) {
          // Element-inspector handoffs get a structured card instead of the raw
          // wall of text: page context up top, the user request front and
          // center, and developer details behind collapsible sections.
          return <UiEditRequestCard key={i} request={uiEditRequest} />;
        }
        // Render the self-contained UserBubble directly. Wrapping it in
        // AiMessage/AiMessageContent previously produced two nested bubble
        // boxes: the wrapper's baked-in group-[.is-user] bg/padding classes
        // outranked the bg-transparent p-0 override (higher specificity), so
        // a wide 100%-width panel wrapped around the real bubble.
        return <UserBubble key={i} text={text} attachments={attachments} onReply={onReply} />;
      }
      const visibleBlocks = message.content.filter((block) => isVisibleAssistantBlock(block, showAgentReasoning));
      if (visibleBlocks.length === 0) return null;
      return (
        <AiMessage from="assistant" key={i}>
          <AiMessageContent className="w-full">
            <div className="group flex gap-3">
              <AgentAvatar />
              <div className="min-w-0 flex-1 space-y-3">
                {visibleBlocks.map((block, j) => (
                  <AssistantBlock key={j} block={block} />
                ))}
                {message.content.some((block) => block.type === 'text') && (
                  <MessageActions text={message.content.filter((block) => block.type === 'text').map((block) => (block as { text?: string }).text ?? '').join('\n')} onReply={onReply} />
                )}
              </div>
            </div>
          </AiMessageContent>
        </AiMessage>
      );
    });
  }, [messages, showAgentReasoning]);

  return (
    <div
      className="relative flex-1 min-h-0"
      style={{
        '--agent-session-content-width': `${agentConversationWidth}px`,
      } as React.CSSProperties}
    >
      <AiConversation className="h-full">
      <AiConversationContent className={`min-h-full gap-0 px-4 pt-8 sm:px-8 ${composerOverlay ? 'pb-40 sm:pb-44' : 'pb-8'}`}>
      {messages.length === 0 && !hasNewContent && (
        <AiConversationEmptyState className="min-h-[360px] px-4 py-12">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
            <img src={logo} alt="YzPzCode Agent" className="h-6 w-6 object-contain" draggable={false} />
          </div>
          <div className="mt-2 space-y-2">
            <h2 className="m-0 text-xl font-semibold">What would you like to work on?</h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-[var(--text-secondary)]">
              Ask about the project, plan a change, or hand the agent a task to complete.
            </p>
          </div>
          {onSuggestion && (
            <>
              <SuggestionGrid onSuggestion={onSuggestion} />
              <p className="mt-4 text-xs text-[var(--text-secondary)]/65">
                Ask explores · Act changes files · Plan reviews the approach first
              </p>
            </>
          )}
        </AiConversationEmptyState>
      )}
      <div className="mx-auto w-full max-w-[var(--agent-session-content-width)] space-y-3.5">
        {content}
        {notice && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--accent-border)]/40 bg-[var(--accent-light)]/10 font-mono text-[10px] text-[var(--accent)] animate-fade-in">
            <Code size={12} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{notice}</span>
          </div>
        )}
        {error && <ErrorCard message={error} onContinue={onContinue} />}
        {turnIdle && !error && (
          <IdleTurnCard
            minutes={turnIdle.minutes}
            onKeepWaiting={onClearIdleTurn}
            onStopTurn={onStopTurn}
          />
        )}
        {compaction && <CompactionStatusCard status={compaction} />}
        {showLiveReasoning && <ReasoningBlock key="live-reasoning" text={streamingThinking} active />}
        {unplacedToolLog.map((t) => {
          // ToolBlock owns visibility: edit tools always render, non-edit tools
          // only render while running. Finished failures get an error card.
          if (isEditTool(t.name) || t.status === 'running') {
            return (
              <ToolBlock
                key={t.id}
                name={t.name}
                input={t.input}
                result={t.result}
                running={t.status === 'running'}
              />
            );
          }
          if (t.isError && t.result !== undefined) {
            return <ToolResultBlock key={t.id} content={t.result} isError />;
          }
          return null;
        })}
        {activeTool && !toolLog.some((t) => t.status === 'running') && (
          <ToolBlock name={activeTool.name} input={activeTool.input} running />
        )}
        {streamingText && (
          <div className="flex gap-2">
            <AgentAvatar />
            <div className="agent-rich-text min-w-0 flex-1 text-[length:var(--agent-session-text-size)] leading-relaxed text-[var(--text-primary)] markdown-body" {...richTextDirection(streamingText)}>
              <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={markdownRehype} components={markdownComponents}>
                {streamingText}
              </ReactMarkdown>
              <StreamingCursor />
            </div>
          </div>
        )}
        {isThinking && !streamingText && !showLiveReasoning && <ThinkingLoader />}
        {pendingQuestion && onAnswerQuestion && (
          <QuestionCard question={pendingQuestion} onAnswer={onAnswerQuestion} />
        )}
        {completed && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.045] px-3 py-2 animate-fade-in-up">
            <CheckCircle size={16} className="shrink-0 text-emerald-400" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[var(--text-primary)]">All done</span>
            {typeof elapsedSec === 'number' && elapsedSec >= 1 && (
              <span className="font-mono text-[9px] text-[var(--text-secondary)]/60 tabular-nums">
                {String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:{String(elapsedSec % 60).padStart(2, '0')}
              </span>
            )}
            {typeof toolCount === 'number' && toolCount > 0 && (
              <span className="font-mono text-[9px] text-[var(--text-secondary)]/50">· {toolCount} step{toolCount === 1 ? '' : 's'}</span>
            )}
            <span className="ml-auto font-mono text-[9px] text-[var(--text-secondary)]/40">
              ask me to adjust anything
            </span>
          </div>
        )}
      </div>
      </AiConversationContent>
      <AiConversationScrollButton className={composerOverlay ? 'bottom-36' : 'bottom-4'} />
      </AiConversation>
    </div>
  );
};
