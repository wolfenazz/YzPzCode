import type { ReactElement } from 'react';
import LightRays from '../effects/LightRays';
import { WorkspaceAurora } from './WorkspaceAurora';
import { useAppStore } from '../../stores/appStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { useBackgroundMotion } from '../../hooks/useBackgroundMotion';

function WorkspaceLightRays(): ReactElement | null {
  const settings = useAppStore((s) => s.workspaceLightRays);
  const motion = useBackgroundMotion(settings.motion);
  const theme = useEffectiveTheme();
  if (settings.intensity === 0) return null;
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none [contain:strict]" style={{ opacity: settings.intensity / 100 }} aria-hidden="true">
      <LightRays {...settings} motion={motion} lightMode={theme === 'light'} />
    </div>
  );
}

/** Shared by the terminal workspace and the settings preview. */
export function WorkspaceBackground(): ReactElement | null {
  const background = useAppStore((s) => s.workspaceBackground);
  switch (background) {
    case 'aurora': return <WorkspaceAurora />;
    case 'light-rays': return <WorkspaceLightRays />;
    default: return null;
  }
}
