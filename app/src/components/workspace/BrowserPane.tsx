import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppWindow, CircleNotch, Swatches, X } from '@phosphor-icons/react';
import { IconContext } from '@phosphor-icons/react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type {
  AppliedStyle,
  BrowserDeviceId,
  BrowserElementSelectedEventPayload,
  BrowserInspectModePayload,
  BrowserInspectorRequestPayload,
  BrowserInspectorWidgetStatus,
  BrowserSelectedElement,
  BrowserOpenTabPayload,
  BrowserPageLoadPayload,
  BrowserPageStatePayload,
  BrowserPopoutStatePayload,
  BrowserShortcutAction,
  BrowserShortcutPayload,
  BrowserSnapshotPayload,
  BrowserViewportSize,
  BrowserWorkspaceEventPayload,
  BrowserWorkspaceState,
  CapturedStyle,
  CapturedUiElementReference,
  TerminalSession,
  WorkspaceScoped,
} from '../../types';
import { useAppStore } from '../../stores/appStore';
import { EMPTY_EXTENSION_PANELS, useExtensionStore } from '../../stores/extensionStore';
import { getExtensionIcon } from '../../data/extensionIcons';
import { extensionPanelIdFromTarget, extensionTargetId, sendPromptToExtensionPanel } from '../../utils/extensionPrompt';
import { useBrowser } from '../../hooks/useBrowser';
import { useBrowserAutoReload } from '../../hooks/useBrowserAutoReload';
import { useTerminal } from '../../hooks/useTerminal';
import { htmlToPlainText, plainTextToHtml } from '../../utils/richText';
import { formatElementPrompt } from '../../utils/inspectorPrompt';
import {
  BROWSER_NEW_TAB_URL,
  getUrlTabLabel,
  isLocalUrl,
  isNewTabUrl,
  resolveOmniboxInput,
} from '../../utils/browserUrl';
import { BrowserFavicon, BrowserTabBar } from './BrowserTabBar';
import { StyleClipboardPanel } from './StyleClipboardPanel';
import { ElementInspectorPanel } from './ElementInspectorPanel';
import type { AgentTargetOption } from './AgentTargetSelect';
import { NativeOverlayContext } from './browser/BrowserMenu';
import type { BrowserOmniboxHandle } from './browser/BrowserOmnibox';
import { BrowserToolbar, type BrowserSidePanel } from './browser/BrowserToolbar';
import { BrowserDeviceMenu } from './browser/BrowserDeviceMenu';
import { BrowserStatusBar, type BrowserStatusMessage, type BrowserToolMode } from './browser/BrowserStatusBar';
import { BrowserStartPage, type DevServerEntry } from './browser/BrowserStartPage';
import { UiReferencesPanel } from './browser/UiReferencesPanel';
import {
  buildSnapshotPaths,
  clampZoom,
  DEV_SERVER_PROBE_PORTS,
  findDevice,
  formatUiReferencePrompt,
  getNextZoom,
  getViewportMetrics,
  isLocalPortResponding,
  sessionDisplayName,
  submitBracketedPaste,
} from './browser/browserModel';
import './browser/browser.css';

interface BrowserPaneProps {
  workspaceId: string;
  sessions: TerminalSession[];
}

const BROWSER_ICON_CONTEXT = { weight: 'regular' as const };
const EMPTY_DEV_SERVER_URLS: string[] = [];
const MESSAGE_TIMEOUT_MS = 4000;

const browserUrlsEqual = (left: string, right: string): boolean => {
  const normalize = (value: string): string => {
    try {
      return new URL(value.trim()).toString();
    } catch {
      return value.trim();
    }
  };
  return normalize(left) === normalize(right);
};

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Secret shared with the in-page quick prompt card; requests without it are ignored. */
const createWidgetToken = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** `li.landing-point`-style name shown on the quick prompt card. */
const describeElement = (element: BrowserSelectedElement): string => {
  const classes = (element.className ?? '').split(/\s+/).filter(Boolean).slice(0, 2);
  const label = `${element.tagName}${element.id ? `#${element.id}` : ''}${classes.map((name) => `.${name}`).join('')}`;
  return label.length > 60 ? `${label.slice(0, 59)}…` : label;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
};

/** Maps a key event in the app UI to a browser shortcut action. */
const resolveShortcut = (event: KeyboardEvent): BrowserShortcutAction | null => {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (event.key === 'F5') return 'reload';
  if (event.altKey && !mod && key === 'ArrowLeft') return 'back';
  if (event.altKey && !mod && key === 'ArrowRight') return 'forward';
  if (!mod || event.altKey) return null;
  if (event.shiftKey && key === 'c') return 'toggle-inspect';
  if (event.shiftKey && key === 'r') return 'hard-reload';
  if (key === 'PageDown') return 'next-tab';
  if (key === 'PageUp') return 'previous-tab';
  if (event.shiftKey) return null;
  switch (key) {
    case 'l': return 'focus-address';
    case 'r': return 'reload';
    case 't': return 'new-tab';
    case 'w': return 'close-tab';
    case '=':
    case '+': return 'zoom-in';
    case '-': return 'zoom-out';
    case '0': return 'zoom-reset';
    default: return null;
  }
};

export const BrowserPane: React.FC<BrowserPaneProps> = ({ workspaceId, sessions }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const omniboxRef = useRef<BrowserOmniboxHandle>(null);
  const loadStartRef = useRef<number | null>(null);
  const lastSyncedBoundsKeyRef = useRef<string | null>(null);
  const browserSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingNavigationUrlRef = useRef<string | null>(null);
  const browserDisposedRef = useRef(false);
  const inspectorPreviewQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isPoppedOutRef = useRef(false);
  const nativeSuppressedRef = useRef(false);
  const openOverlaysRef = useRef(new Set<string>());
  const scanInFlightRef = useRef(false);

  const browserState = useAppStore((state) => state.browserStateByWorkspace[workspaceId]);
  const devServerUrls = useAppStore((state) => state.devServerUrlsByWorkspace[workspaceId] ?? EMPTY_DEV_SERVER_URLS);
  const extensionPanels = useExtensionStore((state) => state.panelsByWorkspace[workspaceId] ?? EMPTY_EXTENSION_PANELS);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const currentWorkspacePath = useAppStore((state) => state.currentWorkspace?.path ?? null);
  const appZoom = useAppStore((state) => state.appZoom);
  const ensureBrowserState = useAppStore((state) => state.ensureBrowserState);
  const setBrowserCurrentUrl = useAppStore((state) => state.setBrowserCurrentUrl);
  const setBrowserLoading = useAppStore((state) => state.setBrowserLoading);
  const setBrowserInspectModeState = useAppStore((state) => state.setBrowserInspectMode);
  const setBrowserZoomFactor = useAppStore((state) => state.setBrowserZoomFactor);
  const setBrowserDeviceId = useAppStore((state) => state.setBrowserDeviceId);
  const setBrowserDeviceOrientation = useAppStore((state) => state.setBrowserDeviceOrientation);
  const setBrowserCustomViewport = useAppStore((state) => state.setBrowserCustomViewport);
  const setBrowserAutoReload = useAppStore((state) => state.setBrowserAutoReload);
  const clearBrowserModes = useAppStore((state) => state.clearBrowserModes);
  const setBrowserSelectedElement = useAppStore((state) => state.setBrowserSelectedElement);
  const setBrowserInstructionSlots = useAppStore((state) => state.setBrowserInstructionSlots);
  const setActiveBrowserInstructionSlot = useAppStore((state) => state.setActiveBrowserInstructionSlot);
  const setBrowserTargetSession = useAppStore((state) => state.setBrowserTargetSession);
  const clearBrowserSelection = useAppStore((state) => state.clearBrowserSelection);
  const addBrowserTab = useAppStore((state) => state.addBrowserTab);
  const openBrowserTab = useAppStore((state) => state.openBrowserTab);
  const addDevServerUrl = useAppStore((state) => state.addDevServerUrl);
  const removeBrowserTab = useAppStore((state) => state.removeBrowserTab);
  const setActiveBrowserTab = useAppStore((state) => state.setActiveBrowserTab);
  const updateBrowserTab = useAppStore((state) => state.updateBrowserTab);
  const addCapturedStyle = useAppStore((state) => state.addCapturedStyle);
  const removeCapturedStyle = useAppStore((state) => state.removeCapturedStyle);
  const setBrowserPickStyleModeState = useAppStore((state) => state.setBrowserPickStyleMode);
  const addCapturedUiReference = useAppStore((state) => state.addCapturedUiReference);
  const removeCapturedUiReference = useAppStore((state) => state.removeCapturedUiReference);
  const setActiveUiReference = useAppStore((state) => state.setActiveUiReference);
  const setBrowserPickUiElementModeState = useAppStore((state) => state.setBrowserPickUiElementMode);
  const setBrowserUiReferencePrompt = useAppStore((state) => state.setBrowserUiReferencePrompt);
  const setBrowserUiReferenceMode = useAppStore((state) => state.setBrowserUiReferenceMode);
  const setBrowserApplyModeState = useAppStore((state) => state.setBrowserApplyMode);
  const addAppliedStyle = useAppStore((state) => state.addAppliedStyle);
  const undoBrowserStyleStore = useAppStore((state) => state.undoBrowserStyle);

  const [message, setMessage] = useState<BrowserStatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nativeBrowserReady, setNativeBrowserReady] = useState(false);
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const [pageTitle, setPageTitle] = useState('');
  const [navState, setNavState] = useState<{ canGoBack: boolean; canGoForward: boolean }>({ canGoBack: true, canGoForward: true });
  const [lastLoadDurationMs, setLastLoadDurationMs] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<BrowserSidePanel | null>(null);
  const [lastApplied, setLastApplied] = useState<AppliedStyle | null>(null);
  const [applyingStyleId, setApplyingStyleId] = useState<string | null>(null);
  const [liveServers, setLiveServers] = useState<ReadonlySet<string>>(() => new Set());
  const [scanning, setScanning] = useState(false);
  // Selecting an element shows the compact quick prompt in the page; this opens
  // the full side panel instead.
  const [inspectorPanelOpen, setInspectorPanelOpen] = useState(false);
  const [widgetStatus, setWidgetStatus] = useState<BrowserInspectorWidgetStatus | null>(null);
  const widgetStatusSeqRef = useRef(0);
  const widgetShownRef = useRef(false);
  /** Text the quick prompt should start with, consumed by the next widget push. */
  const widgetDraftRef = useRef<string | null>(null);
  const inspectorPanelOpenRef = useRef(false);
  inspectorPanelOpenRef.current = inspectorPanelOpen;
  const inspectorRequestRef = useRef<(request: BrowserInspectorRequestPayload) => void>(() => undefined);

  const {
    ensureBrowserView,
    navigateBrowserView,
    reloadBrowserView,
    stopBrowserView,
    setBrowserViewVisibility,
    setBrowserInspectMode,
    setBrowserZoom,
    setBrowserPreviewChrome,
    popOutBrowserView,
    dockBrowserView,
    goBackBrowserView,
    goForwardBrowserView,
    exportBrowserSnapshot,
    setBrowserPickStyleMode,
    setBrowserPickUiElementMode,
    setBrowserApplyMode,
    undoBrowserStyle,
    previewBrowserElementStyles,
    clearBrowserElementPreview,
    setBrowserInspectorWidget,
  } = useBrowser();
  const { writeToTerminal } = useTerminal();

  const state: BrowserWorkspaceState = useMemo(() => browserState ?? {
    currentUrl: BROWSER_NEW_TAB_URL,
    draftUrl: BROWSER_NEW_TAB_URL,
    isLoading: false,
    inspectMode: false,
    pickStyleMode: false,
    pickUiElementMode: false,
    applyMode: false,
    zoomFactor: 1,
    deviceId: 'responsive',
    deviceOrientation: 'portrait',
    customViewport: { width: 1024, height: 768 },
    autoReload: true,
    selectedElement: null,
    prompt: '',
    instructionSlots: [''],
    activeInstructionSlot: 0,
    uiReferencePrompt: '',
    uiReferenceMode: 'insert',
    targetSessionId: null,
    browserTabs: [{ id: 'default', url: BROWSER_NEW_TAB_URL, title: 'New Tab' }],
    activeTabId: 'default',
    styleClipboard: [],
    uiReferenceClipboard: [],
    activeUiReferenceId: null,
    appliedStyles: [],
  }, [browserState]);

  const activeTab = state.browserTabs.find((tab) => tab.id === state.activeTabId) ?? state.browserTabs[0];
  const activeUrl = activeTab?.url ?? state.currentUrl;
  const isStartPage = isNewTabUrl(activeUrl);
  const nativeSuppressed = isStartPage || overlayOpen;
  const customViewport = state.customViewport ?? { width: 1024, height: 768 };
  const autoReload = state.autoReload ?? true;

  useBrowserAutoReload(workspaceId, autoReload && !isStartPage);

  // ── Messages ─────────────────────────────────────────────────────────
  const showMessage = useCallback((tone: BrowserStatusMessage['tone'], text: string) => {
    setMessage({ id: Date.now(), tone, text });
  }, []);
  const reportError = useCallback((err: unknown) => showMessage('error', errorText(err)), [showMessage]);

  useEffect(() => {
    if (!message || message.tone === 'error') return;
    const timer = window.setTimeout(() => setMessage((current) => (current?.id === message.id ? null : current)), MESSAGE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  // ── Agent targets ────────────────────────────────────────────────────
  // Agent terminals (shells only when no agent runs) and extension panels
  // (Claude Code, Codex, Kilo Code… in the Extensions view or side panel).
  const sessionOptions = useMemo<AgentTargetOption[]>(() => {
    const agentSessions = sessions.filter((session) => session.agent);
    const terminals = (agentSessions.length > 0 ? agentSessions : sessions).map((session) => ({
      id: session.id,
      label: sessionDisplayName(session),
      agent: session.agent ?? null,
    }));
    const extensions = extensionPanels.map((panel) => ({
      id: extensionTargetId(panel.id),
      label: panel.name,
      agent: null,
      logo: getExtensionIcon(panel.extensionId),
      detail: panel.dock === 'side' ? 'Side panel' : 'Extension',
    }));
    return [...terminals, ...extensions];
  }, [extensionPanels, sessions]);

  const defaultSessionId = useMemo(() => {
    if (activeSessionId && sessionOptions.some((option) => option.id === activeSessionId)) return activeSessionId;
    return sessionOptions[0]?.id ?? null;
  }, [activeSessionId, sessionOptions]);

  // A saved target whose terminal or panel has since closed falls back to the default.
  const targetSessionId = state.targetSessionId && sessionOptions.some((option) => option.id === state.targetSessionId)
    ? state.targetSessionId
    : defaultSessionId;

  useEffect(() => {
    if (!state.targetSessionId && defaultSessionId) setBrowserTargetSession(workspaceId, defaultSessionId);
  }, [defaultSessionId, setBrowserTargetSession, state.targetSessionId, workspaceId]);

  // ── Viewport ─────────────────────────────────────────────────────────
  const activeDevice = findDevice(state.deviceId);
  const metrics = useMemo(
    () => getViewportMetrics(hostSize.width, hostSize.height, activeDevice, state.deviceOrientation, state.zoomFactor, customViewport),
    [activeDevice, customViewport, hostSize.height, hostSize.width, state.deviceOrientation, state.zoomFactor],
  );
  const effectiveZoom = isPoppedOut ? state.zoomFactor : metrics.webviewZoom;
  const deviceLabel = activeDevice.category === 'responsive'
    ? 'Responsive'
    : `${activeDevice.label} ${metrics.cssWidth}×${metrics.cssHeight}`;

  const eventContextRef = useRef({
    activeTabId: state.activeTabId,
    isStartPage,
    currentWorkspacePath,
    defaultSessionId,
    deviceId: state.deviceId,
    deviceLabel,
    deviceOrientation: state.deviceOrientation,
    pageTitle,
    selectedElement: state.selectedElement,
    targetSessionId: state.targetSessionId,
    cssWidth: metrics.cssWidth,
    cssHeight: metrics.cssHeight,
    zoom: effectiveZoom,
  });
  eventContextRef.current = {
    activeTabId: state.activeTabId,
    isStartPage,
    currentWorkspacePath,
    defaultSessionId,
    deviceId: state.deviceId,
    deviceLabel,
    deviceOrientation: state.deviceOrientation,
    pageTitle,
    selectedElement: state.selectedElement,
    targetSessionId: state.targetSessionId,
    cssWidth: metrics.cssWidth,
    cssHeight: metrics.cssHeight,
    zoom: effectiveZoom,
  };

  useEffect(() => {
    ensureBrowserState(workspaceId);
  }, [ensureBrowserState, workspaceId]);

  useEffect(() => {
    isPoppedOutRef.current = isPoppedOut;
  }, [isPoppedOut]);

  useEffect(() => {
    const host = stageRef.current;
    if (!host) return;
    const updateSize = () => {
      const rect = host.getBoundingClientRect();
      setHostSize((current) => (
        Math.round(current.width) === Math.round(rect.width) && Math.round(current.height) === Math.round(rect.height)
          ? current
          : { width: rect.width, height: rect.height }
      ));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(host);
    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [appZoom]);

  // ── Native webview sync ──────────────────────────────────────────────
  const enqueue = useCallback((task: () => Promise<void>) => {
    const next = browserSyncQueueRef.current.then(task);
    browserSyncQueueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const syncBrowserBounds = useCallback(() => enqueue(async () => {
    // Serialize creation, resizing and tab navigation. Read the latest tab
    // when this task runs so an earlier resize cannot reopen a stale URL.
    if (browserDisposedRef.current || isPoppedOutRef.current || nativeSuppressedRef.current) return;

    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return;

    // DOMRect values are CSS pixels inside the zoomed main webview, while
    // Tauri positions child webviews in unzoomed logical pixels.
    const appZoomFactor = appZoom / 100;
    const bounds = {
      x: rect.left * appZoomFactor,
      y: rect.top * appZoomFactor,
      width: rect.width * appZoomFactor,
      height: rect.height * appZoomFactor,
    };

    const latest = useAppStore.getState().browserStateByWorkspace[workspaceId];
    const requestedTabId = latest?.activeTabId;
    const tab = latest?.browserTabs.find((entry) => entry.id === requestedTabId);
    const url = tab?.url || latest?.currentUrl || BROWSER_NEW_TAB_URL;
    if (isNewTabUrl(url)) return;

    const boundsKey = JSON.stringify({
      url,
      tabId: tab?.id,
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
    if (lastSyncedBoundsKeyRef.current === boundsKey) return;

    try {
      pendingNavigationUrlRef.current = url;
      const view = await ensureBrowserView(workspaceId, url, bounds);
      if (browserDisposedRef.current || nativeSuppressedRef.current) {
        const appState = useAppStore.getState();
        if (nativeSuppressedRef.current || appState.activeView !== 'browser' || appState.activeWorkspaceId !== workspaceId) {
          await setBrowserViewVisibility(workspaceId, false);
        }
        return;
      }
      if (useAppStore.getState().browserStateByWorkspace[workspaceId]?.activeTabId !== requestedTabId) {
        pendingNavigationUrlRef.current = null;
        return;
      }
      // ensure only creates/shows the surface; an existing native webview
      // deliberately keeps its previous page. Explicitly navigate it here.
      if (!browserUrlsEqual(view.currentUrl, url)) {
        await navigateBrowserView(workspaceId, url);
      } else {
        pendingNavigationUrlRef.current = null;
      }
      const newest = useAppStore.getState().browserStateByWorkspace[workspaceId];
      if (newest?.activeTabId !== requestedTabId) return;
      if (!browserUrlsEqual(newest?.currentUrl ?? '', url)) setBrowserCurrentUrl(workspaceId, url);
      lastSyncedBoundsKeyRef.current = boundsKey;
      setNativeBrowserReady(true);
    } catch (err) {
      pendingNavigationUrlRef.current = null;
      if (browserDisposedRef.current) return;
      setNativeBrowserReady(false);
      reportError(err);
    }
  }), [appZoom, enqueue, ensureBrowserView, navigateBrowserView, reportError, setBrowserCurrentUrl, setBrowserViewVisibility, workspaceId]);

  // Hide the native surface while the start page or a menu needs the space;
  // bring it back (re-synced) as soon as nothing covers it.
  useEffect(() => {
    nativeSuppressedRef.current = nativeSuppressed;
    if (isPoppedOut) return;
    if (nativeSuppressed) {
      lastSyncedBoundsKeyRef.current = null;
      void enqueue(() => setBrowserViewVisibility(workspaceId, false).catch(() => undefined));
    } else {
      void syncBrowserBounds();
    }
  }, [enqueue, isPoppedOut, nativeSuppressed, setBrowserViewVisibility, syncBrowserBounds, workspaceId]);

  useEffect(() => {
    let frame = 0;
    let timeout: number | null = null;
    frame = requestAnimationFrame(() => void syncBrowserBounds());
    // A second pass after layout transitions (panels sliding in) settle.
    timeout = window.setTimeout(() => void syncBrowserBounds(), 260);
    return () => {
      cancelAnimationFrame(frame);
      if (timeout !== null) window.clearTimeout(timeout);
    };
    // The URL is deliberately not a dependency: page events update it after
    // client-side navigation, and re-syncing then could reload the page.
  }, [
    state.activeTabId,
    state.deviceId,
    state.deviceOrientation,
    syncBrowserBounds,
    // The stage size moves a centred device frame even when its scale
    // doesn't change (e.g. the inspector panel widening).
    hostSize.width,
    hostSize.height,
    metrics.viewportHeight,
    metrics.viewportWidth,
    isPoppedOut,
    activePanel,
    state.selectedElement,
  ]);

  useEffect(() => {
    browserDisposedRef.current = false;
    return () => {
      browserDisposedRef.current = true;
      if (!isPoppedOutRef.current) {
        void setBrowserViewVisibility(workspaceId, false).catch(() => undefined);
      }
    };
  }, [setBrowserViewVisibility, workspaceId]);

  useEffect(() => {
    if (!nativeBrowserReady) return;
    void setBrowserZoom(workspaceId, effectiveZoom).catch(reportError);
  }, [effectiveZoom, nativeBrowserReady, reportError, setBrowserZoom, workspaceId]);

  useEffect(() => {
    if (!nativeBrowserReady || isPoppedOut) return;
    // Native child webviews are rectangular OS surfaces and cannot be clipped
    // by the React layer, so clear any injected device chrome.
    void setBrowserPreviewChrome(workspaceId, null).catch(reportError);
  }, [isPoppedOut, nativeBrowserReady, reportError, setBrowserPreviewChrome, workspaceId]);

  const registerOverlay = useCallback((id: string, open: boolean) => {
    const overlays = openOverlaysRef.current;
    if (open) overlays.add(id);
    else overlays.delete(id);
    setOverlayOpen(overlays.size > 0);
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────
  const navigateTo = useCallback(async (input: string) => {
    const url = resolveOmniboxInput(input);
    if (!url) return;
    const tabId = useAppStore.getState().browserStateByWorkspace[workspaceId]?.activeTabId;
    if (tabId) updateBrowserTab(workspaceId, tabId, { url, title: getUrlTabLabel(url), favicon: null });
    setBrowserCurrentUrl(workspaceId, url);
    if (isNewTabUrl(url)) return;

    // Leaving the start page: the tab change above re-syncs the webview,
    // which creates it (if needed) and navigates to the new URL.
    if (isNewTabUrl(activeUrl) || !nativeBrowserReady) {
      lastSyncedBoundsKeyRef.current = null;
      void syncBrowserBounds();
      return;
    }

    setBrowserLoading(workspaceId, true);
    try {
      // Same queue as the bounds sync, so a resize can't race the navigation.
      await enqueue(async () => {
        pendingNavigationUrlRef.current = url;
        await navigateBrowserView(workspaceId, url);
        lastSyncedBoundsKeyRef.current = null;
      });
      setMessage((current) => (current?.tone === 'error' ? null : current));
    } catch (err) {
      pendingNavigationUrlRef.current = null;
      setBrowserLoading(workspaceId, false);
      reportError(err);
    }
  }, [activeUrl, enqueue, nativeBrowserReady, navigateBrowserView, reportError, setBrowserCurrentUrl, setBrowserLoading, syncBrowserBounds, updateBrowserTab, workspaceId]);

  const handleReload = useCallback(async () => {
    if (isStartPage) return;
    setBrowserLoading(workspaceId, true);
    try {
      await reloadBrowserView(workspaceId);
    } catch (err) {
      setBrowserLoading(workspaceId, false);
      reportError(err);
    }
  }, [isStartPage, reloadBrowserView, reportError, setBrowserLoading, workspaceId]);

  const handleStop = useCallback(async () => {
    try {
      await stopBrowserView(workspaceId);
    } catch (err) {
      reportError(err);
    } finally {
      setBrowserLoading(workspaceId, false);
      loadStartRef.current = null;
    }
  }, [reportError, setBrowserLoading, stopBrowserView, workspaceId]);

  const handleGoBack = useCallback(() => {
    if (isStartPage) return;
    void goBackBrowserView(workspaceId).catch(reportError);
  }, [goBackBrowserView, isStartPage, reportError, workspaceId]);

  const handleGoForward = useCallback(() => {
    if (isStartPage) return;
    void goForwardBrowserView(workspaceId).catch(reportError);
  }, [goForwardBrowserView, isStartPage, reportError, workspaceId]);

  const handleCopyUrl = useCallback(() => {
    if (isStartPage) return;
    navigator.clipboard.writeText(activeUrl).catch(() => undefined);
  }, [activeUrl, isStartPage]);

  const handleOpenExternal = useCallback(async () => {
    try {
      await invoke('open_url', { url: activeUrl });
    } catch (err) {
      reportError(err);
    }
  }, [activeUrl, reportError]);

  const handleTogglePopout = useCallback(async () => {
    try {
      if (isPoppedOut) {
        await dockBrowserView(workspaceId);
        setIsPoppedOut(false);
        setNativeBrowserReady(false);
        lastSyncedBoundsKeyRef.current = null;
        return;
      }
      if (isStartPage) return;
      if (!nativeBrowserReady) await syncBrowserBounds();
      const view = await popOutBrowserView(workspaceId, activeUrl);
      setBrowserCurrentUrl(workspaceId, view.currentUrl);
      setIsPoppedOut(true);
      setNativeBrowserReady(true);
      lastSyncedBoundsKeyRef.current = null;
    } catch (err) {
      reportError(err);
    }
  }, [activeUrl, dockBrowserView, isPoppedOut, isStartPage, nativeBrowserReady, popOutBrowserView, reportError, setBrowserCurrentUrl, syncBrowserBounds, workspaceId]);

  const handleExportSnapshot = useCallback(async () => {
    if (!currentWorkspacePath) {
      showMessage('error', 'Open a workspace folder to export snapshots.');
      return;
    }
    try {
      await exportBrowserSnapshot(workspaceId);
    } catch (err) {
      reportError(err);
    }
  }, [currentWorkspacePath, exportBrowserSnapshot, reportError, showMessage, workspaceId]);

  // ── Tabs ─────────────────────────────────────────────────────────────
  const handleAddTab = useCallback(() => {
    addBrowserTab(workspaceId, { id: `tab-${Date.now()}`, url: BROWSER_NEW_TAB_URL, title: 'New Tab', favicon: null });
  }, [addBrowserTab, workspaceId]);

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveBrowserTab(workspaceId, tabId);
  }, [setActiveBrowserTab, workspaceId]);

  const handleCloseTab = useCallback((tabId: string) => {
    removeBrowserTab(workspaceId, tabId);
  }, [removeBrowserTab, workspaceId]);

  const cycleTab = useCallback((direction: 1 | -1) => {
    const tabs = state.browserTabs;
    if (tabs.length < 2) return;
    const index = tabs.findIndex((tab) => tab.id === state.activeTabId);
    setActiveBrowserTab(workspaceId, tabs[(index + direction + tabs.length) % tabs.length].id);
  }, [setActiveBrowserTab, state.activeTabId, state.browserTabs, workspaceId]);

  // Tab switches reset per-page UI state until the new page reports in.
  useEffect(() => {
    setPageTitle('');
    setNavState({ canGoBack: true, canGoForward: true });
    setLastLoadDurationMs(null);
    if (isNewTabUrl(activeUrl)) setBrowserLoading(workspaceId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeTabId]);

  // ── Dev servers ──────────────────────────────────────────────────────
  /** Probes common dev-server ports plus every URL a terminal printed, so
   *  servers started outside the app are found and stopped ones are marked. */
  const scanDevServers = useCallback(async () => {
    if (scanInFlightRef.current) return;
    scanInFlightRef.current = true;
    setScanning(true);
    try {
      const known = useAppStore.getState().devServerUrlsByWorkspace[workspaceId] ?? [];
      const candidates = new Map<string, number>();
      DEV_SERVER_PROBE_PORTS.forEach((port) => candidates.set(`http://localhost:${port}`, port));
      known.forEach((url) => {
        try {
          const port = Number(new URL(url).port || 80);
          candidates.set(url, port);
        } catch {
          // ignore malformed entries
        }
      });
      const results = await Promise.all([...candidates].map(async ([url, port]) => {
        // Some servers bind only the IPv4 loopback and `localhost` may
        // resolve to ::1 first, so probe both in parallel.
        const live = await Promise.any([
          isLocalPortResponding(`http://127.0.0.1:${port}/`).then((ok) => (ok ? true : Promise.reject())),
          isLocalPortResponding(`http://localhost:${port}/`).then((ok) => (ok ? true : Promise.reject())),
        ]).catch(() => false);
        return live ? url : null;
      }));
      const live = results.filter((url): url is string => url !== null);
      live.forEach((url) => addDevServerUrl(workspaceId, url));
      setLiveServers((current) => {
        const next = new Set(live);
        return current.size === next.size && [...next].every((url) => current.has(url)) ? current : next;
      });
    } finally {
      scanInFlightRef.current = false;
      setScanning(false);
    }
  }, [addDevServerUrl, workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void scanDevServers(), 600);
    return () => window.clearTimeout(timer);
  }, [scanDevServers]);

  const servers = useMemo<DevServerEntry[]>(() => {
    const live = devServerUrls.filter((url) => liveServers.has(url));
    const stale = devServerUrls.filter((url) => !liveServers.has(url));
    return [...live.map((url) => ({ url, live: true })), ...stale.map((url) => ({ url, live: false }))];
  }, [devServerUrls, liveServers]);

  const handleOpenServer = useCallback((url: string) => {
    if (isStartPage) {
      void navigateTo(url);
      return;
    }
    openBrowserTab(workspaceId, url, getUrlTabLabel(url));
  }, [isStartPage, navigateTo, openBrowserTab, workspaceId]);

  const handleScan = useCallback(() => void scanDevServers(), [scanDevServers]);

  // ── Tools ────────────────────────────────────────────────────────────
  const handleToggleInspect = useCallback(async () => {
    if (isStartPage) return;
    try {
      await setBrowserInspectMode(workspaceId, !state.inspectMode);
    } catch (err) {
      reportError(err);
    }
  }, [isStartPage, reportError, setBrowserInspectMode, state.inspectMode, workspaceId]);

  const handleTogglePickStyle = useCallback(async () => {
    if (isStartPage) return;
    try {
      const next = !state.pickStyleMode;
      await setBrowserPickStyleMode(workspaceId, next);
      setBrowserPickStyleModeState(workspaceId, next);
      setApplyingStyleId(null);
      if (next) setActivePanel('styles');
    } catch (err) {
      reportError(err);
    }
  }, [isStartPage, reportError, setBrowserPickStyleMode, setBrowserPickStyleModeState, state.pickStyleMode, workspaceId]);

  const handleTogglePickUiElement = useCallback(async () => {
    if (isStartPage) return;
    try {
      const next = !state.pickUiElementMode;
      await setBrowserPickUiElementMode(workspaceId, next);
      setBrowserPickUiElementModeState(workspaceId, next);
      setApplyingStyleId(null);
      if (next) setActivePanel('ui-references');
    } catch (err) {
      reportError(err);
    }
  }, [isStartPage, reportError, setBrowserPickUiElementMode, setBrowserPickUiElementModeState, state.pickUiElementMode, workspaceId]);

  const toolMode: BrowserToolMode = state.inspectMode
    ? 'inspect'
    : state.pickStyleMode
      ? 'style'
      : state.pickUiElementMode
        ? 'capture'
        : state.applyMode
          ? 'apply'
          : null;

  const handleCancelMode = useCallback(async () => {
    try {
      if (state.inspectMode) await setBrowserInspectMode(workspaceId, false);
      if (state.pickStyleMode) await setBrowserPickStyleMode(workspaceId, false);
      if (state.pickUiElementMode) await setBrowserPickUiElementMode(workspaceId, false);
      if (state.applyMode) await setBrowserApplyMode(workspaceId, null);
    } catch (err) {
      reportError(err);
    } finally {
      clearBrowserModes(workspaceId);
      setApplyingStyleId(null);
    }
  }, [
    clearBrowserModes,
    reportError,
    setBrowserApplyMode,
    setBrowserInspectMode,
    setBrowserPickStyleMode,
    setBrowserPickUiElementMode,
    state.applyMode,
    state.inspectMode,
    state.pickStyleMode,
    state.pickUiElementMode,
    workspaceId,
  ]);

  const handleApplyStyle = useCallback(async (style: CapturedStyle) => {
    if (isStartPage) {
      showMessage('error', 'Open a page first, then click the element to style.');
      return;
    }
    try {
      if (applyingStyleId === style.id) {
        await setBrowserApplyMode(workspaceId, null);
        clearBrowserModes(workspaceId);
        setApplyingStyleId(null);
        return;
      }
      await setBrowserApplyMode(workspaceId, style);
      setBrowserApplyModeState(workspaceId, style);
      setApplyingStyleId(style.id);
    } catch (err) {
      reportError(err);
    }
  }, [applyingStyleId, clearBrowserModes, isStartPage, reportError, setBrowserApplyMode, setBrowserApplyModeState, showMessage, workspaceId]);

  const handleUndoStyle = useCallback(async () => {
    try {
      await undoBrowserStyle(workspaceId);
      undoBrowserStyleStore(workspaceId);
      setLastApplied(null);
    } catch (err) {
      reportError(err);
    }
  }, [reportError, undoBrowserStyle, undoBrowserStyleStore, workspaceId]);

  const copyText = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text)
      .then(() => showMessage('success', `${label} copied to clipboard`))
      .catch(reportError);
  }, [reportError, showMessage]);

  const handleCopyCapturedCss = useCallback((style: CapturedStyle) => {
    const lines = [`/* Extracted from ${style.sourceUrl} */`, `.captured-style {`];
    for (const [property, value] of Object.entries(style.computedStyles)) lines.push(`  ${property}: ${value};`);
    lines.push('}');
    copyText(lines.join('\n'), 'CSS');
  }, [copyText]);

  // ── Inspector handoff ────────────────────────────────────────────────
  /** Pastes into an agent terminal, or hands the prompt to an extension panel's chat. */
  const deliverPrompt = useCallback(async (targetId: string, prompt: string, sentText: string): Promise<void> => {
    const panelId = extensionPanelIdFromTarget(targetId);
    if (!panelId) {
      await submitBracketedPaste(targetId, prompt, writeToTerminal);
      showMessage('success', sentText);
      return;
    }
    const panel = extensionPanels.find((entry) => entry.id === panelId);
    if (!panel) throw new Error('That extension panel was closed. Pick another target.');
    const outcome = await sendPromptToExtensionPanel(panel, prompt);
    if (outcome === 'submitted') showMessage('success', `Sent to ${panel.name}`);
    else showMessage('info', `Added to ${panel.name}'s message box. Press Enter there to send.`);
  }, [extensionPanels, showMessage, writeToTerminal]);

  const handleInspectorSend = useCallback(async (
    promptText?: string,
    styleOverrides: Record<string, string> = {},
    targetOverride?: string,
  ) => {
    if (!state.selectedElement) return;
    const destinationId = targetOverride ?? targetSessionId;
    if (!destinationId) {
      const text = 'Open an agent terminal or extension panel to send this request.';
      showMessage('error', text);
      throw new Error(text);
    }

    // A single slot can be sent by itself (Enter in the editor); otherwise
    // combine every non-empty slot into one batched request.
    const slotTexts = promptText
      ? [promptText]
      : state.instructionSlots.map((slot) => htmlToPlainText(slot).trim()).filter((text) => text.length > 0);
    if (slotTexts.length === 0 && Object.keys(styleOverrides).length === 0) {
      const text = 'Describe a change or adjust at least one preview style before sending.';
      showMessage('error', text);
      throw new Error(text);
    }

    const instructions = slotTexts.map((text, i) => (slotTexts.length > 1 ? `${i + 1}. ${text}` : text)).join('\n\n');
    const formattedPrompt = formatElementPrompt(state.selectedElement, instructions, deviceLabel, effectiveZoom, styleOverrides);

    setIsSubmitting(true);
    try {
      await deliverPrompt(destinationId, formattedPrompt, 'Sent to agent');
      setBrowserInstructionSlots(workspaceId, ['']);
      setActiveBrowserInstructionSlot(workspaceId, 0);
    } catch (err) {
      reportError(err);
      throw new Error(errorText(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    deliverPrompt,
    deviceLabel,
    effectiveZoom,
    reportError,
    setActiveBrowserInstructionSlot,
    setBrowserInstructionSlots,
    showMessage,
    state.instructionSlots,
    state.selectedElement,
    targetSessionId,
    workspaceId,
  ]);

  const handleInspectorPreviewStylesChange = useCallback((styles: Record<string, string>) => {
    const next = inspectorPreviewQueueRef.current
      .catch(() => undefined)
      .then(() => previewBrowserElementStyles(workspaceId, styles));
    inspectorPreviewQueueRef.current = next.catch(reportError);
  }, [previewBrowserElementStyles, reportError, workspaceId]);

  const handleInspectorResetPreview = useCallback(async () => {
    const next = inspectorPreviewQueueRef.current
      .catch(() => undefined)
      .then(() => clearBrowserElementPreview(workspaceId));
    inspectorPreviewQueueRef.current = next.catch(reportError);
    await next;
  }, [clearBrowserElementPreview, reportError, workspaceId]);

  const handleInspectorDraftChange = useCallback((html: string) => {
    const index = state.activeInstructionSlot;
    setBrowserInstructionSlots(workspaceId, state.instructionSlots.map((slot, i) => (i === index ? html : slot)));
  }, [setBrowserInstructionSlots, state.activeInstructionSlot, state.instructionSlots, workspaceId]);

  const handleAddInstructionSlot = useCallback(() => {
    const slots = [...state.instructionSlots, ''];
    if (slots.length > 4) return;
    setBrowserInstructionSlots(workspaceId, slots);
    setActiveBrowserInstructionSlot(workspaceId, slots.length - 1);
  }, [setActiveBrowserInstructionSlot, setBrowserInstructionSlots, state.instructionSlots, workspaceId]);

  const handleRemoveInstructionSlot = useCallback((index: number) => {
    if (state.instructionSlots.length <= 1) return;
    const slots = state.instructionSlots.filter((_, i) => i !== index);
    setBrowserInstructionSlots(workspaceId, slots);
    setActiveBrowserInstructionSlot(workspaceId, Math.min(state.activeInstructionSlot, slots.length - 1));
  }, [setActiveBrowserInstructionSlot, setBrowserInstructionSlots, state.activeInstructionSlot, state.instructionSlots, workspaceId]);

  // ── Quick prompt card (in the page) ──────────────────────────────────
  const widgetToken = useMemo(
    () => (state.selectedElement ? createWidgetToken() : ''),
    [state.selectedElement],
  );
  const widgetTokenRef = useRef(widgetToken);
  widgetTokenRef.current = widgetToken;

  const widgetTargets = useMemo(
    () => sessionOptions.map((option) => ({ id: option.id, label: option.label, detail: option.detail ?? null })),
    [sessionOptions],
  );
  const widgetLabel = useMemo(
    () => (state.selectedElement ? describeElement(state.selectedElement) : ''),
    [state.selectedElement],
  );
  const widgetActive = !!state.selectedElement
    && !!widgetToken
    && !inspectorPanelOpen
    && !isStartPage
    && nativeBrowserReady
    && !state.inspectMode
    && !state.pickStyleMode
    && !state.pickUiElementMode
    && !state.applyMode;

  const publishWidgetStatus = useCallback((kind: BrowserInspectorWidgetStatus['kind'], text: string) => {
    widgetStatusSeqRef.current += 1;
    setWidgetStatus({ kind, message: text, seq: widgetStatusSeqRef.current });
  }, []);

  useEffect(() => {
    if (!widgetActive) {
      if (widgetShownRef.current) {
        widgetShownRef.current = false;
        void setBrowserInspectorWidget(workspaceId, null).catch(() => undefined);
      }
      return;
    }
    const draft = widgetDraftRef.current;
    widgetDraftRef.current = null;
    widgetShownRef.current = true;
    void setBrowserInspectorWidget(workspaceId, {
      token: widgetToken,
      label: widgetLabel,
      targets: widgetTargets,
      targetId: targetSessionId,
      draft,
      status: widgetStatus,
    }).catch(() => undefined);
  }, [
    setBrowserInspectorWidget,
    targetSessionId,
    widgetActive,
    widgetLabel,
    widgetStatus,
    widgetTargets,
    widgetToken,
    workspaceId,
  ]);

  useEffect(() => () => {
    if (!widgetShownRef.current) return;
    widgetShownRef.current = false;
    void setBrowserInspectorWidget(workspaceId, null).catch(() => undefined);
  }, [setBrowserInspectorWidget, workspaceId]);

  useEffect(() => {
    if (!state.selectedElement) setInspectorPanelOpen(false);
  }, [state.selectedElement]);

  const handleInspectorRequest = useCallback(async (request: BrowserInspectorRequestPayload) => {
    // The page is untrusted: only the card this app configured can ask for things.
    if (!state.selectedElement || !widgetTokenRef.current || request.token !== widgetTokenRef.current) return;
    const requestedTarget = request.targetId && sessionOptions.some((option) => option.id === request.targetId)
      ? request.targetId
      : null;
    if (requestedTarget && requestedTarget !== state.targetSessionId) {
      setBrowserTargetSession(workspaceId, requestedTarget);
    }

    if (request.kind === 'dismiss') {
      clearBrowserSelection(workspaceId);
      return;
    }
    if (request.kind === 'expand') {
      const text = (request.text ?? '').trim();
      if (text) handleInspectorDraftChange(plainTextToHtml(text));
      setInspectorPanelOpen(true);
      return;
    }
    if (request.kind !== 'send') return;

    const text = (request.text ?? '').trim();
    if (!text) return;
    const destinationId = requestedTarget ?? targetSessionId;
    const destination = sessionOptions.find((option) => option.id === destinationId)?.label ?? 'agent';
    publishWidgetStatus('sending', 'Sending…');
    try {
      await handleInspectorSend(text, {}, destinationId ?? undefined);
      publishWidgetStatus('sent', `Sent to ${destination}`);
    } catch (err) {
      publishWidgetStatus('error', errorText(err));
    }
  }, [
    clearBrowserSelection,
    handleInspectorDraftChange,
    handleInspectorSend,
    publishWidgetStatus,
    sessionOptions,
    setBrowserTargetSession,
    state.selectedElement,
    state.targetSessionId,
    targetSessionId,
    workspaceId,
  ]);
  inspectorRequestRef.current = (request) => void handleInspectorRequest(request);

  /** Back from the side panel to the quick prompt, carrying the typed text along. */
  const handleCollapseInspector = useCallback(() => {
    widgetDraftRef.current = state.instructionSlots
      .map((slot) => htmlToPlainText(slot).trim())
      .filter((text) => text.length > 0)
      .join('\n\n');
    setInspectorPanelOpen(false);
  }, [state.instructionSlots]);

  // ── UI references ────────────────────────────────────────────────────
  const activeUiReference = state.uiReferenceClipboard.find((reference) => reference.id === state.activeUiReferenceId)
    ?? state.uiReferenceClipboard[0]
    ?? null;
  const uiReferencePromptLength = useMemo(
    () => htmlToPlainText(state.uiReferencePrompt).trim().length,
    [state.uiReferencePrompt],
  );

  const handleSendUiReferenceToAgent = useCallback(async () => {
    if (!activeUiReference) {
      showMessage('error', 'Capture or select a UI reference first.');
      return;
    }
    if (!targetSessionId) {
      showMessage('error', 'Open an agent terminal or extension panel to send this reference.');
      return;
    }
    const brief = htmlToPlainText(state.uiReferencePrompt).trim();
    if (!brief) {
      showMessage('error', 'Describe what to build before sending.');
      return;
    }
    if (state.uiReferenceMode === 'replace' && !state.selectedElement) {
      showMessage('error', 'Pick the element to replace on your page first.');
      return;
    }

    setIsSubmitting(true);
    try {
      await deliverPrompt(
        targetSessionId,
        formatUiReferencePrompt(activeUiReference, brief, state.uiReferenceMode, state.selectedElement),
        'Reference sent to agent',
      );
      setBrowserUiReferencePrompt(workspaceId, '');
    } catch (err) {
      reportError(err);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeUiReference,
    deliverPrompt,
    reportError,
    setBrowserUiReferencePrompt,
    showMessage,
    state.selectedElement,
    state.uiReferenceMode,
    state.uiReferencePrompt,
    targetSessionId,
    workspaceId,
  ]);

  // ── Zoom & device ────────────────────────────────────────────────────
  const handleZoomChange = useCallback((nextZoom: number) => {
    setBrowserZoomFactor(workspaceId, clampZoom(nextZoom));
  }, [setBrowserZoomFactor, workspaceId]);

  const handleDeviceChange = useCallback((deviceId: BrowserDeviceId) => {
    setBrowserDeviceId(workspaceId, deviceId);
    // Devices start at 100%, capped to whatever fits the pane.
    setBrowserZoomFactor(workspaceId, 1);
  }, [setBrowserDeviceId, setBrowserZoomFactor, workspaceId]);

  const handleRotate = useCallback(() => {
    setBrowserDeviceOrientation(workspaceId, state.deviceOrientation === 'portrait' ? 'landscape' : 'portrait');
  }, [setBrowserDeviceOrientation, state.deviceOrientation, workspaceId]);

  const handleCustomViewportChange = useCallback((size: BrowserViewportSize) => {
    setBrowserCustomViewport(workspaceId, size);
  }, [setBrowserCustomViewport, workspaceId]);

  const handleToggleAutoReload = useCallback(() => {
    setBrowserAutoReload(workspaceId, !autoReload);
    showMessage('info', autoReload ? 'Auto-reload turned off' : 'Auto-reload turned on');
  }, [autoReload, setBrowserAutoReload, showMessage, workspaceId]);

  const togglePanel = useCallback((panel: BrowserSidePanel) => {
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  // ── Shortcuts ────────────────────────────────────────────────────────
  const runShortcut = (action: BrowserShortcutAction) => {
    switch (action) {
      case 'focus-address': omniboxRef.current?.focus(); break;
      case 'reload':
      case 'hard-reload': void handleReload(); break;
      case 'stop': void handleStop(); break;
      case 'back': handleGoBack(); break;
      case 'forward': handleGoForward(); break;
      case 'new-tab': handleAddTab(); break;
      case 'close-tab': if (state.activeTabId) handleCloseTab(state.activeTabId); break;
      case 'next-tab': cycleTab(1); break;
      case 'previous-tab': cycleTab(-1); break;
      case 'zoom-in': handleZoomChange(getNextZoom(effectiveZoom, 1)); break;
      case 'zoom-out': handleZoomChange(getNextZoom(effectiveZoom, -1)); break;
      case 'zoom-reset': handleZoomChange(1); break;
      case 'toggle-inspect': void handleToggleInspect(); break;
    }
  };
  const runShortcutRef = useRef(runShortcut);
  runShortcutRef.current = runShortcut;
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;
  const cancelModeRef = useRef(handleCancelMode);
  cancelModeRef.current = handleCancelMode;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || useAppStore.getState().activeView !== 'browser') return;
      if (event.key === 'Escape' && toolModeRef.current && !isEditableTarget(event.target)) {
        event.preventDefault();
        void cancelModeRef.current();
        return;
      }
      const action = resolveShortcut(event);
      if (!action) return;
      // Alt+arrows move the caret by word in text fields; leave them alone.
      if ((action === 'back' || action === 'forward') && isEditableTarget(event.target)) return;
      event.preventDefault();
      runShortcutRef.current(action);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Webview events ───────────────────────────────────────────────────
  useEffect(() => {
    const isForeignEvent = (url: string) => {
      const context = eventContextRef.current;
      if (context.isStartPage) return true;
      // Ignore the previous page's late events while switching tabs. A
      // matching start acknowledges the new navigation; redirects can then
      // report their final URL normally.
      const pendingUrl = pendingNavigationUrlRef.current;
      return !!pendingUrl && !browserUrlsEqual(pendingUrl, url);
    };

    const unlisteners: Promise<UnlistenFn>[] = [
      listen<BrowserPageLoadPayload>('browser-page-load', (event) => {
        if (event.payload.workspaceId !== workspaceId || isForeignEvent(event.payload.url)) return;
        const context = eventContextRef.current;
        if (event.payload.event === 'started') {
          pendingNavigationUrlRef.current = null;
          loadStartRef.current = performance.now();
          setBrowserLoading(workspaceId, true);
          setNativeBrowserReady(true);
          // The new document has no such element, so the quick prompt is gone
          // with the old page. The side panel keeps its selection for editing.
          if (context.selectedElement && !inspectorPanelOpenRef.current) {
            widgetShownRef.current = false;
            clearBrowserSelection(workspaceId);
          }
          return;
        }
        if (loadStartRef.current !== null) {
          setLastLoadDurationMs(Math.max(0, Math.round(performance.now() - loadStartRef.current)));
          loadStartRef.current = null;
        }
        setBrowserLoading(workspaceId, false);
        setNativeBrowserReady(true);
        setBrowserCurrentUrl(workspaceId, event.payload.url);
        if (context.activeTabId) updateBrowserTab(workspaceId, context.activeTabId, { url: event.payload.url });
      }),
      listen<BrowserPageStatePayload>('browser-page-state', (event) => {
        if (event.payload.workspaceId !== workspaceId || isForeignEvent(event.payload.url)) return;
        const context = eventContextRef.current;
        const { title, url, canGoBack, canGoForward, favicon } = event.payload;
        setPageTitle(title || '');
        setNavState({ canGoBack: canGoBack ?? true, canGoForward: canGoForward ?? true });
        setBrowserCurrentUrl(workspaceId, url);
        if (context.activeTabId) {
          updateBrowserTab(workspaceId, context.activeTabId, {
            title: title || getUrlTabLabel(url),
            url,
            favicon: favicon ?? null,
          });
        }
      }),
      listen<BrowserInspectModePayload>('browser-inspect-mode-changed', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        setBrowserInspectModeState(workspaceId, event.payload.enabled);
      }),
      listen<BrowserWorkspaceEventPayload>('browser-modes-cleared', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        clearBrowserModes(workspaceId);
        setApplyingStyleId(null);
      }),
      listen<BrowserShortcutPayload>('browser-shortcut', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        runShortcutRef.current(event.payload.action);
      }),
      listen<BrowserOpenTabPayload>('browser-open-tab', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        const { url } = event.payload;
        addBrowserTab(workspaceId, { id: `tab-${Date.now()}`, url, title: getUrlTabLabel(url), favicon: null });
      }),
      listen<BrowserPopoutStatePayload>('browser-popout-state', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        setIsPoppedOut(event.payload.poppedOut);
        lastSyncedBoundsKeyRef.current = null;
        setNativeBrowserReady(event.payload.poppedOut);
      }),
      listen<BrowserSnapshotPayload>('browser-snapshot-ready', async (event) => {
        const context = eventContextRef.current;
        if (event.payload.workspaceId !== workspaceId || !context.currentWorkspacePath) return;
        const title = event.payload.title || context.pageTitle || context.deviceLabel;
        const { htmlPath, jsonPath } = buildSnapshotPaths(context.currentWorkspacePath, title);
        const metadata = {
          exportedAt: new Date().toISOString(),
          workspaceId,
          pageTitle: title,
          url: event.payload.url,
          zoomFactor: context.zoom,
          deviceId: context.deviceId,
          deviceLabel: context.deviceLabel,
          orientation: context.deviceOrientation,
          viewport: { width: context.cssWidth, height: context.cssHeight },
          selectedElement: context.selectedElement,
        };
        try {
          await invoke('write_file_content', { path: htmlPath, content: event.payload.html });
          await invoke('write_file_content', { path: jsonPath, content: JSON.stringify(metadata, null, 2) });
          showMessage('success', `Snapshot saved to ${htmlPath}`);
        } catch (err) {
          reportError(err);
        }
      }),
      listen<BrowserElementSelectedEventPayload>('browser-element-selected', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        const context = eventContextRef.current;
        // A fresh pick starts on the quick prompt; the side panel is opt-in.
        widgetDraftRef.current = null;
        setWidgetStatus(null);
        setInspectorPanelOpen(false);
        setBrowserSelectedElement(workspaceId, event.payload.element);
        if (!context.targetSessionId && context.defaultSessionId) {
          setBrowserTargetSession(workspaceId, context.defaultSessionId);
        }
      }),
      listen<BrowserInspectorRequestPayload>('browser-inspector-request', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        inspectorRequestRef.current(event.payload);
      }),
      listen<WorkspaceScoped<CapturedStyle>>('browser-style-captured', (event) => {
        if (!event.payload || event.payload.workspaceId !== workspaceId) return;
        const { workspaceId: _ignored, ...style } = event.payload;
        addCapturedStyle(workspaceId, style);
        setBrowserPickStyleModeState(workspaceId, false);
        setActivePanel('styles');
        showMessage('success', `Style captured from <${style.tagName}>`);
      }),
      listen<WorkspaceScoped<CapturedUiElementReference>>('browser-ui-element-captured', (event) => {
        if (!event.payload || event.payload.workspaceId !== workspaceId) return;
        const { workspaceId: _ignored, ...reference } = event.payload;
        addCapturedUiReference(workspaceId, reference);
        setBrowserPickUiElementModeState(workspaceId, false);
        setActivePanel('ui-references');
        showMessage('success', `Captured ${reference.componentLabel}`);
      }),
      listen<WorkspaceScoped<AppliedStyle>>('browser-style-applied', (event) => {
        if (!event.payload || event.payload.workspaceId !== workspaceId) return;
        const { workspaceId: _ignored, ...applied } = event.payload;
        addAppliedStyle(workspaceId, applied);
        setLastApplied(applied);
        setApplyingStyleId(null);
      }),
    ];

    return () => {
      void Promise.all(unlisteners).then((resolved) => resolved.forEach((unlisten) => unlisten()));
    };
  }, [
    addAppliedStyle,
    addBrowserTab,
    addCapturedStyle,
    addCapturedUiReference,
    clearBrowserModes,
    clearBrowserSelection,
    reportError,
    setBrowserCurrentUrl,
    setBrowserInspectModeState,
    setBrowserLoading,
    setBrowserPickStyleModeState,
    setBrowserPickUiElementModeState,
    setBrowserSelectedElement,
    setBrowserTargetSession,
    showMessage,
    updateBrowserTab,
    workspaceId,
  ]);

  // ── Render ───────────────────────────────────────────────────────────
  const selectedElement = state.selectedElement;
  const statusTitle = isStartPage
    ? 'New tab'
    : pageTitle || getUrlTabLabel(activeUrl);
  const viewportLabel = isStartPage ? '—' : `${metrics.cssWidth} × ${metrics.cssHeight}`;
  const isDevice = metrics.kind !== 'responsive';

  const renderStageOverlay = () => {
    if (isPoppedOut) {
      return (
        <div className="bx-veil bx-veil--interactive">
          <div className="bx-veil__card">
            <span className="bx-empty__icon"><AppWindow size={18} aria-hidden="true" /></span>
            <span className="bx-veil__title">Open in a separate window</span>
            <span>{pageTitle || getUrlTabLabel(activeUrl)}</span>
            <button type="button" className="bx-btn bx-btn--outline" onClick={() => void handleTogglePopout()}>
              Dock it here
            </button>
          </div>
        </div>
      );
    }
    if (isStartPage) {
      return (
        <BrowserStartPage
          servers={servers}
          scanning={scanning}
          onScan={handleScan}
          onOpen={(input) => void navigateTo(input)}
        />
      );
    }
    if (overlayOpen && nativeBrowserReady) {
      return (
        <div className="bx-veil">
          <div className="bx-veil__card">
            <BrowserFavicon url={activeUrl} favicon={activeTab?.favicon} />
            <span className="bx-veil__title">{pageTitle || getUrlTabLabel(activeUrl)}</span>
          </div>
        </div>
      );
    }
    if (!nativeBrowserReady) {
      return (
        <div className="bx-veil">
          <div className="bx-veil__card">
            <CircleNotch size={18} className="bx-spinner" aria-hidden="true" />
            <span>Loading {getUrlTabLabel(activeUrl)}…</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <IconContext.Provider value={BROWSER_ICON_CONTEXT}>
      <NativeOverlayContext.Provider value={registerOverlay}>
        <div className="bx">
          <div className="bx__frame">
            <BrowserTabBar
              tabs={state.browserTabs}
              activeTabId={state.activeTabId}
              isLoading={state.isLoading && !isStartPage}
              onAddTab={handleAddTab}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
            />

            <BrowserToolbar
              ref={omniboxRef}
              url={activeUrl}
              isStartPage={isStartPage}
              isLoading={state.isLoading}
              canGoBack={navState.canGoBack}
              canGoForward={navState.canGoForward}
              inspectMode={state.inspectMode}
              pickStyleMode={state.pickStyleMode}
              pickUiElementMode={state.pickUiElementMode}
              activePanel={activePanel}
              styleCount={state.styleClipboard.length}
              referenceCount={state.uiReferenceClipboard.length}
              isPoppedOut={isPoppedOut}
              autoReload={autoReload}
              servers={servers}
              deviceMenu={(
                <BrowserDeviceMenu
                  device={activeDevice}
                  orientation={state.deviceOrientation}
                  zoom={state.zoomFactor}
                  metrics={metrics}
                  customViewport={customViewport}
                  onDeviceChange={handleDeviceChange}
                  onRotate={handleRotate}
                  onZoomChange={handleZoomChange}
                  onCustomViewportChange={handleCustomViewportChange}
                />
              )}
              onBack={handleGoBack}
              onForward={handleGoForward}
              onReload={() => void handleReload()}
              onStop={() => void handleStop()}
              onNavigate={(input) => void navigateTo(input)}
              onCopyUrl={handleCopyUrl}
              onOpenServer={handleOpenServer}
              onScanServers={handleScan}
              onToggleInspect={() => void handleToggleInspect()}
              onTogglePickStyle={() => void handleTogglePickStyle()}
              onTogglePickUi={() => void handleTogglePickUiElement()}
              onTogglePanel={togglePanel}
              onOpenExternal={() => void handleOpenExternal()}
              onTogglePopout={() => void handleTogglePopout()}
              onExportSnapshot={() => void handleExportSnapshot()}
              onToggleAutoReload={handleToggleAutoReload}
            />

            <div className="bx__body">
              <div ref={stageRef} className={`bx-stage${isDevice && !isStartPage && !isPoppedOut ? ' bx-stage--device' : ''}`}>
                {!isDevice ? (
                  <div ref={viewportRef} className="bx-stage__fill" />
                ) : (
                  <div className="bx-device">
                    <div className="bx-device__caption">
                      <strong>{activeDevice.label}</strong>
                      <span>{metrics.cssWidth} × {metrics.cssHeight}</span>
                      <span>· {Math.round(metrics.webviewZoom * 100)}%{metrics.fitted ? ' (fit)' : ''}</span>
                    </div>
                    <div
                      className={`bx-device__frame bx-device__frame--${metrics.kind}`}
                      style={{
                        width: metrics.viewportWidth,
                        height: metrics.viewportHeight,
                        padding: metrics.bezel,
                        borderRadius: metrics.radius,
                      }}
                    >
                      <div
                        ref={viewportRef}
                        className="bx-device__screen"
                        style={{
                          top: metrics.bezel,
                          left: metrics.bezel,
                          width: metrics.viewportWidth,
                          height: metrics.viewportHeight,
                        }}
                      />
                    </div>
                  </div>
                )}
                {renderStageOverlay()}
              </div>

              {activePanel === 'styles' && (
                <aside className="bx-panel" aria-label="Style clipboard">
                  <div className="bx-panel__head">
                    <div className="bx-panel__title">
                      <Swatches size={15} aria-hidden="true" />
                      Style clipboard
                      {state.styleClipboard.length > 0 && <span className="bx-count">{state.styleClipboard.length}</span>}
                    </div>
                    <button type="button" className="bx-btn" onClick={() => setActivePanel(null)} aria-label="Close style clipboard">
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="bx-panel__body">
                    <StyleClipboardPanel
                      styles={state.styleClipboard}
                      activeStyleId={applyingStyleId}
                      onRemove={(id) => removeCapturedStyle(workspaceId, id)}
                      onApply={(style) => void handleApplyStyle(style)}
                      onCopyCss={handleCopyCapturedCss}
                      onStartPicking={() => void handleTogglePickStyle()}
                    />
                  </div>
                </aside>
              )}

              {activePanel === 'ui-references' && (
                <UiReferencesPanel
                  references={state.uiReferenceClipboard}
                  activeReference={activeUiReference}
                  mode={state.uiReferenceMode}
                  selectedElement={selectedElement}
                  inspectMode={state.inspectMode}
                  sessionOptions={sessionOptions}
                  targetSessionId={targetSessionId}
                  promptHtml={state.uiReferencePrompt}
                  promptLength={uiReferencePromptLength}
                  isSubmitting={isSubmitting}
                  onClose={() => setActivePanel(null)}
                  onSelect={(id) => setActiveUiReference(workspaceId, id)}
                  onRemove={(id) => removeCapturedUiReference(workspaceId, id)}
                  onCopyJson={(reference) => copyText(JSON.stringify(reference, null, 2), 'Reference JSON')}
                  onCopyHtml={(reference) => copyText(reference.htmlSnippet, 'HTML')}
                  onModeChange={(mode) => setBrowserUiReferenceMode(workspaceId, mode)}
                  onToggleInspect={() => void handleToggleInspect()}
                  onStartCapture={() => void handleTogglePickUiElement()}
                  onTargetSessionChange={(sessionId) => setBrowserTargetSession(workspaceId, sessionId)}
                  onPromptChange={(html) => setBrowserUiReferencePrompt(workspaceId, html)}
                  onSend={() => void handleSendUiReferenceToAgent()}
                />
              )}

              {selectedElement && inspectorPanelOpen && (
                <ElementInspectorPanel
                  element={selectedElement}
                  pageTitle={selectedElement.pageTitle || pageTitle || 'Untitled page'}
                  targetSessionId={targetSessionId}
                  sessionOptions={sessionOptions}
                  isSubmitting={isSubmitting}
                  deviceLabel={deviceLabel}
                  zoomFactor={effectiveZoom}
                  initialHtml={state.instructionSlots[state.activeInstructionSlot] ?? ''}
                  instructionSlots={state.instructionSlots}
                  activeInstructionSlot={state.activeInstructionSlot}
                  onSelectSlot={(index) => setActiveBrowserInstructionSlot(workspaceId, index)}
                  onAddSlot={handleAddInstructionSlot}
                  onRemoveSlot={handleRemoveInstructionSlot}
                  onSend={handleInspectorSend}
                  onPreviewStylesChange={handleInspectorPreviewStylesChange}
                  onResetPreview={handleInspectorResetPreview}
                  onTargetSessionChange={(sessionId) => setBrowserTargetSession(workspaceId, sessionId)}
                  onDraftChange={handleInspectorDraftChange}
                  onCollapse={handleCollapseInspector}
                  onClear={() => clearBrowserSelection(workspaceId)}
                />
              )}
            </div>

            <BrowserStatusBar
              mode={toolMode}
              message={message}
              pageTitle={statusTitle}
              loadDurationMs={lastLoadDurationMs}
              viewportLabel={viewportLabel}
              zoomPercent={Math.round(effectiveZoom * 100)}
              autoReload={autoReload}
              autoReloadAvailable={!isStartPage && isLocalUrl(activeUrl)}
              showApplyActions={!!lastApplied}
              onDismissMessage={() => setMessage(null)}
              onCancelMode={() => void handleCancelMode()}
              onToggleAutoReload={handleToggleAutoReload}
              onUndoApplied={() => void handleUndoStyle()}
              onKeepApplied={() => setLastApplied(null)}
              onCopyAppliedCss={() => lastApplied && copyText(lastApplied.cssRules.join('\n'), 'CSS')}
            />
          </div>
        </div>
      </NativeOverlayContext.Provider>
    </IconContext.Provider>
  );
};
