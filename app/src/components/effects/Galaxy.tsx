// Adapted from the React Bits Galaxy component supplied for this integration.
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef, type ReactElement } from 'react';
import './Galaxy.css';

interface GalaxyProps {
  focal?: [number, number];
  rotation?: [number, number];
  starSpeed?: number;
  density?: number;
  hueShift?: number;
  disableAnimation?: boolean;
  speed?: number;
  mouseInteraction?: boolean;
  glowIntensity?: number;
  saturation?: number;
  mouseRepulsion?: boolean;
  repulsionStrength?: number;
  twinkleIntensity?: number;
  rotationSpeed?: number;
  autoCenterRepulsion?: number;
  transparent?: boolean;
  lightMode?: boolean;
  motion?: boolean;
  className?: string;
}

const VERT = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const FRAG = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform bool uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform bool uTransparent;
uniform float uLightMode;

varying vec2 vUv;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);

  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);

      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;

      float star = Star(gv - offset - pad, flareSize);
      vec3 color = base;

      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      star *= twinkle;

      col += star * size * color;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;

  vec2 mouseNorm = uMouse - vec2(0.5);

  if (uAutoCenterRepulsion > 0.0) {
    vec2 centerUV = vec2(0.0, 0.0);
    float centerDist = length(uv - centerUV);
    vec2 repulsion = normalize(uv - centerUV) * (uAutoCenterRepulsion / (centerDist + 0.1));
    uv += repulsion * 0.05;
  } else if (uMouseRepulsion) {
    vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = normalize(uv - mousePosUV) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;
  } else {
    vec2 mouseOffset = mouseNorm * 0.1 * uMouseActiveFactor;
    uv += mouseOffset;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;

  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uLightMode > 0.5) {
    float energy = max(max(col.r, col.g), col.b);
    float coverage = clamp(smoothstep(0.0, 0.42, energy) * 0.92, 0.0, 0.92);
    vec3 ink = clamp(col * 0.48, 0.0, 0.82);
    if (uTransparent) {
      gl_FragColor = vec4(ink, coverage);
    } else {
      gl_FragColor = vec4(mix(vec3(1.0), ink, coverage), 1.0);
    }
  } else if (uTransparent) {
    float alpha = length(col);
    alpha = smoothstep(0.0, 0.3, alpha);
    alpha = min(alpha, 1.0);
    gl_FragColor = vec4(col, alpha);
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
}
`;

export default function Galaxy({
  focal = [0.5, 0.5],
  rotation = [1.0, 0.0],
  starSpeed = 0.5,
  density = 1,
  hueShift = 140,
  disableAnimation = false,
  speed = 1.0,
  mouseInteraction = true,
  glowIntensity = 0.3,
  saturation = 0.0,
  mouseRepulsion = true,
  repulsionStrength = 2,
  twinkleIntensity = 0.3,
  rotationSpeed = 0.1,
  autoCenterRepulsion = 0,
  transparent = true,
  lightMode = false,
  motion = true,
  className = '',
}: GalaxyProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetMousePos = useRef({ x: 0.5, y: 0.5 });
  const smoothMousePos = useRef({ x: 0.5, y: 0.5 });
  const targetMouseActive = useRef(0.0);
  const smoothMouseActive = useRef(0.0);
  const latestRef = useRef({ focal, rotation, starSpeed, density, hueShift, disableAnimation, speed,
    mouseInteraction, glowIntensity, saturation, mouseRepulsion, repulsionStrength, twinkleIntensity,
    rotationSpeed, autoCenterRepulsion, transparent, lightMode, motion });
  latestRef.current = { focal, rotation, starSpeed, density, hueShift, disableAnimation, speed,
    mouseInteraction, glowIntensity, saturation, mouseRepulsion, repulsionStrength, twinkleIntensity,
    rotationSpeed, autoCenterRepulsion, transparent, lightMode, motion };
  const refreshRef = useRef<() => void>(() => {});
  const [focalX, focalY] = focal;
  const [rotationX, rotationY] = rotation;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer({ alpha: transparent, premultipliedAlpha: false, antialias: false, dpr: Math.min(window.devicePixelRatio || 1, 1.5) });
    } catch (error) {
      console.warn('Galaxy could not initialize WebGL:', error);
      return;
    }
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.setAttribute('aria-hidden', 'true');
    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: [1, 1, 1] },
      uFocal: { value: [focalX, focalY] },
      uRotation: { value: [rotationX, rotationY] },
      uStarSpeed: { value: 0 },
      uDensity: { value: density },
      uHueShift: { value: hueShift },
      uSpeed: { value: speed },
      uMouse: { value: [0.5, 0.5] },
      uGlowIntensity: { value: glowIntensity },
      uSaturation: { value: saturation },
      uMouseRepulsion: { value: mouseRepulsion },
      uTwinkleIntensity: { value: twinkleIntensity },
      uRotationSpeed: { value: rotationSpeed },
      uRepulsionStrength: { value: repulsionStrength },
      uMouseActiveFactor: { value: 0 },
      uAutoCenterRepulsion: { value: autoCenterRepulsion },
      uTransparent: { value: transparent },
      uLightMode: { value: lightMode ? 1 : 0 },
    };
    const geometry = new Triangle(gl);
    const program = new Program(gl, { vertex: VERT, fragment: FRAG, uniforms, depthTest: false, depthWrite: false });
    const mesh = new Mesh(gl, { geometry, program });
    container.appendChild(canvas);

    let frameId = 0;
    let visible = false;
    let contextLost = false;
    let lastTime: number | null = null;
    let elapsed = 0;

    const draw = (time: number): void => {
      frameId = 0;
      if (!visible || document.hidden || contextLost || !container.clientWidth || !container.clientHeight) return;
      const p = latestRef.current;
      if (p.motion && !p.disableAnimation && lastTime !== null) elapsed += Math.min(time - lastTime, 50) * 0.001;
      lastTime = time;

      uniforms.uTime.value = elapsed;
      uniforms.uStarSpeed.value = (elapsed * p.starSpeed) / 10.0;
      uniforms.uFocal.value = p.focal;
      uniforms.uRotation.value = p.rotation;
      uniforms.uDensity.value = p.density;
      uniforms.uHueShift.value = p.hueShift;
      uniforms.uSpeed.value = p.speed;
      uniforms.uGlowIntensity.value = p.glowIntensity;
      uniforms.uSaturation.value = p.saturation;
      uniforms.uMouseRepulsion.value = p.mouseRepulsion;
      uniforms.uTwinkleIntensity.value = p.twinkleIntensity;
      uniforms.uRotationSpeed.value = p.rotationSpeed;
      uniforms.uRepulsionStrength.value = p.repulsionStrength;
      uniforms.uAutoCenterRepulsion.value = p.autoCenterRepulsion;
      uniforms.uTransparent.value = p.transparent;
      uniforms.uLightMode.value = p.lightMode ? 1 : 0;

      if (p.motion && p.mouseInteraction) {
        smoothMousePos.current.x += (targetMousePos.current.x - smoothMousePos.current.x) * 0.05;
        smoothMousePos.current.y += (targetMousePos.current.y - smoothMousePos.current.y) * 0.05;
        smoothMouseActive.current += (targetMouseActive.current - smoothMouseActive.current) * 0.05;
      } else {
        smoothMouseActive.current = 0;
      }
      uniforms.uMouse.value = [smoothMousePos.current.x, smoothMousePos.current.y];
      uniforms.uMouseActiveFactor.value = smoothMouseActive.current;

      if (p.transparent) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.clearColor(0, 0, 0, 0);
      } else if (p.lightMode) {
        gl.disable(gl.BLEND);
        gl.clearColor(1, 1, 1, 1);
      } else {
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 1);
      }
      try {
        renderer.render({ scene: mesh });
        if (p.motion) frameId = requestAnimationFrame(draw);
      } catch (error) {
        contextLost = true;
        console.warn('Galaxy rendering failed:', error);
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
        uniforms.uResolution.value = [canvas.width, canvas.height, canvas.width / canvas.height];
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
      if (!visible || !p.motion || !p.mouseInteraction) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const inside = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) {
        targetMouseActive.current = 0;
        return;
      }
      targetMousePos.current.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      targetMousePos.current.y = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height));
      targetMouseActive.current = 1;
    };
    const onBlur = (): void => { targetMouseActive.current = 0; };
    const onContextLost = (): void => { contextLost = true; refresh(); };
    canvas.addEventListener('webglcontextlost', onContextLost);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', refresh);
    resize();
    return () => {
      refreshRef.current = () => {};
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', refresh);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      geometry.remove();
      program.remove();
      canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  useEffect(() => refreshRef.current(), [focalX, focalY, rotationX, rotationY, starSpeed, density, hueShift,
    disableAnimation, speed, mouseInteraction, glowIntensity, saturation, mouseRepulsion, repulsionStrength,
    twinkleIntensity, rotationSpeed, autoCenterRepulsion, transparent, lightMode, motion]);

  return <div ref={containerRef} className={`galaxy-container ${className}`.trim()} aria-hidden="true" />;
}
