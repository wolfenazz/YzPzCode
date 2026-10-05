import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { DropdownMenu } from 'radix-ui';
import { ArrowsClockwise, CaretDown, CaretRight, Check, CircleNotch, GearSix, Hammer, Play, Square, X } from '@phosphor-icons/react';
import { RunConfigEditor } from '../common/RunConfigEditor';
import { normalizeRunPath, useRunConfigStore } from '../../stores/runConfigStore';
import { detectRunTargets, invalidateProjectCache } from '../../utils/projectDetect';
import type { ApplicationRunConfig, ManagedTerminalCommandState, ProjectRunTarget } from '../../types';

interface QuickActionsProps {
  sessionId: string;
  workspaceId: string;
  cwd: string;
  managedState: ManagedTerminalCommandState | null;
  onStop: () => void;
}

const stopEvent = (event: { stopPropagation: () => void }): void => event.stopPropagation();

export function QuickActions({ sessionId, workspaceId, cwd, managedState, onStop }: QuickActionsProps): React.JSX.Element {
  const [detection, setDetection] = useState<{ cwd: string; targets: ProjectRunTarget[] } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const launchInFlight = useRef(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicationRunConfig | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef(0);
  const configs = useRunConfigStore((state) => state.configs);
  const selectedId = useRunConfigStore((state) => state.selectedByProject[normalizeRunPath(cwd)]);
  const selectTarget = useRunConfigStore((state) => state.selectTarget);
  const saveConfig = useRunConfigStore((state) => state.saveConfig);
  const commandActive = ['Starting', 'Running', 'Stopping'].includes(managedState?.status ?? '');
  const stopping = managedState?.status === 'Stopping';
  const managedBusy = commandActive || launching;

  useEffect(() => {
    const request = ++requestRef.current;
    setLoading(true);
    setError('');
    invalidateProjectCache(cwd);
    invalidateProjectCache(`${cwd}/app`);
    void detectRunTargets(cwd).then((targets) => {
      if (request === requestRef.current) setDetection({ cwd, targets });
    }).catch((reason: unknown) => {
      if (request === requestRef.current) { setDetection({ cwd, targets: [] }); setError(`Could not detect run targets: ${String(reason)}`); }
    }).finally(() => { if (request === requestRef.current) setLoading(false); });
    return () => { ++requestRef.current; };
  }, [cwd, refresh]);

  useEffect(() => { setOpen(false); setEditing(null); }, [cwd]);
  useEffect(() => { if (open) dialogRef.current?.showModal(); }, [open]);

  const savedTargets: ProjectRunTarget[] = configs.filter((config) => !config.projectPath || normalizeRunPath(config.projectPath) === normalizeRunPath(cwd)).map((config) => ({
    id: config.id, label: config.name, language: 'Saved', cwd: config.workingDirectory || cwd,
    command: config.command, buildCommand: config.buildCommand || null, unavailableReason: null,
  }));
  const targets = [...savedTargets, ...(detection?.cwd === cwd ? detection.targets : [])];
  const selected = targets.find((target) => target.id === selectedId) ?? targets.find((target) => target.command && !target.unavailableReason) ?? targets[0];
  const closeDialog = useCallback(() => { setOpen(false); setEditing(null); }, []);
  const openDialog = (): void => { setOpen(true); setRefresh((value) => value + 1); };
  const run = async (target: ProjectRunTarget, build = false): Promise<void> => {
    const command = build ? target.buildCommand : target.command;
    if (!command || managedBusy || launchInFlight.current) return;
    if (!build && target.unavailableReason) { setOpen(true); return; }
    launchInFlight.current = true;
    setLaunching(true);
    setError('');
    selectTarget(cwd, target.id);
    try {
      await invoke('run_managed_terminal_command', { request: { sessionId, workspaceId, cwd: target.cwd, command } });
      closeDialog();
    } catch (reason: unknown) {
      setError(`Application could not start: ${String(reason)}`);
      setOpen(true);
    } finally { launchInFlight.current = false; setLaunching(false); }
  };
  const newConfig = (): ApplicationRunConfig => ({ id: crypto.randomUUID(), name: selected?.label ?? '', projectPath: cwd, workingDirectory: selected?.cwd ?? cwd, command: selected?.command ?? '', buildCommand: selected?.buildCommand ?? '' });
  const canRun = !!selected?.command && !selected.unavailableReason;
  const finishedLabel = managedState && !commandActive
    ? managedState.status === 'Failed'
      ? 'Failed'
      : managedState.exitCode !== null ? `Exit ${managedState.exitCode}` : managedState.status
    : null;

  return (
    <div className="term-run-wrap" onPointerDown={stopEvent} onMouseDown={stopEvent} onClick={stopEvent}>
      {commandActive && managedState && (
        <span role="status" className="term-pill term-pill--ok" title={`${managedState.status}: ${managedState.command}`}>
          <span className="term-dot term-dot--live" aria-hidden="true" />
          <span className="term-pill__text">{managedState.command}</span>
        </span>
      )}
      {finishedLabel && managedState && (
        <span
          role="status"
          className={`term-pill ${managedState.status === 'Failed' || (managedState.exitCode ?? 0) !== 0 ? 'term-pill--danger' : ''}`}
          title={managedState.error ?? managedState.command}
        >
          {finishedLabel}
        </span>
      )}

      <div className={`term-run ${commandActive ? 'term-run--busy' : ''}`}>
        {commandActive ? (
          <button
            type="button"
            className="term-run__main"
            disabled={stopping}
            onClick={onStop}
            title={managedState?.command ? `Stop: ${managedState.command}` : 'Stop running command'}
            aria-label="Stop running command"
          >
            <Square size={9} weight="fill" aria-hidden="true" />
            <span>{stopping ? 'Stopping…' : 'Stop'}</span>
          </button>
        ) : (
          <button
            type="button"
            className="term-run__main"
            disabled={managedBusy || loading}
            title={selected ? `Run ${selected.label}: ${selected.command || 'Configure and build first'}` : 'Configure an application run'}
            onClick={() => { if (canRun && selected) void run(selected); else setOpen(true); }}
          >
            {launching || loading
              ? <CircleNotch size={10} weight="bold" className="term-spin" aria-hidden="true" />
              : <Play size={10} weight="fill" aria-hidden="true" />}
            <span>{launching ? 'Starting…' : loading ? 'Detecting…' : 'Run'}</span>
          </button>
        )}

        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="term-run__caret" title="Run options" aria-label="Run options">
              <CaretDown size={10} weight="bold" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="term-menu"
              align="end"
              sideOffset={6}
              collisionPadding={12}
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <DropdownMenu.Label className="term-menu__label">
                <span>Application run</span>
                {selected && <span className="term-menu__label-meta">{selected.label}</span>}
              </DropdownMenu.Label>

              {commandActive ? (
                <DropdownMenu.Item className="term-menu__item term-menu__item--danger" disabled={stopping} onSelect={onStop}>
                  <span className="term-menu__icon"><Square size={12} weight="fill" /></span>
                  <span className="term-menu__text">
                    <span>{stopping ? 'Stopping…' : 'Stop'}</span>
                    {managedState?.command && <span className="term-menu__desc term-menu__mono">{managedState.command}</span>}
                  </span>
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item
                  className="term-menu__item"
                  disabled={managedBusy || loading || !selected}
                  onSelect={() => { if (canRun && selected) void run(selected); else setOpen(true); }}
                >
                  <span className="term-menu__icon"><Play size={13} weight="fill" /></span>
                  <span className="term-menu__text">
                    <span>Run</span>
                    <span className="term-menu__desc term-menu__mono">{selected?.command || 'Not configured'}</span>
                  </span>
                </DropdownMenu.Item>
              )}

              {selected?.buildCommand && (
                <DropdownMenu.Item
                  className="term-menu__item"
                  disabled={managedBusy || loading}
                  onSelect={() => void run(selected, true)}
                >
                  <span className="term-menu__icon"><Hammer size={14} /></span>
                  <span className="term-menu__text">
                    <span>Build</span>
                    <span className="term-menu__desc term-menu__mono">{selected.buildCommand}</span>
                  </span>
                </DropdownMenu.Item>
              )}

              {targets.length > 1 && (
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="term-menu__item">
                    <span className="term-menu__icon"><Check size={13} /></span>
                    <span className="term-menu__text"><span>Run target</span></span>
                    <CaretRight size={11} className="term-menu__chevron" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent className="term-menu" sideOffset={6} collisionPadding={12}>
                      <DropdownMenu.RadioGroup value={selected?.id ?? ''} onValueChange={(id) => selectTarget(cwd, id)}>
                        {targets.map((target) => (
                          <DropdownMenu.RadioItem key={target.id} value={target.id} className="term-menu__item">
                            <span className="term-menu__icon">
                              <DropdownMenu.ItemIndicator><Check size={13} weight="bold" /></DropdownMenu.ItemIndicator>
                            </span>
                            <span className="term-menu__text">
                              <span>{target.label}</span>
                              <span className="term-menu__desc">{target.language}{target.unavailableReason ? ' · unavailable' : ''}</span>
                            </span>
                          </DropdownMenu.RadioItem>
                        ))}
                      </DropdownMenu.RadioGroup>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              )}

              <DropdownMenu.Separator className="term-menu__sep" />
              <DropdownMenu.Item className="term-menu__item" onSelect={openDialog}>
                <span className="term-menu__icon"><GearSix size={14} /></span>
                <span className="term-menu__text"><span>Configure run…</span></span>
              </DropdownMenu.Item>
              <DropdownMenu.Item className="term-menu__item" disabled={loading} onSelect={() => setRefresh((value) => value + 1)}>
                <span className="term-menu__icon"><ArrowsClockwise size={14} /></span>
                <span className="term-menu__text"><span>Refresh targets</span></span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {open && createPortal(
        <dialog ref={dialogRef} onCancel={closeDialog} onClose={closeDialog} aria-labelledby={`run-title-${sessionId}`} className="m-auto max-h-[85vh] w-[560px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-6 text-[var(--text-primary)] backdrop:bg-black/50">
          <div className="mb-4 flex items-center justify-between gap-3"><h2 id={`run-title-${sessionId}`} className="text-lg font-medium">Application run</h2><button type="button" onClick={closeDialog} aria-label="Close application run" className="app-icon-button"><X size={16} /></button></div>
          <p className="mb-4 break-all text-xs text-[var(--text-secondary)]">{cwd}</p>
          {error && <p role="alert" className="mb-4 text-sm text-rose-400">{error}</p>}
          {editing ? <RunConfigEditor key={editing.id} initial={editing} onCancel={() => setEditing(null)} onSave={(config) => { saveConfig(config); selectTarget(cwd, config.id); setEditing(null); }} /> : <>
            <label className="block text-sm">Run target
              <select value={selected?.id ?? ''} disabled={loading || !targets.length} onChange={(event) => selectTarget(cwd, event.target.value)} className="mt-2 w-full rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm">
                {!targets.length && <option value="">{loading ? 'Detecting applications…' : 'No application detected'}</option>}
                {targets.map((target) => <option key={target.id} value={target.id}>{target.language} · {target.label}</option>)}
              </select>
            </label>
            {selected && <div className="my-4 space-y-2 text-xs"><p className="break-all text-[var(--text-secondary)]">Working directory: {selected.cwd}</p><code className="block break-all rounded bg-[var(--bg-primary)] p-3">{selected.command || selected.buildCommand}</code>{selected.unavailableReason && <p className="leading-5 text-[var(--text-secondary)]">{selected.unavailableReason}</p>}</div>}
            {!loading && !targets.length && <p className="my-4 text-sm text-[var(--text-secondary)]">Add a custom command or create an application entry point in this directory, then refresh targets.</p>}
            {managedState && <p role="status" className="my-3 text-xs text-[var(--text-secondary)]">Last command: {managedState.status}{managedState.exitCode !== null ? ` · exit ${managedState.exitCode}` : ''}{managedState.error ? ` · ${managedState.error}` : ''}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" className="app-button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh targets</button>
              <button type="button" className="app-button" onClick={() => setEditing(newConfig())}>Customize / save</button>
              {selected?.buildCommand && <button type="button" className="app-button" disabled={managedBusy || loading} onClick={() => void run(selected, true)}>Build</button>}
              <button type="button" className="app-button bg-[var(--accent-light)] text-[var(--accent-text)] disabled:opacity-40" disabled={managedBusy || loading || !selected?.command || !!selected.unavailableReason} onClick={() => { if (selected) void run(selected); }}>Run application</button>
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">Output appears in this terminal. Use Stop or Ctrl+C to stop a run. Localhost links appear in the workspace browser controls. Manage saved commands in Settings → Application runs.</p>
          </>}
        </dialog>, document.body,
      )}
    </div>
  );
}
