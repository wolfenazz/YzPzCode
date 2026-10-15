import React from 'react';
import { ArrowsClockwise, Sparkle } from '@phosphor-icons/react';
import { defaultValues, normalizeValues, type TweakValue } from '../../utils/design/tweaks';
import type { Board } from '../../utils/design/types';
import { useLiveEdit } from './useLiveEdit';
import { LiquidSlider } from '../common/LiquidSlider';

interface TweaksPanelProps {
  workspaceId: string;
  board: Board;
  busy: boolean;
  /** Ask the AI to add or revise the board's tweaks. */
  onAskForTweaks: (boardId: string) => void;
}

/** The controls the AI offered for a screen. They repaint the board at once; nothing is sent to the AI. */
export const TweaksPanel: React.FC<TweaksPanelProps> = ({ workspaceId, board, busy, onAskForTweaks }) => {
  const { live, commit, settle } = useLiveEdit(workspaceId);
  const tweaks = board.tweaks ?? [];
  const values = normalizeValues(tweaks, board.tweakValues);

  const write = (id: string, value: TweakValue, immediate: boolean): void => {
    const change = (project: Parameters<Parameters<typeof live>[0]>[0]) => ({
      ...project,
      boards: project.boards.map((entry) => {
        if (entry.id !== board.id || !entry.tweaks) return entry;
        return { ...entry, tweakValues: normalizeValues(entry.tweaks, { ...entry.tweakValues, [id]: value }) };
      }),
    });
    if (immediate) commit(change);
    else live(change);
  };

  const reset = (): void => {
    commit((project) => ({
      ...project,
      boards: project.boards.map((entry) => (entry.id === board.id && entry.tweaks ? { ...entry, tweakValues: defaultValues(entry.tweaks) } : entry)),
    }));
  };

  if (tweaks.length === 0) {
    return (
      <div className="dz-tweaks">
        <div className="dz-section__heading">Tweaks</div>
        <p className="dz-note">Tweaks are a few controls for this screen (a layout, density, a section shown or hidden) that repaint it at once, with no AI call.</p>
        <div className="dz-actions">
          <button type="button" className="dz-btn dz-btn--sm" disabled={busy || !board.source} onClick={() => onAskForTweaks(board.id)}><Sparkle size={13} /> Add tweaks with AI</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dz-tweaks">
      <div className="dz-section__heading">Tweaks</div>
      {tweaks.map((tweak) => {
        const value = values[tweak.id];
        if (tweak.type === 'select') {
          return (
            <label key={tweak.id} className="dz-field">
              <span dir="auto">{tweak.label}</span>
              <select className="dz-select" value={String(value)} disabled={busy} onChange={(event) => write(tweak.id, event.target.value, true)}>
                {(tweak.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          );
        }
        if (tweak.type === 'toggle') {
          return (
            <label key={tweak.id} className="dz-field">
              <span dir="auto">{tweak.label}</span>
              <input type="checkbox" checked={Boolean(value)} disabled={busy} onChange={(event) => write(tweak.id, event.target.checked, true)} />
            </label>
          );
        }
        return (
          <label key={tweak.id} className="dz-field">
            <span dir="auto">{tweak.label} {Math.round((value as number) * 100) / 100}{tweak.unit}</span>
            <LiquidSlider
              min={tweak.min}
              max={tweak.max}
              step={tweak.step}
              value={value as number}
              disabled={busy}
              onChange={(event) => write(tweak.id, Number(event.target.value), false)}
              onPointerUp={settle}
              onKeyUp={settle}
            />
          </label>
        );
      })}
      <div className="dz-actions">
        <button type="button" className="dz-btn dz-btn--sm" disabled={busy} onClick={reset}><ArrowsClockwise size={13} /> Reset</button>
        <button type="button" className="dz-btn dz-btn--sm" disabled={busy} title="Ask the AI to revise these controls" onClick={() => onAskForTweaks(board.id)}><Sparkle size={13} /> Revise with AI</button>
      </div>
    </div>
  );
};
