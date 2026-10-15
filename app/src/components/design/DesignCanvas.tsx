import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlignBottom, AlignCenterHorizontal, AlignCenterVertical, AlignLeft, AlignRight, AlignTop, ArrowsHorizontal, ArrowsOutSimple, ArrowsVertical, Columns, ArrowClockwise, ArrowCounterClockwise, CursorClick, FlowArrow, Hand, MapTrifold, Minus, Plus, Crosshair, Question } from '@phosphor-icons/react';
import { useDesignSessionStore, type DesignViewport, type PickedElement } from '../../stores/designSessionStore';
import { sizeLabel } from '../../utils/design/formats';
import { emptyBoardState, statusLabel } from '../../utils/design/quickActions';
import { elementText, outerHtmlOf } from '../../utils/design/htmlSafe';
import { contentBounds, joinPath, SYSTEM_BOARD } from '../../utils/design/project';
import { alignRects, boardsInRect, distributeRects, rowRects, snapRect, unionRect, type AlignMode, type Guide, type Rect } from '../../utils/design/snap';
import type { Board, BoardFrame, DesignKind, DesignTokens } from '../../utils/design/types';
import { localFileUrl } from '../../utils/mediaFiles';
import { bundledFamiliesIn, registerBundledFont } from '../../utils/bundledFonts';
import { SvgSlide } from '../presentation/SvgSlide';
import { HtmlBoard } from './HtmlBoard';
import { gotoLinks, resolveGoto, versionTargets } from '../../utils/design/flow';
import { applySvgTweaks } from '../../utils/design/svgTweaks';
import { GraphicStage } from './GraphicStage';
import { useBoardPreviews } from './useBoardPreviews';
import { togglePickedElement } from './pick';
import { ShortcutSheet } from './ShortcutSheet';
import { SystemBoard } from './SystemBoard';
import { GenerationAura } from '../studio/GenerationAura';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const ZOOM_STEPS = [0.25, 0.5, 1, 2];
// Ctrl + wheel zoom: one mouse notch (a delta of ~100) is a 2% step, and the delta is capped so one
// fast flick cannot jump the zoom across the whole range.
const WHEEL_ZOOM_PER_NOTCH = 0.02;
const WHEEL_NOTCH_DELTA = 100;
const WHEEL_MAX_DELTA = 150;
const WHEEL_LINE_HEIGHT = 16;
const DRAG_THRESHOLD = 4;
const SNAP_PIXELS = 8;
const WIDTH_STOPS = [390, 768, 1024, 1280, 1440];
const OFFSCREEN_MARGIN = 600;
const NEXT_FRAME: Record<BoardFrame, BoardFrame> = { none: 'phone', phone: 'browser', browser: 'none' };

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export type MovePhase = 'start' | 'move' | 'end';

interface DesignCanvasProps {
  workspaceId: string;
  boards: Board[];
  tokens: DesignTokens;
  /** Web pages reflow when their width changes and their height follows the content. */
  kind: DesignKind;
  viewport: DesignViewport;
  tool: 'select' | 'hand' | 'pick';
  selectedIds: string[];
  picked: PickedElement | null;
  fitted: boolean;
  /** False while the studio is hidden, so a hidden layer does not fit to a 0 × 0 box. */
  visible: boolean;
  /** The project's folder: `assets/…` in a drawing resolves against it. */
  projectDir: string;
  /** Boards cannot be moved or edited while the AI is changing them. */
  locked: boolean;
  onBoardHeight: (id: string, height: number, exact?: boolean) => void;
  onMove: (positions: Record<string, { x: number; y: number }>, phase: MovePhase) => void;
  onEditText: (boardId: string, yz: string, text: string) => void;
  /** A picture was double-clicked (HTML) or clicked (SVG, selected board): the owner chooses the replacement. */
  onPicture: (boardId: string, target: { kind: 'html'; yz: string } | { kind: 'svg'; index: number }) => void;
  /** Choose a picture and put it inside the element `yz` of a board (null: add it as a new element). */
  onPutPicture?: (boardId: string, yz: string | null) => void;
  /** Take the picture out of the element `yz` of a board. */
  onRemovePicture?: (boardId: string, yz: string | null) => void;
  /** Open the picture panel on the picture placed in a shape. */
  onAdjustPicture?: (boardId: string, yz: string | null) => void;
  /** A text of a selected graphic was clicked. */
  onSvgText: (boardId: string, index: number) => void;
  /** Draw failed boards again ("Try again" on a failed board). */
  onRedraw?: (ids: string[]) => void;
  onDuplicate?: (ids: string[]) => void;
  onVariations?: (id: string) => void;
  /** Open the export dialog for the selected boards. */
  onExport?: () => void;
  /** A reflowed copy of a board at another size (the first suggested one). */
  onVersion?: (boardId: string, presetId: string) => void;
}

interface Hover {
  boardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The element of a board's frame under a client point, climbed to the nearest stamped one. */
function elementAt(boardEl: HTMLElement, clientX: number, clientY: number, zoom: number): { element: Element; rect: { x: number; y: number; width: number; height: number } } | null {
  const frame = boardEl.querySelector('iframe');
  const doc = frame?.contentDocument;
  if (!frame || !doc) return null;
  const box = boardEl.getBoundingClientRect();
  const x = (clientX - box.left) / zoom;
  const y = (clientY - box.top) / zoom;
  let element: Element | null = doc.elementFromPoint(x, y);
  while (element && !element.hasAttribute('data-yz')) element = element.parentElement;
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { element, rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } };
}

const SVG_PICK_PREFIX = 'svg:';

/** The drawn element of an SVG board under a client point, with an id made of its child-index path. */
function svgElementAt(boardEl: HTMLElement, clientX: number, clientY: number, zoom: number): { id: string; element: Element; rect: { x: number; y: number; width: number; height: number } } | null {
  const root = boardEl.querySelector('.dz-board__surface svg');
  if (!root) return null;
  let element: Element | null = document.elementsFromPoint(clientX, clientY).find((entry) => entry !== root && root.contains(entry)) ?? null;
  // A line of text is one element, not its spans.
  for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
    if (node.tagName.toLowerCase() === 'text') element = node;
  }
  if (!element) return null;
  const path: number[] = [];
  for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
    if (!node.parentElement) return null;
    path.unshift(Array.from(node.parentElement.children).indexOf(node));
  }
  const box = boardEl.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return { id: `${SVG_PICK_PREFIX}${path.join('.')}`, element, rect: { x: (rect.left - box.left) / zoom, y: (rect.top - box.top) / zoom, width: rect.width / zoom, height: rect.height / zoom } };
}

/** The element of a board's SVG drawing for a path id made by `svgElementAt`. */
function svgElementByPath(boardEl: Element | null | undefined, id: string): Element | null {
  let node: Element | null | undefined = boardEl?.querySelector('.dz-board__surface svg');
  if (!node || !id.startsWith(SVG_PICK_PREFIX)) return null;
  for (const part of id.slice(SVG_PICK_PREFIX.length).split('.')) {
    node = node?.children[Number(part)];
    if (!node) return null;
  }
  return node;
}

const describe = (element: Element): string => {
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return `<${element.tagName.toLowerCase()}>${text ? ` “${text}”` : ''}`;
};

/** The infinite dot-grid: pan with the wheel, Space-drag or the hand tool; zoom with Ctrl + wheel or the buttons. */
export const DesignCanvas: React.FC<DesignCanvasProps> = ({ workspaceId, boards, tokens, kind, viewport, tool, selectedIds, picked, fitted, visible, projectDir, locked, onBoardHeight, onMove, onEditText, onPicture, onPutPicture, onRemovePicture, onAdjustPicture, onSvgText, onRedraw, onDuplicate, onVariations, onExport, onVersion }) => {
  const host = useRef<HTMLDivElement>(null);
  const update = useDesignSessionStore((state) => state.update);
  const [panning, setPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [zoomMenu, setZoomMenu] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [editing, setEditing] = useState<{ boardId: string; yz: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pickedRect, setPickedRect] = useState<{ boardId: string; x: number; y: number; width: number; height: number } | null>(null);
  const [extraRects, setExtraRects] = useState<Array<{ boardId: string; x: number; y: number; width: number; height: number }>>([]);
  const [space, setSpace] = useState<{ boardId: string; pt: number; pr: number; pb: number; pl: number; mt: number; mr: number; mb: number; ml: number } | null>(null);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [layoutStart, setLayoutStart] = useState<string[]>([]);
  const [flowSpots, setFlowSpots] = useState<Record<string, Rect>>({});
  const edit = useDesignSessionStore((state) => state.edit);
  const undoStep = useDesignSessionStore((state) => state.undo);
  const redoStep = useDesignSessionStore((state) => state.redo);
  const pastCount = useDesignSessionStore((state) => state.sessions[workspaceId]?.past.length ?? 0);
  const futureCount = useDesignSessionStore((state) => state.sessions[workspaceId]?.future.length ?? 0);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; boardId: string } | null>(null);
  const [minimap, setMinimap] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [flow, setFlow] = useState(false);
  const [hostSize, setHostSize] = useState({ width: 1200, height: 800 });
  const [resizeLabel, setResizeLabel] = useState<{ id: string; width: number } | null>(null);
  const resizing = useRef<{ id: string; startX: number; width: number; baseline: ReturnType<typeof useDesignSessionStore.getState>['sessions'][string]['project'] } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number; additive: boolean; moved: boolean } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const layoutClick = useRef<{ id: string; target: Element | null; root: HTMLElement } | null>(null);
  const dragging = useRef<{ x: number; y: number; ids: string[]; origin: Record<string, { x: number; y: number }>; moved: boolean } | null>(null);
  const pickedSource = picked ? boards.find((entry) => entry.id === picked.boardId)?.source : undefined;
  const pickedKey = picked ? [picked.yz, ...(picked.also ?? [])].join(',') : '';
  // The frame redraws after a change, so the outline and spacing of the picked element are measured a few times.
  useEffect(() => {
    if (!picked) {
      setPickedRect(null);
      setExtraRects([]);
      setSpace(null);
      return undefined;
    }
    const measure = (): void => {
      if (picked.yz.startsWith(SVG_PICK_PREFIX)) {
        const boardEl = host.current?.querySelector(`[data-board-id="${picked.boardId}"]`);
        const target = svgElementByPath(boardEl, picked.yz);
        setSpace(null);
        setExtraRects([]);
        if (!boardEl || !target) {
          setPickedRect(null);
          return;
        }
        const zoom = viewportRef.current.zoom;
        const outer = boardEl.getBoundingClientRect();
        const box = target.getBoundingClientRect();
        const next = { boardId: picked.boardId, x: (box.left - outer.left) / zoom, y: (box.top - outer.top) / zoom, width: box.width / zoom, height: box.height / zoom };
        setPickedRect((current) => (current && JSON.stringify(current) === JSON.stringify(next) ? current : next));
        return;
      }
      const frame = host.current?.querySelector<HTMLIFrameElement>(`[data-board-id="${picked.boardId}"] iframe`);
      const document = frame?.contentDocument;
      const view = frame?.contentWindow;
      const element = document?.querySelector(`[data-yz="${picked.yz}"]`);
      if (!document || !view || !element) {
        setPickedRect(null);
        setExtraRects([]);
        setSpace(null);
        return;
      }
      const box = element.getBoundingClientRect();
      setPickedRect((current) => (current && current.boardId === picked.boardId && current.x === box.left && current.y === box.top && current.width === box.width && current.height === box.height ? current : { boardId: picked.boardId, x: box.left, y: box.top, width: box.width, height: box.height }));
      const computed = view.getComputedStyle(element);
      const n = (value: string): number => Math.max(0, Math.round(parseFloat(value) || 0));
      const next = { boardId: picked.boardId, pt: n(computed.paddingTop), pr: n(computed.paddingRight), pb: n(computed.paddingBottom), pl: n(computed.paddingLeft), mt: n(computed.marginTop), mr: n(computed.marginRight), mb: n(computed.marginBottom), ml: n(computed.marginLeft) };
      setSpace((current) => (current && JSON.stringify(current) === JSON.stringify(next) ? current : next));
      const more = (picked.also ?? []).flatMap((id) => {
        const other = document.querySelector(`[data-yz="${id}"]`);
        if (!other) return [];
        const rect = other.getBoundingClientRect();
        return [{ boardId: picked.boardId, x: rect.left, y: rect.top, width: rect.width, height: rect.height }];
      });
      setExtraRects((current) => (JSON.stringify(current) === JSON.stringify(more) ? current : more));
    };
    measure();
    const timers = [60, 200, 600].map((delay) => window.setTimeout(measure, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [picked?.boardId, picked?.yz, pickedKey, pickedSource]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where each link's element is, for arrows that start at the button itself.
  useEffect(() => {
    if (!flow) {
      setFlowSpots({});
      return undefined;
    }
    const measure = (): void => {
      const next: Record<string, Rect> = {};
      for (const entry of boards) {
        if (entry.format !== 'html' || entry.hidden || !entry.source) continue;
        const document = host.current?.querySelector<HTMLIFrameElement>(`[data-board-id="${entry.id}"] iframe`)?.contentDocument;
        if (!document) continue;
        for (const link of gotoLinks(entry.source)) {
          const element = document.querySelector(`[data-yz="${link.yz}"]`);
          if (!element) continue;
          const box = element.getBoundingClientRect();
          next[`${entry.id}:${link.yz}`] = { x: box.left, y: box.top, width: box.width, height: box.height };
        }
      }
      setFlowSpots((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    measure();
    const timers = [150, 700].map((delay) => window.setTimeout(measure, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [flow, boards]);

  // Drawn graphics sit in this document, so the bundled faces they (and the system) name are registered here.
  const svgFamilies = Array.from(new Set([tokens.fonts.heading, tokens.fonts.body, ...bundledFamiliesIn(boards.filter((board) => board.format === 'svg').map((board) => board.source).join(''))])).join('|');
  useEffect(() => {
    for (const family of svgFamilies.split('|')) void registerBundledFont(family, false);
  }, [svgFamilies]);

  // Leaving the board (or locking the canvas) leaves the layout editor.
  useEffect(() => {
    if (layoutId && (locked || selectedIds.length !== 1 || selectedIds[0] !== layoutId)) setLayoutId(null);
  }, [layoutId, locked, selectedIds]);

  useEffect(() => {
    const element = host.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) setHostSize({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  /** Boards far outside the view are not drawn (an iframe each is heavy); selected ones always are. */
  const inView = (board: Board): boolean => {
    if (selectedIds.includes(board.id) || picked?.boardId === board.id || boards.length <= 6) return true;
    const left = board.x * viewport.zoom + viewport.x;
    const top = board.y * viewport.zoom + viewport.y;
    return left + board.width * viewport.zoom > -OFFSCREEN_MARGIN && left < hostSize.width + OFFSCREEN_MARGIN
      && top + board.height * viewport.zoom > -OFFSCREEN_MARGIN && top < hostSize.height + OFFSCREEN_MARGIN;
  };

  // Boards far from the view, or every board while zoomed far out, show a small picture instead of a live frame.
  const lowZoom = viewport.zoom < 0.2 && boards.length > 6;
  const wantedPreviews = boards.filter((entry) => entry.source && !entry.hidden && (!inView(entry) || lowZoom)).map((entry) => entry.id);
  const previews = useBoardPreviews({ boards, wanted: wantedPreviews, tokens, projectDir });
  const live = (entry: Board): boolean => inView(entry) && !(lowZoom && Boolean(previews[entry.id]));

  const setViewport = useCallback((next: DesignViewport): void => {
    update(workspaceId, { viewport: next });
  }, [update, workspaceId]);

  const fit = useCallback((): void => {
    const element = host.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    if (width < 50 || height < 50) return;
    const bounds = contentBounds(boards);
    const margin = 96;
    const zoom = clampZoom(Math.min((width - margin * 2) / bounds.width, (height - margin * 2) / bounds.height, 1));
    setViewport({
      zoom,
      x: (width - bounds.width * zoom) / 2 - bounds.x * zoom,
      y: (height - bounds.height * zoom) / 2 - bounds.y * zoom,
    });
    update(workspaceId, { fitted: true });
  }, [boards, setViewport, update, workspaceId]);

  const rectOf = useCallback((board: Board): Rect => ({ x: board.x, y: board.y, width: board.width, height: board.height }), []);

  const zoomToSelection = useCallback((): void => {
    const element = host.current;
    const chosen = boards.filter((entry) => selectedIds.includes(entry.id));
    if (!element || chosen.length === 0) return;
    const { width, height } = element.getBoundingClientRect();
    const bounds = unionRect(chosen.map(rectOf));
    const margin = 120;
    const zoom = clampZoom(Math.min((width - margin * 2) / bounds.width, (height - margin * 2) / bounds.height, 2));
    setViewport({ zoom, x: (width - bounds.width * zoom) / 2 - bounds.x * zoom, y: (height - bounds.height * zoom) / 2 - bounds.y * zoom });
  }, [boards, rectOf, selectedIds, setViewport]);

  const arrange = (mode: AlignMode | 'distribute-x' | 'distribute-y' | 'row'): void => {
    const chosen = boards.filter((entry) => selectedIds.includes(entry.id));
    if (chosen.length < 2 || locked) return;
    const rects = Object.fromEntries(chosen.map((entry) => [entry.id, rectOf(entry)]));
    const next = mode === 'row' ? rowRects(rects, 0) : mode === 'distribute-x' ? distributeRects(rects, 'x') : mode === 'distribute-y' ? distributeRects(rects, 'y') : alignRects(rects, mode);
    edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (next[entry.id] ? { ...entry, ...next[entry.id] } : entry)) }));
  };

  const nudge = (dx: number, dy: number): void => {
    if (selectedIds.length === 0 || locked) return;
    edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (selectedIds.includes(entry.id) ? { ...entry, x: entry.x + dx, y: entry.y + dy } : entry)) }));
  };

  // Fit once per opened project, when the layer is actually showing.
  useLayoutEffect(() => {
    if (visible && !fitted) fit();
  }, [fit, fitted, visible]);

  /** Sets the zoom (absolute), keeping the point under the origin (default: the middle) where it is. */
  const zoomAround = useCallback((target: number, originX?: number, originY?: number): void => {
    const element = host.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const current = viewportRef.current;
    const zoom = clampZoom(target);
    const ox = originX ?? rect.width / 2;
    const oy = originY ?? rect.height / 2;
    const worldX = (ox - current.x) / current.zoom;
    const worldY = (oy - current.y) / current.zoom;
    setViewport({ zoom, x: ox - worldX * zoom, y: oy - worldY * zoom });
  }, [setViewport]);

  /** Multiplies the zoom by `factor` around a point, reading the newest viewport from the store so a burst of wheel events adds up even before React commits the previous one. */
  const zoomBy = useCallback((factor: number, originX: number, originY: number): void => {
    update(workspaceId, (session) => {
      const current = session.viewport;
      const zoom = clampZoom(current.zoom * factor);
      const worldX = (originX - current.x) / current.zoom;
      const worldY = (originY - current.y) / current.zoom;
      return { viewport: { zoom, x: originX - worldX * zoom, y: originY - worldY * zoom } };
    });
  }, [update, workspaceId]);

  // A native listener: React's wheel handler is passive and cannot stop the page from zooming.
  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        // Lines (Firefox) and pages become pixels, then the delta is capped, so every notch is one small,
        // predictable step whatever the device or the speed it is spun at.
        const scale = event.deltaMode === event.DOM_DELTA_LINE ? WHEEL_LINE_HEIGHT : event.deltaMode === event.DOM_DELTA_PAGE ? rect.height : 1;
        const delta = Math.max(-WHEEL_MAX_DELTA, Math.min(WHEEL_MAX_DELTA, event.deltaY * scale));
        zoomBy(Math.pow(1 + WHEEL_ZOOM_PER_NOTCH, -delta / WHEEL_NOTCH_DELTA), event.clientX - rect.left, event.clientY - rect.top);
      } else {
        update(workspaceId, (session) => ({ viewport: { ...session.viewport, x: session.viewport.x - event.deltaX, y: session.viewport.y - event.deltaY } }));
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [update, workspaceId, zoomBy]);

  // Space turns the pointer into the hand while it is held; 0 and 1 reset the zoom; V, H, P pick the tool.
  useEffect(() => {
    if (!visible) return undefined;
    const typing = (event: KeyboardEvent): boolean => event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable) || editing !== null;
    const down = (event: KeyboardEvent): void => {
      if (typing(event)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpaceDown(true);
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const key = event.key.toLowerCase();
        const step = event.shiftKey ? 10 : 1;
        if (event.key === '?') { event.preventDefault(); setSheet(true); }
        else if (event.shiftKey && event.code === 'Digit1') fit();
        else if (event.shiftKey && event.code === 'Digit2') zoomToSelection();
        else if (key === 'arrowleft') { event.preventDefault(); nudge(-step, 0); }
        else if (key === 'arrowright') { event.preventDefault(); nudge(step, 0); }
        else if (key === 'arrowup') { event.preventDefault(); nudge(0, -step); }
        else if (key === 'arrowdown') { event.preventDefault(); nudge(0, step); }
        else if (key === '0') fit();
        else if (key === '1') zoomAround(1);
        else if (key === 'h') update(workspaceId, { tool: 'hand' });
        else if (key === 'v') update(workspaceId, { tool: 'select' });
        else if (key === 'p') update(workspaceId, { tool: 'pick' });
        else if (key === 'escape') update(workspaceId, { selectedIds: [], picked: null, tool: 'select' });
      }
    };
    const up = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [editing, fit, nudge, update, visible, workspaceId, zoomAround, zoomToSelection]);

  const handMode = tool === 'hand' || spaceDown;

  const onPointerDown = (event: React.PointerEvent): void => {
    // Overlay controls (tool rail, zoom bar, menus) sit inside the canvas; a press on them must not start a pan,
    // or the pointer capture swallows the click and the hand tool can never be left with the mouse.
    if (event.target instanceof Element && event.target !== event.currentTarget && event.target.closest('button, input, select, textarea, [role="toolbar"], [role="menu"]')) return;
    if (event.button === 1|| (event.button === 0 && handMode)) {
      event.preventDefault();
      pan.current = { x: event.clientX, y: event.clientY, vx: viewport.x, vy: viewport.y };
      setPanning(true);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } else if (event.button === 0 && event.target === event.currentTarget) {
      setMenu(null);
      marqueeStart.current = { x: event.clientX, y: event.clientY, additive: event.shiftKey || event.ctrlKey || event.metaKey, moved: false };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
  };

  const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = host.current?.getBoundingClientRect();
    const current = viewportRef.current;
    return { x: (clientX - (rect?.left ?? 0) - current.x) / current.zoom, y: (clientY - (rect?.top ?? 0) - current.y) / current.zoom };
  };

  const onPointerMove = (event: React.PointerEvent): void => {
    const drag = marqueeStart.current;
    if (drag) {
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD) return;
      drag.moved = true;
      const from = toWorld(drag.x, drag.y);
      const to = toWorld(event.clientX, event.clientY);
      setMarquee({ x0: from.x, y0: from.y, x1: to.x, y1: to.y });
      return;
    }
    const start = pan.current;
    if (!start) return;
    setViewport({ ...viewportRef.current, x: start.vx + event.clientX - start.x, y: start.vy + event.clientY - start.y });
  };

  const endPan = (event: React.PointerEvent): void => {
    const drag = marqueeStart.current;
    if (drag) {
      marqueeStart.current = null;
      try {
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      if (!drag.moved) {
        update(workspaceId, { selectedIds: [], picked: null });
      } else if (marquee) {
        const area: Rect = { x: Math.min(marquee.x0, marquee.x1), y: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) };
        const hit = boardsInRect(Object.fromEntries(boards.filter((entry) => !entry.hidden).map((entry) => [entry.id, rectOf(entry)])), area);
        update(workspaceId, (session) => ({ selectedIds: drag.additive ? Array.from(new Set([...session.selectedIds, ...hit])) : hit, picked: null }));
      }
      setMarquee(null);
      return;
    }
    if (!pan.current) return;
    pan.current = null;
    setPanning(false);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>, board: Board): void => {
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    resizing.current = { id: board.id, startX: event.clientX, width: board.width, baseline: useDesignSessionStore.getState().sessions[workspaceId]?.project ?? null };
    setResizeLabel({ id: board.id, width: board.width });
  };

  const moveResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = resizing.current;
    if (!drag) return;
    let width = drag.width + (event.clientX - drag.startX) / viewportRef.current.zoom;
    const stop = WIDTH_STOPS.find((candidate) => Math.abs(candidate - width) <= 10 / viewportRef.current.zoom);
    if (stop && !event.altKey) width = stop;
    width = Math.round(Math.min(2560, Math.max(280, width)));
    setResizeLabel({ id: drag.id, width });
    edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (entry.id === drag.id ? { ...entry, width, preset: undefined } : entry)) }), { skipHistory: true });
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = resizing.current;
    if (!drag) return;
    resizing.current = null;
    setResizeLabel(null);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    const before = drag.baseline;
    const now = useDesignSessionStore.getState().sessions[workspaceId]?.project;
    if (before && now && before.boards.find((entry) => entry.id === drag.id)?.width !== now.boards.find((entry) => entry.id === drag.id)?.width) {
      update(workspaceId, (state) => ({ past: [...state.past, before].slice(-50), future: [], dirty: true }));
    }
  };

  const minimapJump = (event: React.PointerEvent<SVGSVGElement>): void => {
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const world = point.matrixTransform(matrix.inverse());
    const zoom = viewportRef.current.zoom;
    setViewport({ zoom, x: hostSize.width / 2 - world.x * zoom, y: hostSize.height / 2 - world.y * zoom });
  };

  const select = (id: string, additive: boolean): void => {
    update(workspaceId, (session) => ({
      selectedIds: additive ? (session.selectedIds.includes(id) ? session.selectedIds.filter((entry) => entry !== id) : [...session.selectedIds, id]) : [id],
    }));
  };

  // Boards ---------------------------------------------------------------------------

  const onBoardDown = (event: React.PointerEvent<HTMLDivElement>, board: Board): void => {
    if (handMode || event.button !== 0 || editing) return;
    event.stopPropagation();
    if (tool === 'pick' && board.format === 'svg') {
      const found = svgElementAt(event.currentTarget, event.clientX, event.clientY, viewport.zoom);
      select(board.id, false);
      if (found) update(workspaceId, { picked: { boardId: board.id, yz: found.id, html: found.element.outerHTML.slice(0, 3000), label: describe(found.element) } });
      return;
    }
    if (tool === 'pick') {
      const found = elementAt(event.currentTarget, event.clientX, event.clientY, viewport.zoom);
      const addMore = event.shiftKey || event.ctrlKey || event.metaKey;
      if (addMore && found && picked?.boardId === board.id) {
        togglePickedElement(workspaceId, board, found.element.getAttribute('data-yz') ?? '');
        return;
      }
      select(board.id, false);
      if (found) {
        const yz = found.element.getAttribute('data-yz') ?? '';
        update(workspaceId, { picked: { boardId: board.id, yz, html: outerHtmlOf(board.source, yz) || found.element.outerHTML.slice(0, 3000), label: describe(found.element) } });
      }
      return;
    }
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    // A plain click on a graphic that is already the only selection opens the layout editor (move, resize, multi-select).
    layoutClick.current = board.format === 'svg' && Boolean(board.source) && !additive && !locked && selectedIds.length === 1 && selectedIds[0] === board.id
      ? { id: board.id, target: event.target instanceof Element ? event.target : null, root: event.currentTarget }
      : null;
    const ids = selectedIds.includes(board.id) && !additive ? selectedIds : [board.id];
    if (!selectedIds.includes(board.id) || additive) select(board.id, additive);
    if (locked) return;
    dragging.current = {
      x: event.clientX,
      y: event.clientY,
      ids,
      origin: Object.fromEntries(boards.filter((entry) => ids.includes(entry.id)).map((entry) => [entry.id, { x: entry.x, y: entry.y }])),
      moved: false,
    };
  };

  const onBoardMove = (event: React.PointerEvent<HTMLDivElement>, board: Board): void => {
    const drag = dragging.current;
    if (drag) {
      const dx = (event.clientX - drag.x) / viewport.zoom;
      const dy = (event.clientY - drag.y) / viewport.zoom;
      if (!drag.moved) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD) return;
        drag.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        onMove({}, 'start');
      }
      let moveX = dx;
      let moveY = dy;
      if (!event.altKey) {
        const group = unionRect(drag.ids.map((id) => {
          const entry = boards.find((candidate) => candidate.id === id) as Board;
          return { x: drag.origin[id].x + dx, y: drag.origin[id].y + dy, width: entry.width, height: entry.height };
        }));
        const others: Rect[] = [{ x: 0, y: 0, width: SYSTEM_BOARD.width, height: SYSTEM_BOARD.height }, ...boards.filter((entry) => !drag.ids.includes(entry.id) && !entry.hidden).map(rectOf)];
        const snapped = snapRect(group, others, SNAP_PIXELS / viewport.zoom);
        moveX += snapped.dx;
        moveY += snapped.dy;
        setGuides(snapped.guides);
      } else {
        setGuides([]);
      }
      onMove(Object.fromEntries(drag.ids.map((id) => [id, { x: Math.round(drag.origin[id].x + moveX), y: Math.round(drag.origin[id].y + moveY) }])), 'move');
      return;
    }
    if (tool === 'pick' && board.format === 'svg') {
      const found = svgElementAt(event.currentTarget, event.clientX, event.clientY, viewport.zoom);
      setHover(found ? { boardId: board.id, ...found.rect } : null);
      return;
    }
    if (tool === 'pick' && board.format === 'html') {
      const found = elementAt(event.currentTarget, event.clientX, event.clientY, viewport.zoom);
      setHover(found ? { boardId: board.id, ...found.rect } : null);
    }
  };

  const onBoardUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragging.current;
    const click = layoutClick.current;
    layoutClick.current = null;
    if (click && (!drag || !drag.moved)) {
      dragging.current = null;
      const root = click.root.querySelector('.dz-board__surface svg');
      let node: Element | null = click.target;
      while (root && node && node.parentElement !== root) node = node.parentElement;
      const at = root && node ? Array.from(root.children).indexOf(node) : -1;
      setLayoutStart(at >= 0 ? [`raw:${at}`] : []);
      setLayoutId(click.id);
      return;
    }
    if (!drag) return;
    dragging.current = null;
    setGuides([]);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    if (drag.moved) onMove({}, 'end');
  };

  const onBoardDouble = (event: React.MouseEvent<HTMLDivElement>, board: Board): void => {
    if (tool !== 'select' || locked) return;
    if (board.format === 'svg') {
      if (board.source) {
        // Enter the layout editor with the node under the pointer already selected, so one
        // double-click both opens the editor and picks what was clicked.
        const root = event.currentTarget.querySelector('.dz-board__surface svg');
        let node: Element | null = event.target instanceof Element ? event.target : null;
        while (root && node && node.parentElement !== root) node = node.parentElement;
        const at = root && node ? Array.from(root.children).indexOf(node) : -1;
        setLayoutStart(at >= 0 ? [`raw:${at}`] : []);
        select(board.id, false);
        setLayoutId(board.id);
      }
      return;
    }
    if (board.format !== 'html') return;
    const found = elementAt(event.currentTarget, event.clientX, event.clientY, viewport.zoom);
    const yz = found?.element.getAttribute('data-yz');
    if (!found || !yz) return;
    if (found.element.tagName.toLowerCase() === 'img') {
      onPicture(board.id, { kind: 'html', yz });
      return;
    }
    if (elementText(board.source, yz) === null) return;
    const element = found.element as HTMLElement;
    const original = element.textContent ?? '';
    setEditing({ boardId: board.id, yz });
    element.contentEditable = 'true';
    element.style.outline = '2px solid #2563eb';
    element.focus();
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const selection = element.ownerDocument.defaultView?.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const done = (commit: boolean): void => {
      element.removeEventListener('blur', onBlur);
      element.removeEventListener('keydown', onKey);
      element.contentEditable = 'false';
      element.style.outline = '';
      setEditing(null);
      const text = element.innerText ?? element.textContent ?? '';
      if (commit && text.trim() && text !== original) onEditText(board.id, yz, text);
      else element.textContent = original;
    };
    const onBlur = (): void => done(true);
    const onKey = (key: Event): void => {
      const pressed = key as KeyboardEvent;
      pressed.stopPropagation();
      if (pressed.key === 'Enter' && !pressed.shiftKey) {
        pressed.preventDefault();
        done(true);
      } else if (pressed.key === 'Escape') {
        pressed.preventDefault();
        done(false);
      }
    };
    element.addEventListener('blur', onBlur);
    element.addEventListener('keydown', onKey);
  };

  const resolveHref = useCallback((href: string): string => (/^(?:data:|#|https?:|blob:)/i.test(href) ? href : localFileUrl(joinPath(projectDir, href))), [projectDir]);

  const dotSize = Math.max(8, 24 * viewport.zoom);
  const pickMode = tool === 'pick' && !handMode;

  return (
    <div
      ref={host}
      className="dz-canvas"
      data-tool={handMode ? 'hand' : pickMode ? 'pick' : 'select'}
      data-panning={panning || undefined}
      style={{ backgroundSize: `${dotSize}px ${dotSize}px`, backgroundPosition: `${viewport.x}px ${viewport.y}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      <div className="dz-world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
        <div className="dz-board" style={{ left: 0, top: 0, width: SYSTEM_BOARD.width }}>
          <div className="dz-board__label" style={{ transform: `scale(${1 / viewport.zoom})` }}>Design system</div>
          <div className="dz-board__surface" style={{ height: 'auto', overflow: 'hidden' }}><SystemBoard tokens={tokens} /></div>
        </div>

        {(() => {
          const groups = new Map<string, Board[]>();
          for (const entry of boards) if (entry.group && !entry.hidden) groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
          return Array.from(groups.entries()).filter(([, list]) => list.length > 1).map(([id, list]) => {
            const box = unionRect(list.map(rectOf));
            const lead = list.find((entry) => entry.id === id) ?? list[0];
            return (
              <div key={`group-${id}`} className="dz-group" style={{ left: box.x - 28, top: box.y - 28, width: box.width + 56, height: box.height + 56 }}>
                <span className="dz-group__label" style={{ transform: `scale(${1 / viewport.zoom})` }}>{lead.name.split(' · ')[0]} · {list.length} states</span>
              </div>
            );
          });
        })()}

        {flow && (
          <svg className="dz-flow" width={1} height={1} aria-hidden="true">
            <defs>
              <marker id="dz-flow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" className="dz-flow__head" /></marker>
            </defs>
            {boards.filter((entry) => entry.format === 'html' && !entry.hidden && entry.source).flatMap((entry) => gotoLinks(entry.source).slice(0, 24).map((link) => {
              const target = resolveGoto(boards, link.target, entry.id);
              if (!target || target.hidden) return null;
              const spot = flowSpots[`${entry.id}:${link.yz}`];
              const x1 = spot ? entry.x + spot.x + spot.width : entry.x + entry.width;
              const y1 = spot ? entry.y + spot.y + spot.height / 2 : entry.y + Math.min(entry.height / 2, 450);
              const x2 = target.x;
              const y2 = target.y + Math.min(target.height / 2, 450);
              const reach = Math.max(80, Math.abs(x2 - x1) / 2);
              return (
                <g key={`${entry.id}-${link.yz}`}>
                  {spot && <rect x={entry.x + spot.x} y={entry.y + spot.y} width={spot.width} height={spot.height} className="dz-flow__spot" />}
                  <path d={`M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 - reach} ${y2}, ${x2} ${y2}`} className="dz-flow__path" markerEnd="url(#dz-flow-head)" />
                </g>
              );
            }))}
          </svg>
        )}

        {guides.map((guide, index) => (
          <div
            key={`${guide.axis}${index}`}
            className="dz-guide"
            style={guide.axis === 'x'
              ? { left: guide.at, top: guide.from, width: 1 / viewport.zoom, height: guide.to - guide.from }
              : { left: guide.from, top: guide.at, width: guide.to - guide.from, height: 1 / viewport.zoom }}
          />
        ))}

        {boards.filter((board) => !board.hidden).map((board) => (
          <div
            key={board.id}
            className="dz-board"
            data-board-id={board.id}
            data-selected={selectedIds.includes(board.id) || undefined}
            style={{ left: board.x, top: board.y, width: board.width, height: board.height }}
            onPointerDown={(event) => onBoardDown(event, board)}
            onPointerMove={(event) => onBoardMove(event, board)}
            onPointerUp={onBoardUp}
            onPointerLeave={() => setHover((current) => (current?.boardId === board.id ? null : current))}
            onDoubleClick={(event) => onBoardDouble(event, board)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!selectedIds.includes(board.id)) select(board.id, false);
              const rect = host.current?.getBoundingClientRect();
              setMenu({ x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0), boardId: board.id });
            }}
          >
            <GenerationAura
              active={board.status === 'drawing'}
              failed={board.status === 'failed'}
              radius={board.frame === 'phone' ? 40 : 2}
              scale={1 / viewport.zoom}
            />
            <div className="dz-board__label" style={{ transform: `scale(${1 / viewport.zoom})`, display: viewport.zoom < 0.15 ? 'none' : undefined, bottom: board.frame === 'browser' ? `calc(100% + ${36 / viewport.zoom}px)` : board.frame === 'phone' ? `calc(100% + ${28 / viewport.zoom}px)` : undefined }}>
              <span className="dz-board__dot" data-status={board.status ?? (board.source ? 'done' : 'idle')} title={statusLabel(board.status, Boolean(board.source))} />
              {renaming === board.id ? (
                <input
                  autoFocus
                  dir="auto"
                  className="dz-board__rename"
                  defaultValue={board.name}
                  aria-label="Board name"
                  onPointerDown={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onFocus={(event) => event.target.select()}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    setRenaming(null);
                    if (name && name !== board.name) edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (entry.id === board.id ? { ...entry, name } : entry)) }));
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                    else if (event.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <span className="dz-board__name" title="Double-click to rename" onDoubleClick={(event) => { event.stopPropagation(); if (!locked) setRenaming(board.id); }}>{board.name}</span>
              )}
              <span className="dz-board__size">{sizeLabel(board.width, board.height)}</span>
              {board.status === 'drawing' && <span className="dz-board__size">Drawing…</span>}
            </div>
            {board.frame === 'phone' && <div className="dz-frame dz-frame--phone" aria-hidden="true"><span className="dz-frame__notch" /></div>}
            {board.frame === 'browser' && (
              <div className="dz-frame dz-frame--browser" aria-hidden="true">
                <span className="dz-frame__dots"><i /><i /><i /></span>
                <span className="dz-frame__url">{board.name}</span>
              </div>
            )}
            <div className="dz-board__surface" data-frame={board.frame} style={{ background: board.theme === 'dark' && tokens.darkPalette ? tokens.darkPalette.background : tokens.palette.background }}>
              {board.source && !live(board) && (previews[board.id]
                ? <img className="dz-board__preview" src={previews[board.id]} alt="" draggable={false} />
                : <div className="dz-board__empty" style={{ color: tokens.palette.muted, fontSize: Math.max(14, Math.min(board.width, board.height) / 22) }}>{board.name}</div>)}
              {board.source && live(board) && board.format === 'html' && (
                <HtmlBoard source={board.source} tokens={tokens} width={board.width} height={board.height} projectDir={projectDir} theme={board.theme} tweaks={board.tweaks} tweakValues={board.tweakValues} fit={kind === 'web'} fixed={kind === 'graphic'} editable={editing?.boardId === board.id} onHeight={(height) => onBoardHeight(board.id, height, kind === 'web')} />
              )}
              {board.source && live(board) && board.format === 'svg' && layoutId !== board.id && (
                <SvgSlide
                  svg={applySvgTweaks(board.source, board.tweaks, board.tweakValues)}
                  width={board.width}
                  canvas={{ width: board.width, height: board.height }}
                  resolveHref={resolveHref}
                  interactive={false}
                  onText={(index) => onSvgText(board.id, index)}
                  onImage={(index) => onPicture(board.id, { kind: 'svg', index })}
                />
              )}
              {!board.source && (() => {
                const empty = emptyBoardState(board.status);
                return (
                  <div className="dz-board__empty" data-status={board.status ?? 'idle'} style={{ color: tokens.palette.muted, fontSize: Math.max(14, Math.min(board.width, board.height) / 22) }}>
                    {empty.skeleton && (
                      <div className="dz-skeleton" aria-hidden="true">
                        <span style={{ background: tokens.palette.muted, width: '58%' }} />
                        <span style={{ background: tokens.palette.muted, width: '82%' }} />
                        <span style={{ background: tokens.palette.muted, width: '70%' }} />
                        <span className="dz-skeleton__block" style={{ background: tokens.palette.muted }} />
                      </div>
                    )}
                    <div>{empty.message}</div>
                    {empty.action && onRedraw && !locked && (
                      <button type="button" className="dz-btn dz-btn--sm" onPointerDown={(event) => event.stopPropagation()} onClick={() => onRedraw([board.id])}>{empty.action}</button>
                    )}
                  </div>
                );
              })()}
            </div>
            {pickMode && hover?.boardId === board.id && (
              <div className="dz-hover" style={{ left: hover.x, top: hover.y, width: hover.width, height: hover.height }} />
            )}
            {kind === 'web' && board.format === 'html' && !locked && selectedIds.length === 1 && selectedIds[0] === board.id && (
              <div
                className="dz-resize"
                role="separator"
                aria-orientation="vertical"
                aria-label="Page width"
                title="Drag to change the width · snaps to 390, 768, 1024, 1280, 1440 · Alt for free"
                style={{ transform: `translateY(-50%) scale(${1 / viewport.zoom})` }}
                onPointerDown={(event) => startResize(event, board)}
                onPointerMove={moveResize}
                onPointerUp={endResize}
                onPointerCancel={endResize}
              >
                {resizeLabel?.id === board.id && <span className="dz-resize__label">{resizeLabel.width} px</span>}
              </div>
            )}
            {picked?.boardId === board.id && pickedRect?.boardId === board.id && space?.boardId === board.id && (() => {
              const r = pickedRect;
              const m = space;
              const boxes: Array<[string, number, number, number, number]> = [
                ['margin', r.x - m.ml, r.y - m.mt, r.width + m.ml + m.mr, m.mt],
                ['margin', r.x - m.ml, r.y + r.height, r.width + m.ml + m.mr, m.mb],
                ['margin', r.x - m.ml, r.y, m.ml, r.height],
                ['margin', r.x + r.width, r.y, m.mr, r.height],
                ['padding', r.x, r.y, r.width, m.pt],
                ['padding', r.x, r.y + r.height - m.pb, r.width, m.pb],
                ['padding', r.x, r.y + m.pt, m.pl, Math.max(0, r.height - m.pt - m.pb)],
                ['padding', r.x + r.width - m.pr, r.y + m.pt, m.pr, Math.max(0, r.height - m.pt - m.pb)],
              ];
              return boxes.filter((entry) => entry[3] > 0 && entry[4] > 0).map(([kindName, left, top, width, height], index) => (
                <div key={index} className={`dz-space dz-space--${kindName}`} style={{ left, top, width, height }} />
              ));
            })()}
            {extraRects.filter((entry) => entry.boardId === board.id).map((entry, index) => (
              <div key={`also-${index}`} className="dz-picked-box dz-picked-box--also" style={{ left: entry.x, top: entry.y, width: entry.width, height: entry.height }} />
            ))}
            {picked?.boardId === board.id && pickedRect?.boardId === board.id && (
              <div className="dz-picked-box" style={{ left: pickedRect.x, top: pickedRect.y, width: pickedRect.width, height: pickedRect.height }} />
            )}
            {picked?.boardId === board.id && <div className="dz-picked-tag" style={{ transform: `scale(${1 / viewport.zoom})` }}>{picked.label}</div>}
          </div>
        ))}
      </div>

      {layoutId && (() => {
        const board = boards.find((entry) => entry.id === layoutId);
        if (!board || board.format !== 'svg' || !board.source) return null;
        return (
          <GraphicStage
            key={board.id}
            board={board}
            initialSelection={layoutStart}
            tokens={tokens}
            zoom={viewport.zoom}
            left={board.x * viewport.zoom + viewport.x}
            top={board.y * viewport.zoom + viewport.y}
            resolveHref={resolveHref}
            onCommit={(svg) => edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (entry.id === board.id ? { ...entry, source: svg } : entry)) }))}
            onExit={() => setLayoutId(null)}
            onPicture={(index) => onPicture(board.id, { kind: 'svg', index })}
            onPutPicture={onPutPicture ? (yz) => onPutPicture(board.id, yz) : undefined}
            onRemovePicture={onRemovePicture ? (yz) => onRemovePicture(board.id, yz) : undefined}
            onAdjustPicture={onAdjustPicture ? (yz) => onAdjustPicture(board.id, yz) : undefined}
          />
        );
      })()}

      {marquee && (() => {
        const a = { x: marquee.x0 * viewport.zoom + viewport.x, y: marquee.y0 * viewport.zoom + viewport.y };
        const b = { x: marquee.x1 * viewport.zoom + viewport.x, y: marquee.y1 * viewport.zoom + viewport.y };
        return <div className="dz-marquee" style={{ left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }} />;
      })()}

      {selectedIds.length >= 2 && !locked && (
        <div className="dz-arrange" role="toolbar" aria-label="Arrange boards">
          {([['left', AlignLeft, 'Align left'], ['center', AlignCenterHorizontal, 'Align centres'], ['right', AlignRight, 'Align right'], ['top', AlignTop, 'Align top'], ['middle', AlignCenterVertical, 'Align middles'], ['bottom', AlignBottom, 'Align bottom']] as const).map(([mode, Icon, name]) => (
            <button key={mode} type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label={name} title={name} onClick={() => arrange(mode)}><Icon size={15} /></button>
          ))}
          <span className="dz-arrange__sep" aria-hidden="true" />
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Join in a row, edge to edge" title="Join in a row, edge to edge (a carousel)" onClick={() => arrange('row')}><Columns size={15} /></button>
          {selectedIds.length >= 3 && (
            <>
              <span className="dz-arrange__sep" aria-hidden="true" />
              <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Distribute horizontally" title="Distribute horizontally" onClick={() => arrange('distribute-x')}><ArrowsHorizontal size={15} /></button>
              <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Distribute vertically" title="Distribute vertically" onClick={() => arrange('distribute-y')}><ArrowsVertical size={15} /></button>
            </>
          )}
        </div>
      )}

      {menu && (() => {
        const board = boards.find((entry) => entry.id === menu.boardId);
        if (!board) return null;
        const close = (): void => setMenu(null);
        const ids = selectedIds.includes(board.id) ? selectedIds : [board.id];
        const item = (label: string, run: () => void, options: { disabled?: boolean; meta?: string; danger?: boolean } = {}): React.ReactNode => (
          <button type="button" role="menuitem" className="dz-menu__item" disabled={options.disabled} data-danger={options.danger || undefined} onClick={() => { close(); run(); }}>
            <span>{label}</span>{options.meta && <span className="dz-menu__meta">{options.meta}</span>}
          </button>
        );
        return (
          <>
            <div className="dz-menu-scrim" onPointerDown={close} onContextMenu={(event) => { event.preventDefault(); close(); }} />
            <div className="dz-menu dz-menu--context" role="menu" style={{ left: Math.max(8, Math.min(menu.x, hostSize.width - 220)), top: Math.max(8, Math.min(menu.y, hostSize.height - 440)) }} onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
              {item('Rename', () => setRenaming(board.id), { disabled: locked })}
              {board.format === 'svg' && item('Edit layout', () => { setLayoutStart([]); select(board.id, false); setLayoutId(board.id); }, { disabled: locked || !board.source })}
              {item('Duplicate', () => onDuplicate?.(ids), { disabled: locked || !onDuplicate, meta: 'Ctrl+D' })}
              {item('Variations', () => onVariations?.(board.id), { disabled: locked || !board.source || !onVariations })}
              {item('Draw again', () => onRedraw?.(ids), { disabled: locked || !onRedraw })}
              <div className="dz-menu__rule" />
              {item(board.hidden ? 'Show' : 'Hide', () => edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (ids.includes(entry.id) ? { ...entry, hidden: !board.hidden } : entry)) })))}
              {tokens.darkPalette && board.format === 'html' && item(board.theme === 'dark' ? 'Light theme' : 'Dark theme', () => edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (ids.includes(entry.id) ? { ...entry, theme: board.theme === 'dark' ? undefined : 'dark' } : entry)) })))}
              {item(`Device frame: ${board.frame === 'phone' ? 'Phone' : board.frame === 'browser' ? 'Browser' : 'None'}`, () => edit(workspaceId, (current) => ({ ...current, boards: current.boards.map((entry) => (ids.includes(entry.id) ? { ...entry, frame: NEXT_FRAME[board.frame ?? 'none'] === 'none' ? undefined : NEXT_FRAME[board.frame ?? 'none'] } : entry)) })), { disabled: locked })}
              {board.format === 'html' && kind !== 'graphic' && versionTargets(kind, board.preset)[0] && item(`Make ${versionTargets(kind, board.preset)[0].label.toLowerCase()} version`, () => onVersion?.(board.id, versionTargets(kind, board.preset)[0].id), { disabled: locked || !board.source || !onVersion })}
              {item('Zoom to selection', zoomToSelection, { meta: 'Shift+2' })}
              {item('Copy code', () => void navigator.clipboard.writeText(board.source).catch(() => undefined), { disabled: !board.source })}
              {item('Export…', () => onExport?.(), { disabled: !board.source || !onExport, meta: 'Ctrl+Shift+E' })}
              <div className="dz-menu__rule" />
              {item('Delete', () => {
                edit(workspaceId, (current) => ({ ...current, boards: current.boards.filter((entry) => !ids.includes(entry.id)) }));
                update(workspaceId, { selectedIds: [], picked: null });
              }, { disabled: locked, danger: true, meta: 'Del' })}
            </div>
          </>
        );
      })()}

      <div className="dz-topbar" role="toolbar" aria-label="Canvas tools">
        <div className="dz-topbar__group">
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-pressed={!handMode && !pickMode} aria-label="Select (V)" title="Select and move boards (V)" onClick={() => update(workspaceId, { tool: 'select' })}><CursorClick size={16} /></button>
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-pressed={pickMode} aria-label="Pick an element (P)" title="Pick an element for the AI (P)" onClick={() => update(workspaceId, { tool: 'pick' })}><Crosshair size={16} /></button>
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-pressed={handMode} aria-label="Hand (H or hold Space)" title="Hand (H, or hold Space)" onClick={() => update(workspaceId, { tool: 'hand' })}><Hand size={16} /></button>
        </div>
        {(() => {
          const only = selectedIds.length === 1 ? boards.find((entry) => entry.id === selectedIds[0]) : undefined;
          const graphic = only && only.format === 'svg' && only.source ? only : null;
          return (
            <div className="dz-topbar__group">
              <button type="button" className="dz-btn dz-btn--sm" disabled={!graphic || locked} title={graphic ? 'Select, move and resize the elements of this graphic (click it, or double-click)' : 'Select a graphic board first'} onClick={() => { if (graphic) { setLayoutStart([]); setLayoutId(graphic.id); } }}>
                <CursorClick size={14} /> {layoutId ? 'Editing layout' : 'Edit layout'}
              </button>
              <button type="button" className="dz-btn dz-btn--sm" disabled={selectedIds.length === 0 || !onRedraw || locked} title="Draw the selected boards again" onClick={() => onRedraw?.(selectedIds)}>Draw again</button>
              <button type="button" className="dz-btn dz-btn--sm" disabled={selectedIds.length === 0 || !onExport} title="Export the selected boards" onClick={() => onExport?.()}>Export</button>
            </div>
          );
        })()}
        <div className="dz-topbar__group">
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={pastCount === 0 || locked} onClick={() => undoStep(workspaceId)}><ArrowCounterClockwise size={15} /></button>
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={futureCount === 0 || locked} onClick={() => redoStep(workspaceId)}><ArrowClockwise size={15} /></button>
          <button type="button" className="dz-btn dz-btn--icon dz-btn--ghost" aria-label="Fit to content" title="Fit to content (0)" onClick={fit}><ArrowsOutSimple size={15} /></button>
        </div>
      </div>

      {minimap && boards.length > 0 && (() => {
        const all: Rect[] = [{ x: 0, y: 0, width: SYSTEM_BOARD.width, height: SYSTEM_BOARD.height }, ...boards.filter((entry) => !entry.hidden).map(rectOf)];
        const box = unionRect(all);
        const pad = Math.max(box.width, box.height) * 0.08;
        const view = { x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom, width: hostSize.width / viewport.zoom, height: hostSize.height / viewport.zoom };
        const full = unionRect([...all, view]);
        const aspect = Math.min(1.2, Math.max(0.35, (full.height + pad * 2) / (full.width + pad * 2)));
        return (
          <svg
            className="dz-minimap"
            role="img"
            aria-label="Overview of the canvas"
            width={176}
            height={Math.round(176 * aspect)}
            viewBox={`${full.x - pad} ${full.y - pad} ${full.width + pad * 2} ${full.height + pad * 2}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={(event) => { event.stopPropagation(); (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId); minimapJump(event); }}
            onPointerMove={(event) => { if (event.buttons === 1) minimapJump(event); }}
          >
            {all.map((rect, index) => <rect key={index} x={rect.x} y={rect.y} width={rect.width} height={rect.height} className="dz-minimap__board" data-system={index === 0 || undefined} />)}
            {boards.filter((entry) => !entry.hidden && selectedIds.includes(entry.id)).map((entry) => <rect key={`s-${entry.id}`} x={entry.x} y={entry.y} width={entry.width} height={entry.height} className="dz-minimap__selected" />)}
            <rect x={view.x} y={view.y} width={view.width} height={view.height} className="dz-minimap__view" vectorEffect="non-scaling-stroke" />
          </svg>
        );
      })()}

      {sheet && <ShortcutSheet onClose={() => setSheet(false)} />}

      <div className="dz-zoom">
        <button type="button" className="dz-btn dz-btn--icon" aria-label="Zoom out" onClick={() => zoomAround(viewport.zoom / 1.25)}><Minus size={14} /></button>
        <div style={{ position: 'relative' }}>
          <button type="button" className="dz-btn" aria-haspopup="menu" aria-expanded={zoomMenu} onClick={() => setZoomMenu((value) => !value)} style={{ minWidth: 56, justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(viewport.zoom * 100)}%
          </button>
          {zoomMenu && (
            <div className="dz-menu" role="menu" style={{ insetInlineStart: 'auto', insetInlineEnd: 0, minWidth: 140 }}>
              <button type="button" role="menuitem" className="dz-menu__item" onClick={() => { fit(); setZoomMenu(false); }}><span>Fit to content</span><span className="dz-menu__meta">0</span></button>
              <button type="button" role="menuitem" className="dz-menu__item" disabled={selectedIds.length === 0} onClick={() => { zoomToSelection(); setZoomMenu(false); }}><span>Zoom to selection</span><span className="dz-menu__meta">Shift+2</span></button>
              {ZOOM_STEPS.map((step) => (
                <button key={step} type="button" role="menuitem" className="dz-menu__item" onClick={() => { zoomAround(step); setZoomMenu(false); }}>
                  <span>{step * 100}%</span>{step === 1 && <span className="dz-menu__meta">1</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="dz-btn dz-btn--icon" aria-label="Zoom in" onClick={() => zoomAround(viewport.zoom * 1.25)}><Plus size={14} /></button>
        <button type="button" className="dz-btn dz-btn--icon" aria-label="Fit to content" title="Fit to content (0)" onClick={fit}><ArrowsOutSimple size={14} /></button>
        <button type="button" className="dz-btn dz-btn--icon" aria-pressed={flow} aria-label="Show links between screens" title="Show links between screens" onClick={() => setFlow((value) => !value)}><FlowArrow size={14} /></button>
        <button type="button" className="dz-btn dz-btn--icon" aria-pressed={minimap} aria-label="Overview map" title="Overview map" onClick={() => setMinimap((value) => !value)}><MapTrifold size={14} /></button>
        <button type="button" className="dz-btn dz-btn--icon" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setSheet(true)}><Question size={14} /></button>
      </div>
    </div>
  );
};
