import { useState } from 'react';
import type { ElementType } from 'react';
import { Check, Moon, Sun } from '@phosphor-icons/react';
import type { CustomThemeBase, CustomThemeColors } from '../../../types';
import { THEME_COLOR_KEYS, THEME_PRESETS, themeSwatches } from '../../../utils/customTheme';
import type { ThemePresetGroup } from '../../../utils/customTheme';
import { OptionCard, Segmented, SettingsBlock, SettingsGroup } from '../SettingsKit';

type Filter = 'all' | CustomThemeBase;

const FILTERS: ReadonlyArray<{ value: Filter; label: string; icon?: ElementType }> = [
  { value: 'all', label: 'All' },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
];

const GROUPS: ReadonlyArray<{ id: ThemePresetGroup; title: string }> = [
  { id: 'built-in', title: 'Built-in' },
  { id: 'platform', title: 'Platforms and brands' },
  { id: 'editor', title: 'Editor classics' },
];

interface ThemePaletteGalleryProps {
  base: CustomThemeBase;
  colors: CustomThemeColors;
  onPick: (presetId: string) => void;
}

/** Browse ready-made palettes. Picking one replaces the draft's colors and mode. */
export const ThemePaletteGallery = ({ base, colors, onPick }: ThemePaletteGalleryProps) => {
  const [filter, setFilter] = useState<Filter>('all');
  const visible = THEME_PRESETS.filter((preset) => filter === 'all' || preset.base === filter);

  return (
    <SettingsGroup
      action={<Segmented label="Filter palettes" onChange={setFilter} options={FILTERS} value={filter} />}
      description="Start from a ready-made palette, then adjust any color. Picking one replaces your colors; your name and corner radius are kept."
      title={`Palettes · ${visible.length}`}
    >
      <SettingsBlock>
        <div className="st-palettes">
          {GROUPS.map((group) => {
            const items = visible.filter((preset) => preset.group === group.id);
            if (items.length === 0) return null;
            return (
              <section key={group.id}>
                <h3 className="st-palettes__title">{group.title}</h3>
                <div aria-label={group.title} className="st-options st-palettes__grid" role="group">
                  {items.map((preset) => {
                    const selected =
                      preset.base === base && THEME_COLOR_KEYS.every((key) => preset.colors[key] === colors[key]);
                    return (
                      <OptionCard
                        hint={`${preset.name}: ${preset.description}`}
                        key={preset.id}
                        onSelect={() => onPick(preset.id)}
                        preview={
                          <span aria-hidden="true" className="st-option__preview">
                            {themeSwatches(preset).map((color, index) => (
                              <span key={`${color}-${index}`} style={{ backgroundColor: color }} />
                            ))}
                          </span>
                        }
                        selected={selected}
                        title={preset.name}
                        trailing={selected ? <Check size={14} weight="bold" aria-hidden="true" /> : undefined}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </SettingsBlock>
    </SettingsGroup>
  );
};
