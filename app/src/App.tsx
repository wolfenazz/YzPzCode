import { useEffect, useState, lazy, Suspense } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { SetupScreen } from './components/setup/SetupScreen';
import { NodeJsCheckScreen } from './components/setup/NodeJsCheckScreen';
import { UpdateNotification } from './components/common/UpdateNotification';
import { ContextMenu } from './components/common/ContextMenu';
import { CustomCursor } from './components/common/CustomCursor';
import { BoxLoader } from './components/common/BoxLoader';
import { TooltipProvider } from './components/ui/tooltip';
import { useAppStore } from './stores/appStore';
import { resolveWorkspaceView } from './utils/workspaceView';
import { useDiscordPresence } from './hooks/useDiscordPresence';
import { useExtensionActivity } from './hooks/useExtensionActivity';
import { useApplyCustomTheme } from './hooks/useCustomTheme';
import { useDesktopFileOpen } from './hooks/useDesktopFileOpen';
import { initWindowPlatform } from './utils/window';
import { minimizeWindow, maximizeWindow, closeWindow } from './utils/window';

import { motion, AnimatePresence } from 'framer-motion';

const Workspace = lazy(() => import('./components/workspace/Workspace').then(m => ({ default: m.Workspace })));
const DocsScreen = lazy(() => import('./components/docs/DocsScreen').then(m => ({ default: m.DocsScreen })));
const SettingsScreen = lazy(() => import('./components/settings/SettingsScreen').then(m => ({ default: m.SettingsScreen })));

const LoadingFallback = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-theme">
    <BoxLoader />
  </div>
);



function App() {
  const {
    view,
    previousView,
    setView,
    setViewWithPrevious,
    customCursor,
    uiDensity,
    appZoom,
    animationsEnabled,
    nodejsCheckPassed,
    pruneMissingWorkspaces,
    openWorkspaces,
  } = useAppStore();
  const [isWindows, setIsWindows] = useState(false);
  const [startupReady, setStartupReady] = useState(false);
  const [workspaceVisited, setWorkspaceVisited] = useState(false);
  useEffect(() => {
    if (view === 'workspace') setWorkspaceVisited(true);
  }, [view]);
  useApplyCustomTheme();
  useDiscordPresence();
  useExtensionActivity();
  useDesktopFileOpen(startupReady);

  useEffect(() => {
    if (customCursor) {
      document.documentElement.classList.add('has-custom-cursor');
    } else {
      document.documentElement.classList.remove('has-custom-cursor');
    }
    return () => {
      document.documentElement.classList.remove('has-custom-cursor');
    };
  }, [customCursor]);



  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
    root.classList.add(`density-${uiDensity}`);
    return () => {
      root.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
    };
  }, [uiDensity]);

  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) {
      void getCurrentWebview().setZoom(appZoom / 100).catch((error: unknown) => {
        console.error('Failed to update app zoom:', error);
      });
    }
  }, [appZoom]);

  useEffect(() => {
    const root = document.documentElement;
    if (animationsEnabled) {
      root.classList.remove('animations-disabled');
    } else {
      root.classList.add('animations-disabled');
    }
    return () => {
      root.classList.remove('animations-disabled');
    };
  }, [animationsEnabled]);

  useEffect(() => {
    initWindowPlatform().then(setIsWindows).catch((err) => {
      console.error('Failed to initialize window platform:', err);
    });

    if (nodejsCheckPassed) {
      void restoreWorkspace().finally(() => setStartupReady(true));
    } else {
      // File editing itself does not require Node.js. This lets a file opened
      // from the desktop shell bypass onboarding while the normal first-run
      // experience remains unchanged when there is no pending file.
      setStartupReady(true);
    }
  }, [nodejsCheckPassed]);

  const restoreWorkspace = async () => {
    await pruneMissingWorkspaces();
    const state = useAppStore.getState();
    if (state.saveWorkspaceState && state.openWorkspaces.length > 0) {
      const targetId = state.activeWorkspaceId || state.openWorkspaces[0]?.id;
      if (targetId) {
        state.switchWorkspace(targetId);
        // A studio reopens in its own view; the terminal grid is the start of a coding workspace.
        const target = state.openWorkspaces.find((workspace) => workspace.id === targetId);
        state.setActiveView(target?.kind === 'writing' || target?.kind === 'presentation' || target?.kind === 'sheets'
          ? resolveWorkspaceView(state.activeViewByWorkspace[targetId], target, 0)
          : 'terminal');
        state.setView('workspace');
        return;
      }
    }
    state.setView('setup');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setViewWithPrevious('settings');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setViewWithPrevious]);

  const handleDocsClick = () => {
    setViewWithPrevious('docs');
  };

  const handleSettingsClick = () => {
    setViewWithPrevious('settings');
  };

  const handleBackFromDocs = () => {
    if (previousView) {
      setView(previousView);
    } else {
      setView('setup');
    }
  };

  const handleBackFromSettings = () => {
    if (previousView) {
      setView(previousView);
    } else {
      setView('setup');
    }
  };

  const handleNodeJsReady = () => {
    restoreWorkspace();
  };

  return (
    <TooltipProvider delayDuration={350}>
    <ContextMenu
      onNewWorkspace={() => setView('setup')}
      onDocsClick={handleDocsClick}
      onSettingsClick={handleSettingsClick}
    >
    <div className="app-shell min-h-screen overflow-hidden">
      {/* Keep live terminals parsing output while Settings, Docs or Setup is open. */}
      <div
        className={view === 'workspace' ? 'h-screen w-screen overflow-hidden' : 'hidden'}
        aria-hidden={view !== 'workspace'}
      >
        {(view === 'workspace' || (workspaceVisited && openWorkspaces.length > 0)) && (
          <Suspense fallback={<LoadingFallback />}>
            <Workspace
              isWindows={isWindows}
              onDocsClick={handleDocsClick}
              onSettingsClick={handleSettingsClick}
            />
          </Suspense>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {view !== 'workspace' && (
        <motion.div
          key={view}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="h-screen w-screen overflow-hidden"
        >
          {view === 'nodejs-check' && (
            <NodeJsCheckScreen onReady={handleNodeJsReady} />
          )}
          {view === 'setup' && (
            <SetupScreen
              isWindows={isWindows}
              onDocsClick={handleDocsClick}
              onSettingsClick={handleSettingsClick}
            />
          )}
          {view === 'docs' && (
            <Suspense fallback={<LoadingFallback />}>
              <DocsScreen
                isWindows={isWindows}
                onBack={handleBackFromDocs}
              />
            </Suspense>
          )}
          {view === 'settings' && (
            <Suspense fallback={<LoadingFallback />}>
              <SettingsScreen
                isWindows={isWindows}
                onBack={handleBackFromSettings}
                onMinimizeWindow={() => minimizeWindow().catch(() => { })}
                onMaximizeWindow={() => maximizeWindow().catch(() => { })}
                onCloseWindow={() => closeWindow().catch(() => { })}
              />
            </Suspense>
          )}
        </motion.div>
        )}
      </AnimatePresence>
      <UpdateNotification />
      {customCursor && <CustomCursor />}
    </div>
    </ContextMenu>
    </TooltipProvider>
  );
}

export default App;
