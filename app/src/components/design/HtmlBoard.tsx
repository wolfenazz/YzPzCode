import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { bundledFontFaceCss } from '../../utils/bundledFonts';
import { tokensToCss } from '../../utils/design/tokensCss';
import { rootAttributes, tweakAttributes, tweakVariables, type Tweak, type TweakValues } from '../../utils/design/tweaks';
import { joinPath } from '../../utils/design/project';
import type { BoardTheme, DesignTokens } from '../../utils/design/types';
import { localFileUrl } from '../../utils/mediaFiles';

const PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 5"><rect width="8" height="5" fill="#d4d4d8"/></svg>')}`;

interface HtmlBoardProps {
  /** Sanitized markup: styles, then the page body. */
  source: string;
  tokens: DesignTokens;
  width: number;
  height: number;
  projectDir: string;
  /** While a text is edited in place the frame takes the pointer and keys. */
  editable?: boolean;
  /** Which palette the screen is drawn with. */
  theme?: BoardTheme;
  /** The board's tweaks and their values; changing a value repaints the open frame without reloading it. */
  tweaks?: Tweak[];
  tweakValues?: TweakValues;
  /** A web page: the board's height follows its content, up and down (it reflows when the width changes). */
  fit?: boolean;
  /** A graphic: the canvas has exactly this size and never grows to its content. */
  fixed?: boolean;
  /** Called with the height of the content when it is taller than the board. */
  onHeight: (height: number) => void;
}

/** The document an app screen or web page is shown in: the system's variables and fonts, then the drawing. */
export function boardDocument(source: string, tokens: DesignTokens, width: number, projectDir: string, fontCss: string, theme: BoardTheme = 'light', fit = false, rootAttrs = '', fixedHeight = 0): string {
  const resolved = source
    .replace(/(src="|url\(")(assets\/[^"]+)(")/g, (_match, open: string, path: string, close: string) => `${open}${localFileUrl(joinPath(projectDir, path))}${close}`)
    .replace(/(src="|url\(")photo:[^"]*(")/g, (_match, open: string, close: string) => `${open}${PLACEHOLDER}${close}`);
  return [
    `<!doctype html><html${theme === 'dark' && tokens.darkPalette ? ' data-theme="dark"' : ''}${rootAttrs}><head><meta charset="utf-8">`,
    // No script can run in the frame (no allow-scripts); this also stops anything from being fetched.
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: http: https:; font-src data: http: https:; style-src \'unsafe-inline\'">',
    `<style>${fontCss}\n${tokensToCss(tokens)}`,
    `*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}body{width:${width}px;${fixedHeight ? `height:${fixedHeight}px;overflow:hidden;min-height:0;` : `min-height:${fit ? '0' : '100vh'};`}background:var(--ds-background);color:var(--ds-text);font-family:var(--ds-font-body);font-size:var(--ds-size-body);line-height:var(--ds-line-height);-webkit-font-smoothing:antialiased}img{max-width:100%}a{color:inherit}</style>`,
    `</head><body>${resolved}</body></html>`,
  ].join('');
}

/** A script-less sandboxed frame at the board's natural size; the canvas scales it. */
export const HtmlBoard: React.FC<HtmlBoardProps> = memo(function HtmlBoard({ source, tokens, width, height, projectDir, editable, theme = 'light', fit = false, fixed = false, tweaks, tweakValues, onHeight }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [fontCss, setFontCss] = useState('');
  const families = `${tokens.fonts.heading}|${tokens.fonts.body}`;

  useEffect(() => {
    let alive = true;
    bundledFontFaceCss(families.split('|')).then((css) => { if (alive) setFontCss(css); }).catch(() => undefined);
    return () => { alive = false; };
  }, [families]);

  // The frame is built with the values as they are; later changes are written into it live.
  const rootAttrs = rootAttributes(tweaks, tweakValues);
  const rootAttrsRef = useRef(rootAttrs);
  rootAttrsRef.current = rootAttrs;
  const doc = useMemo(() => boardDocument(source, tokens, width, projectDir, fontCss, theme, fit, rootAttrsRef.current, fixed ? height : 0), [fit, fixed, fontCss, height, projectDir, source, theme, tokens, width]);

  useEffect(() => {
    const root = frame.current?.contentDocument?.documentElement;
    if (!root) return undefined;
    for (const name of Array.from(root.getAttributeNames())) if (name.startsWith('data-tw-')) root.removeAttribute(name);
    for (let at = root.style.length - 1; at >= 0; at -= 1) {
      const name = root.style.item(at);
      if (name.startsWith('--tw-')) root.style.removeProperty(name);
    }
    for (const [name, value] of Object.entries(tweakAttributes(tweaks ?? [], tweakValues ?? {}))) root.setAttribute(name, value);
    for (const [name, value] of Object.entries(tweakVariables(tweaks ?? [], tweakValues ?? {}))) root.style.setProperty(name, value);
    if (!fit) return undefined;
    const timer = window.setTimeout(measure, 60);
    return () => window.clearTimeout(timer);
  }, [rootAttrs]); // eslint-disable-line react-hooks/exhaustive-deps

  const measure = (): void => {
    const document = frame.current?.contentDocument;
    if (!document || fixed) return;
    if (fit) {
      const content = Math.min(8000, Math.max(200, Math.ceil(document.body?.offsetHeight ?? 0)));
      if (Math.abs(content - height) > 1) onHeight(content);
      return;
    }
    const content = Math.ceil(document.documentElement.scrollHeight);
    if (content > height + 1) onHeight(Math.min(8000, content));
  };

  // A width change reflows the page; measure again once the frame has laid out.
  useEffect(() => {
    if (!fit) return undefined;
    const timer = window.setTimeout(measure, 80);
    return () => window.clearTimeout(timer);
  }, [fit, doc]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <iframe
      ref={frame}
      title="Design board"
      sandbox="allow-same-origin"
      srcDoc={doc}
      onLoad={measure}
      style={{ width, height, border: 0, display: 'block', background: theme === 'dark' && tokens.darkPalette ? tokens.darkPalette.background : tokens.palette.background, pointerEvents: editable ? 'auto' : 'none' }}
    />
  );
});
