import React, { useState, useCallback } from 'react';

interface ThemeToggleButtonProps {
  theme: 'dark' | 'light';
  onToggle: () => void;
}

export const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({ theme, onToggle }) => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setRipple({ x, y });
    setIsTransitioning(true);
    
    setTimeout(() => {
      onToggle();
    }, 100);
    
    setTimeout(() => {
      setRipple(null);
      setIsTransitioning(false);
    }, 400);
  }, [onToggle]);

  return (
    <button
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label="Toggle dark mode"
      onClick={handleClick}
      className="group/theme relative flex items-center justify-center w-8.5 h-8.5 rounded-lg hover:bg-zinc-800/80 transition-colors text-zinc-500 hover:text-zinc-100 overflow-hidden cursor-pointer"
      title="Switch Theme"
    >
      {ripple && (
        <span
          className="absolute rounded-full bg-current opacity-20 pointer-events-none animate-theme-ripple"
          style={{
            left: ripple.x - 30,
            top: ripple.y - 30,
            width: 60,
            height: 60,
          }}
        />
      )}
      
      <div className="relative w-4 h-4 transition-transform duration-300 group-hover/theme:scale-110 group-hover/theme:drop-shadow-[0_0_6px_rgba(161,161,170,0.4)]">
        <svg
          className={`absolute inset-0 w-4 h-4 transition-all duration-300 ${
            theme === 'dark' && !isTransitioning
              ? 'opacity-100 rotate-0 scale-100'
              : 'opacity-0 -rotate-90 scale-75'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
        
        <svg
          className={`absolute inset-0 w-4 h-4 transition-all duration-300 ${
            theme === 'light' && !isTransitioning
              ? 'opacity-100 rotate-0 scale-100'
              : 'opacity-0 rotate-90 scale-75'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="4" strokeWidth={2} />
          <path strokeLinecap="round" strokeWidth={2} d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      </div>
    </button>
  );
};
