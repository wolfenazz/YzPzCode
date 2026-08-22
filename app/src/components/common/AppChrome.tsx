import type { ReactNode } from 'react';
import { ArrowLeft, GearSix, BookOpenText, Minus, Square, X } from '@phosphor-icons/react';
import { useTitlebarDrag } from '../../hooks/useTitlebarDrag';
import { ThemeModeToggle } from './ThemeModeToggle';
import logo from '../../assets/YzPzCodeLogo.png';

interface ChromeActionProps {
  label: string;
  onClick: () => void;
  icon: ReactNode;
}

const ChromeAction = ({ label, onClick, icon }: ChromeActionProps) => (
  <button className="app-icon-button" onClick={onClick} title={label} type="button">
    {icon}
    <span className="sr-only">{label}</span>
  </button>
);

interface AppChromeProps {
  title?: string;
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
  title = 'YzPzCode',
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
    <header ref={titlebarRef} className="app-chrome select-none">
      <div className="app-chrome__section">
        {onBack ? (
          <div className="pl-2">
            <ChromeAction icon={<ArrowLeft size={16} weight="regular" />} label="Go back" onClick={onBack} />
          </div>
        ) : null}
        <div className="app-chrome__brand">
          <span className="app-chrome__mark" aria-hidden="true">
            <img src={logo} alt="" />
          </span>
          <span className="app-chrome__title">{title}</span>
        </div>
        {onDocs ? (
          <ChromeAction icon={<BookOpenText size={16} weight="regular" />} label="Documentation" onClick={onDocs} />
        ) : null}
      </div>

      <div className="app-chrome__section flex-1 justify-center px-3">{center}</div>

      <div className="app-chrome__section gap-1 pr-2">
        {actions}
        <ThemeModeToggle />
        {onSettings ? (
          <ChromeAction icon={<GearSix size={16} weight="regular" />} label="Settings" onClick={onSettings} />
        ) : null}
        {isWindows && onMinimize && onMaximize && onClose ? (
          <div className="ml-1 flex h-full items-center gap-0.5 border-l border-[var(--border-primary)] pl-2">
            <ChromeAction icon={<Minus size={14} />} label="Minimize" onClick={onMinimize} />
            <ChromeAction icon={<Square size={11} />} label="Maximize" onClick={onMaximize} />
            <ChromeAction icon={<X size={14} />} label="Close" onClick={onClose} />
          </div>
        ) : null}
      </div>
    </header>
  );
};