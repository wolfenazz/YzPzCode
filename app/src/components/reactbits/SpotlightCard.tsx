// Adapted from React Bits SpotlightCard-TS-TW, retrieved through its registry MCP.
// https://reactbits.dev/components/spotlight-card (MIT + Commons Clause; see LICENSE.md)
import { useRef } from 'react';
import type { PointerEvent, PropsWithChildren } from 'react';

interface SpotlightCardProps extends PropsWithChildren {
  className?: string;
  spotlightColor?: string;
  disabled?: boolean;
}

export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
  disabled = false,
}: SpotlightCardProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled || event.pointerType === 'touch' || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    // Updating only the overlay avoids rerendering the workspace on pointer movement.
    ref.current.style.setProperty('--spotlight-background', `radial-gradient(350px circle at ${event.clientX - rect.left}px ${event.clientY - rect.top}px, ${spotlightColor}, transparent 80%)`);
  };

  return (
    <div ref={ref} onPointerMove={handlePointerMove}
      className={`group/spotlight relative isolate overflow-hidden ${className}`}>
      {!disabled && <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[image:var(--spotlight-background)] opacity-0 transition-opacity duration-500 group-hover/spotlight:opacity-100 motion-reduce:transition-none" />}
      {children}
    </div>
  );
}
