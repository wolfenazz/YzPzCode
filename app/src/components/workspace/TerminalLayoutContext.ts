import { createContext } from 'react';
import type { TerminalLayoutPreset } from '../../utils/terminalLayouts';

interface TerminalLayoutControls {
  preset: TerminalLayoutPreset;
  focusedSessionId: string | null;
  selectPreset: (preset: TerminalLayoutPreset, sessionId: string) => void;
}

export const TerminalLayoutContext = createContext<TerminalLayoutControls | null>(null);
