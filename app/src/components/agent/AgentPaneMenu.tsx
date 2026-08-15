import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface AgentPaneMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  width?: number;
}

const GAP = 6;
const MIN_VISIBLE_BELOW = 240;

/**
 * Compact overflow popover used by the agent pane header. Positions itself
 * under (or flips above) the trigger button, closes on outside click, Escape,
 * scroll or resize, and is rendered through a portal so it never gets clipped
 * by the pane's overflow-hidden container.
 */
export const AgentPaneMenu: React.FC<AgentPaneMenuProps> = ({
  open,
  onClose,
  anchorRef,
  children,
  width = 300,
}) => {
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP;
    const above = rect.top - GAP;
    const flip = below < MIN_VISIBLE_BELOW && above > below;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setCoords(
      flip
        ? { bottom: window.innerHeight - rect.top + GAP, left }
        : { top: rect.bottom + GAP, left }
    );
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const isInsideSelectPopup = (t: EventTarget | null): boolean =>
      t instanceof Element && !!t.closest('[role="listbox"]');
    const onMouseDown = (e: MouseEvent) => {
      // Clicks inside an AgentSelect popup (a separate portal) belong to that
      // dropdown, not to this menu - never close on them.
      if (isInsideSelectPopup(e.target)) return;
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const isScrollableAncestor = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return true;
      let el: Element | null = anchorRef.current;
      while (el) {
        if (el === target) return true;
        el = el.parentElement;
      }
      return false;
    };
    const onScrollOrResize = (e: Event) => {
      if (isInsideSelectPopup(e.target)) return;
      if (e.type === 'scroll' && !isScrollableAncestor(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !coords) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        zIndex: 10000,
        width,
        left: coords.left,
        top: coords.top,
        bottom: coords.bottom,
      }}
      className="font-mono premium-menu overflow-hidden"
    >
      {children}
    </div>,
    document.body
  );
};
