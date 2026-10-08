import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DropdownMenu } from 'radix-ui';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsClockwise,
  Camera,
  CaretDown,
  Check,
  Circle,
  DeviceMobile,
  DeviceMobileCamera,
  DotsThree,
  Lightning,
  Power,
  SpeakerHigh,
  SpeakerLow,
  Square,
  Trash,
  Triangle,
  Wrench,
  X,
} from '@phosphor-icons/react';
import { useAppStore } from '../../../stores/appStore';
import { DEFAULT_DEVICE_LAYOUT, DEVICE_DEFAULT_WIDTH, DEVICE_MIN_WIDTH, ensureDeviceListeners, useDeviceStore } from '../../../stores/deviceStore';
import type { AvdInfo, EmulatorInfo, WorkspaceConfig } from '../../../types';
import { EmulatorScreen } from './EmulatorScreen';
import { deviceCommand } from './deviceModel';
import { FlutterRunBar, FlutterMark } from './FlutterRunBar';
import { FlutterSetupView } from './FlutterSetupView';
import './DevicePanel.css';

/**
 * The device window (Android emulators, and iOS simulators on a Mac): slides
 * in from the right edge of every workspace view (terminal, extensions,
 * editor, browser). It pushes the view aside rather than floating over it,
 * because the browser and extension panes are native webviews drawn above
 * the page.
 */

const VIEW_MIN_WIDTH = 360;
const MAX_WIDTH = 960;
const SLIDE_MS = 300;
const SLIDE_EASE = [0.22, 1, 0.36, 1] as const;

const ACTIVE_PHASES = new Set(['Booting', 'Running', 'Stopping']);
/** Simulators booted or shut down outside the app show up within this time. */
const IOS_POLL_MS = 10_000;

interface DevicePanelProps {
  workspace: WorkspaceConfig;
  /** False while another app screen (settings, docs) covers the workspace. */
  visible: boolean;
}

export function DevicePanel({ workspace, visible }: DevicePanelProps): React.JSX.Element {
  const open = useDeviceStore((state) => (state.layoutByWorkspace[workspace.id] ?? DEFAULT_DEVICE_LAYOUT).open);
  const detectProjects = useDeviceStore((state) => state.detectProjects);

  useEffect(() => { ensureDeviceListeners(); }, []);
  // Detect Flutter projects up front so hot reload on save works even before
  // the panel is first opened.
  useEffect(() => { void detectProjects(workspace.id, workspace.path); }, [workspace.id, workspace.path, detectProjects]);

  return (
    <AnimatePresence initial={false}>
      {open && <DeviceFrame key={workspace.id} workspace={workspace} visible={visible} />}
    </AnimatePresence>
  );
}

function useMotionEnabled(): boolean {
  const animationsEnabled = useAppStore((state) => state.animationsEnabled);
  const reduceMotion = useReducedMotion();
  return animationsEnabled && !reduceMotion;
}

/** The emulator the panel shows: the chosen AVD's, else any active one. */
function pickEmulator(emulators: EmulatorInfo[], selectedAvd: string | null): EmulatorInfo | null {
  const forAvd = selectedAvd ? emulators.filter((e) => e.avdName === selectedAvd) : [];
  return (
    forAvd.find((e) => ACTIVE_PHASES.has(e.phase)) ??
    forAvd.find((e) => e.phase === 'Failed') ??
    (selectedAvd ? null : emulators.find((e) => ACTIVE_PHASES.has(e.phase)) ?? null)
  );
}

function DeviceFrame({ workspace, visible }: DevicePanelProps): React.JSX.Element {
  const motionOn = useMotionEnabled();
  const layout = useDeviceStore((state) => state.layoutByWorkspace[workspace.id]) ?? DEFAULT_DEVICE_LAYOUT;
  const avds = useDeviceStore((state) => state.avds);
  const emulators = useDeviceStore((state) => state.emulators);
  const selectedAvdPref = useDeviceStore((state) => state.selectedAvd);
  const report = useDeviceStore((state) => state.report);
  const showFrame = useDeviceStore((state) => state.showFrame);
  const showStats = useDeviceStore((state) => state.showStats);
  const iosAvailable = useDeviceStore((state) => state.iosAvailable);
  const store = useDeviceStore.getState;

  const asideRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragWidthRef = useRef<number | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; path?: string } | null>(null);
  const [sliding, setSliding] = useState(motionOn);

  useEffect(() => {
    const state = store();
    void state.refreshAvds();
    void state.refreshEmulators();
    void state.refreshIos();
    if (!state.report) void state.checkSetup();
    if (!state.flutterDevices.length) void state.refreshFlutterDevices();
  }, [store]);

  useEffect(() => {
    if (!iosAvailable || !visible) return;
    const timer = setInterval(() => void store().refreshIos(), IOS_POLL_MS);
    return () => clearInterval(timer);
  }, [iosAvailable, visible, store]);

  useEffect(() => {
    if (!sliding) return;
    const timer = setTimeout(() => setSliding(false), SLIDE_MS + 40);
    return () => clearTimeout(timer);
  }, [sliding]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.path ? 7000 : 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  useLayoutEffect(() => {
    const container = asideRef.current?.parentElement;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width); });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const selectedAvd = selectedAvdPref && avds.some((a) => a.name === selectedAvdPref)
    ? selectedAvdPref
    : emulators.find((e) => ACTIVE_PHASES.has(e.phase))?.avdName ?? avds[0]?.name ?? null;
  const emulator = pickEmulator(emulators, selectedAvd);
  const avd = avds.find((a) => a.name === selectedAvd) ?? null;
  const ios = avd?.platform === 'ios' || emulator?.platform === 'ios';
  const emulatorAvd = emulator ? avds.find((a) => a.name === emulator.avdName) ?? null : null;
  const running = emulator?.phase === 'Running';
  const activeEmulator = emulator && ACTIVE_PHASES.has(emulator.phase) ? emulator : null;

  // A newly booted emulator becomes a Flutter device; refresh the list.
  const runningSerials = emulators.filter((e) => e.phase === 'Running').map((e) => e.serial).join(',');
  useEffect(() => {
    if (!runningSerials) return;
    const timer = setTimeout(() => void store().refreshFlutterDevices(), 1500);
    return () => clearTimeout(timer);
  }, [runningSerials, store]);

  const maxWidth = Math.max(DEVICE_MIN_WIDTH, Math.min(MAX_WIDTH, (containerWidth ?? Infinity) - VIEW_MIN_WIDTH));
  const width = Math.min(maxWidth, Math.max(DEVICE_MIN_WIDTH, dragWidth ?? layout.width));

  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragWidthRef.current = width;
    setDragWidth(width);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const moveResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const right = asideRef.current?.getBoundingClientRect().right ?? window.innerWidth;
    const next = Math.min(maxWidth, Math.max(DEVICE_MIN_WIDTH, right - event.clientX));
    dragWidthRef.current = next;
    setDragWidth(next);
  };
  const endResize = (): void => {
    const finalWidth = dragWidthRef.current;
    if (finalWidth === null) return;
    dragWidthRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    store().setWidth(workspace.id, finalWidth);
    setDragWidth(null);
  };
  const keyResize = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 64 : 16;
    if (event.key === 'ArrowLeft') store().setWidth(workspace.id, Math.min(maxWidth, width + step));
    else if (event.key === 'ArrowRight') store().setWidth(workspace.id, Math.max(DEVICE_MIN_WIDTH, width - step));
    else if (event.key === 'Home') store().setWidth(workspace.id, DEVICE_DEFAULT_WIDTH);
    else return;
    event.preventDefault();
  };

  const act = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  }, []);

  const start = (options?: { coldBoot?: boolean; wipeData?: boolean }): void => {
    if (!selectedAvd) return;
    void act(() => store().startEmulator(selectedAvd, options));
  };
  const stop = (): void => { if (emulator) void act(() => store().stopEmulator(emulator.serial)); };
  const restartHere = (): void => {
    if (!emulator) return;
    void act(async () => {
      await store().stopEmulator(emulator.serial);
      setNotice({ text: 'Shutting down the external emulator. Press Start once it is gone.' });
    });
  };
  const screenshot = (): void => {
    if (!emulator) return;
    void act(async () => {
      const path = await invoke<string>(deviceCommand(emulator.platform, 'screenshot'), { serial: emulator.serial });
      setNotice({ text: 'Screenshot saved', path });
    });
  };

  const resizing = dragWidth !== null;
  const slide = motionOn ? { duration: SLIDE_MS / 1000, ease: SLIDE_EASE } : { duration: 0 };
  // The Android SDK only gates Android devices; a Mac may have just Xcode.
  const sdkMissing = !ios && report !== null && !report.items.some((i) => i.id === 'emulator' && i.status === 'ok');
  const needsSetup = report !== null && (sdkMissing || avds.length === 0);
  const streamActive = visible && !sliding && !setupOpen;

  return (
    <motion.aside
      ref={asideRef}
      className={`dv${resizing ? ' dv--resizing' : ''}`}
      initial={{ width: 0 }}
      animate={{ width }}
      exit={{ width: 0 }}
      transition={resizing ? { duration: 0 } : slide}
      aria-label="Device"
    >
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize device panel"
        aria-valuenow={Math.round(width)}
        aria-valuemin={DEVICE_MIN_WIDTH}
        aria-valuemax={Math.round(maxWidth)}
        className="dv__resizer"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onLostPointerCapture={endResize}
        onDoubleClick={() => store().setWidth(workspace.id, DEVICE_DEFAULT_WIDTH)}
        onKeyDown={keyResize}
      />
      <motion.div
        className="dv__frame"
        style={{ width }}
        initial={motionOn ? { x: 40, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        exit={motionOn ? { x: 40, opacity: 0 } : { opacity: 0 }}
        transition={slide}
      >
        <header className="dv__bar">
          <DevicePicker avds={avds} emulators={emulators} selected={selectedAvd} onSelect={(name) => { store().selectAvd(name); setSetupOpen(false); }} />
          <span className="dv__spacer" />
          {emulator && ACTIVE_PHASES.has(emulator.phase) ? (
            <button type="button" className="app-icon-button app-icon-button--compact dv__power is-on" disabled={busy || emulator.phase === 'Stopping'} onClick={stop} title={`Shut down the ${kind(emulator.platform)}`} aria-label={`Shut down the ${kind(emulator.platform)}`}>
              <Power size={15} weight="bold" />
            </button>
          ) : (
            <button type="button" className="app-icon-button app-icon-button--compact dv__power" disabled={busy || !selectedAvd || sdkMissing} onClick={() => start()} title={selectedAvd ? `Start ${avd?.displayName ?? selectedAvd}` : 'No virtual device'} aria-label={`Start the ${kind(avd?.platform)}`}>
              <Power size={15} weight="bold" />
            </button>
          )}
          <MoreMenu
            ios={ios}
            canStart={!!selectedAvd && !activeEmulator && !sdkMissing}
            running={running}
            showFrame={showFrame}
            showStats={showStats}
            onToggleStats={() => store().setShowStats(!showStats)}
            onColdBoot={() => start({ coldBoot: true })}
            onWipe={() => { if (window.confirm(`Erase all data on ${avd?.displayName ?? selectedAvd}? Installed apps and settings are removed.`)) start({ wipeData: true }); }}
            onScreenshot={screenshot}
            onToggleFrame={() => store().setShowFrame(!showFrame)}
            onRefresh={() => { void store().refreshAvds(); void store().refreshEmulators(); void store().refreshIos(); void store().refreshFlutterDevices(); }}
            onSetup={() => setSetupOpen(true)}
          />
          <button type="button" className="app-icon-button app-icon-button--compact" onClick={() => store().setOpen(workspace.id, false)} title="Hide device (Ctrl+Alt+M)" aria-label="Hide device panel">
            <X size={14} />
          </button>
        </header>

        <div className="dv__body">
          {setupOpen ? (
            <FlutterSetupView onClose={() => setSetupOpen(false)} />
          ) : emulator && ACTIVE_PHASES.has(emulator.phase) && emulator.embeddable ? (
            <div className="dv__device">
              <EmulatorScreen emulator={emulator} iosFrame={emulatorAvd?.frame ?? null} active={streamActive} showFrame={showFrame} showStats={showStats} onNotice={(text) => setNotice({ text })} />
              <DeviceControls emulator={emulator} disabled={!running} onScreenshot={screenshot} />
            </div>
          ) : emulator && ACTIVE_PHASES.has(emulator.phase) && emulator.platform === 'ios' ? (
            <EmptyState
              icon={<DeviceMobileCamera size={30} />}
              title={`${emulator.displayName} is running`}
              text="Showing a simulator here needs idb_companion, the bridge to its screen and touch input. Install it from setup (Homebrew)."
              action={<button type="button" className="dv-btn dv-btn--primary" onClick={() => setSetupOpen(true)}><Wrench size={14} /> Open setup</button>}
            />
          ) : emulator && ACTIVE_PHASES.has(emulator.phase) ? (
            <EmptyState
              icon={<DeviceMobileCamera size={30} />}
              title={`${emulator.displayName} is running outside YzPzCode`}
              text={emulator.error ?? 'Its screen cannot be embedded. Restart it here to show it in this panel.'}
              action={<button type="button" className="dv-btn" disabled={busy} onClick={restartHere}>Shut it down</button>}
            />
          ) : needsSetup ? (
            <EmptyState
              icon={<FlutterMark size={30} />}
              title={sdkMissing ? (iosAvailable ? 'Set up Flutter' : 'Set up Flutter & Android') : 'Create a virtual device'}
              text={sdkMissing
                ? 'Install Flutter, a JDK, the Android SDK and an emulator in one step. Everything goes in your user folder.'
                : iosAvailable
                  ? 'There is no Android virtual device or iOS simulator yet.'
                  : 'The Android SDK is installed but there is no virtual device yet.'}
              action={<button type="button" className="dv-btn dv-btn--primary" onClick={() => setSetupOpen(true)}><Wrench size={14} /> Open setup</button>}
            />
          ) : (
            <EmptyState
              icon={<DeviceMobile size={30} />}
              title={avd ? avd.displayName : 'No virtual device'}
              text={emulator?.phase === 'Failed'
                ? emulator.error ?? 'The emulator stopped unexpectedly.'
                : avd ? describeAvd(avd) : 'Checking for virtual devices…'}
              tone={emulator?.phase === 'Failed' ? 'error' : undefined}
              action={avd && (
                <button type="button" className="dv-btn dv-btn--primary" disabled={busy || sdkMissing} onClick={() => start()}>
                  <Power size={14} weight="bold" /> {emulator?.phase === 'Failed' ? 'Try again' : `Start ${kind(avd.platform)}`}
                </button>
              )}
            />
          )}
          {notice && (
            <div className="dv-toast" role="status">
              <span>{notice.text}</span>
              {notice.path && (
                <button type="button" className="dv-btn dv-btn--small" onClick={() => void invoke('reveal_in_file_manager', { path: notice.path })}>Show</button>
              )}
            </div>
          )}
        </div>

        {!setupOpen && <FlutterRunBar workspace={workspace} />}
      </motion.div>
    </motion.aside>
  );
}

const kind = (platform: string | undefined): string => (platform === 'ios' ? 'simulator' : 'emulator');

function describeAvd(avd: AvdInfo): string {
  if (avd.platform === 'ios') {
    const parts = [avd.variant, avd.device !== avd.displayName ? avd.device : null, avd.width && avd.height ? `${avd.width}×${avd.height}` : null].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'iOS simulator';
  }
  const parts = [
    avd.apiLevel ? `Android API ${avd.apiLevel}` : null,
    avd.variant,
    avd.width && avd.height ? `${avd.width}×${avd.height}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Ready to start';
}

function EmptyState({ icon, title, text, action, tone }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode; tone?: 'error' }): React.JSX.Element {
  return (
    <div className="dv-empty">
      <div className="dv-empty__icon">{icon}</div>
      <strong>{title}</strong>
      <p className={tone === 'error' ? 'dv-empty__error' : undefined}>{text}</p>
      {action}
    </div>
  );
}

const phaseLabel = (emulator: EmulatorInfo | undefined): string | null => {
  if (!emulator) return null;
  if (emulator.phase === 'Running') return emulator.owned ? 'Running' : 'Running (external)';
  if (emulator.phase === 'Booting') return 'Booting…';
  if (emulator.phase === 'Stopping') return 'Stopping…';
  return null;
};

function DevicePicker({ avds, emulators, selected, onSelect }: {
  avds: AvdInfo[];
  emulators: EmulatorInfo[];
  selected: string | null;
  onSelect: (name: string) => void;
}): React.JSX.Element {
  const byAvd = useMemo(() => {
    const map = new Map<string, EmulatorInfo>();
    for (const e of emulators) if (ACTIVE_PHASES.has(e.phase)) map.set(e.avdName, e);
    return map;
  }, [emulators]);
  const current = avds.find((a) => a.name === selected);
  const currentEmulator = selected ? byAvd.get(selected) : undefined;
  const status = phaseLabel(currentEmulator);
  const android = avds.filter((a) => a.platform !== 'ios');
  const ios = avds.filter((a) => a.platform === 'ios');
  const item = (a: AvdInfo): React.JSX.Element => {
    const e = byAvd.get(a.name);
    const detail = a.platform === 'ios'
      ? [a.variant, phaseLabel(e)]
      : [a.apiLevel ? `API ${a.apiLevel}` : null, a.variant, phaseLabel(e)];
    return (
      <DropdownMenu.RadioItem key={a.name} value={a.name} className="term-menu__item">
        <span className="term-menu__icon"><DropdownMenu.ItemIndicator><Check size={13} weight="bold" /></DropdownMenu.ItemIndicator></span>
        <span className="term-menu__text">
          <span>{a.displayName}</span>
          <span className="term-menu__desc">{detail.filter(Boolean).join(' · ')}</span>
        </span>
        {e && <span className={`dv-dot dv-dot--${e.phase.toLowerCase()}`} aria-hidden="true" />}
      </DropdownMenu.RadioItem>
    );
  };
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="dv-picker" title="Choose a virtual device">
          <DeviceMobile size={15} className="dv-picker__icon" />
          <span className="dv-picker__text">
            <span className="dv-picker__name">{current?.displayName ?? (avds.length ? 'Choose a device' : 'Device')}</span>
            {status && <span className={`dv-picker__status dv-picker__status--${currentEmulator?.phase.toLowerCase()}`}>{status}</span>}
          </span>
          <CaretDown size={11} weight="bold" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="term-menu dv-menu" align="start" sideOffset={6} collisionPadding={12} onCloseAutoFocus={(e) => e.preventDefault()}>
          {avds.length === 0 && (
            <>
              <DropdownMenu.Label className="term-menu__label"><span>Virtual devices</span></DropdownMenu.Label>
              <div className="term-menu__item" data-disabled=""><span className="term-menu__text"><span>None yet. Open setup to create one.</span></span></div>
            </>
          )}
          <DropdownMenu.RadioGroup value={selected ?? ''} onValueChange={onSelect}>
            {android.length > 0 && <DropdownMenu.Label className="term-menu__label"><span>{ios.length ? 'Android emulators' : 'Virtual devices'}</span></DropdownMenu.Label>}
            {android.map(item)}
            {ios.length > 0 && <DropdownMenu.Label className="term-menu__label"><span>iOS simulators</span></DropdownMenu.Label>}
            {ios.map(item)}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MoreMenu(props: {
  ios: boolean;
  canStart: boolean;
  running: boolean;
  showFrame: boolean;
  showStats: boolean;
  onToggleStats: () => void;
  onColdBoot: () => void;
  onWipe: () => void;
  onScreenshot: () => void;
  onToggleFrame: () => void;
  onRefresh: () => void;
  onSetup: () => void;
}): React.JSX.Element {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="app-icon-button app-icon-button--compact" title="More device actions" aria-label="More device actions">
          <DotsThree size={16} weight="bold" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="term-menu dv-menu" align="end" sideOffset={6} collisionPadding={12} onCloseAutoFocus={(e) => e.preventDefault()}>
          {!props.ios && (
            <DropdownMenu.Item className="term-menu__item" disabled={!props.canStart} onSelect={props.onColdBoot}>
              <span className="term-menu__icon"><Lightning size={14} /></span>
              <span className="term-menu__text"><span>Cold boot</span><span className="term-menu__desc">Start without the saved snapshot</span></span>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className="term-menu__item term-menu__item--danger" disabled={!props.canStart} onSelect={props.onWipe}>
            <span className="term-menu__icon"><Trash size={14} /></span>
            <span className="term-menu__text"><span>{props.ios ? 'Erase content and start' : 'Wipe data and start'}</span></span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className="term-menu__item" disabled={!props.running} onSelect={props.onScreenshot}>
            <span className="term-menu__icon"><Camera size={14} /></span>
            <span className="term-menu__text"><span>Save screenshot</span></span>
          </DropdownMenu.Item>
          <DropdownMenu.CheckboxItem className="term-menu__item" checked={props.showFrame} onCheckedChange={props.onToggleFrame}>
            <span className="term-menu__icon"><DropdownMenu.ItemIndicator><Check size={13} weight="bold" /></DropdownMenu.ItemIndicator></span>
            <span className="term-menu__text"><span>Show device frame</span></span>
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.CheckboxItem className="term-menu__item" checked={props.showStats} onCheckedChange={props.onToggleStats}>
            <span className="term-menu__icon"><DropdownMenu.ItemIndicator><Check size={13} weight="bold" /></DropdownMenu.ItemIndicator></span>
            <span className="term-menu__text"><span>Show frame rate</span></span>
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator className="term-menu__sep" />
          <DropdownMenu.Item className="term-menu__item" onSelect={props.onRefresh}>
            <span className="term-menu__icon"><ArrowsClockwise size={14} /></span>
            <span className="term-menu__text"><span>Refresh devices</span></span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className="term-menu__item" onSelect={props.onSetup}>
            <span className="term-menu__icon"><Wrench size={14} /></span>
            <span className="term-menu__text"><span>Flutter setup…</span></span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function DeviceControls({ emulator, disabled, onScreenshot }: { emulator: EmulatorInfo; disabled: boolean; onScreenshot: () => void }): React.JSX.Element {
  const ios = emulator.platform === 'ios';
  const key = (name: string) => () => void invoke(deviceCommand(emulator.platform, 'key'), { serial: emulator.serial, key: name, eventType: 'press' }).catch(() => undefined);
  const rotate = (clockwise: boolean) => () => void invoke(deviceCommand(emulator.platform, 'rotate'), { serial: emulator.serial, clockwise }).catch(() => undefined);
  const button = (label: string, onClick: () => void, icon: React.ReactNode) => (
    <button type="button" className="dv-ctrl" disabled={disabled} onClick={onClick} title={label} aria-label={label}>{icon}</button>
  );
  return (
    <div className="dv-controls" role="toolbar" aria-label="Device controls" aria-orientation="vertical">
      {button(ios ? 'Lock' : 'Power', key('Power'), <Power size={15} weight="bold" />)}
      {button('Volume up', key('AudioVolumeUp'), <SpeakerHigh size={15} />)}
      {button('Volume down', key('AudioVolumeDown'), <SpeakerLow size={15} />)}
      <span className="dv-controls__sep" />
      {button('Rotate left', rotate(false), <ArrowCounterClockwise size={15} />)}
      {button('Rotate right', rotate(true), <ArrowClockwise size={15} />)}
      <span className="dv-controls__sep" />
      {!ios && button('Back', key('GoBack'), <Triangle size={13} weight="bold" style={{ transform: 'rotate(-90deg)' }} />)}
      {button('Home', key('GoHome'), <Circle size={14} weight="bold" />)}
      {button(ios ? 'App switcher' : 'Overview', key('AppSwitch'), <Square size={13} weight="bold" />)}
      <span className="dv-controls__sep" />
      {button('Save screenshot', onScreenshot, <Camera size={15} />)}
    </div>
  );
}

/** Header button that opens and closes the device window from any view. */
export function DevicePanelToggle({ workspaceId }: { workspaceId: string | null }): React.JSX.Element | null {
  const open = useDeviceStore((state) => (workspaceId ? state.layoutByWorkspace[workspaceId]?.open ?? false : false));
  const live = useDeviceStore((state) => state.emulators.some((e) => e.phase === 'Running' || e.phase === 'Booting'));
  const runLive = useDeviceStore((state) => (workspaceId ? ['Running', 'Reloading', 'Restarting', 'Starting'].includes(state.runs[workspaceId]?.phase ?? '') : false));
  if (!workspaceId) return null;
  return (
    <button
      type="button"
      className="chrome-btn dv-toggle"
      aria-pressed={open}
      aria-label="Device"
      title={open ? 'Hide device (Ctrl+Alt+M)' : 'Show device (Ctrl+Alt+M)'}
      onClick={() => useDeviceStore.getState().toggle(workspaceId)}
    >
      <DeviceMobile size={16} aria-hidden="true" />
      {!open && (live || runLive) && <span className={`dv-toggle__dot${runLive ? ' is-run' : ''}`} aria-hidden="true" />}
    </button>
  );
}
