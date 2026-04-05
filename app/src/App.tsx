import { useEffect, useState } from 'react';
import { SetupScreen } from './components/setup/SetupScreen';
import { Workspace } from './components/workspace/Workspace';
import { DocsScreen } from './components/docs/DocsScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';
import { UpdateNotification } from './components/common/UpdateNotification';
import { ContextMenu } from './components/common/ContextMenu';
import { CustomCursor } from './components/common/CustomCursor';
import { useAppStore } from './stores/appStore';
import { initWindowPlatform } from './utils/window';
import { minimizeWindow, maximizeWindow, closeWindow } from './utils/window';

import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const { 
    view, 
    previousView,
    lastOpenedWorkspaceId, 
    workspaceList, 
    openWorkspaces, 
    openWorkspace, 
    setView, 
    setViewWithPrevious,
    theme,
    toggleTheme,
    customCursor 
  } = useAppStore();
  const [isWindows, setIsWindows] = useState(false);

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
    initWindowPlatform().then(setIsWindows).catch((err) => {
      console.error('Failed to initialize window platform:', err);
    });

    if (lastOpenedWorkspaceId && view === 'setup' && openWorkspaces.length === 0) {
      const lastWorkspace = workspaceList.find(w => w.id === lastOpenedWorkspaceId);
      if (lastWorkspace) {
        openWorkspace(lastWorkspace);
        setView('workspace');
      }
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setView('settings');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setView]);

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

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'light-theme' : ''} overflow-hidden`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="h-screen w-screen overflow-hidden"
        >
          {view === 'setup' && (
            <SetupScreen 
              isWindows={isWindows} 
              onDocsClick={handleDocsClick}
              onSettingsClick={handleSettingsClick}
            />
          )}
          {view === 'workspace' && (
            <Workspace 
              isWindows={isWindows} 
              onDocsClick={handleDocsClick}
              onSettingsClick={handleSettingsClick}
            />
          )}
          {view === 'docs' && (
            <DocsScreen
              isWindows={isWindows}
              onBack={handleBackFromDocs}
              theme={theme}
              onThemeToggle={toggleTheme}
            />
          )}
          {view === 'settings' && (
            <SettingsScreen
              isWindows={isWindows}
              onBack={handleBackFromSettings}
              onMinimizeWindow={() => minimizeWindow().catch(() => {})}
              onMaximizeWindow={() => maximizeWindow().catch(() => {})}
              onCloseWindow={() => closeWindow().catch(() => {})}
            />
          )}
        </motion.div>
      </AnimatePresence>
      <UpdateNotification />
      <ContextMenu
        theme={theme}
        onThemeToggle={toggleTheme}
        onDocsClick={handleDocsClick}
        onNewWorkspace={() => setView('setup')}
      />
      {customCursor && <CustomCursor />}
    </div>
  );
}

export default App;
