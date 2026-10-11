// The fonts both studios offer, in one catalog: what each face is like, whether
// it draws Arabic, and where it comes from.
//   windows  ships with Windows, so the app preview and PowerPoint / Word agree
//   office   ships with Microsoft Office (a PowerPoint or Word without Office
//            substitutes a similar face)
//   bundled  packaged with YzPzCode (loaded when a document uses it): the app,
//            PDF, PNG and HTML exports show it; a .pptx or .docx names it, and
//            the machine that opens the file needs it installed
// Presentation (`designStyles.ts`) and Writing (`stylePresets.ts`) both read
// this list. Dependency-free (tested by `npm run test:writing`).

export type FontKind = 'sans' | 'serif' | 'mono' | 'display' | 'script';
export type FontSource = 'windows' | 'office' | 'bundled';

export interface CatalogFont {
  name: string;
  kind: FontKind;
  /** A few words on what the face is like; the AI chooses by this. */
  character: string;
  source: FontSource;
  /** The face draws Arabic letters itself. */
  arabic: boolean;
}

const font = (source: FontSource, kind: FontKind, arabic: boolean) => (name: string, character: string): CatalogFont => ({ name, kind, character, source, arabic });

const winSans = font('windows', 'sans', false);
const winSerif = font('windows', 'serif', false);
const winMono = font('windows', 'mono', false);
const winDisplay = font('windows', 'display', false);
const winScript = font('windows', 'script', false);
const offSans = font('office', 'sans', false);
const offSerif = font('office', 'serif', false);
const offDisplay = font('office', 'display', false);
const offScript = font('office', 'script', false);
const arSans = font('windows', 'sans', true);
const arSerif = font('windows', 'serif', true);
const arMono = font('windows', 'mono', true);
const arOfficeSans = font('office', 'sans', true);
const arOfficeSerif = font('office', 'serif', true);
const webSans = font('bundled', 'sans', false);
const webSerif = font('bundled', 'serif', false);
const webMono = font('bundled', 'mono', false);
const webDisplay = font('bundled', 'display', false);
const webScript = font('bundled', 'script', false);
const webArSans = font('bundled', 'sans', true);
const webArSerif = font('bundled', 'serif', true);
const webArDisplay = font('bundled', 'display', true);

export const FONT_CATALOG: CatalogFont[] = [
  // Windows: sans -----------------------------------------------------------------------
  arSans('Segoe UI', 'neutral humanist sans'),
  arSans('Segoe UI Semibold', 'confident sans headline'),
  arSans('Segoe UI Light', 'airy thin sans display'),
  arSans('Segoe UI Black', 'heavy poster sans'),
  winSans('Calibri', 'soft rounded sans'),
  winSans('Calibri Light', 'light, soft sans'),
  winSans('Bahnschrift', 'DIN-like technical sans'),
  winSans('Franklin Gothic Medium', 'American news-gothic headline'),
  winSans('Corbel', 'clean humanist sans'),
  winSans('Candara', 'warm, slightly flared sans'),
  winSans('Trebuchet MS', 'friendly humanist sans'),
  arSans('Tahoma', 'compact, legible sans'),
  winSans('Verdana', 'wide legible sans'),
  arSans('Arial', 'plain grotesque'),
  winSans('Arial Black', 'blocky heavy display'),
  arSans('Lucida Sans Unicode', 'clean humanist sans with wide coverage'),
  arSans('Microsoft Sans Serif', 'plain system sans'),
  winSans('Gadugi', 'rounded, open sans'),
  winSans('Nirmala UI', 'open sans for many scripts'),
  winSans('Leelawadee UI', 'friendly open sans'),
  winSans('Sylfaen', 'calm, bookish sans-serif'),
  // Windows: serif ----------------------------------------------------------------------
  winSerif('Georgia', 'sturdy classic serif'),
  winSerif('Cambria', 'modern text serif'),
  winSerif('Constantia', 'elegant calligraphic serif'),
  winSerif('Palatino Linotype', 'humanist book serif'),
  winSerif('Book Antiqua', 'warm Palatino-like book serif'),
  arSerif('Times New Roman', 'newspaper serif'),
  winSerif('Sitka Text', 'optical-size editorial serif'),
  winSerif('Sitka Heading', 'high-contrast editorial serif'),
  // Windows: mono, display, script ------------------------------------------------------
  winMono('Consolas', 'monospace for code and figures'),
  arMono('Courier New', 'typewriter monospace'),
  winMono('Lucida Console', 'sturdy console monospace'),
  winMono('Cascadia Code', 'modern monospace with ligatures'),
  winMono('Cascadia Mono', 'modern monospace'),
  winDisplay('Impact', 'condensed poster display'),
  winScript('Gabriola', 'ornate calligraphic display'),
  winScript('Ink Free', 'handwritten marker'),
  winScript('Segoe Print', 'friendly hand lettering'),
  winScript('Segoe Script', 'flowing script'),
  winScript('Lucida Handwriting', 'slanted handwriting'),
  winScript('Brush Script MT', 'brush-pen script'),
  winScript('Mistral', 'quick casual script'),
  winScript('Monotype Corsiva', 'chancery italic'),
  // Office ------------------------------------------------------------------------------
  offSans('Aptos', 'Office modern sans'),
  offSans('Aptos Display', 'Office modern display sans'),
  offSans('Aptos Narrow', 'Office condensed sans'),
  offSans('Century Gothic', 'geometric, Futura-like sans'),
  offSans('Gill Sans MT', 'British humanist sans'),
  offSans('Tw Cen MT', 'tall geometric sans'),
  offSans('Franklin Gothic Book', 'text gothic sans'),
  offSans('Franklin Gothic Demi', 'bold gothic headline'),
  offSans('Lucida Sans', 'wide humanist sans'),
  offSans('Arial Narrow', 'condensed grotesque'),
  offSans('Berlin Sans FB', 'chunky friendly sans'),
  offSans('Maiandra GD', 'rounded humanist sans'),
  offSerif('Garamond', 'refined old-style serif'),
  offSerif('Bookman Old Style', 'wide, sturdy book serif'),
  offSerif('Century', 'classic modern book serif'),
  offSerif('Century Schoolbook', 'friendly textbook serif'),
  offSerif('Baskerville Old Face', 'sharp transitional serif'),
  offSerif('Bodoni MT', 'high-contrast fashion serif'),
  offSerif('Goudy Old Style', 'warm old-style serif'),
  offSerif('Perpetua', 'elegant engraved serif'),
  offSerif('Rockwell', 'slab serif'),
  offSerif('Calisto MT', 'soft readable serif'),
  offSerif('Bell MT', 'delicate old-style serif'),
  offSerif('High Tower Text', 'graceful book serif'),
  offSerif('Cooper Black', 'soft, heavy retro serif'),
  offSerif('Elephant', 'bold, high-contrast display serif'),
  offDisplay('Copperplate Gothic Bold', 'engraved capitals'),
  offDisplay('Copperplate Gothic Light', 'light engraved capitals'),
  offDisplay('Haettenschweiler', 'ultra-condensed impact'),
  offDisplay('Bernard MT Condensed', 'condensed poster serif'),
  offDisplay('Gill Sans Ultra Bold', 'ultra heavy display'),
  offDisplay('Rockwell Extra Bold', 'heavy slab display'),
  offDisplay('Britannic Bold', 'bold wide display'),
  offScript('Palace Script MT', 'formal copperplate script'),
  offScript('Vivaldi', 'flourished script'),
  offScript('Edwardian Script ITC', 'elegant formal script'),
  offScript('Freestyle Script', 'casual brush script'),
  offScript('French Script MT', 'wedding script'),
  offScript('Kunstler Script', 'calligraphic script'),
  // Arabic: Windows and Office ---------------------------------------------------------
  arOfficeSerif('Sakkal Majalla', 'elegant modern Arabic naskh (Office headline face)'),
  arOfficeSerif('Traditional Arabic', 'classic Arabic naskh for long text'),
  arOfficeSans('Simplified Arabic', 'plain, neutral Arabic'),
  arOfficeSerif('Arabic Typesetting', 'refined calligraphic Arabic'),
  arOfficeSerif('Andalus', 'decorative Andalusian Arabic'),
  arOfficeSans('Aldhabi', 'Arabic calligraphic display'),
  arOfficeSans('Dubai', 'modern geometric Arabic and Latin sans'),
  arOfficeSans('Dubai Medium', 'medium-weight Dubai'),
  arOfficeSerif('Urdu Typesetting', 'Nastaliq for Urdu'),
  arOfficeSans('Arial Unicode MS', 'Arial with very wide script coverage'),
  // Bundled: Arabic -------------------------------------------------------------------
  webArSans('Cairo', 'modern, friendly Arabic and Latin sans (popular for UI and slides)'),
  webArSans('Tajawal', 'clean, light-feeling Arabic sans'),
  webArSans('Almarai', 'crisp, rational Arabic sans'),
  webArSans('IBM Plex Sans Arabic', 'engineered, corporate Arabic sans'),
  webArSans('Noto Sans Arabic', 'neutral, very readable Arabic sans'),
  webArSans('Readex Pro', 'readable, slightly wide Arabic sans'),
  webArSans('Alexandria', 'versatile Arabic sans with a soft modern look'),
  webArSans('Mada', 'neutral, balanced Arabic sans'),
  webArSans('Vazirmatn', 'clean Arabic and Persian sans'),
  webArSans('Rubik', 'rounded corners, friendly Arabic and Latin sans'),
  webArSans('Zain', 'compact, modern Arabic sans'),
  webArSans('Changa', 'strong, geometric Arabic display sans'),
  webArSans('Baloo Bhaijaan 2', 'round, playful Arabic sans'),
  webArSerif('Amiri', 'classical Naskh, book-like Arabic serif'),
  webArSerif('Noto Naskh Arabic', 'Naskh text face, calm and readable'),
  webArSerif('Scheherazade New', 'traditional Naskh for formal text'),
  webArSerif('Lateef', 'flowing Naskh-Nastaliq text'),
  webArSerif('Harmattan', 'compact, readable Naskh'),
  webArSerif('Markazi Text', 'editorial Arabic and Latin text serif'),
  webArSerif('Mirza', 'calligraphic Arabic for display text'),
  webArSerif('Aref Ruqaa', 'ruqaa calligraphy'),
  webArSerif('El Messiri', 'ornamental Arabic with Latin serif forms'),
  webArDisplay('Noto Kufi Arabic', 'geometric Kufi sans for titles'),
  webArDisplay('Reem Kufi', 'modern Kufi display'),
  webArDisplay('Lalezar', 'bold, rounded Arabic poster display'),
  webArDisplay('Rakkas', 'dramatic brush display'),
  webArDisplay('Katibeh', 'thin calligraphic display'),
  webArDisplay('Jomhuria', 'condensed bold display'),
  webArDisplay('Lemonada', 'friendly, rounded display'),
  webArDisplay('Blaka', 'bold, chunky Arabic display'),
  // Bundled: Latin sans ---------------------------------------------------------------
  webSans('Inter', 'neutral UI sans, very legible'),
  webSans('Roboto', 'friendly neo-grotesque'),
  webSans('Open Sans', 'open humanist sans'),
  webSans('Lato', 'warm, stable humanist sans'),
  webSans('Montserrat', 'wide geometric sans'),
  webSans('Poppins', 'geometric sans with round forms'),
  webSans('Nunito', 'rounded, soft sans'),
  webSans('Source Sans 3', 'practical, readable sans'),
  webSans('Raleway', 'elegant light geometric sans'),
  webSans('Work Sans', 'grotesque with open spacing'),
  webSans('DM Sans', 'low-contrast geometric sans'),
  webSans('Manrope', 'modern semi-condensed sans'),
  webSans('Space Grotesk', 'quirky technical grotesque'),
  webSans('Plus Jakarta Sans', 'contemporary, confident sans'),
  webSans('Outfit', 'geometric brand sans'),
  webSans('IBM Plex Sans', 'engineered corporate sans'),
  webSans('Barlow', 'slightly rounded, California highway sans'),
  webSans('Josefin Sans', 'vintage geometric, elegant'),
  webSans('Quicksand', 'rounded and light'),
  webSans('Karla', 'quirky grotesque'),
  webSans('Archivo', 'grotesque with many widths'),
  webSans('Libre Franklin', 'classic American gothic'),
  webSans('Sora', 'geometric, tech sans'),
  webSans('Lexend', 'tuned for reading ease'),
  webSans('Figtree', 'friendly geometric sans'),
  webSans('League Spartan', 'bold geometric headline sans'),
  webSans('Red Hat Display', 'warm geometric display sans'),
  webSans('Syne', 'extra-wide expressive sans'),
  // Bundled: Latin serif --------------------------------------------------------------
  webSerif('Playfair Display', 'high-contrast editorial serif'),
  webSerif('Lora', 'balanced contemporary serif'),
  webSerif('Merriweather', 'sturdy screen serif'),
  webSerif('Source Serif 4', 'versatile text serif'),
  webSerif('Libre Baskerville', 'classic Baskerville for text'),
  webSerif('Crimson Pro', 'old-style book serif'),
  webSerif('EB Garamond', 'faithful Garamond revival'),
  webSerif('Cormorant Garamond', 'delicate display Garamond'),
  webSerif('DM Serif Display', 'sharp high-contrast display serif'),
  webSerif('IBM Plex Serif', 'engineered, corporate serif'),
  webSerif('Bitter', 'slab serif for screens'),
  webSerif('Spectral', 'screen-first elegant serif'),
  webSerif('Fraunces', 'soft "wonky" old-style serif'),
  // Bundled: Latin display, script, mono ----------------------------------------------
  webDisplay('Bebas Neue', 'all-caps condensed poster'),
  webDisplay('Oswald', 'condensed gothic headline'),
  webDisplay('Anton', 'heavy condensed headline'),
  webDisplay('Abril Fatface', 'fat-face didone display'),
  webScript('Pacifico', 'surf-style brush script'),
  webScript('Caveat', 'handwritten, natural'),
  webScript('Dancing Script', 'lively connected script'),
  webScript('Lobster', 'bold retro script'),
  webMono('JetBrains Mono', 'monospace for developers'),
  webMono('Fira Code', 'monospace with ligatures'),
  webMono('Space Mono', 'quirky geometric monospace'),
];

const byName = new Map(FONT_CATALOG.map((entry) => [entry.name.toLowerCase(), entry]));

/** A catalog face by name (case-insensitive), or null. */
export function catalogFont(name: string | null | undefined): CatalogFont | null {
  const wanted = String(name ?? '').split(',')[0].trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return byName.get(wanted) ?? null;
}

/** Faces that draw Arabic letters. */
export const ARABIC_CATALOG: CatalogFont[] = FONT_CATALOG.filter((entry) => entry.arabic);

/** Groups of the catalog for a picker, in display order. */
export const FONT_GROUPS: Array<{ id: 'arabic' | 'sans' | 'serif' | 'display' | 'script' | 'mono'; label: string }> = [
  { id: 'arabic', label: 'Arabic' },
  { id: 'sans', label: 'Sans serif' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'script', label: 'Script and handwriting' },
  { id: 'mono', label: 'Monospace' },
];

/** The picker group of a face: Arabic faces (those made for Arabic) first, then by kind. */
export const groupOf = (entry: CatalogFont): (typeof FONT_GROUPS)[number]['id'] => (entry.arabic && entry.source !== 'windows' ? 'arabic' : entry.kind);

/** The CSS generic family behind a face of this kind. */
export const genericFor = (kind: FontKind): 'sans-serif' | 'serif' | 'monospace' | 'cursive' => (
  kind === 'serif' ? 'serif' : kind === 'mono' ? 'monospace' : kind === 'script' ? 'cursive' : 'sans-serif'
);

/**
 * A CSS font stack for a face: the face, a face that has Arabic letters for
 * any Arabic text in the line, then the generic family. Faces that are not in
 * the catalog get the generic `sans-serif` behind them unless `serifHint`.
 */
export function catalogStack(name: string, serifHint = false): string {
  const clean = name.replace(/['"\\;<>]/g, '').trim();
  const entry = catalogFont(clean);
  const kind: FontKind = entry?.kind ?? (serifHint ? 'serif' : 'sans');
  const generic = genericFor(kind);
  const arabicBackup = kind === 'serif' ? 'Times New Roman' : kind === 'mono' ? 'Courier New' : 'Segoe UI';
  const second = kind === 'serif' ? 'Georgia' : kind === 'mono' ? 'Consolas' : 'Segoe UI';
  const faces = [clean, second, arabicBackup, 'Tahoma'].filter((value, index, list) => value && list.indexOf(value) === index);
  return `${faces.map((value) => `'${value}'`).join(', ')}, ${generic}`;
}

/** Faces of `names` that need installing for Office to show them as the app does (not in Windows or Office). */
export function needsInstalling(names: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const name of names) {
    const entry = catalogFont(name);
    if (entry?.source === 'bundled') out.add(entry.name);
  }
  return [...out];
}
