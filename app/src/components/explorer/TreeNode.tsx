import React, { useCallback, useContext, useRef, useEffect, useState, memo } from 'react';
import { motion } from 'framer-motion';
import type { NodeRendererProps } from 'react-arborist';
import type { TreeNodeData } from '../../hooks/useFileTree';
import { FileIcon } from './FileIcon';
import { GitStatusBadge } from './GitStatusBadge';
import type { FileEntry } from '../../types';

export type ExplorerClipboardEntry = {
  path: string;
  name: string;
  isDir: boolean;
};

export type ExplorerClipboard = {
  operation: 'copy' | 'cut';
  entries: ExplorerClipboardEntry[];
} | null;

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
});

const ChevronIcon: React.FC<{ isOpen: boolean }> = memo(({ isOpen }) => (
  <motion.svg
    className="w-3 h-3 shrink-0 text-zinc-500"
    viewBox="0 0 20 20"
    fill="currentColor"
    animate={{ rotate: isOpen ? 90 : 0 }}
    transition={{ duration: 0.12, ease: 'easeOut' }}
  >
    <path
      fillRule="evenodd"
      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
      clipRule="evenodd"
    />
  </motion.svg>
));

const IndentGuides: React.FC<{ level: number }> = memo(({ level }) => {
  if (level === 0) return null;
  return (
    <div className="flex shrink-0" aria-hidden="true">
      {Array.from({ length: level }).map((_, i) => (
        <div key={i} className="w-[14px] border-l border-zinc-800/60" />
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
      node.handleClick(e);
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
      }
    },
    [node, data.name]
  );

  const handleCancelEdit = useCallback(() => {
    node.reset();
  }, [node]);

  const dropHighlight = isDropTarget;

  const rowClass = isActive
    ? 'bg-zinc-800/90 text-zinc-100'
    : isSelected
      ? 'bg-zinc-800/50 text-zinc-200'
      : dropHighlight
        ? 'bg-blue-500/10 text-blue-200'
        : 'text-zinc-400 hover:bg-theme-hover/70 hover:text-zinc-200';

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
      className={`flex items-center gap-1 pr-3 cursor-pointer select-none group transition-colors duration-75 relative ${
        isCut ? 'opacity-45' : ''
      } ${rowClass}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {dropHighlight && data.isDir && (
        <motion.div
          className="absolute inset-y-0 left-0 right-0 border-2 border-blue-500/50 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        />
      )}
      <IndentGuides level={node.level} />

      <div className="flex items-center gap-1.5 py-1 flex-1 min-w-0 pl-1">
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
          <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500/70 shrink-0">
            cut
          </span>
        )}

        {gitChange && !node.isEditing && <GitStatusBadge change={gitChange} />}
      </div>
    </div>
  );
};

export const TreeNode = memo(TreeNodeInner);
