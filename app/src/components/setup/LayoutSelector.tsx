import { motion } from 'framer-motion';
import { Code } from '@phosphor-icons/react';
import ClickSpark from '../reactbits/ClickSpark';
import { getLayoutDimensions } from '../../utils/grid';
import { useSetupMotion } from './useSetupMotion';
import type { LayoutConfig } from '../../types';

interface LayoutSelectorProps {
  selectedLayout: LayoutConfig;
  onSelectLayout: (layout: LayoutConfig) => void;
}

// `sessions: 0` is the editor-only workspace, so it is named instead of counted.
const OPTIONS = [
  { sessions: 0, label: 'Editor', hint: 'No terminals' },
  { sessions: 1, label: '1 terminal', hint: 'Single' },
  { sessions: 2, label: '2 terminals', hint: 'Split' },
  { sessions: 4, label: '4 terminals', hint: '2 × 2' },
  { sessions: 6, label: '6 terminals', hint: '3 × 2' },
  { sessions: 8, label: '8 terminals', hint: '4 × 2' },
];

export function LayoutSelector({ selectedLayout, onSelectLayout }: LayoutSelectorProps): React.JSX.Element {
  const motionEnabled = useSetupMotion();
  return (
    <ClickSpark disabled={!motionEnabled}>
      <div className="ws-layouts" role="group" aria-label="Terminal layout">
        {OPTIONS.map(({ sessions, label, hint }) => {
          const selected = selectedLayout.sessions === sessions;
          const { cols } = getLayoutDimensions(sessions);
          return (
            <button key={sessions} type="button" className="ws-layout-tile" aria-pressed={selected}
              aria-label={sessions === 0 ? 'Editor only, no terminals' : `${label}, ${hint}`}
              // External launch only makes sense when terminals actually exist.
              onClick={() => onSelectLayout({ type: 'grid', sessions, openExternally: sessions > 0 && selectedLayout.openExternally })}>
              {selected && (
                <motion.span layoutId="ws-layout-selection" className="ws-layout-tile__bg" aria-hidden="true"
                  transition={motionEnabled ? { type: 'spring', stiffness: 520, damping: 40 } : { duration: 0 }} />
              )}
              {sessions === 0
                ? <Code size={22} aria-hidden="true" />
                : (
                  <span aria-hidden="true" className="ws-diagram" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {Array.from({ length: sessions }, (_, index) => <span key={index} style={{ transitionDelay: selected ? `${index * 30}ms` : '0ms' }} />)}
                  </span>
                )}
              <span className="ws-layout-tile__label">{sessions === 0 ? label : sessions}<span className="ws-layout-tile__hint">{hint}</span></span>
            </button>
          );
        })}
      </div>
    </ClickSpark>
  );
}
