import { useCallback } from 'react';
import { useSheetsStore, SHEETS_LANGUAGES } from '../../stores/sheetsStore';
import type { WritingEngineId } from '../../utils/writing/types';
import { EngineChoiceGrid } from './EngineChoiceGrid';

/** Setup step for a sheets workspace: which AI builds the workbooks and the language it answers in. */
export function SheetsSetupSection(): React.JSX.Element {
  const defaultEngine = useSheetsStore((state) => state.defaultEngine);
  const setDefaultEngine = useSheetsStore((state) => state.setDefaultEngine);
  const language = useSheetsStore((state) => state.language);
  const rtl = useSheetsStore((state) => state.newSheetsRtl);
  const setPreference = useSheetsStore((state) => state.setPreference);
  const pickEngine = useCallback((engine: WritingEngineId) => {
    const current = useSheetsStore.getState().defaultEngine;
    if (current.engine !== engine) setDefaultEngine({ ...current, engine, model: '', effort: '' });
  }, [setDefaultEngine]);

  return (
    <div className="space-y-5">
      <EngineChoiceGrid
        value={defaultEngine.engine}
        onChange={pickEngine}
        label="Sheets AI"
        streamingHint={(streaming) => (streaming === 'token' ? 'answers appear as they are written' : 'answers arrive as a whole')}
        help="You describe the workbook or attach a photo or file; the AI returns edits you review before they are kept. It runs your installed CLI in the background with no tools and no access to the project. Claude Code and Codex can also look at pictures."
      />

      <div>
        <span className="ws-label">Answer in</span>
        <div className="ws-chips" aria-label="Assistant language">
          {SHEETS_LANGUAGES.map((value) => (
            <button key={value} type="button" className="ws-chip" aria-pressed={language === value} onClick={() => setPreference('language', value)}>
              {value === 'auto' ? 'Same as the request' : value}
            </button>
          ))}
        </div>
        <p className="ws-help">Arabic, Hebrew, Persian and Urdu sheets are written right to left.</p>
      </div>

      <div className="ws-switch-row">
        <div>
          <div className="ws-switch-row__title" id="ws-sheets-rtl-label">Start new sheets right to left</div>
          <div className="ws-switch-row__desc">Column A sits at the right edge, like Excel's right-to-left sheets.</div>
        </div>
        <button type="button" role="switch" className="ws-switch" aria-labelledby="ws-sheets-rtl-label" aria-checked={rtl}
          onClick={() => setPreference('newSheetsRtl', !rtl)} />
      </div>
    </div>
  );
}
