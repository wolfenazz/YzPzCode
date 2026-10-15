import React, { useEffect, useRef, useState } from 'react';
import './generation-aura.css';

/** How long the finish animation stays before the aura clears. */
const DONE_MS = 2600;
/** How long the working ring keeps fading out once the run ends. */
const FADE_MS = 700;

export interface GenerationAuraProps {
  /** The content behind the aura is being generated. */
  active: boolean;
  /** The run ended without a result (failed or stopped): fade out, no finish animation. */
  failed?: boolean;
  /** The host's corner radius, as a CSS length or a number of px. */
  radius?: number | string;
  /** Multiplies every size; use `1 / zoom` on a zoomed canvas so the ring keeps its screen size. */
  scale?: number;
  /**
   * Draw the ring inside the host's bounds instead of just outside them. For hosts
   * that clip (`overflow: hidden`) or have no room around them, such as thumbnails.
   */
  inside?: boolean;
  /** Show the little check badge when finished (default true). */
  badge?: boolean;
  /** Smaller badge for thumbnails. */
  compact?: boolean;
}

type Phase = 'idle' | 'busy' | 'done';

const Badge: React.FC = () => (
  <span className="sx-gen__badge">
    <span className="sx-gen__spark sx-gen__spark--1" />
    <span className="sx-gen__spark sx-gen__spark--2" />
    <span className="sx-gen__spark sx-gen__spark--3" />
    <span className="sx-gen__spark sx-gen__spark--4" />
    <svg className="sx-gen__check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="sx-gen__check-disc" cx="12" cy="12" r="11" />
      <path d="m7.4 12.5 3.1 3.1 6.1-6.7" pathLength={1} />
    </svg>
  </span>
);

/**
 * A soft Gemini-colored ring that travels around its host while the host's
 * content is being generated, then a short emerald "done" moment: the ring
 * bounces outward, a comet runs round it and a small check pops in with
 * sparkles. Place it as the host's first child (the host needs `position:
 * relative` and, for the outside ring to sit behind content, `isolation:
 * isolate`). It paints nothing while idle and mounts its layers only while
 * needed.
 */
export const GenerationAura: React.FC<GenerationAuraProps> = ({
  active,
  failed = false,
  radius = 6,
  scale = 1,
  inside = false,
  badge = true,
  compact = false,
}) => {
  const [phase, setPhase] = useState<Phase>(active ? 'busy' : 'idle');
  const [pulse, setPulse] = useState(0);
  const [mounted, setMounted] = useState(active);
  const wasActive = useRef(active);

  useEffect(() => {
    if (active) {
      setPhase('busy');
      setMounted(true);
    } else if (wasActive.current) {
      setPhase('done');
      setPulse((value) => value + 1);
    }
    wasActive.current = active;
  }, [active]);

  // A failure that is reported just after the run ended cancels the finish.
  const shown: Phase = failed && phase === 'done' ? 'idle' : phase;

  useEffect(() => {
    if (phase !== 'done') return undefined;
    const timer = setTimeout(() => setPhase('idle'), DONE_MS);
    return () => clearTimeout(timer);
  }, [phase, pulse]);

  useEffect(() => {
    if (shown === 'busy' || shown === 'done') {
      setMounted(true);
      return undefined;
    }
    const timer = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!mounted) return null;

  const style = {
    '--ga-k': scale,
    '--ga-r': typeof radius === 'number' ? `${radius}px` : radius,
  } as React.CSSProperties;

  return (
    <div className="sx-gen" data-phase={shown} data-inside={inside || undefined} data-compact={compact || undefined} style={style} aria-hidden="true">
      <div className="sx-gen__glow">
        <div className="sx-gen__band sx-gen__band--glow">
          <span className="sx-gen__spin" />
        </div>
      </div>
      <div className="sx-gen__band sx-gen__band--ring">
        <span className="sx-gen__spin" />
      </div>
      {shown === 'done' && (
        <React.Fragment key={pulse}>
          <div className="sx-gen__burst" />
          <div className="sx-gen__band sx-gen__band--done">
            <span className="sx-gen__comet" />
          </div>
          {badge && <Badge />}
        </React.Fragment>
      )}
    </div>
  );
};
