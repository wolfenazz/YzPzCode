// The React Bits micro components, dressed in the app theme for the Writing
// workspace. Colours are CSS variables so custom themes carry through.
import React from 'react';
import RubberSegment, { type RubberSegmentItem } from '../reactbits/RubberSegment';
import JellyRadio, { type JellyRadioItem } from '../reactbits/JellyRadio';
import GlideSelect, { type GlideSelectOption } from '../reactbits/GlideSelect';
import ScrubField from '../reactbits/ScrubField';
import WakeSlider from '../reactbits/WakeSlider';
import SpringCheck from '../reactbits/SpringCheck';

const INK = 'var(--text-primary)';
const TRACK = 'color-mix(in oklab, var(--text-primary) 7%, transparent)';
const THUMB = 'var(--text-primary)';
const ON_THUMB = 'var(--bg-primary)';
const SOFT = 'var(--text-secondary)';
const GOLD = 'var(--wr-gold)';
const SURFACE = 'var(--bg-secondary)';

export function Segmented<T extends string>({ items, value, onChange, size = 'sm', label }: {
  items: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}): React.JSX.Element {
  return (
    <RubberSegment
      items={items as RubberSegmentItem[]}
      value={value}
      onChange={(next) => onChange(next as T)}
      size={size}
      trackColor={TRACK}
      thumbColor={THUMB}
      textColor={SOFT}
      activeTextColor={ON_THUMB}
      aria-label={label}
    />
  );
}

export function Chips<T extends string>({ items, value, onChange, size = 'sm', label }: {
  items: Array<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}): React.JSX.Element {
  return (
    <JellyRadio
      items={items as JellyRadioItem[]}
      value={value}
      onChange={(next) => onChange(next as T)}
      size={size}
      chipColor={TRACK}
      activeColor={GOLD}
      textColor={SOFT}
      activeTextColor="#1b1408"
      ariaLabel={label}
    />
  );
}

export function Select({ options, value, onChange, placeholder, label, menuWidth, align }: {
  options: Array<string | GlideSelectOption>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  menuWidth?: number;
  align?: 'left' | 'right';
}): React.JSX.Element {
  return (
    <GlideSelect
      options={options}
      value={value}
      onChange={(next) => onChange(next)}
      placeholder={placeholder}
      ariaLabel={label}
      menuWidth={menuWidth}
      align={align}
      accentColor={GOLD}
      surfaceColor={SURFACE}
      highlightColor="color-mix(in oklab, var(--text-primary) 10%, transparent)"
      textColor={INK}
      showTags
    />
  );
}

export function NumberField({ label, value, onChange, min, max, step = 1, suffix }: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}): React.JSX.Element {
  return (
    <ScrubField
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      suffix={suffix}
      size="sm"
      accent={GOLD}
      chipColor={TRACK}
      showFill
      onChange={onChange}
    />
  );
}

export function Dial({ label, hint, value, onChange, low, high }: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  low: string;
  high: string;
}): React.JSX.Element {
  return (
    <div className="wr-dial">
      <div className="wr-dial__head">
        <span>{label}</span>
        <span>{hint ?? (value < 34 ? low : value < 67 ? 'Balanced' : high)}</span>
      </div>
      <WakeSlider
        value={value}
        min={0}
        max={100}
        step={1}
        bars={34}
        height={30}
        fillColor={GOLD}
        trackColor={TRACK}
        crestColor="color-mix(in oklab, var(--wr-gold) 70%, white)"
        ariaLabel={label}
        onChange={onChange}
      />
    </div>
  );
}

export function Check({ label, checked, onChange }: {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <SpringCheck
      label={label}
      checked={checked}
      onChange={onChange}
      color={INK}
      fillColor={GOLD}
      checkColor="#1b1408"
      boxSize={18}
      boxRadius={6}
      fontSize={13}
      strike="none"
      doneOpacity={1}
    />
  );
}
