import React from 'react';
import { catalogFont, FONT_CATALOG, FONT_GROUPS, groupOf } from '../../utils/writing/fontCatalog';

interface FontOptionsProps {
  /** Faces the deck already uses; listed first, under "In this deck". */
  current?: string[];
}

/** Strips script suffixes Office adds to theme fonts, e.g. `(West European)`. */
const clean = (name: string): string => name.replace(/\s*\((?:West(?:ern)?\s*European|East(?:ern)?\s*European|Complex\s*Script|All\s*Scripts|Headings?|Body|Latin|Theme)\)/gi, '').trim();

const label = (family: string): string => {
  const entry = catalogFont(family);
  return `${clean(family) || family}${entry?.source === 'bundled' ? '  · app' : ''}`;
};

const faceStyle = (family: string): React.CSSProperties => ({ fontFamily: `'${family.replace(/'/g, '')}'` });

/**
 * `<optgroup>`s for a font `<select>`: the deck's own faces, then the whole
 * catalog by kind (Arabic faces first). A face marked "app" is packaged with
 * YzPzCode: it draws in the app and in PDF / PNG / HTML, and a .pptx needs it
 * installed to show it.
 */
export const FontOptions: React.FC<FontOptionsProps> = ({ current = [] }) => {
  const used = [...new Set(current.filter(Boolean))];
  return (
    <>
      {used.length > 0 && (
        <optgroup label="In this deck">
          {used.map((family) => <option key={`used-${family}`} value={family} style={faceStyle(family)}>{label(family)}</option>)}
        </optgroup>
      )}
      {FONT_GROUPS.map((group) => {
        const entries = FONT_CATALOG.filter((entry) => groupOf(entry) === group.id && !used.includes(entry.name));
        if (entries.length === 0) return null;
        return (
          <optgroup key={group.id} label={group.label}>
            {entries.map((entry) => <option key={entry.name} value={entry.name} style={faceStyle(entry.name)} title={entry.character}>{label(entry.name)}</option>)}
          </optgroup>
        );
      })}
    </>
  );
};
