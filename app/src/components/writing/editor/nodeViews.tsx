import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { ImageSquare, Trash, X } from '@phosphor-icons/react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useWritingSessionStore } from '../../../stores/writingSessionStore';
import { formatInText, formatReference, orderReferences } from '../../../utils/writing/citations';
import { fileName, joinPath } from '../../../utils/writing/document';
import { getReportType } from '../../../utils/writing/reportTypes';
import { localFileUrl } from '../../../utils/mediaFiles';
import type { Reference, ReportBrief } from '../../../utils/writing/types';
import { pageOfElement } from './pageGeometry';

const useWorkspaceId = (editor: NodeViewProps['editor']): string => editor.storage.writingContext?.workspaceId ?? '';

function useSessionBrief(editor: NodeViewProps['editor']): { brief: ReportBrief | null; bibliography: Reference[]; workspaceId: string } {
  const workspaceId = useWorkspaceId(editor);
  const brief = useWritingSessionStore((state) => state.sessions[workspaceId]?.brief ?? null);
  const bibliography = useWritingSessionStore((state) => state.sessions[workspaceId]?.bibliography ?? EMPTY_REFS);
  return { brief, bibliography, workspaceId };
}

const EMPTY_REFS: Reference[] = [];

/** Order references are first cited in, for numeric styles. */
function citationOrder(editor: NodeViewProps['editor'], bibliography: Reference[]): string[] {
  const byKey = new Map(bibliography.map((ref) => [ref.key, ref.id]));
  const order: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'citation') {
      for (const key of node.attrs.keys as string[]) {
        const id = byKey.get(key);
        if (id && !order.includes(id)) order.push(id);
      }
    }
    return true;
  });
  return order;
}

// Footnote -------------------------------------------------------------------

export const FootnoteView: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode, selected, editor }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(node.attrs.text ?? ''));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) {
      setDraft(String(node.attrs.text ?? ''));
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing, node.attrs.text]);
  const commit = (): void => {
    updateAttributes({ text: draft.trim() });
    setEditing(false);
    editor.commands.focus();
  };
  return (
    <NodeViewWrapper as="span" className={`wr-footnote${selected ? ' is-selected' : ''}`} data-footnote-text={node.attrs.text}>
      <sup
        className="wr-footnote__mark"
        title={String(node.attrs.text || 'Empty footnote')}
        onMouseDown={(event) => { event.preventDefault(); setEditing(true); }}
      />
      {editing && (
        <span className="wr-popover wr-footnote__editor" contentEditable={false} onMouseDown={(event) => event.stopPropagation()}>
          <span className="wr-popover__eyebrow">Footnote</span>
          <textarea
            ref={inputRef}
            value={draft}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commit(); }
              if (event.key === 'Escape') { event.preventDefault(); setEditing(false); }
            }}
          />
          <span className="wr-popover__actions">
            <button type="button" className="wr-icon-btn" title="Delete footnote" onClick={() => deleteNode()}><Trash size={14} weight="light" /></button>
            <button type="button" className="wr-pill-btn" onClick={commit}>Done</button>
          </span>
        </span>
      )}
    </NodeViewWrapper>
  );
};

// Citation -------------------------------------------------------------------

export const CitationView: React.FC<NodeViewProps> = ({ node, editor, selected }) => {
  const { brief, bibliography } = useSessionBrief(editor);
  const keys = node.attrs.keys as string[];
  const refs = bibliography.filter((ref) => keys.includes(ref.key));
  const style = brief?.style.citationStyle ?? 'apa';
  const label = useMemo(() => {
    if (refs.length === 0) return `[${keys.map((key) => `@${key}`).join('; ')}]`;
    const numbers = new Map(style === 'ieee' ? citationOrder(editor, bibliography).map((id, index) => [id, index + 1]) : []);
    return formatInText(refs, style, String(node.attrs.locator ?? ''), numbers);
    // The numbering depends on the whole document, so recompute on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs, style, node.attrs.locator, keys]);
  return (
    <NodeViewWrapper
      as="span"
      className={`wr-citation${refs.length === 0 ? ' is-missing' : ''}${selected ? ' is-selected' : ''}`}
      title={refs.map((ref) => `${ref.authors} (${ref.year}). ${ref.title}`).join('\n') || 'Reference not in the bibliography'}
    >
      {label}
    </NodeViewWrapper>
  );
};

// Figure -----------------------------------------------------------------------

export const FigureView: React.FC<NodeViewProps> = ({ node, updateAttributes, deleteNode, editor, selected }) => {
  const docDir = editor.storage.writingContext?.docDir ?? '';
  const src = node.attrs.src as string | null;
  const resolved = src
    ? /^(https?:|data:|blob:)/.test(src) ? src : localFileUrl(/^([A-Za-z]:[\\/]|\/)/.test(src) ? src : joinPath(docDir, src))
    : null;

  const chooseImage = async (): Promise<void> => {
    const picked = await open({ multiple: false, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }] });
    if (typeof picked !== 'string' || !docDir) return;
    const target = joinPath(docDir, 'assets', `${Date.now().toString(36)}-${fileName(picked).replace(/[^\w.-]+/g, '-')}`);
    try {
      const dataUrl = await invoke<string>('read_file_as_base64', { path: picked });
      await invoke('write_file_bytes', { path: target, base64Data: dataUrl.slice(dataUrl.indexOf(',') + 1) });
      updateAttributes({ src: `assets/${fileName(target)}` });
    } catch (error) {
      console.error('Could not add the image:', error);
    }
  };

  return (
    <NodeViewWrapper className={`wr-figure${selected ? ' is-selected' : ''}`} data-drag-handle>
      <div className="wr-figure__frame" style={{ width: `${node.attrs.width ?? 80}%` }} contentEditable={false}>
        {resolved ? (
          <img src={resolved} alt={String(node.attrs.alt ?? '')} draggable={false} />
        ) : (
          <button type="button" className="wr-figure__placeholder" onClick={() => void chooseImage()}>
            <ImageSquare size={28} weight="thin" />
            <span className="wr-figure__placeholder-title">Figure placeholder</span>
            <span className="wr-figure__placeholder-hint">{String(node.attrs.caption || 'Click to insert an image')}</span>
          </button>
        )}
        <div className="wr-figure__tools">
          <button type="button" className="wr-icon-btn" title="Replace image" onClick={() => void chooseImage()}><ImageSquare size={14} weight="light" /></button>
          <input
            type="range"
            min={30}
            max={100}
            step={5}
            value={Number(node.attrs.width ?? 80)}
            title="Width"
            onChange={(event) => updateAttributes({ width: Number(event.target.value) })}
          />
          <button type="button" className="wr-icon-btn" title="Remove figure" onClick={() => deleteNode()}><X size={14} weight="light" /></button>
        </div>
      </div>
      <input
        className="wr-figure__caption"
        value={String(node.attrs.caption ?? '')}
        placeholder="Figure caption"
        onChange={(event) => updateAttributes({ caption: event.target.value, alt: event.target.value })}
      />
    </NodeViewWrapper>
  );
};

// Table of contents ------------------------------------------------------------

interface TocRow {
  level: number;
  text: string;
  number: string;
  pos: number;
  page: number;
}

export const TableOfContentsView: React.FC<NodeViewProps> = ({ editor }) => {
  const { brief } = useSessionBrief(editor);
  const numbering = brief?.style.headingNumbering ?? 'decimal';
  const [rows, setRows] = useState<TocRow[]>([]);

  useEffect(() => {
    let frame = 0;
    const compute = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const counters = [0, 0, 0, 0];
        let unnumbered = false;
        const next: TocRow[] = [];
        const root = editor.view.dom as HTMLElement;
        editor.state.doc.forEach((child, offset) => {
          if (child.type.name !== 'heading') return;
          const level = Number(child.attrs.level);
          if (level === 1) unnumbered = Boolean(child.attrs.unnumbered);
          let number = '';
          if (numbering !== 'none' && !unnumbered) {
            counters[level - 1] += 1;
            for (let i = level; i < counters.length; i += 1) counters[i] = 0;
            number = counters.slice(0, level).join('.');
          }
          if (level > 3 || !child.textContent.trim()) return;
          const dom = editor.view.nodeDOM(offset);
          next.push({
            level,
            text: child.textContent.trim(),
            number: numbering === 'chapter' && level === 1 && number ? `Chapter ${number}` : number,
            pos: offset,
            page: dom instanceof Element ? pageOfElement(root, dom) : 0,
          });
        });
        setRows((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
      });
    };
    compute();
    editor.on('update', compute);
    editor.on('transaction', compute);
    return () => {
      cancelAnimationFrame(frame);
      editor.off('update', compute);
      editor.off('transaction', compute);
    };
  }, [editor, numbering]);

  return (
    <NodeViewWrapper className="wr-toc" contentEditable={false}>
      <div className="wr-toc__title">Table of Contents</div>
      {rows.length === 0 ? (
        <div className="wr-toc__empty">Headings will appear here as the report is written.</div>
      ) : (
        <ol className="wr-toc__list">
          {rows.map((row) => (
            <li key={`${row.pos}-${row.text}`} className={`wr-toc__row is-level-${row.level}`}>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setTextSelection(row.pos + 1).scrollIntoView().run();
                }}
              >
                {row.number && <span className="wr-toc__num">{row.number}</span>}
                <span className="wr-toc__text">{row.text}</span>
                <span className="wr-toc__leader" aria-hidden="true" />
                <span className="wr-toc__page">{row.page || ''}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </NodeViewWrapper>
  );
};

// Cover page -----------------------------------------------------------------------

type CoverField = 'title' | 'subtitle' | 'authors' | 'organization' | 'date';

const CoverInput: React.FC<{ value: string; placeholder: string; className: string; onChange: (value: string) => void; multiline?: boolean }> = ({ value, placeholder, className, onChange, multiline }) => (
  multiline ? (
    <textarea className={`wr-cover__input ${className}`} value={value} placeholder={placeholder} rows={Math.max(1, value.split('\n').length)} onChange={(event) => onChange(event.target.value)} />
  ) : (
    <input className={`wr-cover__input ${className}`} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  )
);

export const CoverPageView: React.FC<NodeViewProps> = ({ editor }) => {
  const { brief, workspaceId } = useSessionBrief(editor);
  if (!brief) return <NodeViewWrapper className="wr-cover" />;
  const type = getReportType(brief.typeId);
  const { details, style } = brief;
  const update = (patch: Partial<Record<CoverField, string>>, fields?: Record<string, string>): void => {
    useWritingSessionStore.getState().update(workspaceId, (session) => session.brief ? {
      brief: {
        ...session.brief,
        details: { ...session.brief.details, ...patch, fields: fields ? { ...session.brief.details.fields, ...fields } : session.brief.details.fields },
      },
      dirty: true,
    } : {});
  };
  const field = (key: string): string => details.fields[key] ?? '';
  const institutionLines = ['institution', 'department', 'course'].filter((key) => type.fields.some((entry) => entry.key === key));
  const metaRows = ['supervisor', 'term', 'company', 'client', 'period', 'reportNumber', 'version']
    .filter((key) => type.fields.some((entry) => entry.key === key))
    .map((key) => ({ key, label: type.fields.find((entry) => entry.key === key)?.label.replace(/\s*\(.*\)$/, '') ?? key }));

  return (
    <NodeViewWrapper className={`wr-cover is-${style.cover}`} contentEditable={false}>
      <div className="wr-cover__band" aria-hidden="true" />
      <div className="wr-cover__top">
        {institutionLines.map((key) => (
          <CoverInput key={key} className="wr-cover__institution" value={field(key)} placeholder={type.fields.find((entry) => entry.key === key)?.label ?? key} onChange={(value) => update({}, { [key]: value })} />
        ))}
        {institutionLines.length === 0 && (
          <CoverInput className="wr-cover__institution" value={details.organization} placeholder="Organisation" onChange={(value) => update({ organization: value })} />
        )}
      </div>
      <div className="wr-cover__middle">
        <div className="wr-cover__kind">{type.name}</div>
        <CoverInput className="wr-cover__title" value={details.title} placeholder="Report title" multiline onChange={(value) => update({ title: value })} />
        <CoverInput className="wr-cover__subtitle" value={details.subtitle} placeholder="Subtitle" onChange={(value) => update({ subtitle: value })} />
        <div className="wr-cover__rule" aria-hidden="true" />
      </div>
      <div className="wr-cover__bottom">
        <div className="wr-cover__label">Prepared by</div>
        <CoverInput className="wr-cover__authors" value={type.fields.some((entry) => entry.key === 'team') && field('team') ? field('team') : details.authors} placeholder="Author(s)" multiline onChange={(value) => (type.fields.some((entry) => entry.key === 'team') ? update({}, { team: value }) : update({ authors: value }))} />
        {metaRows.map((row) => (
          <div key={row.key} className="wr-cover__meta">
            <span>{row.label}</span>
            <CoverInput className="wr-cover__meta-value" value={field(row.key)} placeholder="—" onChange={(value) => update({}, { [row.key]: value })} />
          </div>
        ))}
        <CoverInput className="wr-cover__date" value={details.date} placeholder="Date" onChange={(value) => update({ date: value })} />
      </div>
    </NodeViewWrapper>
  );
};

// Bibliography -------------------------------------------------------------------

export const BibliographyView: React.FC<NodeViewProps> = ({ editor }) => {
  const { brief, bibliography } = useSessionBrief(editor);
  const style = brief?.style.citationStyle ?? 'apa';
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    const compute = (): void => setOrder((previous) => {
      const next = citationOrder(editor, bibliography);
      return previous.join() === next.join() ? previous : next;
    });
    compute();
    editor.on('update', compute);
    return () => { editor.off('update', compute); };
  }, [editor, bibliography]);
  const cited = bibliography.filter((ref) => order.includes(ref.id));
  const list = orderReferences(cited.length > 0 ? cited : bibliography, style, order);
  return (
    <NodeViewWrapper className="wr-bibliography" contentEditable={false}>
      {list.length === 0 ? (
        <p className="wr-bibliography__empty">No references yet. Add them from the References tab.</p>
      ) : (
        list.map((ref, index) => (
          <p key={ref.id} className={`wr-bibliography__entry${style === 'ieee' ? ' is-numeric' : ''}`}>
            {renderItalics(formatReference(ref, style, index + 1))}
          </p>
        ))
      )}
    </NodeViewWrapper>
  );
};

/** Renders `*italic*` markers from the reference formatter. */
export function renderItalics(text: string): React.ReactNode[] {
  return text.split(/(\*[^*]+\*)/g).map((part, index) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <em key={index}>{part.slice(1, -1)}</em> : <React.Fragment key={index}>{part}</React.Fragment>);
}
