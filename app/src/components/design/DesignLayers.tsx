import React, { useEffect, useMemo, useRef } from 'react';
import { CaretRight, Eye, EyeSlash } from '@phosphor-icons/react';
import { useDesignSessionStore, type PickedElement } from '../../stores/designSessionStore';
import { sizeLabel } from '../../utils/design/formats';
import { elementTree, type TreeNode } from '../../utils/design/domTree';
import { statusLabel } from '../../utils/design/quickActions';
import type { Board } from '../../utils/design/types';
import { pickElement, togglePickedElement } from './pick';

interface DesignLayersProps {
  workspaceId: string;
  boards: Board[];
  selectedIds: string[];
  picked: PickedElement | null;
  onToggleHidden: (id: string) => void;
}

/** One board's elements, indented by depth. */
const Tree: React.FC<{ nodes: TreeNode[]; depth: number; activeId: string | null; alsoIds: string[]; onPick: (id: string, additive: boolean) => void }> = ({ nodes, depth, activeId, alsoIds, onPick }) => (
  <>
    {nodes.map((node) => (
      <React.Fragment key={node.id}>
        <button
          type="button"
          className="dz-layer"
          data-active={activeId === node.id || alsoIds.includes(node.id) || undefined}
          data-yz={node.id}
          style={{ paddingInlineStart: 8 + depth * 14 }}
          onClick={(event) => onPick(node.id, event.shiftKey || event.ctrlKey || event.metaKey)}
          title={node.label}
        >
          <span className="dz-layer__tag">{node.tag}</span>
          <span className="dz-layer__label" dir="auto">{node.label}</span>
        </button>
        {node.children.length > 0 && <Tree nodes={node.children} depth={depth + 1} activeId={activeId} alsoIds={alsoIds} onPick={onPick} />}
      </React.Fragment>
    ))}
  </>
);

/** Boards in canvas order with the element tree of the open one: pick, and the inspector and the AI follow. */
export const DesignLayers: React.FC<DesignLayersProps> = ({ workspaceId, boards, selectedIds, picked, onToggleHidden }) => {
  const update = useDesignSessionStore((state) => state.update);
  const list = useRef<HTMLDivElement>(null);
  const openId = picked?.boardId ?? (selectedIds.length === 1 ? selectedIds[0] : null);
  const open = boards.find((board) => board.id === openId && board.format === 'html' && board.source) ?? null;
  const tree = useMemo(() => (open ? elementTree(open.source) : []), [open?.source]); // eslint-disable-line react-hooks/exhaustive-deps

  // A pick made on the canvas scrolls its row into view.
  useEffect(() => {
    if (!picked) return;
    list.current?.querySelector(`[data-yz="${picked.yz}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [picked?.yz, picked?.boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dz-layers" ref={list}>
      {boards.length === 0 && <p className="dz-note">No boards yet.</p>}
      {boards.map((board) => {
        const isOpen = board.id === open?.id;
        return (
          <div key={board.id} className="dz-layers__board">
            <div className="dz-boardlist__row" data-selected={selectedIds.includes(board.id) || undefined} data-hidden={board.hidden || undefined}>
              <button
                type="button"
                className="dz-boardlist__main"
                aria-expanded={isOpen}
                onClick={() => update(workspaceId, { selectedIds: [board.id], picked: null })}
              >
                <CaretRight size={11} className="dz-layers__caret" data-open={isOpen || undefined} aria-hidden="true" />
                <span className="dz-board__dot" data-status={board.status ?? (board.source ? 'done' : 'idle')} title={statusLabel(board.status, Boolean(board.source))} />
                <span className="dz-boardlist__name" dir="auto">{board.name}</span>
                <span className="dz-board__size">{sizeLabel(board.width, board.height)}</span>
              </button>
              <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost dz-btn--sm" aria-label={board.hidden ? 'Show board' : 'Hide board'} title={board.hidden ? 'Show' : 'Hide'} onClick={() => onToggleHidden(board.id)}>
                {board.hidden ? <EyeSlash size={13} /> : <Eye size={13} />}
              </button>
            </div>
            {isOpen && tree.length > 0 && (
              <div className="dz-layers__tree">
                <Tree nodes={tree} depth={0} activeId={picked?.boardId === board.id ? picked.yz : null} alsoIds={picked?.boardId === board.id ? picked.also ?? [] : []} onPick={(id, additive) => (additive ? togglePickedElement(workspaceId, board, id) : pickElement(workspaceId, board, id))} />
              </div>
            )}
            {isOpen && board.format === 'html' && tree.length === 0 && <p className="dz-note">Nothing drawn yet.</p>}
          </div>
        );
      })}
      {open === null && boards.some((board) => board.format === 'svg') && (
        <p className="dz-note">Select a graphic, then click its text or pictures on the canvas to edit them.</p>
      )}
    </div>
  );
};
