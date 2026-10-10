import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { aiStreamKey } from './extensions';

/** A scroll within this long of a wheel, key or pointer press is the user's. */
const USER_INPUT_MS = 1200;
/** How long the view stays held after the last AI write (the pages settle over a few frames). */
const SETTLE_MS = 1500;

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/**
 * Holds the reader's place while the AI writes. The block at the top of the
 * view is the anchor: when text grows above it, or the pages are re-laid out,
 * the scroll position follows it so the page under the reader stays still.
 * Only scrolls the user makes move the anchor; the browser's own scroll
 * anchoring is off meanwhile (it fought the rebuilt page breaks).
 */
class Keeper {
  private scroller: HTMLElement | null = null;
  private anchor: { element: Element; offset: number } | null = null;
  private armed = false;
  private timer = 0;
  private lastInput = 0;
  private pointerHeld = false;
  private readonly observer: ResizeObserver | null;

  constructor(private readonly view: EditorView) {
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.restore());
    for (const type of ['wheel', 'touchstart'] as const) window.addEventListener(type, this.onInput, { capture: true, passive: true });
    window.addEventListener('keydown', this.onKeyDown, { capture: true, passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { capture: true, passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { capture: true, passive: true });
  }

  /** Starts (or extends) holding the view. Runs before the DOM changes, so the anchor is taken from the old layout. */
  arm(): void {
    if (!this.armed) {
      this.scroller = scrollParent(this.view.dom as HTMLElement);
      if (!this.scroller) return;
      this.armed = true;
      this.capture();
      this.scroller.style.overflowAnchor = 'none';
      this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
      this.observer?.observe(this.view.dom);
    }
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.disarm(), SETTLE_MS);
  }

  restore(): void {
    if (!this.armed || !this.scroller) return;
    const anchor = this.anchor;
    if (!anchor || !anchor.element.isConnected) {
      this.capture();
      return;
    }
    const delta = anchor.element.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top - anchor.offset;
    if (Math.abs(delta) >= 1) this.scroller.scrollTop += delta;
  }

  destroy(): void {
    this.disarm();
    for (const type of ['wheel', 'touchstart'] as const) window.removeEventListener(type, this.onInput, { capture: true });
    window.removeEventListener('keydown', this.onKeyDown, { capture: true });
    window.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    window.removeEventListener('pointerup', this.onPointerUp, { capture: true });
  }

  private capture(): void {
    this.anchor = null;
    if (!this.scroller) return;
    const top = this.scroller.getBoundingClientRect().top;
    for (const child of Array.from(this.view.dom.children)) {
      if (child.hasAttribute('data-rm-pagination') || child.classList.contains('rm-first-page-header')) continue;
      const rect = child.getBoundingClientRect();
      if (rect.bottom > top + 1) {
        this.anchor = { element: child, offset: rect.top - top };
        return;
      }
    }
  }

  private disarm(): void {
    window.clearTimeout(this.timer);
    if (!this.armed) return;
    this.armed = false;
    this.anchor = null;
    this.observer?.disconnect();
    if (this.scroller) {
      this.scroller.style.overflowAnchor = '';
      this.scroller.removeEventListener('scroll', this.onScroll);
    }
    this.scroller = null;
  }

  private readonly onInput = (): void => {
    this.lastInput = performance.now();
  };

  /** Keys scroll the page only from inside it (typing in a side panel does not count). */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as Node | null;
    if (target === document.body || (target && this.scroller?.contains(target))) this.lastInput = performance.now();
  };

  private readonly onPointerDown = (): void => {
    this.pointerHeld = true;
    this.lastInput = performance.now();
  };

  private readonly onPointerUp = (): void => {
    this.pointerHeld = false;
    this.lastInput = performance.now();
  };

  private readonly onScroll = (): void => {
    const now = performance.now();
    if (this.pointerHeld || now - this.lastInput < USER_INPUT_MS) {
      // The user's scroll (a smooth scroll keeps counting as theirs while it runs).
      this.lastInput = now;
      this.capture();
    } else {
      // The layout moved the view (e.g. the document was briefly shorter): put it back.
      this.restore();
    }
  };
}

/** Keeps the reader's place while AI text streams into the document. */
export const ScrollKeeper = Extension.create({
  name: 'scrollKeeper',
  addProseMirrorPlugins() {
    let keeper: Keeper | null = null;
    return [
      new Plugin({
        key: new PluginKey('wrScrollKeeper'),
        state: {
          init: () => null,
          apply: (tr) => {
            if (tr.getMeta('aiStreamWrite') || tr.getMeta(aiStreamKey)) keeper?.arm();
            return null;
          },
        },
        view: (view) => {
          keeper = new Keeper(view);
          return {
            update: () => keeper?.restore(),
            destroy: () => {
              keeper?.destroy();
              keeper = null;
            },
          };
        },
      }),
    ];
  },
});
