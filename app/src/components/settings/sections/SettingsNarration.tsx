import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  Cpu,
  DownloadSimple,
  HardDrive,
  Trash,
  Warning,
  X,
  XCircle,
} from '@phosphor-icons/react';
import { formatBytes } from '../../../utils/mediaFiles';
import { TTS_SPEEDS, useTtsStore } from '../../../stores/ttsStore';
import type { TtsSpeed } from '../../../utils/tts/types';
import type { TtsDownloadProgress, TtsModelInfo } from '../../../utils/tts/types';
import {
  Badge,
  Button,
  Notice,
  Segmented,
  SettingsBlock,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStack,
  ToggleRow,
} from '../SettingsKit';

/* Backend mirrors (serde camelCase of `src-tauri/src/tts/{env,cache,bridge}.rs`). */

interface TtsPythonInfo {
  path: string | null;
  version: string | null;
  meetsMinimum: boolean;
}

interface TtsFfmpegInfo {
  path: string | null;
  available: boolean;
  version: string | null;
}

interface TtsVenvInfo {
  path: string;
  exists: boolean;
  pythonPath: string | null;
}

interface TtsEnvStatus {
  python: TtsPythonInfo;
  ffmpeg: TtsFfmpegInfo;
  venv: TtsVenvInfo;
  diskFreeMb: number | null;
  diskWarn: boolean;
}

interface TtsCacheInfo {
  files: number;
  bytes: number;
  maxBytes: number;
}

interface TtsStatus {
  env: TtsEnvStatus;
  models: TtsModelInfo[];
  cache: TtsCacheInfo;
  bridgeRunning: boolean;
}

type ModelState = TtsModelInfo['status']['state'];

const MODEL_LICENSES: Record<string, string> = {
  silma: 'Apache-2.0 weights · MIT code',
  lahgtna: 'Hugging Face page — check the license before downloading',
  kokoro: 'MIT/Apache — verify on the model page',
};

const PYTHON_DOWNLOAD_URL = 'https://www.python.org/downloads/';
const PYTHON_INSTALL_HINT = 'Windows: winget install Python.Python.3.12 · macOS: brew install python@3.12';
const FFMPEG_INSTALL_HINT = 'Windows: winget install Gyan.FFmpeg · macOS: brew install ffmpeg';

const HEALTH_ICON = {
  ok: <CheckCircle size={18} weight="fill" color="var(--st-success)" aria-hidden="true" />,
  outdated: <Warning size={18} weight="fill" color="var(--st-warning)" aria-hidden="true" />,
  missing: <XCircle size={18} weight="fill" color="var(--st-danger)" aria-hidden="true" />,
} as const;

function stateBadge(state: ModelState): ReactElement {
  switch (state) {
    case 'ready':
      return <Badge tone="success">Ready</Badge>;
    case 'downloading':
      return <Badge tone="accent">Downloading</Badge>;
    case 'error':
      return <Badge tone="warning">Needs attention</Badge>;
    case 'notDownloaded':
      return <Badge>Not downloaded</Badge>;
  }
}

function Meter({ value, label }: { value: number; label: string }): ReactElement {
  const percent: number = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}/5
      </span>
      <span
        aria-label={label}
        aria-valuemax={5}
        aria-valuemin={0}
        aria-valuenow={value}
        className="st-meter"
        role="progressbar"
        style={{ width: '6rem' }}
      >
        <span className="st-meter__fill" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

/** `<appData>/tts/venv` → `<appData>` (two levels up), or null when it cannot be derived. */
function appDataDirOf(venvPath: string): string | null {
  const clean: string = venvPath.replace(/[\\/]+$/, '');
  const parts: string[] = clean.split(/[\\/]/);
  if (parts.length <= 2) return null;
  const sep: string = clean.includes('\\') ? '\\' : '/';
  return parts.slice(0, parts.length - 2).join(sep) || null;
}

/** `<appData>/tts/venv` → `<appData>/tts/bridge.log` (the bridge stderr tail lives here). */
function bridgeLogOf(venvPath: string): string {
  const clean: string = venvPath.replace(/[\\/]+$/, '');
  const sep: string = clean.includes('\\') ? '\\' : '/';
  const root: string = clean.replace(/[\\/]venv$/, '');
  return `${root}${sep}bridge.log`;
}

/**
 * Settings → Narration: the full local-TTS manager. Environment (Python /
 * ffmpeg / managed venv / disk), per-model cards with download state and
 * license links, and the synthesized-audio cache. Playback preferences live in
 * `ttsStore` (`yzpzcode-tts`); weights and WAVs live in Tauri app-data.
 */
export function SettingsNarration(): ReactElement {
  const [status, setStatus] = useState<TtsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [checking, setChecking] = useState<boolean>(false);
  const [ensuring, setEnsuring] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);
  const [busyModel, setBusyModel] = useState<string | null>(null);
  const [progressByModel, setProgressByModel] = useState<Record<string, TtsDownloadProgress>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const enabled = useTtsStore((state) => state.enabled);
  const setEnabled = useTtsStore((state) => state.setEnabled);
  const speed = useTtsStore((state) => state.speed);
  const setSpeed = useTtsStore((state) => state.setSpeed);
  const autoDetect = useTtsStore((state) => state.autoDetect);
  const setAutoDetect = useTtsStore((state) => state.setAutoDetect);
  const autoplayInPresenter = useTtsStore((state) => state.autoplayInPresenter);
  const setAutoplayInPresenter = useTtsStore((state) => state.setAutoplayInPresenter);
  const prewarmNotes = useTtsStore((state) => state.prewarmNotes);
  const setPrewarmNotes = useTtsStore((state) => state.setPrewarmNotes);
  const defaultModelId = useTtsStore((state) => state.defaultModelId);
  const setDefaultModelId = useTtsStore((state) => state.setDefaultModelId);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await invoke<TtsStatus>('tts_status');
      setStatus(next);
    } catch (error) {
      setErrorMsg('Could not check the narration setup: ' + String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refresh();
    let unlisten: (() => void) | undefined;
    void listen<TtsDownloadProgress>('tts-download-progress', (event) => {
      if (cancelled) return;
      const payload: TtsDownloadProgress = event.payload;
      setProgressByModel((prev) => ({ ...prev, [payload.modelId]: payload }));
      if (payload.stage === 'completed' || payload.stage === 'failed') void refresh();
    }).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refresh]);

  const fail = useCallback((message: string): void => {
    setInfoMsg(null);
    setErrorMsg(message);
  }, []);

  const inform = useCallback((message: string): void => {
    setErrorMsg(null);
    setInfoMsg(message);
  }, []);

  const recheck = useCallback(async (): Promise<void> => {
    setChecking(true);
    setErrorMsg(null);
    try {
      const next = await invoke<TtsStatus>('tts_status');
      setStatus(next);
    } catch (error) {
      fail('Could not check the narration setup: ' + String(error));
    } finally {
      setChecking(false);
    }
  }, [fail]);

  const ensureEnv = useCallback(async (): Promise<void> => {
    setEnsuring(true);
    setErrorMsg(null);
    try {
      await invoke('tts_ensure_env');
      inform('The narration environment is ready.');
      await refresh();
    } catch (error) {
      fail('Could not set up the narration environment: ' + String(error));
    } finally {
      setEnsuring(false);
    }
  }, [fail, inform, refresh]);

  const download = useCallback(
    async (modelId: string): Promise<void> => {
      setBusyModel(modelId);
      setErrorMsg(null);
      try {
        await invoke('tts_download_model', { modelId });
        inform('Download finished — the voice is ready.');
        await refresh();
      } catch (error) {
        fail('Download failed: ' + String(error));
        await refresh();
      } finally {
        setBusyModel(null);
      }
    },
    [fail, inform, refresh],
  );

  const cancelDownload = useCallback(
    async (modelId: string): Promise<void> => {
      try {
        await invoke('tts_cancel_download', { modelId });
      } catch (error) {
        fail('Could not cancel the download: ' + String(error));
      } finally {
        await refresh();
      }
    },
    [fail, refresh],
  );

  const deleteModel = useCallback(
    async (modelId: string): Promise<void> => {
      setBusyModel(modelId);
      setErrorMsg(null);
      try {
        await invoke('tts_delete_model', { modelId });
        setProgressByModel((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
        inform('Voice deleted — its disk space is free again.');
        await refresh();
      } catch (error) {
        fail('Could not delete the voice: ' + String(error));
      } finally {
        setBusyModel(null);
      }
    },
    [fail, inform, refresh],
  );

  const clearCache = useCallback(async (): Promise<void> => {
    setClearing(true);
    setErrorMsg(null);
    try {
      const removed = await invoke<number>('tts_clear_cache');
      inform(removed === 0 ? 'The audio cache is already empty.' : `Cleared ${removed} cached audio files.`);
      await refresh();
    } catch (error) {
      fail('Could not clear the audio cache: ' + String(error));
    } finally {
      setClearing(false);
    }
  }, [fail, inform, refresh]);

  const openUrl = useCallback(
    async (url: string): Promise<void> => {
      try {
        await invoke('open_url', { url });
      } catch (error) {
        fail('Could not open the link: ' + String(error));
      }
    },
    [fail],
  );

  const openInstallTerminal = useCallback(
    async (directory: string): Promise<void> => {
      try {
        await invoke('open_external_terminal', { directory });
      } catch (error) {
        fail('Could not open a terminal: ' + String(error));
      }
    },
    [fail],
  );

  if (loading && !status) {
    return (
      <SettingsStack>
        <SettingsEmpty title="Checking the narration setup…">Looking for Python, ffmpeg and downloaded voices.</SettingsEmpty>
      </SettingsStack>
    );
  }

  const env: TtsEnvStatus | null = status?.env ?? null;
  const models: TtsModelInfo[] = status?.models ?? [];
  const cache: TtsCacheInfo | null = status?.cache ?? null;

  const pythonFound: boolean = !!env?.python.path;
  const pythonOk: boolean = !!env && pythonFound && env.python.meetsMinimum;
  const pythonHealth = !env || !pythonFound ? 'missing' : env.python.meetsMinimum ? 'ok' : 'outdated';
  const ffmpegOk: boolean = !!env?.ffmpeg.available;
  const venvExists: boolean = !!env?.venv.exists;
  const appDataDir: string | null = env ? appDataDirOf(env.venv.path) : null;
  const downloadBlocked: string | null = !pythonOk
    ? 'Python 3.10+ is required'
    : !ffmpegOk
      ? 'ffmpeg is required'
      : null;

  return (
    <SettingsStack>
      {errorMsg && <Notice tone="danger">{errorMsg}</Notice>}
      {infoMsg && <Notice tone="success">{infoMsg}</Notice>}

      <SettingsGroup
        title="Playback"
        description="How narration sounds in presentation and report workspaces. Audio is synthesized offline on this computer."
      >
        <ToggleRow
          checked={enabled}
          description="When off, Speak buttons are hidden in editors and the presenter."
          label="Enable narration"
          onChange={setEnabled}
        />
        <SettingsRow
          description="Applies to every voice; cached audio is keyed per speed."
          label="Default speed"
        >
          <Segmented<TtsSpeed>
            label="Default narration speed"
            onChange={setSpeed}
            options={TTS_SPEEDS.map((value) => ({ value, label: `${value}×` }))}
            value={speed}
          />
        </SettingsRow>
        <ToggleRow
          checked={autoDetect}
          description="Arabic text uses the Arabic voice, English text the English voice. When off, the English voice is used."
          label="Detect Arabic automatically"
          onChange={setAutoDetect}
        />
        <ToggleRow
          checked={prewarmNotes}
          description="While a deck is open, speaker notes are turned into audio in the background so Narrate starts right away. Uses some CPU for a short while; turn off to narrate only on demand."
          label="Prepare narration in advance"
          onChange={setPrewarmNotes}
        />
        <ToggleRow
          checked={autoplayInPresenter}
          description="Start reading each slide's notes when it appears. Off by default."
          label="Autoplay in the presenter"
          onChange={setAutoplayInPresenter}
        />
      </SettingsGroup>

      <SettingsGroup
        action={(
          <Button icon={ArrowsClockwise} loading={checking} onClick={() => void recheck()} size="sm">
            {checking ? 'Checking…' : 'Check again'}
          </Button>
        )}
        description="Narration runs in an isolated Python environment on this computer. No account, no API key, no network except model downloads."
        title="Environment"
      >
        <SettingsRow
          description={env?.python.path ?? 'Not found on PATH — install Python 3.10 or newer.'}
          icon={HEALTH_ICON[pythonHealth]}
          iconBare
          label="Python"
        >
          {env?.python.version
            ? <Badge tone={env.python.meetsMinimum ? 'neutral' : 'warning'}>v{env.python.version}{env.python.meetsMinimum ? '' : ' · needs 3.10+'}</Badge>
            : <Badge tone="danger">Not installed</Badge>}
        </SettingsRow>
        {!pythonOk && (
          <SettingsBlock>
            <Notice tone="danger">
              <span dir="auto">
                <strong>Python 3.10+ required.</strong> The isolated narration environment needs Python 3.10 or
                newer on PATH. Install it, relaunch YzPzCode, then press Check again.
              </span>
              <span dir="auto" style={{ display: 'block', marginTop: 4 }}>
                السرد يحتاج بايثون 3.10 أو أحدث على PATH — ثبّته وأعد تشغيل YzPzCode ثم اضغط تحقق مجددًا.
              </span>
              <span className="st-mono" style={{ display: 'block', marginTop: 6 }}>{PYTHON_INSTALL_HINT}</span>
            </Notice>
            <div className="st-actions" style={{ marginTop: 8, justifyContent: 'flex-start' }}>
              {appDataDir && (
                <Button icon={ArrowSquareOut} onClick={() => void openInstallTerminal(appDataDir)} size="sm" variant="primary">
                  Install in terminal
                </Button>
              )}
              <Button icon={ArrowSquareOut} onClick={() => void openUrl(PYTHON_DOWNLOAD_URL)} size="sm">
                Download page
              </Button>
            </div>
          </SettingsBlock>
        )}
        <SettingsRow
          description={env?.ffmpeg.path ?? 'Not found — needed to prepare narration voices.'}
          icon={ffmpegOk ? HEALTH_ICON.ok : HEALTH_ICON.missing}
          iconBare
          label="ffmpeg"
        >
          {ffmpegOk
            ? <Badge>{env?.ffmpeg.version ? `v${env.ffmpeg.version}` : 'Installed'}</Badge>
            : <Badge tone="warning">Missing</Badge>}
        </SettingsRow>
        {!ffmpegOk && (
          <SettingsBlock>
            <Notice tone="warning">
              <span dir="auto">
                <strong>ffmpeg is missing (non-blocking).</strong> Model downloads stay blocked until it is
                installed — voices need it to prepare audio.
              </span>
              <span dir="auto" style={{ display: 'block', marginTop: 4 }}>
                مطلوب ffmpeg لتجهيز أصوات السرد — يبقى التنزيل محظورًا حتى تثبيته.
              </span>
              <span className="st-mono" style={{ display: 'block', marginTop: 6 }}>{FFMPEG_INSTALL_HINT}</span>
            </Notice>
          </SettingsBlock>
        )}
        <SettingsRow
          description={env?.venv.path ?? 'The venv is created on first use.'}
          icon={venvExists ? HEALTH_ICON.ok : HEALTH_ICON.missing}
          iconBare
          label="Managed environment"
        >
          <Badge tone={venvExists ? 'success' : 'neutral'}>{ensuring ? 'Creating…' : venvExists ? 'Ready' : 'Missing'}</Badge>
        </SettingsRow>
        <SettingsRow
          description="Creates the isolated venv (model packages install per voice, on demand)."
          label="Set up the environment"
        >
          <Button
            disabled={!pythonOk}
            loading={ensuring}
            onClick={() => void ensureEnv()}
            size="sm"
            title={!pythonOk ? 'Python 3.10+ is required first' : undefined}
            variant="primary"
          >
            {ensuring ? 'Setting up…' : venvExists ? 'Repair environment' : 'Set up environment'}
          </Button>
        </SettingsRow>
        <SettingsRow
          description={
            env?.diskFreeMb === null || env?.diskFreeMb === undefined
              ? 'Could not measure free space on this computer.'
              : `${(env.diskFreeMb / 1024).toFixed(1)} GB free — voices need about 2.5 GB free to download.`
          }
          icon={env?.diskWarn ? HEALTH_ICON.outdated : HEALTH_ICON.ok}
          iconBare
          label="Disk space"
        >
          {env?.diskWarn ? <Badge tone="warning">Low</Badge> : <Badge>OK</Badge>}
        </SettingsRow>
        <SettingsRow
          description={status?.bridgeRunning ? 'Synthesizing right now.' : 'Starts on demand while synthesizing, then stops.'}
          icon={<span className="st-dot" />}
          iconBare
          label="Narration bridge"
        >
          <Badge tone={status?.bridgeRunning ? 'success' : 'neutral'}>
            {status?.bridgeRunning ? 'Running' : 'Idle'}
          </Badge>
        </SettingsRow>
      </SettingsGroup>

      <Notice tone="info">
        Download only the voices you need. SILMA alone covers Arabic and English; Kokoro is the fast
        English option, Lahgtna the dialect option.
      </Notice>
      {models.length === 0 && (
        <SettingsGroup title="Voice models" description="Downloadable offline voices.">
          <SettingsEmpty title="No voices found">Press Check again to reload the catalog.</SettingsEmpty>
        </SettingsGroup>
      )}

      {models.map((model) => {
        const downloading: boolean = model.status.state === 'downloading';
        const ready: boolean = model.status.state === 'ready';
        const live: TtsDownloadProgress | undefined = progressByModel[model.id];
        const percent: number | null = typeof live?.percent === 'number' ? live.percent : model.status.progress;
        const isBusy: boolean = busyModel === model.id;
        const isDefault: boolean = defaultModelId === model.id;
        const licenseLabel: string = MODEL_LICENSES[model.id] ?? 'Check the license on the model page';
        return (
          <SettingsGroup
            action={stateBadge(model.status.state)}
            description={model.description}
            key={model.id}
            title={model.label}
          >
            <SettingsRow label="Languages" description="SILMA is bilingual; Kokoro is English-only.">
              <span style={{ fontSize: '0.78125rem', color: 'var(--text-primary)' }}>
                {model.langs.join(' · ') || '—'}
              </span>
            </SettingsRow>
            {model.dialects.length > 0 && (
              <SettingsRow label="Dialects" description="Arabic varieties this voice covers.">
                <span style={{ fontSize: '0.78125rem', color: 'var(--text-primary)' }}>
                  {model.dialects.join(', ').toUpperCase()}
                </span>
              </SettingsRow>
            )}
            <SettingsRow label="Speed" description="How fast it synthesizes (5 is fastest).">
              <Meter label={`Speed of ${model.label}`} value={model.speed} />
            </SettingsRow>
            <SettingsRow label="Quality" description="Voice quality (5 is best).">
              <Meter label={`Quality of ${model.label}`} value={model.quality} />
            </SettingsRow>
            <SettingsRow
              description={`About ${model.sizeMb} MB to download${model.status.localBytes > 0 ? ` · ${formatBytes(model.status.localBytes)} on disk` : ''}.`}
              label="Size"
            >
              {isDefault && <Badge tone="accent">Default voice</Badge>}
            </SettingsRow>
            <SettingsRow description={`${licenseLabel} · ${model.hfRepo}`} label="License & model card">
              <Button icon={ArrowSquareOut} onClick={() => void openUrl(model.licenseUrl)} size="sm">
                Model page
              </Button>
            </SettingsRow>
            {model.status.error && !downloading && (
              <SettingsBlock>
                <Notice tone="warning">{model.status.error}</Notice>
              </SettingsBlock>
            )}
            {downloading && (
              <SettingsBlock>
                <div
                  aria-label={`Download progress for ${model.label}`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={percent === null ? undefined : Math.round(percent)}
                  className="st-meter"
                  role="progressbar"
                >
                  <div className="st-meter__fill" style={{ width: `${percent ?? 0}%` }} />
                </div>
                <p className="st-group__foot" style={{ padding: 0, marginTop: 6 }}>
                  {live?.message ?? 'Downloading…'}
                  {percent !== null && ` · ${Math.round(percent)}%`}
                </p>
              </SettingsBlock>
            )}
            <SettingsRow
              description={
                ready
                  ? 'Downloaded and ready to narrate.'
                  : downloading
                    ? 'Downloading weights — you can cancel and resume later.'
                    : 'Not on this computer yet.'
              }
              label={ready ? 'On this computer' : downloading ? 'Download' : 'Get this voice'}
            >
              <span style={{ display: 'inline-flex', gap: 6 }}>
                {downloading ? (
                  <Button icon={X} onClick={() => void cancelDownload(model.id)} size="sm">
                    Cancel
                  </Button>
                ) : ready ? (
                  <>
                    {!isDefault && (
                      <Button onClick={() => setDefaultModelId(model.id)} size="sm" variant="primary">
                        Use by default
                      </Button>
                    )}
                    <Button
                      icon={Trash}
                      loading={isBusy}
                      onClick={() => void deleteModel(model.id)}
                      size="sm"
                      variant="danger"
                    >
                      Delete
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={downloadBlocked !== null}
                    icon={DownloadSimple}
                    loading={isBusy}
                    onClick={() => void download(model.id)}
                    size="sm"
                    title={downloadBlocked ?? `Download ${model.label}`}
                    variant="primary"
                  >
                    Download
                  </Button>
                )}
              </span>
            </SettingsRow>
          </SettingsGroup>
        );
      })}

      <SettingsGroup
        description="Replay is instant: identical text replays from disk without synthesizing again. Oldest files are removed automatically past the limit."
        title="Audio cache"
      >
        <SettingsRow
          description={
            cache
              ? `${cache.files} files · ${formatBytes(cache.bytes)} of ${formatBytes(cache.maxBytes)}`
              : 'Cache size is unknown until the next check.'
          }
          icon={<HardDrive size={16} aria-hidden="true" />}
          label="Downloaded audio"
        >
          <Button
            disabled={!cache || cache.files === 0}
            icon={Trash}
            loading={clearing}
            onClick={() => void clearCache()}
            size="sm"
            variant="danger"
          >
            Clear cache
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        description="What to expect on real hardware."
        title="Good to know"
      >
        <SettingsRow
          description="Long notes synthesize in chunks with a Cancel button; slowing down usually means the CPU is busy. SILMA or Kokoro are the fastest options."
          icon={<Cpu size={16} aria-hidden="true" />}
          label="Synthesis speed"
        />
        <SettingsRow
          description={env ? `The bridge restarts itself once after a crash — retry, then check ${bridgeLogOf(env.venv.path)} for the log tail.` : 'The bridge restarts itself once after a crash — retry, then check bridge.log in the narration folder.'}
          icon={HEALTH_ICON.ok}
          iconBare
          label="If narration fails"
        />
      </SettingsGroup>
    </SettingsStack>
  );
}
