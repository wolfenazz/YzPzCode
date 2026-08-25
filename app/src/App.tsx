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
import { useEffectiveTheme } from './hooks/useEffectiveTheme';
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

const ACCENT_COLOR_MAP: Record<string, string> = {
  default: '#c15f3c',  // Claude Crail
  burple: '#8c4edd',   // YzPzCode Burple
  blue: '#1b7ede',     // Claude blue (ring color)
  purple: '#8b5cf6',
  green: '#10b981',
  orange: '#f97316',
  red: '#f14444',
  pink: '#ec4899',
  cyan: '#06b6d4',
};

function App() {
  const {
    view,
    previousView,
    setView,
    setViewWithPrevious,
    customCursor,
    accentColor,
    uiDensity,
    appZoom,
    themeMode,
    animationsEnabled,
    nodejsCheckPassed,
    pruneMissingWorkspaces,
  } = useAppStore();
  const [isWindows, setIsWindows] = useState(false);
  const effectiveTheme = useEffectiveTheme();

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
    const usesYzPzPalette = themeMode === 'yzpz' && (accentColor === 'burple' || accentColor === 'default');
    const palette = usesYzPzPalette ? ACCENT_COLOR_MAP.burple : ACCENT_COLOR_MAP[accentColor] || ACCENT_COLOR_MAP.default;
    const usesClaudePalette = themeMode === 'claude' && accentColor === 'default';
    const hex = palette;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const root = document.documentElement;
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-light', `rgba(${r}, ${g}, ${b}, ${usesClaudePalette ? 0.12 : usesYzPzPalette ? 0.2 : 0.15})`);
    root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, ${usesClaudePalette ? 0.16 : usesYzPzPalette ? 0.28 : 0.3})`);
    root.style.setProperty('--accent-border', `rgba(${r}, ${g}, ${b}, ${usesClaudePalette ? 0.28 : usesYzPzPalette ? 0.38 : 0.2})`);
    root.style.setProperty('--accent-text', usesClaudePalette ? '#a64d31' : usesYzPzPalette ? '#c7b8f5' : `rgba(${r}, ${g}, ${b}, 0.7)`);
  }, [accentColor, themeMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('light-theme', effectiveTheme === 'light');
    root.classList.toggle('claude-theme', themeMode === 'claude');
    root.classList.toggle('yzpz-theme', themeMode === 'yzpz');
    return () => {
      root.classList.remove('light-theme', 'claude-theme', 'yzpz-theme');
    };
  }, [effectiveTheme, themeMode]);

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
      restoreWorkspace();
    }
  }, [nodejsCheckPassed]);

  const restoreWorkspace = async () => {
    await pruneMissingWorkspaces();
    const state = useAppStore.getState();
    if (state.saveWorkspaceState && state.openWorkspaces.length > 0) {
      const targetId = state.activeWorkspaceId || state.openWorkspaces[0]?.id;
      if (targetId) {
        state.switchWorkspace(targetId);
        state.setActiveView('terminal');
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

  const handleNodeJsReady = () => {
    restoreWorkspace();
  };

  return (
    <TooltipProvider delayDuration={350}>
    <div className="app-shell min-h-screen overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
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
          {view === 'workspace' && (
            <Suspense fallback={<LoadingFallback />}>
              <Workspace
                isWindows={isWindows}
                onDocsClick={handleDocsClick}
                onSettingsClick={handleSettingsClick}
              />
            </Suspense>
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
      </AnimatePresence>
      <UpdateNotification />
      <ContextMenu
        onDocsClick={handleDocsClick}
        onNewWorkspace={() => setView('setup')}
      />
      {customCursor && <CustomCursor />}
    </div>
    </TooltipProvider>
  );
}

export default App;
