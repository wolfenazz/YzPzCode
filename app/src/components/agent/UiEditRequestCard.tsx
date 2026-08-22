import React, { memo, useState } from 'react';
import {
  Browser,
  CaretDown,
  CaretUp,
  Code,
  DeviceMobile,
  GlobeSimple,
  PencilSimple,
  SquaresFour,
  Tag,
  User,
  XSquare,
} from '@phosphor-icons/react';

/**
 * Structured view of an element-inspector "UI edit request" message.
 *
 * The raw prompt sent to the agent is a flat block of `- Key: value` lines.
 * Instead of dumping that wall of text into the chat, this component parses it
 * back into fields and renders a compact card: page + preview context up top,
 * the user's actual request front and center, and the heavy developer details
 * (selectors, bounds, attributes, raw HTML) tucked behind collapsible sections.
 */

export interface UiEditRequest {
  pageUrl: string;
  pageTitle: string;
  previewMode: string;
  viewport: string;
  tag: string;
  id: string;
  className: string;
  selectors: string[];
  bounds: { x: number; y: number; width: number; height: number };
  textContent: string;
  attributes: Record<string, string>;
  htmlSnippet: string;
  userRequest: string;
}

const HEADER = 'UI edit request for the running local app.';
const CONTEXT_MARKER = 'Selected element context:';
const REQUEST_MARKER = 'User request:';
const TRAILER =
  'Please inspect this workspace, identify the component or markup responsible for this exact UI element, apply the requested change, and then explain the edit you made.';

export const parseUiEditRequest = (text: string): UiEditRequest | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith(HEADER)) return null;

  const contextStart = trimmed.indexOf(CONTEXT_MARKER);
  const requestStart = trimmed.indexOf(REQUEST_MARKER, contextStart + CONTEXT_MARKER.length);
  if (contextStart < 0 || requestStart < 0) return null;

  // The context block is a list of `- Key: value` lines; values may continue
  // on following lines (e.g. a long HTML snippet), so collect continuations.
  const fields: Record<string, string> = {};
  let currentKey: string | null = null;
  const contextBlock = trimmed.slice(contextStart + CONTEXT_MARKER.length, requestStart);
  for (const rawLine of contextBlock.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const kv = line.match(/^\s*-\s*([A-Za-z][A-Za-z ]*):\s?(.*)$/);
    if (kv) {
      currentKey = kv[1].toLowerCase();
      fields[currentKey] = kv[2];
    } else if (currentKey && line.trim()) {
      fields[currentKey] = `${fields[currentKey]}\n${line}`;
    }
  }

  // Everything between `User request:` and the boilerplate closing instruction
  // is the user's own prompt (may be multi-line).
  let userRequest = trimmed.slice(requestStart + REQUEST_MARKER.length);
  const trailerIndex = userRequest.indexOf(TRAILER);
  if (trailerIndex >= 0) userRequest = userRequest.slice(0, trailerIndex);
  userRequest = userRequest.trim();

  const boundsMatch = (fields.bounds ?? '').match(/x=(-?\d+), y=(-?\d+), width=(-?\d+), height=(-?\d+)/);

  // `Attributes: key="value", key2="value2", ...` — split respecting quotes.
  const attributes: Record<string, string> = {};
  const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(fields.attributes ?? ''))) attributes[match[1]] = match[2];

  return {
    pageUrl: (fields['page url'] ?? '').trim(),
    pageTitle: (fields['page title'] ?? '').trim(),
    previewMode: (fields['preview mode'] ?? '').trim(),
    viewport: (fields.viewport ?? '').trim(),
    tag: (fields.tag ?? '').replace(/[<>]/g, '').trim(),
    id: (fields.id ?? '').trim(),
    className: (fields['class'] ?? '').trim(),
    selectors: (fields.selectors ?? '')
      .split('|')
      .map((selector) => selector.trim())
      .filter(Boolean),
    bounds: boundsMatch
      ? {
          x: Number(boundsMatch[1]),
          y: Number(boundsMatch[2]),
          width: Number(boundsMatch[3]),
          height: Number(boundsMatch[4]),
        }
      : { x: 0, y: 0, width: 0, height: 0 },
    textContent: (fields['text content'] ?? '').trim(),
    attributes,
    htmlSnippet: (fields['html snippet'] ?? '').trim(),
    userRequest,
  };
};
const Chip: React.FC<{ icon?: React.ReactNode; title?: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <span
    title={title}
    className="premium-chip inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] text-[var(--text-secondary)]"
  >
    {icon && <span className="flex shrink-0 text-[var(--text-secondary)]/60">{icon}</span>}
    <span className="truncate">{children}</span>
  </span>
);

const DetailRow: React.FC<{ label: string; mono?: boolean; title?: string; children: React.ReactNode }> = ({
  label,
  mono,
  title,
  children,
}) => (
  <div className="flex items-baseline gap-2 py-0.5">
    <span className="w-20 shrink-0 font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--text-secondary)]/50">
      {label}
    </span>
    <span
      title={title}
      className={`min-w-0 flex-1 break-words text-[10px] leading-relaxed text-[var(--text-secondary)] ${mono ? 'font-mono' : ''}`}
    >
      {children}
    </span>
  </div>
);

const CollapsibleSection = memo(function CollapsibleSection({
  icon,
  label,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="premium-surface overflow-hidden rounded-lg border-[var(--border-primary)]/70 bg-[var(--bg-tertiary)]/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors duration-100 hover:bg-[var(--bg-tertiary)]/70"
      >
        <span className="flex shrink-0 text-[var(--text-secondary)]/70">{icon}</span>
        <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]/80">
          {label}
        </span>
        {open ? <CaretUp size={12} className="ml-auto shrink-0 text-[var(--text-secondary)]/50" /> : <CaretDown size={12} className="ml-auto shrink-0 text-[var(--text-secondary)]/50" />}
      </button>
      {open && <div className="border-t border-[var(--border-primary)]/60 px-2.5 py-2">{children}</div>}
    </div>
  );
});

export const UiEditRequestCard = memo(function UiEditRequestCard({ request }: { request: UiEditRequest }) {
  const [copied, setCopied] = useState(false);
  const { bounds, selectors, attributes, tag } = request;
  const attrEntries = Object.entries(attributes);

  const handleCopyHtml = () => {
    navigator.clipboard
      .writeText(request.htmlSnippet)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => undefined);
  };

  const hasIdentity =
    (request.id !== 'none' && request.id !== '') || (request.className !== 'none' && request.className !== '');

  return (
    <div className="flex justify-end gap-2 animate-fade-in-up">
      <div className="min-w-0 max-w-[88%]">
        <div className="premium-surface overflow-hidden rounded-2xl rounded-br-sm border-[var(--accent-border)]">
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 border-b border-[var(--border-primary)]/70 bg-[var(--bg-tertiary)]/50 px-3 py-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--accent-light)] text-[var(--accent)]">
              <XSquare size={14} aria-hidden="true" />
            </span>
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]/90">
              UI edit request
            </span>
            {tag && (
              <span
                title={`Element tag: <${tag}>`}
                className="ml-auto inline-flex items-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-light)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--accent)]"
              >
                {`<${tag}>`}
              </span>
            )}
          </div>

          <div className="space-y-2.5 px-3 py-2.5">
            {/* ── Page + preview context ──────────────────────────────── */}
            <div className="space-y-1.5">
              <div className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-[var(--text-secondary)]">
                <GlobeSimple size={12} className="shrink-0 text-[var(--accent)]/80" aria-hidden="true" />
                <span className="truncate font-mono" title={request.pageUrl}>
                  {request.pageUrl}
                </span>
                {request.pageTitle && (
                  <>
                    <span className="shrink-0 text-[var(--text-secondary)]/40">·</span>
                    <span className="truncate">{request.pageTitle}</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {request.previewMode && (
                  <Chip icon={<DeviceMobile size={12} />} title="Preview mode">
                    {request.previewMode}
                  </Chip>
                )}
                {request.viewport && (
                  <Chip icon={<SquaresFour size={12} />} title="Viewport size">
                    {request.viewport}
                  </Chip>
                )}
                {hasIdentity && (
                  <Chip
                    icon={<Tag size={12} />}
                    title={`ID: ${request.id} · Class: ${request.className}`}
                  >
                    {request.id !== 'none' && request.id !== ''
                      ? `#${request.id}`
                      : `.${request.className.split(' ')[0]}`}
                  </Chip>
                )}
              </div>
            </div>

            {/* ── User's actual request (the part that matters) ───────── */}
            <div className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-light)]/60 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <PencilSimple size={12} className="text-[var(--accent)]" aria-hidden="true" />
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                  Request
                </span>
              </div>
              <p
                dir="auto"
                className="mt-1 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-[var(--text-primary)]"
              >
                {request.userRequest || 'Edit the selected element.'}
              </p>
            </div>


            {/* ── Developer details (collapsed by default) ────────────── */}
            <CollapsibleSection icon={<Browser size={12} />} label="Element details">
              {selectors.length > 0 && (
                <DetailRow label="Selectors" mono title={selectors.join(' | ')}>
                  {selectors.join(' | ')}
                </DetailRow>
              )}
              <DetailRow label="Bounds" mono>{`x=${bounds.x} y=${bounds.y} · ${bounds.width}×${bounds.height}`}</DetailRow>
              {request.textContent && (
                <DetailRow label="Text" title={request.textContent}>
                  {request.textContent.slice(0, 160)}
                  {request.textContent.length > 160 ? '…' : ''}
                </DetailRow>
              )}
              {attrEntries.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {attrEntries.map(([key, value]) => (
                    <span
                      key={key}
                      title={`${key}="${value}"`}
                      className="max-w-full truncate rounded border border-[var(--border-primary)]/80 bg-[var(--bg-secondary)]/70 px-1.5 py-0.5 font-mono text-[8.5px] text-[var(--text-secondary)]"
                    >
                      {key}="{value.slice(0, 40)}
                      {value.length > 40 ? '…' : ''}"
                    </span>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection icon={<Code size={12} />} label="HTML snippet">
              {request.htmlSnippet ? (
                <>
                  <div className="mb-1 flex justify-end">
                    <button
                      type="button"
                      onClick={handleCopyHtml}
                      className="cursor-pointer font-mono text-[8px] font-bold uppercase tracking-widest text-[var(--text-secondary)]/60 transition-colors hover:text-[var(--accent)]"
                    >
                      {copied ? 'copied ✓' : 'copy'}
                    </button>
                  </div>
                  <pre className="premium-scrollbar max-h-44 overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-[var(--border-primary)]/60 bg-[var(--bg-secondary)]/80 p-2 font-mono text-[9px] leading-relaxed text-[var(--text-secondary)]">
                    {request.htmlSnippet}
                  </pre>
                </>
              ) : (
                <p className="text-[10px] text-[var(--text-secondary)]/60">No HTML captured for this element.</p>
              )}
            </CollapsibleSection>
          </div>
        </div>
      </div>
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white shadow-sm">
        <User size={14} aria-hidden="true" />
      </div>
    </div>
  );
});

