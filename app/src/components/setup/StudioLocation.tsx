import { invoke } from '@tauri-apps/api/core';
import { FolderSimple, WarningCircle } from '@phosphor-icons/react';

interface StudioLocationProps {
  path: string;
  error: string | null;
}

/**
 * Where a writing or presentation studio saves: one folder in Documents, chosen by
 * the app. It is shown, not asked for, and can be opened in the file manager.
 */
export function StudioLocation({ path, error }: StudioLocationProps): React.JSX.Element {
  const name = path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? 'YzPzCode';
  return (
    <div>
      <div className={`ws-folder${error ? ' ws-folder--error' : ''}`}>
        <span className="ws-folder__glyph"><FolderSimple size={22} weight="fill" /></span>
        <span className="min-w-0 flex-1">
          <span className="ws-folder__name block">{path ? name : 'Documents'}</span>
          <span className="ws-folder__path block" title={path || undefined}>{path || 'Preparing your folder…'}</span>
        </span>
        <button type="button" className="ws-btn" disabled={!path}
          onClick={() => { void invoke('reveal_in_file_manager', { path }).catch((reason: unknown) => console.error('Could not open the folder:', reason)); }}>
          Show in folder
        </button>
      </div>
      {error && <p role="alert" className="ws-error"><WarningCircle size={14} />{error}</p>}
    </div>
  );
}
