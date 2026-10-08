import React, { useCallback, useContext, useRef, useEffect, useState, memo } from 'react';
import { motion } from 'framer-motion';
import type { NodeRendererProps } from 'react-arborist';
import type { TreeNodeData } from '../../hooks/useFileTree';
import { FileIcon } from './FileIcon';
import { GitStatusBadge } from './GitStatusBadge';
import type { FileEntry } from '../../types';
import type { AppClipboard, ExplorerClipboardEntry } from '../../utils/explorerClipboard';

export type { ExplorerClipboardEntry };

export type ExplorerClipboard = AppClipboard | null;

export const isClipboardPath = (
  clipboard: ExplorerClipboard,
  path: string
): boolean =>
  !!clipboard && clipboard.entries.some((entry) => entry.path === path);

interface ExplorerContextValue {
  onFileClick: (entry: FileEntry) => void;
  /** O(1) lookup: repo path → change kind, built once per git refresh. */
  gitStatusMap: Map<string, 'added' | 'modified' | 'deleted' | 'untracked'>;
  activeFilePath: string | null;
  onContextMenu: (e: React.MouseEvent, nodeData: TreeNodeData) => void;
  externalDropTarget: string | null;
  clipboard: ExplorerClipboard;
  searchTerm?: string;
  nativeDropTarget: string | null;
  nativeDragging: boolean;
  /** Naming was cancelled (Escape, or left unchanged) for this entry. */
  onEditCancel: (path: string) => void;
}

export const ExplorerContext = React.createContext<ExplorerContextValue>({
  onFileClick: () => {},
  gitStatusMap: new Map(),
  activeFilePath: null,
  onContextMenu: () => {},
  externalDropTarget: null,
  clipboard: null,
  searchTerm: undefined,
  nativeDropTarget: null,
  nativeDragging: false,
  onEditCancel: () => {},
});

const ChevronIcon: React.FC<{ isOpen: boolean }> = memo(({ isOpen }) => (
  <motion.svg
    className="explorer-chevron w-3 h-3 shrink-0"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    initial={false}
    animate={{ rotate: isOpen ? 90 : 0 }}
    transition={{ type: 'spring', stiffness: 520, damping: 32, mass: 0.6 }}
  >
    <path d="M6 3.5L10.5 8L6 12.5" />
  </motion.svg>
));

const IndentGuides: React.FC<{ level: number }> = memo(({ level }) => {
  if (level === 0) return null;
  return (
    <div className="flex shrink-0 self-stretch" aria-hidden="true">
      {Array.from({ length: level }).map((_, i) => (
        <div key={i} className="explorer-indent-guide w-[14px]" />
      ))}
    </div>
  );
});

const EditInput: React.FC<{
  value: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}> = ({ value, onSubmit, onCancel }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      const dotIndex = value.lastIndexOf('.');
      if (dotIndex > 0) {
        input.setSelectionRange(0, dotIndex);
      } else {
        input.select();
      }
    }
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.stopPropagation();
        onSubmit(inputRef.current?.value ?? value);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    },
    [onSubmit, onCancel, value]
  );

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      className="flex-1 bg-theme-card text-xs text-theme-main px-1 py-0 outline-none border border-zinc-600 rounded-sm min-w-0"
      onKeyDown={handleKeyDown}
      onBlur={(e) => {
        e.stopPropagation();
        onSubmit(e.target.value);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
};

const HighlightedName: React.FC<{ name: string; searchTerm?: string; isCut: boolean }> = memo(
  ({ name, searchTerm, isCut }) => {
    if (!searchTerm || !searchTerm.trim()) {
      return (
        <span className={`truncate text-xs flex-1 ${isCut ? 'line-through decoration-zinc-500/60' : ''}`}>
          {name}
        </span>
      );
    }
    const lower = name.toLowerCase();
    const term = searchTerm.toLowerCase();
    const idx = lower.indexOf(term);
    if (idx === -1) {
      return (
        <span className={`truncate text-xs flex-1 ${isCut ? 'line-through decoration-zinc-500/60' : ''}`}>
          {name}
        </span>
      );
    }
    return (
      <span className={`truncate text-xs flex-1 ${isCut ? 'line-through decoration-zinc-500/60' : ''}`}>
        {name.slice(0, idx)}
        <mark className="bg-amber-500/30 text-amber-200 rounded-[2px] px-px">{name.slice(idx, idx + term.length)}</mark>
        {name.slice(idx + term.length)}
      </span>
    );
  }
);

const TreeNodeInner: React.FC<NodeRendererProps<TreeNodeData>> = ({
  node,
  style,
  dragHandle,
}) => {
  const ctx = useContext(ExplorerContext);
  const {
    onFileClick,
    gitStatusMap,
    activeFilePath,
    onContextMenu,
    externalDropTarget,
    clipboard,
    searchTerm,
    nativeDropTarget,
    nativeDragging,
    onEditCancel,
  } = ctx;
  const data = node.data;
  const isActive = activeFilePath === data.id;
  const isCut = isClipboardPath(clipboard, data.id);
  const gitChange = gitStatusMap.get(data.id);
  const willReceiveDrop = node.willReceiveDrop;
  const isExternalTarget = externalDropTarget === data.id && data.isDir;
  const isNativeTarget =
    nativeDragging && nativeDropTarget !== null && nativeDropTarget === data.id && data.isDir;
  const isSelected = node.isSelected;

  const [autoExpandTimer, setAutoExpandTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const isDropTarget = willReceiveDrop || isExternalTarget || isNativeTarget;

  useEffect(() => {
    if (isDropTarget && data.isDir && node.isClosed) {
      const timer = setTimeout(() => {
        node.toggle();
      }, 600);
      setAutoExpandTimer(timer);
      return () => {
        clearTimeout(timer);
        setAutoExpandTimer(null);
      };
    }
    if (!isDropTarget && autoExpandTimer) {
      clearTimeout(autoExpandTimer);
      setAutoExpandTimer(null);
    }
  }, [isDropTarget, data.isDir, node.isClosed]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // react-arborist only treats ⌘ (metaKey) as multi-select, so Ctrl+click
      // on Windows/Linux would replace the selection. Modifier clicks only
      // change the selection; they never open a file or toggle a folder.
      if (e.ctrlKey || e.metaKey) {
        if (node.isSelected) node.deselect();
        else node.selectMulti();
        return;
      }
      if (e.shiftKey) {
        node.selectContiguous();
        return;
      }
      node.select();
      node.activate();
      if (data.isDir) {
        node.toggle();
      } else {
        const entry: FileEntry = {
          name: data.name,
          path: data.path,
          isDir: data.isDir,
          size: 0,
          modifiedAt: 0,
          extension: data.extension,
        };
        onFileClick(entry);
      }
    },
    [node, data, onFileClick]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, data);
    },
    [data, onContextMenu]
  );

  const handleSubmitEdit = useCallback(
    (value: string) => {
      if (value.trim() && value.trim() !== data.name) {
        node.submit(value.trim());
      } else {
        node.reset();
        onEditCancel(data.path);
      }
    },
    [node, data.name, data.path, onEditCancel]
  );

  const handleCancelEdit = useCallback(() => {
    node.reset();
    onEditCancel(data.path);
  }, [node, data.path, onEditCancel]);

  const dropHighlight = isDropTarget;

  const rowClass = isActive
    ? 'is-active'
    : isSelected
      ? 'is-selected'
      : dropHighlight
        ? 'is-drop-target'
        : '';

  return (
    <div
      ref={dragHandle}
      role="treeitem"
      aria-expanded={data.isDir ? node.isOpen : undefined}
      aria-selected={isSelected}
      draggable
      data-file-path={data.path}
      data-is-dir={data.isDir ? 'true' : undefined}
      style={{
        ...style,
        paddingLeft: 0,
      }}
      className={`explorer-tree-row ${data.isDir ? 'is-dir' : 'is-file'} ${node.isOpen ? 'is-open' : ''} flex items-center gap-1 pr-3 cursor-pointer select-none group relative ${
        isCut ? 'opacity-45' : ''
      } ${rowClass}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {dropHighlight && data.isDir && (
        <motion.div
          className="explorer-drop-ring absolute inset-y-0 left-1 right-1 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        />
      )}
      <IndentGuides level={node.level} />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-1">
        {data.isDir ? (
          <ChevronIcon isOpen={node.isOpen} />
        ) : (
          <span className="w-3 shrink-0" />
        )}

        <FileIcon
          extension={data.extension}
          isDir={data.isDir}
          isOpen={node.isOpen}
          name={data.name}
          className="w-4 h-4 shrink-0"
        />

        {node.isEditing ? (
          <EditInput
            value={data.name}
            onSubmit={handleSubmitEdit}
            onCancel={handleCancelEdit}
          />
        ) : (
          <HighlightedName name={data.name} searchTerm={searchTerm} isCut={isCut} />
        )}

        {isCut && !node.isEditing && (
          <span className="shrink-0 text-[10px] text-[var(--text-secondary)]">
            cut
          </span>
        )}

        {gitChange && !node.isEditing && <GitStatusBadge change={gitChange} />}
      </div>
    </div>
  );
};

export const TreeNode = memo(TreeNodeInner);
