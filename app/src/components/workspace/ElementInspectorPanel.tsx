import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import type { BrowserSelectedElement } from '../../types';
import { htmlToPlainText } from '../../utils/richText';
import { RichPromptEditor } from './RichPromptEditor';

export interface SessionOption {
  id: string;
  label: string;
}

interface ElementInspectorPanelProps {
  element: BrowserSelectedElement;
  pageTitle: string;
  targetSessionId: string | null;
  sessionOptions: SessionOption[];
  isSubmitting: boolean;
  initialHtml: string;
  onSend: (plainText: string) => Promise<void> | void;
  onTargetSessionChange: (sessionId: string | null) => void;
  onDraftChange: (html: string) => void;
  onClear: () => void;
}

const Meta: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="border border-zinc-800/70 bg-zinc-900/40 px-2 py-1.5">
    <div className="text-[8px] font-black uppercase tracking-widest text-zinc-600">{label}</div>
    <div className={`mt-0.5 truncate text-[10px] font-medium ${accent ? 'text-emerald-400' : 'text-zinc-300'}`} title={value}>
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
  initialHtml,
  onSend,
  onTargetSessionChange,
  onDraftChange,
  onClear,
}: ElementInspectorPanelProps) {
  const [showFullInfo, setShowFullInfo] = useState(false);

  useEffect(() => {
    setShowFullInfo(false);
  }, [element]);

  const attributeEntries = useMemo(() => Object.entries(element.attributes), [element.attributes]);

  const shownSelectors = useMemo(
    () => (showFullInfo ? element.selectors : element.selectors.slice(0, 2)),
    [element.selectors, showFullInfo],
  );

  const charCount = useMemo(() => htmlToPlainText(initialHtml).length, [initialHtml]);

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

  const handleCopyHtml = useCallback(() => {
    navigator.clipboard.writeText(element.htmlSnippet).catch(() => undefined);
  }, [element.htmlSnippet]);

  return (
    <aside
      className={`shrink-0 overflow-y-auto border-l border-zinc-800 bg-[var(--bg-secondary)] transition-[width] duration-200 ${
        showFullInfo ? 'w-[460px]' : 'w-[380px]'
      }`}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
            element inspector
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowFullInfo((value) => !value)}
            title={showFullInfo ? 'Hide developer details' : 'Show developer details'}
            aria-label={showFullInfo ? 'Hide developer details' : 'Show developer details'}
            aria-pressed={showFullInfo}
            className={`flex items-center gap-1.5 border px-2 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
              showFullInfo
                ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            <Icon icon="material-symbols:developer-mode-rounded" className="h-3 w-3" aria-hidden="true" />
            dev
          </button>
          <button
            type="button"
            onClick={onClear}
            title="Clear selection"
            aria-label="Clear selection"
            className="flex h-6 w-6 items-center justify-center text-zinc-500 transition-colors hover:text-rose-400 cursor-pointer"
          >
            <Icon icon="material-symbols:close-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {/* ── Developer details (opt-in) ─────────────────────────────── */}
        {showFullInfo && (
          <>
            <section className="border border-zinc-800 bg-zinc-950/80">
              <div className="border-b border-zinc-800/70 px-3 py-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  element details
                </span>
              </div>
              <div className="space-y-2.5 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                    {element.tagName}
                  </span>
                  {element.id && (
                    <span className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                      #{element.id}
                    </span>
                  )}
                </div>
                {element.className && (
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600">class</div>
                    <div className="mt-0.5 break-all font-mono text-[10px] leading-4 text-zinc-300">
                      {element.className}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600">text</div>
                  <div className="mt-0.5 max-h-16 overflow-y-auto border border-zinc-800 bg-zinc-900/50 p-1.5 text-[10px] leading-4 text-zinc-400">
                    {element.textContent || '—'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Meta label="page" value={pageTitle || 'Untitled'} />
                  <Meta label="url" value={element.pageUrl.replace(/^https?:\/\//, '')} />
                  <Meta label="viewport" value={`${element.viewport.width}×${element.viewport.height}`} />
                  <Meta label="bounds" value={`x ${element.rect.x} · y ${element.rect.y}`} />
                  <Meta label="size" value={`${element.rect.width}×${element.rect.height}`} />
                  <Meta label="status" value="ready" accent />
                </div>
              </div>
            </section>

            <section className="border border-zinc-800 bg-zinc-950/80">
              <div className="flex items-center justify-between border-b border-zinc-800/70 px-3 py-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">attributes</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
                  {attributeEntries.length}
                </span>
              </div>
              {attributeEntries.length === 0 ? (
                <div className="p-3 text-[10px] text-zinc-600">no attributes</div>
              ) : (
                <div className="max-h-36 overflow-y-auto">
                  <table className="w-full text-left font-mono text-[10px]">
                    <tbody>
                      {attributeEntries.map(([key, value]) => (
                        <tr key={key} className="border-b border-zinc-800/40 last:border-0">
                          <td className="whitespace-nowrap border-r border-zinc-800/40 px-2.5 py-1.5 align-top text-zinc-500">
                            {key}
                          </td>
                          <td className="break-all px-2.5 py-1.5 text-zinc-300">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="border border-zinc-800 bg-zinc-950/80">
              <div className="flex items-center justify-between border-b border-zinc-800/70 px-3 py-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">html snippet</span>
                <button
                  type="button"
                  onClick={handleCopyHtml}
                  className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-200 cursor-pointer"
                >
                  <Icon icon="material-symbols:content-copy-rounded" className="h-3 w-3" aria-hidden="true" />
                  copy
                </button>
              </div>
              <pre className="max-h-40 overflow-auto border-t border-zinc-800/60 bg-zinc-900/60 p-2.5 font-mono text-[10px] leading-4 text-zinc-400 whitespace-pre-wrap break-all">
                {element.htmlSnippet}
              </pre>
            </section>
          </>
        )}

        {/* ── Selectors ───────────────────────────────────────────────── */}
        <section className="border border-zinc-800 bg-zinc-950/80">
          <div className="flex items-center justify-between border-b border-zinc-800/70 px-3 py-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">selectors</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
              {element.selectors.length} found
            </span>
          </div>
          <div className="space-y-1 p-3">
            {shownSelectors.length === 0 ? (
              <div className="text-[10px] text-zinc-600">no usable selector</div>
            ) : (
              shownSelectors.map((selector, index) => (
                <div key={`${selector}-${index}`} className="flex items-start gap-2">
                  <span
                    className={`mt-px shrink-0 font-mono text-[9px] font-bold ${
                      index === 0 ? 'text-emerald-400' : 'text-zinc-600'
                    }`}
                  >
                    {index === 0 ? 'P' : `F${index}`}
                  </span>
                  <code className="min-w-0 flex-1 break-all font-mono text-[10px] leading-4 text-zinc-300">
                    {selector}
                  </code>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── Target agent ────────────────────────────────────────────── */}
        <section className="border border-zinc-800 bg-zinc-950/80">
          <div className="flex items-center justify-between border-b border-zinc-800/70 px-3 py-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">target agent</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
              {sessionOptions.length} avail
            </span>
          </div>
          <div className="p-3">
            <select
              value={targetSessionId ?? ''}
              onChange={(event) => onTargetSessionChange(event.target.value || null)}
              className="w-full cursor-pointer appearance-none border border-zinc-800 bg-zinc-900 px-2.5 py-2 font-mono text-[11px] text-zinc-200 outline-none transition-colors focus:border-zinc-600"
            >
              {sessionOptions.length === 0 && <option value="">no session</option>}
              {sessionOptions.map((session) => (
                <option key={session.id} value={session.id} className="bg-zinc-900 text-zinc-200">
                  {session.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[9px] leading-4 text-zinc-600">
              handoff goes directly into the chosen terminal context
            </p>
          </div>
        </section>

        {/* ── Instruction ─────────────────────────────────────────────── */}
        <section className="border border-zinc-800 bg-zinc-950/80">
          <div className="flex items-center justify-between border-b border-zinc-800/70 px-3 py-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">instruction</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{charCount} ch</span>
          </div>
          <div className="p-3">
            <RichPromptEditor
              initialHtml={initialHtml}
              placeholder="Describe the change — e.g. tighten the spacing and improve the CTA hierarchy…"
              onChange={onDraftChange}
              onSubmit={handleSend}
              submitting={isSubmitting}
            />
            <div className="mt-1.5 flex items-center justify-between text-[9px] font-medium uppercase tracking-widest text-zinc-600">
              <span>enter ↵ send</span>
              <span>shift+enter newline</span>
            </div>
          </div>
        </section>

        {/* ── Send ────────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={isSubmitting || sessionOptions.length === 0}
          className="flex w-full items-center justify-center gap-2 border border-emerald-800/70 bg-emerald-950/40 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300 transition-colors hover:border-emerald-700 hover:bg-emerald-900/40 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <Icon icon="material-symbols:send-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isSubmitting ? 'sending…' : 'send to agent'}</span>
        </button>
      </div>
    </aside>
  );
});
