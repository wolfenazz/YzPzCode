/**
 * iOS 26 drop lists for every native `<select>`.
 *
 * A native select's popup is drawn by the OS and cannot be styled, so while
 * Liquid glass is on this replaces it app-wide without touching any
 * component: pressing a select (or Space / Enter / Alt+↓ / F4 on it) opens a
 * glass menu built from its options and optgroups (`.lg-menu`, styled in
 * `liquid-glass.css`), and choosing an item sets the select's value and fires
 * `input` + `change`, so React's `onChange` and plain listeners run as usual.
 *
 * Like iOS: the menu springs out of the control it belongs to, the chosen
 * item carries a checkmark, groups are split by a separator band, the row
 * under the pointer is lit, and a press can be dragged onto an item and
 * released to choose it. Keyboard: arrows, Home / End, type to jump, Enter or
 * Space to choose, Esc or Tab to close.
 *
 * Multi-selects, list boxes (`size` > 1), disabled selects and any select
 * inside `[data-native-select]` keep the native control.
 */

const GAP = 6;
const EDGE = 8;
const MAX_HEIGHT = 340;
const RELEASE_GUARD_MS = 260; // the release of the opening press does not choose
const CHECK =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.2 8.6l3 3 6.6-7.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

interface OpenMenu {
  select: HTMLSelectElement;
  menu: HTMLElement;
  scroller: HTMLElement;
  rows: Array<{ el: HTMLElement; option: HTMLOptionElement }>;
  active: number;
  openedAt: number;
  typed: string;
  typedAt: number;
}

let open: OpenMenu | null = null;
let menuSeq = 0;

const usable = (select: HTMLSelectElement) =>
  !select.disabled && !select.multiple && select.size <= 1 && !select.closest('[data-native-select]');

const setValue = (select: HTMLSelectElement, value: string) => {
  if (select.value === value) return;
  // The prototype setter, so React's value tracker sees a real change.
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value);
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const setActive = (m: OpenMenu, index: number, scroll: boolean) => {
  if (index === m.active) return;
  m.rows[m.active]?.el.removeAttribute('data-active');
  m.active = index;
  const row = m.rows[index];
  if (!row) return;
  row.el.setAttribute('data-active', '');
  m.menu.setAttribute('aria-activedescendant', row.el.id);
  if (scroll) row.el.scrollIntoView({ block: 'nearest' });
};

const move = (m: OpenMenu, from: number, step: number) => {
  for (let i = from + step; i >= 0 && i < m.rows.length; i += step) {
    if (!m.rows[i].option.disabled) {
      setActive(m, i, true);
      return;
    }
  }
};

const close = (refocus: boolean) => {
  const m = open;
  if (!m) return;
  open = null;
  m.select.removeAttribute('data-lg-open');
  m.select.removeAttribute('aria-expanded');
  m.menu.classList.add('is-closing');
  window.setTimeout(() => m.menu.remove(), 170);
  if (refocus) m.select.focus({ preventScroll: true });
};

const choose = (m: OpenMenu, index: number) => {
  const row = m.rows[index];
  if (!row || row.option.disabled) return;
  close(true);
  setValue(m.select, row.option.value);
};

const build = (select: HTMLSelectElement): OpenMenu => {
  const id = `lg-menu-${(menuSeq += 1)}`;
  const menu = document.createElement('div');
  menu.className = 'lg-menu';
  menu.id = id;
  menu.setAttribute('role', 'listbox');
  menu.tabIndex = -1;
  const label = select.getAttribute('aria-label') || select.title;
  if (label) menu.setAttribute('aria-label', label);
  const scroller = document.createElement('div');
  scroller.className = 'lg-menu__scroll';
  menu.appendChild(scroller);

  const rows: OpenMenu['rows'] = [];
  const addOption = (option: HTMLOptionElement) => {
    if (option.hidden) return;
    const el = document.createElement('div');
    el.className = 'lg-menu__item';
    el.id = `${id}-${rows.length}`;
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(option.selected));
    if (option.disabled) el.setAttribute('aria-disabled', 'true');
    el.dataset.index = String(rows.length);
    const check = document.createElement('span');
    check.className = 'lg-menu__check';
    if (option.selected) check.innerHTML = CHECK;
    const text = document.createElement('span');
    text.className = 'lg-menu__label';
    text.textContent = option.label || option.text;
    // Font pickers preview each face on its option.
    if (option.style.fontFamily) text.style.fontFamily = option.style.fontFamily;
    el.append(check, text);
    scroller.appendChild(el);
    rows.push({ el, option });
  };

  let any = false;
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      if (any) scroller.appendChild(Object.assign(document.createElement('div'), { className: 'lg-menu__sep' }));
      const head = document.createElement('div');
      head.className = 'lg-menu__group';
      head.textContent = child.label;
      head.setAttribute('role', 'presentation');
      scroller.appendChild(head);
      for (const option of Array.from(child.children)) {
        if (option instanceof HTMLOptionElement) addOption(option);
      }
      any = true;
    } else if (child instanceof HTMLOptionElement) {
      addOption(child);
      any = true;
    } else if (child instanceof HTMLHRElement) {
      scroller.appendChild(Object.assign(document.createElement('div'), { className: 'lg-menu__sep' }));
    }
  }

  return { select, menu, scroller, rows, active: -1, openedAt: performance.now(), typed: '', typedAt: 0 };
};

/** Places the menu under the select (or above when there is more room), springing from it. */
const place = (m: OpenMenu) => {
  const rect = m.select.getBoundingClientRect();
  const { menu } = m;
  menu.style.minWidth = `${Math.max(rect.width, 180)}px`;
  const below = window.innerHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const natural = Math.min(m.scroller.scrollHeight + 12, MAX_HEIGHT);
  const up = below < Math.min(natural, 200) && above > below;
  const room = Math.max(Math.min(up ? above : below, MAX_HEIGHT), 120);
  m.scroller.style.maxHeight = `${room - 12}px`;
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const rtl = getComputedStyle(m.select).direction === 'rtl';
  let left = rtl ? rect.right - width : rect.left;
  left = Math.min(Math.max(left, EDGE), window.innerWidth - width - EDGE);
  const top = up ? Math.max(rect.top - GAP - height, EDGE) : rect.bottom + GAP;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  const originX = Math.min(Math.max(rect.left + rect.width / 2 - left, 16), width - 16);
  menu.style.transformOrigin = `${originX}px ${up ? '100%' : '0%'}`;
  menu.dataset.side = up ? 'top' : 'bottom';
};

const openFor = (select: HTMLSelectElement) => {
  close(false);
  const m = build(select);
  if (m.rows.length === 0) return;
  document.body.appendChild(m.menu);
  place(m);
  open = m;
  select.setAttribute('data-lg-open', '');
  select.setAttribute('aria-expanded', 'true');
  const selected = m.rows.findIndex((row) => row.option.selected);
  setActive(m, selected >= 0 ? selected : m.rows.findIndex((row) => !row.option.disabled), false);
  m.rows[m.active]?.el.scrollIntoView({ block: 'center' });
  m.menu.focus({ preventScroll: true });
};

const typeahead = (m: OpenMenu, key: string) => {
  const now = performance.now();
  m.typed = now - m.typedAt > 700 ? key : m.typed + key;
  m.typedAt = now;
  const text = m.typed.toLowerCase();
  const n = m.rows.length;
  const start = m.typed.length === 1 ? m.active + 1 : m.active;
  for (let k = 0; k < n; k += 1) {
    const i = (start + k + n) % n;
    const row = m.rows[i];
    if (!row.option.disabled && (row.option.label || row.option.text).toLowerCase().startsWith(text)) {
      setActive(m, i, true);
      return;
    }
  }
};

/** Starts replacing native drop lists; returns the function that stops it. */
export const trackGlassSelect = (): (() => void) => {
  const rowAt = (target: EventTarget | null): number => {
    if (!open || !(target instanceof Element)) return -1;
    const el = target.closest<HTMLElement>('.lg-menu__item');
    return el && open.menu.contains(el) ? Number(el.dataset.index) : -1;
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const select = event.target.closest('select');
    if (!(select instanceof HTMLSelectElement) || !usable(select)) return;
    event.preventDefault(); // no native popup
    if (open?.select === select) {
      close(true);
      return;
    }
    select.focus({ preventScroll: true });
    openFor(select);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!open || !(event.target instanceof Node)) return;
    if (open.menu.contains(event.target) || open.select.contains(event.target)) return;
    close(false);
  };

  const onPointerMove = (event: PointerEvent) => {
    const m = open;
    if (!m) return;
    const index = rowAt(event.target);
    if (index >= 0 && !m.rows[index].option.disabled) setActive(m, index, false);
  };

  const onPointerUp = (event: PointerEvent) => {
    const m = open;
    if (!m || event.button !== 0) return;
    const index = rowAt(event.target);
    if (index < 0) return;
    // Press on the select, drag onto an item and release: that chooses it.
    // The quick release of the press that opened the menu does not.
    if (performance.now() - m.openedAt < RELEASE_GUARD_MS && !m.menu.hasAttribute('data-dragged')) return;
    choose(m, index);
  };

  const onPointerOver = (event: PointerEvent) => {
    if (open && event.buttons === 1 && rowAt(event.target) >= 0) open.menu.setAttribute('data-dragged', '');
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const m = open;
    if (!m) {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement) || !usable(select)) return;
      const opens = event.key === ' ' || event.key === 'Enter' || event.key === 'F4' || (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp'));
      if (!opens) return;
      event.preventDefault();
      openFor(select);
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        move(m, m.active, 1);
        break;
      case 'ArrowUp':
        if (event.altKey) close(true);
        else move(m, m.active, -1);
        break;
      case 'Home':
        move(m, -1, 1);
        break;
      case 'End':
        move(m, m.rows.length, -1);
        break;
      case 'PageDown':
        move(m, Math.min(m.active + 8, m.rows.length) - 1, 1);
        break;
      case 'PageUp':
        move(m, Math.max(m.active - 8, 0) + 1, -1);
        break;
      case 'Enter':
      case ' ':
        if (event.key === ' ' && m.typed && performance.now() - m.typedAt < 700) {
          typeahead(m, ' ');
          break;
        }
        choose(m, m.active);
        break;
      case 'Escape':
        close(true);
        break;
      case 'Tab':
        close(true);
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          typeahead(m, event.key);
          break;
        }
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const onScroll = (event: Event) => {
    if (open && !(event.target instanceof Node && open.menu.contains(event.target))) close(false);
  };
  const onResize = () => close(false);
  const onBlur = () => close(false);

  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerover', onPointerOver, { passive: true });
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onBlur);
  return () => {
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerover', onPointerOver);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', onBlur);
    close(false);
  };
};
