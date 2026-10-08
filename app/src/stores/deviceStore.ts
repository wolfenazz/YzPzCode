import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  AvdInfo,
  EmulatorInfo,
  FileEntry,
  FileContent,
  FlutterDevice,
  FlutterLogLine,
  FlutterRunMode,
  FlutterRunState,
  IosSnapshot,
  SetupLogEvent,
  SetupProgressEvent,
  SetupReport,
} from '../types';
import { isDartFile, isFlutterPubspec, isInside, isPubspec, normalizePath, parseBootTarget } from '../components/workspace/device/deviceModel';

/**
 * The device panel: Android emulator and iOS simulator lifecycle, the
 * embedded screen's layout, Flutter run sessions (hot reload on save) and the
 * Flutter setup. `avds` and `emulators` hold both platforms; iOS entries carry
 * `platform: 'ios'` and use the UDID as name and serial. Live state comes from
 * backend events (`android-emulators-changed`, `ios-simulators-changed`,
 * `flutter-run-*`, `flutter-setup-*`), subscribed once by `ensureDeviceListeners`.
 */

export const DEVICE_DEFAULT_WIDTH = 420;
export const DEVICE_MIN_WIDTH = 300;
export const CONSOLE_DEFAULT_HEIGHT = 200;
const MAX_LOG_LINES = 4000;
const MAX_SETUP_LINES = 3000;

export interface DevicePanelLayout {
  open: boolean;
  width: number;
  consoleOpen: boolean;
  consoleHeight: number;
}

export const DEFAULT_DEVICE_LAYOUT: DevicePanelLayout = {
  open: false,
  width: DEVICE_DEFAULT_WIDTH,
  consoleOpen: true,
  consoleHeight: CONSOLE_DEFAULT_HEIGHT,
};

export interface LogEntry {
  id: number;
  text: string;
  level: FlutterLogLine['level'];
}

export interface SetupStepState {
  phase: SetupProgressEvent['phase'];
  message: string | null;
  percent: number | null;
}

interface DeviceState {
  // Persisted preferences
  layoutByWorkspace: Record<string, DevicePanelLayout>;
  selectedAvd: string | null;
  runTargetByWorkspace: Record<string, string>;
  projectByWorkspace: Record<string, string>;
  runMode: FlutterRunMode;
  reloadOnSave: boolean;
  pubGetOnSave: boolean;
  showFrame: boolean;
  showStats: boolean;

  // Live state
  avds: AvdInfo[];
  emulators: EmulatorInfo[];
  /** Xcode's simulator tools work here (macOS with Xcode). */
  iosAvailable: boolean;
  /** idb_companion is installed, so simulator screens can be embedded. */
  iosCompanion: boolean;
  flutterDevices: FlutterDevice[];
  devicesLoading: boolean;
  devicesError: string | null;
  flutterProjects: Record<string, string[]>;
  report: SetupReport | null;
  reportLoading: boolean;
  setupSteps: Record<string, SetupStepState>;
  setupLog: LogEntry[];
  setupRunning: boolean;
  setupError: string | null;
  runs: Record<string, FlutterRunState>;
  logs: Record<string, LogEntry[]>;

  setOpen: (workspaceId: string, open: boolean) => void;
  toggle: (workspaceId: string) => void;
  setWidth: (workspaceId: string, width: number) => void;
  setConsoleOpen: (workspaceId: string, open: boolean) => void;
  setConsoleHeight: (workspaceId: string, height: number) => void;
  selectAvd: (name: string | null) => void;
  selectRunTarget: (workspaceId: string, id: string) => void;
  selectProject: (workspaceId: string, dir: string) => void;
  setRunMode: (mode: FlutterRunMode) => void;
  setReloadOnSave: (value: boolean) => void;
  setPubGetOnSave: (value: boolean) => void;
  setShowFrame: (value: boolean) => void;
  setShowStats: (value: boolean) => void;

  refreshAvds: () => Promise<void>;
  refreshEmulators: () => Promise<void>;
  refreshIos: () => Promise<void>;
  refreshFlutterDevices: () => Promise<void>;
  detectProjects: (workspaceId: string, root: string) => Promise<string[]>;
  checkSetup: () => Promise<void>;
  runSetup: (steps: string[]) => Promise<void>;
  cancelSetup: () => Promise<void>;
  startEmulator: (avdName: string, options?: { coldBoot?: boolean; wipeData?: boolean }) => Promise<EmulatorInfo>;
  stopEmulator: (serial: string) => Promise<void>;
  dismissEmulator: (serial: string) => Promise<void>;
  startRun: (workspaceId: string, cwd: string, targetId: string) => Promise<void>;
  reload: (workspaceId: string, full: boolean) => Promise<void>;
  stopRun: (workspaceId: string) => Promise<void>;
  pubGet: (workspaceId: string, cwd: string) => Promise<void>;
  appendLog: (workspaceId: string, text: string, level: LogEntry['level']) => void;
  clearLog: (workspaceId: string) => void;
}

let nextLogId = 1;
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const isIos = (device: { platform?: string } | undefined): boolean => device?.platform === 'ios';

const isRunActive = (run: FlutterRunState | undefined): boolean =>
  !!run && run.phase !== 'Stopped' && run.phase !== 'Failed';

/** Waits until the emulator reports Running, or fails. */
function waitForBoot(serial: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = (emulators: EmulatorInfo[]): boolean => {
      const emulator = emulators.find((e) => e.serial === serial);
      if (emulator?.phase === 'Running') { resolve(); return true; }
      if (!emulator || emulator.phase === 'Failed' || emulator.phase === 'Stopped') {
        reject(new Error(emulator?.error ?? 'The emulator stopped before it finished booting.'));
        return true;
      }
      return false;
    };
    if (check(useDeviceStore.getState().emulators)) return;
    const unsubscribe = useDeviceStore.subscribe((state) => { if (check(state.emulators)) unsubscribe(); });
  });
}

export const useDeviceStore = create<DeviceState>()(persist((set, get) => {
  const updateLayout = (workspaceId: string, patch: Partial<DevicePanelLayout>): void => {
    set((state) => ({
      layoutByWorkspace: {
        ...state.layoutByWorkspace,
        [workspaceId]: { ...DEFAULT_DEVICE_LAYOUT, ...state.layoutByWorkspace[workspaceId], ...patch },
      },
    }));
  };

  return {
    layoutByWorkspace: {},
    selectedAvd: null,
    runTargetByWorkspace: {},
    projectByWorkspace: {},
    runMode: 'debug',
    reloadOnSave: true,
    pubGetOnSave: true,
    showFrame: true,
    showStats: false,

    avds: [],
    emulators: [],
    iosAvailable: false,
    iosCompanion: false,
    flutterDevices: [],
    devicesLoading: false,
    devicesError: null,
    flutterProjects: {},
    report: null,
    reportLoading: false,
    setupSteps: {},
    setupLog: [],
    setupRunning: false,
    setupError: null,
    runs: {},
    logs: {},

    setOpen: (workspaceId, open) => updateLayout(workspaceId, { open }),
    toggle: (workspaceId) => updateLayout(workspaceId, { open: !(get().layoutByWorkspace[workspaceId]?.open ?? false) }),
    setWidth: (workspaceId, width) => updateLayout(workspaceId, { width: Math.round(width) }),
    setConsoleOpen: (workspaceId, consoleOpen) => updateLayout(workspaceId, { consoleOpen }),
    setConsoleHeight: (workspaceId, consoleHeight) => updateLayout(workspaceId, { consoleHeight: Math.round(consoleHeight) }),
    selectAvd: (selectedAvd) => set({ selectedAvd }),
    selectRunTarget: (workspaceId, id) => set((state) => ({ runTargetByWorkspace: { ...state.runTargetByWorkspace, [workspaceId]: id } })),
    selectProject: (workspaceId, dir) => set((state) => ({ projectByWorkspace: { ...state.projectByWorkspace, [workspaceId]: dir } })),
    setRunMode: (runMode) => set({ runMode }),
    setReloadOnSave: (reloadOnSave) => set({ reloadOnSave }),
    setPubGetOnSave: (pubGetOnSave) => set({ pubGetOnSave }),
    setShowFrame: (showFrame) => set({ showFrame }),
    setShowStats: (showStats) => set({ showStats }),

    refreshAvds: async () => {
      try {
        const android = await invoke<AvdInfo[]>('android_list_avds');
        set((state) => ({ avds: [...android, ...state.avds.filter(isIos)] }));
      } catch (error) { console.error('Could not list virtual devices:', error); }
    },
    refreshEmulators: async () => {
      try {
        const android = await invoke<EmulatorInfo[]>('android_list_emulators');
        set((state) => ({ emulators: [...android, ...state.emulators.filter(isIos)] }));
      } catch (error) { console.error('Could not list emulators:', error); }
    },
    refreshIos: async () => {
      try {
        const snapshot = await invoke<IosSnapshot>('ios_list_simulators');
        set((state) => ({
          avds: [...state.avds.filter((a) => !isIos(a)), ...snapshot.devices],
          emulators: [...state.emulators.filter((e) => !isIos(e)), ...snapshot.simulators],
          iosAvailable: snapshot.available,
          iosCompanion: snapshot.companionInstalled,
        }));
      } catch (error) { console.error('Could not list iOS simulators:', error); }
    },
    refreshFlutterDevices: async () => {
      if (get().devicesLoading) return;
      set({ devicesLoading: true, devicesError: null });
      try { set({ flutterDevices: await invoke<FlutterDevice[]>('flutter_list_devices') }); }
      catch (error) { set({ devicesError: errorText(error) }); }
      finally { set({ devicesLoading: false }); }
    },

    detectProjects: async (workspaceId, root) => {
      const isFlutterDir = async (dir: string): Promise<boolean> => {
        try {
          const pubspec = await invoke<FileContent>('read_file_content', { path: `${dir}/pubspec.yaml` });
          return isFlutterPubspec(pubspec.content);
        } catch { return false; }
      };
      const found: string[] = [];
      if (await isFlutterDir(root)) found.push(root);
      try {
        const entries = await invoke<FileEntry[]>('list_directory_entries', { path: root });
        const candidates = entries.filter((e) => e.isDir && !e.name.startsWith('.') && !['build', 'node_modules', 'ios', 'android'].includes(e.name));
        const results = await Promise.all(candidates.map(async (e) => ((await isFlutterDir(e.path)) ? e.path : null)));
        found.push(...results.filter((p): p is string => !!p));
      } catch { /* unreadable workspace root */ }
      set((state) => ({ flutterProjects: { ...state.flutterProjects, [workspaceId]: found } }));
      return found;
    },

    checkSetup: async () => {
      set({ reportLoading: true });
      try {
        const report = await invoke<SetupReport>('android_setup_check');
        set({ report, setupRunning: report.runningStep !== null || get().setupRunning });
      } catch (error) {
        console.error('Could not check the Flutter environment:', error);
      } finally {
        set({ reportLoading: false });
      }
    },
    runSetup: async (steps) => {
      set({ setupRunning: true, setupError: null, setupSteps: {} });
      try { await invoke('android_setup_run', { steps }); }
      catch (error) { set({ setupRunning: false, setupError: errorText(error) }); }
    },
    cancelSetup: async () => { await invoke('android_setup_cancel'); },

    startEmulator: async (avdName, options) => {
      set({ selectedAvd: avdName });
      const ios = isIos(get().avds.find((a) => a.name === avdName));
      const info = ios
        ? await invoke<EmulatorInfo>('ios_start_simulator', { udid: avdName, options: options ?? null })
        : await invoke<EmulatorInfo>('android_start_emulator', { avdName, options: options ?? null });
      set((state) => ({ emulators: [...state.emulators.filter((e) => e.serial !== info.serial), info] }));
      return info;
    },
    stopEmulator: async (serial) => {
      const ios = isIos(get().emulators.find((e) => e.serial === serial));
      await invoke(ios ? 'ios_stop_simulator' : 'android_stop_emulator', { serial });
    },
    dismissEmulator: async (serial) => {
      const ios = isIos(get().emulators.find((e) => e.serial === serial));
      await invoke(ios ? 'ios_dismiss_simulator' : 'android_dismiss_emulator', { serial });
      set((state) => ({ emulators: state.emulators.filter((e) => e.serial !== serial) }));
    },

    startRun: async (workspaceId, cwd, targetId) => {
      const { appendLog } = get();
      let deviceId = targetId;
      let deviceName = get().flutterDevices.find((d) => d.id === targetId)?.name ?? targetId;
      const boot = parseBootTarget(targetId);
      if (boot) {
        const avdName = boot.name;
        const label = get().avds.find((a) => a.name === avdName)?.displayName ?? avdName.replace(/_/g, ' ');
        appendLog(workspaceId, `Starting the ${label} ${boot.platform === 'ios' ? 'simulator' : 'emulator'}…`, 'info');
        const info = await get().startEmulator(avdName);
        await waitForBoot(info.serial);
        deviceId = info.serial;
        deviceName = info.displayName;
        get().selectRunTarget(workspaceId, info.serial);
      } else {
        const emulator = get().emulators.find((e) => e.serial === targetId);
        if (emulator) {
          deviceName = emulator.displayName;
          if (emulator.phase === 'Booting') {
            appendLog(workspaceId, `Waiting for ${emulator.displayName} to boot…`, 'info');
            await waitForBoot(emulator.serial);
          }
        }
      }
      const state = await invoke<FlutterRunState>('flutter_run_start', {
        workspaceId,
        request: { cwd, deviceId, deviceName, mode: get().runMode },
      });
      set((s) => ({ runs: { ...s.runs, [workspaceId]: state } }));
    },
    reload: async (workspaceId, full) => {
      try { await invoke('flutter_run_reload', { workspaceId, full }); }
      catch (error) { get().appendLog(workspaceId, errorText(error), 'error'); }
    },
    stopRun: async (workspaceId) => {
      try { await invoke('flutter_run_stop', { workspaceId }); }
      catch (error) { get().appendLog(workspaceId, errorText(error), 'error'); }
    },
    pubGet: async (workspaceId, cwd) => {
      try { await invoke('flutter_pub_get', { workspaceId, cwd }); }
      catch (error) { get().appendLog(workspaceId, errorText(error), 'error'); }
    },

    appendLog: (workspaceId, text, level) => set((state) => {
      const lines = state.logs[workspaceId] ?? [];
      const next = [...lines, { id: nextLogId++, text, level }];
      return { logs: { ...state.logs, [workspaceId]: next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next } };
    }),
    clearLog: (workspaceId) => set((state) => ({ logs: { ...state.logs, [workspaceId]: [] } })),
  };
}, {
  name: 'yzpzcode-device-panel',
  partialize: (state) => ({
    layoutByWorkspace: state.layoutByWorkspace,
    selectedAvd: state.selectedAvd,
    runTargetByWorkspace: state.runTargetByWorkspace,
    projectByWorkspace: state.projectByWorkspace,
    runMode: state.runMode,
    reloadOnSave: state.reloadOnSave,
    pubGetOnSave: state.pubGetOnSave,
    showFrame: state.showFrame,
    showStats: state.showStats,
  }),
}));

export const getDeviceLayout = (workspaceId: string): DevicePanelLayout =>
  ({ ...DEFAULT_DEVICE_LAYOUT, ...useDeviceStore.getState().layoutByWorkspace[workspaceId] });

export const isFlutterRunActive = isRunActive;

// ── Save hooks: hot reload on .dart saves, pub get on pubspec saves ─────────

const reloadTimers = new Map<string, ReturnType<typeof setTimeout>>();

function handleFileSaved(workspaceId: string, path: string): void {
  const state = useDeviceStore.getState();
  const run = state.runs[workspaceId];
  if (isDartFile(path) && state.reloadOnSave && run?.phase === 'Running' && run.supportsRestart && isInside(path, run.cwd)) {
    // Save all writes several files at once; reload once for the batch.
    clearTimeout(reloadTimers.get(workspaceId));
    reloadTimers.set(workspaceId, setTimeout(() => {
      reloadTimers.delete(workspaceId);
      void useDeviceStore.getState().reload(workspaceId, false);
    }, 180));
    return;
  }
  if (isPubspec(path) && state.pubGetOnSave) {
    const dir = normalizePath(path).replace(/\/pubspec\.yaml$/i, '');
    const projects = state.flutterProjects[workspaceId] ?? [];
    if (projects.some((p) => normalizePath(p).toLowerCase() === dir.toLowerCase())) void state.pubGet(workspaceId, dir);
  }
}

/** Fired by `saveEditorFile` after a file is written. */
export const FILE_SAVED_EVENT = 'yzpz:file-saved';

let listening = false;

export function ensureDeviceListeners(): void {
  if (listening) return;
  listening = true;
  const store = useDeviceStore;
  window.addEventListener(FILE_SAVED_EVENT, (event) => {
    const detail = (event as CustomEvent<{ workspaceId: string; path: string }>).detail;
    if (detail) handleFileSaved(detail.workspaceId, detail.path);
  });
  void listen<EmulatorInfo[]>('android-emulators-changed', (event) => {
    store.setState((state) => ({ emulators: [...event.payload, ...state.emulators.filter(isIos)] }));
  });
  void listen<EmulatorInfo[]>('ios-simulators-changed', (event) => {
    store.setState((state) => ({ emulators: [...state.emulators.filter((e) => !isIos(e)), ...event.payload] }));
  });
  void listen<FlutterRunState>('flutter-run-state', (event) => {
    const run = event.payload;
    store.setState((state) => {
      const previous = state.runs[run.workspaceId];
      // A newer run replaced this one; ignore the stale update.
      if (previous && previous.runId !== run.runId && isRunActive(previous) && !isRunActive(run)) return {};
      return { runs: { ...state.runs, [run.workspaceId]: run } };
    });
  });
  void listen<FlutterLogLine>('flutter-run-log', (event) => {
    store.getState().appendLog(event.payload.workspaceId, event.payload.text, event.payload.level);
  });
  void listen<SetupProgressEvent>('flutter-setup-progress', (event) => {
    const { step, phase, message, percent } = event.payload;
    store.setState((state) => ({
      setupRunning: true,
      setupSteps: { ...state.setupSteps, [step]: { phase, message, percent } },
    }));
  });
  void listen<SetupLogEvent>('flutter-setup-log', (event) => {
    const { text, level } = event.payload;
    store.setState((state) => {
      const next = [...state.setupLog, { id: nextLogId++, text, level }];
      return { setupLog: next.length > MAX_SETUP_LINES ? next.slice(-MAX_SETUP_LINES) : next };
    });
  });
  void listen<{ ok: boolean; error: string | null }>('flutter-setup-finished', (event) => {
    store.setState({ setupRunning: false, setupError: event.payload.ok ? null : event.payload.error });
    const state = store.getState();
    void state.checkSetup();
    void state.refreshAvds();
    void state.refreshIos();
  });
}
