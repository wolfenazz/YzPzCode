import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePresentationSessionStore } from '../../stores/presentationSessionStore';
import { usePresentationStore } from '../../stores/presentationStore';
import type { AiCallRecord } from '../../stores/writingSessionStore';
import {
  buildDirectionPrompt,
  buildNewSlidePrompt,
  buildPhotoPlanPrompt,
  buildPhotoQueryPrompt,
  buildPicturePlanPrompt,
  buildRefinePrompt,
  buildSlidesPrompt,
  extractSlideBlocks,
  parseDirection,
  parsePhotoPlan,
  parsePhotoQueries,
  parsePicturePlan,
  placeablePictures,
  titleFromSvg,
  wantsWebPhoto,
  type PhotoPlanPage,
  type PictureView,
  type SelectedElement,
  type SlideBlock,
} from '../../utils/presentation/designPrompts';
import { ASSETS_FOLDER } from '../../utils/presentation/deck';
import { designCanvas } from '../../utils/presentation/designStyles';
import type { DesignAttachment, DesignedSlide, DesignSlideRole, DirectionResult } from '../../utils/presentation/designTypes';
import { sanitizeSvg, svgAssetRefs } from '../../utils/presentation/svgSafe';
import type { DeckSize, YzDeck } from '../../utils/presentation/types';
import { startAiRun, type AiRun, type AiRunResult } from '../../utils/writing/aiClient';
import { fileName, joinPath, parentPath } from '../../utils/writing/document';
import { cleanPictureQuery } from '../../utils/writing/pictures';
import { gatherSources } from '../../utils/writing/sources';
import type { EngineChoice } from '../../utils/writing/types';
import { fetchWebPictures, webPictureSource, webPicturesEnabled, type WebPicture } from '../../utils/webPictures';
import { deckPicturePreview, pictureInfo, picturesToShow, PREVIEWS_FOLDER } from './designAssets';

/** Engines that are shown the user's pictures (the others get a description of each). */
const SEES_IMAGES = new Set(['claude', 'codex']);
/** Pictures attached to one drawing call (the runner's limit). */
const MAX_ATTACHED = 6;
/**
 * Pages per AI call, and calls in flight at once, after the cover. A page
 * takes about the same time whatever the batch (2–4 minutes for a rich
 * page), so the largest batch sets the wall time: one page per call, several
 * calls at once, each slide appearing as soon as it is done.
 */
const PAGES_PER_CALL = 1;
const PARALLEL_CALLS = 5;
/** Selected slides changed at once (each is one call, and may fetch a photo first). */
const REFINE_PARALLEL = 4;

let callCounter = 0;
const newCallId = (): string => `call-${Date.now().toString(36)}-${(callCounter += 1).toString(36)}`;

export interface DirectionRequest {
  prompt: string;
  attachments: DesignAttachment[];
  /** Absolute paths of what engines that see are shown: small copies of the pictures, or contact sheets. */
  imagePaths: string[];
  /** How `imagePaths` show the pictures. */
  pictureView: PictureView;
  /** Absolute paths of documents whose text the AI should use. */
  documents: string[];
  slideCount: number | null;
  language: string;
  size: DeckSize;
  engine: EngineChoice;
  /** Pages may ask for real photos from the web. */
  webPhotos?: boolean;
  /** The description asks for pictures from the internet, so several pages should get one. */
  photosRequested?: boolean;
}

/** A redrawn or new page the user reviews before it replaces anything. */
export interface SlideProposal {
  svg: string;
  notes: string;
  title: string;
  role: DesignSlideRole | null;
  /** Web photos (`assets/…`) the page now shows; they join the slide's pictures when it is kept. */
  pictures?: string[];
}

/** What a redraw is told besides the instruction. */
export interface RefineOptions {
  /** The slide's markup when it differs from the stored one (selected drawn artwork wrapped into elements). */
  svg?: string;
  /** Elements the user selected: the instruction is about them. */
  selection?: SelectedElement[];
}

type PhotoResult = { ok: true; attachment: DesignAttachment } | { ok: false; error: string };

/** The words drawn on a slide, in drawing order. */
const textOfSvg = (svg: string): string => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export type ProposalResult = { ok: true; proposal: SlideProposal } | { ok: false; cancelled: boolean; error: string };

const deckOf = (workspaceId: string): YzDeck | null => usePresentationSessionStore.getState().sessions[workspaceId]?.deck ?? null;
/** The open deck's folder, read when needed: a deck created a moment ago is not in the last render yet. */
const deckDirOf = (workspaceId: string): string => {
  const path = usePresentationSessionStore.getState().sessions[workspaceId]?.deckPath;
  return path ? parentPath(path) : '';
};

/** Every AI call that designs or redraws slides, with progress in the session's run. */
export function useDesignGenerator(workspaceId: string) {
  const active = useRef(new Set<AiRun>());
  const cancelled = useRef(false);
  const store = usePresentationSessionStore.getState;

  const recordCall = useCallback((label: string): string => {
    const id = newCallId();
    store().updateRun(workspaceId, (run) => ({
      calls: [...run.calls.slice(-40), { id, label, status: 'running', startedAt: Date.now(), endedAt: null, error: null }],
    }));
    return id;
  }, [store, workspaceId]);

  const finishCall = useCallback((id: string, result: AiRunResult): void => {
    const status: AiCallRecord['status'] = result.ok ? 'done' : result.cancelled ? 'cancelled' : 'failed';
    store().updateRun(workspaceId, (run) => ({
      calls: run.calls.map((call) => (call.id === id ? { ...call, status, endedAt: Date.now(), error: result.error } : call)),
    }));
  }, [store, workspaceId]);

  const runAi = useCallback(async (engine: EngineChoice, label: string, system: string, prompt: string, options: { images?: string[]; webSearch?: boolean; onText?: (text: string) => void } = {}): Promise<AiRunResult> => {
    const callId = recordCall(label);
    const run = startAiRun({
      engine: engine.engine,
      model: engine.model,
      effort: engine.effort,
      system,
      prompt,
      images: options.images,
      webSearch: options.webSearch,
      timeoutSecs: usePresentationStore.getState().aiTimeoutSecs,
      onText: options.onText,
    });
    active.current.add(run);
    const result = await run.result;
    active.current.delete(run);
    finishCall(callId, result);
    return result;
  }, [finishCall, recordCall]);

  const cancel = useCallback((): void => {
    cancelled.current = true;
    active.current.forEach((run) => run.cancel());
  }, []);

  // Closing the workspace (unmount) stops every run in flight.
  useEffect(() => () => active.current.forEach((run) => run.cancel()), []);

  const startRun = useCallback((phase: 'outline' | 'slides' | 'action', slideStatus: Record<string, 'queued'> = {}): void => {
    cancelled.current = false;
    store().updateRun(workspaceId, (run) => ({
      phase,
      startedAt: phase === 'slides' && run.phase === 'outline' ? run.startedAt : Date.now(),
      endedAt: null,
      error: null,
      slideStatus,
      calls: phase === 'outline' ? [] : run.calls,
    }));
  }, [store, workspaceId]);

  const endRun = useCallback((error: string | null): void => {
    store().updateRun(workspaceId, (run) => ({
      phase: error ? 'failed' : cancelled.current ? 'cancelled' : 'done',
      endedAt: Date.now(),
      error,
      slideStatus: Object.fromEntries(Object.entries(run.slideStatus).map(([id, status]) => [id, status === 'queued' || status === 'writing' ? (error ? 'failed' : 'cancelled') : status])),
    }));
  }, [store, workspaceId]);

  const seesImages = (engine: EngineChoice): boolean => SEES_IMAGES.has(engine.engine);

  /** The deck's pictures as an engine that sees is shown them (each, or contact sheets); nothing for the others. */
  const showDeckPictures = useCallback(async (engine: EngineChoice, attachments: DesignAttachment[]): Promise<{ images: string[]; view: PictureView }> => {
    const pictures = attachments.filter((entry) => entry.kind === 'image');
    if (!SEES_IMAGES.has(engine.engine) || pictures.length === 0) return { images: [], view: false };
    try {
      const deckDir = deckDirOf(workspaceId);
      return await picturesToShow(pictures.map((entry) => joinPath(deckDir, entry.path)), pictures.map((entry) => entry.name), joinPath(deckDir, PREVIEWS_FOLDER, 'shown'));
    } catch (error) {
      console.warn('Could not prepare the pictures for the AI:', error);
      return { images: [], view: false };
    }
  }, [workspaceId]);

  /** Pass 1: the design system and storyline. Null (with the run marked failed) when it cannot. */
  const direct = useCallback(async (request: DirectionRequest): Promise<DirectionResult | null> => {
    startRun('outline');
    const { text: sources, errors } = await gatherSources('', request.documents);
    if (errors.length > 0) console.warn('Some files could not be read:', errors);
    const { system, prompt } = buildDirectionPrompt({
      prompt: request.prompt,
      attachments: request.attachments,
      sources,
      slideCount: request.slideCount,
      language: request.language,
      canvas: designCanvas(request.size),
      seesImages: seesImages(request.engine) && request.imagePaths.length > 0 ? request.pictureView : false,
      webPhotos: request.webPhotos,
      photosRequested: request.photosRequested,
    });
    const result = await runAi(request.engine, 'Inventing the design and the storyline', system, prompt, { images: seesImages(request.engine) ? request.imagePaths : [] });
    if (!result.ok) {
      store().updateRun(workspaceId, { phase: result.cancelled ? 'cancelled' : 'failed', endedAt: Date.now(), error: result.cancelled ? null : result.error });
      return null;
    }
    const direction = parseDirection(result.text, placeablePictures(request.attachments).map((entry) => entry.path));
    if (!direction) {
      store().updateRun(workspaceId, { phase: 'failed', endedAt: Date.now(), error: 'The AI did not return a usable design. Try again, or describe the presentation in a little more detail.' });
      return null;
    }
    return direction;
  }, [runAi, startRun, store, workspaceId]);

  /** Puts a slide block into the deck. False when its SVG is unusable. */
  const applyBlock = useCallback((slideId: string, block: SlideBlock): boolean => {
    const deck = deckOf(workspaceId);
    if (!deck?.design) return false;
    let svg: string;
    try {
      svg = sanitizeSvg(block.svg, designCanvas(deck.size)).svg;
    } catch (error) {
      console.warn('Slide SVG rejected:', error);
      return false;
    }
    store().edit(workspaceId, (current) => {
      if (!current.design) return current;
      const slides = current.design.slides.map((slide) => (slide.id === slideId ? {
        ...slide,
        svg,
        notes: block.notes || slide.notes,
        title: slide.title && slide.title !== '(untitled)' ? slide.title : block.title || titleFromSvg(svg) || slide.title,
      } : slide));
      return { ...current, design: { ...current.design, slides } };
    }, { skipHistory: true });
    store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, [slideId]: 'done' } }));
    return true;
  }, [store, workspaceId]);

  /** Small copies of deck pictures to attach to a drawing call, for engines that see. */
  const attachPictures = useCallback(async (engine: EngineChoice, assets: string[]): Promise<{ paths: string[]; images: string[] }> => {
    if (!seesImages(engine)) return { paths: [], images: [] };
    const paths: string[] = [];
    const images: string[] = [];
    for (const asset of [...new Set(assets)].filter((entry) => entry.startsWith('assets/')).slice(0, MAX_ATTACHED)) {
      const preview = await deckPicturePreview(deckDirOf(workspaceId), asset);
      if (preview) {
        paths.push(asset);
        images.push(preview);
      }
    }
    return { paths, images };
  }, [workspaceId]);

  /** Draws one batch of pages, filling each as soon as its block is complete. */
  const drawBatch = useCallback(async (ids: string[], reference: { number: number; svg: string } | null): Promise<string | null> => {
    const deck = deckOf(workspaceId);
    if (!deck?.design) return 'No presentation is open.';
    const design = deck.design;
    const indexes = ids.map((id) => design.slides.findIndex((slide) => slide.id === id)).filter((index) => index >= 0);
    if (indexes.length === 0) return null;
    store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, ...Object.fromEntries(ids.map((id) => [id, 'writing' as const])) } }));
    const attached = await attachPictures(deck.brief.engine, indexes.flatMap((index) => design.slides[index].pictures ?? []));
    const { system, prompt } = buildSlidesPrompt({
      title: deck.meta.title,
      language: design.language,
      system: design.system,
      canvas: designCanvas(deck.size),
      pages: design.slides,
      draw: indexes,
      attachments: design.attachments,
      attachedPictures: attached.paths,
      reference,
    });
    const filled = new Set<string>();
    const place = (blocks: SlideBlock[]): void => {
      for (const block of blocks) {
        const byNumber = block.n !== null ? indexes.indexOf(block.n - 1) : -1;
        const position = byNumber >= 0 && !filled.has(design.slides[indexes[byNumber]].id) ? byNumber : indexes.findIndex((index) => !filled.has(design.slides[index].id));
        if (position < 0) continue;
        const id = design.slides[indexes[position]].id;
        if (filled.has(id)) continue;
        if (applyBlock(id, block)) filled.add(id);
      }
    };
    let seen = 0;
    const numbers = indexes.map((index) => index + 1);
    const label = numbers.length === 1 ? `Drawing slide ${numbers[0]}` : `Drawing slides ${numbers[0]}–${numbers[numbers.length - 1]}`;
    const result = await runAi(deck.brief.engine, label, system, prompt, {
      images: attached.images,
      onText: (text) => {
        const blocks = extractSlideBlocks(text);
        if (blocks.length > seen) {
          place(blocks.slice(seen));
          seen = blocks.length;
        }
      },
    });
    if (result.ok) place(extractSlideBlocks(result.text, true).slice(seen));
    const missing = ids.filter((id) => !filled.has(id));
    if (missing.length > 0) {
      const status = result.cancelled || cancelled.current ? 'cancelled' : 'failed';
      store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, ...Object.fromEntries(missing.map((id) => [id, status])) } }));
      if (status === 'cancelled') return null;
      return result.ok ? 'Some slides came back unusable. Select them and choose "Draw again".' : result.error ?? 'The AI run failed.';
    }
    return null;
  }, [applyBlock, attachPictures, runAi, store, workspaceId]);

  /**
   * Pass 2: draws the given pages. The cover goes first, alone, so the other
   * pages can match its look; the rest run a few calls at a time.
   * `fresh` ignores the existing pages as a style reference (after a redesign).
   */
  const drawSlides = useCallback(async (ids: string[], options: { fresh?: boolean } = {}): Promise<void> => {
    const deck = deckOf(workspaceId);
    if (!deck?.design || ids.length === 0) return;
    const order = deck.design.slides.map((slide) => slide.id).filter((id) => ids.includes(id));
    startRun('slides', Object.fromEntries(order.map((id) => [id, 'queued' as const])));
    const referenceFrom = (): { number: number; svg: string } | null => {
      const slides = deckOf(workspaceId)?.design?.slides ?? [];
      const usable = slides.map((slide, index) => ({ slide, index })).filter(({ slide }) => slide.svg && (!options.fresh || !order.includes(slide.id) || drawn.has(slide.id)));
      const pick = usable.find(({ slide }) => slide.role === 'cover') ?? usable[0];
      return pick ? { number: pick.index + 1, svg: pick.slide.svg } : null;
    };
    const drawn = new Set<string>();
    let failure: string | null = null;
    const queue = [...order];
    if (!referenceFrom()) {
      const first = queue.shift()!;
      failure = await drawBatch([first], null);
      drawn.add(first);
    }
    const batches: string[][] = [];
    for (let start = 0; start < queue.length; start += PAGES_PER_CALL) batches.push(queue.slice(start, start + PAGES_PER_CALL));
    const worker = async (): Promise<void> => {
      while (batches.length > 0 && !cancelled.current) {
        const batch = batches.shift()!;
        const error = await drawBatch(batch, referenceFrom());
        batch.forEach((id) => drawn.add(id));
        failure ??= error;
      }
    };
    if (!cancelled.current) await Promise.all(Array.from({ length: Math.min(PARALLEL_CALLS, batches.length) }, worker));
    endRun(failure);
  }, [drawBatch, endRun, startRun, workspaceId]);

  /**
   * Finds a photo per entry (each lists wordings, most specific first) and copies
   * them into the open deck's `assets/`, listed with their credit. The deck's AI
   * finds them with its own web search (a traced, stoppable run); see `webPictures.ts`.
   */
  /** One web-search run for photos, traced and stopped like every other AI call. */
  const searchPhotos = useCallback((engine: EngineChoice, system: string, prompt: string): Promise<AiRunResult> => (
    runAi(engine, 'Searching the web for photos', system, prompt, { webSearch: true })
  ), [runAi]);

  const fetchPhotos = useCallback(async (engine: EngineChoice, wanted: string[][]): Promise<PhotoResult[]> => {
    const dir = deckDirOf(workspaceId);
    if (!dir) return wanted.map(() => ({ ok: false, error: 'No presentation is open.' }));
    let pictures: Array<WebPicture | null>;
    try {
      pictures = await fetchWebPictures(wanted, joinPath(dir, ASSETS_FOLDER), engine, { run: (system, prompt) => searchPhotos(engine, system, prompt) });
    } catch (error) {
      const message = webPictureSource(engine.engine)?.kind === 'ai'
        ? `The web search did not finish (${errorText(error)}). Check the connection and try again.`
        : `Could not reach the photo service (${errorText(error)}). Check the connection and try again.`;
      return wanted.map(() => ({ ok: false, error: message }));
    }
    return Promise.all(pictures.map(async (picture, index): Promise<PhotoResult> => {
      if (!picture) return { ok: false, error: `No photo found for “${wanted[index][0] ?? ''}”. Try describing the picture in other words.` };
      const dataUrl = await invoke<string>('read_file_as_base64', { path: picture.path }).catch(() => null);
      const info = dataUrl ? await pictureInfo(dataUrl).catch(() => null) : null;
      const name = fileName(picture.path);
      return {
        ok: true,
        attachment: { path: `${ASSETS_FOLDER}/${name}`, name, kind: 'image', use: 'slides', width: picture.width, height: picture.height, ...(info ?? {}), caption: `A photo of ${picture.query}`, credit: picture.credit },
      };
    }));
  }, [searchPhotos, workspaceId]);

  /** Lists fetched photos with the deck's pictures (without an undo step: the files are already in the deck). */
  const keepPhotos = useCallback((attachments: DesignAttachment[]): void => {
    if (attachments.length === 0) return;
    store().edit(workspaceId, (current) => (current.design ? {
      ...current,
      design: { ...current.design, attachments: [...current.design.attachments, ...attachments.filter((entry) => !current.design!.attachments.some((known) => known.path === entry.path))] },
    } : current), { skipHistory: true });
  }, [store, workspaceId]);

  /**
   * One page redrawn per an instruction (a web photo is fetched first when asked
   * for). Touches no run state, so several can be in flight under one run.
   */
  const refineSlide = useCallback(async (slideId: string, instruction: string, label: string, options: RefineOptions = {}): Promise<ProposalResult> => {
    const deck = deckOf(workspaceId);
    const design = deck?.design;
    const index = design ? design.slides.findIndex((slide) => slide.id === slideId) : -1;
    if (!deck || !design || index < 0) return { ok: false, cancelled: false, error: 'Select a slide first.' };
    const slide = design.slides[index];
    const svg = options.svg ?? slide.svg;
    const wantsPhoto = wantsWebPhoto(instruction);
    if (wantsPhoto && !webPicturesEnabled()) {
      return { ok: false, cancelled: false, error: 'Photos from the web are turned off. Turn them on in Settings → Presentation → Images, then ask again.' };
    }

    // A picture "from the internet" is searched for and downloaded first, then drawn into the page.
    let attachments = design.attachments;
    let pages = design.slides;
    let brought: string[] = [];
    let told = instruction;
    if (wantsPhoto) {
      const asked = buildPhotoQueryPrompt({
        title: deck.meta.title,
        language: design.language,
        page: { role: slide.role, title: slide.title, brief: slide.brief },
        pageText: textOfSvg(svg),
        instruction,
        selection: options.selection,
      });
      const reply = await runAi(deck.brief.engine, 'Choosing what to photograph', asked.system, asked.prompt);
      if (reply.cancelled || cancelled.current) return { ok: false, cancelled: true, error: 'Stopped.' };
      const queries = reply.ok ? parsePhotoQueries(reply.text) : [];
      const fallback = cleanPictureQuery(slide.title);
      if (queries.length === 0 && fallback) queries.push(fallback);
      if (queries.length === 0) {
        return { ok: false, cancelled: false, error: reply.ok ? 'The AI did not say what to search for. Try again, naming what the photo should show.' : reply.error ?? 'The AI run failed.' };
      }
      const [photo] = await fetchPhotos(deck.brief.engine, [queries]);
      if (cancelled.current) return { ok: false, cancelled: true, error: 'Stopped.' };
      if (!photo.ok) return { ok: false, cancelled: false, error: photo.error };
      keepPhotos([photo.attachment]);
      const asset = photo.attachment.path;
      attachments = [...attachments, photo.attachment];
      pages = design.slides.map((entry, position) => (position === index ? { ...entry, pictures: [...(entry.pictures ?? []), asset].slice(-4) } : entry));
      brought = [asset];
      told = `${instruction.trim()}\nThe photograph from the web is ${asset} (see PICTURES); draw it on the page the way the instruction asks.`;
    }

    const attached = await attachPictures(deck.brief.engine, [...(slide.pictures ?? []), ...brought, ...svgAssetRefs(svg)]);
    const { system, prompt } = buildRefinePrompt({
      title: deck.meta.title,
      language: design.language,
      system: design.system,
      canvas: designCanvas(deck.size),
      pages,
      index,
      svg,
      notes: slide.notes,
      instruction: told,
      attachments,
      attachedPictures: attached.paths,
      selection: options.selection,
    });
    const result = await runAi(deck.brief.engine, label, system, prompt, { images: attached.images });
    const proposal = result.ok ? toProposal(extractSlideBlocks(result.text, true)[0], deck.size) : null;
    // The slide itself is unchanged either way; the review card reports a failure.
    if (proposal) return { ok: true, proposal: brought.length > 0 ? { ...proposal, pictures: brought } : proposal };
    return { ok: false, cancelled: result.cancelled, error: result.ok ? 'The AI did not return a usable slide. Try again.' : result.cancelled ? 'Stopped.' : result.error ?? 'The AI run failed.' };
  }, [attachPictures, fetchPhotos, keepPhotos, runAi, workspaceId]);

  /** Redraws one page per an instruction; the caller shows it for review. */
  const refine = useCallback(async (slideId: string, instruction: string, label: string, options: RefineOptions = {}): Promise<ProposalResult> => {
    startRun('action', { [slideId]: 'queued' });
    store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, [slideId]: 'writing' } }));
    const result = await refineSlide(slideId, instruction, label, options);
    store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, [slideId]: 'done' } }));
    endRun(null);
    return result;
  }, [endRun, refineSlide, startRun, store, workspaceId]);

  /**
   * The same instruction on several pages, a few at a time under one run (each
   * slide's thumbnail shows its own progress). `onResult` hears about each page
   * as it starts and as it ends; nothing is changed in the deck.
   */
  const refineMany = useCallback(async (
    ids: string[],
    instruction: string,
    label: string,
    onResult: (slideId: string, update: { status: 'running' } | { status: 'done'; result: ProposalResult }) => void,
  ): Promise<void> => {
    const order = (deckOf(workspaceId)?.design?.slides ?? []).map((slide) => slide.id).filter((id) => ids.includes(id));
    if (order.length === 0) return;
    startRun('action', Object.fromEntries(order.map((id) => [id, 'queued' as const])));
    const queue = [...order];
    const worker = async (): Promise<void> => {
      while (queue.length > 0 && !cancelled.current) {
        const id = queue.shift()!;
        store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, [id]: 'writing' } }));
        onResult(id, { status: 'running' });
        const result = await refineSlide(id, instruction, label);
        store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, [id]: result.ok ? 'done' : 'failed' } }));
        onResult(id, { status: 'done', result });
      }
    };
    await Promise.all(Array.from({ length: Math.min(REFINE_PARALLEL, order.length) }, worker));
    endRun(null);
  }, [endRun, refineSlide, startRun, store, workspaceId]);

  /** A new page to insert at `at`; the caller shows it for review. */
  const newSlide = useCallback(async (at: number, description: string): Promise<ProposalResult> => {
    const deck = deckOf(workspaceId);
    const design = deck?.design;
    if (!deck || !design) return { ok: false, cancelled: false, error: 'No presentation is open.' };
    startRun('action');
    const reference = design.slides.find((slide) => slide.role === 'cover' && slide.svg) ?? design.slides.find((slide) => slide.svg);
    const { system, prompt } = buildNewSlidePrompt({
      title: deck.meta.title,
      language: design.language,
      system: design.system,
      canvas: designCanvas(deck.size),
      pages: design.slides,
      at,
      description,
      attachments: design.attachments,
      reference: reference ? { number: design.slides.indexOf(reference) + 1, svg: reference.svg } : null,
    });
    const result = await runAi(deck.brief.engine, 'Designing a new slide', system, prompt);
    const proposal = result.ok ? toProposal(extractSlideBlocks(result.text, true)[0], deck.size) : null;
    endRun(null);
    if (proposal) return { ok: true, proposal };
    return { ok: false, cancelled: result.cancelled, error: result.ok ? 'The AI did not return a usable slide. Try again.' : result.cancelled ? 'Stopped.' : result.error ?? 'The AI run failed.' };
  }, [endRun, runAi, startRun, workspaceId]);

  /** A new look for the whole deck: same pages, new design system, every page redrawn. */
  const redesign = useCallback(async (instruction: string): Promise<boolean> => {
    const deck = deckOf(workspaceId);
    const design = deck?.design;
    if (!deck || !design) return false;
    startRun('outline');
    const shown = await showDeckPictures(deck.brief.engine, design.attachments);
    const { system, prompt } = buildDirectionPrompt({
      prompt: instruction,
      attachments: design.attachments,
      sources: '',
      slideCount: design.slides.length,
      language: design.language,
      canvas: designCanvas(deck.size),
      seesImages: shown.view,
      keepPages: design.slides,
      previous: design.system,
    });
    const result = await runAi(deck.brief.engine, 'Inventing a new design', system, prompt, { images: shown.images });
    const direction = result.ok ? parseDirection(result.text) : null;
    if (!direction) {
      store().updateRun(workspaceId, { phase: result.cancelled ? 'cancelled' : 'failed', endedAt: Date.now(), error: result.cancelled ? null : result.ok ? 'The AI did not return a usable design. Try again.' : result.error });
      return false;
    }
    store().edit(workspaceId, (current) => (current.design ? { ...current, design: { ...current.design, system: direction.system } } : current));
    await drawSlides(design.slides.map((slide) => slide.id), { fresh: true });
    return true;
  }, [drawSlides, runAi, showDeckPictures, startRun, store, workspaceId]);

  /**
   * Puts the deck's pictures on its slides: the AI picks the pages and
   * pictures, then only those pages are redrawn. One Undo restores them.
   * Resolves to the number of pages that got pictures, or null on failure.
   */
  const placePictures = useCallback(async (): Promise<number | null> => {
    const deck = deckOf(workspaceId);
    const design = deck?.design;
    if (!deck || !design) return null;
    const known = placeablePictures(design.attachments).map((entry) => entry.path);
    if (known.length === 0) return 0;
    startRun('outline');
    const shown = await showDeckPictures(deck.brief.engine, design.attachments);
    const { system, prompt } = buildPicturePlanPrompt({ title: deck.meta.title, pages: design.slides, attachments: design.attachments, seesImages: shown.view });
    const result = await runAi(deck.brief.engine, 'Choosing pictures for each slide', system, prompt, { images: shown.images });
    const plan = result.ok ? parsePicturePlan(result.text, design.slides.length, known) : null;
    if (!plan || plan.pages.size === 0) {
      store().updateRun(workspaceId, { phase: result.cancelled ? 'cancelled' : 'failed', endedAt: Date.now(), error: result.cancelled ? null : result.ok ? 'The AI did not place any picture. Try again.' : result.error });
      return null;
    }
    const ids = design.slides.filter((_, index) => plan.pages.has(index)).map((slide) => slide.id);
    store().edit(workspaceId, (current) => {
      if (!current.design) return current;
      const slides = current.design.slides.map((slide) => {
        const entry = plan.pages.get(design.slides.findIndex((original) => original.id === slide.id));
        return entry ? { ...slide, pictures: entry.pictures, brief: entry.brief || slide.brief } : slide;
      });
      const attachments = current.design.attachments.map((entry) => (plan.notes[entry.path] ? { ...entry, caption: plan.notes[entry.path] } : entry));
      return { ...current, design: { ...current.design, slides, attachments } };
    });
    await drawSlides(ids);
    return ids.length;
  }, [drawSlides, runAi, showDeckPictures, startRun, store, workspaceId]);

  /**
   * Brings real photos from the web into a finished deck: the AI picks the
   * pages and what to photograph, the photos are downloaded, and only those
   * pages are redrawn around them. One Undo restores the deck.
   * Resolves to `{ placed, missed }`, or null when the run failed (the run state says why).
   */
  const addWebPhotos = useCallback(async (): Promise<{ placed: number; missed: number } | null> => {
    const deck = deckOf(workspaceId);
    const design = deck?.design;
    if (!deck || !design) return null;
    const fail = (error: string): null => {
      store().updateRun(workspaceId, { phase: 'failed', endedAt: Date.now(), error });
      return null;
    };
    startRun('outline');
    if (!webPicturesEnabled()) return fail('Photos from the web are turned off. Turn them on in Settings → Presentation → Images.');
    const max = Math.min(8, Math.max(2, Math.ceil(design.slides.length / 2)));
    const { system, prompt } = buildPhotoPlanPrompt({ title: deck.meta.title, pages: design.slides.map((slide) => ({ ...slide, hasPictures: Boolean(slide.pictures?.length) })), max });
    const result = await runAi(deck.brief.engine, 'Choosing where photos go', system, prompt);
    if (result.cancelled) {
      store().updateRun(workspaceId, { phase: 'cancelled', endedAt: Date.now(), error: null });
      return null;
    }
    const plan = result.ok ? parsePhotoPlan(result.text, design.slides.length, max) : new Map<number, PhotoPlanPage>();
    for (const index of [...plan.keys()]) if (design.slides[index].pictures?.length) plan.delete(index);
    if (plan.size === 0) return fail(result.ok ? 'The AI did not choose a page for a photo. Try again.' : result.error ?? 'The AI run failed.');

    const entries = [...plan.entries()];
    const found = await fetchPhotos(deck.brief.engine, entries.map(([, page]) => page.queries));
    const photos: Array<{ index: number; page: PhotoPlanPage; attachment: DesignAttachment }> = [];
    let lastError = '';
    entries.forEach(([index, page], at) => {
      const outcome = found[at];
      if (outcome.ok) photos.push({ index, page, attachment: outcome.attachment });
      else lastError = outcome.error;
    });
    if (cancelled.current) {
      store().updateRun(workspaceId, { phase: 'cancelled', endedAt: Date.now(), error: null });
      return null;
    }
    if (photos.length === 0) return fail(lastError || 'No photo was found. Try again.');

    const byId = new Map(photos.map(({ index, page, attachment }) => [design.slides[index].id, { page, attachment }] as const));
    store().edit(workspaceId, (current) => {
      if (!current.design) return current;
      const slides = current.design.slides.map((slide) => {
        const hit = byId.get(slide.id);
        return hit ? { ...slide, pictures: [...(slide.pictures ?? []), hit.attachment.path].slice(-4), brief: hit.page.brief || slide.brief } : slide;
      });
      const known = new Set(current.design.attachments.map((entry) => entry.path));
      const attachments = [...current.design.attachments, ...[...byId.values()].map((hit) => hit.attachment).filter((entry) => !known.has(entry.path))];
      return { ...current, design: { ...current.design, slides, attachments } };
    });
    await drawSlides([...byId.keys()]);
    return { placed: photos.length, missed: entries.length - photos.length };
  }, [drawSlides, fetchPhotos, runAi, startRun, store, workspaceId]);

  return { direct, drawSlides, refine, refineMany, newSlide, redesign, placePictures, addWebPhotos, searchPhotos, cancel, seesImages };
}

function toProposal(block: SlideBlock | undefined, size: DeckSize): SlideProposal | null {
  if (!block) return null;
  try {
    const svg = sanitizeSvg(block.svg, designCanvas(size)).svg;
    return { svg, notes: block.notes, title: block.title || titleFromSvg(svg), role: block.role };
  } catch {
    return null;
  }
}

/** Placeholder pages for a storyline, drawn by `drawSlides`. */
export function storySlides(direction: DirectionResult, newId: () => string): DesignedSlide[] {
  return direction.pages.map(({ photo: _photo, ...page }) => ({ id: newId(), ...page, svg: '', notes: '' }));
}
