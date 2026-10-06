import { useContext, useState } from 'react';
import { Popover } from 'radix-ui';
import { ArrowsInSimple, ArrowsOutSimple, Check, SquaresFour } from '@phosphor-icons/react';
import { TerminalLayoutContext } from './TerminalLayoutContext';
import { getTerminalLayoutRects, isFocusPreset, TERMINAL_LAYOUT_PRESETS } from '../../utils/terminalLayouts';
import type { TerminalSession } from '../../types';
import type { TerminalLayoutPreset } from '../../utils/terminalLayouts';
import './terminal-grid.css';

const VIEW_W = 84;
const VIEW_H = 48;
/** Previews draw at most this many panes so the cells stay legible. */
const MAX_PREVIEW_PANES = 6;

/**
 * Miniature of a preset drawn with the workspace's real pane count, with the
 * pane the picker was opened from highlighted where it would land.
 */
export function LayoutThumbnail({ preset, count = 4, highlightIndex = 0, className = 'pane-arranger__thumb' }: {
  preset: TerminalLayoutPreset;
  count?: number;
  highlightIndex?: number;
  className?: string;
}): React.JSX.Element {
  const panes = Math.max(2, Math.min(count, MAX_PREVIEW_PANES));
  const focus = Math.min(highlightIndex, panes - 1);
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className={className} aria-hidden="true">
      {getTerminalLayoutRects(preset, panes, focus).map((rect, index) => {
        const strip = rect.minimized === true;
        // Mirror the grid: the maximize strip is header-thin, not a fifth of the height.
        const y = strip ? VIEW_H - 9 : rect.y * VIEW_H;
        const height = strip ? 9 : rect.maximized ? VIEW_H - 10 : rect.height * VIEW_H;
        return (
          <rect key={index} className={index === focus ? 'pane-arranger__cell pane-arranger__cell--self' : 'pane-arranger__cell'}
            x={rect.x * VIEW_W + 1.5} y={y + 1.5} width={Math.max(1, rect.width * VIEW_W - 3)} height={Math.max(1, height - 3)} rx="2.5" />
        );
      })}
    </svg>
  );
}

type LayoutPickerProps = { session: TerminalSession } | { panelId: string; panelName: string };

function usePaneIdentity(props: LayoutPickerProps): { paneId: string; paneLabel: string } {
  return 'session' in props
    ? { paneId: props.session.id, paneLabel: `TTY:${props.session.index + 1}` }
    : { paneId: props.panelId, paneLabel: props.panelName };
}

/** One-click maximize/restore for a pane; the other panes fold into a header strip. */
export function PaneMaximizeButton(props: LayoutPickerProps): React.JSX.Element | null {
  const { paneId, paneLabel } = usePaneIdentity(props);
  const layout = useContext(TerminalLayoutContext);
  if (!layout || layout.paneIds.length < 2) return null;
  const maximized = layout.preset === 'maximize' && layout.focusedSessionId === paneId;
  const Icon = maximized ? ArrowsInSimple : ArrowsOutSimple;

  return (
    <button type="button"
      className={`app-icon-button h-5 w-5 shrink-0 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] ${maximized ? 'text-[var(--accent)]' : ''}`}
      title={maximized ? 'Restore layout' : 'Maximize pane'}
      aria-label={maximized ? `Restore layout from ${paneLabel}` : `Maximize ${paneLabel}`} aria-pressed={maximized}
      onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); layout.toggleMaximize(paneId); }}>
      <Icon size={12} weight="bold" aria-hidden="true" />
    </button>
  );
}

const EVEN_PRESETS = TERMINAL_LAYOUT_PRESETS.filter(({ id }) => !isFocusPreset(id));
const FOCUS_PRESETS = TERMINAL_LAYOUT_PRESETS.filter(({ id }) => id.startsWith('focus-'));
const FOCUS_LABELS: Partial<Record<TerminalLayoutPreset, string>> = {
  'focus-left': 'Left', 'focus-right': 'Right', 'focus-top': 'Top', 'focus-bottom': 'Bottom',
};

export function TerminalLayoutPicker(props: LayoutPickerProps): React.JSX.Element | null {
  const { paneId, paneLabel } = usePaneIdentity(props);
  const layout = useContext(TerminalLayoutContext);
  const [open, setOpen] = useState(false);
  if (!layout) return null;

  const count = layout.paneIds.length;
  const selfIndex = Math.max(0, layout.paneIds.indexOf(paneId));
  const isSelected = (id: TerminalLayoutPreset): boolean =>
    layout.preset === id && (!isFocusPreset(id) || layout.focusedSessionId === paneId);
  const choose = (id: TerminalLayoutPreset): void => { layout.selectPreset(id, paneId); setOpen(false); };
  const maximized = isSelected('maximize');

  const renderOption = (id: TerminalLayoutPreset, label: string): React.JSX.Element => {
    const selected = isSelected(id);
    return (
      <button key={id} type="button" aria-pressed={selected} aria-label={isFocusPreset(id) ? `${label}: focus ${paneLabel}` : label}
        onClick={() => choose(id)} className="pane-arranger__option">
        <LayoutThumbnail preset={id} count={count} highlightIndex={isFocusPreset(id) ? selfIndex : Math.min(selfIndex, MAX_PREVIEW_PANES - 1)} />
        <span className="pane-arranger__label">
          {label}
          {selected && <Check size={10} weight="bold" aria-hidden="true" />}
        </span>
      </button>
    );
  };

  return (
    <div className="shrink-0" onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className="app-icon-button h-5 w-5 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] data-[state=open]:text-[var(--accent)]"
            title="Arrange panes" aria-label={`Arrange workspace panes from ${paneLabel}`}>
            <SquaresFour size={13} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="bottom" align="end" sideOffset={8} collisionPadding={12}
            aria-label="Workspace pane arrangement" className="pane-arranger">
            <header className="pane-arranger__header">
              <span className="pane-arranger__title">Arrange panes</span>
              <span className="pane-arranger__count">{count} {count === 1 ? 'pane' : 'panes'}</span>
            </header>

            <section className="pane-arranger__section" aria-labelledby="pane-arranger-even">
              <h3 id="pane-arranger-even" className="pane-arranger__heading">Even split</h3>
              <div className="pane-arranger__grid pane-arranger__grid--3" role="group" aria-labelledby="pane-arranger-even">
                {EVEN_PRESETS.map(({ id, label }) => renderOption(id, label))}
              </div>
            </section>

            <section className="pane-arranger__section" aria-labelledby="pane-arranger-focus">
              <h3 id="pane-arranger-focus" className="pane-arranger__heading">
                Focus <span className="pane-arranger__chip">{paneLabel}</span>
              </h3>
              <div className="pane-arranger__grid pane-arranger__grid--4" role="group" aria-labelledby="pane-arranger-focus">
                {FOCUS_PRESETS.map(({ id }) => renderOption(id, FOCUS_LABELS[id] ?? id))}
              </div>
              <button type="button" aria-pressed={maximized} disabled={count < 2}
                onClick={() => { layout.toggleMaximize(paneId); setOpen(false); }} className="pane-arranger__option pane-arranger__wide">
                <LayoutThumbnail preset="maximize" count={count} highlightIndex={selfIndex} className="pane-arranger__thumb pane-arranger__thumb--wide" />
                <span className="pane-arranger__wide-text">
                  <span className="pane-arranger__label">
                    {maximized ? <ArrowsInSimple size={12} weight="bold" aria-hidden="true" /> : <ArrowsOutSimple size={12} weight="bold" aria-hidden="true" />}
                    {maximized ? 'Restore previous layout' : `Maximize ${paneLabel}`}
                  </span>
                  <span className="pane-arranger__hint">
                    {maximized ? 'Bring every pane back to full size.' : 'Fills the workspace. Other panes fold to their headers; click one to swap it in.'}
                  </span>
                </span>
              </button>
            </section>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
