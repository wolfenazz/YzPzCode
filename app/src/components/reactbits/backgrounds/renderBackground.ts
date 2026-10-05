import type { Mesh, Renderer } from 'ogl';

export const BACKGROUND_RENDER_ERROR = 'setup-background-render-error';
const linkedPrograms = new WeakSet<WebGLProgram>();

/** OGL leaves uniform locations unset when linking fails. Never draw that program. */
export function renderBackground(
  renderer: Renderer,
  options: Parameters<Renderer['render']>[0] & { scene: Mesh },
  host: HTMLElement,
): boolean {
  const gl = renderer.gl;
  try {
    const program = options.scene.program.program;
    if (!linkedPrograms.has(program)) {
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Background shader could not link.');
      }
      linkedPrograms.add(program);
    }
    renderer.render(options);
    return true;
  } catch (error) {
    console.warn('Setup background unavailable; using a still fallback:', error);
    host.dispatchEvent(new CustomEvent(BACKGROUND_RENDER_ERROR, { bubbles: true }));
    return false;
  }
}
