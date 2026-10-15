// Reading what the person typed into the Design composer: change this board,
// make versions of it, or create another board (optionally at another size).
// Dependency-free (`npm run test:design`).

import { DEFAULT_PRESET, clampCanvas, findPreset } from './formats';
import type { DesignKind } from './types';

export interface VariationsIntent {
  kind: 'variations';
  /** How many versions to make (at least 1). */
  count: number;
  /** Extra direction for the versions, or null. */
  note: string | null;
}

export interface NewBoardIntent {
  kind: 'newBoard';
  /** What the new board should show; '' means an empty canvas. */
  brief: string;
  /** A preset id or `1200x628`, or null for the project's usual size. */
  format: string | null;
  /** Just the empty canvas; do not draw it with the AI. */
  blank: boolean;
}

export type ComposerIntent =
  | VariationsIntent
  | NewBoardIntent
  | { kind: 'refine'; instruction: string };

const VERBS = String.raw`(?:create|add|make|generate|draw|build|start|give|need|want|get)`;
const QUANTIFIERS = String.raw`(?:up to\s+)?(?:(?:\d{1,2}|two|three|four|five|six|multiple|several|a few|some|more|different|alternative|alternate|other|new|another|a|an|the|one|blank|empty|second|extra|fresh|separate)\s+){0,3}`;
const VARIATION_NOUNS = String.raw`(?:versions?|variations?|alternatives?|options?|variants?|iterations?|takes?|remixes?|mockups?)`;
const BOARD_NOUNS = String.raw`(?:images?|pictures?|graphics?|posters?|banners?|canvases|canvas|artboards?|art boards?|boards?|slides?|flyers?|cards?|ads?|designs?|thumbnails?|story|stories|reels?|logos?|pages?|covers?|pins?|invitations?|creatives?)`;
/** The plurals, for "make three posters" style requests that mean versions. */
const BOARD_NOUNS_MANY = String.raw`(?:images|pictures|graphics|posters|banners|canvases|artboards|art boards|boards|slides|flyers|cards|ads|designs|thumbnails|stories|reels|logos|pages|covers|pins|invitations|creatives)`;
/** What a change request puts after the thing it changes: "the new design bolder". */
const CHANGE_WORDS = String.raw`(?:more|less|much|way|even|a bit|slightly)?\s*(?:bolder|bigger|larger|smaller|darker|lighter|shorter|longer|warmer|cooler|calmer|cleaner|simpler|brighter|softer|stronger|quieter|louder|readable|modern|playful|taller|wider|narrower|airier|denser|colourful|colorful|minimal|elegant|professional|serious|festive)`;

/** "1200x628", "1200 × 628", "1200 by 628" — the numbers of a canvas size. */
const SIZE = /(\d{2,4})\s*(?:x|×|by|\*)\s*(\d{2,4})/i;

/** How many versions were asked for, in words or digits. */
const COUNT = new RegExp(String.raw`\b(?:up to\s+)?(\d{1,2}|two|three|four|five|six|multiple|several|a few|some|few|couple)\b`, 'i');

const COUNTS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6,
  multiple: 3, several: 3, 'a few': 3, few: 3, some: 3, couple: 2,
};

/** Named sizes people say in a sentence: "story size", "the youtube thumbnail", "business card size". */
const SIZE_PHRASES: Array<[RegExp, string]> = [
  [/\b(?:instagram|ig) (?:post|feed)\b/i, 'ig-post'],
  [/\b(?:instagram|ig) portrait\b/i, 'ig-portrait'],
  [/\bstory size\b|\binstagram stor(?:y|ies)\b|\bas a stor(?:y|ies)\b|\bstor(?:y|ies)\b|\breels?\b/i, 'story'],
  [/\b(?:x|twitter) header\b/i, 'x-header'],
  [/\b(?:linkedin) banner\b/i, 'linkedin-banner'],
  [/\b(?:linkedin) post\b/i, 'linkedin-post'],
  [/\bfacebook cover\b/i, 'facebook-cover'],
  [/\byou ?tube (?:thumbnail|thumb)\b|\bthumbnail size\b/i, 'yt-thumb'],
  [/\byou ?tube (?:banner|channel art)\b/i, 'yt-banner'],
  [/\bweb hero\b|\bhero (?:image|banner)\b/i, 'web-hero'],
  [/\bpinterest (?:pin|post)\b/i, 'pinterest'],
  [/\blink preview\b|\bog-?image\b|\bopen ?graph\b/i, 'og-image'],
  [/\bleaderboard size\b|\ba leaderboard\b/i, 'leaderboard'],
  [/\brectangle ad\b/i, 'rectangle'],
  [/\bhalf-?page size\b|\ba half-?page\b/i, 'halfpage'],
  [/\bskyscraper size\b|\ba skyscraper\b/i, 'skyscraper'],
  [/\bbusiness cards? size\b|\bas business cards?\b/i, 'business-card'],
  [/\ba4 poster\b|\bposter a4\b/i, 'poster-a4'],
  [/\bu\.?s\.? letter (?:poster|size)\b/i, 'poster-letter'],
  [/\ba4 landscape\b|\bcertificate size\b/i, 'certificate'],
  [/\blogo size\b|\bsquare logos?\b/i, 'logo'],
  [/\bphone size\b/i, 'phone'],
  [/\bdesktop size\b/i, 'desktop'],
  [/\bemail size\b/i, 'email'],
];

/** "make me three versions", "generate variations", "try two other takes", "create multiple images". */
const VARIATIONS = new RegExp([
  // A counted or qualified request: "3 versions", "multiple variations", "create multiple images".
  String.raw`\b(?:\d{1,2}|two|three|four|five|six|multiple|several|a few|some|more|different|other|alternate|alternative|new)\s+(?:${VARIATION_NOUNS}|${BOARD_NOUNS_MANY})\b`,
  // A verb right before the noun: "make versions", "create some variations", "give me 3 options".
  String.raw`\b${VERBS}\s+(?:me\s+|us\s+)?${QUANTIFIERS}${VARIATION_NOUNS}\b`,
  // Versions of the thing at hand: "versions of this", "alternatives from the existing design".
  String.raw`\b${VARIATION_NOUNS}\s+(?:of|for|from|based on)\s+(?:this|that|these|those|it|them|the existing|the current|the original|my|our|the (?:design|image|picture|poster|drawing|board|canvas|artwork|photo|one)s?)\b`,
].join('|'), 'i');

/** "another image", "a new poster", "a blank canvas", "one more story". */
const NEW_BOARD = new RegExp(String.raw`\b(?:another|a new|a second|a brand-?new|one more|a fresh|a separate|a different|a whole new|more)\s+(?:\w+\s+)?(?:blank\s+|empty\s+)?${BOARD_NOUNS}\b`, 'i');

/** "add a story", "create a poster", "draw an image" — a verb onto a board noun. */
const NEW_BOARD_VERB = new RegExp(String.raw`\b${VERBS}\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|the\s+|some\s+|one\s+)?(?:new\s+|blank\s+|empty\s+)?${BOARD_NOUNS}\b`, 'i');

/** "the new image", "our new poster" — a board named as new. */
const NEW_BOARD_NAMED = new RegExp(String.raw`\b(?:the\s+|this\s+|my\s+|our\s+)?new\s+(?:images?|pictures?|graphics?|posters?|banners?|canvases|canvas|artboards?|boards?|slides?|flyers?|cards?|thumbnails?|stor(?:y|ies)|reels?|logos?|creatives?)\b`, 'i');

/** A board noun carrying its canvas size: "poster at 1080x1920", "the new canvas is 800x600". */
const BOARD_SIZED = new RegExp(String.raw`\b${BOARD_NOUNS}\b[^.?!]{0,40}?\b(?:at|in|of|size|sized(?:\s+at)?|with a size of|is|are|=|:)\s*${SIZE.source}`, 'i');

/** "the design bolder", "the image smaller" — a change to something, not a new board. */
const CHANGES_SOMETHING = new RegExp(String.raw`\b${BOARD_NOUNS}\s+${CHANGE_WORDS}\b`, 'i');

const POLITENESS = /^(?:please\s+|kindly\s+|can you\s+|could you\s+|would you\s+|will you\s+|i want to\s+|i need\s+|i'd like to\s+|let'?s\s+)+/i;

/** Reads a canvas size out of a sentence, or a named size such as "story size". */
export function readSize(text: string): string | null {
  const size = SIZE.exec(text);
  if (size) {
    const width = clampCanvas(Number(size[1]));
    const height = clampCanvas(Number(size[2]));
    return `${width}x${height}`;
  }
  for (const [phrase, id] of SIZE_PHRASES) {
    if (phrase.test(text) && findPreset(id)) return id;
  }
  return null;
}

/** How many versions to make: digits or words, 1–6, defaulting to 3. */
export function readCount(text: string): number {
  const match = COUNT.exec(text);
  if (!match) return 3;
  const word = match[1].toLowerCase();
  const value = /^\d+$/.test(word) ? Number(word) : COUNTS[word];
  return Math.min(6, Math.max(1, value ?? 3));
}

/** The size written as words or digits, so it can be taken out of the note. */
function sizePattern(): RegExp {
  return new RegExp(String.raw`(?:\b(?:at|in|of|size|sized at|with a size of|to|as)\s+)?${SIZE.source}(?:\s*px)?|\bsize (?:story|reel|thumbnail|poster|logo|business card|phone|desktop|email|square|a4|letter)\b|\b(?:story|reel|thumbnail|poster|logo|business card|phone|desktop|email|square|a4|letter) size\b`, 'gi');
}

/** What is left after the ask itself: the subject to draw, or null when there is nothing to add. */
function note(text: string): string | null {
  const cleaned = text
    .replace(sizePattern(), ' ')
    .replace(new RegExp(String.raw`^${VERBS}\s+(?:me\s+|us\s+)?${QUANTIFIERS}(?:blank\s+|empty\s+)?(?:${VARIATION_NOUNS}|${BOARD_NOUNS})\b\s*`, 'i'), ' ')
    .replace(new RegExp(String.raw`\b${VERBS}\s+(?:me\s+|us\s+)?${QUANTIFIERS}(?:blank\s+|empty\s+)?(?:${VARIATION_NOUNS}|${BOARD_NOUNS})\b\s*`, 'i'), ' ')
    .replace(new RegExp(String.raw`^\s*(?:the\s+|this\s+|my\s+|our\s+)?(?:new\s+|another\s+|blank\s+|empty\s+)?(?:${VARIATION_NOUNS}|${BOARD_NOUNS}|size)\b\s*(?:called\s+|named\s+|:)?\s*`, 'i'), ' ')
    .replace(/^\s*(?:(?:create|add|make|generate|draw|build|start|give|need|want|get|and|then|also|of|for|with|from|to|in|as|at|that|which|about)\b\s*|[:,;|-]\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?:\s+(?:is|are)|[.,;:])+$/i, '')
    .trim();
  if (!cleaned) return null;
  // "this", "the existing one", "the new canvas" and friends only point back at the board itself.
  if (/^(?:(?:this|that|it|them)\b|(?:the\s+)?(?:existing|current|original|same|given|above)\b|(?:the\s+)?new\s+(?:one|ones|canvas|board|artboard|image|picture|graphic|design)\b)/i.test(cleaned) && cleaned.split(' ').length <= 4) return null;
  return cleaned;
}

/** Reads what the composer line is asking for. Anything else is a change to the boards in scope. */
export function parseComposerIntent(text: string): ComposerIntent {
  const instruction = text.trim();
  if (!instruction) return { kind: 'refine', instruction };
  const stripped = instruction.replace(POLITENESS, '');
  const blank = /\b(?:blank|empty)\b/i.test(stripped);
  // "the design bolder", "the image smaller" change something; nothing is created.
  if (CHANGES_SOMETHING.test(stripped)) return { kind: 'refine', instruction };
  if (VARIATIONS.test(stripped) && !blank) {
    return { kind: 'variations', count: readCount(stripped), note: note(stripped) };
  }
  // "the new image" counts as new when it carries a size or starts the sentence.
  const namedNew = NEW_BOARD_NAMED.test(stripped) && (SIZE.test(stripped) || /^\s*(?:the\s+|this\s+|my\s+|our\s+)?new\s+/i.test(stripped));
  if (NEW_BOARD.test(stripped) || NEW_BOARD_VERB.test(stripped) || BOARD_SIZED.test(stripped) || namedNew) {
    return { kind: 'newBoard', brief: note(stripped) ?? '', format: readSize(stripped), blank };
  }
  return { kind: 'refine', instruction };
}

export interface ComposerAction {
  kind: 'refine' | 'variations' | 'newBoard';
  /** For a change: what to ask. For a new board: what it shows ('' = an empty canvas). */
  instruction?: string;
  brief?: string;
  /** How many versions, for a variations action. */
  count?: number;
  note?: string | null;
  /** Always set for a new board: a preset id or `1200x628`. */
  format?: string;
  /** Just the empty canvas; do not draw it with the AI. */
  blank?: boolean;
}

/** The plan for one composer line: change the boards in scope, make versions, or add a board. */
export function planComposerAction(text: string, options: { picked?: boolean; lastPreset?: string | null; kind: DesignKind }): ComposerAction {
  const intent = parseComposerIntent(text);
  // With an element picked the words are about that element, whatever else they say.
  if (options.picked || intent.kind === 'refine') return { kind: 'refine', instruction: text.trim() };
  if (intent.kind === 'variations') return { kind: 'variations', count: intent.count, note: intent.note };
  return {
    kind: 'newBoard',
    brief: intent.brief,
    format: intent.format ?? options.lastPreset ?? DEFAULT_PRESET[options.kind],
    blank: intent.blank || !intent.brief,
  };
}
