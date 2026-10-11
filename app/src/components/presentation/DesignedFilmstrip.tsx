import React, { memo, useEffect, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, EyeSlash, ListChecks, Plus, Sparkle } from '@phosphor-icons/react';
import type { DesignedSlide } from '../../utils/presentation/designTypes';
import type { SlideRunStatus } from '../../utils/presentation/types';
import { SvgSlide } from './SvgSlide';

const THUMB = 168;

interface ThumbProps {
  slide: DesignedSlide;
  index: number;
  canvas: { width: number; height: number };
  /** In the selection. */
  picked: boolean;
  /** The slide on the stage. */
  current: boolean;
  /** Checkboxes are shown (selecting, or several are picked). */
  checks: boolean;
  status: SlideRunStatus | undefined;
  resolveHref: (href: string) => string;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onCheck: (id: string) => void;
  onContext: (id: string, event: React.MouseEvent) => void;
}

const Thumb = memo(function Thumb({ slide, index, canvas, picked, current, checks, status, resolveHref, onSelect, onCheck, onContext }: ThumbProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const busy = status === 'queued' || status === 'writing';
  return (
    <div
      ref={setNodeRef}
      className="pr-thumb"
      data-selected={picked || undefined}
      data-current={current || undefined}
      data-checks={checks || undefined}
      data-hidden={slide.hidden || undefined}
      data-status={status}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onMouseDown={(event) => { if (event.button === 0) onSelect(slide.id, event); }}
      onContextMenu={(event) => onContext(slide.id, event)}
      title={slide.title}
      {...attributes}
      {...listeners}
      aria-label={`Slide ${index + 1}: ${slide.title}`}
    >
      <span className="pr-thumb__num">{index + 1}</span>
      <div className="pr-thumb__frame">
        <SvgSlide svg={slide.svg} width={THUMB} canvas={canvas} resolveHref={resolveHref} placeholder={{ title: slide.title, busy, failed: status === 'failed' }} />
        {busy && slide.svg && <span className="pr-thumb__veil" />}
        {slide.hidden && <span className="pr-thumb__badge" title="Hidden in the slideshow"><EyeSlash size={11} /></span>}
        <button
          type="button"
          role="checkbox"
          aria-checked={picked}
          aria-label={`Select slide ${index + 1}`}
          className="pr-thumb__check"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onCheck(slide.id); }}
        >
          {picked && <Check size={11} weight="bold" />}
        </button>
      </div>
    </div>
  );
});

export interface DesignedFilmstripProps {
  slides: DesignedSlide[];
  canvas: { width: number; height: number };
  /** Selected slides in deck order. */
  pickedIds: string[];
  /** The slide on the stage. */
  currentId: string | null;
  status: Record<string, SlideRunStatus>;
  resolveHref: (href: string) => string;
  /** Selecting several: a plain click adds or removes a slide. */
  picking: boolean;
  /** Adding slides is not possible while the deck is being drawn. */
  busy: boolean;
  onPickingChange: (picking: boolean) => void;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onCheck: (id: string) => void;
  onContext: (id: string, event: React.MouseEvent) => void;
  onMove: (fromId: string, toId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onEditWithAi: () => void;
  onNewBlank: () => void;
  onNewWithAi: (description: string) => void;
}

/** The slide strip: thumbnails, a Select mode for several slides, and the New slide controls docked at the bottom. */
export const DesignedFilmstrip: React.FC<DesignedFilmstripProps> = ({
  slides, canvas, pickedIds, currentId, status, resolveHref, picking, busy,
  onPickingChange, onSelect, onCheck, onContext, onMove, onSelectAll, onClear, onEditWithAi, onNewBlank, onNewWithAi,
}) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [adding, setAdding] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const picked = new Set(pickedIds);
  const several = pickedIds.length > 1;
  const checks = picking || several;

  // Keep the stage's slide in view when it changes from the keyboard.
  useEffect(() => {
    listRef.current?.querySelector('.pr-thumb[data-current]')?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

  const onDragEnd = (event: DragEndEvent): void => {
    if (event.over && event.active.id !== event.over.id) onMove(String(event.active.id), String(event.over.id));
  };

  const submit = (): void => {
    const text = (adding ?? '').trim();
    if (!text || busy) return;
    setAdding(null);
    onNewWithAi(text);
  };

  return (
    <aside className="pr-filmstrip" aria-label="Slides">
      <div className="pr-filmstrip__head">
        <span className="pd-fs__title">Slides <em>{slides.length}</em></span>
        <button
          type="button"
          className="pd-fs__select"
          aria-pressed={picking}
          title={picking ? 'Stop selecting' : 'Select several slides to edit them together (or Ctrl-click, Shift-click)'}
          onClick={() => onPickingChange(!picking)}
        >
          {picking ? <Check size={13} weight="bold" /> : <ListChecks size={14} />}
          {picking ? 'Done' : 'Select'}
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={slides.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
          <div className="pr-filmstrip__list" ref={listRef}>
            {slides.map((entry, index) => (
              <Thumb
                key={entry.id}
                slide={entry}
                index={index}
                canvas={canvas}
                picked={picked.has(entry.id)}
                current={entry.id === currentId}
                checks={checks}
                status={status[entry.id]}
                resolveHref={resolveHref}
                onSelect={onSelect}
                onCheck={onCheck}
                onContext={onContext}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {(picking || several) && (
        <div className="pd-pickbar" role="status">
          <div className="pd-pickbar__row">
            <strong>{several ? `${pickedIds.length} slides selected` : picking ? 'Select slides' : ''}</strong>
            <span>
              {pickedIds.length < slides.length && <button type="button" className="pd-linkbtn" onClick={onSelectAll}>All</button>}
              {several && <button type="button" className="pd-linkbtn" onClick={onClear}>Clear</button>}
            </span>
          </div>
          {several ? (
            <button type="button" className="pr-btn pr-btn--sm pr-btn--primary pd-pickbar__go" onClick={onEditWithAi}>
              <Sparkle size={12} weight="fill" /> Edit {pickedIds.length} with AI
            </button>
          ) : (
            <p className="pr-hint">Click slides to add them. Shift-click picks a range.</p>
          )}
        </div>
      )}

      <div className="pd-fs__foot">
        {adding !== null ? (
          <div className="pd-fs__describe">
            <label htmlFor="pd-new-slide">New slide with AI</label>
            <textarea dir="auto"
              id="pd-new-slide"
              autoFocus
              value={adding}
              placeholder="What should it show?"
              onChange={(event) => setAdding(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
                if (event.key === 'Escape') setAdding(null);
              }}
            />
            <div className="pd-fs__describe-actions">
              <button type="button" className="pr-btn pr-btn--sm" onClick={() => setAdding(null)}>Cancel</button>
              <button type="button" className="pr-btn pr-btn--sm pr-btn--primary" disabled={!adding.trim() || busy} onClick={submit}>
                <Sparkle size={12} weight="fill" /> Design it
              </button>
            </div>
          </div>
        ) : (
          <div className="pd-fs__add" role="group" aria-label="Add a slide">
            <button type="button" disabled={busy} onClick={onNewBlank} title="A blank slide after this one, with this slide's background">
              <Plus size={14} /> Blank
            </button>
            <button type="button" disabled={busy} onClick={() => setAdding('')} title="Describe a slide and let the AI design it">
              <Sparkle size={13} weight="fill" /> With AI
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
