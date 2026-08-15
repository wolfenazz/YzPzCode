// Strands — WebGL woven strands from the React Bits registry
// (https://reactbits.dev/backgrounds/strands), converted to TypeScript.
// Adapted: an `active` prop drives a single eased `uActivity` uniform that
// controls BOTH the sim clock and the wave amplitude + bloom. While idle the
// strands flatten into one straight, softly glowing line (no motion, no wave);
// as the user types the activity ramps up, the waves wake up and the glow
// builds until they flow at full energy. Respects reduced motion.
import { Renderer, Program, Mesh, Color, Triangle, RenderTarget } from 'ogl';
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

interface StrandsProps {
  /** Palette of hex colors cycled across the strands. Empty array = built-in rainbow. */
  colors?: string[];
  /** Number of strands woven through the animation. */
  count?: number;
  /** How quickly the strands ripple and flow. */
  speed?: number;
  /** Vertical reach of each strand as it waves up and down. */
  amplitude?: number;
  /** Density of the curves along each strand. */
  waviness?: number;
  /** Width of each glowing strand. */
  thickness?: number;
  /** Strength of the luminous bloom around the strands. */
  glow?: number;
  /** How sharply the strands fade out toward the edges. */
  taper?: number;
  /** Separation between strands so they fan out instead of overlapping. */
  spread?: number;
  /** Rotates the colors around the strands for variation. */
  hueShift?: number;
  /** Overall brightness and energy of the effect. */
  intensity?: number;
  /** Vibrance of the colors. Above 1 makes them more intense, below 1 fades to grayscale. */
  saturation?: number;
  /** Overall transparency of the rendered strands. */
  opacity?: number;
  /** Zooms the whole effect in or out to make the strands bigger or smaller. */
  scale?: number;
  /** Renders the strands inside a refractive glass ball. */
  glass?: boolean;
  /** How strongly the glass ball bends the light passing through it. */
  refraction?: number;
  /** Amount of rainbow color separation along the edges of the glass ball. */
  dispersion?: number;
  /** Size of the glass ball relative to the canvas. */
  glassSize?: number;
  /** When true the strands flow; when false the sim clock eases to a stop. */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}

const MAX_STRANDS = 12;
const MAX_COLORS = 8;

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform int uStrandCount;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaviness;
uniform float uThickness;
uniform float uGlow;
uniform float uTaper;
uniform float uSpread;
uniform float uHueShift;
uniform float uIntensity;
uniform float uOpacity;
uniform float uScale;
uniform float uSaturation;
uniform float uActivity;

out vec4 fragColor;

const float PI = 3.14159265;

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.00, 0.33, 0.67)));
}

vec3 samplePalette(float t) {
  t = fract(t);
  float scaled = t * float(uColorCount);
  int idx = int(floor(scaled));
  float blend = fract(scaled);
  int nextIdx = idx + 1;
  if (nextIdx >= uColorCount) nextIdx = 0;
  return mix(uColors[idx], uColors[nextIdx], blend);
}

vec3 strandColor(float t) {
  if (uColorCount > 0) return samplePalette(t);
  return spectrum(t);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  uv /= max(uScale, 0.0001);

  float e = 0.06 + uIntensity * 0.94;
  float env = pow(max(cos(uv.x * PI * 1.3), 0.0), uTaper);
  // Eased typing activity (0 = idle, 1 = actively writing). Flattens the
  // strands into a straight resting line and dims their bloom when idle.
  float activity = clamp(uActivity, 0.0, 1.0);

  vec3 col = vec3(0.0);

  for (int i = 0; i < ${MAX_STRANDS}; i++) {
    if (i >= uStrandCount) break;

    float fi = float(i);
    float ph = fi * 1.7 * uSpread;
    float freq = (2.0 + fi * 0.35) * uWaviness;
    float spd = 1.4 + fi * 1.2;

    float tt = uTime * uSpeed;
    float w = sin(uv.x * freq + tt * spd + ph) * 0.60
            + sin(uv.x * freq * 1.1 - tt * spd * 0.7 + ph * 1.7) * 0.40;

    float amp = (0.1 + 0.02 * e) * env * uAmplitude * activity;
    float y = w * amp;

    float d = abs(uv.y - y);
    float thick = (0.001 + 0.05 * e) * (0.35 + env) * uThickness * mix(0.72, 1.15, activity);
    float g = thick / (d + thick * 0.45);
    g = g * g;

    float h = fi / float(uStrandCount) + uv.x * 0.30 + uTime * 0.04 + uHueShift;
    col += strandColor(h) * g * env;
  }

  // Resting glow while idle; the bloom builds up the longer the user types.
  col *= 0.28 + 0.85 * e * activity;
  col = 1.0 - exp(-col * uGlow * mix(0.45, 1.35, activity));

  float gray = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(gray), col, uSaturation), 0.0);

  float lum = max(max(col.r, col.g), col.b);
  float alpha = clamp(lum, 0.0, 1.0) * uOpacity;

  fragColor = vec4(col * uOpacity, alpha);
}
`;

const GLASS_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uRefraction;
uniform float uDispersion;

out vec4 fragColor;

vec2 toUv(vec2 p) {
  return p * (uResolution.y / uResolution) + 0.5;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float d = length(p);
  float r = uRadius;

  float edge = fwidth(d) * 1.5;
  float mask = 1.0 - smoothstep(r - edge, r + edge, d);
  if (mask <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  // sphere height: 0 at the rim, 1 at the center
  float z = sqrt(max(r * r - d * d, 0.0)) / r;
  float nd = d / r; // 0 at the center, 1 at the rim

  // refraction is confined to a narrow band near the rim; the rest stays undistorted
  vec2 dir = d > 0.0 ? p / d : vec2(0.0);
  float lens = smoothstep(0.85, 1.0, nd) * pow(nd, 6.0);
  vec2 offset = -dir * lens * uRefraction * 0.15;
  vec2 disp = -dir * lens * uDispersion * 0.012;

  vec3 light;
  light.r = texture(uScene, toUv(p + offset - disp)).r;
  light.g = texture(uScene, toUv(p + offset)).g;
  light.b = texture(uScene, toUv(p + offset + disp)).b;

  // neutral fresnel rim (no color tint so the glass stays clear)
  float fres = pow(1.0 - z, 3.0);
  vec3 rim = vec3(1.0) * fres * 0.18;

  // specular highlight from the upper-left
  vec2 lightDir = normalize(vec2(-0.55, 0.6));
  float spec = pow(max(dot(p / max(r, 1e-4), lightDir), 0.0), 6.0);
  spec *= smoothstep(r, r * 0.55, d);

  vec3 emissive = light + rim + vec3(spec) * 0.4;
  float emissiveA = clamp(max(max(emissive.r, emissive.g), emissive.b), 0.0, 1.0);

  // almost clear glass body: only a faint neutral darkening, mostly near the rim
  float bodyA = 0.05 + fres * 0.05;

  // composite emissive light over the clear body (premultiplied)
  float outA = emissiveA + bodyA * (1.0 - emissiveA);
  vec3 outRGB = emissive;

  outRGB *= mask;
  outA *= mask;

  fragColor = vec4(outRGB, outA);
}
`;

const buildPalette = (colors?: string[]): number[][] => {
  const filled = colors && colors.length ? colors : ['#ffffff'];
  const padded: number[][] = [];
  for (let i = 0; i < MAX_COLORS; i++) {
    const hex = filled[i] ?? filled[filled.length - 1];
    const c = new Color(hex);
    padded.push([c.r, c.g, c.b]);
  }
  return padded;
};

export default function Strands({
  colors = ['#FF4242', '#7C3AED', '#06B6D4', '#EAB308'],
  count = 3,
  speed = 0.5,
  amplitude = 1,
  waviness = 1,
  thickness = 0.7,
  glow = 2.6,
  taper = 3,
  spread = 1,
  hueShift = 0,
  intensity = 0.6,
  saturation = 1.5,
  opacity = 1,
  scale = 1.5,
  glass = false,
  refraction = 1,
  dispersion = 1,
  glassSize = 1,
  active = true,
  className = '',
  style,
}: StrandsProps) {
  // Live props + active target live in refs so the WebGL context is never
  // recreated on typing start/stop — only the sim clock target changes.
  const propsRef = useRef({
    colors,
    count,
    speed,
    amplitude,
    waviness,
    thickness,
    glow,
    taper,
    spread,
    hueShift,
    intensity,
    saturation,
    opacity,
    scale,
    glass,
    refraction,
    dispersion,
    glassSize
  });
  propsRef.current = {
    colors,
    count,
    speed,
    amplitude,
    waviness,
    thickness,
    glow,
    taper,
    spread,
    hueShift,
    intensity,
    saturation,
    opacity,
    scale,
    glass,
    refraction,
    dispersion,
    glassSize
  };
  const activeRef = useRef(active);
  activeRef.current = active;

  const ctnDom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctn = ctnDom.current;
    if (!ctn) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.backgroundColor = 'transparent';

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) {
      delete geometry.attributes.uv;
    }

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [ctn.offsetWidth, ctn.offsetHeight] },
        uColors: { value: buildPalette(propsRef.current.colors) },
        uColorCount: { value: Math.min(propsRef.current.colors.length, MAX_COLORS) },
        uStrandCount: { value: Math.min(propsRef.current.count, MAX_STRANDS) },
        uSpeed: { value: speed },
        uAmplitude: { value: amplitude },
        uWaviness: { value: waviness },
        uThickness: { value: thickness },
        uGlow: { value: glow },
        uTaper: { value: taper },
        uSpread: { value: spread },
        uHueShift: { value: hueShift },
        uIntensity: { value: intensity },
        uOpacity: { value: opacity },
        uScale: { value: scale },
        uSaturation: { value: saturation },
        uActivity: { value: 0 }
      }
    });

    const mesh = new Mesh(gl, { geometry, program });

    const renderTarget = new RenderTarget(gl, {
      width: ctn.offsetWidth,
      height: ctn.offsetHeight
    });

    const glassProgram = new Program(gl, {
      vertex: VERT,
      fragment: GLASS_FRAG,
      uniforms: {
        uScene: { value: renderTarget.texture },
        uResolution: { value: [ctn.offsetWidth, ctn.offsetHeight] },
        uRadius: { value: 0.46 * glassSize },
        uRefraction: { value: refraction },
        uDispersion: { value: dispersion }
      }
    });
    const glassMesh = new Mesh(gl, { geometry, program: glassProgram });

    ctn.appendChild(gl.canvas);

    function resize() {
      if (!ctn) return;
      const width = ctn.offsetWidth;
      const height = ctn.offsetHeight;
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width, height];
      renderTarget.setSize(width, height);
      glassProgram.uniforms.uResolution.value = [width, height];
    }
    window.addEventListener('resize', resize);
    resize();

    let animateId = 0;
    // Eased sim clock: accelerates while `active`, glides to a stop when idle.
    let lastTime = 0;
    let simTime = 0;
    let timeScale = 0;

    const update = (t: number) => {
      animateId = requestAnimationFrame(update);
      const dt = Math.min((t - lastTime) * 0.001, 0.05);
      lastTime = t;

      timeScale += ((activeRef.current ? 1 : 0) - timeScale) * Math.min(1, dt * 4);
      simTime += dt * timeScale;

      const current = propsRef.current;
      program.uniforms.uTime.value = simTime;
      program.uniforms.uColors.value = buildPalette(current.colors);
      program.uniforms.uColorCount.value = Math.min(current.colors.length, MAX_COLORS);
      program.uniforms.uStrandCount.value = Math.min(Math.max(Math.round(current.count), 1), MAX_STRANDS);
      program.uniforms.uSpeed.value = current.speed;
      program.uniforms.uAmplitude.value = current.amplitude;
      program.uniforms.uWaviness.value = current.waviness;
      program.uniforms.uThickness.value = current.thickness;
      program.uniforms.uGlow.value = current.glow;
      program.uniforms.uTaper.value = current.taper;
      program.uniforms.uSpread.value = current.spread;
      program.uniforms.uHueShift.value = current.hueShift;
      program.uniforms.uIntensity.value = current.intensity;
      program.uniforms.uOpacity.value = current.opacity;
      program.uniforms.uScale.value = current.scale;
      program.uniforms.uSaturation.value = current.saturation;
      program.uniforms.uActivity.value = timeScale;

      if (current.glass) {
        renderer.render({ scene: mesh, target: renderTarget });
        glassProgram.uniforms.uScene.value = renderTarget.texture;
        glassProgram.uniforms.uRefraction.value = current.refraction;
        glassProgram.uniforms.uDispersion.value = current.dispersion;
        glassProgram.uniforms.uRadius.value = 0.46 * current.glassSize;
        renderer.render({ scene: glassMesh });
      } else {
        renderer.render({ scene: mesh });
      }
    };

    if (reducedMotion) {
      program.uniforms.uTime.value = 0;
      renderer.render({ scene: mesh });
    } else {
      animateId = requestAnimationFrame(update);
    }

    return () => {
      cancelAnimationFrame(animateId);
      window.removeEventListener('resize', resize);
      if (ctn && gl.canvas.parentNode === ctn) {
        ctn.removeChild(gl.canvas);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ctnDom} className={`strands-container ${className}`} style={style} />;
}