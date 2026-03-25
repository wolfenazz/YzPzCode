import React, { useEffect, useRef } from 'react';
import { TerminalGrid } from './TerminalGrid';
import { WorkspaceHeader } from './WorkspaceHeader';
import { useTerminal } from '../../hooks/useTerminal';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useCliLauncher } from '../../hooks/useCliLauncher';
import { useAppStore } from '../../stores/appStore';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';

interface WorkspaceProps {
  isWindows: boolean;
  onDocsClick: () => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({ isWindows, onDocsClick }) => {
  const {
    currentWorkspace,
    openWorkspaces,
    activeWorkspaceId,
    sessions,
    sessionsByWorkspace,
    clearCurrentWorkspace,
    markWorkspaceOpened,
    theme,
    toggleTheme,
    closeWorkspace,
    switchWorkspace,
    setView,
    setSessionsForWorkspace,
  } = useAppStore();
  const { createSessions, killAllSessions, killWorkspaceSessions, isLoading, error } = useTerminal();
  const { detectAllClis } = useAgentCli();
  const { checkAllAuth } = useCliLauncher();
  const hasInitialized = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (currentWorkspace && !hasInitialized.current[currentWorkspace.id]) {
      detectAllClis();
      checkAllAuth();

      const existingSessions = sessionsByWorkspace[currentWorkspace.id] || [];

      if (existingSessions.length === 0 && !isLoading) {
        hasInitialized.current[currentWorkspace.id] = true;
        createSessions({
          workspaceId: currentWorkspace.id,
          workspacePath: currentWorkspace.path,
          count: currentWorkspace.layout.sessions,
          agentFleet: currentWorkspace.agentFleet
        }).then((sessions) => {
          setSessionsForWorkspace(currentWorkspace.id, sessions);
        }).catch((err) => {
          console.error('Failed to initialize sessions:', err);
          hasInitialized.current[currentWorkspace!.id] = false;
        });
      } else if (existingSessions.length > 0) {
        // Already initialized from another mount or session restore
        hasInitialized.current[currentWorkspace.id] = true;
      }

      markWorkspaceOpened(currentWorkspace.id);
    }
  }, [currentWorkspace?.id, sessionsByWorkspace, isLoading, error, detectAllClis, checkAllAuth, createSessions, setSessionsForWorkspace, markWorkspaceOpened]);

  const handleBackToSetup = async () => {
    try {
      await killAllSessions();
    } catch (err) {
      console.error('Error killing sessions:', err);
    }
    clearCurrentWorkspace();
  };

  const handleWorkspaceClick = (workspaceId: string) => {
    switchWorkspace(workspaceId);
  };

  const handleWorkspaceClose = async (workspaceId: string) => {
    try {
      await killWorkspaceSessions(workspaceId);
    } catch (err) {
      console.error('Error killing workspace sessions:', err);
    }
    closeWorkspace(workspaceId);
    delete hasInitialized.current[workspaceId];
  };

  const handleNewWorkspace = () => {
    setView('setup');
  };

  const handleTerminate = async () => {
    if (currentWorkspace) {
      try {
        await handleWorkspaceClose(currentWorkspace.id);
      } catch (err) {
        console.error('Error terminating workspace:', err);
        closeWorkspace(currentWorkspace.id);
        delete hasInitialized.current[currentWorkspace.id];
      }
    }
  };

  const sessionsCountMap: Record<string, number> = {};
  Object.entries(sessionsByWorkspace).forEach(([workspaceId, sessions]) => {
    sessionsCountMap[workspaceId] = sessions.length;
  });
  if (currentWorkspace && !sessionsCountMap[currentWorkspace.id]) {
    sessionsCountMap[currentWorkspace.id] = sessions.length;
  }

  if (!currentWorkspace && openWorkspaces.length === 0) {
    return null;
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-theme-main text-rose-500 p-8 text-center font-mono">
        <div className="max-w-md space-y-4">
          <h2 className="text-xl font-bold uppercase tracking-widest border-b border-rose-900/50 pb-2">Hardware Failure</h2>
          <p className="text-xs opacity-80 leading-relaxed">{error}</p>
          <button
            onClick={handleBackToSetup}
            className="px-6 py-2 bg-rose-950/30 border border-rose-900/50 text-rose-500 hover:bg-rose-900/40 transition-all text-[10px] font-bold uppercase tracking-widest"
          >
            [ Return to Shell ]
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-theme-main font-mono overflow-hidden">
      <WorkspaceHeader
        workspaces={openWorkspaces}
        activeWorkspaceId={activeWorkspaceId}
        sessionsByWorkspace={sessionsCountMap}
        onWorkspaceClick={handleWorkspaceClick}
        onWorkspaceClose={handleWorkspaceClose}
        onNewWorkspace={handleNewWorkspace}
        onDocsClick={onDocsClick}
        isWindows={isWindows}
        onThemeToggle={toggleTheme}
        theme={theme}
        onTerminate={handleTerminate}
        onMinimizeWindow={minimizeWindow}
        onMaximizeWindow={maximizeWindow}
        onCloseWindow={closeWindow}
      />

      <main className="flex-1 overflow-hidden p-1.5 pt-11.5 bg-theme-main">
        {currentWorkspace ? (
          <TerminalGrid sessions={sessions} isLoading={isLoading} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center space-y-4">
              <div className="text-[10px] uppercase tracking-widest opacity-60">No Active Workspace</div>
              <button
                onClick={handleNewWorkspace}
                className="px-6 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-all text-[10px] font-bold uppercase tracking-widest"
              >
                [ Create Workspace ]
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
