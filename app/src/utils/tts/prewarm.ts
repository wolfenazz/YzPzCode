import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { useTtsStore } from '../../stores/ttsStore';
import { detectLang } from './langDetect';
import { isTtsOverLimit, ttsFriendlyError } from './strings';
import type { TtsModelInfo } from './types';

/**
 * Background narration: synthesizes every slide's speaker notes ahead of time
 * so Narrate plays from the audio cache at once instead of waiting for the
 * engine (model load + synthesis can take 30 s or more on a CPU).
 *
 * It goes through the same `tts_synthesize` command and the same model/voice
 * resolution as playback, so a finished prewarm is exactly the cache entry
 * playback looks up. One job runs at a time; a Narrate press (`claimForeground`)
 * always wins over it. Progress is published in `usePrewarmStatus`.
 */

export interface SynthParams {
  text: string;
  modelId: string;
  voice: string;
}

export interface SynthOverrides {
  modelId?: string;
  voice?: string;
  slideId?: string | null;
}

/**
 * The model and voice a piece of text is narrated with. Playback and prewarm
 * both use this so they always agree on the cache entry.
 */
export function resolveSynthParams(text: string, opts?: SynthOverrides): SynthParams {
  const store = useTtsStore.getState();
  const clean: string = text.trim();
  const slideId: string | null = opts?.slideId ?? null;
  const modelId: string =
    (
      opts?.modelId ??
      (slideId ? store.modelOverrideBySlide[slideId] : undefined) ??
      store.defaultModelId
    ).trim() || 'silma';
  const voice: string =
    (opts?.voice ?? store.voiceByLang[store.autoDetect ? detectLang(clean) : 'en']).trim() || 'auto';
  return { text: clean, modelId, voice };
}

function synthKey(params: SynthParams): string {
  return params.modelId + '\u0000' + params.voice + '\u0000' + params.text;
}

export interface PrewarmItem {
  id: string;
  text: string;
  /** Position of the slide in the deck, used to start near the slide being viewed. */
  order: number;
}

/* ------------------------------------------------------------------ status */

export type SlideVoiceState = 'waiting' | 'preparing' | 'ready' | 'failed' | 'needsVoice' | 'tooLong';

export type PrewarmPhase =
  /** Nothing to prepare (no notes, or the feature is off). */
  | 'idle'
  /** Waiting for the notes to settle before starting. */
  | 'scheduled'
  | 'running'
  | 'done'
  /** A voice the deck needs is not downloaded. */
  | 'blocked'
  | 'failed';

export interface PrewarmStatus {
  phase: PrewarmPhase;
  /** Per slide id (only slides that have notes). */
  slides: Record<string, SlideVoiceState>;
  total: number;
  ready: number;
  /** Plain-language explanation for `blocked` / `failed`. */
  message: string;
}

const IDLE_STATUS: PrewarmStatus = { phase: 'idle', slides: {}, total: 0, ready: 0, message: '' };

/** Live progress of the background narration; the notes row and the voice list read this. */
export const usePrewarmStatus = create<PrewarmStatus>(() => IDLE_STATUS);

/** Texts this session already turned into audio, so a restart shows them ready straight away. */
const warmed = new Set<string>();

function countReady(slides: Record<string, SlideVoiceState>): number {
  let ready = 0;
  for (const state of Object.values(slides)) if (state === 'ready') ready += 1;
  return ready;
}

function seedStatus(items: PrewarmItem[], phase: PrewarmPhase): void {
  const slides: Record<string, SlideVoiceState> = {};
  for (const item of items) {
    const key = synthKey(resolveSynthParams(item.text, { slideId: item.id }));
    slides[item.id] = warmed.has(key) ? 'ready' : 'waiting';
  }
  usePrewarmStatus.setState({
    phase,
    slides,
    total: items.length,
    ready: countReady(slides),
    message: '',
  });
}

function setSlideState(id: string, state: SlideVoiceState): void {
  usePrewarmStatus.setState((current) => {
    const slides = { ...current.slides, [id]: state };
    return { slides, ready: countReady(slides) };
  });
}

function finishStatus(phase: PrewarmPhase, message = ''): void {
  usePrewarmStatus.setState({ phase, message });
}

/** Whoever last published a status; only that owner may clear it. */
let statusOwner: object | null = null;

/** Shows the deck as queued while its notes settle. */
export function announcePrewarm(owner: object, items: PrewarmItem[]): void {
  statusOwner = owner;
  if (items.length === 0) {
    usePrewarmStatus.setState(IDLE_STATUS);
    return;
  }
  seedStatus(items, 'scheduled');
}

/** Clears the status, unless another deck has published since. */
export function resetPrewarmStatus(owner: object): void {
  if (statusOwner !== owner) return;
  statusOwner = null;
  usePrewarmStatus.setState(IDLE_STATUS);
}

/* ----------------------------------------------------------- coordination */

interface Job {
  key: string;
  runId: string;
  /** Settles when the synthesis has finished, failed or been cancelled; never rejects. */
  done: Promise<void>;
}

/** Bumped by every `startPrewarm` and cancel, so an older run notices it is stale. */
let epoch = 0;
let job: Job | null = null;
/** Narrate presses in progress; background work waits for zero. */
let foreground = 0;
let idleWaiters: Array<() => void> = [];
/** After repeated failures (engine missing, ffmpeg gone...) stay quiet for a while. */
let pausedUntil = 0;
let pausedMessage = '';

const START_ATTEMPTS = 3;
const PAUSE_AFTER_FAILURE_MS = 60_000;

function cancelJob(): void {
  if (job) void invoke('tts_cancel_synth', { runId: job.runId }).catch(() => undefined);
}

function untilIdle(): Promise<void> {
  if (foreground === 0) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

/** Run id of the background job in flight, so the UI can follow its progress. */
export function activePrewarmRunId(): string | null {
  return job?.runId ?? null;
}

/**
 * Call before a user-requested synthesis. If the background job is already
 * narrating this very text, wait for it (its result lands in the cache);
 * otherwise cancel it so the engine is free. Pair with `releaseForeground`.
 */
export async function claimForeground(params: SynthParams): Promise<void> {
  foreground += 1;
  const current = job;
  if (!current) return;
  if (current.key !== synthKey(params)) {
    void invoke('tts_cancel_synth', { runId: current.runId }).catch(() => undefined);
  }
  await current.done;
}

export function releaseForeground(): void {
  foreground = Math.max(0, foreground - 1);
  if (foreground > 0) return;
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const wake of waiters) wake();
}

function looksCancelled(error: unknown): boolean {
  return String(error).toLowerCase().includes('cancel');
}

/** Next pending item: nearest to the slide on screen, preferring later slides on a tie. */
function pickNext(items: PrewarmItem[], pending: number[], activeOrder: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestOrder = -1;
  for (let at = 0; at < pending.length; at += 1) {
    const order = items[pending[at]].order;
    const distance = Math.abs(order - activeOrder);
    if (distance < bestDistance || (distance === bestDistance && order > bestOrder)) {
      best = at;
      bestDistance = distance;
      bestOrder = order;
    }
  }
  return best;
}

const NEEDS_VOICE_MESSAGE =
  'A voice this presentation uses is not downloaded yet. Download it in Settings → Narration.';

async function run(items: PrewarmItem[], activeOrder: () => number, mine: number): Promise<void> {
  const stale = (): boolean => epoch !== mine;
  seedStatus(items, 'running');
  if (Date.now() < pausedUntil) {
    finishStatus('failed', pausedMessage);
    return;
  }

  let ready: Set<string>;
  try {
    const models = await invoke<TtsModelInfo[]>('tts_list_models');
    ready = new Set(models.filter((model) => model.status.state === 'ready').map((model) => model.id));
  } catch {
    if (!stale()) finishStatus('failed', 'Could not check the narration voices.');
    return;
  }
  if (stale()) return;

  const pending: number[] = items.map((_, index) => index);
  const attempts = new Map<number, number>();
  let failures = 0;
  let needsVoice = false;
  let firstFailure = '';

  while (pending.length > 0) {
    await untilIdle();
    if (stale()) return;

    const at = pickNext(items, pending, activeOrder());
    const index = pending[at];
    const item = items[index];
    const params = resolveSynthParams(item.text, { slideId: item.id });
    const key = synthKey(params);

    if (isTtsOverLimit(params.text)) {
      setSlideState(item.id, 'tooLong');
      pending.splice(at, 1);
      continue;
    }
    if (!ready.has(params.modelId)) {
      needsVoice = true;
      setSlideState(item.id, 'needsVoice');
      pending.splice(at, 1);
      continue;
    }
    const tries = (attempts.get(index) ?? 0) + 1;
    attempts.set(index, tries);
    if (tries > START_ATTEMPTS) {
      setSlideState(item.id, 'failed');
      pending.splice(at, 1);
      continue;
    }

    setSlideState(item.id, 'preparing');
    const runId = crypto.randomUUID();
    let failure: unknown = null;
    const synth = invoke('tts_synthesize', {
      modelId: params.modelId,
      text: params.text,
      voice: params.voice,
      runId,
    }).then(
      () => true,
      (error: unknown) => {
        failure = error;
        return false;
      },
    );
    const current: Job = { key, runId, done: synth.then(() => undefined) };
    job = current;
    const ok = await synth;
    if (job === current) job = null;

    if (ok) warmed.add(key);
    if (stale()) return;

    if (ok) {
      setSlideState(item.id, 'ready');
      pending.splice(at, 1);
      failures = 0;
      continue;
    }
    if (looksCancelled(failure)) {
      // A Narrate press took the engine; this item is retried once it is idle.
      setSlideState(item.id, 'waiting');
      continue;
    }
    setSlideState(item.id, 'failed');
    pending.splice(at, 1);
    failures += 1;
    if (!firstFailure) firstFailure = ttsFriendlyError(String(failure));
    if (failures >= 2) {
      pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
      pausedMessage = firstFailure;
      finishStatus('failed', firstFailure);
      return;
    }
  }

  if (firstFailure) finishStatus('failed', firstFailure);
  else if (needsVoice) finishStatus('blocked', NEEDS_VOICE_MESSAGE);
  else finishStatus('done');
}

/**
 * Starts synthesizing `items` in the background, replacing any earlier run.
 * Returns a function that stops this run (a no-op if a newer run replaced it).
 */
export function startPrewarm(
  owner: object,
  items: PrewarmItem[],
  activeOrder: () => number,
): () => void {
  epoch += 1;
  const mine = epoch;
  statusOwner = owner;
  cancelJob();
  void run(items, activeOrder, mine);
  return () => {
    if (epoch !== mine) return;
    epoch += 1;
    cancelJob();
  };
}
