import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowsClockwise, Broom, CaretDown, CaretUp, CircleNotch, Globe, Lightning, Play, Square } from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import { DEFAULT_DEVICE_LAYOUT, isFlutterRunActive, useDeviceStore } from '../../../stores/deviceStore';
import type { FlutterRunMode, WorkspaceConfig } from '../../../types';
import { defaultRunTarget, runTargetOptions } from './deviceModel';
import type { RunTargetOption } from './deviceModel';

const CONSOLE_MIN = 90;
const CONSOLE_MAX = 640;

export function FlutterMark({ size = 14 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="dv-flutter-mark">
      <path d="M14.3 2 4 12.3l3.2 3.2L20.7 2h-6.4Z" fill="#54C5F8" />
      <path d="m14.3 11.2-5.6 5.6 3.2 3.2 3.2 3.2h6.4l-5.6-5.6 5.6-6.4h-7.2Z" fill="#29B6F6" />
      <path d="m11.9 20 3.2-3.2 2.4 2.4L14.3 22.4 11.9 20Z" fill="#01579B" />
    </svg>
  );
}

const baseName = (path: string): string => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path;

interface FlutterRunBarProps {
  workspace: WorkspaceConfig;
}

/** Runs the workspace's Flutter app on a device, with hot reload and a log. */
export function FlutterRunBar({ workspace }: FlutterRunBarProps): React.JSX.Element | null {
  const projects = useDeviceStore((state) => state.flutterProjects[workspace.id]);
  const chosenProject = useDeviceStore((state) => state.projectByWorkspace[workspace.id]);
  const run = useDeviceStore((state) => state.runs[workspace.id]);
  const devices = useDeviceStore((state) => state.flutterDevices);
  const devicesLoading = useDeviceStore((state) => state.devicesLoading);
  const emulators = useDeviceStore((state) => state.emulators);
  const avds = useDeviceStore((state) => state.avds);
  const selectedAvd = useDeviceStore((state) => state.selectedAvd);
  const chosenTarget = useDeviceStore((state) => state.runTargetByWorkspace[workspace.id]);
  const runMode = useDeviceStore((state) => state.runMode);
  const layout = useDeviceStore((state) => state.layoutByWorkspace[workspace.id]) ?? DEFAULT_DEVICE_LAYOUT;
  const store = useDeviceStore.getState;
  const [starting, setStarting] = useState(false);

  const options = useMemo(() => runTargetOptions(devices, emulators, avds), [devices, emulators, avds]);
  const target = options.some((o) => o.id === chosenTarget) ? chosenTarget : defaultRunTarget(options, selectedAvd);
  const project = projects?.includes(chosenProject ?? '') ? chosenProject! : projects?.[0];
  const active = isFlutterRunActive(run);
  const busy = run?.phase === 'Reloading' || run?.phase === 'Restarting';

  if (!project && !active) return null;

  const start = async (): Promise<void> => {
    if (!project || !target || starting) return;
    setStarting(true);
    store().setConsoleOpen(workspace.id, true);
    try { await store().startRun(workspace.id, project, target); }
    catch (error) { store().appendLog(workspace.id, error instanceof Error ? error.message : String(error), 'error'); }
    finally { setStarting(false); }
  };

  const openWeb = (): void => {
    if (!run?.webUrl) return;
    useAppStore.getState().openBrowserTab(workspace.id, run.webUrl, 'Flutter web');
    useAppStore.getState().setActiveView('browser');
  };

  const status = starting && !active
    ? 'Preparing…'
    : run?.error && !busy ? run.error : run?.message ?? (active ? '' : 'Ready to run');
  const statusTone = run?.error && !busy ? 'error' : active ? 'live' : 'idle';

  return (
    <div className="dv-run">
      <div className="dv-run__row">
        <FlutterMark />
        {projects && projects.length > 1 ? (
          <select className="dv-select dv-select--project" value={project} disabled={active} onChange={(e) => store().selectProject(workspace.id, e.target.value)} aria-label="Flutter project" title={project}>
            {projects.map((dir) => <option key={dir} value={dir}>{baseName(dir)}</option>)}
          </select>
        ) : (
          <span className="dv-run__project" title={project ?? run?.cwd}>{baseName(project ?? run?.cwd ?? '')}</span>
        )}
        <TargetSelect options={options} value={active ? run!.deviceId : target} disabled={active} onChange={(id) => store().selectRunTarget(workspace.id, id)} fallbackLabel={run?.deviceName} />
        <select className="dv-select dv-select--mode" value={active ? run!.mode : runMode} disabled={active} onChange={(e) => store().setRunMode(e.target.value as FlutterRunMode)} aria-label="Build mode">
          <option value="debug">Debug</option>
          <option value="profile">Profile</option>
          <option value="release">Release</option>
        </select>
        <button type="button" className="app-icon-button app-icon-button--compact" disabled={devicesLoading} onClick={() => void store().refreshFlutterDevices()} title="Refresh devices" aria-label="Refresh devices">
          <ArrowsClockwise size={13} className={devicesLoading ? 'dv-spin' : undefined} />
        </button>
      </div>
      <div className="dv-run__row">
        {active ? (
          <>
            <button type="button" className="dv-btn dv-btn--accent" disabled={run!.phase !== 'Running' || !run!.supportsRestart} onClick={() => void store().reload(workspace.id, false)} title="Hot reload (also runs on save)">
              {run!.phase === 'Reloading' ? <CircleNotch size={13} className="dv-spin" /> : <Lightning size={13} weight="fill" />} Reload
            </button>
            <button type="button" className="dv-btn" disabled={run!.phase !== 'Running' || !run!.supportsRestart} onClick={() => void store().reload(workspace.id, true)} title="Hot restart: rebuild state from main()">
              {run!.phase === 'Restarting' ? <CircleNotch size={13} className="dv-spin" /> : <ArrowsClockwise size={13} />} Restart
            </button>
            <button type="button" className="dv-btn dv-btn--danger" disabled={run!.phase === 'Stopping'} onClick={() => void store().stopRun(workspace.id)} title="Stop the app">
              <Square size={11} weight="fill" /> Stop
            </button>
            {run!.webUrl && (
              <button type="button" className="app-icon-button app-icon-button--compact" onClick={openWeb} title={`Open ${run!.webUrl} in the browser view`} aria-label="Open in the browser view">
                <Globe size={14} />
              </button>
            )}
          </>
        ) : (
          <button type="button" className="dv-btn dv-btn--primary" disabled={!target || starting || !project} onClick={() => void start()} title={target ? `flutter run -d ${target.replace(/^(avd|ios):/, '')}` : 'Choose a device'}>
            {starting ? <CircleNotch size={13} className="dv-spin" /> : <Play size={12} weight="fill" />} Run
          </button>
        )}
        <span className={`dv-run__status dv-run__status--${statusTone}`} title={status}>
          {(run?.phase === 'Starting' || starting) && <CircleNotch size={12} className="dv-spin" />}
          {status}
        </span>
        <button
          type="button"
          className="app-icon-button app-icon-button--compact"
          onClick={() => store().setConsoleOpen(workspace.id, !layout.consoleOpen)}
          title={layout.consoleOpen ? 'Hide log' : 'Show log'}
          aria-label={layout.consoleOpen ? 'Hide Flutter log' : 'Show Flutter log'}
          aria-expanded={layout.consoleOpen}
        >
          {layout.consoleOpen ? <CaretDown size={13} /> : <CaretUp size={13} />}
        </button>
      </div>
      {layout.consoleOpen && <FlutterConsole workspaceId={workspace.id} height={layout.consoleHeight} />}
    </div>
  );
}

function TargetSelect({ options, value, disabled, onChange, fallbackLabel }: {
  options: RunTargetOption[];
  value: string | null | undefined;
  disabled: boolean;
  onChange: (id: string) => void;
  fallbackLabel?: string;
}): React.JSX.Element {
  const groups = ['Running emulators', 'Virtual devices', 'Devices', 'Desktop & web'] as const;
  const known = options.some((o) => o.id === value);
  return (
    <select className="dv-select dv-select--target" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label="Run on device">
      {!value && <option value="">No devices</option>}
      {value && !known && <option value={value}>{fallbackLabel ?? value}</option>}
      {groups.map((group) => {
        const items = options.filter((o) => o.group === group);
        if (!items.length) return null;
        return (
          <optgroup key={group} label={group}>
            {items.map((o) => <option key={o.id} value={o.id}>{o.label} — {o.detail}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

function FlutterConsole({ workspaceId, height }: { workspaceId: string; height: number }): React.JSX.Element {
  const lines = useDeviceStore((state) => state.logs[workspaceId]);
  const reloadOnSave = useDeviceStore((state) => state.reloadOnSave);
  const pubGetOnSave = useDeviceStore((state) => state.pubGetOnSave);
  const store = useDeviceStore.getState;
  const bodyRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body && stick.current) body.scrollTop = body.scrollHeight;
  }, [lines?.length]);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startHeight: height };
    setDragHeight(height);
  };
  const moveResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    setDragHeight(Math.min(CONSOLE_MAX, Math.max(CONSOLE_MIN, drag.current.startHeight + drag.current.startY - event.clientY)));
  };
  const endResize = (): void => {
    if (drag.current && dragHeight !== null) store().setConsoleHeight(workspaceId, dragHeight);
    drag.current = null;
    setDragHeight(null);
  };

  return (
    <div className="dv-console" style={{ height: dragHeight ?? height }}>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize Flutter log"
        className="dv-console__resizer"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onLostPointerCapture={endResize}
      />
      <div className="dv-console__bar">
        <label className="dv-check" title="Hot reload whenever a .dart file in the project is saved">
          <input type="checkbox" checked={reloadOnSave} onChange={(e) => store().setReloadOnSave(e.target.checked)} /> Reload on save
        </label>
        <label className="dv-check" title="Run flutter pub get when pubspec.yaml is saved">
          <input type="checkbox" checked={pubGetOnSave} onChange={(e) => store().setPubGetOnSave(e.target.checked)} /> pub get on save
        </label>
        <button type="button" className="app-icon-button app-icon-button--compact" onClick={() => store().clearLog(workspaceId)} title="Clear log" aria-label="Clear Flutter log">
          <Broom size={13} />
        </button>
      </div>
      <div
        ref={bodyRef}
        className="dv-log"
        role="log"
        aria-label="Flutter output"
        onScroll={(event) => {
          const el = event.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {!lines?.length && <div className="dv-muted dv-log__empty">Output from flutter run appears here.</div>}
        {lines?.map((line) => <div key={line.id} className={`dv-log__line dv-log__line--${line.level}`}>{line.text}</div>)}
      </div>
    </div>
  );
}
