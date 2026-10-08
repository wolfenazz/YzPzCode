import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, ArrowsClockwise, CheckCircle, CircleNotch, Stethoscope, Warning, Wrench, XCircle } from '@phosphor-icons/react';
import { useDeviceStore } from '../../../stores/deviceStore';
import type { SetupItem } from '../../../types';

const STEP_LABELS: Record<string, string> = {
  flutter: 'Flutter SDK',
  jdk: 'Java JDK',
  'cmdline-tools': 'Android command-line tools',
  'sdk-packages': 'Android SDK packages & licenses',
  avd: 'Virtual device',
  configure: 'Environment variables',
  acceleration: 'Hardware acceleration',
  doctor: 'flutter doctor',
  xcode: 'Xcode',
  'xcode-setup': 'Xcode license & components',
  'ios-runtime': 'iOS Simulator runtime',
  'ios-simulator': 'iOS simulator',
  homebrew: 'Homebrew',
  cocoapods: 'CocoaPods',
  idb: 'Simulator screen bridge (idb)',
};

const FIX_LABELS: Record<string, string> = {
  configure: 'Fix',
  acceleration: 'Enable',
  xcode: 'Get Xcode',
  'xcode-setup': 'Fix',
  'ios-simulator': 'Create',
};

const STATUS_ICON = {
  ok: <CheckCircle size={16} weight="fill" className="dv-ok" aria-label="Ready" />,
  warning: <Warning size={16} weight="fill" className="dv-warn" aria-label="Needs attention" />,
  missing: <XCircle size={16} weight="fill" className="dv-bad" aria-label="Missing" />,
} as const;

interface FlutterSetupViewProps {
  onClose?: () => void;
}

/** Checks the Flutter, Android and (on a Mac) iOS toolchain and installs what is missing. */
export function FlutterSetupView({ onClose }: FlutterSetupViewProps): React.JSX.Element {
  const report = useDeviceStore((state) => state.report);
  const reportLoading = useDeviceStore((state) => state.reportLoading);
  const steps = useDeviceStore((state) => state.setupSteps);
  const log = useDeviceStore((state) => state.setupLog);
  const running = useDeviceStore((state) => state.setupRunning);
  const error = useDeviceStore((state) => state.setupError);
  const checkSetup = useDeviceStore((state) => state.checkSetup);
  const runSetup = useDeviceStore((state) => state.runSetup);
  const cancelSetup = useDeviceStore((state) => state.cancelSetup);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!report && !reportLoading) void checkSetup(); }, [report, reportLoading, checkSetup]);
  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [log.length]);

  const needsWork = report?.items.some((item) => item.status !== 'ok' && item.fixStep) ?? false;
  const activeStep = Object.entries(steps).find(([, step]) => step.phase === 'running');
  const groups = useMemo(() => groupItems(report?.items ?? []), [report]);
  const mac = report?.iosReady !== null && report?.iosReady !== undefined;

  return (
    <div className="dv-setup">
      <div className="dv-setup__head">
        {onClose && (
          <button type="button" className="app-icon-button app-icon-button--compact" onClick={onClose} aria-label="Back to the device" title="Back">
            <ArrowLeft size={14} />
          </button>
        )}
        <div className="dv-setup__title">
          <strong>{mac ? 'Flutter, Android & iOS setup' : 'Flutter & Android setup'}</strong>
          <span>
            {report?.ready && (!mac || report.iosReady)
              ? `Everything needed to build and run on ${mac ? 'emulators and simulators' : 'the emulator'} is installed.`
              : mac
                ? 'Installs what is missing. Xcode steps ask for your password.'
                : 'Installs what is missing for this user. No administrator rights needed.'}
          </span>
        </div>
        <button type="button" className="app-icon-button app-icon-button--compact" onClick={() => void checkSetup()} disabled={reportLoading || running} title="Check again" aria-label="Check again">
          <ArrowsClockwise size={14} className={reportLoading ? 'dv-spin' : undefined} />
        </button>
      </div>

      <div className="dv-setup__actions">
        {running ? (
          <button type="button" className="dv-btn" onClick={() => void cancelSetup()}>Cancel</button>
        ) : (
          <button type="button" className="dv-btn dv-btn--primary" disabled={!report || !needsWork} onClick={() => void runSetup(['all'])}>
            <Wrench size={14} /> {needsWork ? 'Set up everything' : 'All set'}
          </button>
        )}
        <button type="button" className="dv-btn" disabled={running || !report?.flutterRoot} onClick={() => void runSetup(['doctor'])}>
          <Stethoscope size={14} /> Run flutter doctor
        </button>
      </div>

      {activeStep && (
        <div className="dv-setup__progress" role="status">
          <span className="dv-setup__progress-label">
            <CircleNotch size={13} className="dv-spin" /> {STEP_LABELS[activeStep[0]] ?? activeStep[0]}
            {activeStep[1].message ? <em>{activeStep[1].message}</em> : null}
          </span>
          {activeStep[1].percent !== null && (
            <span className="dv-bar"><span style={{ width: `${Math.min(100, activeStep[1].percent)}%` }} /></span>
          )}
        </div>
      )}
      {error && !running && <p className="dv-setup__error" role="alert">{error}</p>}

      <div className="dv-setup__list">
        {!report && <p className="dv-muted">{reportLoading ? 'Checking this computer…' : 'Not checked yet.'}</p>}
        {groups.map(([title, items]) => (
          <section key={title}>
            <h3>{title}</h3>
            <ul>
              {items.map((item) => {
                const step = item.fixStep ? steps[item.fixStep] : undefined;
                return (
                  <li key={item.id} className="dv-setup__item">
                    {step?.phase === 'running' ? <CircleNotch size={16} className="dv-spin" aria-label="Installing" /> : STATUS_ICON[item.status]}
                    <span className="dv-setup__item-text">
                      <span>{item.label}{item.version && <code>{item.version}</code>}</span>
                      {(item.detail || item.path) && <span className="dv-muted" title={item.path ?? undefined}>{item.detail ?? item.path}</span>}
                    </span>
                    {item.status !== 'ok' && item.fixStep && (
                      <button type="button" className="dv-btn dv-btn--small" disabled={running} onClick={() => void runSetup([item.fixStep!])}>
                        {FIX_LABELS[item.fixStep] ?? 'Install'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {log.length > 0 && (
        <div ref={logRef} className="dv-log dv-setup__log" aria-label="Setup output" role="log">
          {log.map((line) => <div key={line.id} className={`dv-log__line dv-log__line--${line.level}`}>{line.text}</div>)}
        </div>
      )}
    </div>
  );
}

const IOS_ITEMS = new Set(['xcode', 'xcode-license', 'ios-runtime', 'ios-simulator', 'cocoapods', 'idb', 'homebrew']);

function groupItems(items: SetupItem[]): Array<[string, SetupItem[]]> {
  const sdk = new Set(['cmdline-tools', 'platform-tools', 'emulator', 'platform', 'build-tools', 'system-image', 'licenses']);
  const groups: Array<[string, SetupItem[]]> = [
    ['Toolchain', items.filter((i) => i.id === 'flutter' || i.id === 'jdk')],
    ['Android SDK', items.filter((i) => sdk.has(i.id))],
    ['Emulator', items.filter((i) => i.id === 'avd' || i.id === 'acceleration')],
    ['System', items.filter((i) => i.id === 'configure')],
    ['iOS', items.filter((i) => IOS_ITEMS.has(i.id))],
  ];
  return groups.filter(([, list]) => list.length > 0);
}
