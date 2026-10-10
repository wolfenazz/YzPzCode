import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { BookmarkSimple, CaretDown, CaretUp, Minus, NotePencil, Plus, Sparkle, Warning, X } from '@phosphor-icons/react';
import SwipeToast from '../reactbits/SwipeToast';
import { useAppStore } from '../../stores/appStore';
import { selectPresentationSession, usePresentationSessionStore } from '../../stores/presentationSessionStore';
import { usePresentationStore } from '../../stores/presentationStore';
import { slideTitle as titleOfSlide } from '../../utils/presentation/deck';
import { downloadStockImage, stockCredit, type StockImage } from '../../utils/presentation/stockImages';
import { templateFromDeck } from '../../utils/presentation/templates';
import { notesBudget, slideSeconds } from '../../utils/presentation/timing';
import { isAbsolutePath, readFileBytes, writeFileBytes } from '../../utils/presentation/assets';
import { ASSETS_FOLDER, createBrief, createDeck, duplicateSlide } from '../../utils/presentation/deck';
import { getLayout, PX_PER_IN, SLIDE_HEIGHT, slideWidth } from '../../utils/presentation/layouts';
import { openPptx } from '../../utils/presentation/pptxPackage';
import type { DeckPass, SlideAction } from '../../utils/presentation/prompts';
import type { PlanContext } from '../../utils/presentation/render';
import { changeLayout, emptySlide } from '../../utils/presentation/sanitize';
import { newDesignedSlideId } from '../../utils/presentation/designPrompts';
import { assetName } from '../../utils/presentation/designPictures';
import { designCanvas } from '../../utils/presentation/designStyles';
import type { DesignAttachment, DesignedSlide, DesignSystem } from '../../utils/presentation/designTypes';
import type { ImportedTheme } from '../../utils/presentation/pptxRender';
import { svgPlainText } from '../../utils/presentation/svgText';
import type { Block, LayoutId, RichPara, Slide, YzDeck } from '../../utils/presentation/types';
import { fileName, joinPath, parentPath } from '../../utils/writing/document';
import { localFileUrl } from '../../utils/mediaFiles';
import type { WorkspaceConfig } from '../../types';
import { DeckAiPanel } from './DeckAiPanel';
import { DeckToolbar, type InsertKind } from './DeckToolbar';
import { pictureInfo, picturesToShow } from './designAssets';
import { DesignComposer, type ComposerInput } from './DesignComposer';
import { DesignedEditor } from './DesignedEditor';
import { DesignedExportDialog } from './DesignedExportDialog';
import { ExportDialog } from './ExportDialog';
import { Filmstrip, type SlideCommand } from './Filmstrip';
import { ImportDialog } from './ImportDialog';
import { ensureFonts, measureSlideText, pptxFontFamilies } from './deckFonts';
import { PreserveEditor } from './PreserveEditor';
import { PresenterMode } from './PresenterMode';
import { StockImagePicker } from './StockImagePicker';
import { ThemeEditor } from './ThemeEditor';
import { SlideCanvas } from './SlideCanvas';
import { SlideRenderer } from './SlideRenderer';
import { SlideReviewCard, type SlideReview } from './SlideReviewCard';
import { SlotInspector } from './SlotInspector';
import { SvgSlide } from './SvgSlide';
import { useDeckDocument } from './useDeckDocument';
import { useDeckGenerator, type GenerationTarget } from './useDeckGenerator';
import { storySlides, useDesignGenerator } from './useDesignGenerator';
import './presentation.css';
import './design.css';

interface PresentationWorkspaceProps {
  workspace: WorkspaceConfig;
  visible: boolean;
}

interface Toast {
  title: string;
  description: string;
}

/** The smallest font scale the design check uses before it warns. */
const MIN_FIT = 0.7;
const FIT_STEP = 0.06;
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];

const ACTION_LABELS: Record<SlideAction, string> = {
  rewrite: 'Rewrite',
  shorten: 'Shorten',
  expand: 'Expand',
  layout: 'Change layout',
  visualize: 'Chart or table',
  notes: 'Speaker notes',
  translate: 'Translate',
  consistency: 'Make consistent',
  coach: 'Coach the notes',
  imagePrompts: 'Image prompts',
  custom: 'Your instruction',
};

const replaceSlide = (deck: YzDeck, id: string, change: (slide: Slide) => Slide): YzDeck => ({
  ...deck,
  slides: deck.slides.map((slide) => (slide.id === id ? change(slide) : slide)),
});

const withoutFit = (slide: Slide, slot?: string): Slide => {
  if (!slide.fit) return slide;
  if (!slot) {
    const { fit: _fit, ...rest } = slide;
    return rest;
  }
  const fit = { ...slide.fit };
  delete fit[slot];
  return Object.keys(fit).length > 0 ? { ...slide, fit } : (({ fit: _unused, ...rest }) => rest)(slide);
};

/** The deck's design system from a PowerPoint theme (its own colours and fonts, kept as they are). */
function importedSystem(theme: ImportedTheme, fileTitle: string): DesignSystem {
  return {
    name: theme.name && !/^office/i.test(theme.name) ? theme.name : 'Original',
    concept: `The look of ${fileTitle}.pptx, as designed in PowerPoint.`,
    style: 'custom',
    mode: 'briefing',
    dark: theme.dark,
    palette: theme.palette,
    chartColors: theme.chartColors,
    fonts: theme.fonts,
    type: { display: 72, title: 40, body: 24, caption: 16 },
    shapeLanguage: 'As in the original file.',
    motif: 'As in the original file.',
    imagery: 'As in the original file.',
  };
}

/** Presenting time for a designed slide: its notes, or a share of its words. */
function designedSeconds(slide: DesignedSlide): number {
  if (slide.hidden) return 0;
  const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
  const notes = words(slide.notes);
  if (notes > 0) return Math.max(12, Math.round((notes / 140) * 60));
  return Math.max(slide.role === 'cover' || slide.role === 'section' || slide.role === 'closing' ? 8 : 12, Math.round(((words(svgPlainText(slide.svg)) * 1.6) / 140) * 60));
}

export const PresentationWorkspace: React.FC<PresentationWorkspaceProps> = ({ workspace, visible }) => {
  const workspaceId = workspace.id;
  const session = usePresentationSessionStore(selectPresentationSession(workspaceId));
  const store = usePresentationSessionStore.getState;
  const animations = useAppStore((state) => state.animationsEnabled);
  const documents = useDeckDocument(workspaceId, workspace.path);
  const generator = useDeckGenerator(workspaceId);

  const [creating, setCreating] = useState(false);
  const [importState, setImportState] = useState<{ path: string | null; busy: boolean; error: string | null; progress: { done: number; total: number } | null } | null>(null);
  const [exporting, setExporting] = useState<{ writePreserved?: (path: string) => Promise<void> } | null>(null);
  const [filmstripOpen, setFilmstripOpen] = useState(true);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideTab, setSideTab] = useState<'edit' | 'ai'>('ai');
  const [notesOpen, setNotesOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [review, setReview] = useState<(SlideReview & { ids: string[]; request: { action: SlideAction; scope: 'selected' | 'all'; instruction?: string; ids: string[] } }) | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [presenting, setPresenting] = useState<{ startId: string | null } | null>(null);
  const [stock, setStock] = useState<{ query: string; busy: boolean; error: string | null } | null>(null);
  const [themeEditor, setThemeEditor] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<{ name: string; description: string } | null>(null);
  const customThemes = usePresentationStore((state) => state.customThemes);
  const stockProvider = usePresentationStore((state) => state.stockProvider);
  const reviewApplied = useRef(false);
  const restored = useRef(false);
  const generationTargets = useRef<GenerationTarget[]>([]);

  const deck = session.deck;
  const deckDir = session.deckPath ? parentPath(session.deckPath) : '';
  const designer = useDesignGenerator(workspaceId);
  const preserve = Boolean(deck?.source);
  const designed = Boolean(deck?.design);
  const defaultEngine = usePresentationStore((state) => state.defaultEngine);
  const defaultSize = usePresentationStore((state) => state.defaultSize);
  const context = useMemo<PlanContext | null>(() => (deck ? { theme: deck.theme, size: deck.size, showNumbers: deck.showNumbers } : null), [deck?.theme, deck?.size, deck?.showNumbers]);
  const selectedId = session.selectedIds[session.selectedIds.length - 1] ?? null;
  const selectedIndex = deck && selectedId ? deck.slides.findIndex((slide) => slide.id === selectedId) : -1;
  const selectedSlide = selectedIndex >= 0 ? deck!.slides[selectedIndex] : null;

  const resolveImage = useCallback((src: string): string => {
    if (!src) return '';
    if (/^(data:|https?:)/.test(src)) return src;
    return localFileUrl(isAbsolutePath(src) ? src : joinPath(deckDir, src));
  }, [deckDir]);

  const edit = useCallback((change: (deck: YzDeck) => YzDeck, coalesce?: string) => {
    store().edit(workspaceId, change, coalesce ? { coalesce } : undefined);
  }, [store, workspaceId]);

  const select = useCallback((ids: string[], slot: string | null = null) => {
    store().update(workspaceId, { selectedIds: ids, selectedSlot: slot });
    setEditingSlot(null);
  }, [store, workspaceId]);

  // Reopen the last deck, or invite a first one.
  useEffect(() => {
    if (restored.current || documents.loadingList) return;
    restored.current = true;
    if (store().sessions[workspaceId]?.deck) return;
    const last = usePresentationStore.getState().lastDeckByWorkspace[workspaceId];
    if (last && documents.decks.some((entry) => entry.path === last)) void documents.openDeck(last);
  }, [documents, store, workspaceId]);

  // The finishing moment.
  const previousPhase = useRef(session.run?.phase);
  useEffect(() => {
    const run = session.run;
    if (previousPhase.current === 'slides' && run?.phase === 'done') {
      const seconds = Math.max(1, Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 1000));
      const count = Object.values(run.slideStatus).filter((status) => status === 'done').length;
      setToast({ title: 'Deck ready', description: `${count} slides in ${seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`}` });
      void documents.save();
    }
    previousPhase.current = run?.phase;
  }, [documents, session.run]);

  // Creating -----------------------------------------------------------------

  /** Describe-it creation: the AI invents the design and storyline, then draws every slide. */
  const createDesigned = useCallback(async (input: ComposerInput): Promise<void> => {
    setCreating(true);
    try {
      const engine = usePresentationStore.getState().defaultEngine;
      const pictures = input.files.filter((file) => file.kind === 'image');
      const used = new Set<string>();
      // Pictures are read one at a time: a folder can hold dozens of large files.
      let attachments: DesignAttachment[] = [];
      for (const file of input.files) {
        if (file.kind === 'document') {
          attachments.push({ path: file.path, name: file.name, kind: 'document', use: 'auto' });
          continue;
        }
        const path = `${ASSETS_FOLDER}/${assetName(file.path, used)}`;
        const dataUrl = file.preview ?? await invoke<string>('read_file_as_base64', { path: file.path }).catch(() => null);
        const info = dataUrl ? await pictureInfo(dataUrl).catch(() => null) : null;
        attachments.push({ path, name: file.name, kind: 'image', use: file.use, ...(info ?? {}) });
      }
      // Engines that see are shown every picture: each one when they fit in a message, else contact sheets.
      const shown = pictures.length > 0 && designer.seesImages(engine)
        ? await picturesToShow(pictures.map((file) => file.path), pictures.map((file) => file.name), joinPath(workspace.path, 'Presentations', '.attachments', '.shown')).catch(() => null)
        : null;
      const direction = await designer.direct({
        prompt: input.prompt,
        attachments,
        imagePaths: shown?.images ?? [],
        pictureView: shown?.view ?? false,
        documents: input.files.filter((file) => file.kind === 'document').map((file) => file.path),
        slideCount: input.slideCount,
        language: input.language,
        size: input.size,
        engine,
      });
      if (!direction) return;
      attachments = attachments.map((entry) => (direction.pictureNotes[entry.path] ? { ...entry, caption: direction.pictureNotes[entry.path] } : entry));
      const slides: DesignedSlide[] = storySlides(direction, newDesignedSlideId);
      const prefs = usePresentationStore.getState();
      const deck = createDeck({
        title: direction.title,
        brief: { ...createBrief(engine, slides.length, prefs.defaultTone), topic: direction.title, sourceNotes: input.prompt, sourceFiles: input.files.filter((file) => file.kind === 'document').map((file) => file.path) },
        size: input.size,
        design: { prompt: input.prompt, attachments, slideCount: input.slideCount, language: direction.language, system: direction.system, slides },
      });
      const path = documents.pathFor(deck.meta.title);
      const folder = parentPath(path);
      // Pictures move into the deck; dropped or pasted ones leave the inbox.
      const inbox = joinPath(workspace.path, 'Presentations', '.attachments').toLowerCase();
      for (const [index, file] of pictures.entries()) {
        const target = attachments.filter((entry) => entry.kind === 'image')[index];
        await writeFileBytes(joinPath(folder, target.path), await readFileBytes(file.path));
        if (file.path.toLowerCase().startsWith(inbox)) void invoke('delete_entry', { path: file.path }).catch(() => undefined);
      }
      await documents.createDeckFile(deck, path);
      void designer.drawSlides(slides.map((slide) => slide.id));
    } catch (error) {
      store().update(workspaceId, { error: `Could not create the presentation: ${error instanceof Error ? error.message : String(error)}` });
      store().updateRun(workspaceId, { phase: 'failed', endedAt: Date.now(), error: error instanceof Error ? error.message : String(error) });
    } finally {
      setCreating(false);
    }
  }, [designer, documents, store, workspace.path, workspaceId]);

  const writeAssets = async (dir: string, assets: Record<string, Uint8Array>): Promise<void> => {
    for (const [name, bytes] of Object.entries(assets)) await writeFileBytes(joinPath(dir, ASSETS_FOLDER, name), bytes);
  };

  /**
   * Opens PowerPoint bytes as an editable deck: every slide is drawn as PowerPoint draws it
   * (one in, one out), its pictures are copied into the deck and its theme becomes the deck's.
   */
  const openPowerPoint = useCallback(async (bytes: Uint8Array, sourcePath: string, onProgress?: (done: number, total: number) => void): Promise<void> => {
    const pkg = await openPptx(bytes);
    await ensureFonts(await pptxFontFamilies(pkg.zip));
    const { importPptx } = await import('../../utils/presentation/pptxRender');
    const fileTitle = fileName(sourcePath).replace(/\.pptx$/i, '');
    const imported = await importPptx(bytes, { fileTitle, measure: measureSlideText, onProgress });
    const system = importedSystem(imported.theme, fileTitle);
    const slides: DesignedSlide[] = imported.slides.map((slide, index) => ({
      id: newDesignedSlideId(),
      role: index === 0 ? 'cover' : 'content',
      title: (/^Slide \d+$/.test(slide.title) && slide.text ? slide.text.split('\n')[0] : slide.title).slice(0, 120) || `Slide ${index + 1}`,
      brief: slide.text.slice(0, 3000),
      density: 'dense',
      svg: slide.svg,
      notes: slide.notes,
      ...(slide.hidden ? { hidden: true } : {}),
    }));
    const prefs = usePresentationStore.getState();
    const deck = createDeck({
      title: fileTitle,
      brief: { ...createBrief(prefs.defaultEngine, Math.max(3, Math.min(30, slides.length)), prefs.defaultTone), topic: fileTitle },
      size: imported.size,
      design: { prompt: '', attachments: [], slideCount: null, language: '', system, slides, origin: { kind: 'pptx', file: sourcePath, importedAt: Date.now(), system } },
    });
    const path = documents.pathFor(deck.meta.title);
    await writeAssets(parentPath(path), imported.assets);
    await documents.createDeckFile(deck, path);
    setToast({ title: `${slides.length} slide${slides.length === 1 ? '' : 's'} opened`, description: imported.warnings[0] ?? `${fileName(sourcePath)} · click anything on a slide to edit it` });
  }, [documents]);

  const importPowerPoint = useCallback(async (path: string): Promise<void> => {
    setImportState({ path, busy: true, error: null, progress: null });
    try {
      const bytes = await readFileBytes(path);
      await openPowerPoint(bytes, path, (done, total) => setImportState((current) => current && { ...current, progress: { done, total } }));
      setImportState(null);
    } catch (error) {
      setImportState({ path, busy: false, error: error instanceof Error ? error.message : String(error), progress: null });
    }
  }, [openPowerPoint]);

  // Requests from the Files view: open a deck, or import a PowerPoint file.
  const request = usePresentationSessionStore((state) => state.requests[workspaceId]);
  useEffect(() => {
    if (!request || documents.loadingList) return;
    store().clearRequest(workspaceId);
    restored.current = true;
    if (request.kind === 'open') void documents.openDeck(request.path);
    else setImportState({ path: request.path, busy: false, error: null, progress: null });
  }, [documents, request, store, workspaceId]);

  // Editing --------------------------------------------------------------------

  const onSelectSlide = useCallback((id: string, event: React.MouseEvent) => {
    const current = store().sessions[workspaceId];
    const slides = current?.deck?.slides ?? [];
    if (event.shiftKey && current?.selectedIds.length) {
      const anchor = slides.findIndex((slide) => slide.id === current.selectedIds[0]);
      const target = slides.findIndex((slide) => slide.id === id);
      const [from, to] = anchor < target ? [anchor, target] : [target, anchor];
      select(slides.slice(from, to + 1).map((slide) => slide.id));
    } else if (event.ctrlKey || event.metaKey) {
      const ids = current?.selectedIds ?? [];
      select(ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]);
    } else {
      select([id]);
    }
  }, [select, store, workspaceId]);

  const commitText = useCallback((slot: string, items: RichPara[]) => {
    if (!selectedId) return;
    edit((current) => replaceSlide(current, selectedId, (slide) => {
      const def = getLayout(slide.layout).slots.find((entry) => entry.name === slot);
      const existing = slide.slots[slot];
      const slots = { ...slide.slots };
      if (items.length === 0) delete slots[slot];
      else if (existing?.type === 'quote') slots[slot] = { ...existing, text: items.map((item) => item.runs.map((run) => run.text).join('')).join(' ') };
      else {
        const type = existing?.type === 'bullets' || existing?.type === 'text' ? existing.type : def?.accepts.includes('bullets') && !def.accepts.includes('text') ? 'bullets' : def?.accepts[0] === 'bullets' ? 'bullets' : 'text';
        slots[slot] = { type, items } as Block;
      }
      return withoutFit({ ...slide, slots }, slot);
    }));
    store().update(workspaceId, (current) => {
      const warnings = { ...current.warnings };
      if (warnings[selectedId]) warnings[selectedId] = warnings[selectedId].filter((name) => name !== slot);
      return { warnings };
    });
  }, [edit, selectedId, store, workspaceId]);

  const setSlotBlock = useCallback((slot: string, block: Block | null) => {
    if (!selectedId) return;
    edit((current) => replaceSlide(current, selectedId, (slide) => {
      const slots = { ...slide.slots };
      if (block) slots[slot] = block;
      else delete slots[slot];
      return withoutFit({ ...slide, slots }, slot);
    }), `slot:${selectedId}:${slot}`);
  }, [edit, selectedId]);

  const onSlotPointer = useCallback((slot: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!selectedSlide) return;
    const def = getLayout(selectedSlide.layout).slots.find((entry) => entry.name === slot);
    const block = selectedSlide.slots[slot];
    const textual = def && (def.accepts.includes('text') || def.accepts.includes('bullets')) && (!block || block.type === 'text' || block.type === 'bullets' || block.type === 'quote');
    store().update(workspaceId, { selectedSlot: slot });
    if (textual) {
      event.preventDefault();
      setEditingSlot(slot);
    } else {
      setEditingSlot(null);
      setSideOpen(true);
      setSideTab('edit');
    }
  }, [selectedSlide, store, workspaceId]);

  const placeImage = useCallback(async (sourcePath: string | null, file?: File): Promise<void> => {
    const current = store().sessions[workspaceId];
    if (!current?.deck || !selectedId || !deckDir) return;
    const slide = current.deck.slides.find((entry) => entry.id === selectedId);
    if (!slide) return;
    let name: string;
    if (file) {
      const extension = (file.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      name = `pasted-${Date.now().toString(36)}.${extension}`;
      await writeFileBytes(joinPath(deckDir, ASSETS_FOLDER, name), new Uint8Array(await file.arrayBuffer()));
    } else if (sourcePath) {
      name = `${Date.now().toString(36)}-${fileName(sourcePath).replace(/[^\w.-]+/g, '-')}`;
      await writeFileBytes(joinPath(deckDir, ASSETS_FOLDER, name), await readFileBytes(sourcePath));
    } else return;
    const src = `${ASSETS_FOLDER}/${name}`;
    edit((deck) => replaceSlide(deck, selectedId, (target) => {
      let next = target;
      let slot = getLayout(next.layout).slots.find((entry) => entry.accepts.includes('image'))?.name;
      if (!slot) {
        next = changeLayout(next, 'image-right');
        slot = 'image';
      }
      const previous = next.slots[slot];
      return { ...next, slots: { ...next.slots, [slot]: { type: 'image', src, fit: 'cover', alt: previous?.type === 'image' ? previous.alt : '' } } };
    }));
  }, [deckDir, edit, selectedId, store, workspaceId]);

  /** Downloads a stock photo into the deck and puts it on the selected slide with its credit. */
  const placeStockImage = useCallback(async (image: StockImage, apiKey: string): Promise<void> => {
    if (!selectedId || !deckDir) return;
    setStock((current) => current && { ...current, busy: true, error: null });
    try {
      const safeId = image.id.replace(/[^\w-]+/g, '').slice(0, 40) || Date.now().toString(36);
      const written = await downloadStockImage(image, joinPath(deckDir, ASSETS_FOLDER, `${image.provider}-${safeId}`), apiKey);
      const src = `${ASSETS_FOLDER}/${fileName(written)}`;
      const credit = stockCredit(image);
      edit((deck) => replaceSlide(deck, selectedId, (target) => {
        let next = target;
        let slot = getLayout(next.layout).slots.find((entry) => entry.accepts.includes('image'))?.name;
        if (!slot) {
          next = changeLayout(next, 'image-right');
          slot = 'image';
        }
        const previous = next.slots[slot];
        const alt = previous?.type === 'image' && previous.alt ? previous.alt : image.title;
        const line = `Image: ${credit}${image.sourceUrl ? ` (${image.sourceUrl})` : ''}`;
        const notes = next.notes.includes(line) ? next.notes : `${next.notes.trim()}${next.notes.trim() ? '\n\n' : ''}${line}`;
        return {
          ...next,
          notes,
          slots: { ...next.slots, [slot]: { type: 'image', src, fit: 'cover', alt, credit, ...(previous?.type === 'image' && previous.prompt ? { prompt: previous.prompt } : {}) } },
        };
      }));
      setStock(null);
    } catch (error) {
      setStock((current) => current && { ...current, busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  }, [deckDir, edit, selectedId]);

  const openStockSearch = useCallback(() => {
    if (!selectedSlide) return;
    const image = Object.values(selectedSlide.slots).find((block) => block.type === 'image');
    setStock({ query: (image?.type === 'image' && image.alt) || titleOfSlide(selectedSlide), busy: false, error: null });
  }, [selectedSlide]);

  const pickImage = useCallback(async (): Promise<void> => {
    const picked = await open({ multiple: false, defaultPath: workspace.path, filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }] });
    if (typeof picked !== 'string') return;
    try {
      await placeImage(picked);
    } catch (error) {
      store().update(workspaceId, { error: `Could not add the image: ${error instanceof Error ? error.message : String(error)}` });
    }
  }, [placeImage, store, workspace.path, workspaceId]);

  const onInsert = useCallback((kind: InsertKind) => {
    if (!selectedSlide) return;
    if (kind === 'image') {
      void pickImage();
      return;
    }
    const slotName = getLayout(selectedSlide.layout).slots.find((slot) => slot.accepts.includes(kind))?.name;
    if (slotName) {
      if (!selectedSlide.slots[slotName] || selectedSlide.slots[slotName].type !== kind) {
        const sample = Object.values(emptySlide(kind === 'chart' ? 'chart' : 'table').slots).find((block) => block.type === kind) ?? null;
        setSlotBlock(slotName, sample);
      }
      store().update(workspaceId, { selectedSlot: slotName });
    } else {
      edit((deck) => replaceSlide(deck, selectedSlide.id, (slide) => {
        const moved = changeLayout(slide, kind === 'chart' ? 'chart' : 'table');
        const sample = emptySlide(kind === 'chart' ? 'chart' : 'table');
        const name = kind === 'chart' ? 'chart' : 'table';
        return moved.slots[name] ? moved : { ...moved, slots: { ...moved.slots, [name]: sample.slots[name] } };
      }));
      store().update(workspaceId, { selectedSlot: kind === 'chart' ? 'chart' : 'table' });
    }
    setSideOpen(true);
    setSideTab('edit');
  }, [edit, pickImage, selectedSlide, setSlotBlock, store, workspaceId]);

  const slideCommand = useCallback((command: SlideCommand, id: string) => {
    const current = store().sessions[workspaceId];
    const ids = current?.selectedIds.includes(id) ? current.selectedIds : [id];
    if (command === 'delete') {
      const slides = current?.deck?.slides ?? [];
      if (slides.length - ids.length < 1) return;
      const first = slides.findIndex((slide) => ids.includes(slide.id));
      const remaining = slides.filter((slide) => !ids.includes(slide.id));
      edit((deck) => ({ ...deck, slides: deck.slides.filter((slide) => !ids.includes(slide.id)) }));
      select([remaining[Math.min(first, remaining.length - 1)].id]);
    } else if (command === 'duplicate') {
      const copies: Slide[] = [];
      edit((deck) => {
        const slides: Slide[] = [];
        for (const slide of deck.slides) {
          slides.push(slide);
          if (ids.includes(slide.id)) {
            const copy = duplicateSlide(slide);
            copies.push(copy);
            slides.push(copy);
          }
        }
        return { ...deck, slides };
      });
      if (copies.length) select(copies.map((slide) => slide.id));
    } else if (command === 'hide') {
      const hide = !(current?.deck?.slides.find((slide) => slide.id === id)?.hidden ?? false);
      edit((deck) => ({ ...deck, slides: deck.slides.map((slide) => (ids.includes(slide.id) ? (hide ? { ...slide, hidden: true } : (({ hidden: _hidden, ...rest }) => rest)(slide)) : slide)) }));
    } else {
      edit((deck) => {
        const slides = [...deck.slides];
        const index = slides.findIndex((slide) => slide.id === id);
        const target = command === 'up' ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= slides.length) return deck;
        [slides[index], slides[target]] = [slides[target], slides[index]];
        return { ...deck, slides };
      });
    }
  }, [edit, select, store, workspaceId]);

  const addSlide = useCallback((layout: LayoutId) => {
    const slide = emptySlide(layout);
    edit((deck) => {
      const index = deck.slides.findIndex((entry) => entry.id === selectedId);
      const slides = [...deck.slides];
      slides.splice(index < 0 ? slides.length : index + 1, 0, slide);
      return { ...deck, slides };
    });
    select([slide.id]);
  }, [edit, select, selectedId]);

  const moveSlide = useCallback((fromId: string, toId: string) => {
    edit((deck) => {
      const slides = [...deck.slides];
      const from = slides.findIndex((slide) => slide.id === fromId);
      const to = slides.findIndex((slide) => slide.id === toId);
      if (from < 0 || to < 0) return deck;
      const [moved] = slides.splice(from, 1);
      slides.splice(to, 0, moved);
      return { ...deck, slides };
    });
  }, [edit]);

  // The design check: shrink type that overflows, then warn.
  const onMeasure = useCallback((slideId: string, overflowing: string[]) => {
    const current = store().sessions[workspaceId];
    const slide = current?.deck?.slides.find((entry) => entry.id === slideId);
    if (!slide) return;
    const shrink: Record<string, number> = {};
    const stuck: string[] = [];
    for (const slot of overflowing) {
      const scale = slide.fit?.[slot] ?? 1;
      if (scale > MIN_FIT + 0.001) shrink[slot] = Math.round(Math.max(MIN_FIT, scale - FIT_STEP) * 100) / 100;
      else stuck.push(slot);
    }
    if (Object.keys(shrink).length > 0) {
      store().edit(workspaceId, (deck) => replaceSlide(deck, slideId, (target) => ({ ...target, fit: { ...(target.fit ?? {}), ...shrink } })), { skipHistory: true });
    }
    const before = current?.warnings[slideId] ?? [];
    if (before.join() !== stuck.join()) {
      store().update(workspaceId, (state) => {
        const warnings = { ...state.warnings };
        if (stuck.length > 0) warnings[slideId] = stuck;
        else delete warnings[slideId];
        return { warnings };
      });
    }
  }, [store, workspaceId]);

  // AI review ------------------------------------------------------------------

  const runAction = useCallback(async (action: SlideAction, scope: 'selected' | 'all', instruction?: string, explicitIds?: string[]): Promise<void> => {
    const current = store().sessions[workspaceId];
    if (!current?.deck) return;
    const ids = explicitIds ?? (scope === 'all' ? current.deck.slides.map((slide) => slide.id) : current.selectedIds);
    const before = ids.map((id) => current.deck!.slides.find((slide) => slide.id === id)).filter((slide): slide is Slide => Boolean(slide));
    if (before.length === 0) return;
    reviewApplied.current = false;
    setEditingSlot(null);
    setReview({ label: ACTION_LABELS[action], instruction: action === 'coach' || action === 'imagePrompts' ? undefined : instruction, mode: action === 'imagePrompts' ? 'prompts' : 'slides', status: 'running', error: null, before, after: [], ids, request: { action, scope, instruction, ids } });
    const result = await generator.slideAction({ action, slideIds: ids, instruction });
    setReview((state) => state && ({ ...state, status: result.ok ? 'done' : 'failed', error: result.ok ? null : result.cancelled ? 'Stopped.' : result.error, after: result.after }));
  }, [generator, store, workspaceId]);

  const runPass = useCallback((pass: DeckPass, minutes?: number) => {
    const current = store().sessions[workspaceId]?.deck;
    if (!current) return;
    if (pass === 'coach') {
      const words = notesBudget(current.slides, minutes ?? 10);
      void runAction('coach', 'all', `Target talk length: ${minutes ?? 10} minutes in total, so about ${words} words of notes per slide (fewer on title and section slides, more on the key slides).`);
    } else if (pass === 'imagePrompts') {
      const ids = current.slides.filter((slide) => Object.values(slide.slots).some((block) => block.type === 'image')).map((slide) => slide.id);
      if (ids.length === 0) {
        store().update(workspaceId, { error: 'No slide has a picture yet. Use an image layout first.' });
        return;
      }
      void runAction('imagePrompts', 'selected', `Deck theme: ${current.theme.name} (${current.theme.tagline})`, ids);
    } else {
      void runAction('consistency', 'all');
    }
  }, [runAction, store, workspaceId]);

  const acceptReview = useCallback(() => {
    if (!review) return;
    const ids = review.ids;
    edit((deck) => {
      const first = deck.slides.findIndex((slide) => ids.includes(slide.id));
      if (first < 0) return deck;
      const kept = deck.slides.filter((slide) => !ids.includes(slide.id));
      const insertAt = deck.slides.slice(0, first).filter((slide) => !ids.includes(slide.id)).length;
      kept.splice(insertAt, 0, ...review.after);
      return { ...deck, slides: kept };
    });
    store().update(workspaceId, (state) => {
      const warnings = { ...state.warnings };
      ids.forEach((id) => delete warnings[id]);
      return { warnings };
    });
    reviewApplied.current = true;
  }, [edit, review, store, workspaceId]);

  const retryUnfinished = useCallback(() => {
    const status = store().sessions[workspaceId]?.run?.slideStatus ?? {};
    const targets = generationTargets.current.filter((target) => status[target.slideId] === 'failed' || status[target.slideId] === 'cancelled');
    if (targets.length > 0) {
      void generator.generateSlides(targets);
      return;
    }
    const ids = Object.entries(status).filter(([, value]) => value === 'failed' || value === 'cancelled').map(([id]) => id);
    if (ids.length > 0) void runAction('custom', 'selected', 'Write each slide in full from its title and layout.', ids);
  }, [generator, runAction, store, workspaceId]);

  // Keyboard ---------------------------------------------------------------------

  useEffect(() => {
    if (!visible || !deck || preserve || designed) return;
    const onKey = (event: KeyboardEvent): void => {
      if (document.querySelector('.pr-modal, .pr-wizard')) return;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)));
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 's' && !event.shiftKey) { event.preventDefault(); void documents.save(); return; }
      if (mod && key === 'e' && event.shiftKey) { event.preventDefault(); setExporting({}); return; }
      if (event.key === 'F5') { event.preventDefault(); setPresenting({ startId: event.shiftKey ? selectedId : null }); return; }
      if (typing) return;
      if (mod && key === 'z' && !event.shiftKey) { event.preventDefault(); store().undo(workspaceId); }
      else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); store().redo(workspaceId); }
      else if (mod && key === 'd' && selectedId) { event.preventDefault(); slideCommand('duplicate', selectedId); }
      else if (event.key === 'Delete' && selectedId) { event.preventDefault(); slideCommand('delete', selectedId); }
      else if ((event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') && deck.slides[selectedIndex + 1]) { event.preventDefault(); select([deck.slides[selectedIndex + 1].id]); }
      else if ((event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') && selectedIndex > 0) { event.preventDefault(); select([deck.slides[selectedIndex - 1].id]); }
      else if (event.key === 'Escape') store().update(workspaceId, { selectedSlot: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deck, designed, documents, preserve, select, selectedId, selectedIndex, slideCommand, store, visible, workspaceId]);

  // Keyboard for original-design decks: save and export.
  useEffect(() => {
    if (!visible || !preserve) return;
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)));
      if (mod && event.key.toLowerCase() === 's' && !event.shiftKey) { event.preventDefault(); void documents.save(); }
      else if (!typing && mod && event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); store().undo(workspaceId); }
      else if (!typing && mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) { event.preventDefault(); store().redo(workspaceId); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [documents, preserve, store, visible, workspaceId]);

  // Render -----------------------------------------------------------------------

  const selectedSlotBlock = selectedSlide && session.selectedSlot ? selectedSlide.slots[session.selectedSlot] : undefined;
  const slotDef = selectedSlide && session.selectedSlot ? getLayout(selectedSlide.layout).slots.find((slot) => slot.name === session.selectedSlot) : undefined;
  const bulletsState = slotDef && slotDef.accepts.includes('bullets') && slotDef.accepts.includes('text')
    ? (selectedSlotBlock?.type === 'bullets' ? true : selectedSlotBlock?.type === 'text' ? false : null)
    : null;
  const warningCount = Object.keys(session.warnings).length;

  return (
    <div className="pr-root" aria-hidden={!visible}>
      {deck && designed ? (
        <DesignedEditor
          workspaceId={workspaceId}
          workspacePath={workspace.path}
          session={session}
          deck={deck}
          deckDir={deckDir}
          visible={visible}
          generator={designer}
          onSave={() => void documents.save()}
          onExport={() => setExporting({})}
          onPresent={(startId) => setPresenting({ startId })}
          onToast={(title, description) => setToast({ title, description })}
        />
      ) : deck && preserve && context ? (
        <PreserveEditor
          workspaceId={workspaceId}
          session={session}
          deck={deck}
          deckDir={deckDir}
          visible={visible}
          generator={generator}
          onExport={(write) => setExporting({ writePreserved: write })}
          onRebuild={(bytes) => void openPowerPoint(bytes, deck.source?.originalPath || `${deck.meta.title}.pptx`).catch((error: unknown) => store().update(workspaceId, { error: `Could not open the slides: ${error instanceof Error ? error.message : String(error)}` }))}
          onToast={(title, description) => setToast({ title, description })}
        />
      ) : deck && context ? (
        <div className="pr-shell">
          <DeckToolbar
            title={deck.meta.title}
            context={context}
            slide={selectedSlide}
            editing={editingSlot !== null}
            bullets={bulletsState}
            canUndo={session.past.length > 0}
            canRedo={session.future.length > 0}
            aiOpen={sideOpen && sideTab === 'ai'}
            filmstripOpen={filmstripOpen}
            resolveImage={resolveImage}
            onTitle={(title) => edit((current) => ({ ...current, meta: { ...current.meta, title } }))}
            onLayout={(layout) => selectedSlide && edit((current) => replaceSlide(current, selectedSlide.id, (slide) => changeLayout(slide, layout)))}
            onTheme={(theme) => {
              edit((current) => ({ ...current, theme, slides: current.slides.map((slide) => withoutFit(slide)) }));
              store().update(workspaceId, { warnings: {} });
            }}
            onSize={(size) => {
              edit((current) => ({ ...current, size, slides: current.slides.map((slide) => withoutFit(slide)) }));
              store().update(workspaceId, { warnings: {} });
            }}
            onShowNumbers={(showNumbers) => edit((current) => ({ ...current, showNumbers }))}
            onToggleBullets={() => {
              if (!session.selectedSlot || !selectedSlotBlock || (selectedSlotBlock.type !== 'text' && selectedSlotBlock.type !== 'bullets')) return;
              setSlotBlock(session.selectedSlot, { type: selectedSlotBlock.type === 'bullets' ? 'text' : 'bullets', items: selectedSlotBlock.items.map(({ runs }) => ({ runs })) });
            }}
            onInsert={onInsert}
            onUndo={() => store().undo(workspaceId)}
            onRedo={() => store().redo(workspaceId)}
            onToggleAi={() => { if (sideOpen && sideTab === 'ai') setSideOpen(false); else { setSideOpen(true); setSideTab('ai'); } }}
            onToggleFilmstrip={() => setFilmstripOpen((value) => !value)}
            onExport={() => setExporting({})}
            customThemes={customThemes}
            transition={deck.transition}
            onTransition={(transition) => edit((current) => ({ ...current, transition }))}
            onPresent={(fromCurrent) => setPresenting({ startId: fromCurrent ? selectedId : null })}
            onCustomizeTheme={() => setThemeEditor(true)}
            onSaveTemplate={() => setTemplateDraft({ name: deck.meta.title, description: '' })}
          />
          <div className="pr-body">
            {filmstripOpen && (
              <Filmstrip
                context={context}
                slides={deck.slides}
                selectedIds={session.selectedIds}
                status={session.run?.slideStatus ?? {}}
                warnings={session.warnings}
                resolveImage={resolveImage}
                onSelect={onSelectSlide}
                onMove={moveSlide}
                onCommand={slideCommand}
                onAdd={addSlide}
                onMeasure={onMeasure}
              />
            )}
            <div className="pr-center">
              <SlideCanvas
                context={context}
                slide={selectedSlide}
                index={Math.max(0, selectedIndex)}
                zoom={zoom}
                selectedSlot={session.selectedSlot}
                editingSlot={editingSlot}
                warnings={selectedSlide ? session.warnings[selectedSlide.id] ?? [] : []}
                busy={Boolean(selectedSlide && session.run?.slideStatus[selectedSlide.id] === 'writing')}
                resolveImage={resolveImage}
                onSlotPointer={onSlotPointer}
                onCommitText={commitText}
                onEndEdit={() => setEditingSlot(null)}
                onDeselect={() => { setEditingSlot(null); store().update(workspaceId, { selectedSlot: null }); }}
                onPasteImage={(file) => void placeImage(null, file).catch((error: unknown) => store().update(workspaceId, { error: `Could not add the image: ${String(error)}` }))}
              />
              {selectedSlide && (
                <div className="pr-notes" data-open={notesOpen || undefined}>
                  <button type="button" className="pr-notes__head" onClick={() => setNotesOpen((value) => !value)}>
                    <NotePencil size={13} /> Speaker notes {notesOpen ? <CaretDown size={11} /> : <CaretUp size={11} />}
                  </button>
                  {notesOpen && (
                    <textarea
                      className="pr-notes__input"
                      value={selectedSlide.notes}
                      placeholder="What to say on this slide: the detail, the evidence, the transition to the next one."
                      onKeyDown={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const notes = event.target.value;
                        edit((current) => replaceSlide(current, selectedSlide.id, (slide) => ({ ...slide, notes })), `notes:${selectedSlide.id}`);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
            {sideOpen && (
              <aside className="pr-side">
                <div className="pr-side__tabs" role="tablist">
                  <button type="button" role="tab" aria-selected={sideTab === 'edit'} className="pr-side__tab" onClick={() => setSideTab('edit')}>Edit</button>
                  <button type="button" role="tab" aria-selected={sideTab === 'ai'} className="pr-side__tab" onClick={() => setSideTab('ai')}><Sparkle size={12} weight="fill" /> AI</button>
                </div>
                <div className="pr-side__scroll">
                  {sideTab === 'edit' ? (
                    selectedSlide && session.selectedSlot ? (
                      <SlotInspector slide={selectedSlide} slot={session.selectedSlot} resolveImage={resolveImage} theme={deck.theme} onChange={(block) => setSlotBlock(session.selectedSlot!, block)} onPickImage={() => void pickImage()} onSearchStock={stockProvider === 'off' ? null : openStockSearch} />
                    ) : (
                      <div className="pr-inspector">
                        <span className="pr-label">{selectedSlide ? getLayout(selectedSlide.layout).name : 'No slide selected'}</span>
                        <p className="pr-hint">Click any part of the slide to edit it. Text edits in place; pictures, charts, tables, figures and steps open here.</p>
                        {selectedSlide && (
                          <label className="pr-field">
                            <span className="pr-field__label">Background</span>
                            <span className="pr-inline-actions">
                              <input type="color" className="pr-color" value={selectedSlide.background ?? deck.theme.palette.background} onChange={(event) => edit((current) => replaceSlide(current, selectedSlide.id, (slide) => ({ ...slide, background: event.target.value })), `bg:${selectedSlide.id}`)} />
                              {selectedSlide.background && <button type="button" className="pr-btn pr-btn--sm" onClick={() => edit((current) => replaceSlide(current, selectedSlide.id, ({ background: _background, ...slide }) => slide))}>Theme default</button>}
                            </span>
                          </label>
                        )}
                      </div>
                    )
                  ) : (
                    <DeckAiPanel
                      deck={deck}
                      run={session.run}
                      selectedIds={session.selectedIds}
                      warnings={session.warnings}
                      onAction={(action, scope, instruction) => void runAction(action, scope, instruction)}
                      onFix={(slideId) => void runAction('shorten', 'selected', 'The text must fit the slide at its current layout.', [slideId])}
                      onRetryUnfinished={retryUnfinished}
                      onPass={runPass}
                      onCancel={generator.cancel}
                      onEngine={(engine) => edit((current) => ({ ...current, brief: { ...current.brief, engine } }))}
                      onJump={(id) => select([id])}
                    />
                  )}
                </div>
              </aside>
            )}
          </div>
          <div className="pr-status">
            <span className="pr-status__item"><span className={`pr-status__dot${session.error ? ' is-error' : session.dirty || session.saving ? ' is-dirty' : ''}`} />{session.error ?? (session.saving ? 'Saving…' : session.dirty ? 'Unsaved changes' : 'Saved')}</span>
            <span className="pr-status__item">Slide {selectedIndex + 1} of {deck.slides.length}</span>
            {warningCount > 0 && (
              <button type="button" className="pr-status__item pr-status__warn" onClick={() => { setSideOpen(true); setSideTab('ai'); }}>
                <Warning size={12} weight="fill" /> {warningCount} slide{warningCount === 1 ? '' : 's'} with overflowing text
              </button>
            )}
            <span className="pr-status__item">{deck.brief.engine.engine === 'claude' ? 'Claude Code' : deck.brief.engine.engine}{deck.brief.engine.model ? ` · ${deck.brief.engine.model}` : ''}</span>
            <span className="pr-status__spacer" />
            <span className="pr-status__zoom">
              <button type="button" className="pr-icon-btn pr-icon-btn--xs" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.4, Math.round((value - 0.1) * 10) / 10))}><Minus size={11} /></button>
              <button type="button" className="pr-status__zoom-value" title="Fit" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button type="button" className="pr-icon-btn pr-icon-btn--xs" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2.5, Math.round((value + 0.1) * 10) / 10))}><Plus size={11} /></button>
            </span>
          </div>
        </div>
      ) : (
        <DesignComposer
          workspaceName={workspace.name}
          workspacePath={workspace.path}
          decks={documents.decks}
          engine={defaultEngine}
          defaultSize={defaultSize}
          run={session.run}
          busy={creating}
          animations={animations && visible}
          onEngine={(engine) => usePresentationStore.getState().setDefaultEngine(engine)}
          onCreate={(input) => void createDesigned(input)}
          onCancel={designer.cancel}
          onOpen={(path) => void documents.openDeck(path)}
          onImport={() => setImportState({ path: null, busy: false, error: null, progress: null })}
        />
      )}

      {deck && (
        <div className="pr-deck-switch">
          <select
            className="pr-select pr-select--ghost"
            value={session.deckPath ?? ''}
            aria-label="Open presentation"
            onChange={(event) => {
              const value = event.target.value;
              if (value === '__new') void documents.closeDeck();
              else if (value === '__import') setImportState({ path: null, busy: false, error: null, progress: null });
              else if (value === '__close') void documents.closeDeck();
              else if (value) void documents.openDeck(value);
            }}
          >
            {documents.decks.map((entry) => <option key={entry.path} value={entry.path}>{entry.title}</option>)}
            {!documents.decks.some((entry) => entry.path === session.deckPath) && session.deckPath && <option value={session.deckPath}>{deck.meta.title}</option>}
            <option value="__new">+ New presentation…</option>
            <option value="__import">Open PowerPoint…</option>
            <option value="__close">Close presentation</option>
          </select>
        </div>
      )}

      {importState && (
        <ImportDialog
          workspacePath={workspace.path}
          initialPath={importState.path}
          busy={importState.busy}
          progress={importState.progress}
          error={importState.error}
          onClose={() => setImportState(null)}
          onImport={(path) => void importPowerPoint(path)}
        />
      )}

      {exporting && deck && designed && (
        <DesignedExportDialog
          deck={deck}
          deckDir={deckDir}
          resolveHref={resolveImage}
          onClose={() => setExporting(null)}
          onExported={(path) => setToast({ title: 'Exported', description: fileName(path) })}
        />
      )}

      {exporting && deck && !designed && context && (
        <ExportDialog
          deck={deck}
          deckDir={deckDir}
          context={context}
          resolveImage={resolveImage}
          writePreserved={exporting.writePreserved}
          onClose={() => setExporting(null)}
          onExported={(path) => setToast({ title: 'Exported', description: fileName(path) })}
        />
      )}

      {review && (
        <SlideReviewCard
          review={review}
          context={context}
          resolveImage={resolveImage}
          onAccept={acceptReview}
          onUndoAccept={() => { if (reviewApplied.current) store().undo(workspaceId); reviewApplied.current = false; }}
          onSettled={() => setReview(null)}
          onRetry={() => void runAction(review.request.action, review.request.scope, review.request.instruction, review.request.ids)}
          onDiscard={() => { generator.cancel(); setReview(null); }}
        />
      )}

      {presenting && deck?.design && (
        <PresenterMode
          slides={deck.design.slides.filter((slide) => slide.svg)}
          aspect={designCanvas(deck.size)}
          transition={deck.transition}
          startId={presenting.startId}
          renderSlide={(slide, width) => <SvgSlide svg={slide.svg} width={width} canvas={designCanvas(deck.size)} resolveHref={resolveImage} />}
          seconds={designedSeconds}
          onExit={(lastId) => {
            setPresenting(null);
            if (lastId) select([lastId]);
          }}
        />
      )}

      {presenting && deck && context && !preserve && !designed && (
        <PresenterMode
          slides={deck.slides}
          aspect={{ width: slideWidth(context.size) * PX_PER_IN, height: SLIDE_HEIGHT * PX_PER_IN }}
          transition={deck.transition}
          startId={presenting.startId}
          renderSlide={(slide, width) => <SlideRenderer context={context} slide={slide} index={deck.slides.indexOf(slide)} width={width} resolveImage={resolveImage} />}
          seconds={slideSeconds}
          onExit={(lastId) => {
            setPresenting(null);
            if (lastId) select([lastId]);
          }}
        />
      )}

      {stock && (
        <StockImagePicker
          initialQuery={stock.query}
          busy={stock.busy}
          error={stock.error}
          onClose={() => setStock(null)}
          onPick={(image, apiKey) => void placeStockImage(image, apiKey)}
        />
      )}

      {themeEditor && deck && (
        <ThemeEditor
          theme={deck.theme}
          size={deck.size}
          canApply
          onClose={() => setThemeEditor(false)}
          onSave={(theme, apply) => {
            usePresentationStore.getState().saveTheme(theme);
            if (apply) {
              edit((current) => ({ ...current, theme, slides: current.slides.map((slide) => withoutFit(slide)) }));
              store().update(workspaceId, { warnings: {} });
            }
            setThemeEditor(false);
            setToast({ title: 'Theme saved', description: apply ? `${theme.name} · applied to this deck` : theme.name });
          }}
        />
      )}

      {templateDraft && deck && (
        <div className="pr-modal" role="dialog" aria-modal="true" aria-label="Save as template" onMouseDown={(event) => { if (event.target === event.currentTarget) setTemplateDraft(null); }}>
          <div className="pr-modal__panel pr-import">
            <div className="pr-row">
              <span className="pr-eyebrow"><BookmarkSimple size={12} /> Save as template</span>
              <button type="button" className="pr-icon-btn" onClick={() => setTemplateDraft(null)} aria-label="Close"><X size={15} /></button>
            </div>
            <p className="pr-hint">Keeps the theme, the slide size and every slide's layout and text as a starting point. Pictures are left out; their placeholders stay.</p>
            <label className="pr-field">
              <span className="pr-field__label">Name</span>
              <input className="pr-input" autoFocus value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} onKeyDown={(event) => event.stopPropagation()} />
            </label>
            <label className="pr-field">
              <span className="pr-field__label">Description <span className="pr-field__opt">optional</span></span>
              <input className="pr-input" value={templateDraft.description} onChange={(event) => setTemplateDraft({ ...templateDraft, description: event.target.value })} onKeyDown={(event) => event.stopPropagation()} />
            </label>
            <div className="pr-import__foot">
              <span className="pr-hint">{deck.slides.length} slides · {deck.theme.name} · {deck.size}</span>
              <button type="button" className="pr-btn pr-btn--primary" disabled={!templateDraft.name.trim()} onClick={() => {
                usePresentationStore.getState().saveTemplate(templateFromDeck(deck, templateDraft.name, templateDraft.description));
                setTemplateDraft(null);
                setToast({ title: 'Template saved', description: `${templateDraft.name.trim()} · start from it on the Slides home or in the wizard` });
              }}>Save template</button>
            </div>
          </div>
        </div>
      )}

      <div className="pr-toast-host">
        {toast && (
          <SwipeToast
            open
            inline
            title={toast.title}
            description={toast.description}
            icon={<Sparkle size={16} weight="fill" color="var(--accent)" />}
            background="var(--bg-secondary)"
            color="var(--text-primary)"
            fuseColor="var(--accent)"
            duration={6000}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </div>
  );
};

export default PresentationWorkspace;

