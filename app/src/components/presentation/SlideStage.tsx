import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { prepareSvgForDisplay } from '../../utils/presentation/svgSafe';
import { setSvgText, svgTextItems } from '../../utils/presentation/svgText';
import { adoptNode, listElements, moveElements, readModel, replaceElement, resizeElement, type ElementInfo } from '../../utils/presentation/slideEdit';
import { findElement, layoutText, replaceNested, type Box, type Measure, type SlideElement, type TxBody } from '../../utils/presentation/slideModel';
import { presetTextRect } from '../../utils/presentation/slideGeometry';
import { bodyToHtml, emptyBody, htmlToBody } from './textEditing';

/** What is being typed into: a modelled text body (maybe inside a group), or a drawn `<text>`. */
export type EditTarget =
  | { kind: 'model'; topId: string; nestedId: string }
  | { kind: 'raw'; textIndex: number; box: Box };

interface SlideStageProps {
  svg: string;
  canvas: { width: number; height: number };
  /** Display width in px. */
  width: number;
  resolveHref: (href: string) => string;
  measure: Measure;
  /** False while a proposal is shown: the slide is only displayed. */
  editable: boolean;
  selection: string[];
  onSelection: (ids: string[]) => void;
  /** A new slide SVG to keep; `coalesce` merges repeated edits into one undo step. */
  onCommit: (svg: string, coalesce?: string) => void;
  editing: EditTarget | null;
  onEditing: (target: EditTarget | null) => void;
  /** The contentEditable while editing, for the format bar's selection commands. */
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Default style for text typed into a shape that had none. */
  textDefaults: { font: string; size: number; color: string };
  /** Lets the editor wrap selected drawn artwork before changing it (keyboard and menu commands). */
  apiRef?: React.MutableRefObject<StageApi | null>;
  /** Double-click on a picture: a modelled picture by id, or a drawn `<image>` by index. */
  onPicture?: (target: { id?: string; imageIndex?: number }) => void;
}

export interface StageApi {
  /** Wraps raw selections into art elements; returns the slide and the ids to use. */
  adopt: (ids: string[]) => { svg: string; ids: string[] };
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface Guide { axis: 'x' | 'y'; at: number }

/** Raw (drawn) top-level nodes are addressed as `raw:<index among the root's element children>`. */
const rawIndex = (id: string): number | null => (id.startsWith('raw:') ? Number(id.slice(4)) : null);

const unionBox = (boxes: Box[]): Box => {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return { x, y, w: Math.max(...boxes.map((box) => box.x + box.w)) - x, h: Math.max(...boxes.map((box) => box.y + box.h)) - y };
};

export const SlideStage: React.FC<SlideStageProps> = ({ svg, canvas, width, resolveHref, measure, editable, selection, onSelection, onCommit, editing, onEditing, editorRef, textDefaults, apiRef, onPicture }) => {
  const prefix = `st${useId().replace(/[^\w]/g, '')}`;
  const scale = width / canvas.width;
  const height = canvas.height * scale;
  const host = useRef<HTMLDivElement>(null);
  const markup = useMemo(() => (svg ? prepareSvgForDisplay(svg, { prefix, resolveHref }) : ''), [prefix, resolveHref, svg]);
  const elements = useMemo(() => listElements(svg), [svg]);
  const byId = useMemo(() => new Map(elements.map((info) => [info.id, info])), [elements]);
  const [rawBoxes, setRawBoxes] = useState<Record<string, Box>>({});
  const [hover, setHover] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [preview, setPreview] = useState<Box | null>(null);
  const svgRoot = (): SVGSVGElement | null => host.current?.querySelector('svg') ?? null;

  /** A node's box in slide units, measured where it is drawn. */
  const measureNode = useCallback((node: Element): Box | null => {
    const root = svgRoot();
    if (!root) return null;
    const outer = root.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    const k = canvas.width / outer.width;
    return { x: (rect.left - outer.left) * k, y: (rect.top - outer.top) * k, w: rect.width * k, h: rect.height * k };
  }, [canvas.width]);

  const topNode = useCallback((id: string): Element | null => {
    const root = svgRoot();
    if (!root) return null;
    const index = rawIndex(id);
    const kids = Array.from(root.children);
    if (index !== null) return kids[index] ?? null;
    return kids.find((el) => el.getAttribute('data-el') === id) ?? null;
  }, []);

  // Boxes of selected drawn nodes, measured after each render.
  useLayoutEffect(() => {
    const raws = [...selection, ...(hover ? [hover] : [])].filter((id) => rawIndex(id) !== null);
    if (raws.length === 0) { setRawBoxes({}); return; }
    const next: Record<string, Box> = {};
    for (const id of raws) {
      const node = topNode(id);
      const box = node ? measureNode(node) : null;
      if (box) next[id] = box;
    }
    setRawBoxes(next);
  }, [hover, markup, measureNode, selection, topNode, width]);

  const boxOf = useCallback((id: string): Box | null => byId.get(id)?.box ?? rawBoxes[id] ?? null, [byId, rawBoxes]);

  /** The element under a pointer target: a modelled/art element id or a raw node. */
  const hitTest = useCallback((target: EventTarget | null): { id: string; node: Element } | null => {
    const root = svgRoot();
    if (!root || !(target instanceof Element) || !root.contains(target) || target === root) return null;
    let node: Element | null = target;
    while (node && node.parentElement !== (root as unknown as Element)) node = node.parentElement;
    if (!node) return null;
    if (node.tagName.toLowerCase() === 'defs' || node.hasAttribute('data-bg') || node.hasAttribute('data-layer')) return null;
    const id = node.getAttribute('data-el');
    if (id) return { id, node };
    // A full-canvas first rectangle is the background.
    const index = Array.from(root.children).indexOf(node);
    const box = measureNode(node);
    if (box && box.w >= canvas.width - 2 && box.h >= canvas.height - 2 && node.tagName.toLowerCase() === 'rect') return null;
    return { id: `raw:${index}`, node };
  }, [canvas.height, canvas.width, measureNode]);

  /** Wraps selected raw nodes into art elements so they can be changed. Returns the new svg and ids. */
  const adopt = useCallback((ids: string[]): { svg: string; ids: string[] } => {
    let current = svg;
    // Highest index first: wrapping keeps the indexes of earlier siblings.
    const order = [...ids].sort((a, b) => (rawIndex(b) ?? -1) - (rawIndex(a) ?? -1));
    const mapped = new Map<string, string>();
    for (const id of order) {
      const index = rawIndex(id);
      if (index === null) { mapped.set(id, id); continue; }
      const node = topNode(id);
      const box = node ? measureNode(node) : null;
      const result = box ? adoptNode(current, index, box) : null;
      if (result) { current = result.svg; mapped.set(id, result.id); }
    }
    return { svg: current, ids: ids.map((id) => mapped.get(id)).filter((id): id is string => Boolean(id)) };
  }, [measureNode, svg, topNode]);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { adopt };
    return () => { apiRef.current = null; };
  }, [adopt, apiRef]);

  // Pointer interaction --------------------------------------------------------------------------------

  const drag = useRef<{
    mode: 'move' | 'resize' | 'marquee';
    startX: number;
    startY: number;
    ids: string[];
    handle?: Handle;
    start: Box;
    moved: boolean;
    originals: Map<Element, string | null>;
    additive: boolean;
  } | null>(null);

  const toSlide = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = host.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };

  const snapTargets = useCallback((exclude: string[]): { xs: number[]; ys: number[] } => {
    const xs = [0, canvas.width / 2, canvas.width];
    const ys = [0, canvas.height / 2, canvas.height];
    for (const info of elements) {
      if (exclude.includes(info.id)) continue;
      xs.push(info.box.x, info.box.x + info.box.w / 2, info.box.x + info.box.w);
      ys.push(info.box.y, info.box.y + info.box.h / 2, info.box.y + info.box.h);
    }
    return { xs, ys };
  }, [canvas.height, canvas.width, elements]);

  const setPreviewTransform = (ids: string[], originals: Map<Element, string | null>, transform: (box: Box) => string, boxes: Map<string, Box>): void => {
    for (const id of ids) {
      const node = topNode(id);
      const box = boxes.get(id);
      if (!node || !box) continue;
      if (!originals.has(node)) originals.set(node, node.getAttribute('transform'));
      const original = originals.get(node);
      node.setAttribute('transform', `${transform(box)}${original ? ` ${original}` : ''}`);
    }
  };

  const restorePreview = (originals: Map<Element, string | null>): void => {
    for (const [node, value] of originals) {
      if (value === null) node.removeAttribute('transform');
      else node.setAttribute('transform', value);
    }
  };

  const onPointerDown = (event: React.PointerEvent): void => {
    if (!editable || editing) return;
    if (event.button === 2) {
      // Right-click selects what is under the pointer, for the context menu.
      const overlay = (event.target as Element).closest?.('[data-frame], [data-hit]');
      const id = overlay ? overlay.getAttribute('data-frame') ?? overlay.getAttribute('data-hit') : hitTest(event.target)?.id;
      if (id && !selection.includes(id)) onSelection([id]);
      if (!id) onSelection([]);
      return;
    }
    if (event.button !== 0) return;
    const handle = (event.target as Element).closest?.('[data-handle]')?.getAttribute('data-handle') as Handle | undefined;
    const point = toSlide(event);
    if (handle && selection.length === 1) {
      const box = boxOf(selection[0]);
      if (!box) return;
      drag.current = { mode: 'resize', startX: point.x, startY: point.y, ids: selection, handle, start: box, moved: false, originals: new Map(), additive: false };
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    const overlayHit = (event.target as Element).closest?.('[data-frame], [data-hit]');
    const hit = overlayHit ? { id: overlayHit.getAttribute('data-frame') ?? overlayHit.getAttribute('data-hit')!, node: null } : hitTest(event.target);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!hit) {
      drag.current = { mode: 'marquee', startX: point.x, startY: point.y, ids: [], start: { x: point.x, y: point.y, w: 0, h: 0 }, moved: false, originals: new Map(), additive };
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      return;
    }
    let ids = selection;
    if (additive) {
      ids = selection.includes(hit.id) ? selection.filter((id) => id !== hit.id) : [...selection, hit.id];
      onSelection(ids);
    } else if (!selection.includes(hit.id)) {
      ids = [hit.id];
      onSelection(ids);
    }
    if (!ids.includes(hit.id)) return;
    const boxes = ids.map(boxOf).filter((box): box is Box => Boolean(box));
    if (boxes.length === 0) return;
    drag.current = { mode: 'move', startX: point.x, startY: point.y, ids, start: unionBox(boxes), moved: false, originals: new Map(), additive };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent): void => {
    const state = drag.current;
    if (!state) {
      if (editable && !editing) {
        const hit = hitTest(event.target);
        setHover(hit && !selection.includes(hit.id) ? hit.id : null);
      }
      return;
    }
    const point = toSlide(event);
    let dx = point.x - state.startX;
    let dy = point.y - state.startY;
    if (!state.moved && Math.hypot(dx * scale, dy * scale) < 3) return;
    state.moved = true;
    const threshold = 6 / scale;
    if (state.mode === 'marquee') {
      setMarquee({ x: Math.min(state.startX, point.x), y: Math.min(state.startY, point.y), w: Math.abs(dx), h: Math.abs(dy) });
      return;
    }
    if (state.mode === 'move') {
      if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const { xs, ys } = snapTargets(state.ids);
      const next: Guide[] = [];
      const box = state.start;
      let bestX: { delta: number; at: number } | null = null;
      for (const edge of [box.x + dx, box.x + box.w / 2 + dx, box.x + box.w + dx]) {
        for (const target of xs) if (Math.abs(target - edge) < threshold && (!bestX || Math.abs(target - edge) < Math.abs(bestX.delta))) bestX = { delta: target - edge, at: target };
      }
      let bestY: { delta: number; at: number } | null = null;
      for (const edge of [box.y + dy, box.y + box.h / 2 + dy, box.y + box.h + dy]) {
        for (const target of ys) if (Math.abs(target - edge) < threshold && (!bestY || Math.abs(target - edge) < Math.abs(bestY.delta))) bestY = { delta: target - edge, at: target };
      }
      if (bestX && !event.altKey) { dx += bestX.delta; next.push({ axis: 'x', at: bestX.at }); }
      if (bestY && !event.altKey) { dy += bestY.delta; next.push({ axis: 'y', at: bestY.at }); }
      setGuides(next);
      const boxes = new Map(state.ids.map((id) => [id, boxOf(id)!] as const));
      setPreviewTransform(state.ids, state.originals, () => `translate(${dx} ${dy})`, boxes);
      setPreview({ ...box, x: box.x + dx, y: box.y + dy });
      return;
    }
    // Resize.
    const start = state.start;
    const h = state.handle!;
    let x1 = start.x;
    let y1 = start.y;
    let x2 = start.x + start.w;
    let y2 = start.y + start.h;
    if (h.includes('w')) x1 = Math.min(x2 - 4, start.x + dx);
    if (h.includes('e')) x2 = Math.max(x1 + 4, start.x + start.w + dx);
    if (h.includes('n')) y1 = Math.min(y2 - 4, start.y + dy);
    if (h.includes('s')) y2 = Math.max(y1 + 4, start.y + start.h + dy);
    const info = byId.get(state.ids[0]);
    const keepRatio = (event.shiftKey || info?.kind === 'pic') && h.length === 2;
    if (keepRatio && start.w > 0 && start.h > 0) {
      const ratio = start.w / start.h;
      const w = x2 - x1;
      const hh = y2 - y1;
      if (w / hh > ratio) {
        const nw = hh * ratio;
        if (h.includes('w')) x1 = x2 - nw; else x2 = x1 + nw;
      } else {
        const nh = w / ratio;
        if (h.includes('n')) y1 = y2 - nh; else y2 = y1 + nh;
      }
    }
    const next = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    const sx = next.w / Math.max(0.01, start.w);
    const sy = next.h / Math.max(0.01, start.h);
    setPreviewTransform(state.ids, state.originals, () => `matrix(${sx} 0 0 ${sy} ${next.x - start.x * sx} ${next.y - start.y * sy})`, new Map([[state.ids[0], start]]));
    setPreview(next);
  };

  const onPointerUp = (event: React.PointerEvent): void => {
    const state = drag.current;
    drag.current = null;
    setGuides([]);
    if (!state) return;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    if (state.mode === 'marquee') {
      setMarquee(null);
      if (!state.moved) {
        if (!state.additive) onSelection([]);
        return;
      }
      const point = toSlide(event);
      const area = { x: Math.min(state.startX, point.x), y: Math.min(state.startY, point.y), w: Math.abs(point.x - state.startX), h: Math.abs(point.y - state.startY) };
      const inside = elements.filter((info) => info.box.x < area.x + area.w && info.box.x + info.box.w > area.x && info.box.y < area.y + area.h && info.box.y + info.box.h > area.y).map((info) => info.id);
      onSelection(state.additive ? [...new Set([...selection, ...inside])] : inside);
      return;
    }
    const target = preview;
    setPreview(null);
    if (!state.moved || !target) {
      restorePreview(state.originals);
      return;
    }
    const adopted = adopt(state.ids);
    if (state.mode === 'move') {
      const next = moveElements(adopted.svg, adopted.ids, target.x - state.start.x, target.y - state.start.y, { measure });
      onCommit(next);
    } else {
      onCommit(resizeElement(adopted.svg, adopted.ids[0], target, { measure }));
    }
    if (adopted.ids.join() !== state.ids.join()) onSelection(adopted.ids);
  };

  // Text editing ----------------------------------------------------------------------------------------

  const onDoubleClick = (event: React.MouseEvent): void => {
    if (!editable) return;
    const root = svgRoot();
    // Frames and hit areas sit over the slide: find the drawn node underneath.
    const under = (document.elementsFromPoint(event.clientX, event.clientY).find((el) => root?.contains(el) && el !== (root as unknown as Element)) ?? null) as Element | null;
    const overlayHit = (event.target as Element).closest?.('[data-frame], [data-hit]');
    const hit = hitTest(under) ?? (overlayHit ? { id: overlayHit.getAttribute('data-frame') ?? overlayHit.getAttribute('data-hit')!, node: null } : null);
    if (!hit) return;
    const info = byId.get(hit.id);
    if (info?.model?.k === 'pic') {
      onSelection([hit.id]);
      onPicture?.({ id: hit.id });
      return;
    }
    if (info?.model) {
      // The innermost modelled element under the pointer that can hold text.
      const nested = under?.closest('[data-el]')?.getAttribute('data-el') ?? hit.id;
      let candidate = findElement(info.model, nested);
      if (!candidate || candidate.k !== 'shape') candidate = info.model.k === 'shape' ? info.model : null;
      if (candidate && candidate.k === 'shape') {
        onSelection([hit.id]);
        onEditing({ kind: 'model', topId: hit.id, nestedId: candidate.id });
        return;
      }
      return;
    }
    // Drawn pictures and text in AI artwork.
    const image = under?.closest('image');
    if (image && root && !info?.model) {
      onPicture?.({ imageIndex: Array.from(root.querySelectorAll('image')).indexOf(image as SVGImageElement) });
      return;
    }
    const text = under?.closest('text');
    if (text && root) {
      const index = Array.from(root.querySelectorAll('text')).indexOf(text as SVGTextElement);
      const box = measureNode(text);
      if (index >= 0 && box) onEditing({ kind: 'raw', textIndex: index, box });
    }
  };

  const editTarget = useMemo(() => {
    if (!editing || editing.kind !== 'model') return null;
    const info = byId.get(editing.topId);
    const model = info?.model ? findElement(info.model, editing.nestedId) : null;
    if (!info?.model || !model || model.k !== 'shape') return null;
    const body: TxBody = model.tx ?? emptyBody({ ...textDefaults, color: textDefaults.color });
    const rect = model.geom.paths ? { x: 0, y: 0, w: model.box.w, h: model.box.h } : presetTextRect(model.geom.prst, model.box.w, model.box.h, model.geom.av);
    return { top: info.model, model, body, rect };
  }, [byId, editing, textDefaults]);

  const editorHtml = useMemo(() => (editTarget ? bodyToHtml(editTarget.body, scale) : ''), [editTarget, scale]);
  const committed = useRef(false);

  // Hide the drawn text while it is being typed over.
  useLayoutEffect(() => {
    if (!editing) return;
    const node = editing.kind === 'model' ? topNode(editing.topId) : svgRoot()?.querySelectorAll('text')[editing.textIndex] ?? null;
    node?.setAttribute('data-editing', '1');
    return () => node?.removeAttribute('data-editing');
  }, [editing, markup, topNode]);

  useEffect(() => {
    committed.current = false;
    const editor = editorRef.current;
    if (!editor || !editing) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    if (editing.kind === 'model' && editTarget && !editTarget.model.tx) range.collapse(false);
    const selectionNow = window.getSelection();
    selectionNow?.removeAllRanges();
    selectionNow?.addRange(range);
  }, [editTarget, editing, editorRef]);

  const finishEditing = useCallback((keep: boolean): void => {
    if (committed.current || !editing) return;
    committed.current = true;
    const editor = editorRef.current;
    if (keep && editor) {
      if (editing.kind === 'model' && editTarget) {
        let body = htmlToBody(editor, editTarget.body, scale);
        // A no-wrap box that the new text no longer fits wraps instead, as the editor showed it.
        if (!body.wrap && editTarget.rect.w > 0) {
          const inner = editTarget.rect.w - body.ins[0] - body.ins[2];
          const laid = layoutText(body, editTarget.rect.w, editTarget.rect.h, measure);
          if (laid.paragraphs.some((para) => para.lines.some((line) => line.x0 + line.width > inner + 1))) body = { ...body, wrap: true };
        }
        // Text that now overflows a box it used to fit shrinks to fit, so it never runs into what is below.
        if (!body.fit && editTarget.rect.h > 0) {
          const fitted = layoutText(editTarget.body, editTarget.rect.w, editTarget.rect.h, measure).height <= editTarget.rect.h + 2;
          if (fitted && layoutText(body, editTarget.rect.w, editTarget.rect.h, measure).height > editTarget.rect.h + 2) body = { ...body, fit: 'norm' };
        }
        const hasText = body.p.some((para) => para.r.some((run) => run.t.trim()));
        const nextModel: SlideElement = { ...editTarget.model, tx: hasText || editTarget.model.tx ? body : undefined };
        const nextTop = editTarget.top.id === editTarget.model.id ? nextModel : replaceNested(editTarget.top, editTarget.model.id, nextModel);
        if (JSON.stringify(nextTop) !== JSON.stringify(editTarget.top)) onCommit(replaceElement(svg, editing.topId, nextTop, { measure, refit: true }));
      } else if (editing.kind === 'raw') {
        const blocks = Array.from(editor.children) as HTMLElement[];
        const lines = blocks.length ? blocks.map((line) => line.innerText.replace(/\n$/, '')) : editor.innerText.split('\n');
        onCommit(setSvgText(svg, editing.textIndex, lines));
      }
    }
    onEditing(null);
  }, [editTarget, editing, editorRef, measure, onCommit, onEditing, scale, svg]);

  // Selection frames --------------------------------------------------------------------------------------

  const frame = (box: Box, rot = 0): React.CSSProperties => ({
    left: box.x * scale,
    top: box.y * scale,
    width: Math.max(1, box.w * scale),
    height: Math.max(1, box.h * scale),
    transform: rot ? `rotate(${rot}deg)` : undefined,
  });

  const single = selection.length === 1 ? selection[0] : null;
  const singleBox = single ? boxOf(single) : null;
  const singleInfo: ElementInfo | undefined = single ? byId.get(single) : undefined;
  const editorBox = editing?.kind === 'model' && editTarget
    ? { x: editTarget.model.box.x + editTarget.rect.x + editTarget.body.ins[0], y: editTarget.model.box.y + editTarget.rect.y + editTarget.body.ins[1], w: Math.max(8, editTarget.rect.w - editTarget.body.ins[0] - editTarget.body.ins[2]), h: Math.max(8, editTarget.rect.h - editTarget.body.ins[1] - editTarget.body.ins[3]) }
    : editing?.kind === 'raw' ? editing.box : null;
  const rawText = editing?.kind === 'raw' ? (svgRoot()?.querySelectorAll('text')[editing.textIndex] as SVGTextElement | undefined) : undefined;
  const rawStyle = rawText ? getComputedStyle(rawText) : null;
  const rawLines = editing?.kind === 'raw' ? svgTextItems(svg)[editing.textIndex]?.lines ?? [] : [];
  const escapeLine = (line: string): string => line.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  if (!svg) return null;

  return (
    <div
      className="ps-stage"
      style={{ width, height }}
      data-editable={editable || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={onDoubleClick}
    >
      <div ref={host} className="ps-stage__svg" dangerouslySetInnerHTML={{ __html: markup }} />
      {editable && (
        <div className="ps-stage__overlay" aria-hidden={!editing}>
          {!editing && elements.filter((info) => info.kind === 'text' && !selection.includes(info.id)).map((info) => (
            <div key={`hit-${info.id}`} className="ps-hit" data-hit={info.id} style={frame(info.box, info.rot)} onPointerEnter={() => setHover(info.id)} />
          ))}
          {hover && boxOf(hover) && <div className="ps-hover" style={frame(boxOf(hover)!, byId.get(hover)?.rot)} />}
          {!editing && selection.map((id) => {
            const box = boxOf(id);
            if (!box) return null;
            return <div key={id} className="ps-frame" data-frame={id} style={frame(preview && selection.length === 1 ? preview : box, byId.get(id)?.rot)} />;
          })}
          {!editing && selection.length > 1 && preview && <div className="ps-frame ps-frame--group" style={frame(preview)} />}
          {!editing && single && singleBox && !(singleInfo?.rot) && (
            <div className="ps-handles" style={frame(preview ?? singleBox)}>
              {HANDLES.map((handle) => <span key={handle} className="ps-handle" data-handle={handle} />)}
              <span className="ps-size">{Math.round((preview ?? singleBox).w)} × {Math.round((preview ?? singleBox).h)}</span>
            </div>
          )}
          {guides.map((guide, index) => (
            <span key={index} className={`ps-guide ps-guide--${guide.axis}`} style={guide.axis === 'x' ? { left: guide.at * scale } : { top: guide.at * scale }} />
          ))}
          {marquee && <div className="ps-marquee" style={frame(marquee)} />}
          {editing && editorBox && (
            <div
              key={editing.kind === 'model' ? editing.nestedId : `raw${editing.textIndex}`}
              ref={editorRef}
              className="ps-editor"
              data-anchor={editing.kind === 'model' ? editTarget?.body.anc : 't'}
              contentEditable
              suppressContentEditableWarning
              spellCheck
              style={{
                ...frame(editorBox, editing.kind === 'model' ? editTarget?.top.rot : 0),
                ...(rawStyle ? { fontFamily: rawStyle.fontFamily, fontSize: Number.parseFloat(rawStyle.fontSize) * scale, fontWeight: rawStyle.fontWeight as React.CSSProperties['fontWeight'], color: rawStyle.fill, minWidth: 40, height: 'auto', lineHeight: 1.25 } : {}),
              }}
              dangerouslySetInnerHTML={{ __html: editing.kind === 'model' ? editorHtml : rawLines.map((line) => `<div>${escapeLine(line) || '<br>'}</div>`).join('') }}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onBlur={() => finishEditing(true)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape') { event.preventDefault(); finishEditing(true); }
              }}
              onPaste={(event) => {
                // Paste as plain text so foreign styles do not leak in.
                event.preventDefault();
                document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

/** Reads a top-level model by id from slide SVG (for the format controls). */
export function modelOf(svg: string, id: string): SlideElement | null {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const node = Array.from(doc.documentElement.children).find((el) => el.getAttribute('data-el') === id);
  return node ? readModel(node) : null;
}
