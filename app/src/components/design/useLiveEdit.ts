import { useCallback, useEffect, useRef } from 'react';
import { useDesignSessionStore } from '../../stores/designSessionStore';
import type { DesignProject } from '../../utils/design/types';

/**
 * Edits that stream in while a slider or colour is dragged: they are applied without history,
 * and when they stop (or the pointer lifts) the whole run becomes one undo step.
 */
export function useLiveEdit(workspaceId: string) {
  const edit = useDesignSessionStore((state) => state.edit);
  const update = useDesignSessionStore((state) => state.update);
  const baseline = useRef<DesignProject | null>(null);
  const timer = useRef<number | null>(null);

  const settle = useCallback((): void => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const before = baseline.current;
    baseline.current = null;
    const now = useDesignSessionStore.getState().sessions[workspaceId]?.project;
    if (before && now && before !== now) update(workspaceId, (state) => ({ past: [...state.past, before].slice(-50), future: [], dirty: true }));
  }, [update, workspaceId]);

  const live = useCallback((change: (project: DesignProject) => DesignProject): void => {
    const current = useDesignSessionStore.getState().sessions[workspaceId]?.project;
    if (!current) return;
    if (!baseline.current) baseline.current = current;
    edit(workspaceId, change, { skipHistory: true });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(settle, 700);
  }, [edit, settle, workspaceId]);

  const commit = useCallback((change: (project: DesignProject) => DesignProject): void => {
    settle();
    edit(workspaceId, change);
  }, [edit, settle, workspaceId]);

  // Leaving the panel ends a run that is still open.
  useEffect(() => settle, [settle]);

  return { live, commit, settle };
}
