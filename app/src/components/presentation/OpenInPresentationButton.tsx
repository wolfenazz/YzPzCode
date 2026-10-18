import React from 'react';
import { PresentationChart } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { usePresentationSessionStore } from '../../stores/presentationSessionStore';
import { focusStudio } from '../../utils/studioWorkspace';

/**
 * Hands a deck or PowerPoint file from the Files view to the Slides view. Outside
 * presentation workspaces it switches to (or creates) the Presentation studio instead of hiding.
 */
export const OpenInPresentationButton: React.FC<{ path: string; kind: 'open' | 'import'; className?: string }> = ({ path, kind, className }) => {
  const workspace = useAppStore((state) => state.currentWorkspace);
  if (!workspace) return null;
  const open = async (): Promise<void> => {
    const id = await focusStudio('presentation', workspace);
    usePresentationSessionStore.getState().request(id, kind, path);
    useAppStore.getState().setActiveView('presentation');
  };
  return (
    <button
      type="button"
      className={className ?? 'inline-flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] px-2.5 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer'}
      onClick={() => void open().catch((error: unknown) => console.error('Could not open in the Presentation studio:', error))}
    >
      <PresentationChart size={13} weight="fill" />
      {kind === 'open' ? 'Open in Slides' : 'Open in Presentation studio'}
    </button>
  );
};
