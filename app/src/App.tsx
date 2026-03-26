import { useEffect, useState } from 'react';
import { SetupScreen } from './components/setup/SetupScreen';
import { Workspace } from './components/workspace/Workspace';
import { DocsScreen } from './components/docs/DocsScreen';
import { UpdateNotification } from './components/common/UpdateNotification';
import { useAppStore } from './stores/appStore';
import { initWindowPlatform, getIsMac } from './utils/window';

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
    toggleTheme 
  } = useAppStore();
  const [isWindows, setIsWindows] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    initWindowPlatform().then((win) => {
      setIsWindows(win);
      setIsMac(getIsMac());
    });

    if (lastOpenedWorkspaceId && view === 'setup' && openWorkspaces.length === 0) {
      const lastWorkspace = workspaceList.find(w => w.id === lastOpenedWorkspaceId);
      if (lastWorkspace) {
        openWorkspace(lastWorkspace);
        setView('workspace');
      }
    }
  }, []);

  const handleDocsClick = () => {
    setViewWithPrevious('docs');
  };

  const handleBackFromDocs = () => {
    if (previousView) {
      setView(previousView);
    } else {
      setView('setup');
    }
  };

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'light-theme' : ''}`}>
      {view === 'setup' && (
        <SetupScreen 
          isWindows={isWindows} 
          isMac={isMac}
          onDocsClick={handleDocsClick} 
        />
      )}
      {view === 'workspace' && (
        <Workspace 
          isWindows={isWindows} 
          isMac={isMac}
          onDocsClick={handleDocsClick} 
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
      <UpdateNotification />
    </div>
  );
}

export default App;
