import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TTS_VOICE_BY_LANG } from '../utils/tts/types';
import type { TtsLang, TtsSpeed } from '../utils/tts/types';

/** Speeds offered everywhere narration plays (matches the plan). */
export const TTS_SPEEDS: readonly TtsSpeed[] = [0.75, 1, 1.25];

export const DEFAULT_TTS_MODEL_ID = 'silma';

function isTtsSpeed(value: unknown): value is TtsSpeed {
  return value === 0.75 || value === 1 || value === 1.25;
}

/** Local TTS narration preferences. Audio cache lives in Tauri app-data, never here. */
interface TtsStore {
  /** Master switch; Tasks 4-6 hide narration UI when false. */
  enabled: boolean;
  defaultModelId: string;
  speed: TtsSpeed;
  voiceByLang: Record<TtsLang, string>;
  autoDetect: boolean;
  autoplayInPresenter: boolean;
  /** Synthesize every slide's speaker notes in the background when a deck opens, so Narrate starts at once. */
  prewarmNotes: boolean;
  /** Per-slide model override (slide id -> model id). Empty by default. */
  modelOverrideBySlide: Record<string, string>;

  setEnabled: (enabled: boolean) => void;
  setDefaultModelId: (modelId: string) => void;
  setSpeed: (speed: TtsSpeed) => void;
  setVoice: (lang: TtsLang, voice: string) => void;
  setAutoDetect: (autoDetect: boolean) => void;
  setAutoplayInPresenter: (autoplay: boolean) => void;
  setPrewarmNotes: (prewarm: boolean) => void;
  /** Pass `null` to remove the override for a slide. */
  setSlideModelOverride: (slideId: string, modelId: string | null) => void;
  clearSlideModelOverrides: () => void;
  resetTtsSettings: () => void;
}

export const useTtsStore = create<TtsStore>()(
  persist(
    (set) => ({
      enabled: true,
      defaultModelId: DEFAULT_TTS_MODEL_ID,
      speed: 1,
      voiceByLang: { ...TTS_VOICE_BY_LANG },
      autoDetect: true,
      autoplayInPresenter: false,
      prewarmNotes: true,
      modelOverrideBySlide: {},

      setEnabled: (enabled) => set({ enabled }),
      setDefaultModelId: (modelId) => {
        const clean: string = modelId.trim();
        if (clean) set({ defaultModelId: clean });
      },
      setSpeed: (speed) => set({ speed }),
      setVoice: (lang, voice) => {
        const clean: string = voice.trim();
        if (!clean) return;
        set((state) => ({ voiceByLang: { ...state.voiceByLang, [lang]: clean } }));
      },
      setAutoDetect: (autoDetect) => set({ autoDetect }),
      setAutoplayInPresenter: (autoplay) => set({ autoplayInPresenter: autoplay }),
      setPrewarmNotes: (prewarm) => set({ prewarmNotes: prewarm }),
      setSlideModelOverride: (slideId, modelId) =>
        set((state) => {
          const next: Record<string, string> = { ...state.modelOverrideBySlide };
          if (modelId && modelId.trim()) next[slideId] = modelId.trim();
          else delete next[slideId];
          return { modelOverrideBySlide: next };
        }),
      clearSlideModelOverrides: () => set({ modelOverrideBySlide: {} }),
      resetTtsSettings: () =>
        set({
          enabled: true,
          defaultModelId: DEFAULT_TTS_MODEL_ID,
          speed: 1,
          voiceByLang: { ...TTS_VOICE_BY_LANG },
          autoDetect: true,
          autoplayInPresenter: false,
          prewarmNotes: true,
          modelOverrideBySlide: {},
        }),
    }),
    {
      name: 'yzpzcode-tts',
      version: 1,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<TtsStore>;
        const overrides: Record<string, string> = {};
        if (saved.modelOverrideBySlide && typeof saved.modelOverrideBySlide === 'object') {
          for (const [slideId, modelId] of Object.entries(saved.modelOverrideBySlide)) {
            if (typeof modelId === 'string' && modelId.trim()) overrides[slideId] = modelId.trim();
          }
        }
        const voiceByLang: Record<TtsLang, string> = { ...TTS_VOICE_BY_LANG };
        if (saved.voiceByLang && typeof saved.voiceByLang === 'object') {
          const ar: unknown = (saved.voiceByLang as Record<string, unknown>).ar;
          const en: unknown = (saved.voiceByLang as Record<string, unknown>).en;
          if (typeof ar === 'string' && ar.trim()) voiceByLang.ar = ar.trim();
          if (typeof en === 'string' && en.trim()) voiceByLang.en = en.trim();
        }
        return {
          ...current,
          ...saved,
          defaultModelId:
            typeof saved.defaultModelId === 'string' && saved.defaultModelId.trim()
              ? saved.defaultModelId.trim()
              : current.defaultModelId,
          speed: isTtsSpeed(saved.speed) ? saved.speed : current.speed,
          voiceByLang,
          modelOverrideBySlide: overrides,
        };
      },
    },
  ),
);

/** Effective model for a slide: per-slide override wins, else the default. */
export function resolveTtsModelForSlide(slideId: string | null | undefined): string {
  const state: TtsStore = useTtsStore.getState();
  if (slideId && state.modelOverrideBySlide[slideId]) return state.modelOverrideBySlide[slideId];
  return state.defaultModelId;
}
