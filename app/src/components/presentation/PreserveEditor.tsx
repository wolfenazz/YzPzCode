import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ask } from '@tauri-apps/plugin-dialog';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowArcLeft, ArrowArcRight, ArrowDown, ArrowUp, Copy, Export, Eye, EyeSlash, FloppyDisk, MagicWand, Sparkle, TextT, Trash, Warning } from '@phosphor-icons/react';
import type { LoadedPresentation } from 'pptx-viewer';
import { usePresentationSessionStore, type PresentationSession } from '../../stores/presentationSessionStore';
import { readFileBytes, writeFileBytes } from '../../utils/presentation/assets';
import { openPptx } from '../../utils/presentation/pptxPackage';
import { applyPreserve, currentParagraphs, preserveSlideForAi, readPreserveInfo, type PreserveSlideInfo } from '../../utils/presentation/pptxPreserve';
import { PRESERVE_ACTIONS, type PreserveAiSlide, type SlideAction } from '../../utils/presentation/prompts';
import type { PreserveSlide, YzDeck } from '../../utils/presentation/types';
import { fileName, joinPath, slugify } from '../../utils/writing/document';
import type { EngineChoice } from '../../utils/writing/types';
import { DeckAiPanel } from './DeckAiPanel';
import { SlideReviewCard, type SlideReview } from './SlideReviewCard';
import type { useDeckGenerator } from './useDeckGenerator';

interface PreserveEditorProps {
  workspaceId: string;
  session: PresentationSession;
  deck: YzDeck;
  deckDir: string;
  visible: boolean;
  generator: ReturnType<typeof useDeckGenerator>;
  onExport: (write: (path: string) => Promise<void>) => void;
  onRebuild: (bytes: Uint8Array) => void;
  onToast: (title: string, description: string) => void;
}

const ROLE_LABEL: Record<string, string> = { title: 'Title', subtitle: 'Subtitle', body: 'Body', other: 'Text box' };
let copyCounter = 0;

function PreserveThumb({ slide, index, info, selected, svg, onSelect, onContext }: {
  slide: PreserveSlide;
  index: number;
  info: PreserveSlideInfo | undefined;
  selected: boolean;
  svg: SVGSVGElement | null;
  onSelect: () => void;
  onContext: (event: React.MouseEvent) => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.key });
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    element.replaceChildren();
    if (svg) element.appendChild(svg);
  }, [svg]);
  const edited = Object.keys(slide.text).length > 0 || slide.notes !== undefined;
  return (
    <div
      ref={setNodeRef}
      className="pr-thumb"
      data-selected={selected || undefined}
      data-hidden={slide.hidden || undefined}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onMouseDown={(event) => { if (event.button === 0) onSelect(); }}
      onContextMenu={onContext}
      {...attributes}
      {...listeners}
      aria-label={`Slide ${index + 1}`}
    >
      <span className="pr-thumb__num">{index + 1}</span>
      <div className="pr-thumb__frame pr-thumb__frame--svg">
        <div ref={holder} className="pr-thumb__svg" />
        {!svg && <span className="pr-thumb__title">{info?.title || 'Slide'}</span>}
        {slide.hidden && <span className="pr-thumb__badge" title="Hidden in the slideshow"><EyeSlash size={11} /></span>}
        {edited && <span className="pr-thumb__dot" title="Edited" />}
      </div>
    </div>
  );
}

export const PreserveEditor: React.FC<PreserveEditorProps> = ({ workspaceId, session, deck, deckDir, visible, generator, onExport, onRebuild, onToast }) => {
  const source = deck.source!;
  const store = usePresentationSessionStore.getState;
  const [original, setOriginal] = useState<Uint8Array | null>(null);
  const [infos, setInfos] = useState<Record<string, PreserveSlideInfo>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<LoadedPresentation | null>(null);
  const [thumbs, setThumbs] = useState<SVGSVGElement[]>([]);
  const [rendering, setRendering] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [review, setReview] = useState<(SlideReview & { keys: string[]; edits: PreserveAiSlide[]; request: { action: SlideAction; instruction?: string; scope: 'selected' | 'all' } }) | null>(null);
  const reviewApplied = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(900);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const slides = source.slides;
  const selectedKey = session.selectedIds.find((key) => slides.some((slide) => slide.key === key)) ?? slides[0]?.key ?? null;
  const selectedIndex = slides.findIndex((slide) => slide.key === selectedKey);
  const selected = selectedIndex >= 0 ? slides[selectedIndex] : null;
  const selectedInfo = selected ? infos[selected.source] : undefined;

  // The untouched original and what is in it.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const bytes = await readFileBytes(joinPath(deckDir, source.pptxFile));
        const pkg = await openPptx(bytes);
        const info = await readPreserveInfo(pkg);
        if (!alive) return;
        setOriginal(bytes);
        setInfos(info);
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => { alive = false; };
  }, [deckDir, source.pptxFile]);

  // Re-render the patched file shortly after each edit.
  useEffect(() => {
    if (!original) return;
    let alive = true;
    let loaded: LoadedPresentation | null = null;
    setRendering(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const bytes = await applyPreserve(original, slides);
          const { loadPresentation, getThumbnails } = await import('pptx-viewer');
          loaded = await loadPresentation(bytes);
          if (!alive) {
            loaded.cleanup();
            return;
          }
          setPresentation((previous) => {
            previous?.cleanup();
            return loaded;
          });
          setThumbs(getThumbnails(loaded, 168));
        } catch (error) {
          if (alive) store().update(workspaceId, { error: `Could not render the slides: ${error instanceof Error ? error.message : String(error)}` });
        } finally {
          if (alive) setRendering(false);
        }
      })();
    }, 380);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [original, slides, store, workspaceId]);

  useEffect(() => () => setPresentation((previous) => { previous?.cleanup(); return null; }), []);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setCanvasWidth(Math.max(320, Math.min(width - 48, (height - 48) * (16 / 9))));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const slideHolder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const holder = slideHolder.current;
    if (!holder || !presentation || selectedIndex < 0 || !visible) return;
    void import('pptx-viewer').then(({ renderSlideToElement }) => {
      holder.replaceChildren();
      try {
        renderSlideToElement(presentation, selectedIndex, holder, { width: canvasWidth });
      } catch (error) {
        console.warn('Could not draw the slide:', error);
      }
    });
  }, [canvasWidth, presentation, selectedIndex, visible]);

  const edit = useCallback((change: (slides: PreserveSlide[]) => PreserveSlide[], coalesce?: string): void => {
    store().edit(workspaceId, (current) => (current.source ? { ...current, source: { ...current.source, slides: change(current.source.slides) } } : current), coalesce ? { coalesce } : undefined);
  }, [store, workspaceId]);

  const select = (key: string): void => store().update(workspaceId, { selectedIds: [key], selectedSlot: null });

  const command = useCallback((name: 'duplicate' | 'delete' | 'hide' | 'up' | 'down', key: string): void => {
    edit((list) => {
      const index = list.findIndex((slide) => slide.key === key);
      if (index < 0) return list;
      const next = [...list];
      if (name === 'duplicate') {
        copyCounter += 1;
        const copy: PreserveSlide = { ...JSON.parse(JSON.stringify(list[index])) as PreserveSlide, key: `dup:${Date.now().toString(36)}${copyCounter}` };
        next.splice(index + 1, 0, copy);
        window.setTimeout(() => select(copy.key), 0);
      } else if (name === 'delete') {
        if (list.length <= 1) return list;
        next.splice(index, 1);
        window.setTimeout(() => select(next[Math.min(index, next.length - 1)].key), 0);
      } else if (name === 'hide') {
        next[index] = { ...next[index], hidden: !next[index].hidden };
      } else if (name === 'up' && index > 0) {
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
      } else if (name === 'down' && index < next.length - 1) {
        [next[index + 1], next[index]] = [next[index], next[index + 1]];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit]);

  // Keyboard: Del, Ctrl+D and the arrows on the slide list.
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!selectedKey || document.querySelector('.pr-modal, .pr-wizard')) return;
      if (event.key === 'Delete') { event.preventDefault(); command('delete', selectedKey); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); command('duplicate', selectedKey); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = slides[selectedIndex + (event.key === 'ArrowDown' ? 1 : -1)];
        if (next) select(next.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, selectedIndex, selectedKey, slides, visible]);

  const writePatched = useCallback(async (path: string): Promise<void> => {
    if (!original) throw new Error('The original file is still loading.');
    await writeFileBytes(path, await applyPreserve(original, store().sessions[workspaceId]?.deck?.source?.slides ?? slides));
  }, [original, slides, store, workspaceId]);

  const savePowerPoint = async (): Promise<void> => {
    try {
      const path = joinPath(deckDir, `${slugify(deck.meta.title)}.pptx`);
      await writePatched(path);
      onToast('Saved', fileName(path));
    } catch (error) {
      store().update(workspaceId, { error: `Could not save the PowerPoint file: ${error instanceof Error ? error.message : String(error)}` });
    }
  };

  const saveOverOriginal = async (): Promise<void> => {
    if (!source.originalPath || !original) return;
    const confirmed = await ask(`Replace ${fileName(source.originalPath)} with the edited presentation? A backup of the current file goes into the presentation's .history folder.`, { title: 'Save over the original', kind: 'warning', okLabel: 'Replace', cancelLabel: 'Cancel' });
    if (!confirmed) return;
    try {
      const current = await readFileBytes(source.originalPath).catch(() => original);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await writeFileBytes(joinPath(deckDir, '.history', `${fileName(source.originalPath).replace(/\.pptx$/i, '')}-${stamp}.pptx`), current);
      await writePatched(source.originalPath);
      onToast('Original replaced', `${fileName(source.originalPath)} · backup in .history`);
    } catch (error) {
      store().update(workspaceId, { error: `Could not replace the original: ${error instanceof Error ? error.message : String(error)}` });
    }
  };

  // AI ------------------------------------------------------------------------

  const runAction = useCallback(async (action: SlideAction, scope: 'selected' | 'all', instruction?: string): Promise<void> => {
    const keys = scope === 'all' ? slides.map((slide) => slide.key) : selectedKey ? [selectedKey] : [];
    const targets = keys.map((key) => slides.find((slide) => slide.key === key)).filter((slide): slide is PreserveSlide => Boolean(slide));
    const aiSlides = targets.map((slide) => preserveSlideForAi(infos[slide.source] ?? { part: slide.source, shapes: [], notes: '', notesEditable: false, hidden: false, title: '' }, slide));
    if (aiSlides.length === 0 || aiSlides.every((entry) => entry.shapes.length === 0 && action !== 'notes')) {
      store().update(workspaceId, { error: 'There is no text on the selected slide for the AI to work on.' });
      return;
    }
    const label = action === 'custom' ? 'Your instruction' : action[0].toUpperCase() + action.slice(1);
    const flatten = (entry: PreserveAiSlide): string => [...entry.shapes.map((shape) => shape.paragraphs.join('\n')), entry.notes ? `Notes: ${entry.notes}` : ''].filter(Boolean).join('\n\n');
    reviewApplied.current = false;
    setReview({ label, instruction, status: 'running', error: null, before: [], after: [], keys, edits: [], request: { action, instruction, scope } });
    const result = await generator.preserveAction({ action, slides: aiSlides, positions: targets.map((slide) => slides.indexOf(slide) + 1), total: slides.length, instruction });
    setReview((current) => current && ({
      ...current,
      status: result.ok ? 'done' : 'failed',
      error: result.ok ? null : result.cancelled ? 'Stopped.' : result.error,
      edits: result.after,
      beforeText: aiSlides.map(flatten),
      afterText: result.after.map(flatten),
    }));
  }, [generator, infos, selectedKey, slides, store, workspaceId]);

  const acceptReview = (): void => {
    if (!review) return;
    edit((list) => list.map((slide) => {
      const index = review.keys.indexOf(slide.key);
      if (index < 0) return slide;
      const edits = review.edits[index];
      if (!edits) return slide;
      const info = infos[slide.source];
      const text = { ...slide.text };
      for (const shape of edits.shapes) {
        const before = currentParagraphs(info, slide, shape.id);
        if (JSON.stringify(before) !== JSON.stringify(shape.paragraphs)) text[shape.id] = shape.paragraphs;
      }
      const notesChanged = edits.notes !== (slide.notes ?? info?.notes ?? '') && (info?.notesEditable ?? false);
      return { ...slide, text, ...(notesChanged ? { notes: edits.notes } : {}) };
    }));
    reviewApplied.current = true;
  };

  if (loadError) {
    return <div className="pr-empty-state"><Warning size={22} /> {loadError}</div>;
  }

  const outputIndex = (key: string): number => slides.findIndex((slide) => slide.key === key);

  return (
    <div className="pr-preserve">
      <div className="pr-toolbar" role="toolbar" aria-label="PowerPoint tools">
        <div className="pr-toolbar__group">
          <span className="pr-badge"><TextT size={12} /> Original design</span>
          <span className="pr-toolbar__name" title={source.originalPath}>{deck.meta.title}</span>
        </div>
        <div className="pr-toolbar__group">
          <button type="button" className="pr-icon-btn" title="Undo (Ctrl Z)" disabled={session.past.length === 0} onClick={() => store().undo(workspaceId)}><ArrowArcLeft size={15} /></button>
          <button type="button" className="pr-icon-btn" title="Redo (Ctrl Y)" disabled={session.future.length === 0} onClick={() => store().redo(workspaceId)}><ArrowArcRight size={15} /></button>
          <button type="button" className="pr-tool" title="Convert to an editable deck in a theme" disabled={!original} onClick={async () => { if (original) onRebuild(await applyPreserve(original, slides)); }}><MagicWand size={14} /> Rebuild in a theme</button>
          <button type="button" className="pr-tool" title={`Write ${slugify(deck.meta.title)}.pptx in the presentation folder`} disabled={!original} onClick={() => void savePowerPoint()}><FloppyDisk size={14} /> Save PowerPoint</button>
          {source.originalPath && <button type="button" className="pr-tool" disabled={!original} onClick={() => void saveOverOriginal()}>Save over original</button>}
          <button type="button" className="pr-icon-btn" data-active={aiOpen || undefined} title="AI presenter" onClick={() => setAiOpen((value) => !value)}><Sparkle size={15} weight={aiOpen ? 'fill' : 'regular'} /></button>
          <button type="button" className="pr-btn pr-btn--primary pr-btn--sm" disabled={!original} onClick={() => onExport(writePatched)}><Export size={14} /> Export</button>
        </div>
      </div>

      <div className="pr-body">
        <aside className="pr-filmstrip" aria-label="Slides">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            edit((list) => arrayMove(list, list.findIndex((slide) => slide.key === active.id), list.findIndex((slide) => slide.key === over.id)));
          }}>
            <SortableContext items={slides.map((slide) => slide.key)} strategy={verticalListSortingStrategy}>
              <div className="pr-filmstrip__list">
                {slides.map((slide, index) => (
                  <PreserveThumb
                    key={slide.key}
                    slide={slide}
                    index={index}
                    info={infos[slide.source]}
                    selected={slide.key === selectedKey}
                    svg={thumbs[outputIndex(slide.key)] ?? null}
                    onSelect={() => select(slide.key)}
                    onContext={(event) => { event.preventDefault(); setMenu({ key: slide.key, x: event.clientX, y: event.clientY }); }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </aside>

        <div className="pr-center">
          <div ref={canvasRef} className="pr-canvas pr-canvas--pptx" data-rendering={rendering || undefined}>
            <div className="pr-canvas__inner">
              <div className="pr-canvas__slide">
                <div ref={slideHolder} className="pr-pptx-slide" style={{ width: canvasWidth }} />
              </div>
            </div>
          </div>
        </div>

        <aside className="pr-side">
          <div className="pr-side__tabs">
            <span className="pr-label">Slide text</span>
          </div>
          <div className="pr-side__scroll">
            {selected && selectedInfo ? (
              <div className="pr-shapes">
                {selectedInfo.shapes.length === 0 && <p className="pr-hint">This slide has no editable text (pictures, charts or grouped artwork only).</p>}
                {selectedInfo.shapes.map((shape) => {
                  const value = currentParagraphs(selectedInfo, selected, shape.id).map((text) => text.replace(/\n/g, ' ')).join('\n');
                  return (
                    <label key={shape.id} className="pr-field">
                      <span className="pr-field__label">{ROLE_LABEL[shape.role]}{shape.name ? ` · ${shape.name}` : ''}{selected.text[shape.id] ? ' · edited' : ''}</span>
                      <textarea
                        className="pr-input"
                        rows={Math.min(8, Math.max(shape.role === 'title' ? 1 : 2, value.split('\n').length))}
                        value={value}
                        onKeyDown={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          const paragraphs = event.target.value.split('\n');
                          edit((list) => list.map((slide) => (slide.key === selected.key ? { ...slide, text: { ...slide.text, [shape.id]: paragraphs } } : slide)), `text:${selected.key}:${shape.id}`);
                        }}
                      />
                    </label>
                  );
                })}
                <label className="pr-field">
                  <span className="pr-field__label">Speaker notes{selected.notes !== undefined ? ' · edited' : ''}</span>
                  <textarea
                    className="pr-input"
                    rows={5}
                    disabled={!selectedInfo.notesEditable}
                    placeholder={selectedInfo.notesEditable ? 'What to say on this slide' : 'This file has no notes master, so notes cannot be added.'}
                    value={selected.notes ?? selectedInfo.notes}
                    onKeyDown={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const notes = event.target.value;
                      edit((list) => list.map((slide) => (slide.key === selected.key ? { ...slide, notes } : slide)), `notes:${selected.key}`);
                    }}
                  />
                </label>
                {(Object.keys(selected.text).length > 0 || selected.notes !== undefined) && (
                  <button type="button" className="pr-btn pr-btn--sm" onClick={() => edit((list) => list.map((slide) => (slide.key === selected.key ? { key: slide.key, source: slide.source, hidden: slide.hidden, text: {} } : slide)))}>
                    Revert this slide's text
                  </button>
                )}
              </div>
            ) : (
              <p className="pr-hint">{original ? 'Select a slide.' : 'Opening the presentation…'}</p>
            )}
            {aiOpen && (
              <DeckAiPanel
                deck={deck}
                run={session.run}
                selectedIds={selectedKey ? [selectedKey] : []}
                warnings={{}}
                actions={PRESERVE_ACTIONS}
                onAction={(action, scope, instruction) => void runAction(action, scope, instruction)}
                onFix={() => undefined}
                onCancel={generator.cancel}
                onEngine={(engine: EngineChoice) => store().edit(workspaceId, (current) => ({ ...current, brief: { ...current.brief, engine } }))}
                onJump={select}
              />
            )}
          </div>
        </aside>
      </div>

      <div className="pr-status">
        <span className="pr-status__item"><span className={`pr-status__dot${session.error ? ' is-error' : session.dirty || session.saving ? ' is-dirty' : ''}`} />{session.error ?? (session.saving ? 'Saving…' : session.dirty ? 'Unsaved changes' : 'Saved')}</span>
        <span className="pr-status__item">Slide {selectedIndex + 1} of {slides.length}</span>
        <span className="pr-status__item">{fileName(source.originalPath || source.pptxFile)}</span>
        {rendering && <span className="pr-status__item">Updating preview…</span>}
      </div>

      {menu && createPortal(
        <>
          <div className="pr-menu-scrim" onMouseDown={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMenu(null); }} />
          <div className="pr-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 220) }}>
            <button type="button" role="menuitem" onClick={() => { command('duplicate', menu.key); setMenu(null); }}><Copy size={13} /> Duplicate <kbd>Ctrl D</kbd></button>
            <button type="button" role="menuitem" onClick={() => { command('hide', menu.key); setMenu(null); }}>{slides.find((slide) => slide.key === menu.key)?.hidden ? <Eye size={13} /> : <EyeSlash size={13} />} Show / hide</button>
            <button type="button" role="menuitem" onClick={() => { command('up', menu.key); setMenu(null); }}><ArrowUp size={13} /> Move up</button>
            <button type="button" role="menuitem" onClick={() => { command('down', menu.key); setMenu(null); }}><ArrowDown size={13} /> Move down</button>
            <hr />
            <button type="button" role="menuitem" className="is-danger" disabled={slides.length <= 1} onClick={() => { command('delete', menu.key); setMenu(null); }}><Trash size={13} /> Delete <kbd>Del</kbd></button>
          </div>
        </>,
        document.body,
      )}

      {review && (
        <SlideReviewCard
          review={review}
          context={null}
          resolveImage={() => ''}
          onAccept={acceptReview}
          onUndoAccept={() => { if (reviewApplied.current) store().undo(workspaceId); reviewApplied.current = false; }}
          onSettled={() => setReview(null)}
          onRetry={() => void runAction(review.request.action, review.request.scope, review.request.instruction)}
          onDiscard={() => { generator.cancel(); setReview(null); }}
        />
      )}
    </div>
  );
};

