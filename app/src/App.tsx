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

const ACCENT_COLOR_MAP: Record<string, string> = {
  default: '#a1a1aa',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  green: '#10b981',
  orange: '#f97316',
  red: '#ef4444',
  pink: '#ec4899',
  cyan: '#06b6d4',
};

function App() {
  const { 
    view, 
    previousView,
    openWorkspaces, 
    activeWorkspaceId,
    switchWorkspace,
    setView, 
    setViewWithPrevious,
    theme,
    toggleTheme,
    customCursor,
    saveWorkspaceState,
    accentColor,
    uiDensity,
    animationsEnabled,
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
    const hex = ACCENT_COLOR_MAP[accentColor] || ACCENT_COLOR_MAP.default;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const root = document.documentElement;
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-light', `rgba(${r}, ${g}, ${b}, 0.15)`);
    root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.3)`);
    root.style.setProperty('--accent-border', `rgba(${r}, ${g}, ${b}, 0.2)`);
    root.style.setProperty('--accent-text', `rgba(${r}, ${g}, ${b}, 0.7)`);
  }, [accentColor]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
    root.classList.add(`density-${uiDensity}`);
    return () => {
      root.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
    };
  }, [uiDensity]);

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

    if (saveWorkspaceState && openWorkspaces.length > 0) {
      const targetId = activeWorkspaceId || openWorkspaces[0]?.id;
      if (targetId) {
        switchWorkspace(targetId);
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
