import { Color, Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useMemo, useRef, type CSSProperties, type ReactElement } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useEffectiveTheme } from '../../hooks/useEffectiveTheme';
import { useBackgroundMotion } from '../../hooks/useBackgroundMotion';
import type { WorkspaceAuroraPalette } from '../../types';

const PALETTE_STOPS: Record<Exclude<WorkspaceAuroraPalette, 'custom'>, [string, string, string]> = {
  // Muted versions of Gemini's blue, violet and coral keep the canvas atmospheric.
  gemini: ['#fb19da', '#00b6f2', '#2b27ff'],
  sage: ['#709f97', '#89a7b0', '#b6a98d'],
  accent: ['#c15f3c', '#aa91b5', '#7594b9'],
};
const APP_ACCENTS: Record<string, string> = {
  default: '#d87757', burple: '#8c4edd', blue: '#1b7ede', purple: '#8b5cf6',
  green: '#10b981', orange: '#f97316', red: '#f14444', pink: '#ec4899', cyan: '#06b6d4',
};

const VERT = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;
out vec4 fragColor;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m *= m;
  m *= m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 rampColor = uv.x < 0.5
    ? mix(uColorStops[0], uColorStops[1], uv.x * 2.0)
    : mix(uColorStops[1], uColorStops[2], (uv.x - 0.5) * 2.0);
  float height = exp(snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude);
  float intensity = 0.6 * (uv.y * 2.0 - height + 0.2);
  float auroraAlpha = smoothstep(0.20 - uBlend * 0.5, 0.20 + uBlend * 0.5, intensity);
  fragColor = vec4(intensity * rampColor * auroraAlpha, auroraAlpha);
}
`;

interface AuroraUniforms {
  uTime: { value: number };
  uAmplitude: { value: number };
  uColorStops: { value: number[][] };
  uResolution: { value: [number, number] };
  uBlend: { value: number };
}

/** WebGL aurora from the React Bits effect, isolated behind the terminal grid. */
export function WorkspaceAurora(): ReactElement | null {
  const palette = useAppStore((s) => s.workspaceAuroraPalette);
  const customColors = useAppStore((s) => s.workspaceAuroraColors);
  const accentColor = useAppStore((s) => s.accentColor);
  const intensity = useAppStore((s) => s.workspaceAuroraIntensity);
  const blend = useAppStore((s) => s.workspaceAuroraBlend);
  const amplitude = useAppStore((s) => s.workspaceAuroraAmplitude);
  const speed = useAppStore((s) => s.workspaceAuroraSpeed);
  const motionEnabled = useAppStore((s) => s.workspaceAuroraMotion);
  const motion = useBackgroundMotion(motionEnabled);
  const enabled = intensity > 0;
  const effectiveTheme = useEffectiveTheme();
  const stops = useMemo((): [string, string, string] => {
    if (palette === 'custom') return customColors;
    if (palette !== 'accent') return PALETTE_STOPS[palette];
    const accent = APP_ACCENTS[accentColor] ?? PALETTE_STOPS.accent[0];
    return [accent, '#aa91b5', '#7594b9'];
  }, [palette, accentColor, customColors]);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef({ stops, intensity, blend, amplitude, speed, motion });
  const renderOnceRef = useRef<() => void>(() => {});
  latestRef.current = { stops, intensity, blend, amplitude, speed, motion };

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: false, dpr: Math.min(window.devicePixelRatio || 1, 1.5) });
    } catch (error) {
      console.warn('Workspace aurora could not initialize WebGL:', error);
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;
    const toRgb = (colors: [string, string, string]): number[][] => colors.map((hex) => {
      const color = new Color(hex);
      return [color.r, color.g, color.b];
    });
    let renderedStops = latestRef.current.stops;
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: 1 },
        uColorStops: { value: toRgb(renderedStops) },
        uResolution: { value: [1, 1] },
        uBlend: { value: latestRef.current.blend },
      },
    });
    const uniforms = program.uniforms as unknown as AuroraUniforms;
    const mesh = new Mesh(gl, { geometry, program });
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    const resize = (): void => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      uniforms.uResolution.value = [width * Math.min(window.devicePixelRatio || 1, 1.5), height * Math.min(window.devicePixelRatio || 1, 1.5)];
      if (!latestRef.current.motion) renderer.render({ scene: mesh });
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.addEventListener('resize', resize);

    let frameId = 0;
    let startTime: number | null = null;
    const draw = (timestamp: number): void => {
      const latest = latestRef.current;
      if (renderedStops !== latest.stops) {
        renderedStops = latest.stops;
        uniforms.uColorStops.value = toRgb(renderedStops);
      }
      uniforms.uAmplitude.value = latest.amplitude;
      uniforms.uBlend.value = latest.blend;
      if (startTime === null) startTime = timestamp;
      uniforms.uTime.value = latest.motion ? (timestamp - startTime) * latest.speed * 0.001 : 0;
      renderer.render({ scene: mesh });
      if (latest.motion && !document.hidden) frameId = requestAnimationFrame(draw);
    };
    renderOnceRef.current = () => draw(performance.now());
    const onVisibilityChange = (): void => {
      if (document.hidden) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (latestRef.current.motion && frameId === 0) {
        frameId = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (motion) frameId = requestAnimationFrame(draw);
    else draw(0);
    resize();

    return () => {
      renderOnceRef.current = () => {};
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (canvas.parentNode === container) container.removeChild(canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [enabled, motion]);

  useEffect(() => {
    if (enabled && intensity > 0 && !motion) renderOnceRef.current();
  }, [enabled, intensity, blend, amplitude, motion, stops]);

  if (!enabled || intensity === 0) return null;

  return (
    <div
      ref={containerRef}
      className="workspace-aurora"
      style={{ '--aurora-opacity': intensity / 100 } as CSSProperties}
      data-theme={effectiveTheme}
      aria-hidden="true"
    />
  );
}
