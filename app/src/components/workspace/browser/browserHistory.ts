// Back and forward for browser tabs. Dependency-free; tested by `npm run test:browser`.
//
// All tabs of a workspace share one native webview and so one session history,
// in the order the pages were visited. Each entry is therefore owned by the tab
// that was active when it appeared, and a tab walks only over its own entries.

export interface BrowserHistoryEntry {
  id: number;
  url: string;
}

export interface BrowserHistorySnapshot {
  currentIndex: number;
  entries: BrowserHistoryEntry[];
}

export interface BrowserHistoryPayload extends BrowserHistorySnapshot {
  workspaceId: string;
}

/** The page a tab left when Back took it to the start page. */
export interface BrowserReturnPage {
  url: string;
  title: string;
  favicon: string | null;
}

interface TabTrail {
  /** The tab's first page was reached from the start page. */
  startBehind: boolean;
  returnTo: BrowserReturnPage | null;
}

export interface WorkspaceHistory {
  /** Null until the engine reports one (only Windows does). */
  snapshot: BrowserHistorySnapshot | null;
  /** Entry id → tab id. `NO_OWNER` marks an entry no tab may return to. */
  owners: Record<number, string>;
  trails: Record<string, TabTrail>;
}

export type BrowserHistoryStep =
  | { kind: 'entry'; entryId: number }
  | { kind: 'start-page' }
  | ({ kind: 'page' } & BrowserReturnPage);

export interface BrowserHistorySteps {
  /** False when the engine reports no history and the page's word must do. */
  known: boolean;
  back: BrowserHistoryStep | null;
  forward: BrowserHistoryStep | null;
}

export const EMPTY_WORKSPACE_HISTORY: WorkspaceHistory = { snapshot: null, owners: {}, trails: {} };

const NO_OWNER = '';

const isPage = (url: string): boolean => /^(https?|file):/i.test(url);
const sameUrl = (left: string, right: string): boolean => left.replace(/\/$/, '') === right.replace(/\/$/, '');

/**
 * Takes in the engine's history. `activeTabId` is null while no tab is showing
 * the webview (the start page), so nothing can be claimed then.
 */
export const applySnapshot = (
  history: WorkspaceHistory,
  snapshot: BrowserHistorySnapshot,
  activeTabId: string | null,
): WorkspaceHistory => {
  const { entries, currentIndex } = snapshot;
  const owners: Record<number, string> = {};
  for (const entry of entries) {
    if (history.owners[entry.id] !== undefined) owners[entry.id] = history.owners[entry.id];
  }

  const current = entries[currentIndex];
  if (current && activeTabId && owners[current.id] === undefined && isPage(current.url)) {
    owners[current.id] = activeTabId;
    // Pages committed between two reports (quick clicks) belong to the same tab.
    let index = currentIndex - 1;
    for (; index >= 0; index -= 1) {
      const entry = entries[index];
      if (owners[entry.id] !== undefined || !isPage(entry.url)) break;
      owners[entry.id] = activeTabId;
    }
    // Returning to a tab loads its page again as a new entry, past the other
    // tabs' pages. The older copy would make the first Back look like nothing.
    for (; index >= 0; index -= 1) {
      const entry = entries[index];
      if (owners[entry.id] !== activeTabId) continue;
      if (index < currentIndex - 1 && sameUrl(entry.url, current.url)) owners[entry.id] = NO_OWNER;
      break;
    }
  }
  return { ...history, snapshot, owners };
};

/** A tab on the start page is going to a page: what it left behind is gone. */
export const enterFromStartPage = (history: WorkspaceHistory, tabId: string): WorkspaceHistory => {
  const owners = { ...history.owners };
  for (const id of Object.keys(owners)) {
    if (owners[Number(id)] === tabId) owners[Number(id)] = NO_OWNER;
  }
  return {
    ...history,
    owners,
    trails: { ...history.trails, [tabId]: { startBehind: true, returnTo: null } },
  };
};

export const leaveToStartPage = (
  history: WorkspaceHistory,
  tabId: string,
  returnTo: BrowserReturnPage,
): WorkspaceHistory => ({
  ...history,
  trails: { ...history.trails, [tabId]: { startBehind: true, returnTo } },
});

export const returnFromStartPage = (history: WorkspaceHistory, tabId: string): WorkspaceHistory => ({
  ...history,
  trails: { ...history.trails, [tabId]: { startBehind: true, returnTo: null } },
});

export const historySteps = (
  history: WorkspaceHistory,
  tabId: string,
  onStartPage: boolean,
  startPageAvailable: boolean,
): BrowserHistorySteps => {
  const trail = history.trails[tabId];
  if (onStartPage) {
    return {
      known: true,
      back: null,
      forward: trail?.returnTo ? { kind: 'page', ...trail.returnTo } : null,
    };
  }

  const { snapshot, owners } = history;
  if (!snapshot) return { known: false, back: null, forward: null };

  const { entries, currentIndex } = snapshot;
  const ownEntry = (from: number, step: 1 | -1): BrowserHistoryStep | null => {
    for (let index = from + step; index >= 0 && index < entries.length; index += step) {
      if (owners[entries[index].id] === tabId) return { kind: 'entry', entryId: entries[index].id };
    }
    return null;
  };

  return {
    known: true,
    back: ownEntry(currentIndex, -1) ?? (trail?.startBehind && startPageAvailable ? { kind: 'start-page' } : null),
    forward: ownEntry(currentIndex, 1),
  };
};
