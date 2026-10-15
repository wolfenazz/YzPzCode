import { useCallback } from 'react';
import { useDesignStore, DESIGN_LANGUAGES } from '../../stores/designStore';
import type { WritingEngineId } from '../../utils/writing/types';
import { EngineChoiceGrid } from './EngineChoiceGrid';

/** Setup step for a design workspace: which AI designs, and the language its text is written in. */
export function DesignSetupSection(): React.JSX.Element {
  const defaultEngine = useDesignStore((state) => state.defaultEngine);
  const setDefaultEngine = useDesignStore((state) => state.setDefaultEngine);
  const language = useDesignStore((state) => state.language);
  const setPreference = useDesignStore((state) => state.setPreference);
  const pickEngine = useCallback((engine: WritingEngineId) => {
    const current = useDesignStore.getState().defaultEngine;
    if (current.engine !== engine) setDefaultEngine({ ...current, engine, model: '', effort: '' });
  }, [setDefaultEngine]);

  return (
    <div className="space-y-5">
      <EngineChoiceGrid
        value={defaultEngine.engine}
        onChange={pickEngine}
        label="Design AI"
        streamingHint={(streaming) => (streaming === 'token' ? 'screens appear as they are drawn' : 'screens arrive as a whole')}
        help="You describe an app, a website or a graphic; the AI designs a system and draws every screen or banner on one canvas. It runs your installed CLI in the background with no tools and no access to the project. Claude Code and Codex can also look at pictures."
      />

      <div>
        <span className="ws-label">Write in</span>
        <div className="ws-chips" aria-label="Design language">
          {DESIGN_LANGUAGES.map((value) => (
            <button key={value} type="button" className="ws-chip" aria-pressed={language === value} onClick={() => setPreference('language', value)}>
              {value === 'auto' ? 'Same as the description' : value}
            </button>
          ))}
        </div>
        <p className="ws-help">Arabic, Hebrew, Persian and Urdu designs are laid out right to left.</p>
      </div>
    </div>
  );
}
