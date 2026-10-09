import React, { useEffect, useRef, useState } from 'react';
import { PX_PER_IN, SLIDE_HEIGHT, slideWidth } from '../../utils/presentation/layouts';
import type { PlanContext } from '../../utils/presentation/render';
import type { RichPara, Slide } from '../../utils/presentation/types';
import { SlideRenderer } from './SlideRenderer';

interface SlideCanvasProps {
  context: PlanContext;
  slide: Slide | null;
  index: number;
  /** 1 = fit the space. */
  zoom: number;
  selectedSlot: string | null;
  editingSlot: string | null;
  warnings: string[];
  busy: boolean;
  resolveImage: (src: string) => string;
  onSlotPointer: (slot: string, event: React.MouseEvent) => void;
  onCommitText: (slot: string, items: RichPara[]) => void;
  onEndEdit: () => void;
  onDeselect: () => void;
  onPasteImage: (file: File) => void;
}

/** The selected slide, scaled to the space and editable in place. */
export const SlideCanvas: React.FC<SlideCanvasProps> = ({
  context, slide, index, zoom, selectedSlot, editingSlot, warnings, busy, resolveImage,
  onSlotPointer, onCommitText, onEndEdit, onDeselect, onPasteImage,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 960, height: 540 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setBox({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onPaste = (event: ClipboardEvent): void => {
      if (editingSlot) return;
      const file = Array.from(event.clipboardData?.files ?? []).find((entry) => entry.type.startsWith('image/'));
      if (file) {
        event.preventDefault();
        onPasteImage(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [editingSlot, onPasteImage]);

  const naturalWidth = slideWidth(context.size) * PX_PER_IN;
  const naturalHeight = SLIDE_HEIGHT * PX_PER_IN;
  const fit = Math.min((box.width - 64) / naturalWidth, (box.height - 56) / naturalHeight);
  const width = Math.max(240, naturalWidth * fit * zoom);

  return (
    <div
      ref={ref}
      className="pr-canvas"
      onMouseDown={(event) => { if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains('pr-canvas__inner')) onDeselect(); }}
      onDragOver={(event) => { if (Array.from(event.dataTransfer.items).some((item) => item.type.startsWith('image/'))) event.preventDefault(); }}
      onDrop={(event) => {
        const file = Array.from(event.dataTransfer.files).find((entry) => entry.type.startsWith('image/'));
        if (file) {
          event.preventDefault();
          onPasteImage(file);
        }
      }}
    >
      <div className="pr-canvas__inner">
        {slide ? (
          <div className="pr-canvas__slide" data-busy={busy || undefined}>
            <SlideRenderer
              context={context}
              slide={slide}
              index={index}
              width={width}
              resolveImage={resolveImage}
              interactive
              selectedSlot={selectedSlot}
              editingSlot={editingSlot}
              warnings={warnings}
              onSlotPointer={onSlotPointer}
              onCommitText={onCommitText}
              onEndEdit={onEndEdit}
            />
          </div>
        ) : (
          <div className="pr-canvas__empty">Select a slide</div>
        )}
      </div>
    </div>
  );
};
