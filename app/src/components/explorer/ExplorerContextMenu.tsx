import React, { useEffect, useLayoutEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { TreeNodeData } from '../../hooks/useFileTree';
import type { ExplorerClipboardEntry } from './TreeNode';
import type { PasteSource } from '../../utils/explorerClipboard';
import '../common/context-menu.css';

export interface ExplorerMenuState {
  x: number;
  y: number;
  node: TreeNodeData | null;
  /** Opened on an "Open editors" row rather than on the tree. */
  source?: 'tree' | 'openEditors';
}

/** Every command the explorer menu can run. */
export interface ExplorerMenuActions {
  newFile: (parentPath: string | null) => void;
  newFolder: (parentPath: string | null) => void;
  rename: (node: TreeNodeData) => void;
  delete: (node: TreeNodeData) => void;
  reveal: (path: string) => void;
  refresh: () => void;
  collapseAll: () => void;
  copy: (node: TreeNodeData) => void;
  cut: (node: TreeNodeData) => void;
  paste: (node: TreeNodeData | null) => void;
  duplicate: (node: TreeNodeData) => void;
  copyPath: (node: TreeNodeData) => void;
  copyRelativePath: (node: TreeNodeData) => void;
  copyName: (node: TreeNodeData) => void;
  copyAsImportPath: (node: TreeNodeData) => void;
  openInTerminal: (node: TreeNodeData) => void;
  openInExternalTerminal: (node: TreeNodeData) => void;
  openToSide: (node: TreeNodeData) => void;
  findInFolder: (node: TreeNodeData) => void;
  revealInTree: (node: TreeNodeData) => void;
  closeEditor: (path: string) => void;
  closeOtherEditors: (path: string) => void;
  closeSavedEditors: () => void;
  closeAllEditors: () => void;
  multiOpen: () => void;
  multiCopy: () => void;
  multiCut: () => void;
  multiDelete: () => void;
  multiDuplicate: () => void;
  multiCopyPaths: (relative: boolean) => void;
}

interface ExplorerContextMenuProps {
  menu: ExplorerMenuState | null;
  onClose: () => void;
  actions: ExplorerMenuActions;
  selectedEntries: ExplorerClipboardEntry[];
  pasteSource: PasteSource | null;
  openEditorCount: number;
}

const MenuItem: React.FC<{
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}> = memo(({ label, shortcut, onClick, danger, disabled }) => (
  <button
    role="menuitem"
    disabled={disabled}
    className={danger ? 'ctx-item ctx-item--danger' : 'ctx-item'}
    onClick={onClick}
  >
    <span className="ctx-item__label">{label}</span>
    {shortcut && <span className="ctx-item__kbd">{shortcut}</span>}
  </button>
));

const MenuSeparator: React.FC = memo(() => (
  <div role="separator" className="ctx-sep" />
));

const pasteLabel = (source: PasteSource | null): string => {
  if (source?.kind === 'image') return 'Paste Image';
  if (source && source.paths.length > 1) return `Paste ${source.paths.length} Items`;
  return 'Paste';
};

const ContextMenuInner: React.FC<ExplorerContextMenuProps> = ({
  menu,
  onClose,
  actions,
  selectedEntries,
  pasteSource,
  openEditorCount,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const frame = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('blur', onClose);
    });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', onClose);
    };
  }, [menu, onClose]);

  // Rendered in a portal with viewport coordinates, so a menu opened from
  // the "Open editors" list (above the tree) is placed where the click was,
  // and flipped to stay on screen.
  useLayoutEffect(() => {
    const menuEl = menuRef.current;
    if (!menu || !menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    const margin = 4;
    let x = menu.x;
    let y = menu.y;
    if (x + rect.width > window.innerWidth - margin) x = Math.max(margin, window.innerWidth - rect.width - margin);
    if (y + rect.height > window.innerHeight - margin) y = Math.max(margin, menu.y - rect.height);
    if (y + rect.height > window.innerHeight - margin) y = Math.max(margin, window.innerHeight - rect.height - margin);
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;
  }, [menu, pasteSource]);

  const node = menu?.node ?? null;
  const isDir = node?.isDir ?? false;
  const fromOpenEditors = menu?.source === 'openEditors';
  const canPaste = !!pasteSource;

  /** Runs a command and closes the menu. */
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const withNode = (fn: (node: TreeNodeData) => void) => run(() => node && fn(node));

  // When the right-clicked row is part of a multi-selection, act on the
  // whole selection (VS Code behavior).
  const selectionCount = selectedEntries.length;
  const rightClickedInSelection =
    !!node && !fromOpenEditors && selectionCount > 1 && selectedEntries.some((entry) => entry.path === node.path);
  const selectedFileCount = selectedEntries.filter((entry) => !entry.isDir).length;

  const fileCommands = node && (
    <>
      <MenuItem label="Copy" shortcut="Ctrl+C" onClick={withNode(actions.copy)} />
      <MenuItem label="Cut" shortcut="Ctrl+X" onClick={withNode(actions.cut)} />
      <MenuItem label={pasteLabel(pasteSource)} shortcut="Ctrl+V" onClick={withNode(actions.paste)} disabled={!canPaste} />
      <MenuItem label="Duplicate" onClick={withNode(actions.duplicate)} />
      <MenuSeparator />
      <MenuItem label="Copy Path" shortcut="Ctrl+Shift+C" onClick={withNode(actions.copyPath)} />
      <MenuItem label="Copy Relative Path" shortcut="Ctrl+Alt+C" onClick={withNode(actions.copyRelativePath)} />
      <MenuItem label="Copy Name" onClick={withNode(actions.copyName)} />
      {!isDir && <MenuItem label="Copy as Import Path" onClick={withNode(actions.copyAsImportPath)} />}
      <MenuSeparator />
      <MenuItem label="Rename" shortcut="F2" onClick={withNode(actions.rename)} />
      <MenuItem label="Delete" shortcut="Del" onClick={withNode(actions.delete)} danger />
      <MenuSeparator />
      <MenuItem label={isDir ? 'Find in Folder' : 'Find in Containing Folder'} onClick={withNode(actions.findInFolder)} />
      <MenuItem label="Reveal in File Manager" onClick={withNode((target) => actions.reveal(target.path))} />
    </>
  );

  let body: React.ReactNode;
  if (fromOpenEditors && node) {
    body = (
      <>
        <MenuItem label="Close" shortcut="Ctrl+W" onClick={run(() => actions.closeEditor(node.path))} />
        <MenuItem
          label="Close Others"
          onClick={run(() => actions.closeOtherEditors(node.path))}
          disabled={openEditorCount < 2}
        />
        <MenuItem label="Close Saved" onClick={run(actions.closeSavedEditors)} />
        <MenuItem label="Close All" onClick={run(actions.closeAllEditors)} />
        <MenuSeparator />
        <MenuItem label="Reveal in Explorer View" onClick={withNode(actions.revealInTree)} />
        <MenuItem label="Open in Integrated Terminal" onClick={withNode(actions.openInTerminal)} />
        <MenuItem label="Open in External Terminal" onClick={withNode(actions.openInExternalTerminal)} />
        <MenuSeparator />
        {fileCommands}
      </>
    );
  } else if (rightClickedInSelection) {
    body = (
      <>
        {selectedFileCount > 0 && (
          <>
            <MenuItem
              label={selectedFileCount === 1 ? 'Open File' : `Open ${selectedFileCount} Files`}
              onClick={run(actions.multiOpen)}
            />
            <MenuSeparator />
          </>
        )}
        <MenuItem label={`Copy ${selectionCount} Items`} shortcut="Ctrl+C" onClick={run(actions.multiCopy)} />
        <MenuItem label={`Cut ${selectionCount} Items`} shortcut="Ctrl+X" onClick={run(actions.multiCut)} />
        <MenuItem label={pasteLabel(pasteSource)} shortcut="Ctrl+V" onClick={withNode(actions.paste)} disabled={!canPaste} />
        <MenuItem label={`Duplicate ${selectionCount} Items`} onClick={run(actions.multiDuplicate)} />
        <MenuSeparator />
        <MenuItem label="Copy Paths" shortcut="Ctrl+Shift+C" onClick={run(() => actions.multiCopyPaths(false))} />
        <MenuItem label="Copy Relative Paths" shortcut="Ctrl+Alt+C" onClick={run(() => actions.multiCopyPaths(true))} />
        <MenuSeparator />
        <MenuItem label={`Delete ${selectionCount} Items`} shortcut="Del" onClick={run(actions.multiDelete)} danger />
        <MenuSeparator />
        <MenuItem label="Refresh" onClick={run(actions.refresh)} />
      </>
    );
  } else if (node) {
    body = (
      <>
        {isDir ? (
          <>
            <MenuItem label="New File..." onClick={run(() => actions.newFile(node.path))} />
            <MenuItem label="New Folder..." onClick={run(() => actions.newFolder(node.path))} />
            <MenuSeparator />
            <MenuItem label="Open in Integrated Terminal" onClick={withNode(actions.openInTerminal)} />
            <MenuItem label="Open in External Terminal" onClick={withNode(actions.openInExternalTerminal)} />
          </>
        ) : (
          <>
            <MenuItem label="Open to the Side" onClick={withNode(actions.openToSide)} />
            <MenuItem label="Open in Integrated Terminal" onClick={withNode(actions.openInTerminal)} />
            <MenuItem label="Open in External Terminal" onClick={withNode(actions.openInExternalTerminal)} />
          </>
        )}
        <MenuSeparator />
        {fileCommands}
        <MenuSeparator />
        <MenuItem label="Refresh" onClick={run(actions.refresh)} />
      </>
    );
  } else {
    body = (
      <>
        <MenuItem label="New File..." onClick={run(() => actions.newFile(null))} />
        <MenuItem label="New Folder..." onClick={run(() => actions.newFolder(null))} />
        <MenuSeparator />
        <MenuItem label={pasteLabel(pasteSource)} shortcut="Ctrl+V" onClick={run(() => actions.paste(null))} disabled={!canPaste} />
        <MenuSeparator />
        <MenuItem label="Collapse All" onClick={run(actions.collapseAll)} />
        <MenuItem label="Refresh" onClick={run(actions.refresh)} />
      </>
    );
  }

  return createPortal(
    <AnimatePresence>
      {menu && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.08, ease: 'easeOut' }}
          className="ctx-menu ctx-menu--plain"
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 10000 }}
          role="menu"
          onContextMenu={(e) => e.preventDefault()}
        >
          {body}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export const ExplorerContextMenu = memo(ContextMenuInner);
