import React from 'react';
import { PresentationChart } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { usePresentationSessionStore } from '../../stores/presentationSessionStore';

/** Hands a deck or PowerPoint file from the Files view to the Slides view. Hidden outside presentation workspaces. */
export const OpenInPresentationButton: React.FC<{ path: string; kind: 'open' | 'import'; className?: string }> = ({ path, kind, className }) => {
  const workspace = useAppStore((state) => state.currentWorkspace);
  if (workspace?.kind !== 'presentation') return null;
  return (
    <button
      type="button"
      className={className ?? 'inline-flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] px-2.5 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer'}
      onClick={() => {
        usePresentationSessionStore.getState().request(workspace.id, kind, path);
        useAppStore.getState().setActiveView('presentation');
      }}
    >
      <PresentationChart size={13} weight="fill" />
      {kind === 'open' ? 'Open in Slides' : 'Open in Presentation studio'}
    </button>
  );
};
