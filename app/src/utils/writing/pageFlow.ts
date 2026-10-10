// Page-flow arithmetic shared by the paged editor (pure, so it can be tested).

export interface Band {
  top: number;
  bottom: number;
}

/**
 * Space from `y` to the start of the next page, given the page-break bands
 * (footer + gap + header) laid out down the document.
 *
 * - 0 when `y` already starts a page.
 * - null when `y` lies past the last band: the pages have not caught up with the
 *   text yet, so the answer is unknown and the caller keeps what it has. (Using 0
 *   here made headings lose their page-break padding, which shortened the
 *   document, which removed pages, which added the padding back: a loop that
 *   flickered the pages and yanked the scroll position while the AI wrote.)
 */
export function spaceToPageEnd(y: number, bands: Band[], pageTop: number): number | null {
  const previousEnd = [pageTop, ...bands.map((band) => band.bottom)].filter((edge) => edge <= y + 0.5).pop() ?? pageTop;
  if (y - previousEnd < 2) return 0;
  const next = bands.find((band) => band.top > y);
  return next ? Math.max(0, next.top - y + 1) : null;
}

/** How many leading items two lists share. */
export function commonPrefixLength<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && same(a[index], b[index])) index += 1;
  return index;
}
