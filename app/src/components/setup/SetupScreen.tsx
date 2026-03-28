import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WorkspaceConfigForm } from './WorkspaceConfigForm';
import { CliToolsTable } from './CliToolsTable';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useAppStore } from '../../stores/appStore';
import { useUpdaterStore } from '../../stores/updaterStore';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';
import { WorkspaceTab } from '../workspace/WorkspaceTab';
import { FeedbackModal } from '../feedback/FeedbackModal';
import { ThemeToggleButton } from '../common/ThemeToggleButton';
import logo from '../../assets/YzPzCodeLogo.png';
import discordLogo from '../../assets/discordLOGO.png';
import instagramLogo from '../../assets/Instagramlogo.png';

interface SetupScreenProps {
  isWindows: boolean;
  onDocsClick: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ isWindows, onDocsClick }) => {
  const { setView, theme, toggleTheme, openWorkspaces, switchWorkspace, sessionsByWorkspace, closeWorkspace, selectedIdes, ideStatuses } = useAppStore();
  const {
    selectedPath,
    workspaceName,
    selectedLayout,
    agentFleet,
    selectDirectory,
    setWorkspaceName,
    setSelectedLayout,
    updateAgentFleet,
    createWorkspace,
    isValid,
    isAllocationValid
  } = useWorkspace();
  const {
    checking,
    downloading,
    downloadProgress,
    updateAvailable,
    upToDate,
    checkForUpdates,
    downloadAndInstall,
    resetUpToDate,
  } = useUpdaterStore();

    const [isLaunching, setIsLaunching] = React.useState(false);
    const [openPopover, setOpenPopover] = React.useState<string | null>(null);
    const [copiedAuthor, setCopiedAuthor] = React.useState<string | null>(null);
    const [copiedType, setCopiedType] = React.useState<'discord' | 'instagram' | null>(null);
    const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false);
    const [showWindows10Warning, setShowWindows10Warning] = React.useState(false);
    const [warningDismissed, setWarningDismissed] = React.useState(false);
    const [appVersion, setAppVersion] = React.useState<string>('');
    const popoverRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if ('__TAURI_INTERNALS__' in window) {
            import('@tauri-apps/api/app').then(({ getVersion }) => {
                getVersion().then(setAppVersion);
            });
        } else {
            setAppVersion('dev');
        }
        const checkWindowsVersion = async () => {
            if (isWindows) {
                try {
                    const osInfo = await invoke<{ is_windows_10: boolean; version: string }>('get_os_version');
                    if (osInfo.is_windows_10) {
                        setShowWindows10Warning(true);
                    }
                } catch (err) {
                    console.error('Failed to check OS version:', err);
                }
            }
        };
        checkWindowsVersion();
    }, [isWindows]);

    React.useEffect(() => {
        if (upToDate) {
            const timer = setTimeout(() => {
                resetUpToDate();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [upToDate, resetUpToDate]);

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
    try {
      closeWorkspace(workspaceId);
    } catch (err) {
      console.error('Error closing workspace:', err);
    }
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
      if (selectedLayout.openExternally) {
        await invoke('launch_external_terminals', {
          request: {
            workspacePath: selectedPath,
            count: selectedLayout.sessions,
            agentAllocation: agentFleet?.allocation || {},
          },
        });
        
        const selectedInstalledIdes = selectedIdes.filter((ide) => ideStatuses[ide]?.installed);
        for (const ide of selectedInstalledIdes) {
          try {
            await invoke('launch_ide_cmd', { ide, directory: selectedPath });
          } catch (err) {
            console.error(`Failed to launch ${ide}:`, err);
          }
        }
      } else {
        const workspace = await createWorkspace();
        
        const selectedInstalledIdes = selectedIdes.filter((ide) => ideStatuses[ide]?.installed);
        for (const ide of selectedInstalledIdes) {
          try {
            await invoke('launch_ide_cmd', { ide, directory: workspace.path });
          } catch (err) {
            console.error(`Failed to launch ${ide}:`, err);
          }
        }
        
        setView('workspace');
      }
    } catch (error) {
      console.error('Failed to create workspace:', error);
      alert('Failed to create workspace. Please try again.');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className={`h-screen bg-theme-main text-theme-main font-mono flex flex-col overflow-hidden ${theme === 'light' ? 'light-theme' : ''}`}>
      <header 
        data-tauri-drag-region
        className="relative z-50 flex items-center h-10 bg-theme-card/50 backdrop-blur-md border-b border-theme select-none transition-colors titlebar-drag overflow-hidden flex-shrink-0"
      >
        {/* Left: Branding & Core Actions */}
        <div className="flex items-center h-full titlebar-nodrag">
          <div className="flex items-center gap-3 px-4 h-full border-r border-theme bg-theme-card/30 hover:bg-theme-card/50 transition-colors group cursor-default">
            <img src={logo} alt="YzPzCode" className="h-5 w-auto grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300" />
            <div className="flex flex-col -space-y-1">
              <span className="text-[10px] font-mono font-bold tracking-tighter text-theme-main">YZPZ::CODE</span>
              <span className="text-[8px] font-mono text-zinc-500 tracking-[0.2em] uppercase">terminal</span>
            </div>
          </div>

          <button
            onClick={onDocsClick}
            className="flex items-center gap-2 px-4 h-full border-r border-theme hover:bg-theme-hover transition-all text-zinc-500 hover:text-theme-main group"
            title="Documentation"
          >
            <svg className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-[9px] font-mono tracking-widest hidden sm:inline uppercase">docs</span>
          </button>
        </div>

        {/* Middle: Workspace Tabs / Status Area */}
        <div className="flex-1 flex items-center h-full">
          {openWorkspaces.length > 0 ? (
            <div className="flex items-center h-full overflow-x-auto overflow-y-hidden border-r border-theme titlebar-nodrag">
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
          ) : (
            <div className="hidden lg:flex items-center gap-6 px-6 text-[9px] font-mono tracking-[0.3em] text-zinc-600 uppercase titlebar-nodrag">
              <span className="animate-pulse">_initializing_session</span>
              <span className="text-zinc-800">|</span>
              <span className="hover:text-zinc-400 transition-colors cursor-default">pid::{(Math.random() * 9000 + 1000).toFixed(0)}</span>
              <span className="text-zinc-800">|</span>
              <span className="hover:text-zinc-400 transition-colors cursor-default">node::master</span>
            </div>
          )}
        </div>

        {/* Right: Controls & Utilities */}
        <div className="flex items-center h-full titlebar-nodrag">
          <div className="px-2 h-full flex items-center border-l border-theme">
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
          </div>

          {/* Custom window controls — Windows only */}
          {isWindows && (
            <div className="flex h-full border-l border-theme bg-theme-card/20">
              <button
                onClick={minimizeWindow}
                className="w-10 h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors group"
                title="Minimize"
              >
                <svg className="w-2.5 h-2.5 group-hover:scale-110 transition-transform" viewBox="0 0 12 12">
                  <rect fill="currentColor" width="10" height="1.2" x="1" y="6" />
                </svg>
              </button>
              <button
                onClick={maximizeWindow}
                className="w-10 h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors group"
                title="Maximize"
              >
                <svg className="w-2.5 h-2.5 group-hover:scale-110 transition-transform" viewBox="0 0 12 12">
                  <rect fill="none" stroke="currentColor" width="8" height="8" x="2" y="2" strokeWidth="1.2" />
                </svg>
              </button>
              <button
                onClick={closeWindow}
                className="w-12 h-full flex items-center justify-center hover:bg-rose-600/90 text-zinc-500 hover:text-white transition-colors group"
                title="Close"
              >
                <svg className="w-2.5 h-2.5 group-hover:rotate-90 transition-transform duration-300" viewBox="0 0 12 12">
                  <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M2,2 L10,10 M2,10 L10,2" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col p-6 overflow-y-auto">
        <div className="w-full max-w-6xl mx-auto py-12 space-y-8">
          <div className="flex flex-col items-center justify-center mb-8">
            <img src={logo} alt="YzPzCode" className="h-16 w-auto mb-4 transition-all duration-200 hover:scale-105 hover:drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]" />
            <p className="text-theme-secondary text-sm">Welcome to YzPzCode.. it's FREE for Ever !</p>
          </div>

          {showWindows10Warning && !warningDismissed && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm">
                  <span className="text-amber-200 font-medium">Windows 10 detected.</span>
                  <span className="text-amber-100/70 ml-1">For the best experience and full UI features, we recommend upgrading to Windows 11.</span>
                </div>
              </div>
              <button
                onClick={() => setWarningDismissed(true)}
                className="text-amber-400 hover:text-amber-200 transition-colors p-1"
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

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
            isExternalMode={selectedLayout.openExternally}
          />

          <CliToolsTable />
        </div>
      </main>

      <footer className="flex-shrink-0 h-10 border-t border-theme bg-theme-card/50 backdrop-blur-sm select-none">
        <div className="h-full flex items-center justify-between px-4 font-mono text-[10px] tracking-wider uppercase">
          {/* Left: System Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-emerald-500/80">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>[ system::ready ]</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-zinc-500">
              <span className="text-zinc-700">|</span>
              <span className="hover:text-theme-main transition-colors cursor-default">env::production</span>
              <span className="text-zinc-700">|</span>
              <span className="hover:text-theme-main transition-colors cursor-default">loc::global</span>
            </div>
          </div>

          {/* Center: Branding & Authors */}
          <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-2 text-zinc-400">
            <span className="text-zinc-600">--</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>Made with</span>
              <svg className="w-3 h-3 text-rose-500/80 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span>by</span>
              <div className="flex items-center gap-1">
                {authors.map((author, index) => (
                  <React.Fragment key={author.name}>
                    <span className="relative inline-flex items-center">
                      {author.discord ? (
                        <>
                          <button
                            onClick={() => setOpenPopover(openPopover === author.name ? null : author.name)}
                            className="text-theme-main hover:text-theme-main/80 transition-colors cursor-pointer"
                          >
                            {author.name}
                          </button>
                          {openPopover === author.name && (
                            <div
                              ref={popoverRef}
                              className="absolute bottom-full left-1/2 mb-3 px-3 py-2 bg-theme-card border border-theme rounded shadow-2xl flex flex-col gap-2 whitespace-nowrap z-50 animate-popover-in"
                            >
                              <div className="flex items-center gap-2">
                                <img 
                                  src={discordLogo} 
                                  alt="Discord" 
                                  className="w-4 h-4"
                                  style={{ 
                                    filter: author.name === 'Noor' ? 'brightness(0) saturate(100%) invert(47%) sepia(89%) saturate(2878%) hue-rotate(312deg) brightness(99%) contrast(101%)' : undefined
                                  }}
                                />
                                <span className="text-theme-main font-medium">{author.discord}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(author.discord!.replace('@', ''), author.name, 'discord');
                                  }}
                                  className="p-1 hover:bg-theme-hover rounded transition-colors cursor-pointer"
                                >
                                  {copiedAuthor === author.name && copiedType === 'discord' ? (
                                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : (
                                    <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                  <span className="text-theme-main font-medium">{author.instagram}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(author.instagram!.replace('@', ''), author.name, 'instagram');
                                    }}
                                    className="p-1 hover:bg-theme-hover rounded transition-colors cursor-pointer"
                                  >
                                    {copiedAuthor === author.name && copiedType === 'instagram' ? (
                                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : (
                                      <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              )}
                              <div className="absolute top-full left-1/2 -mt-1 w-2 h-2 bg-theme-card border-r border-b border-theme transform rotate-45 -translate-x-1/2" />
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-zinc-300">{author.name}</span>
                      )}
                    </span>
                    {index < authors.length - 1 && <span className="text-zinc-600 px-0.5">&</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <span className="text-zinc-600">--</span>
          </div>

          {/* Right: Actions & Version */}
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-theme rounded overflow-hidden">
              {checking && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-800/50">
                  <svg className="w-3 h-3 text-zinc-500 animate-spin-slow" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-zinc-500">Checking...</span>
                </div>
              )}

              {!checking && upToDate && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-500">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>UP-TO-DATE</span>
                </div>
              )}

              {!checking && !downloading && updateAvailable && (
                <button
                  onClick={downloadAndInstall}
                  className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
                >
                  <span className="animate-pulse">●</span>
                  <span>UPDATE V{updateAvailable.version}</span>
                </button>
              )}

              {downloading && (
                <div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-500/10 text-emerald-500">
                  <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-200"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <span>{downloadProgress}%</span>
                </div>
              )}

              {!checking && !downloading && !updateAvailable && !upToDate && (
                <button
                  onClick={() => checkForUpdates(true)}
                  className="px-2 py-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                >
                  [ CHECK_UPDATES ]
                </button>
              )}

              <button
                onClick={() => setIsFeedbackOpen(true)}
                className="px-2 py-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
              >
                [ FEEDBACK ]
              </button>
            </div>
            
            <div className="flex items-center gap-2 text-zinc-600">
              <span>::</span>
              <span className="text-zinc-500">v{appVersion || '---'}</span>
            </div>
          </div>
        </div>
      </footer>

      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </div>
  );
};
