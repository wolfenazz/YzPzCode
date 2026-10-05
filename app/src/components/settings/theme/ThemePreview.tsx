import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { FileCode, Folder, GitBranch } from '@phosphor-icons/react';
import type { CustomTheme } from '../../../types';
import { buildTerminalPalette, buildThemeTokens, getThemeColorScheme } from '../../../utils/customTheme';

type PreviewTheme = Pick<CustomTheme, 'name' | 'base' | 'colors' | 'radius'>;

/**
 * A miniature workspace painted with the draft theme. The theme's tokens are set
 * as inline custom properties on the root, so everything inside resolves them
 * locally and the real app is untouched until the theme is saved.
 */
export const ThemePreview = ({ theme }: { theme: PreviewTheme }) => {
  const style = useMemo(
    () => ({ ...buildThemeTokens(theme), colorScheme: getThemeColorScheme(theme) }) as CSSProperties,
    [theme],
  );
  const terminal = useMemo(() => buildTerminalPalette(theme), [theme]);

  return (
    <div aria-label={`Preview of the ${theme.name} theme`} className="st-themeprev" role="img" style={style}>
      <div className="st-themeprev__bar">
        <span className="st-themeprev__dots">
          <i />
          <i />
          <i />
        </span>
        <span>my-project</span>
        <span className="st-themeprev__branch">
          <GitBranch size={10} aria-hidden="true" />
          main
        </span>
      </div>

      <div className="st-themeprev__body">
        <div className="st-themeprev__side">
          <p className="st-themeprev__label">EXPLORER</p>
          <span className="st-themeprev__item">
            <Folder size={11} aria-hidden="true" />
            src
          </span>
          <span className="st-themeprev__item is-active">
            <FileCode size={11} aria-hidden="true" />
            App.tsx
          </span>
          <span className="st-themeprev__item is-hover">
            <FileCode size={11} aria-hidden="true" />
            theme.ts
          </span>
          <span className="st-themeprev__item">
            <FileCode size={11} aria-hidden="true" />
            index.css
          </span>
        </div>

        <div className="st-themeprev__main">
          <div className="st-themeprev__tabs">
            <span className="st-themeprev__tab is-active">App.tsx</span>
            <span className="st-themeprev__tab">theme.ts</span>
          </div>
          <div className="st-themeprev__code">
            <div>
              <span className="k">import</span> {'{ theme }'} <span className="k">from</span> <span className="s">'./theme'</span>;
            </div>
            <div className="c">// Looks sharp in any light</div>
            <div>
              <span className="k">export const</span> accent = theme.accent;
            </div>
          </div>
          <div className="st-themeprev__term" style={{ background: terminal.background, color: terminal.foreground }}>
            <div>
              <span style={{ color: terminal.cursor }}>❯</span> npm run build
            </div>
            <div>
              <span style={{ color: 'var(--destructive)' }}>error</span> Missing semicolon
            </div>
          </div>
        </div>
      </div>

      <div className="st-themeprev__foot">
        <span className="st-themeprev__btn st-themeprev__btn--primary">Primary</span>
        <span className="st-themeprev__btn">Secondary</span>
        <span className="st-themeprev__btn st-themeprev__btn--danger">Delete</span>
        <span className="st-themeprev__badge">Accent</span>
      </div>
    </div>
  );
};
