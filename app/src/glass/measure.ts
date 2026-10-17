/**
 * What a piece of glass measures, read from the element itself rather than
 * from props — border radius values can come from any of the app's stylesheets
 * and layout may be fluid, so the only trustworthy source is the box that was
 * actually laid out.
 */

export interface GlassBox {
  /** Border box in CSS px. */
  width: number;
  height: number;
  /** Largest corner radius, in CSS px. */
  radius: number;
  /** `pill` when the radius closes the short axis; `rect` otherwise. */
  shape: 'pill' | 'rect';
}

/** Reads the geometry an element renders with. */
export const measureGlassBox = (el: Element): GlassBox => {
  // The layout box, not the bounding rect: a filter works in the element's own
  // coordinates, before any `transform` / `scale`. Measured with the rect, a
  // held control (scaled up by the press) or a dialog mid-way through its
  // open animation got a map for the wrong size, and the scale springing on
  // every frame rebuilt the map on every frame.
  const box = el as HTMLElement;
  const rect =
    typeof box.offsetWidth === 'number'
      ? { width: box.offsetWidth, height: box.offsetHeight }
      : el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const radius = Math.max(
    parseFloat(style.borderTopLeftRadius) || 0,
    parseFloat(style.borderTopRightRadius) || 0,
    parseFloat(style.borderBottomRightRadius) || 0,
    parseFloat(style.borderBottomLeftRadius) || 0,
  );
  const short = Math.min(rect.width, rect.height);
  return {
    width: rect.width,
    height: rect.height,
    radius,
    shape: radius >= short / 2 - 0.5 ? 'pill' : 'rect',
  };
};

/** True when the element is big enough to hold a bezel worth drawing. */
export const isRefractable = (box: GlassBox): boolean => box.width >= 10 && box.height >= 8;
