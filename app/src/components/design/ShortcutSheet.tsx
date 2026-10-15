import React, { useEffect } from 'react';
import { X } from '@phosphor-icons/react';

const GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'Canvas',
    rows: [
      ['Pan', 'Space + drag, wheel, or H'],
      ['Zoom', 'Ctrl + wheel, or the zoom buttons'],
      ['Fit all', '0 or Shift + 1'],
      ['Zoom to selection', 'Shift + 2'],
      ['100%', '1'],
      ['Select / Pick element / Hand', 'V / P / H'],
      ['Clear selection', 'Esc'],
    ],
  },
  {
    title: 'Boards',
    rows: [
      ['Select several', 'Shift + click, or drag a box'],
      ['Select all', 'Ctrl + A'],
      ['Move', 'Drag, or the arrow keys (Shift ×10)'],
      ['Snap off while dragging', 'Hold Alt'],
      ['Copy / Paste / Duplicate', 'Ctrl + C / V / D'],
      ['Rename', 'Double-click its name'],
      ['Menu', 'Right-click'],
      ['Delete', 'Del'],
    ],
  },
  {
    title: 'Elements',
    rows: [
      ['Edit a text', 'Double-click it'],
      ['Swap a picture', 'Double-click it'],
      ['Pick for the AI and the inspector', 'P, then click'],
      ['Remove the picked element', 'Del'],
    ],
  },
  {
    title: 'Project',
    rows: [
      ['Undo / Redo', 'Ctrl + Z / Ctrl + Y'],
      ['Export', 'Ctrl + Shift + E'],
      ['This sheet', '?'],
    ],
  },
];

/** Every key the studio answers to, in one place. */
export const ShortcutSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.key === '?') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="dz-modal-scrim" onPointerDown={onClose}>
      <div className="dz-shortcuts" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onPointerDown={(event) => event.stopPropagation()}>
        <div className="dz-shortcuts__head">
          <span>Keyboard shortcuts</span>
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="dz-shortcuts__grid">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.rows.map(([name, keys]) => (
                  <React.Fragment key={name}>
                    <dt>{name}</dt>
                    <dd>{keys}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
