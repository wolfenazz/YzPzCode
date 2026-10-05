/**
 * What the global right-click menu offers for a given click.
 *
 * Pure on purpose (no DOM, no React) so the rules can be unit-tested with
 * `node --test`. `ContextMenu.tsx` turns these entries into rows; the DOM work
 * lives in `contextMenuTarget.ts`.
 */

export type AppView = 'nodejs-check' | 'setup' | 'workspace' | 'docs' | 'settings';

export type MenuTargetKind = 'terminal' | 'editable' | 'page';

export interface MenuTargetInfo {
  kind: MenuTargetKind;
  /** Text is selected, so Copy and Cut have something to act on. */
  hasSelection: boolean;
  /** An editable field that currently rejects edits (read-only or disabled). */
  readOnly: boolean;
  /** Password field: its contents never go on the clipboard. */
  secret: boolean;
}

export type CommandId =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'clearTerminal'
  | 'newWorkspace'
  | 'docs'
  | 'settings'
  | 'theme';

export interface MenuEntry {
  id: CommandId;
  disabled: boolean;
  /** Keys that run the same command, as input for `formatShortcut`. */
  keys?: readonly string[];
}

/** Sections in display order; the menu draws a divider between them. */
export interface MenuLayout {
  sections: MenuEntry[][];
}

const entry = (id: CommandId, disabled = false, keys?: readonly string[]): MenuEntry => ({
  id,
  disabled,
  ...(keys ? { keys } : {}),
});

const CUT = ['Mod', 'X'] as const;
const COPY = ['Mod', 'C'] as const;
const PASTE = ['Mod', 'V'] as const;
const SELECT_ALL = ['Mod', 'A'] as const;
const CLEAR_TERMINAL = ['Mod', 'L'] as const;
// App.tsx listens for Ctrl+, on every platform, so this one is not a "Mod" key.
const SETTINGS = ['Ctrl', ','] as const;

export function buildMenuLayout(target: MenuTargetInfo, view: AppView): MenuLayout {
  const noSelection = !target.hasSelection;
  const sections: MenuEntry[][] = [];

  if (target.kind === 'terminal') {
    sections.push([
      entry('copy', noSelection, COPY),
      entry('paste', false, PASTE),
      // Ctrl+A belongs to the shell (readline "beginning of line"), so it is not advertised here.
      entry('selectAll'),
    ]);
    sections.push([entry('clearTerminal', false, CLEAR_TERMINAL)]);
  } else if (target.kind === 'editable') {
    sections.push([
      entry('cut', target.readOnly || target.secret || noSelection, CUT),
      entry('copy', target.secret || noSelection, COPY),
      entry('paste', target.readOnly, PASTE),
      entry('selectAll', false, SELECT_ALL),
    ]);
  } else if (target.hasSelection) {
    sections.push([entry('copy', false, COPY)]);
  }

  // Never offer the screen the user is already on.
  const app: MenuEntry[] = [];
  if (view !== 'setup') app.push(entry('newWorkspace'));
  if (view !== 'docs') app.push(entry('docs'));
  if (view !== 'settings') app.push(entry('settings', false, SETTINGS));
  app.push(entry('theme'));
  sections.push(app);

  return { sections };
}

/** `Ctrl+C` on Windows and Linux, `⌘C` on macOS. "Mod" is the platform's command key. */
export function formatShortcut(keys: readonly string[], isMac: boolean): string {
  const parts = keys.map((key) => (key === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : key));
  return parts.join(isMac && parts[0] === '⌘' ? '' : '+');
}
