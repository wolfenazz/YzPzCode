import React, { createContext, useContext, useEffect, useId, useRef } from 'react';

/**
 * The page is a native webview drawn above the app's DOM, so a dropdown that
 * extends over the preview would be hidden behind it. Every open menu
 * registers here and the pane hides the webview until all menus are closed.
 */
export const NativeOverlayContext = createContext<(id: string, open: boolean) => void>(() => undefined);

export const useNativeOverlay = (open: boolean) => {
  const register = useContext(NativeOverlayContext);
  const id = useId();
  useEffect(() => {
    register(id, open);
    return () => register(id, false);
  }, [id, open, register]);
};

interface TriggerProps {
  'aria-expanded': boolean;
  'aria-haspopup': 'menu' | 'dialog';
  onClick: () => void;
  ref: React.Ref<HTMLButtonElement>;
}

interface BrowserMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  align?: 'start' | 'end';
  /** 'dialog' for menus that contain form fields. */
  kind?: 'menu' | 'dialog';
  width?: string;
  trigger: (props: TriggerProps) => React.ReactNode;
  children: React.ReactNode;
}

export const BrowserMenu: React.FC<BrowserMenuProps> = ({
  open,
  onOpenChange,
  label,
  align = 'start',
  kind = 'menu',
  width,
  trigger,
  children,
}) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Callers often pass inline callbacks; keep the effect keyed on `open` only
  // so re-renders (e.g. a refreshed server list) don't steal focus.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useNativeOverlay(open);

  useEffect(() => {
    if (!open) return;
    const onOpenChange = (next: boolean) => onOpenChangeRef.current(next);
    const handlePointerDown = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    // Move focus into the menu so it is keyboard reachable.
    const frame = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('input, [role="menuitem"]:not(:disabled), [role="menuitemradio"], [role="menuitemcheckbox"], button:not(:disabled)');
      first?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (kind !== 'menu' || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)') ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown'
      ? items[(index + 1) % items.length]
      : items[(index - 1 + items.length) % items.length];
    next.focus();
  };

  return (
    <div ref={anchorRef} className="bx-popover-anchor">
      {trigger({
        'aria-expanded': open,
        'aria-haspopup': kind,
        onClick: () => onOpenChange(!open),
        ref: triggerRef,
      })}
      {open && (
        <div
          ref={panelRef}
          role={kind}
          aria-label={label}
          className={`bx-popover bx-popover--${align}`}
          style={width ? { width } : undefined}
          onKeyDown={handlePanelKeyDown}
        >
          {children}
        </div>
      )}
    </div>
  );
};
