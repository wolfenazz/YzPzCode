import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EngineChoice } from '../utils/writing/types';

export const DEFAULT_SHEETS_ENGINE: EngineChoice = { engine: 'claude', model: '', allowWebResearch: false };

/** The language the assistant answers in; `auto` follows the request. */
export type SheetsLanguage = 'auto' | 'English' | 'Arabic' | 'French' | 'Spanish' | 'German' | 'Turkish' | 'Persian' | 'Urdu' | 'Hebrew';
export const SHEETS_LANGUAGES: SheetsLanguage[] = ['auto', 'English', 'Arabic', 'French', 'Spanish', 'German', 'Turkish', 'Persian', 'Urdu', 'Hebrew'];

/** Sheets preferences. Workbooks live in `.xlsx` files, never here. */
interface SheetsStore {
  defaultEngine: EngineChoice;
  language: SheetsLanguage;
  /** Seconds before one AI call is abandoned. */
  aiTimeoutSecs: number;
  autosaveDelayMs: number;
  /** Rolling copies kept in the workbook's `.yzsheet/history` folder. */
  snapshotLimit: number;
  /** Rounds an assistant may spend reading cells before it must answer. */
  maxReadRounds: number;
  /** Last workbook open in each workspace. */
  lastWorkbookByWorkspace: Record<string, string>;
  /** New sheets in new workbooks start right to left. */
  newSheetsRtl: boolean;
  showFormulaBar: boolean;
  setDefaultEngine: (engine: EngineChoice) => void;
  setPreference: <K extends 'language' | 'aiTimeoutSecs' | 'autosaveDelayMs' | 'snapshotLimit' | 'maxReadRounds' | 'newSheetsRtl' | 'showFormulaBar'>(key: K, value: SheetsStore[K]) => void;
  setLastWorkbook: (workspaceId: string, path: string | null) => void;
}

export const useSheetsStore = create<SheetsStore>()(persist((set) => ({
  defaultEngine: DEFAULT_SHEETS_ENGINE,
  language: 'auto',
  aiTimeoutSecs: 600,
  autosaveDelayMs: 1500,
  snapshotLimit: 15,
  maxReadRounds: 3,
  lastWorkbookByWorkspace: {},
  newSheetsRtl: false,
  showFormulaBar: true,
  setDefaultEngine: (engine) => set({ defaultEngine: engine }),
  setPreference: (key, value) => set({ [key]: value } as Partial<SheetsStore>),
  setLastWorkbook: (workspaceId, path) => set((state) => {
    const next = { ...state.lastWorkbookByWorkspace };
    if (path) next[workspaceId] = path;
    else delete next[workspaceId];
    return { lastWorkbookByWorkspace: next };
  }),
}), {
  name: 'yzpzcode-sheets',
  version: 1,
  merge: (persisted, current) => {
    const saved = (persisted ?? {}) as Partial<SheetsStore>;
    return {
      ...current,
      ...saved,
      defaultEngine: { ...DEFAULT_SHEETS_ENGINE, ...(saved.defaultEngine ?? {}) },
      language: SHEETS_LANGUAGES.includes(saved.language as SheetsLanguage) ? saved.language as SheetsLanguage : current.language,
      aiTimeoutSecs: Math.min(3600, Math.max(30, Number(saved.aiTimeoutSecs) || current.aiTimeoutSecs)),
      autosaveDelayMs: Math.min(10000, Math.max(300, Number(saved.autosaveDelayMs) || current.autosaveDelayMs)),
      snapshotLimit: Math.min(100, Math.max(0, Number.isFinite(Number(saved.snapshotLimit)) ? Number(saved.snapshotLimit) : current.snapshotLimit)),
      maxReadRounds: Math.min(6, Math.max(0, Number.isFinite(Number(saved.maxReadRounds)) ? Number(saved.maxReadRounds) : current.maxReadRounds)),
      lastWorkbookByWorkspace: saved.lastWorkbookByWorkspace && typeof saved.lastWorkbookByWorkspace === 'object' ? saved.lastWorkbookByWorkspace : {},
    };
  },
}));
