import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LAYOUTS } from '../../utils/presentation/layouts';
import type { PlanContext } from '../../utils/presentation/render';
import { emptySlide } from '../../utils/presentation/sanitize';
import type { LayoutId } from '../../utils/presentation/types';
import { SlideRenderer } from './SlideRenderer';

const noImage = (): string => '';

/** Every layout as a live thumbnail in the deck's theme. */
export const LayoutGrid: React.FC<{ context: PlanContext; current?: LayoutId; onPick: (layout: LayoutId) => void; width?: number }> = ({ context, current, onPick, width = 132 }) => {
  const samples = useMemo(() => LAYOUTS.map((layout) => ({ layout, slide: emptySlide(layout.id) })), []);
  return (
    <div className="pr-layout-grid" role="listbox" aria-label="Layouts">
      {samples.map(({ layout, slide }) => (
        <button
          key={layout.id}
          type="button"
          role="option"
          aria-selected={current === layout.id}
          className="pr-layout-grid__item"
          data-active={current === layout.id || undefined}
          title={layout.description}
          onClick={() => onPick(layout.id)}
        >
          <SlideRenderer context={{ ...context, showNumbers: false }} slide={slide} index={1} width={width} resolveImage={noImage} />
          <span>{layout.name}</span>
        </button>
      ))}
    </div>
  );
};

/** A floating panel anchored to a button; closes on outside click or Escape. */
export const Popover: React.FC<{ anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode; align?: 'left' | 'right'; className?: string }> = ({ anchor, onClose, children, align = 'left', className }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (ref.current?.contains(event.target as Node) || anchor?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(rect.bottom + 6, window.innerHeight - 120),
    ...(align === 'left' ? { left: Math.max(8, rect.left) } : { right: Math.max(8, window.innerWidth - rect.right) }),
    maxHeight: window.innerHeight - rect.bottom - 18,
  };
  return createPortal(
    <div ref={ref} className={`pr-popover${className ? ` ${className}` : ''}`} style={style} role="dialog">
      {children}
    </div>,
    document.body,
  );
};
