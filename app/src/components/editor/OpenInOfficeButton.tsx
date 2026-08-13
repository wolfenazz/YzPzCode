import React, { useCallback, useState } from 'react';
import { openPath } from '@tauri-apps/plugin-opener';

interface OpenInOfficeButtonProps {
  filePath: string;
  appName: string; // e.g. "Word", "Excel", "PowerPoint"
}

/**
 * Opens the file in the user's installed desktop Office application
 * (Microsoft Word / Excel / PowerPoint, or LibreOffice equivalents).
 * The app's file-system watcher will pick up the external save and
 * refresh the in-app preview automatically.
 */
export const OpenInOfficeButton: React.FC<OpenInOfficeButtonProps> = ({ filePath, appName }) => {
  const [opening, setOpening] = useState(false);

  const handleOpen = useCallback(async () => {
    setOpening(true);
    try {
      await openPath(filePath);
    } catch (err) {
      console.error(`Failed to open in ${appName}:`, err);
    } finally {
      setOpening(false);
    }
  }, [filePath, appName]);

  return (
    <button
      onClick={() => void handleOpen()}
      disabled={opening}
      title={`Open in ${appName}`}
      aria-label={`Open in ${appName}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 px-2.5 py-[5px] text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-150 cursor-pointer select-none hover:border-[var(--accent-border)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)] hover:shadow-[0_0_14px_-4px_var(--accent-glow)] disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6v6m-9 3L21 3" />
      </svg>
      {opening ? 'Opening…' : appName}
    </button>
  );
};
