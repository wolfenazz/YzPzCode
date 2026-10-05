import { useId, useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ElementType, ReactNode } from 'react';
import {
  CaretDown,
  CheckCircle,
  Info,
  SpinnerGap,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import './settings.css';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

/* ── Page structure ───────────────────────────────────────────────────── */

export const SettingsStack = ({ children }: { children: ReactNode }) => (
  <div className="st-stack">{children}</div>
);

interface SettingsTabItem<T extends string> {
  id: T;
  label: string;
  icon?: ElementType;
  count?: number | string;
}

interface SettingsTabsProps<T extends string> {
  tabs: ReadonlyArray<SettingsTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  label?: string;
}

export function SettingsTabs<T extends string>({ tabs, value, onChange, label = 'Sections' }: SettingsTabsProps<T>) {
  return (
    <div className="st-tabs" role="tablist" aria-label={label}>
      {tabs.map(({ id, label: tabLabel, icon: Icon, count }) => (
        <button
          aria-selected={value === id}
          className="st-tab"
          key={id}
          onClick={() => onChange(id)}
          role="tab"
          type="button"
        >
          {Icon && <Icon size={15} aria-hidden="true" />}
          {tabLabel}
          {count !== undefined && <span className="st-tab__count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

interface SettingsGroupProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export const SettingsGroup = ({ title, description, action, footer, children }: SettingsGroupProps) => (
  <section>
    {(title || action) && (
      <div className="st-group__head">
        <div>
          {title && <h2 className="st-group__title">{title}</h2>}
          {description && <p className="st-group__desc">{description}</p>}
        </div>
        {action}
      </div>
    )}
    <div className="st-card">{children}</div>
    {footer && <p className="st-group__foot">{footer}</p>}
  </section>
);

interface SettingsRowProps {
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Draw the icon without its tinted tile (for status marks). */
  iconBare?: boolean;
  badge?: ReactNode;
  children?: ReactNode;
  top?: boolean;
  nested?: boolean;
  as?: 'div' | 'a';
  href?: string;
}

/** A single setting: text on the left, its control on the right. */
export const SettingsRow = ({
  label,
  description,
  icon,
  iconBare,
  badge,
  children,
  top,
  nested,
  as = 'div',
  href,
}: SettingsRowProps) => {
  const className = cx('st-row', top && 'st-row--top', nested && 'st-row--nested', as === 'a' && 'is-link');
  const body = (
    <>
      <div className="st-row__lead">
        {icon && <span className={cx('st-row__icon', iconBare && 'st-row__icon--bare')}>{icon}</span>}
        <div className="st-row__text">
          <p className="st-row__label">
            {label}
            {badge}
          </p>
          {description && <p className="st-row__desc">{description}</p>}
        </div>
      </div>
      {children && <div className="st-row__control">{children}</div>}
    </>
  );
  if (as === 'a') {
    return (
      <a className={className} href={href} rel="noopener noreferrer" target="_blank">
        {body}
      </a>
    );
  }
  return <div className={className}>{body}</div>;
};

/** Free-form content that sits inside a card, below the rows. */
export const SettingsBlock = ({ children }: { children: ReactNode }) => (
  <div className="st-row__extra">{children}</div>
);

/* ── Controls ─────────────────────────────────────────────────────────── */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export const Switch = ({ checked, onChange, label, disabled }: SwitchProps) => (
  <button
    aria-checked={checked}
    aria-label={label}
    className="st-switch"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    role="switch"
    type="button"
  />
);

interface ToggleRowProps extends Omit<SettingsRowProps, 'children'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const ToggleRow = ({ checked, onChange, disabled, ...row }: ToggleRowProps) => (
  <SettingsRow {...row}>
    <Switch
      checked={checked}
      disabled={disabled}
      label={typeof row.label === 'string' ? row.label : 'Toggle setting'}
      onChange={onChange}
    />
  </SettingsRow>
);

interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  icon?: ElementType;
}

interface SegmentedProps<T extends string | number> {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  label?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number>({ value, options, onChange, label, disabled }: SegmentedProps<T>) {
  return (
    <div aria-label={label} className="st-segmented" role="group">
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <button
          aria-pressed={value === optionValue}
          className="st-segmented__item"
          disabled={disabled}
          key={String(optionValue)}
          onClick={() => onChange(optionValue)}
          type="button"
        >
          {Icon && <Icon size={14} aria-hidden="true" />}
          {optionLabel}
        </button>
      ))}
    </div>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  label: string;
  disabled?: boolean;
}

export const Slider = ({ value, min, max, step = 1, onChange, format, label, disabled }: SliderProps) => {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="st-slider">
      <input
        aria-label={label}
        className="st-slider__input"
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        style={{ '--st-fill': `${fill}%` } as CSSProperties}
        type="range"
        value={value}
      />
      <output className="st-slider__value">{format ? format(value) : value}</output>
    </div>
  );
};

interface SliderRowProps extends Omit<SliderProps, 'label'>, Omit<SettingsRowProps, 'children'> {}

export const SliderRow = ({ value, min, max, step, onChange, format, disabled, ...row }: SliderRowProps) => (
  <SettingsRow {...row}>
    <Slider
      disabled={disabled}
      format={format}
      label={typeof row.label === 'string' ? row.label : 'Value'}
      max={max}
      min={min}
      onChange={onChange}
      step={step}
      value={value}
    />
  </SettingsRow>
);

type ButtonVariant ='default' | 'primary' | 'ghost' | 'danger' | 'danger-solid';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: ElementType;
  loading?: boolean;
  iconOnly?: boolean;
  iconWeight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
}

export const Button = ({
  variant = 'default',
  size = 'md',
  icon: Icon,
  loading,
  iconOnly,
  iconWeight,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) => (
  <button
    {...rest}
    className={cx(
      'st-btn',
      variant !== 'default' && `st-btn--${variant}`,
      size === 'sm' && 'st-btn--sm',
      iconOnly && 'st-btn--icon',
    )}
    disabled={disabled || loading}
    type={type}
  >
    {loading ? (
      <SpinnerGap className="st-spin" size={14} aria-hidden="true" />
    ) : (
      Icon && <Icon size={14} weight={iconWeight} aria-hidden="true" />
    )}
    {children}
  </button>
);

export const Badge = ({ tone = 'neutral', dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) => (
  <span className={cx('st-badge', tone !== 'neutral' && `st-badge--${tone}`)}>
    {dot && <span className={cx('st-dot', tone !== 'neutral' && tone !== 'accent' && `st-dot--${tone}`)} />}
    {children}
  </span>
);

export const StatusDot = ({ tone = 'neutral', title }: { tone?: Tone; title?: string }) => (
  <span
    className={cx('st-dot', tone !== 'neutral' && tone !== 'accent' && `st-dot--${tone}`)}
    role={title ? 'img' : undefined}
    aria-label={title}
    title={title}
  />
);

interface NoticeProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
  action?: ReactNode;
}

const NOTICE_ICONS = {
  info: Info,
  success: CheckCircle,
  warning: Warning,
  danger: WarningCircle,
} as const;

export const Notice = ({ tone = 'info', children, action }: NoticeProps) => {
  const Icon = NOTICE_ICONS[tone];
  return (
    <div className={cx('st-notice', `st-notice--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={16} weight="fill" aria-hidden="true" />
      <div className="st-notice__body">{children}</div>
      {action}
    </div>
  );
};

/* ── Form fields ──────────────────────────────────────────────────────── */

interface FieldProps {
  label: string;
  hint?: ReactNode;
  full?: boolean;
  children: (id: string) => ReactNode;
}

export const Field = ({ label, hint, full, children }: FieldProps) => {
  const id = useId();
  return (
    <div className={cx('st-field', full && 'st-field--full')}>
      <label className="st-field__label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint && <span className="st-field__hint">{hint}</span>}
    </div>
  );
};

export const ColorInput = ({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) => (
  <label className="st-color">
    <input aria-label={label} onChange={(event) => onChange(event.target.value)} type="color" value={value} />
    <span className="st-color__hex">{value.toUpperCase()}</span>
  </label>
);

/* ── Selectable option cards ──────────────────────────────────────────── */

interface OptionCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: string;
  preview?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  hint?: string;
}

export const OptionCard = ({ selected, onSelect, title, subtitle, preview, icon, trailing, hint }: OptionCardProps) => (
  <button
    aria-pressed={selected}
    className={cx('st-option', !preview && 'st-option--row')}
    onClick={onSelect}
    title={hint}
    type="button"
  >
    {preview}
    {!preview && icon}
    {preview ? (
      <span className="st-option__name">
        {icon}
        {title}
        {trailing && <span className="st-option__trail">{trailing}</span>}
      </span>
    ) : (
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="st-option__name">{title}</span>
        {subtitle && <span className="st-option__sub">{subtitle}</span>}
      </span>
    )}
  </button>
);

export const ColorBands = ({ colors }: { colors: string[] }) => (
  <span aria-hidden="true" className="st-option__preview">
    {colors.map((color) => (
      <span key={color} style={{ backgroundColor: color }} />
    ))}
  </span>
);

export const SettingsEmpty = ({ icon: Icon, title, children }: { icon?: ElementType; title: string; children?: ReactNode }) => (
  <div className="st-empty">
    {Icon && <Icon size={24} aria-hidden="true" />}
    <strong>{title}</strong>
    {children && <span>{children}</span>}
  </div>
);

/** A row that reveals more rows, so long pages stay short without hiding options. */
export const Disclosure = ({
  label,
  description,
  children,
  defaultOpen = false,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <button
        aria-expanded={open}
        className="st-row st-disclosure"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="st-row__text">
          <span className="st-row__label">{label}</span>
          {description && (
            <span className="st-row__desc" style={{ display: 'block' }}>
              {description}
            </span>
          )}
        </span>
        <CaretDown aria-hidden="true" className="st-disclosure__caret" size={14} />
      </button>
      {open && children}
    </>
  );
};

export const Keys = ({ keys }: { keys: string[] }) => (
  <span className="st-keys">
    {keys.map((key, index) => (
      <kbd className="st-kbd" key={`${key}-${index}`}>
        {key}
      </kbd>
    ))}
  </span>
);
