import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WorkspaceConfigForm } from './WorkspaceConfigForm';
import { CliToolsTable } from './CliToolsTable';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useAppStore } from '../../stores/appStore';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';
import { WorkspaceTab } from '../workspace/WorkspaceTab';
import { ThemeToggleButton } from '../common/ThemeToggleButton';
import { AppFooter } from '../common/AppFooter';
import logo from '../../assets/YzPzCodeLogo.png';

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

    const [createError, setCreateError] = React.useState<string | null>(null);
    const [isLaunching, setIsLaunching] = React.useState(false);
    const [showWindows10Warning, setShowWindows10Warning] = React.useState(false);
    const [warningDismissed, setWarningDismissed] = React.useState(false);

    React.useEffect(() => {
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
    setCreateError(null);
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
      setCreateError(error instanceof Error ? error.message : 'Failed to create workspace. Please try again.');
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
            <img src={logo} alt="YzPzCode" className="h-5 w-auto opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold tracking-tight text-theme-main">YZPZ</span>
              <span className="text-[9px] text-zinc-600">/</span>
              <span className="text-[10px] font-mono text-theme-secondary tracking-wide">code</span>
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
          <div className="flex flex-col items-center pt-2 pb-1 group cursor-default">
            <img src={logo} alt="YzPzCode" className="h-12 w-auto mb-2 opacity-70 group-hover:opacity-100 group-hover:scale-[1.05] group-hover:drop-shadow-[0_4px_12px_rgba(255,255,255,0.06)] transition-all duration-300" />
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

          {createError && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 bg-rose-500/[0.06] border border-rose-500/20 rounded-md">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-rose-500/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs font-mono text-rose-400/80">{createError}</span>
              </div>
              <button
                onClick={() => setCreateError(null)}
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

      <AppFooter />
    </div>
  );
};
