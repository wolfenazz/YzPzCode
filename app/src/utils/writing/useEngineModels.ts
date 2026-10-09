import { useEffect, useState } from 'react';
import { listEngineModels, type WritingModelInfo } from './aiClient';
import type { WritingEngineId } from './types';

/** The engine's selectable models, plus whether the lookup is still running. */
export function useEngineModels(engine: WritingEngineId, enabled = true): { models: WritingModelInfo[]; loading: boolean } {
  const [state, setState] = useState<{ engine: WritingEngineId; models: WritingModelInfo[] } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void listEngineModels(engine).then((models) => {
      if (alive) setState({ engine, models });
    });
    return () => {
      alive = false;
    };
  }, [engine, enabled]);
  const ready = state?.engine === engine;
  return { models: ready ? state.models : [], loading: enabled && !ready };
}
