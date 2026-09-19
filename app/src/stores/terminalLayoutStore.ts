import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TerminalLayoutPreset } from '../utils/terminalLayouts';

interface TerminalArrangement {
  preset: TerminalLayoutPreset;
  focusedSessionId: string | null;
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
      setArrangement: (workspaceId, preset, sessionId) => set((state) => ({
        arrangements: { ...state.arrangements, [workspaceId]: { preset, focusedSessionId: sessionId } },
      })),
    }),
    { name: 'yzpzcode-terminal-layouts' },
  ),
);
