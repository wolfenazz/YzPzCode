// The art-direction vocabulary the AI designs from: ppt-master's visual
// styles and communication modes (github.com/hugohe3/ppt-master, MIT,
// © Hugo He), condensed, plus fonts that survive the trip into PowerPoint.
// A style is a starting point the AI may blend or replace; it never fixes
// colours, which are invented per deck. Dependency-free.

import type { DesignMode } from './designTypes';

export interface VisualStyle {
  id: string;
  label: string;
  group: 'Corporate / product' | 'Editorial' | 'Expressive / print' | 'Hand-drawn' | 'Specialty';
  character: string;
  shape: string;
  composition: string;
  typography: string;
  color: string;
  texture: string;
}

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: 'swiss-minimal', label: 'Swiss minimal', group: 'Corporate / product',
    character: 'Grid-locked, sharp, aggressive whitespace, near-zero ornament.',
    shape: 'Sharp exact contours, true circles, single-weight rules, a few large geometric planes; square corners.',
    composition: 'One oversized plane (full-height colour column, giant disc, heavy bar) zoning the page; asymmetric split flush to one axis; hero numeral at architectural scale; one diagonal rule as the deliberate grid break.',
    typography: 'One sans family, regular/bold contrast, large headlines against small precise body, flush left.',
    color: 'Near-white field; a dominant colour defines a grid zone; accent is punctuation. No gradients.',
    texture: 'Strictly flat. No shadows.',
  },
  {
    id: 'soft-rounded', label: 'Soft rounded', group: 'Corporate / product',
    character: 'Rounded cards, gentle elevation, approachable.',
    shape: 'Visibly rounded rectangles, pill tags, soft containers; one coherent radius family.',
    composition: 'A large soft disc or blob bleeding off one edge as the colour field; pill chains or arcs instead of boxed step rows; one hero panel overlapping a full-width tinted band; an oversized rounded numeral behind the point.',
    typography: 'Friendly humanist or geometric sans, medium weights, open letterforms.',
    color: 'Theme colour used confidently on covers and section pages; same-hue tints for card backings; accent for key figures.',
    texture: 'Gentle elevation: soft shadows only on floating cards, subtle same-hue gradients.',
  },
  {
    id: 'glassmorphism', label: 'Glassmorphism', group: 'Corporate / product',
    character: 'Translucent glass panels, gradient light, floating depth.',
    shape: 'Rounded translucent panels (low fill-opacity over a dark field) with bright hairline edges.',
    composition: 'One hero glass panel off-axis over a radial bloom; overlapping translucent discs as the focal cluster; a large glass ring around the key metric; panels stepped in depth for sequence; a diagonal light beam.',
    typography: 'Clean modern sans, airy; headlines may carry a luminous gradient.',
    color: 'Dark field; colours behave like light through glass: luminous gradients, low-opacity tints, one neon accent.',
    texture: 'Depth from translucency and soft radial glows (circle/ellipse with radialGradient), not hard shadows.',
  },
  {
    id: 'dark-tech', label: 'Dark tech', group: 'Corporate / product',
    character: 'Dark canvas, glow accents, geometric precision.',
    shape: 'Crisp geometry, thin glowing rules, sparse hexagon / circuit / grid motifs.',
    composition: 'A glowing diagonal circuit trace splitting the field; concentric orbit rings staging a central metric; a hexagon node cluster; an oversized low-opacity numeral behind the content; thin bracket frames.',
    typography: 'Clean sans body; monospace for labels, figures and code cues; wide tracking on small labels.',
    color: 'Dark background; a few luminous accents carry focus; everything else low-key.',
    texture: 'Depth through glow and layering, not drop shadows; subtle same-hue gradients.',
  },
  {
    id: 'blueprint', label: 'Blueprint', group: 'Corporate / product',
    character: 'Schematic line work on dark paper, annotated.',
    shape: 'Thin single-weight line frames, outlined components, optional isometric projection.',
    composition: 'The schematic is the layout: an annotated drawing with content on leader lines; a circular detail blow-up; dimension-line brackets framing a hero figure; a drawing-sheet title block in one corner.',
    typography: 'Clean sans labels; monospace for codes and coordinates; small precise annotation.',
    color: 'Dark paper; one line colour carries the schematic; one spot accent marks the key path.',
    texture: 'Flat line work over a faint grid; depth from line weight.',
  },
  {
    id: 'editorial', label: 'Editorial', group: 'Editorial',
    character: 'Magazine hierarchy, rules and columns, serif/sans interplay.',
    shape: 'Rectilinear scaffold of thin rules and column dividers rather than repeated cards.',
    composition: 'An oversized drop numeral anchoring the page; a pull quote breaking across columns; a full-height vertical rule the content hangs from; an asymmetric column split; a figure crossing a column edge.',
    typography: 'Serif headlines or pull quotes against a clean sans body; kicker → headline → standfirst → body.',
    color: 'Mostly monochrome text on a light field; a restrained accent on a rule, kicker or key figure.',
    texture: 'Flat; rules and whitespace separate content.',
  },
  {
    id: 'photo-editorial', label: 'Photo editorial', group: 'Editorial',
    character: 'Full-bleed photography dominates; text points and captions.',
    shape: 'Large edge-to-edge image fields are the spine; minimal chrome.',
    composition: 'An L-shaped text zone carved from a full bleed; a headline straddling the photo edge; diptych / triptych splits; one floating caption card breaking the image boundary.',
    typography: 'Editorial serif titles, clean sans body, small precise captions.',
    color: 'The photograph carries the colour; the text side stays quiet; one accent on numbering or a key word.',
    texture: 'Flat; directional scrim gradients where text sits on a photo.',
  },
  {
    id: 'data-journalism', label: 'Data journalism', group: 'Editorial',
    character: 'Charts as the spine, sidebars, source lines, dense but legible.',
    shape: 'Multi-column grid of small charts and tables, hairline dividers, hero numbers, a running source line.',
    composition: 'Layout wraps the visualisation instead of boxing it; a hero number at column scale; a full-width spanner rule into a stat band; small-multiple strips.',
    typography: 'Serif headline / hero number with a sans or monospace with lining figures for data.',
    color: 'Light paper or dark graphite; accent marks risk or key figures; charts use tints of one family, never a rainbow.',
    texture: 'Flat, publication grade; hairlines over heavy cards.',
  },
  {
    id: 'brutalist', label: 'Brutalist', group: 'Editorial',
    character: 'Newsprint density, ruled boxes, raw structure.',
    shape: 'Hard edges, thick black borders, visible column dividers, raw stamps; corner radius 0.',
    composition: 'A masthead numeral so large it crosses column rules; one grid cell inverted to solid ink; full-bleed rule bars; one rotated stamp box breaking the grid.',
    typography: 'Heavy display sans headlines, serif body, monospace figures; small dense body.',
    color: 'Near-monochrome ink on paper; one spot accent as punctuation.',
    texture: 'Strictly flat, no shadows, no gradients.',
  },
  {
    id: 'memphis', label: 'Memphis', group: 'Expressive / print',
    character: 'Clashing colour blocks, geometric confetti, bold outlines.',
    shape: 'Circles, triangles, zigzags, squiggles, blobs with thick dark outlines.',
    composition: 'A giant primitive bleeding off one edge; a diagonal two-colour split; a zigzag band as divider; props scattered at angles around one rotated focal frame.',
    typography: 'Heavy poster display headlines; neutral readable sans body.',
    color: 'Multi-accent clash on a light field, anchored by dark outlines; a curated subset per page.',
    texture: 'Flat pop-art blocks; optional hard-offset sticker shadows.',
  },
  {
    id: 'zine', label: 'Zine / riso', group: 'Expressive / print',
    character: 'Riso misregistration, cut-and-paste, print grit.',
    shape: 'Cut-and-paste blocks, offset colour shapes, rough frames, near-black ink outlines.',
    composition: 'Slightly rotated pasted-on blocks; a torn-strip band as divider; an oversized halftone-like shape behind the content; a taped corner on the focal block.',
    typography: 'Heavy poster display, plain sans body, monospace annotation.',
    color: 'Two or three spot inks on warm paper; overlap creates extra colours. No gradients.',
    texture: 'Flat print, offset layers, faint dot texture.',
  },
  {
    id: 'vintage-poster', label: 'Vintage poster', group: 'Expressive / print',
    character: 'Mid-century flat blocks, retro-geometric warmth.',
    shape: 'Bold geometric shapes with rounded organic edges, slightly off-axis; stylised reduced icons.',
    composition: 'A giant sun disc or arch as backdrop; ray wedges from the focal point; a horizon band splitting field and sky; one badge or rosette at the emphasis point.',
    typography: 'Retro geometric display headlines; simple body.',
    color: 'A few flat colours: primary in large blocks, warm paper field, accent on small shapes.',
    texture: 'Flat; depth from overlap.',
  },
  {
    id: 'paper-cut', label: 'Paper cut', group: 'Expressive / print',
    character: 'Layered cut-paper sheets, soft inter-layer shadow, tactile.',
    shape: 'Crisp slightly irregular cut edges, no outlines; stylised shapes.',
    composition: 'Stacked wave sheets building the page bottom-up; a die-cut window revealing the layer beneath; one large cut disc anchoring the page; tabbed sheet edges ordering steps.',
    typography: 'Clean friendly sans; titles may sit on a cut-paper banner.',
    color: 'Each colour is one sheet: primary foreground, secondary backing, accent a small cut-out.',
    texture: 'Soft low-opacity drop shadows under layers are the point here.',
  },
  {
    id: 'sketch-notes', label: 'Sketch notes', group: 'Hand-drawn',
    character: 'Warm paper, doodle line work, soft pastel blocks.',
    shape: 'Rounded shapes with a slight wobble (paths with non-aligned points); pastel fills overshooting outlines.',
    composition: 'A wavy-arrow journey path structuring the page; a radial mind-map; a hand-drawn banner for the title; numbered circles along a dotted route.',
    typography: 'Hand-lettered titles (Ink Free / Segoe Print), clear humanist body.',
    color: 'Warm paper field, gentle pastel tints, one accent for a key arrow.',
    texture: 'Flat 2D, no shadows.',
  },
  {
    id: 'ink-notes', label: 'Ink notes', group: 'Hand-drawn',
    character: 'Pale field, black hand ink, sparse semantic accent.',
    shape: 'Hand-drawn line work with slight wobble: boxes, arrows, brackets.',
    composition: 'A circled central concept with branch arrows; a hand-drawn Venn; strike-through-and-replace for before/after; an oversized bracket grouping evidence.',
    typography: 'Bold slightly oversized hand-lettered titles; plain sans body.',
    color: 'Near-monochrome ink; accent only where it signifies something.',
    texture: 'Strictly flat.',
  },
  {
    id: 'chalkboard', label: 'Chalkboard', group: 'Hand-drawn',
    character: 'Dark slate, chalk strokes, powdery pastel accents.',
    shape: 'Chalk-stroke line work, sketched boxes, brackets and arrows.',
    composition: 'One big chalk ring around the key term; a radial mind-map; a hand-drawn arc timeline; a boxed corner note with the takeaway.',
    typography: 'Hand-lettered chalk titles, legible body.',
    color: 'Dark slate; off-white chalk; deck colours as soft powdery pastels.',
    texture: 'Flat; chalk weight carries depth.',
  },
  {
    id: 'ink-wash', label: 'Ink wash', group: 'Hand-drawn',
    character: 'Rice-paper whitespace, brush marks, seal accent, stillness.',
    shape: 'Minimal brush strokes (irregular paths), hairline dividers, one seal-stamp square.',
    composition: 'One broad brush sweep as the diagonal spine; an open ensō ring framing the core phrase; a vertical scroll band; content floating in emptiness.',
    typography: 'Calligraphic serif titles against a clean sans body; generous leading.',
    color: 'Pale paper dominates; ink-dark type; a single seal-red accent.',
    texture: 'Flat; emptiness carries depth.',
  },
  {
    id: 'pixel-art', label: 'Pixel art', group: 'Specialty',
    character: 'Strict pixel grid, blocky forms, limited palette.',
    shape: 'Blocks aligned to a pixel grid, stepped edges, no smooth curves.',
    composition: 'A stepped staircase divider; an oversized sprite; a HUD frame with corner brackets; a tile ground band; a pixel progress bar for sequence.',
    typography: 'Blocky display headlines (Consolas / Bahnschrift caps), clean legible body.',
    color: 'Palette slots: primary object, secondary terrain, accent highlights; darker primary as outline.',
    texture: 'Flat blocks; lighter-top / darker-bottom shading.',
  },
];

export const DESIGN_MODES: Array<{ id: DesignMode; label: string; skeleton: string }> = [
  { id: 'pyramid', label: 'Pyramid', skeleton: 'Conclusion first, then structured supporting arguments; titles are takeaway sentences; data framed toward a decision.' },
  { id: 'narrative', label: 'Narrative', skeleton: 'Story arc: situation → tension → resolution, with turns; for pitches, case studies, journeys.' },
  { id: 'instructional', label: 'Instructional', skeleton: 'Concept decomposition, step by step, parallel exposition; for training and explainers.' },
  { id: 'showcase', label: 'Showcase', skeleton: 'Visual-led impact: one idea per page, big imagery and numbers, emotional rhythm; for launches and reveals.' },
  { id: 'briefing', label: 'Briefing', skeleton: 'Neutral, complete, scannable; topic titles and even weight; for updates and reference decks.' },
];

/**
 * Faces that ship with Windows itself, with the character each one brings.
 * The app previews slides in WebView2 and PowerPoint draws the export, so a
 * face both can find keeps them identical. Office-only faces (Aptos, Rockwell,
 * Gill Sans MT…) are often private to Office and would preview as a fallback.
 */
export const DESIGN_FONTS: Array<{ name: string; character: string; fallback: 'sans-serif' | 'serif' | 'monospace' | 'cursive' }> = [
  { name: 'Segoe UI', character: 'neutral humanist sans', fallback: 'sans-serif' },
  { name: 'Segoe UI Semibold', character: 'confident sans headline', fallback: 'sans-serif' },
  { name: 'Segoe UI Light', character: 'airy thin sans display', fallback: 'sans-serif' },
  { name: 'Segoe UI Black', character: 'heavy poster sans', fallback: 'sans-serif' },
  { name: 'Calibri', character: 'soft rounded sans', fallback: 'sans-serif' },
  { name: 'Bahnschrift', character: 'DIN-like technical sans', fallback: 'sans-serif' },
  { name: 'Franklin Gothic Medium', character: 'American news-gothic headline', fallback: 'sans-serif' },
  { name: 'Corbel', character: 'clean humanist sans', fallback: 'sans-serif' },
  { name: 'Candara', character: 'warm, slightly flared sans', fallback: 'sans-serif' },
  { name: 'Trebuchet MS', character: 'friendly humanist sans', fallback: 'sans-serif' },
  { name: 'Tahoma', character: 'compact sans', fallback: 'sans-serif' },
  { name: 'Verdana', character: 'wide legible sans', fallback: 'sans-serif' },
  { name: 'Arial', character: 'plain grotesque', fallback: 'sans-serif' },
  { name: 'Arial Black', character: 'blocky heavy display', fallback: 'sans-serif' },
  { name: 'Impact', character: 'condensed poster display', fallback: 'sans-serif' },
  { name: 'Georgia', character: 'sturdy classic serif', fallback: 'serif' },
  { name: 'Cambria', character: 'modern text serif', fallback: 'serif' },
  { name: 'Constantia', character: 'elegant calligraphic serif', fallback: 'serif' },
  { name: 'Palatino Linotype', character: 'humanist book serif', fallback: 'serif' },
  { name: 'Times New Roman', character: 'newspaper serif', fallback: 'serif' },
  { name: 'Consolas', character: 'monospace for code and figures', fallback: 'monospace' },
  { name: 'Courier New', character: 'typewriter monospace', fallback: 'monospace' },
  { name: 'Lucida Sans Unicode', character: 'clean humanist sans with wide coverage', fallback: 'sans-serif' },
  { name: 'Gabriola', character: 'ornate calligraphic display', fallback: 'cursive' },
  { name: 'Ink Free', character: 'handwritten marker', fallback: 'cursive' },
  { name: 'Segoe Print', character: 'friendly hand lettering', fallback: 'cursive' },
  { name: 'Segoe Script', character: 'flowing script', fallback: 'cursive' },
];

export const DEFAULT_HEADING_FONT = 'Segoe UI Semibold';
export const DEFAULT_BODY_FONT = 'Segoe UI';

/** A known delivery-safe face by name (case-insensitive), or null. */
export function knownFont(name: unknown): string | null {
  const wanted = String(name ?? '').split(',')[0].trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return DESIGN_FONTS.find((font) => font.name.toLowerCase() === wanted)?.name ?? null;
}

/** A CSS/SVG font stack for a face: the face, Segoe UI, then the generic family. */
export function fontStack(name: string): string {
  const font = DESIGN_FONTS.find((entry) => entry.name === name);
  const generic = font?.fallback ?? 'sans-serif';
  const second = generic === 'serif' ? 'Georgia' : generic === 'monospace' ? 'Consolas' : 'Segoe UI';
  return [name, second].filter((value, index, list) => list.indexOf(value) === index).map((value) => `'${value}'`).concat(generic).join(', ');
}

export function getStyle(id: string | null | undefined): VisualStyle | null {
  return VISUAL_STYLES.find((style) => style.id === id) ?? null;
}

/** Every catalog style a style value names: one id, or a blend such as "editorial + zine". */
export function stylesIn(value: string | null | undefined): VisualStyle[] {
  const text = String(value ?? '').toLowerCase();
  return VISUAL_STYLES.filter((style) => new RegExp(`(^|[^a-z-])${style.id}($|[^a-z-])`).test(text));
}

/** Slide canvas in SVG px (ppt-master `ppt169` / `ppt43`). */
export function designCanvas(size: '16:9' | '4:3'): { width: number; height: number } {
  return size === '4:3' ? { width: 1024, height: 768 } : { width: 1280, height: 720 };
}
