import React, { memo, useMemo } from 'react';
import { X } from '@phosphor-icons/react';
import { FileTab } from '../../types';
import { FileIcon } from '../explorer/FileIcon';
import { TabContextMenu } from './TabContextMenu';

interface EditorTabsProps {
  openFiles: FileTab[];
  activeFilePath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseToRight: (path: string) => void;
  onCloseAll: () => void;
  onCloseSaved: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

const getExtension = (name: string): string | null => {
  const parts = name.split('.');
  if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  return null;
};

const EditorTabsInner: React.FC<EditorTabsProps> = ({
  openFiles,
  activeFilePath,
  onTabClick,
  onTabClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onCloseSaved,
  onReorder,
}) => {
  if (openFiles.length === 0) return null;

  const hasDirty = openFiles.some((f) => f.isDirty);

  return (
    <TabBar
      openFiles={openFiles}
      activeFilePath={activeFilePath}
      hasDirty={hasDirty}
      onTabClick={onTabClick}
      onTabClose={onTabClose}
      onCloseOthers={onCloseOthers}
      onCloseToRight={onCloseToRight}
      onCloseAll={onCloseAll}
      onCloseSaved={onCloseSaved}
      onReorder={onReorder}
    />
  );
};

export const EditorTabs = memo(EditorTabsInner);

interface TabBarProps {
  openFiles: FileTab[];
  activeFilePath: string | null;
  hasDirty: boolean;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseToRight: (path: string) => void;
  onCloseAll: () => void;
  onCloseSaved: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

const TabBar: React.FC<TabBarProps> = ({
  openFiles,
  activeFilePath,
  hasDirty,
  onTabClick,
  onTabClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onCloseSaved,
  onReorder,
}) => {
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    path: string;
    index: number;
  } | null>(null);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  const menuItems = useMemo(() => {
    if (!contextMenu) return null;
    return [
      { label: 'Close', action: () => onTabClose(contextMenu.path), shortcut: 'Ctrl+W' },
      { label: 'Close Others', action: () => onCloseOthers(contextMenu.path) },
      { label: 'Close to the Right', action: () => onCloseToRight(contextMenu.path), disabled: contextMenu.index >= openFiles.length - 1 },
      { separator: true as const },
      { label: 'Close All', action: onCloseAll },
      { label: 'Close Saved', action: onCloseSaved, disabled: !hasDirty },
    ];
  }, [contextMenu, openFiles.length, hasDirty, onTabClose, onCloseOthers, onCloseToRight, onCloseAll, onCloseSaved]);

  const handleContextMenu = (e: React.MouseEvent, path: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, index });
  };

  const handleBarContextMenu = (e: React.MouseEvent) => {
    if (openFiles.length === 0) return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path: openFiles[0].path,
      index: 0,
    });
  };

  return (
    <div
      role="tablist"
      className="flex shrink-0 items-center overflow-x-auto border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]"
      onContextMenu={handleBarContextMenu}
    >
      {openFiles.map((file, index) => {
        const isActive = file.path === activeFilePath;
        const isDragging = dragIndex === index;
        const isDragOver = dragOverIndex === index;
        return (
          <div
            key={file.path}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            title={file.path}
            draggable
            onDragStart={(e) => {
              setDragIndex(index);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(index));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverIndex(index);
            }}
            onDragLeave={() => {
              setDragOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const fromIdx = dragIndex;
              setDragIndex(null);
              setDragOverIndex(null);
              if (fromIdx !== null && fromIdx !== index) {
                onReorder(fromIdx, index);
              }
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDragOverIndex(null);
            }}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 border-r cursor-pointer group min-w-0 max-w-[160px] transition-colors duration-100 ${
              isDragging ? 'opacity-40' : ''
            } ${
              isDragOver
                ? 'border-l-2 border-l-blue-500 bg-blue-950/30'
                : ''
            } ${
                 isActive
                 ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] border-[var(--border-primary)]'
                 : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] border-[var(--border-primary)]'
            }`}
            onClick={() => onTabClick(file.path)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTabClick(file.path); } }}
            onContextMenu={(e) => handleContextMenu(e, file.path, index)}
          >
            <FileIcon
              extension={getExtension(file.name)}
              isDir={false}
              className="w-3.5 h-3.5 shrink-0"
            />
            <span className="text-[11px] truncate" title={file.path}>{file.name}</span>

            {file.isDirty && (
              <span className="w-2 h-2 rounded-full shrink-0 group-hover:hidden bg-zinc-400" />
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(file.path);
              }}
              className={`app-icon-button h-5 w-5 shrink-0 rounded transition-colors cursor-pointer ${
                file.isDirty
                   ? 'hidden group-hover:block hover:bg-[var(--bg-tertiary)]'
                   : 'opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <X size={12} aria-hidden="true" />
            </button>

            {isActive && (
              <div className="absolute inset-x-2 bottom-0 h-px bg-[var(--text-primary)]" />
            )}
          </div>
        );
      })}

      {contextMenu && menuItems && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
