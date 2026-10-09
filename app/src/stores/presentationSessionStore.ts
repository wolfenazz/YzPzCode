import { create } from 'zustand';
import type { SlideRunStatus, YzDeck } from '../utils/presentation/types';
import type { AiCallRecord } from './writingSessionStore';

export type DeckPhase = 'idle' | 'outline' | 'slides' | 'action' | 'done' | 'failed' | 'cancelled';

export interface DeckRun {
  phase: DeckPhase;
  startedAt: number;
  endedAt: number | null;
  slideStatus: Record<string, SlideRunStatus>;
  calls: AiCallRecord[];
  error: string | null;
}

/** The open deck of one presentation workspace. */
export interface PresentationSession {
  deckPath: string | null;
  deck: YzDeck | null;
  selectedIds: string[];
  selectedSlot: string | null;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  error: string | null;
  run: DeckRun | null;
  /** Undo and redo stacks of whole decks. */
  past: YzDeck[];
  future: YzDeck[];
  /** Slots still overflowing at the smallest type size, by slide id. */
  warnings: Record<string, string[]>;
  /** Bumped when the deck is replaced from outside (open, import). */
  version: number;
}

const HISTORY_LIMIT = 80;
const COALESCE_MS = 900;

const emptySession = (): PresentationSession => ({
  deckPath: null,
  deck: null,
  selectedIds: [],
  selectedSlot: null,
  dirty: false,
  saving: false,
  lastSavedAt: null,
  error: null,
  run: null,
  past: [],
  future: [],
  warnings: {},
  version: 0,
});

/** Asks a presentation workspace (from elsewhere in the app) to open a deck or import a PowerPoint file. */
export interface PresentationRequest {
  kind: 'open' | 'import';
  path: string;
  nonce: number;
}

export interface EditOptions {
  /** Edits with the same key within a moment merge into one undo step (typing). */
  coalesce?: string;
  /** Leave the undo stack alone (AI streaming, the design check). */
  skipHistory?: boolean;
}

interface PresentationSessionStore {
  sessions: Record<string, PresentationSession>;
  requests: Record<string, PresentationRequest | undefined>;
  request: (workspaceId: string, kind: PresentationRequest['kind'], path: string) => void;
  clearRequest: (workspaceId: string) => void;
  update: (workspaceId: string, patch: Partial<PresentationSession> | ((session: PresentationSession) => Partial<PresentationSession>)) => void;
  updateRun: (workspaceId: string, patch: Partial<DeckRun> | ((run: DeckRun) => Partial<DeckRun>)) => void;
  /** Changes the deck, recording an undo step. */
  edit: (workspaceId: string, change: (deck: YzDeck) => YzDeck, options?: EditOptions) => void;
  undo: (workspaceId: string) => void;
  redo: (workspaceId: string) => void;
  closeWorkspace: (workspaceId: string) => void;
}

let lastEdit: { workspaceId: string; key: string; at: number } | null = null;

export const usePresentationSessionStore = create<PresentationSessionStore>()((set) => ({
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
    const run: DeckRun = current.run ?? { phase: 'idle', startedAt: Date.now(), endedAt: null, slideStatus: {}, calls: [], error: null };
    const next = typeof patch === 'function' ? patch(run) : patch;
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, run: { ...run, ...next } } } };
  }),
  edit: (workspaceId, change, options = {}) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current?.deck) return {};
    const deck = change(current.deck);
    if (deck === current.deck) return {};
    const now = Date.now();
    const merge = options.skipHistory || (options.coalesce && lastEdit && lastEdit.workspaceId === workspaceId && lastEdit.key === options.coalesce && now - lastEdit.at < COALESCE_MS);
    lastEdit = options.coalesce ? { workspaceId, key: options.coalesce, at: now } : null;
    const known = new Set(deck.slides.map((slide) => slide.id));
    return {
      sessions: {
        ...state.sessions,
        [workspaceId]: {
          ...current,
          deck,
          dirty: true,
          past: merge ? current.past : [...current.past.slice(-(HISTORY_LIMIT - 1)), current.deck],
          future: merge ? current.future : [],
          selectedIds: current.selectedIds.filter((id) => known.has(id)),
        },
      },
    };
  }),
  undo: (workspaceId) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current?.deck || current.past.length === 0) return {};
    const previous = current.past[current.past.length - 1];
    lastEdit = null;
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, deck: previous, past: current.past.slice(0, -1), future: [current.deck, ...current.future].slice(0, HISTORY_LIMIT), dirty: true } } };
  }),
  redo: (workspaceId) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current?.deck || current.future.length === 0) return {};
    const [next, ...rest] = current.future;
    lastEdit = null;
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, deck: next, past: [...current.past, current.deck], future: rest, dirty: true } } };
  }),
  closeWorkspace: (workspaceId) => set((state) => {
    const sessions = { ...state.sessions };
    delete sessions[workspaceId];
    const requests = { ...state.requests };
    delete requests[workspaceId];
    return { sessions, requests };
  }),
}));

const EMPTY_SESSION = emptySession();

export const selectPresentationSession = (workspaceId: string) => (state: PresentationSessionStore): PresentationSession =>
  state.sessions[workspaceId] ?? EMPTY_SESSION;
