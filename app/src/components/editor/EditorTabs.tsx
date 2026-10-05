import React, { memo, useMemo } from 'react';
import { X } from '@phosphor-icons/react';
import type { FileTab } from '../../types';
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
  onOpenBeside?: (path: string) => void;
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
  onOpenBeside,
}) => {
  if (openFiles.length === 0) return null;

  const hasDirty = openFiles.some((f) => !f.isDirty);

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
      onOpenBeside={onOpenBeside}
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
  onOpenBeside?: (path: string) => void;
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
  onOpenBeside,
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
      ...(onOpenBeside ? [{ label: 'Open in other pane', action: () => onOpenBeside(contextMenu.path) }, { separator: true as const }] : []),
      { label: 'Close', action: () => onTabClose(contextMenu.path), shortcut: 'Ctrl+W' },
      { label: 'Close Others', action: () => onCloseOthers(contextMenu.path) },
      { label: 'Close to the Right', action: () => onCloseToRight(contextMenu.path), disabled: contextMenu.index >= openFiles.length - 1 },
      { separator: true as const },
      { label: 'Close All', action: onCloseAll },
      { label: 'Close Saved', action: onCloseSaved, disabled: !hasDirty },
    ];
  }, [contextMenu, openFiles.length, hasDirty, onTabClose, onCloseOthers, onCloseToRight, onCloseAll, onCloseSaved, onOpenBeside]);

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
      aria-label="Open files"
      className="flex shrink-0 items-center overflow-x-auto overflow-y-hidden scrollbar-none bg-[var(--bg-secondary)]"
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
            tabIndex={isActive ? 0 : -1}
            title={file.path}
            draggable
            onDragStart={(e) => {
              setDragIndex(index);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('application/yzpz-editor-file', file.path);
              e.dataTransfer.setData('text/plain', file.path);
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
              e.stopPropagation();
              const draggedPath = e.dataTransfer.getData('application/yzpz-editor-file');
              const fromIdx = openFiles.findIndex((entry) => entry.path === draggedPath);
              setDragIndex(null);
              setDragOverIndex(null);
              if (fromIdx >= 0 && fromIdx !== index) {
                onReorder(fromIdx, index);
              }
              if (draggedPath) {
                onTabClick(draggedPath);
              }
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDragOverIndex(null);
            }}
            className={`relative flex items-center gap-2 px-3 h-10 border-r cursor-pointer group min-w-0 shrink-0 max-w-[200px] transition-colors duration-100 ${
              isDragging ? 'opacity-40' : ''
            } ${
              isDragOver
                ? 'border-l-2 border-l-[var(--accent)] bg-[var(--accent-light)]'
                : ''
            } ${
                 isActive
                 ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] border-[var(--border-primary)]'
                 : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] border-[var(--border-primary)]'
            }`}
            onClick={() => onTabClick(file.path)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTabClick(file.path); }
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const nextIndex = e.key === 'Home' ? 0 : e.key === 'End' ? openFiles.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + openFiles.length) % openFiles.length;
                onTabClick(openFiles[nextIndex].path);
                const tabs = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
                tabs?.[nextIndex]?.focus();
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, file.path, index)}
          >
            <FileIcon
              extension={getExtension(file.name)}
              isDir={false}
              className="w-3.5 h-3.5 shrink-0"
            />
            <span className="text-[11px] truncate" title={file.path}>{file.name}</span>

            {file.isDirty && (
              <span className="w-2 h-2 rounded-full shrink-0 group-hover:hidden bg-[var(--accent)]" />
            )}

            <button
              type="button"
              aria-label={`Close ${file.name}${file.isDirty ? " (unsaved changes)" : ""}`}
              title={`Close ${file.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(file.path);
              }}
              className={`app-icon-button h-5 w-5 shrink-0 rounded transition-colors cursor-pointer ${
                file.isDirty
                   ? 'hidden group-hover:block group-focus-within:block hover:bg-[var(--bg-tertiary)]'
                   : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <X size={12} aria-hidden="true" />
            </button>

            {isActive && (
              <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--accent)]" />
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
