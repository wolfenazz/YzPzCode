// Adapted from React Bits ClickSpark-TS-TW, retrieved through its registry.
// https://reactbits.dev/animations/click-spark (MIT + Commons Clause; see LICENSE.md)
// Changes: the spark color follows the theme (`currentColor` of the canvas), the
// frame loop only runs while sparks are alive, and `disabled` skips drawing.
import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent, PropsWithChildren } from 'react';

interface ClickSparkProps extends PropsWithChildren {
  className?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  disabled?: boolean;
}

interface Spark { x: number; y: number; angle: number; startTime: number }

export default function ClickSpark({
  children,
  className = '',
  sparkSize = 8,
  sparkRadius = 16,
  sparkCount = 8,
  duration = 420,
  disabled = false,
}: ClickSparkProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<Spark[]>([]);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const resize = (): void => {
      const { width, height } = parent.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    return () => {
      observer.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const draw = useCallback((timestamp: number): void => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = getComputedStyle(canvas).color;
    context.lineWidth = 1.5;
    context.lineCap = 'round';
    sparks.current = sparks.current.filter((spark) => {
      const progress = (timestamp - spark.startTime) / duration;
      if (progress >= 1) return false;
      const eased = progress * (2 - progress);
      const distance = eased * sparkRadius;
      const length = sparkSize * (1 - eased);
      context.globalAlpha = 1 - eased * 0.6;
      context.beginPath();
      context.moveTo(spark.x + distance * Math.cos(spark.angle), spark.y + distance * Math.sin(spark.angle));
      context.lineTo(spark.x + (distance + length) * Math.cos(spark.angle), spark.y + (distance + length) * Math.sin(spark.angle));
      context.stroke();
      return true;
    });
    frame.current = sparks.current.length > 0 ? requestAnimationFrame(draw) : null;
  }, [duration, sparkRadius, sparkSize]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const canvas = canvasRef.current;
    if (disabled || !canvas || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const now = performance.now();
    for (let i = 0; i < sparkCount; i++) {
      sparks.current.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, angle: (2 * Math.PI * i) / sparkCount, startTime: now });
    }
    if (frame.current === null) frame.current = requestAnimationFrame(draw);
  };

  return (
    <div className={`relative ${className}`} onPointerDown={handlePointerDown}>
      {children}
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 h-full w-full text-[var(--text-secondary)]" />
    </div>
  );
}
