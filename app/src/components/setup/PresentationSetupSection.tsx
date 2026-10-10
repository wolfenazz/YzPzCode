import { useCallback } from 'react';
import { usePresentationStore } from '../../stores/presentationStore';
import type { WritingEngineId } from '../../utils/writing/types';
import { EngineChoiceGrid } from './EngineChoiceGrid';
import '../presentation/presentation.css';

/** Setup step for a presentation workspace: which AI designs the decks. */
export function PresentationSetupSection(): React.JSX.Element {
  const defaultEngine = usePresentationStore((state) => state.defaultEngine);
  const setDefaultEngine = usePresentationStore((state) => state.setDefaultEngine);
  const size = usePresentationStore((state) => state.defaultSize);
  const setPreference = usePresentationStore((state) => state.setPreference);
  const pickEngine = useCallback((engine: WritingEngineId) => {
    const current = usePresentationStore.getState().defaultEngine;
    if (current.engine !== engine) setDefaultEngine({ ...current, engine, model: '', effort: '' });
  }, [setDefaultEngine]);

  return (
    <div className="space-y-5">
      <EngineChoiceGrid
        value={defaultEngine.engine}
        onChange={pickEngine}
        label="Presenter AI"
        streamingHint={(streaming) => (streaming === 'token' ? 'slides appear one by one' : 'slides arrive a batch at a time')}
        help="You describe the presentation; the AI invents a design for that deck and draws every slide. It runs your installed CLI in the background with no tools and no access to the project. Claude Code and Codex can also look at the pictures you add."
      />

      <div>
        <span className="ws-label">Slide shape</span>
        <div className="ws-chips" aria-label="Slide shape">
          {(['16:9', '4:3'] as const).map((value) => (
            <button key={value} type="button" className="ws-chip" aria-pressed={size === value} onClick={() => setPreference('defaultSize', value)}>
              {value === '16:9' ? 'Widescreen 16:9' : 'Standard 4:3'}
            </button>
          ))}
        </div>
        <p className="ws-help">Each new deck can change this before it is designed.</p>
      </div>
    </div>
  );
}
