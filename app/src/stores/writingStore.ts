import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBrief, DEFAULT_ENGINE, DEFAULT_VOICE } from '../utils/writing/document';
import { defaultHumanizer } from '../utils/writing/humanizer';
import { getReportType } from '../utils/writing/reportTypes';
import { applyTheme, sanitizeStyle, styleFromTheme } from '../utils/writing/stylePresets';
import type { EngineChoice, HumanizerSettings, ReportBrief, ReportProfile } from '../utils/writing/types';
import type { WorkspaceKind } from '../types';

/** Writing preferences and report profiles. Document bodies live in `.yzdoc` files, never here. */
interface WritingStore {
  profiles: ReportProfile[];
  defaultProfileId: string | null;
  defaultEngine: EngineChoice;
  /** Humanizer settings new reports start from when no profile is chosen. */
  defaultHumanizer: HumanizerSettings;
  defaultThemeId: string | null;
  showExperimentalEngines: boolean;
  /** Seconds before a single AI call is abandoned. */
  aiTimeoutSecs: number;
  autosaveDelayMs: number;
  /** Rolling copies kept in the report's `.history` folder. */
  snapshotLimit: number;
  /** Open the commission wizard when a writing workspace has no reports yet. */
  openWizardOnStart: boolean;
  /** The mode last picked on the setup page. */
  lastWorkspaceKind: WorkspaceKind;
  /** Last report open in each workspace, by workspace id. */
  lastDocByWorkspace: Record<string, string>;

  saveProfile: (profile: ReportProfile) => void;
  deleteProfile: (id: string) => void;
  duplicateProfile: (id: string) => ReportProfile | null;
  setDefaultProfile: (id: string | null) => void;
  importProfiles: (profiles: ReportProfile[]) => number;
  setDefaultEngine: (engine: EngineChoice) => void;
  setDefaultHumanizer: (settings: HumanizerSettings) => void;
  setDefaultThemeId: (id: string | null) => void;
  setPreference: <K extends 'showExperimentalEngines' | 'aiTimeoutSecs' | 'autosaveDelayMs' | 'snapshotLimit' | 'openWizardOnStart'>(key: K, value: WritingStore[K]) => void;
  setLastDoc: (workspaceId: string, path: string | null) => void;
  setLastWorkspaceKind: (kind: WorkspaceKind) => void;
  restoreBuiltIns: () => void;
}

let profileCounter = 0;
export const newProfileId = (): string => {
  profileCounter += 1;
  return `profile-${Date.now().toString(36)}-${profileCounter.toString(36)}`;
};

function builtIn(id: string, name: string, description: string, typeId: string, overrides: Partial<ReportProfile> = {}): ReportProfile {
  const type = getReportType(typeId);
  return {
    id,
    name,
    description,
    typeId,
    details: { targetWords: type.targetWords },
    style: styleFromTheme(type.themeId, { citationStyle: type.citationStyle, includeToc: type.includeToc !== false }),
    voice: { ...DEFAULT_VOICE, tone: type.tone },
    humanizer: defaultHumanizer(),
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

export const BUILT_IN_PROFILES: ReportProfile[] = [
  builtIn('builtin-senior-project', 'Senior Project Report', 'IEEE citations, numbered chapters, Times New Roman, team voice.', 'senior-project', {
    voice: { ...DEFAULT_VOICE, tone: 'formal', person: 'first-plural' },
    humanizer: defaultHumanizer('scholarly'),
  }),
  builtIn('builtin-research-apa', 'Academic Research Paper (APA)', 'APA 7, IMRaD structure, measured scholarly voice.', 'research-paper', {
    humanizer: defaultHumanizer('scholarly'),
  }),
  builtIn('builtin-quarterly-financial', 'Quarterly Financial Report', 'Financial Ledger style, ratio tables, sober register.', 'financial-analysis', {
    details: { targetWords: 4500, fields: { currency: 'USD millions' } },
  }),
  builtIn('builtin-business-proposal', 'Business Proposal', 'Modern corporate look, persuasive client-facing voice.', 'business-proposal', {
    voice: { ...DEFAULT_VOICE, tone: 'persuasive', person: 'first-plural' },
  }),
];

/** Repairs a profile loaded from storage or an import file. */
export function sanitizeProfile(value: unknown): ReportProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ReportProfile>;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const typeId = getReportType(String(raw.typeId ?? 'custom')).id;
  const humanizerBase = defaultHumanizer(raw.humanizer?.presetId);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newProfileId(),
    name: raw.name.trim().slice(0, 80),
    description: String(raw.description ?? '').slice(0, 300),
    typeId,
    details: raw.details && typeof raw.details === 'object' ? raw.details : {},
    style: sanitizeStyle(raw.style),
    voice: { ...DEFAULT_VOICE, ...(raw.voice ?? {}) },
    humanizer: {
      ...humanizerBase,
      ...(raw.humanizer ?? {}),
      bannedPhrases: Array.isArray(raw.humanizer?.bannedPhrases) ? raw.humanizer!.bannedPhrases.map(String) : humanizerBase.bannedPhrases,
    },
    engine: raw.engine ? { ...DEFAULT_ENGINE, ...raw.engine } : undefined,
    builtIn: Boolean(raw.builtIn),
    createdAt: Number(raw.createdAt ?? Date.now()),
    updatedAt: Number(raw.updatedAt ?? Date.now()),
  };
}

/** A profile capturing a brief's reusable parts (not its title or topic). */
export function profileFromBrief(brief: ReportBrief, name: string, description = ''): ReportProfile {
  const { details } = brief;
  const now = Date.now();
  return {
    id: newProfileId(),
    name,
    description,
    typeId: brief.typeId,
    details: {
      authors: details.authors,
      organization: details.organization,
      audience: details.audience,
      language: details.language,
      targetWords: details.targetWords,
      fields: { ...details.fields },
    },
    style: { ...brief.style, margins: { ...brief.style.margins } },
    voice: { ...brief.voice },
    humanizer: { ...brief.humanizer, bannedPhrases: [...brief.humanizer.bannedPhrases] },
    engine: { ...brief.engine },
    createdAt: now,
    updatedAt: now,
  };
}

export const useWritingStore = create<WritingStore>()(persist((set, get) => ({
  profiles: BUILT_IN_PROFILES,
  defaultProfileId: null,
  defaultEngine: DEFAULT_ENGINE,
  defaultHumanizer: defaultHumanizer(),
  defaultThemeId: null,
  showExperimentalEngines: false,
  aiTimeoutSecs: 600,
  autosaveDelayMs: 1200,
  snapshotLimit: 20,
  openWizardOnStart: true,
  lastWorkspaceKind: 'coding',
  lastDocByWorkspace: {},

  saveProfile: (profile) => set((state) => {
    const next = { ...profile, builtIn: false, updatedAt: Date.now() };
    const exists = state.profiles.some((entry) => entry.id === profile.id);
    return { profiles: exists ? state.profiles.map((entry) => (entry.id === profile.id ? next : entry)) : [...state.profiles, next] };
  }),
  deleteProfile: (id) => set((state) => ({
    profiles: state.profiles.filter((entry) => entry.id !== id),
    defaultProfileId: state.defaultProfileId === id ? null : state.defaultProfileId,
  })),
  duplicateProfile: (id) => {
    const source = get().profiles.find((entry) => entry.id === id);
    if (!source) return null;
    const copy: ReportProfile = {
      ...structuredClone(source),
      id: newProfileId(),
      name: `${source.name} copy`,
      builtIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => ({ profiles: [...state.profiles, copy] }));
    return copy;
  },
  setDefaultProfile: (id) => set({ defaultProfileId: id }),
  importProfiles: (profiles) => {
    const clean = profiles.map(sanitizeProfile).filter((entry): entry is ReportProfile => entry !== null)
      .map((entry) => ({ ...entry, id: newProfileId(), builtIn: false }));
    set((state) => ({ profiles: [...state.profiles, ...clean] }));
    return clean.length;
  },
  setDefaultEngine: (engine) => set({ defaultEngine: engine }),
  setDefaultHumanizer: (settings) => set({ defaultHumanizer: settings }),
  setDefaultThemeId: (id) => set({ defaultThemeId: id }),
  setPreference: (key, value) => set({ [key]: value } as Partial<WritingStore>),
  setLastDoc: (workspaceId, path) => set((state) => {
    const next = { ...state.lastDocByWorkspace };
    if (path) next[workspaceId] = path;
    else delete next[workspaceId];
    return { lastDocByWorkspace: next };
  }),
  setLastWorkspaceKind: (kind) => set({ lastWorkspaceKind: kind }),
  restoreBuiltIns: () => set((state) => ({
    profiles: [...BUILT_IN_PROFILES, ...state.profiles.filter((entry) => !entry.builtIn)],
  })),
}), {
  name: 'yzpzcode-writing',
  version: 1,
  merge: (persisted, current) => {
    const saved = (persisted ?? {}) as Partial<WritingStore>;
    const profiles = Array.isArray(saved.profiles)
      ? saved.profiles.map(sanitizeProfile).filter((entry): entry is ReportProfile => entry !== null)
      : current.profiles;
    return {
      ...current,
      ...saved,
      profiles,
      defaultEngine: { ...DEFAULT_ENGINE, ...(saved.defaultEngine ?? {}) },
      defaultHumanizer: { ...defaultHumanizer(), ...(saved.defaultHumanizer ?? {}) },
    };
  },
}));

/** A brief for a new report, from a profile or the store defaults. */
export function briefForNewReport(typeId: string, profileId: string | null): ReportBrief {
  const state = useWritingStore.getState();
  const profile = profileId ? state.profiles.find((entry) => entry.id === profileId) ?? null : null;
  const brief = createBrief(typeId, profile, state.defaultEngine);
  if (!profile) {
    brief.humanizer = { ...state.defaultHumanizer, bannedPhrases: [...state.defaultHumanizer.bannedPhrases] };
    if (state.defaultThemeId) brief.style = applyTheme(brief.style, state.defaultThemeId);
  }
  return brief;
}
