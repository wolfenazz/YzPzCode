import React, { useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TreeNodeData } from '../../hooks/useFileTree';
import type { ExplorerClipboard } from './TreeNode';

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNodeData | null;
}

interface ExplorerContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  onNewFile: (parentPath: string | null) => void;
  onNewFolder: (parentPath: string | null) => void;
  onRename: (node: TreeNodeData) => void;
  onDelete: (node: TreeNodeData) => void;
  onReveal: (path: string) => void;
  onRefresh: () => void;
  onCopy: (node: TreeNodeData) => void;
  onCut: (node: TreeNodeData) => void;
  onCopyPath: (node: TreeNodeData) => void;
  onCopyRelativePath: (node: TreeNodeData) => void;
  onOpenInTerminal: (node: TreeNodeData) => void;
  onDuplicate: (node: TreeNodeData) => void;
  onCopyAsImportPath: (node: TreeNodeData) => void;
  onPaste: (node: TreeNodeData | null) => void;
  clipboard: ExplorerClipboard;
  containerRef: React.RefObject<HTMLDivElement | null>;
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
    className={`w-full flex items-center justify-between px-3 py-[5px] text-[11px] cursor-pointer transition-colors duration-75 ${
      disabled
        ? 'text-zinc-700 cursor-default'
        : danger
          ? 'text-rose-400 hover:bg-rose-500/10'
          : 'text-theme-secondary hover:bg-theme-hover hover:text-theme-main'
    }`}
    onClick={onClick}
  >
    <span>{label}</span>
    {shortcut && (
      <span className={`text-[9px] ml-6 ${disabled ? 'text-zinc-800' : 'text-zinc-600'}`}>
        {shortcut}
      </span>
    )}
  </button>
));

const MenuSeparator: React.FC = memo(() => (
  <div className="my-1 h-px bg-zinc-800/80 mx-2" />
));

const ContextMenuInner: React.FC<ExplorerContextMenuProps> = ({
  menu,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onReveal,
  onRefresh,
  onCopy,
  onCut,
  onCopyPath,
  onCopyRelativePath,
  onOpenInTerminal,
  onDuplicate,
  onCopyAsImportPath,
  onPaste,
  clipboard,
  containerRef,
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

    requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu, onClose]);

  useEffect(() => {
    if (!menu || !menuRef.current || !containerRef.current) return;

    const container = containerRef.current.getBoundingClientRect();
    const menuEl = menuRef.current;
    const menuRect = menuEl.getBoundingClientRect();

    let x = menu.x - container.left;
    let y = menu.y - container.top;

    if (x + menuRect.width > container.width) {
      x = container.width - menuRect.width - 4;
    }
    if (y + menuRect.height > container.height) {
      y = container.height - menuRect.height - 4;
    }
    if (x < 0) x = 4;
    if (y < 0) y = 4;

    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;
  }, [menu, containerRef]);

  const handleNewFile = useCallback(() => {
    if (!menu) return;
    const parentPath = menu.node?.isDir ? menu.node.path : null;
    onNewFile(parentPath);
    onClose();
  }, [menu, onNewFile, onClose]);

  const handleNewFolder = useCallback(() => {
    if (!menu) return;
    const parentPath = menu.node?.isDir ? menu.node.path : null;
    onNewFolder(parentPath);
    onClose();
  }, [menu, onNewFolder, onClose]);

  const handleRename = useCallback(() => {
    if (!menu?.node) return;
    onRename(menu.node);
    onClose();
  }, [menu, onRename, onClose]);

  const handleDelete = useCallback(() => {
    if (!menu?.node) return;
    onDelete(menu.node);
    onClose();
  }, [menu, onDelete, onClose]);

  const handleReveal = useCallback(() => {
    if (!menu?.node) return;
    onReveal(menu.node.path);
    onClose();
  }, [menu, onReveal, onClose]);

  const handleRefresh = useCallback(() => {
    onRefresh();
    onClose();
  }, [onRefresh, onClose]);

  const handleCopy = useCallback(() => {
    if (!menu?.node) return;
    onCopy(menu.node);
    onClose();
  }, [menu, onCopy, onClose]);

  const handleCut = useCallback(() => {
    if (!menu?.node) return;
    onCut(menu.node);
    onClose();
  }, [menu, onCut, onClose]);

  const handlePaste = useCallback(() => {
    if (!menu) return;
    onPaste(menu.node);
    onClose();
  }, [menu, onPaste, onClose]);

  const handleCopyPath = useCallback(() => {
    if (!menu?.node) return;
    onCopyPath(menu.node);
    onClose();
  }, [menu, onCopyPath, onClose]);

  const handleCopyRelativePath = useCallback(() => {
    if (!menu?.node) return;
    onCopyRelativePath(menu.node);
    onClose();
  }, [menu, onCopyRelativePath, onClose]);

  const handleOpenInTerminal = useCallback(() => {
    if (!menu?.node) return;
    onOpenInTerminal(menu.node);
    onClose();
  }, [menu, onOpenInTerminal, onClose]);

  const handleDuplicate = useCallback(() => {
    if (!menu?.node) return;
    onDuplicate(menu.node);
    onClose();
  }, [menu, onDuplicate, onClose]);

  const handleCopyAsImportPath = useCallback(() => {
    if (!menu?.node) return;
    onCopyAsImportPath(menu.node);
    onClose();
  }, [menu, onCopyAsImportPath, onClose]);

  const isDir = menu?.node?.isDir ?? false;
  const hasNode = !!menu?.node;
  const hasClipboard = !!clipboard;

  return (
    <AnimatePresence>
      {menu && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.08, ease: 'easeOut' }}
          className="absolute z-50 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/70 rounded-md shadow-2xl py-1 min-w-[230px] overflow-hidden"
          role="menu"
          onContextMenu={(e) => e.preventDefault()}
        >
          {(isDir || !hasNode) && (
            <>
              <MenuItem label="New File..." onClick={handleNewFile} />
              <MenuItem label="New Folder..." onClick={handleNewFolder} />
              {(hasNode || hasClipboard) && <MenuSeparator />}
            </>
          )}
          {hasNode && (
            <>
              {isDir && (
                <MenuItem label="Open in Terminal" onClick={handleOpenInTerminal} />
              )}
              <MenuItem label="Copy" shortcut="Ctrl+C" onClick={handleCopy} />
              <MenuItem label="Cut" shortcut="Ctrl+X" onClick={handleCut} />
              <MenuItem
                label="Paste"
                shortcut="Ctrl+V"
                onClick={handlePaste}
                disabled={!hasClipboard}
              />
              <MenuItem label="Duplicate" onClick={handleDuplicate} />
              <MenuSeparator />
              <MenuItem label="Copy Path" shortcut="Ctrl+Shift+C" onClick={handleCopyPath} />
              <MenuItem label="Copy Relative Path" shortcut="Ctrl+Alt+C" onClick={handleCopyRelativePath} />
              <MenuItem label="Copy as Import Path" onClick={handleCopyAsImportPath} />
              <MenuSeparator />
              <MenuItem label="Rename" shortcut="F2" onClick={handleRename} />
              <MenuItem label="Delete" shortcut="Del" onClick={handleDelete} danger />
              <MenuSeparator />
              <MenuItem label="Reveal in File Manager" onClick={handleReveal} />
            </>
          )}
          {!hasNode && hasClipboard && (
            <>
              <MenuItem
                label="Paste"
                shortcut="Ctrl+V"
                onClick={handlePaste}
                disabled={!hasClipboard}
              />
              <MenuSeparator />
            </>
          )}
          <MenuItem label="Refresh" onClick={handleRefresh} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const ExplorerContextMenu = memo(ContextMenuInner);
