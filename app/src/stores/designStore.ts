import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EngineChoice } from '../utils/writing/types';
import type { DesignKind, DesignTokens } from '../utils/design/types';
import { normalizeTokens } from '../utils/design/project';
import { DEFAULT_PRESET, findPreset } from '../utils/design/formats';

export const DEFAULT_DESIGN_ENGINE: EngineChoice = { engine: 'claude', model: '', allowWebResearch: false };

/** The language the AI writes the design's text in; `auto` follows the description. */
export type DesignLanguage = 'auto' | 'English' | 'Arabic' | 'French' | 'Spanish' | 'German' | 'Turkish' | 'Persian' | 'Urdu' | 'Hebrew';
export const DESIGN_LANGUAGES: DesignLanguage[] = ['auto', 'English', 'Arabic', 'French', 'Spanish', 'German', 'Turkish', 'Persian', 'Urdu', 'Hebrew'];

const KINDS: DesignKind[] = ['app', 'web', 'graphic'];

/** Design studio preferences. Projects live in `.yzdesign` files, never here. */
interface DesignStore {
  defaultEngine: EngineChoice;
  language: DesignLanguage;
  defaultKind: DesignKind;
  /** The preset chosen last for each kind (graphics: several). */
  lastPresets: Record<DesignKind, string[]>;
  /** Seconds before one AI call is abandoned. */
  aiTimeoutSecs: number;
  autosaveDelayMs: number;
  snapshotLimit: number;
  /** Offer three looks to choose from before the screens are drawn. */
  exploreDirections: boolean;
  /** How graphics are drawn: free layout (SVG), text layout (HTML), or by template. */
  graphicMode: 'auto' | 'svg' | 'html';
  /** How the preview moves between screens. */
  previewTransition: 'fade' | 'slide' | 'none';
  /** Systems of recent projects, newest first: reusable as a starting look. */
  recentSystems: Array<{ id: string; tokens: DesignTokens; at: number }>;
  /** Last project open in each workspace. */
  lastProjectByWorkspace: Record<string, string>;
  setDefaultEngine: (engine: EngineChoice) => void;
  setPreference: <K extends 'language' | 'defaultKind' | 'aiTimeoutSecs' | 'autosaveDelayMs' | 'snapshotLimit' | 'exploreDirections' | 'previewTransition' | 'graphicMode'>(key: K, value: DesignStore[K]) => void;
  setLastPresets: (kind: DesignKind, presets: string[]) => void;
  setLastProject: (workspaceId: string, path: string | null) => void;
  rememberSystem: (tokens: DesignTokens) => void;
}

export const useDesignStore = create<DesignStore>()(persist((set) => ({
  defaultEngine: DEFAULT_DESIGN_ENGINE,
  language: 'auto',
  defaultKind: 'app',
  lastPresets: { app: [DEFAULT_PRESET.app], web: [DEFAULT_PRESET.web], graphic: [DEFAULT_PRESET.graphic] },
  aiTimeoutSecs: 600,
  autosaveDelayMs: 1500,
  snapshotLimit: 15,
  exploreDirections: false,
  previewTransition: 'fade',
  graphicMode: 'auto',
  recentSystems: [],
  lastProjectByWorkspace: {},
  rememberSystem: (tokens) => set((state) => {
    const key = `${tokens.palette.primary}|${tokens.palette.background}|${tokens.fonts.heading}|${tokens.fonts.body}`.toLowerCase();
    const kept = state.recentSystems.filter((entry) => `${entry.tokens.palette.primary}|${entry.tokens.palette.background}|${entry.tokens.fonts.heading}|${entry.tokens.fonts.body}`.toLowerCase() !== key);
    return { recentSystems: [{ id: `r-${Date.now().toString(36)}`, tokens, at: Date.now() }, ...kept].slice(0, 8) };
  }),
  setDefaultEngine: (engine) => set({ defaultEngine: engine }),
  setPreference: (key, value) => set({ [key]: value } as Partial<DesignStore>),
  setLastPresets: (kind, presets) => set((state) => ({ lastPresets: { ...state.lastPresets, [kind]: presets } })),
  setLastProject: (workspaceId, path) => set((state) => {
    const next = { ...state.lastProjectByWorkspace };
    if (path) next[workspaceId] = path;
    else delete next[workspaceId];
    return { lastProjectByWorkspace: next };
  }),
}), {
  name: 'yzpzcode-design',
  version: 1,
  merge: (persisted, current) => {
    const saved = (persisted ?? {}) as Partial<DesignStore>;
    const lastPresets = { ...current.lastPresets };
    for (const kind of KINDS) {
      const list = saved.lastPresets?.[kind];
      if (Array.isArray(list)) {
        const valid = list.filter((id) => typeof id === 'string' && (kind === 'graphic' ? /^\d{2,4}x\d{2,4}$/.test(id) || findPreset(id) : findPreset(id)));
        if (valid.length > 0) lastPresets[kind] = valid;
      }
    }
    return {
      ...current,
      ...saved,
      defaultEngine: { ...DEFAULT_DESIGN_ENGINE, ...(saved.defaultEngine ?? {}) },
      language: DESIGN_LANGUAGES.includes(saved.language as DesignLanguage) ? saved.language as DesignLanguage : current.language,
      defaultKind: KINDS.includes(saved.defaultKind as DesignKind) ? saved.defaultKind as DesignKind : current.defaultKind,
      lastPresets,
      aiTimeoutSecs: Math.min(3600, Math.max(30, Number(saved.aiTimeoutSecs) || current.aiTimeoutSecs)),
      autosaveDelayMs: Math.min(10000, Math.max(300, Number(saved.autosaveDelayMs) || current.autosaveDelayMs)),
      snapshotLimit: Math.min(100, Math.max(0, Number.isFinite(Number(saved.snapshotLimit)) ? Number(saved.snapshotLimit) : current.snapshotLimit)),
      exploreDirections: Boolean(saved.exploreDirections),
      graphicMode: saved.graphicMode === 'svg' || saved.graphicMode === 'html' ? saved.graphicMode : 'auto',
      previewTransition: saved.previewTransition === 'slide' || saved.previewTransition === 'none' ? saved.previewTransition : 'fade',
      recentSystems: Array.isArray(saved.recentSystems)
        ? saved.recentSystems.slice(0, 8).filter((entry) => entry && typeof entry === 'object').map((entry) => ({ id: String(entry.id ?? ''), tokens: normalizeTokens(entry.tokens), at: Number(entry.at) || 0 }))
        : [],
      lastProjectByWorkspace: saved.lastProjectByWorkspace && typeof saved.lastProjectByWorkspace === 'object' ? saved.lastProjectByWorkspace : {},
    };
  },
}));
