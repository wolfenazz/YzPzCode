import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTtsStore } from '../stores/ttsStore';
import {
  activePrewarmRunId,
  claimForeground,
  releaseForeground,
  resolveSynthParams,
} from '../utils/tts/prewarm';
import type { SynthParams } from '../utils/tts/prewarm';
import { isTtsOverLimit, ttsBilingual, ttsFriendlyError } from '../utils/tts/strings';
import { localFileUrl } from '../utils/mediaFiles';
import type { TtsSpeed, TtsSynthProgress, TtsSynthResult } from '../utils/tts/types';

export type TtsPlaybackStatus = 'idle' | 'preparing' | 'synthesizing' | 'playing' | 'error';

export interface SpeakOptions {
  modelId?: string;
  voice?: string;
  speed?: TtsSpeed;
  /** Recorded as `activeSlideId`; callers stop on slide change (see below). */
  slideId?: string;
}

export interface TtsPlaybackApi {
  status: TtsPlaybackStatus;
  /** 0..100. Backend synth percent while preparing/synthesizing, playhead percent while playing. */
  progress: number;
  /** Latest backend status line ("Loading the SILMA voice model…", "Synthesizing 2 of 5…"). */
  message: string;
  errorMsg: string | null;
  activeSlideId: string | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  speak: (text: string, opts?: SpeakOptions) => Promise<boolean>;
  stop: () => void;
}

/**
 * One shared `HTMLAudioElement` for the whole app: a new Play stops the old
 * one, so narration never overlaps. Lazily created so imports stay safe where
 * `Audio` does not exist.
 */
let sharedAudio: HTMLAudioElement | null = null;

function getSharedAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
    sharedAudio.preservesPitch = true;
  }
  return sharedAudio;
}

function haltSharedAudio(): void {
  if (sharedAudio) {
    sharedAudio.pause();
    sharedAudio.onended = null;
    sharedAudio.onerror = null;
  }
}

/**
 * Every mounted hook instance (the presenter, each Narrate button...) shares
 * the audio element but keeps its own state. When one starts or stops, the
 * others must drop their "playing" state and abandon any synthesis in flight,
 * or they would show a Stop button for audio that is gone and start playing
 * over the new narration when their own request finishes.
 */
const instances = new Map<number, () => void>();
let nextInstanceId = 1;

function abandonOthers(selfId: number): void {
  for (const [id, abandon] of instances) {
    if (id !== selfId) abandon();
  }
}

/**
 * Local-TTS playback: `invoke('tts_synthesize')`, then play the returned WAV
 * through the `yzpzmedia` protocol (`localFileUrl`).
 *
 * Speed is applied only by the player (`playbackRate`): the backend always
 * synthesizes at natural speed, so changing speed is instant and shares one
 * cached WAV.
 *
 * Cancellation: every `speak`/`stop` bumps a generation counter, so stale
 * results never start playing, and the backend run (named by a `runId` sent
 * with the request) is cancelled so the engine is free for the next request.
 *
 * Slide-change policy: pass `slideId` to `speak`; callers must call `stop()`
 * when the visible slide changes and on unmount — unmount alone is handled
 * here.
 */
export function useTtsPlayback(): TtsPlaybackApi {
  const [status, setStatus] = useState<TtsPlaybackStatus>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(getSharedAudio());
  const genRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const runIdRef = useRef<string | null>(null);
  const idRef = useRef<number>(0);
  if (idRef.current === 0) idRef.current = nextInstanceId++;
  const speed = useTtsStore((state) => state.speed);

  /** Drops this instance's own work (no audio halt, no notification of others). */
  const abandon = useCallback((): void => {
    genRef.current += 1;
    cancelAnimationFrame(rafRef.current);
    const runId: string | null = runIdRef.current;
    runIdRef.current = null;
    if (runId) void invoke('tts_cancel_synth', { runId }).catch(() => undefined);
    setStatus('idle');
    setProgress(0);
    setMessage('');
    setActiveSlideId(null);
  }, []);

  useEffect(() => {
    const id: number = idRef.current;
    instances.set(id, abandon);
    return () => {
      instances.delete(id);
      genRef.current += 1;
      cancelAnimationFrame(rafRef.current);
      const runId: string | null = runIdRef.current;
      runIdRef.current = null;
      if (runId) void invoke('tts_cancel_synth', { runId }).catch(() => undefined);
      // Only silence the shared element when this instance owns the narration.
      if (status === 'playing' || status === 'preparing' || status === 'synthesizing') {
        haltSharedAudio();
      }
    };
    // `status` is intentionally read at unmount time through the closure of the
    // last render; re-registering on every status change would churn the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abandon]);

  // Speed changes apply to the audio that is already playing.
  useEffect(() => {
    const audio: HTMLAudioElement | null = getSharedAudio();
    if (audio && status === 'playing') audio.playbackRate = speed;
  }, [speed, status]);

  const stop = useCallback((): void => {
    abandonOthers(idRef.current);
    haltSharedAudio();
    abandon();
    setErrorMsg(null);
  }, [abandon]);

  const speak = useCallback(
    async (text: string, opts?: SpeakOptions): Promise<boolean> => {
      abandonOthers(idRef.current);
      // Cancel this instance's previous run (if any) before starting a new one.
      abandon();
      const gen: number = genRef.current;

      const store = useTtsStore.getState();
      const clean: string = text.trim();
      if (!clean) {
        setErrorMsg(ttsBilingual('emptyNotes'));
        setStatus('error');
        return false;
      }
      // Client-side ceiling (mirrors backend MAX_TEXT_CHARS): refuse before invoke.
      if (isTtsOverLimit(clean)) {
        setErrorMsg(ttsBilingual('tooLong'));
        setStatus('error');
        return false;
      }

      const audio: HTMLAudioElement | null = getSharedAudio();
      audioRef.current = audio;
      if (!audio) {
        setErrorMsg('Audio playback is not available in this context.');
        setStatus('error');
        return false;
      }
      // A new Play always stops whatever the shared element was playing.
      haltSharedAudio();

      const playSpeed: TtsSpeed = opts?.speed ?? store.speed;
      const slideId: string | null = opts?.slideId ?? null;
      // Same resolution the background prewarm uses, so it hits the same cache entry.
      const params: SynthParams = resolveSynthParams(clean, {
        modelId: opts?.modelId,
        voice: opts?.voice,
        slideId,
      });
      const { modelId, voice } = params;
      const runId: string = crypto.randomUUID();
      runIdRef.current = runId;

      setErrorMsg(null);
      setStatus('preparing');
      setProgress(0);
      setMessage('');
      setActiveSlideId(slideId);

      // Progress events carry this request's runId, so a stale run of the same
      // model can never drive the bar.
      // While this text is already being prepared in the background, follow
      // that job's progress instead.
      const unlistenProgress = await listen<TtsSynthProgress>('tts-synth-progress', (event) => {
        if (genRef.current !== gen) return;
        if (event.payload.runId !== runId && event.payload.runId !== activePrewarmRunId()) return;
        if (typeof event.payload.percent === 'number') setProgress(event.payload.percent);
        if (event.payload.message) setMessage(event.payload.message);
        if (event.payload.stage === 'synthesizing') setStatus('synthesizing');
        else if (event.payload.stage === 'preparing') setStatus('preparing');
      });
      if (genRef.current !== gen) {
        // Stopped while the listener was being registered: do not synthesize.
        unlistenProgress();
        return false;
      }

      let claimed = false;
      try {
        // The background prewarm yields the engine to this request (or, when it
        // is preparing this very text, finishes it first so it is a cache hit).
        await claimForeground(params);
        claimed = true;
        if (genRef.current !== gen) return false;
        // Tauri maps these camelCase args to the snake_case Rust params.
        const result = await invoke<TtsSynthResult>('tts_synthesize', {
          modelId,
          text: clean,
          voice,
          runId,
        });
        if (genRef.current !== gen) return false;
        runIdRef.current = null;

        audio.src = localFileUrl(result.wavPath);
        audio.playbackRate = playSpeed;
        setStatus('playing');
        setMessage('');
        audio.onended = () => {
          if (genRef.current !== gen) return;
          cancelAnimationFrame(rafRef.current);
          setStatus('idle');
          setProgress(100);
          setActiveSlideId(null);
        };
        audio.onerror = () => {
          if (genRef.current !== gen) return;
          cancelAnimationFrame(rafRef.current);
          setErrorMsg(ttsBilingual('synthFailed'));
          setStatus('error');
        };
        // `timeupdate` fires only a few times per second; follow the playhead
        // per frame while playing (same pattern as MediaPreview).
        const tick = (): void => {
          if (genRef.current !== gen || audio.paused) return;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setProgress(Math.min(100, Math.max(0, (audio.currentTime / audio.duration) * 100)));
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        await audio.play();
        return true;
      } catch (error) {
        if (genRef.current === gen) {
          const name: string = (error as DOMException)?.name ?? '';
          // AbortError only means a newer speak()/stop() pre-empted this one.
          if (name !== 'AbortError') {
            runIdRef.current = null;
            const raw: string = typeof error === 'string' ? error : String(error);
            setErrorMsg(ttsFriendlyError(raw));
            setStatus('error');
          }
        }
        return false;
      } finally {
        if (claimed) releaseForeground();
        unlistenProgress();
      }
    },
    [abandon],
  );

  return { status, progress, message, errorMsg, activeSlideId, audioRef, speak, stop };
}
