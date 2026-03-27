import React from 'react';

interface UtilizationBarProps {
  used: number;
  total: number;
  showLabel?: boolean;
  className?: string;
}

export const UtilizationBar: React.FC<UtilizationBarProps> = ({
  used,
  total,
  showLabel = true,
  className = '',
}) => {
  const percentage = total > 0 ? (used / total) * 100 : 0;
  const isFull = percentage >= 100;
  const isWarning = percentage >= 80 && percentage < 100;

  const getBarColor = () => {
    if (isFull) return '#f43f5e';
    if (isWarning) return '#f59e0b';
    return '#10b981';
  };

  const barColor = getBarColor();
  const segmentCount = total;
  const filledSegments = Math.min(used, total);

  return (
    <div className={`flex items-center gap-3 font-mono ${className}`}>
      <div className="flex-1 h-2 bg-zinc-900 overflow-hidden flex">
        {Array.from({ length: segmentCount }, (_, i) => (
          <div
            key={i}
            className={`h-full flex-1 transition-all duration-300 ${i < segmentCount - 1 ? 'border-r border-zinc-950' : ''}`}
            style={{
              backgroundColor: i < filledSegments ? barColor : 'transparent',
              opacity: i < filledSegments ? 1 : 0,
            }}
          />
        ))}
      </div>

      {showLabel && (
        <span className="text-[10px] text-zinc-500 min-w-max uppercase tracking-[0.2em] tabular-nums">
          {used}/{total}
          <span className="mx-1.5 text-zinc-700">|</span>
          <span className={`lowercase ${isFull ? 'text-rose-500' : isWarning ? 'text-amber-500' : 'text-emerald-500'}`}>
            {isFull ? 'full' : isWarning ? 'high' : used === 0 ? 'empty' : 'ok'}
          </span>
        </span>
      )}
    </div>
  );
};
