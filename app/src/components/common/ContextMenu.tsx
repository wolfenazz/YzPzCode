import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ContextMenu as Menu } from 'radix-ui';
import {
  BookOpenText,
  CaretRight,
  Check,
  ClipboardText,
  Copy,
  Eraser,
  GearSix,
  Palette,
  Plus,
  Scissors,
  SelectionAll,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { getIsMac } from '../../utils/window';
import { buildMenuLayout, formatShortcut } from '../../utils/contextMenuModel';
import type { CommandId, MenuEntry } from '../../utils/contextMenuModel';
import {
  EMPTY_TARGET,
  clearTerminalTarget,
  copyFromTarget,
  cutFromTarget,
  detectContextTarget,
  pasteIntoTarget,
  restoreTargetFocus,
  selectAllInTarget,
} from '../../utils/contextMenuTarget';
import type { ContextTarget } from '../../utils/contextMenuTarget';
import { useThemeChoices } from './ThemeModeToggle';
import logo from '../../assets/YzPzCodeLogo.png';
import './context-menu.css';

type RowCommand = Exclude<CommandId, 'theme'>;

const ROWS: Record<RowCommand, { label: string; Icon: Icon }> = {
  cut: { label: 'Cut', Icon: Scissors },
  copy: { label: 'Copy', Icon: Copy },
  paste: { label: 'Paste', Icon: ClipboardText },
  selectAll: { label: 'Select All', Icon: SelectionAll },
  clearTerminal: { label: 'Clear Terminal', Icon: Eraser },
  newWorkspace: { label: 'New Workspace', Icon: Plus },
  docs: { label: 'Documentation', Icon: BookOpenText },
  settings: { label: 'Settings', Icon: GearSix },
};

// A menu opened over a modal dialog sits outside that dialog's React tree, so the
// dialog reads every click on the menu as a click outside itself and closes,
// discarding what the user was typing. Keep presses inside the menu from reaching
// the document-level dismiss listeners.
const containPointer = {
  onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
};

const run = (task: () => void | Promise<void>): void => {
  const fail = (error: unknown) => console.error('Context menu action failed:', error);
  try {
    void Promise.resolve(task()).catch(fail);
  } catch (error) {
    fail(error);
  }
};

let cachedVersion: string | null = null;

/** The app version for the menu footer; stays null outside the Tauri shell. */
const useAppVersion = (): string | null => {
  const [version, setVersion] = useState(cachedVersion);

  useEffect(() => {
    if (cachedVersion !== null) return;
    let cancelled = false;
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((value) => {
        cachedVersion = value;
        if (!cancelled) setVersion(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
};

const ThemeSubmenu: React.FC = () => {
  const choices = useThemeChoices();
  const active = choices.find((choice) => choice.active);

  const renderChoice = (choice: (typeof choices)[number]) => (
    <Menu.RadioItem key={choice.key} value={choice.key} className="ctx-item">
      <span className="ctx-item__icon">
        <choice.icon size={16} aria-hidden="true" />
      </span>
      <span className="ctx-item__label">{choice.label}</span>
      <Menu.ItemIndicator className="ctx-item__check">
        <Check size={14} weight="bold" aria-hidden="true" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );

  const builtIn = choices.filter((choice) => !choice.custom);
  const custom = choices.filter((choice) => choice.custom);

  return (
    <Menu.Sub>
      <Menu.SubTrigger className="ctx-item">
        <span className="ctx-item__icon">
          <Palette size={16} aria-hidden="true" />
        </span>
        <span className="ctx-item__label">Theme</span>
        <span className="ctx-item__caret">
          <CaretRight size={12} weight="bold" aria-hidden="true" />
        </span>
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent
          {...containPointer}
          className="ctx-menu ctx-menu--popup"
          sideOffset={6}
          alignOffset={-5}
          collisionPadding={8}
          loop
        >
          <Menu.RadioGroup
            value={active?.key}
            onValueChange={(key) => choices.find((choice) => choice.key === key)?.select()}
          >
            {builtIn.map(renderChoice)}
            {custom.length > 0 && <Menu.Separator className="ctx-sep" />}
            {custom.map(renderChoice)}
          </Menu.RadioGroup>
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
};

interface ContextMenuProps {
  /** The element that owns the menu: every right-click inside it is handled. */
  children: React.ReactElement;
  onNewWorkspace: () => void;
  onDocsClick: () => void;
  onSettingsClick: () => void;
}

/**
 * The app-wide right-click menu. What it offers follows what was clicked: the
 * clipboard commands for a terminal, a text field or a text selection, then the
 * app commands everywhere. A more specific menu (file tree, editor tabs, the
 * image canvas, terminal paste-on-right-click) opts out by preventing default.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
  children,
  onNewWorkspace,
  onDocsClick,
  onSettingsClick,
}) => {
  const view = useAppStore((s) => s.view);
  const version = useAppVersion();
  const [target, setTarget] = useState<ContextTarget>(EMPTY_TARGET);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dismissedOutsideRef = useRef(false);

  // The trigger only sees right-clicks inside the app's React tree. Anything else
  // (a third-party overlay appended to <body>) must still not raise the WebView's
  // native menu, so swallow whatever nobody handled.
  useEffect(() => {
    const swallow = (event: MouseEvent) => {
      if (!event.defaultPrevented) event.preventDefault();
    };
    document.addEventListener('contextmenu', swallow);
    return () => document.removeEventListener('contextmenu', swallow);
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    if (event.defaultPrevented) return;
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement && !active.closest('.ctx-menu') ? active : null;
    dismissedOutsideRef.current = false;
    setTarget(detectContextTarget(event.target));
  }, []);

  const restoreFocus = () => {
    if (target.terminal || target.editable) {
      restoreTargetFocus(target);
      return;
    }
    const previous = returnFocusRef.current;
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  };

  // Radix would hand focus back itself, but it also re-selects the whole text of an
  // input, which turns a Paste into "everything highlighted". Do it by hand, and
  // leave focus alone when the menu was dismissed by clicking somewhere else.
  const handleCloseAutoFocus = (event: Event) => {
    event.preventDefault();
    if (!dismissedOutsideRef.current) restoreFocus();
    dismissedOutsideRef.current = false;
  };

  const isMac = getIsMac();
  const { sections } = buildMenuLayout(target, view);

  const handlers: Record<RowCommand, () => void> = {
    cut: () => run(() => cutFromTarget(target)),
    copy: () => run(() => copyFromTarget(target)),
    paste: () => run(() => pasteIntoTarget(target)),
    selectAll: () => run(() => selectAllInTarget(target)),
    clearTerminal: () => run(() => clearTerminalTarget(target)),
    newWorkspace: onNewWorkspace,
    docs: onDocsClick,
    settings: onSettingsClick,
  };

  const renderEntry = (entry: MenuEntry) => {
    if (entry.id === 'theme') return <ThemeSubmenu key="theme" />;
    const { label, Icon } = ROWS[entry.id];
    return (
      <Menu.Item
        key={entry.id}
        className="ctx-item"
        disabled={entry.disabled}
        onSelect={handlers[entry.id]}
      >
        <span className="ctx-item__icon">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="ctx-item__label">{label}</span>
        {entry.keys && <span className="ctx-item__kbd">{formatShortcut(entry.keys, isMac)}</span>}
      </Menu.Item>
    );
  };

  return (
    // Not modal: the page stays live, and a second right-click elsewhere reopens
    // the menu in the new place instead of letting the WebView's own menu appear.
    <Menu.Root modal={false}>
      <Menu.Trigger asChild onContextMenu={handleContextMenu}>
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          {...containPointer}
          className="ctx-menu ctx-menu--popup"
          aria-label="Application menu"
          loop
          collisionPadding={8}
          onContextMenu={(event) => event.preventDefault()}
          onInteractOutside={() => {
            dismissedOutsideRef.current = true;
          }}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          {sections.map((section, index) => (
            <React.Fragment key={index}>
              {index > 0 && <Menu.Separator className="ctx-sep" />}
              {section.map(renderEntry)}
            </React.Fragment>
          ))}
          <Menu.Separator className="ctx-sep" />
          <Menu.Label className="ctx-foot">
            <img src={logo} alt="" className="ctx-foot__mark" draggable={false} />
            <span className="ctx-foot__name">YzPzCode</span>
            {version && <span className="ctx-foot__version">v{version}</span>}
          </Menu.Label>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
};
