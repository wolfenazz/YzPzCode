import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '@iconify/react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type {
  BrowserDeviceOrientation,
  BrowserDevicePreset,
  BrowserElementSelectedEventPayload,
  BrowserInspectModePayload,
  BrowserPageLoadPayload,
  BrowserPageStatePayload,
  BrowserSelectedElement,
  BrowserSnapshotPayload,
  TerminalSession,
} from '../../types';
import { useAppStore } from '../../stores/appStore';
import { useBrowser } from '../../hooks/useBrowser';
import { useTerminal } from '../../hooks/useTerminal';

interface BrowserPaneProps {
  workspaceId: string;
  sessions: TerminalSession[];
  theme: 'dark' | 'light';
}

const FALLBACK_URL = 'http://localhost:3000';
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const BROWSER_DEVICES: BrowserDevicePreset[] = [
  { id: 'responsive', label: 'Responsive', width: null, height: null, category: 'desktop' },
  { id: 'desktop', label: 'Desktop 1440', width: 1440, height: null, category: 'desktop' },
  { id: 'tablet', label: 'Tablet 1024', width: 1024, height: 1366, category: 'tablet' },
  { id: 'ipad-mini', label: 'iPad mini', width: 768, height: 1024, category: 'tablet' },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, category: 'mobile' },
  { id: 'iphone-14-pro', label: 'iPhone 14 Pro', width: 393, height: 852, category: 'mobile' },
  { id: 'pixel-7', label: 'Pixel 7', width: 412, height: 915, category: 'mobile' },
  { id: 'galaxy-s20', label: 'Galaxy S20', width: 360, height: 800, category: 'mobile' },
];

const normalizeBrowserUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'about:blank') return FALLBACK_URL;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
};

const clampZoom = (value: number): number => Math.min(2, Math.max(0.5, Math.round(value * 100) / 100));

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

const formatElementPrompt = (
  element: BrowserSelectedElement,
  prompt: string,
  deviceLabel: string,
  zoomFactor: number,
): string => {
  const attributeEntries = Object.entries(element.attributes)
    .slice(0, 12)
    .map(([key, value]) => `${key}="${value}"`);

  return [
    `UI edit request for the running local app.`,
    '',
    `Selected element context:`,
    `- Page URL: ${element.pageUrl}`,
    `- Page title: ${element.pageTitle || 'Untitled page'}`,
    `- Preview mode: ${deviceLabel} @ ${Math.round(zoomFactor * 100)}% zoom`,
    `- Viewport: ${element.viewport.width} x ${element.viewport.height}`,
    `- Tag: <${element.tagName}>`,
    `- ID: ${element.id || 'none'}`,
    `- Class: ${element.className || 'none'}`,
    `- Selectors: ${element.selectors.join(' | ')}`,
    `- Bounds: x=${element.rect.x}, y=${element.rect.y}, width=${element.rect.width}, height=${element.rect.height}`,
    `- Text content: ${element.textContent || 'none'}`,
    `- Attributes: ${attributeEntries.length > 0 ? attributeEntries.join(', ') : 'none'}`,
    `- HTML snippet: ${element.htmlSnippet}`,
    '',
    `User request:`,
    prompt.trim(),
    '',
    `Please inspect this workspace, identify the component or markup responsible for this exact UI element, apply the requested change, and then explain the edit you made.`,
  ].join('\n');
};

const sessionDisplayName = (session: TerminalSession): string => {
  if (session.agent) {
    return `TTY ${session.index + 1} · ${session.agent}`;
  }
  return `TTY ${session.index + 1} · shell`;
};

const buildBracketedPasteInput = (value: string): string => `\x1b[200~${value}\x1b[201~\r`;

type BrowserToolbarIconName =
  | 'open'
  | 'back'
  | 'forward'
  | 'copy'
  | 'external'
  | 'reload'
  | 'export'
  | 'inspect'
  | 'rotate';

interface BrowserToolbarIconProps {
  name: BrowserToolbarIconName;
  className?: string;
}

const BrowserToolbarIcon: React.FC<BrowserToolbarIconProps> = ({ name, className = 'h-4 w-4' }) => {
  const iconProps = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
  };

  switch (name) {
    case 'open':
      return (
        <svg {...iconProps}>
          <path d="M7 17L17 7" />
          <path d="M7 7h10v10" />
        </svg>
      );
    case 'back':
      return (
        <svg {...iconProps}>
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      );
    case 'forward':
      return (
        <svg {...iconProps}>
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...iconProps}>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      );
    case 'external':
      return (
        <svg {...iconProps}>
          <path d="M14 4h6v6" />
          <path d="m21 3-9 9" />
          <path d="M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
        </svg>
      );
    case 'reload':
      return (
        <Icon icon="material-symbols:refresh-rounded" className={className} aria-hidden="true" />
      );
    case 'export':
      return (
        <svg {...iconProps}>
          <path d="M12 3v11" />
          <path d="m7 9 5 5 5-5" />
          <path d="M5 19h14" />
        </svg>
      );
    case 'inspect':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v3" />
          <path d="M12 19v3" />
          <path d="M2 12h3" />
          <path d="M19 12h3" />
        </svg>
      );
    case 'rotate':
      return (
        <svg {...iconProps}>
          <path d="M3 12a9 9 0 0 1 15-6.7" />
          <path d="M18 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-15 6.7" />
          <path d="M6 21v-5h5" />
        </svg>
      );
    default:
      return null;
  }
};

const getViewportMetrics = (
  hostWidth: number,
  hostHeight: number,
  device: BrowserDevicePreset,
  orientation: BrowserDeviceOrientation,
): {
  stageWidth: number;
  stageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  shellPadding: number;
  shellHeader: number;
} => {
  if (device.id === 'responsive') {
    return {
      stageWidth: Math.max(hostWidth, 280),
      stageHeight: Math.max(hostHeight, 320),
      viewportWidth: Math.max(hostWidth, 280),
      viewportHeight: Math.max(hostHeight, 320),
      shellPadding: 0,
      shellHeader: 0,
    };
  }

  const availableWidth = Math.max(hostWidth - 48, 280);
  const availableHeight = Math.max(hostHeight - 48, 320);
  const shellPadding = device.category === 'mobile' ? 16 : 12;
  const shellHeader = device.category === 'mobile' ? 22 : 18;
  const requestedWidth = orientation === 'landscape' && device.width && device.height ? device.height : device.width;
  const requestedHeight = orientation === 'landscape' && device.width && device.height ? device.width : device.height;
  const maxViewportWidth = Math.max(240, availableWidth - shellPadding * 2);
  const maxViewportHeight = Math.max(260, availableHeight - shellPadding * 2 - shellHeader);
  const viewportWidth = Math.min(requestedWidth ?? maxViewportWidth, maxViewportWidth);
  const viewportHeight = Math.min(requestedHeight ?? maxViewportHeight, maxViewportHeight);

  return {
    stageWidth: viewportWidth + shellPadding * 2,
    stageHeight: viewportHeight + shellPadding * 2 + shellHeader,
    viewportWidth,
    viewportHeight,
    shellPadding,
    shellHeader,
  };
};

export const BrowserPane: React.FC<BrowserPaneProps> = ({ workspaceId, sessions, theme }) => {
  const previewShellRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const loadStartRef = useRef<number | null>(null);
  const browserStateByWorkspace = useAppStore((state) => state.browserStateByWorkspace);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const currentWorkspace = useAppStore((state) => state.currentWorkspace);
  const ensureBrowserState = useAppStore((state) => state.ensureBrowserState);
  const setBrowserCurrentUrl = useAppStore((state) => state.setBrowserCurrentUrl);
  const setBrowserDraftUrl = useAppStore((state) => state.setBrowserDraftUrl);
  const setBrowserLoading = useAppStore((state) => state.setBrowserLoading);
  const setBrowserInspectModeState = useAppStore((state) => state.setBrowserInspectMode);
  const setBrowserZoomFactor = useAppStore((state) => state.setBrowserZoomFactor);
  const setBrowserDeviceId = useAppStore((state) => state.setBrowserDeviceId);
  const setBrowserDeviceOrientation = useAppStore((state) => state.setBrowserDeviceOrientation);
  const setBrowserSelectedElement = useAppStore((state) => state.setBrowserSelectedElement);
  const setBrowserPrompt = useAppStore((state) => state.setBrowserPrompt);
  const setBrowserTargetSession = useAppStore((state) => state.setBrowserTargetSession);
  const clearBrowserSelection = useAppStore((state) => state.clearBrowserSelection);
  const browserState = browserStateByWorkspace[workspaceId];
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nativeBrowserReady, setNativeBrowserReady] = useState(false);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const [pageTitle, setPageTitle] = useState('');
  const [historyLength, setHistoryLength] = useState(1);
  const [lastLoadDurationMs, setLastLoadDurationMs] = useState<number | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const {
    ensureBrowserView,
    navigateBrowserView,
    reloadBrowserView,
    setBrowserViewVisibility,
    setBrowserInspectMode,
    setBrowserZoom,
    goBackBrowserView,
    goForwardBrowserView,
    exportBrowserSnapshot,
  } = useBrowser();
  const { writeToTerminal } = useTerminal();

  const effectiveState = browserState ?? {
    currentUrl: FALLBACK_URL,
    draftUrl: FALLBACK_URL,
    isLoading: false,
    inspectMode: false,
    zoomFactor: 1,
    deviceId: 'responsive' as const,
    deviceOrientation: 'portrait' as const,
    selectedElement: null,
    prompt: '',
    targetSessionId: null,
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

  const defaultSessionId = useMemo(() => {
    if (activeSessionId && targetableSessions.some((session) => session.id === activeSessionId)) {
      return activeSessionId;
    }
    return targetableSessions[0]?.id ?? null;
  }, [activeSessionId, targetableSessions]);

  const activeDevice = useMemo(
    () => BROWSER_DEVICES.find((device) => device.id === effectiveState.deviceId) ?? BROWSER_DEVICES[0],
    [effectiveState.deviceId],
  );

  const viewportMetrics = useMemo(
    () => getViewportMetrics(hostSize.width, hostSize.height, activeDevice, effectiveState.deviceOrientation),
    [activeDevice, effectiveState.deviceOrientation, hostSize.height, hostSize.width],
  );

  useEffect(() => {
    ensureBrowserState(workspaceId);
  }, [ensureBrowserState, workspaceId]);

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
  }, []);

  const syncBrowserBounds = useCallback(async () => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return;

    const bounds = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };

    const url = resolvedCurrentUrl;

    try {
      await ensureBrowserView(workspaceId, url, bounds);
      await setBrowserZoom(workspaceId, effectiveState.zoomFactor);
      setNativeBrowserReady(true);
      setError(null);
    } catch (err) {
      setNativeBrowserReady(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [
    effectiveState.zoomFactor,
    ensureBrowserView,
    resolvedCurrentUrl,
    setBrowserZoom,
    workspaceId,
  ]);

  useEffect(() => {
    let frame = 0;

    const scheduleSync = () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        void syncBrowserBounds();
      });
    };

    scheduleSync();

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
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
  ]);

  useEffect(() => {
    return () => {
      setNativeBrowserReady(false);
      void setBrowserViewVisibility(workspaceId, false).catch(() => undefined);
    };
  }, [setBrowserViewVisibility, workspaceId]);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [
      listen<BrowserPageLoadPayload>('browser-page-load', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;

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
      }),
      listen<BrowserPageStatePayload>('browser-page-state', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        setPageTitle(event.payload.title || '');
        setHistoryLength(event.payload.historyLength);
        setBrowserCurrentUrl(workspaceId, event.payload.url);
      }),
      listen<BrowserInspectModePayload>('browser-inspect-mode-changed', (event) => {
        if (event.payload.workspaceId !== workspaceId) return;
        setBrowserInspectModeState(workspaceId, event.payload.enabled);
      }),
      listen<BrowserSnapshotPayload>('browser-snapshot-ready', async (event) => {
        if (event.payload.workspaceId !== workspaceId || !currentWorkspace?.path) return;

        const stamp = buildExportStamp();
        const slug = sanitizeFileSegment(event.payload.title || pageTitle || activeDevice.label);
        const baseDir = `${currentWorkspace.path}\\.yzpzcode\\browser-exports`;
        const htmlPath = `${baseDir}\\${stamp}-${slug}.html`;
        const jsonPath = `${baseDir}\\${stamp}-${slug}.json`;
        const metadata = {
          exportedAt: new Date().toISOString(),
          workspaceId,
          pageTitle: event.payload.title || pageTitle,
          url: event.payload.url,
          zoomFactor: effectiveState.zoomFactor,
          deviceId: effectiveState.deviceId,
          deviceLabel: activeDevice.label,
          orientation: effectiveState.deviceOrientation,
          viewport: {
            width: viewportMetrics.viewportWidth,
            height: viewportMetrics.viewportHeight,
          },
          selectedElement: effectiveState.selectedElement,
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
        setBrowserSelectedElement(workspaceId, event.payload.element);
        if (!effectiveState.targetSessionId && defaultSessionId) {
          setBrowserTargetSession(workspaceId, defaultSessionId);
        }
      }),
    ];

    return () => {
      void Promise.all(unlisteners).then((resolved) => {
        resolved.forEach((unlisten) => unlisten());
      });
    };
  }, [
    activeDevice.label,
    currentWorkspace?.path,
    defaultSessionId,
    effectiveState.deviceId,
    effectiveState.deviceOrientation,
    effectiveState.selectedElement,
    effectiveState.targetSessionId,
    effectiveState.zoomFactor,
    pageTitle,
    setBrowserCurrentUrl,
    setBrowserInspectModeState,
    setBrowserLoading,
    setBrowserSelectedElement,
    setBrowserTargetSession,
    viewportMetrics.viewportHeight,
    viewportMetrics.viewportWidth,
    workspaceId,
  ]);

  useEffect(() => {
    if (!nativeBrowserReady) return;

    void setBrowserZoom(workspaceId, effectiveState.zoomFactor).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [effectiveState.zoomFactor, nativeBrowserReady, setBrowserZoom, workspaceId]);

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

  const handleSubmitPrompt = useCallback(async () => {
    if (!effectiveState.selectedElement) return;

    const targetSessionId = effectiveState.targetSessionId ?? defaultSessionId;
    if (!targetSessionId) {
      setError('No terminal session is available for prompt handoff.');
      return;
    }

    if (!effectiveState.prompt.trim()) {
      setError('Enter a prompt before sending it to a terminal agent.');
      return;
    }

    const formattedPrompt = formatElementPrompt(
      effectiveState.selectedElement,
      effectiveState.prompt,
      activeDevice.label,
      effectiveState.zoomFactor,
    );

    setIsSubmitting(true);
    try {
      await writeToTerminal(targetSessionId, buildBracketedPasteInput(formattedPrompt));
      setBrowserPrompt(workspaceId, '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeDevice.label,
    defaultSessionId,
    effectiveState.prompt,
    effectiveState.selectedElement,
    effectiveState.targetSessionId,
    effectiveState.zoomFactor,
    setBrowserPrompt,
    workspaceId,
    writeToTerminal,
  ]);

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

  const isLight = theme === 'light';
  const previewModeLabel = activeDevice.id === 'responsive'
    ? 'Adaptive canvas'
    : `${viewportMetrics.viewportWidth} × ${viewportMetrics.viewportHeight}`;
  const selectedElement = effectiveState.selectedElement;
  const selectedElementSelectors = selectedElement?.selectors.slice(0, 3) ?? [];
  const selectedElementTitle = selectedElement?.pageTitle || pageTitle || 'Untitled page';
  const selectedElementSummary = selectedElement?.textContent || 'No visible text in this element.';
  const selectedElementAttributeCount = selectedElement ? Object.keys(selectedElement.attributes).length : 0;

  return (
    <div className="h-full w-full">
      <div className={`h-full w-full border overflow-hidden flex flex-col ${
        isLight
          ? 'border-zinc-700 bg-[linear-gradient(180deg,rgba(39,39,42,0.98),rgba(24,24,27,0.94))]'
          : 'border-zinc-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,9,11,0.95))]'
      }`}>
        <div className={`shrink-0 border-b px-4 py-3.5 ${
          isLight ? 'border-zinc-700 bg-zinc-900/92' : 'border-zinc-800/80 bg-zinc-950/82'
        }`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full rounded-full ${effectiveState.isLoading ? 'animate-ping bg-emerald-400/45' : 'bg-zinc-500/30'}`} />
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${effectiveState.isLoading ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.32em] text-zinc-300">Browser Lab</div>
                <div className="text-[10px] text-zinc-500">Embedded preview with device testing and DOM targeting</div>
              </div>
            </div>

            <div className="min-w-[260px] flex-1 flex items-center gap-2 rounded-2xl border border-zinc-800 bg-black/35 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-1.5 px-2 shrink-0">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/90" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300/90" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
              </div>
              <input
                value={resolvedDraftUrl}
                onChange={(event) => setBrowserDraftUrl(workspaceId, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleNavigate();
                  }
                }}
                className="flex-1 bg-transparent text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600"
                placeholder={FALLBACK_URL}
              />
              <button
                onClick={() => void handleNavigate()}
                title="Open URL"
                aria-label="Open URL"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-700/60 bg-emerald-500/10 text-emerald-300 transition-colors hover:bg-emerald-500/18 cursor-pointer"
              >
                <span className="sr-only">Open URL</span>
                <BrowserToolbarIcon name="open" />
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <motion.button
                type="button"
                onClick={() => void handleToggleInspect()}
                title={effectiveState.inspectMode ? 'Stop inspecting' : 'Inspect element'}
                aria-label={effectiveState.inspectMode ? 'Stop inspecting' : 'Inspect element'}
                aria-pressed={effectiveState.inspectMode}
                whileHover={{ y: -1, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className={`relative isolate flex h-11 min-w-[164px] items-center justify-between overflow-hidden rounded-[22px] border border-transparent px-4 py-2 text-left shadow-[0_16px_35px_rgba(0,0,0,0.28)] cursor-pointer ${
                  effectiveState.inspectMode
                    ? 'text-white shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_0_34px_rgba(59,130,246,0.24)]'
                    : 'text-zinc-50 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_36px_rgba(0,0,0,0.3)]'
                }`}
              >
                <div className="absolute inset-0 rounded-[22px] bg-[linear-gradient(180deg,rgba(12,15,24,0.97),rgba(7,10,16,0.98))]" />
                <motion.div
                  aria-hidden="true"
                  className="absolute inset-[-44%] rounded-full bg-[conic-gradient(from_180deg,#4285F4,#34A853,#FBBC05,#A142F4,#4285F4)] blur-2xl opacity-80"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                />
                <div className="absolute inset-px rounded-[21px] bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.1),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(8,11,18,0.97))]" />
                <div className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <span className="relative flex items-center gap-3">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-white/95 ${
                    effectiveState.inspectMode
                      ? 'border-white/15 bg-white/10 shadow-[0_0_18px_rgba(59,130,246,0.2)]'
                      : 'border-white/10 bg-white/5'
                  }`}>
                    <BrowserToolbarIcon name="inspect" />
                  </span>
                  <span className="flex min-w-0 flex-col leading-none">
                    <span className="text-[10px] font-black uppercase tracking-[0.28em]">Inspect</span>
                    <span className="mt-1 text-[9px] uppercase tracking-[0.24em] text-zinc-300/70">Gemini glow</span>
                  </span>
                </span>
                <span className={`relative inline-flex h-5 items-center rounded-full border px-2 text-[9px] font-black uppercase tracking-[0.18em] ${
                  effectiveState.inspectMode
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-white/10 bg-white/5 text-zinc-200'
                }`}>
                  Live
                </span>
              </motion.button>
              <button
                onClick={() => void handleGoBack()}
                disabled={historyLength <= 1}
                title="Back"
                aria-label="Back"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/75 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <span className="sr-only">Back</span>
                <BrowserToolbarIcon name="back" />
              </button>
              <button
                onClick={() => void handleGoForward()}
                title="Forward"
                aria-label="Forward"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/75 text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                <span className="sr-only">Forward</span>
                <BrowserToolbarIcon name="forward" />
              </button>
              <button
                onClick={() => void handleCopyUrl()}
                title="Copy URL"
                aria-label="Copy URL"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/75 text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                <span className="sr-only">Copy URL</span>
                <BrowserToolbarIcon name="copy" />
              </button>
              <button
                onClick={() => void handleOpenExternal()}
                title="Open externally"
                aria-label="Open externally"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/75 text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                <span className="sr-only">Open externally</span>
                <BrowserToolbarIcon name="external" />
              </button>
              <button
                onClick={() => void handleReload()}
                title="Reload"
                aria-label="Reload"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/75 text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                <span className="sr-only">Reload</span>
                <BrowserToolbarIcon name="reload" />
              </button>
              <button
                onClick={() => void handleExportSnapshot()}
                title="Export snapshot"
                aria-label="Export snapshot"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/75 text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                <span className="sr-only">Export snapshot</span>
                <BrowserToolbarIcon name="export" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={effectiveState.deviceId}
              onChange={(event) => setBrowserDeviceId(workspaceId, event.target.value as BrowserDevicePreset['id'])}
              className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-2 text-[11px] text-zinc-100 outline-none"
            >
              {BROWSER_DEVICES.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>

            <button
              onClick={handleRotateDevice}
              disabled={activeDevice.id === 'responsive'}
              title="Rotate device"
              aria-label="Rotate device"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/75 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <span className="sr-only">Rotate device</span>
              <BrowserToolbarIcon name="rotate" />
            </button>

            <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/75 p-1">
              <button
                onClick={() => handleZoomChange(getNextZoom(effectiveState.zoomFactor, -1))}
                className="rounded-lg px-2 py-1 text-[11px] font-black text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                -
              </button>
              <button
                onClick={() => handleZoomChange(1)}
                className="rounded-lg px-3 py-1 text-[11px] font-black text-zinc-100 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                {Math.round(effectiveState.zoomFactor * 100)}%
              </button>
              <button
                onClick={() => handleZoomChange(getNextZoom(effectiveState.zoomFactor, 1))}
                className="rounded-lg px-2 py-1 text-[11px] font-black text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                +
              </button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Viewport {viewportMetrics.viewportWidth} x {viewportMetrics.viewportHeight}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {previewModeLabel}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Selected {effectiveState.selectedElement ? (effectiveState.selectedElement.selectors[0] ?? `<${effectiveState.selectedElement.tagName}>`) : 'none'}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800/80 bg-black/18 px-3 py-2 text-[10px] uppercase tracking-[0.18em]">
            <div className="flex flex-wrap items-center gap-3 text-zinc-500">
              <span>Title {pageTitle || 'Untitled page'}</span>
              <span>URL {resolvedCurrentUrl}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-zinc-400">
              <span>Load {lastLoadDurationMs !== null ? `${lastLoadDurationMs}ms` : '...'}</span>
              <span>History {historyLength}</span>
              <span>{effectiveState.deviceOrientation}</span>
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-2xl border border-rose-900/70 bg-rose-950/25 px-3 py-2 text-[11px] text-rose-300">
              {error}
            </div>
          )}

          {exportMessage && (
            <div className="mt-3 rounded-2xl border border-emerald-900/70 bg-emerald-950/25 px-3 py-2 text-[11px] text-emerald-300">
              {exportMessage}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 flex">
          <div className={`relative min-w-0 flex-1 ${
            effectiveState.selectedElement ? 'border-r border-zinc-800/80' : ''
          }`}>
            <div
              ref={previewShellRef}
              className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_28%),linear-gradient(180deg,rgba(9,9,11,0.12),rgba(9,9,11,0.58))]"
            >
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px]" />
              {activeDevice.id === 'responsive' ? (
                <div
                  ref={previewViewportRef}
                  className="absolute inset-0 overflow-hidden rounded-none bg-zinc-900/40"
                  style={{
                    width: viewportMetrics.viewportWidth,
                    height: viewportMetrics.viewportHeight,
                  }}
                />
              ) : (
                <div className="relative flex h-full items-center justify-center p-6">
                  <div
                    className={`relative transition-all duration-200 ${
                      activeDevice.category === 'mobile'
                        ? 'rounded-[36px] border border-zinc-700/70 bg-zinc-950/92 shadow-[0_35px_90px_rgba(0,0,0,0.55)]'
                        : 'rounded-[26px] border border-zinc-700/70 bg-zinc-950/88 shadow-[0_28px_80px_rgba(0,0,0,0.45)]'
                    }`}
                    style={{
                      width: viewportMetrics.stageWidth,
                      height: viewportMetrics.stageHeight,
                      padding: viewportMetrics.shellPadding,
                      paddingTop: viewportMetrics.shellPadding + viewportMetrics.shellHeader,
                    }}
                  >
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      <span>{activeDevice.label}</span>
                      <span>{viewportMetrics.viewportWidth} x {viewportMetrics.viewportHeight}</span>
                    </div>

                    {activeDevice.category === 'mobile' && (
                      <div className="absolute left-1/2 top-3 h-1.5 w-20 -translate-x-1/2 rounded-full bg-zinc-700/90" />
                    )}

                    <div
                      ref={previewViewportRef}
                      className={`relative overflow-hidden ${
                        activeDevice.category === 'mobile'
                          ? 'rounded-[28px] bg-zinc-900/40'
                          : 'rounded-[18px] bg-zinc-900/40'
                      }`}
                      style={{
                        width: viewportMetrics.viewportWidth,
                        height: viewportMetrics.viewportHeight,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {!nativeBrowserReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="rounded-3xl border border-zinc-800/70 bg-black/35 px-6 py-5 text-center backdrop-blur-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-300">Booting Preview</div>
                  <div className="mt-2 text-[11px] text-zinc-500">Waiting for the embedded browser surface.</div>
                </div>
              </div>
            )}
          </div>

          {selectedElement && (
            <motion.aside
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="w-[400px] shrink-0 border-l border-white/5 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.10),transparent_30%),linear-gradient(180deg,rgba(8,10,20,0.98),rgba(12,15,26,0.96))] p-3 text-zinc-100"
            >
              <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,15,28,0.96),rgba(6,8,15,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                <div className="relative border-b border-white/8 px-5 py-4">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 via-emerald-400/45 to-transparent" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em] text-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.75)]" />
                        Targeted element
                      </div>
                      <div className="mt-3 text-[10px] uppercase tracking-[0.32em] text-zinc-500">Element Handoff</div>
                      <div className="mt-1 text-[17px] font-semibold tracking-tight text-zinc-50">
                        Route the exact node into an agent.
                      </div>
                    </div>
                    <button
                      onClick={() => clearBrowserSelection(workspaceId)}
                      className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.24em] text-zinc-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
                          Focused node
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">Tag</div>
                            <div className="mt-1 text-sm font-black uppercase tracking-[0.2em] text-zinc-50">
                              {selectedElement.tagName}
                              {selectedElement.id ? `#${selectedElement.id}` : ''}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">Page</div>
                            <div className="mt-1 max-w-[140px] truncate text-[12px] font-medium text-zinc-100">
                              {selectedElementTitle}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">Bounds</div>
                            <div className="mt-1 text-[12px] font-semibold text-zinc-100">
                              {selectedElement.rect.width} × {selectedElement.rect.height}
                            </div>
                          </div>
                        </div>
                        <p className="mt-3 max-h-[5.75rem] overflow-hidden text-[13px] leading-6 text-zinc-300">
                          {selectedElementSummary}
                        </p>
                      </div>
                      <div className="shrink-0 rounded-2xl border border-white/10 bg-black/25 p-3 text-right">
                        <div className="text-[9px] uppercase tracking-[0.24em] text-zinc-500">Selectors</div>
                        <div className="mt-1 text-2xl font-black text-white">{selectedElement.selectors.length}</div>
                        <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                          {selectedElementAttributeCount} attrs
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">Viewport</div>
                        <div className="mt-1 text-[12px] font-semibold text-zinc-100">
                          {selectedElement.viewport.width} × {selectedElement.viewport.height}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">URL</div>
                        <div className="mt-1 truncate text-[12px] font-medium text-zinc-100">
                          {selectedElement.pageUrl}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">Target</div>
                        <div className="mt-1 text-[12px] font-semibold text-zinc-100">
                          Ready to hand off
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.28em] text-zinc-500">Selectors</div>
                        <div className="mt-1 text-[12px] text-zinc-400">Use the most stable hook first.</div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-zinc-400">
                        {selectedElementAttributeCount} attrs
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {selectedElementSelectors.map((selector, index) => (
                        <div key={selector} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-300">
                            {index === 0 ? 'P' : `F${index}`}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">
                              {index === 0 ? 'Primary selector' : `Fallback ${index}`}
                            </div>
                            <div className="mt-1 break-all font-mono text-[11px] leading-5 text-zinc-200">
                              {selector}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <label className="mb-2 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.28em] text-zinc-500">
                      <span>Destination Agent</span>
                      <span className="text-zinc-600">{targetableSessions.length} available</span>
                    </label>
                    <select
                      value={effectiveState.targetSessionId ?? ''}
                      onChange={(event) => setBrowserTargetSession(workspaceId, event.target.value || null)}
                      className="w-full rounded-2xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-[12px] text-zinc-100 outline-none transition-colors focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/10"
                    >
                      {targetableSessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {sessionDisplayName(session)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[10px] leading-5 text-zinc-500">
                      Handoff goes straight into the chosen terminal context.
                    </p>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.28em] text-zinc-500">
                      Instruction
                    </label>
                    <textarea
                      value={effectiveState.prompt}
                      onChange={(event) => setBrowserPrompt(workspaceId, event.target.value)}
                      className="min-h-[180px] w-full resize-none rounded-[22px] border border-white/10 bg-zinc-950/80 px-4 py-3 text-[12px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 transition-colors focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/10"
                      placeholder="Example: tighten the spacing, improve the CTA hierarchy, and keep the same visual language."
                    />
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div className="max-w-[240px] text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Prompt includes selectors, bounds, viewport, and current preview mode.
                    </div>
                    <button
                      onClick={() => void handleSubmitPrompt()}
                      disabled={isSubmitting || targetableSessions.length === 0}
                      className="group relative inline-flex items-center justify-center overflow-hidden rounded-2xl border border-emerald-500/25 bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(59,130,246,0.16),rgba(168,85,247,0.14))] px-5 py-3 text-[10px] font-black uppercase tracking-[0.26em] text-emerald-200 transition-transform hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(16,185,129,0.15)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                    >
                      <span className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_45%)] opacity-0 transition-opacity group-hover:opacity-100" />
                      <span className="relative">{isSubmitting ? 'Sending' : 'Send to Agent'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </div>
      </div>
    </div>
  );
};
