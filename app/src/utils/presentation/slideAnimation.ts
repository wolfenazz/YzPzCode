// Element animation for designed slides. One plan per slide, made from its SVG,
// drives both the slideshow (`SvgSlide` builds the page up as → is pressed) and
// the exported PowerPoint (`<p:timing>`), so what is presented is what is saved.
//
// The plan: the backdrop and the title come in by themselves when the slide
// opens (step 0); every following block (a top-level group with text or a
// picture) is one click step, carrying the decoration drawn just before it. A
// slide never needs more than MAX_CLICKS clicks: past that, neighbouring blocks
// share a step. Uses the global DOMParser / XMLSerializer; no other dependencies.

export type AnimEffect = 'fade' | 'float' | 'zoom' | 'wipe';

export interface AnimItem {
  /** Position among the SVG root's element children. */
  index: number;
  effect: AnimEffect;
  /** 0 = plays when the slide opens, 1.. = one click each. */
  step: number;
  /** Milliseconds after its step starts. */
  delay: number;
  /** Milliseconds the effect takes. */
  duration: number;
}

export interface AnimPlan {
  items: AnimItem[];
  /** Clicks needed to show everything (step 0 is free). */
  steps: number;
  /** Right-to-left text: wipes run from the right. */
  rtl: boolean;
}

export const MAX_CLICKS = 6;
const STAGGER = 120;
const MAX_DELAY = 720;
const SVG_NS = 'http://www.w3.org/2000/svg';

const NON_VISUAL = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'lineargradient', 'radialgradient', 'clippath', 'filter', 'marker', 'symbol', 'mask', 'pattern', 'script']);
const FOOTER_ID = /footer|credit|source|page-?num|slide-?num|folio/i;
const THIN_ID = /\b(?:line|rule|bar|divider|underline|stripe|accent-?bar)\b|(?:^|[-_])(?:line|rule|bar|divider|underline|stripe)(?:$|[-_])/i;
const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/g;
const LETTER = /\p{L}/gu;

const tagOf = (el: Element): string => (el.localName || el.nodeName).toLowerCase();
const num = (value: string | null): number => {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : 0;
};

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

function topElements(root: Element): Element[] {
  return Array.from(root.childNodes).filter((node) => node.nodeType === 1) as Element[];
}

function viewOf(root: Element): { w: number; h: number } {
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  return box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? { w: box[2], h: box[3] } : { w: 1280, h: 720 };
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

/** The animation plan for one slide's SVG (cached: the slideshow asks again for every render). */
export function animationPlan(svg: string): AnimPlan {
  const cached = planCache.get(svg);
  if (cached) return cached;
  const plan = makePlan(svg);
  if (planCache.size > 80) planCache.delete(planCache.keys().next().value as string);
  planCache.set(svg, plan);
  return plan;
}

export const EMPTY_PLAN: AnimPlan = { items: [], steps: 0, rtl: false };

function makePlan(svg: string): AnimPlan {
  if (!svg) return EMPTY_PLAN;
  let root: Element;
  try {
    root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  } catch {
    return EMPTY_PLAN;
  }
  if (!root || tagOf(root) !== 'svg') return EMPTY_PLAN;
  const view = viewOf(root);
  const top = topElements(root);

  // What moves: everything drawn except the background, the master artwork and non-drawing elements.
  const entries: Entry[] = [];
  let backgroundSeen = false;
  for (const [index, el] of top.entries()) {
    const tag = tagOf(el);
    if (NON_VISUAL.has(tag)) continue;
    if (el.hasAttribute('data-bg') || el.hasAttribute('data-layer')) continue;
    if (!backgroundSeen) {
      backgroundSeen = true;
      const covers = tag === 'rect' && num(el.getAttribute('x')) <= 1 && num(el.getAttribute('y')) <= 1 && num(el.getAttribute('width')) >= view.w - 1 && num(el.getAttribute('height')) >= view.h - 1;
      if (covers) continue;
    }
    entries.push(entryOf(el, index, view));
  }

  const text = Array.from(root.getElementsByTagName('text')).map((el) => el.textContent ?? '').join(' ');
  const letters = text.match(LETTER)?.length ?? 0;
  const rtl = letters > 0 && (text.match(RTL_LETTER)?.length ?? 0) / letters > 0.4;

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
      items.push({
        index: entry.index,
        effect,
        step,
        delay: Math.min(MAX_DELAY, position * STAGGER),
        duration: effect === 'float' ? 600 : 500,
      });
    });
  };
  place(opening, 0);
  grouped.forEach((list, position) => place(list, position + 1));
  return { items, steps: grouped.length, rtl };
}

/**
 * The SVG with each animated top-level element wrapped in a `<g data-step>`
 * that starts hidden; the slideshow reveals the wrappers step by step (CSS in
 * `design.css`). The wrapper carries no transform, so a CSS transform on it
 * never replaces the element's own.
 */
export function tagAnimation(svg: string, plan: AnimPlan): string {
  if (plan.items.length === 0) return svg;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const top = topElements(root);
  for (const item of plan.items) {
    const node = top[item.index];
    if (!node) continue;
    const wrapper = doc.createElementNS(SVG_NS, 'g');
    wrapper.setAttribute('data-step', String(item.step));
    wrapper.setAttribute('data-fx', item.effect);
    if (item.effect === 'wipe' && plan.rtl) wrapper.setAttribute('data-dir', 'right');
    wrapper.setAttribute('data-state', 'out');
    wrapper.setAttribute('style', `--fx-delay:${item.delay / 1000}s;--fx-dur:${item.duration / 1000}s`);
    root.insertBefore(wrapper, node);
    wrapper.appendChild(node);
  }
  return new XMLSerializer().serializeToString(doc);
}

// PowerPoint ---------------------------------------------------------------------------------

interface PresetInfo {
  id: number;
  subtype: number;
}

const PRESETS: Record<AnimEffect, PresetInfo> = {
  fade: { id: 10, subtype: 0 },
  float: { id: 42, subtype: 1 },
  zoom: { id: 53, subtype: 16 },
  wipe: { id: 22, subtype: 8 },
};

/**
 * The `<p:timing>` element for a slide: entrance effects (Fade, Float In, Zoom,
 * Wipe) in the plan's order, step 0 starting by itself ("After Previous" at
 * the slide start) and every other step on a click. `targets` maps an
 * element index of the plan to the shape ids that were written for it.
 * Empty string when nothing animates.
 */
export function timingXml(plan: AnimPlan, targets: Map<number, number[]>): string {
  let counter = 2;
  const nextId = (): number => ++counter;

  const behaviours = (item: AnimItem, spid: number): string => {
    const target = `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
    const show = `<p:set><p:cBhvr><p:cTn id="${nextId()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${target}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
    const number = (attribute: string, from: string): string => `<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${nextId()}" dur="${item.duration}" fill="hold"/>${target}<p:attrNameLst><p:attrName>${attribute}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val>${from}</p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#${attribute}"/></p:val></p:tav></p:tavLst></p:anim>`;
    const filter = (name: string): string => `<p:animEffect transition="in" filter="${name}"><p:cBhvr><p:cTn id="${nextId()}" dur="${item.duration}"/>${target}</p:cBhvr></p:animEffect>`;
    switch (item.effect) {
      case 'float':
        return show + number('ppt_y', '<p:strVal val="#ppt_y+.08"/>') + filter('fade');
      case 'zoom':
        return show + number('ppt_w', '<p:fltVal val="0"/>') + number('ppt_h', '<p:fltVal val="0"/>') + filter('fade');
      case 'wipe':
        return show + filter(plan.rtl ? 'wipe(right)' : 'wipe(left)');
      default:
        return show + filter('fade');
    }
  };

  const steps: string[] = [];
  for (let step = 0; step <= plan.steps; step += 1) {
    const inStep = plan.items.filter((item) => item.step === step).filter((item) => (targets.get(item.index) ?? []).length > 0);
    if (inStep.length === 0) continue;
    const outer = nextId();
    const inner = nextId();
    let first = true;
    const effects: string[] = [];
    for (const item of inStep) {
      const preset = item.effect === 'wipe' && plan.rtl ? { id: 22, subtype: 2 } : PRESETS[item.effect];
      for (const spid of targets.get(item.index) ?? []) {
        const nodeType = first ? (step === 0 ? 'afterEffect' : 'clickEffect') : 'withEffect';
        first = false;
        const id = nextId();
        effects.push(`<p:par><p:cTn id="${id}" presetID="${preset.id}" presetClass="entr" presetSubtype="${preset.subtype}" fill="hold" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${item.delay}"/></p:stCondLst><p:childTnLst>${behaviours(item, spid)}</p:childTnLst></p:cTn></p:par>`);
      }
    }
    const start = step === 0 ? '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : '<p:cond delay="indefinite"/>';
    steps.push(`<p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst>${start}</p:stCondLst><p:childTnLst><p:par><p:cTn id="${inner}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects.join('')}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`);
  }
  if (steps.length === 0) return '';
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${steps.join('')}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

/** `<p:transition>` for the deck's slide change, or ''. */
export function transitionXml(transition: 'fade' | 'slide' | 'none' | undefined): string {
  if (transition === 'fade') return '<p:transition spd="med"><p:fade/></p:transition>';
  if (transition === 'slide') return '<p:transition spd="med"><p:push dir="l"/></p:transition>';
  return '';
}
