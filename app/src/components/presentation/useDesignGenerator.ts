import { useCallback, useEffect, useRef } from 'react';
import { usePresentationSessionStore } from '../../stores/presentationSessionStore';
import { usePresentationStore } from '../../stores/presentationStore';
import type { AiCallRecord } from '../../stores/writingSessionStore';
import {
  buildDirectionPrompt,
  buildNewSlidePrompt,
  buildRefinePrompt,
  buildSlidesPrompt,
  extractSlideBlocks,
  parseDirection,
  titleFromSvg,
  type SlideBlock,
} from '../../utils/presentation/designPrompts';
import { designCanvas } from '../../utils/presentation/designStyles';
import type { DesignAttachment, DesignedSlide, DesignSlideRole, DirectionResult } from '../../utils/presentation/designTypes';
import { sanitizeSvg } from '../../utils/presentation/svgSafe';
import type { DeckSize, YzDeck } from '../../utils/presentation/types';
import { startAiRun, type AiRun, type AiRunResult } from '../../utils/writing/aiClient';
import { joinPath } from '../../utils/writing/document';
import { gatherSources } from '../../utils/writing/sources';
import type { EngineChoice } from '../../utils/writing/types';

/** Engines that are shown the user's pictures (the others get a description of each). */
const SEES_IMAGES = new Set(['claude', 'codex']);
/**
 * Pages per AI call, and calls in flight at once, after the cover. A page
 * takes about the same time whatever the batch (2–4 minutes for a rich
 * page), so the largest batch sets the wall time: one page per call, several
 * calls at once, each slide appearing as soon as it is done.
 */
const PAGES_PER_CALL = 1;
const PARALLEL_CALLS = 5;

let callCounter = 0;
const newCallId = (): string => `call-${Date.now().toString(36)}-${(callCounter += 1).toString(36)}`;

export interface DirectionRequest {
  prompt: string;
  attachments: DesignAttachment[];
  /** Absolute paths of the pictures, shown to engines that can see. */
  imagePaths: string[];
  /** Absolute paths of documents whose text the AI should use. */
  documents: string[];
  slideCount: number | null;
  language: string;
  size: DeckSize;
  engine: EngineChoice;
}

/** A redrawn or new page the user reviews before it replaces anything. */
export interface SlideProposal {
  svg: string;
  notes: string;
  title: string;
  role: DesignSlideRole | null;
}

export type ProposalResult = { ok: true; proposal: SlideProposal } | { ok: false; cancelled: boolean; error: string };

const deckOf = (workspaceId: string): YzDeck | null => usePresentationSessionStore.getState().sessions[workspaceId]?.deck ?? null;

/** Every AI call that designs or redraws slides, with progress in the session's run. */
export function useDesignGenerator(workspaceId: string, deckDir: string) {
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

  const runAi = useCallback(async (engine: EngineChoice, label: string, system: string, prompt: string, options: { images?: string[]; onText?: (text: string) => void } = {}): Promise<AiRunResult> => {
    const callId = recordCall(label);
    const run = startAiRun({
      engine: engine.engine,
      model: engine.model,
      effort: engine.effort,
      system,
      prompt,
      images: options.images,
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
      seesImages: seesImages(request.engine) && request.imagePaths.length > 0,
    });
    const result = await runAi(request.engine, 'Inventing the design and the storyline', system, prompt, { images: request.imagePaths });
    if (!result.ok) {
      store().updateRun(workspaceId, { phase: result.cancelled ? 'cancelled' : 'failed', endedAt: Date.now(), error: result.cancelled ? null : result.error });
      return null;
    }
    const direction = parseDirection(result.text);
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

  /** Draws one batch of pages, filling each as soon as its block is complete. */
  const drawBatch = useCallback(async (ids: string[], reference: { number: number; svg: string } | null): Promise<string | null> => {
    const deck = deckOf(workspaceId);
    if (!deck?.design) return 'No presentation is open.';
    const design = deck.design;
    const indexes = ids.map((id) => design.slides.findIndex((slide) => slide.id === id)).filter((index) => index >= 0);
    if (indexes.length === 0) return null;
    store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, ...Object.fromEntries(ids.map((id) => [id, 'writing' as const])) } }));
    const { system, prompt } = buildSlidesPrompt({
      title: deck.meta.title,
      language: design.language,
      system: design.system,
      canvas: designCanvas(deck.size),
      pages: design.slides,
      draw: indexes,
      attachments: design.attachments,
      seesImages: false,
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
  }, [applyBlock, runAi, store, workspaceId]);

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

  /** Redraws one page per an instruction; the caller shows it for review. */
  const refine = useCallback(async (slideId: string, instruction: string, label: string): Promise<ProposalResult> => {
    const deck = deckOf(workspaceId);
    const design = deck?.design;
    const index = design ? design.slides.findIndex((slide) => slide.id === slideId) : -1;
    if (!deck || !design || index < 0) return { ok: false, cancelled: false, error: 'Select a slide first.' };
    const slide = design.slides[index];
    startRun('action', { [slideId]: 'queued' });
    store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, [slideId]: 'writing' } }));
    const { system, prompt } = buildRefinePrompt({
      title: deck.meta.title,
      language: design.language,
      system: design.system,
      canvas: designCanvas(deck.size),
      pages: design.slides,
      index,
      svg: slide.svg,
      notes: slide.notes,
      instruction,
      attachments: design.attachments,
      seesImages: false,
    });
    const result = await runAi(deck.brief.engine, label, system, prompt);
    const proposal = result.ok ? toProposal(extractSlideBlocks(result.text, true)[0], deck.size) : null;
    // The slide itself is unchanged either way; the review card reports a failure.
    store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, [slideId]: 'done' } }));
    endRun(null);
    if (proposal) return { ok: true, proposal };
    return { ok: false, cancelled: result.cancelled, error: result.ok ? 'The AI did not return a usable slide. Try again.' : result.cancelled ? 'Stopped.' : result.error ?? 'The AI run failed.' };
  }, [endRun, runAi, startRun, store, workspaceId]);

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
      seesImages: false,
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
    const imagePaths = design.attachments.filter((entry) => entry.kind === 'image').map((entry) => joinPath(deckDir, entry.path));
    const { system, prompt } = buildDirectionPrompt({
      prompt: instruction,
      attachments: design.attachments,
      sources: '',
      slideCount: design.slides.length,
      language: design.language,
      canvas: designCanvas(deck.size),
      seesImages: seesImages(deck.brief.engine) && imagePaths.length > 0,
      keepPages: design.slides,
      previous: design.system,
    });
    const result = await runAi(deck.brief.engine, 'Inventing a new design', system, prompt, { images: imagePaths });
    const direction = result.ok ? parseDirection(result.text) : null;
    if (!direction) {
      store().updateRun(workspaceId, { phase: result.cancelled ? 'cancelled' : 'failed', endedAt: Date.now(), error: result.cancelled ? null : result.ok ? 'The AI did not return a usable design. Try again.' : result.error });
      return false;
    }
    store().edit(workspaceId, (current) => (current.design ? { ...current, design: { ...current.design, system: direction.system } } : current));
    await drawSlides(design.slides.map((slide) => slide.id), { fresh: true });
    return true;
  }, [deckDir, drawSlides, runAi, startRun, store, workspaceId]);

  return { direct, drawSlides, refine, newSlide, redesign, cancel, seesImages };
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
  return direction.pages.map((page) => ({ id: newId(), ...page, svg: '', notes: '' }));
}
