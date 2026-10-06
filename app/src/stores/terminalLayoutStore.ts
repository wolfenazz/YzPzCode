import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TerminalLayoutPreset } from '../utils/terminalLayouts';

interface TerminalArrangement {
  preset: TerminalLayoutPreset;
  focusedSessionId: string | null;
  /** Preset to return to when a maximized pane is restored. */
  restorePreset?: TerminalLayoutPreset;
}

interface TerminalLayoutStore {
  arrangements: Record<string, TerminalArrangement>;
  setArrangement: (workspaceId: string, preset: TerminalLayoutPreset, sessionId: string) => void;
}

export const DEFAULT_TERMINAL_ARRANGEMENT: TerminalArrangement = { preset: 'grid', focusedSessionId: null };

export const useTerminalLayoutStore = create<TerminalLayoutStore>()(
  persist(
    (set) => ({
      arrangements: {},
      setArrangement: (workspaceId, preset, sessionId) => set((state) => {
        const current = state.arrangements[workspaceId] ?? DEFAULT_TERMINAL_ARRANGEMENT;
        const restorePreset = preset !== 'maximize' ? undefined
          : current.preset === 'maximize' ? current.restorePreset : current.preset;
        return {
          arrangements: { ...state.arrangements, [workspaceId]: { preset, focusedSessionId: sessionId, restorePreset } },
        };
      }),
    }),
    { name: 'yzpzcode-terminal-layouts' },
  ),
);
