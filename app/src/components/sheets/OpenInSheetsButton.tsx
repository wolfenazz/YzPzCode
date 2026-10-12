import React from 'react';
import { Table } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { useSheetsSessionStore } from '../../stores/sheetsSessionStore';

/** Hands a spreadsheet file from the Files view to the Sheets studio. Hidden outside sheets workspaces. */
export const OpenInSheetsButton: React.FC<{ path: string; className?: string }> = ({ path, className }) => {
  const workspace = useAppStore((state) => state.currentWorkspace);
  if (workspace?.kind !== 'sheets') return null;
  return (
    <button
      type="button"
      className={className ?? 'inline-flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] px-2.5 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer'}
      onClick={() => {
        useSheetsSessionStore.getState().request(workspace.id, path);
        useAppStore.getState().setActiveView('sheets');
      }}
    >
      <Table size={13} weight="fill" />
      Open in Sheets studio
    </button>
  );
};
