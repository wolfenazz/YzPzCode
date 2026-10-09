import React, { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Copy, Eye, EyeSlash, Plus, Trash, Warning } from '@phosphor-icons/react';
import type { PlanContext } from '../../utils/presentation/render';
import type { LayoutId, Slide, SlideRunStatus } from '../../utils/presentation/types';
import { LayoutGrid, Popover } from './LayoutPicker';
import { SlideRenderer } from './SlideRenderer';

export type SlideCommand = 'duplicate' | 'delete' | 'hide' | 'up' | 'down';

interface FilmstripProps {
  context: PlanContext;
  slides: Slide[];
  selectedIds: string[];
  status: Record<string, SlideRunStatus>;
  warnings: Record<string, string[]>;
  resolveImage: (src: string) => string;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onMove: (fromId: string, toId: string) => void;
  onCommand: (command: SlideCommand, id: string) => void;
  onAdd: (layout: LayoutId) => void;
  onMeasure: (slideId: string, overflowing: string[]) => void;
}

const THUMB_WIDTH = 168;

const Thumb = memo(function Thumb({ slide, index, context, selected, status, warned, resolveImage, onSelect, onContext, onMeasure }: {
  slide: Slide;
  index: number;
  context: PlanContext;
  selected: boolean;
  status: SlideRunStatus | undefined;
  warned: boolean;
  resolveImage: (src: string) => string;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onContext: (id: string, event: React.MouseEvent) => void;
  onMeasure: (slideId: string, overflowing: string[]) => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  return (
    <div
      ref={setNodeRef}
      className="pr-thumb"
      data-selected={selected || undefined}
      data-hidden={slide.hidden || undefined}
      data-status={status}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onMouseDown={(event) => { if (event.button === 0) onSelect(slide.id, event); }}
      onContextMenu={(event) => onContext(slide.id, event)}
      {...attributes}
      {...listeners}
      aria-label={`Slide ${index + 1}`}
    >
      <span className="pr-thumb__num">{index + 1}</span>
      <div className="pr-thumb__frame">
        <SlideRenderer context={context} slide={slide} index={index} width={THUMB_WIDTH} resolveImage={resolveImage} onMeasure={onMeasure} />
        {(status === 'queued' || status === 'writing') && <span className="pr-thumb__veil" />}
        {slide.hidden && <span className="pr-thumb__badge" title="Hidden in the slideshow"><EyeSlash size={11} /></span>}
        {warned && <span className="pr-thumb__badge pr-thumb__badge--warn" title="Text does not fit"><Warning size={11} weight="fill" /></span>}
      </div>
    </div>
  );
});

export const Filmstrip: React.FC<FilmstripProps> = ({ context, slides, selectedIds, status, warnings, resolveImage, onSelect, onMove, onCommand, onAdd, onMeasure }) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);

  const onDragEnd = (event: DragEndEvent): void => {
    if (event.over && event.active.id !== event.over.id) onMove(String(event.active.id), String(event.over.id));
  };
  const onContext = (id: string, event: React.MouseEvent): void => {
    event.preventDefault();
    setMenu({ id, x: event.clientX, y: event.clientY });
  };
  const menuSlide = menu ? slides.find((slide) => slide.id === menu.id) : null;
  const run = (command: SlideCommand): void => {
    if (menu) onCommand(command, menu.id);
    setMenu(null);
  };

  return (
    <aside className="pr-filmstrip" aria-label="Slides">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={slides.map((slide) => slide.id)} strategy={verticalListSortingStrategy}>
          <div className="pr-filmstrip__list">
            {slides.map((slide, index) => (
              <Thumb
                key={slide.id}
                slide={slide}
                index={index}
                context={context}
                selected={selectedIds.includes(slide.id)}
                status={status[slide.id]}
                warned={(warnings[slide.id]?.length ?? 0) > 0}
                resolveImage={resolveImage}
                onSelect={onSelect}
                onContext={onContext}
                onMeasure={onMeasure}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button type="button" className="pr-filmstrip__add" onClick={(event) => setAddAnchor(addAnchor ? null : event.currentTarget)}>
        <Plus size={14} /> New slide
      </button>
      {addAnchor && (
        <Popover anchor={addAnchor} onClose={() => setAddAnchor(null)} className="pr-popover--layouts">
          <div className="pr-popover__title">Add a slide</div>
          <LayoutGrid context={context} onPick={(layout) => { onAdd(layout); setAddAnchor(null); }} />
        </Popover>
      )}
      {menu && menuSlide && createPortal(
        <>
          <div className="pr-menu-scrim" onMouseDown={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMenu(null); }} />
          <div className="pr-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 220) }}>
            <button type="button" role="menuitem" onClick={() => run('duplicate')}><Copy size={13} /> Duplicate <kbd>Ctrl D</kbd></button>
            <button type="button" role="menuitem" onClick={() => run('hide')}>{menuSlide.hidden ? <Eye size={13} /> : <EyeSlash size={13} />} {menuSlide.hidden ? 'Show in slideshow' : 'Hide in slideshow'}</button>
            <button type="button" role="menuitem" onClick={() => run('up')}><ArrowUp size={13} /> Move up</button>
            <button type="button" role="menuitem" onClick={() => run('down')}><ArrowDown size={13} /> Move down</button>
            <hr />
            <button type="button" role="menuitem" className="is-danger" onClick={() => run('delete')}><Trash size={13} /> Delete <kbd>Del</kbd></button>
          </div>
        </>,
        document.body,
      )}
    </aside>
  );
};
