import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WarningCircle, X } from '@phosphor-icons/react';
import { WorkspaceConfigForm } from './WorkspaceConfigForm';
import { SetupStepper } from './SetupStepper';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useAppStore } from '../../stores/appStore';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';
import { WorkspaceTab } from '../workspace/WorkspaceTab';
import { AppFooter } from '../common/AppFooter';
import { AppChrome } from '../common/AppChrome';

interface SetupScreenProps {
  isWindows: boolean;
  onDocsClick: () => void;
  onSettingsClick: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ isWindows, onDocsClick, onSettingsClick }) => {
  const { setView, openWorkspaces, switchWorkspace, sessionsByWorkspace, closeWorkspace, selectedIdes, ideStatuses, setupViewMode } = useAppStore();
  const {
    selectedPath,
    workspaceName,
    selectedLayout,
    agentFleet,
    selectedTemplateId,
    templates,
    selectDirectory,
    selectRecentDirectory,
    setWorkspaceName,
    setSelectedLayout,
    updateAgentFleet,
    applyTemplate,
    saveAsCustomTemplate,
    deleteTemplate,
    updateTemplate,
    restoreDefaults,
    createWorkspace,
    isValid,
    isAllocationValid,
    validationErrors,
    currentTemplateAllocation,
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
    <div className="setup-shell flex h-screen flex-col overflow-hidden bg-theme-main text-theme-main">
      <AppChrome
        center={openWorkspaces.length > 0 ? (
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {openWorkspaces.map((workspace) => (
              <WorkspaceTab
                key={workspace.id}
                workspace={workspace}
                isActive={false}
                sessionsCount={sessionsCountMap[workspace.id] || 0}
                onClick={() => handleWorkspaceClick(workspace.id)}
                onClose={(event) => {
                  event.stopPropagation();
                  handleWorkspaceClose(workspace.id);
                }}
              />
            ))}
          </div>
        ) : (
          <span className="hidden text-xs text-[var(--text-secondary)] md:inline">Create or reopen a workspace</span>
        )}
        isWindows={isWindows}
        onClose={closeWindow}
        onDocs={onDocsClick}
        onMaximize={maximizeWindow}
        onMinimize={minimizeWindow}
        onSettings={onSettingsClick}
        title="YzPzCode"
      />

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="setup-main flex-1 overflow-y-auto">
        <div className="setup-page app-page space-y-7">
          <section className="setup-page__hero app-page__hero">
            <h1>Start with the work, not the tooling.</h1>
            <p>Choose a project, shape the agent team, and open a focused workspace for building, reviewing, and shipping.</p>
          </section>

          {showWindows10Warning && !warningDismissed && (
            <div className="app-surface flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <WarningCircle className="shrink-0 text-amber-400/80" size={18} />
                <div className="text-sm">
                  <span className="font-medium text-[var(--text-primary)]">Windows 10 detected.</span>
                  <span className="ml-1 text-[var(--text-secondary)]">Windows 11 provides the best window integration.</span>
                </div>
              </div>
              <button
                onClick={() => setWarningDismissed(true)}
                className="app-icon-button"
                title="Dismiss"
                type="button"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {createError && setupViewMode === 'page' && (
            <div className="app-surface flex items-center justify-between gap-4 border-rose-500/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <WarningCircle className="shrink-0 text-rose-400/80" size={18} />
                <span className="text-sm text-rose-300/90">{createError}</span>
              </div>
              <button
                onClick={() => setCreateError(null)}
                className="app-icon-button"
                title="Dismiss"
                type="button"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {setupViewMode === 'page' ? (
            <>
              <WorkspaceConfigForm
                selectedPath={selectedPath}
                workspaceName={workspaceName}
                selectedLayout={selectedLayout}
                isAllocationValid={isAllocationValid}
                hasOpenWorkspaces={openWorkspaces.length > 0}
                onSelectDirectory={selectDirectory}
                onSelectRecentDirectory={selectRecentDirectory}
                onWorkspaceNameChange={setWorkspaceName}
                onLayoutSelect={setSelectedLayout}
                onAllocationChange={updateAgentFleet}
                onTemplateSelect={applyTemplate}
                onReapplyTemplate={applyTemplate}
                onSaveCustomTemplate={saveAsCustomTemplate}
                onDeleteTemplate={deleteTemplate}
                onUpdateTemplate={updateTemplate}
                onRestoreDefaults={restoreDefaults}
                templates={templates}
                onCreateWorkspace={handleCreateWorkspace}
                onCancel={handleCancel}
                isValid={isValid}
                isExternalMode={selectedLayout.openExternally}
                validationErrors={validationErrors}
                selectedTemplateId={selectedTemplateId}
                templateAllocation={currentTemplateAllocation}
              />

            </>
          ) : (
            <SetupStepper
              selectedPath={selectedPath}
              workspaceName={workspaceName}
              selectedLayout={selectedLayout}
              isAllocationValid={isAllocationValid}
              hasOpenWorkspaces={openWorkspaces.length > 0}
              onSelectDirectory={selectDirectory}
              onSelectRecentDirectory={selectRecentDirectory}
              onWorkspaceNameChange={setWorkspaceName}
              onLayoutSelect={setSelectedLayout}
              onAllocationChange={updateAgentFleet}
              onTemplateSelect={applyTemplate}
              onReapplyTemplate={applyTemplate}
              onSaveCustomTemplate={saveAsCustomTemplate}
              onDeleteTemplate={deleteTemplate}
              onUpdateTemplate={updateTemplate}
              onRestoreDefaults={restoreDefaults}
              templates={templates}
              onCreateWorkspace={handleCreateWorkspace}
              onCancel={handleCancel}
              isValid={isValid}
              isLaunching={isLaunching}
              isExternalMode={selectedLayout.openExternally}
              createError={createError}
              validationErrors={validationErrors}
              selectedTemplateId={selectedTemplateId}
              templateAllocation={currentTemplateAllocation}
            />
          )}
        </div>
      </main>

      <AppFooter />
    </div>
  );
};
