import React, { useCallback, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { launchTerminals, type LaunchSpec } from '../../utils/launchTerminals';
import { NewTerminalDialog } from './NewTerminalDialog';

export const TerminalStatusBar: React.FC = () => {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const activeView = useAppStore((s) => s.activeView);
  const sessions = useAppStore((s) => s.sessions);
  const addSession = useAppStore((s) => s.addSession);

  const handleAddTerminal = useCallback(async (specs: LaunchSpec[]) => {
    if (!currentWorkspace) return;
    setShowNewDialog(false);
    try {
      const created = await launchTerminals(currentWorkspace.id, currentWorkspace.path, sessions.length, specs);
      created.forEach((session) => addSession(session));
    } catch (err) {
      console.error('Failed to create terminals:', err);
    }
  }, [currentWorkspace, sessions.length, addSession]);

  if (!currentWorkspace) return null;
  if (activeView !== 'terminal') return null;

  return (
    <>
      <button
        onClick={() => setShowNewDialog(true)}
        className="statusbar__item statusbar__item--action"
        title="Open a new terminal"
        aria-label="Create terminal"
        type="button"
      >
        <Plus size={12} weight="bold" aria-hidden="true" />
        <span>New terminal</span>
      </button>

      {showNewDialog && (
        <NewTerminalDialog
          onClose={() => setShowNewDialog(false)}
          onLaunch={handleAddTerminal}
        />
      )}
    </>
  );
};
