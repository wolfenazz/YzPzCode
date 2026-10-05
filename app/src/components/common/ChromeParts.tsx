import type { ButtonHTMLAttributes, ReactNode } from 'react';
import logo from '../../assets/YzPzCodeLogo.png';

/** Product mark and wordmark. Not interactive, so it stays a window drag region. */
export const ChromeBrand = () => (
  <div className="chrome-brand">
    <img src={logo} alt="" className="chrome-brand__mark" draggable={false} />
    <span className="chrome-brand__name">YzPzCode</span>
  </div>
);

export const ChromeDivider = () => <span className="chrome-divider" aria-hidden="true" />;

interface ChromeButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name; also used as the tooltip unless `title` is given. */
  label: string;
  /** Toggle state for panel buttons. Leave undefined for plain actions. */
  pressed?: boolean;
  /** Small count shown over the icon, e.g. changed files. */
  badge?: ReactNode;
  children: ReactNode;
}

export const ChromeButton = ({
  label,
  pressed,
  badge,
  title,
  className = '',
  children,
  ...rest
}: ChromeButtonProps) => (
  <button
    type="button"
    className={`chrome-btn ${className}`.trim()}
    title={title ?? label}
    aria-label={label}
    aria-pressed={pressed}
    {...rest}
  >
    {children}
    {badge ? <span className="chrome-btn__badge">{badge}</span> : null}
  </button>
);
