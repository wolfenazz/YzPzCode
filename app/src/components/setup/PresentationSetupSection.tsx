import { useCallback } from 'react';
import { usePresentationStore } from '../../stores/presentationStore';
import { MAX_SLIDES, MIN_SLIDES } from '../../utils/presentation/deck';
import { DECK_THEMES } from '../../utils/presentation/themes';
import type { WritingEngineId } from '../../utils/writing/types';
import { EngineChoiceGrid } from './EngineChoiceGrid';

/** Setup step for a presentation workspace: which AI builds decks, and how they start. */
export function PresentationSetupSection(): React.JSX.Element {
  const defaultEngine = usePresentationStore((state) => state.defaultEngine);
  const setDefaultEngine = usePresentationStore((state) => state.setDefaultEngine);
  const themeId = usePresentationStore((state) => state.defaultThemeId);
  const slideCount = usePresentationStore((state) => state.defaultSlideCount);
  const openWizardOnStart = usePresentationStore((state) => state.openWizardOnStart);
  const setPreference = usePresentationStore((state) => state.setPreference);
  const pickEngine = useCallback((engine: WritingEngineId) => {
    const current = usePresentationStore.getState().defaultEngine;
    if (current.engine !== engine) setDefaultEngine({ ...current, engine, model: '' });
  }, [setDefaultEngine]);
  const theme = DECK_THEMES.find((entry) => entry.id === themeId) ?? DECK_THEMES[0];

  return (
    <div className="space-y-5">
      <EngineChoiceGrid
        value={defaultEngine.engine}
        onChange={pickEngine}
        label="Presenter AI"
        streamingHint={(streaming) => (streaming === 'token' ? 'slides appear one by one' : 'slides arrive a batch at a time')}
        help="The AI runs your installed CLI in the background with no tools and no access to the project. It writes the content as structured slides; the studio does the design, so every deck looks consistent whichever model wrote it."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ws-deck-theme" className="ws-label">Default theme</label>
          <select id="ws-deck-theme" className="ws-input" value={themeId} onChange={(event) => setPreference('defaultThemeId', event.target.value)}>
            {DECK_THEMES.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
          <div className="ws-deck-swatches" aria-hidden="true">
            {[theme.palette.background, theme.palette.accent1, theme.palette.accent2, theme.palette.accent3].map((color, index) => <span key={index} style={{ background: color }} />)}
            <span className="ws-deck-swatches__font">{theme.headingFont} / {theme.bodyFont}</span>
          </div>
        </div>
        <div>
          <label htmlFor="ws-deck-count" className="ws-label">Default length · {slideCount} slides</label>
          <input id="ws-deck-count" type="range" className="ws-range" min={MIN_SLIDES} max={MAX_SLIDES} value={slideCount} onChange={(event) => setPreference('defaultSlideCount', Number(event.target.value))} />
          <p className="ws-help">Each deck can change this in the wizard.</p>
        </div>
      </div>

      <div className="ws-switch-row">
        <div>
          <div className="ws-switch-row__title" id="ws-deck-wizard-label">Start with a new presentation</div>
          <div className="ws-switch-row__desc">Open the presentation wizard straight away when the workspace has no decks yet.</div>
        </div>
        <button type="button" role="switch" className="ws-switch" aria-labelledby="ws-deck-wizard-label" aria-checked={openWizardOnStart}
          onClick={() => setPreference('openWizardOnStart', !openWizardOnStart)} />
      </div>
    </div>
  );
}
