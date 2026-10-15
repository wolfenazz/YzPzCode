// Design studio project model. Dependency-free so it can be tested without Tauri
// (`npm run test:design`).

import type { Tweak, TweakValues } from './tweaks';

export type DesignKind = 'app' | 'web' | 'graphic';
export type BoardFormat = 'html' | 'svg';
export type BoardStatus = 'pending' | 'drawing' | 'done' | 'failed' | 'blank';

export interface DesignPalette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  secondary: string;
  accent: string;
}

export interface DesignTokens {
  name: string;
  concept: string;
  dark: boolean;
  palette: DesignPalette;
  fonts: { heading: string; body: string };
  type: { display: number; h1: number; h2: number; body: number; caption: number };
  radius: number;
  spacing: number;
  motif: string;
  imagery: string;
  /** The same roles for a dark theme; boards switch with `Board.theme`. */
  darkPalette?: DesignPalette;
  headingWeight: number;
  lineHeight: number;
  borderWidth: number;
  /** Strength of the shadow scale (`--ds-shadow-1…3`). */
  shadow: ShadowLevel;
}

export type ShadowLevel = 'none' | 'soft' | 'medium' | 'strong';
export type BoardTheme = 'light' | 'dark';
export type BoardFrame = 'none' | 'phone' | 'browser';

/** One screen, page or graphic on the canvas. */
export interface Board {
  id: string;
  name: string;
  brief: string;
  format: BoardFormat;
  width: number;
  height: number;
  preset?: string;
  x: number;
  y: number;
  /** Sanitized HTML (app, web) or SVG (graphic). Empty until drawn. */
  source: string;
  status?: BoardStatus;
  hidden?: boolean;
  /** Which palette the screen is drawn with (needs `system.darkPalette` for `dark`). */
  theme?: BoardTheme;
  /** A device drawn around the board on the canvas; never part of the exported picture. */
  frame?: BoardFrame;
  /** Controls the AI offered for this screen, and where the person has set them. */
  tweaks?: Tweak[];
  tweakValues?: TweakValues;
  /** Boards of one screen and its states share a group (the id of the first board); the canvas frames them together. */
  group?: string;
}

export interface DesignAttachment {
  path: string;
  name: string;
  kind: 'image' | 'document';
  use: 'auto' | 'slides' | 'style';
  caption?: string;
  credit?: string;
}

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant' | 'log';
  text: string;
  at: number;
}

export interface DesignEngine {
  engine: string;
  model: string;
  effort?: string;
  allowWebResearch: boolean;
}

export interface DesignProject {
  version: 1;
  id: string;
  title: string;
  kind: DesignKind;
  prompt: string;
  language: string;
  created: number;
  updated: number;
  system: DesignTokens;
  boards: Board[];
  attachments: DesignAttachment[];
  chat: ChatEntry[];
  engine?: DesignEngine;
}
