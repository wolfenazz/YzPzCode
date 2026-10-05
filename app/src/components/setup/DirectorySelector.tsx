import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ClockCounterClockwise, FolderOpen, FolderSimple, WarningCircle } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { MOD_KEY, SETUP_EASE } from './useSetupMotion';

interface DirectorySelectorProps {
  selectedPath: string;
  onSelectDirectory: () => void;
  onSelectRecentDirectory: (path: string) => void;
  errorMessage?: string;
}

function splitPath(path: string): { name: string; parent: string } {
  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const name = segments.at(-1) ?? path;
  const parent = segments.slice(0, -1).join('/');
  return { name, parent: parent.length > 0 ? parent : '/' };
}

function RecentRow({ path, onSelect }: { path: string; onSelect: () => void }): React.JSX.Element {
  const { name, parent } = splitPath(path);
  return (
    <button type="button" className="ws-recent" onClick={onSelect} title={path}>
      <FolderSimple size={16} className="shrink-0 text-[var(--text-secondary)]" />
      <span className="ws-recent__name">{name}</span>
      <span className="ws-recent__path">{parent}</span>
      <ArrowRight size={14} className="ws-recent__arrow shrink-0" />
    </button>
  );
}

/**
 * Project folder picker. Empty: a large target plus one-click recent folders.
 * Chosen: the folder's name and full path, with Change and a recents menu.
 */
export function DirectorySelector({ selectedPath, onSelectDirectory, onSelectRecentDirectory, errorMessage }: DirectorySelectorProps): React.JSX.Element {
  const recentDirectories = useAppStore((state) => state.recentDirectories);
  const clearRecentDirectories = useAppStore((state) => state.clearRecentDirectories);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const recents = recentDirectories.filter((path) => path !== selectedPath);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  if (!selectedPath) {
    return (
      <div>
        <button type="button" onClick={onSelectDirectory} className={`ws-folder ws-folder--empty${errorMessage ? ' ws-folder--error' : ''}`}>
          <span className="ws-folder__glyph"><FolderOpen size={22} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-[540]">Choose a project folder</span>
            <span className="mt-1 block text-xs text-[var(--text-secondary)]">Terminals, agents, and the editor all start here.</span>
          </span>
          <span className="pointer-events-none hidden sm:block"><span className="ws-btn ws-btn--sm">Browse<span className="ws-kbd">{MOD_KEY} O</span></span></span>
        </button>
        {recentDirectories.length > 0 && (
          <div className="ws-recents">
            <div className="ws-recents__head">
              <span className="flex items-center gap-1.5"><ClockCounterClockwise size={13} /> Recent</span>
              <button type="button" className="ws-link" onClick={clearRecentDirectories}>Clear</button>
            </div>
            {recentDirectories.slice(0, 4).map((path) => (
              <RecentRow key={path} path={path} onSelect={() => onSelectRecentDirectory(path)} />
            ))}
          </div>
        )}
        {errorMessage && <p role="alert" className="ws-error"><WarningCircle size={14} />{errorMessage}</p>}
      </div>
    );
  }

  const { name } = splitPath(selectedPath);
  return (
    <div>
      <div className={`ws-folder${errorMessage ? ' ws-folder--error' : ''}`}>
        <span className="ws-folder__glyph"><FolderSimple size={22} weight="fill" /></span>
        <span className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={selectedPath} className="block" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: SETUP_EASE }}>
              <span className="ws-folder__name block">{name}</span>
              <span className="ws-folder__path block" title={selectedPath}>{selectedPath}</span>
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {recents.length > 0 && (
            <span className="relative" ref={menuRef}>
              <button type="button" className="ws-btn ws-btn--icon ws-btn--ghost" aria-label="Recent project folders" aria-haspopup="menu" aria-expanded={menuOpen} title="Recent folders"
                onClick={() => setMenuOpen((open) => !open)}>
                <ClockCounterClockwise size={16} />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div role="menu" className="ws-popover" initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: SETUP_EASE }} style={{ transformOrigin: 'top right' }}>
                    <div className="ws-recents__head px-2.5 pt-1.5">
                      <span>Recent folders</span>
                      <button type="button" className="ws-link" onClick={() => { clearRecentDirectories(); setMenuOpen(false); }}>Clear</button>
                    </div>
                    {recents.slice(0, 8).map((path) => (
                      <RecentRow key={path} path={path} onSelect={() => { onSelectRecentDirectory(path); setMenuOpen(false); }} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </span>
          )}
          <button type="button" className="ws-btn" onClick={onSelectDirectory}>Change</button>
        </span>
      </div>
      {errorMessage && <p role="alert" className="ws-error"><WarningCircle size={14} />{errorMessage}</p>}
    </div>
  );
}
