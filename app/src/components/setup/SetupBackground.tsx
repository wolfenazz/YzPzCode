import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { useBackgroundMotion } from '../../hooks/useBackgroundMotion';
import type { SetupBackground as Background } from '../../types';
import { BACKGROUND_RENDER_ERROR } from '../reactbits/backgrounds/renderBackground';
import './setupBackground.css';

const Galaxy = lazy(() => import('../effects/Galaxy'));
const Aurora = lazy(() => import('../reactbits/backgrounds/Aurora'));
const Threads = lazy(() => import('../reactbits/backgrounds/Threads'));
const Iridescence = lazy(() => import('../reactbits/backgrounds/Iridescence'));
const Waves = lazy(() => import('../reactbits/backgrounds/Waves'));
const Particles = lazy(() => import('../reactbits/backgrounds/Particles'));
const DarkVeil = lazy(() => import('../reactbits/backgrounds/DarkVeil'));
const GradientBlinds = lazy(() => import('../reactbits/backgrounds/GradientBlinds'));
const LiquidChrome = lazy(() => import('../reactbits/backgrounds/LiquidChrome'));
const Plasma = lazy(() => import('../reactbits/backgrounds/Plasma'));
const ShapeGrid = lazy(() => import('../reactbits/backgrounds/ShapeGrid'));

const SAGE_COLORS = ['#718e83', '#b6c9b8', '#788a9c'];
const PARTICLE_COLORS = ['#d4dbd7', '#a4b6ab', '#b0bcc9'];
const LIGHT_PARTICLE_COLORS = ['#526a5c', '#61758a', '#7e796b'];
const SILVER: [number, number, number] = [0.65, 0.73, 0.7];

function BackgroundEffect({ background, light }: { background: Background; light: boolean }): ReactElement | null {
  switch (background) {
    case 'aurora': return <Aurora colorStops={SAGE_COLORS} speed={0.2} amplitude={0.65} blend={0.65} lightMode={light} />;
    case 'threads': return <Threads color={light ? [0.25, 0.35, 0.3] : SILVER} amplitude={0.65} distance={0.25} />;
    case 'iridescence': return <Iridescence color={SILVER} speed={0.15} amplitude={0.15} mouseReact={false} />;
    case 'waves': return <Waves lineColor={light ? '#55695f' : '#9eafa6'} backgroundColor="transparent" waveSpeedX={0.006} waveSpeedY={0.003} waveAmpX={18} waveAmpY={10} xGap={24} yGap={48} maxCursorMove={0} />;
    case 'particles': return <Particles particleCount={65} particleColors={light ? LIGHT_PARTICLE_COLORS : PARTICLE_COLORS} speed={0.035} particleBaseSize={55} alphaParticles disableRotation pixelRatio={1} />;
    case 'dark-veil': return <DarkVeil hueShift={180} speed={0.15} noiseIntensity={0.025} resolutionScale={0.65} lightMode={light} />;
    case 'gradient-blinds': return <GradientBlinds gradientColors={SAGE_COLORS} blindCount={12} noise={0.025} spotlightOpacity={0} distortAmount={0.1} dpr={1} lightMode={light} />;
    case 'liquid-chrome': return <LiquidChrome baseColor={SILVER} speed={0.12} amplitude={0.25} interactive={false} />;
    case 'plasma': return <Plasma color="#b4a48d" speed={0.15} opacity={0.65} mouseInteractive={false} lightMode={light} />;
    case 'shape-grid': return <ShapeGrid direction="diagonal" speed={0.12} squareSize={56} borderColor={light ? '#6b7b72' : '#8d9e93'} hoverTrailAmount={0} />;
    default: return null;
  }
}

function SetupAmbient({ background }: { background: Background }): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const motion = useBackgroundMotion(true);
  const theme = useEffectiveTheme();
  const [visible, setVisible] = useState(() => !document.hidden);
  const [webglSupported] = useState(() => {
    // Canvas-only options still work on machines without WebGL.
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return Boolean(gl);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onVisibility = (): void => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  // Attach before child effects run, including effects that draw their first frame synchronously.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const onError = (): void => setFailed(true);
    host?.addEventListener(BACKGROUND_RENDER_ERROR, onError);
    return () => host?.removeEventListener(BACKGROUND_RENDER_ERROR, onError);
  }, []);
  const animate = !failed && motion && visible && (webglSupported || background === 'waves' || background === 'shape-grid');
  return (
    <div ref={hostRef} className="setup-backdrop" data-effect={background} data-still={!animate || undefined} aria-hidden="true">
      {animate ? <Suspense fallback={null}><BackgroundEffect background={background} light={theme === 'light'} /></Suspense> : null}
    </div>
  );
}

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

/** Opt-in setup backdrop, shared with the settings preview. None mounts no renderer. */
export function SetupBackground(): ReactElement | null {
  const background = useAppStore((s) => s.setupBackground);
  if (background === 'none') return null;
  return <Suspense fallback={null}>{background === 'galaxy' ? <SetupGalaxy /> : <SetupAmbient key={background} background={background} />}</Suspense>;
}
