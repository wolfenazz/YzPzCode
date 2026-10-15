// The studio composer: the React Bits prompt bar with the app's AI engines as
// its models and each studio's own controls in the bar row.
import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import PromptBar, { type PromptBarModel, type PromptBarSource } from '../reactbits/PromptBar';
import { Attachment01Icon } from '../reactbits/icons';
import { listEngineModels, listWritingEngines, type WritingEngineInfo, type WritingModelInfo } from '../../utils/writing/aiClient';
import { effortLabel, effortOptions } from '../../utils/writing/efforts';
import type { EngineChoice, WritingEngineId } from '../../utils/writing/types';

const DEFAULT_SOURCES: PromptBarSource[] = [
  { key: 'files', name: 'Photos & files', description: 'Upload from this device', icon: Attachment01Icon, attach: true },
];

interface StudioPromptBarProps {
  engine: EngineChoice;
  onEngineChange: (engine: EngineChoice) => void;
  placeholder: string;
  /** The AI is working; the send tile turns into Stop. */
  busy: boolean;
  /** The studio decides when there is enough to send (a template's details, attached material). */
  canSend?: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  /** The attach row: the studio's own picker (its files show as the studio's chips). */
  onAttach?: () => void | Promise<void>;
  /** Controlled draft: the studio's own prompt state. */
  draft?: string;
  onDraftChange?: (text: string) => void;
  /** The field's label for screen readers. */
  inputLabel?: string;
  /** Rows of the @ menu; the files row by default. */
  sources?: PromptBarSource[];
  /** Studio controls in the bar row (size, style, options…). */
  extras?: ReactNode;
  /** Files pasted into the field (a screenshot on the clipboard, for instance). */
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  background?: string;
  color?: string;
  menuBackground?: string;
  sparkColor?: string;
  width?: number | string;
  autoFocus?: boolean;
}

export const StudioPromptBar: React.FC<StudioPromptBarProps> = ({
  engine,
  onEngineChange,
  placeholder,
  busy,
  canSend,
  onSend,
  onStop,
  onAttach,
  draft,
  onDraftChange,
  inputLabel,
  sources = DEFAULT_SOURCES,
  extras,
  onPaste,
  background = 'var(--bg-primary)',
  color = 'var(--text-primary)',
  menuBackground = 'color-mix(in oklab, var(--bg-primary) 92%, var(--text-primary))',
  sparkColor = 'var(--accent)',
  width = 720,
  autoFocus,
}) => {
  const [engines, setEngines] = useState<WritingEngineInfo[] | null>(null);
  const [modelsByEngine, setModelsByEngine] = useState<Partial<Record<WritingEngineId, WritingModelInfo[]>>>({});

  useEffect(() => {
    let alive = true;
    listWritingEngines().then((list) => { if (alive) setEngines(list); }).catch(() => { if (alive) setEngines([]); });
    return () => { alive = false; };
  }, []);

  const keepModels = useCallback((id: WritingEngineId, models: WritingModelInfo[]): void => {
    if (models.length === 0) return;
    setModelsByEngine((current) => (current[id] ? current : { ...current, [id]: models }));
  }, []);

  // The chosen engine's models first; the others follow a moment later, one by
  // one, so the picker knows every installed engine without delaying the field.
  useEffect(() => {
    void listEngineModels(engine.engine).then((models) => keepModels(engine.engine, models));
  }, [engine.engine, keepModels]);

  useEffect(() => {
    if (!engines) return undefined;
    const rest = engines.filter((entry) => entry.installed && entry.engine !== engine.engine).map((entry) => entry.engine);
    if (rest.length === 0) return undefined;
    let alive = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const id of rest) {
          const models = await listEngineModels(id).catch((): WritingModelInfo[] => []);
          if (!alive) return;
          keepModels(id, models);
        }
      })();
    }, 1200);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [engines, engine.engine, keepModels]);

  const installed = useMemo(() => {
    const list = (engines ?? []).filter((entry) => entry.installed);
    return list.length > 0 ? list : engines ?? [];
  }, [engines]);

  const engineName = useMemo(() => new Map((engines ?? []).map((entry) => [entry.engine, entry.displayName])), [engines]);

  /** One row per engine (CLI default) and per model; the key carries both. */
  const rows = useMemo<PromptBarModel[]>(() => {
    const out: PromptBarModel[] = [];
    const seen = new Set<string>();
    const add = (key: string, name: string, tag?: string): void => {
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ key, name, tag });
    };
    for (const entry of installed) {
      add(`${entry.engine}::`, entry.displayName, 'CLI default');
      for (const model of modelsByEngine[entry.engine] ?? []) {
        add(`${entry.engine}::${model.id}`, model.label, model.connected ? entry.displayName : `${entry.displayName} · not signed in`);
      }
    }
    // A model the CLI no longer lists (or one typed by hand) stays selectable.
    add(`${engine.engine}::${engine.model}`, engine.model || (engineName.get(engine.engine) ?? engine.engine), engineName.get(engine.engine) ?? engine.engine);
    return out;
  }, [installed, modelsByEngine, engine.engine, engine.model, engineName]);

  const currentModels = modelsByEngine[engine.engine] ?? [];
  const effortIds = effortOptions(currentModels, engine.model);
  const effortKey = effortIds.join('|');
  const efforts = useMemo(
    () => (effortIds.length > 0 ? ['Default', ...effortIds.map(effortLabel)] : []),
    // The list is stable while its steps are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effortKey],
  );

  const handleModel = (key: string): void => {
    const [id, model = ''] = key.split('::');
    if (id === engine.engine && model === engine.model) return;
    // Another model takes its own effort levels; start from the CLI's default.
    onEngineChange({ ...engine, engine: id as WritingEngineId, model, effort: '' });
  };

  const handleEffort = (label: string): void => {
    const id = label === 'Default' ? '' : effortIds.find((entry) => effortLabel(entry) === label) ?? '';
    if (id === (engine.effort ?? '')) return;
    onEngineChange({ ...engine, effort: id });
  };

  // A saved level the chosen model does not accept would make the CLI fail.
  useEffect(() => {
    if (engine.effort && effortIds.length > 0 && !effortIds.includes(engine.effort)) onEngineChange({ ...engine, effort: '' });
    // The steps change with the model; the effect only reacts to that list and the stored level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.effort, effortKey]);

  return (
    <PromptBar
      placeholder={placeholder}
      sources={sources}
      commands={[]}
      models={rows}
      defaultModel={`${engine.engine}::${engine.model}`}
      onModelChange={handleModel}
      efforts={efforts}
      defaultEffort={engine.effort ? effortLabel(engine.effort) : 'Default'}
      onEffortChange={handleEffort}
      busy={busy}
      canSend={canSend}
      onSend={(text) => onSend(text)}
      onStop={onStop}
      onAttach={onAttach}
      draft={draft}
      onDraftChange={onDraftChange}
      inputLabel={inputLabel}
      extras={extras}
      autoFocus={autoFocus}
      onPaste={onPaste}
      background={background}
      color={color}
      menuBackground={menuBackground}
      sparkColor={sparkColor}
      width={width}
    />
  );
};
