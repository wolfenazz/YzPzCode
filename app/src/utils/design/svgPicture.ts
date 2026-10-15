// Puts a picture inside a drawn shape of a graphic (SVG board): the picture is clipped to the
// shape's outline, so a frame, arch, circle or card holds it. A border (stroke) of the shape is
// drawn again on top of the picture, so the picture sits inside the border, not over it.
//
// A frame is often several stacked shapes (a dotted outer arch, a band, an inner panel). The
// candidates are the picked shape, its descendants and the sibling shapes lying inside it; the
// default is the innermost one that still fills most of the frame, and the caller can choose
// another and an inset. Needs a DOM (it measures with getBBox), so it runs in the app, not in node.

const SHAPES = new Set(['rect', 'circle', 'ellipse', 'path', 'polygon']);
const PICK_PREFIX = 'svg:';

/** One shape a picture can be put inside. */
export interface PictureShape {
  /** Position in the list (largest last); pass it back to `placePicture`. */
  index: number;
  tag: string;
  /** Size in the drawing's own units. */
  width: number;
  height: number;
  /** Share of the frame's area, 0–1 (1 is the picked shape itself or larger). */
  share: number;
}

export interface PictureOptions {
  /** Which candidate (from `pictureShapes`); the default one when left out. */
  shapeIndex?: number;
  /** Gap kept between the picture and the shape's edge, in drawing units. */
  inset?: number;
  /** Size of the picture against the shape: 1 fills it exactly, 2 is twice as large (0.5–4). */
  zoom?: number;
  /** Shift of the picture, as a share of the shape's width / height (-0.5 … 0.5; + is right / down). */
  offsetX?: number;
  offsetY?: number;
  /** 'fill' crops the picture to cover the shape (default); 'fit' shows all of it; 'stretch' distorts it to the shape. */
  fit?: 'fill' | 'fit' | 'stretch';
  /** Which part of the picture stays in view when it is cropped or smaller than the shape. */
  align?: PictureAlign;
  /** Turn about the shape's centre, in degrees (-180 … 180). */
  rotate?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** 0–1. */
  opacity?: number;
  /** Tone: 1 leaves the picture as it is. */
  brightness?: number;
  contrast?: number;
  saturation?: number;
  /** Hue turn in degrees. */
  hue?: number;
  /** Blur radius in drawing units. */
  blur?: number;
  /** A colour laid over the picture (inside the shape), with its strength 0–1. */
  tint?: string;
  tintOpacity?: number;
  /** How the picture mixes with what is below it. */
  blend?: PictureBlend;
}

export type PictureAlign = 'xMinYMin' | 'xMidYMin' | 'xMaxYMin' | 'xMinYMid' | 'xMidYMid' | 'xMaxYMid' | 'xMinYMax' | 'xMidYMax' | 'xMaxYMax';
export const PICTURE_BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'luminosity'] as const;
export type PictureBlend = (typeof PICTURE_BLENDS)[number];

/** Every option at its neutral value: what a picture is placed with before anything is changed. */
export const DEFAULT_PICTURE_OPTIONS: Required<Omit<PictureOptions, 'shapeIndex'>> = {
  inset: 0, zoom: 1, offsetX: 0, offsetY: 0, fit: 'fill', align: 'xMidYMid', rotate: 0, flipX: false, flipY: false, opacity: 1,
  brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, tint: '#000000', tintOpacity: 0, blend: 'normal',
};

const ALIGNS = new Set<string>(['xMinYMin', 'xMidYMin', 'xMaxYMin', 'xMinYMid', 'xMidYMid', 'xMaxYMid', 'xMinYMax', 'xMidYMax', 'xMaxYMax']);

/** The options as a short `key=value;…` string kept on the placed picture, so it can be adjusted again. */
function serializePicture(options: Required<Omit<PictureOptions, 'shapeIndex'>>, shapeIndex: number): string {
  const parts = [`shape=${shapeIndex}`];
  for (const key of Object.keys(DEFAULT_PICTURE_OPTIONS) as Array<keyof typeof DEFAULT_PICTURE_OPTIONS>) {
    if (options[key] !== DEFAULT_PICTURE_OPTIONS[key]) parts.push(`${key}=${typeof options[key] === 'boolean' ? (options[key] ? 1 : 0) : options[key]}`);
  }
  return parts.join(';');
}

function parsePicture(text: string | null): { shapeIndex: number | null; options: Required<Omit<PictureOptions, 'shapeIndex'>> } {
  const options = { ...DEFAULT_PICTURE_OPTIONS };
  let shapeIndex: number | null = null;
  for (const part of (text ?? '').split(';')) {
    const [key, value = ''] = part.split('=');
    if (key === 'shape') {
      const n = Number(value);
      shapeIndex = Number.isFinite(n) ? n : null;
      continue;
    }
    if (!(key in DEFAULT_PICTURE_OPTIONS)) continue;
    const name = key as keyof typeof DEFAULT_PICTURE_OPTIONS;
    const fallback = DEFAULT_PICTURE_OPTIONS[name];
    let next: unknown = fallback;
    if (typeof fallback === 'boolean') next = value === '1';
    else if (typeof fallback === 'number') next = Number.isFinite(Number(value)) ? Number(value) : fallback;
    else if (name === 'align') next = ALIGNS.has(value) ? value : fallback;
    else if (name === 'fit') next = value === 'fit' || value === 'stretch' || value === 'fill' ? value : fallback;
    else if (name === 'blend') next = (PICTURE_BLENDS as readonly string[]).includes(value) ? value : fallback;
    else if (name === 'tint') next = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    (options as Record<string, unknown>)[name] = next;
  }
  return { shapeIndex, options };
}

export type PicturePlan =
  | { ok: true; tag: string }
  | { ok: false; reason: string };

function elementByPath(root: Element, id: string): Element | null {
  if (!id.startsWith(PICK_PREFIX)) return null;
  let node: Element | undefined = root;
  for (const part of id.slice(PICK_PREFIX.length).split('.')) {
    node = node?.children[Number(part)];
    if (!node) return null;
  }
  return node ?? null;
}

const localTag = (element: Element): string => element.tagName.replace(/^.*:/, '').toLowerCase();
/** A shape of the drawing: not the border copy or tint of a placed picture, and not a clip outline. */
const isShape = (element: Element): boolean => SHAPES.has(localTag(element))
  && !element.hasAttribute('data-picture-border')
  && !element.closest('[data-picture-in], defs');

function screenArea(element: Element): { rect: DOMRect; area: number } {
  const rect = element.getBoundingClientRect();
  return { rect, area: rect.width * rect.height };
}

interface Candidate {
  element: SVGGraphicsElement;
  rect: DOMRect;
  area: number;
}

/** The shapes of a picked element (itself, descendants, and sibling shapes inside it), smallest first. */
function candidatesOf(element: Element): Candidate[] {
  const found = new Set<Element>();
  if (isShape(element)) found.add(element);
  for (const child of Array.from(element.querySelectorAll('*'))) if (isShape(child)) found.add(child);
  const frame = screenArea(element);
  // Sibling shapes that lie inside the picked one: a frame drawn as separate stacked shapes.
  if (frame.area > 0 && element.parentElement) {
    for (const sibling of Array.from(element.parentElement.children)) {
      if (sibling === element) continue;
      const shapes = isShape(sibling) ? [sibling] : localTag(sibling) === 'g' ? Array.from(sibling.querySelectorAll('*')).filter(isShape) : [];
      for (const shape of shapes) {
        const { rect, area } = screenArea(shape);
        const tolerance = 1.5;
        const inside = rect.left >= frame.rect.left - tolerance && rect.top >= frame.rect.top - tolerance
          && rect.right <= frame.rect.right + tolerance && rect.bottom <= frame.rect.bottom + tolerance;
        if (inside && area >= frame.area * 0.2) found.add(shape);
      }
    }
  }
  const list: Candidate[] = [];
  for (const shape of found) {
    const { rect, area } = screenArea(shape);
    if (area > 0) list.push({ element: shape as unknown as SVGGraphicsElement, rect, area });
  }
  // Tiny decorations are not frames.
  const largest = list.reduce((max, entry) => Math.max(max, entry.area), 0);
  return list.filter((entry) => entry.area >= largest * 0.04).sort((a, b) => a.area - b.area);
}

/** The default choice: the innermost shape that still fills most of the frame. */
function defaultIndex(list: Candidate[]): number {
  if (list.length === 0) return 0;
  const largest = list[list.length - 1].area;
  const at = list.findIndex((entry) => entry.area >= largest * 0.35);
  return at >= 0 ? at : list.length - 1;
}

function withHiddenHost<T>(svg: string, run: (root: Element) => T): T | null {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:2000px;height:2000px;visibility:hidden;pointer-events:none';
  host.innerHTML = svg;
  document.body.appendChild(host);
  try {
    const root = host.querySelector('svg');
    return root ? run(root) : null;
  } finally {
    host.remove();
  }
}

/** Whether the picked element is something a picture can be put into. */
export function picturePlan(svg: string, pickId: string): PicturePlan {
  return withHiddenHost<PicturePlan>(svg, (root) => {
    const element = elementByPath(root, pickId);
    if (!element) return { ok: false, reason: 'That element is no longer in the drawing.' };
    if (localTag(element) === 'image') return { ok: true, tag: 'image' };
    const list = candidatesOf(element);
    if (list.length === 0) return { ok: false, reason: 'Pick a shape (a frame, circle, card or arch) to put a picture inside it.' };
    return { ok: true, tag: localTag(list[defaultIndex(list)].element) };
  }) ?? { ok: false, reason: 'The drawing could not be read.' };
}

/** The shapes a picture can go into for a picked element, smallest first, and which one is the default. */
export function pictureShapes(svg: string, pickId: string): { shapes: PictureShape[]; defaultIndex: number } {
  return withHiddenHost(svg, (root) => {
    const element = elementByPath(root, pickId);
    if (!element) return { shapes: [], defaultIndex: 0 };
    const list = candidatesOf(element);
    const largest = list.length > 0 ? list[list.length - 1].area : 1;
    const shapes = list.map((entry, index): PictureShape => {
      let width = entry.rect.width;
      let height = entry.rect.height;
      try {
        const box = entry.element.getBBox();
        width = box.width;
        height = box.height;
      } catch {
        /* keep the screen size */
      }
      return { index, tag: localTag(entry.element), width: Math.round(width), height: Math.round(height), share: entry.area / largest };
    });
    return { shapes, defaultIndex: defaultIndex(list) };
  }) ?? { shapes: [], defaultIndex: 0 };
}

const hasStroke = (element: Element): boolean => {
  const fromStyle = /(?:^|;)\s*stroke\s*:\s*([^;]+)/i.exec(element.getAttribute('style') ?? '')?.[1] ?? '';
  const stroke = (element.getAttribute('stroke') ?? fromStyle).trim();
  return stroke !== '' && stroke !== 'none' && stroke !== 'transparent';
};

const round = (value: number): string => String(Math.round(value * 100) / 100);

/**
 * The drawing with `href` (an `assets/…` path) placed inside the chosen shape of the picked
 * element, or null when it cannot be found or measured. A picture already placed in the shape is replaced.
 */
export function placePicture(svg: string, pickId: string, href: string, options: PictureOptions = {}): string | null {
  return withHiddenHost<string | null>(svg, (root) => {
    const element = elementByPath(root, pickId);
    if (!element) return null;
    if (localTag(element) === 'image') {
      element.setAttribute('href', href);
      element.removeAttribute('xlink:href');
      return root.outerHTML;
    }
    const list = candidatesOf(element);
    if (list.length === 0) return null;
    const chosen = list[Math.min(list.length - 1, Math.max(0, options.shapeIndex ?? defaultIndex(list)))];
    const shape = chosen.element;
    if (!shape.parentNode) return null;
    let box: DOMRect;
    try {
      box = shape.getBBox();
    } catch {
      return null;
    }
    if (box.width <= 0 || box.height <= 0) return null;

    // The bounding box is in the shape's own space; bring it into the parent's (the picture is its sibling).
    let x = box.x;
    let y = box.y;
    let width = box.width;
    let height = box.height;
    let ownTransform = shape.getAttribute('transform') ?? '';
    try {
      const matrix = shape.transform.baseVal.consolidate()?.matrix;
      if (matrix) {
        const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
          .map(([cx, cy]) => ({ x: matrix.a * cx + matrix.c * cy + matrix.e, y: matrix.b * cx + matrix.d * cy + matrix.f }));
        x = Math.min(...corners.map((corner) => corner.x));
        y = Math.min(...corners.map((corner) => corner.y));
        width = Math.max(...corners.map((corner) => corner.x)) - x;
        height = Math.max(...corners.map((corner) => corner.y)) - y;
      }
    } catch {
      ownTransform = shape.getAttribute('transform') ?? '';
    }

    const ns = 'http://www.w3.org/2000/svg';

    // A picture already placed in this shape is replaced, not stacked.
    const previous = shape.nextElementSibling;
    if (previous && previous.getAttribute('data-picture-in')) {
      const old = previous.getAttribute('data-picture-in');
      root.querySelector(`#${old}`)?.remove();
      root.querySelector(`#${old}-f`)?.remove();
      previous.remove();
      const oldBorder = shape.nextElementSibling;
      if (oldBorder && oldBorder.getAttribute('data-picture-border')) oldBorder.remove();
    }

    const taken = new Set(Array.from(root.querySelectorAll('[id]')).map((entry) => entry.getAttribute('id')));
    let n = 1;
    while (taken.has(`yzpic-${n}`)) n += 1;
    const id = `yzpic-${n}`;

    // The outline the picture is clipped to: a copy of the shape without paint or effects,
    // scaled about the shape's centre when a gap from the edge was asked for.
    const outline = shape.cloneNode(false) as Element;
    for (const name of ['id', 'fill', 'stroke', 'stroke-width', 'style', 'filter', 'data-shadow', 'opacity', 'clip-path', 'class']) outline.removeAttribute(name);
    const inset = Math.max(0, options.inset ?? 0);
    if (inset > 0) {
      const factor = Math.max(0.2, 1 - (2 * inset) / Math.min(width, height));
      const cx = x + width / 2;
      const cy = y + height / 2;
      outline.setAttribute('transform', `translate(${round(cx)} ${round(cy)}) scale(${round(factor)}) translate(${round(-cx)} ${round(-cy)}) ${ownTransform}`.trim());
    }
    const clip = document.createElementNS(ns, 'clipPath');
    clip.setAttribute('id', id);
    clip.appendChild(outline);
    let defs = root.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(ns, 'defs');
      root.insertBefore(defs, root.firstChild);
    }
    defs.appendChild(clip);

    // Size and position: the picture's box is the shape's box scaled about its
    // centre, then shifted; the clip keeps it inside the shape either way.
    const o = { ...DEFAULT_PICTURE_OPTIONS, ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) } as Required<Omit<PictureOptions, 'shapeIndex'>>;
    const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
    const zoom = clamp(o.zoom, 0.5, 4);
    const shiftX = clamp(o.offsetX, -0.5, 0.5) * width;
    const shiftY = clamp(o.offsetY, -0.5, 0.5) * height;
    const boxWidth = width * zoom;
    const boxHeight = height * zoom;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const align = ALIGNS.has(o.align) ? o.align : 'xMidYMid';

    // The group carries the clip (so turning the picture does not turn the shape's outline with it),
    // the opacity and the blend; the bitmap inside carries position, turn, flip and tone.
    const picture = document.createElementNS(ns, 'g');
    picture.setAttribute('clip-path', `url(#${id})`);
    picture.setAttribute('data-picture-in', id);
    picture.setAttribute('data-picture-set', serializePicture({ ...o, zoom, opacity: clamp(o.opacity, 0, 1) }, Math.min(list.length - 1, Math.max(0, options.shapeIndex ?? defaultIndex(list)))));
    if (o.opacity < 1) picture.setAttribute('opacity', round(clamp(o.opacity, 0, 1)));
    if (PICTURE_BLENDS.includes(o.blend) && o.blend !== 'normal') picture.setAttribute('style', `mix-blend-mode:${o.blend}`);

    const bitmap = document.createElementNS(ns, 'image');
    bitmap.setAttribute('href', href);
    bitmap.setAttribute('x', round(x + (width - boxWidth) / 2 + shiftX));
    bitmap.setAttribute('y', round(y + (height - boxHeight) / 2 + shiftY));
    bitmap.setAttribute('width', round(boxWidth));
    bitmap.setAttribute('height', round(boxHeight));
    bitmap.setAttribute('preserveAspectRatio', o.fit === 'stretch' ? 'none' : `${align} ${o.fit === 'fit' ? 'meet' : 'slice'}`);
    const turns: string[] = [];
    const rotate = clamp(o.rotate, -180, 180);
    if (rotate !== 0) turns.push(`rotate(${round(rotate)} ${round(cx)} ${round(cy)})`);
    if (o.flipX || o.flipY) turns.push(`translate(${round(cx)} ${round(cy)}) scale(${o.flipX ? -1 : 1} ${o.flipY ? -1 : 1}) translate(${round(-cx)} ${round(-cy)})`);
    if (turns.length > 0) bitmap.setAttribute('transform', turns.join(' '));

    // Tone: one filter of colour matrices (and a blur), only the steps that change something.
    const steps: Element[] = [];
    const step = (name: string, attrs: Record<string, string>): void => {
      const node = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      steps.push(node);
    };
    const brightness = clamp(o.brightness, 0, 3);
    const contrast = clamp(o.contrast, 0, 3);
    const saturation = clamp(o.saturation, 0, 4);
    const hue = clamp(o.hue, -180, 180);
    const blur = clamp(o.blur, 0, 40);
    if (brightness !== 1) step('feColorMatrix', { type: 'matrix', values: `${round(brightness)} 0 0 0 0 0 ${round(brightness)} 0 0 0 0 0 ${round(brightness)} 0 0 0 0 0 1 0` });
    if (contrast !== 1) {
      const t = round(0.5 - 0.5 * contrast);
      step('feColorMatrix', { type: 'matrix', values: `${round(contrast)} 0 0 0 ${t} 0 ${round(contrast)} 0 0 ${t} 0 0 ${round(contrast)} 0 ${t} 0 0 0 1 0` });
    }
    if (saturation !== 1) step('feColorMatrix', { type: 'saturate', values: round(saturation) });
    if (hue !== 0) step('feColorMatrix', { type: 'hueRotate', values: round(hue) });
    if (blur > 0) step('feGaussianBlur', { stdDeviation: round(blur) });
    if (steps.length > 0) {
      const filter = document.createElementNS(ns, 'filter');
      filter.setAttribute('id', `${id}-f`);
      filter.setAttribute('x', '-5%');
      filter.setAttribute('y', '-5%');
      filter.setAttribute('width', '110%');
      filter.setAttribute('height', '110%');
      for (const node of steps) filter.appendChild(node);
      defs.appendChild(filter);
      bitmap.setAttribute('filter', `url(#${id}-f)`);
    }
    picture.appendChild(bitmap);

    // A colour wash over the picture; the group's clip keeps it inside the shape.
    const wash = clamp(o.tintOpacity, 0, 1);
    if (wash > 0 && /^#[0-9a-f]{6}$/i.test(o.tint)) {
      const tint = document.createElementNS(ns, 'rect');
      tint.setAttribute('x', round(x));
      tint.setAttribute('y', round(y));
      tint.setAttribute('width', round(width));
      tint.setAttribute('height', round(height));
      tint.setAttribute('fill', o.tint);
      tint.setAttribute('fill-opacity', round(wash));
      picture.appendChild(tint);
    }

    const parent = shape.parentNode;
    parent.insertBefore(picture, shape.nextSibling);
    if (hasStroke(shape)) {
      // The border is drawn again above the picture, so the picture sits inside it.
      const border = shape.cloneNode(false) as Element;
      for (const name of ['id', 'filter', 'data-shadow']) border.removeAttribute(name);
      border.setAttribute('fill', 'none');
      border.setAttribute('data-picture-border', id);
      const style = border.getAttribute('style');
      if (style) border.setAttribute('style', style.replace(/(?:^|;)\s*fill\s*:[^;]+/gi, ''));
      parent.insertBefore(border, picture.nextSibling);
    }
    return root.outerHTML;
  });
}

/** Every picture placed by `placePicture` inside the picked element's shapes (clip, picture and border). */
function placedPictures(root: Element, element: Element): Element[] {
  const found: Element[] = [];
  const shapes = candidatesOf(element).map((entry) => entry.element as unknown as Element);
  for (const shape of shapes) {
    const next = shape.nextElementSibling;
    if (next && next.getAttribute('data-picture-in')) found.push(next);
  }
  void root;
  return found;
}

/** Whether the picked element holds a picture (placed inside it, or it is a picture itself). */
export function hasPicture(svg: string, pickId: string): boolean {
  return withHiddenHost(svg, (root) => {
    const element = elementByPath(root, pickId);
    if (!element) return false;
    return localTag(element) === 'image' || placedPictures(root, element).length > 0;
  }) ?? false;
}

/** The drawing without the picture placed inside the picked element (its clip and redrawn border go too). */
export function removePicture(svg: string, pickId: string): string | null {
  return withHiddenHost<string | null>(svg, (root) => {
    const element = elementByPath(root, pickId);
    if (!element) return null;
    if (localTag(element) === 'image') {
      element.remove();
      return root.outerHTML;
    }
    const pictures = placedPictures(root, element);
    if (pictures.length === 0) return null;
    for (const picture of pictures) {
      const id = picture.getAttribute('data-picture-in') ?? '';
      const border = picture.nextElementSibling;
      if (border && border.getAttribute('data-picture-border') === id) border.remove();
      root.querySelector(`#${id}`)?.remove();
      root.querySelector(`#${id}-f`)?.remove();
      picture.remove();
    }
    return root.outerHTML;
  });
}

/** What a picture placed by `placePicture` was placed with, to adjust it again; null when the element holds none. */
export function readPicture(svg: string, pickId: string): { href: string; shapeIndex: number; options: PictureOptions } | null {
  return withHiddenHost<{ href: string; shapeIndex: number; options: PictureOptions } | null>(svg, (root) => {
    const element = elementByPath(root, pickId);
    if (!element) return null;
    const list = candidatesOf(element);
    for (let index = 0; index < list.length; index += 1) {
      const next = list[index].element.nextElementSibling;
      if (!next || !next.hasAttribute('data-picture-in')) continue;
      const bitmap = localTag(next) === 'image' ? next : next.querySelector('image');
      const href = bitmap?.getAttribute('href') ?? bitmap?.getAttribute('xlink:href') ?? '';
      if (!href) continue;
      const read = parsePicture(next.getAttribute('data-picture-set'));
      return { href, shapeIndex: read.shapeIndex ?? index, options: read.options };
    }
    return null;
  });
}
