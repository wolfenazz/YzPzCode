import React, { useRef, useEffect } from 'react';

interface HelpTooltipProps {
  text: string;
  position?: 'top' | 'bottom';
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ text, position = 'top' }) => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    containerRef.current?.classList.add('help-active');
  };

  const hide = () => {
    timeoutRef.current = setTimeout(() => {
      containerRef.current?.classList.remove('help-active');
    }, 100);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) {
        el.classList.remove('help-active');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex help-tip"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          containerRef.current?.classList.toggle('help-active');
        }}
        className="w-4 h-4 flex items-center justify-center text-[10px] font-mono font-bold text-zinc-600 border border-zinc-700 rounded-sm bg-zinc-900 hover:text-zinc-300 hover:border-zinc-500 transition-colors duration-150 cursor-pointer leading-none"
        aria-label="Help"
      >
        ?
      </button>
      <div
        className={`absolute z-50 w-64 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-sm shadow-xl font-mono text-xs text-zinc-300 leading-relaxed invisible opacity-0 transition-all duration-150 ease-out pointer-events-none ${
          position === 'top'
            ? 'bottom-full left-1/2 -translate-x-1/2 mb-2 translate-y-1'
            : 'top-full left-1/2 -translate-x-1/2 mt-2 -translate-y-1'
        }`}
      >
        <div className={`absolute w-2 h-2 bg-zinc-900 border border-zinc-700 transform rotate-45 ${
          position === 'top'
            ? 'top-full left-1/2 -translate-x-1/2 -mt-1 border-t-0 border-l-0'
            : 'bottom-full left-1/2 -translate-x-1/2 -mb-1 border-b-0 border-r-0'
        }`} />
        {text}
      </div>
    </div>
  );
};
