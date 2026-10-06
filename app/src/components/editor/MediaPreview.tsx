import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { ArrowSquareOut, ClockClockwise, ClockCounterClockwise, MusicNotes, Pause, Play, Repeat, SpeakerHigh, SpeakerLow, SpeakerSlash, WarningCircle } from '@phosphor-icons/react';
import { EditorActionButton } from './EditorActionButton';
import { formatBytes, formatDuration, localFileUrl, type MediaKind } from '../../utils/mediaFiles';

interface MediaPreviewProps {
  filePath: string;
  fileName: string;
  kind: MediaKind;
}

interface Waveform {
  peaks: Float32Array;
  sampleRate: number;
  channels: number;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
// Decoding needs the whole file in memory as PCM, so very large files only get a progress bar.
const WAVEFORM_MAX_BYTES = 80 * 1024 * 1024;
const WAVEFORM_BUCKETS = 1200;
const MAX_CACHED_WAVEFORMS = 12;
const waveformCache = new Map<string, Waveform>();
// Volume carries over between files in the same session, like a real player.
let sessionVolume = 1;

const extensionOf = (name: string): string => name.split('.').pop()?.toUpperCase() ?? '';

async function decodeWaveform(url: string): Promise<Waveform> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const peaks = new Float32Array(WAVEFORM_BUCKETS);
    const bucketSize = Math.max(1, Math.floor(buffer.length / WAVEFORM_BUCKETS));
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let bucket = 0; bucket < WAVEFORM_BUCKETS; bucket++) {
        const start = bucket * bucketSize;
        const end = Math.min(start + bucketSize, data.length);
        let peak = peaks[bucket];
        for (let i = start; i < end; i++) {
          const value = Math.abs(data[i]);
          if (value > peak) peak = value;
        }
        peaks[bucket] = peak;
      }
    }
    const loudest = peaks.reduce((max, value) => Math.max(max, value), 0) || 1;
    for (let i = 0; i < peaks.length; i++) peaks[i] /= loudest;
    return { peaks, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels };
  } finally {
    void context.close();
  }
}

const WaveformTrack: React.FC<{ peaks: Float32Array | null; progress: number; duration: number; onSeek: (fraction: number) => void }> = ({ peaks, progress, duration, onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !peaks) return;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(canvas);
    const played = styles.getPropertyValue('--accent').trim() || '#d87757';
    const unplayed = styles.getPropertyValue('--text-secondary').trim() || '#76746b';
    const bar = 2;
    const gap = 1;
    const bars = Math.max(1, Math.floor(width / (bar + gap)));
    const mid = height / 2;
    for (let i = 0; i < bars; i++) {
      const from = Math.floor((i / bars) * peaks.length);
      const to = Math.max(from + 1, Math.floor(((i + 1) / bars) * peaks.length));
      let peak = 0;
      for (let j = from; j < to; j++) peak = Math.max(peak, peaks[j]);
      const barHeight = Math.max(2, peak * (height - 4));
      const isPlayed = (i + 0.5) / bars <= progress;
      ctx.fillStyle = isPlayed ? played : unplayed;
      ctx.globalAlpha = isPlayed ? 1 : 0.45;
      ctx.fillRect(i * (bar + gap), mid - barHeight / 2, bar, barHeight);
    }
    ctx.globalAlpha = 1;
  }, [peaks, progress, width]);

  const fractionAt = (event: React.PointerEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };

  return <div
    role="slider" tabIndex={-1} aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(progress * duration)}
    className="relative h-28 w-full cursor-pointer select-none touch-none"
    onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); onSeek(fractionAt(event)); }}
    onPointerMove={(event) => { const fraction = fractionAt(event); setHover(fraction); if (dragging.current) onSeek(fraction); }}
    onPointerUp={() => { dragging.current = false; }}
    onPointerLeave={() => setHover(null)}>
    <canvas ref={canvasRef} className={`h-full w-full ${peaks ? '' : 'invisible'}`} />
    {!peaks && <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
      <div className="h-full bg-[var(--accent)]" style={{ width: `${progress * 100}%` }} />
    </div>}
    {hover !== null && duration > 0 && <>
      <div className="pointer-events-none absolute inset-y-0 w-px bg-[var(--text-primary)] opacity-40" style={{ left: `${hover * 100}%` }} />
      <span className="pointer-events-none absolute -top-5 -translate-x-1/2 rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-primary)] border border-[var(--border-primary)]" style={{ left: `${hover * 100}%` }}>{formatDuration(hover * duration)}</span>
    </>}
  </div>;
};

const MediaPreviewInner: React.FC<MediaPreviewProps> = ({ filePath, fileName, kind }) => {
  const src = localFileUrl(filePath);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(sessionVolume);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<Waveform | 'loading' | 'unavailable'>(() => waveformCache.get(filePath) ?? 'loading');

  useEffect(() => {
    let cancelled = false;
    invoke<number>('get_file_size', { path: filePath })
      .then((bytes) => { if (!cancelled) setSize(bytes); })
      .catch(() => { if (!cancelled) setSize(null); });
    return () => { cancelled = true; };
  }, [filePath]);

  useEffect(() => {
    if (kind !== 'audio' || size === null || waveformCache.has(filePath)) return;
    if (size > WAVEFORM_MAX_BYTES) { setWaveform('unavailable'); return; }
    let cancelled = false;
    decodeWaveform(src)
      .then((result) => {
        if (waveformCache.size >= MAX_CACHED_WAVEFORMS) {
          const oldest = waveformCache.keys().next().value;
          if (oldest) waveformCache.delete(oldest);
        }
        waveformCache.set(filePath, result);
        if (!cancelled) setWaveform(result);
      })
      .catch(() => { if (!cancelled) setWaveform('unavailable'); });
    return () => { cancelled = true; };
  }, [kind, filePath, size, src]);

  // timeupdate only fires a few times a second; follow the playhead per frame while playing.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = (): void => {
      if (mediaRef.current) setCurrentTime(mediaRef.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = volume;
    media.muted = muted;
    media.playbackRate = rate;
    sessionVolume = volume;
  }, [volume, muted, rate]);

  const togglePlay = useCallback((): void => {
    const media = mediaRef.current;
    if (!media) return;
    // A pause that lands before playback starts rejects with AbortError; that's not a failure.
    if (media.paused) void media.play().catch((err: unknown) => { if ((err as DOMException)?.name !== 'AbortError') setError(String(err)); });
    else media.pause();
  }, []);

  const seekTo = useCallback((seconds: number): void => {
    const media = mediaRef.current;
    if (!media || !Number.isFinite(media.duration)) return;
    media.currentTime = Math.min(media.duration, Math.max(0, seconds));
    setCurrentTime(media.currentTime);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    // Native video controls and form fields handle their own keys.
    if (target instanceof HTMLMediaElement || ['INPUT', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
    const media = mediaRef.current;
    if (!media) return;
    const actions: Record<string, () => void> = {
      ' ': togglePlay,
      k: togglePlay,
      ArrowLeft: () => seekTo(media.currentTime - 5),
      ArrowRight: () => seekTo(media.currentTime + 5),
      j: () => seekTo(media.currentTime - 10),
      l: () => seekTo(media.currentTime + 10),
      m: () => setMuted((value) => !value),
      ArrowUp: () => { setMuted(false); setVolume((value) => Math.min(1, value + 0.05)); },
      ArrowDown: () => setVolume((value) => Math.max(0, value - 0.05)),
      Home: () => seekTo(0),
      End: () => seekTo(media.duration),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const mediaEvents = {
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const media = event.currentTarget;
      setDuration(Number.isFinite(media.duration) ? media.duration : 0);
      if (media instanceof HTMLVideoElement && media.videoWidth) setVideoSize({ w: media.videoWidth, h: media.videoHeight });
      media.volume = volume; media.muted = muted; media.playbackRate = rate;
    },
    onDurationChange: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const value = event.currentTarget.duration;
      if (Number.isFinite(value)) setDuration(value);
    },
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => setCurrentTime(event.currentTarget.currentTime),
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onVolumeChange: (event: React.SyntheticEvent<HTMLMediaElement>) => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); },
    onRateChange: (event: React.SyntheticEvent<HTMLMediaElement>) => setRate(event.currentTarget.playbackRate),
    onError: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const code = event.currentTarget.error?.code;
      setError(code === MediaError.MEDIA_ERR_NETWORK
        ? 'The file could not be read. It may have been moved or deleted.'
        : `Your system's media engine can't decode this ${extensionOf(fileName)} file. The format or codec isn't supported by the built-in player.`);
    },
  };

  const openExternally = (): void => { void openPath(filePath).catch((err: unknown) => setError(`Could not open the file: ${String(err)}`)); };
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const decoded = typeof waveform === 'object' ? waveform : null;
  const bitrate = size && duration > 0 ? Math.round((size * 8) / duration / 1000) : null;
  const details = [
    extensionOf(fileName),
    videoSize && `${videoSize.w} × ${videoSize.h}`,
    duration > 0 && formatDuration(duration),
    decoded && `${(decoded.sampleRate / 1000).toFixed(1)} kHz`,
    decoded && (decoded.channels === 1 ? 'Mono' : decoded.channels === 2 ? 'Stereo' : `${decoded.channels} channels`),
    bitrate && `${bitrate} kbps`,
    size !== null && formatBytes(size),
  ].filter(Boolean).join(' · ');
  const VolumeIcon = muted || volume === 0 ? SpeakerSlash : volume < 0.5 ? SpeakerLow : SpeakerHigh;

  const header = <div className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border-primary)] px-3 py-1">
    <span className="min-w-0 truncate text-[11px] tabular-nums text-[var(--text-secondary)]">{details || fileName}</span>
    <div className="flex items-center gap-0.5">
      <EditorActionButton label={loop ? 'Loop on' : 'Loop off'} active={loop} onClick={() => setLoop(!loop)} disabled={!!error}><Repeat size={14} /><span>Loop</span></EditorActionButton>
      <label className="flex h-7 items-center gap-1 px-1 text-[11px] text-[var(--text-secondary)]">
        <span className="sr-only">Playback speed</span>
        <select value={rate} disabled={!!error} onChange={(event) => setRate(Number(event.target.value))}
          className="h-6 cursor-pointer rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-1 text-[11px] text-[var(--text-primary)] tabular-nums focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          {SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
        </select>
      </label>
      <EditorActionButton label="Open with the system's default app" onClick={openExternally}><ArrowSquareOut size={14} /><span>Open externally</span></EditorActionButton>
    </div>
  </div>;

  const errorPanel = error && <div className="flex h-full items-center justify-center px-6">
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
      <WarningCircle size={32} weight="light" className="text-[var(--text-secondary)]" />
      <p className="text-sm font-medium text-[var(--text-primary)]">Can't play this file here</p>
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{error}</p>
      <button type="button" onClick={openExternally}
        className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-primary)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
        <ArrowSquareOut size={14} />Open with default app
      </button>
    </div>
  </div>;

  if (kind === 'video') {
    return <div className="absolute inset-0 flex flex-col overflow-hidden bg-[var(--bg-primary)]" onKeyDown={handleKeyDown}>
      {header}
      <div className="relative min-h-0 flex-1 bg-black">
        {errorPanel || <video ref={(node) => { mediaRef.current = node; }} src={src} controls loop={loop} preload="metadata" playsInline
          className="absolute inset-0 h-full w-full object-contain outline-none" {...mediaEvents} />}
      </div>
    </div>;
  }

  return <div tabIndex={0} aria-label={`Audio player: ${fileName}`} onKeyDown={handleKeyDown}
    className="absolute inset-0 flex flex-col overflow-hidden bg-[var(--bg-primary)] outline-none">
    {header}
    <audio ref={(node) => { mediaRef.current = node; }} src={src} loop={loop} preload="metadata" className="hidden" {...mediaEvents} />
    <div className="min-h-0 flex-1 overflow-auto">
      {errorPanel || <div className="flex min-h-full items-center justify-center px-6 py-8">
        <div className="w-full max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent)]"><MusicNotes size={22} /></div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={fileName}>{fileName}</p>
              <p className="text-[11px] text-[var(--text-secondary)]">{waveform === 'loading' ? 'Reading waveform…' : 'Space to play · ← → to seek · M to mute'}</p>
            </div>
          </div>

          <WaveformTrack peaks={decoded?.peaks ?? null} progress={progress} duration={duration} onSeek={(fraction) => seekTo(fraction * duration)} />

          <div className="mt-2 flex justify-between text-[11px] tabular-nums text-[var(--text-secondary)]">
            <span>{formatDuration(currentTime)}</span>
            <span>-{formatDuration(Math.max(0, duration - currentTime))}</span>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <EditorActionButton label="Back 10 seconds (J)" onClick={() => seekTo(currentTime - 10)}><ClockCounterClockwise size={18} /></EditorActionButton>
              <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} title={playing ? 'Pause (Space)' : 'Play (Space)'}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[var(--accent)] text-white transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
                {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" className="translate-x-px" />}
              </button>
              <EditorActionButton label="Forward 10 seconds (L)" onClick={() => seekTo(currentTime + 10)}><ClockClockwise size={18} /></EditorActionButton>
            </div>
            <div className="flex items-center gap-2">
              <EditorActionButton label={muted ? 'Unmute (M)' : 'Mute (M)'} onClick={() => setMuted(!muted)}><VolumeIcon size={16} /></EditorActionButton>
              <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} aria-label="Volume"
                onChange={(event) => { setMuted(false); setVolume(Number(event.target.value)); }}
                className="w-28 cursor-pointer accent-[var(--accent)]" />
            </div>
          </div>
        </div>
      </div>}
    </div>
  </div>;
};

/** Plays audio (with a seekable waveform) and video files directly in the editor. */
export const MediaPreview = React.memo(MediaPreviewInner);
