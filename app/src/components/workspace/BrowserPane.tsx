import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AppWindow,
  ArrowClockwise,
  ArrowRight,
  ArrowUpRight,
  Browsers,
  CaretDown,
  CaretLeft,
  CaretRight,
  CheckCircle,
  CircleNotch,
  Copy,
  CursorClick,
  DeviceMobile,
  ClockCounterClockwise,
  DeviceRotate,
  Devices,
  Export,
  EyedropperSample,
  Hand,
  IconContext,
  LinkSimple,
  MagnifyingGlass,
  Minus,
  Palette,
  Plus,
  SelectionAll,
  Sparkle,
  Speedometer,
  SquaresFour,
  StackSimple,
  Swatches,
  Target,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type {
  BrowserDeviceOrientation,
  BrowserDevicePreset,
  BrowserElementSelectedEventPayload,
  BrowserInspectModePayload,
  BrowserPopoutStatePayload,
  BrowserUiIntegrationMode,
  CapturedUiElementReference,
  BrowserPageLoadPayload,
  BrowserPageStatePayload,
  BrowserSelectedElement,
  BrowserSnapshotPayload,
  TerminalSession,
  CapturedStyle,
  AppliedStyle,
} from '../../types';
import { useAppStore } from '../../stores/appStore';
import { useBrowser } from '../../hooks/useBrowser';
import { useBrowserAutoReload } from '../../hooks/useBrowserAutoReload';
import { useTerminal } from '../../hooks/useTerminal';
import { useAgentHost } from '../../hooks/useAgentHost';
import { htmlToPlainText } from '../../utils/richText';
import { formatElementPrompt } from '../../utils/inspectorPrompt';
import { BrowserTabBar } from './BrowserTabBar';
import { StyleClipboardPanel } from './StyleClipboardPanel';
import { UiReferenceClipboardPanel } from './UiReferenceClipboardPanel';
import { ApplyModeToolbar } from './ApplyModeToolbar';
import { RichPromptEditor } from './RichPromptEditor';
import { ElementInspectorPanel } from './ElementInspectorPanel';
import { AgentTargetSelect, type AgentTargetOption } from './AgentTargetSelect';
import { Shimmer } from '../ai-elements/shimmer';

interface BrowserPaneProps {
  workspaceId: string;
  sessions: TerminalSession[];
}

const FALLBACK_URL = 'https://www.google.com';
const EMPTY_DEV_SERVER_URLS: string[] = [];
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
/** Ports yzpzcode may serve on itself (8745 = the Tauri devUrl) plus common
 *  framework dev-server ports. Probing these over HTTP lets the Localhost
 *  menu find a server running in *any* terminal — even one launched outside
 *  the app — without requiring a localhost link to be clicked in the
 *  built-in terminal first. */
const DEV_SERVER_PROBE_PORTS = [8745, 5173, 5174, 4173, 3000, 3001, 8080, 8000, 5000, 4321, 6006, 1420];

/** Best-effort check that an HTTP server is actually listening on a port.
 *  Uses a no-cors fetch so we don't need CORS headers for a liveness probe:
 *  the promise resolving means the port speaks HTTP (opaque responses are
 *  fine — we never read the body), while a network failure or abort timeout
 *  means nothing is listening. */
const isLocalPortResponding = async (url: string, timeoutMs = 800): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { mode: 'no-cors', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const BROWSER_DEVICES: BrowserDevicePreset[] = [
  { id: 'responsive', label: 'Responsive', width: null, height: null, category: 'desktop' },
  { id: 'iphone-14-pro', label: 'iPhone 14 Pro', width: 393, height: 852, category: 'mobile' },
  { id: 'ipad', label: 'iPad', width: 820, height: 1180, category: 'tablet' },
];

const BROWSER_DEVICE_OPTIONS: BrowserDevicePreset[] = [
  BROWSER_DEVICES[0],
  BROWSER_DEVICES[1],
  BROWSER_DEVICES[2],
];

const BROWSER_ICON_CONTEXT = { weight: 'light' as const };

const normalizeBrowserUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'about:blank') return FALLBACK_URL;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
};

const browserUrlsEqual = (left: string, right: string): boolean => {
  const normalize = (value: string): string => {
    const url = normalizeBrowserUrl(value);
    try {
      return new URL(url).toString();
    } catch {
      return url;
    }
  };
  return normalize(left) === normalize(right);
};

const getLocalhostLabel = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `localhost${parsed.port ? `:${parsed.port}` : ''}`;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
};

const clampZoom = (value: number): number => Math.min(2, Math.max(0.5, Math.round(value * 100) / 100));

const getDefaultZoomForDevice = (deviceId: BrowserDevicePreset['id']): number =>
  deviceId === 'responsive' ? 1 : 0.67;

const sanitizeFileSegment = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'snapshot';

const buildExportStamp = (): string => {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
};

interface DeviceFrameMetrics {
  stageWidth: number;
  stageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  kind: 'responsive' | 'iphone' | 'ipad';
  orientation: BrowserDeviceOrientation;
}

const getNextZoom = (current: number, direction: -1 | 1): number => {
  const currentIndex = ZOOM_STEPS.findIndex((value) => value >= current - 0.001 && value <= current + 0.001);
  if (currentIndex >= 0) {
    const nextIndex = Math.min(ZOOM_STEPS.length - 1, Math.max(0, currentIndex + direction));
    return ZOOM_STEPS[nextIndex];
  }
  const fallback = direction > 0
    ? ZOOM_STEPS.find((value) => value > current)
    : [...ZOOM_STEPS].reverse().find((value) => value < current);
  return fallback ?? current;
};

const formatUiReferencePrompt = (
  reference: CapturedUiElementReference,
  prompt: string,
  mode: BrowserUiIntegrationMode,
  targetElement: BrowserSelectedElement | null,
): string => {
  const structurePreview = JSON.stringify(reference.structure, null, 2);
  const captureStats = reference.structure.captureStats;
  const subtreePreview = captureStats
    ? `${captureStats.capturedNodeCount} nodes captured, up to depth ${captureStats.maxDepth} and ${captureStats.maxChildrenPerNode} children per node`
    : `${reference.structure.childCount} direct child elements captured`;
  const assetPreview = reference.assets.length > 0
    ? reference.assets.map((asset) => `${asset.type}: ${asset.sourceUrl}`).join('\n')
    : 'none';
  const hoverPreview = reference.interactivity.hoverSelectors.length > 0
    ? reference.interactivity.hoverSelectors.join(' | ')
    : 'none detected';

  const targetSection = mode === 'replace'
    ? [
        `Replacement target on local site:`,
        targetElement
          ? `- Target selector: ${targetElement.selectors.join(' | ')}`
          : `- Target selector: not provided`,
        targetElement
          ? `- Target HTML snippet: ${targetElement.htmlSnippet}`
          : `- Target HTML snippet: not provided`,
        targetElement
          ? `- Preserve target functionality, semantics, and existing data flow.`
          : `- Ask for clarification only if the target element cannot be safely inferred from the current local page.`,
      ].join('\n')
    : [
        `Insertion request on local site:`,
        `- Add a new reusable component inspired by this reference.`,
        `- Place it appropriately within the current project structure and existing page flow.`,
      ].join('\n');

  return [
    `UI recreation request for the local project.`,
    ``,
    `Mode: ${mode}`,
    `Important: use the captured element only as a design reference. Do not copy proprietary code or sensitive text verbatim. Recreate it in clean, maintainable project-native code.`,
    `Important: treat the captured subtree as the full component reference. Recreate the selected component together with its nested child elements, internal layout, media/icons, states, and text hierarchy represented below.`,
    ``,
    `Source reference:`,
    `- Page URL: ${reference.sourceUrl}`,
    `- Page title: ${reference.pageTitle || 'Untitled page'}`,
    `- Component label: ${reference.componentLabel}`,
    `- Captured subtree: ${subtreePreview}`,
    `- Selector: ${reference.selector}`,
    `- Tag: <${reference.tagName}>`,
    `- Viewport: ${reference.viewport.width} x ${reference.viewport.height}`,
    `- Design intent: ${reference.designIntent}`,
    `- Text content: ${reference.textContent || 'none'}`,
    `- Layout: display=${reference.layout.display}, position=${reference.layout.position}, width=${reference.layout.width}, height=${reference.layout.height}, gap=${reference.layout.gap || 'none'}, flexDirection=${reference.layout.flexDirection || 'n/a'}, gridColumns=${reference.layout.gridTemplateColumns || 'n/a'}`,
    `- Spacing: margin=${reference.spacing.margin}, padding=${reference.spacing.padding}, radius=${reference.spacing.borderRadius}`,
    `- Typography: family=${reference.typography.fontFamily}, size=${reference.typography.fontSize}, weight=${reference.typography.fontWeight}, lineHeight=${reference.typography.lineHeight}, letterSpacing=${reference.typography.letterSpacing}, transform=${reference.typography.textTransform}`,
    `- Visuals: background=${reference.visuals.background}, color=${reference.visuals.color}, border=${reference.visuals.border}, shadow=${reference.visuals.boxShadow}, opacity=${reference.visuals.opacity}`,
    `- Interactivity: cursor=${reference.interactivity.cursor}, transition=${reference.interactivity.transition}, hover=${hoverPreview}`,
    `- Assets:\n${assetPreview}`,
    `- Structure:\n${structurePreview}`,
    `- HTML snippet: ${reference.htmlSnippet}`,
    ``,
    targetSection,
    ``,
    `User request:`,
    prompt.trim(),
    ``,
    `Please inspect the workspace, adapt this reference to the project stack, keep the local codebase style consistent, and explain what you changed.`,
  ].join('\n');
};

const sessionDisplayName = (session: TerminalSession): string => {
  if (session.agent) {
    return `TTY ${session.index + 1} · ${session.agent}`;
  }
  return `TTY ${session.index + 1} · shell`;
};

const TERMINAL_SUBMIT_DELAY_MS = 32;

const submitBracketedPaste = async (
  sessionId: string,
  prompt: string,
  writeToTerminal: (targetSessionId: string, input: string) => Promise<void>,
): Promise<void> => {
  // Keep the submit key in a separate PTY write. Several full-screen CLIs
  // finish their bracketed-paste callback after the read loop returns and
  // otherwise consume an adjacent CR without submitting the prompt.
  await writeToTerminal(sessionId, '\x1b[200~');
  await writeToTerminal(sessionId, prompt);
  await writeToTerminal(sessionId, '\x1b[201~');
  await new Promise<void>((resolve) => window.setTimeout(resolve, TERMINAL_SUBMIT_DELAY_MS));
  await writeToTerminal(sessionId, '\r');
};

const getViewportMetrics = (
  hostWidth: number,
  hostHeight: number,
  device: BrowserDevicePreset,
  orientation: BrowserDeviceOrientation,
): DeviceFrameMetrics => {
  if (device.id === 'responsive') {
    return {
      stageWidth: Math.max(hostWidth, 280),
      stageHeight: Math.max(hostHeight, 320),
      viewportWidth: Math.max(hostWidth, 280),
      viewportHeight: Math.max(hostHeight, 320),
      kind: 'responsive',
      orientation,
    };
  }

  const requestedWidth = orientation === 'landscape' && device.width && device.height ? device.height : device.width ?? 0;
  const requestedHeight = orientation === 'landscape' && device.width && device.height ? device.width : device.height ?? 0;
  const availableWidth = Math.max(hostWidth - 48, 80);
  const availableHeight = Math.max(hostHeight - 48, 80);
  const scale = Math.min(1, availableWidth / requestedWidth, availableHeight / requestedHeight);
  const viewportWidth = Math.max(80, Math.round(requestedWidth * scale));
  const viewportHeight = Math.max(80, Math.round(requestedHeight * scale));

  return {
    stageWidth: viewportWidth,
    stageHeight: viewportHeight,
    viewportWidth,
    viewportHeight,
    kind: device.category === 'mobile' ? 'iphone' : 'ipad',
    orientation,
  };
};

export const BrowserPane: React.FC<BrowserPaneProps> = ({ workspaceId, sessions }) => {
  const previewShellRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const loadStartRef = useRef<number | null>(null);
  const lastNavigatedTabRef = useRef<string | null>(null);
  const lastSyncedBoundsKeyRef = useRef<string | null>(null);
  const isPoppedOutRef = useRef(false);
  const browserStateByWorkspace = useAppStore((state) => state.browserStateByWorkspace);
  const devServerUrls = useAppStore((state) => state.devServerUrlsByWorkspace[workspaceId] ?? EMPTY_DEV_SERVER_URLS);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const currentWorkspace = useAppStore((state) => state.currentWorkspace);
  const agentSessionsByWorkspace = useAppStore((state) => state.agentSessionsByWorkspace);
  const appZoom = useAppStore((state) => state.appZoom);
  const ensureBrowserState = useAppStore((state) => state.ensureBrowserState);
  const setBrowserCurrentUrl = useAppStore((state) => state.setBrowserCurrentUrl);
  const setBrowserDraftUrl = useAppStore((state) => state.setBrowserDraftUrl);
  const setBrowserLoading = useAppStore((state) => state.setBrowserLoading);
  const setBrowserInspectModeState = useAppStore((state) => state.setBrowserInspectMode);
  const setBrowserZoomFactor = useAppStore((state) => state.setBrowserZoomFactor);
  const setBrowserDeviceId = useAppStore((state) => state.setBrowserDeviceId);
  const setBrowserDeviceOrientation = useAppStore((state) => state.setBrowserDeviceOrientation);
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
  const browserState = browserStateByWorkspace[workspaceId];
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nativeBrowserReady, setNativeBrowserReady] = useState(false);
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const [pageTitle, setPageTitle] = useState('');
  const [historyLength, setHistoryLength] = useState(1);
  const [lastLoadDurationMs, setLastLoadDurationMs] = useState<number | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<'styles' | 'ui-references' | null>(null);
  const [appliedToolbarOpen, setAppliedToolbarOpen] = useState(false);
  const [lastApplied, setLastApplied] = useState<AppliedStyle | null>(null);
  const [showFullUiReferenceInfo, setShowFullUiReferenceInfo] = useState(false);
  const [isLocalhostMenuOpen, setIsLocalhostMenuOpen] = useState(false);
  const localhostMenuRef = useRef<HTMLDivElement>(null);

  const {
    ensureBrowserView,
    navigateBrowserView,
    reloadBrowserView,
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
  } = useBrowser();
  const { writeToTerminal } = useTerminal();
  const { ensureHost, resumeSession, sendMessage } = useAgentHost();
  // Hot-reload the webview when workspace files change while a dev-server tab
  // is open (skipped automatically during inspect/pick/apply modes).
  useBrowserAutoReload(workspaceId, true);

  const effectiveState = browserState ?? {
    currentUrl: FALLBACK_URL,
    draftUrl: FALLBACK_URL,
    isLoading: false,
    inspectMode: false,
    pickStyleMode: false,
    pickUiElementMode: false,
    applyMode: false,
    zoomFactor: 1,
    deviceId: 'responsive' as const,
    deviceOrientation: 'portrait' as const,
    selectedElement: null,
    prompt: '',
    instructionSlots: [''],
    activeInstructionSlot: 0,
    uiReferencePrompt: '',
    uiReferenceMode: 'insert' as const,
    targetSessionId: null,
    browserTabs: [{ id: 'default', url: FALLBACK_URL, title: 'Localhost' }],
    activeTabId: 'default',
    styleClipboard: [],
    uiReferenceClipboard: [],
    activeUiReferenceId: null,
    appliedStyles: [],
  };

  const resolvedCurrentUrl = useMemo(() => {
    return normalizeBrowserUrl(effectiveState.currentUrl || FALLBACK_URL);
  }, [effectiveState.currentUrl]);

  const resolvedDraftUrl = useMemo(() => {
    return normalizeBrowserUrl(effectiveState.draftUrl || effectiveState.currentUrl || FALLBACK_URL);
  }, [effectiveState.currentUrl, effectiveState.draftUrl]);

  const targetableSessions = useMemo(() => {
    const agentSessions = sessions.filter((session) => session.agent);
    return agentSessions.length > 0 ? agentSessions : sessions;
  }, [sessions]);

  // Built-in YZPZ Agent sessions (Cline-SDK harness) — they can receive
  // handoff prompts too, so they are merged into the target-agent options.
  const yzpzSessions = useMemo(
    () => agentSessionsByWorkspace[workspaceId] ?? [],
    [agentSessionsByWorkspace, workspaceId],
  );

  const sessionOptions = useMemo<AgentTargetOption[]>(() => {
    const terminals: AgentTargetOption[] = targetableSessions.map((session) => ({
      id: session.id,
      label: sessionDisplayName(session),
      agent: session.agent ?? null,
      kind: 'terminal',
    }));
    const yzpz: AgentTargetOption[] = yzpzSessions.map((session) => ({
      id: session.sessionId,
      label: session.title ? `YZPZ Agent · ${session.title}` : 'YZPZ Agent',
      agent: null,
      kind: 'yzpz',
    }));
    return [...terminals, ...yzpz];
  }, [targetableSessions, yzpzSessions]);

  const defaultSessionId = useMemo(() => {
    if (activeSessionId && sessionOptions.some((option) => option.id === activeSessionId)) {
      return activeSessionId;
    }
    return sessionOptions[0]?.id ?? null;
  }, [activeSessionId, sessionOptions]);

  const agentSessionIds = useMemo(() => new Set(yzpzSessions.map((session) => session.sessionId)), [yzpzSessions]);

  /** Route a handoff prompt to the chosen target: terminal sessions get the
   * bracketed-paste write, YZPZ Agent sessions go through the harness RPC. */
  const sendPromptToTarget = useCallback(
    async (targetSessionId: string, prompt: string) => {
      if (agentSessionIds.has(targetSessionId)) {
        await ensureHost();
        await resumeSession(targetSessionId);
        await sendMessage(targetSessionId, prompt);
        return;
      }
      await submitBracketedPaste(targetSessionId, prompt, writeToTerminal);
    },
    [agentSessionIds, ensureHost, resumeSession, sendMessage, writeToTerminal],
  );

  const activeDevice = useMemo(
    () => BROWSER_DEVICE_OPTIONS.find((device) => device.id === effectiveState.deviceId) ?? BROWSER_DEVICE_OPTIONS[0],
    [effectiveState.deviceId],
  );

  const viewportMetrics = useMemo(
    () => getViewportMetrics(hostSize.width, hostSize.height, activeDevice, effectiveState.deviceOrientation),
    [activeDevice, effectiveState.deviceOrientation, hostSize.height, hostSize.width],
  );
  const browserEventContextRef = useRef({
    activeTabId: effectiveState.activeTabId,
    currentWorkspacePath: currentWorkspace?.path ?? null,
    defaultSessionId,
    deviceId: effectiveState.deviceId,
    deviceLabel: activeDevice.label,
    deviceOrientation: effectiveState.deviceOrientation,
    pageTitle: '',
    selectedElement: effectiveState.selectedElement,
    targetSessionId: effectiveState.targetSessionId,
    viewportHeight: viewportMetrics.viewportHeight,
    viewportWidth: viewportMetrics.viewportWidth,
    zoomFactor: effectiveState.zoomFactor,
  });

  useEffect(() => {
    browserEventContextRef.current = {
      activeTabId: effectiveState.activeTabId,
      currentWorkspacePath: currentWorkspace?.path ?? null,
      defaultSessionId,
      deviceId: effectiveState.deviceId,
      deviceLabel: activeDevice.label,
      deviceOrientation: effectiveState.deviceOrientation,
      pageTitle,
      selectedElement: effectiveState.selectedElement,
      targetSessionId: effectiveState.targetSessionId,
      viewportHeight: viewportMetrics.viewportHeight,
      viewportWidth: viewportMetrics.viewportWidth,
      zoomFactor: effectiveState.zoomFactor,
    };
  }, [
    activeDevice.label,
    currentWorkspace?.path,
    defaultSessionId,
    effectiveState.activeTabId,
    effectiveState.deviceId,
    effectiveState.deviceOrientation,
    effectiveState.selectedElement,
    effectiveState.targetSessionId,
    effectiveState.zoomFactor,
    pageTitle,
    viewportMetrics.viewportHeight,
    viewportMetrics.viewportWidth,
  ]);

  useEffect(() => {
    ensureBrowserState(workspaceId);
  }, [ensureBrowserState, workspaceId]);

  useEffect(() => {
    isPoppedOutRef.current = isPoppedOut;
  }, [isPoppedOut]);

  useEffect(() => {
    lastNavigatedTabRef.current =
      useAppStore.getState().browserStateByWorkspace[workspaceId]?.activeTabId ?? null;
  }, [workspaceId]);

  useEffect(() => {
    if (!browserState) return;
    if (browserState.currentUrl === 'about:blank' || browserState.draftUrl === 'about:blank') {
      setBrowserCurrentUrl(workspaceId, FALLBACK_URL);
    }
  }, [browserState, setBrowserCurrentUrl, workspaceId]);

  useEffect(() => {
    if (!effectiveState.targetSessionId && defaultSessionId) {
      setBrowserTargetSession(workspaceId, defaultSessionId);
    }
  }, [defaultSessionId, effectiveState.targetSessionId, setBrowserTargetSession, workspaceId]);

  useEffect(() => {
    const host = previewShellRef.current;
    if (!host) return;

    const updateSize = () => {
      const rect = host.getBoundingClientRect();
      setHostSize({ width: rect.width, height: rect.height });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(host);
    window.addEventListener('resize', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [appZoom]);

  const syncBrowserBounds = useCallback(async () => {
    if (isPoppedOut) return;

    const viewport = previewViewportRef.current;
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

    const url = resolvedCurrentUrl;
    const boundsKey = JSON.stringify({
      url,
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });

    if (lastSyncedBoundsKeyRef.current === boundsKey) {
      return;
    }

    try {
      await ensureBrowserView(workspaceId, url, bounds);
      lastSyncedBoundsKeyRef.current = boundsKey;
      setNativeBrowserReady(true);
      setError(null);
    } catch (err) {
      setNativeBrowserReady(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [
    ensureBrowserView,
    appZoom,
    isPoppedOut,
    resolvedCurrentUrl,
    workspaceId,
  ]);

  useEffect(() => {
    let frame = 0;
    let timeout: number | null = null;

    const scheduleSync = () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        void syncBrowserBounds();
      });

      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
      timeout = window.setTimeout(() => {
        void syncBrowserBounds();
      }, 260);
    };

    scheduleSync();

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    };
  }, [
    effectiveState.deviceId,
    effectiveState.deviceOrientation,
    effectiveState.zoomFactor,
    syncBrowserBounds,
    viewportMetrics.stageHeight,
    viewportMetrics.stageWidth,
    viewportMetrics.viewportHeight,
    viewportMetrics.viewportWidth,
    isPoppedOut,
  ]);

  useEffect(() => {
    return () => {
      setNativeBrowserReady(false);
      if (!isPoppedOutRef.current) {
        void setBrowserViewVisibility(workspaceId, false).catch(() => undefined);
      }
    };
  }, [setBrowserViewVisibility, workspaceId]);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [
      listen<BrowserPageLoadPayload>('browser-page-load', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        const context = browserEventContextRef.current;

        if (event.payload.event === 'started') {
          loadStartRef.current = performance.now();
          setBrowserLoading(workspaceId, true);
          setNativeBrowserReady(true);
          return;
        }

        if (loadStartRef.current !== null) {
          setLastLoadDurationMs(Math.max(0, Math.round(performance.now() - loadStartRef.current)));
          loadStartRef.current = null;
        }

        setBrowserLoading(workspaceId, false);
        setNativeBrowserReady(true);
        setBrowserCurrentUrl(workspaceId, event.payload.url);
        if (context.activeTabId) {
          updateBrowserTab(workspaceId, context.activeTabId, { url: event.payload.url });
        }
      }),
      listen<BrowserPageStatePayload>('browser-page-state', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        const context = browserEventContextRef.current;
        setPageTitle(event.payload.title || '');
        setHistoryLength(event.payload.historyLength);
        setBrowserCurrentUrl(workspaceId, event.payload.url);
        if (context.activeTabId) {
          updateBrowserTab(workspaceId, context.activeTabId, { title: event.payload.title, url: event.payload.url });
        }
      }),
      listen<BrowserInspectModePayload>('browser-inspect-mode-changed', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        setBrowserInspectModeState(workspaceId, event.payload.enabled);
      }),
      listen<BrowserPopoutStatePayload>('browser-popout-state', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        setIsPoppedOut(event.payload.poppedOut);
        if (event.payload.poppedOut) {
          setNativeBrowserReady(true);
          return;
        }
        lastSyncedBoundsKeyRef.current = null;
        setNativeBrowserReady(false);
      }),
      listen<BrowserSnapshotPayload>('browser-snapshot-ready', async (event) => {
        const context = browserEventContextRef.current;
        if (event.payload.workspaceId !== workspaceId || !context.currentWorkspacePath) return;

        const stamp = buildExportStamp();
        const slug = sanitizeFileSegment(event.payload.title || context.pageTitle || context.deviceLabel);
        const baseDir = `${context.currentWorkspacePath}\\.yzpzcode\\browser-exports`;
        const htmlPath = `${baseDir}\\${stamp}-${slug}.html`;
        const jsonPath = `${baseDir}\\${stamp}-${slug}.json`;
        const metadata = {
          exportedAt: new Date().toISOString(),
          workspaceId,
          pageTitle: event.payload.title || context.pageTitle,
          url: event.payload.url,
          zoomFactor: context.zoomFactor,
          deviceId: context.deviceId,
          deviceLabel: context.deviceLabel,
          orientation: context.deviceOrientation,
          viewport: {
            width: context.viewportWidth,
            height: context.viewportHeight,
          },
          selectedElement: context.selectedElement,
        };

        try {
          await invoke('write_file_content', { path: htmlPath, content: event.payload.html });
          await invoke('write_file_content', { path: jsonPath, content: JSON.stringify(metadata, null, 2) });
          setExportMessage(`Exported snapshot to ${htmlPath}`);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }),
      listen<BrowserElementSelectedEventPayload>('browser-element-selected', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        const context = browserEventContextRef.current;
        setBrowserSelectedElement(workspaceId, event.payload.element);
        if (!context.targetSessionId && context.defaultSessionId) {
          setBrowserTargetSession(workspaceId, context.defaultSessionId);
        }
      }),
      listen<CapturedStyle>('browser-style-captured', (event) => {
        if (!event.payload) return;
        addCapturedStyle(workspaceId, event.payload);
        setBrowserPickStyleModeState(workspaceId, false);
        setActiveSidebar('styles');
      }),
      listen<CapturedUiElementReference>('browser-ui-element-captured', (event) => {
        if (!event.payload) return;
        addCapturedUiReference(workspaceId, event.payload);
        setBrowserPickUiElementModeState(workspaceId, false);
        setActiveSidebar('ui-references');
      }),
      listen<AppliedStyle>('browser-style-applied', (event) => {
        if (!event.payload) return;
        addAppliedStyle(workspaceId, event.payload);
        setLastApplied(event.payload);
        setAppliedToolbarOpen(true);
      }),
    ];

    return () => {
      void Promise.all(unlisteners).then((resolved) => {
        resolved.forEach((unlisten) => unlisten());
      });
    };
  }, [
    setBrowserCurrentUrl,
    setBrowserInspectModeState,
    setBrowserLoading,
    setBrowserSelectedElement,
    setBrowserTargetSession,
    updateBrowserTab,
    addCapturedStyle,
    addCapturedUiReference,
    addAppliedStyle,
    setActiveSidebar,
    setAppliedToolbarOpen,
    setLastApplied,
    workspaceId,
  ]);

  useEffect(() => {
    if (!nativeBrowserReady) return;
    void setBrowserZoom(workspaceId, effectiveState.zoomFactor).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [effectiveState.zoomFactor, nativeBrowserReady, setBrowserZoom, workspaceId]);

  useEffect(() => {
    if (!nativeBrowserReady || isPoppedOut) return;

    // Native child webviews are rectangular OS surfaces and cannot be reliably
    // clipped by the React layer. Clear any previously injected device chrome so
    // mobile/tablet presets remain faithful rectangular viewports.
    void setBrowserPreviewChrome(workspaceId, null).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [
    nativeBrowserReady,
    isPoppedOut,
    setBrowserPreviewChrome,
    workspaceId,
  ]);

  useEffect(() => {
    if (!nativeBrowserReady) return;
    const activeTabId = browserState?.activeTabId;
    if (!activeTabId || activeTabId === lastNavigatedTabRef.current) return;

    const activeTab = browserState?.browserTabs?.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    lastNavigatedTabRef.current = activeTabId;

    if (browserUrlsEqual(activeTab.url, browserState?.currentUrl ?? '')) return;

    void navigateBrowserView(workspaceId, activeTab.url);
    setBrowserDraftUrl(workspaceId, activeTab.url);
  }, [
    browserState?.activeTabId,
    nativeBrowserReady,
    navigateBrowserView,
    setBrowserDraftUrl,
    workspaceId,
  ]);

  const handleNavigate = useCallback(async () => {
    const nextUrl = resolvedDraftUrl;
    setBrowserDraftUrl(workspaceId, nextUrl);
    setBrowserLoading(workspaceId, true);

    try {
      if (!nativeBrowserReady) {
        await syncBrowserBounds();
      }
      await navigateBrowserView(workspaceId, nextUrl);
      setNativeBrowserReady(true);
      setError(null);
      if (effectiveState.activeTabId) {
        updateBrowserTab(workspaceId, effectiveState.activeTabId, { url: nextUrl });
      }
    } catch (err) {
      setBrowserLoading(workspaceId, false);
      setNativeBrowserReady(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [
    navigateBrowserView,
    nativeBrowserReady,
    resolvedDraftUrl,
    setBrowserDraftUrl,
    setBrowserLoading,
    syncBrowserBounds,
    workspaceId,
    effectiveState.activeTabId,
    updateBrowserTab,
  ]);

  const handleReload = useCallback(async () => {
    setBrowserLoading(workspaceId, true);
    try {
      await reloadBrowserView(workspaceId);
      setError(null);
    } catch (err) {
      setBrowserLoading(workspaceId, false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [reloadBrowserView, setBrowserLoading, workspaceId]);

  const handleToggleInspect = useCallback(async () => {
    try {
      await setBrowserInspectMode(workspaceId, !effectiveState.inspectMode);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [effectiveState.inspectMode, setBrowserInspectMode, workspaceId]);

  const handleZoomChange = useCallback((nextZoom: number) => {
    setBrowserZoomFactor(workspaceId, clampZoom(nextZoom));
  }, [setBrowserZoomFactor, workspaceId]);

  const handleDeviceChange = useCallback((deviceId: BrowserDevicePreset['id']) => {
    setBrowserDeviceId(workspaceId, deviceId);
    setBrowserZoomFactor(workspaceId, getDefaultZoomForDevice(deviceId));
  }, [setBrowserDeviceId, setBrowserZoomFactor, workspaceId]);

  const handleRotateDevice = useCallback(() => {
    setBrowserDeviceOrientation(
      workspaceId,
      effectiveState.deviceOrientation === 'portrait' ? 'landscape' : 'portrait',
    );
  }, [effectiveState.deviceOrientation, setBrowserDeviceOrientation, workspaceId]);

  const handleGoBack = useCallback(async () => {
    try {
      await goBackBrowserView(workspaceId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [goBackBrowserView, workspaceId]);

  const handleGoForward = useCallback(async () => {
    try {
      await goForwardBrowserView(workspaceId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [goForwardBrowserView, workspaceId]);

  const handleInspectorSend = useCallback(async (promptText?: string) => {
    if (!effectiveState.selectedElement) return;

    const targetSessionId = effectiveState.targetSessionId ?? defaultSessionId;
    if (!targetSessionId) {
      setError('No terminal session is available for prompt handoff.');
      throw new Error('No terminal session is available for prompt handoff.');
    }

    // A single slot can be sent by itself (Enter in the editor); otherwise
    // combine every non-empty slot into one batched request.
    const slotTexts = (promptText
      ? [promptText]
      : effectiveState.instructionSlots.map((slot) => htmlToPlainText(slot).trim()).filter((text) => text.length > 0)
    );
    if (slotTexts.length === 0) {
      setError('Enter a prompt before sending it to a terminal agent.');
      throw new Error('Enter a prompt before sending it to a terminal agent.');
    }

    const instructions = slotTexts
      .map((text, i) => (slotTexts.length > 1 ? `${i + 1}. ${text}` : text))
      .join('\n\n');

    const formattedPrompt = formatElementPrompt(
      effectiveState.selectedElement,
      instructions,
      activeDevice.label,
      effectiveState.zoomFactor,
    );

    setIsSubmitting(true);
    try {
      await sendPromptToTarget(targetSessionId, formattedPrompt);
      setBrowserInstructionSlots(workspaceId, ['']);
      setActiveBrowserInstructionSlot(workspaceId, 0);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw new Error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeDevice.label,
    defaultSessionId,
    effectiveState.selectedElement,
    effectiveState.targetSessionId,
    effectiveState.instructionSlots,
    effectiveState.zoomFactor,
    sendPromptToTarget,
    setBrowserInstructionSlots,
    setActiveBrowserInstructionSlot,
    workspaceId,
  ]);

  const handleInspectorTargetSessionChange = useCallback((sessionId: string | null) => {
    setBrowserTargetSession(workspaceId, sessionId);
  }, [setBrowserTargetSession, workspaceId]);

  const handleInspectorDraftChange = useCallback(
    (html: string) => {
      const index = effectiveState.activeInstructionSlot;
      const slots = effectiveState.instructionSlots.map((slot, i) => (i === index ? html : slot));
      setBrowserInstructionSlots(workspaceId, slots);
    },
    [effectiveState.activeInstructionSlot, effectiveState.instructionSlots, setBrowserInstructionSlots, workspaceId],
  );

  const handleSelectInstructionSlot = useCallback(
    (index: number) => {
      setActiveBrowserInstructionSlot(workspaceId, index);
    },
    [setActiveBrowserInstructionSlot, workspaceId],
  );

  const handleAddInstructionSlot = useCallback(() => {
    const slots = [...effectiveState.instructionSlots, ''];
    if (slots.length > 4) return;
    setBrowserInstructionSlots(workspaceId, slots);
    setActiveBrowserInstructionSlot(workspaceId, slots.length - 1);
  }, [effectiveState.instructionSlots, setActiveBrowserInstructionSlot, setBrowserInstructionSlots, workspaceId]);

  const handleRemoveInstructionSlot = useCallback(
    (index: number) => {
      if (effectiveState.instructionSlots.length <= 1) return;
      const slots = effectiveState.instructionSlots.filter((_, i) => i !== index);
      const activeIndex = Math.min(effectiveState.activeInstructionSlot, slots.length - 1);
      setBrowserInstructionSlots(workspaceId, slots);
      setActiveBrowserInstructionSlot(workspaceId, activeIndex);
    },
    [
      effectiveState.activeInstructionSlot,
      effectiveState.instructionSlots,
      setActiveBrowserInstructionSlot,
      setBrowserInstructionSlots,
      workspaceId,
    ],
  );

  const handleInspectorClear = useCallback(() => {
    clearBrowserSelection(workspaceId);
  }, [clearBrowserSelection, workspaceId]);

  const handleCopyUrl = useCallback(() => {
    const currentUrl = resolvedCurrentUrl;
    navigator.clipboard.writeText(currentUrl).catch(() => undefined);
  }, [resolvedCurrentUrl]);

  const handleOpenExternal = useCallback(async () => {
    const currentUrl = resolvedCurrentUrl;
    try {
      await invoke('open_url', { url: currentUrl });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [resolvedCurrentUrl]);

  const handleTogglePopout = useCallback(async () => {
    try {
      if (isPoppedOut) {
        await dockBrowserView(workspaceId);
        setIsPoppedOut(false);
        setNativeBrowserReady(false);
        lastSyncedBoundsKeyRef.current = null;
        setError(null);
        return;
      }

      if (!nativeBrowserReady) {
        await syncBrowserBounds();
      }

      const state = await popOutBrowserView(workspaceId, resolvedCurrentUrl);
      setBrowserCurrentUrl(workspaceId, state.currentUrl);
      setIsPoppedOut(true);
      setNativeBrowserReady(true);
      lastSyncedBoundsKeyRef.current = null;
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [
    dockBrowserView,
    isPoppedOut,
    nativeBrowserReady,
    popOutBrowserView,
    resolvedCurrentUrl,
    setBrowserCurrentUrl,
    syncBrowserBounds,
    workspaceId,
  ]);

  const handleExportSnapshot = useCallback(async () => {
    if (!currentWorkspace?.path) {
      setError('No workspace path is available for snapshot export.');
      return;
    }
    try {
      setExportMessage(null);
      await exportBrowserSnapshot(workspaceId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [currentWorkspace?.path, exportBrowserSnapshot, workspaceId]);

  const handleTogglePickStyle = useCallback(async () => {
    try {
      const next = !effectiveState.pickStyleMode;
      await setBrowserPickStyleMode(workspaceId, next);
      setBrowserPickStyleModeState(workspaceId, next);
      if (next) {
        setActiveSidebar('styles');
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [effectiveState.pickStyleMode, setBrowserPickStyleMode, setBrowserPickStyleModeState, workspaceId]);

  const handleTogglePickUiElement = useCallback(async () => {
    try {
      const next = !effectiveState.pickUiElementMode;
      await setBrowserPickUiElementMode(workspaceId, next);
      setBrowserPickUiElementModeState(workspaceId, next);
      if (next) {
        setActiveSidebar('ui-references');
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [
    effectiveState.pickUiElementMode,
    setBrowserPickUiElementMode,
    setBrowserPickUiElementModeState,
    workspaceId,
  ]);

  const handleApplyStyle = useCallback(async (style: CapturedStyle) => {
    try {
      await setBrowserApplyMode(workspaceId, style);
      setBrowserApplyModeState(workspaceId, style);
      setActiveSidebar(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setBrowserApplyMode, setBrowserApplyModeState, workspaceId]);

  const handleUndoStyle = useCallback(async () => {
    try {
      await undoBrowserStyle(workspaceId);
      undoBrowserStyleStore(workspaceId);
      setAppliedToolbarOpen(false);
      setLastApplied(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [undoBrowserStyle, undoBrowserStyleStore, workspaceId]);

  const handleKeepStyle = useCallback(() => {
    setAppliedToolbarOpen(false);
    setLastApplied(null);
  }, []);

  const handleCopyCapturedCss = useCallback((style: CapturedStyle) => {
    const lines = [`/* Extracted from ${style.sourceUrl} */`, `.captured-style {`];
    for (const [k, v] of Object.entries(style.computedStyles)) {
      lines.push(`  ${k}: ${v};`);
    }
    lines.push('}');
    navigator.clipboard.writeText(lines.join('\n')).catch(() => undefined);
  }, []);

  const handleCopyAppliedCss = useCallback(() => {
    if (!lastApplied) return;
    navigator.clipboard.writeText(lastApplied.cssRules.join('\n')).catch(() => undefined);
  }, [lastApplied]);

  const handleCopyUiReferenceJson = useCallback((reference: CapturedUiElementReference) => {
    navigator.clipboard.writeText(JSON.stringify(reference, null, 2)).catch(() => undefined);
  }, []);

  const handleSendUiReferenceToAgent = useCallback(async () => {
    const reference = effectiveState.uiReferenceClipboard.find((entry) => entry.id === effectiveState.activeUiReferenceId);
    if (!reference) {
      setError('Capture or select a UI reference first.');
      return;
    }

    const targetSessionId = effectiveState.targetSessionId ?? defaultSessionId;
    if (!targetSessionId) {
      setError('No terminal session is available for prompt handoff.');
      return;
    }

    const briefText = htmlToPlainText(effectiveState.uiReferencePrompt).trim();
    if (!briefText) {
      setError('Enter an instruction before sending the UI reference to an agent.');
      return;
    }

    if (effectiveState.uiReferenceMode === 'replace' && !effectiveState.selectedElement) {
      setError('Select the target element on localhost before using replace mode.');
      return;
    }

    const formattedPrompt = formatUiReferencePrompt(
      reference,
      briefText,
      effectiveState.uiReferenceMode,
      effectiveState.selectedElement,
    );

    setIsSubmitting(true);
    try {
      await sendPromptToTarget(targetSessionId, formattedPrompt);
      setBrowserUiReferencePrompt(workspaceId, '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    defaultSessionId,
    effectiveState.activeUiReferenceId,
    effectiveState.selectedElement,
    effectiveState.targetSessionId,
    effectiveState.uiReferenceClipboard,
    effectiveState.uiReferenceMode,
    effectiveState.uiReferencePrompt,
    sendPromptToTarget,
    setBrowserUiReferencePrompt,
    workspaceId,
  ]);

  const handleAddTab = useCallback(() => {
    const id = `tab-${Date.now()}`;
    addBrowserTab(workspaceId, { id, url: FALLBACK_URL, title: 'New Tab' });
  }, [addBrowserTab, workspaceId]);

  const handleOpenLocalhost = useCallback((url: string) => {
    setIsLocalhostMenuOpen(false);
    openBrowserTab(workspaceId, url, getLocalhostLabel(url));
  }, [openBrowserTab, workspaceId]);

  /** Proactively probe common dev-server ports so the Localhost menu works
   *  even when the server was started in a terminal outside the app (the
   *  click-a-link detection in TerminalPane never sees that output). */
  const scanDevServers = useCallback(async () => {
    const probes = DEV_SERVER_PROBE_PORTS.map(async (port) => {
      // Try 127.0.0.1 first: some servers bind only the IPv4 loopback, and
      // fetch('localhost') can resolve to ::1 and time out even though the
      // server is up. Report the friendlier localhost URL when either works.
      if (await isLocalPortResponding(`http://127.0.0.1:${port}/`)) {
        return `http://localhost:${port}`;
      }
      if (await isLocalPortResponding(`http://localhost:${port}/`)) {
        return `http://localhost:${port}`;
      }
      return null;
    });
    const found = (await Promise.all(probes)).filter((url): url is string => url !== null);
    // addDevServerUrl normalizes, de-dupes and keeps the newest-first order.
    found.forEach((url) => addDevServerUrl(workspaceId, url));
  }, [addDevServerUrl, workspaceId]);

  const handleLocalhostButtonClick = useCallback(() => {
    if (devServerUrls.length === 1) {
      handleOpenLocalhost(devServerUrls[0]);
      return;
    }
    setIsLocalhostMenuOpen((isOpen) => !isOpen);
    void scanDevServers();
  }, [devServerUrls, handleOpenLocalhost, scanDevServers]);

  // Populate the Localhost menu shortly after mount so the first click
  // already shows servers that were started before the pane opened.
  useEffect(() => {
    const timer = setTimeout(() => { void scanDevServers(); }, 600);
    return () => clearTimeout(timer);
  }, [scanDevServers]);


  const handleSelectTab = useCallback((tabId: string) => {
    setActiveBrowserTab(workspaceId, tabId);
  }, [setActiveBrowserTab, workspaceId]);

  const handleCloseTab = useCallback((tabId: string) => {
    removeBrowserTab(workspaceId, tabId);
  }, [removeBrowserTab, workspaceId]);

  const selectedElement = effectiveState.selectedElement;
  const selectedElementTitle = selectedElement?.pageTitle || pageTitle || 'Untitled page';
  const activeUiReference = effectiveState.uiReferenceClipboard.find(
    (reference) => reference.id === effectiveState.activeUiReferenceId,
  ) ?? effectiveState.uiReferenceClipboard[0] ?? null;

  const uiReferenceCharCount = useMemo(
    () => htmlToPlainText(effectiveState.uiReferencePrompt).length,
    [effectiveState.uiReferencePrompt],
  );

  useEffect(() => {
    setShowFullUiReferenceInfo(false);
  }, [activeUiReference]);

  useEffect(() => {
    if (!isLocalhostMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!localhostMenuRef.current?.contains(event.target as Node)) {
        setIsLocalhostMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLocalhostMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLocalhostMenuOpen]);

  const handleCopyUiReferenceHtml = useCallback(() => {
    if (!activeUiReference) return;
    navigator.clipboard.writeText(activeUiReference.htmlSnippet).catch(() => undefined);
  }, [activeUiReference]);

  const displayUrl = resolvedDraftUrl.replace(/^https?:\/\//, '');
  const previewLabel = activeDevice.id === 'responsive'
    ? 'responsive'
    : `${viewportMetrics.viewportWidth}×${viewportMetrics.viewportHeight}`;

  return (
    <IconContext.Provider value={BROWSER_ICON_CONTEXT}>
    <div className="browser-workbench h-full w-full">
      <div className="browser-frame flex h-full w-full flex-col overflow-hidden border border-[var(--border-primary)] bg-[var(--bg-primary)]">
        {/* ── Header Bar ──────────────────────────────────────────────── */}
        <header className="browser-chrome shrink-0 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          {/* Title Row */}
          <div className="browser-commandbar flex items-center gap-2 px-3 py-2">
            {/* Navigation */}
            <div className="browser-button-group" role="group" aria-label="Page navigation">
              <button
                onClick={() => void handleGoBack()}
                disabled={historyLength <= 1}
                title="Back"
                aria-label="Go back"
                className="browser-action app-icon-button h-7 w-7 rounded-md border border-[var(--border-primary)] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <CaretLeft size={15} aria-hidden="true" />
              </button>
              <button
                onClick={() => void handleGoForward()}
                title="Forward"
                aria-label="Go forward"
                className="browser-action app-icon-button h-7 w-7 rounded-md border border-[var(--border-primary)]"
              >
                <CaretRight size={15} aria-hidden="true" />
              </button>
            </div>

            {/* URL Input */}
            <div className="browser-address flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2.5 py-1.5">
              <LinkSimple size={13} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
              <input
                value={resolvedDraftUrl}
                onChange={(event) => setBrowserDraftUrl(workspaceId, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleNavigate();
                  }
                }}
                className="browser-address__input flex-1 bg-transparent text-[12px] font-normal text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
                placeholder={FALLBACK_URL}
              />
              <motion.button
                onClick={() => void handleNavigate()}
                title="Navigate"
                aria-label="Navigate to URL"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="browser-address__submit app-icon-button h-6 w-6 shrink-0 rounded-md"
              >
                <span className="sr-only">Navigate</span>
                <ArrowRight size={14} aria-hidden="true" />
              </motion.button>
            </div>

            {/* Localhost quick-access: uses detected dev servers instead of a fixed port. */}
            <div ref={localhostMenuRef} className="relative shrink-0">
              <motion.button
                onClick={handleLocalhostButtonClick}
                title={devServerUrls.length === 0
                  ? 'No local dev server detected'
                  : devServerUrls.length === 1
                    ? `Open ${getLocalhostLabel(devServerUrls[0])} in new tab`
                    : 'Choose a local dev server'}
                aria-label={devServerUrls.length === 0
                  ? 'No local dev server detected'
                  : devServerUrls.length === 1
                    ? `Open ${getLocalhostLabel(devServerUrls[0])} in new tab`
                    : 'Choose a local dev server'}
                aria-haspopup={devServerUrls.length !== 1 ? 'menu' : undefined}
                aria-expanded={devServerUrls.length !== 1 ? isLocalhostMenuOpen : undefined}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="browser-localhost app-button app-button--quiet h-7 shrink-0 px-2 text-[11px]"
              >
                <ArrowUpRight size={13} aria-hidden="true" />
                Localhost
                {devServerUrls.length > 1 && (
                  <span className="rounded-full bg-[var(--accent-light)]/25 px-1 text-[9px] font-bold tabular-nums text-[var(--accent)]">
                    {devServerUrls.length}
                  </span>
                )}
                {devServerUrls.length !== 1 && <CaretDown size={11} aria-hidden="true" />}
              </motion.button>

              <AnimatePresence>
                {isLocalhostMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    role="menu"
                    aria-label="Detected local dev servers"
                    className="absolute right-0 top-full z-50 mt-1.5 min-w-[190px] overflow-hidden rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-1 shadow-xl"
                  >
                    {devServerUrls.length > 0 ? (
                      <>
                        <p className="px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]/60">
                          Detected local servers
                        </p>
                        {devServerUrls.map((url) => (
                          <button
                            key={url}
                            type="button"
                            role="menuitem"
                            onClick={() => handleOpenLocalhost(url)}
                            title={`Open ${url}`}
                            className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                              <span className="truncate font-mono text-[10px] text-[var(--text-primary)]">
                                {getLocalhostLabel(url)}
                              </span>
                            </span>
                            <ArrowUpRight size={12} className="shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="px-2 py-2">
                        <p className="font-mono text-[10px] text-[var(--text-primary)]">No local server detected</p>
                        <p className="mt-1 font-mono text-[9px] leading-4 text-[var(--text-secondary)]">
                          Start a dev server in a terminal and its URL will appear here.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Primary Actions */}
            <div className="browser-actions flex shrink-0 items-center gap-1">
              {/* Inspect */}
              <motion.button
                onClick={() => void handleToggleInspect()}
                title={effectiveState.inspectMode ? 'Exit inspect mode' : 'Inspect elements'}
                aria-label={effectiveState.inspectMode ? 'Exit inspect mode' : 'Inspect elements'}
                aria-pressed={effectiveState.inspectMode}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 480, damping: 28 }}
                className={`browser-action browser-action--inspect browser-inspect inline-flex h-7 w-7 items-center justify-center rounded-[7px] p-[1px] cursor-pointer ${
                  effectiveState.inspectMode
                    ? 'is-active'
                    : ''
                }`}
              >
                <span className="browser-inspect__surface">
                  <CursorClick className="browser-inspect__icon h-4 w-4 shrink-0" aria-hidden="true" />
                </span>
              </motion.button>

              <span className="browser-tool-separator mx-0.5 h-5 w-px bg-[var(--border-primary)]" aria-hidden="true" />

              <button
                onClick={() => void handleReload()}
                title="Reload"
                aria-label="Reload page"
                 className="browser-action app-icon-button h-7 w-7 rounded-md border border-[var(--border-primary)]"
              >
                <ArrowClockwise size={14} className={effectiveState.isLoading ? 'animate-spin' : ''} aria-hidden="true" />
              </button>
              <button
                onClick={() => void handleCopyUrl()}
                title="Copy URL"
                aria-label="Copy URL to clipboard"
                 className="browser-action app-icon-button h-7 w-7 rounded-md border border-[var(--border-primary)]"
              >
                <Copy size={14} aria-hidden="true" />
              </button>
              <button
                onClick={() => void handleOpenExternal()}
                title="Open in browser"
                aria-label="Open in external browser"
                 className="browser-action app-icon-button h-7 w-7 rounded-md border border-[var(--border-primary)]"
              >
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
              <button
                onClick={() => void handleTogglePopout()}
                title={isPoppedOut ? 'Dock browser here' : 'Open in app window'}
                aria-label={isPoppedOut ? 'Dock browser here' : 'Open browser in app window'}
                aria-pressed={isPoppedOut}
                className={`browser-action inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                  isPoppedOut
                   ? 'border-[var(--text-secondary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                   : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                }`}
              >
                <Browsers size={15} aria-hidden="true" />
              </button>
              <button
                onClick={() => void handleExportSnapshot()}
                title="Export snapshot"
                aria-label="Export page snapshot"
                 className="browser-action app-icon-button h-7 w-7 rounded-md border border-[var(--border-primary)]"
              >
                <Export size={15} aria-hidden="true" />
              </button>

              <span className="browser-tool-separator h-5 w-px bg-[var(--border-primary)] mx-0.5" aria-hidden="true" />

              {/* Style Tools */}
              <div className="browser-button-group" role="group" aria-label="Design inspection tools">
              <button
                onClick={() => void handleTogglePickStyle()}
                title={effectiveState.pickStyleMode ? 'Stop picking styles' : 'Pick UI style'}
                aria-label={effectiveState.pickStyleMode ? 'Stop picking styles' : 'Pick UI style'}
                aria-pressed={effectiveState.pickStyleMode}
                className={`browser-action inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                  effectiveState.pickStyleMode
                     ? 'border-amber-700/60 bg-amber-950/20 text-amber-300'
                   : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                }`}
              >
                <EyedropperSample
                  size={16}
                  className={effectiveState.pickStyleMode ? 'drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]' : undefined}
                  aria-hidden="true"
                />
              </button>
              <button
                onClick={() => void handleTogglePickUiElement()}
                title={
                  effectiveState.pickUiElementMode
                    ? 'Now click any element on this page to capture it (press again to stop)'
                    : 'Copy a UI element from any page and rebuild it in your local project'
                }
                aria-label={
                  effectiveState.pickUiElementMode
                    ? 'Stop picking UI elements'
                    : 'Copy a UI element to rebuild in local project'
                }
                aria-pressed={effectiveState.pickUiElementMode}
                className={`browser-copy-ui inline-flex h-7 items-center gap-1.5 rounded-md border px-2 transition-colors cursor-pointer ${
                  effectiveState.pickUiElementMode
                     ? 'border-[var(--text-secondary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                     : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                }`}
              >
                <SelectionAll size={15} aria-hidden="true" />
                 <span className="text-[11px] font-medium">Copy UI</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => setActiveSidebar((prev) => prev === 'styles' ? null : 'styles')}
                  title="Style clipboard"
                  aria-label="Style clipboard"
                  aria-pressed={activeSidebar === 'styles'}
                  className={`browser-action inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                    activeSidebar === 'styles'
                      ? 'border-sky-500/30 bg-sky-500/10 text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.15)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600'
                  }`}
                >
                  <Swatches size={15} aria-hidden="true" />
                </button>
                {effectiveState.styleClipboard.length > 0 && (
                  <span className="browser-count absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500 text-[7px] font-bold text-white shadow-[0_0_6px_rgba(56,189,248,0.5)]">
                    {effectiveState.styleClipboard.length}
                  </span>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => setActiveSidebar((prev) => prev === 'ui-references' ? null : 'ui-references')}
                  title="UI references"
                  aria-label="UI references"
                  aria-pressed={activeSidebar === 'ui-references'}
                  className={`browser-action inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                    activeSidebar === 'ui-references'
                      ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600'
                  }`}
                >
                  <StackSimple size={15} aria-hidden="true" />
                </button>
                {effectiveState.uiReferenceClipboard.length > 0 && (
                  <span className="browser-count absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-500 text-[7px] font-bold text-white shadow-[0_0_6px_rgba(34,211,238,0.5)]">
                    {effectiveState.uiReferenceClipboard.length}
                  </span>
                )}
              </div>
              </div>
            </div>
          </div>

          {/* Tab Bar */}
          <BrowserTabBar
            tabs={effectiveState.browserTabs}
            activeTabId={effectiveState.activeTabId}
            onAddTab={handleAddTab}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
          />

          {/* Device & Zoom Controls */}
          <div className="browser-workbench-bar flex items-center gap-2 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-1.5">
            {/* Device Selector */}
            <div className="browser-control flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1">
              <Devices size={13} className="text-[var(--accent)]" aria-hidden="true" />
              <select
                value={effectiveState.deviceId}
                onChange={(event) => handleDeviceChange(event.target.value as BrowserDevicePreset['id'])}
                className="bg-transparent text-[11px] font-medium text-[var(--text-primary)] outline-none appearance-none pr-1 cursor-pointer"
              >
                {BROWSER_DEVICE_OPTIONS.map((device) => (
                  <option key={device.id} value={device.id} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                    {device.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Rotate */}
            <button
              onClick={handleRotateDevice}
              disabled={activeDevice.id === 'responsive'}
              title="Rotate orientation"
              aria-label="Rotate orientation"
              className="browser-action browser-action--compact app-icon-button h-6 w-6 rounded-md border border-[var(--border-primary)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <DeviceRotate size={12} aria-hidden="true" />
            </button>

            <span className="browser-tool-separator h-4 w-px bg-[var(--border-primary)]" aria-hidden="true" />

            {/* Zoom Controls */}
            <button
              onClick={() => handleZoomChange(getNextZoom(effectiveState.zoomFactor, -1))}
              title="Zoom out"
              aria-label="Zoom out"
              className="browser-action browser-action--compact app-icon-button h-6 w-6 rounded-md border border-[var(--border-primary)]"
            >
              <Minus size={12} aria-hidden="true" />
            </button>
            <motion.button
              onClick={() => handleZoomChange(1)}
              title="Reset zoom"
              aria-label="Reset zoom to 100%"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="browser-zoom app-button app-button--quiet h-6 px-2 text-[11px]"
            >
              <MagnifyingGlass size={12} className="text-[var(--accent)]" aria-hidden="true" />
              {Math.round(effectiveState.zoomFactor * 100)}%
            </motion.button>
            <button
              onClick={() => handleZoomChange(getNextZoom(effectiveState.zoomFactor, 1))}
              title="Zoom in"
              aria-label="Zoom in"
              className="browser-action browser-action--compact app-icon-button h-6 w-6 rounded-md border border-[var(--border-primary)]"
            >
              <Plus size={12} aria-hidden="true" />
            </button>

            <span className="browser-tool-separator h-4 w-px bg-[var(--border-primary)]" aria-hidden="true" />

            {/* Status Indicators — iconified */}
            <div className="browser-metric flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
              <SquaresFour size={12} aria-hidden="true" />
              <span>{previewLabel}</span>
            </div>

            <span className="browser-tool-separator h-4 w-px bg-[var(--border-primary)]" aria-hidden="true" />

            <div className="browser-metric flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
              <Speedometer size={12} aria-hidden="true" />
              <span>{lastLoadDurationMs !== null ? `${lastLoadDurationMs}ms` : '--'}</span>
            </div>

            <span className="browser-tool-separator h-4 w-px bg-[var(--border-primary)]" aria-hidden="true" />

            <div className="browser-metric flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
              <ClockCounterClockwise size={12} aria-hidden="true" />
              <span>{historyLength}</span>
            </div>

            <span className="browser-tool-separator h-4 w-px bg-[var(--border-primary)]" aria-hidden="true" />

            <div className="browser-page-status ml-auto flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
              <span className={`browser-page-status__indicator inline-flex h-1.5 w-1.5 rounded-full ${effectiveState.isLoading ? 'is-loading bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-zinc-600'}`} />
              <span>{pageTitle ? pageTitle.slice(0, 40) + (pageTitle.length > 40 ? '…' : '') : 'untitled'}</span>
            </div>

            <div className="browser-current-url ml-2 flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]/70">
              <LinkSimple size={12} aria-hidden="true" />
              <span className="max-w-[160px] truncate">{displayUrl}</span>
            </div>
          </div>

          {/* Messages */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="browser-notice browser-notice--error border-t border-rose-900/40 bg-rose-950/20 px-3 py-1.5"
              >
                <div className="flex items-center gap-2 text-[10px] text-rose-300/90">
                  <WarningCircle size={12} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{error}</span>
                </div>
              </motion.div>
            )}
            {exportMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="browser-notice browser-notice--success border-t border-emerald-900/40 bg-emerald-950/20 px-3 py-1.5"
              >
                <div className="flex items-center gap-2 text-[10px] text-emerald-300/90">
                  <CheckCircle size={12} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{exportMessage}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* ── Preview Area ──────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 flex">
          <div className={`relative min-w-0 flex-1 ${effectiveState.selectedElement ? 'border-r border-[var(--border-primary)]' : ''}`}>
            <div
              ref={previewShellRef}
              className="browser-preview-shell absolute inset-0 overflow-hidden bg-[var(--bg-primary)]"
            >
              {isPoppedOut ? (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="flex max-w-[320px] flex-col items-center gap-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]/90 px-5 py-4 text-center shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-400/25 bg-violet-500/10 text-violet-300">
                      <AppWindow size={20} aria-hidden="true" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-primary)]">
                        Detached browser
                      </div>
                      <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]/65">
                        {pageTitle ? pageTitle.slice(0, 34) : 'active preview'}
                      </div>
                    </div>
                    <button
                      onClick={() => void handleTogglePopout()}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-violet-400/25 bg-violet-500/10 px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-violet-200 hover:border-violet-300/45 hover:bg-violet-500/15 transition-colors cursor-pointer"
                    >
                      <AppWindow size={14} aria-hidden="true" />
                      Dock
                    </button>
                  </div>
                </div>
              ) : activeDevice.id === 'responsive' ? (
                <div
                  ref={previewViewportRef}
                  className="absolute inset-0 overflow-hidden bg-zinc-950/30"
                  style={{
                    width: viewportMetrics.viewportWidth,
                    height: viewportMetrics.viewportHeight,
                  }}
                />
              ) : (
                <div className="relative flex h-full items-center justify-center p-4">
                  <div
                    className="relative border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-[0_18px_55px_rgba(0,0,0,0.24)]"
                    style={{
                      width: viewportMetrics.stageWidth + 2,
                      height: viewportMetrics.stageHeight + 2,
                    }}
                  >
                    <div ref={previewViewportRef} className="absolute inset-px" />
                  </div>
                </div>
              )}
            </div>

            {/* Booting Overlay */}
            <AnimatePresence>
              {!nativeBrowserReady && !isPoppedOut && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <div className="browser-boot-card rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]/90 backdrop-blur-sm px-5 py-3.5 text-center shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
                    <div className="flex items-center gap-2">
                      <CircleNotch
                        size={16}
                        className="text-[var(--accent)] animate-spin"
                        aria-hidden="true"
                      />
                      <Shimmer as="span" className="browser-boot-card__label text-[10px] font-bold tracking-[0.18em] text-[var(--text-primary)]" duration={2.8}>
                        Preparing preview
                      </Shimmer>
                    </div>
                    <p className="mt-1.5 text-[10px] text-[var(--accent)]/60">
                      initializing embedded browser surface
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Apply Mode Toolbar */}
            <AnimatePresence>
              {appliedToolbarOpen && lastApplied && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50"
                >
                  <ApplyModeToolbar
                    onUndo={handleUndoStyle}
                    onKeep={handleKeepStyle}
                    onCopyCss={handleCopyAppliedCss}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Reference Panels ───────────────────────────────────────── */}
          <AnimatePresence>
            {activeSidebar === 'styles' && (
              <motion.aside
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 14 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="w-[310px] shrink-0 border-l border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-y-auto"
              >
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/90 px-3 py-2.5 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <Palette size={14} className="text-[var(--accent)]" aria-hidden="true" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-primary)]">
                      style clipboard
                    </span>
                    {effectiveState.styleClipboard.length > 0 && (
                      <span className="rounded-full border border-[var(--border-primary)] px-1.5 text-[9px] font-bold text-[var(--accent)]">
                        {effectiveState.styleClipboard.length}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveSidebar(null)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 text-[var(--accent)] hover:border-zinc-600 cursor-pointer"
                    aria-label="Close clipboard"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <StyleClipboardPanel
                  styles={effectiveState.styleClipboard}
                  activeStyleId={lastApplied?.className ?? null}
                  onRemove={(id) => removeCapturedStyle(workspaceId, id)}
                  onApply={handleApplyStyle}
                  onCopyCss={handleCopyCapturedCss}
                />
              </motion.aside>
            )}
            {activeSidebar === 'ui-references' && (
              <motion.aside
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 14 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className={`shrink-0 overflow-y-auto border-l border-[var(--border-primary)] bg-[var(--bg-secondary)] transition-[width] duration-200 ${
                  showFullUiReferenceInfo ? 'w-[460px]' : 'w-[380px]'
                }`}
              >
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-40" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                      ui references
                    </span>
                    {effectiveState.uiReferenceClipboard.length > 0 && (
                      <span className="border border-cyan-800 bg-cyan-950/40 px-1.5 text-[9px] font-black text-cyan-300">
                        {effectiveState.uiReferenceClipboard.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowFullUiReferenceInfo((value) => !value)}
                      title={showFullUiReferenceInfo ? 'Hide developer details' : 'Show developer details'}
                      aria-label={showFullUiReferenceInfo ? 'Hide developer details' : 'Show developer details'}
                      aria-pressed={showFullUiReferenceInfo}
                      className={`flex items-center gap-1.5 border px-2 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                        showFullUiReferenceInfo
                          ? 'border-cyan-800 bg-cyan-950/40 text-cyan-300'
                          : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <DeviceMobile size={12} aria-hidden="true" />
                      dev
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSidebar(null)}
                      title="Close UI references"
                      aria-label="Close UI references"
                      className="flex h-6 w-6 items-center justify-center text-[var(--text-secondary)] transition-colors hover:text-rose-400 cursor-pointer"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3 p-3">
                  {/* ── Developer details (opt-in) ─────────────────────── */}
                  {showFullUiReferenceInfo && activeUiReference && (
                    <>
                      <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)]/80">
                        <div className="flex items-center justify-between border-b border-[var(--border-primary)]/70 px-3 py-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/60">
                            capture details
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/40">
                            {activeUiReference.structure.captureStats?.capturedNodeCount ?? activeUiReference.structure.childCount} nodes
                          </span>
                        </div>
                        <div className="space-y-2.5 p-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="border border-cyan-900/60 bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                              {activeUiReference.tagName}
                            </span>
                            <span className="border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                              {activeUiReference.selector}
                            </span>
                          </div>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/50">design intent</div>
                            <div className="mt-0.5 text-[10px] leading-4 text-[var(--text-primary)]">
                              {activeUiReference.designIntent || '—'}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="border border-[var(--border-primary)]/70 bg-[var(--bg-tertiary)]/40 px-2 py-1.5">
                              <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)]/50">source</div>
                              <div className="mt-0.5 truncate text-[10px] font-medium text-[var(--text-primary)]" title={activeUiReference.sourceUrl}>
                                {activeUiReference.sourceUrl.replace(/^https?:\/\//, '')}
                              </div>
                            </div>
                            <div className="border border-[var(--border-primary)]/70 bg-[var(--bg-tertiary)]/40 px-2 py-1.5">
                              <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)]/50">page</div>
                              <div className="mt-0.5 truncate text-[10px] font-medium text-[var(--text-primary)]" title={activeUiReference.pageTitle}>
                                {activeUiReference.pageTitle || 'Untitled'}
                              </div>
                            </div>
                            <div className="border border-[var(--border-primary)]/70 bg-[var(--bg-tertiary)]/40 px-2 py-1.5">
                              <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)]/50">viewport</div>
                              <div className="mt-0.5 truncate text-[10px] font-medium text-[var(--text-primary)]">
                                {activeUiReference.viewport.width}×{activeUiReference.viewport.height}
                              </div>
                            </div>
                            <div className="border border-[var(--border-primary)]/70 bg-[var(--bg-tertiary)]/40 px-2 py-1.5">
                              <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)]/50">size</div>
                              <div className="mt-0.5 truncate text-[10px] font-medium text-[var(--text-primary)]">
                                {activeUiReference.layout.width}×{activeUiReference.layout.height}
                              </div>
                            </div>
                            <div className="border border-[var(--border-primary)]/70 bg-[var(--bg-tertiary)]/40 px-2 py-1.5">
                              <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)]/50">assets</div>
                              <div className="mt-0.5 truncate text-[10px] font-medium text-[var(--text-primary)]">
                                {activeUiReference.assets.length}
                              </div>
                            </div>
                            <div className="border border-[var(--border-primary)]/70 bg-[var(--bg-tertiary)]/40 px-2 py-1.5">
                              <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)]/50">status</div>
                              <div className="mt-0.5 truncate text-[10px] font-medium text-emerald-400">ready</div>
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)]/80">
                        <div className="flex items-center justify-between border-b border-[var(--border-primary)]/70 px-3 py-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/60">captured styles</span>
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/40">
                            {activeUiReference.interactivity.hoverSelectors.length} hovers
                          </span>
                        </div>
                        <div className="space-y-1.5 p-3 font-mono text-[10px] leading-4 text-[var(--text-secondary)]">
                          <div>
                            <span className="text-[var(--text-secondary)]/50">display </span>
                            {activeUiReference.layout.display} / {activeUiReference.layout.position}
                          </div>
                          <div>
                            <span className="text-[var(--text-secondary)]/50">spacing </span>
                            {activeUiReference.spacing.padding} · radius {activeUiReference.spacing.borderRadius}
                          </div>
                          <div>
                            <span className="text-[var(--text-secondary)]/50">font </span>
                            {activeUiReference.typography.fontSize} {activeUiReference.typography.fontWeight} · {activeUiReference.typography.fontFamily}
                          </div>
                          <div>
                            <span className="text-[var(--text-secondary)]/50">visual </span>
                            {activeUiReference.visuals.background || 'transparent'} · {activeUiReference.visuals.color}
                          </div>
                          <div>
                            <span className="text-[var(--text-secondary)]/50">hover </span>
                            {activeUiReference.interactivity.hoverSelectors.slice(0, 2).join(' | ') || 'none detected'}
                          </div>
                        </div>
                      </section>

                      <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)]/80">
                        <div className="flex items-center justify-between border-b border-[var(--border-primary)]/70 px-3 py-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/60">html snippet</span>
                          <button
                            type="button"
                            onClick={handleCopyUiReferenceHtml}
                            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/60 transition-colors hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <Copy size={12} aria-hidden="true" />
                            copy
                          </button>
                        </div>
                        <pre className="max-h-40 overflow-auto border-t border-[var(--border-primary)]/60 bg-[var(--bg-tertiary)]/60 p-2.5 font-mono text-[10px] leading-4 text-[var(--text-secondary)] whitespace-pre-wrap break-all">
                          {activeUiReference.htmlSnippet}
                        </pre>
                      </section>
                    </>
                  )}

                  {/* ── Captured references ────────────────────────────── */}
                  <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)]/80">
                    <div className="flex items-center justify-between border-b border-[var(--border-primary)]/70 px-3 py-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/60">
                        captured references
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/40">
                        {effectiveState.uiReferenceClipboard.length}
                      </span>
                    </div>
                    <UiReferenceClipboardPanel
                      references={effectiveState.uiReferenceClipboard}
                      activeReferenceId={effectiveState.activeUiReferenceId}
                      onSelect={(referenceId) => setActiveUiReference(workspaceId, referenceId)}
                      onRemove={(referenceId) => removeCapturedUiReference(workspaceId, referenceId)}
                      onCopyJson={handleCopyUiReferenceJson}
                    />
                  </section>

                  {activeUiReference && (
                    <>
                      {/* ── Apply mode ──────────────────────────────────── */}
                      <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)]/80">
                        <div className="flex items-center justify-between border-b border-[var(--border-primary)]/70 px-3 py-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/60">
                            apply to local page
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/40">
                            {effectiveState.uiReferenceMode === 'insert' ? 'add' : 'swap'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 p-3">
                          <button
                            type="button"
                            onClick={() => setBrowserUiReferenceMode(workspaceId, 'insert')}
                            className={`border px-3 py-2 text-left transition-colors cursor-pointer ${
                              effectiveState.uiReferenceMode === 'insert'
                                ? 'border-emerald-800 bg-emerald-950/40'
                                : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)]/60 hover:border-emerald-800/60'
                            }`}
                          >
                            <div className={`text-[10px] font-black uppercase tracking-widest ${effectiveState.uiReferenceMode === 'insert' ? 'text-emerald-300' : 'text-[var(--text-secondary)]'}`}>
                              add new
                            </div>
                            <div className="mt-0.5 text-[9px] leading-4 text-[var(--text-secondary)]/50">
                              insert this component somewhere new in localhost.
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setBrowserUiReferenceMode(workspaceId, 'replace')}
                            className={`border px-3 py-2 text-left transition-colors cursor-pointer ${
                              effectiveState.uiReferenceMode === 'replace'
                                ? 'border-amber-800 bg-amber-950/40'
                                : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)]/60 hover:border-amber-800/60'
                            }`}
                          >
                            <div className={`text-[10px] font-black uppercase tracking-widest ${effectiveState.uiReferenceMode === 'replace' ? 'text-amber-300' : 'text-[var(--text-secondary)]'}`}>
                              swap existing
                            </div>
                            <div className="mt-0.5 text-[9px] leading-4 text-[var(--text-secondary)]/50">
                              replace an element already on localhost.
                            </div>
                          </button>
                        </div>
                      </section>

                      {/* ── Replace target ─────────────────────────────── */}
                      {effectiveState.uiReferenceMode === 'replace' && (
                        <section className="border border-amber-900/50 bg-[var(--bg-primary)]/80">
                          <div className="flex items-center gap-1.5 border-b border-amber-900/40 px-3 py-2">
                            <Target size={12} className="text-amber-300" aria-hidden="true" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-200/80">
                              localhost target
                            </span>
                          </div>
                          <div className="space-y-2 p-3">
                            <p className="text-[9px] leading-4 text-[var(--text-secondary)]/50">
                              pick the element on your local page this reference should replace
                            </p>
                            <button
                              type="button"
                              onClick={() => void handleToggleInspect()}
                              className={`inline-flex w-full items-center justify-center gap-1.5 border px-2 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                                effectiveState.inspectMode
                                  ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                                  : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <Hand size={12} aria-hidden="true" />
                              {effectiveState.inspectMode ? 'inspecting — click the local element now' : 'activate inspect mode'}
                            </button>
                            <div className="border border-[var(--border-primary)] bg-[var(--bg-tertiary)]/50 px-2 py-1.5 font-mono text-[10px] text-[var(--text-secondary)]">
                              {selectedElement
                                ? selectedElement.selectors[0] || selectedElement.tagName
                                : 'no target selected yet'}
                            </div>
                          </div>
                        </section>
                      )}

                      {/* ── Target agent ───────────────────────────────── */}
                      <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)]/80">
                        <div className="flex items-center justify-between border-b border-[var(--border-primary)]/70 px-3 py-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/60">target agent</span>
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/40">
                            {sessionOptions.length} avail
                          </span>
                        </div>
                        <div className="p-3">
                          <AgentTargetSelect
                            value={effectiveState.targetSessionId ?? ''}
                            options={sessionOptions}
                            onChange={(sessionId) => setBrowserTargetSession(workspaceId, sessionId)}
                          />
                          <p className="mt-1.5 text-[9px] leading-4 text-[var(--text-secondary)]/50">
                            {targetableSessions.length === 0 && yzpzSessions.length === 0
                              ? 'open an agent terminal tab (claude, codex, gemini…) or a YZPZ Agent to enable rebuild'
                              : 'handoff goes directly into the chosen agent context'}
                          </p>
                        </div>
                      </section>

                      {/* ── Integration brief ──────────────────────────── */}
                      <section className="border border-[var(--border-primary)] bg-[var(--bg-primary)]/80">
                        <div className="flex items-center justify-between border-b border-[var(--border-primary)]/70 px-3 py-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]/60">
                            integration brief
                          </span>
                          <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/40">
                            {uiReferenceCharCount} ch
                          </span>
                        </div>
                        <div className="p-3">
                          <RichPromptEditor
                            initialHtml={effectiveState.uiReferencePrompt}
                            placeholder="Recreate this as a reusable React/Tailwind component for my local landing page. Keep the visual hierarchy, spacing rhythm, and tone, but use clean project-native code."
                            onChange={(html) => setBrowserUiReferencePrompt(workspaceId, html)}
                            onSubmit={() => void handleSendUiReferenceToAgent()}
                            submitting={isSubmitting}
                          />
                          <div className="mt-1.5 flex items-center justify-between text-[9px] font-medium uppercase tracking-widest text-[var(--text-secondary)]/40">
                            <span>enter ↵ send</span>
                            <span>shift+enter newline</span>
                          </div>
                        </div>
                      </section>

                      {/* ── Send ───────────────────────────────────────── */}
                      <button
                        type="button"
                        onClick={() => void handleSendUiReferenceToAgent()}
                        disabled={isSubmitting || targetableSessions.length === 0}
                        className="flex w-full items-center justify-center gap-2 border border-cyan-800/70 bg-cyan-950/40 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300 transition-colors hover:border-cyan-700 hover:bg-cyan-900/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                      >
                        <Sparkle size={14} aria-hidden="true" />
                        <span>{isSubmitting ? 'sending…' : 'rebuild in local project'}</span>
                      </button>
                    </>
                  )}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* ── Element Inspector Panel ────────────────────────────────── */}
          {selectedElement && (
            <ElementInspectorPanel
              element={selectedElement}
              pageTitle={selectedElementTitle}
              targetSessionId={effectiveState.targetSessionId}
              sessionOptions={sessionOptions}
              isSubmitting={isSubmitting}
              deviceLabel={activeDevice.label}
              zoomFactor={effectiveState.zoomFactor}
              initialHtml={effectiveState.instructionSlots[effectiveState.activeInstructionSlot] ?? ''}
              instructionSlots={effectiveState.instructionSlots}
              activeInstructionSlot={effectiveState.activeInstructionSlot}
              onSelectSlot={handleSelectInstructionSlot}
              onAddSlot={handleAddInstructionSlot}
              onRemoveSlot={handleRemoveInstructionSlot}
              onSend={handleInspectorSend}
              onTargetSessionChange={handleInspectorTargetSessionChange}
              onDraftChange={handleInspectorDraftChange}
              onClear={handleInspectorClear}
            />
          )}
        </div>
      </div>
    </div>
    </IconContext.Provider>
  );
};
