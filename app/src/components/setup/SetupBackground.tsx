import type { ReactElement } from 'react';
import Galaxy from '../effects/Galaxy';
import { useAppStore } from '../../stores/appStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { useBackgroundMotion } from '../../hooks/useBackgroundMotion';

function SetupGalaxy(): ReactElement | null {
  const settings = useAppStore((s) => s.setupGalaxy);
  const motion = useBackgroundMotion(settings.motion);
  const theme = useEffectiveTheme();
  if (settings.intensity === 0) return null;
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none [contain:strict]" style={{ opacity: settings.intensity / 100 }} aria-hidden="true">
      <Galaxy {...settings} motion={motion} lightMode={theme === 'light'} />
    </div>
  );
}

/** Backdrop for the "Configure workspace" start screen, shared with its settings preview. */
export function SetupBackground(): ReactElement | null {
  const background = useAppStore((s) => s.setupBackground);
  switch (background) {
    case 'galaxy': return <SetupGalaxy />;
    default: return null;
  }
}
