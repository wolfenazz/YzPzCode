// Types for AI-designed decks: the AI invents a design system from the
// user's description, then draws every slide as SVG (the ppt-master method,
// github.com/hugohe3/ppt-master, MIT). Dependency-free.

/** How the deck argues (ppt-master's communication modes). */
export type DesignMode = 'pyramid' | 'narrative' | 'instructional' | 'showcase' | 'briefing';

export type DesignSlideRole = 'cover' | 'agenda' | 'section' | 'content' | 'data' | 'quote' | 'closing';

/** Page density (ppt-master `page_rhythm`). */
export type DesignDensity = 'anchor' | 'dense' | 'breathing';

export interface DesignPalette {
  /** Page field. */
  background: string;
  /** Cards, panels, secondary fields. */
  surface: string;
  text: string;
  muted: string;
  /** The deck's dominant hue. */
  primary: string;
  secondary: string;
  /** Rare emphasis: the key number or word. */
  accent: string;
}

/** Sizes in SVG px on the slide canvas (1280 wide for 16:9). */
export interface DesignTypeScale {
  display: number;
  title: number;
  body: number;
  caption: number;
}

/** The deck's visual identity, invented per deck by the art-direction run. */
export interface DesignSystem {
  /** Short evocative name, e.g. "Tidewater Ledger". */
  name: string;
  /** One paragraph of art direction. */
  concept: string;
  /** A visual style id from `designStyles.ts`, or "custom". */
  style: string;
  mode: DesignMode;
  dark: boolean;
  palette: DesignPalette;
  /** Series colours for charts and diagrams. */
  chartColors: string[];
  fonts: { heading: string; body: string };
  type: DesignTypeScale;
  /** Corners, contours, line weight. */
  shapeLanguage: string;
  /** A recurring element that ties the pages together. */
  motif: string;
  /** How pictures are treated (crops, scrims, frames). */
  imagery: string;
}

export interface DesignedSlide {
  id: string;
  role: DesignSlideRole;
  title: string;
  /** What the page must say and show (from the storyline); the AI's brief when redrawing it. */
  brief: string;
  density: DesignDensity;
  /** Sanitised SVG; empty while the slide is still being drawn. */
  svg: string;
  notes: string;
  hidden?: boolean;
}

/** A file the user gave with the description. */
export interface DesignAttachment {
  /** Pictures: relative to the deck folder (`assets/…`). Documents: absolute path. */
  path: string;
  name: string;
  kind: 'image' | 'document';
  /** Pictures only: put it on slides, use it only as a look reference, or let the AI decide. */
  use: 'auto' | 'slides' | 'style';
  width?: number;
  height?: number;
  /** Dominant colours, most common first. */
  colors?: string[];
}

/** The `design` section of a `.yzdeck` file. */
export interface DesignedDeck {
  /** The user's description, as typed. */
  prompt: string;
  attachments: DesignAttachment[];
  /** Requested number of slides; null lets the AI decide. */
  slideCount: number | null;
  language: string;
  system: DesignSystem;
  slides: DesignedSlide[];
}

/** One page of the storyline the art-direction run returns. */
export interface StoryPage {
  role: DesignSlideRole;
  title: string;
  brief: string;
  density: DesignDensity;
}

export interface DirectionResult {
  title: string;
  language: string;
  system: DesignSystem;
  pages: StoryPage[];
}
