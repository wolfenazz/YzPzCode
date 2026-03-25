import React from 'react';
import { WorkspaceConfigForm } from './WorkspaceConfigForm';
import { CliToolsTable } from './CliToolsTable';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useAppStore } from '../../stores/appStore';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';
import { WorkspaceTab } from '../workspace/WorkspaceTab';
import logo from '../../assets/AgentsLandLogo.png';
import discordLogo from '../../assets/discordLOGO.png';
import instagramLogo from '../../assets/Instagramlogo.png';

interface SetupScreenProps {
  isWindows: boolean;
  onDocsClick: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ isWindows, onDocsClick }) => {
  const { setView, theme, toggleTheme, openWorkspaces, switchWorkspace, sessionsByWorkspace, closeWorkspace } = useAppStore();
  const {
    selectedPath,
    workspaceName,
    selectedLayout,
    selectDirectory,
    setWorkspaceName,
    setSelectedLayout,
    updateAgentFleet,
    createWorkspace,
    isValid,
    isAllocationValid,
  } = useWorkspace();

  const [isLaunching, setIsLaunching] = React.useState(false);
  const [openPopover, setOpenPopover] = React.useState<string | null>(null);
  const [copiedAuthor, setCopiedAuthor] = React.useState<string | null>(null);
  const [copiedType, setCopiedType] = React.useState<'discord' | 'instagram' | null>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const authors = [
    { name: 'Naseem', discord: '@ws.', instagram: null },
    { name: 'Noor', discord: '@sjc0', instagram: '@luvnoorl' },
    { name: 'Khalid', discord: null, instagram: null },
  ];

  const copyToClipboard = async (text: string, authorName: string, type: 'discord' | 'instagram') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAuthor(authorName);
      setCopiedType(type);
      setTimeout(() => {
        setCopiedAuthor(null);
        setCopiedType(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleWorkspaceClick = (workspaceId: string) => {
    switchWorkspace(workspaceId);
    setView('workspace');
  };

  const handleWorkspaceClose = (workspaceId: string) => {
    closeWorkspace(workspaceId);
  };

  const handleCancel = () => {
    if (openWorkspaces.length > 0) {
      switchWorkspace(openWorkspaces[0].id);
      setView('workspace');
    }
  };

  const sessionsCountMap: Record<string, number> = {};
  Object.entries(sessionsByWorkspace).forEach(([workspaceId, sessions]) => {
    sessionsCountMap[workspaceId] = sessions.length;
  });

  const handleCreateWorkspace = async () => {
    if (isLaunching) return;
    setIsLaunching(true);
    try {
      await createWorkspace();
      setView('workspace');
    } catch (error) {
      console.error('Failed to create workspace:', error);
      alert('Failed to create workspace. Please try again.');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className={`h-screen bg-theme-main text-theme-main font-mono flex flex-col overflow-hidden ${theme === 'light' ? 'light-theme' : ''}`}>
      <header className={`
        fixed top-0 left-0 right-0 z-50 flex items-center h-10 bg-theme-main border-b border-theme select-none transition-colors
        ${isWindows ? 'titlebar-drag active:cursor-grabbing' : ''}
      `}>
        {/* Left: Logo */}
        <div className="flex items-center h-full titlebar-nodrag">
          <div className="flex items-center gap-2 px-3 h-full border-r border-theme bg-theme-card cursor-default">
            <img src={logo} alt="AgentsLand" className="h-6 w-auto" />
          </div>

          <button
            onClick={onDocsClick}
            className="flex items-center justify-center w-10 h-full border-l border-theme hover:bg-theme-hover transition-colors text-theme-secondary hover:text-theme-main"
            title="Documentation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </button>
        </div>

        {/* Workspace tabs if there are open workspaces */}
        {openWorkspaces.length > 0 && (
          <div className="flex items-center h-full overflow-x-auto overflow-y-hidden titlebar-nodrag border-l border-theme">
            {openWorkspaces.map((workspace) => (
              <WorkspaceTab
                key={workspace.id}
                workspace={workspace}
                isActive={false}
                sessionsCount={sessionsCountMap[workspace.id] || 0}
                onClick={() => handleWorkspaceClick(workspace.id)}
                onClose={(e) => {
                  e.stopPropagation();
                  handleWorkspaceClose(workspace.id);
                }}
              />
            ))}
          </div>
        )}

        {/* Middle: Drag area spacer */}
        <div className="flex-1 h-full" />

        {/* Right: action buttons */}
        <div className="flex items-center h-full gap-0 titlebar-nodrag">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-10 h-full border-l border-theme hover:bg-theme-hover transition-colors text-theme-secondary hover:text-theme-main"
            title="Switch Theme"
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 18v1m9-9h1M3 9h1m12.728-4.272l-.707.707M6.343 17.657l-.707.707M16.95 16.95l.707.707M7.05 7.05l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            )}
          </button>

          {/* Custom window controls — Windows only */}
          {isWindows && (
            <div className="flex h-full border-l border-theme">
              <button
                onClick={minimizeWindow}
                className="w-10 h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors"
                title="Minimize"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6" /></svg>
              </button>
              <button
                onClick={maximizeWindow}
                className="w-10 h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors"
                title="Maximize"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12"><rect fill="none" stroke="currentColor" width="9" height="9" x="1.5" y="1.5" strokeWidth="1" /></svg>
              </button>
              <button
                onClick={closeWindow}
                className="w-12 h-full flex items-center justify-center hover:bg-rose-600 text-zinc-500 hover:text-white transition-colors"
                title="Close"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 12 12">
                  <path fill="none" stroke="currentColor" strokeWidth="1.2" d="M1,1 L11,11 M1,11 L11,1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col p-6 pt-20 overflow-y-auto">
        <div className="w-full max-w-6xl mx-auto py-12 space-y-8">
          <div className="flex flex-col items-center justify-center mb-8">
            <img src={logo} alt="AgentsLand" className="h-16 w-auto mb-4" />
            <p className="text-theme-secondary text-sm">Welcome to AgentsLand.. it's FREE for Ever !</p>
          </div>
          <WorkspaceConfigForm
            selectedPath={selectedPath}
            workspaceName={workspaceName}
            selectedLayout={selectedLayout}
            isAllocationValid={isAllocationValid}
            hasOpenWorkspaces={openWorkspaces.length > 0}
            onSelectDirectory={selectDirectory}
            onWorkspaceNameChange={setWorkspaceName}
            onLayoutSelect={setSelectedLayout}
            onAllocationChange={updateAgentFleet}
            onCreateWorkspace={handleCreateWorkspace}
            onCancel={handleCancel}
            isValid={isValid}
          />

          <CliToolsTable />
        </div>
      </main>

      <footer className="flex-shrink-0 py-4 text-center border-t border-theme">
        <p className="text-xs text-theme-secondary flex items-center justify-center gap-1 flex-wrap">
          Made with
          <svg className="w-3 h-3 text-rose-500 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          by{' '}
          {authors.map((author, index) => (
            <React.Fragment key={author.name}>
              <span className="relative inline-flex items-center">
                {author.discord ? (
                  <>
                    <button
                      onClick={() => setOpenPopover(openPopover === author.name ? null : author.name)}
                      className="hover:text-theme-main transition-colors cursor-pointer underline underline-offset-2 decoration-dashed hover:decoration-solid"
                    >
                      {author.name}
                    </button>
                    {openPopover === author.name && (
                      <div
                        ref={popoverRef}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-theme-card border border-theme rounded-lg shadow-lg flex flex-col gap-2 whitespace-nowrap z-50 animate-popover-in"
                      >
                        <div className="flex items-center gap-2">
                          <img 
                            src={discordLogo} 
                            alt="Discord" 
                            className="w-4 h-4 animate-bounce"
                            style={{ 
                              animationDuration: '1.5s',
                              filter: author.name === 'Noor' ? 'brightness(0) saturate(100%) invert(47%) sepia(89%) saturate(2878%) hue-rotate(312deg) brightness(99%) contrast(101%)' : undefined
                            }}
                          />
                          <span className="text-theme-main text-xs font-medium">{author.discord}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(author.discord!.replace('@', ''), author.name, 'discord');
                            }}
                            className="p-1 hover:bg-theme-hover rounded transition-colors cursor-pointer"
                            title="Copy to clipboard"
                          >
                            {copiedAuthor === author.name && copiedType === 'discord' ? (
                              <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-theme-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        </div>
                        {author.instagram && (
                          <div className="flex items-center gap-2 pt-1 border-t border-theme">
                            <img 
                              src={instagramLogo} 
                              alt="Instagram" 
                              className="w-4 h-4"
                            />
                            <span className="text-theme-main text-xs font-medium">{author.instagram}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(author.instagram!.replace('@', ''), author.name, 'instagram');
                              }}
                              className="p-1 hover:bg-theme-hover rounded transition-colors cursor-pointer"
                              title="Copy to clipboard"
                            >
                              {copiedAuthor === author.name && copiedType === 'instagram' ? (
                                <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 text-theme-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-theme-card border-r border-b border-theme transform rotate-45" />
                      </div>
                    )}
                  </>
                ) : (
                  <span>{author.name}</span>
                )}
              </span>
              {index < authors.length - 1 && <span className="text-theme-secondary">&</span>}
            </React.Fragment>
          ))}
          {' '}to the Programmers around the world !
        </p>
      </footer>
    </div>
  );
};
