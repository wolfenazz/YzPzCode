// Frontend side of the headless AI runner (`src-tauri/src/writing`).

import { Channel, invoke } from '@tauri-apps/api/core';
import type { WritingEngineId } from './types';

export interface WritingEngineInfo {
  engine: WritingEngineId;
  displayName: string;
  installed: boolean;
  binaryPath: string | null;
  version: string | null;
  support: 'supported' | 'experimental';
  streaming: 'token' | 'message';
}

type RunEvent =
  | { type: 'started'; pid: number | null }
  | { type: 'delta'; text: string }
  | { type: 'snapshot'; text: string }
  | { type: 'done'; ok: boolean; cancelled: boolean; exitCode: number | null; error: string | null; fullText: string; stderrTail: string };

export interface AiRunResult {
  ok: boolean;
  cancelled: boolean;
  text: string;
  error: string | null;
}

export interface AiRunOptions {
  engine: WritingEngineId;
  model?: string;
  effort?: string;
  system?: string;
  prompt: string;
  timeoutSecs?: number;
  /** Absolute paths of pictures to show engines that can see them (Claude Code, Codex). */
  images?: string[];
  /** Called with the full text so far whenever it changes. */
  onText?: (text: string) => void;
}

export interface AiRun {
  runId: string;
  result: Promise<AiRunResult>;
  cancel: () => void;
}

let engineCache: Promise<WritingEngineInfo[]> | null = null;

export function listWritingEngines(refresh = false): Promise<WritingEngineInfo[]> {
  if (!engineCache || refresh) {
    engineCache = invoke<WritingEngineInfo[]>('get_writing_ai_engines').catch((error: unknown) => {
      engineCache = null;
      throw error;
    });
  }
  return engineCache;
}

const newRunId = (): string => `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function startAiRun(options: AiRunOptions): AiRun {
  const runId = newRunId();
  let text = '';
  let settled = false;
  let resolveResult: (result: AiRunResult) => void = () => undefined;
  const result = new Promise<AiRunResult>((resolve) => {
    resolveResult = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
  });

  const channel = new Channel<RunEvent>();
  channel.onmessage = (event) => {
    if (event.type === 'delta') {
      text += event.text;
      options.onText?.(text);
    } else if (event.type === 'snapshot') {
      text = event.text;
      options.onText?.(text);
    } else if (event.type === 'done') {
      const finalText = event.fullText || text;
      if (finalText !== text) options.onText?.(finalText);
      resolveResult({ ok: event.ok, cancelled: event.cancelled, text: finalText, error: event.error });
    }
  };

  invoke('start_writing_ai_run', {
    request: {
      runId,
      engine: options.engine,
      model: options.model?.trim() || null,
      effort: options.effort?.trim() || null,
      systemPrompt: options.system ?? null,
      prompt: options.prompt,
      timeoutSecs: options.timeoutSecs ?? null,
      images: options.images ?? [],
    },
    onEvent: channel,
  }).catch((error: unknown) => {
    resolveResult({ ok: false, cancelled: false, text: '', error: error instanceof Error ? error.message : String(error) });
  });

  return {
    runId,
    result,
    cancel: () => {
      void invoke('cancel_writing_ai_run', { runId }).catch(() => undefined);
    },
  };
}

export interface WritingModelInfo {
  id: string;
  label: string;
  /** The provider behind the model is signed in (OpenCode only). */
  connected: boolean;
  /** Thinking-effort levels the model accepts, lowest first; empty when it has none. */
  efforts: string[];
}

const modelCache = new Map<WritingEngineId, Promise<WritingModelInfo[]>>();

/** Models an engine's CLI offers; empty for engines that take free text. */
export function listEngineModels(engine: WritingEngineId, refresh = false): Promise<WritingModelInfo[]> {
  let cached = modelCache.get(engine);
  if (!cached || refresh) {
    const request: Promise<WritingModelInfo[]> = invoke<WritingModelInfo[]>('get_writing_engine_models', { engine })
      .catch(() => [] as WritingModelInfo[])
      .then((models) => {
        // An empty answer (CLI still starting, or listing failed) is retried next time.
        if (models.length === 0 && modelCache.get(engine) === request) modelCache.delete(engine);
        return models;
      });
    cached = request;
    modelCache.set(engine, cached);
  }
  return cached;
}
