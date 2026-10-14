import { create } from 'zustand';
import type { RangeRef } from '../utils/sheets/address';
import type { ChangeSet } from '../utils/sheets/ops';
import type { Op } from '../utils/sheets/opTypes';
import type { Pivot, Workbook } from '../utils/sheets/types';

export interface CellPosition {
  row: number;
  col: number;
}

/** What is selected on the active sheet: the active cell and one or more ranges (Ctrl adds ranges). */
export interface GridSelection {
  active: CellPosition;
  ranges: RangeRef[];
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number;
  /** Short lines naming what an assistant turn changed. */
  summary?: string[];
  /** Whether the proposal of this turn was kept or discarded. */
  outcome?: 'kept' | 'discarded' | 'pending' | 'none';
  /** Attachment names that came with a user turn. */
  attachments?: string[];
  error?: boolean;
}

/** Changes the assistant proposes, shown on the grid until kept or discarded. */
export interface Proposal {
  id: string;
  /** The workbook with the proposal applied. */
  preview: Workbook;
  ops: Op[];
  changed: ChangeSet;
  summary: string[];
  warnings: string[];
  reply: string;
}

export type RunPhase = 'idle' | 'thinking' | 'reading' | 'applying' | 'done' | 'failed' | 'cancelled';

export interface AssistantRun {
  phase: RunPhase;
  label: string;
  startedAt: number;
  /** Streamed text so far, for the progress line. */
  streamed: string;
  round: number;
}

/** Unsaved work found in the sidecar after the app closed unexpectedly. */
export interface SheetsRecovery {
  wb: Workbook;
  /** Bytes of the file as last read or saved, so a restore keeps what the model does not hold. */
  original: Uint8Array | null;
  savedAt: number;
}

/** The open workbook of one sheets workspace. */
export interface SheetsSession {
  path: string | null;
  /** The workbook is a file outside the studio folder, edited in place. */
  external: boolean;
  wb: Workbook | null;
  /** Bytes of the file as last read or saved; the writer keeps what the model does not hold. */
  original: Uint8Array | null;
  format: 'xlsx' | 'csv' | 'tsv';
  selection: GridSelection;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  error: string | null;
  past: Workbook[];
  future: Workbook[];
  proposal: Proposal | null;
  run: AssistantRun | null;
  chat: ChatTurn[];
  /** Pivot definitions saved with the workbook; refreshed on demand. */
  pivots: Pivot[];
  /** Offered once after a crash; cleared on restore or discard. */
  recovery: SheetsRecovery | null;
  showFormulas: boolean;
  /** Bumped when the workbook is replaced from outside (open, import). */
  version: number;
  /** Notes from the importer (what could not be carried over). */
  importNotes: string[];
}

const HISTORY_LIMIT = 100;
const COALESCE_MS = 700;
/** Successive cell commits merge longer, so typing a column of values stays one undo step. */
const TYPING_COALESCE_MS = 5000;

const emptySelection = (): GridSelection => ({ active: { row: 0, col: 0 }, ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }] });

const emptySession = (): SheetsSession => ({
  path: null,
  external: false,
  wb: null,
  original: null,
  format: 'xlsx',
  selection: emptySelection(),
  dirty: false,
  saving: false,
  lastSavedAt: null,
  error: null,
  past: [],
  future: [],
  proposal: null,
  run: null,
  chat: [],
  pivots: [],
  recovery: null,
  showFormulas: false,
  version: 0,
  importNotes: [],
});

/** Asks a sheets workspace (from elsewhere in the app) to open a workbook file. */
export interface SheetsRequest {
  path: string;
  nonce: number;
}

export interface EditOptions {
  /** Edits with the same key within a moment merge into one undo step. */
  coalesce?: string;
  /** Leave the undo stack alone (previews, view-only changes). */
  skipHistory?: boolean;
}

interface SheetsSessionStore {
  sessions: Record<string, SheetsSession>;
  requests: Record<string, SheetsRequest | undefined>;
  request: (workspaceId: string, path: string) => void;
  clearRequest: (workspaceId: string) => void;
  update: (workspaceId: string, patch: Partial<SheetsSession> | ((session: SheetsSession) => Partial<SheetsSession>)) => void;
  /** Replaces the workbook, recording an undo step. */
  commit: (workspaceId: string, next: Workbook, options?: EditOptions) => void;
  undo: (workspaceId: string) => void;
  redo: (workspaceId: string) => void;
  setSelection: (workspaceId: string, selection: GridSelection) => void;
  setActiveSheet: (workspaceId: string, index: number) => void;
  addChat: (workspaceId: string, turn: ChatTurn) => void;
  patchChat: (workspaceId: string, id: string, patch: Partial<ChatTurn>) => void;
  closeWorkspace: (workspaceId: string) => void;
}

let lastEdit: { workspaceId: string; key: string; at: number } | null = null;

export const useSheetsSessionStore = create<SheetsSessionStore>()((set) => ({
  sessions: {},
  requests: {},
  request: (workspaceId, path) => set((state) => ({ requests: { ...state.requests, [workspaceId]: { path, nonce: Date.now() } } })),
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
  commit: (workspaceId, next, options = {}) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current?.wb || next === current.wb) return {};
    const now = Date.now();
    const window = options.coalesce === 'typing' ? TYPING_COALESCE_MS : COALESCE_MS;
    const merge = options.skipHistory || (options.coalesce && lastEdit && lastEdit.workspaceId === workspaceId && lastEdit.key === options.coalesce && now - lastEdit.at < window);
    lastEdit = options.coalesce ? { workspaceId, key: options.coalesce, at: now } : null;
    return {
      sessions: {
        ...state.sessions,
        [workspaceId]: {
          ...current,
          wb: next,
          dirty: true,
          past: merge ? current.past : [...current.past.slice(-(HISTORY_LIMIT - 1)), current.wb],
          future: merge ? current.future : [],
        },
      },
    };
  }),
  undo: (workspaceId) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current?.wb || current.past.length === 0) return {};
    lastEdit = null;
    const previous = current.past[current.past.length - 1];
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, wb: previous, past: current.past.slice(0, -1), future: [current.wb, ...current.future].slice(0, HISTORY_LIMIT), dirty: true, proposal: null } } };
  }),
  redo: (workspaceId) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current?.wb || current.future.length === 0) return {};
    lastEdit = null;
    const [next, ...rest] = current.future;
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, wb: next, past: [...current.past, current.wb], future: rest, dirty: true, proposal: null } } };
  }),
  setSelection: (workspaceId, selection) => set((state) => {
    const current = state.sessions[workspaceId] ?? emptySession();
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, selection } } };
  }),
  setActiveSheet: (workspaceId, index) => set((state) => {
    const current = state.sessions[workspaceId];
    const count = Math.max(current?.wb?.sheets.length ?? 0, current?.proposal?.preview.sheets.length ?? 0);
    if (!current?.wb || index === current.wb.activeSheet || index < 0 || index >= count) return {};
    // Changing sheets is a view change: it neither dirties the file nor enters the undo history.
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, wb: { ...current.wb, activeSheet: index }, selection: emptySelection() } } };
  }),
  addChat: (workspaceId, turn) => set((state) => {
    const current = state.sessions[workspaceId] ?? emptySession();
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, chat: [...current.chat, turn].slice(-120) } } };
  }),
  patchChat: (workspaceId, id, patch) => set((state) => {
    const current = state.sessions[workspaceId];
    if (!current) return {};
    return { sessions: { ...state.sessions, [workspaceId]: { ...current, chat: current.chat.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)) } } };
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

export const selectSheetsSession = (workspaceId: string) => (state: SheetsSessionStore): SheetsSession =>
  state.sessions[workspaceId] ?? EMPTY_SESSION;

export { emptySelection };
