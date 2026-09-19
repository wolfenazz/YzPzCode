import { useContext, useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, SquaresFour } from '@phosphor-icons/react';
import { TerminalLayoutContext } from './TerminalLayoutContext';
import { getTerminalLayoutRects, TERMINAL_LAYOUT_PRESETS } from '../../utils/terminalLayouts';
import type { TerminalSession } from '../../types';
import type { TerminalLayoutPreset } from '../../utils/terminalLayouts';

function LayoutThumbnail({ preset }: { preset: TerminalLayoutPreset }): React.JSX.Element {
  return (
    <svg viewBox="0 0 84 48" className="h-11 w-full" aria-hidden="true">
      {getTerminalLayoutRects(preset, 4, 0).map((rect, index) => (
        <rect key={index} x={rect.x * 84 + 2} y={rect.y * 48 + 2}
          width={rect.width * 84 - 4} height={rect.height * 48 - 4} rx="2"
          fill="currentColor" fillOpacity={preset.startsWith('focus-') && index === 0 ? 0.5 : 0.12}
          stroke="currentColor" strokeOpacity="0.6" strokeWidth="0.8" />
      ))}
    </svg>
  );
}

export function TerminalLayoutPicker({ session }: { session: TerminalSession }): React.JSX.Element | null {
  const layout = useContext(TerminalLayoutContext);
  const [open, setOpen] = useState(false);
  if (!layout) return null;

  return (
    <div className="shrink-0" onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className="app-icon-button h-5 w-5 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] data-[state=open]:text-[var(--accent)]"
            title="Organize terminals" aria-label={`Organize terminals from TTY:${session.index + 1}`}>
            <SquaresFour size={13} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="bottom" align="end" sideOffset={8} collisionPadding={12}
            aria-label="Terminal organization presets"
            className="z-[100] w-[368px] max-w-[calc(100vw-24px)] rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 text-[var(--text-primary)] shadow-[var(--shadow-float)] outline-none">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Organize terminals</span>
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">TTY:{session.index + 1}</span>
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Layout presets">
              {TERMINAL_LAYOUT_PRESETS.map(({ id, label }) => {
                const selected = layout.preset === id && (!id.startsWith('focus-') || layout.focusedSessionId === session.id);
                return (
                  <button key={id} type="button" aria-pressed={selected}
                    onClick={() => { layout.selectPreset(id, session.id); setOpen(false); }}
                    className={`relative flex cursor-pointer flex-col gap-1 rounded-md border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${selected
                      ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]'}`}>
                    <LayoutThumbnail preset={id} />
                    <span className="text-[10px] font-medium">{label}</span>
                    {selected && <Check size={11} weight="bold" className="absolute bottom-2 right-2" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <p className="mb-0 mt-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              Focus presets enlarge TTY:{session.index + 1} and keep the other terminals in a smaller strip. Choose Balanced to restore the grid.
            </p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
