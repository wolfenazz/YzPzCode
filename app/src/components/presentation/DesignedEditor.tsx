import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowDown, ArrowUp, ArrowUUpLeft, CaretDown, CaretUp, Check, Copy, Export, Eye, EyeSlash,
  ImageSquare, NotePencil, PaintBrush, PaperPlaneRight, Play, Plus, Sparkle, Stop, Trash, X,
} from '@phosphor-icons/react';
import type { PresentationSession } from '../../stores/presentationSessionStore';
import { usePresentationSessionStore } from '../../stores/presentationSessionStore';
import { newDesignedSlideId, REFINE_ACTIONS } from '../../utils/presentation/designPrompts';
import { designCanvas, stylesIn } from '../../utils/presentation/designStyles';
import type { DesignedSlide } from '../../utils/presentation/designTypes';
import { isAbsolutePath, readFileBytes, writeFileBytes } from '../../utils/presentation/assets';
import { formatDuration } from '../../utils/presentation/timing';
import { setSvgImage, setSvgText, svgImageItems, svgTextItems } from '../../utils/presentation/svgText';
import type { SlideRunStatus, SlideTransition, YzDeck } from '../../utils/presentation/types';
import { fileName, joinPath } from '../../utils/writing/document';
import { localFileUrl } from '../../utils/mediaFiles';
import { IMAGE_EXTENSIONS } from './designAssets';
import { EnginePicker } from './EnginePicker';
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

export const DesignedEditor: React.FC<DesignedEditorProps> = ({ workspaceId, workspacePath, session, deck, deckDir, visible, generator, onSave, onExport, onPresent, onToast }) => {
  const design = deck.design!;
  const canvas = designCanvas(deck.size);
  const store = usePresentationSessionStore.getState;
  const run = session.run;
  const status = run?.slideStatus ?? {};
  const selectedId = session.selectedIds[session.selectedIds.length - 1] ?? design.slides[0]?.id ?? null;
  const selectedIndex = design.slides.findIndex((slide) => slide.id === selectedId);
  const slide = selectedIndex >= 0 ? design.slides[selectedIndex] : null;
  const generating = run?.phase === 'slides' || run?.phase === 'outline';

  const [tab, setTab] = useState<'slide' | 'design'>('slide');
  const [instruction, setInstruction] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [selectedText, setSelectedText] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(true);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [restyle, setRestyle] = useState('');
  const [now, setNow] = useState(Date.now());
  const textRefs = useRef(new Map<number, HTMLTextAreaElement>());
  const [stageRef, stageWidth] = useFit(canvas.width / canvas.height);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    if (!generating && review?.status !== 'running') return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [generating, review?.status]);

  useEffect(() => { setSelectedText(null); setShowBefore(false); }, [selectedId]);

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

  // Direct edits ------------------------------------------------------------------------------

  const textItems = useMemo(() => (slide?.svg ? svgTextItems(slide.svg) : []), [slide?.svg]);
  const imageItems = useMemo(() => (slide?.svg ? svgImageItems(slide.svg) : []), [slide?.svg]);

  const setText = (index: number, value: string): void => {
    if (!slide) return;
    patchSlide(slide.id, { svg: setSvgText(slide.svg, index, value.split('\n')) }, `text:${slide.id}:${index}`);
  };

  const replaceImage = async (index: number): Promise<void> => {
    if (!slide) return;
    const picked = await open({ multiple: false, defaultPath: workspacePath, filters: [{ name: 'Pictures', extensions: IMAGE_EXTENSIONS }] });
    if (typeof picked !== 'string') return;
    try {
      const name = `${Date.now().toString(36)}-${fileName(picked).replace(/[^\w.-]+/g, '-')}`;
      await writeFileBytes(joinPath(deckDir, 'assets', name), await readFileBytes(picked));
      const current = store().sessions[workspaceId]?.deck?.design?.slides.find((entry) => entry.id === slide.id);
      if (current) patchSlide(slide.id, { svg: setSvgImage(current.svg, index, `assets/${name}`) });
    } catch (error) {
      store().update(workspaceId, { error: `Could not add the picture: ${error instanceof Error ? error.message : String(error)}` });
    }
  };

  const focusText = (index: number): void => {
    setTab('slide');
    setSelectedText(index);
    window.setTimeout(() => {
      const field = textRefs.current.get(index);
      field?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      field?.focus();
    }, 30);
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
      if (typing) return;
      const slides = design.slides;
      if (mod && key === 'z' && !event.shiftKey) { event.preventDefault(); store().undo(workspaceId); }
      else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); store().redo(workspaceId); }
      else if (mod && key === 'd' && selectedId) { event.preventDefault(); command('duplicate', selectedId); }
      else if (event.key === 'Delete' && selectedId) { event.preventDefault(); command('delete', selectedId); }
      else if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(event.key) && slides[selectedIndex + 1]) { event.preventDefault(); select([slides[selectedIndex + 1].id]); }
      else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key) && selectedIndex > 0) { event.preventDefault(); select([slides[selectedIndex - 1].id]); }
      else if (event.key === 'Escape') { setSelectedText(null); setMenu(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [command, design.slides, onExport, onPresent, onSave, select, selectedId, selectedIndex, store, visible, workspaceId]);

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

  return (
    <div className="pr-shell pd-editor">
      <div className="pr-toolbar">
        <div className="pr-toolbar__group">
          <input className="pr-toolbar__title" value={deck.meta.title} aria-label="Presentation title" onChange={(event) => { const title = event.target.value; edit((current) => ({ ...current, meta: { ...current.meta, title } }), 'title'); }} onKeyDown={(event) => event.stopPropagation()} />
          <button type="button" className="pd-design-chip" onClick={() => setTab('design')} title={design.system.concept}>
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
          <button type="button" className="pr-btn pr-btn--sm" onClick={() => onPresent(null)} title="Present (F5)"><Play size={13} weight="fill" /> Present</button>
          <button type="button" className="pr-btn pr-btn--sm pr-btn--primary" onClick={onExport} title="Export (Ctrl+Shift+E)"><Export size={13} /> Export</button>
        </div>
      </div>

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
            <button type="button" className="pr-filmstrip__add" disabled={generating} onClick={() => setAdding('')}>
              <Plus size={14} /> New slide
            </button>
          )}
        </aside>

        <div className="pr-center">
          <div className="pd-stage" ref={stageRef} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedText(null); }}>
            <div className="pd-stage__frame" data-review={reviewing || (inserting && review?.status === 'ready') || undefined}>
              <SvgSlide
                svg={canvasSvg}
                width={stageWidth}
                canvas={canvas}
                resolveHref={resolveHref}
                placeholder={{ title: inserting ? 'New slide' : slide?.title ?? '', busy: slideBusy || review?.status === 'running', failed: slide ? status[slide.id] === 'failed' : false }}
                interactive={!reviewing && !inserting}
                selectedText={selectedText}
                onText={focusText}
                onImage={(index) => void replaceImage(index)}
                onBackground={() => setSelectedText(null)}
              />
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
            <button type="button" role="tab" aria-selected={tab === 'slide'} className="pr-side__tab" onClick={() => setTab('slide')}><Sparkle size={12} weight="fill" /> This slide</button>
            <button type="button" role="tab" aria-selected={tab === 'design'} className="pr-side__tab" onClick={() => setTab('design')}><PaintBrush size={12} /> Design</button>
          </div>
          <div className="pr-side__scroll">
            {tab === 'slide' ? (
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

                  <section className="pd-section">
                    <div className="pd-section__head">
                      <span className="pr-label">What this slide says</span>
                      <button type="button" className="pr-btn pr-btn--sm" disabled={generating} onClick={() => command('redraw', slide.id)} title="Draw the slide again from this brief"><ArrowClockwise size={12} /> Draw again</button>
                    </div>
                    <textarea
                      className="pr-input pd-brief"
                      value={slide.brief}
                      placeholder="The content and idea of this slide. Edit it, then Draw again."
                      onKeyDown={(event) => event.stopPropagation()}
                      onChange={(event) => patchSlide(slide.id, { brief: event.target.value }, `brief:${slide.id}`)}
                    />
                  </section>

                  {textItems.length > 0 && (
                    <section className="pd-section">
                      <span className="pr-label">Text on the slide</span>
                      <p className="pr-hint">Click text on the slide to jump to it. Each line here is a line on the slide.</p>
                      {textItems.map((item) => (
                        <textarea
                          key={`${slide.id}-${item.index}`}
                          ref={(element) => { if (element) textRefs.current.set(item.index, element); else textRefs.current.delete(item.index); }}
                          className="pr-input pd-text"
                          data-selected={selectedText === item.index || undefined}
                          data-strong={item.bold || item.fontSize >= design.system.type.title * 0.9 || undefined}
                          rows={Math.max(1, item.lines.length)}
                          value={item.lines.join('\n')}
                          onFocus={() => setSelectedText(item.index)}
                          onKeyDown={(event) => event.stopPropagation()}
                          onChange={(event) => setText(item.index, event.target.value)}
                        />
                      ))}
                    </section>
                  )}

                  {imageItems.length > 0 && (
                    <section className="pd-section">
                      <span className="pr-label">Pictures</span>
                      <div className="pd-pictures">
                        {imageItems.map((item) => (
                          <button key={item.index} type="button" className="pd-picture" onClick={() => void replaceImage(item.index)} title="Replace this picture">
                            {item.href ? <img src={resolveHref(item.href)} alt="" /> : <ImageSquare size={20} />}
                            <span>Replace</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ) : <p className="pr-hint pd-panel">Select a slide.</p>
            ) : (
              <div className="pd-panel">
                <section className="pd-system">
                  <div className="pd-system__head">
                    <span className="pd-system__name">{design.system.name}</span>
                    <span className="pd-system__style">{styleLabel} · {design.system.mode}</span>
                  </div>
                  <p className="pd-system__concept">{design.system.concept}</p>
                  <div className="pd-palette">
                    {(Object.entries(design.system.palette) as Array<[string, string]>).map(([role, color]) => (
                      <span key={role} className="pd-palette__swatch" title={`${role} ${color}`}>
                        <span style={{ background: color }} />
                        <small>{role}</small>
                      </span>
                    ))}
                  </div>
                  <div className="pd-fonts" style={{ background: design.system.palette.background, color: design.system.palette.text }}>
                    <span style={{ fontFamily: `'${design.system.fonts.heading}'`, color: design.system.palette.primary }}>Aa</span>
                    <span>
                      <strong style={{ fontFamily: `'${design.system.fonts.heading}'` }}>{design.system.fonts.heading}</strong>
                      <span style={{ fontFamily: `'${design.system.fonts.body}'`, color: design.system.palette.muted }}>{design.system.fonts.body}</span>
                    </span>
                  </div>
                  <dl className="pd-system__facts">
                    <dt>Shapes</dt><dd>{design.system.shapeLanguage}</dd>
                    <dt>Motif</dt><dd>{design.system.motif}</dd>
                    <dt>Pictures</dt><dd>{design.system.imagery}</dd>
                  </dl>
                </section>

                <section className="pd-section">
                  <span className="pr-label">Redesign the whole deck</span>
                  <p className="pr-hint">Same slides and content, a new look. Every slide is redrawn; Undo brings the old look back.</p>
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

                <section className="pd-section">
                  <span className="pr-label">Your brief</span>
                  <p className="pd-original">{design.prompt}</p>
                  {design.attachments.length > 0 && <p className="pr-hint">{design.attachments.map((entry) => entry.name).join(' · ')}</p>}
                </section>
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="pr-status">
        <span className="pr-status__item"><span className={`pr-status__dot${session.error ? ' is-error' : session.dirty || session.saving ? ' is-dirty' : ''}`} />{session.error ?? run?.error ?? (session.saving ? 'Saving…' : session.dirty ? 'Unsaved changes' : 'Saved')}</span>
        <span className="pr-status__item">Slide {selectedIndex + 1} of {design.slides.length}</span>
        <span className="pr-status__item">{deck.size} · {design.system.fonts.heading} / {design.system.fonts.body}</span>
        <span className="pr-status__spacer" />
        <span className="pr-status__item">{deck.brief.engine.engine === 'claude' ? 'Claude Code' : deck.brief.engine.engine}{deck.brief.engine.model ? ` · ${deck.brief.engine.model}` : ''}</span>
      </div>

      {menu && menuSlide && createPortal(
        <>
          <div className="pr-menu-scrim" onMouseDown={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMenu(null); }} />
          <div className="pr-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.min(menu.y, window.innerHeight - 260) }}>
            <button type="button" role="menuitem" disabled={generating} onClick={() => { command('redraw', menu.id); setMenu(null); }}><ArrowUUpLeft size={13} /> Draw again</button>
            <button type="button" role="menuitem" onClick={() => { command('duplicate', menu.id); setMenu(null); }}><Copy size={13} /> Duplicate <kbd>Ctrl D</kbd></button>
            <button type="button" role="menuitem" onClick={() => { command('hide', menu.id); setMenu(null); }}>{menuSlide.hidden ? <Eye size={13} /> : <EyeSlash size={13} />} {menuSlide.hidden ? 'Show in slideshow' : 'Hide in slideshow'}</button>
            <button type="button" role="menuitem" onClick={() => { command('up', menu.id); setMenu(null); }}><ArrowUp size={13} /> Move up</button>
            <button type="button" role="menuitem" onClick={() => { command('down', menu.id); setMenu(null); }}><ArrowDown size={13} /> Move down</button>
            <hr />
            <button type="button" role="menuitem" className="is-danger" disabled={design.slides.length <= 1} onClick={() => { command('delete', menu.id); setMenu(null); }}><Trash size={13} /> Delete <kbd>Del</kbd></button>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
};
