import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'label',
  '[role="button"]',
  '[role="tab"]',
  '[contenteditable="true"]',
].join(', ');

/**
 * Makes the referenced element a window drag region for borderless Tauri
 * windows. Uses the manual startDragging() approach from the Tauri v2 docs:
 * the data-tauri-drag-region attribute only applies to the exact element it
 * is set on, so it silently fails when child elements cover the titlebar.
 * Interactive controls (buttons, inputs, ...) keep working as normal.
 */
export const useTitlebarDrag = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      // Only drag from inert areas — let interactive controls receive the click.
      if (target.closest(INTERACTIVE_SELECTOR)) return;
      void getCurrentWindow().startDragging();
    };

    el.addEventListener('mousedown', onMouseDown);
    return () => el.removeEventListener('mousedown', onMouseDown);
  }, []);

  return ref;
};