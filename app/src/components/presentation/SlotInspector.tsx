import React from 'react';
import { Icon } from '@iconify/react';
import { Copy, FolderOpen, ImageSquare, MagnifyingGlass, Minus, Plus, Sparkle, Trash } from '@phosphor-icons/react';
import { slideTitle } from '../../utils/presentation/deck';
import { localImagePrompt } from '../../utils/presentation/imagePrompt';
import { getLayout } from '../../utils/presentation/layouts';
import { emptySlide } from '../../utils/presentation/sanitize';
import type { Block, ChartKind, DeckTheme, Slide } from '../../utils/presentation/types';

interface SlotInspectorProps {
  slide: Slide;
  slot: string;
  resolveImage: (src: string) => string;
  theme: DeckTheme;
  onChange: (block: Block | null) => void;
  onPickImage: () => void;
  /** Null when stock search is turned off in Settings. */
  onSearchStock: (() => void) | null;
}

const CHART_KINDS: Array<{ id: ChartKind; label: string }> = [
  { id: 'column', label: 'Columns' },
  { id: 'bar', label: 'Bars' },
  { id: 'line', label: 'Line' },
  { id: 'pie', label: 'Pie' },
  { id: 'donut', label: 'Donut' },
];

const numberOr = (value: string, fallback: number): number => {
  const number = Number(value.replace(/[^0-9.\-eE]/g, ''));
  return Number.isFinite(number) ? number : fallback;
};

function ChartEditor({ block, onChange }: { block: Extract<Block, { type: 'chart' }>; onChange: (block: Block) => void }): React.JSX.Element {
  const single = block.kind === 'pie' || block.kind === 'donut';
  const series = single ? block.series.slice(0, 1) : block.series;
  const set = (patch: Partial<typeof block>): void => onChange({ ...block, ...patch });
  return (
    <>
      <div className="pr-field">
        <span className="pr-field__label">Chart type</span>
        <div className="pr-segmented pr-segmented--wrap">
          {CHART_KINDS.map((kind) => (
            <button key={kind.id} type="button" className="pr-segmented__item" data-active={block.kind === kind.id || undefined} onClick={() => set({ kind: kind.id })}>{kind.label}</button>
          ))}
        </div>
      </div>
      <label className="pr-field">
        <span className="pr-field__label">Unit <span className="pr-field__opt">e.g. %, $M</span></span>
        <input className="pr-input" value={block.unit ?? ''} onChange={(event) => set({ unit: event.target.value || undefined })} />
      </label>
      <div className="pr-grid-editor" style={{ gridTemplateColumns: `minmax(70px, 1.3fr) repeat(${series.length}, minmax(56px, 1fr)) 26px` }}>
        <span className="pr-grid-editor__corner">Label</span>
        {series.map((entry, seriesIndex) => (
          <input key={seriesIndex} className="pr-grid-editor__head" value={entry.name} aria-label={`Series ${seriesIndex + 1} name`}
            onChange={(event) => set({ series: block.series.map((item, i) => (i === seriesIndex ? { ...item, name: event.target.value } : item)) })} />
        ))}
        <span />
        {block.categories.map((category, row) => (
          <React.Fragment key={row}>
            <input className="pr-grid-editor__cell" value={category} aria-label={`Label ${row + 1}`}
              onChange={(event) => set({ categories: block.categories.map((item, i) => (i === row ? event.target.value : item)) })} />
            {series.map((entry, seriesIndex) => (
              <input key={`${seriesIndex}:${entry.values[row] ?? 0}`} className="pr-grid-editor__cell pr-grid-editor__cell--num" inputMode="decimal" defaultValue={String(entry.values[row] ?? 0)} aria-label={`${entry.name} ${category}`}
                onBlur={(event) => set({ series: block.series.map((item, i) => (i === seriesIndex ? { ...item, values: item.values.map((value, j) => (j === row ? numberOr(event.target.value, value) : value)) } : item)) })} />
            ))}
            <button type="button" className="pr-icon-btn pr-icon-btn--xs" title="Remove row" disabled={block.categories.length <= 1}
              onClick={() => set({ categories: block.categories.filter((_, i) => i !== row), series: block.series.map((item) => ({ ...item, values: item.values.filter((_, j) => j !== row) })) })}><Minus size={11} /></button>
          </React.Fragment>
        ))}
      </div>
      <div className="pr-inline-actions">
        <button type="button" className="pr-btn pr-btn--sm" disabled={block.categories.length >= 12}
          onClick={() => set({ categories: [...block.categories, `Item ${block.categories.length + 1}`], series: block.series.map((item) => ({ ...item, values: [...item.values, 0] })) })}><Plus size={12} /> Row</button>
        {!single && (
          <button type="button" className="pr-btn pr-btn--sm" disabled={block.series.length >= 4}
            onClick={() => set({ series: [...block.series, { name: `Series ${block.series.length + 1}`, values: block.categories.map(() => 0) }] })}><Plus size={12} /> Series</button>
        )}
        {!single && block.series.length > 1 && (
          <button type="button" className="pr-btn pr-btn--sm" onClick={() => set({ series: block.series.slice(0, -1) })}><Minus size={12} /> Series</button>
        )}
      </div>
    </>
  );
}

function TableEditor({ block, onChange }: { block: Extract<Block, { type: 'table' }>; onChange: (block: Block) => void }): React.JSX.Element {
  const columns = Math.max(1, ...block.rows.map((row) => row.length));
  const setCell = (row: number, column: number, value: string): void =>
    onChange({ ...block, rows: block.rows.map((cells, i) => (i === row ? cells.map((cell, j) => (j === column ? value : cell)) : cells)) });
  return (
    <>
      <label className="pr-check">
        <input type="checkbox" checked={block.header} onChange={(event) => onChange({ ...block, header: event.target.checked })} /> First row is a header
      </label>
      <div className="pr-grid-editor" style={{ gridTemplateColumns: `repeat(${columns}, minmax(64px, 1fr)) 26px` }}>
        {block.rows.map((cells, row) => (
          <React.Fragment key={row}>
            {Array.from({ length: columns }, (_, column) => (
              <input key={column} className={`pr-grid-editor__cell${block.header && row === 0 ? ' pr-grid-editor__head' : ''}`} value={cells[column] ?? ''} aria-label={`Row ${row + 1}, column ${column + 1}`}
                onChange={(event) => setCell(row, column, event.target.value)} />
            ))}
            <button type="button" className="pr-icon-btn pr-icon-btn--xs" title="Remove row" disabled={block.rows.length <= 1}
              onClick={() => onChange({ ...block, rows: block.rows.filter((_, i) => i !== row) })}><Minus size={11} /></button>
          </React.Fragment>
        ))}
      </div>
      <div className="pr-inline-actions">
        <button type="button" className="pr-btn pr-btn--sm" disabled={block.rows.length >= 8} onClick={() => onChange({ ...block, rows: [...block.rows, Array.from({ length: columns }, () => '')] })}><Plus size={12} /> Row</button>
        <button type="button" className="pr-btn pr-btn--sm" disabled={columns >= 6} onClick={() => onChange({ ...block, rows: block.rows.map((cells) => [...cells, '']) })}><Plus size={12} /> Column</button>
        <button type="button" className="pr-btn pr-btn--sm" disabled={columns <= 1} onClick={() => onChange({ ...block, rows: block.rows.map((cells) => cells.slice(0, columns - 1)) })}><Minus size={12} /> Column</button>
      </div>
    </>
  );
}

function IconField({ value, onChange }: { value: string | undefined; onChange: (value: string | undefined) => void }): React.JSX.Element {
  return (
    <span className="pr-icon-field">
      <span className="pr-icon-field__preview">{value ? <Icon icon={value} width={16} height={16} /> : null}</span>
      <input className="pr-input" value={value ?? ''} placeholder="Icon, e.g. ph:rocket-launch" onChange={(event) => onChange(event.target.value.trim() || undefined)} />
    </span>
  );
}

export const SlotInspector: React.FC<SlotInspectorProps> = ({ slide, slot, resolveImage, theme, onChange, onPickImage, onSearchStock }) => {
  const [copied, setCopied] = React.useState(false);
  const def = getLayout(slide.layout).slots.find((entry) => entry.name === slot);
  const block = slide.slots[slot];
  if (!def) return null;

  const accepts = def.accepts;
  const sample = (type: Block['type']): Block | null => {
    const fromSample = Object.values(emptySlide(type === 'chart' ? 'chart' : type === 'table' ? 'table' : type === 'stats' ? 'stats' : type === 'steps' ? 'timeline' : 'bullets').slots).find((entry) => entry.type === type);
    return fromSample ?? null;
  };

  return (
    <div className="pr-inspector">
      <div className="pr-inspector__head">
        <span className="pr-label">{def.label}</span>
        {block && !accepts.includes('image') && (
          <button type="button" className="pr-icon-btn" title="Clear" onClick={() => onChange(null)}><Trash size={13} /></button>
        )}
      </div>

      {accepts.length > 1 && !accepts.includes('text') && (
        <div className="pr-segmented pr-segmented--wrap">
          {accepts.filter((type) => type !== 'icon').map((type) => (
            <button key={type} type="button" className="pr-segmented__item" data-active={block?.type === type || undefined} onClick={() => { if (block?.type !== type) onChange(sample(type)); }}>
              {type[0].toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      )}

      {accepts.includes('image') && (
        <>
          <div className="pr-image-preview">
            {block?.type === 'image' && block.src ? <img src={resolveImage(block.src)} alt={block.alt} /> : <span><ImageSquare size={28} weight="light" /> No image yet</span>}
          </div>
          <div className="pr-inline-actions">
            <button type="button" className="pr-btn pr-btn--sm" onClick={onPickImage}><FolderOpen size={13} /> Choose image…</button>
            {onSearchStock && <button type="button" className="pr-btn pr-btn--sm" onClick={onSearchStock}><MagnifyingGlass size={13} /> Search photos…</button>}
            {block?.type === 'image' && block.src && <button type="button" className="pr-btn pr-btn--sm" onClick={() => onChange({ ...block, src: '' })}><Trash size={12} /> Remove</button>}
          </div>
          <p className="pr-hint">Or paste an image (Ctrl V) or drop one on the slide.</p>
          {block?.type === 'image' && (
            <>
              <div className="pr-segmented">
                {(['cover', 'contain'] as const).map((fit) => (
                  <button key={fit} type="button" className="pr-segmented__item" data-active={block.fit === fit || undefined} onClick={() => onChange({ ...block, fit })}>{fit === 'cover' ? 'Fill' : 'Fit'}</button>
                ))}
              </div>
              <label className="pr-field">
                <span className="pr-field__label">Description <span className="pr-field__opt">alt text · image idea</span></span>
                <textarea className="pr-input" rows={2} value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value })} onKeyDown={(event) => event.stopPropagation()} />
              </label>
              {block.src && (
                <label className="pr-field">
                  <span className="pr-field__label">Credit <span className="pr-field__opt">shown on the picture</span></span>
                  <input className="pr-input" value={block.credit ?? ''} placeholder="e.g. Photo: Ann Lee / Unsplash" onChange={(event) => onChange({ ...block, credit: event.target.value || undefined })} onKeyDown={(event) => event.stopPropagation()} />
                </label>
              )}
              <div className="pr-field">
                <span className="pr-field__label">Image prompt <span className="pr-field__opt">paste into your own image generator</span></span>
                <textarea className="pr-input" rows={4} value={block.prompt ?? ''} placeholder="Write one, or let the studio draft it." onChange={(event) => onChange({ ...block, prompt: event.target.value || undefined })} onKeyDown={(event) => event.stopPropagation()} />
                <span className="pr-inline-actions">
                  <button type="button" className="pr-btn pr-btn--sm" onClick={() => onChange({ ...block, prompt: localImagePrompt(block.alt, slideTitle(slide), theme, def.rect.w >= def.rect.h ? 'landscape' : 'portrait') })}><Sparkle size={12} /> Draft a prompt</button>
                  <button type="button" className="pr-btn pr-btn--sm" disabled={!block.prompt} onClick={() => {
                    void navigator.clipboard.writeText(block.prompt ?? '').then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => undefined);
                  }}><Copy size={12} /> {copied ? 'Copied' : 'Copy'}</button>
                </span>
                <span className="pr-hint">The AI panel's "Image prompts" pass writes these for every picture in the deck.</span>
              </div>
            </>
          )}
        </>
      )}

      {block?.type === 'chart' && <ChartEditor block={block} onChange={onChange} />}
      {block?.type === 'table' && <TableEditor block={block} onChange={onChange} />}
      {!block && (accepts.includes('chart') || accepts.includes('table') || accepts.includes('stats') || accepts.includes('steps')) && (
        <button type="button" className="pr-btn pr-btn--sm" onClick={() => onChange(sample(accepts.find((type) => type !== 'icon' && type !== 'image')!))}><Plus size={12} /> Add {accepts[0]}</button>
      )}

      {block?.type === 'stats' && (
        <div className="pr-list-editor">
          {block.items.map((item, index) => (
            <div key={index} className="pr-list-editor__item">
              <div className="pr-grid-2">
                <input className="pr-input" value={item.value} placeholder="42%" aria-label="Value" onChange={(event) => onChange({ ...block, items: block.items.map((entry, i) => (i === index ? { ...entry, value: event.target.value } : entry)) })} />
                <IconField value={item.icon} onChange={(icon) => onChange({ ...block, items: block.items.map((entry, i) => (i === index ? { ...entry, icon } : entry)) })} />
              </div>
              <input className="pr-input" value={item.label} placeholder="What the number means" aria-label="Label" onChange={(event) => onChange({ ...block, items: block.items.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)) })} />
              <button type="button" className="pr-icon-btn pr-icon-btn--xs pr-list-editor__remove" title="Remove" disabled={block.items.length <= 1} onClick={() => onChange({ ...block, items: block.items.filter((_, i) => i !== index) })}><Minus size={11} /></button>
            </div>
          ))}
          <button type="button" className="pr-btn pr-btn--sm" disabled={block.items.length >= 4} onClick={() => onChange({ ...block, items: [...block.items, { value: '0', label: 'New figure' }] })}><Plus size={12} /> Figure</button>
        </div>
      )}

      {block?.type === 'steps' && (
        <div className="pr-list-editor">
          {block.items.map((item, index) => (
            <div key={index} className="pr-list-editor__item">
              <input className="pr-input" value={item.title} placeholder="Step or date" aria-label="Step title" onChange={(event) => onChange({ ...block, items: block.items.map((entry, i) => (i === index ? { ...entry, title: event.target.value } : entry)) })} />
              <textarea className="pr-input" rows={2} value={item.text} placeholder="One line about it" aria-label="Step text" onChange={(event) => onChange({ ...block, items: block.items.map((entry, i) => (i === index ? { ...entry, text: event.target.value } : entry)) })} />
              <button type="button" className="pr-icon-btn pr-icon-btn--xs pr-list-editor__remove" title="Remove" disabled={block.items.length <= 1} onClick={() => onChange({ ...block, items: block.items.filter((_, i) => i !== index) })}><Minus size={11} /></button>
            </div>
          ))}
          <button type="button" className="pr-btn pr-btn--sm" disabled={block.items.length >= 5} onClick={() => onChange({ ...block, items: [...block.items, { title: `Step ${block.items.length + 1}`, text: '' }] })}><Plus size={12} /> Step</button>
        </div>
      )}

      {(block?.type === 'text' || block?.type === 'bullets' || block?.type === 'quote' || (!block && accepts.includes('text'))) && (
        <p className="pr-hint">Click the text on the slide to edit it. Ctrl B bold, Ctrl I italic{accepts.includes('bullets') ? ', Tab to indent a bullet' : ''}.</p>
      )}
    </div>
  );
};
