import React, { useId, useMemo, useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js';
import { Icon } from '@iconify/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ClineContentBlock, ClineMessage, ToolLogEntry } from '../../hooks/useAgentSession';
import type { AgentCompactionStatus } from '../../hooks/useAgentSession';
import { DiffView, isEditTool } from './DiffView';
import { QuestionCard } from './QuestionCard';
import { parseUiEditRequest, UiEditRequestCard } from './UiEditRequestCard';
import BlurText from '../effects/BlurText';
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
  /** Clickable example prompts shown when the conversation is empty. */
  onSuggestion?: (prompt: string) => void;
  /** True when the last run finished successfully (drives the done banner). */
  completed?: boolean;
  elapsedSec?: number;
  toolCount?: number;
  autoScroll?: boolean;
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

const toolIcon: Record<string, string> = {
  run_commands: 'lucide:terminal-square',
  read_files: 'lucide:book-open',
  search_codebase: 'lucide:search',
  fetch_web: 'lucide:globe-2',
  fetch_web_content: 'lucide:globe-2',
  editor: 'lucide:pen-line',
  apply_patch: 'lucide:file-pen-line',
  write_file: 'lucide:file-plus-2',
  create_directory: 'lucide:folder-plus',
  mkdir: 'lucide:folder-plus',
  skills: 'lucide:book-open-check',
  skill: 'lucide:book-open-check',
  todo_write: 'lucide:list-todo',
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
  create_directory: 'text-emerald-500',
  mkdir: 'text-emerald-500',
  skills: 'text-violet-400',
  skill: 'text-violet-400',
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
// Thinking streams often use single line breaks instead of blank lines. By
// default CommonMark collapses a lone `\n` into a space, which flattens the
// reasoning into an unreadable wall of text — `remarkBreaks` keeps those
// breaks visible without touching how normal assistant prose renders.
const reasoningPlugins = [remarkGfm, remarkMath, remarkBreaks];

const hasArabicText = (text: string): boolean => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

const richTextDirection = (text: string): { dir: 'rtl' | 'auto'; lang?: string } =>
  hasArabicText(text) ? { dir: 'rtl', lang: 'ar' } : { dir: 'auto' };

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

type ToolInputRecord = Record<string, unknown>;

interface ToolInputDetails {
  commands: string[];
  paths: string[];
  skills: string[];
  fields: Array<{ label: string; value: string; icon: string }>;
  raw: string;
}

const toolInputLabels: Record<string, string> = {
  cwd: 'Working folder',
  directory: 'Folder',
  dir: 'Folder',
  query: 'Search for',
  pattern: 'Pattern',
  url: 'Web address',
  description: 'Description',
  task: 'Task',
  content: 'Content',
  recursive: 'Search subfolders',
  timeout: 'Timeout',
};

const isToolInputRecord = (value: unknown): value is ToolInputRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readableToolInputValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, 4)
      .map((item) => readableToolInputValue(item))
      .join(', ');
  }
  if (isToolInputRecord(value)) {
    const path = value.path ?? value.filePath ?? value.name;
    if (typeof path === 'string') return path;
  }
  return formatToolInput(value).replace(/\s+/g, ' ').trim();
};

const stringListFromInput = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readableToolInputValue(item))
    .filter(Boolean);
};

const skillNamesFromInput = (input: unknown): string[] => {
  if (typeof input === 'string' && input.trim()) return [input.trim()];
  if (!isToolInputRecord(input)) return [];
  const candidates = [input.skills, input.skillNames, input.skillName, input.skill_name, input.skill, input.name];
  return [...new Set(candidates.flatMap((candidate) => stringListFromInput(candidate)).filter(Boolean))];
};

const getToolInputDetails = (name: string, input: unknown): ToolInputDetails => {
  const raw = formatToolInput(input);
  const skills = name === 'skills' || name === 'skill' ? skillNamesFromInput(input) : [];
  if (!isToolInputRecord(input)) {
    return {
      commands: [],
      paths: [],
      skills,
      fields: raw && skills.length === 0 ? [{ label: 'Details', value: raw, icon: 'lucide:info' }] : [],
      raw,
    };
  }

  const commandValue = input.commands ?? input.command ?? input.cmd;
  const commands = stringListFromInput(commandValue);
  const pathKeys = ['paths', 'files', 'filePaths', 'path', 'filePath', 'directory', 'dir'];
  const paths = pathKeys.flatMap((key) => stringListFromInput(input[key]));
  const handledKeys = new Set([
    'commands', 'command', 'cmd', ...pathKeys,
    ...(skills.length > 0 ? ['skills', 'skillNames', 'skillName', 'skill_name', 'skill', 'name'] : []),
  ]);
  const fields = Object.entries(input)
    .filter(([key, value]) => !handledKeys.has(key) && value != null)
    .map(([key, value]) => ({
      label: toolInputLabels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()),
      value: readableToolInputValue(value),
      icon: key === 'url' ? 'lucide:globe-2' : key === 'query' || key === 'pattern' ? 'lucide:search' : 'lucide:sliders-horizontal',
    }));

  return { commands, paths: [...new Set(paths)], skills, fields, raw };
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

const markdownComponents = { code: CodeBlock } as const;

const UserBubble = React.memo(function UserBubble({ text, attachments = [] }: { text: string; attachments?: AgentAttachment[] }) {
  return (
  <div className="flex justify-end gap-2 animate-fade-in-up">
    <div className="max-w-[85%] rounded-2xl rounded-br-sm premium-surface !border-[var(--accent-border)] !bg-[var(--accent-light)]/25 px-3.5 py-2.5">
      <div className="agent-rich-text text-[12px] leading-relaxed text-[var(--text-primary)] markdown-body" {...richTextDirection(text)}>
        <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={markdownRehype} components={markdownComponents}>
          {text}
        </ReactMarkdown>
      </div>
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--accent-border)]/40 pt-2">
          {attachments.map((attachment) => (
            <span key={attachment.path} className="inline-flex max-w-full items-center gap-1 rounded-md bg-[var(--bg-main)]/45 px-1.5 py-1 font-mono text-[9px] text-[var(--text-secondary)]" title={attachment.path}>
              <Icon icon={attachment.kind === 'image' ? 'lucide:image' : 'lucide:file-text'} className="h-3 w-3 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <span className="max-w-44 truncate">{attachment.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
    <div className="w-6 h-6 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
      <Icon icon="lucide:user-round" className="h-3.5 w-3.5" aria-hidden="true" />
    </div>
  </div>
  );
});

const AgentAvatar: React.FC = () => (
  <div className="w-7 h-7 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-light)]/20 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_14px_-5px_var(--accent)] overflow-hidden">
    <img src={logo} alt="YzPzCode Agent" className="w-[18px] h-[18px] object-contain" draggable={false} />
  </div>
);

const ReasoningBlock = React.memo(function ReasoningBlock({ text, active }: { text: string; active?: boolean }) {
  // Reasoning is part of the story, not a footnote — start expanded and stay
  // expanded so users can read the agent's actual thinking even after the run
  // finishes (the pane toggle hides the blocks entirely if preferred).
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const reduceMotion = useReducedMotion();
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
    <div
      className={`premium-surface rounded-xl overflow-hidden transition-colors duration-150 ${
        active
          ? '!border-[var(--accent-border)] !bg-[var(--accent-light)]/10'
          : ''
      }`}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 cursor-pointer text-left hover:bg-[var(--bg-tertiary)]/50 transition-colors duration-100 group"
        >
          <span className={`relative flex items-center justify-center w-5 h-5 rounded-md shrink-0 ${active ? 'bg-[var(--accent-light)]/40' : 'bg-[var(--bg-tertiary)]'}`}>
            <svg className={`w-3 h-3 ${active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/60'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {active && (
              <span className="absolute inset-0 rounded-md border border-[var(--accent-border)]/50 animate-reasoning-ping" />
            )}
          </span>
          <span className="min-w-0">
            <span className={`block font-mono text-[9px] font-bold uppercase tracking-widest ${active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]/70'}`}>
              {active ? 'Thinking through the next step' : 'Reasoning'}
            </span>
            {!active && hasReasoning && (
              <span className="block font-mono text-[8px] normal-case tracking-normal text-[var(--text-secondary)]/45">
                {wordCount} word{wordCount === 1 ? '' : 's'}
              </span>
            )}
          </span>
          {active && (
            <span className="flex items-center gap-1 px-1.5 h-4 rounded-sm bg-[var(--accent-light)]/25 text-[var(--accent)] font-mono text-[8px] font-bold uppercase tracking-widest animate-fade-in shrink-0">
              <span className="typing-dot bg-current" style={{ animationDelay: '0ms' }} />
              <span className="typing-dot bg-current" style={{ animationDelay: '150ms' }} />
              <span className="typing-dot bg-current" style={{ animationDelay: '300ms' }} />
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            <svg className={`w-3.5 h-3.5 text-[var(--text-secondary)]/45 transition-transform duration-150 ${open ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {hasReasoning && !active && (
          <button
            type="button"
            onClick={() => void handleCopy()}
            title="Copy thinking text"
            className="shrink-0 self-center mr-2.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors duration-100 cursor-pointer"
          >
            {copied ? (
              <>
                <Icon icon="lucide:check" className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                copied
              </>
            ) : (
              <>
                <Icon icon="lucide:copy" className="h-3 w-3" aria-hidden="true" />
                copy
              </>
            )}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="mx-3 mb-2.5 rounded-md border border-[var(--border-primary)]/50 bg-[var(--bg-main)]/45 px-3 py-2.5"
            aria-live={active ? 'polite' : undefined}
          >
            {hasReasoning ? (
              <div className="agent-rich-text reasoning-body text-[11.5px] leading-relaxed text-[var(--text-secondary)] markdown-body" {...richTextDirection(text)}>
                <ReactMarkdown remarkPlugins={reasoningPlugins} rehypePlugins={markdownRehype} components={markdownComponents}>
                  {text}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-0.5 text-[10px] leading-relaxed text-[var(--text-secondary)]">
                <Icon icon="lucide:scan-text" className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                <span>Reviewing the request and preparing the next action.</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/** Human-readable tool parameters with raw transport data kept deliberately secondary. */
const ToolInputDetails: React.FC<{ name: string; input: unknown }> = ({ name, input }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const rawInputId = useId();
  const reduceMotion = useReducedMotion();
  const details = useMemo(() => getToolInputDetails(name, input), [name, input]);
  const hasSummary = details.commands.length > 0 || details.paths.length > 0 || details.skills.length > 0 || details.fields.length > 0;
  const entryMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } };

  const copyRaw = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(details.raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can be unavailable in an embedded webview.
    }
  };

  return (
    <motion.div
      {...entryMotion}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-2.5 px-0.5 py-0.5"
    >
      {details.skills.length > 0 && (
        <section aria-label="Skills applied by the agent">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
            <Icon icon="lucide:book-open-check" className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
            <span>{details.skills.length === 1 ? 'Skill applied' : `${details.skills.length} skills applied`}</span>
          </div>
          <div className="rounded-md border border-violet-500/15 bg-violet-500/[0.045] px-2.5 py-2">
            <div className="flex flex-wrap gap-1.5">
              {details.skills.map((skill, index) => (
                <motion.span
                  key={`${skill}-${index}`}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.16, delay: reduceMotion ? 0 : index * 0.035 }}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-1 font-mono text-[9.5px] text-violet-200"
                >
                  <Icon icon="lucide:bookmark-check" className="h-3 w-3" aria-hidden="true" />
                  {skill}
                </motion.span>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--text-secondary)]">
              The agent is following the specialized guidance from this skill for the current task.
            </p>
          </div>
        </section>
      )}

      {details.commands.length > 0 && (
        <section aria-label="Commands to run">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
            <Icon icon="lucide:terminal-square" className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
            <span>{details.commands.length === 1 ? 'Command' : `${details.commands.length} commands`}</span>
          </div>
          <div className="overflow-hidden rounded-md border border-emerald-500/15 bg-emerald-500/[0.045]">
            {details.commands.map((command, index) => (
              <motion.div
                key={`${command}-${index}`}
                initial={reduceMotion ? false : { opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.16, delay: reduceMotion ? 0 : index * 0.035 }}
                className="flex gap-2 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-[var(--text-primary)] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-emerald-500/10"
              >
                <span className="select-none text-emerald-500/70" aria-hidden="true">$</span>
                <code className="min-w-0 break-words">{command}</code>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {details.paths.length > 0 && (
        <section aria-label="Files and folders involved">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
            <Icon icon="lucide:files" className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            <span>{details.paths.length === 1 ? 'File or folder' : `${details.paths.length} files or folders`}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {details.paths.map((path, index) => (
              <motion.span
                key={`${path}-${index}`}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.16, delay: reduceMotion ? 0 : index * 0.03 }}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-sky-500/15 bg-sky-500/[0.045] px-2 py-1.5 font-mono text-[10px] text-[var(--text-secondary)]"
                title={path}
              >
                <Icon icon="lucide:file" className="h-3 w-3 shrink-0 text-sky-400" aria-hidden="true" />
                <span className="max-w-96 truncate">{path}</span>
              </motion.span>
            ))}
          </div>
        </section>
      )}

      {details.fields.length > 0 && (
        <section className="grid gap-1.5 sm:grid-cols-2" aria-label="Tool details">
          {details.fields.map((field, index) => (
            <motion.div
              key={field.label}
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.16, delay: reduceMotion ? 0 : index * 0.03 }}
              className="min-w-0 rounded-md bg-[var(--bg-tertiary)]/45 px-2.5 py-2"
            >
              <div className="mb-1 flex items-center gap-1.5 text-[9px] font-medium text-[var(--text-secondary)]/65">
                <Icon icon={field.icon} className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{field.label}</span>
              </div>
              <p className="break-words text-[10.5px] leading-relaxed text-[var(--text-primary)]">{field.value}</p>
            </motion.div>
          ))}
        </section>
      )}

      {!hasSummary && (
        <div className="flex items-center gap-2 rounded-md bg-[var(--bg-tertiary)]/40 px-2.5 py-2 text-[10.5px] text-[var(--text-secondary)]">
          <Icon icon="lucide:info" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>This step did not include additional parameters.</span>
        </div>
      )}

      {details.raw && (
        <div className="flex items-center justify-between border-t border-[var(--border-primary)]/55 pt-2">
          <span className="text-[9px] text-[var(--text-secondary)]/55">Technical details</span>
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={() => void copyRaw()}
              whileHover={reduceMotion ? undefined : { y: -1 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className="inline-flex items-center gap-1 text-[9px] font-medium text-[var(--text-secondary)]/65 transition-colors hover:text-[var(--text-primary)]"
            >
              <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} className="h-3 w-3" aria-hidden="true" />
              {copied ? 'Copied' : 'Copy'}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setShowRaw((value) => !value)}
              whileHover={reduceMotion ? undefined : { y: -1 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-tertiary)]/70 px-1.5 py-1 text-[9px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              aria-expanded={showRaw}
              aria-controls={`tool-raw-input-${name}-${rawInputId}`}
            >
              <Icon icon={showRaw ? 'lucide:chevron-up' : 'lucide:braces'} className="h-3 w-3" aria-hidden="true" />
              {showRaw ? 'Hide raw' : 'View raw'}
            </motion.button>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {showRaw && (
          <motion.div
            id={`tool-raw-input-${name}-${rawInputId}`}
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: reduceMotion ? 0 : 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden rounded-md border border-[var(--border-primary)]/70 bg-[var(--bg-tertiary)]/35"
          >
            <pre className="max-h-72 overflow-auto px-2.5 py-2 font-mono text-[9.5px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
              {details.raw}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const ToolBlock = React.memo(function ToolBlock({ name, input, result, running }: { name: string; input: unknown; result?: unknown; running?: boolean }) {
  // Show every tool's payload (commands, files, parameters) by default so the
  // user can see exactly what the agent ran without expanding each step.
  const editTool = isEditTool(name);
  const [open, setOpen] = useState(true);
  const [completionPulse, setCompletionPulse] = useState(false);
  const wasRunningRef = useRef(Boolean(running));
  const reduceMotion = useReducedMotion();
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const shouldAnimate = animationsEnabled && !reduceMotion;
  const visible = editTool || open;
  const accent = TOOL_ACCENT[name] ?? 'text-[var(--text-secondary)]';
  const appliedSkills = name === 'skills' || name === 'skill' ? skillNamesFromInput(input) : [];

  useEffect(() => {
    if (wasRunningRef.current && !running && shouldAnimate) {
      setCompletionPulse(true);
      const timer = window.setTimeout(() => setCompletionPulse(false), 520);
      wasRunningRef.current = false;
      return () => window.clearTimeout(timer);
    }
    wasRunningRef.current = Boolean(running);
    return undefined;
  }, [running, shouldAnimate]);

  return (
    <motion.div
      initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.992 } : false}
      animate={completionPulse ? { opacity: 1, y: 0, scale: [1, 1.008, 1] } : { opacity: 1, y: 0, scale: 1 }}
      transition={completionPulse
        ? { duration: 0.42, ease: [0.16, 1, 0.3, 1] }
        : { type: 'spring', stiffness: 360, damping: 28, mass: 0.72 }}
      className={`premium-surface relative overflow-hidden rounded-xl transition-colors duration-150 ${running ? '!border-[var(--accent-border)] !bg-[var(--accent-light)]/5' : ''}`}
    >
      <AnimatePresence initial={false}>
        {running && shouldAnimate && (
          <motion.span
            initial={{ opacity: 0, scaleY: 0.35 }}
            animate={{ opacity: [0.45, 1, 0.45], scaleY: [0.45, 1, 0.45] }}
            exit={{ opacity: 0, scaleY: 0.35 }}
            transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute inset-y-2 left-0 w-px origin-center bg-[var(--accent)]"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        onClick={() => {
          if (!editTool) setOpen((v) => !v);
        }}
        whileHover={reduceMotion ? undefined : { y: -1 }}
        whileTap={reduceMotion ? undefined : { scale: 0.99 }}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer transition-colors duration-100 ${running ? 'bg-[var(--accent-light)]/10' : 'hover:bg-[var(--bg-tertiary)]/60'}`}
        aria-expanded={visible}
      >
        <Icon icon={toolIcon[name] ?? 'lucide:wrench'} className={`h-3.5 w-3.5 shrink-0 ${accent}`} aria-hidden="true" />
        <span className={`text-[11px] font-medium ${running ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          {toolLabel(name)}
        </span>
        {appliedSkills.length > 0 && (
          <span className="min-w-0 truncate rounded-sm bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-300" title={appliedSkills.join(', ')}>
            {appliedSkills.join(', ')}
          </span>
        )}
        <AnimatePresence initial={false} mode="wait">
          {running ? (
            <motion.span
              key="working"
              initial={shouldAnimate ? { opacity: 0, x: -4 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={shouldAnimate ? { opacity: 0, x: 3 } : undefined}
              transition={{ duration: shouldAnimate ? 0.14 : 0 }}
              className="ml-auto flex items-center gap-1.5 shrink-0"
            >
              <motion.span
                animate={shouldAnimate ? { rotate: 360 } : undefined}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                className="flex h-3 w-3 items-center justify-center"
                aria-hidden="true"
              >
                <Icon icon="lucide:loader-circle" className="h-3 w-3 text-[var(--accent)]" />
              </motion.span>
              <span className="text-[10px] text-[var(--accent)]">Working</span>
            </motion.span>
          ) : (
            <motion.span
              key="done"
              initial={shouldAnimate ? { opacity: 0, scale: 0.86, x: -3 } : false}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={shouldAnimate ? { opacity: 0, x: 3 } : undefined}
              transition={{ type: 'spring', stiffness: 420, damping: 24, mass: 0.65 }}
              className="ml-auto flex items-center gap-1.5 shrink-0"
            >
              <Icon icon="lucide:check" className="h-3 w-3 text-emerald-500" aria-hidden="true" />
              <span className="text-[10px] text-[var(--text-secondary)]/50">Done</span>
            </motion.span>
          )}
        </AnimatePresence>
        <Icon icon={visible ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="ml-1 h-3 w-3 shrink-0 text-[var(--text-secondary)]/40" aria-hidden="true" />
      </motion.button>
      <AnimatePresence initial={false}>
        {visible && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-[var(--border-primary)]/70 bg-[var(--bg-main)] p-2"
          >
            {editTool ? <DiffView toolName={name} input={input} result={result} /> : <ToolInputDetails name={name} input={input} />}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const ToolResultBlock = React.memo(function ToolResultBlock({ content, isError }: { content: unknown; isError?: boolean }) {
  const [open, setOpen] = useState(false);
  const text = formatToolResult(content);
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
        <Icon icon={isError ? 'lucide:triangle-alert' : 'lucide:check'} className={`h-3 w-3 shrink-0 ${isError ? 'text-amber-500/80' : 'text-emerald-500/80'}`} aria-hidden="true" />
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
  return (
    <div className="rounded-lg border border-rose-500/25 bg-rose-950/10 px-3 py-2.5 animate-fade-in-up" role="alert">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:triangle-alert" className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-rose-400">
          The agent hit an error
        </span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--text-secondary)] break-words whitespace-pre-wrap max-h-32 overflow-y-auto">
        {message}
      </p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--text-secondary)]/60">
        Automatic recovery was already attempted. You can continue the task below, or the agent will pick up again on the next message.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {onContinue && (
          <button
            type="button"
            onClick={() => onContinue()}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)]/15 text-[var(--accent)] hover:bg-[var(--accent-light)]/30 font-mono text-[9px] font-bold uppercase tracking-widest transition-colors duration-100 cursor-pointer"
          >
            <Icon icon="lucide:refresh-cw" className="h-3 w-3" aria-hidden="true" />
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
  const icon = status.phase === 'failed' ? 'lucide:triangle-alert' : status.phase === 'completed' ? 'lucide:check-circle-2' : 'lucide:layers-3';
  const tone = status.phase === 'failed' ? 'text-rose-400 border-rose-500/30 bg-rose-500/5' : active ? 'text-[var(--accent)] border-[var(--accent-border)] bg-[var(--accent-light)]/10' : 'text-emerald-400 border-emerald-500/25 bg-emerald-500/5';
  const title = active ? 'Compacting conversation' : status.phase === 'completed' ? 'Conversation compacted' : status.phase === 'skipped' ? 'Context check complete' : 'Compaction needs attention';

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 animate-fade-in-up ${tone}`} aria-live="polite">
      <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-current/10 ${active ? 'animate-pulse' : ''}`}>
        <Icon icon={icon} className="h-3.5 w-3.5" aria-hidden="true" />
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
    return (
      <div className="agent-rich-text text-[12px] leading-relaxed text-[var(--text-primary)] markdown-body animate-fade-in-up" {...richTextDirection(block.text)}>
        <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={markdownRehype} components={markdownComponents}>
          {block.text}
        </ReactMarkdown>
      </div>
    );
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

export /**
 * Example prompts for first-time users. Clicking one sends it as a normal
 * message in the current mode — no need to know the tools or the mode system.
 */
const SUGGESTIONS: Array<{ prompt: string; hint: string; icon: string }> = [
  { prompt: "What's in this project?", hint: 'short summary', icon: 'lucide:book-open' },
  { prompt: 'Explain the code in simple words', hint: 'no jargon', icon: 'lucide:message-square-text' },
  { prompt: 'Find any bugs and fix them', hint: 'review + fix', icon: 'lucide:bug' },
  { prompt: 'Make the tests pass', hint: 'run + fix failures', icon: 'lucide:flask-conical' },
  { prompt: 'Add a new feature', hint: 'describe what you want', icon: 'lucide:sparkles' },
  { prompt: 'Summarize my recent changes', hint: 'git history', icon: 'lucide:git-commit-horizontal' },
];

const SuggestionGrid: React.FC<{ onSuggestion: (prompt: string) => void }> = ({ onSuggestion }) => (
  <div className="grid grid-cols-2 gap-2 w-full max-w-[420px] mt-5">
    {SUGGESTIONS.map((suggestion) => (
      <button
        key={suggestion.prompt}
        type="button"
        onClick={() => onSuggestion(suggestion.prompt)}
        className="group flex items-start gap-2 rounded-lg border border-[var(--border-primary)]/80 bg-[var(--bg-tertiary)]/30 px-2.5 py-2 text-left transition-all duration-100 hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)]/10 cursor-pointer"
      >
        <Icon icon={suggestion.icon} className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[10.5px] leading-snug text-[var(--text-primary)]">{suggestion.prompt}</span>
          <span className="mt-0.5 block font-mono text-[8.5px] uppercase tracking-wider text-[var(--text-secondary)]/50">
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
  onSuggestion,
  completed,
  elapsedSec,
  toolCount,
  autoScroll = true,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToLatestRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const showAgentReasoning = useAppStore((s) => s.showAgentReasoning);
  const showLiveReasoning = showAgentReasoning && (isThinking || streamingThinking.trim().length > 0);
  const hasNewContent =
    streamingText.length > 0 || streamingThinking.length > 0 || toolLog.length > 0 || !!activeTool || isThinking || !!pendingQuestion || !!compaction;
  const inlineToolIds = useMemo(() => new Set(
    messages.flatMap((message) => message.content
      .filter((block): block is Extract<ClineContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
      .map((block) => block.id)),
  ), [messages]);
  const unplacedToolLog = toolLog.filter((tool) => !inlineToolIds.has(tool.id));

  useEffect(() => {
    if (autoScroll && stickToLatestRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, streamingThinking, activeTool, toolLog, isThinking, pendingQuestion, notice, compaction, autoScroll]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const isAtLatest = container.scrollHeight - container.scrollTop - container.clientHeight < 72;
    stickToLatestRef.current = isAtLatest;
    setShowJumpToLatest((previous) => previous === !isAtLatest ? previous : !isAtLatest);
  };

  const jumpToLatest = () => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    stickToLatestRef.current = true;
    setShowJumpToLatest(false);
  };

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
        return <UserBubble key={i} text={text} attachments={attachments} />;
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
    <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto custom-scrollbar px-4 sm:px-6 py-5">
      {messages.length === 0 && !hasNewContent && (
        <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center space-y-4 opacity-80">
          <div className="relative">
            <div className="agent-ready-icon w-12 h-12 flex items-center justify-center">
              <img src={logo} alt="YzPzCode Agent" className="agent-ready-logo w-8 h-8 object-contain" draggable={false} />
            </div>
          </div>
          <div className="text-[13px] font-medium text-[var(--text-primary)]">
            <BlurText
              text="Ready when you are"
              animateBy="words"
              delay={90}
              stepDuration={0.4}
              easing={[0.16, 1, 0.3, 1]}
              className="justify-center text-center text-[16px] font-semibold tracking-tight text-[var(--text-primary)]"
            />
          </div>
          <p className="max-w-xs font-mono text-[10px] text-[var(--text-secondary)]/50">
            Just type what you want done — or tap an example below to get started.
          </p>
          {onSuggestion && (
            <>
              <SuggestionGrid onSuggestion={onSuggestion} />
              <p className="font-mono text-[9px] text-[var(--text-secondary)]/40">
                Tip: use Ask for questions · Act (default) to make changes · Plan to check first
              </p>
            </>
          )}
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
        {error && <ErrorCard message={error} onContinue={onContinue} />}
        {compaction && <CompactionStatusCard status={compaction} />}
        {showLiveReasoning && <ReasoningBlock key="live-reasoning" text={streamingThinking} active />}
        {unplacedToolLog.map((t) => (
          <div key={t.id} className="space-y-1.5">
            <ToolBlock name={t.name} input={t.input} result={t.result} running={t.status === 'running'} />
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
            <div className="agent-rich-text min-w-0 flex-1 text-[12px] leading-relaxed text-[var(--text-primary)] markdown-body" {...richTextDirection(streamingText)}>
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
            <Icon icon="lucide:check-circle-2" className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
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
      </div>
      {showJumpToLatest && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--accent-border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[10px] font-medium text-[var(--text-primary)] shadow-lg transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
};
