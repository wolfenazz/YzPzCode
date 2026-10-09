// Stands in for @hugeicons in the adapted React Bits components, so they use
// the Phosphor icons the rest of the app ships instead of a second icon set.
import React from 'react';
import {
  Archive,
  ArrowClockwise,
  ArrowCounterClockwise,
  Bell,
  CalendarBlank,
  CaretDown,
  ChartLine,
  Check,
  Cursor,
  DownloadSimple,
  Envelope,
  FileText,
  GearSix,
  Globe,
  MagnifyingGlass,
  Microphone,
  Palette,
  Paperclip,
  PencilSimple,
  Plus,
  Question,
  Rocket,
  Sparkle,
  Stack,
  TerminalWindow,
  TextAa,
  Trash,
  X,
  type Icon,
} from '@phosphor-icons/react';

export type IconSvgElement = Icon;

export const Archive02Icon = Archive;
export const ArrowDown01Icon = CaretDown;
export const Attachment01Icon = Paperclip;
export const Calendar03Icon = CalendarBlank;
export const Cancel01Icon = X;
export const ChartLineData01Icon = ChartLine;
export const CommandLineIcon = TerminalWindow;
export const CursorPointer01Icon = Cursor;
export const Delete02Icon = Trash;
export const Download04Icon = DownloadSimple;
export const File02Icon = FileText;
export const Globe02Icon = Globe;
export const HelpCircleIcon = Question;
export const Layers01Icon = Stack;
export const Mail01Icon = Envelope;
export const Mic01Icon = Microphone;
export const Notification03Icon = Bell;
export const PaintBoardIcon = Palette;
export const PencilEdit01Icon = PencilSimple;
export const PlusSignIcon = Plus;
export const RefreshIcon = ArrowClockwise;
export const Rocket01Icon = Rocket;
export const Search01Icon = MagnifyingGlass;
export const Settings02Icon = GearSix;
export const SparklesIcon = Sparkle;
export const TextFontIcon = TextAa;
export const Tick02Icon = Check;
export const Undo02Icon = ArrowCounterClockwise;

/** Phosphor weights stand in for hugeicons stroke widths. */
export function HugeiconsIcon({ icon: IconComponent, size = 16, strokeWidth = 1.8 }: { icon: Icon; size?: number | string; strokeWidth?: number }): React.JSX.Element {
  const weight = strokeWidth >= 2.3 ? 'bold' : strokeWidth >= 1.9 ? 'regular' : 'light';
  return <IconComponent size={size} weight={weight} aria-hidden="true" />;
}
