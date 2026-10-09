import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WarningCircle, X } from '@phosphor-icons/react';
import { WorkspaceConfigForm } from './WorkspaceConfigForm';
import { SetupStepper } from './SetupStepper';
import { SetupBackground } from './SetupBackground';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useAppStore } from '../../stores/appStore';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';
import { activeAgentAllocation, humanizeAgentVariantMismatch } from '../../utils/agentAllocation';
import { NewWorkspaceTab, WorkspaceTab } from '../workspace/WorkspaceTab';
import { AppFooter } from '../common/AppFooter';
import { AppChrome } from '../common/AppChrome';
import type { IdeInfo, IdeType } from '../../types';

interface SetupScreenProps {
  isWindows: boolean;
  onDocsClick: () => void;
  onSettingsClick: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ isWindows, onDocsClick, onSettingsClick }) => {
  const { setView, openWorkspaces, switchWorkspace, sessionsByWorkspace, closeWorkspace, selectedIdes, ideStatuses, setupViewMode, setupBackground } = useAppStore();
  const {
    selectedPath,
    workspaceName,
    selectedLayout,
    agentFleet,
    selectedExtensionIds,
    toggleExtension,
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
    workspaceKind,
    setWorkspaceKind,
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
      let launchIdeStatuses = ideStatuses;
      if (selectedIdes.some((ide) => !launchIdeStatuses[ide])) {
        launchIdeStatuses = await invoke<Record<IdeType, IdeInfo>>('detect_all_ides_cmd');
        useAppStore.getState().setIdeStatuses(launchIdeStatuses);
      }
      if (selectedLayout.openExternally && workspaceKind !== 'writing') {
        await invoke('launch_external_terminals', {
          request: {
            workspacePath: selectedPath,
            count: selectedLayout.sessions,
            agentAllocation: agentFleet ? activeAgentAllocation(agentFleet.allocation) : {},
          },
        });
        
        const selectedInstalledIdes = selectedIdes.filter((ide) => launchIdeStatuses[ide]?.installed);
        for (const ide of selectedInstalledIdes) {
          try {
            await invoke('launch_ide_cmd', { ide, directory: selectedPath });
          } catch (err) {
            console.error(`Failed to launch ${ide}:`, err);
          }
        }
      } else {
        const workspace = await createWorkspace();

        // A writing workspace is self-contained: no IDEs open alongside it.
        const selectedInstalledIdes = workspaceKind === 'writing' ? [] : selectedIdes.filter((ide) => launchIdeStatuses[ide]?.installed);
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
      const variantMismatch = humanizeAgentVariantMismatch(error);
      setCreateError(
        variantMismatch?.message ??
          (error instanceof Error ? error.message : 'Failed to create workspace. Please try again.')
      );
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="setup-shell relative isolate flex h-screen flex-col overflow-hidden bg-theme-main text-theme-main" data-background={setupBackground}>
      <SetupBackground />
      <AppChrome
        center={(
          <nav className="chrome-tabs" aria-label="Workspaces">
            <div className="chrome-tabs__scroll" role="tablist">
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
              <NewWorkspaceTab />
            </div>
          </nav>
        )}
        isWindows={isWindows}
        onClose={closeWindow}
        onDocs={onDocsClick}
        onMaximize={maximizeWindow}
        onMinimize={minimizeWindow}
        onSettings={onSettingsClick}
      />

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="setup-main flex-1 overflow-y-auto">
        <div className="ws mx-auto w-full max-w-[80rem] space-y-6 px-4 pb-16 pt-8 sm:px-8 lg:px-12 lg:pt-12">
          {showWindows10Warning && !warningDismissed && (
            <div className="ws-banner">
              <span className="flex items-center gap-3">
                <WarningCircle className="shrink-0 text-amber-500" size={17} />
                <span><span className="font-medium">Windows 10 detected.</span>{' '}
                  <span className="text-[var(--text-secondary)]">Windows 11 provides the best window integration.</span></span>
              </span>
              <button onClick={() => setWarningDismissed(true)} className="ws-btn ws-btn--icon ws-btn--sm ws-btn--ghost" aria-label="Dismiss" title="Dismiss" type="button">
                <X size={14} />
              </button>
            </div>
          )}

          {setupViewMode === 'page' ? (
            <>
              <WorkspaceConfigForm
                selectedPath={selectedPath}
                workspaceName={workspaceName}
                selectedLayout={selectedLayout}
                agentFleet={agentFleet}
                selectedExtensionIds={selectedExtensionIds}
                onToggleExtension={toggleExtension}
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
                isLoading={isLaunching}
                isExternalMode={selectedLayout.openExternally}
                validationErrors={validationErrors}
                selectedTemplateId={selectedTemplateId}
                createError={createError}
                workspaceKind={workspaceKind}
                onWorkspaceKindChange={setWorkspaceKind}
              />
            </>
          ) : (
            <SetupStepper
              selectedPath={selectedPath}
              workspaceName={workspaceName}
              selectedLayout={selectedLayout}
              agentFleet={agentFleet}
              selectedExtensionIds={selectedExtensionIds}
              onToggleExtension={toggleExtension}
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
              workspaceKind={workspaceKind}
              onWorkspaceKindChange={setWorkspaceKind}
            />
          )}
        </div>
      </main>

      <AppFooter />
    </div>
  );
};
