import { useEffect, useMemo, useRef } from 'react';
import { announcePrewarm, resetPrewarmStatus, startPrewarm } from '../utils/tts/prewarm';
import type { PrewarmItem } from '../utils/tts/prewarm';
import { useTtsStore } from '../stores/ttsStore';

/** Quiet time before synthesizing, so typing in the notes never starts a run per keystroke. */
const SETTLE_MS = 2500;

interface NotedSlide {
  id: string;
  notes?: string;
}

/**
 * Prepares narration for every slide's speaker notes in the background while a
 * deck is open, so pressing Narrate plays from the audio cache immediately.
 *
 * Restarts (after a short settle) when a note's text, a slide's model or the
 * voice settings change; cached notes cost nothing, so only the edited ones
 * are synthesized again. Starts with the slide on screen and works outward.
 * `enabled` should be false while the workspace is hidden, so two open decks
 * never compete for the engine.
 */
export function useNarrationPrewarm(
  slides: readonly NotedSlide[] | null | undefined,
  activeId: string | null,
  enabled: boolean,
): void {
  const ttsEnabled = useTtsStore((state) => state.enabled);
  const prewarmNotes = useTtsStore((state) => state.prewarmNotes);
  const defaultModelId = useTtsStore((state) => state.defaultModelId);
  const voiceByLang = useTtsStore((state) => state.voiceByLang);
  const autoDetect = useTtsStore((state) => state.autoDetect);
  const overrides = useTtsStore((state) => state.modelOverrideBySlide);
  const active: boolean = enabled && ttsEnabled && prewarmNotes;

  const items = useMemo<PrewarmItem[]>(() => {
    if (!active || !slides) return [];
    const list: PrewarmItem[] = [];
    slides.forEach((slide, order) => {
      const text: string = (slide.notes ?? '').trim();
      if (text) list.push({ id: slide.id, text, order });
    });
    return list;
  }, [active, slides]);

  // Edits to anything but the notes leave this string unchanged, so they never restart the run.
  const signature: string = useMemo(
    () => items.map((item) => item.id + '\u0000' + item.text).join('\u0001'),
    [items],
  );

  const itemsRef = useRef<PrewarmItem[]>(items);
  itemsRef.current = items;
  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;

  // Identifies this deck's status so a hidden deck can never clear the visible one's.
  const ownerRef = useRef<object>({});
  useEffect(() => {
    const owner = ownerRef.current;
    return () => resetPrewarmStatus(owner);
  }, []);

  useEffect(() => {
    const owner = ownerRef.current;
    if (!active || signature === '') {
      resetPrewarmStatus(owner);
      return;
    }
    announcePrewarm(owner, itemsRef.current);
    let stop: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      stop = startPrewarm(owner, itemsRef.current, () => {
        const id = activeIdRef.current;
        const found = id ? (slidesRef.current ?? []).findIndex((slide) => slide.id === id) : -1;
        return found >= 0 ? found : 0;
      });
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      stop?.();
    };
    // `items` is read through a ref: `signature` already captures every change that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, signature, defaultModelId, voiceByLang, autoDetect, overrides]);
}
