// Page geometry read from the pagination extension's floated breaker blocks.

export function breakerRects(root: HTMLElement): Array<{ top: number; bottom: number }> {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-rm-pagination] .breaker')).map((breaker) => {
    const rect = breaker.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
}

/** The page (1-based) a DOM element sits on, from the pagination breakers above it. */
export function pageOfElement(root: HTMLElement, element: Element): number {
  const top = element.getBoundingClientRect().top;
  return breakerRects(root).filter((breaker) => breaker.bottom <= top + 1).length + 1;
}

export function pageCount(root: HTMLElement): number {
  return root.querySelectorAll('[data-rm-pagination] .rm-page-break').length || 1;
}
