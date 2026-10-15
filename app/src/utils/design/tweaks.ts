// "Tweaks": the few controls the AI offers for a screen (a layout variant, density, accent
// strength, a section shown or hidden). The board's CSS reads them from attributes and
// variables on its root, so changing one repaints the screen with no AI call and no reload.
// Dependency-free (`npm run test:design`).

export type TweakType = 'select' | 'range' | 'toggle';
export type TweakValue = string | number | boolean;
export type TweakValues = Record<string, TweakValue>;

export interface TweakOption {
  /** What the CSS selects on: lowercase letters, digits and hyphens. */
  value: string;
  label: string;
}

export interface Tweak {
  id: string;
  label: string;
  type: TweakType;
  options?: TweakOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  default: TweakValue;
}

export const MAX_TWEAKS = 6;
const MAX_OPTIONS = 6;
const UNITS = new Set(['', 'px', '%', 'deg', 'rem', 'em', 'vw', 'vh']);

const slug = (value: unknown, max: number): string => String(value ?? '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, max);

const clean = (value: unknown, max: number): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const finite = (value: unknown): number | null => (value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);

/** Splits a board reply body into its markup and the JSON inside a `<tweaks>` block (also while that block is still streaming). */
export function splitTweaks(body: string): { markup: string; json: string | null } {
  const open = /<tweaks\b[^>]*>/i.exec(body);
  if (!open) {
    // A tag cut off at the end of a stream.
    const partial = /<t(?:w(?:e(?:a(?:k(?:s)?)?)?)?)?$/i.exec(body);
    return { markup: partial ? body.slice(0, partial.index) : body, json: null };
  }
  const start = open.index + open[0].length;
  const close = body.toLowerCase().indexOf('</tweaks>', start);
  const markup = body.slice(0, open.index) + (close === -1 ? '' : body.slice(close + '</tweaks>'.length));
  return { markup, json: body.slice(start, close === -1 ? undefined : close).trim() };
}

/** Reads the tweaks the AI wrote (JSON text or an array), repairing and capping them. */
export function parseTweaks(input: unknown): Tweak[] {
  let raw: unknown = input;
  if (typeof input === 'string') {
    const text = input.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    if (!text) return [];
    try {
      raw = JSON.parse(text);
    } catch {
      const array = /\[[\s\S]*\]/.exec(text);
      try {
        raw = array ? JSON.parse(array[0]) : null;
      } catch {
        return [];
      }
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Tweak[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || out.length >= MAX_TWEAKS) continue;
    const item = entry as Record<string, unknown>;
    const id = slug(item.id ?? item.label, 24);
    if (!id || !/^[a-z]/.test(id) || seen.has(id)) continue;
    const label = clean(item.label ?? item.id, 40) || id;
    const type = item.type === 'range' || item.type === 'toggle' || item.type === 'select' ? item.type : null;
    if (!type) continue;
    if (type === 'select') {
      const options: TweakOption[] = [];
      for (const option of Array.isArray(item.options) ? item.options : []) {
        const source = option && typeof option === 'object' ? (option as Record<string, unknown>) : { value: option, label: option };
        const value = slug(source.value ?? source.label, 24);
        if (!value || options.some((existing) => existing.value === value) || options.length >= MAX_OPTIONS) continue;
        options.push({ value, label: clean(source.label ?? source.value, 32) || value });
      }
      if (options.length < 2) continue;
      const wanted = slug(item.default, 24);
      seen.add(id);
      out.push({ id, label, type, options, default: options.some((option) => option.value === wanted) ? wanted : options[0].value });
    } else if (type === 'range') {
      const min = finite(item.min) ?? 0;
      const max = finite(item.max) ?? 100;
      if (max <= min) continue;
      const step = Math.max((max - min) / 1000, finite(item.step) ?? (max - min <= 10 ? 0.1 : 1));
      const unit = UNITS.has(String(item.unit ?? '')) ? String(item.unit ?? '') : '';
      const fallback = finite(item.default) ?? min;
      seen.add(id);
      out.push({ id, label, type, min, max, step, unit, default: Math.min(max, Math.max(min, fallback)) });
    } else {
      seen.add(id);
      out.push({ id, label, type, default: item.default === false || item.default === 'off' || item.default === 0 ? false : true });
    }
  }
  return out;
}

export function defaultValues(tweaks: Tweak[]): TweakValues {
  return Object.fromEntries(tweaks.map((tweak) => [tweak.id, tweak.default]));
}

/** `values` made valid for `tweaks`: unknown ids dropped, ranges clamped, options checked, defaults filled in. */
export function normalizeValues(tweaks: Tweak[], values: unknown): TweakValues {
  const given = (values && typeof values === 'object' ? values : {}) as Record<string, unknown>;
  const out: TweakValues = {};
  for (const tweak of tweaks) {
    const value = given[tweak.id];
    if (tweak.type === 'toggle') out[tweak.id] = typeof value === 'boolean' ? value : tweak.default;
    else if (tweak.type === 'range') {
      const n = finite(value);
      out[tweak.id] = n === null ? tweak.default : Math.min(tweak.max as number, Math.max(tweak.min as number, n));
    } else out[tweak.id] = typeof value === 'string' && tweak.options?.some((option) => option.value === value) ? value : tweak.default;
  }
  return out;
}

const numberText = (value: number): string => String(Math.round(value * 1000) / 1000);

/** The attributes a board root carries: `data-tw-<id>` for a select (its option) and a toggle (`on` / `off`). */
export function tweakAttributes(tweaks: Tweak[], values: TweakValues): Record<string, string> {
  const out: Record<string, string> = {};
  const checked = normalizeValues(tweaks, values);
  for (const tweak of tweaks) {
    const value = checked[tweak.id];
    if (tweak.type === 'toggle') out[`data-tw-${tweak.id}`] = value ? 'on' : 'off';
    else if (tweak.type === 'select') out[`data-tw-${tweak.id}`] = String(value);
  }
  return out;
}

/** The variables a board root carries: `--tw-<id>` and, for a range, the bare number as `--tw-<id>-n`. */
export function tweakVariables(tweaks: Tweak[], values: TweakValues): Record<string, string> {
  const out: Record<string, string> = {};
  const checked = normalizeValues(tweaks, values);
  for (const tweak of tweaks) {
    const value = checked[tweak.id];
    if (tweak.type === 'range') {
      out[`--tw-${tweak.id}`] = `${numberText(value as number)}${tweak.unit ?? ''}`;
      out[`--tw-${tweak.id}-n`] = numberText(value as number);
    } else if (tweak.type === 'toggle') out[`--tw-${tweak.id}`] = value ? '1' : '0';
    else out[`--tw-${tweak.id}`] = String(value);
  }
  return out;
}

/** The attribute text for a root element tag: ` data-tw-a="b" style="--tw-c:1"`. Empty without tweaks. */
export function rootAttributes(tweaks: Tweak[] | undefined, values: TweakValues | undefined): string {
  if (!tweaks || tweaks.length === 0) return '';
  const attrs = Object.entries(tweakAttributes(tweaks, values ?? {})).map(([name, value]) => ` ${name}="${value}"`).join('');
  const vars = Object.entries(tweakVariables(tweaks, values ?? {})).map(([name, value]) => `${name}:${value}`).join(';');
  return `${attrs}${vars ? ` style="${vars}"` : ''}`;
}

/** The AI's own words about the tweaks a board already has, for a change request. */
export function describeTweaks(tweaks: Tweak[] | undefined): string {
  if (!tweaks || tweaks.length === 0) return '';
  return JSON.stringify(tweaks.map((tweak) => ({
    id: tweak.id,
    label: tweak.label,
    type: tweak.type,
    ...(tweak.options ? { options: tweak.options.map((option) => option.value) } : {}),
    ...(tweak.type === 'range' ? { min: tweak.min, max: tweak.max, unit: tweak.unit } : {}),
    default: tweak.default,
  })));
}
