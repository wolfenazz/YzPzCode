// Adapted from the React Bits LightRays component supplied for this integration.
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef, type ReactElement } from 'react';
import type { RaysOrigin } from '../../types';
import './LightRays.css';

interface LightRaysProps {
  raysOrigin?: RaysOrigin;
  raysColor?: string;
  raysSpeed?: number;
  lightSpread?: number;
  rayLength?: number;
  pulsating?: boolean;
  fadeDistance?: number;
  saturation?: number;
  followMouse?: boolean;
  mouseInfluence?: number;
  noiseAmount?: number;
  distortion?: number;
  lightMode?: boolean;
  motion?: boolean;
  className?: string;
}

const hexToRgb = (hex: string): number[] => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match ? match.slice(1).map((part) => parseInt(part, 16) / 255) : [1, 1, 1];
};

function getAnchorAndDir(origin: RaysOrigin, w: number, h: number): { anchor: number[]; dir: number[] } {
  switch (origin) {
    case 'top-left': return { anchor: [0, -0.2 * h], dir: [0, 1] };
    case 'top-right': return { anchor: [w, -0.2 * h], dir: [0, 1] };
    case 'left': return { anchor: [-0.2 * w, 0.5 * h], dir: [1, 0] };
    case 'right': return { anchor: [1.2 * w, 0.5 * h], dir: [-1, 0] };
    case 'bottom-left': return { anchor: [0, 1.2 * h], dir: [0, -1] };
    case 'bottom-center': return { anchor: [0.5 * w, 1.2 * h], dir: [0, -1] };
    case 'bottom-right': return { anchor: [w, 1.2 * h], dir: [0, -1] };
    default: return { anchor: [0.5 * w, -0.2 * h], dir: [0, 1] };
  }
}

const VERT = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAG = `precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform vec2 rayPos;
uniform vec2 rayDir;
uniform vec3 raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2 mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;
uniform float lightMode;

float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}
float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
                  float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  vec2 dirNorm = sourceToCoord / max(length(sourceToCoord), 0.0001);
  float cosAngle = dot(dirNorm, rayRefDirection);
  float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));
  float distance = length(sourceToCoord);
  float maxDistance = max(iResolution.x * rayLength, 0.0001);
  float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
  float fadeReach = max(iResolution.x * fadeDistance, 0.0001);
  float fadeFalloff = clamp((fadeReach - distance) / fadeReach, 0.5, 1.0);
  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;
  float baseStrength = clamp(
    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed)), 0.0, 1.0);
  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}
void main() {
  vec2 coord = vec2(gl_FragCoord.x, iResolution.y - gl_FragCoord.y);
  vec2 finalRayDir = rayDir;
  if (mouseInfluence > 0.0) {
    vec2 mouseDelta = mousePos * iResolution - rayPos;
    vec2 mouseDirection = mouseDelta / max(length(mouseDelta), 0.0001);
    finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
  }
  vec4 color = vec4(1.0) * (
    rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed) * 0.5 +
    rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234, 1.1 * raysSpeed) * 0.4);
  if (noiseAmount > 0.0) color.rgb *= 1.0 - noiseAmount + noiseAmount * noise(coord * 0.01 + iTime * 0.1);
  float brightness = 1.0 - coord.y / iResolution.y;
  color.rgb *= vec3(0.1 + brightness * 0.8, 0.3 + brightness * 0.6, 0.5 + brightness * 0.5);
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(gray), color.rgb, saturation) * raysColor;
  if (lightMode > 0.5) {
    vec3 mapped = vec3(1.0) - exp(-max(color.rgb, vec3(0.0)) * 1.35);
    float energy = clamp(max(mapped.r, max(mapped.g, mapped.b)), 0.0, 1.0);
    vec3 hue = mapped / max(energy, 0.0001);
    vec3 ink = mix(hue * 0.25, hue * 0.72, energy);
    color = vec4(mix(vec3(1.0), ink, energy), 1.0);
  }
  gl_FragColor = color;
}`;

export default function LightRays({
  raysOrigin = 'top-center', raysColor = '#ffffff', raysSpeed = 1,
  lightSpread = 1, rayLength = 2, pulsating = false, fadeDistance = 1,
  saturation = 1, followMouse = true, mouseInfluence = 0.1, noiseAmount = 0,
  distortion = 0, lightMode = false, motion = true, className = '',
}: LightRaysProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef({ raysOrigin, raysColor, raysSpeed, lightSpread, rayLength, pulsating,
    fadeDistance, saturation, followMouse, mouseInfluence, noiseAmount, distortion, lightMode, motion });
  latestRef.current = { raysOrigin, raysColor, raysSpeed, lightSpread, rayLength, pulsating,
    fadeDistance, saturation, followMouse, mouseInfluence, noiseAmount, distortion, lightMode, motion };
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer({ webgl: 1, alpha: true, antialias: false, dpr: Math.min(window.devicePixelRatio || 1, 1.5) });
    } catch (error) {
      console.warn('Light Rays could not initialize WebGL:', error);
      return;
    }
    const gl = renderer.gl;
    const canvas = gl.canvas;
    const uniforms = {
      iTime: { value: 0 }, iResolution: { value: [1, 1] },
      rayPos: { value: [0, 0] }, rayDir: { value: [0, 1] },
      raysColor: { value: [1, 1, 1] }, raysSpeed: { value: 1 },
      lightSpread: { value: 1 }, rayLength: { value: 2 }, pulsating: { value: 0 },
      fadeDistance: { value: 1 }, saturation: { value: 1 }, mousePos: { value: [0.5, 0.5] },
      mouseInfluence: { value: 0 }, noiseAmount: { value: 0 }, distortion: { value: 0 }, lightMode: { value: 0 },
    };
    const geometry = new Triangle(gl);
    const program = new Program(gl, { vertex: VERT, fragment: FRAG, uniforms, depthTest: false, depthWrite: false });
    const mesh = new Mesh(gl, { geometry, program });
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    let frameId = 0;
    let visible = false;
    let contextLost = false;
    let lastTime: number | null = null;
    let elapsed = 0;
    const mouse = { x: 0.5, y: 0.5 };
    const smoothMouse = { x: 0.5, y: 0.5 };

    const draw = (time: number): void => {
      frameId = 0;
      if (!visible || document.hidden || contextLost || !container.clientWidth || !container.clientHeight) return;
      const p = latestRef.current;
      if (p.motion && lastTime !== null) elapsed += Math.min(time - lastTime, 50) * 0.001;
      lastTime = time;
      uniforms.iTime.value = p.motion ? elapsed : 0;
      uniforms.raysColor.value = hexToRgb(p.raysColor);
      uniforms.raysSpeed.value = p.raysSpeed;
      uniforms.lightSpread.value = p.lightSpread;
      uniforms.rayLength.value = p.rayLength;
      uniforms.pulsating.value = p.pulsating ? 1 : 0;
      uniforms.fadeDistance.value = p.fadeDistance;
      uniforms.saturation.value = p.saturation;
      uniforms.mouseInfluence.value = p.followMouse && p.motion ? p.mouseInfluence : 0;
      uniforms.noiseAmount.value = p.noiseAmount;
      uniforms.distortion.value = p.distortion;
      uniforms.lightMode.value = p.lightMode ? 1 : 0;
      const { anchor, dir } = getAnchorAndDir(p.raysOrigin, canvas.width, canvas.height);
      uniforms.rayPos.value = anchor;
      uniforms.rayDir.value = dir;
      smoothMouse.x += (mouse.x - smoothMouse.x) * 0.08;
      smoothMouse.y += (mouse.y - smoothMouse.y) * 0.08;
      uniforms.mousePos.value = [smoothMouse.x, smoothMouse.y];
      try {
        renderer.render({ scene: mesh });
        if (p.motion) frameId = requestAnimationFrame(draw);
      } catch (error) {
        contextLost = true;
        console.warn('Light Rays rendering failed:', error);
      }
    };
    const refresh = (): void => {
      cancelAnimationFrame(frameId);
      frameId = 0;
      lastTime = null;
      if (visible && !document.hidden && !contextLost) frameId = requestAnimationFrame(draw);
    };
    refreshRef.current = refresh;
    const resize = (): void => {
      if (container.clientWidth && container.clientHeight) {
        renderer.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        renderer.setSize(container.clientWidth, container.clientHeight);
        uniforms.iResolution.value = [canvas.width, canvas.height];
      }
      refresh();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      refresh();
    });
    intersectionObserver.observe(container);
    const onMouseMove = (event: MouseEvent): void => {
      const p = latestRef.current;
      if (!visible || !p.motion || !p.followMouse || p.mouseInfluence === 0) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      mouse.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      mouse.y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    };
    const onContextLost = (): void => { contextLost = true; refresh(); };
    canvas.addEventListener('webglcontextlost', onContextLost);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', refresh);
    resize();
    return () => {
      refreshRef.current = () => {};
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', refresh);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      geometry.remove();
      program.remove();
      canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  useEffect(() => refreshRef.current(), [raysOrigin, raysColor, raysSpeed, lightSpread, rayLength,
    pulsating, fadeDistance, saturation, followMouse, mouseInfluence, noiseAmount, distortion, lightMode, motion]);

  return <div ref={containerRef} className={`light-rays-container ${className}`.trim()} aria-hidden="true" />;
}
