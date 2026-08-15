import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import './LineSidebar.css';

export type LineSidebarItemStatus = 'pending' | 'in_progress' | 'completed';
export type LineSidebarItem = string | { label: string; status?: LineSidebarItemStatus };

type Falloff = 'linear' | 'smooth' | 'sharp';

const FALLOFF_CURVES: Record<Falloff, (p: number) => number> = {
  linear: (p) => p,
  smooth: (p) => p * p * (3 - 2 * p),
  sharp: (p) => p * p * p,
};

const DEFAULT_ITEMS: LineSidebarItem[] = [
  'Overview',
  'Components',
  'Animations',
  'Backgrounds',
  'Showcase',
  'Playground',
  'Templates',
  'Changelog',
  'Community',
  'Resources',
  'Documentation',
  'Support',
];

interface LineSidebarProps {
  items: LineSidebarItem[];
  accentColor?: string;
  textColor?: string;
  markerColor?: string;
  showIndex?: boolean;
  showMarker?: boolean;
  proximityRadius?: number;
  maxShift?: number;
  falloff?: Falloff;
  markerLength?: number;
  markerGap?: number;
  tickScale?: number;
  scaleTick?: boolean;
  itemGap?: number;
  fontSize?: number;
  smoothing?: number;
  defaultActive?: number | null;
  /** Plays a staggered fade/slide entrance on mount. */
  animateIn?: boolean;
  onItemClick?: (index: number, label: string) => void;
  className?: string;
}

/**
 * LineSidebar (React Bits) — a vertical list with leading marker lines and a
 * cursor-proximity response. Each item eases its --effect value (driving
 * color, shift and scale) through a single rAF loop so everything stays in
 * step. Extended with per-item `status` (completed tasks render muted with a
 * green check) and an optional staggered mount animation.
 */
export const LineSidebar: React.FC<LineSidebarProps> = ({
  items = DEFAULT_ITEMS,
  accentColor = '#A855F7',
  textColor = '#c4c4c4',
  markerColor = '#6c6c6c',
  showIndex = true,
  showMarker = true,
  proximityRadius = 100,
  maxShift = 30,
  falloff = 'smooth',
  markerLength = 60,
  markerGap = 0,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 20,
  fontSize = 1.1,
  smoothing = 100,
  defaultActive = null,
  animateIn = false,
  onItemClick,
  className = '',
}) => {
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const targetsRef = useRef<number[]>([]);
  const currentRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const activeRef = useRef<number | null>(defaultActive);
  const smoothingRef = useRef(smoothing);
  const [activeIndex, setActiveIndex] = useState<number | null>(defaultActive);

  activeRef.current = activeIndex;
  smoothingRef.current = smoothing;

  // Single rAF loop that eases every item's --effect toward its target using
  // frame-rate independent exponential smoothing, so color, shift and scale
  // all move together without staggering CSS transitions.
  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const tau = Math.max(smoothingRef.current, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);
    let moving = false;
    const els = itemRefs.current;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!el) continue;
      const target = Math.max(targetsRef.current[i] || 0, activeRef.current === i ? 1 : 0);
      const cur = currentRef.current[i] || 0;
      const next = cur + (target - cur) * k;
      const settled = Math.abs(target - next) < 0.0015;
      const value = settled ? target : next;
      currentRef.current[i] = value;
      el.style.setProperty('--effect', value.toFixed(4));
      if (!settled) moving = true;
    }
    rafRef.current = moving ? requestAnimationFrame(runFrame) : null;
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const list = listRef.current;
      if (!list) return;
      const rect = list.getBoundingClientRect();
      const pointerY = e.clientY - rect.top;
      const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear;
      const els = itemRefs.current;
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el) continue;
        const center = el.offsetTop + el.offsetHeight / 2;
        const distance = Math.abs(pointerY - center);
        targetsRef.current[i] = ease(Math.max(0, 1 - distance / proximityRadius));
      }
      startLoop();
    },
    [falloff, proximityRadius, startLoop]
  );

  const handlePointerLeave = useCallback(() => {
    targetsRef.current = targetsRef.current.map(() => 0);
    startLoop();
  }, [startLoop]);

  const handleClick = useCallback(
    (index: number, label: string) => {
      setActiveIndex(index);
      onItemClick?.(index, label);
    },
    [onItemClick]
  );

  // Keep the "active" item in sync when the todo list changes (a newly
  // in-progress todo becomes the accent-highlighted entry).
  useEffect(() => {
    setActiveIndex(defaultActive);
  }, [defaultActive]);

  useEffect(() => {
    startLoop();
  }, [activeIndex, startLoop]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    []
  );

  const navStyle = {
    '--accent-color': accentColor,
    '--text-color': textColor,
    '--marker-color': markerColor,
    '--marker-length': `${markerLength}px`,
    '--marker-gap': `${markerGap}px`,
    '--tick-scale': tickScale,
    '--max-shift': `${maxShift}px`,
    '--item-gap': `${itemGap}px`,
    '--font-size': `${fontSize}rem`,
    '--smoothing': `${smoothing}ms`,
  } as CSSProperties;

  return (
    <nav
      className={`line-sidebar${showMarker ? ' line-sidebar--markers' : ''}${scaleTick ? ' line-sidebar--scale-tick' : ''}${animateIn ? ' line-sidebar--animate-in' : ''}${className ? ` ${className}` : ''}`}
      style={navStyle}
    >
      <ul
        ref={listRef}
        className="line-sidebar__list"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {items.map((item, index) => {
          const label = typeof item === 'string' ? item : item.label;
          const status = typeof item === 'string' ? undefined : item.status;
          const done = status === 'completed';
          return (
            <li
              key={`${label}-${index}`}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className={`line-sidebar__item${done ? ' line-sidebar__item--done' : ''}`}
              style={{ '--item-index': index } as CSSProperties}
              aria-current={activeIndex === index ? 'true' : undefined}
              onClick={() => handleClick(index, label)}
            >
              {showMarker && <span className="line-sidebar__marker" aria-hidden="true" />}
              <span className="line-sidebar__label">
                {showIndex && <span className="line-sidebar__index">{String(index + 1).padStart(2, '0')}</span>}
                {done && (
                  <span className="line-sidebar__done-icon" aria-hidden="true">
                    ✓
                  </span>
                )}
                <span className="line-sidebar__text">{label}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default LineSidebar;
