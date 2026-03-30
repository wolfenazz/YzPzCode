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

import { motion, AnimatePresence } from 'framer-motion';

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
  const [isResizing, setIsResizing] = useState(false);
  const isDragging = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  const showEmpty = !currentWorkspace && openWorkspaces.length === 0;

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
      setIsResizing(false);
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
    setIsResizing(true);
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

  const handleFileClick = useCallback((entry: FileEntry, change?: string) => {
    if (!entry.isDir) {
      openFile(entry, change);
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
    closeWorkspace(workspaceId);
    delete hasInitialized.current[workspaceId];
    killWorkspaceSessions(workspaceId).catch((err) => {
      console.error('Error killing workspace sessions:', err);
    });
  }, [killWorkspaceSessions, closeWorkspace]);

  const handleNewWorkspace = useCallback(() => {
    setView('setup');
  }, [setView]);

  const handleViewToggle = useCallback(() => {
    setActiveView(activeView === "terminal" ? "editor" : "terminal");
  }, [setActiveView, activeView]);

  const sessionsCountMap: Record<string, number> = {};
  Object.entries(sessionsByWorkspace).forEach(([workspaceId, sessions]) => {
    sessionsCountMap[workspaceId] = sessions.length;
  });
  if (currentWorkspace && !sessionsCountMap[currentWorkspace.id]) {
    sessionsCountMap[currentWorkspace.id] = sessions.length;
  }

  if (showEmpty) {
    return <div className="h-screen w-screen bg-theme-main" />;
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
    <div className="h-screen flex flex-col bg-theme-main font-mono overflow-hidden text-theme-main">
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
        onViewToggle={handleViewToggle}
        activeView={activeView}
      />

      <main className="flex-1 overflow-hidden bg-theme-main">
        {currentWorkspace ? (
          <div className="h-full flex items-stretch">
            <AnimatePresence initial={false}>
              {explorerOpen && (
                <motion.div
                  key="sidebar"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: sidebarWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={isResizing ? { duration: 0 } : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="flex items-stretch shrink-0 overflow-hidden border-r border-theme"
                >
                  <div
                    style={{ width: `${sidebarWidth}px`, minWidth: '180px' }}
                    className="h-full shrink-0 overflow-hidden"
                  >
                    <FileExplorer
                      workspacePath={currentWorkspace.path}
                      workspaceName={currentWorkspace.name}
                      onFileClick={handleFileClick}
                    />
                  </div>
                  <div
                    className="w-px hover:w-1 cursor-col-resize hover:bg-zinc-500 active:bg-zinc-400 transition-all duration-150 shrink-0 z-50"
                    onMouseDown={handleSidebarResizeStart}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex-1 min-w-0 overflow-hidden relative">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeView}
                  initial={{ opacity: 0, scale: 0.99, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.01, y: -4 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="h-full w-full"
                >
                  {activeView === "terminal" ? (
                    <TerminalGrid sessions={sessions} isLoading={isLoading} theme={theme} />
                  ) : (
                    <FileEditor />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-6">
              <div className="w-10 h-10 mx-auto border border-zinc-800 rounded flex items-center justify-center">
                <svg className="w-5 h-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">No active workspace</div>
                <p className="text-[10px] text-zinc-700 font-mono">Initialize a new session to begin.</p>
              </div>
              <button
                onClick={handleNewWorkspace}
                className="inline-flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-theme-main border border-zinc-800 hover:border-zinc-500 transition-all duration-200 text-[11px] font-mono uppercase tracking-[0.1em] cursor-pointer rounded group"
              >
                <span className="w-1 h-1 rounded-full bg-zinc-600 group-hover:bg-zinc-300 transition-colors duration-200"></span>
                Initialize
              </button>
            </div>
          </div>
        )}
      </main>

      <AppFooter />
    </div>
  );
};
