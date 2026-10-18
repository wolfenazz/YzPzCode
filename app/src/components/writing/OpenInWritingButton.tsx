import React from 'react';
import { Feather } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { useWritingSessionStore } from '../../stores/writingSessionStore';
import { focusStudio } from '../../utils/studioWorkspace';

/**
 * Hands a report or Word file from the Files view to the Writing view. Outside writing
 * workspaces it switches to (or creates) the Writing studio instead of hiding.
 */
export const OpenInWritingButton: React.FC<{ path: string; kind: 'open' | 'import'; className?: string }> = ({ path, kind, className }) => {
  const workspace = useAppStore((state) => state.currentWorkspace);
  if (!workspace) return null;
  const open = async (): Promise<void> => {
    const id = await focusStudio('writing', workspace);
    useWritingSessionStore.getState().request(id, kind, path);
    useAppStore.getState().setActiveView('writing');
  };
  return (
    <button
      type="button"
      className={className ?? 'inline-flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] px-2.5 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer'}
      onClick={() => void open().catch((error: unknown) => console.error('Could not open in the Writing studio:', error))}
    >
      <Feather size={13} weight="fill" />
      {kind === 'open' ? 'Open in Writing' : 'Edit in Writing studio'}
    </button>
  );
};
