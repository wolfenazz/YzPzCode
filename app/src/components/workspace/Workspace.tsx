import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TerminalGrid } from './TerminalGrid';
import { WorkspaceHeader } from './WorkspaceHeader';
import { BrowserPane } from './BrowserPane';
import { AgentGrid } from '../agent/AgentGrid';
import { AppFooter } from '../common/AppFooter';
import { FileExplorer } from '../explorer/FileExplorer';
import { FileEditor } from '../editor/FileEditor';
import { QuickOpenPalette } from '../editor/QuickOpenPalette';
import { useFileEditor } from '../../hooks/useFileEditor';
import { useFileWatcher } from '../../hooks/useFileWatcher';
import { useTerminal } from '../../hooks/useTerminal';
import { useAgentCli } from '../../hooks/useAgentCli';
import { useCliLauncher } from '../../hooks/useCliLauncher';
import { useBrowser } from '../../hooks/useBrowser';
import { useAgentHost } from '../../hooks/useAgentHost';
import { useAppStore } from '../../stores/appStore';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';
import { FileEntry, WorkspaceView } from '../../types';

interface WorkspaceProps {
  isWindows: boolean;
  onDocsClick: () => void;
  onSettingsClick: () => void;
}

import { motion, AnimatePresence } from 'framer-motion';

export const Workspace: React.FC<WorkspaceProps> = ({ isWindows, onDocsClick, onSettingsClick }) => {
  const {
    currentWorkspace,
    openWorkspaces,
    activeWorkspaceId,
    sessions,
    sessionsByWorkspace,
    clearCurrentWorkspace,
    markWorkspaceOpened,
    closeWorkspace,
    switchWorkspace,
    setView,
    setSessionsForWorkspace,
    explorerOpen,
    activeView,
    toggleExplorer,
    setActiveView,
    closeFileTab,
    restoredFilePathsByWorkspace,
    clearRestoredFilePaths,
  } = useAppStore();
  const devServerUrl = useAppStore((s) => (currentWorkspace ? s.devServerUrlByWorkspace[currentWorkspace.id] : undefined));
  const autoOpenPreview = useAppStore((s) => s.autoOpenPreview);
  const addBrowserTab = useAppStore((s) => s.addBrowserTab);
  const setDevServerUrl = useAppStore((s) => s.setDevServerUrl);
  const { createSessions, killAllSessions, killWorkspaceSessions, isLoading, error } = useTerminal();
  const { detectAllClis } = useAgentCli();
  const { checkAllAuth } = useCliLauncher();
  const { closeBrowserView } = useBrowser();
  const { closeSession: closeAgentSession } = useAgentHost();
  const { openFile } = useFileEditor();
  const shouldWatchFiles = !!currentWorkspace?.path && (explorerOpen || activeView === 'editor');
  useFileWatcher(shouldWatchFiles ? currentWorkspace?.path ?? null : null);
  const hasInitialized = useRef<Record<string, boolean>>({});
  const sidebarWidthRef = useRef(250);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
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

  // ── Dev-server preview ─────────────────────────────────────────────
  const openedPreviewRef = useRef<string | null>(null);

  const openPreview = useCallback(() => {
    if (!currentWorkspace || !devServerUrl) return;
    setActiveView('browser');
    const id = `tab-${Date.now()}`;
    addBrowserTab(currentWorkspace.id, { id, url: devServerUrl, title: 'Preview' });
  }, [currentWorkspace, devServerUrl, setActiveView, addBrowserTab]);

  // Auto-open the embedded browser the first time a dev-server URL appears
  // (per URL — switching back to the terminal doesn't re-trigger it).
  useEffect(() => {
    if (!autoOpenPreview || !devServerUrl || !currentWorkspace) return;
    if (openedPreviewRef.current === devServerUrl) return;
    openedPreviewRef.current = devServerUrl;
    setActiveView('browser');
    const id = `tab-${Date.now()}`;
    addBrowserTab(currentWorkspace.id, { id, url: devServerUrl, title: 'Preview' });
  }, [autoOpenPreview, devServerUrl, currentWorkspace, setActiveView, addBrowserTab]);

  const restoredFilesRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!currentWorkspace) return;
    const wsId = currentWorkspace.id;
    const paths = restoredFilePathsByWorkspace[wsId];

    if (!paths || paths.length === 0 || restoredFilesRef.current[wsId]) return;

    restoredFilesRef.current[wsId] = true;
    clearRestoredFilePaths(wsId);

    Promise.all(
      paths.map(async (filePath) => {
        try {
          const fileName = filePath.split(/[/\\]/).pop() || filePath;
          const ext = fileName.split('.').pop()?.toLowerCase() || '';
          const entry: FileEntry = {
            name: fileName,
            path: filePath,
            isDir: false,
            size: 0,
            modifiedAt: 0,
            extension: ext || null,
          };
          await openFile(entry);
        } catch (err) {
          console.error(`Failed to restore file ${filePath}:`, err);
        }
      })
    ).then(() => {
      const state = useAppStore.getState();
      const savedActiveView = state.activeViewByWorkspace[wsId];
      if (savedActiveView) {
        setActiveView(savedActiveView);
      }
    });
  }, [currentWorkspace?.id, restoredFilePathsByWorkspace, clearRestoredFilePaths, openFile, setActiveView]);

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
        } else if (e.key === 'p') {
          e.preventDefault();
          setShowQuickOpen(true);
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

  const handleQuickOpenSelect = useCallback((entry: FileEntry) => {
    openFile(entry);
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
    closeBrowserView(workspaceId).catch((err) => {
      console.error('Error closing browser view:', err);
    });
    killWorkspaceSessions(workspaceId).catch((err) => {
      console.error('Error killing workspace sessions:', err);
    });

    // Stop running YZPZ Agent sessions for this workspace. Sessions are KEPT
    // persisted so they can be resumed later from Agent → History. If this was
    // the last session anywhere, the agent-harness sidecar shuts down too.
    const agentSessions = useAppStore.getState().agentSessionsByWorkspace[workspaceId] || [];
    await Promise.allSettled(
      agentSessions.map(async (s) => {
        try {
          await closeAgentSession(s.sessionId);
        } catch (err) {
          console.error('Error closing agent session:', err);
        }
      })
    );
    useAppStore.getState().setAgentSessionsForWorkspace(workspaceId, []);
  }, [killWorkspaceSessions, closeWorkspace, closeBrowserView, closeAgentSession]);

  const handleNewWorkspace = useCallback(() => {
    setView('setup');
  }, [setView]);

  const handleViewChange = useCallback((view: WorkspaceView) => {
    setActiveView(view);
  }, [setActiveView]);

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
    <div className="workspace-shell app-shell h-screen flex flex-col bg-theme-main overflow-hidden text-theme-main">
      <WorkspaceHeader
        workspaces={openWorkspaces}
        activeWorkspaceId={activeWorkspaceId}
        sessionsByWorkspace={sessionsCountMap}
        onWorkspaceClick={handleWorkspaceClick}
        onWorkspaceClose={handleWorkspaceClose}
        onNewWorkspace={handleNewWorkspace}
        onDocsClick={onDocsClick}
        onSettingsClick={onSettingsClick}
        isWindows={isWindows}

        onMinimizeWindow={minimizeWindow}
        onMaximizeWindow={maximizeWindow}
        onCloseWindow={closeWindow}
        onSidebarToggle={toggleExplorer}
        onViewChange={handleViewChange}
        activeView={activeView}
      />

      <main className="workspace-main relative flex-1 overflow-hidden bg-[var(--bg-primary)]">
        {/* Dev-server preview chip — appears when a terminal prints a local URL. */}
        <AnimatePresence>
          {currentWorkspace && devServerUrl && (
            <motion.div
              key="dev-server-chip"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="workspace-dev-server absolute left-1/2 top-2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-emerald-500/30 bg-[#1c2b22]/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="font-mono text-[9px] font-bold text-emerald-300/90">
                App running at {devServerUrl.replace(/^https?:\/\//, '')}
              </span>
              <button
                type="button"
                onClick={openPreview}
                className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/20 cursor-pointer"
                title="Open in embedded browser"
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => currentWorkspace && setDevServerUrl(currentWorkspace.id, null)}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-emerald-300/40 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200"
                title="Dismiss"
                aria-label="Dismiss dev-server chip"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {currentWorkspace ? (
          <div className="workspace-stage h-full flex items-stretch">
            <AnimatePresence initial={false}>
              {explorerOpen && (
                <motion.div
                  key="sidebar"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: sidebarWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={isResizing ? { duration: 0 } : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="workspace-sidebar flex items-stretch shrink-0 overflow-hidden border-r border-theme"
                >
                  <div
                    style={{ width: `${sidebarWidth}px`, minWidth: '180px' }}
                    className="workspace-sidebar__content h-full shrink-0 overflow-hidden"
                  >
                    <FileExplorer
                      workspacePath={currentWorkspace.path}
                      workspaceName={currentWorkspace.name}
                      onFileClick={handleFileClick}
                    />
                  </div>
                  <div
                    className="workspace-sidebar__resizer w-px hover:w-1 cursor-col-resize hover:bg-zinc-500 active:bg-zinc-400 transition-all duration-150 shrink-0 z-50"
                    onMouseDown={handleSidebarResizeStart}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="workspace-view flex-1 min-w-0 overflow-hidden relative">
              {/*
                The terminal grid stays MOUNTED across view switches (hidden
                via CSS instead of unmounted) so xterm instances, scrollback,
                mouse-tracking state and running agents survive TTY<->Browser
                <->Editor switching. Re-mounting terminals on every switch was
                the root cause of mouse mode turning off and resize glitches.
              */}
              <div
                className={activeView === "terminal" ? "h-full w-full" : "hidden"}
                aria-hidden={activeView !== "terminal"}
              >
                <div className="h-full w-full overflow-hidden">
                  <TerminalGrid sessions={sessions} isLoading={isLoading} />
                </div>
              </div>

              {/*
                The agent grid stays MOUNTED across view switches (hidden via
                CSS) so in-flight agent streams and chat state survive TTY<->
                Agent<->Code<->Browser switching — same rationale as terminals.
              */}
              <div
                className={activeView === "agent" ? "h-full w-full" : "hidden"}
                aria-hidden={activeView !== "agent"}
              >
                <div className="h-full w-full overflow-hidden">
                  {currentWorkspace && <AgentGrid workspaceId={currentWorkspace.id} />}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {activeView === "browser" && currentWorkspace && (
                  <motion.div
                    key="browser"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute inset-0"
                  >
                    <BrowserPane workspaceId={currentWorkspace.id} sessions={sessions} />
                  </motion.div>
                )}
                {activeView === "editor" && (
                  <motion.div
                    key="editor"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute inset-0"
                  >
                    <FileEditor />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="workspace-empty h-full flex items-center justify-center">
            <div className="workspace-empty__content text-center space-y-6">
              <div className="w-10 h-10 mx-auto border border-zinc-800 flex items-center justify-center">
                <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-secondary)]">No active workspace</div>
                <p className="text-[10px] text-[var(--text-secondary)] font-mono">Initialize a new session to begin.</p>
              </div>
              <button
                onClick={handleNewWorkspace}
                className="inline-flex items-center gap-2 px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-zinc-800 hover:border-zinc-500 transition-all duration-200 text-[11px] font-mono uppercase tracking-[0.1em] cursor-pointer group"
              >
                <span className="w-1 h-1 bg-[var(--text-secondary)] group-hover:bg-[var(--text-primary)] transition-colors duration-200"></span>
                Initialize
              </button>
            </div>
          </div>
        )}
      </main>

      <AppFooter />

      {showQuickOpen && currentWorkspace && (
        <QuickOpenPalette
          workspacePath={currentWorkspace.path}
          onSelect={handleQuickOpenSelect}
          onClose={() => setShowQuickOpen(false)}
        />
      )}
    </div>
  );
};
