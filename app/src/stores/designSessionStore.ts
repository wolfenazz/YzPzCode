import { create } from 'zustand';
import type { DesignProject, DesignTokens } from '../utils/design/types';

export type DesignTool = 'select' | 'hand' | 'pick';

export interface DesignViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface DesignRun {
  phase: 'direction' | 'choosing' | 'drawing' | 'done' | 'failed' | 'cancelled';
  /** What is happening, e.g. "Designing the system". */
  label: string;
  total: number;
  done: number;
  startedAt: number;
  endedAt?: number;
  error?: string | null;
}

/** Looks proposed for the same plan; drawing waits until one is chosen. */
export interface DirectionChoice {
  options: Array<{ id: string; name: string; mood: string; tokens: DesignTokens }>;
}

/** An AI change waiting for Keep or Discard: the project as it was before it. */
export interface DesignProposal {
  baseline: DesignProject;
  ids: string[];
  instruction: string;
}

/** One element the next instruction is about. */
export interface PickedElement {
  boardId: string;
  yz: string;
  html: string;
  label: string;
  /** More elements of the same board picked with Shift: style edits reach all of them. */
  also?: string[];
}

/** Runtime state of the Design studio in one workspace. Not persisted: the project file is the record. */
export interface DesignSession {
  project: DesignProject | null;
  projectPath: string | null;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  error: string | null;
  selectedIds: string[];
  tool: DesignTool;
  viewport: DesignViewport;
  /** Set once the view has been fitted to the content of the open project. */
  fitted: boolean;
  proposal: DesignProposal | null;
  picked: PickedElement | null;
  directions: DirectionChoice | null;
  /** The AI run in progress or the last one finished. */
  run: DesignRun | null;
  /** Whole-project undo and redo. */
  past: DesignProject[];
  future: DesignProject[];
  /** Bumped when a different project is loaded. */
  version: number;
}

export const emptyDesignSession = (): DesignSession => ({
  project: null,
  projectPath: null,
  dirty: false,
  saving: false,
  lastSavedAt: null,
  error: null,
  selectedIds: [],
  tool: 'select',
  viewport: { x: 0, y: 0, zoom: 1 },
  fitted: false,
  proposal: null,
  picked: null,
  directions: null,
  run: null,
  past: [],
  future: [],
  version: 0,
});

const HISTORY_LIMIT = 50;

interface DesignSessionStore {
  sessions: Record<string, DesignSession>;
  update: (workspaceId: string, patch: Partial<DesignSession> | ((session: DesignSession) => Partial<DesignSession>)) => void;
  /** Applies a change to the open project as one undo step (`skipHistory` for streamed updates). */
  edit: (workspaceId: string, change: (project: DesignProject) => DesignProject, options?: { skipHistory?: boolean }) => void;
  /** Keeps the proposed change as one undo step. */
  keepProposal: (workspaceId: string) => void;
  /** Puts the project back as it was before the proposal. */
  discardProposal: (workspaceId: string) => void;
  undo: (workspaceId: string) => void;
  redo: (workspaceId: string) => void;
  closeWorkspace: (workspaceId: string) => void;
}

export const useDesignSessionStore = create<DesignSessionStore>()((set) => ({
  sessions: {},
  update: (workspaceId, patch) => set((state) => {
    const current = state.sessions[workspaceId] ?? emptyDesignSession();
    const next = typeof patch === 'function' ? patch(current) : patch;
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, ...next } } };
  }),
  edit: (workspaceId, change, options) => set((state) => {
    const current = state.sessions[workspaceId] ?? emptyDesignSession();
    if (!current.project) return state;
    const project = change(current.project);
    if (project === current.project) return state;
    const past = options?.skipHistory ? current.past : [...current.past, current.project].slice(-HISTORY_LIMIT);
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, project, past, future: options?.skipHistory ? current.future : [], dirty: true } } };
  }),
  keepProposal: (workspaceId) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current?.proposal) return state;
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, past: [...current.past, current.proposal.baseline].slice(-HISTORY_LIMIT), future: [], proposal: null, dirty: true } } };
  }),
  discardProposal: (workspaceId) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current?.proposal) return state;
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, project: current.proposal.baseline, proposal: null, selectedIds: [], picked: null, dirty: true } } };
  }),
  undo: (workspaceId) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current?.project || current.past.length === 0) return state;
    const previous = current.past[current.past.length - 1];
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, project: previous, past: current.past.slice(0, -1), future: [current.project, ...current.future].slice(0, HISTORY_LIMIT), dirty: true } } };
  }),
  redo: (workspaceId) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current?.project || current.future.length === 0) return state;
    const [next, ...rest] = current.future;
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, project: next, past: [...current.past, current.project].slice(-HISTORY_LIMIT), future: rest, dirty: true } } };
  }),
  closeWorkspace: (workspaceId) => set((state) => {
    const sessions = { ...state.sessions };
    delete sessions[workspaceId];
    return { sessions };
  }),
}));
