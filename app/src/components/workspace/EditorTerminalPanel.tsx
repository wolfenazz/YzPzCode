import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { ArrowsInSimple, ArrowsOutSimple, CaretDown, Check, Plus, TerminalWindow, Trash, X } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import {
  DEFAULT_PANEL_LAYOUT, EMPTY_PANEL_SESSIONS, PANEL_DEFAULT_HEIGHT, PANEL_MIN_HEIGHT, useEditorTerminalStore,
} from '../../stores/editorTerminalStore';
import { TerminalPane } from './TerminalPane';
import { AGENT_LOGOS, CLI_LABELS, isAgentType } from './TerminalHeader';
import type { AgentActivityState } from '../../utils/agentDoneNotifier';
import type { TerminalSession, WorkspaceConfig } from '../../types';
import './EditorTerminalPanel.css';

/**
 * The editor's bottom terminal panel, like VS Code's integrated terminal.
 *
 * One panel is mounted per open workspace and stays mounted while hidden (a
 * collapsed panel animates to zero height, other workspaces are display:none),
 * so shells keep their scrollback across view and workspace switches.
 */

/** Room the editor keeps above the panel. */
const EDITOR_MIN_HEIGHT = 96;
const SLIDE_EASE = [0.22, 1, 0.36, 1] as const;

interface ShellOption {
  name: string;
  path: string;
  isAvailable: boolean;
}

let shellsRequest: Promise<ShellOption[]> | null = null;
/** Detected once per app run; shells rarely change while the app is open. */
const loadShells = (): Promise<ShellOption[]> => {
  shellsRequest ??= invoke<ShellOption[]>('get_available_shells')
    .then((shells) => shells.filter((shell) => shell.isAvailable))
    .catch((error: unknown) => { shellsRequest = null; throw error; });
  return shellsRequest;
};

const shellLabel = (shell: string): string => {
  const base = shell.split(/[\\/]/).pop() ?? shell;
  return base.replace(/\.(exe|cmd|bat)$/i, '') || 'shell';
};

interface EditorTerminalPanelProps {
  workspace: WorkspaceConfig;
  /** This workspace is current and the editor view is on screen. */
  visible: boolean;
}

export function EditorTerminalPanel({ workspace, visible }: EditorTerminalPanelProps): React.JSX.Element {
  const animationsEnabled = useAppStore((state) => state.animationsEnabled);
  const reduceMotion = useReducedMotion();
  const motionOn = animationsEnabled && !reduceMotion;
  const layout = useEditorTerminalStore((state) => state.layoutByWorkspace[workspace.id]) ?? DEFAULT_PANEL_LAYOUT;
  const sessions = useEditorTerminalStore((state) => state.sessionsByWorkspace[workspace.id] ?? EMPTY_PANEL_SESSIONS);
  const activeId = useEditorTerminalStore((state) => state.activeByWorkspace[workspace.id] ?? null);
  const creating = useEditorTerminalStore((state) => state.creatingByWorkspace[workspace.id] ?? false);
  const error = useEditorTerminalStore((state) => state.errorByWorkspace[workspace.id] ?? null);
  const { setOpen, setHeight, setMaximized, setActive, createTerminal, killTerminal } = useEditorTerminalStore.getState();

  const sectionRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragHeightRef = useRef<number | null>(null);
  const [focusWithin, setFocusWithin] = useState(false);
  const [activityById, setActivityById] = useState<Record<string, AgentActivityState['phase']>>({});

  const activeSession = sessions.find((session) => session.id === activeId) ?? sessions[0] ?? null;

  // The column holding the editor and this panel bounds the panel's height.
  // A hidden editor measures 0; keep the last real size so nothing animates.
  useLayoutEffect(() => {
    const container = sectionRef.current?.closest('.workspace-editor-column');
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.height > 0) setContainerHeight(entry.contentRect.height); });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const maxHeight = Math.max(PANEL_MIN_HEIGHT, (containerHeight ?? Infinity) - EDITOR_MIN_HEIGHT);
  const height = Math.min(maxHeight, Math.max(PANEL_MIN_HEIGHT, dragHeight ?? (layout.maximized ? maxHeight : layout.height)));
  const open = layout.open;

  // Opening an empty panel starts a shell, as VS Code does.
  useEffect(() => {
    if (visible && open && sessions.length === 0 && !creating && !error) void createTerminal(workspace);
  }, [visible, open, sessions.length, creating, error, createTerminal, workspace]);

  const focusActive = useCallback((): void => {
    requestAnimationFrame(() => {
      bodyRef.current?.querySelector<HTMLTextAreaElement>('.tp__pane.is-active .xterm-helper-textarea')?.focus({ preventScroll: true });
    });
  }, []);

  // Opening the panel, switching tabs and new shells take the keyboard; merely
  // returning to the editor view leaves focus where it was.
  const focusedKeyRef = useRef<string | null>(null);
  const focusKey = open && activeSession ? activeSession.id : null;
  useEffect(() => {
    if (focusKey && focusKey !== focusedKeyRef.current && visible) focusActive();
    focusedKeyRef.current = focusKey;
  }, [focusKey, visible, focusActive]);

  const newTerminal = useCallback((shell?: string | null): void => {
    setOpen(workspace.id, true);
    void createTerminal(workspace, shell ?? null);
  }, [createTerminal, setOpen, workspace]);

  const handleActivity = useCallback((sessionId: string, activity: AgentActivityState) => {
    setActivityById((current) => current[sessionId] === activity.phase ? current : { ...current, [sessionId]: activity.phase });
  }, []);

  // ── Resize ───────────────────────────────────────────────────────────
  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!open) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragHeightRef.current = height;
    setDragHeight(height);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };
  const moveResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bottom = sectionRef.current?.getBoundingClientRect().bottom ?? window.innerHeight;
    const next = Math.min(maxHeight, Math.max(PANEL_MIN_HEIGHT, bottom - event.clientY));
    dragHeightRef.current = next;
    setDragHeight(next);
  };
  const endResize = (): void => {
    const finalHeight = dragHeightRef.current;
    if (finalHeight === null) return;
    dragHeightRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setHeight(workspace.id, finalHeight);
    setDragHeight(null);
  };
  const keyResize = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 64 : 16;
    if (event.key === 'ArrowUp') setHeight(workspace.id, Math.min(maxHeight, height + step));
    else if (event.key === 'ArrowDown') setHeight(workspace.id, Math.max(PANEL_MIN_HEIGHT, height - step));
    else if (event.key === 'Home') setHeight(workspace.id, PANEL_DEFAULT_HEIGHT);
    else return;
    event.preventDefault();
  };

  const resizing = dragHeight !== null;
  const labels = useTabLabels(sessions);

  return (
    <motion.section
      ref={sectionRef}
      className={`tp${resizing ? ' tp--resizing' : ''}${open ? ' tp--open' : ''}`}
      initial={false}
      animate={{ height: open ? height : 0 }}
      transition={resizing || !motionOn ? { duration: 0 } : { duration: 0.32, ease: SLIDE_EASE }}
      aria-label="Terminal panel"
      aria-hidden={!open}
      inert={!open}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false); }}
    >
      <div
        role="separator"
        tabIndex={open ? 0 : -1}
        aria-orientation="horizontal"
        aria-label="Resize terminal panel"
        aria-valuenow={Math.round(height)}
        aria-valuemin={PANEL_MIN_HEIGHT}
        aria-valuemax={Math.round(maxHeight)}
        className="tp__resizer"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onLostPointerCapture={endResize}
        onDoubleClick={() => setMaximized(workspace.id, !layout.maximized)}
        onKeyDown={keyResize}
      />
      {/* Anchored to the bottom at full height, so the panel slides up rather than squashing. */}
      <div className="tp__frame" style={{ height }}>
        <header className="tp__bar">
          <span className="tp__title"><TerminalWindow size={13} weight="bold" aria-hidden="true" />Terminal</span>
          <div className="tp__tabs" role="tablist" aria-label="Terminals">
            {sessions.map((session) => (
              <PanelTab
                key={session.id}
                session={session}
                label={labels[session.id]}
                workspaceId={workspace.id}
                selected={session.id === activeSession?.id}
                phase={activityById[session.id] ?? 'idle'}
                motionOn={motionOn}
                onSelect={() => { setActive(workspace.id, session.id); focusActive(); }}
                onClose={() => void killTerminal(workspace.id, session.id)}
              />
            ))}
          </div>
          <div className="tp__actions">
            <NewTerminalButton disabled={creating} onNew={newTerminal} />
            <span className="tp__divider" aria-hidden="true" />
            <button type="button" className="tp__icon" disabled={!activeSession} onClick={() => activeSession && void killTerminal(workspace.id, activeSession.id)} title="Kill terminal" aria-label="Kill the active terminal">
              <Trash size={14} />
            </button>
            <button type="button" className="tp__icon" onClick={() => setMaximized(workspace.id, !layout.maximized)} title={layout.maximized ? 'Restore panel size' : 'Maximize panel'} aria-label={layout.maximized ? 'Restore panel size' : 'Maximize panel'} aria-pressed={layout.maximized}>
              {layout.maximized ? <ArrowsInSimple size={14} /> : <ArrowsOutSimple size={14} />}
            </button>
            <button type="button" className="tp__icon" onClick={() => setOpen(workspace.id, false)} title="Hide panel (Ctrl+`)" aria-label="Hide terminal panel">
              <X size={14} />
            </button>
          </div>
        </header>

        <div ref={bodyRef} className="tp__body">
          {sessions.map((session) => (
            <div key={session.id} className={`tp__pane${session.id === activeSession?.id ? ' is-active' : ''}`}>
              <TerminalPane
                session={session}
                variant="embedded"
                embeddedActive={focusWithin && session.id === activeSession?.id}
                onAgentActivityChange={(activity) => handleActivity(session.id, activity)}
              />
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="tp__empty" role={error ? 'alert' : 'status'}>
              {error ? (
                <>
                  <p className="tp__error">Couldn’t start a shell: {error}</p>
                  <button type="button" className="app-button h-7 min-h-0 px-3 text-xs" onClick={() => newTerminal()}>Try again</button>
                </>
              ) : (
                <><span className="tp__spinner" aria-hidden="true" />Starting shell…</>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

/** Shell names, numbered when the same shell is open more than once (pwsh, pwsh 2…). */
function useTabLabels(sessions: TerminalSession[]): Record<string, string> {
  const manualAgents = useAppStore((state) => state.manualAgentBySession);
  return useMemo(() => {
    const seen = new Map<string, number>();
    return Object.fromEntries(sessions.map((session) => {
      const agent = manualAgents[session.id] ?? session.agent;
      const base = agent ? CLI_LABELS[agent] ?? agent : shellLabel(session.shell);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      return [session.id, count === 1 ? base : `${base} ${count}`];
    }));
  }, [sessions, manualAgents]);
}

// ── Tab ──────────────────────────────────────────────────────────────────

interface PanelTabProps {
  session: TerminalSession;
  label: string;
  workspaceId: string;
  selected: boolean;
  phase: AgentActivityState['phase'];
  motionOn: boolean;
  onSelect: () => void;
  onClose: () => void;
}

function PanelTab({ session, label, workspaceId, selected, phase, motionOn, onSelect, onClose }: PanelTabProps): React.JSX.Element {
  const agent = useAppStore((state) => state.manualAgentBySession[session.id]) ?? session.agent;
  const logo = agent && isAgentType(agent) ? AGENT_LOGOS[agent] : null;
  return (
    <div className={`tp__tab${selected ? ' is-selected' : ''}`} data-phase={phase}>
      {selected && (
        <motion.span
          layoutId={`tp-tab-${workspaceId}`}
          className="tp__tab-pill"
          transition={motionOn ? { type: 'spring', stiffness: 520, damping: 40 } : { duration: 0 }}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        className="tp__tab-main"
        onClick={onSelect}
        onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); onClose(); } }}
        title={`${label} — ${session.cwd}`}
      >
        <span className="tp__tab-icon">
          {logo ? <img src={logo} alt="" draggable={false} /> : <TerminalWindow size={13} />}
          {phase !== 'idle' && <span className="tp__tab-dot" aria-hidden="true" />}
        </span>
        <span className="tp__tab-label">{label}</span>
      </button>
      <button type="button" className="tp__tab-close" onClick={onClose} title={`Kill ${label}`} aria-label={`Kill ${label}`}>
        <X size={10} weight="bold" />
      </button>
    </div>
  );
}

// ── New terminal (+ shell picker) ────────────────────────────────────────

function NewTerminalButton({ disabled, onNew }: { disabled: boolean; onNew: (shell?: string | null) => void }): React.JSX.Element {
  const [menu, setMenu] = useState<{ right: number; bottom: number } | null>(null);
  const [shells, setShells] = useState<ShellOption[] | null>(null);
  const [shellError, setShellError] = useState<string | null>(null);
  const caretRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = (): void => {
    const rect = caretRef.current?.getBoundingClientRect();
    if (!rect) return;
    // The panel sits at the bottom of the window, so the menu opens upwards.
    setMenu({ right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.top + 6 });
    loadShells().then(setShells).catch((error: unknown) => setShellError(String(error)));
  };

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event): void => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof MouseEvent && (menuRef.current?.contains(event.target as Node) || caretRef.current?.contains(event.target as Node))) return;
      setMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  const pick = (shell: string | null): void => {
    setMenu(null);
    onNew(shell);
  };

  return (
    <div className="tp__new" role="group" aria-label="New terminal">
      <button type="button" className="tp__icon tp__new-main" disabled={disabled} onClick={() => onNew()} title="New terminal (Ctrl+Shift+`)" aria-label="New terminal">
        <Plus size={14} />
      </button>
      <button ref={caretRef} type="button" className="tp__icon tp__new-caret" disabled={disabled} onClick={() => menu ? setMenu(null) : openMenu()} aria-haspopup="menu" aria-expanded={Boolean(menu)} title="Choose a shell" aria-label="Choose a shell for the new terminal">
        <CaretDown size={10} weight="bold" />
      </button>
      {menu && createPortal(
        <div ref={menuRef} className="tp-menu" role="menu" aria-label="New terminal with shell" style={{ right: menu.right, bottom: menu.bottom }}>
          <p className="tp-menu__label">New terminal</p>
          <button type="button" role="menuitem" className="tp-menu__item" onClick={() => pick(null)}>
            <Check size={12} weight="bold" className="tp-menu__check" />Default shell<span className="tp-menu__kbd">Ctrl+Shift+`</span>
          </button>
          {shells === null && !shellError && <p className="tp-menu__note">Detecting shells…</p>}
          {shellError && <p className="tp-menu__note">{shellError}</p>}
          {shells?.map((shell) => (
            <button key={shell.path} type="button" role="menuitem" className="tp-menu__item" onClick={() => pick(shell.path)} title={shell.path}>
              <span className="tp-menu__check" aria-hidden="true" />{shell.name}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
