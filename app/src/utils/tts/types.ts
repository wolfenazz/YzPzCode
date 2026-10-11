/**
 * Shared frontend mirror of the Rust TTS backend contract (`src-tauri/src/tts/`).
 *
 * Serde renames every field to camelCase, so `model_id` arrives as `modelId`,
 * `size_mb` as `sizeMb`, `wav_path` as `wavPath`, and so on. Keep these in sync
 * with `models.rs` / `bridge.rs` / `env.rs` when the backend changes.
 */

/** Playback speeds offered everywhere in the UI (matches the plan). */
export type TtsSpeed = 0.75 | 1 | 1.25;

/** Languages the frontend can auto-detect (see `langDetect.ts`). */
export type TtsLang = 'ar' | 'en';

/** Model download states reported by `status_of` in `models.rs`. */
export type TtsModelState = 'ready' | 'notDownloaded' | 'downloading' | 'error';

export interface TtsModelStatus {
  id: string;
  state: TtsModelState;
  progress: number | null;
  localBytes: number;
  error: string | null;
}

export interface TtsModelInfo {
  id: string;
  label: string;
  langs: string[];
  dialects: string[];
  sizeMb: number;
  speed: number;
  quality: number;
  pipSpec: string;
  hfRepo: string;
  licenseUrl: string;
  description: string;
  status: TtsModelStatus;
}

/** Payload of the `tts-download-progress` window event. */
export interface TtsDownloadProgress {
  modelId: string;
  stage: string;
  message: string;
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

/** Payload of the `tts-synth-progress` window event. */
export interface TtsSynthProgress {
  runId: string;
  modelId: string;
  stage: string;
  message: string;
  percent: number | null;
}

/** Return value of the `tts_synthesize` command. Play via `localFileUrl(wavPath)`. */
export interface TtsSynthResult {
  wavPath: string;
  durationMs: number | null;
  cached: boolean;
  modelId: string;
}

/** Catalog ids known to the backend (`TTS_CATALOG` in `models.rs`). */
export const KNOWN_TTS_MODEL_IDS: readonly string[] = ['silma', 'lahgtna', 'kokoro'];

/** Bundled reference voices shipped under `src-tauri/resources/tts-refs/`. */
export const TTS_VOICE_BY_LANG: Readonly<Record<TtsLang, string>> = {
  ar: 'ar-female.wav',
  en: 'en-neutral.wav',
};
