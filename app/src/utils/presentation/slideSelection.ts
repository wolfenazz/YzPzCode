// Which slides are selected in the filmstrip. The last id is the slide shown on the
// stage ("current"); the rest ride along for the commands that act on several slides.

export type SlidePick =
  /** A plain click: only this slide. */
  | 'only'
  /** Ctrl/⌘-click, or any click while selecting: add or remove this slide, and show it. */
  | 'toggle'
  /** Shift-click: every slide from the current one to this one. */
  | 'range'
  /** The slide's checkbox: add or remove it without moving the stage. */
  | 'check';

/**
 * The selection after picking `id`. `order` is the deck's slide order,
 * `selected` the current selection (last = current slide).
 */
export function pickSlide(order: string[], selected: string[], id: string, how: SlidePick): string[] {
  const known = selected.filter((entry) => order.includes(entry));
  const current = known[known.length - 1] ?? null;
  if (!order.includes(id)) return known;
  if (how === 'only') return [id];
  if (how === 'range') {
    const from = order.indexOf(current ?? id);
    const to = order.indexOf(id);
    const span = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    // The picked slide goes last, so it is the one the stage shows.
    return from <= to ? span : span.reverse();
  }
  if (known.includes(id)) {
    const rest = known.filter((entry) => entry !== id);
    // The last selected slide is never taken away.
    return rest.length > 0 ? rest : known;
  }
  if (how === 'toggle' || current === null) return [...known, id];
  return [...known.slice(0, -1), id, current];
}

/** Everything, with the current slide last so the stage stays where it is. */
export function selectAll(order: string[], current: string | null): string[] {
  return current && order.includes(current) ? [...order.filter((entry) => entry !== current), current] : [...order];
}

/** The selected slides in deck order. */
export const selectedInOrder = (order: string[], selected: string[]): string[] => order.filter((id) => selected.includes(id));
