import React from 'react';
import { Feather } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { useWritingSessionStore } from '../../stores/writingSessionStore';

/** Hands a report or Word file from the Files view to the Writing view. Hidden outside writing workspaces. */
export const OpenInWritingButton: React.FC<{ path: string; kind: 'open' | 'import'; className?: string }> = ({ path, kind, className }) => {
  const workspace = useAppStore((state) => state.currentWorkspace);
  if (workspace?.kind !== 'writing') return null;
  return (
    <button
      type="button"
      className={className ?? 'inline-flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] px-2.5 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer'}
      onClick={() => {
        useWritingSessionStore.getState().request(workspace.id, kind, path);
        useAppStore.getState().setActiveView('writing');
      }}
    >
      <Feather size={13} weight="fill" />
      {kind === 'open' ? 'Open in Writing' : 'Edit in Writing'}
    </button>
  );
};
