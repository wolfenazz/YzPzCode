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
        <span className="block text-sm font-medium text-[var(--text-primary)]">
          Project folder
        </span>
        <HelpTooltip text="The root folder for your project, terminals, and extensions." />
      </div>
      <div className="flex gap-2.5">
        <div
          className={`flex h-11 min-w-0 flex-1 items-center truncate rounded-lg border bg-[var(--bg-secondary)] px-3.5 text-sm text-[var(--text-primary)] ${
            errorMessage ? 'border-rose-500/40' : 'border-theme'
          }`}
          title={selectedPath || undefined}
        >
          <span className="min-w-0 truncate">{displayPath || (
            <span className="text-[var(--text-secondary)]">Choose a project folder</span>
          )}</span>
        </div>

        {recentDirectories.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowRecent(!showRecent)}
              className="flex h-11 items-center gap-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              title="Recent directories"
              aria-label="Recent project folders"
              aria-expanded={showRecent}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg className={`w-3 h-3 transition-transform duration-200 ${showRecent ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showRecent && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-3rem)] overflow-hidden rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-xl">
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-3 py-2.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Recent folders</span>
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
                        className="group flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-tertiary)]"
                      >
                        <svg className="w-3.5 h-3.5 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="truncate font-mono text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]" title={path}>
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
          className="h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-4 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--text-secondary)]"
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
      ) : null}
    </div>
  );
};
