import { createContext } from 'react';
import type { TerminalLayoutPreset } from '../../utils/terminalLayouts';

interface TerminalLayoutControls {
  preset: TerminalLayoutPreset;
  focusedSessionId: string | null;
  /** Pane ids in display order, so previews can draw the real arrangement. */
  paneIds: string[];
  selectPreset: (preset: TerminalLayoutPreset, sessionId: string) => void;
  /** Maximize the pane, or restore the previous layout if it is already maximized. */
  toggleMaximize: (sessionId: string) => void;
}

export const TerminalLayoutContext = createContext<TerminalLayoutControls | null>(null);
