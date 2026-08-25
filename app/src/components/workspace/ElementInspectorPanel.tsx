import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Code,
  Copy,
  DeviceMobile,
  Fingerprint,
  Hash,
  MagicWand,
  PaperPlaneRight,
  PencilSimpleLine,
  Plus,
  SlidersHorizontal,
  Sparkle,
  Target,
  X,
} from '@phosphor-icons/react';
import type { BrowserSelectedElement, CliType, InspectorQuickPrompt, InspectorQuickPromptGroup } from '../../types';
import { htmlToPlainText } from '../../utils/richText';
import { formatElementPrompt } from '../../utils/inspectorPrompt';
import { RichPromptEditor } from './RichPromptEditor';
import { useAppStore } from '../../stores/appStore';
import { AgentTargetSelect } from './AgentTargetSelect';

export interface SessionOption {
  id: string;
  label: string;
  agent: CliType | null;
  /** 'terminal' = a TTY/CLI agent session, 'yzpz' = a built-in YZPZ Agent session. */
  kind?: 'terminal' | 'yzpz';
}

interface ElementInspectorPanelProps {
  element: BrowserSelectedElement;
  pageTitle: string;
  targetSessionId: string | null;
  sessionOptions: SessionOption[];
  isSubmitting: boolean;
  deviceLabel: string;
  zoomFactor: number;
  initialHtml: string;
  instructionSlots: string[];
  activeInstructionSlot: number;
  onSelectSlot: (index: number) => void;
  onAddSlot: () => void;
  onRemoveSlot: (index: number) => void;
  onSend: (plainText?: string) => Promise<void> | void;
  onTargetSessionChange: (sessionId: string | null) => void;
  onDraftChange: (html: string) => void;
  onClear: () => void;
}

/** Maximum number of instruction slots the user can queue at once. */
const MAX_INSTRUCTION_SLOTS = 4;

const escapePromptHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const promptToHtml = (text: string): string => escapePromptHtml(text).replace(/\n/g, '<br>');

const PROMPT_GROUPS: { group: InspectorQuickPromptGroup; label: string; icon: React.ReactNode }[] = [
  { group: 'enhance', label: 'Enhance', icon: <Sparkle size={12} /> },
  { group: 'adjust', label: 'Adjust / Edit', icon: <SlidersHorizontal size={12} /> },
];

/** Shared card shell: rounded, theme-tinted surface with an icon header row. */
const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, title, meta, children }) => (
  <section className="overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]/60">
    <div className="flex items-center justify-between gap-2 border-b border-[var(--border-primary)]/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent-light)] text-[var(--accent)]">
          {icon}
        </span>
        <span className="text-[11px] font-semibold text-[var(--text-primary)]">{title}</span>
      </div>
      {meta}
    </div>
    <div className="p-3">{children}</div>
  </section>
);

const Meta: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 px-2.5 py-1.5">
    <div className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-secondary)]/60">{label}</div>
    <div
      className={`mt-0.5 truncate text-[10px] font-medium ${
        accent ? 'text-[var(--accent-text)]' : 'text-[var(--text-primary)]'
      }`}
      title={value}
    >
      {value}
    </div>
  </div>
);

export const ElementInspectorPanel = memo(function ElementInspectorPanel({
  element,
  pageTitle,
  targetSessionId,
  sessionOptions,
  isSubmitting,
  deviceLabel,
  zoomFactor,
  initialHtml,
  instructionSlots,
  activeInstructionSlot,
  onSelectSlot,
  onAddSlot,
  onRemoveSlot,
  onSend,
  onTargetSessionChange,
  onDraftChange,
  onClear,
}: ElementInspectorPanelProps) {
  const [showFullInfo, setShowFullInfo] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  const inspectorQuickPrompts = useAppStore((state) => state.inspectorQuickPrompts);

  useEffect(() => {
    setShowFullInfo(false);
  }, [element]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const attributeEntries = useMemo(() => Object.entries(element.attributes), [element.attributes]);

  const shownSelectors = useMemo(
    () => (showFullInfo ? element.selectors : element.selectors.slice(0, 2)),
    [element.selectors, showFullInfo],
  );

  const charCount = useMemo(() => htmlToPlainText(initialHtml).length, [initialHtml]);

  const filledSlotCount = useMemo(
    () => instructionSlots.filter((slot) => htmlToPlainText(slot).trim().length > 0).length,
    [instructionSlots],
  );

  /** The exact batched text the send button would dispatch to the agent. */
  const batchedPromptText = useMemo(() => {
    const texts = instructionSlots
      .map((slot) => htmlToPlainText(slot).trim())
      .filter((text) => text.length > 0);
    return texts.length > 1 ? texts.map((text, i) => `${i + 1}. ${text}`).join('\n\n') : (texts[0] ?? '');
  }, [instructionSlots]);

  const handleSend = useCallback(
    async (plainText?: string) => {
      if (isSubmitting) return;
      const text = (plainText ?? htmlToPlainText(initialHtml)).trim();
      if (!text) return;
      try {
        await onSend(text);
        onDraftChange('');
      } catch {
        // keep the draft so the user can retry
      }
    },
    [initialHtml, isSubmitting, onDraftChange, onSend],
  );

  const handleSelectSlot = useCallback(
    (index: number) => {
      if (index === activeInstructionSlot || index >= instructionSlots.length) return;
      onDraftChange(instructionSlots[activeInstructionSlot] ?? '');
      onSelectSlot(index);
    },
    [activeInstructionSlot, instructionSlots, onDraftChange, onSelectSlot],
  );

  const handleAddSlot = useCallback(() => {
    if (instructionSlots.length >= MAX_INSTRUCTION_SLOTS) return;
    onDraftChange(instructionSlots[activeInstructionSlot] ?? '');
    onAddSlot();
  }, [activeInstructionSlot, instructionSlots, onAddSlot, onDraftChange]);

  const handleRemoveSlot = useCallback(
    (index: number) => {
      if (instructionSlots.length <= 1) return;
      onRemoveSlot(index);
    },
    [instructionSlots.length, onRemoveSlot],
  );

  const handleCopyHtml = useCallback(() => {
    navigator.clipboard.writeText(element.htmlSnippet).catch(() => undefined);
  }, [element.htmlSnippet]);

  const handleCopyPrompt = useCallback(async () => {
    if (filledSlotCount === 0) return;
    const prompt = formatElementPrompt(element, batchedPromptText, deviceLabel, zoomFactor);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable — leave the button idle
    }
  }, [batchedPromptText, deviceLabel, element, filledSlotCount, zoomFactor]);

  const handleApplyPrompt = useCallback(
    (prompt: InspectorQuickPrompt) => {
      onDraftChange(promptToHtml(prompt.text));
    },
    [onDraftChange],
  );

  const promptsByGroup = useMemo(() => {
    const grouped: Record<InspectorQuickPromptGroup, InspectorQuickPrompt[]> = { enhance: [], adjust: [] };
    for (const prompt of inspectorQuickPrompts) {
      grouped[prompt.group] = grouped[prompt.group] ?? [];
      grouped[prompt.group].push(prompt);
    }
    return grouped;
  }, [inspectorQuickPrompts]);

  const countPill = (text: string) => (
    <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-0.5 text-[9px] font-medium text-[var(--text-secondary)]">
      {text}
    </span>
  );

  return (
    <aside
      className={`shrink-0 overflow-y-auto border-l border-[var(--border-primary)] bg-[var(--bg-secondary)] transition-[width] duration-200 ${
        showFullInfo ? 'w-[460px]' : 'w-[400px]'
      }`}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[var(--border-primary)] bg-[color-mix(in_srgb,var(--bg-tertiary)_88%,transparent)] px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xs font-semibold leading-4 text-[var(--text-primary)]">Element inspector</h2>
              <p className="truncate text-[9px] leading-3.5 text-[var(--text-secondary)]/70">
                {pageTitle || 'Untitled page'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowFullInfo((value) => !value)}
              title={showFullInfo ? 'Hide developer details' : 'Show developer details'}
              aria-label={showFullInfo ? 'Hide developer details' : 'Show developer details'}
              aria-pressed={showFullInfo}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition-colors cursor-pointer ${
                showFullInfo
                  ? 'border-[var(--accent-border)] bg-[var(--accent-light)] text-[var(--accent-text)]'
                  : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]'
              }`}
            >
              <DeviceMobile size={13} aria-hidden="true" />
              dev
            </button>
            <button
              type="button"
              onClick={onClear}
              title="Clear selection"
              aria-label="Clear selection"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-rose-500/10 hover:text-rose-400 cursor-pointer"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-3.5">
        {/* ── Selected element ────────────────────────────────────────── */}
        <SectionCard icon={<Fingerprint size={13} />} title="Selected element">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent-text)]">
              {element.tagName}
            </span>
            {element.id && (
              <span className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-primary)]">
                #{element.id}
              </span>
            )}
          </div>
          {element.className && (
            <p className="mt-2 truncate font-mono text-[10px] text-[var(--text-secondary)]" title={element.className}>
              {element.className}
            </p>
          )}
        </SectionCard>

        {/* ── Developer details (opt-in) ─────────────────────────────── */}
        {showFullInfo && (
          <>
            <SectionCard icon={<Code size={13} />} title="Element details">
              <div className="space-y-2.5">
                {element.textContent && (
                  <div>
                    <div className="mb-1 text-[9px] font-medium uppercase tracking-wider text-[var(--text-secondary)]/60">
                      text
                    </div>
                    <div className="max-h-16 overflow-y-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)]/50 p-2 text-[10px] leading-4 text-[var(--text-secondary)]">
                      {element.textContent}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Meta label="page" value={pageTitle || 'Untitled'} />
                  <Meta label="url" value={element.pageUrl.replace(/^https?:\/\//, '')} />
                  <Meta label="viewport" value={`${element.viewport.width}×${element.viewport.height}`} />
                  <Meta label="bounds" value={`x ${element.rect.x} · y ${element.rect.y}`} />
                  <Meta label="size" value={`${element.rect.width}×${element.rect.height}`} />
                  <Meta label="status" value="ready" accent />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              icon={<Hash size={13} />}
              title="Attributes"
              meta={countPill(String(attributeEntries.length))}
            >
              {attributeEntries.length === 0 ? (
                <div className="text-[10px] text-[var(--text-secondary)]/50">No attributes</div>
              ) : (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border-primary)]">
                  <table className="w-full text-left font-mono text-[10px]">
                    <tbody>
                      {attributeEntries.map(([key, value]) => (
                        <tr key={key} className="border-b border-[var(--border-primary)]/40 last:border-0">
                          <td className="whitespace-nowrap border-r border-[var(--border-primary)]/40 bg-[var(--bg-tertiary)]/40 px-2.5 py-1.5 align-top text-[var(--text-secondary)]/70">
                            {key}
                          </td>
                          <td className="break-all px-2.5 py-1.5 text-[var(--text-primary)]">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              icon={<Code size={13} />}
              title="HTML snippet"
              meta={
                <button
                  type="button"
                  onClick={handleCopyHtml}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-medium text-[var(--text-secondary)]/70 transition-colors hover:bg-[var(--accent-light)] hover:text-[var(--accent-text)] cursor-pointer"
                >
                  <Copy size={11} aria-hidden="true" />
                  copy
                </button>
              }
            >
              <pre className="max-h-40 overflow-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)]/60 p-2.5 font-mono text-[10px] leading-4 text-[var(--text-secondary)] whitespace-pre-wrap break-all">
                {element.htmlSnippet}
              </pre>
            </SectionCard>
          </>
        )}

        {/* ── Selectors ───────────────────────────────────────────────── */}
        <SectionCard icon={<Hash size={13} />} title="Selectors" meta={countPill(`${element.selectors.length} found`)}>
          <div className="space-y-1.5">
            {shownSelectors.length === 0 ? (
              <div className="text-[10px] text-[var(--text-secondary)]/50">No usable selector</div>
            ) : (
              shownSelectors.map((selector, index) => (
                <div
                  key={`${selector}-${index}`}
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${
                    index === 0
                      ? 'border-[var(--accent-border)] bg-[var(--accent-light)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40'
                  }`}
                >
                  <span
                    className={`mt-px shrink-0 rounded font-mono text-[9px] font-bold ${
                      index === 0 ? 'text-[var(--accent-text)]' : 'text-[var(--text-secondary)]/50'
                    }`}
                  >
                    {index === 0 ? 'P' : `F${index}`}
                  </span>
                  <code className="min-w-0 flex-1 break-all font-mono text-[10px] leading-4 text-[var(--text-primary)]">
                    {selector}
                  </code>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        {/* ── Target agent ────────────────────────────────────────────── */}
        <SectionCard icon={<Target size={13} />} title="Target agent" meta={countPill(`${sessionOptions.length} avail`)}>
          <AgentTargetSelect value={targetSessionId ?? ''} options={sessionOptions} onChange={onTargetSessionChange} />
          <p className="mt-2 text-[9px] leading-4 text-[var(--text-secondary)]/60">
            Handoff goes directly into the chosen terminal or agent session
          </p>
        </SectionCard>

        {/* ── Instruction (multi-slot) ────────────────────────────────── */}
        <SectionCard
          icon={<PencilSimpleLine size={13} />}
          title="Instruction"
          meta={<span className="font-mono text-[9px] text-[var(--text-secondary)]/50">{charCount} ch</span>}
        >
          <div className="mb-2.5 flex items-center gap-1.5">
            {instructionSlots.map((slot, index) => {
              const filled = htmlToPlainText(slot).trim().length > 0;
              const isActive = index === activeInstructionSlot;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelectSlot(index)}
                  title={`Instruction ${index + 1}${filled ? ' (filled)' : ''}`}
                  aria-label={`Instruction ${index + 1}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex h-7 items-center justify-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'border-[var(--accent-border)] bg-[var(--accent-light)] text-[var(--accent-text)]'
                      : filled
                        ? 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]'
                        : 'border-dashed border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)]'
                  }`}
                >
                  {index + 1}
                  {filled && <span className="h-1 w-1 rounded-full bg-[var(--accent)]" aria-hidden="true" />}
                </button>
              );
            })}
            {instructionSlots.length < MAX_INSTRUCTION_SLOTS && (
              <button
                type="button"
                onClick={handleAddSlot}
                title={`Add instruction (${instructionSlots.length}/${MAX_INSTRUCTION_SLOTS})`}
                aria-label="Add instruction slot"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-[var(--border-primary)] text-[var(--text-secondary)]/60 transition-colors hover:border-[var(--accent-border)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Plus size={11} aria-hidden="true" />
              </button>
            )}
            {instructionSlots.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveSlot(activeInstructionSlot)}
                title={`Remove instruction ${activeInstructionSlot + 1}`}
                aria-label={`Remove instruction ${activeInstructionSlot + 1}`}
                className="ml-auto flex h-7 items-center gap-1 rounded-lg px-2 text-[9px] font-medium text-[var(--text-secondary)]/50 transition-colors hover:bg-rose-500/10 hover:text-rose-400 cursor-pointer"
              >
                <X size={10} aria-hidden="true" />
                remove
              </button>
            )}
          </div>
          <RichPromptEditor
            initialHtml={initialHtml}
            placeholder="Describe the change — e.g. tighten the spacing and improve the CTA hierarchy…"
            onChange={onDraftChange}
            onSubmit={handleSend}
            submitting={isSubmitting}
          />
          <div className="mt-2 flex items-center justify-between text-[9px] text-[var(--text-secondary)]/50">
            <span>enter ↵ send slot</span>
            <span>{instructionSlots.length > 1 ? `send batches ${filledSlotCount}` : 'shift+enter newline'}</span>
          </div>
        </SectionCard>

        {/* ── Quick prompts ──────────────────────────────────────────── */}
        <SectionCard icon={<MagicWand size={13} />} title="Quick prompts" meta={countPill(`${inspectorQuickPrompts.length} ready`)}>
          <div className="space-y-3">
            {PROMPT_GROUPS.map(({ group, label, icon }) => {
              const prompts = promptsByGroup[group];
              if (prompts.length === 0) return null;
              return (
                <div key={group}>
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-secondary)]">
                    <span className="text-[var(--accent-text)]" aria-hidden="true">
                      {icon}
                    </span>
                    {label}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt.id}
                        type="button"
                        onClick={() => handleApplyPrompt(prompt)}
                        title={prompt.text}
                        className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-1 text-[10px] font-medium leading-4 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Send ────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={isSubmitting || sessionOptions.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-[11px] font-semibold text-[var(--bg-primary)] shadow-[0_0_18px_var(--accent-glow)] transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none cursor-pointer"
        >
          <PaperPlaneRight size={14} aria-hidden="true" />
          <span>
            {isSubmitting
              ? 'Sending…'
              : filledSlotCount > 1
                ? `Send ${filledSlotCount} instructions`
                : 'Send to agent'}
          </span>
        </button>

        {/* ── Copy prompt ─────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => void handleCopyPrompt()}
          disabled={isSubmitting || filledSlotCount === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)]/50 px-4 py-2.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={14} className="text-[var(--accent-text)]" aria-hidden="true" />
              <span className="text-[var(--accent-text)]">Copied to clipboard</span>
            </>
          ) : (
            <>
              <Copy size={14} aria-hidden="true" />
              <span>Copy prompt to clipboard</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
});