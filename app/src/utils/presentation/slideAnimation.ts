// Element animation for designed slides, the way PowerPoint models it: a slide
// has an ordered list of animations, each an effect of one class (entrance,
// emphasis, exit) on one element, started by a click, with the previous one,
// or after it. One plan per slide drives both the slideshow (`SvgSlide`
// builds the page as → is pressed) and the exported PowerPoint (`<p:timing>`),
// so what is presented is what is saved.
//
// Where nobody authored a list the plan is automatic: the backdrop and the
// title come in by themselves when the slide opens (step 0); every following
// block (a top-level group with text or a picture) is one click step, carrying
// the decoration drawn just before it. Uses the global DOMParser /
// XMLSerializer; no other dependencies.

export type AnimClass = 'entr' | 'emph' | 'exit';
export type AnimEffect = 'appear' | 'fade' | 'fly' | 'float' | 'zoom' | 'wipe' | 'grow' | 'spin' | 'pulse';
/** Fly and Wipe: the side it comes from (entrance) or goes to (exit). Float: the way it moves. */
export type AnimDir = 'up' | 'down' | 'left' | 'right';
export type AnimTrigger = 'click' | 'with' | 'after';

/** One authored animation, stored on the slide. */
export interface ElementAnimation {
  id: string;
  /** A top-level element: its `data-el` id, or the `data-ani` stamp put on drawn artwork. */
  target: string;
  cls: AnimClass;
  effect: AnimEffect;
  dir?: AnimDir;
  trigger: AnimTrigger;
  /** Milliseconds the effect takes. */
  duration: number;
  /** Milliseconds after it is started. */
  delay: number;
  /** Text only: one effect per paragraph, in order. */
  paragraphs?: boolean;
}

export interface AnimItem {
  /** Position among the SVG root's element children. */
  index: number;
  effect: AnimEffect;
  cls: AnimClass;
  dir?: AnimDir;
  trigger: AnimTrigger;
  /** 0 = plays when the slide opens, 1.. = one click each. */
  step: number;
  /** Milliseconds after the effect is started (its own delay). */
  delay: number;
  /** Milliseconds from the start of its step until it begins. */
  at: number;
  /** Milliseconds the effect takes. */
  duration: number;
  /** The paragraph it animates (a paragraph build), else the whole element. */
  para?: number;
  /** The authored animation it came from. */
  ref?: string;
}

export interface AnimPlan {
  items: AnimItem[];
  /** Clicks needed to show everything (step 0 is free). */
  steps: number;
  /** Right-to-left text: wipes run from the right. */
  rtl: boolean;
  /** Made from an authored list (an empty list means "no animation"). */
  custom?: boolean;
}

export const MAX_CLICKS = 6;
export const MAX_ANIMATIONS = 80;
export const MIN_DURATION = 50;
export const MAX_DURATION = 30000;
export const MAX_DELAY = 30000;
const STAGGER = 120;
const AUTO_MAX_DELAY = 720;
const SVG_NS = 'http://www.w3.org/2000/svg';

const NON_VISUAL = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'lineargradient', 'radialgradient', 'clippath', 'filter', 'marker', 'symbol', 'mask', 'pattern', 'script']);
const FOOTER_ID = /footer|credit|source|page-?num|slide-?num|folio/i;
const THIN_ID = /\b(?:line|rule|bar|divider|underline|stripe|accent-?bar)\b|(?:^|[-_])(?:line|rule|bar|divider|underline|stripe)(?:$|[-_])/i;
const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/g;
const LETTER = /\p{L}/gu;

// The catalogue -------------------------------------------------------------------------------

export interface EffectInfo {
  effect: AnimEffect;
  label: string;
  /** What `dir` means: the side it comes from / goes to, or the way it moves. */
  dirs?: 'side' | 'motion';
}

export const CLASS_LABEL: Record<AnimClass, string> = { entr: 'Entrance', emph: 'Emphasis', exit: 'Exit' };

export const EFFECTS: Record<AnimClass, EffectInfo[]> = {
  entr: [
    { effect: 'appear', label: 'Appear' },
    { effect: 'fade', label: 'Fade' },
    { effect: 'fly', label: 'Fly in', dirs: 'side' },
    { effect: 'float', label: 'Float in', dirs: 'motion' },
    { effect: 'zoom', label: 'Zoom' },
    { effect: 'wipe', label: 'Wipe', dirs: 'side' },
  ],
  emph: [
    { effect: 'grow', label: 'Grow / Shrink' },
    { effect: 'spin', label: 'Spin' },
    { effect: 'pulse', label: 'Pulse' },
  ],
  exit: [
    { effect: 'appear', label: 'Disappear' },
    { effect: 'fade', label: 'Fade' },
    { effect: 'fly', label: 'Fly out', dirs: 'side' },
    { effect: 'float', label: 'Float out', dirs: 'motion' },
    { effect: 'zoom', label: 'Zoom' },
    { effect: 'wipe', label: 'Wipe', dirs: 'side' },
  ],
};

export const TRIGGER_LABEL: Record<AnimTrigger, string> = { click: 'On click', with: 'With previous', after: 'After previous' };

export const effectInfo = (cls: AnimClass, effect: AnimEffect): EffectInfo | undefined => EFFECTS[cls].find((entry) => entry.effect === effect);
export const effectLabel = (cls: AnimClass, effect: AnimEffect): string => effectInfo(cls, effect)?.label ?? effect;

const DIRS: AnimDir[] = ['up', 'down', 'left', 'right'];
const EFFECT_IDS: AnimEffect[] = ['appear', 'fade', 'fly', 'float', 'zoom', 'wipe', 'grow', 'spin', 'pulse'];

/** The defaults PowerPoint would pick for an effect (bottom for Fly, up for Float in, from the left for Wipe). */
export function defaultDirection(cls: AnimClass, effect: AnimEffect): AnimDir | undefined {
  if (effect === 'fly') return 'down';
  if (effect === 'wipe') return 'left';
  if (effect === 'float') return cls === 'exit' ? 'down' : 'up';
  return undefined;
}

export function defaultDuration(cls: AnimClass, effect: AnimEffect): number {
  if (effect === 'appear') return 0;
  if (cls === 'emph') return effect === 'pulse' ? 500 : 1000;
  return effect === 'float' ? 600 : 500;
}

let counter = 0;
export const newAnimationId = (): string => `an${Date.now().toString(36)}${(counter += 1).toString(36)}`;

/** A new animation with PowerPoint-like defaults (the first effect of a slide waits for a click). */
export function makeAnimation(target: string, cls: AnimClass, effect: AnimEffect, trigger: AnimTrigger = 'click'): ElementAnimation {
  const dir = defaultDirection(cls, effect);
  return {
    id: newAnimationId(),
    target,
    cls,
    effect,
    ...(dir ? { dir } : {}),
    trigger,
    duration: defaultDuration(cls, effect),
    delay: 0,
  };
}

/** Changes the effect (and its class), keeping the direction and duration where they still apply. */
export function withEffect(animation: ElementAnimation, cls: AnimClass, effect: AnimEffect): ElementAnimation {
  const wants = effectInfo(cls, effect)?.dirs;
  const had = effectInfo(animation.cls, animation.effect)?.dirs;
  const dir = wants && wants === had && animation.dir ? animation.dir : defaultDirection(cls, effect);
  const same = animation.cls === cls && animation.effect === effect;
  const next: ElementAnimation = { ...animation, cls, effect, duration: same ? animation.duration : defaultDuration(cls, effect) };
  if (dir) next.dir = dir;
  else delete next.dir;
  if (!effectInfo(cls, effect) || effect === 'appear') delete next.paragraphs;
  return next;
}

/** Reads a stored list: unknown effects, directions and numbers are repaired or dropped. */
export function sanitizeAnimations(value: unknown): ElementAnimation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ElementAnimation[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, MAX_ANIMATIONS)) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    const target = typeof raw.target === 'string' ? raw.target.slice(0, 60) : '';
    const cls = raw.cls === 'emph' || raw.cls === 'exit' ? raw.cls : 'entr';
    const effect = EFFECT_IDS.includes(raw.effect as AnimEffect) ? raw.effect as AnimEffect : null;
    if (!target || !effect || !effectInfo(cls, effect)) continue;
    let id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : newAnimationId();
    while (seen.has(id)) id = newAnimationId();
    seen.add(id);
    const dir = DIRS.includes(raw.dir as AnimDir) ? raw.dir as AnimDir : defaultDirection(cls, effect);
    const clamp = (input: unknown, min: number, max: number, fallback: number): number => {
      const number = Number(input);
      return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
    };
    out.push({
      id,
      target,
      cls,
      effect,
      ...(dir && effectInfo(cls, effect)?.dirs ? { dir } : {}),
      trigger: raw.trigger === 'with' || raw.trigger === 'after' ? raw.trigger : 'click',
      duration: effect === 'appear' ? 0 : clamp(raw.duration, MIN_DURATION, MAX_DURATION, defaultDuration(cls, effect)),
      delay: clamp(raw.delay, 0, MAX_DELAY, 0),
      ...(raw.paragraphs === true ? { paragraphs: true } : {}),
    });
  }
  return out;
}

// Reading the slide -------------------------------------------------------------------------------

const tagOf = (el: Element): string => (el.localName || el.nodeName).replace(/^.*:/, '').toLowerCase();
const num = (value: string | null): number => {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : 0;
};

function topElements(root: Element): Element[] {
  return Array.from(root.childNodes).filter((node) => node.nodeType === 1) as Element[];
}

function viewOf(root: Element): { w: number; h: number } {
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  return box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? { w: box[2], h: box[3] } : { w: 1280, h: 720 };
}

function parseRoot(svg: string): Element | null {
  if (!svg) return null;
  try {
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    return root && tagOf(root) === 'svg' ? root : null;
  } catch {
    return null;
  }
}

/** Whether a top-level node is something that is drawn on the slide (not a definition, the backdrop or master artwork). */
const drawn = (el: Element): boolean => !NON_VISUAL.has(tagOf(el)) && !el.hasAttribute('data-bg') && !el.hasAttribute('data-layer');

function isBackdrop(el: Element, view: { w: number; h: number }): boolean {
  return tagOf(el) === 'rect' && num(el.getAttribute('x')) <= 1 && num(el.getAttribute('y')) <= 1 && num(el.getAttribute('width')) >= view.w - 1 && num(el.getAttribute('height')) >= view.h - 1;
}

const childrenOf = (el: Element): Element[] => Array.from(el.childNodes).filter((node) => node.nodeType === 1) as Element[];

function nodeMatches(node: Element, target: string): boolean {
  if (node.getAttribute('data-el') === target || node.getAttribute('data-ani') === target) return true;
  // Stamped artwork that was wrapped into an art element afterwards.
  return node.getAttribute('data-kind') === 'art' && childrenOf(node).some((child) => child.getAttribute('data-ani') === target);
}

/** The distinct paragraph numbers a modelled text element draws, in order. */
function paragraphsOf(node: Element): number[] {
  const kind = node.getAttribute('data-kind');
  if (!node.hasAttribute('data-el') || (kind !== 'shape' && kind !== 'text')) return [];
  const found = new Set<number>();
  for (const el of Array.from(node.getElementsByTagName('*'))) {
    const value = el.getAttribute('data-para');
    if (value !== null && Number.isInteger(Number(value))) found.add(Number(value));
  }
  return [...found].sort((a, b) => a - b);
}

export type TargetKind = 'text' | 'shape' | 'picture' | 'table' | 'group' | 'chart' | 'art' | 'other';

export interface AnimatableElement {
  /** Position among the root's element children. */
  index: number;
  /** The id the editor's selection uses for it: `data-el`, or `raw:<index>` for drawn artwork. */
  selectionId: string;
  /** Every id an animation may refer to it by: its `data-el`, and any `data-ani` stamp from before it was wrapped. */
  keys: string[];
  label: string;
  kind: TargetKind;
  /** Paragraphs a text element can be built by (empty when it is not modelled text). */
  paragraphs: number[];
  /** The element's own `id` attribute (what the AI names it by), or ''. */
  domId: string;
}

const KIND_OF: Record<string, TargetKind> = { text: 'text', shape: 'shape', pic: 'picture', table: 'table', group: 'group', chart: 'chart', art: 'art' };
const KIND_NAME: Record<TargetKind, string> = { text: 'Text', shape: 'Shape', picture: 'Picture', table: 'Table', group: 'Group', chart: 'Chart', art: 'Artwork', other: 'Element' };

function labelOf(node: Element, kind: TargetKind): string {
  let name = '';
  const model = node.getAttribute('data-m');
  if (model) {
    try {
      const parsed = JSON.parse(model) as { name?: unknown };
      if (typeof parsed.name === 'string') name = parsed.name;
    } catch { /* a damaged model has no name */ }
  }
  const text = Array.from(node.getElementsByTagName('text')).filter((el) => !el.hasAttribute('data-bu')).map((el) => el.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
  const own = node.getAttribute('id') ?? '';
  const named = name || (own && !/^e\d+$/.test(own) ? own.replace(/[-_]+/g, ' ') : '');
  if (text && (kind === 'text' || kind === 'shape' || kind === 'group' || kind === 'art' || kind === 'other')) return text.length > 44 ? `${text.slice(0, 42)}…` : text;
  return named || KIND_NAME[kind];
}

/** The top-level nodes an animation can be put on, with their position among the root's children. */
function animatableNodes(root: Element): Array<{ node: Element; index: number }> {
  const view = viewOf(root);
  const out: Array<{ node: Element; index: number }> = [];
  let backdropChecked = false;
  topElements(root).forEach((node, index) => {
    if (!drawn(node)) return;
    if (!backdropChecked) {
      backdropChecked = true;
      if (isBackdrop(node, view)) return;
    }
    out.push({ node, index });
  });
  return out;
}

/** Every element of a slide an animation can be put on, in z-order. */
export function animatableElements(svg: string): AnimatableElement[] {
  const root = parseRoot(svg);
  if (!root) return [];
  const out: AnimatableElement[] = [];
  animatableNodes(root).forEach(({ node, index }) => {
    const el = node.getAttribute('data-el');
    const keys = [el, node.getAttribute('data-ani'), ...childrenOf(node).map((child) => child.getAttribute('data-ani'))].filter((key): key is string => Boolean(key));
    const kindAttr = node.getAttribute('data-kind') ?? '';
    const tag = tagOf(node);
    const kind: TargetKind = KIND_OF[kindAttr] ?? (tag === 'image' ? 'picture' : tag === 'text' ? 'text' : tag === 'g' ? 'group' : 'other');
    out.push({
      index,
      selectionId: el || `raw:${index}`,
      keys,
      label: labelOf(node, kind),
      kind,
      paragraphs: paragraphsOf(node),
      domId: node.getAttribute('id') ?? '',
    });
  });
  return out;
}

/**
 * Makes sure the element behind a selection id (`data-el`, or `raw:<index>` for
 * drawn artwork) has something animations can refer to, stamping drawn artwork
 * with `data-ani`. Null when it is not an animatable element.
 */
export function ensureTarget(svg: string, selectionId: string): { svg: string; target: string } | null {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || tagOf(root) !== 'svg') return null;
  const top = topElements(root);
  let node: Element | undefined;
  if (selectionId.startsWith('raw:')) node = top[Number(selectionId.slice(4))];
  else node = top.find((el) => el.getAttribute('data-el') === selectionId);
  if (!node || !drawn(node)) return null;
  const el = node.getAttribute('data-el');
  if (el) return { svg, target: el };
  const existing = node.getAttribute('data-ani');
  if (existing) return { svg, target: existing };
  let max = 0;
  for (const match of svg.matchAll(/data-ani="a(\d+)"/g)) max = Math.max(max, Number(match[1]));
  const target = `a${max + 1}`;
  node.setAttribute('data-ani', target);
  return { svg: new XMLSerializer().serializeToString(doc), target };
}

/** The selection id of an animation's element (so a row can select it on the slide), or null when it is gone. */
export function selectionIdOf(svg: string, target: string): string | null {
  const root = parseRoot(svg);
  if (!root) return null;
  const top = topElements(root);
  const index = top.findIndex((node) => drawn(node) && nodeMatches(node, target));
  if (index < 0) return null;
  return top[index].getAttribute('data-el') ?? `raw:${index}`;
}

// Animation designed by the AI ---------------------------------------------------------------------
//
// The AI writes a JSON array in an `<animation>` block next to each slide
// (format in `ANIMATION_CRAFT`, designPrompts.ts). It names elements by their
// `id`, or by their number in the ELEMENTS list of `elementsForAi`; those are
// resolved to the top-level element, which is stamped with `data-ani` when it
// has no `data-el`, so the stored list is an ordinary authored list.

const word = (value: unknown): string => (typeof value === 'string' ? value.toLowerCase().replace(/[^a-z]/g, '') : '');

const CLASS_WORD: Record<string, AnimClass> = { entr: 'entr', entrance: 'entr', enter: 'entr', emph: 'emph', emphasis: 'emph', exit: 'exit', out: 'exit' };

const EFFECT_WORD: Record<string, { effect: AnimEffect; cls?: AnimClass }> = {
  appear: { effect: 'appear' },
  disappear: { effect: 'appear', cls: 'exit' },
  fade: { effect: 'fade' },
  fadein: { effect: 'fade' },
  fadeout: { effect: 'fade', cls: 'exit' },
  fly: { effect: 'fly' },
  flyin: { effect: 'fly' },
  flyout: { effect: 'fly', cls: 'exit' },
  float: { effect: 'float' },
  floatin: { effect: 'float' },
  floatout: { effect: 'float', cls: 'exit' },
  zoom: { effect: 'zoom' },
  zoomin: { effect: 'zoom' },
  zoomout: { effect: 'zoom', cls: 'exit' },
  wipe: { effect: 'wipe' },
  wipein: { effect: 'wipe' },
  wipeout: { effect: 'wipe', cls: 'exit' },
  grow: { effect: 'grow', cls: 'emph' },
  shrink: { effect: 'grow', cls: 'emph' },
  growshrink: { effect: 'grow', cls: 'emph' },
  spin: { effect: 'spin', cls: 'emph' },
  pulse: { effect: 'pulse', cls: 'emph' },
};

const DIR_WORD: Record<string, AnimDir> = { up: 'up', top: 'up', above: 'up', down: 'down', bottom: 'down', below: 'down', left: 'left', right: 'right' };

/** The `<animation>` block of a reply: its entries, `[]` for an explicit "none", null when there is no readable block. */
export function parseAnimationBlock(text: string): Array<Record<string, unknown>> | null {
  const match = text.match(/<animation>([\s\S]*?)(?:<\/animation>|$)/i);
  if (!match) return null;
  const body = match[1];
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  try {
    const value: unknown = JSON.parse(body.slice(start, end + 1));
    if (!Array.isArray(value)) return null;
    return value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry));
  } catch {
    return null;
  }
}

/**
 * The authored list for entries the AI wrote, with the SVG stamped where drawn
 * artwork needed an address. Entries that name nothing on the slide are
 * skipped; null when entries were given but none could be placed.
 */
export function animationsFromAi(svg: string, entries: Array<Record<string, unknown>>): { svg: string; list: ElementAnimation[] } | null {
  if (entries.length === 0) return { svg, list: [] };
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || tagOf(root) !== 'svg') return null;
  const nodes = animatableNodes(root).map((entry) => entry.node);

  const find = (ref: unknown): Element | null => {
    if (typeof ref === 'number' || (typeof ref === 'string' && /^\s*\d+\s*$/.test(ref))) return nodes[Number(ref) - 1] ?? null;
    if (typeof ref !== 'string') return null;
    const key = ref.trim().replace(/^#/, '');
    if (!key) return null;
    const own = nodes.find((node) => node.getAttribute('data-el') === key || node.getAttribute('id') === key || node.getAttribute('data-ani') === key);
    if (own) return own;
    // A part of a unit: the unit comes in.
    return nodes.find((node) => Array.from(node.getElementsByTagName('*')).some((child) => child.getAttribute('id') === key)) ?? null;
  };

  let stamp = 0;
  for (const found of svg.matchAll(/data-ani="a(\d+)"/g)) stamp = Math.max(stamp, Number(found[1]));
  let stamped = false;
  const targetOf = (node: Element): string => {
    const own = node.getAttribute('data-el') || node.getAttribute('data-ani');
    if (own) return own;
    stamp += 1;
    stamped = true;
    node.setAttribute('data-ani', `a${stamp}`);
    return `a${stamp}`;
  };

  const raw: ElementAnimation[] = [];
  const entered = new Set<string>();
  let clicks = 0;
  for (const entry of entries.slice(0, MAX_ANIMATIONS)) {
    const node = find(entry.el ?? entry.target ?? entry.id ?? entry.element);
    if (!node) continue;
    const fx = EFFECT_WORD[word(entry.fx ?? entry.effect)];
    if (!fx) continue;
    const given = CLASS_WORD[word(entry.class ?? entry.cls ?? entry.type)];
    let cls: AnimClass = given ?? fx.cls ?? 'entr';
    if (!effectInfo(cls, fx.effect)) cls = fx.cls ?? 'entr';
    if (!effectInfo(cls, fx.effect)) continue;
    const target = targetOf(node);
    // One entrance per element: a second one would only hide it again.
    if (cls === 'entr') {
      if (entered.has(target)) continue;
      entered.add(target);
    }
    const trigger = word(entry.on ?? entry.trigger ?? entry.start);
    let start: AnimTrigger = trigger.startsWith('with') || trigger === 'together' || trigger === 'same' ? 'with' : trigger.startsWith('after') || trigger === 'then' ? 'after' : 'click';
    // Presenters should not need more than MAX_CLICKS clicks: the rest follow on their own.
    if (start === 'click') {
      clicks += 1;
      if (clicks > MAX_CLICKS) start = 'after';
    }
    const animation = makeAnimation(target, cls, fx.effect, start);
    const dirWord = word(entry.dir ?? entry.direction ?? entry.from).replace(/^(from|to)/, '');
    const dir = DIR_WORD[dirWord];
    const wanted = effectInfo(cls, fx.effect)?.dirs;
    if (dir && wanted && (wanted === 'side' || dir === 'up' || dir === 'down')) animation.dir = dir;
    const ms = Number(entry.ms ?? entry.duration);
    if (Number.isFinite(ms) && ms > 0) animation.duration = ms;
    const delay = Number(entry.delay);
    if (Number.isFinite(delay) && delay > 0) animation.delay = delay;
    const by = word(entry.by ?? entry.build);
    if ((by.startsWith('paragraph') || entry.paragraphs === true) && fx.effect !== 'appear' && paragraphsOf(node).length > 1) animation.paragraphs = true;
    raw.push(animation);
  }
  const list = sanitizeAnimations(raw) ?? [];
  if (list.length === 0) return null;
  return { svg: stamped ? new XMLSerializer().serializeToString(doc) : svg, list };
}

/** The page's elements as the AI is shown them: numbered in z-order, with the id it can name each by. */
export function elementsForAi(svg: string): string {
  const items = animatableElements(svg);
  if (items.length === 0) return '(nothing on this page can be animated)';
  return items.map((entry, position) => {
    const label = entry.label && entry.label !== KIND_NAME[entry.kind] ? ` "${entry.label}"` : '';
    const id = entry.domId ? ` — id "${entry.domId}"` : '';
    const build = entry.paragraphs.length > 1 ? ` — ${entry.paragraphs.length} paragraphs` : '';
    return `${position + 1}. ${KIND_NAME[entry.kind]}${label}${id}${build}`;
  }).join('\n');
}

/** A slide's animations in words, for the AI to keep or revise. */
export function animationsForAi(svg: string, list: ElementAnimation[]): string {
  const elements = animatableElements(svg);
  const lines: string[] = [];
  for (const animation of list) {
    const at = elements.findIndex((entry) => entry.keys.includes(animation.target));
    if (at < 0) continue;
    const element = elements[at];
    const effect = `${effectLabel(animation.cls, animation.effect)}${animation.dir ? ` ${animation.dir}` : ''}`;
    const when = animation.trigger === 'click' ? 'on click' : animation.trigger === 'with' ? 'with the one before' : 'after the one before';
    lines.push(`${lines.length + 1}. element ${at + 1}${element.label ? ` "${element.label}"` : ''}${element.domId ? ` (id "${element.domId}")` : ''} — ${CLASS_LABEL[animation.cls].toLowerCase()}: ${effect}, ${when}${animation.duration ? `, ${animation.duration} ms` : ''}${animation.paragraphs ? ', paragraph by paragraph' : ''}`);
  }
  return lines.join('\n');
}

// The automatic plan ---------------------------------------------------------------------------

interface Entry {
  index: number;
  tag: string;
  id: string;
  hasText: boolean;
  hasImage: boolean;
  /** An image covering most of the slide: it fades rather than zooms. */
  fullBleed: boolean;
  thin: boolean;
}

function entryOf(el: Element, index: number, view: { w: number; h: number }): Entry {
  const tag = tagOf(el);
  const images = tag === 'image' ? [el] : Array.from(el.getElementsByTagName('image'));
  const hasText = tag === 'text' || el.getElementsByTagName('text').length > 0;
  const fullBleed = images.some((image) => num(image.getAttribute('width')) >= view.w * 0.6 && num(image.getAttribute('height')) >= view.h * 0.6);
  const id = el.getAttribute('id') ?? '';
  return { index, tag, id, hasText, hasImage: images.length > 0, fullBleed, thin: tag === 'line' || THIN_ID.test(id) };
}

function effectFor(entry: Entry, isTitle: boolean): AnimEffect {
  if (entry.hasText || isTitle) return 'float';
  if (entry.hasImage) return entry.fullBleed ? 'fade' : 'zoom';
  return entry.thin ? 'wipe' : 'fade';
}

const planCache = new Map<string, AnimPlan>();

function remember(key: string, plan: AnimPlan): AnimPlan {
  if (planCache.size > 80) planCache.delete(planCache.keys().next().value as string);
  planCache.set(key, plan);
  return plan;
}

export const EMPTY_PLAN: AnimPlan = { items: [], steps: 0, rtl: false };

const isRtl = (root: Element): boolean => {
  const text = Array.from(root.getElementsByTagName('text')).map((el) => el.textContent ?? '').join(' ');
  const letters = text.match(LETTER)?.length ?? 0;
  return letters > 0 && (text.match(RTL_LETTER)?.length ?? 0) / letters > 0.4;
};

/** The automatic plan for one slide's SVG (cached: the slideshow asks again for every render). */
export function animationPlan(svg: string): AnimPlan {
  const cached = planCache.get(svg);
  if (cached) return cached;
  return remember(svg, makePlan(svg));
}

function makePlan(svg: string): AnimPlan {
  const root = parseRoot(svg);
  if (!root) return EMPTY_PLAN;
  const view = viewOf(root);

  // What moves: everything drawn except the background, the master artwork and non-drawing elements.
  const entries: Entry[] = [];
  let backgroundSeen = false;
  for (const [index, el] of topElements(root).entries()) {
    if (!drawn(el)) continue;
    if (!backgroundSeen) {
      backgroundSeen = true;
      if (isBackdrop(el, view)) continue;
    }
    entries.push(entryOf(el, index, view));
  }

  const rtl = isRtl(root);

  // Step 0 is the backdrop and the first block of text (the title); the rest group into click steps.
  const opening: Entry[] = [];
  const clicks: Entry[][] = [];
  let pending: Entry[] = [];
  let titleSeen = false;
  let title: Entry | null = null;
  for (const entry of entries) {
    if (!titleSeen) {
      opening.push(entry);
      if (entry.hasText) {
        titleSeen = true;
        title = entry;
      }
      continue;
    }
    if (FOOTER_ID.test(entry.id)) {
      (clicks.length > 0 ? clicks[clicks.length - 1] : opening).push(entry);
      continue;
    }
    if (entry.hasText || entry.hasImage) {
      clicks.push([...pending, entry]);
      pending = [];
    } else {
      pending.push(entry);
    }
  }
  if (pending.length > 0) (clicks.length > 0 ? clicks[clicks.length - 1] : opening).push(...pending);

  let grouped = clicks;
  if (clicks.length > MAX_CLICKS) {
    // An even split into MAX_CLICKS steps, keeping the drawing order.
    grouped = Array.from({ length: MAX_CLICKS }, (_, step) => clicks.slice(Math.floor((step * clicks.length) / MAX_CLICKS), Math.floor(((step + 1) * clicks.length) / MAX_CLICKS)).flat());
  }

  const items: AnimItem[] = [];
  const place = (list: Entry[], step: number): void => {
    list.forEach((entry, position) => {
      const effect = effectFor(entry, entry === title);
      const delay = Math.min(AUTO_MAX_DELAY, position * STAGGER);
      items.push({
        index: entry.index,
        effect,
        cls: 'entr',
        ...(effect === 'float' ? { dir: 'up' as const } : effect === 'wipe' ? { dir: rtl ? 'right' as const : 'left' as const } : {}),
        trigger: position > 0 ? 'with' : step === 0 ? 'after' : 'click',
        step,
        delay,
        at: delay,
        duration: effect === 'float' ? 600 : 500,
      });
    });
  };
  place(opening, 0);
  grouped.forEach((list, position) => place(list, position + 1));
  return { items, steps: grouped.length, rtl };
}

// The authored plan --------------------------------------------------------------------------------

/** The plan for an authored list; animations whose element is gone are skipped. */
export function planFromList(svg: string, list: ElementAnimation[]): AnimPlan {
  const root = parseRoot(svg);
  if (!root) return { items: [], steps: 0, rtl: false, custom: true };
  const top = topElements(root);
  const items: AnimItem[] = [];
  let step = 0;
  let started = false;
  // Start of the current "after previous" group inside the step, and how long the group has run so far.
  let cursor = 0;
  let groupEnd = 0;

  const place = (animation: ElementAnimation, index: number, para: number | undefined): void => {
    if (animation.trigger === 'click') {
      step = started ? step + 1 : 1;
      cursor = 0;
      groupEnd = 0;
    } else if (animation.trigger === 'after' && started) {
      cursor += groupEnd;
      groupEnd = 0;
    }
    started = true;
    const delay = animation.delay;
    const duration = animation.effect === 'appear' ? 0 : animation.duration;
    items.push({
      index,
      effect: animation.effect,
      cls: animation.cls,
      ...(animation.dir ? { dir: animation.dir } : {}),
      trigger: animation.trigger,
      step,
      delay,
      at: cursor + delay,
      duration,
      ...(para !== undefined ? { para } : {}),
      ref: animation.id,
    });
    groupEnd = Math.max(groupEnd, delay + duration);
  };

  for (const animation of list) {
    const index = top.findIndex((node) => drawn(node) && nodeMatches(node, animation.target));
    if (index < 0) continue;
    const paragraphs = animation.paragraphs ? paragraphsOf(top[index]) : [];
    if (paragraphs.length > 1) paragraphs.forEach((para) => place(animation, index, para));
    else place(animation, index, undefined);
  }
  return { items, steps: step, rtl: isRtl(root), custom: true };
}

/**
 * The plan a slide plays: its authored list when it has one (an empty list is
 * "no animation"), else the automatic plan. A list none of whose elements are
 * left (the slide was redrawn) falls back to the automatic plan.
 */
export function slidePlan(svg: string, list?: ElementAnimation[]): AnimPlan {
  if (!list) return animationPlan(svg);
  const key = `${JSON.stringify(list)}\u0000${svg}`;
  const cached = planCache.get(key);
  if (cached) return cached;
  const plan = planFromList(svg, list);
  return remember(key, list.length > 0 && plan.items.length === 0 ? animationPlan(svg) : plan);
}

/**
 * The automatic plan as an authored list (the elements are stamped so they can
 * be told apart), for "customize this slide's animation".
 */
export function listFromPlan(svg: string): { svg: string; list: ElementAnimation[] } {
  const plan = animationPlan(svg);
  let current = svg;
  const list: ElementAnimation[] = [];
  for (const item of plan.items) {
    const ensured = ensureTarget(current, `raw:${item.index}`);
    if (!ensured) continue;
    current = ensured.svg;
    list.push({
      id: newAnimationId(),
      target: ensured.target,
      cls: item.cls,
      effect: item.effect,
      ...(item.dir ? { dir: item.dir } : {}),
      trigger: item.trigger,
      duration: item.duration,
      delay: item.delay,
    });
  }
  return { svg: current, list };
}

/** How long the slideshow takes to play step `step` from its start, in ms. */
export function stepDuration(plan: AnimPlan, step: number): number {
  return plan.items.filter((item) => item.step === step).reduce((end, item) => Math.max(end, item.at + item.duration), 0);
}

// The slideshow ----------------------------------------------------------------------------------------

/**
 * The SVG with each animated element wrapped in a `<g data-step>`, one wrapper
 * per animation (a paragraph build wraps the paragraph's text). The slideshow
 * flips each wrapper's `data-state` between `pre` and `post` as steps are
 * reached (CSS in `design.css`). A wrapper carries no transform of its own, so
 * a CSS transform on it never replaces the element's.
 */
export function tagAnimation(svg: string, plan: AnimPlan): string {
  if (plan.items.length === 0) return svg;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const view = viewOf(root);
  const top = topElements(root);

  const decorate = (wrapper: Element, item: AnimItem): void => {
    wrapper.setAttribute('data-step', String(item.step));
    wrapper.setAttribute('data-cls', item.cls);
    wrapper.setAttribute('data-fx', item.effect);
    if (item.dir) wrapper.setAttribute('data-dir', item.dir);
    wrapper.setAttribute('data-state', 'pre');
    const vars = [`--fx-at:${item.at / 1000}s`, `--fx-dur:${item.duration / 1000}s`];
    if (item.effect === 'fly') {
      const x = item.dir === 'left' ? -view.w : item.dir === 'right' ? view.w : 0;
      const y = item.dir === 'up' ? -view.h : item.dir === 'down' ? view.h : 0;
      vars.push(`--fx-x:${x}px`, `--fx-y:${y}px`);
    } else if (item.effect === 'float') {
      const away = item.cls === 'exit' ? (item.dir === 'up' ? -1 : 1) : (item.dir === 'down' ? -1 : 1);
      vars.push(`--fx-fy:${Math.round(away * view.h * 0.1)}px`);
    }
    wrapper.setAttribute('style', vars.join(';'));
  };

  const byIndex = new Map<number, AnimItem[]>();
  for (const item of plan.items) byIndex.set(item.index, [...(byIndex.get(item.index) ?? []), item]);

  for (const [index, items] of byIndex) {
    const node = top[index];
    if (!node) continue;
    // Paragraph builds wrap inside the element.
    for (const item of items.filter((entry) => entry.para !== undefined)) {
      const marked = Array.from(node.getElementsByTagName('*')).filter((el) => el.getAttribute('data-para') === String(item.para));
      const parents = new Set(marked.map((el) => el.parentNode));
      for (const parent of parents) {
        const mine = marked.filter((el) => el.parentNode === parent);
        const wrapper = doc.createElementNS(SVG_NS, 'g');
        decorate(wrapper, item);
        parent?.insertBefore(wrapper, mine[0]);
        mine.forEach((el) => wrapper.appendChild(el));
      }
    }
    // Whole-element effects nest, the first one innermost.
    let outer: Element = node;
    for (const item of items.filter((entry) => entry.para === undefined)) {
      const wrapper = doc.createElementNS(SVG_NS, 'g');
      decorate(wrapper, item);
      root.insertBefore(wrapper, outer);
      wrapper.appendChild(outer);
      outer = wrapper;
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

// PowerPoint -----------------------------------------------------------------------------------

interface Preset {
  id: number;
  subtype: number;
}

const SIDE_SUBTYPE: Record<AnimDir, number> = { up: 1, right: 2, down: 4, left: 8 };

function presetOf(item: AnimItem, rtl: boolean): Preset {
  const dir = item.dir ?? (item.effect === 'wipe' && rtl ? 'right' : undefined);
  switch (item.effect) {
    case 'appear': return { id: 1, subtype: 0 };
    case 'fade': return { id: 10, subtype: 0 };
    case 'fly': return { id: 2, subtype: SIDE_SUBTYPE[dir ?? 'down'] };
    case 'float': return { id: 42, subtype: (item.cls === 'exit' ? item.dir === 'up' : item.dir === 'down') ? 1 : 0 };
    case 'zoom': return { id: 53, subtype: 16 };
    case 'wipe': return { id: 22, subtype: SIDE_SUBTYPE[dir ?? 'left'] };
    case 'grow': return { id: 6, subtype: 0 };
    case 'spin': return { id: 8, subtype: 0 };
    default: return { id: 26, subtype: 0 };
  }
}

/** What the timing needs to know about a shape: whether it has a text body and a visible fill or outline. */
export interface TimingShape {
  text: boolean;
  background: boolean;
}

const WIPE_FILTER: Record<AnimDir, string> = { up: 'wipe(up)', down: 'wipe(down)', left: 'wipe(left)', right: 'wipe(right)' };

/**
 * The `<p:timing>` element for a slide: the plan's effects in order, grouped
 * the way PowerPoint writes them (a click starts a group; "with previous"
 * joins the running one; "after previous" starts the next one when the last
 * has finished). `targets` maps an element index of the plan to the shape ids
 * that were written for it; `shapes` says which of those can carry a text
 * build (`<p:bldLst>`). Empty string when nothing animates.
 */
export function timingXml(plan: AnimPlan, targets: Map<number, number[]>, shapes: Map<number, TimingShape> = new Map()): string {
  let counter = 2;
  const nextId = (): number => ++counter;
  const built = new Map<number, { paragraphs: boolean; whole: boolean }>();

  const behaviours = (item: AnimItem, spid: number, para: number | undefined): string => {
    const target = para === undefined
      ? `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`
      : `<p:tgtEl><p:spTgt spid="${spid}"><p:txEl><p:pRg st="${para}" end="${para}"/></p:txEl></p:spTgt></p:tgtEl>`;
    const dur = Math.max(1, Math.round(item.duration));
    const visibility = (value: 'visible' | 'hidden', delay: number): string => `<p:set><p:cBhvr><p:cTn id="${nextId()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>${target}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${value}"/></p:to></p:set>`;
    const move = (attribute: 'ppt_x' | 'ppt_y' | 'ppt_w' | 'ppt_h', from: string, to: string, additive: boolean): string => `<p:anim calcmode="lin" valueType="num"><p:cBhvr${additive ? ' additive="base"' : ''}><p:cTn id="${nextId()}" dur="${dur}" fill="hold"/>${target}<p:attrNameLst><p:attrName>${attribute}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val>${from}</p:val></p:tav><p:tav tm="100000"><p:val>${to}</p:val></p:tav></p:tavLst></p:anim>`;
    const str = (value: string): string => `<p:strVal val="${value}"/>`;
    const filter = (name: string, transition: 'in' | 'out'): string => `<p:animEffect transition="${transition}" filter="${name}"><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}"/>${target}</p:cBhvr></p:animEffect>`;
    const dir = item.dir ?? (item.effect === 'wipe' && plan.rtl ? 'right' : undefined);

    if (item.cls === 'emph') {
      if (item.effect === 'spin') return `<p:animRot by="21600000"><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}" fill="hold"/>${target}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`;
      const by = item.effect === 'pulse' ? 110000 : 150000;
      return `<p:animScale><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}"${item.effect === 'pulse' ? ' autoRev="1"' : ''} fill="hold"/>${target}</p:cBhvr><p:by x="${by}" y="${by}"/></p:animScale>`;
    }

    // Where a fly or float starts (entrance) or ends (exit), as PowerPoint's own presets write it.
    const offX = (side: AnimDir | undefined): string | null => (side === 'left' ? '0-#ppt_w/2' : side === 'right' ? '1+#ppt_w/2' : null);
    const offY = (side: AnimDir | undefined): string | null => (side === 'up' ? '0-#ppt_h/2' : side === 'down' ? '1+#ppt_h/2' : null);

    if (item.cls === 'entr') {
      const show = visibility('visible', 0);
      switch (item.effect) {
        case 'appear':
          return show;
        case 'fly': {
          const x = offX(dir);
          const y = offY(dir ?? 'down');
          return show + move('ppt_x', str(x ?? '#ppt_x'), str('#ppt_x'), true) + move('ppt_y', str(y ?? '#ppt_y'), str('#ppt_y'), true);
        }
        case 'float':
          return show + move('ppt_y', str(item.dir === 'down' ? '#ppt_y-.1' : '#ppt_y+.1'), str('#ppt_y'), false) + filter('fade', 'in');
        case 'zoom':
          return show + move('ppt_w', '<p:fltVal val="0"/>', str('#ppt_w'), false) + move('ppt_h', '<p:fltVal val="0"/>', str('#ppt_h'), false) + filter('fade', 'in');
        case 'wipe':
          return show + filter(WIPE_FILTER[dir ?? 'left'], 'in');
        default:
          return show + filter('fade', 'in');
      }
    }

    // Exit: the effect, then the object is hidden for good.
    const hide = visibility('hidden', Math.max(0, dur - 1));
    switch (item.effect) {
      case 'appear':
        return visibility('hidden', 0);
      case 'fly': {
        const x = offX(dir);
        const y = offY(dir ?? 'down');
        return move('ppt_x', str('#ppt_x'), str(x ?? '#ppt_x'), true) + move('ppt_y', str('#ppt_y'), str(y ?? '#ppt_y'), true) + hide;
      }
      case 'float':
        return move('ppt_y', str('#ppt_y'), str(item.dir === 'up' ? '#ppt_y-.1' : '#ppt_y+.1'), false) + filter('fade', 'out') + hide;
      case 'zoom':
        return move('ppt_w', str('#ppt_w'), '<p:fltVal val="0"/>', false) + move('ppt_h', str('#ppt_h'), '<p:fltVal val="0"/>', false) + filter('fade', 'out') + hide;
      case 'wipe':
        return filter(WIPE_FILTER[dir ?? 'left'], 'out') + hide;
      default:
        return filter('fade', 'out') + hide;
    }
  };

  const steps: string[] = [];
  for (let step = 0; step <= plan.steps; step += 1) {
    const inStep = plan.items.filter((item) => item.step === step).filter((item) => (targets.get(item.index) ?? []).length > 0);
    if (inStep.length === 0) continue;
    const outer = nextId();

    // Groups of effects that start together: a group begins at the click, and again after each "after previous".
    const groups: Array<{ offset: number; effects: string[] }> = [];
    let offset = 0;
    let groupEnd = 0;
    let current: { offset: number; effects: string[] } | null = null;
    for (const item of inStep) {
      const ids = targets.get(item.index) ?? [];
      const preset = presetOf(item, plan.rtl);
      const paragraphBuild = item.para !== undefined && ids.length === 1;
      // A paragraph build needs one shape to point into; otherwise the first paragraph stands for the element.
      if (item.para !== undefined && !paragraphBuild && item.para !== plan.items.find((entry) => entry.index === item.index && entry.para !== undefined)?.para) continue;
      if (!current || item.trigger === 'after') {
        if (current) offset += groupEnd;
        groupEnd = 0;
        current = { offset, effects: [] };
        groups.push(current);
      }
      groupEnd = Math.max(groupEnd, item.delay + Math.max(0, item.duration));
      ids.forEach((spid, position) => {
        const shape = shapes.get(spid);
        const text = Boolean(shape?.text);
        const nodeType = position > 0 ? 'withEffect' : item.trigger === 'click' ? 'clickEffect' : item.trigger === 'with' ? 'withEffect' : 'afterEffect';
        const id = nextId();
        const para = paragraphBuild ? item.para : undefined;
        if (text) {
          const known = built.get(spid) ?? { paragraphs: false, whole: false };
          if (para !== undefined) known.paragraphs = true;
          else known.whole = true;
          built.set(spid, known);
        }
        current!.effects.push(`<p:par><p:cTn id="${id}" presetID="${preset.id}" presetClass="${item.cls}" presetSubtype="${preset.subtype}" fill="hold"${text ? ' grpId="0"' : ''} nodeType="${nodeType}"><p:stCondLst><p:cond delay="${Math.round(item.delay)}"/></p:stCondLst><p:childTnLst>${behaviours(item, spid, para)}</p:childTnLst></p:cTn></p:par>`);
      });
    }
    const inner = groups.map((group) => `<p:par><p:cTn id="${nextId()}" fill="hold"><p:stCondLst><p:cond delay="${Math.round(group.offset)}"/></p:stCondLst><p:childTnLst>${group.effects.join('')}</p:childTnLst></p:cTn></p:par>`).join('');
    const start = step === 0 ? '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : '<p:cond delay="indefinite"/>';
    steps.push(`<p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst>${start}</p:stCondLst><p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par>`);
  }
  if (steps.length === 0) return '';
  const builds = [...built.entries()].map(([spid, how]) => {
    const shape = shapes.get(spid);
    return `<p:bldP spid="${spid}" grpId="0"${how.paragraphs && !how.whole ? ' build="p"' : ''}${shape?.background && !(how.paragraphs && !how.whole) ? ' animBg="1"' : ''}/>`;
  }).join('');
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${steps.join('')}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${builds ? `<p:bldLst>${builds}</p:bldLst>` : ''}</p:timing>`;
}

/** `<p:transition>` for the deck's slide change, or ''. */
export function transitionXml(transition: 'fade' | 'slide' | 'none' | undefined): string {
  if (transition === 'fade') return '<p:transition spd="med"><p:fade/></p:transition>';
  if (transition === 'slide') return '<p:transition spd="med"><p:push dir="l"/></p:transition>';
  return '';
}

// Reading a PowerPoint slide's timing -------------------------------------------------------------------

const lname = (el: Element): string => (el.localName || el.nodeName).replace(/^.*:/, '');
const kidsOf = (el: Element, name: string): Element[] => childrenOf(el).filter((child) => lname(child) === name);
const descendantsOf = (el: Element, name: string): Element[] => Array.from(el.getElementsByTagName('*')).filter((child) => lname(child) === name);

const ENTRANCE: Record<number, AnimEffect> = { 1: 'appear', 10: 'fade', 2: 'fly', 42: 'float', 53: 'zoom', 22: 'wipe' };

function sideOf(subtype: number): AnimDir {
  if (subtype & 8) return 'left';
  if (subtype & 2) return 'right';
  if (subtype & 1) return 'up';
  return 'down';
}

export interface TimingImport {
  animations: ElementAnimation[];
  /** Effects that had no equivalent and became the nearest one. */
  approximated: number;
}

/**
 * The animations of a PowerPoint `<p:timing>` element: one per effect of the
 * main sequence, in order, with the shape each targets looked up through
 * `shapeTarget` (PowerPoint's shape id → the element's `data-el` id). Effects
 * on shapes that are not on the slide are dropped; presets without an
 * equivalent become Fade (entrance, exit) or Pulse (emphasis).
 */
export function animationsFromTiming(timing: Element, shapeTarget: (spid: number) => string | null): TimingImport {
  const out: ElementAnimation[] = [];
  let approximated = 0;
  const main = descendantsOf(timing, 'cTn').find((node) => node.getAttribute('nodeType') === 'mainSeq');
  if (!main) return { animations: out, approximated };
  const effects = descendantsOf(main, 'cTn').filter((node) => node.hasAttribute('presetClass') && node.hasAttribute('presetID'));
  const paragraphOwner = new Map<string, ElementAnimation>();
  for (const node of effects) {
    const cls: AnimClass = node.getAttribute('presetClass') === 'exit' ? 'exit' : node.getAttribute('presetClass') === 'emph' ? 'emph' : 'entr';
    if (node.getAttribute('presetClass') !== 'entr' && node.getAttribute('presetClass') !== 'exit' && node.getAttribute('presetClass') !== 'emph') continue;
    const preset = Number(node.getAttribute('presetID'));
    const subtype = Number(node.getAttribute('presetSubtype') ?? '0') || 0;
    const targetEl = descendantsOf(node, 'spTgt')[0];
    if (!targetEl) continue;
    const spid = Number(targetEl.getAttribute('spid'));
    const target = Number.isFinite(spid) ? shapeTarget(spid) : null;
    if (!target) continue;
    const range = descendantsOf(targetEl, 'pRg')[0];
    const para = range ? Number(range.getAttribute('st')) : null;

    let effect: AnimEffect;
    if (cls === 'emph') {
      effect = preset === 6 ? 'grow' : preset === 8 ? 'spin' : preset === 26 ? 'pulse' : 'pulse';
      if (![6, 8, 26].includes(preset)) approximated += 1;
    } else {
      effect = ENTRANCE[preset] ?? 'fade';
      if (!ENTRANCE[preset]) approximated += 1;
    }
    let dir: AnimDir | undefined;
    if (effect === 'fly' || effect === 'wipe') dir = sideOf(subtype);
    else if (effect === 'float') {
      const values = descendantsOf(node, 'strVal').map((value) => value.getAttribute('val') ?? '');
      const down = values.some((value) => /#ppt_y-\./.test(value));
      dir = cls === 'exit' ? (values.some((value) => /#ppt_y\+\./.test(value)) ? 'down' : 'up') : (down ? 'down' : 'up');
    }

    const nodeType = node.getAttribute('nodeType');
    const trigger: AnimTrigger = nodeType === 'withEffect' ? 'with' : nodeType === 'afterEffect' ? 'after' : 'click';
    const own = kidsOf(node, 'stCondLst')[0];
    const delay = Number(kidsOf(own ?? node, 'cond')[0]?.getAttribute('delay') ?? '0');
    const durations = descendantsOf(node, 'cTn').map((child) => Number(child.getAttribute('dur'))).filter((value) => Number.isFinite(value) && value > 1);
    const duration = effect === 'appear' ? 0 : Math.min(MAX_DURATION, Math.max(MIN_DURATION, durations.length > 0 ? Math.max(...durations) : defaultDuration(cls, effect)));

    if (para !== null && Number.isFinite(para)) {
      const key = `${target}:${cls}:${effect}`;
      if (paragraphOwner.has(key)) continue;
      const animation: ElementAnimation = { id: newAnimationId(), target, cls, effect, ...(dir ? { dir } : {}), trigger, duration, delay: Number.isFinite(delay) ? Math.max(0, Math.min(MAX_DELAY, delay)) : 0, paragraphs: true };
      paragraphOwner.set(key, animation);
      out.push(animation);
      continue;
    }
    out.push({ id: newAnimationId(), target, cls, effect, ...(dir ? { dir } : {}), trigger, duration, delay: Number.isFinite(delay) ? Math.max(0, Math.min(MAX_DELAY, delay)) : 0 });
  }
  return { animations: out.slice(0, MAX_ANIMATIONS), approximated };
}
