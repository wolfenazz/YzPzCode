import type { CSSProperties, ReactNode } from 'react';
import type { CursorSize, CursorStyleId } from '../../../types';
import './cursor.css';

/**
 * Custom cursor styles.
 *
 * Every style draws its glyph around the pointer hotspot (the layer origin). The engine in
 * `CustomCursor.tsx` moves the layer with the mouse and switches `data-mode`
 * (default / interactive / text / resize-x / resize-y / disabled) and `.is-pressed`; the CSS
 * in `cursor.css` does the per-style reactions. The caret, resize arrows and "not allowed"
 * badge are shared by all styles (see `SharedParts`).
 *
 * A `.cc-follower` wrapper is moved by the engine with easing, which is what gives rings,
 * halos and trails their lag. In settings previews it is placed at a fixed offset instead.
 */

type Offset = readonly [number, number];

export interface CursorStyleDef {
  id: CursorStyleId;
  name: string;
  description: string;
  /** Moves the glyph so it looks centred in the settings preview (the hotspot is its origin). */
  previewShift?: Offset;
  render: (preview: boolean) => ReactNode;
}

export const CURSOR_SIZE_SCALE: Record<CursorSize, number> = {
  small: 0.85,
  medium: 1,
  large: 1.3,
};

interface FollowerProps {
  k: number;
  preview: boolean;
  offset?: Offset;
  children: ReactNode;
}

const Follower = ({ k, preview, offset = [0, 0], children }: FollowerProps) => (
  <span
    className="cc-follower"
    data-k={k}
    style={preview ? { transform: `translate3d(${offset[0]}px, ${offset[1]}px, 0)` } : undefined}
  >
    {children}
  </span>
);

/** Classic arrow, tip at (3, 2). */
const ARROW_PATH = 'M3 2.2 L3 19.2 L7.4 15.2 L10.2 21.4 L13.2 20.1 L10.4 13.9 L16.4 13.6 Z';

/* Generated from a 12×19 bitmap: `fill` is the arrow, `edge` its 1px outline. */
const PIXEL_FILL =
  'M1 1h1v1h-1zM1 2h2v1h-2zM1 3h3v1h-3zM1 4h4v1h-4zM1 5h5v1h-5zM1 6h6v1h-6zM1 7h7v1h-7zM1 8h8v1h-8zM1 9h9v1h-9zM1 10h10v1h-10zM1 11h11v1h-11zM1 12h12v1h-12zM1 13h7v1h-7zM1 14h3v1h-3zM5 14h3v1h-3zM1 15h2v1h-2zM5 15h3v1h-3zM1 16h1v1h-1zM6 16h3v1h-3zM6 17h3v1h-3zM7 18h3v1h-3zM7 19h3v1h-3z';
const PIXEL_EDGE =
  'M0 0h3v1h-3zM0 1h1v1h-1zM2 1h2v1h-2zM0 2h1v1h-1zM3 2h2v1h-2zM0 3h1v1h-1zM4 3h2v1h-2zM0 4h1v1h-1zM5 4h2v1h-2zM0 5h1v1h-1zM6 5h2v1h-2zM0 6h1v1h-1zM7 6h2v1h-2zM0 7h1v1h-1zM8 7h2v1h-2zM0 8h1v1h-1zM9 8h2v1h-2zM0 9h1v1h-1zM10 9h2v1h-2zM0 10h1v1h-1zM11 10h2v1h-2zM0 11h1v1h-1zM12 11h2v1h-2zM0 12h1v1h-1zM13 12h1v1h-1zM0 13h1v1h-1zM8 13h6v1h-6zM0 14h1v1h-1zM4 14h1v1h-1zM8 14h1v1h-1zM0 15h1v1h-1zM3 15h2v1h-2zM8 15h2v1h-2zM0 16h1v1h-1zM2 16h4v1h-4zM9 16h1v1h-1zM0 17h3v1h-3zM5 17h1v1h-1zM9 17h2v1h-2zM5 18h2v1h-2zM10 18h1v1h-1zM6 19h1v1h-1zM10 19h1v1h-1zM6 20h5v1h-5z';

const COMET_TRAIL: ReadonlyArray<{ k: number; size: number; opacity: number; offset: Offset }> = [
  { k: 0.4, size: 6, opacity: 0.6, offset: [-7, 4] },
  { k: 0.32, size: 5.2, opacity: 0.48, offset: [-14, 8] },
  { k: 0.25, size: 4.4, opacity: 0.38, offset: [-20, 11] },
  { k: 0.19, size: 3.6, opacity: 0.28, offset: [-26, 14] },
  { k: 0.14, size: 2.8, opacity: 0.2, offset: [-31, 16] },
  { k: 0.1, size: 2, opacity: 0.12, offset: [-36, 18] },
];

export const CURSOR_STYLES: ReadonlyArray<CursorStyleDef> = [
  {
    id: 'dot-ring',
    name: 'Dot & Ring',
    description: 'A precise dot with a ring that trails behind and swells over buttons.',
    render: (preview) => (
      <>
        <Follower k={0.22} preview={preview}>
          <span className="cc-part cc-ring" />
        </Follower>
        <span className="cc-part cc-dot" />
      </>
    ),
  },
  {
    id: 'pointer',
    name: 'Pointer',
    description: 'A crisp modern arrow that tilts and glows over clickable things.',
    previewShift: [-6, -9],
    render: () => (
      <svg className="cc-part cc-arrow" viewBox="0 0 24 24" focusable="false">
        <path d={ARROW_PATH} />
      </svg>
    ),
  },
  {
    id: 'reticle',
    name: 'Reticle',
    description: 'The original crosshair, refined: brackets, ticks and a pulse on click.',
    render: () => (
      <>
        <svg className="cc-part cc-reticle" viewBox="0 0 32 32" focusable="false">
          <path className="cc-reticle-brackets" d="M11 4H4v7 M21 4h7v7 M28 21v7h-7 M11 28H4v-7" />
          <path className="cc-reticle-ticks" d="M16 1v7 M16 24v7 M1 16h7 M24 16h7" />
          <circle className="cc-reticle-core" cx="16" cy="16" r="2" />
        </svg>
        <span className="cc-part cc-pulse" />
      </>
    ),
  },
  {
    id: 'comet',
    name: 'Comet',
    description: 'A glowing head with a fading tail that follows every move.',
    previewShift: [18, -10],
    render: (preview) => (
      <>
        {COMET_TRAIL.map(({ k, size, opacity, offset }) => (
          <Follower k={k} key={k} offset={offset} preview={preview}>
            <span
              className="cc-part cc-trail"
              style={{ '--s': `${size}px`, '--cc-o': opacity } as CSSProperties}
            />
          </Follower>
        ))}
        <span className="cc-part cc-comet-head" />
      </>
    ),
  },
  {
    id: 'halo',
    name: 'Halo',
    description: 'A soft glow drifts after a tiny dot, then tightens on targets.',
    render: (preview) => (
      <>
        <Follower k={0.16} preview={preview}>
          <span className="cc-part cc-halo" />
        </Follower>
        <span className="cc-part cc-halo-dot" />
      </>
    ),
  },
  {
    id: 'orbit',
    name: 'Orbit',
    description: 'A satellite circles the pointer and speeds up over buttons.',
    render: (preview) => (
      <>
        <Follower k={0.28} preview={preview}>
          <span className="cc-part cc-orbit">
            <span className="cc-orbit__spin">
              <span className="cc-orbit__sat" />
            </span>
          </span>
        </Follower>
        <span className="cc-part cc-orbit-dot" />
      </>
    ),
  },
  {
    id: 'pixel',
    name: 'Pixel',
    description: 'A chunky retro arrow with hard pixel edges.',
    previewShift: [-9, -14],
    render: () => (
      <svg className="cc-part cc-pixel" viewBox="0 0 14 21" focusable="false">
        <path className="cc-pixel__edge" d={PIXEL_EDGE} />
        <path className="cc-pixel__fill" d={PIXEL_FILL} />
      </svg>
    ),
  },
  {
    id: 'block',
    name: 'Terminal Block',
    description: 'A blinking block, like a shell prompt. It narrows to a caret over text.',
    previewShift: [-4, 0],
    render: () => (
      <span className="cc-part cc-block">
        <span className="cc-block__fill" />
      </span>
    ),
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'An outlined diamond that fills and turns over interactive elements.',
    render: () => (
      <>
        <span className="cc-part cc-diamond" />
        <span className="cc-part cc-diamond-dot" />
      </>
    ),
  },
  {
    id: 'plus',
    name: 'Plus',
    description: 'A minimal cross with a gap in the middle. It becomes an × on targets.',
    render: () => (
      <svg className="cc-part cc-plus" viewBox="0 0 24 24" focusable="false">
        <path className="cc-plus__halo" d="M12 3v6 M12 15v6 M3 12h6 M15 12h6" />
        <path className="cc-plus__line" d="M12 3v6 M12 15v6 M3 12h6 M15 12h6" />
        <circle className="cc-plus__dot" cx="12" cy="12" r="1.25" />
      </svg>
    ),
  },
];

export const DEFAULT_CURSOR_STYLE: CursorStyleId = 'dot-ring';

export const getCursorStyle = (id: string): CursorStyleDef =>
  CURSOR_STYLES.find((style) => style.id === id) ?? CURSOR_STYLES[0];

const RESIZE_ARROWS = 'M3 12h18 M7.5 7.5L3 12l4.5 4.5 M16.5 7.5L21 12l-4.5 4.5';

/** Caret (text), resize arrows and not-allowed badge: one look for every style. */
const SharedParts = () => (
  <>
    <span className="cc-part cc-caret" />
    <svg className="cc-part cc-resize" viewBox="0 0 24 24" focusable="false">
      <path className="cc-resize__halo" d={RESIZE_ARROWS} />
      <path className="cc-resize__arrows" d={RESIZE_ARROWS} />
    </svg>
    <span className="cc-part cc-ban" />
  </>
);

interface CursorGlyphProps {
  id: CursorStyleId;
  /** Static rendering for the settings picker (followers sit at fixed offsets). */
  preview?: boolean;
}

export const CursorGlyph = ({ id, preview = false }: CursorGlyphProps) => (
  <div className="cc-scale">
    {getCursorStyle(id).render(preview)}
    <SharedParts />
  </div>
);
