import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ApplicationRunConfig } from '../types';

interface RunConfigStore {
  configs: ApplicationRunConfig[];
  selectedByProject: Record<string, string>;
  saveConfig: (config: ApplicationRunConfig) => void;
  removeConfig: (id: string) => void;
  selectTarget: (project: string, id: string) => void;
}

export function normalizeRunPath(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/$/, '');
  return navigator.userAgent.toLowerCase().includes('windows') ? normalized.toLowerCase() : normalized;
}

export const useRunConfigStore = create<RunConfigStore>()(persist((set) => ({
  configs: [],
  selectedByProject: {},
  saveConfig: (config) => set((state) => ({
    configs: [...state.configs.filter((item) => item.id !== config.id), config],
  })),
  removeConfig: (id) => set((state) => ({
    configs: state.configs.filter((item) => item.id !== id),
    selectedByProject: Object.fromEntries(Object.entries(state.selectedByProject).filter(([, target]) => target !== id)),
  })),
  selectTarget: (project, id) => set((state) => ({ selectedByProject: { ...state.selectedByProject, [normalizeRunPath(project)]: id } })),
}), { name: 'yzpzcode-application-runs' }));
