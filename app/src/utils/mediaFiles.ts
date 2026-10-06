import { convertFileSrc } from '@tauri-apps/api/core';

export type MediaKind = 'audio' | 'video';

export const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'wave', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'm4b', 'aac', 'weba', 'aif', 'aiff']);
export const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv', 'avi', '3gp']);

export const getMediaKind = (extension: string | null | undefined): MediaKind | null => {
  const ext = extension?.toLowerCase();
  if (!ext) return null;
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
};

/**
 * URL for streaming a local file through the `yzpzmedia` protocol (see
 * `src-tauri/src/filesystem/media_protocol.rs`). It supports HTTP range requests,
 * so audio/video can seek through large files without loading them whole.
 */
export const localFileUrl = (path: string): string =>
  `${convertFileSrc('', 'yzpzmedia')}?path=${encodeURIComponent(path)}`;

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};
