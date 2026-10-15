import { useDesignSessionStore } from '../../stores/designSessionStore';
import { ancestry } from '../../utils/design/domTree';
import { outerHtmlOf } from '../../utils/design/htmlSafe';
import type { Board } from '../../utils/design/types';

/** Makes an element of an HTML board the picked one (the AI's target and the inspector's subject). */
export function pickElement(workspaceId: string, board: Board, yz: string): void {
  if (board.format !== 'html' || !board.source) return;
  const trail = ancestry(board.source, yz);
  if (trail.length === 0) return;
  useDesignSessionStore.getState().update(workspaceId, {
    selectedIds: [board.id],
    picked: { boardId: board.id, yz, html: outerHtmlOf(board.source, yz), label: trail[trail.length - 1].label },
  });
}

/** Adds an element to (or takes it out of) the picked ones with Shift; the first stays the primary one. */
export function togglePickedElement(workspaceId: string, board: Board, yz: string): void {
  const session = useDesignSessionStore.getState().sessions[workspaceId];
  const current = session?.picked;
  if (!current || current.boardId !== board.id) {
    pickElement(workspaceId, board, yz);
    return;
  }
  if (current.yz === yz) return;
  const also = new Set(current.also ?? []);
  if (also.has(yz)) also.delete(yz);
  else also.add(yz);
  const ids = [current.yz, ...also];
  const label = ids.length > 1 ? `${ids.length} elements` : ancestry(board.source, current.yz).at(-1)?.label ?? current.label;
  const html = ids.map((id) => outerHtmlOf(board.source, id, 1200)).filter(Boolean).join('\n').slice(0, 3000);
  useDesignSessionStore.getState().update(workspaceId, { picked: { ...current, also: [...also], label, html: html || current.html } });
}
