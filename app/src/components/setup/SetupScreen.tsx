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
      {/* ── TopBar ───────────────────────────────────────────────────────── */}
      <header
        data-tauri-drag-region
        className="relative z-50 flex items-center h-11 bg-theme-card/60 backdrop-blur-md border-b border-theme select-none titlebar-drag overflow-hidden flex-shrink-0"
      >
        {/* Left: Branding & Core Actions */}
        <div className="flex items-center h-full titlebar-nodrag">
          <div className="flex items-center gap-2.5 px-5 h-full border-r border-theme bg-theme-card/40 group cursor-default">
            <img src={logo} alt="YzPzCode" className="h-5 w-auto opacity-80 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold tracking-tight text-theme-main">YZPZ</span>
              <span className="text-[9px] text-zinc-600">/</span>
              <span className="text-[10px] font-mono text-zinc-400 tracking-wide">code</span>
            </div>
          </div>

          <button
            onClick={onDocsClick}
            className="flex items-center gap-1.5 px-4 h-full border-r border-theme hover:bg-theme-hover transition-colors duration-150 text-zinc-500 hover:text-theme-main cursor-pointer"
            title="Documentation"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-[9px] font-mono tracking-[0.15em] hidden sm:inline uppercase text-zinc-500">docs</span>
          </button>
        </div>

        {/* Middle: Workspace Tabs / Status Area */}
        <div className="flex-1 flex items-center h-full min-w-0">
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
            <div className="hidden lg:flex items-center gap-4 px-5 text-[9px] font-mono tracking-[0.2em] text-zinc-600 uppercase titlebar-nodrag">
              <span>_init</span>
              <span className="text-zinc-700">:</span>
              <span>pid::{(Math.random() * 9000 + 1000).toFixed(0)}</span>
              <span className="text-zinc-700">:</span>
              <span>ready</span>
            </div>
          )}
        </div>

        {/* Right: Controls & Utilities */}
        <div className="flex items-center h-full titlebar-nodrag">
          <button
            className="flex items-center justify-center w-10 h-full border-l border-theme hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors duration-150 cursor-pointer group"
            title="Settings"
          >
            <svg className="w-4 h-4 transition-transform duration-500 group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          <div className="flex items-center h-full border-l border-theme">
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
          </div>

          {/* Custom window controls — Windows only */}
          {isWindows && (
            <div className="flex h-full border-l border-theme">
              <button
                onClick={minimizeWindow}
                className="w-[42px] h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
                title="Minimize"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <rect fill="currentColor" width="10" height="1" x="1" y="5.5" />
                </svg>
              </button>
              <button
                onClick={maximizeWindow}
                className="w-[42px] h-full flex items-center justify-center hover:bg-theme-hover text-zinc-500 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
                title="Maximize"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <rect fill="none" stroke="currentColor" width="8" height="8" x="2" y="2" strokeWidth="1" />
                </svg>
              </button>
              <button
                onClick={closeWindow}
                className="w-[48px] h-full flex items-center justify-center hover:bg-[#c42b1c] text-zinc-500 hover:text-white transition-colors duration-150 cursor-pointer"
                title="Close"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
                  <path fill="none" stroke="currentColor" strokeWidth="1.2" d="M2.5,2.5 L9.5,9.5 M2.5,9.5 L9.5,2.5" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="w-full max-w-5xl mx-auto px-6 py-8 space-y-5">
          <div className="flex flex-col items-center pt-2 pb-1">
            <img src={logo} alt="YzPzCode" className="h-12 w-auto mb-2 opacity-80" />
            <p className="text-zinc-500 text-xs font-mono tracking-[0.15em] uppercase">Multi-terminal AI development environment</p>
          </div>

          {showWindows10Warning && !warningDismissed && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-500/[0.06] border border-amber-500/20 rounded-md mb-2">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-amber-500/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-xs font-mono">
                  <span className="text-amber-400/80">Windows 10 detected.</span>
                  <span className="text-zinc-500 ml-1">Upgrade to Windows 11 for the best experience.</span>
                </div>
              </div>
              <button
                onClick={() => setWarningDismissed(true)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors duration-150 p-1 cursor-pointer"
                title="Dismiss"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
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

      <footer className="flex-shrink-0 h-10 border-t border-theme bg-theme-card/40 select-none">
        <div className="h-full flex items-center justify-between px-5 font-mono text-[10px] tracking-wider uppercase">
          {/* Left: System Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-emerald-500/70">
              <span className="relative flex h-1.5 w-1.5">
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500/80"></span>
              </span>
              <span>system::ready</span>
            </div>
            <div className="hidden md:flex items-center gap-3 text-zinc-600">
              <span className="text-zinc-800">|</span>
              <span>env::production</span>
              <span className="text-zinc-800">|</span>
              <span>loc::global</span>
            </div>
          </div>

          {/* Center: Branding & Authors */}
          <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center gap-2 text-zinc-500">
            <span className="text-zinc-700">--</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>Built by</span>
              <div className="flex items-center gap-1">
                {authors.map((author, index) => (
                  <React.Fragment key={author.name}>
                    <span className="relative inline-flex items-center">
                      {author.discord ? (
                        <>
                          <button
                            onClick={() => setOpenPopover(openPopover === author.name ? null : author.name)}
                            className="text-zinc-300 hover:text-theme-main transition-colors duration-150 cursor-pointer"
                          >
                            {author.name}
                          </button>
                          {openPopover === author.name && (
                            <div
                              ref={popoverRef}
                              className="absolute bottom-full left-1/2 mb-3 px-3 py-2 bg-theme-card border border-theme rounded-md shadow-lg flex flex-col gap-2 whitespace-nowrap z-50 animate-popover-in"
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
            <span className="text-zinc-700">--</span>
          </div>

          {/* Right: Actions & Version */}
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-theme rounded-sm overflow-hidden">
              {checking && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800/30">
                  <svg className="w-3 h-3 text-zinc-500 animate-spin-slow" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-zinc-500">checking</span>
                </div>
              )}

              {!checking && upToDate && (
                <div className="flex items-center gap-1 px-2 py-1 text-emerald-500/80">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>up-to-date</span>
                </div>
              )}

              {!checking && !downloading && updateAvailable && (
                <button
                  onClick={downloadAndInstall}
                  className="flex items-center gap-1.5 px-2 py-1 text-amber-500/80 hover:bg-amber-500/10 transition-colors duration-150 cursor-pointer"
                >
                  <span>●</span>
                  <span>update v{updateAvailable.version}</span>
                </button>
              )}

              {downloading && (
                <div className="flex items-center gap-2 px-2 py-1 text-emerald-500/80">
                  <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/70 transition-all duration-200"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <span>{downloadProgress}%</span>
                </div>
              )}

              {!checking && !downloading && !updateAvailable && !upToDate && (
                <button
                  onClick={() => checkForUpdates(true)}
                  className="px-2 py-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30 transition-colors duration-150 cursor-pointer"
                >
                  check_updates
                </button>
              )}

              <button
                onClick={() => setIsFeedbackOpen(true)}
                className="px-2 py-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30 transition-colors duration-150 border-l border-theme cursor-pointer"
              >
                feedback
              </button>
            </div>
            
            <div className="flex items-center gap-1.5 text-zinc-700">
              <span>v</span>
              <span className="text-zinc-500">{appVersion || '---'}</span>
            </div>
          </div>
        </div>
      </footer>

      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </div>
  );
};
