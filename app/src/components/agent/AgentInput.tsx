import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { open } from '@tauri-apps/plugin-dialog';
import type { AgentAttachment, AgentMode } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { useAgentMention } from '../../hooks/useAgentMention';
import type { MentionItem } from '../../hooks/useAgentMention';
import { AgentMentionMenu } from './AgentMentionMenu';

interface AgentInputProps {
  disabled?: boolean;
  isRunning: boolean;
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  onSend: (prompt: string, attachments?: AgentAttachment[]) => Promise<void> | void;
  onAbort: () => Promise<void> | void;
  placeholder?: string;
  /** Icon-only mode tabs (used when the pane is minimal or short). */
  compact?: boolean;
  /** Models advertise vision inconsistently; only block images when we know it is unavailable. */
  supportsImages?: boolean;
  /** Fast mode: forces the agent to skip extra thinking and work as fast as possible. */
  fastMode?: boolean;
  onToggleFastMode?: () => void;
}

const MODE_ORDER: AgentMode[] = ['ask', 'act', 'plan', 'orchestrator'];

const MODE_TABS: Array<{
  id: AgentMode;
  label: string;
  title: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'ask',
    label: 'Ask',
    title: 'Answer questions without editing files (read-only)',
    icon: <Icon icon="material-symbols:chat-bubble-rounded" className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
  },
  {
    id: 'act',
    label: 'Act',
    title: 'Execute tools immediately',
    icon: <Icon icon="material-symbols:bolt-rounded" className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
  },
  {
    id: 'plan',
    label: 'Plan',
    title: 'Plan first, then ask for approval before acting',
    icon: <Icon icon="material-symbols:checklist-rounded" className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
  },
  {
    id: 'orchestrator',
    label: 'Orchestrator',
    title: 'Lead agent orchestrates sub-agents across the workspace',
    icon: <Icon icon="material-symbols:hub-rounded" className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
  },
];

/** Per-mode static Tailwind styles (literal strings so they survive purging). */
const MODE_STYLES: Record<AgentMode, {
  active: string;
  idle: string;
  dot: string;
  field: string;
  focus: string;
  send: string;
}> = {
  ask: {
    active:
      'bg-sky-500/25 border-sky-400/50 text-sky-300 shadow-[inset_0_1px_0_rgba(56,189,248,0.15),0_0_14px_-4px_rgba(56,189,248,0.35)]',
    idle: 'text-[var(--text-secondary)] hover:text-sky-300 hover:bg-sky-500/10 hover:shadow-[0_0_12px_-4px_rgba(56,189,248,0.4)]',
    dot: 'bg-sky-400',
    field: 'border-[var(--border-primary)] hover:border-sky-500/40 focus-within:border-sky-500/60 focus-within:bg-sky-500/[0.04] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_16px_-6px_rgba(56,189,248,0.4)]',
    focus:
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400/60 focus-visible:bg-sky-500/10 focus-visible:text-sky-300',
    send: 'bg-sky-500 border border-sky-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)]',
  },
  act: {
    active:
      'bg-emerald-500/25 border-emerald-400/50 text-emerald-300 shadow-[inset_0_1px_0_rgba(52,211,153,0.15),0_0_14px_-4px_rgba(52,211,153,0.35)]',
    idle: 'text-[var(--text-secondary)] hover:text-emerald-300 hover:bg-emerald-500/10 hover:shadow-[0_0_12px_-4px_rgba(52,211,153,0.4)]',
    dot: 'bg-emerald-400',
    field: 'border-[var(--border-primary)] hover:border-emerald-500/40 focus-within:border-emerald-500/60 focus-within:bg-emerald-500/[0.04] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_16px_-6px_rgba(52,211,153,0.4)]',
    focus:
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/60 focus-visible:bg-emerald-500/10 focus-visible:text-emerald-300',
    send: 'bg-emerald-500 border border-emerald-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)]',
  },
  plan: {
    active:
      'bg-amber-500/25 border-amber-400/50 text-amber-300 shadow-[inset_0_1px_0_rgba(251,191,36,0.15),0_0_14px_-4px_rgba(251,191,36,0.35)]',
    idle: 'text-[var(--text-secondary)] hover:text-amber-300 hover:bg-amber-500/10 hover:shadow-[0_0_12px_-4px_rgba(251,191,36,0.4)]',
    dot: 'bg-amber-400',
    field: 'border-[var(--border-primary)] hover:border-amber-500/40 focus-within:border-amber-500/60 focus-within:bg-amber-500/[0.04] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_16px_-6px_rgba(251,191,36,0.4)]',
    focus:
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60 focus-visible:bg-amber-500/10 focus-visible:text-amber-300',
    send: 'bg-amber-500 border border-amber-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)]',
  },
  orchestrator: {
    active:
      'bg-violet-500/25 border-violet-400/50 text-violet-300 shadow-[inset_0_1px_0_rgba(167,139,250,0.15),0_0_14px_-4px_rgba(167,139,250,0.35)]',
    idle: 'text-[var(--text-secondary)] hover:text-violet-300 hover:bg-violet-500/10 hover:shadow-[0_0_12px_-4px_rgba(167,139,250,0.4)]',
    dot: 'bg-violet-400',
    field: 'border-[var(--border-primary)] hover:border-violet-500/40 focus-within:border-violet-500/60 focus-within:bg-violet-500/[0.04] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_16px_-6px_rgba(167,139,250,0.4)]',
    focus:
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/60 focus-visible:bg-violet-500/10 focus-visible:text-violet-300',
    send: 'bg-violet-500 border border-violet-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)]',
  },
};

const MIN_HEIGHT = 38;
const MAX_HEIGHT = 240;
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;

const attachmentName = (path: string): string => path.split(/[\\/]/).pop() || path;

export const AgentInput: React.FC<AgentInputProps> = ({
  disabled,
  isRunning,
  mode,
  onModeChange,
  onSend,
  onAbort,
  placeholder = 'Describe a task for YZPZ Agent…',
  compact = false,
  supportsImages = true,
  fastMode = false,
  onToggleFastMode,
}) => {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const workspacePath = useAppStore((s) => s.currentWorkspace?.path);
  const {
    mention,
    loading,
    selectedIndex,
    move,
    close,
    update,
    selectCurrent,
    setSelectedIndex,
  } = useAgentMention(workspacePath ?? '');

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    el.style.height = `${next}px`;
  }, []);

  // Re-grow after the browser paints the new content.
  useEffect(() => {
    const raf = requestAnimationFrame(autoGrow);
    return () => cancelAnimationFrame(raf);
  }, [value, autoGrow]);

  // Re-measure when the textarea width changes (grid/pane reflow) without
  // looping on the height changes we make ourselves.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    autoGrow();
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        autoGrow();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoGrow]);

  const handleSend = useCallback(async () => {
    const prompt = value.trim();
    if (!prompt || disabled || isRunning) return;
    close();
    setValue('');
    try {
      await onSend(prompt, attachments);
      setAttachments([]);
      setAttachmentNotice(null);
    } catch (err) {
      console.error('[agent] send failed:', err);
    }
  }, [value, attachments, disabled, isRunning, onSend, close]);

  const handleAttach = useCallback(async () => {
    if (disabled || isRunning) return;
    try {
      const selected = await open({ multiple: true, directory: false });
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
      const next = paths.map((path): AgentAttachment => ({
        path,
        name: attachmentName(path),
        kind: IMAGE_EXTENSION.test(path) ? 'image' : 'file',
      }));
      const usable = supportsImages ? next : next.filter((attachment) => attachment.kind !== 'image');
      if (usable.length !== next.length) {
        setAttachmentNotice('This model does not advertise image support. Attach a document or choose a vision model.');
      } else {
        setAttachmentNotice(null);
      }
      setAttachments((current) => {
        const seen = new Set(current.map((attachment) => attachment.path));
        return [...current, ...usable.filter((attachment) => !seen.has(attachment.path))];
      });
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : 'Could not attach the selected file.');
    }
  }, [disabled, isRunning, supportsImages]);

  const removeAttachment = useCallback((path: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.path !== path));
  }, []);

  const cycleMode = useCallback(
    (dir: 1 | -1) => {
      const idx = MODE_ORDER.indexOf(mode);
      const next = MODE_ORDER[(idx + dir + MODE_ORDER.length) % MODE_ORDER.length];
      onModeChange(next);
    },
    [mode, onModeChange]
  );

  /** Insert the selected mention (or a specific item from a mouse click). */
  const handleMentionSelect = useCallback(
    (item?: MentionItem) => {
      const sel = item ? { item, relPath: item.relPath } : selectCurrent();
      const el = textareaRef.current;
      const m = mention;
      if (!sel || !el || !m) return;
      // Read the live caret (not a ref) — arrow-key moves don't fire onChange,
      // so a stale cursorRef could select the wrong span.
      const cursorPos = Math.max(el.selectionStart, m.start);
      const inserted = sel.item.isDir ? `@${sel.relPath}/` : `@${sel.relPath}`;
      const next = value.slice(0, m.start) + inserted + value.slice(cursorPos);
      const pos = m.start + inserted.length;
      setValue(next);
      if (sel.item.isDir) {
        // Drill into the directory: recompute from the new value so the popup
        // lists its children with the filter reset.
        update(next, pos);
      } else {
        close();
      }
      requestAnimationFrame(() => {
        const t = textareaRef.current;
        if (!t) return;
        const clamped = Math.min(pos, t.value.length);
        t.focus();
        t.setSelectionRange(clamped, clamped);
        // Re-grow after the new content is painted.
        t.style.height = 'auto';
        t.style.height = `${Math.min(Math.max(t.scrollHeight, MIN_HEIGHT), MAX_HEIGHT)}px`;
      });
    },
    [value, mention, selectCurrent, update, close]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mention) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          void handleMentionSelect();
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          void handleMentionSelect();
          return;
        }
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        cycleMode(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [mention, move, close, handleMentionSelect, handleSend, cycleMode]
  );

  const style = MODE_STYLES[mode];
  const activeTab = MODE_TABS.find((t) => t.id === mode);

  return (
    <div className={`border-t border-[var(--border-primary)] bg-gradient-to-b from-[var(--bg-secondary)]/80 to-[var(--bg-main)] space-y-2 ${compact ? 'px-2 pt-1.5 pb-1.5' : 'px-3.5 pt-2.5 pb-2.5'}`}>
      {/* Mode tabs */}
      <div className={`flex items-center gap-0.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-main)] w-fit shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.3)] p-0.5`}>
        {MODE_TABS.map((tab) => {
          const active = mode === tab.id;
          if (compact && !active) return null;
          const tabStyle = MODE_STYLES[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => (compact ? cycleMode(1) : onModeChange(tab.id))}
              title={tab.title}
              aria-label={tab.label}
              className={`electric-btn flex items-center justify-center gap-1 rounded-md border font-mono text-[9px] font-bold uppercase tracking-widest transition-all duration-150 ease-out cursor-pointer select-none active:scale-[0.96] ${
                compact ? 'px-2 h-6 text-[8px]' : 'px-2 h-8'
              } ${
                active
                  ? tabStyle.active
                  : `border-transparent ${tabStyle.idle}`
              } ${tabStyle.focus}`}
            >
              {active && !compact && <span className={`w-1.5 h-1.5 rounded-full ${tabStyle.dot}`} />}
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1 pl-1.5 border-l border-[var(--border-primary)]/60">
          {onToggleFastMode && (
            <button
              type="button"
              onClick={() => onToggleFastMode()}
              title={
                fastMode
                  ? 'Fast mode is ON — the agent skips extra thinking and works as fast as possible. Click to turn off.'
                  : 'Fast mode: the agent skips extra thinking and completes the task as fast as possible.'
              }
              aria-pressed={fastMode}
              className={`electric-btn electric-charge relative flex items-center justify-center gap-1 rounded-md border transition-all duration-100 cursor-pointer select-none active:scale-[0.96] ${
                compact ? 'px-1.5 h-6' : 'px-2 h-8'
              } ${fastMode ? 'agent-fast-active' : ''}`}
            >
              <Icon icon="lucide:zap" className="electric-icon h-3.5 w-3.5" aria-hidden="true" />
              {!compact && fastMode && (
                <span className="font-mono text-[8px] font-bold uppercase tracking-widest">fast</span>
              )}
              {/* Active indicator: small amber charge dot so ON/OFF is obvious */}
              <span
                className={`absolute w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)] transition-opacity duration-150 ${
                  compact ? 'top-0 right-0' : 'top-0.5 right-0.5'
                } ${fastMode ? 'opacity-100' : 'opacity-0'}`}
                aria-hidden="true"
              />
            </button>
          )}
          {isRunning && !compact && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--accent)] animate-pulse">
              ● running
            </span>
          )}
          <button
            onClick={() => void onAbort()}
            disabled={!isRunning}
            title={isRunning ? 'Abort the running agent' : 'Nothing to abort'}
            className={`rounded-md border font-mono font-bold uppercase tracking-widest transition-all duration-150 ease-out cursor-pointer select-none active:scale-[0.96] ${
              compact ? 'px-1.5 h-6 text-[8px]' : 'px-2.5 h-8 text-[9px]'
            } ${
              isRunning
                ? 'border-rose-900/50 text-rose-500 hover:bg-rose-950/30 hover:text-rose-400 hover:shadow-[0_0_12px_-4px_rgba(244,63,94,0.45)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/60'
                : 'border-transparent text-[var(--text-secondary)]/40 cursor-not-allowed'
            }`}
          >
            Abort
          </button>
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <span
              key={attachment.path}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-main)] py-1 pl-1.5 pr-1 font-mono text-[9px] text-[var(--text-secondary)]"
              title={attachment.path}
            >
              <Icon icon={attachment.kind === 'image' ? 'material-symbols:image-rounded' : 'material-symbols:description-rounded'} className="h-3 w-3 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <span className="max-w-40 truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(attachment.path)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[var(--text-secondary)]/60 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                title={`Remove ${attachment.name}`}
                aria-label={`Remove ${attachment.name}`}
              >
                <Icon icon="material-symbols:close-rounded" className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Prompt field + send */}
      <div className="flex items-end gap-2">
        <div
          className={`group/field relative flex flex-1 items-center overflow-hidden rounded-lg border bg-[var(--bg-main)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-150 ease-out cursor-text focus-within:outline-none ${
            disabled || isRunning ? 'opacity-60' : ''
          } ${style.field}`}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              update(e.target.value, e.target.selectionStart ?? 0);
              setValue(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled || isRunning}
            rows={1}
            style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
            placeholder={placeholder}
            className="peer flex-1 resize-none overflow-y-auto bg-transparent py-2 pl-3 pr-8 font-mono text-[11px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/40 focus:outline-none"
          />
          <kbd
            className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-[4px] border border-[var(--border-primary)] bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg-tertiary)] font-mono text-[10px] font-bold text-[var(--text-secondary)]/70 shadow-[inset_0_-1px_0_rgba(0,0,0,0.35),0_1px_1px_rgba(0,0,0,0.25)] transition-all duration-150 peer-focus:opacity-0 peer-not-placeholder-shown:opacity-0 ${compact ? 'hidden' : ''}`}
          >
            /
          </kbd>
          <Icon
            icon="material-symbols:search-rounded"
            className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]/70 opacity-0 scale-90 transition-all duration-150 peer-not-placeholder-shown:opacity-100 peer-not-placeholder-shown:scale-100 ${compact ? 'hidden' : ''}`}
            aria-hidden="true"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleAttach()}
          disabled={disabled || isRunning}
          className="electric-btn flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-primary)] bg-[var(--bg-main)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)]/15 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
          title="Attach images or files"
          aria-label="Attach images or files"
        >
          <Icon icon="material-symbols:attach-file-rounded" className="electric-icon h-4 w-4" aria-hidden="true" />
        </button>
        <button
          onClick={() => void handleSend()}
          disabled={disabled || isRunning || !value.trim()}
          title={isRunning ? 'Agent is running' : value.trim() ? 'Send prompt (Enter)' : 'Type a prompt first'}
          className={`electric-btn flex items-center gap-1.5 h-9 rounded-lg text-white font-mono text-[10px] font-bold uppercase tracking-widest transition-all duration-100 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 ${compact ? 'px-2.5' : 'px-3.5'} ${style.send}`}
        >
          <svg className="electric-icon w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          {!compact && 'Send'}
        </button>
      </div>

      {/* Helper footer */}
      {!compact && (
        <div className="flex items-center gap-2 px-0.5">
          <span className="truncate font-mono text-[9px] text-[var(--text-secondary)]/60">
            {attachmentNotice ?? activeTab?.title}
          </span>
          <span className="ml-auto flex items-center gap-2.5 shrink-0 font-mono text-[8px] uppercase tracking-widest text-[var(--text-secondary)]/40">
            <span>Tab ⇥ switch mode</span>
            <span className="hidden sm:inline">Enter send</span>
            <span className="hidden md:inline">Shift+Enter newline</span>
          </span>
        </div>
      )}

      {/* `@` file-mention dropdown (portal-rendered, never clipped by the pane) */}
      {mention && (
        <AgentMentionMenu
          anchorRef={textareaRef}
          items={mention.items}
          selectedIndex={selectedIndex}
          filter={mention.filter}
          basePath={mention.basePath}
          loading={loading}
          onSelect={(item) => handleMentionSelect(item)}
          onHover={setSelectedIndex}
          onClose={close}
        />
      )}
    </div>
  );
};
