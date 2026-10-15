// Labels and one-click instructions of the prompt bar. Dependency-free (`npm run test:design`).

import type { DesignKind } from './types';

export type ActionScope = 'all' | 'boards' | 'element';

export interface QuickAction {
  label: string;
  instruction: string;
}

/** "1 board", "3 boards". */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** What the next instruction applies to, as the bar's scope chip says it. */
export function scopeLabel(options: { picked: boolean; selected: number; total: number }): string {
  if (options.picked) return 'This element';
  if (options.selected > 0) return plural(options.selected, 'board') + ' selected';
  return options.total === 1 ? 'This board' : `All ${options.total} boards`;
}

/** Asks the AI to give a screen its tweaks (or revise them). */
export const ADD_TWEAKS_INSTRUCTION = 'Add tweaks to this screen: up to five controls that matter for it (a layout variant, density, accent strength, a section shown or hidden), written as a <tweaks> block, and make the CSS follow them. Keep the current look as the default.';

/** The same for a graphic: controls wired with data-tw-* attributes. */
export const ADD_SVG_TWEAKS_INSTRUCTION = 'Add tweaks to this graphic: up to five controls that matter for it (a badge shown or hidden, a layout variant, how strong a shape is), written as a <tweaks> block and wired the way the drawing rules describe for this kind of drawing. Keep the current look as the default.';

const COMMON: QuickAction[] = [
  { label: 'More whitespace', instruction: 'Give it more breathing room: larger margins and spacing, fewer elements competing.' },
  { label: 'Bolder', instruction: 'Make it bolder: stronger hierarchy, larger headline, more contrast.' },
  { label: 'Dark mode', instruction: 'Redesign this in a dark theme using a dark version of the palette; keep the content and layout.' },
  // Board actions, not edits: the composer routes these to making boards.
  { label: '3 versions', instruction: 'Create 3 different versions of this.' },
  { label: 'Blank board', instruction: 'Add a blank board.' },
];

const BY_KIND: Record<DesignKind, QuickAction[]> = {
  graphic: [
    { label: 'Add tweaks', instruction: ADD_SVG_TWEAKS_INSTRUCTION },
    { label: 'Bigger headline', instruction: 'Make the headline much larger and shorten it if needed so it reads at thumbnail size.' },
    { label: 'Simplify', instruction: 'Remove decoration and secondary text; keep one focal point and the essential information.' },
    { label: 'Add a web photo', instruction: 'Add one fitting real photograph where it helps the layout, using a photo: reference with English search words.' },
  ],
  app: [
    { label: 'Add tweaks', instruction: ADD_TWEAKS_INSTRUCTION },
    { label: 'Bigger tap targets', instruction: 'Make every tappable element at least 44px and give controls more room.' },
    { label: 'Tighter copy', instruction: 'Shorten every label and sentence; keep the meaning.' },
    { label: 'Add a web photo', instruction: 'Add one fitting real photograph where it helps the layout, using a photo: reference with English search words.' },
  ],
  web: [
    { label: 'Add tweaks', instruction: ADD_TWEAKS_INSTRUCTION },
    { label: 'Tighter copy', instruction: 'Shorten headlines and paragraphs; keep the meaning and the structure.' },
    { label: 'Stronger hero', instruction: 'Make the top section more striking: a clearer headline, one primary action and better contrast.' },
    { label: 'Add a web photo', instruction: 'Add one fitting real photograph where it helps the layout, using a photo: reference with English search words.' },
  ],
};

const ELEMENT: QuickAction[] = [
  { label: 'Make it stand out', instruction: 'Make this element stand out more: contrast, size or weight, without moving the rest.' },
  { label: 'Lighter', instruction: 'Make this element lighter and quieter: less weight, softer colour, less contrast.' },
  { label: 'Rewrite text', instruction: 'Rewrite the text of this element to be shorter and clearer; keep its meaning and length limit.' },
];

const ARABIC: QuickAction = { label: 'Translate to Arabic', instruction: 'Translate all text to Modern Standard Arabic and mirror the layout for right-to-left reading.' };

/** The chips under the prompt box for what is in scope. */
export function quickActionsFor(kind: DesignKind, scope: ActionScope): QuickAction[] {
  if (scope === 'element') return ELEMENT;
  return [...COMMON, ...BY_KIND[kind], ARABIC];
}

/** Where a board is in its life, for the dot beside its name. */
export function statusLabel(status: string | undefined, hasSource: boolean): string {
  if (status === 'drawing') return 'Drawing';
  if (status === 'failed') return 'Could not be drawn';
  if (status === 'pending') return 'Waiting';
  if (status === 'blank') return 'Empty canvas';
  return hasSource ? 'Ready' : 'Not drawn yet';
}

export interface EmptyBoardState {
  /** The shimmer shown while a draw is coming. */
  skeleton: boolean;
  message: string;
  /** The button that fills the board ('Draw', 'Try again'), or null for none. */
  action: string | null;
}

/** What an empty board shows: a draw on its way, a failure to retry, or a canvas to fill. */
export function emptyBoardState(status: string | undefined): EmptyBoardState {
  if (status === 'drawing') return { skeleton: true, message: 'Drawing…', action: null };
  if (status === 'pending') return { skeleton: true, message: 'Waiting in line', action: null };
  if (status === 'failed') return { skeleton: false, message: 'Could not be drawn', action: 'Try again' };
  // A blank canvas is not a failure: it can be filled whenever asked.
  return { skeleton: false, message: status === 'blank' ? 'Empty canvas' : 'Not drawn yet', action: 'Draw' };
}
