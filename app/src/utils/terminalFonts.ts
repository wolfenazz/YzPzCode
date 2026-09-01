/**
 * xterm 6's DOM renderer needs a monospace fallback that includes the Unicode
 * blocks used by modern terminal UIs. Cascadia Mono is bundled with those
 * glyphs, so it remains available even when a selected font has a narrower
 * character set.
 */
export const getTerminalFontStack = (fontFamily: string): string => {
  const configuredFont = fontFamily.trim();
  const fallbacks = '"Cascadia Mono", Consolas, monospace';

  return configuredFont ? `${configuredFont}, ${fallbacks}` : fallbacks;
};
