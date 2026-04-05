import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WorkspaceTemplatePicker } from './WorkspaceTemplatePicker';
import { DirectorySelector } from './DirectorySelector';
import { InitializeWorkspace } from './InitializeWorkspace';
import { LayoutSelector } from './LayoutSelector';
import { IdesSelector } from './IdesSelector';
import { AgentFleetConfig } from './AgentFleetConfig';
import { CliToolsTable } from './CliToolsTable';
import { HelpTooltip } from '../common/HelpTooltip';
import { LayoutConfig, AgentFleet } from '../../types';
import { WorkspaceTemplate } from '../../hooks/useWorkspace';

interface SetupStepperProps {
  selectedPath: string;
  workspaceName: string;
  selectedLayout: LayoutConfig;
  isAllocationValid: boolean;
  hasOpenWorkspaces?: boolean;
  onSelectDirectory: () => void;
  onSelectRecentDirectory: (path: string) => void;
  onWorkspaceNameChange: (name: string) => void;
  onLayoutSelect: (layout: LayoutConfig) => void;
  onAllocationChange: (fleet: AgentFleet) => void;
  onTemplateSelect: (templateId: string) => void;
  onReapplyTemplate?: (templateId: string) => void;
  onSaveCustomTemplate: (name: string) => void;
  onDeleteTemplate: (id: string) => void;
  onUpdateTemplate: (id: string, updates: Partial<Omit<WorkspaceTemplate, 'id'>>) => void;
  onRestoreDefaults: () => void;
  templates: WorkspaceTemplate[];
  onCreateWorkspace: () => void;
  onCancel?: () => void;
  isValid: boolean;
  isLaunching: boolean;
  isExternalMode?: boolean;
  createError: string | null;
  validationErrors: Record<string, string>;
  selectedTemplateId: string;
  templateAllocation?: Record<string, number> | null;
}

const STEPS = [
  { id: 'template', label: 'Template', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
  { id: 'workspace', label: 'Workspace', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
  { id: 'init', label: 'Initialize', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
  { id: 'layout', label: 'Layout', icon: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 14a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z' },
  { id: 'agents', label: 'Agents', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
] as const;

type StepId = typeof STEPS[number]['id'];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -40 : 40,
    opacity: 0,
  }),
};

export const SetupStepper: React.FC<SetupStepperProps> = ({
  selectedPath,
  workspaceName,
  selectedLayout,
  isAllocationValid,
  hasOpenWorkspaces,
  onSelectDirectory,
  onSelectRecentDirectory,
  onWorkspaceNameChange,
  onLayoutSelect,
  onAllocationChange,
  onTemplateSelect,
  onReapplyTemplate,
  onSaveCustomTemplate,
  onDeleteTemplate,
  onUpdateTemplate,
  onRestoreDefaults,
  templates,
  onCreateWorkspace,
  onCancel,
  isValid,
  isLaunching,
  isExternalMode,
  createError,
  validationErrors,
  selectedTemplateId,
  templateAllocation,
}) => {
  const [currentStep, setCurrentStep] = useState<StepId>('template');
  const [direction, setDirection] = useState(0);
  const [didAutoAdvance, setDidAutoAdvance] = useState(false);

  const isTemplateSelected = selectedTemplateId !== 'custom';

  const stepIndex = useMemo(() => STEPS.findIndex((s) => s.id === currentStep), [currentStep]);

  const goToStep = useCallback((step: StepId) => {
    setDirection(STEPS.findIndex((s) => s.id === step) > STEPS.findIndex((s) => s.id === currentStep) ? 1 : -1);
    setCurrentStep(step);
    setDidAutoAdvance(false);
  }, [currentStep]);

  const goNext = useCallback(() => {
    const idx = STEPS.findIndex((s) => s.id === currentStep);
    if (idx < STEPS.length - 1) {
      const next = STEPS[idx + 1].id;
      setDirection(1);
      setCurrentStep(next);
    }
  }, [currentStep]);

  const goPrev = useCallback(() => {
    const idx = STEPS.findIndex((s) => s.id === currentStep);
    if (idx > 0) {
      const prev = STEPS[idx - 1].id;
      setDirection(-1);
      setCurrentStep(prev);
      setDidAutoAdvance(false);
    }
  }, [currentStep]);

  const isStepComplete = useCallback((stepId: StepId): boolean => {
    switch (stepId) {
      case 'template':
        return true;
      case 'workspace':
        return selectedPath.length > 0 && (isExternalMode || workspaceName.trim().length > 0);
      case 'init':
        return selectedPath.length > 0;
      case 'layout':
        return isTemplateSelected || selectedLayout.sessions > 0;
      case 'agents':
        return isAllocationValid;
      default:
        return false;
    }
  }, [isTemplateSelected, selectedPath, workspaceName, isExternalMode, selectedLayout, isAllocationValid]);

  const isStepSkipped = useCallback((stepId: StepId): boolean => {
    if (!isTemplateSelected) return false;
    return stepId === 'layout' || stepId === 'agents';
  }, [isTemplateSelected]);

  const canAdvance = useCallback((): boolean => {
    return isStepComplete(currentStep);
  }, [currentStep, isStepComplete]);

  const handleTemplateSelect = useCallback((templateId: string) => {
    onTemplateSelect(templateId);
  }, [onTemplateSelect]);

  React.useEffect(() => {
    if (isTemplateSelected && currentStep === 'template' && !didAutoAdvance) {
      setDidAutoAdvance(true);
      const timer = setTimeout(() => {
        goNext();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isTemplateSelected, currentStep, didAutoAdvance, goNext]);

  const renderStepContent = () => {
    switch (currentStep) {
      case 'template':
        return (
          <WorkspaceTemplatePicker
            selectedTemplateId={selectedTemplateId}
            templates={templates}
            onSelectTemplate={handleTemplateSelect}
            onReapplyTemplate={onReapplyTemplate}
            onDeleteTemplate={onDeleteTemplate}
            onSaveCustomTemplate={onSaveCustomTemplate}
            onUpdateTemplate={onUpdateTemplate}
            onRestoreDefaults={onRestoreDefaults}
          />
        );

      case 'workspace':
        return (
          <div className="space-y-6">
            {!isExternalMode && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <label className="block text-xs font-medium text-zinc-400 font-mono uppercase tracking-[0.15em]">
                    Workspace Name
                  </label>
                  <HelpTooltip text="A name to identify this workspace. Used as a tab label when switching between multiple workspaces." />
                </div>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => onWorkspaceNameChange(e.target.value)}
                  placeholder="Enter workspace name..."
                  className={`w-full px-4 py-3 bg-theme-main border rounded-lg text-theme-main placeholder-zinc-600 focus:outline-none font-mono text-sm transition-colors duration-150 ${
                    validationErrors.workspaceName
                      ? 'border-rose-500/40 focus:border-rose-500'
                      : 'border-theme focus:border-zinc-500'
                  }`}
                />
                {validationErrors.workspaceName && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <svg className="w-3 h-3 text-rose-400/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-[10px] text-rose-400/80 font-mono">{validationErrors.workspaceName}</span>
                  </div>
                )}
              </div>
            )}

            <DirectorySelector
              selectedPath={selectedPath}
              onSelectDirectory={onSelectDirectory}
              onSelectRecentDirectory={onSelectRecentDirectory}
              errorMessage={validationErrors.directory}
            />
          </div>
        );

      case 'init':
        return (
          <div className="space-y-6">
            <InitializeWorkspace selectedPath={selectedPath} />
            <CliToolsTable />
          </div>
        );

      case 'layout':
        return (
          <div className="space-y-6">
            {isStepSkipped('layout') ? (
              <div className="bg-cyan-500/[0.04] border border-cyan-500/15 rounded-lg p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-cyan-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-mono text-cyan-400/70">Auto-configured by template</span>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-400">
                  <span>{selectedLayout.sessions} terminal slots</span>
                  <span className="text-zinc-700">|</span>
                  <span>{selectedLayout.openExternally ? 'External mode' : 'Embedded mode'}</span>
                </div>
              </div>
            ) : null}
            <LayoutSelector
              selectedLayout={selectedLayout}
              onSelectLayout={onLayoutSelect}
            />
            <IdesSelector selectedPath={selectedPath} />
          </div>
        );

      case 'agents':
        return (
          <div className="space-y-6">
            {isStepSkipped('agents') ? (
              <div className="bg-cyan-500/[0.04] border border-cyan-500/15 rounded-lg p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-cyan-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-mono text-cyan-400/70">Auto-configured by template</span>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-400">
                  <span>{selectedLayout.sessions} total slots allocated</span>
                </div>
              </div>
            ) : null}
            <AgentFleetConfig
              totalSlots={selectedLayout.sessions}
              onAllocationChange={onAllocationChange}
              templateAllocation={templateAllocation as any}
              selectedTemplateId={selectedTemplateId}
            />
            {!isAllocationValid && (
              <div className="px-4 py-3 bg-rose-500/[0.06] border border-rose-500/20 rounded-lg">
                <p className="text-xs text-rose-400/80 font-mono">
                  Error: Agent allocation exceeds available slots.
                </p>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="w-full bg-theme-card border border-theme rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-theme bg-gradient-to-r from-zinc-900/50 via-transparent to-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-lg">
            <svg className="w-4 h-4 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-mono font-bold text-theme-main tracking-tight">
              $ yzpz --setup
            </h1>
            <p className="text-zinc-500 font-mono text-xs mt-0.5 tracking-wide">
              Guided setup wizard
            </p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="px-8 py-3 border-b border-theme">
        <div className="flex items-center">
          {STEPS.map((step, idx) => {
            const isActive = step.id === currentStep;
            const isComplete = isStepComplete(step.id);
            const isSkipped = isStepSkipped(step.id);

            return (
              <React.Fragment key={step.id}>
                {idx > 0 && (
                  <span className="text-zinc-700 mx-1.5 select-none">{'>'}</span>
                )}
                <button
                  onClick={() => goToStep(step.id)}
                  className={`flex items-center gap-1.5 px-1.5 py-1 rounded transition-colors duration-100 cursor-pointer ${
                    isActive
                      ? 'text-zinc-200'
                      : isComplete || isSkipped
                        ? 'text-zinc-500 hover:text-zinc-400'
                        : 'text-zinc-700 hover:text-zinc-500'
                  }`}
                >
                  <span className={`text-[10px] font-mono tracking-wide ${
                    isActive ? 'text-zinc-200' : ''
                  }`}>
                    {step.label.toLowerCase()}
                  </span>
                  {isComplete && !isActive && !isSkipped && (
                    <span className="text-emerald-600 text-[9px]">ok</span>
                  )}
                  {isSkipped && !isActive && (
                    <span className="text-zinc-600 text-[9px]">auto</span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-8 min-h-[340px] relative overflow-visible">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {renderStepContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Error Banner */}
      {createError && (
        <div className="mx-8 mb-4 flex items-center justify-between gap-4 px-4 py-3 bg-rose-500/[0.06] border border-rose-500/20 rounded-md">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-rose-500/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-xs font-mono text-rose-400/80">{createError}</span>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="px-8 py-5 border-t border-theme bg-zinc-900/30 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-zinc-600 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
          <span>{selectedLayout.sessions} slots configured</span>
          <span className="text-zinc-700 mx-1">|</span>
          <span>Step {stepIndex + 1}/{STEPS.length}</span>
        </div>
        <div className="flex items-center gap-3">
          {hasOpenWorkspaces && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2.5 rounded-lg font-mono text-xs uppercase tracking-[0.1em] transition-colors duration-150 bg-transparent text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
            >
              Cancel
            </button>
          )}
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={goPrev}
              className="px-6 py-2.5 rounded-lg font-mono text-xs uppercase tracking-[0.1em] transition-colors duration-150 bg-transparent text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
            >
              Back
            </button>
          )}
          {stepIndex < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canAdvance()}
              className={`px-8 py-2.5 rounded-lg font-mono text-xs uppercase tracking-[0.1em] transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                canAdvance()
                  ? 'bg-white text-zinc-900 hover:bg-zinc-200 hover:shadow-[0_0_20px_rgba(255,255,255,0.08)]'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed'
              }`}
            >
              Continue
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={onCreateWorkspace}
              disabled={!isValid || isLaunching}
              className={`px-8 py-2.5 rounded-lg font-mono text-xs uppercase tracking-[0.1em] transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                isValid && !isLaunching
                  ? 'bg-white text-zinc-900 hover:bg-zinc-200 hover:shadow-[0_0_20px_rgba(255,255,255,0.08)]'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed'
              }`}
            >
              {isLaunching ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Launching</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Execute
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
