import React, { useMemo, useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js';
import { ClineMessage, ToolLogEntry } from '../../hooks/useAgentSession';
import { DiffView, isEditTool } from './DiffView';
import { QuestionCard } from './QuestionCard';
import logo from '../../assets/YzPzCodeLogo.png';
import type { AgentQuestion } from '../../types';

interface AgentChatProps {
  messages: ClineMessage[];
  streamingText: string;
  streamingThinking?: string;
  activeTool: { name: string; input: unknown } | null;
  toolLog?: ToolLogEntry[];
  isThinking?: boolean;
  notice?: string | null;
  pendingQuestion?: AgentQuestion | null;
  onAnswerQuestion?: (requestId: string, answer: string) => void;
  autoScroll?: boolean;
}

const toolLabel = (name: string): string => {
  const map: Record<string, string> = {
    run_commands: 'Run Command',
    read_files: 'Read Files',
    search_codebase: 'Search Codebase',
    search_web: 'Search Web',
    fetch_web: 'Fetch Web',
    fetch_web_content: 'Fetch Web',
    editor: 'Edit File',
    apply_patch: 'Apply Patch',
    write_file: 'Write File',
    create_file: 'Create File',
    delete_file: 'Delete File',
    rename_file: 'Rename File',
    list_files: 'List Files',
    todo_write: 'Update Tasks',
    ask_question: 'Ask Question',
  };
  return map[name] || name;
};

const toolIcon: Record<string, string> = {
  run_commands: '>_',
  read_files: '📖',
  search_codebase: '🔍',
  fetch_web: '🌐',
  fetch_web_content: '🌐',
  editor: '✏️',
  apply_patch: '🔧',
  write_file: '📝',
  todo_write: '☑',
};

const TOOL_ACCENT: Record<string, string> = {
  run_commands: 'text-emerald-500',
  read_files: 'text-sky-400',
  search_codebase: 'text-sky-400',
  fetch_web: 'text-violet-400',
  fetch_web_content: 'text-violet-400',
  editor: 'text-[var(--accent)]',
  apply_patch: 'text-amber-400',
  write_file: 'text-[var(--accent)]',
  todo_write: 'text-emerald-500',
};

const formatToolInput = (input: unknown): string => {
  if (input == null) return '';
  try {
    const str = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
    return str.length > 20000 ? `${str.slice(0, 20000)}\n… (truncated)` : str;
  } catch {
    return String(input);
  }
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

const markdownPlugins = [remarkGfm, remarkMath];
const markdownRehype = [rehypeKatex];

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
      <div className="rounded-md overflow-hidden border border-[var(--border-primary)] my-2">
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
    <div className="rounded-md overflow-hidden border border-[var(--border-primary)] my-2 bg-[var(--bg-main)]">
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
    <div className="rounded-md overflow-hidden border border-[var(--border-primary)] my-2 shadow-sm">
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
        className="agent-code-pre overflow-x-auto bg-[var(--bg-main)] text-[10.5px] leading-[1.7]"
        style={!expanded && isLong ? { maxHeight: EXPAND_MAX_HEIGHT, overflowY: 'auto' } : undefined}
      >
        <code className="font-mono block min-w-full w-fit" dangerouslySetInnerHTML={{ __html: lineHtml }} />
      </pre>
    </div>
  );
};

/** Pick an hljs language for a tool input based on its tool name + shape. */
const inputHighlightLang = (name: string, text: string): string | undefined => {
  const t = text.trim();
  if (name === 'run_commands' && !t.startsWith('{') && !t.startsWith('[')) return 'bash';
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  return undefined;
};

/** Bordered output card: header (label + expand + copy) over a scrollable body. */
const OutputBlock: React.FC<{ label: string; text: string; isError?: boolean; highlight?: string }> = ({
  label,
  text,
  isError,
  highlight,
}) => {
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
      className={`rounded-lg border overflow-hidden ${
        isError ? 'border-rose-900/50 bg-rose-950/20' : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)]/60'
      }`}
    >
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 border-b font-mono text-[9px] font-bold uppercase tracking-widest ${
          isError ? 'text-rose-500 border-rose-900/30' : 'text-[var(--text-secondary)]/60 border-[var(--border-primary)]/70'
        }`}
      >
        {isError ? (
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ) : (
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
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
      <div style={!expanded && isLong ? { maxHeight: 320, overflowY: 'auto' } : undefined}>
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
};

const markdownComponents = { code: CodeBlock } as const;

const UserBubble: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex justify-end gap-2 animate-fade-in-up">
    <div className="max-w-[85%] rounded-xl rounded-br-sm border border-[var(--accent-border)] bg-[var(--accent-light)]/25 px-3.5 py-2.5 shadow-sm">
      <div className="text-[12px] leading-relaxed text-[var(--text-primary)] markdown-body">
        <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={markdownRehype} components={markdownComponents}>
          {text}
        </ReactMarkdown>
      </div>
    </div>
    <div className="w-6 h-6 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </div>
  </div>
);

const AgentAvatar: React.FC = () => (
  <div className="w-6 h-6 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-light)]/20 flex items-center justify-center shrink-0 mt-0.5 shadow-sm overflow-hidden">
    <img src={logo} alt="YzPzCode Agent" className="w-4 h-4 object-contain" draggable={false} />
  </div>
);

const ReasoningBlock: React.FC<{ text: string; active?: boolean }> = ({ text, active }) => {
  const [open, setOpen] = useState(false);
  const openedOnce = useRef(false);
  if (active) openedOnce.current = true;
  return (
    <div className={`rounded-lg border overflow-hidden transition-all duration-150 ${active ? 'border-[var(--accent-border)] bg-[var(--accent-light)]/10' : 'border-[var(--border-primary)]/60 bg-[var(--bg-tertiary)]/40'}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer text-left hover:bg-[var(--bg-tertiary)]/60 transition-colors duration-100"
      >
        <span className={`relative flex items-center justify-center w-5 h-5 rounded-md shrink-0 ${active ? 'bg-[var(--accent-light)]/40' : 'bg-[var(--bg-tertiary)]'}`}>
          <svg className={`w-3 h-3 ${active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/60'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          {active && (
            <span className="absolute inset-0 rounded-md border border-[var(--accent-border)]/50 animate-reasoning-ping" />
          )}
        </span>
        <span className={`font-mono text-[9px] font-bold uppercase tracking-widest ${active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/60'}`}>
          Reasoning
        </span>
        {active && (
          <span className="flex items-center gap-1 px-1.5 h-4 rounded-sm bg-[var(--accent-light)]/25 text-[var(--accent)] font-mono text-[8px] font-bold uppercase tracking-widest animate-fade-in">
            <span className="typing-dot bg-current" style={{ animationDelay: '0ms' }} />
            <span className="typing-dot bg-current" style={{ animationDelay: '150ms' }} />
            <span className="typing-dot bg-current" style={{ animationDelay: '300ms' }} />
          </span>
        )}
        <span className="ml-auto font-mono text-[9px] text-[var(--text-secondary)]/50">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 border-l-2 border-[var(--accent-border)]/40 ml-3.5 whitespace-pre-wrap font-mono text-[10px] italic leading-relaxed text-[var(--text-secondary)] animate-fade-in-up">
          {text}
        </div>
      )}
    </div>
  );
};

const ToolBlock: React.FC<{ name: string; input: unknown; running?: boolean }> = ({ name, input, running }) => {
  const [open, setOpen] = useState(true);
  const accent = TOOL_ACCENT[name] ?? 'text-[var(--text-secondary)]';
  return (
    <div className={`overflow-hidden rounded-lg border transition-colors duration-150 ${running ? 'border-[var(--accent-border)] shadow-sm' : 'border-[var(--border-primary)]'}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 border-b px-3 py-2 text-left cursor-pointer transition-colors duration-100 ${running ? 'border-[var(--accent-border)]/40 bg-[var(--accent-light)]/10' : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80'}`}
      >
        <span className={`font-mono text-[10px] font-bold ${accent}`}>{toolIcon[name] ?? '⚙'}</span>
        <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${running ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          {toolLabel(name)}
        </span>
        <span className="font-mono text-[9px] text-[var(--text-secondary)]/50 hidden sm:inline">{name}</span>
        {running ? (
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="w-3 h-3 rounded-full border-[1.5px] border-[var(--accent-border)] border-t-transparent animate-spin" />
            <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--accent)]">running</span>
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-mono text-[8px] text-[var(--text-secondary)]/40">done</span>
          </span>
        )}
        <span className="font-mono text-[9px] text-[var(--text-secondary)]/40 shrink-0">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="bg-[var(--bg-main)] animate-fade-in-up p-2">
          {isEditTool(name) ? (
            <DiffView toolName={name} input={input} />
          ) : (
            <OutputBlock label="Tool input" text={formatToolInput(input)} highlight={inputHighlightLang(name, formatToolInput(input))} />
          )}
        </div>
      )}
    </div>
  );
};

const ToolResultBlock: React.FC<{ content: unknown; isError?: boolean }> = ({ content, isError }) => (
  <OutputBlock label={isError ? 'Error' : 'Output'} text={formatToolResult(content)} isError={isError} />
);

const ThinkingLoader: React.FC = () => (
  <div className="flex items-center gap-2.5 px-1 py-1.5 animate-fade-in-up">
    <AgentAvatar />
    <div className="agent-loader">
      <div className="agent-loader-circle" />
      <div className="agent-loader-circle" />
      <div className="agent-loader-circle" />
      <div className="agent-loader-shadow" />
      <div className="agent-loader-shadow" />
      <div className="agent-loader-shadow" />
    </div>
  </div>
);

const StreamingCursor: React.FC = () => (
  <span className="inline-block w-[7px] h-[13px] rounded-[1px] ml-0.5 align-middle streaming-cursor bg-[var(--accent)]" />
);

const AssistantBlock: React.FC<{ block: ClineMessage['content'][number] }> = ({ block }) => {
  if (block.type === 'text' && typeof block.text === 'string') {
    if (!block.text.trim()) return null;
    return (
      <div className="text-[12px] leading-relaxed text-[var(--text-primary)] markdown-body animate-fade-in-up">
        <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={markdownRehype} components={markdownComponents}>
          {block.text}
        </ReactMarkdown>
      </div>
    );
  }
  if (block.type === 'tool_use') {
    const tool = block as { type: 'tool_use'; name?: string; toolName?: string; input: unknown };
    return <ToolBlock name={tool.name ?? tool.toolName ?? 'tool'} input={tool.input} />;
  }
  if (block.type === 'tool_result') {
    const result = block as { type: 'tool_result'; content?: unknown; isError?: boolean };
    return <ToolResultBlock content={result.content} isError={result.isError} />;
  }
  if (block.type === 'thinking' || block.type === 'reasoning') {
    const text =
      (block as { text?: string; thinking?: string; content?: string }).text ??
      (block as { text?: string; thinking?: string; content?: string }).thinking ??
      (block as { text?: string; thinking?: string; content?: string }).content ??
      '';
    if (!text) return null;
    return <ReasoningBlock text={text} />;
  }
  return null;
};

export const AgentChat: React.FC<AgentChatProps> = ({
  messages,
  streamingText,
  streamingThinking = '',
  activeTool,
  toolLog = [],
  isThinking = false,
  notice,
  pendingQuestion,
  onAnswerQuestion,
  autoScroll = true,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasNewContent =
    streamingText.length > 0 || streamingThinking.length > 0 || toolLog.length > 0 || !!activeTool || isThinking || !!pendingQuestion;

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, streamingThinking, activeTool, isThinking, pendingQuestion, notice, autoScroll]);

  const content = useMemo(() => {
    return messages.map((message, i) => {
      if (message.role === 'user') {
        const text = message.content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => (b as { text: string }).text)
          .join('\n')
          .trim();
        const toolResults = message.content.filter((b) => b.type === 'tool_result');
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
        return <UserBubble key={i} text={text} />;
      }
      return (
        <div key={i} className="flex gap-2 space-y-0">
          <AgentAvatar />
          <div className="min-w-0 flex-1 space-y-2">
            {message.content.map((block, j) => (
              <AssistantBlock key={j} block={block} />
            ))}
          </div>
        </div>
      );
    });
  }, [messages]);

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-5">
      {messages.length === 0 && !hasNewContent && (
        <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center space-y-4 opacity-80">
          <div className="relative">
            <div className="agent-ready-icon w-12 h-12 flex items-center justify-center">
              <img src={logo} alt="YzPzCode Agent" className="agent-ready-logo w-8 h-8 object-contain" draggable={false} />
            </div>
          </div>
          <div className="agent-ready-rainbow font-mono text-[10px] uppercase tracking-[0.2em]">
            YZPZ Agent ready
          </div>
          <p className="max-w-xs font-mono text-[10px] text-[var(--text-secondary)]/50">
            Describe a task for this agent. It can read, search, and edit files, run shell commands, and work with MCP servers.
          </p>
        </div>
      )}
      <div className="mx-auto w-full max-w-[860px] space-y-3.5">
        {content}
        {notice && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--accent-border)]/40 bg-[var(--accent-light)]/10 font-mono text-[10px] text-[var(--accent)] animate-fade-in">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="truncate">{notice}</span>
          </div>
        )}
        {streamingThinking.trim() && <ReasoningBlock text={streamingThinking} active />}
        {toolLog.map((t) => (
          <div key={t.id} className="space-y-1.5">
            <ToolBlock name={t.name} input={t.input} running={t.status === 'running'} />
            {t.status === 'done' && t.result !== undefined && (
              <ToolResultBlock content={t.result} isError={t.isError} />
            )}
          </div>
        ))}
        {activeTool && !toolLog.some((t) => t.status === 'running') && (
          <ToolBlock name={activeTool.name} input={activeTool.input} running />
        )}
        {streamingText && (
          <div className="flex gap-2">
            <AgentAvatar />
            <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-[var(--text-primary)] markdown-body">
              <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={markdownRehype} components={markdownComponents}>
                {streamingText}
              </ReactMarkdown>
              <StreamingCursor />
            </div>
          </div>
        )}
        {isThinking && !streamingText && !streamingThinking.trim() && toolLog.length === 0 && <ThinkingLoader />}
        {pendingQuestion && onAnswerQuestion && (
          <QuestionCard question={pendingQuestion} onAnswer={onAnswerQuestion} />
        )}
      </div>
    </div>
  );
};
