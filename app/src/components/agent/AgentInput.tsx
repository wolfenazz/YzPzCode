import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { open } from '@tauri-apps/plugin-dialog';
import type { AgentAttachment, AgentMode, AgentQueuedPrompt } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { useAgentMention } from '../../hooks/useAgentMention';
import type { MentionItem } from '../../hooks/useAgentMention';
import { AgentMentionMenu } from './AgentMentionMenu';
import Strands from '../effects/Strands';

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
  /** Prompts queued behind the running turn (shown in a strip above the composer). */
  queuedPrompts?: AgentQueuedPrompt[];
  onRemoveQueued?: (id: string) => void;
  onClearQueue?: () => void;
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

/** Per-mode static Tailwind styles (literal strings so they survive purging).
    Selected tabs keep neutral chrome — the mode's accent colour + soft glow
    live on the icon only (see .premium-segmented-item[data-mode] in styles.css). */
const MODE_STYLES: Record<AgentMode, {
  active: string;
  idle: string;
  field: string;
  focus: string;
  send: string;
}> = {
  ask: {
    active: 'is-active bg-[var(--bg-tertiary)]! border-transparent text-[var(--text-primary)]!',
    idle: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    field: 'border-[var(--border-primary)]',
    focus:
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-primary)] focus-visible:text-[var(--text-primary)]',
    send: 'bg-sky-500 border border-sky-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)]',
  },
  act: {
    active: 'is-active bg-[var(--bg-tertiary)]! border-transparent text-[var(--text-primary)]!',
    idle: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    field: 'border-[var(--border-primary)]',
    focus:
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-primary)] focus-visible:text-[var(--text-primary)]',
    send: 'bg-emerald-500 border border-emerald-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)]',
  },
  plan: {
    active: 'is-active bg-[var(--bg-tertiary)]! border-transparent text-[var(--text-primary)]!',
    idle: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    field: 'border-[var(--border-primary)]',
    focus:
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-primary)] focus-visible:text-[var(--text-primary)]',
    send: 'bg-amber-500 border border-amber-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)]',
  },
  orchestrator: {
    active: 'is-active bg-[var(--bg-tertiary)]! border-transparent text-[var(--text-primary)]!',
    idle: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    field: 'border-[var(--border-primary)]',
    focus:
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-primary)] focus-visible:text-[var(--text-primary)]',
    send: 'bg-violet-500 border border-violet-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.35)]',
  },
};

const MIN_HEIGHT = 38;
const MAX_HEIGHT = 240;
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;

/** How long after the last keystroke the orb keeps spinning before winding down. */
const TYPING_IDLE_MS = 1400;

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
  queuedPrompts,
  onRemoveQueued,
  onClearQueue,
}) => {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Clear the typing debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, []);

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
    if (!prompt || disabled) return;
    close();
    setValue('');
    try {
      await onSend(prompt, attachments);
      setAttachments([]);
      setAttachmentNotice(null);
    } catch (err) {
      console.error('[agent] send failed:', err);
    }
  }, [value, attachments, disabled, onSend, close]);

  const handleAttach = useCallback(async () => {
    if (disabled) return;
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
    /* Floating composer island — centered on the bottom of the session pane
       instead of a full-width footer, so it reads as a premium surface. */
    <div className={`relative z-10 flex justify-center px-3 ${compact ? 'pt-1 pb-2' : 'pt-1.5 pb-3'}`}>
      <div
        className={`agent-input-island w-full space-y-2 bg-gradient-to-b from-[var(--bg-secondary)]/90 to-[var(--bg-main)] ${
          compact ? 'max-w-2xl px-2 py-1.5' : 'max-w-3xl px-3.5 py-2.5'
        } ${isRunning ? 'agent-input-island--active' : ''}`}
      >
      {/* Mode tabs + isolated fast keycap — the fast toggle floats outside
          the segmented control as its own 3D key. */}
      <div className="flex items-center justify-between gap-2">
      <div className={`premium-segmented w-fit rounded-xl! items-center gap-0.5 p-0.5`}>
        {MODE_TABS.map((tab) => {
          const active = mode === tab.id;
          if (compact && !active) return null;
          const tabStyle = MODE_STYLES[tab.id];
          return (
            <button
              key={tab.id}
              data-mode={tab.id}
              onClick={() => (compact ? cycleMode(1) : onModeChange(tab.id))}
              title={tab.title}
              aria-label={tab.label}
              aria-selected={active}
              className={`premium-segmented-item flex items-center justify-center gap-1.5 rounded-lg border font-mono text-[9px] font-bold uppercase leading-none tracking-[0.08em] transition-all duration-150 ease-out cursor-pointer select-none active:scale-[0.96] ${
                compact ? 'px-2 h-6 text-[8px]' : 'px-2 h-8'
              } ${
                active
                  ? `is-active ${tabStyle.active}`
                  : `border-transparent ${tabStyle.idle}`
              } ${tabStyle.focus}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1 pl-1.5 border-l border-[var(--border-primary)]/60">
          {isRunning && !compact && (
            <span className="font-mono text-[9px] uppercase leading-none tracking-[0.08em] text-[var(--accent)] animate-pulse">
              ● running
            </span>
          )}
          <button
            onClick={() => void onAbort()}
            disabled={!isRunning}
            title={isRunning ? 'Interrupt the running task (also drops queued prompts)' : 'Nothing to interrupt'}
            className={`flex items-center gap-1 rounded-lg border font-mono font-bold uppercase tracking-widest transition-all duration-150 ease-out cursor-pointer select-none active:scale-[0.96] ${
              compact ? 'px-1.5 h-6 text-[8px]' : 'px-2.5 h-8 text-[9px]'
            } ${
              isRunning
                ? 'border-rose-900/50 text-rose-500 hover:bg-rose-950/30 hover:text-rose-400 hover:shadow-[0_0_12px_-4px_rgba(244,63,94,0.45)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/60'
                : 'border-transparent text-[var(--text-secondary)]/40 cursor-not-allowed'
            }`}
          >
            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
            {!compact && 'Stop'}
          </button>
        </div>
      </div>

      {/* Isolated fast-mode keycap — deliberately outside the segmented
          control. Clean 3D key face (no beams/bloom); only the zap icon
          carries the amber charge when fast is ON. */}
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
          aria-label="Toggle fast mode"
          className={`agent-input-keycap flex shrink-0 items-center justify-center gap-1 rounded-lg cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-primary)] ${
            compact ? 'h-6 w-6' : 'h-8 px-2'
          } ${fastMode ? 'is-fast' : ''}`}
        >
          <Icon icon="lucide:zap" className="electric-icon h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {!compact && fastMode && (
            <span className="font-mono text-[8px] font-bold uppercase leading-none tracking-[0.08em]">fast</span>
          )}
        </button>
      )}
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <span
              key={attachment.path}
              className="premium-chip inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border-primary)] bg-[var(--bg-main)] py-1 pl-2 pr-1 font-mono text-[9px] text-[var(--text-secondary)]"
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

      {/* Queued prompts strip — shown while the agent works so follow-up
          messages are visible and cancellable before they run. */}
      {queuedPrompts && queuedPrompts.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[var(--accent-border)]/45 bg-[var(--accent-light)]/[0.06]">
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-[var(--border-primary)]/50">
            <Icon icon="lucide:list-plus" className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <span className="truncate font-mono text-[9px] font-bold uppercase leading-none tracking-[0.08em] text-[var(--text-secondary)]">
              {queuedPrompts.length} queued — runs after the current task
            </span>
            <span className="ml-auto flex items-center gap-2.5 shrink-0">
              {isRunning && (
                <button
                  type="button"
                  onClick={() => void onAbort()}
                  className="flex items-center gap-1 font-mono text-[9px] font-medium uppercase leading-none tracking-[0.08em] text-rose-500/80 transition-colors hover:text-rose-400 cursor-pointer"
                  title="Interrupt the running task (also drops queued prompts)"
                >
                  <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                  Stop
                </button>
              )}
              {onClearQueue && (
                <button
                  type="button"
                  onClick={() => void onClearQueue()}
                  className="font-mono text-[9px] font-medium uppercase leading-none tracking-[0.08em] text-[var(--text-secondary)]/60 transition-colors hover:text-rose-400 cursor-pointer"
                  title="Remove all queued prompts"
                >
                  Clear all
                </button>
              )}
            </span>
          </div>
          <ul className="max-h-28 overflow-y-auto divide-y divide-[var(--border-primary)]/40">
            {queuedPrompts.map((prompt) => (
              <li key={prompt.id} className="group flex items-center gap-2 px-2.5 py-1.5">
                <Icon icon="lucide:clock" className="h-3 w-3 shrink-0 text-[var(--text-secondary)]/40" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-primary)]">{prompt.prompt}</span>
                {prompt.attachmentCount > 0 && (
                  <span className="shrink-0 rounded-sm bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono text-[8px] text-[var(--text-secondary)]/70">
                    {prompt.attachmentCount} att
                  </span>
                )}
                {onRemoveQueued && (
                  <button
                    type="button"
                    onClick={() => void onRemoveQueued(prompt.id)}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[var(--text-secondary)]/40 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--bg-tertiary)] hover:text-rose-400 cursor-pointer"
                    title="Remove from queue"
                    aria-label={`Remove queued prompt: ${prompt.prompt}`}
                  >
                    <Icon icon="material-symbols:close-rounded" className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Prompt field + send */}
      <div className="flex items-end gap-2">
        <div
          className={`group/field relative flex flex-1 items-center overflow-hidden rounded-lg border bg-[var(--bg-main)] transition-all duration-150 ease-out cursor-text focus-within:outline-none ${
            disabled ? 'opacity-60' : ''
          } ${style.field}`}
        >
          {/* Strands slot — woven glowing strands on the left of the prompt
              field. Idle: a straight, softly glowing line. Typing: the
              strands wake up and the glow builds until they flow at full
              energy; a short pause glides them back to the resting line. */}
          <div
            className={`ml-2 mr-1.5 h-9 w-9 shrink-0 transition-opacity duration-300 ${
              typing ? 'opacity-100' : 'opacity-80'
            }`}
            aria-hidden="true"
          >
            <Strands
              active={typing}
              colors={['#9C43FE', '#4CC2E9', '#F97316']}
              count={3}
              speed={0.5}
              amplitude={1.1}
              waviness={1}
              thickness={0.7}
              glow={2.8}
              taper={3}
              spread={1}
              intensity={0.6}
              saturation={1.5}
              opacity={1}
              scale={1.4}
            />
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              update(e.target.value, e.target.selectionStart ?? 0);
              setValue(e.target.value);
              setTyping(true);
              if (typingTimer.current) clearTimeout(typingTimer.current);
              typingTimer.current = setTimeout(() => setTyping(false), TYPING_IDLE_MS);
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
            placeholder={placeholder}
            className="peer flex-1 resize-none overflow-y-auto bg-transparent py-2 pl-2 pr-8 font-mono text-[length:var(--agent-session-text-size)] leading-[1.6] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/45 focus:outline-none"
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
          disabled={disabled}
          className="electric-btn flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-primary)] bg-[var(--bg-main)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)]/15 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
          title="Attach images or files"
          aria-label="Attach images or files"
        >
          <Icon icon="material-symbols:attach-file-rounded" className="electric-icon h-4 w-4" aria-hidden="true" />
        </button>
        <button
          onClick={() => void handleSend()}
          disabled={disabled || !value.trim()}
          title={
            isRunning
              ? 'Agent is working — this prompt will be queued until the current task finishes'
              : value.trim()
                ? 'Send prompt (Enter)'
                : 'Type a prompt first'
          }
          className={`gradient-send-btn flex items-center gap-1.5 h-9 rounded-lg text-white font-mono text-[10px] font-bold uppercase leading-none tracking-[0.08em] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 ${compact ? 'px-2.5' : 'px-3.5'}`}
        >
          {isRunning ? (
            <Icon icon="lucide:list-plus" className="electric-icon w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <svg className="electric-icon w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
          {!compact && (isRunning ? 'Queue' : 'Send')}
        </button>
      </div>

      {/* Helper footer */}
      {!compact && (
        <div className="flex items-center gap-2 px-0.5 leading-none">
          <span className="truncate font-mono text-[10px] leading-none text-[var(--text-secondary)]/70">
            {attachmentNotice ?? activeTab?.title}
          </span>
          <span className="ml-auto flex items-center gap-2.5 shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] leading-none text-[var(--text-secondary)]/45">
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
    </div>
  );
};
