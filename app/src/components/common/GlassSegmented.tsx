// The segmented switch used under liquid glass: radio buttons in a groove, the
// chosen one carrying the glass thumb. It is plain markup on purpose: the glass
// layer (liquid-glass.css, utils/glassPress.ts) lists `.gs` / `.gs__item` with
// the other navigation switchers, so it gets the same groove, thumb and the
// same press, drag and slide as the workspace view switcher.
import React, { useRef, useState, type ReactNode } from 'react';
import './glass-segmented.css';

export type GlassSegmentedSize = 'sm' | 'md' | 'lg';
export type GlassSegmentedItem = string | { value: string; label: ReactNode; icon?: ReactNode };

export interface GlassSegmentedProps {
  items: GlassSegmentedItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, index: number) => void;
  size?: GlassSegmentedSize;
  /** Every slot as wide as the widest (the default), or each as wide as its label. */
  equalSlots?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

const GlassSegmented: React.FC<GlassSegmentedProps> = ({
  items,
  value,
  defaultValue,
  onChange,
  size = 'md',
  equalSlots = true,
  disabled = false,
  className = '',
  'aria-label': ariaLabel = 'Segmented control',
}) => {
  const list = items.map((item) => (typeof item === 'string' ? { value: item, label: item } : item));
  const [inner, setInner] = useState<string | undefined>(defaultValue ?? list[0]?.value);
  const current = value !== undefined ? value : inner;
  const index = Math.max(0, list.findIndex((item) => item.value === current));
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const choose = (next: number): void => {
    if (disabled || next === index || !list[next]) return;
    if (value === undefined) setInner(list[next].value);
    onChange?.(list[next].value, next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    const last = list.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(last, index + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    choose(next);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-equal={equalSlots ? '' : undefined}
      className={`gs gs--${size}${className ? ` ${className}` : ''}`}
    >
      {list.map((item, i) => (
        <button
          key={item.value}
          ref={(element) => { buttons.current[i] = element; }}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          disabled={disabled}
          className="gs__item"
          onClick={() => choose(i)}
          onKeyDown={onKeyDown}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default GlassSegmented;
