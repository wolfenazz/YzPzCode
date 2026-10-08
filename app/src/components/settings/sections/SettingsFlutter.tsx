import { useEffect, useRef } from 'react';
import { ArrowsClockwise, CheckCircle, Stethoscope, Warning, Wrench, XCircle } from '@phosphor-icons/react';
import { ensureDeviceListeners, useDeviceStore } from '../../../stores/deviceStore';
import { Badge, Button, Notice, SettingsBlock, SettingsGroup, SettingsRow } from '../SettingsKit';

const STATUS_ICON = {
  ok: <CheckCircle size={18} weight="fill" color="var(--st-success)" aria-hidden="true" />,
  warning: <Warning size={18} weight="fill" color="var(--st-warning)" aria-hidden="true" />,
  missing: <XCircle size={18} weight="fill" color="var(--st-danger)" aria-hidden="true" />,
} as const;

const FIX_LABEL: Record<string, string> = { configure: 'Fix', acceleration: 'Enable', xcode: 'Get Xcode', 'xcode-setup': 'Fix', 'ios-simulator': 'Create' };

/** Settings → Environment: the Flutter toolchain for Android, and for iOS on a Mac. */
export function SettingsFlutter(): React.JSX.Element {
  const report = useDeviceStore((state) => state.report);
  const loading = useDeviceStore((state) => state.reportLoading);
  const running = useDeviceStore((state) => state.setupRunning);
  const steps = useDeviceStore((state) => state.setupSteps);
  const log = useDeviceStore((state) => state.setupLog);
  const error = useDeviceStore((state) => state.setupError);
  const { checkSetup, runSetup, cancelSetup } = useDeviceStore.getState();
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    ensureDeviceListeners();
    void useDeviceStore.getState().checkSetup();
  }, []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log.length]);

  const needsWork = report?.items.some((item) => item.status !== 'ok' && item.fixStep) ?? false;
  const active = Object.entries(steps).find(([, step]) => step.phase === 'running');
  const mac = report?.iosReady !== null && report?.iosReady !== undefined;

  return (
    <SettingsGroup
      title={mac ? 'Flutter, Android & iOS' : 'Flutter & Android'}
      description={mac
        ? 'The toolchain for Flutter apps, the built-in Android emulator and iOS Simulator (Ctrl+Alt+M).'
        : 'The toolchain for Flutter apps and the built-in Android emulator (Ctrl+Alt+M). Installs go to your user folder.'}
      action={
        <Button icon={ArrowsClockwise} loading={loading} disabled={running} onClick={() => void checkSetup()} size="sm">
          Check again
        </Button>
      }
      footer={report ? `Android SDK: ${report.androidSdk}` : undefined}
    >
      {report?.ready && !needsWork && <SettingsBlock><Notice tone="success">{mac && report.iosReady ? 'Ready for Flutter Android and iOS development.' : 'Ready for Flutter Android development.'}</Notice></SettingsBlock>}
      {error && !running && <SettingsBlock><Notice tone="danger">{error}</Notice></SettingsBlock>}
      {active && (
        <SettingsBlock>
          <Notice tone="info">{active[1].message ?? `Running ${active[0]}…`}{active[1].percent !== null ? ` (${Math.round(active[1].percent)}%)` : ''}</Notice>
        </SettingsBlock>
      )}
      <SettingsRow label="Set up everything" description="Installs whatever is missing below, in order, then configures PATH and ANDROID_HOME.">
        {running ? (
          <Button onClick={() => void cancelSetup()}>Cancel</Button>
        ) : (
          <Button icon={Wrench} variant="primary" disabled={!needsWork} onClick={() => void runSetup(['all'])}>
            {needsWork ? 'Set up' : 'All set'}
          </Button>
        )}
        <Button icon={Stethoscope} disabled={running || !report?.flutterRoot} onClick={() => void runSetup(['doctor'])}>
          flutter doctor
        </Button>
      </SettingsRow>
      {report?.items.map((item) => (
        <SettingsRow
          key={item.id}
          icon={STATUS_ICON[item.status]}
          iconBare
          label={item.label}
          description={item.detail ?? item.path ?? undefined}
        >
          {item.version && <Badge>{item.version}</Badge>}
          {item.status !== 'ok' && item.fixStep && (
            <Button size="sm" loading={steps[item.fixStep]?.phase === 'running'} disabled={running} onClick={() => void runSetup([item.fixStep!])}>
              {FIX_LABEL[item.fixStep] ?? 'Install'}
            </Button>
          )}
        </SettingsRow>
      ))}
      {log.length > 0 && (
        <SettingsBlock>
          <pre ref={logRef} className="st-log" aria-label="Setup output">
            {log.map((line) => (
              <span key={line.id} className={line.level === 'error' || line.level === 'stderr' ? 'st-log__error' : undefined}>{line.text}{'\n'}</span>
            ))}
          </pre>
        </SettingsBlock>
      )}
    </SettingsGroup>
  );
}
