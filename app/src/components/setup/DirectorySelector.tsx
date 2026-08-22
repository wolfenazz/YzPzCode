import React, { useState, useRef, useEffect } from 'react';
import { HelpTooltip } from '../common/HelpTooltip';
import { useAppStore } from '../../stores/appStore';

interface DirectorySelectorProps {
  selectedPath: string;
  onSelectDirectory: () => void;
  onSelectRecentDirectory: (path: string) => void;
  errorMessage?: string;
}

export const DirectorySelector: React.FC<DirectorySelectorProps> = ({
  selectedPath,
  onSelectDirectory,
  onSelectRecentDirectory,
  errorMessage,
}) => {
  const { recentDirectories, clearRecentDirectories } = useAppStore();
  const [showRecent, setShowRecent] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowRecent(false);
      }
    };
    if (showRecent) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRecent]);

  const handleSelectRecent = (path: string) => {
    onSelectRecentDirectory(path);
    setShowRecent(false);
  };

  const pathSegments = selectedPath ? selectedPath.replace(/\\/g, '/').split('/') : [];
  const displayPath = selectedPath
    ? pathSegments.length > 3
      ? '.../' + pathSegments.slice(-3).join('/')
      : selectedPath
    : '';

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <label className="block text-xs font-medium text-zinc-400 font-mono uppercase tracking-[0.15em]">
          Workspace Directory
        </label>
        <HelpTooltip text="The root folder for your project. All terminals will open with this as their working directory." />
      </div>
      <div className="flex gap-2.5">
        <div
          className={`flex-1 px-4 py-3 bg-theme-main border rounded-lg text-[var(--text-primary)] font-mono text-sm truncate cursor-default transition-colors duration-150 ${
            errorMessage ? 'border-rose-500/40' : 'border-theme'
          }`}
          title={selectedPath || undefined}
        >
          {displayPath || (
            <span className="text-[var(--text-secondary)]">~/No/directory/selected</span>
          )}
        </div>

        {recentDirectories.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowRecent(!showRecent)}
              className="px-3.5 py-3 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 hover:text-white font-mono text-xs transition-colors duration-150 cursor-pointer flex items-center gap-1.5"
              title="Recent directories"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg className={`w-3 h-3 transition-transform duration-200 ${showRecent ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showRecent && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.15em]">Recent Directories</span>
                  <button
                    type="button"
                    onClick={() => { clearRecentDirectories(); setShowRecent(false); }}
                    className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono transition-colors duration-150 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {recentDirectories.map((path) => {
                    const segments = path.replace(/\\/g, '/').split('/');
                    const shortPath = segments.length > 3
                      ? '.../' + segments.slice(-3).join('/')
                      : path;
                    return (
                      <button
                        key={path}
                        type="button"
                        onClick={() => handleSelectRecent(path)}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 transition-colors duration-100 cursor-pointer flex items-center gap-2 group"
                      >
                        <svg className="w-3.5 h-3.5 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="text-xs font-mono text-zinc-400 group-hover:text-zinc-200 truncate" title={path}>
                          {shortPath}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onSelectDirectory}
          className="px-6 py-3 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 hover:text-white font-mono text-xs transition-colors duration-150 uppercase tracking-[0.1em] cursor-pointer"
        >
          Browse
        </button>
      </div>

      {errorMessage ? (
        <div className="flex items-center gap-1.5 mt-1.5">
          <svg className="w-3 h-3 text-rose-400/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-[10px] text-rose-400/80 font-mono">{errorMessage}</span>
        </div>
      ) : selectedPath ? (
        <p className="mt-1.5 text-[10px] text-emerald-500/70 font-mono tracking-wide">
          Valid directory selected
        </p>
      ) : null}
    </div>
  );
};
