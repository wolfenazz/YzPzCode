import React from 'react';
import { Table } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { useSheetsSessionStore } from '../../stores/sheetsSessionStore';
import { focusStudio } from '../../utils/studioWorkspace';

/**
 * Hands a spreadsheet file from the Files view to the Sheets studio. Outside
 * sheets workspaces the button switches to (or creates) a sheets workspace
 * instead of hiding. Hidden while read-only or with no workspace to act on.
 */
export const OpenInSheetsButton: React.FC<{ path: string; className?: string; readOnly?: boolean }> = ({ path, className, readOnly }) => {
  const workspace = useAppStore((state) => state.currentWorkspace);
  if (!workspace || readOnly) return null;
  const open = async (): Promise<void> => {
    const id = await focusStudio('sheets', workspace);
    useSheetsSessionStore.getState().request(id, path);
    useAppStore.getState().setActiveView('sheets');
  };
  return (
    <button
      type="button"
      className={className ?? 'inline-flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] px-2.5 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer'}
      onClick={() => void open().catch((error: unknown) => console.error('Could not open in Sheets studio:', error))}
    >
      <Table size={13} weight="fill" />
      Open in Sheets studio
    </button>
  );
};
