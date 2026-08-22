import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ChatCircle,
  CircleNotch,
  Clock,
  FileText,
  Image,
  Lightning,
  ListChecks,
  ListPlus,
  Paperclip,
  PaperPlaneRight,
  ShareNetwork,
  Square,
  Translate,
  X,
} from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { AgentAttachment, AgentMode, AgentQueuedPrompt } from '../../types';
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
  /** Prompts queued behind the running turn (shown in a strip above the composer). */
  queuedPrompts?: AgentQueuedPrompt[];
  onRemoveQueued?: (id: string) => void;
  onClearQueue?: () => void;
  replyTo?: string | null;
  onReplyConsumed?: () => void;
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
    icon: <ChatCircle size={14} className="shrink-0" aria-hidden="true" />,
  },
  {
    id: 'act',
    label: 'Act',
    title: 'Execute tools immediately',
    icon: <Lightning size={14} className="shrink-0" aria-hidden="true" />,
  },
  {
    id: 'plan',
    label: 'Plan',
    title: 'Plan first, then ask for approval before acting',
    icon: <ListChecks size={14} className="shrink-0" aria-hidden="true" />,
  },
  {
    id: 'orchestrator',
    label: 'Orchestrator',
    title: 'Lead agent orchestrates sub-agents across the workspace',
    icon: <ShareNetwork size={14} className="shrink-0" aria-hidden="true" />,
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
const MAX_AGENT_IMAGE_ENCODED_BYTES = 4_700_000;
const MAX_AGENT_IMAGE_DIMENSION = 2048;
const MAX_CLIPBOARD_FILE_BYTES = 25 * 1024 * 1024;
// Keep this in sync with the image media types accepted by the agent SDK.
// The canvas normalization below also lets providers receive common JPEG
// content when the original file is SVG/BMP/AVIF/TIFF/etc.
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/i;
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_SCRIPT = /[A-Za-z]/;

const attachmentName = (path: string): string => path.split(/[\\/]/).pop() || path;

const sanitizeAttachmentName = (name: string): string => {
  const fallback = name.toLowerCase().startsWith('image/') ? 'pasted-image.png' : 'pasted-file';
  const trimmed = name.trim() || fallback;
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || fallback;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const readImageDataUrl = async (path: string): Promise<string> => {
  return invoke<string>('read_file_as_base64', { path });
};

/**
 * Turn any browser-decodable local image into a small, provider-neutral JPEG.
 * The Cline media validator has a 5 MB encoded budget; keeping a little headroom
 * here avoids provider-specific data-URL headers pushing a borderline image
 * over that limit. The returned value is both the transport payload and the
 * compact thumbnail source shown in the transcript.
 */
const normalizeImageForAgent = async (path: string): Promise<string> => {
  const source = await readImageDataUrl(path);
  const sourcePayload = source.split(',', 2)[1] ?? '';
  if (
    /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(source) &&
    sourcePayload.length <= MAX_AGENT_IMAGE_ENCODED_BYTES
  ) {
    return source;
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new globalThis.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('The selected image could not be decoded.'));
    element.src = source;
  });
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('The selected image has no readable pixels.');
  }

  const scale = Math.min(1, MAX_AGENT_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the selected image.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.84, 0.72, 0.60, 0.48]) {
    const normalized = canvas.toDataURL('image/jpeg', quality);
    const payload = normalized.split(',', 2)[1] ?? '';
    if (payload.length <= MAX_AGENT_IMAGE_ENCODED_BYTES) return normalized;
  }
  throw new Error('The selected image is too detailed to fit the model media limit.');
};

/** Use the first written script to keep mixed technical prompts natural to edit. */
const promptDirection = (text: string): 'ltr' | 'rtl' => {
  for (const character of text) {
    if (ARABIC_SCRIPT.test(character)) return 'rtl';
    if (LATIN_SCRIPT.test(character)) return 'ltr';
  }
  return 'ltr';
};

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
  replyTo,
  onReplyConsumed,
}) => {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(value);

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

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!replyTo) return;
    setValue((current) => current || `> ${replyTo}\n\n`);
    onReplyConsumed?.();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [replyTo, onReplyConsumed]);

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
    if ((!prompt && attachments.length === 0) || disabled) return;
    const submittedAttachments = attachments;
    close();
    setValue('');
    setAttachments([]);
    setAttachmentNotice(null);
    try {
      await onSend(prompt, submittedAttachments);
    } catch (err) {
      console.error('[agent] send failed:', err);
      // Preserve work when IPC or the harness rejects a send. Functional
      // updates avoid overwriting anything typed while the request was in flight.
      setValue((current) => current || prompt);
      setAttachments((current) => {
        const seen = new Set(current.map((attachment) => attachment.path));
        return [...submittedAttachments.filter((attachment) => !seen.has(attachment.path)), ...current];
      });
      setAttachmentNotice(err instanceof Error ? err.message : 'The prompt could not be sent.');
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [value, attachments, disabled, onSend, close]);

  const handleAttach = useCallback(async () => {
    if (disabled) return;
    try {
      const selected = await open({ multiple: true, directory: false });
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
      const next = await Promise.all(paths.map(async (path): Promise<AgentAttachment> => {
        const kind = IMAGE_EXTENSION.test(path) ? 'image' : 'file';
        if (kind !== 'image') {
          return { path, name: attachmentName(path), kind };
        }

        // Normalize in the webview so oversized/less-common image formats are
        // reduced before crossing IPC. The sidecar still validates any path
        // fallback for callers that send attachments programmatically.
        let previewData: string | undefined;
        try {
          previewData = await normalizeImageForAgent(path);
        } catch {
          previewData = undefined;
        }
        return { path, name: attachmentName(path), kind, previewData };
      }));
      const usable = supportsImages ? next : next.filter((attachment) => attachment.kind !== 'image');
      if (usable.length !== next.length) {
        setAttachmentNotice('This model does not advertise image support. Attach a document or choose a vision model.');
      } else if (usable.some((attachment) => attachment.kind === 'image' && !attachment.previewData)) {
        setAttachmentNotice('The image preview could not be prepared. YZPZ will retry the original file when you send it.');
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

  const handlePaste = useCallback(async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled || !workspacePath) return;
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;

    event.preventDefault();
    const accepted = files.filter((file) => file.size <= MAX_CLIPBOARD_FILE_BYTES);
    if (accepted.length !== files.length) {
      setAttachmentNotice('Some pasted files were skipped because they exceed the 25 MB limit.');
    }
    if (accepted.length === 0) return;

    try {
      const pasted = await Promise.all(accepted.map(async (file, index): Promise<AgentAttachment> => {
        const name = sanitizeAttachmentName(file.name || (file.type.startsWith('image/') ? 'pasted-image.png' : 'pasted-file'));
        const path = `${workspacePath}/.yzpzcode/attachments/${Date.now()}-${index}-${name}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        await invoke('write_file_bytes', { path, base64Data: toBase64(bytes) });
        const kind = file.type.startsWith('image/') ? 'image' : 'file';
        const previewData = kind === 'image' && bytes.length <= MAX_AGENT_IMAGE_ENCODED_BYTES
          ? `data:${file.type || 'image/png'};base64,${toBase64(bytes)}`
          : undefined;
        return { path, name, kind, previewData };
      }));
      const usable = supportsImages ? pasted : pasted.filter((attachment) => attachment.kind !== 'image');
      setAttachments((current) => {
        const seen = new Set(current.map((attachment) => attachment.path));
        return [...current, ...usable.filter((attachment) => !seen.has(attachment.path))];
      });
      if (usable.length !== pasted.length) {
        setAttachmentNotice('This model does not advertise image support, so pasted images were skipped.');
      } else if (usable.some((attachment) => attachment.kind === 'image' && !attachment.previewData)) {
        setAttachmentNotice('The pasted image is attached; its preview is too large to display.');
      } else if (accepted.length === files.length) {
        setAttachmentNotice(null);
      }
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : 'Could not attach the pasted file.');
    }
  }, [disabled, supportsImages, workspacePath]);

  const removeAttachment = useCallback((path: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.path !== path));
  }, []);

  const handleTranslate = useCallback(async () => {
    const prompt = value.trim();
    if (!prompt || disabled || isTranslating) return;

    setIsTranslating(true);
    setAttachmentNotice(null);
    try {
      const translated = await invoke<string>('translate_prompt_to_english', { text: prompt });
      // Do not overwrite a prompt the user has changed while the translation was in flight.
      if (valueRef.current === prompt) {
        setValue(translated);
        setAttachmentNotice('Translated to English — review the prompt, then send it when ready.');
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : 'Could not translate this prompt.');
    } finally {
      setIsTranslating(false);
    }
  }, [value, disabled, isTranslating]);

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

  const direction = promptDirection(value);

  return (
    <div className={`relative z-10 flex justify-center px-3 ${compact ? 'pt-1 pb-2' : 'pt-1.5 pb-3'}`}>
      <div
        className={`agent-input-island agent-composer app-surface app-surface--raised w-full overflow-hidden ${
          compact ? 'max-w-2xl' : 'max-w-4xl'
        } ${isRunning ? 'agent-input-island--active' : ''}`}
      >
      <header className={`agent-composer-toolbar flex items-center gap-2 ${compact ? 'px-2 pt-1.5 pb-1' : 'px-3 pt-2 pb-1.5'}`}>
      <div className="premium-segmented w-fit items-center gap-0.5 p-0.5">
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
              className={`premium-segmented-item flex items-center justify-center gap-1.5 rounded-lg border text-[11px] font-medium leading-none transition-all duration-150 ease-out cursor-pointer select-none active:scale-[0.97] ${
                compact ? 'h-6 px-2 text-[10px]' : 'h-8 px-2.5'
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
      </div>

        <div className="ml-auto flex items-center gap-1.5">
          {!compact && (
            <span className={`agent-composer-status inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] font-medium ${isRunning ? 'is-running' : ''}`}>
              <span className="agent-composer-status-dot" aria-hidden="true" />
              {isRunning ? 'Working' : 'Ready'}
            </span>
          )}
          {isRunning && (
            <button
              onClick={() => void onAbort()}
              title="Interrupt the running task and remove its queued prompts"
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border border-rose-500/25 bg-rose-500/[0.06] text-[10px] font-medium text-rose-400 transition-all duration-150 ease-out hover:border-rose-500/45 hover:bg-rose-500/[0.1] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/60 active:scale-[0.97] ${
                compact ? 'h-6 px-1.5' : 'h-8 px-2.5'
              }`}
            >
              <Square size={10} weight="fill" aria-hidden="true" />
              {!compact && 'Stop'}
            </button>
          )}
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
          className={`agent-input-keycap flex shrink-0 items-center justify-center gap-1.5 rounded-md cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-primary)] ${
            compact ? 'h-6 w-6' : 'h-8 px-2.5'
          } ${fastMode ? 'is-fast' : ''}`}
        >
          <Lightning size={14} className="shrink-0" aria-hidden="true" />
          {!compact && fastMode && (
            <span className="text-[10px] font-medium leading-none">Fast</span>
          )}
        </button>
      )}
        </div>
      </header>

      <div className={`agent-composer-body ${compact ? 'space-y-1.5 px-2 pt-1 pb-2' : 'space-y-2 px-3 pt-1.5 pb-2.5'}`}>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <span
              key={attachment.path}
              className="premium-chip inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border-primary)] bg-[var(--bg-main)] py-1 pl-2 pr-1 font-mono text-[9px] text-[var(--text-secondary)]"
              title={attachment.path}
            >
              {attachment.kind === 'image' ? <Image size={12} /> : <FileText size={12} />}
              <span className="max-w-40 truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(attachment.path)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[var(--text-secondary)]/60 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                title={`Remove ${attachment.name}`}
                aria-label={`Remove ${attachment.name}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {queuedPrompts && queuedPrompts.length > 0 && (
        <section className="agent-composer-queue overflow-hidden rounded-xl border" aria-label="Queued prompts">
          <div className="flex items-center gap-2.5 border-b border-[var(--border-primary)] px-3 py-2">
            <span className="agent-composer-queue-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
              <Clock size={14} weight="bold" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold leading-tight text-[var(--text-primary)]">Up next</span>
              <span className="block truncate text-[9px] leading-tight text-[var(--text-secondary)]">Held until the current task fully finishes</span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2.5">
              <span className="agent-composer-queue-count rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold tabular-nums">
                {queuedPrompts.length}
              </span>
              {onClearQueue && (
                <button
                  type="button"
                  onClick={() => void onClearQueue()}
                  className="cursor-pointer text-[9px] font-medium leading-none text-[var(--text-secondary)] transition-colors hover:text-rose-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/50"
                  title="Remove all queued prompts"
                >
                  Clear all
                </button>
              )}
            </span>
          </div>
          <ol className="max-h-32 overflow-y-auto divide-y divide-[var(--border-primary)]/70">
            {queuedPrompts.map((prompt, index) => (
              <li key={prompt.id} className="group flex items-center gap-2.5 px-3 py-2">
                <span className="w-5 shrink-0 font-mono text-[9px] font-medium tabular-nums text-[var(--text-secondary)]/60" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--text-primary)]">{prompt.prompt}</span>
                {prompt.attachmentCount > 0 && (
                  <span className="shrink-0 rounded-md bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-[8px] text-[var(--text-secondary)]">
                    {prompt.attachmentCount} file{prompt.attachmentCount === 1 ? '' : 's'}
                  </span>
                )}
                {onRemoveQueued && (
                  <button
                    type="button"
                    onClick={() => void onRemoveQueued(prompt.id)}
                    className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-secondary)]/50 opacity-60 transition-all group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-400 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/50"
                    title="Remove from queue"
                    aria-label={`Remove queued prompt: ${prompt.prompt}`}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {attachmentNotice && !compact && (
        <p role="status" className="m-0 px-1 text-[10px] leading-tight text-[var(--text-secondary)]/80">
          {attachmentNotice}
        </p>
      )}

      <div className={`agent-composer-compose flex items-center gap-2 rounded-xl border p-2 ${isRunning ? 'is-queueing' : ''}`}>
        <div
          className={`group/field relative flex flex-1 items-center overflow-hidden rounded-lg border border-transparent bg-transparent transition-all duration-150 ease-out cursor-text focus-within:outline-none ${
            disabled ? 'opacity-60' : ''
          }`}
        >
          <textarea
            ref={textareaRef}
            value={value}
            dir={direction}
            onChange={(e) => {
              update(e.target.value, e.target.selectionStart ?? 0);
              setValue(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onPaste={(event) => void handlePaste(event)}
            disabled={disabled}
            rows={1}
            style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
            placeholder={placeholder}
            className={`peer flex-1 resize-none overflow-y-auto bg-transparent px-2.5 py-2 text-[length:var(--agent-session-text-size)] leading-[1.6] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/55 focus:outline-none ${
              direction === 'rtl' ? 'text-right placeholder:text-right' : 'text-left placeholder:text-left'
            }`}
          />
          <kbd
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-[4px] border border-[var(--border-primary)] bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg-tertiary)] font-mono text-[10px] font-bold text-[var(--text-secondary)]/70 shadow-[inset_0_-1px_0_rgba(0,0,0,0.35),0_1px_1px_rgba(0,0,0,0.25)] transition-all duration-150 peer-focus:opacity-0 peer-not-placeholder-shown:opacity-0 ${
              direction === 'rtl' ? 'left-2.5' : 'right-2.5'
            } ${compact ? 'hidden' : ''}`}
          >
            /
          </kbd>
        </div>
        <button
          type="button"
          onClick={() => void handleTranslate()}
          disabled={disabled || !value.trim() || isTranslating}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-secondary)] transition-colors hover:border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          title={
            isTranslating
              ? 'Translating prompt to English…'
              : value.trim()
                ? 'Translate prompt to English'
                : 'Type a prompt to translate it to English'
          }
          aria-label="Translate prompt to English"
        >
          {isTranslating ? <CircleNotch size={16} weight="bold" className="animate-spin" /> : <Translate size={16} />}
        </button>
        <button
          type="button"
          onClick={() => void handleAttach()}
          disabled={disabled}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-secondary)] transition-colors hover:border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          title="Attach images or files"
          aria-label="Attach images or files"
        >
          <Paperclip size={16} aria-hidden="true" />
        </button>
        <button
          onClick={() => void handleSend()}
          disabled={disabled || (!value.trim() && attachments.length === 0)}
          title={
            isRunning
              ? 'Agent is working — this prompt will be queued until the current task finishes'
              : value.trim()
                ? 'Send prompt (Enter)'
                : 'Type a prompt first'
          }
          className={`agent-composer-submit flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border text-[11px] font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
            isRunning ? 'is-queue' : 'is-send'
          } ${compact ? 'w-8 px-0' : 'px-3'}`}
        >
          {isRunning ? (
            <ListPlus size={14} aria-hidden="true" />
          ) : (
            <PaperPlaneRight size={14} weight="fill" aria-hidden="true" />
          )}
          {!compact && (isRunning ? 'Add to queue' : 'Send')}
        </button>
      </div>

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
    </div>
  );
};
