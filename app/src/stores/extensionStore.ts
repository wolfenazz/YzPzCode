import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExtensionDockState, ExtensionInfo, ExtensionInstallProgress, WorkspaceExtensionPanel } from '../types';
import type { AgentActivityState } from '../utils/agentDoneNotifier';
import supportedExtensions from '../data/extensions.json';

type PanelDock = 'side' | 'grid';

/** The outcome of a prompt handed to a panel (utils/extensionPrompt.ts), shown on the panel. */
export interface ExtensionPromptNotice {
  tone: 'pending' | 'success' | 'info' | 'error';
  text: string;
  at: number;
}

interface ExtensionStore {
  catalog: ExtensionInfo[];
  loading: boolean;
  backendReady: boolean;
  error: string | null;
  installing: string[];
  progress: Record<string, ExtensionInstallProgress>;
  panelsByWorkspace: Record<string, WorkspaceExtensionPanel[]>;
  paneOrderByWorkspace: Record<string, string[]>;
  /** The editor's right side panel, per workspace. */
  dockByWorkspace: Record<string, ExtensionDockState>;
  latestVersions: Record<string, string>;
  /** Whether each panel's assistant is working or just finished (not persisted). */
  activityByPanel: Record<string, AgentActivityState>;
  setPanelActivity: (panelId: string, activity: AgentActivityState) => void;
  /** Latest prompt handoff outcome per panel (not persisted). */
  promptNoticeByPanel: Record<string, ExtensionPromptNotice>;
  setPromptNotice: (panelId: string, notice: Omit<ExtensionPromptNotice, 'at'> | null) => void;
  refreshCatalog: () => Promise<void>;
  checkUpdates: () => Promise<void>;
  install: (extensionId: string) => Promise<void>;
  setProgress: (progress: ExtensionInstallProgress) => void;
  openPanel: (workspaceId: string, extension: ExtensionInfo, dock?: PanelDock) => WorkspaceExtensionPanel | null;
  /** Moves a running panel between the Extensions view and the side panel without restarting it. */
  movePanel: (panelId: string, dock: PanelDock) => void;
  closePanel: (panelId: string) => Promise<void>;
  closeWorkspace: (workspaceId: string) => Promise<void>;
  setPaneOrder: (workspaceId: string, ids: string[]) => void;
  setDockOpen: (workspaceId: string, open: boolean) => void;
  toggleDock: (workspaceId: string) => void;
  setDockWidth: (workspaceId: string, width: number) => void;
  setDockActivePanel: (workspaceId: string, panelId: string | null) => void;
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
export const DOCK_DEFAULT_WIDTH = 420;
export const DOCK_MIN_WIDTH = 300;
export const DEFAULT_DOCK_STATE: ExtensionDockState = { open: false, width: DOCK_DEFAULT_WIDTH, activePanelId: null };
const supportedIds = new Set(supportedExtensions.map((extension) => extension.id.toLowerCase()));

export const isSidePanel = (panel: WorkspaceExtensionPanel): boolean => panel.dock === 'side';

function restoreSupportedPanels(persistedState: unknown, currentState: ExtensionStore): ExtensionStore {
  const saved = persistedState as Partial<Pick<ExtensionStore, 'panelsByWorkspace' | 'paneOrderByWorkspace' | 'dockByWorkspace'>> | undefined;
  const removedIds = new Set<string>();
  const panelsByWorkspace = Object.fromEntries(Object.entries(saved?.panelsByWorkspace ?? currentState.panelsByWorkspace)
    .map(([workspaceId, panels]) => [workspaceId, panels.filter((panel) => {
      if (supportedIds.has(panel.extensionId.toLowerCase())) return true;
      removedIds.add(panel.id);
      return false;
    })]));
  const paneOrderByWorkspace = Object.fromEntries(Object.entries(saved?.paneOrderByWorkspace ?? currentState.paneOrderByWorkspace)
    .map(([workspaceId, order]) => [workspaceId, order.filter((id) => !removedIds.has(id))]));
  const dockByWorkspace = Object.fromEntries(Object.entries(saved?.dockByWorkspace ?? currentState.dockByWorkspace)
    .map(([workspaceId, dock]) => [workspaceId, { ...DEFAULT_DOCK_STATE, ...dock, activePanelId: dock.activePanelId && !removedIds.has(dock.activePanelId) ? dock.activePanelId : null }]));
  // Retired extensions must not reopen from saved layouts. Their downloaded
  // packages and provider data remain on disk; catalog changes do not erase them.
  return { ...currentState, panelsByWorkspace, paneOrderByWorkspace, dockByWorkspace };
}

export const useExtensionStore = create<ExtensionStore>()(
  persist(
    (set, get) => {
      const updateDock = (workspaceId: string, patch: (dock: ExtensionDockState) => Partial<ExtensionDockState>): void => {
        set((state) => {
          const dock = state.dockByWorkspace[workspaceId] ?? DEFAULT_DOCK_STATE;
          return { dockByWorkspace: { ...state.dockByWorkspace, [workspaceId]: { ...dock, ...patch(dock) } } };
        });
      };
      return {
        catalog: supportedExtensions.map((extension) => ({ ...extension, installedVersion: null, registryUrl: `https://open-vsx.org/extension/${extension.id.replace('.', '/')}` })),
        loading: false, backendReady: false, error: null, installing: [], progress: {}, latestVersions: {},
        panelsByWorkspace: {}, paneOrderByWorkspace: {}, dockByWorkspace: {}, activityByPanel: {}, promptNoticeByPanel: {},
        setPanelActivity: (panelId, activity) => set((state) => ({ activityByPanel: { ...state.activityByPanel, [panelId]: activity } })),
        setPromptNotice: (panelId, notice) => set((state) => {
          const { [panelId]: _previous, ...rest } = state.promptNoticeByPanel;
          return { promptNoticeByPanel: notice ? { ...rest, [panelId]: { ...notice, at: Date.now() } } : rest };
        }),
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
        openPanel: (workspaceId, extension, dock = 'grid') => {
          if (!supportedIds.has(extension.id.toLowerCase())) return null;
          if (!extension.installedVersion) return null;
          const existing = get().panelsByWorkspace[workspaceId] ?? [];
          // Each pane runs its own host, so the same assistant can be open several times.
          // Later copies are numbered with the lowest free number to tell them apart.
          const names = new Set(existing.filter((panel) => panel.extensionId === extension.id).map((panel) => panel.name));
          let copy = 1;
          while (names.has(copy === 1 ? extension.name : `${extension.name} ${copy}`)) copy += 1;
          const name = copy === 1 ? extension.name : `${extension.name} ${copy}`;
          const panel: WorkspaceExtensionPanel = { id: crypto.randomUUID(), workspaceId, extensionId: extension.id, name, ...(dock === 'side' ? { dock: 'side' as const } : {}) };
          set((state) => ({ panelsByWorkspace: { ...state.panelsByWorkspace, [workspaceId]: [...existing, panel] } }));
          if (dock === 'side') updateDock(workspaceId, () => ({ open: true, activePanelId: panel.id }));
          return panel;
        },
        movePanel: (panelId, dock) => {
          const panel = Object.values(get().panelsByWorkspace).flat().find((entry) => entry.id === panelId);
          if (!panel || isSidePanel(panel) === (dock === 'side')) return;
          set((state) => ({
            panelsByWorkspace: { ...state.panelsByWorkspace, [panel.workspaceId]: (state.panelsByWorkspace[panel.workspaceId] ?? []).map((entry) => {
              if (entry.id !== panelId) return entry;
              const { id, workspaceId, extensionId, name } = entry;
              return dock === 'side' ? { id, workspaceId, extensionId, name, dock: 'side' as const } : { id, workspaceId, extensionId, name };
            }) },
          }));
          if (dock === 'side') updateDock(panel.workspaceId, () => ({ open: true, activePanelId: panelId }));
          else updateDock(panel.workspaceId, (current) => current.activePanelId === panelId ? { activePanelId: nextSidePanel(get().panelsByWorkspace[panel.workspaceId], panelId) } : {});
        },
        closePanel: async (panelId) => {
          await invoke('close_extension_panel', { panelId });
          const panel = Object.values(get().panelsByWorkspace).flat().find((entry) => entry.id === panelId);
          if (panel && get().dockByWorkspace[panel.workspaceId]?.activePanelId === panelId) {
            updateDock(panel.workspaceId, () => ({ activePanelId: nextSidePanel(get().panelsByWorkspace[panel.workspaceId], panelId) }));
          }
          set((state) => ({
            panelsByWorkspace: Object.fromEntries(Object.entries(state.panelsByWorkspace).map(([id, panels]) => [id, panels.filter((panel) => panel.id !== panelId)])),
            paneOrderByWorkspace: Object.fromEntries(Object.entries(state.paneOrderByWorkspace).map(([id, order]) => [id, order.filter((id) => id !== panelId)])),
            activityByPanel: Object.fromEntries(Object.entries(state.activityByPanel).filter(([id]) => id !== panelId)),
            promptNoticeByPanel: Object.fromEntries(Object.entries(state.promptNoticeByPanel).filter(([id]) => id !== panelId)),
          }));
        },
        closeWorkspace: async (workspaceId) => {
          // Remove the panes immediately; the backend also cancels pending starts.
          set((state) => ({
            panelsByWorkspace: { ...state.panelsByWorkspace, [workspaceId]: [] },
            paneOrderByWorkspace: { ...state.paneOrderByWorkspace, [workspaceId]: [], [`extensions:${workspaceId}`]: [] },
            dockByWorkspace: Object.fromEntries(Object.entries(state.dockByWorkspace).filter(([id]) => id !== workspaceId)),
          }));
          await invoke('close_workspace_extension_panels', { workspaceId });
        },
        setPaneOrder: (workspaceId, ids) => set((state) => ({ paneOrderByWorkspace: { ...state.paneOrderByWorkspace, [workspaceId]: ids } })),
        setDockOpen: (workspaceId, open) => updateDock(workspaceId, () => ({ open })),
        toggleDock: (workspaceId) => updateDock(workspaceId, (dock) => ({ open: !dock.open })),
        setDockWidth: (workspaceId, width) => updateDock(workspaceId, () => ({ width: Math.max(DOCK_MIN_WIDTH, Math.round(width)) })),
        setDockActivePanel: (workspaceId, panelId) => updateDock(workspaceId, () => ({ activePanelId: panelId })),
      };
    },
    {
      name: 'yzpzcode-extensions',
      partialize: (state) => ({ panelsByWorkspace: state.panelsByWorkspace, paneOrderByWorkspace: state.paneOrderByWorkspace, dockByWorkspace: state.dockByWorkspace }),
      merge: restoreSupportedPanels,
    },
  ),
);

/** The side panel tab to show once `removedId` leaves the dock: its right neighbour, else its left. */
function nextSidePanel(panels: WorkspaceExtensionPanel[] | undefined, removedId: string): string | null {
  const side = (panels ?? []).filter(isSidePanel);
  const index = side.findIndex((panel) => panel.id === removedId);
  const remaining = side.filter((panel) => panel.id !== removedId);
  if (remaining.length === 0) return null;
  return remaining[Math.min(Math.max(index, 0), remaining.length - 1)].id;
}
