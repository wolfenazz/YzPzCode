import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_DECK_ENGINE, MAX_SLIDES, MIN_SLIDES } from '../utils/presentation/deck';
import { sanitizeTemplate } from '../utils/presentation/templates';
import { DECK_THEMES, DEFAULT_THEME_ID, getTheme, sanitizeTheme } from '../utils/presentation/themes';
import type { DeckSize, DeckTemplate, DeckTheme, DeckTone } from '../utils/presentation/types';
import type { EngineChoice } from '../utils/writing/types';

export type StockProvider = 'off' | 'openverse' | 'unsplash' | 'pexels';

/** Presentation preferences, custom themes and templates. Decks live in `.yzdeck` files, never here. */
interface PresentationStore {
  defaultEngine: EngineChoice;
  defaultThemeId: string;
  defaultSize: DeckSize;
  defaultSlideCount: number;
  defaultTone: DeckTone;
  /** Seconds before a single AI call is abandoned. */
  aiTimeoutSecs: number;
  autosaveDelayMs: number;
  /** Rolling copies kept in the deck's `.history` folder. */
  snapshotLimit: number;
  /** Slides per AI call while generating. */
  batchSize: number;
  /** Open the new-presentation wizard when a workspace has no decks yet. */
  openWizardOnStart: boolean;
  /** Last deck open in each workspace, by workspace id. */
  lastDeckByWorkspace: Record<string, string>;
  /** Themes made in the theme editor or imported. */
  customThemes: DeckTheme[];
  templates: DeckTemplate[];
  /** Where "Search photos" looks; Openverse needs no key. */
  stockProvider: StockProvider;
  stockKeys: { unsplash: string; pexels: string };

  saveTheme: (theme: DeckTheme) => void;
  deleteTheme: (id: string) => void;
  saveTemplate: (template: DeckTemplate) => void;
  deleteTemplate: (id: string) => void;
  setStockKey: (provider: 'unsplash' | 'pexels', key: string) => void;

  setDefaultEngine: (engine: EngineChoice) => void;
  setPreference: <K extends 'defaultThemeId' | 'defaultSize' | 'defaultSlideCount' | 'defaultTone' | 'aiTimeoutSecs' | 'autosaveDelayMs' | 'snapshotLimit' | 'batchSize' | 'openWizardOnStart' | 'stockProvider'>(key: K, value: PresentationStore[K]) => void;
  setLastDeck: (workspaceId: string, path: string | null) => void;
}

export const usePresentationStore = create<PresentationStore>()(persist((set) => ({
  defaultEngine: DEFAULT_DECK_ENGINE,
  defaultThemeId: DEFAULT_THEME_ID,
  defaultSize: '16:9',
  defaultSlideCount: 10,
  defaultTone: 'professional',
  aiTimeoutSecs: 600,
  autosaveDelayMs: 1200,
  snapshotLimit: 20,
  batchSize: 5,
  openWizardOnStart: true,
  lastDeckByWorkspace: {},
  customThemes: [],
  templates: [],
  stockProvider: 'openverse',
  stockKeys: { unsplash: '', pexels: '' },

  saveTheme: (theme) => set((state) => ({
    customThemes: state.customThemes.some((entry) => entry.id === theme.id)
      ? state.customThemes.map((entry) => (entry.id === theme.id ? theme : entry))
      : [...state.customThemes, theme],
  })),
  deleteTheme: (id) => set((state) => ({
    customThemes: state.customThemes.filter((entry) => entry.id !== id),
    defaultThemeId: state.defaultThemeId === id ? DEFAULT_THEME_ID : state.defaultThemeId,
  })),
  saveTemplate: (template) => set((state) => ({
    templates: state.templates.some((entry) => entry.id === template.id)
      ? state.templates.map((entry) => (entry.id === template.id ? template : entry))
      : [...state.templates, template],
  })),
  deleteTemplate: (id) => set((state) => ({ templates: state.templates.filter((entry) => entry.id !== id) })),
  setStockKey: (provider, key) => set((state) => ({ stockKeys: { ...state.stockKeys, [provider]: key.trim() } })),
  setDefaultEngine: (engine) => set({ defaultEngine: engine }),
  setPreference: (key, value) => set({ [key]: value } as Partial<PresentationStore>),
  setLastDeck: (workspaceId, path) => set((state) => {
    const next = { ...state.lastDeckByWorkspace };
    if (path) next[workspaceId] = path;
    else delete next[workspaceId];
    return { lastDeckByWorkspace: next };
  }),
}), {
  name: 'yzpzcode-presentation',
  version: 1,
  merge: (persisted, current) => {
    const saved = (persisted ?? {}) as Partial<PresentationStore>;
    const count = Number(saved.defaultSlideCount);
    const customThemes = Array.isArray(saved.customThemes) ? saved.customThemes.map(sanitizeTheme).filter((theme) => !DECK_THEMES.some((preset) => preset.id === theme.id)) : [];
    const templates = Array.isArray(saved.templates) ? saved.templates.map(sanitizeTemplate).filter((entry): entry is DeckTemplate => entry !== null) : [];
    const themeId = saved.defaultThemeId && customThemes.some((theme) => theme.id === saved.defaultThemeId) ? saved.defaultThemeId : getTheme(saved.defaultThemeId).id;
    return {
      ...current,
      ...saved,
      customThemes,
      templates,
      stockKeys: { unsplash: String(saved.stockKeys?.unsplash ?? ''), pexels: String(saved.stockKeys?.pexels ?? '') },
      stockProvider: (['off', 'openverse', 'unsplash', 'pexels'] as const).includes(saved.stockProvider as StockProvider) ? saved.stockProvider as StockProvider : current.stockProvider,
      defaultEngine: { ...DEFAULT_DECK_ENGINE, ...(saved.defaultEngine ?? {}) },
      defaultThemeId: themeId,
      defaultSlideCount: Number.isFinite(count) ? Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, count)) : current.defaultSlideCount,
      batchSize: Math.min(8, Math.max(2, Number(saved.batchSize) || current.batchSize)),
    };
  },
}));

/** A preset or custom theme by id. */
export function findTheme(id: string | null | undefined): DeckTheme {
  return usePresentationStore.getState().customThemes.find((theme) => theme.id === id) ?? getTheme(id);
}
