import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Columns, Rows, ArrowsLeftRight, MagnifyingGlass, SidebarSimple, TerminalWindow, X } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { useEditorTerminalStore } from '../../stores/editorTerminalStore';
import { isSidePanel, useExtensionStore } from '../../stores/extensionStore';
import '../workspace/ExtensionDock.css';
import { createEditorGroups, reconcileEditorGroups, useEditorLayoutStore } from '../../stores/editorLayoutStore';
import type { EditorGroup, EditorLayout } from '../../stores/editorLayoutStore';
import { EditorPane } from './EditorPane';
import { DiffViewer } from './DiffViewer';
import { EditorActionButton } from './EditorActionButton';
import { QuickOpenPalette } from './QuickOpenPalette';
import { useFileEditor } from '../../hooks/useFileEditor';

export function FileEditor({ diskSyncError }: { diskSyncError?: string | null }): ReactNode {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId) ?? 'default';
  const workspacePath = useAppStore((state) => state.currentWorkspace?.path);
  const openFiles = useAppStore((state) => state.openFiles);
  const activeFilePath = useAppStore((state) => state.activeFilePath);
  const setActiveFile = useAppStore((state) => state.setActiveFile);
  const gitDiffFile = useAppStore((state) => state.gitDiffFile);
  const setGitDiffFile = useAppStore((state) => state.setGitDiffFile);
  const savedGroups = useEditorLayoutStore((state) => state.workspaces[workspaceId]);
  const updateGroups = useEditorLayoutStore((state) => state.updateGroups);
  const paths = useMemo(() => openFiles.map((file) => file.path), [openFiles]);
  const groups = reconcileEditorGroups(savedGroups ?? createEditorGroups(activeFilePath), paths, activeFilePath);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<EditorGroup | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const { openFile, openError } = useFileEditor();
  const terminalOpen = useEditorTerminalStore((state) => state.layoutByWorkspace[workspaceId]?.open ?? false);
  const toggleTerminal = useEditorTerminalStore((state) => state.toggle);
  const dockOpen = useExtensionStore((state) => state.dockByWorkspace[workspaceId]?.open ?? false);
  const toggleDock = useExtensionStore((state) => state.toggleDock);
  const dockPhase = useExtensionStore((state) => {
    const phases = (state.panelsByWorkspace[workspaceId] ?? []).filter(isSidePanel).map((panel) => state.activityByPanel[panel.id]?.phase);
    return phases.includes('busy') ? 'busy' : phases.includes('done') ? 'done' : 'idle';
  });

  // Explorer, quick-open, and search navigation target the focused pane.
  useEffect(() => {
    const current = useEditorLayoutStore.getState().workspaces[workspaceId] ?? createEditorGroups(activeFilePath);
    const reconciled = reconcileEditorGroups(current, paths, activeFilePath);
    if (activeFilePath && paths.includes(activeFilePath)) reconciled[reconciled.focused] = activeFilePath;
    if (JSON.stringify(current) !== JSON.stringify(reconciled) || !savedGroups) updateGroups(workspaceId, reconciled);
  }, [workspaceId, activeFilePath, paths, savedGroups, updateGroups]);

  const selectFile = useCallback((group: EditorGroup, path: string) => {
    updateGroups(workspaceId, { [group]: path, focused: group });
    setActiveFile(path);
  }, [workspaceId, updateGroups, setActiveFile]);

  const split = useCallback((layout: EditorLayout, path?: string) => {
    const current = useEditorLayoutStore.getState().workspaces[workspaceId] ?? createEditorGroups(activeFilePath);
    const other: EditorGroup = current.focused === 'primary' ? 'secondary' : 'primary';
    const target = path ?? openFiles.find((file) => file.path !== current[current.focused])?.path ?? current[current.focused];
    updateGroups(workspaceId, { layout, [other]: target, focused: other });
    if (target) setActiveFile(target);
  }, [workspaceId, activeFilePath, openFiles, updateGroups, setActiveFile]);

  const closeSplit = useCallback(() => {
    const path = groups[groups.focused] ?? groups.primary;
    updateGroups(workspaceId, { layout: 'single', primary: path, secondary: null, focused: 'primary' });
    if (path) setActiveFile(path);
  }, [groups, workspaceId, updateGroups, setActiveFile]);

  const focusPane = useCallback((group: EditorGroup): void => {
    const pane = containerRef.current?.querySelector<HTMLElement>(`[data-editor-group="${group}"]`);
    const input = pane?.querySelector<HTMLTextAreaElement>('.monaco-editor textarea');
    if (input?.getClientRects().length) input.focus({ preventScroll: true });
    else pane?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (useAppStore.getState().activeView !== 'editor' || !(event.ctrlKey || event.metaKey)) return;
      if (event.code === 'Backslash') {
        event.preventDefault(); split(event.shiftKey ? 'rows' : 'columns');
      } else if (event.key === '1' && event.altKey) {
        event.preventDefault(); if (groups.primary) { selectFile('primary', groups.primary); focusPane('primary'); }
      } else if (event.key === '2' && event.altKey && groups.layout !== 'single') {
        event.preventDefault(); if (groups.secondary) { selectFile('secondary', groups.secondary); focusPane('secondary'); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [split, groups, selectFile, focusPane]);

  const moveDivider = (clientX: number, clientY: number): void => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = groups.layout === 'columns' ? (clientX - rect.left) / rect.width * 100 : (clientY - rect.top) / rect.height * 100;
    updateGroups(workspaceId, { ratio: Math.max(20, Math.min(80, ratio)) });
  };

  const pane = (group: EditorGroup): ReactNode => <section key={`${workspaceId}:${group}`} data-editor-group={group} tabIndex={-1} aria-label={`${group === 'primary' ? 'First' : 'Second'} editor pane`}
    className={`relative min-h-0 min-w-0 overflow-hidden ${dropTarget === group ? 'ring-2 ring-inset ring-[var(--accent)]' : ''}`}
    onPointerDownCapture={() => { if (groups[group] && groups.focused !== group) selectFile(group, groups[group]); }}
    onFocusCapture={() => { if (groups[group] && groups.focused !== group) selectFile(group, groups[group]); }}
    onDragOver={(event) => { if (event.dataTransfer.types.includes('application/yzpz-editor-file')) { event.preventDefault(); setDropTarget(group); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }}
    onDrop={(event) => {
      const path = event.dataTransfer.getData('application/yzpz-editor-file'); setDropTarget(null);
      if (paths.includes(path)) { event.preventDefault(); selectFile(group, path); }
    }}>
    <EditorPane activeFilePath={groups[group]} focused={groups.focused === group} groupLabel={group === 'primary' ? '01' : '02'}
      onSelectFile={(path) => selectFile(group, path)} onOpenBeside={(path) => split(groups.layout === 'rows' ? 'rows' : 'columns', path)} />
  </section>;

  return <div className="flex h-full min-w-0 flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3">
      <div className="flex min-w-0 items-center gap-2 text-xs"><span className="font-semibold">Editor</span><span className="truncate text-[var(--text-secondary)]">{openFiles.length} open {openFiles.length === 1 ? 'file' : 'files'}</span></div>
      <div className="flex items-center gap-0.5" role="group" aria-label="Editor layout">
        <EditorActionButton label="Open file (Ctrl+P)" onClick={() => setQuickOpen(true)} disabled={!workspacePath}><MagnifyingGlass size={16} /></EditorActionButton>
        <span className="mx-1 h-4 w-px bg-[var(--border-primary)]" />
        <EditorActionButton label="Split right (Ctrl+Backslash)" active={groups.layout === 'columns'} disabled={paths.length === 0} onClick={() => groups.layout === 'single' ? split('columns') : updateGroups(workspaceId, { layout: 'columns' })}><Columns size={16} /></EditorActionButton>
        <EditorActionButton label="Split down (Ctrl+Shift+Backslash)" active={groups.layout === 'rows'} disabled={paths.length === 0} onClick={() => groups.layout === 'single' ? split('rows') : updateGroups(workspaceId, { layout: 'rows' })}><Rows size={16} /></EditorActionButton>
        {groups.layout !== 'single' && <>
          <EditorActionButton label="Swap panes" onClick={() => { updateGroups(workspaceId, { primary: groups.secondary, secondary: groups.primary }); const next = groups.focused === 'primary' ? groups.secondary : groups.primary; if (next) setActiveFile(next); }}><ArrowsLeftRight size={16} /></EditorActionButton>
          <EditorActionButton label="Close split; keep focused file" onClick={closeSplit}><X size={16} /></EditorActionButton>
        </>}
        <span className="mx-1 h-4 w-px bg-[var(--border-primary)]" />
        <EditorActionButton label={terminalOpen ? 'Hide terminal (Ctrl+`)' : 'Show terminal (Ctrl+`)'} active={terminalOpen} disabled={!workspacePath} onClick={() => toggleTerminal(workspaceId)}><TerminalWindow size={16} /></EditorActionButton>
        <span className="xd-toggle">
          <EditorActionButton label={dockOpen ? 'Hide side panel (Ctrl+Alt+B)' : 'Show side panel (Ctrl+Alt+B)'} active={dockOpen} onClick={() => toggleDock(workspaceId)}><SidebarSimple size={16} mirrored /></EditorActionButton>
          {/* While the panel is hidden, show that an assistant is working or done. */}
          {!dockOpen && dockPhase !== 'idle' && <span className="xd-toggle__dot" data-phase={dockPhase} aria-hidden="true" />}
        </span>
      </div>
    </header>
    {(diskSyncError || openError) && <p role="alert" className="border-b border-[var(--border-primary)] px-3 py-2 text-xs text-rose-400">{diskSyncError ?? openError}</p>}
    {quickOpen && workspacePath && <QuickOpenPalette workspacePath={workspacePath} onSelect={(entry) => { void openFile(entry); setQuickOpen(false); }} onClose={() => setQuickOpen(false)} />}
    {gitDiffFile && workspacePath ? <div className="relative min-h-0 flex-1"><DiffViewer workspacePath={workspacePath} filePath={gitDiffFile.path} fileName={gitDiffFile.name} onClose={() => setGitDiffFile(null)} /></div> :
      <div ref={containerRef} className={`grid min-h-0 min-w-0 flex-1 ${dragging ? 'select-none' : ''}`}
        style={groups.layout === 'single' ? { gridTemplateColumns: 'minmax(0, 1fr)' } : groups.layout === 'columns' ? { gridTemplateColumns: `minmax(0, ${groups.ratio}fr) 5px minmax(0, ${100 - groups.ratio}fr)` } : { gridTemplateRows: `minmax(0, ${groups.ratio}fr) 5px minmax(0, ${100 - groups.ratio}fr)` }}>
        {pane('primary')}
        {groups.layout !== 'single' && <>
          <div role="separator" tabIndex={0} aria-label="Resize editor panes" aria-orientation={groups.layout === 'columns' ? 'vertical' : 'horizontal'} aria-valuenow={Math.round(groups.ratio)} aria-valuemin={20} aria-valuemax={80}
            className={`z-10 touch-none bg-[var(--border-primary)] hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)] focus-visible:outline-none ${groups.layout === 'columns' ? 'cursor-col-resize' : 'cursor-row-resize'}`}
            onDoubleClick={() => updateGroups(workspaceId, { ratio: 50 })}
            onKeyDown={(event) => { if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home'].includes(event.key)) { event.preventDefault(); updateGroups(workspaceId, { ratio: event.key === 'Home' ? 50 : Math.max(20, Math.min(80, groups.ratio + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -5 : 5))) }); } }}
            onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }}
            onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) moveDivider(event.clientX, event.clientY); }}
            onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false); }} onLostPointerCapture={() => setDragging(false)} />
          {pane('secondary')}
        </>}
      </div>}
  </div>;
}
