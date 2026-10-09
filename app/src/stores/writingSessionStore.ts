import { create } from 'zustand';
import type { OutlineSection, Reference, ReportBrief, SectionRunStatus, YzDocMeta } from '../utils/writing/types';

/** One AI call shown in the generation trace. */
export interface AiCallRecord {
  id: string;
  label: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  startedAt: number;
  endedAt: number | null;
  error: string | null;
}

export type GenerationPhase = 'idle' | 'outline' | 'writing' | 'done' | 'failed' | 'cancelled';

export interface GenerationRun {
  phase: GenerationPhase;
  startedAt: number;
  endedAt: number | null;
  currentSectionId: string | null;
  sectionStatus: Record<string, SectionRunStatus>;
  calls: AiCallRecord[];
  error: string | null;
  wordsWritten: number;
}

/** The open report of one writing workspace, minus its editor content. */
export interface WritingSession {
  docPath: string | null;
  meta: YzDocMeta | null;
  brief: ReportBrief | null;
  outline: OutlineSection[];
  bibliography: Reference[];
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  error: string | null;
  run: GenerationRun | null;
  /** Bumped whenever the editor content is replaced from outside (open, import). */
  contentVersion: number;
}

const emptySession = (): WritingSession => ({
  docPath: null,
  meta: null,
  brief: null,
  outline: [],
  bibliography: [],
  dirty: false,
  saving: false,
  lastSavedAt: null,
  error: null,
  run: null,
  contentVersion: 0,
});

/** Asks a writing workspace (from elsewhere in the app) to open a report or import a Word file. */
export interface WritingRequest {
  kind: 'open' | 'import';
  path: string;
  nonce: number;
}

interface WritingSessionStore {
  sessions: Record<string, WritingSession>;
  requests: Record<string, WritingRequest | undefined>;
  request: (workspaceId: string, kind: WritingRequest['kind'], path: string) => void;
  clearRequest: (workspaceId: string) => void;
  update: (workspaceId: string, patch: Partial<WritingSession> | ((session: WritingSession) => Partial<WritingSession>)) => void;
  updateRun: (workspaceId: string, patch: Partial<GenerationRun> | ((run: GenerationRun) => Partial<GenerationRun>)) => void;
  closeWorkspace: (workspaceId: string) => void;
}

export const useWritingSessionStore = create<WritingSessionStore>()((set) => ({
  sessions: {},
  requests: {},
  request: (workspaceId, kind, path) => set((state) => ({ requests: { ...state.requests, [workspaceId]: { kind, path, nonce: Date.now() } } })),
  clearRequest: (workspaceId) => set((state) => {
    const requests = { ...state.requests };
    delete requests[workspaceId];
    return { requests };
  }),
  update: (workspaceId, patch) => set((state) => {
    const current = state.sessions[workspaceId] ?? emptySession();
    const next = typeof patch === 'function' ? patch(current) : patch;
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, ...next } } };
  }),
  updateRun: (workspaceId, patch) => set((state) => {
    const current = state.sessions[workspaceId] ?? emptySession();
    const run: GenerationRun = current.run ?? {
      phase: 'idle',
      startedAt: Date.now(),
      endedAt: null,
      currentSectionId: null,
      sectionStatus: {},
      calls: [],
      error: null,
      wordsWritten: 0,
    };
    const next = typeof patch === 'function' ? patch(run) : patch;
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, run: { ...run, ...next } } } };
  }),
  closeWorkspace: (workspaceId) => set((state) => {
    const sessions = { ...state.sessions };
    delete sessions[workspaceId];
    const requests = { ...state.requests };
    delete requests[workspaceId];
    return { sessions, requests };
  }),
}));

export const selectSession = (workspaceId: string) => (state: WritingSessionStore): WritingSession =>
  state.sessions[workspaceId] ?? EMPTY_SESSION;

const EMPTY_SESSION = emptySession();
