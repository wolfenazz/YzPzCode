// Tweaks of a graphic. An SVG cannot carry the CSS an HTML board uses, so the AI wires its
// controls with attributes on the elements they affect, and the choices are applied to the
// markup when the board is drawn or exported:
//   data-tw-show="<toggle id>"           drawn only while the toggle is on
//   data-tw-when="<select id>=<a|b>"    drawn only while one of the options is chosen
//   data-tw-opacity="<range id>"        opacity follows the range (min = 0, max = 1)
// String-level, no DOM (`npm run test:design`).

import { normalizeValues, type Tweak, type TweakValues } from './tweaks';

const TAG = /<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

function attribute(attrs: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return match ? (match[1] ?? match[2] ?? '') : null;
}

function withoutAttribute(attrs: string, name: string): string {
  return attrs.replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`), '');
}

/** The markup with the tweak choices applied. Elements without `data-tw-*` attributes are untouched. */
export function applySvgTweaks(svg: string, tweaks: Tweak[] | undefined, values: TweakValues | undefined): string {
  if (!tweaks || tweaks.length === 0 || !svg.includes('data-tw-')) return svg;
  const byId = new Map(tweaks.map((tweak) => [tweak.id, tweak]));
  const current = normalizeValues(tweaks, values);
  return svg.replace(TAG, (whole, name: string, attrs: string, close: string) => {
    if (!attrs.includes('data-tw-')) return whole;
    let hidden = false;
    let opacity: number | null = null;

    const show = attribute(attrs, 'data-tw-show');
    if (show !== null) {
      const tweak = byId.get(show.trim());
      if (tweak && tweak.type === 'toggle' && current[tweak.id] === false) hidden = true;
    }
    const when = attribute(attrs, 'data-tw-when');
    if (when !== null) {
      const [id, options = ''] = when.split('=');
      const tweak = byId.get(id.trim());
      if (tweak && tweak.type === 'select') {
        const wanted = options.split('|').map((option) => option.trim()).filter(Boolean);
        if (wanted.length > 0 && !wanted.includes(String(current[tweak.id]))) hidden = true;
      }
    }
    const level = attribute(attrs, 'data-tw-opacity');
    if (level !== null) {
      const tweak = byId.get(level.trim());
      if (tweak && tweak.type === 'range' && tweak.max !== undefined && tweak.min !== undefined && tweak.max > tweak.min) {
        opacity = Math.min(1, Math.max(0, ((current[tweak.id] as number) - tweak.min) / (tweak.max - tweak.min)));
      }
    }
    if (!hidden && opacity === null) return whole;

    let next = attrs;
    if (hidden) next = `${withoutAttribute(next, 'display')} display="none"`;
    if (opacity !== null) {
      const existing = Number.parseFloat(attribute(next, 'opacity') ?? '1');
      const base = Number.isFinite(existing) ? existing : 1;
      next = `${withoutAttribute(next, 'opacity')} opacity="${Math.round(base * opacity * 1000) / 1000}"`;
    }
    return `<${name}${next}${close}>`;
  });
}
