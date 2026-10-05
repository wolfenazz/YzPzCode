import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import type { IdeInfo, IdeType } from '../../types';
import { IDE_ORDER, IDE_ICONS, IDE_DISPLAY_NAMES } from './ideConstants';

/** Editors to open next to the workspace. Only detected IDEs can be picked. */
export function IdesSelector(): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const selectedIdes = useAppStore((state) => state.selectedIdes);
  const toggleIde = useAppStore((state) => state.toggleIde);
  const ideStatuses = useAppStore((state) => state.ideStatuses);
  const setIdeStatuses = useAppStore((state) => state.setIdeStatuses);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoke<Record<IdeType, IdeInfo>>('detect_all_ides_cmd')
      .then((statuses) => { if (!cancelled) setIdeStatuses(statuses); })
      .catch((error: unknown) => console.error('Failed to detect IDEs:', error))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [setIdeStatuses]);

  const ides = IDE_ORDER.map((ide) => ideStatuses[ide]).filter((ide): ide is IdeInfo => Boolean(ide));
  const installed = ides.filter((ide) => ide.installed);
  const missing = ides.filter((ide) => !ide.installed);

  if (loading && ides.length === 0) {
    return <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><span className="ws-spinner" /> Looking for installed editors…</p>;
  }

  return (
    <div>
      <div className="ws-chips">
        {installed.map((ide) => {
          const selected = selectedIdes.includes(ide.ide);
          return (
            <button key={ide.ide} type="button" className="ws-chip" aria-pressed={selected} onClick={() => toggleIde(ide.ide)} title={ide.path || ide.name}>
              <img src={IDE_ICONS[ide.ide]} alt="" draggable={false} />
              {IDE_DISPLAY_NAMES[ide.ide]}
              {selected && <Check size={12} weight="bold" />}
            </button>
          );
        })}
        {showMissing && missing.map((ide) => (
          <button key={ide.ide} type="button" className="ws-chip" disabled title="Not installed">
            <img src={IDE_ICONS[ide.ide]} alt="" draggable={false} />
            {IDE_DISPLAY_NAMES[ide.ide]}
          </button>
        ))}
      </div>
      {installed.length === 0 && <p className="ws-help">No supported editors were found on this computer.</p>}
      {missing.length > 0 && (
        <button type="button" className="ws-link mt-2.5" onClick={() => setShowMissing((value) => !value)}>
          {showMissing ? 'Hide editors that aren’t installed' : `${missing.length} more not installed`}
        </button>
      )}
    </div>
  );
}
