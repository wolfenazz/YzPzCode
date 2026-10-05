import React from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, BookOpenText, CaretRight, GearSix } from '@phosphor-icons/react';
import { useTitlebarDrag } from '../../hooks/useTitlebarDrag';
import { ChromeBrand, ChromeButton, ChromeDivider } from './ChromeParts';
import { ThemeModeToggle } from './ThemeModeToggle';
import { WindowControls } from './WindowControls';

interface AppChromeProps {
  /** Where the user is inside the app, shown after the brand: Settings › Appearance. */
  crumbs?: string[];
  isWindows?: boolean;
  onBack?: () => void;
  onDocs?: () => void;
  onSettings?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  center?: ReactNode;
  actions?: ReactNode;
}

export const AppChrome = ({
  crumbs = [],
  isWindows = false,
  onBack,
  onDocs,
  onSettings,
  onMinimize,
  onMaximize,
  onClose,
  center,
  actions,
}: AppChromeProps) => {
  const titlebarRef = useTitlebarDrag<HTMLElement>();

  return (
    <header ref={titlebarRef} className="chrome">
      <div className="chrome__start">
        {onBack ? (
          <ChromeButton label="Back" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
          </ChromeButton>
        ) : null}
        <ChromeBrand />
        {crumbs.length > 0 ? (
          <nav className="chrome-crumbs" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb}-${index}`}>
                <CaretRight size={11} className="chrome-crumbs__sep" aria-hidden="true" />
                <span
                  className="chrome-crumbs__item"
                  aria-current={index === crumbs.length - 1 ? 'page' : undefined}
                >
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </nav>
        ) : center ? (
          <ChromeDivider />
        ) : null}
      </div>

      <div className="chrome__center">{center}</div>

      <div className="chrome__end">
        {actions}
        {onDocs ? (
          <ChromeButton label="Documentation" onClick={onDocs}>
            <BookOpenText size={16} aria-hidden="true" />
          </ChromeButton>
        ) : null}
        <ThemeModeToggle />
        {onSettings ? (
          <ChromeButton label="Settings" onClick={onSettings}>
            <GearSix size={16} aria-hidden="true" />
          </ChromeButton>
        ) : null}
      </div>

      {isWindows && onMinimize && onMaximize && onClose ? (
        <WindowControls onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />
      ) : null}
    </header>
  );
};
