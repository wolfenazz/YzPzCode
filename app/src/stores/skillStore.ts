import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAppStore } from './appStore';
import type {
  InstalledSkillsResponse,
  InstallSkillRequest,
  SkillAuditResponse,
  SkillDetail,
  SkillInstallProgress,
  SkillListResponse,
  SkillSearchResponse,
  SkillSummary,
} from '../types';

export type SkillTrendingView = 'trending' | 'hot' | 'all-time';
export type SkillScope = 'global' | 'project';

const PER_PAGE = 20;
const EMPTY_INSTALLED: InstalledSkillsResponse = { project: [], global: [] };

export interface InstallSkillOverride {
  skill?: string;
  source?: string;
  agents?: string[];
  scope?: SkillScope;
  workspacePath?: string;
  useCopy?: boolean;
}

interface SkillStore {
  trending: SkillSummary[];
  searchResults: SkillSummary[];
  query: string;
  view: SkillTrendingView;
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  detail: SkillDetail | null;
  audit: SkillAuditResponse | null;
  installed: InstalledSkillsResponse;
  installing: string[];
  progress: Record<string, SkillInstallProgress>;
  scope: SkillScope;
  customSource: string;
  useCopy: boolean;
  selectedAgents: string[];
  setQuery: (query: string) => void;
  setView: (view: SkillTrendingView) => void;
  setScope: (scope: SkillScope) => void;
  setCustomSource: (source: string) => void;
  setUseCopy: (useCopy: boolean) => void;
  toggleAgent: (agent: string) => void;
  setSelectedAgents: (agents: string[]) => void;
  loadTrending: (view?: SkillTrendingView, append?: boolean) => Promise<void>;
  search: (query?: string) => Promise<void>;
  clearSearch: () => void;
  loadDetail: (skillId: string) => Promise<void>;
  loadAudit: (skillId: string) => Promise<void>;
  refreshInstalled: (workspacePath?: string) => Promise<void>;
  install: (override?: InstallSkillOverride) => Promise<string | null>;
  remove: (skillName: string, agent?: string, workspacePath?: string, global?: boolean) => Promise<void>;
  update: (skillNames?: string[], global?: boolean) => Promise<void>;
  setProgress: (progress: SkillInstallProgress) => void;
}

/** Mirrors the backend display id (skill slug, falling back to source). */
function installKey(skill: string | undefined, source: string): string {
  return skill && skill.trim() !== '' ? skill : source;
}

/** Prefix the backend puts on "this needs a skills.sh API key" errors. */
export const SKILLS_KEY_PREFIX = 'SKILLS_API_KEY_REQUIRED:';

export function isSkillsKeyError(message: string | null): boolean {
  return message != null && message.startsWith(SKILLS_KEY_PREFIX);
}

export function stripSkillsKeyPrefix(message: string): string {
  return isSkillsKeyError(message) ? message.slice(SKILLS_KEY_PREFIX.length).trim() : message;
}

/** Configured skills.sh API key (Settings → Agents), or null when unset. */
export function skillsApiKey(): string | null {
  const key = useAppStore.getState().skillsApiKey.trim();
  return key === '' ? null : key;
}

export const useSkillStore = create<SkillStore>()(
  persist(
    (set, get) => ({
      trending: [],
      searchResults: [],
      query: '',
      view: 'trending',
      page: 1,
      hasMore: false,
      loading: false,
      error: null,
      detail: null,
      audit: null,
      installed: EMPTY_INSTALLED,
      installing: [],
      progress: {},
      scope: 'global',
      customSource: '',
      useCopy: false,
      selectedAgents: [],
      setQuery: (query) => set({ query }),
      setView: (view) => set({ view }),
      setScope: (scope) => set({ scope }),
      setCustomSource: (source) => set({ customSource: source }),
      setUseCopy: (useCopy) => set({ useCopy }),
      toggleAgent: (agent) => set((state) => ({
        selectedAgents: state.selectedAgents.includes(agent)
          ? state.selectedAgents.filter((entry) => entry !== agent)
          : [...state.selectedAgents, agent],
      })),
      setSelectedAgents: (agents) => set({ selectedAgents: agents }),
      loadTrending: async (view, append) => {
        const nextView = view ?? get().view;
        const nextPage = append ? get().page + 1 : 1;
        set({ loading: true, error: null, view: nextView });
        try {
          const response = await invoke<SkillListResponse>('list_trending_skills', {
            view: nextView,
            page: nextPage,
            perPage: PER_PAGE,
            apiKey: skillsApiKey(),
          });
          set((state) => ({
            trending: append ? [...state.trending, ...response.data] : response.data,
            page: response.pagination.page,
            hasMore: response.pagination.hasMore,
          }));
        } catch (error) {
          set({ error: String(error) });
        } finally {
          set({ loading: false });
        }
      },
      search: async (query) => {
        const nextQuery = (query ?? get().query).trim();
        set({ query: query ?? get().query });
        if (nextQuery.length < 2) {
          set({ searchResults: [] });
          return;
        }
        set({ loading: true, error: null });
        try {
          const response = await invoke<SkillSearchResponse>('search_skills', {
            query: nextQuery,
            limit: PER_PAGE,
            apiKey: skillsApiKey(),
          });
          set({ searchResults: response.data });
        } catch (error) {
          set({ error: String(error) });
        } finally {
          set({ loading: false });
        }
      },
      clearSearch: () => set({ searchResults: [] }),
      loadDetail: async (skillId) => {
        set({ loading: true, error: null, detail: null });
        try {
          set({ detail: await invoke<SkillDetail>('get_skill_detail', { skillId, apiKey: skillsApiKey() }) });
        } catch (error) {
          set({ error: String(error) });
        } finally {
          set({ loading: false });
        }
      },
      loadAudit: async (skillId) => {
        set({ audit: null });
        try {
          set({ audit: await invoke<SkillAuditResponse>('get_skill_audit', { skillId, apiKey: skillsApiKey() }) });
        } catch (error) {
          // A missing key is an expected state (panel shows an inline hint),
          // not a global error.
          const message = String(error);
          if (!isSkillsKeyError(message)) set({ error: message });
        }
      },
      refreshInstalled: async (workspacePath) => {
        set({ loading: true, error: null });
        try {
          set({
            installed: await invoke<InstalledSkillsResponse>('list_installed_skills', {
              workspacePath: workspacePath ?? null,
            }),
          });
        } catch (error) {
          set({ error: String(error) });
        } finally {
          set({ loading: false });
        }
      },
      install: async (override) => {
        const state = get();
        const source = (override?.source ?? state.customSource).trim();
        const skill = override?.skill?.trim() ? override.skill.trim() : undefined;
        const agents = override?.agents ?? state.selectedAgents;
        const scope = override?.scope ?? state.scope;
        const useCopy = override?.useCopy ?? state.useCopy;
        const workspacePath = override?.workspacePath ?? null;
        if (!source) {
          set({ error: 'A skill source is required.' });
          return null;
        }
        if (agents.length === 0) {
          set({ error: 'Select at least one agent.' });
          return null;
        }
        const key = installKey(skill, source);
        if (state.installing.includes(key)) return null;
        const request: InstallSkillRequest = {
          source,
          skill: skill ?? null,
          agents,
          scope,
          workspacePath,
          useCopy,
        };
        set((previous) => ({
          installing: [...previous.installing, key],
          error: null,
          progress: {
            ...previous.progress,
            [key]: { skillId: key, source, stage: 'queued', message: 'Preparing installation…', percent: 5 },
          },
        }));
        try {
          const output = await invoke<string>('install_skill', { request });
          await get().refreshInstalled(override?.workspacePath);
          return output;
        } catch (error) {
          const message = String(error);
          get().setProgress({ skillId: key, source, stage: 'failed', message, percent: null });
          set({ error: message });
          return null;
        } finally {
          set((previous) => ({ installing: previous.installing.filter((id) => id !== key) }));
        }
      },
      remove: async (skillName, agent, workspacePath, global) => {
        const isGlobal = global ?? get().scope === 'global';
        set({ loading: true, error: null });
        try {
          await invoke<string>('remove_skill', {
            skillName,
            agent: agent ?? null,
            global: isGlobal,
            workspacePath: workspacePath ?? null,
          });
          await get().refreshInstalled(workspacePath);
        } catch (error) {
          set({ error: String(error) });
        } finally {
          set({ loading: false });
        }
      },
      update: async (skillNames, global) => {
        set({ loading: true, error: null });
        try {
          await invoke<string>('update_skills', {
            skillNames: skillNames ?? null,
            global: global ?? get().scope === 'global',
          });
        } catch (error) {
          set({ error: String(error) });
        } finally {
          set({ loading: false });
        }
      },
      setProgress: (progress) => set((state) => ({ progress: { ...state.progress, [progress.skillId]: progress } })),
    }),
    {
      name: 'yzpzcode-skills',
      partialize: (state) => ({ scope: state.scope }),
    },
  ),
);
