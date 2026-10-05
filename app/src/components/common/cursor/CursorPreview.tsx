import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CursorStyleId } from '../../../types';
import { CursorGlyph, getCursorStyle } from './cursorStyles';

interface CursorPreviewProps {
  id: CursorStyleId;
}

/**
 * Static picture of a cursor style for the settings picker. It reuses the live cursor's markup
 * and CSS, and shows the "over a button" state while its option card is hovered or focused.
 */
export const CursorPreview = ({ id }: CursorPreviewProps) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    // The whole option card is the hover target, not just the small stage.
    const card = stageRef.current?.closest('button');
    if (!card) return;

    const engage = (): void => setEngaged(true);
    const release = (): void => setEngaged(false);
    card.addEventListener('pointerenter', engage);
    card.addEventListener('pointerleave', release);
    card.addEventListener('focus', engage);
    card.addEventListener('blur', release);
    return () => {
      card.removeEventListener('pointerenter', engage);
      card.removeEventListener('pointerleave', release);
      card.removeEventListener('focus', engage);
      card.removeEventListener('blur', release);
    };
  }, []);

  const [shiftX, shiftY] = getCursorStyle(id).previewShift ?? [0, 0];

  return (
    <div ref={stageRef} className="st-option__preview cc-stage" aria-hidden="true">
      <div
        className="custom-cursor-layer cc-static"
        data-mode={engaged ? 'interactive' : 'default'}
        data-style={id}
        style={{ '--cc-shift-x': `${shiftX}px`, '--cc-shift-y': `${shiftY}px` } as CSSProperties}
      >
        <CursorGlyph id={id} preview />
      </div>
    </div>
  );
};
