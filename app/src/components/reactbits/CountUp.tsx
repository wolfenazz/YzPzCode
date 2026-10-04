// Adapted from React Bits CountUp-TS-TW, retrieved through its registry MCP.
// https://reactbits.dev/text-animations/count-up (MIT + Commons Clause; see LICENSE.md)
import { useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface CountUpProps {
  to: number;
  className?: string;
  disabled?: boolean;
}

export default function CountUp({ to, className, disabled = false }: CountUpProps): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const initialValue = useRef(to);
  const reduceMotion = useReducedMotion();
  const value = useMotionValue(to);
  const spring = useSpring(value, { damping: 40, stiffness: 240 });
  const staticValue = disabled || reduceMotion;

  useEffect(() => {
    if (staticValue) {
      value.set(to);
      spring.jump(to);
      if (ref.current) ref.current.textContent = String(to);
    } else value.set(to);
  }, [to, staticValue, spring, value]);

  useEffect(() => spring.on('change', (latest) => {
    if (ref.current) ref.current.textContent = String(Math.round(latest));
  }), [spring]);

  return <span aria-hidden="true" className={className} ref={ref}>{initialValue.current}</span>;
}
