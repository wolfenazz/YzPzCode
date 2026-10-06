import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExtensionInfo, ExtensionInstallProgress, WorkspaceExtensionPanel } from '../types';
import supportedExtensions from '../data/extensions.json';

interface ExtensionStore {
  catalog: ExtensionInfo[];
  loading: boolean;
  backendReady: boolean;
  error: string | null;
  installing: string[];
  progress: Record<string, ExtensionInstallProgress>;
  panelsByWorkspace: Record<string, WorkspaceExtensionPanel[]>;
  paneOrderByWorkspace: Record<string, string[]>;
  latestVersions: Record<string, string>;
  refreshCatalog: () => Promise<void>;
  checkUpdates: () => Promise<void>;
  install: (extensionId: string) => Promise<void>;
  setProgress: (progress: ExtensionInstallProgress) => void;
  openPanel: (workspaceId: string, extension: ExtensionInfo) => WorkspaceExtensionPanel | null;
  closePanel: (panelId: string) => Promise<void>;
  closeWorkspace: (workspaceId: string) => Promise<void>;
  setPaneOrder: (workspaceId: string, ids: string[]) => void;
}

/** True when `latest` is a newer dotted version than `installed` (prerelease suffixes ignored). */
export function isNewerVersion(latest: string | undefined, installed: string | null): boolean {
  if (!latest || !installed) return false;
  const parse = (value: string) => value.split(/[-+]/)[0].split('.').map((part) => parseInt(part, 10) || 0);
  const a = parse(latest);
  const b = parse(installed);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export const EMPTY_EXTENSION_PANELS: WorkspaceExtensionPanel[] = [];
const supportedIds = new Set(supportedExtensions.map((extension) => extension.id.toLowerCase()));

function restoreSupportedPanels(persistedState: unknown, currentState: ExtensionStore): ExtensionStore {
  const saved = persistedState as Partial<Pick<ExtensionStore, 'panelsByWorkspace' | 'paneOrderByWorkspace'>> | undefined;
  const removedIds = new Set<string>();
  const panelsByWorkspace = Object.fromEntries(Object.entries(saved?.panelsByWorkspace ?? currentState.panelsByWorkspace)
    .map(([workspaceId, panels]) => [workspaceId, panels.filter((panel) => {
      if (supportedIds.has(panel.extensionId.toLowerCase())) return true;
      removedIds.add(panel.id);
      return false;
    })]));
  const paneOrderByWorkspace = Object.fromEntries(Object.entries(saved?.paneOrderByWorkspace ?? currentState.paneOrderByWorkspace)
    .map(([workspaceId, order]) => [workspaceId, order.filter((id) => !removedIds.has(id))]));
  // Retired extensions must not reopen from saved layouts. Their downloaded
  // packages and provider data remain on disk; catalog changes do not erase them.
  return { ...currentState, panelsByWorkspace, paneOrderByWorkspace };
}

export const useExtensionStore = create<ExtensionStore>()(
  persist(
    (set, get) => ({
      catalog: supportedExtensions.map((extension) => ({ ...extension, installedVersion: null, registryUrl: `https://open-vsx.org/extension/${extension.id.replace('.', '/')}` })),
      loading: false, backendReady: false, error: null, installing: [], progress: {}, latestVersions: {},
      panelsByWorkspace: {}, paneOrderByWorkspace: {},
      refreshCatalog: async () => {
        set({ loading: true, error: null });
        try {
          const catalog = await invoke<ExtensionInfo[]>('list_supported_extensions');
          set({ catalog: catalog.filter((extension) => supportedIds.has(extension.id.toLowerCase())), backendReady: true });
          void get().checkUpdates();
        } catch (error) {
          const message = String(error);
          set({ backendReady: false, error: message.includes('list_supported_extensions') && message.includes('not found')
            ? 'Restart YzPzCode to enable extension installation and open panels.' : message });
        } finally {
          set({ loading: false });
        }
      },
      checkUpdates: async () => {
        try {
          set({ latestVersions: await invoke<Record<string, string>>('check_extension_updates') });
        } catch {
          // Offline or registry unavailable: keep the last known result.
        }
      },
      install: async (extensionId) => {
        if (!supportedIds.has(extensionId.toLowerCase())) return;
        if (!get().backendReady) return;
        if (get().installing.includes(extensionId)) return;
        set((state) => ({
          installing: [...state.installing, extensionId],
          progress: { ...state.progress, [extensionId]: {
            extensionId, stage: 'queued', message: 'Preparing installation…', downloadedBytes: 0, totalBytes: null,
          } },
        }));
        try {
          await invoke('install_workspace_extension', { extensionId });
          await get().refreshCatalog();
        } catch (error) {
          get().setProgress({ extensionId, stage: 'failed', message: String(error), downloadedBytes: 0, totalBytes: null });
        } finally {
          set((state) => ({ installing: state.installing.filter((id) => id !== extensionId) }));
        }
      },
      setProgress: (progress) => set((state) => ({ progress: { ...state.progress, [progress.extensionId]: progress } })),
      openPanel: (workspaceId, extension) => {
        if (!supportedIds.has(extension.id.toLowerCase())) return null;
        if (!extension.installedVersion) return null;
        const existing = get().panelsByWorkspace[workspaceId] ?? [];
        // Each pane runs its own host, so the same assistant can be open several times.
        // Later copies are numbered with the lowest free number to tell them apart.
        const names = new Set(existing.filter((panel) => panel.extensionId === extension.id).map((panel) => panel.name));
        let copy = 1;
        while (names.has(copy === 1 ? extension.name : `${extension.name} ${copy}`)) copy += 1;
        const name = copy === 1 ? extension.name : `${extension.name} ${copy}`;
        const panel: WorkspaceExtensionPanel = { id: crypto.randomUUID(), workspaceId, extensionId: extension.id, name };
        set((state) => ({ panelsByWorkspace: { ...state.panelsByWorkspace, [workspaceId]: [...existing, panel] } }));
        return panel;
      },
      closePanel: async (panelId) => {
        await invoke('close_extension_panel', { panelId });
        set((state) => ({
          panelsByWorkspace: Object.fromEntries(Object.entries(state.panelsByWorkspace).map(([id, panels]) => [id, panels.filter((panel) => panel.id !== panelId)])),
          paneOrderByWorkspace: Object.fromEntries(Object.entries(state.paneOrderByWorkspace).map(([id, order]) => [id, order.filter((id) => id !== panelId)])),
        }));
      },
      closeWorkspace: async (workspaceId) => {
        // Remove the panes immediately; the backend also cancels pending starts.
        set((state) => ({
          panelsByWorkspace: { ...state.panelsByWorkspace, [workspaceId]: [] },
          paneOrderByWorkspace: { ...state.paneOrderByWorkspace, [workspaceId]: [], [`extensions:${workspaceId}`]: [] },
        }));
        await invoke('close_workspace_extension_panels', { workspaceId });
      },
      setPaneOrder: (workspaceId, ids) => set((state) => ({ paneOrderByWorkspace: { ...state.paneOrderByWorkspace, [workspaceId]: ids } })),
    }),
    {
      name: 'yzpzcode-extensions',
      partialize: (state) => ({ panelsByWorkspace: state.panelsByWorkspace, paneOrderByWorkspace: state.paneOrderByWorkspace }),
      merge: restoreSupportedPanels,
    },
  ),
);
