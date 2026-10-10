import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowDown, ArrowUp, ArrowUUpLeft, CaretDown, CaretUp, Check, ClipboardText, Copy, CopySimple, Export, Eye, EyeSlash,
  FileArrowUp, FolderSimple, ImageSquare, NotePencil, PaintBrush, PaperPlaneRight, Play, Plus, Scissors, SlidersHorizontal, Sparkle, SquaresFour, Stack, Stop, Trash, X,
} from '@phosphor-icons/react';
import type { PresentationSession } from '../../stores/presentationSessionStore';
import { usePresentationSessionStore } from '../../stores/presentationSessionStore';
import { newDesignedSlideId, placeablePictures, REFINE_ACTIONS } from '../../utils/presentation/designPrompts';
import { assetName, MAX_DECK_PICTURES } from '../../utils/presentation/designPictures';
import { designCanvas, stylesIn } from '../../utils/presentation/designStyles';
import type { DesignAttachment, DesignedSlide, DesignPalette } from '../../utils/presentation/designTypes';
import { base64ToBytes, isAbsolutePath, writeFileBytes } from '../../utils/presentation/assets';
import { formatDuration } from '../../utils/presentation/timing';
import { setSvgImage } from '../../utils/presentation/svgText';
import { svgSize } from '../../utils/presentation/svgSafe';
import { DECK_THEMES, SAFE_FONTS } from '../../utils/presentation/themes';
import {
  applyThemeMap, arrangeElement, backgroundColor, blankSlide, contrast, copyElements, deleteElements, duplicateElements, insertElement, listElements,
  moveElements, paletteColorMap, pasteElements, resizeElement, setBackground, textBoxModel, updateModels, type Arrange, type ElementInfo,
} from '../../utils/presentation/slideEdit';
import { mapBodies, mapRuns, type Box, type PictureElement, type ShapeElement, type SlideElement, type TxBody, type TxRun } from '../../utils/presentation/slideModel';
import type { SlideRunStatus, SlideTransition, YzDeck } from '../../utils/presentation/types';
import { fileName, joinPath } from '../../utils/writing/document';
import { localFileUrl } from '../../utils/mediaFiles';
import { IMAGE_EXTENSIONS, pictureInfo, scanFolderPictures } from './designAssets';
import { ensureFonts, measureSlideText, svgFontFamilies } from './deckFonts';
import { EnginePicker } from './EnginePicker';
import { FormatBar, type AlignHow, type ShapeKind } from './FormatBar';
import { SlideStage, type EditTarget, type StageApi } from './SlideStage';
import { SvgSlide } from './SvgSlide';
import type { ProposalResult, SlideProposal, useDesignGenerator } from './useDesignGenerator';

type Generator = ReturnType<typeof useDesignGenerator>;
type Command = 'duplicate' | 'delete' | 'hide' | 'up' | 'down' | 'redraw';

interface DesignedEditorProps {
  workspaceId: string;
  workspacePath: string;
  session: PresentationSession;
  deck: YzDeck;
  deckDir: string;
  visible: boolean;
  generator: Generator;
  onSave: () => void;
  onExport: () => void;
  onPresent: (startId: string | null) => void;
  onToast: (title: string, description: string) => void;
}

interface Review {
  /** Replace a slide, or insert a new one at `at`. */
  kind: 'replace' | 'insert';
  slideId: string;
  at: number;
  label: string;
  instruction: string;
  status: 'running' | 'ready' | 'failed';
  proposal: SlideProposal | null;
  error: string | null;
}

const THUMB = 168;
const NUDGE = 1;
const NUDGE_BIG = 10;
const PASTE_OFFSET = 16;

/** Elements copied with Ctrl+C, shared by every slide (and deck) in this window. */
let elementClipboard: string[] = [];

const EXTRA_FONTS = ['Segoe UI Semibold', 'Segoe UI Black', 'Segoe UI Light', 'Calibri Light', 'Cambria', 'Candara', 'Corbel', 'Constantia', 'Century Gothic', 'Franklin Gothic Medium', 'Gill Sans MT', 'Tahoma', 'Times New Roman', 'Verdana', 'Consolas', 'Impact', 'Bahnschrift'];

const Thumb = memo(function Thumb({ slide, index, canvas, selected, status, resolveHref, onSelect, onContext }: {
  slide: DesignedSlide;
  index: number;
  canvas: { width: number; height: number };
  selected: boolean;
  status: SlideRunStatus | undefined;
  resolveHref: (href: string) => string;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onContext: (id: string, event: React.MouseEvent) => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const busy = status === 'queued' || status === 'writing';
  return (
    <div
      ref={setNodeRef}
      className="pr-thumb"
      data-selected={selected || undefined}
      data-hidden={slide.hidden || undefined}
      data-status={status}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onMouseDown={(event) => { if (event.button === 0) onSelect(slide.id, event); }}
      onContextMenu={(event) => onContext(slide.id, event)}
      title={slide.title}
      {...attributes}
      {...listeners}
      aria-label={`Slide ${index + 1}: ${slide.title}`}
    >
      <span className="pr-thumb__num">{index + 1}</span>
      <div className="pr-thumb__frame">
        <SvgSlide svg={slide.svg} width={THUMB} canvas={canvas} resolveHref={resolveHref} placeholder={{ title: slide.title, busy, failed: status === 'failed' }} />
        {busy && slide.svg && <span className="pr-thumb__veil" />}
        {slide.hidden && <span className="pr-thumb__badge" title="Hidden in the slideshow"><EyeSlash size={11} /></span>}
      </div>
    </div>
  );
});

/** Fits a box of the canvas aspect inside an element, with a margin. */
function useFit(aspect: number, margin = 40): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (): void => {
      const box = element.getBoundingClientRect();
      setWidth(Math.max(240, Math.floor(Math.min(box.width - margin * 2, (box.height - margin * 2) * aspect))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [aspect, margin]);
  return [ref, width];
}

/** A number field that commits on Enter or blur. */
function NumberField({ label, value, onCommit, suffix }: { label: string; value: number; onCommit: (value: number) => void; suffix?: string }): React.JSX.Element {
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);
  const commit = (): void => {
    const next = Number(draft);
    if (Number.isFinite(next) && Math.round(next) !== Math.round(value)) onCommit(next);
    else setDraft(String(Math.round(value)));
  };
  return (
    <label className="ps-num">
      <span>{label}</span>
      <input
        className="pr-input"
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const next = (Number(draft) || 0) + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1);
            setDraft(String(next));
            onCommit(next);
          }
        }}
      />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}

const KIND_LABEL: Record<string, string> = { text: 'Text box', shape: 'Shape', pic: 'Picture', table: 'Table', group: 'Group', chart: 'Chart', art: 'Artwork' };

/** The crop that makes a picture of iw × ih fill a w × h frame without stretching. */
function coverCrop(iw: number, ih: number, w: number, h: number): [number, number, number, number] | undefined {
  if (!(iw > 0 && ih > 0 && w > 0 && h > 0)) return undefined;
  const frame = w / h;
  const image = iw / ih;
  if (Math.abs(frame - image) < 0.01) return undefined;
  if (image > frame) {
    const cut = (1 - frame / image) / 2;
    return [cut, 0, cut, 0];
  }
  const cut = (1 - image / frame) / 2;
  return [0, cut, 0, cut];
}

export const DesignedEditor: React.FC<DesignedEditorProps> = ({ workspaceId, workspacePath, session, deck, deckDir, visible, generator, onSave, onExport, onPresent, onToast }) => {
  const design = deck.design!;
  const canvas = useMemo(() => svgSize(design.slides.find((entry) => entry.svg)?.svg ?? '', designCanvas(deck.size)), [deck.size, design.slides]);
  const store = usePresentationSessionStore.getState;
  const run = session.run;
  const status = run?.slideStatus ?? {};
  const selectedId = session.selectedIds[session.selectedIds.length - 1] ?? design.slides[0]?.id ?? null;
  const selectedIndex = design.slides.findIndex((slide) => slide.id === selectedId);
  const slide = selectedIndex >= 0 ? design.slides[selectedIndex] : null;
  const generating = run?.phase === 'slides' || run?.phase === 'outline';
  const imported = design.origin?.kind === 'pptx';
  const measure = measureSlideText;

  const [tab, setTab] = useState<'format' | 'slide' | 'design'>('format');
  const [instruction, setInstruction] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [stageMenu, setStageMenu] = useState<{ x: number; y: number } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [restyle, setRestyle] = useState('');
  const [now, setNow] = useState(Date.now());
  const [selection, setSelection] = useState<string[]>([]);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [fontsReady, setFontsReady] = useState(0);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const stageApi = useRef<StageApi | null>(null);
  const [stageRef, stageWidth] = useFit(canvas.width / canvas.height);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    if (!generating && review?.status !== 'running') return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [generating, review?.status]);

  useEffect(() => { setShowBefore(false); setSelection([]); setEditing(null); setStageMenu(null); }, [selectedId]);

  // Fonts the slides use (Office cloud fonts are registered when they are not installed).
  const slideFonts = useMemo(() => svgFontFamilies(design.slides.map((entry) => entry.svg)), [design.slides]);
  useEffect(() => {
    let alive = true;
    void ensureFonts([...slideFonts, design.system.fonts.heading, design.system.fonts.body]).then(() => { if (alive) setFontsReady((value) => value + 1); });
    return () => { alive = false; };
  }, [design.system.fonts.body, design.system.fonts.heading, slideFonts]);

  const resolveHref = useCallback((href: string): string => (/^data:/.test(href) ? href : localFileUrl(isAbsolutePath(href) ? href : joinPath(deckDir, href))), [deckDir]);

  const edit = useCallback((change: (deck: YzDeck) => YzDeck, coalesce?: string) => {
    store().edit(workspaceId, change, coalesce ? { coalesce } : undefined);
  }, [store, workspaceId]);

  const editSlides = useCallback((change: (slides: DesignedSlide[]) => DesignedSlide[], coalesce?: string) => {
    edit((current) => (current.design ? { ...current, design: { ...current.design, slides: change(current.design.slides) } } : current), coalesce);
  }, [edit]);

  const patchSlide = useCallback((id: string, patch: Partial<DesignedSlide>, coalesce?: string) => {
    editSlides((slides) => slides.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)), coalesce);
  }, [editSlides]);

  const select = useCallback((ids: string[]) => store().update(workspaceId, { selectedIds: ids }), [store, workspaceId]);

  const onSelectThumb = useCallback((id: string, event: React.MouseEvent) => {
    const current = store().sessions[workspaceId];
    if ((event.ctrlKey || event.metaKey) && current) {
      const ids = current.selectedIds;
      select(ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]);
    } else select([id]);
  }, [select, store, workspaceId]);

  // Slide commands ---------------------------------------------------------------------

  const command = useCallback((cmd: Command, id: string) => {
    const slides = store().sessions[workspaceId]?.deck?.design?.slides ?? [];
    const index = slides.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    if (cmd === 'delete') {
      if (slides.length <= 1) return;
      editSlides((list) => list.filter((entry) => entry.id !== id));
      select([(slides[index + 1] ?? slides[index - 1]).id]);
    } else if (cmd === 'duplicate') {
      const copy = { ...slides[index], id: newDesignedSlideId() };
      editSlides((list) => [...list.slice(0, index + 1), copy, ...list.slice(index + 1)]);
      select([copy.id]);
    } else if (cmd === 'hide') {
      patchSlide(id, { hidden: !slides[index].hidden });
    } else if (cmd === 'up' || cmd === 'down') {
      const target = cmd === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= slides.length) return;
      editSlides((list) => {
        const next = [...list];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    } else if (cmd === 'redraw') {
      void generator.drawSlides([id]);
    }
  }, [editSlides, generator, patchSlide, select, store, workspaceId]);

  const onDragEnd = (event: DragEndEvent): void => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = String(event.active.id);
    const to = String(event.over.id);
    editSlides((list) => {
      const next = [...list];
      const a = next.findIndex((entry) => entry.id === from);
      const b = next.findIndex((entry) => entry.id === to);
      if (a < 0 || b < 0) return list;
      const [moved] = next.splice(a, 1);
      next.splice(b, 0, moved);
      return next;
    });
  };

  // AI changes (always reviewed) -------------------------------------------------------------

  const settle = (result: ProposalResult): void => {
    setReview((current) => current && (result.ok
      ? { ...current, status: 'ready', proposal: result.proposal, error: null }
      : { ...current, status: 'failed', error: result.cancelled ? 'Stopped.' : result.error }));
  };

  const askAi = async (text: string, label: string): Promise<void> => {
    if (!slide || !text.trim()) return;
    setShowBefore(false);
    setReview({ kind: 'replace', slideId: slide.id, at: selectedIndex, label, instruction: text, status: 'running', proposal: null, error: null });
    settle(await generator.refine(slide.id, text, label));
  };

  const addSlide = async (description: string): Promise<void> => {
    const at = selectedIndex + 1;
    setAdding(null);
    setReview({ kind: 'insert', slideId: '', at, label: 'New slide', instruction: description, status: 'running', proposal: null, error: null });
    settle(await generator.newSlide(at, description));
  };

  const retryReview = (): void => {
    if (!review) return;
    if (review.kind === 'insert') void addSlide(review.instruction);
    else void askAi(review.instruction, review.label);
  };

  const acceptReview = (): void => {
    if (!review?.proposal) return;
    const { proposal } = review;
    if (review.kind === 'insert') {
      const created: DesignedSlide = {
        id: newDesignedSlideId(),
        role: proposal.role ?? 'content',
        title: proposal.title || 'New slide',
        brief: review.instruction,
        density: 'dense',
        svg: proposal.svg,
        notes: proposal.notes,
      };
      editSlides((list) => [...list.slice(0, review.at), created, ...list.slice(review.at)]);
      select([created.id]);
    } else {
      const patch: Partial<DesignedSlide> = { svg: proposal.svg };
      if (proposal.notes) patch.notes = proposal.notes;
      if (proposal.title) patch.title = proposal.title;
      patchSlide(review.slideId, patch);
    }
    setReview(null);
    setInstruction('');
  };

  // Element editing ------------------------------------------------------------------------------

  /** The slide as stored right now (edits can land between renders). */
  const liveSvg = useCallback((): string => {
    if (!slide) return '';
    return store().sessions[workspaceId]?.deck?.design?.slides.find((entry) => entry.id === slide.id)?.svg ?? slide.svg;
  }, [slide, store, workspaceId]);

  const commit = useCallback((svg: string, coalesce?: string): void => {
    if (!slide || svg === liveSvg()) return;
    patchSlide(slide.id, { svg }, coalesce);
  }, [liveSvg, patchSlide, slide]);

  /** Wraps selected drawn artwork first, so it can be changed like any element. */
  const adopted = useCallback((): { svg: string; ids: string[] } => {
    const result = stageApi.current?.adopt(selection) ?? { svg: liveSvg(), ids: selection.filter((id) => !id.startsWith('raw:')) };
    if (result.ids.join() !== selection.join()) setSelection(result.ids);
    return result;
  }, [liveSvg, selection]);

  const infos = useMemo(() => listElements(slide?.svg ?? ''), [slide?.svg]);
  const selectedInfos = selection.map((id) => infos.find((info) => info.id === id)).filter((info): info is ElementInfo => Boolean(info));
  const selectedModels = selectedInfos.map((info) => info.model).filter((model): model is SlideElement => Boolean(model));
  const modelIds = selectedInfos.filter((info) => info.model).map((info) => info.id);

  const changeModels = useCallback((change: (model: SlideElement) => SlideElement, coalesce?: string): void => {
    if (modelIds.length === 0) return;
    commit(updateModels(liveSvg(), modelIds, change, { measure, refit: true }), coalesce);
  }, [commit, liveSvg, measure, modelIds]);

  const onRuns = (change: (run: TxRun) => TxRun): void => changeModels((model) => mapRuns(model, change));
  const onBodies = (change: (body: TxBody) => TxBody): void => changeModels((model) => mapBodies(model, change));

  const textStyle = useMemo(() => ({
    font: design.system.fonts.body,
    size: Math.max(14, design.system.type.body || 24),
    color: design.system.palette.text,
  }), [design.system]);

  const insertModel = (model: SlideElement, startEditing = false): void => {
    const result = insertElement(liveSvg(), model, { measure });
    commit(result.svg);
    setSelection([result.id]);
    if (startEditing) setEditing({ kind: 'model', topId: result.id, nestedId: result.id });
  };

  const insertText = (): void => {
    const w = canvas.width * 0.42;
    insertModel(textBoxModel({ x: (canvas.width - w) / 2, y: canvas.height * 0.42, w, h: textStyle.size * 1.6 }, 'Text', textStyle), true);
  };

  const insertShape = (kind: ShapeKind): void => {
    const palette = design.system.palette;
    const line = kind === 'line' || kind === 'arrow';
    const w = canvas.width * (line ? 0.22 : 0.18);
    const h = line ? 0 : kind === 'rightArrow' || kind === 'chevron' ? w * 0.5 : w * (kind === 'roundRect' || kind === 'rect' || kind === 'wedgeRoundRectCallout' ? 0.62 : 1);
    const model: ShapeElement = {
      k: 'shape',
      id: 'new',
      box: { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h },
      geom: { prst: kind === 'arrow' ? 'straightConnector1' : kind },
      fill: line ? { t: 'none' } : { t: 'solid', c: palette.primary },
      line: line ? { c: { t: 'solid', c: palette.text }, w: 2.5, ...(kind === 'arrow' ? { tail: { type: 'triangle', w: 'med' as const, len: 'med' as const } } : {}) } : null,
    };
    insertModel(model);
  };

  const pickPicture = async (): Promise<{ href: string; width: number; height: number } | null> => {
    const picked = await open({ multiple: false, defaultPath: workspacePath, filters: [{ name: 'Pictures', extensions: IMAGE_EXTENSIONS }] });
    if (typeof picked !== 'string') return null;
    try {
      const dataUrl = await invoke<string>('read_file_as_base64', { path: picked });
      const used = new Set<string>();
      const name = `${Date.now().toString(36)}-${assetName(picked, used)}`;
      await writeFileBytes(joinPath(deckDir, 'assets', name), base64ToBytes(dataUrl));
      const info = await pictureInfo(dataUrl).catch(() => ({ width: 800, height: 600 }));
      return { href: `assets/${name}`, width: info.width, height: info.height };
    } catch (error) {
      store().update(workspaceId, { error: `Could not add the picture: ${error instanceof Error ? error.message : String(error)}` });
      return null;
    }
  };

  const insertPicture = async (): Promise<void> => {
    const picture = await pickPicture();
    if (!picture) return;
    const scale = Math.min((canvas.width * 0.6) / picture.width, (canvas.height * 0.6) / picture.height, 1);
    const w = picture.width * scale;
    const h = picture.height * scale;
    const model: PictureElement = { k: 'pic', id: 'new', box: { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h }, href: picture.href, line: null };
    insertModel(model);
  };

  /** Replaces a picture element's image, cropped to fill its frame. */
  const replacePicture = async (id: string): Promise<void> => {
    const picture = await pickPicture();
    if (!picture) return;
    commit(updateModels(liveSvg(), [id], (model) => (model.k === 'pic' ? { ...model, href: picture.href, crop: coverCrop(picture.width, picture.height, model.box.w, model.box.h) } : model), { measure }));
  };

  const replaceDrawnImage = async (index: number): Promise<void> => {
    const picture = await pickPicture();
    if (picture) commit(setSvgImage(liveSvg(), index, picture.href));
  };

  const arrange = (how: Arrange): void => {
    const { svg, ids } = adopted();
    const order = how === 'back' || how === 'forward' ? [...ids].reverse() : ids;
    commit(order.reduce((current, id) => arrangeElement(current, id, how), svg));
  };

  const align = (how: AlignHow): void => {
    const { svg, ids } = adopted();
    const boxes = new Map(listElements(svg).filter((info) => ids.includes(info.id)).map((info) => [info.id, info.box] as const));
    if (boxes.size === 0) return;
    const all = [...boxes.values()];
    const area: Box = ids.length === 1
      ? { x: 0, y: 0, w: canvas.width, h: canvas.height }
      : { x: Math.min(...all.map((b) => b.x)), y: Math.min(...all.map((b) => b.y)), w: Math.max(...all.map((b) => b.x + b.w)) - Math.min(...all.map((b) => b.x)), h: Math.max(...all.map((b) => b.y + b.h)) - Math.min(...all.map((b) => b.y)) };
    const deltas = new Map<string, [number, number]>();
    if (how === 'hspace' || how === 'vspace') {
      const horizontal = how === 'hspace';
      const sorted = [...boxes.entries()].sort((a, b) => (horizontal ? a[1].x - b[1].x : a[1].y - b[1].y));
      const total = sorted.reduce((sum, [, b]) => sum + (horizontal ? b.w : b.h), 0);
      const gap = ((horizontal ? area.w : area.h) - total) / Math.max(1, sorted.length - 1);
      let cursor = horizontal ? area.x : area.y;
      for (const [id, b] of sorted) {
        deltas.set(id, horizontal ? [cursor - b.x, 0] : [0, cursor - b.y]);
        cursor += (horizontal ? b.w : b.h) + gap;
      }
    } else {
      for (const [id, b] of boxes) {
        const dx = how === 'left' ? area.x - b.x : how === 'center' ? area.x + area.w / 2 - (b.x + b.w / 2) : how === 'right' ? area.x + area.w - (b.x + b.w) : 0;
        const dy = how === 'top' ? area.y - b.y : how === 'middle' ? area.y + area.h / 2 - (b.y + b.h / 2) : how === 'bottom' ? area.y + area.h - (b.y + b.h) : 0;
        deltas.set(id, [dx, dy]);
      }
    }
    let next = svg;
    for (const [id, [dx, dy]] of deltas) next = moveElements(next, [id], dx, dy, { measure });
    commit(next);
  };

  const duplicate = (): void => {
    const { svg, ids } = adopted();
    if (!ids.length) return;
    const result = duplicateElements(svg, ids, PASTE_OFFSET, { measure });
    commit(result.svg);
    setSelection(result.ids);
  };

  const removeSelected = (): void => {
    const { svg, ids } = adopted();
    if (!ids.length) return;
    commit(deleteElements(svg, ids));
    setSelection([]);
  };

  const copySelected = (cut: boolean): void => {
    const { svg, ids } = adopted();
    if (!ids.length) return;
    elementClipboard = copyElements(svg, ids);
    if (cut) { commit(deleteElements(svg, ids)); setSelection([]); }
  };

  const paste = (): void => {
    if (!elementClipboard.length || !slide) return;
    const svg = liveSvg();
    const sameSlide = elementClipboard.every((markup) => {
      const id = markup.match(/data-el="([^"]+)"/)?.[1];
      return id && svg.includes(`data-el="${id}"`);
    });
    const result = pasteElements(svg, elementClipboard, sameSlide ? PASTE_OFFSET : 0, { measure });
    commit(result.svg);
    setSelection(result.ids);
  };

  const nudge = (dx: number, dy: number): void => {
    const { svg, ids } = adopted();
    if (!ids.length || !slide) return;
    commit(moveElements(svg, ids, dx, dy, { measure }), `nudge:${slide.id}`);
  };

  const setBox = (id: string, box: Box): void => commit(resizeElement(liveSvg(), id, box, { measure }));

  const background = slide?.svg ? backgroundColor(slide.svg) : null;

  const applyBackground = (color: string, everywhere = false): void => {
    if (everywhere) editSlides((slides) => slides.map((entry) => (entry.svg ? { ...entry, svg: setBackground(entry.svg, color) } : entry)));
    else if (slide) commit(setBackground(liveSvg(), color));
  };

  /** A new empty slide with the current slide's background and master artwork, and a title box ready to type into. */
  const addBlankSlide = (): void => {
    if (!slide) return;
    const base = blankSlide(slide.svg || '');
    const titleBox = textBoxModel({ x: canvas.width * 0.07, y: canvas.height * 0.08, w: canvas.width * 0.86, h: (design.system.type.title || 44) * 1.4 }, 'Title', { font: design.system.fonts.heading, size: design.system.type.title || 44, color: design.system.palette.text, bold: true });
    const inserted = insertElement(base || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}"><rect data-bg="1" x="0" y="0" width="${canvas.width}" height="${canvas.height}" fill="${design.system.palette.background}"/></svg>`, titleBox, { measure });
    const created: DesignedSlide = { id: newDesignedSlideId(), role: 'content', title: 'New slide', brief: '', density: 'dense', svg: inserted.svg, notes: '' };
    editSlides((list) => [...list.slice(0, selectedIndex + 1), created, ...list.slice(selectedIndex + 1)]);
    select([created.id]);
    window.setTimeout(() => {
      setSelection([inserted.id]);
      setEditing({ kind: 'model', topId: inserted.id, nestedId: inserted.id });
    }, 0);
  };

  // Theme ------------------------------------------------------------------------------------------

  const themeOptions = useMemo(() => {
    const options: Array<{ id: string; name: string; palette: DesignPalette; fonts: { heading: string; body: string } }> = [];
    if (design.origin) options.push({ id: 'original', name: 'Original', palette: design.origin.system.palette, fonts: design.origin.system.fonts });
    for (const theme of DECK_THEMES) {
      options.push({
        id: theme.id,
        name: theme.name,
        palette: { background: theme.palette.background, surface: theme.palette.surface, text: theme.palette.text, muted: theme.palette.muted, primary: theme.palette.accent1, secondary: theme.palette.accent2, accent: theme.palette.accent3 },
        fonts: { heading: theme.headingFont, body: theme.bodyFont },
      });
    }
    return options;
  }, [design.origin]);

  /** Recolours (and optionally re-fonts) every slide; one Undo restores the old look. */
  const applyTheme = (palette: DesignPalette, fonts: { heading: string; body: string } | null, name: string): void => {
    const from = design.system.palette;
    const color = paletteColorMap(from, palette);
    const oldHeading = design.system.fonts.heading.toLowerCase();
    const font = fonts ? (family: string): string => (family.toLowerCase() === oldHeading ? fonts.heading : fonts.body) : (family: string): string => family;
    // The new palette's text and background are its dark and light ink, whichever way round.
    const ink = contrast(palette.text, '#000000') < contrast(palette.background, '#000000') ? { dark: palette.text, light: palette.background } : { dark: palette.background, light: palette.text };
    void ensureFonts(fonts ? [fonts.heading, fonts.body] : []).then(() => {
      edit((current) => {
        if (!current.design) return current;
        const system = { ...current.design.system, palette, ...(fonts ? { fonts } : { name, dark: contrast(palette.background, '#000000') < 7 }) };
        return {
          ...current,
          design: {
            ...current.design,
            system,
            slides: current.design.slides.map((entry) => (entry.svg ? { ...entry, svg: applyThemeMap(entry.svg, { color, font, ink }, { measure }) } : entry)),
          },
        };
      });
      onToast(fonts ? 'Theme applied' : 'Colours applied', `${name} · every slide updated. Undo to go back.`);
    });
  };

  const [fontDraft, setFontDraft] = useState<{ heading: string; body: string } | null>(null);
  const fontChoices = useMemo(() => [...new Set([design.system.fonts.heading, design.system.fonts.body, ...slideFonts, ...SAFE_FONTS, ...EXTRA_FONTS])].filter(Boolean), [design.system.fonts.body, design.system.fonts.heading, slideFonts]);
  const palette = useMemo(() => [...new Set([...Object.values(design.system.palette), ...design.system.chartColors].map((color) => color.toUpperCase()))].slice(0, 12), [design.system.chartColors, design.system.palette]);

  // Deck pictures ------------------------------------------------------------------------------

  const deckPictures = design.attachments.filter((entry) => entry.kind === 'image');
  const placeable = placeablePictures(design.attachments);
  const [addingPictures, setAddingPictures] = useState(false);

  /** Copies pictures into the deck's assets and lists them as deck pictures the AI may place. */
  const addPictures = async (paths: string[]): Promise<void> => {
    const current = store().sessions[workspaceId]?.deck?.design;
    if (!current || paths.length === 0) return;
    const existing = current.attachments.filter((entry) => entry.kind === 'image');
    const room = MAX_DECK_PICTURES - existing.length;
    if (room <= 0) {
      onToast('Picture limit', `A deck takes up to ${MAX_DECK_PICTURES} pictures. Remove some first.`);
      return;
    }
    setAddingPictures(true);
    const used = new Set(existing.map((entry) => entry.path.split('/').pop()!.toLowerCase()));
    const added: DesignAttachment[] = [];
    try {
      for (const path of paths.slice(0, room)) {
        const dataUrl = await invoke<string>('read_file_as_base64', { path });
        const asset = `assets/${assetName(path, used)}`;
        await writeFileBytes(joinPath(deckDir, asset), base64ToBytes(dataUrl));
        const info = await pictureInfo(dataUrl).catch(() => null);
        added.push({ path: asset, name: fileName(path), kind: 'image', use: 'auto', ...(info ?? {}) });
      }
    } catch (error) {
      store().update(workspaceId, { error: `Could not add the picture: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setAddingPictures(false);
    }
    if (added.length === 0) return;
    edit((deckNow) => (deckNow.design ? { ...deckNow, design: { ...deckNow.design, attachments: [...deckNow.design.attachments, ...added] } } : deckNow));
    onToast(`${added.length} picture${added.length === 1 ? '' : 's'} added`, paths.length > room ? `The deck holds up to ${MAX_DECK_PICTURES}; the rest were skipped.` : 'Choose "Put pictures on the slides" to use them.');
  };

  const pickPictures = async (): Promise<void> => {
    const picked = await open({ multiple: true, defaultPath: workspacePath, filters: [{ name: 'Pictures', extensions: IMAGE_EXTENSIONS }] });
    if (picked) void addPictures(Array.isArray(picked) ? picked : [picked]);
  };

  const pickPictureFolder = async (): Promise<void> => {
    const picked = await open({ directory: true, defaultPath: workspacePath });
    if (typeof picked !== 'string') return;
    const { paths } = await scanFolderPictures(picked, MAX_DECK_PICTURES - deckPictures.length);
    if (paths.length === 0) onToast('No pictures found', `${fileName(picked)} has no PNG, JPEG, GIF or WebP pictures.`);
    else void addPictures(paths);
  };

  /** Takes a picture out of the deck's list (the file stays; slides that show it keep it). */
  const removePicture = (path: string): void => {
    edit((deckNow) => (deckNow.design ? {
      ...deckNow,
      design: {
        ...deckNow.design,
        attachments: deckNow.design.attachments.filter((entry) => entry.path !== path),
        slides: deckNow.design.slides.map((entry) => (entry.pictures?.includes(path) ? { ...entry, pictures: entry.pictures.filter((value) => value !== path) } : entry)),
      },
    } : deckNow));
  };

  const placePictures = (): void => {
    void generator.placePictures().then((count) => {
      if (count) onToast('Pictures placed', `${count} slide${count === 1 ? '' : 's'} redrawn with your pictures. Undo to go back.`);
    });
  };

  /** Adds or removes a deck picture from the pictures this slide shows when drawn. */
  const toggleSlidePicture = (path: string): void => {
    if (!slide) return;
    const current = slide.pictures ?? [];
    patchSlide(slide.id, { pictures: current.includes(path) ? current.filter((value) => value !== path) : [...current, path].slice(-4) });
  };

  // Keyboard -----------------------------------------------------------------------------------

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent): void => {
      if (document.querySelector('.pr-modal, .pr-show')) return;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)));
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 's' && !event.shiftKey) { event.preventDefault(); onSave(); return; }
      if (mod && key === 'e' && event.shiftKey) { event.preventDefault(); onExport(); return; }
      if (event.key === 'F5') { event.preventDefault(); onPresent(event.shiftKey ? selectedId : null); return; }
      if (typing || editing) return;
      if (mod && key === 'z' && !event.shiftKey) { event.preventDefault(); store().undo(workspaceId); return; }
      if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); store().redo(workspaceId); return; }
      if (mod && key === 'v' && elementClipboard.length) { event.preventDefault(); paste(); return; }
      if (mod && key === 'a' && slide) { event.preventDefault(); setSelection(listElements(liveSvg()).map((info) => info.id)); return; }

      // With elements selected, keys act on them.
      if (selection.length > 0) {
        const step = event.shiftKey ? NUDGE_BIG : NUDGE;
        if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); nudge(-step, 0); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); nudge(step, 0); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); nudge(0, -step); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); nudge(0, step); }
        else if (mod && key === 'd') { event.preventDefault(); duplicate(); }
        else if (mod && key === 'c') { event.preventDefault(); copySelected(false); }
        else if (mod && key === 'x') { event.preventDefault(); copySelected(true); }
        else if (event.key === 'Escape') { event.preventDefault(); setSelection([]); }
        else if ((event.key === 'Enter' || event.key === 'F2') && selection.length === 1) {
          const info = infos.find((entry) => entry.id === selection[0]);
          if (info?.model?.k === 'shape') { event.preventDefault(); setEditing({ kind: 'model', topId: info.id, nestedId: info.id }); }
        }
        return;
      }

      const slides = design.slides;
      if (mod && key === 'd' && selectedId) { event.preventDefault(); command('duplicate', selectedId); }
      else if (event.key === 'Delete' && selectedId) { event.preventDefault(); command('delete', selectedId); }
      else if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(event.key) && slides[selectedIndex + 1]) { event.preventDefault(); select([slides[selectedIndex + 1].id]); }
      else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key) && selectedIndex > 0) { event.preventDefault(); select([slides[selectedIndex - 1].id]); }
      else if (event.key === 'Escape') { setMenu(null); setStageMenu(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Render ---------------------------------------------------------------------------------------

  const counts = Object.values(status);
  const done = counts.filter((value) => value === 'done').length;
  const failedIds = Object.entries(status).filter(([, value]) => value === 'failed' || value === 'cancelled').map(([id]) => id).filter((id) => design.slides.some((entry) => entry.id === id && !entry.svg));
  const elapsed = run ? ((run.endedAt ?? now) - run.startedAt) / 1000 : 0;
  const reviewing = review && review.kind === 'replace' && review.slideId === slide?.id && review.status === 'ready' && review.proposal && !showBefore;
  const canvasSvg = reviewing ? review!.proposal!.svg : review?.kind === 'insert' && review.status === 'ready' && review.proposal ? review.proposal.svg : slide?.svg ?? '';
  const inserting = review?.kind === 'insert';
  const styleLabel = stylesIn(design.system.style).map((entry) => entry.label).join(' + ') || design.system.style;
  const menuSlide = menu ? design.slides.find((entry) => entry.id === menu.id) : null;
  const slideBusy = Boolean(slide && (status[slide.id] === 'writing' || status[slide.id] === 'queued'));
  const stageEditable = Boolean(slide?.svg) && !reviewing && !inserting && !slideBusy && !generating;
  const single = selectedInfos.length === 1 ? selectedInfos[0] : null;
  const singleModel = single?.model ?? null;
  const scale = stageWidth / canvas.width;
  void fontsReady;

  const selectionLabel = selection.length === 0 ? null : selection.length > 1 ? `${selection.length} selected` : single ? `${KIND_LABEL[single.kind] ?? 'Element'} · ${Math.round(single.box.w)} × ${Math.round(single.box.h)}` : 'Artwork';

  return (
    <div className="pr-shell pd-editor">
      <div className="pr-toolbar">
        <div className="pr-toolbar__group">
          <input className="pr-toolbar__title" value={deck.meta.title} aria-label="Presentation title" onChange={(event) => { const title = event.target.value; edit((current) => ({ ...current, meta: { ...current.meta, title } }), 'title'); }} onKeyDown={(event) => event.stopPropagation()} />
          <button type="button" className="pd-design-chip" onClick={() => setTab('design')} title={imported ? 'Theme colours and fonts' : design.system.concept}>
            <span className="pd-swatches" aria-hidden="true">
              {[design.system.palette.background, design.system.palette.primary, design.system.palette.secondary, design.system.palette.accent].map((color, index) => <span key={index} style={{ background: color }} />)}
            </span>
            {design.system.name}
          </button>
        </div>
        <div className="pr-toolbar__group">
          {generating && (
            <span className="pd-run">
              <span className="pd-run__dot" />
              {run?.phase === 'outline' ? 'Designing' : `Drawing slides · ${done} of ${counts.length}`} · {formatDuration(elapsed)}
              <button type="button" className="pr-btn pr-btn--sm" onClick={generator.cancel}><Stop size={12} weight="fill" /> Stop</button>
            </span>
          )}
          {!generating && failedIds.length > 0 && (
            <button type="button" className="pr-btn pr-btn--sm" onClick={() => void generator.drawSlides(failedIds)}><ArrowClockwise size={13} /> Draw {failedIds.length} unfinished</button>
          )}
          <button type="button" className="pr-icon-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={session.past.length === 0} onClick={() => store().undo(workspaceId)}><ArrowCounterClockwise size={15} /></button>
          <button type="button" className="pr-icon-btn" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={session.future.length === 0} onClick={() => store().redo(workspaceId)}><ArrowClockwise size={15} /></button>
          <span className="pr-toolbar__sep" />
          <button type="button" className="pr-btn pr-btn--sm" onClick={() => onPresent(null)} title="Present (F5)"><Play size={13} weight="fill" /> Present</button>
          <button type="button" className="pr-btn pr-btn--sm pr-btn--primary" onClick={onExport} title="Export (Ctrl+Shift+E)"><Export size={13} /> Export</button>
        </div>
      </div>

      {slide?.svg && (
        <FormatBar
          models={selectedModels}
          selectedCount={selection.length}
          editing={Boolean(editing)}
          editorRef={editorRef}
          scale={scale}
          palette={palette}
          fonts={fontChoices}
          background={background}
          onRuns={onRuns}
          onBodies={onBodies}
          onModels={(change) => changeModels(change)}
          onInsertText={insertText}
          onInsertPicture={() => void insertPicture()}
          onInsertShape={insertShape}
          onArrange={arrange}
          onAlign={align}
          onDuplicate={duplicate}
          onDelete={removeSelected}
          onBackground={(color) => applyBackground(color)}
        />
      )}

      <div className="pr-body">
        <aside className="pr-filmstrip" aria-label="Slides">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={design.slides.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
              <div className="pr-filmstrip__list">
                {design.slides.map((entry, index) => (
                  <Thumb
                    key={entry.id}
                    slide={entry}
                    index={index}
                    canvas={canvas}
                    selected={session.selectedIds.includes(entry.id) || (entry.id === selectedId)}
                    status={status[entry.id]}
                    resolveHref={resolveHref}
                    onSelect={onSelectThumb}
                    onContext={(id, event) => { event.preventDefault(); setMenu({ id, x: event.clientX, y: event.clientY }); }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {adding !== null ? (
            <div className="pd-add">
              <textarea
                className="pr-input pd-add__input"
                autoFocus
                value={adding}
                placeholder="What should the new slide show?"
                onChange={(event) => setAdding(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter' && !event.shiftKey && adding.trim()) { event.preventDefault(); void addSlide(adding.trim()); }
                  if (event.key === 'Escape') setAdding(null);
                }}
              />
              <div className="pd-add__actions">
                <button type="button" className="pr-btn pr-btn--sm" onClick={() => setAdding(null)}>Cancel</button>
                <button type="button" className="pr-btn pr-btn--sm pr-btn--primary" disabled={!adding.trim() || generating} onClick={() => void addSlide(adding.trim())}><Sparkle size={12} weight="fill" /> Design it</button>
              </div>
            </div>
          ) : (
            <div className="ps-addslide">
              <button type="button" className="pr-filmstrip__add" disabled={generating} onClick={addBlankSlide} title="A new slide with this slide's background">
                <Plus size={14} /> New slide
              </button>
              <button type="button" className="pr-icon-btn ps-addslide__ai" disabled={generating} aria-label="Describe a new slide to the AI" title="Describe a new slide and let the AI design it" onClick={() => setAdding('')}>
                <Sparkle size={14} weight="fill" />
              </button>
            </div>
          )}
        </aside>

        <div className="pr-center">
          <div
            className="pd-stage"
            ref={stageRef}
            onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelection([]); setStageMenu(null); } }}
            onContextMenu={(event) => {
              if (!stageEditable) return;
              event.preventDefault();
              setStageMenu({ x: event.clientX, y: event.clientY });
            }}
          >
            <div className="pd-stage__frame" data-review={reviewing || (inserting && review?.status === 'ready') || undefined}>
              {stageEditable && slide ? (
                <SlideStage
                  svg={slide.svg}
                  canvas={canvas}
                  width={stageWidth}
                  resolveHref={resolveHref}
                  measure={measure}
                  editable
                  selection={selection}
                  onSelection={(ids) => { setSelection(ids); setStageMenu(null); }}
                  onCommit={commit}
                  editing={editing}
                  onEditing={setEditing}
                  editorRef={editorRef}
                  textDefaults={textStyle}
                  apiRef={stageApi}
                  onPicture={(target) => { if (target.id) void replacePicture(target.id); else if (target.imageIndex !== undefined) void replaceDrawnImage(target.imageIndex); }}
                />
              ) : (
                <SvgSlide
                  svg={canvasSvg}
                  width={stageWidth}
                  canvas={canvas}
                  resolveHref={resolveHref}
                  placeholder={{ title: inserting ? 'New slide' : slide?.title ?? '', busy: slideBusy || review?.status === 'running', failed: slide ? status[slide.id] === 'failed' : false }}
                />
              )}
              {review && (review.kind === 'insert' || review.slideId === slide?.id) && (
                <div className="pd-review" data-status={review.status}>
                  {review.status === 'running' && (
                    <>
                      <span className="pd-run__dot" />
                      <span className="pd-review__text"><strong>{review.label}</strong> · {formatDuration(((run?.endedAt ?? now) - (run?.startedAt ?? now)) / 1000)}</span>
                      <button type="button" className="pr-btn pr-btn--sm" onClick={() => { generator.cancel(); setReview(null); }}><X size={12} /> Cancel</button>
                    </>
                  )}
                  {review.status === 'ready' && (
                    <>
                      <span className="pd-review__text"><strong>{review.kind === 'insert' ? 'New slide' : review.label}</strong> · {review.kind === 'insert' ? 'keep it to add it after this slide' : 'proposed change'}</span>
                      {review.kind === 'replace' && (
                        <button type="button" className="pr-btn pr-btn--sm" onMouseDown={() => setShowBefore(true)} onMouseUp={() => setShowBefore(false)} onMouseLeave={() => setShowBefore(false)} title="Hold to see the slide before the change">Hold for before</button>
                      )}
                      <button type="button" className="pr-btn pr-btn--sm" onClick={retryReview}><ArrowClockwise size={12} /> Try again</button>
                      <button type="button" className="pr-btn pr-btn--sm" onClick={() => setReview(null)}><X size={12} /> Discard</button>
                      <button type="button" className="pr-btn pr-btn--sm pr-btn--primary" onClick={acceptReview}><Check size={12} weight="bold" /> Keep</button>
                    </>
                  )}
                  {review.status === 'failed' && (
                    <>
                      <span className="pd-review__text pd-review__text--error">{review.error}</span>
                      <button type="button" className="pr-btn pr-btn--sm" onClick={retryReview}><ArrowClockwise size={12} /> Try again</button>
                      <button type="button" className="pr-btn pr-btn--sm" onClick={() => setReview(null)}><X size={12} /> Close</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {slide && (
            <div className="pr-notes" data-open={notesOpen || undefined}>
              <button type="button" className="pr-notes__head" onClick={() => setNotesOpen((value) => !value)}>
                <NotePencil size={13} /> Speaker notes {notesOpen ? <CaretDown size={11} /> : <CaretUp size={11} />}
              </button>
              {notesOpen && (
                <textarea
                  className="pr-notes__input"
                  value={slide.notes}
                  placeholder="What to say on this slide."
                  onKeyDown={(event) => event.stopPropagation()}
                  onChange={(event) => patchSlide(slide.id, { notes: event.target.value }, `notes:${slide.id}`)}
                />
              )}
            </div>
          )}
        </div>

        <aside className="pr-side">
          <div className="pr-side__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'format'} className="pr-side__tab" onClick={() => setTab('format')}><SlidersHorizontal size={12} /> Format</button>
            <button type="button" role="tab" aria-selected={tab === 'slide'} className="pr-side__tab" onClick={() => setTab('slide')}><Sparkle size={12} weight="fill" /> AI</button>
            <button type="button" role="tab" aria-selected={tab === 'design'} className="pr-side__tab" onClick={() => setTab('design')}><PaintBrush size={12} /> Design</button>
          </div>
          <div className="pr-side__scroll">
            {tab === 'format' && (
              slide ? (
                <div className="pd-panel">
                  {single ? (
                    <>
                      <section className="pd-section">
                        <div className="pd-section__head">
                          <span className="pr-label">{KIND_LABEL[single.kind] ?? 'Element'}</span>
                          {singleModel?.name && <span className="ps-name" title={singleModel.name}>{singleModel.name}</span>}
                        </div>
                        <div className="ps-grid">
                          <NumberField label="X" value={single.box.x} onCommit={(x) => setBox(single.id, { ...single.box, x })} />
                          <NumberField label="Y" value={single.box.y} onCommit={(y) => setBox(single.id, { ...single.box, y })} />
                          <NumberField label="W" value={single.box.w} onCommit={(w) => setBox(single.id, { ...single.box, w: Math.max(1, w) })} />
                          <NumberField label="H" value={single.box.h} onCommit={(h) => setBox(single.id, { ...single.box, h: Math.max(0, h) })} />
                          {singleModel && <NumberField label="Rotate" suffix="°" value={singleModel.rot ?? 0} onCommit={(rot) => changeModels((model) => ({ ...model, rot: ((rot % 360) + 360) % 360 || undefined }))} />}
                        </div>
                      </section>
                      {singleModel?.k === 'shape' && singleModel.tx && (
                        <section className="pd-section">
                          <span className="pr-label">Text box</span>
                          <div className="pd-segmented" role="radiogroup" aria-label="Vertical alignment">
                            {(['t', 'ctr', 'b'] as const).map((anc) => (
                              <button key={anc} type="button" role="radio" aria-checked={singleModel.tx!.anc === anc} onClick={() => onBodies((body) => ({ ...body, anc }))}>{anc === 't' ? 'Top' : anc === 'ctr' ? 'Middle' : 'Bottom'}</button>
                            ))}
                          </div>
                          <div className="pd-segmented" role="radiogroup" aria-label="When text does not fit">
                            {([['none', 'Do not autofit'], ['norm', 'Shrink text'], ['shape', 'Resize box']] as const).map(([fit, label]) => (
                              <button key={fit} type="button" role="radio" aria-checked={(singleModel.tx!.fit ?? 'none') === fit} onClick={() => onBodies((body) => ({ ...body, fit: fit === 'none' ? undefined : fit, fs: undefined, lr: undefined }))}>{label}</button>
                            ))}
                          </div>
                          <label className="ps-check">
                            <input type="checkbox" checked={singleModel.tx.wrap} onChange={(event) => onBodies((body) => ({ ...body, wrap: event.target.checked }))} />
                            Wrap text in the box
                          </label>
                        </section>
                      )}
                      {singleModel?.k === 'pic' && (
                        <section className="pd-section">
                          <span className="pr-label">Picture</span>
                          <div className="ps-row">
                            <button type="button" className="pr-btn pr-btn--sm" onClick={() => void replacePicture(single.id)}><ImageSquare size={13} /> Replace…</button>
                            {singleModel.crop && <button type="button" className="pr-btn pr-btn--sm" onClick={() => changeModels((model) => (model.k === 'pic' ? { ...model, crop: undefined } : model))}>Remove crop</button>}
                          </div>
                          <label className="ps-slider">
                            <span>Transparency</span>
                            <input type="range" min={0} max={90} step={5} value={Math.round((1 - (singleModel.alpha ?? 1)) * 100)} onChange={(event) => changeModels((model) => (model.k === 'pic' ? { ...model, alpha: 1 - Number(event.target.value) / 100 || undefined } : model), `alpha:${single.id}`)} />
                            <em>{Math.round((1 - (singleModel.alpha ?? 1)) * 100)}%</em>
                          </label>
                        </section>
                      )}
                      {singleModel?.k === 'shape' && (
                        <section className="pd-section">
                          <span className="pr-label">Effects</span>
                          <label className="ps-check">
                            <input type="checkbox" checked={Boolean(singleModel.shadow)} onChange={(event) => changeModels((model) => (model.k === 'shape' ? { ...model, shadow: event.target.checked ? { c: '#000000', a: 0.25, blur: 14, dx: 0, dy: 5 } : undefined } : model))} />
                            Soft shadow
                          </label>
                        </section>
                      )}
                      {!singleModel && <p className="pr-hint">Drawn artwork moves, resizes and arranges as one piece. Double-click its text to change the words.</p>}
                      <div className="ps-row">
                        <button type="button" className="pr-btn pr-btn--sm" onClick={duplicate}><CopySimple size={13} /> Duplicate</button>
                        <button type="button" className="pr-btn pr-btn--sm pr-btn--danger" onClick={removeSelected}><Trash size={13} /> Delete</button>
                      </div>
                    </>
                  ) : selection.length > 1 ? (
                    <section className="pd-section">
                      <span className="pr-label">{selection.length} items selected</span>
                      <p className="pr-hint">Drag to move them together, or use Arrange to line them up. Shift+click adds or removes an item.</p>
                      <div className="ps-row">
                        <button type="button" className="pr-btn pr-btn--sm" onClick={duplicate}><CopySimple size={13} /> Duplicate</button>
                        <button type="button" className="pr-btn pr-btn--sm pr-btn--danger" onClick={removeSelected}><Trash size={13} /> Delete</button>
                      </div>
                    </section>
                  ) : (
                    <>
                      <section className="pd-section">
                        <span className="pr-label">Slide {selectedIndex + 1}</span>
                        <label className="ps-color">
                          <span>Background</span>
                          <input type="color" value={background ?? '#FFFFFF'} onChange={(event) => applyBackground(event.target.value.toUpperCase())} />
                          <code>{background ?? 'picture or gradient'}</code>
                        </label>
                        <div className="ps-row">
                          <button type="button" className="pr-btn pr-btn--sm" disabled={!background} onClick={() => background && applyBackground(background, true)}>Use on every slide</button>
                          <button type="button" className="pr-btn pr-btn--sm" onClick={() => command('hide', slide.id)}>{slide.hidden ? <><Eye size={13} /> Show in slideshow</> : <><EyeSlash size={13} /> Hide in slideshow</>}</button>
                        </div>
                      </section>
                      <section className="pd-section">
                        <span className="pr-label">On this slide</span>
                        {infos.length === 0 ? (
                          <p className="pr-hint">Nothing yet. Add a text box, picture or shape from the bar above.</p>
                        ) : (
                          <div className="ps-layers">
                            {[...infos].reverse().map((info) => (
                              <button key={info.id} type="button" className="ps-layer" onClick={() => setSelection([info.id])}>
                                <Stack size={12} />
                                <span>{info.model?.k === 'shape' && info.model.tx ? info.model.tx.p.map((para) => para.r.map((r) => r.t).join('')).join(' ').slice(0, 60) || KIND_LABEL[info.kind] : info.model?.name || KIND_LABEL[info.kind] || 'Element'}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <p className="pr-hint">Click to select · drag to move · handles resize (Shift keeps the shape) · double-click text to type · arrows nudge · Ctrl+D duplicates.</p>
                      </section>
                    </>
                  )}
                </div>
              ) : <p className="pr-hint pd-panel">Select a slide.</p>
            )}

            {tab === 'slide' && (
              slide ? (
                <div className="pd-panel">
                  <div className="pd-ask">
                    <textarea
                      className="pd-ask__input"
                      value={instruction}
                      disabled={generating || review?.status === 'running'}
                      placeholder="Tell the AI what to change on this slide…"
                      onChange={(event) => setInstruction(event.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === 'Enter' && !event.shiftKey && instruction.trim()) { event.preventDefault(); void askAi(instruction.trim(), 'Your change'); }
                      }}
                    />
                    <button type="button" className="pr-icon-btn pd-ask__send" aria-label="Send" disabled={!instruction.trim() || generating || review?.status === 'running' || !slide.svg} onClick={() => void askAi(instruction.trim(), 'Your change')}><PaperPlaneRight size={15} weight="fill" /></button>
                  </div>
                  <div className="pd-chips">
                    {REFINE_ACTIONS.map((action) => (
                      <button key={action.id} type="button" className="pd-chip" disabled={generating || review?.status === 'running' || !slide.svg} title={action.instruction} onClick={() => void askAi(action.instruction, action.label)}>{action.label}</button>
                    ))}
                  </div>
                  {imported && <p className="pr-hint">Every AI change is a proposal: Keep it, or Discard to leave the slide exactly as it came from PowerPoint.</p>}

                  <section className="pd-section">
                    <div className="pd-section__head">
                      <span className="pr-label">What this slide says</span>
                      <button type="button" className="pr-btn pr-btn--sm" disabled={generating || !slide.brief.trim()} onClick={() => command('redraw', slide.id)} title="Let the AI draw the slide again from this brief (Undo brings the current one back)"><ArrowClockwise size={12} /> Draw again</button>
                    </div>
                    <textarea
                      className="pr-input pd-brief"
                      value={slide.brief}
                      placeholder="The content and idea of this slide. Edit it, then Draw again."
                      onKeyDown={(event) => event.stopPropagation()}
                      onChange={(event) => patchSlide(slide.id, { brief: event.target.value }, `brief:${slide.id}`)}
                    />
                  </section>

                  {placeable.length > 0 && (
                    <section className="pd-section">
                      <span className="pr-label">Pictures for this slide</span>
                      <p className="pr-hint">Pick the deck pictures this slide should show, then choose Draw again.</p>
                      <div className="pd-pictures">
                        {placeable.map((entry) => {
                          const chosen = slide.pictures?.includes(entry.path) ?? false;
                          return (
                            <button key={entry.path} type="button" className="pd-picture" data-selected={chosen || undefined} aria-pressed={chosen} title={entry.caption ?? entry.name} onClick={() => toggleSlidePicture(entry.path)}>
                              <img src={resolveHref(entry.path)} alt="" loading="lazy" />
                              {chosen && <span className="pd-picture__check" aria-hidden="true"><Check size={10} weight="bold" /></span>}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              ) : <p className="pr-hint pd-panel">Select a slide.</p>
            )}

            {tab === 'design' && (
              <div className="pd-panel">
                <section className="pd-section">
                  <span className="pr-label">Colours</span>
                  <p className="pr-hint">Recolours every slide; layouts and text stay. Undo brings the old colours back.</p>
                  <div className="ps-themes">
                    {themeOptions.map((option) => {
                      const current = option.palette.primary.toUpperCase() === design.system.palette.primary.toUpperCase() && option.palette.background.toUpperCase() === design.system.palette.background.toUpperCase();
                      return (
                        <button key={option.id} type="button" className="ps-theme" data-active={current || undefined} title={`${option.name} · ${option.fonts.heading} / ${option.fonts.body}`} onClick={() => applyTheme(option.palette, null, option.name)}>
                          <span className="ps-theme__card" style={{ background: option.palette.background }}>
                            <span className="ps-theme__bar" style={{ background: option.palette.primary }} />
                            <span className="ps-theme__line" style={{ background: option.palette.text }} />
                            <span className="ps-theme__line ps-theme__line--short" style={{ background: option.palette.muted }} />
                            <span className="ps-theme__dots">
                              {[option.palette.primary, option.palette.secondary, option.palette.accent].map((color, index) => <i key={index} style={{ background: color }} />)}
                            </span>
                          </span>
                          <span className="ps-theme__name">{option.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="pd-section">
                  <span className="pr-label">Fonts</span>
                  <div className="ps-fonts">
                    <label>
                      <span>Headings</span>
                      <select className="pr-select" value={(fontDraft ?? design.system.fonts).heading} onChange={(event) => setFontDraft({ ...(fontDraft ?? design.system.fonts), heading: event.target.value })}>
                        {fontChoices.map((family) => <option key={family} value={family}>{family}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Body</span>
                      <select className="pr-select" value={(fontDraft ?? design.system.fonts).body} onChange={(event) => setFontDraft({ ...(fontDraft ?? design.system.fonts), body: event.target.value })}>
                        {fontChoices.map((family) => <option key={family} value={family}>{family}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="pd-fonts" style={{ background: design.system.palette.background, color: design.system.palette.text }}>
                    <span style={{ fontFamily: `'${(fontDraft ?? design.system.fonts).heading}'`, color: design.system.palette.primary }}>Aa</span>
                    <span>
                      <strong style={{ fontFamily: `'${(fontDraft ?? design.system.fonts).heading}'` }}>{(fontDraft ?? design.system.fonts).heading}</strong>
                      <span style={{ fontFamily: `'${(fontDraft ?? design.system.fonts).body}'`, color: design.system.palette.muted }}>{(fontDraft ?? design.system.fonts).body}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="pr-btn pr-btn--sm pd-section__go"
                    disabled={!fontDraft || (fontDraft.heading === design.system.fonts.heading && fontDraft.body === design.system.fonts.body)}
                    onClick={() => { if (fontDraft) { applyTheme(design.system.palette, fontDraft, `${fontDraft.heading} / ${fontDraft.body}`); setFontDraft(null); } }}
                  >
                    Apply fonts to every slide
                  </button>
                  <p className="pr-hint">Text set in {design.system.fonts.heading} takes the heading font; all other text takes the body font.</p>
                </section>

                <section className="pd-section">
                  <span className="pr-label">Redesign with AI</span>
                  <p className="pr-hint">Same slides and content, a new look drawn by the AI. Every slide is redrawn; Undo brings the current look back.</p>
                  <textarea
                    className="pr-input pd-brief"
                    value={restyle}
                    placeholder="e.g. darker and more cinematic · warmer, like a magazine · use our brand green #0F7B5F"
                    onKeyDown={(event) => event.stopPropagation()}
                    onChange={(event) => setRestyle(event.target.value)}
                  />
                  <button
                    type="button"
                    className="pr-btn pr-btn--primary pd-section__go"
                    disabled={generating || review?.status === 'running'}
                    onClick={() => {
                      void generator.redesign(restyle.trim() || 'A clearly different, more striking look.').then((ok) => {
                        if (ok) onToast('New design', 'Every slide has been redrawn. Undo to go back.');
                      });
                      setRestyle('');
                    }}
                  >
                    <PaintBrush size={13} /> Redesign
                  </button>
                </section>

                {!imported && (
                  <section className="pd-system">
                    <div className="pd-system__head">
                      <span className="pd-system__name">{design.system.name}</span>
                      <span className="pd-system__style">{styleLabel} · {design.system.mode}</span>
                    </div>
                    <p className="pd-system__concept">{design.system.concept}</p>
                    <dl className="pd-system__facts">
                      <dt>Shapes</dt><dd>{design.system.shapeLanguage}</dd>
                      <dt>Motif</dt><dd>{design.system.motif}</dd>
                      <dt>Pictures</dt><dd>{design.system.imagery}</dd>
                    </dl>
                  </section>
                )}

                <section className="pd-section">
                  <div className="pd-section__head">
                    <span className="pr-label">Deck pictures{deckPictures.length > 0 ? ` · ${deckPictures.length}` : ''}</span>
                    <span className="pd-section__tools">
                      <button type="button" className="pr-icon-btn pr-icon-btn--xs" aria-label="Add pictures" title="Add pictures" disabled={addingPictures || deckPictures.length >= MAX_DECK_PICTURES} onClick={() => void pickPictures()}><Plus size={13} /></button>
                      <button type="button" className="pr-icon-btn pr-icon-btn--xs" aria-label="Add a folder of pictures" title="Add a folder of pictures (its subfolders too)" disabled={addingPictures || deckPictures.length >= MAX_DECK_PICTURES} onClick={() => void pickPictureFolder()}><FolderSimple size={13} /></button>
                    </span>
                  </div>
                  {deckPictures.length > 0 ? (
                    <div className="pd-pictures">
                      {deckPictures.map((entry) => (
                        <div key={entry.path} className="pd-picture pd-picture--static" title={entry.caption ? `${entry.name}\n${entry.caption}` : entry.name}>
                          <img src={resolveHref(entry.path)} alt="" loading="lazy" />
                          <button type="button" className="pd-picture__remove" aria-label={`Remove ${entry.name} from the deck's pictures`} title="Remove from the deck's pictures (slides that show it keep it)" onClick={() => removePicture(entry.path)}><X size={10} weight="bold" /></button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="pr-hint">Add photos, screenshots or a logo and the AI puts them on the slides that need them. To place one yourself, use Picture in the bar above.</p>
                  )}
                  {addingPictures && <p className="pr-hint">Adding pictures…</p>}
                  {placeable.length > 0 && (
                    <button type="button" className="pr-btn pr-btn--primary pd-section__go" disabled={generating || addingPictures || review?.status === 'running'} onClick={placePictures}>
                      <ImageSquare size={13} /> Put pictures on the slides
                    </button>
                  )}
                </section>

                <section className="pd-section">
                  <span className="pr-label">Slideshow</span>
                  <div className="pd-segmented" role="radiogroup" aria-label="Transition">
                    {(['fade', 'slide', 'none'] as SlideTransition[]).map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={deck.transition === value} onClick={() => edit((current) => ({ ...current, transition: value }))}>
                        {value === 'none' ? 'No transition' : value === 'fade' ? 'Fade' : 'Slide'}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="pd-section">
                  <span className="pr-label">AI for this deck</span>
                  <EnginePicker value={deck.brief.engine} onChange={(engine) => edit((current) => ({ ...current, brief: { ...current.brief, engine } }))} compact />
                </section>

                {imported ? (
                  <section className="pd-section">
                    <span className="pr-label">Source</span>
                    <p className="pd-original"><FileArrowUp size={12} /> {fileName(design.origin!.file)}</p>
                    <p className="pr-hint">The original file is never changed. Export → PowerPoint writes an editable copy.</p>
                  </section>
                ) : (
                  <section className="pd-section">
                    <span className="pr-label">Your brief</span>
                    <p className="pd-original">{design.prompt}</p>
                    {design.attachments.length > 0 && <p className="pr-hint">{design.attachments.map((entry) => entry.name).join(' · ')}</p>}
                  </section>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="pr-status">
        <span className="pr-status__item"><span className={`pr-status__dot${session.error ? ' is-error' : session.dirty || session.saving ? ' is-dirty' : ''}`} />{session.error ?? run?.error ?? (session.saving ? 'Saving…' : session.dirty ? 'Unsaved changes' : 'Saved')}</span>
        <span className="pr-status__item">Slide {selectedIndex + 1} of {design.slides.length}</span>
        {selectionLabel && <span className="pr-status__item">{selectionLabel}</span>}
        <span className="pr-status__spacer" />
        <span className="pr-status__item">{deck.size} · {design.system.fonts.heading} / {design.system.fonts.body}</span>
        <span className="pr-status__item">{deck.brief.engine.engine === 'claude' ? 'Claude Code' : deck.brief.engine.engine}{deck.brief.engine.model ? ` · ${deck.brief.engine.model}` : ''}</span>
      </div>

      {menu && menuSlide && createPortal(
        <>
          <div className="pr-menu-scrim" onMouseDown={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMenu(null); }} />
          <div className="pr-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.min(menu.y, window.innerHeight - 260) }}>
            <button type="button" role="menuitem" onClick={() => { select([menu.id]); setMenu(null); window.setTimeout(addBlankSlide, 0); }}><Plus size={13} /> New slide after</button>
            <button type="button" role="menuitem" onClick={() => { command('duplicate', menu.id); setMenu(null); }}><Copy size={13} /> Duplicate <kbd>Ctrl D</kbd></button>
            <button type="button" role="menuitem" onClick={() => { command('hide', menu.id); setMenu(null); }}>{menuSlide.hidden ? <Eye size={13} /> : <EyeSlash size={13} />} {menuSlide.hidden ? 'Show in slideshow' : 'Hide in slideshow'}</button>
            <button type="button" role="menuitem" onClick={() => { command('up', menu.id); setMenu(null); }}><ArrowUp size={13} /> Move up</button>
            <button type="button" role="menuitem" onClick={() => { command('down', menu.id); setMenu(null); }}><ArrowDown size={13} /> Move down</button>
            <button type="button" role="menuitem" disabled={generating || !menuSlide.brief.trim()} onClick={() => { command('redraw', menu.id); setMenu(null); }}><ArrowUUpLeft size={13} /> Redraw with AI</button>
            <hr />
            <button type="button" role="menuitem" className="is-danger" disabled={design.slides.length <= 1} onClick={() => { command('delete', menu.id); setMenu(null); }}><Trash size={13} /> Delete <kbd>Del</kbd></button>
          </div>
        </>,
        document.body,
      )}

      {stageMenu && createPortal(
        <>
          <div className="pr-menu-scrim" onMouseDown={() => setStageMenu(null)} onContextMenu={(event) => { event.preventDefault(); setStageMenu(null); }} />
          <div className="pr-menu" role="menu" style={{ left: Math.min(stageMenu.x, window.innerWidth - 220), top: Math.min(stageMenu.y, window.innerHeight - 320) }}>
            {selection.length > 0 ? (
              <>
                <button type="button" role="menuitem" onClick={() => { copySelected(true); setStageMenu(null); }}><Scissors size={13} /> Cut <kbd>Ctrl X</kbd></button>
                <button type="button" role="menuitem" onClick={() => { copySelected(false); setStageMenu(null); }}><Copy size={13} /> Copy <kbd>Ctrl C</kbd></button>
                <button type="button" role="menuitem" disabled={!elementClipboard.length} onClick={() => { paste(); setStageMenu(null); }}><ClipboardText size={13} /> Paste <kbd>Ctrl V</kbd></button>
                <button type="button" role="menuitem" onClick={() => { duplicate(); setStageMenu(null); }}><CopySimple size={13} /> Duplicate <kbd>Ctrl D</kbd></button>
                <hr />
                <button type="button" role="menuitem" onClick={() => { arrange('front'); setStageMenu(null); }}><SquaresFour size={13} /> Bring to front</button>
                <button type="button" role="menuitem" onClick={() => { arrange('back'); setStageMenu(null); }}><Stack size={13} /> Send to back</button>
                {single?.model?.k === 'shape' && <button type="button" role="menuitem" onClick={() => { setEditing({ kind: 'model', topId: single.id, nestedId: single.id }); setStageMenu(null); }}><NotePencil size={13} /> Edit text <kbd>Enter</kbd></button>}
                {single?.model?.k === 'pic' && <button type="button" role="menuitem" onClick={() => { void replacePicture(single.id); setStageMenu(null); }}><ImageSquare size={13} /> Replace picture…</button>}
                <hr />
                <button type="button" role="menuitem" className="is-danger" onClick={() => { removeSelected(); setStageMenu(null); }}><Trash size={13} /> Delete <kbd>Del</kbd></button>
              </>
            ) : (
              <>
                <button type="button" role="menuitem" disabled={!elementClipboard.length} onClick={() => { paste(); setStageMenu(null); }}><ClipboardText size={13} /> Paste <kbd>Ctrl V</kbd></button>
                <button type="button" role="menuitem" onClick={() => { insertText(); setStageMenu(null); }}><NotePencil size={13} /> Add a text box</button>
                <button type="button" role="menuitem" onClick={() => { void insertPicture(); setStageMenu(null); }}><ImageSquare size={13} /> Add a picture…</button>
                <hr />
                <button type="button" role="menuitem" onClick={() => { setSelection(infos.map((info) => info.id)); setStageMenu(null); }}><SquaresFour size={13} /> Select all <kbd>Ctrl A</kbd></button>
              </>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
};
