import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TerminalGrid } from './TerminalGrid';
import { WorkspaceHeader } from './WorkspaceHeader';
import { AppFooter } from '../common/AppFooter';
import { FileExplorer } from '../explorer/FileExplorer';
import { FileEditor } from '../editor/FileEditor';
import { useFileEditor } from '../../hooks/useFileEditor';
import { useFileWatcher } from '../../hooks/useFileWatcher';
import { useTerminal } from '../../hooks/useTerminal';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useCliLauncher } from '../../hooks/useCliLauncher';
import { useAppStore } from '../../stores/appStore';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';
import { FileEntry } from '../../types';

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
    explorerOpen,
    activeView,
    toggleExplorer,
    setActiveView,
    closeFileTab,
  } = useAppStore();
  const { createSessions, killAllSessions, killWorkspaceSessions, isLoading, error } = useTerminal();
  const { detectAllClis } = useAgentCli();
  const { checkAllAuth } = useCliLauncher();
  const { openFile } = useFileEditor();
  useFileWatcher(currentWorkspace?.path ?? null);
  const hasInitialized = useRef<Record<string, boolean>>({});
  const sidebarWidthRef = useRef(250);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const isDragging = useRef(false);
  const rafIdRef = useRef<number | null>(null);

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
        hasInitialized.current[currentWorkspace.id] = true;
      }

      markWorkspaceOpened(currentWorkspace.id);
    }
  }, [currentWorkspace?.id, sessionsByWorkspace, isLoading, error, detectAllClis, checkAllAuth, createSessions, setSessionsForWorkspace, markWorkspaceOpened]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      if (rafIdRef.current) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (!isDragging.current) return;
        const newWidth = Math.max(180, Math.min(500, e.clientX));
        sidebarWidthRef.current = newWidth;
        setSidebarWidth(newWidth);
      });
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') {
          e.preventDefault();
          toggleExplorer();
        } else if (e.key === 'e') {
          e.preventDefault();
          setActiveView(activeView === 'terminal' ? 'editor' : 'terminal');
        } else if (e.key === 'w') {
          e.preventDefault();
          const path = useAppStore.getState().activeFilePath;
          if (path) {
            closeFileTab(path);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleExplorer, activeView, closeFileTab]);

  const handleFileClick = useCallback((entry: FileEntry) => {
    if (!entry.isDir) {
      openFile(entry);
    }
  }, [openFile]);

  const handleBackToSetup = useCallback(async () => {
    try {
      await killAllSessions();
    } catch (err) {
      console.error('Error killing sessions:', err);
    }
    clearCurrentWorkspace();
  }, [killAllSessions, clearCurrentWorkspace]);

  const handleWorkspaceClick = useCallback((workspaceId: string) => {
    switchWorkspace(workspaceId);
  }, [switchWorkspace]);

  const handleWorkspaceClose = useCallback(async (workspaceId: string) => {
    try {
      await killWorkspaceSessions(workspaceId);
    } catch (err) {
      console.error('Error killing workspace sessions:', err);
    }
    closeWorkspace(workspaceId);
    delete hasInitialized.current[workspaceId];
  }, [killWorkspaceSessions, closeWorkspace]);

  const handleNewWorkspace = useCallback(() => {
    setView('setup');
  }, [setView]);


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
            className="px-6 py-2 bg-rose-950/30 border border-rose-900/50 text-rose-500 hover:bg-rose-900/40 transition-all text-[10px] font-bold uppercase tracking-widest cursor-pointer"
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

        onMinimizeWindow={minimizeWindow}
        onMaximizeWindow={maximizeWindow}
        onCloseWindow={closeWindow}
        onSidebarToggle={toggleExplorer}
        onViewToggle={useCallback(() => setActiveView(activeView === "terminal" ? "editor" : "terminal"), [setActiveView, activeView])}
        activeView={activeView}
      />

      <main className="flex-1 overflow-hidden p-1.5 bg-theme-main">
        {currentWorkspace ? (
          <div className="h-full flex gap-1">
            {explorerOpen && (
              <>
                <div style={{ width: `${sidebarWidth}px`, minWidth: '180px' }} className="shrink-0 overflow-hidden">
                  <FileExplorer
                    workspacePath={currentWorkspace.path}
                    workspaceName={currentWorkspace.name}
                    onFileClick={handleFileClick}
                  />
                </div>
                <div
                  className="w-1 cursor-col-resize hover:bg-zinc-600 active:bg-emerald-600 transition-colors shrink-0"
                  onMouseDown={handleSidebarResizeStart}
                />
              </>
            )}
            <div className="flex-1 min-w-0">
              {activeView === "terminal" ? (
                <TerminalGrid sessions={sessions} isLoading={isLoading} theme={theme} />
              ) : (
                <FileEditor />
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center space-y-4">
              <div className="text-[10px] uppercase tracking-widest opacity-60">No Active Workspace</div>
              <button
                onClick={handleNewWorkspace}
                className="px-6 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-all text-[10px] font-bold uppercase tracking-widest cursor-pointer"
              >
                [ Create Workspace ]
              </button>
            </div>
          </div>
        )}
      </main>

      <AppFooter />
    </div>
  );
};
