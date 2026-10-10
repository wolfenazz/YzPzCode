import { useCallback, useEffect, useRef } from 'react';
import { usePresentationSessionStore } from '../../stores/presentationSessionStore';
import { usePresentationStore } from '../../stores/presentationStore';
import type { AiCallRecord } from '../../stores/writingSessionStore';
import {
  buildOutlinePrompt,
  buildPreserveEditPrompt,
  buildSlideEditPrompt,
  buildSlidesPrompt,
  extractSlideObjects,
  parseOutline,
  parsePreserveEdits,
  parseSlides,
  type PreserveAiSlide,
  type SlideAction,
} from '../../utils/presentation/prompts';
import { carryImages, sanitizeSlide, slideToAi } from '../../utils/presentation/sanitize';
import type { DeckBrief, LayoutId, OutlineSlide, Slide } from '../../utils/presentation/types';
import { startAiRun, type AiRun, type AiRunResult } from '../../utils/writing/aiClient';
import { gatherSources } from '../../utils/writing/sources';

let callCounter = 0;
const newCallId = (): string => `call-${Date.now().toString(36)}-${(callCounter += 1).toString(36)}`;

export interface GenerationTarget {
  outlineIndex: number;
  slideId: string;
}

export interface SlideActionResult {
  ok: boolean;
  cancelled: boolean;
  error: string | null;
  after: Slide[];
}

export interface PreserveActionResult {
  ok: boolean;
  cancelled: boolean;
  error: string | null;
  after: PreserveAiSlide[];
}

const ACTION_LABELS: Record<SlideAction, string> = {
  rewrite: 'Rewriting',
  shorten: 'Shortening',
  expand: 'Expanding',
  layout: 'Choosing layouts',
  visualize: 'Building a chart',
  notes: 'Writing speaker notes',
  translate: 'Translating',
  consistency: 'Making the deck consistent',
  coach: 'Coaching the speaker notes',
  imagePrompts: 'Writing image prompts',
  custom: 'Applying your instruction',
};

/** Every AI call of the Presentation studio, with the call trace in the session. */
export function useDeckGenerator(workspaceId: string) {
  const activeRun = useRef<AiRun | null>(null);
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

  const runAi = useCallback(async (brief: DeckBrief, label: string, system: string, prompt: string, onText?: (text: string) => void): Promise<AiRunResult> => {
    const callId = recordCall(label);
    const run = startAiRun({
      engine: brief.engine.engine,
      model: brief.engine.model,
      effort: brief.engine.effort,
      system,
      prompt,
      timeoutSecs: usePresentationStore.getState().aiTimeoutSecs,
      onText,
    });
    activeRun.current = run;
    const result = await run.result;
    if (activeRun.current === run) activeRun.current = null;
    finishCall(callId, result);
    return result;
  }, [finishCall, recordCall]);

  const cancel = useCallback((): void => {
    cancelled.current = true;
    activeRun.current?.cancel();
  }, []);

  // Closing the workspace (unmount) stops any run in flight.
  useEffect(() => () => activeRun.current?.cancel(), []);

  const startRun = useCallback((phase: 'outline' | 'slides' | 'action', slideStatus: Record<string, 'queued'> = {}) => {
    cancelled.current = false;
    store().updateRun(workspaceId, (run) => ({
      phase,
      startedAt: Date.now(),
      endedAt: null,
      error: null,
      slideStatus,
      calls: phase === 'slides' && run.phase === 'idle' ? run.calls : phase === 'action' ? run.calls : [],
    }));
  }, [store, workspaceId]);

  const endRun = useCallback((error: string | null): void => {
    store().updateRun(workspaceId, (run) => ({
      phase: error ? 'failed' : cancelled.current ? 'cancelled' : 'done',
      endedAt: Date.now(),
      error,
      slideStatus: Object.fromEntries(Object.entries(run.slideStatus).map(([id, status]) => [id, status === 'queued' || status === 'writing' ? (error ? 'failed' : cancelled.current ? 'cancelled' : status) : status])),
    }));
  }, [store, workspaceId]);

  /** Asks for the storyline. Null (with the run marked failed) when it cannot. */
  const generateOutline = useCallback(async (brief: DeckBrief): Promise<{ title: string; slides: OutlineSlide[] } | null> => {
    startRun('outline');
    const { text: sources } = await gatherSources(brief.sourceNotes, brief.sourceFiles);
    const { system, prompt } = buildOutlinePrompt(brief, sources);
    const result = await runAi(brief, 'Designing the storyline', system, prompt);
    if (!result.ok) {
      store().updateRun(workspaceId, { phase: result.cancelled ? 'cancelled' : 'failed', endedAt: Date.now(), error: result.error });
      return null;
    }
    const outline = parseOutline(result.text);
    if (!outline) {
      store().updateRun(workspaceId, { phase: 'failed', endedAt: Date.now(), error: 'The AI did not return a usable storyline. Try again, or edit the outline by hand.' });
      return null;
    }
    store().updateRun(workspaceId, { phase: 'idle', endedAt: Date.now() });
    return outline;
  }, [runAi, startRun, store, workspaceId]);

  /** Replaces a placeholder with the slide(s) the AI wrote for it. */
  const applyGenerated = useCallback((raw: unknown, target: GenerationTarget, layout: LayoutId): void => {
    const slides = sanitizeSlide(raw, { fallbackLayout: layout, index: target.outlineIndex, id: target.slideId });
    store().edit(workspaceId, (deck) => {
      const index = deck.slides.findIndex((slide) => slide.id === target.slideId);
      if (index < 0) return deck;
      const next = [...deck.slides];
      next.splice(index, 1, ...slides);
      return { ...deck, slides: next };
    }, { skipHistory: true });
    store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, [target.slideId]: 'done' } }));
  }, [store, workspaceId]);

  /** Writes the slides in batches; each one fills its placeholder as soon as it arrives. */
  const generateSlides = useCallback(async (targets: GenerationTarget[]): Promise<void> => {
    const deck = store().sessions[workspaceId]?.deck;
    if (!deck || targets.length === 0) return;
    const { brief, outline } = deck;
    startRun('slides', Object.fromEntries(targets.map((target) => [target.slideId, 'queued' as const])));
    const { text: sources, errors } = await gatherSources(brief.sourceNotes, brief.sourceFiles);
    if (errors.length > 0) console.warn('Some source files could not be read:', errors);
    const size = usePresentationStore.getState().batchSize;
    let failure: string | null = null;

    for (let start = 0; start < targets.length; start += size) {
      if (cancelled.current) break;
      const batch = targets.slice(start, start + size);
      store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, ...Object.fromEntries(batch.map((target) => [target.slideId, 'writing' as const])) } }));
      const title = store().sessions[workspaceId]?.deck?.meta.title ?? deck.meta.title;
      const { system, prompt } = buildSlidesPrompt({ brief, title, outline, batch: batch.map((target) => target.outlineIndex), sources });
      let applied = 0;
      const apply = (objects: unknown[]): void => {
        while (applied < objects.length && applied < batch.length) {
          const target = batch[applied];
          applyGenerated(objects[applied], target, outline[target.outlineIndex]?.layout ?? 'bullets');
          applied += 1;
        }
      };
      const first = start + 1;
      const last = start + batch.length;
      const result = await runAi(brief, first === last ? `Writing slide ${first}` : `Writing slides ${first}–${last}`, system, prompt, (text) => apply(extractSlideObjects(text)));
      if (result.ok) apply(parseSlides(result.text));
      if (applied < batch.length) {
        const rest = batch.slice(applied);
        const status = result.cancelled || cancelled.current ? 'cancelled' : 'failed';
        store().updateRun(workspaceId, (run) => ({ slideStatus: { ...run.slideStatus, ...Object.fromEntries(rest.map((target) => [target.slideId, status])) } }));
        if (result.cancelled || cancelled.current) break;
        failure = result.ok ? 'The AI did not return every slide. Select the empty ones and use Rewrite, or try again.' : result.error ?? 'The AI run failed.';
        break;
      }
    }
    endRun(failure);
  }, [applyGenerated, endRun, runAi, startRun, store, workspaceId]);

  /** Runs a slide action and returns the replacement slides (the caller shows them for review). */
  const slideAction = useCallback(async (request: { action: SlideAction; slideIds: string[]; instruction?: string; targetLayout?: LayoutId }): Promise<SlideActionResult> => {
    const deck = store().sessions[workspaceId]?.deck;
    if (!deck) return { ok: false, cancelled: false, error: 'No presentation is open.', after: [] };
    const before = request.slideIds.map((id) => deck.slides.find((slide) => slide.id === id)).filter((slide): slide is Slide => Boolean(slide));
    if (before.length === 0) return { ok: false, cancelled: false, error: 'Select a slide first.', after: [] };
    startRun('action');
    const { text: sources } = request.action === 'expand' || request.action === 'visualize'
      ? await gatherSources(deck.brief.sourceNotes, deck.brief.sourceFiles)
      : { text: '' };
    const { system, prompt } = buildSlideEditPrompt({
      brief: deck.brief,
      title: deck.meta.title,
      action: request.action,
      slides: before.map(slideToAi),
      positions: before.map((slide) => deck.slides.indexOf(slide) + 1),
      total: deck.slides.length,
      instruction: request.instruction,
      targetLayout: request.targetLayout,
      sources,
    });
    const result = await runAi(deck.brief, ACTION_LABELS[request.action], system, prompt);
    if (!result.ok) {
      endRun(result.cancelled ? null : result.error);
      return { ok: false, cancelled: result.cancelled, error: result.error, after: [] };
    }
    const raw = parseSlides(result.text);
    if (raw.length === 0) {
      endRun('The AI did not return any slides.');
      return { ok: false, cancelled: false, error: 'The AI did not return any slides. Try again.', after: [] };
    }
    let after: Slide[];
    if (request.action === 'notes' || request.action === 'coach') {
      after = before.map((slide, index) => {
        const notes = (raw[index] as { notes?: unknown } | undefined)?.notes;
        return { ...slide, notes: typeof notes === 'string' && notes.trim() ? notes.trim() : slide.notes };
      });
    } else if (request.action === 'imagePrompts') {
      after = before.map((slide, index) => {
        const entry = (raw[index] ?? {}) as { imagePrompt?: unknown; image?: { prompt?: unknown } };
        const prompt = String(entry.imagePrompt ?? entry.image?.prompt ?? '').trim().slice(0, 2000);
        const name = Object.keys(slide.slots).find((key) => slide.slots[key].type === 'image');
        const image = name ? slide.slots[name] : undefined;
        if (!prompt || !name || image?.type !== 'image') return slide;
        return { ...slide, slots: { ...slide.slots, [name]: { ...image, prompt } } };
      });
    } else {
      after = raw.flatMap((entry, index) => sanitizeSlide(entry, {
        fallbackLayout: before[index]?.layout,
        forceLayout: request.targetLayout,
        index: deck.slides.indexOf(before[Math.min(index, before.length - 1)]),
        // Keep ids 1:1 so selection and the filmstrip stay put.
        id: index < before.length ? before[index].id : undefined,
      }).map((slide, part) => (part === 0 && before[index] ? carryImages(before[index], slide) : slide)));
      // A slide the AI dropped stays as it was.
      for (let index = raw.length; index < before.length; index += 1) after.push(before[index]);
    }
    endRun(null);
    return { ok: true, cancelled: false, error: null, after };
  }, [endRun, runAi, startRun, store, workspaceId]);

  /** Text-only edits for slides of an existing PowerPoint file. */
  const preserveAction = useCallback(async (request: { action: SlideAction; slides: PreserveAiSlide[]; positions: number[]; total: number; instruction?: string }): Promise<PreserveActionResult> => {
    const deck = store().sessions[workspaceId]?.deck;
    if (!deck) return { ok: false, cancelled: false, error: 'No presentation is open.', after: [] };
    startRun('action');
    const { system, prompt } = buildPreserveEditPrompt({
      brief: deck.brief,
      title: deck.meta.title,
      action: request.action,
      slides: request.slides,
      positions: request.positions,
      total: request.total,
      instruction: request.instruction,
    });
    const result = await runAi(deck.brief, ACTION_LABELS[request.action], system, prompt);
    if (!result.ok) {
      endRun(result.cancelled ? null : result.error);
      return { ok: false, cancelled: result.cancelled, error: result.error, after: [] };
    }
    const after = parsePreserveEdits(result.text, request.slides);
    endRun(after ? null : 'The AI did not return usable edits.');
    return after ? { ok: true, cancelled: false, error: null, after } : { ok: false, cancelled: false, error: 'The AI did not return usable edits. Try again.', after: [] };
  }, [endRun, runAi, startRun, store, workspaceId]);

  return { generateOutline, generateSlides, slideAction, preserveAction, cancel };
}
