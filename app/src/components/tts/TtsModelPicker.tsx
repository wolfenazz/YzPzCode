import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Check, DownloadSimple, Trash, X } from '@phosphor-icons/react';
import { useTtsStore } from '../../stores/ttsStore';
import { formatBytes } from '../../utils/mediaFiles';
import { ttsDownloadError } from '../../utils/tts/strings';
import type { TtsDownloadProgress, TtsModelInfo } from '../../utils/tts/types';

export interface TtsModelPickerProps {
  variant?: 'compact' | 'full';
  /** When set, picking a ready model writes a per-slide override instead of the default. */
  slideId?: string;
  onToast?: (message: string) => void;
}

function stateLabel(model: TtsModelInfo): string {
  switch (model.status.state) {
    case 'ready':
      return 'Ready';
    case 'downloading':
      return 'Downloading';
    case 'notDownloaded':
      return 'Not downloaded';
    case 'error':
      return 'Needs attention';
  }
}

function LevelDots({ value, label }: { value: number; label: string }): ReactElement {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={label + ' ' + value + ' of 5'}
      title={label + ' ' + value + '/5'}
    >
      {[1, 2, 3, 4, 5].map((level) => (
        <span
          key={level}
          aria-hidden="true"
          className={
            'h-1.5 w-1.5 rounded-full ' + (level <= value ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]')
          }
        />
      ))}
    </span>
  );
}

/**
 * Local TTS model list with speed/quality/size badges plus Download/Delete and
 * live progress from the `tts-download-progress` event. `compact` renders one
 * row per model for dropdowns/toolbars; `full` renders cards for the Settings
 * manager. Selecting a ready model sets the store default (or the per-slide
 * override when `slideId` is given).
 */
export function TtsModelPicker({ variant, slideId, onToast }: TtsModelPickerProps): ReactElement {
  const [models, setModels] = useState<TtsModelInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [progressByModel, setProgressByModel] = useState<Record<string, TtsDownloadProgress>>({});
  const defaultModelId = useTtsStore((state) => state.defaultModelId);
  const overrideBySlide = useTtsStore((state) => state.modelOverrideBySlide);
  const setDefaultModelId = useTtsStore((state) => state.setDefaultModelId);
  const setSlideModelOverride = useTtsStore((state) => state.setSlideModelOverride);

  const selectedId: string = slideId ? (overrideBySlide[slideId] ?? defaultModelId) : defaultModelId;
  const compact: boolean = variant === 'compact';

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await invoke<TtsModelInfo[]>('tts_list_models');
      setModels(list);
    } catch (error) {
      onToast?.('Could not list narration models: ' + String(error));
    } finally {
      setLoading(false);
    }
  }, [onToast]);

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

  const download = useCallback(
    async (modelId: string): Promise<void> => {
      try {
        await invoke('tts_download_model', { modelId });
        await refresh();
      } catch (error) {
        onToast?.(ttsDownloadError(String(error)));
        await refresh();
      }
    },
    [onToast, refresh],
  );

  const cancelDownload = useCallback(
    async (modelId: string): Promise<void> => {
      try {
        await invoke('tts_cancel_download', { modelId });
      } catch (error) {
        onToast?.('Could not cancel the download: ' + String(error));
      } finally {
        await refresh();
      }
    },
    [onToast, refresh],
  );

  const remove = useCallback(
    async (modelId: string): Promise<void> => {
      try {
        await invoke('tts_delete_model', { modelId });
        setProgressByModel((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
        await refresh();
      } catch (error) {
        onToast?.('Could not delete the model: ' + String(error));
      }
    },
    [onToast, refresh],
  );

  const select = useCallback(
    (modelId: string): void => {
      if (slideId) setSlideModelOverride(slideId, modelId);
      else setDefaultModelId(modelId);
    },
    [slideId, setDefaultModelId, setSlideModelOverride],
  );

  const progressOf = (model: TtsModelInfo): number | null => {
    const live: number | null | undefined = progressByModel[model.id]?.percent;
    if (typeof live === 'number') return live;
    return model.status.progress;
  };

  if (loading) {
    return <p className="px-2 py-3 text-start text-xs text-[var(--text-secondary)]">Loading models…</p>;
  }

  if (models.length === 0) {
    return <p className="px-2 py-3 text-start text-xs text-[var(--text-secondary)]">No narration models found.</p>;
  }

  return (
    <div className={'flex flex-col ' + (compact ? 'gap-1' : 'gap-2')}>
      {models.map((model) => {
        const downloading: boolean = model.status.state === 'downloading';
        const ready: boolean = model.status.state === 'ready';
        const selected: boolean = model.id === selectedId;
        const percent: number | null = progressOf(model);
        const progressEvent: TtsDownloadProgress | undefined = progressByModel[model.id];
        return (
          <div
            key={model.id}
            dir="auto"
            className={
              'rounded-md border px-2 py-1.5 ' +
              (selected
                ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]')
            }
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                title={ready ? 'Use ' + model.label : model.label + ' (' + stateLabel(model) + ')'}
                aria-label={(ready ? 'Use ' : '') + model.label}
                aria-pressed={selected}
                disabled={!ready}
                onClick={() => select(model.id)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-start focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-default"
              >
                {ready && selected && <Check size={14} weight="bold" className="shrink-0 text-[var(--accent)]" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
                    {model.label}
                  </span>
                  <span className="block truncate text-[11px] tabular-nums text-[var(--text-secondary)]">
                    {model.sizeMb} MB
                    {model.status.localBytes > 0 && ' · ' + formatBytes(model.status.localBytes) + ' on disk'}
                    {' · ' + stateLabel(model)}
                  </span>
                </span>
              </button>
              <span className="hidden shrink-0 items-center gap-1.5 sm:inline-flex" aria-hidden="true">
                <LevelDots value={model.speed} label="Speed" />
                <LevelDots value={model.quality} label="Quality" />
              </span>
              {downloading ? (
                <button
                  type="button"
                  title="Cancel download"
                  aria-label={'Cancel download of ' + model.label}
                  onClick={() => void cancelDownload(model.id)}
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : ready ? (
                <button
                  type="button"
                  title={'Delete ' + model.label}
                  aria-label={'Delete ' + model.label}
                  onClick={() => void remove(model.id)}
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <Trash size={14} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  title={'Download ' + model.label}
                  aria-label={'Download ' + model.label}
                  onClick={() => void download(model.id)}
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <DownloadSimple size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            {!compact && (
              <p className="mt-1 text-start text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {model.description}{' '}
                <span className="tabular-nums">
                  ({model.langs.join(' / ') || '—'}
                  {model.dialects.length > 0 && ' · ' + model.dialects.join(', ')})
                </span>
              </p>
            )}
            {model.status.error && !downloading && (
              <p className="mt-1 text-start text-[11px] leading-relaxed text-[var(--destructive)]">
                {model.status.error}
              </p>
            )}
            {downloading && (
              <div className="mt-1.5">
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-tertiary)]"
                  role="progressbar"
                  aria-label={'Download progress for ' + model.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent === null ? undefined : Math.round(percent)}
                >
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: (percent === null ? 0 : percent) + '%' }}
                  />
                </div>
                <p className="mt-1 text-start text-[11px] tabular-nums text-[var(--text-secondary)]">
                  {progressEvent?.message ?? 'Downloading…'}
                  {percent !== null && ' · ' + Math.round(percent) + '%'}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
