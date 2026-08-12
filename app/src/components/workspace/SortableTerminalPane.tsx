import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TerminalSession } from '../../types';
import { TerminalPane } from './TerminalPane';

interface SortableTerminalPaneProps {
  session: TerminalSession;
  onClose: () => void;
}

export const SortableTerminalPane: React.FC<SortableTerminalPaneProps> = ({ session, onClose }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: session.id,
    data: { session },
  });

  const style: React.CSSProperties = {
    transform: transform && (transform.x !== 0 || transform.y !== 0 || transform.scaleX !== 1 || transform.scaleY !== 1)
      ? CSS.Transform.toString(transform)
      : undefined,
    transition: isDragging ? transition : undefined,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style} className="h-full" {...attributes}>
      <TerminalPane
        session={session}
        onClose={onClose}
        dragListeners={listeners}
      />
    </div>
  );
};
