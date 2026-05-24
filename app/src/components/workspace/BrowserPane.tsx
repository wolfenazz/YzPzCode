import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const availableWidth = Math.max(hostWidth - 48, 280);
  const availableHeight = Math.max(hostHeight - 48, 320);

  if (device.id === 'responsive') {
    return {
      stageWidth: availableWidth,
      stageHeight: availableHeight,
      viewportWidth: availableWidth,
      viewportHeight: availableHeight,
      shellPadding: 0,
      shellHeader: 0,
    };
  }

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
      await writeToTerminal(targetSessionId, `${formattedPrompt}\n`);
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

  return (
    <div className="h-full p-2.5">
      <div className={`h-full rounded-[28px] border overflow-hidden flex flex-col ${
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
                className="rounded-xl border border-emerald-700/60 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300 transition-colors hover:bg-emerald-500/18 cursor-pointer"
              >
                Open
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => void handleGoBack()}
                disabled={historyLength <= 1}
                className="rounded-xl border border-zinc-800 bg-zinc-900/75 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={() => void handleGoForward()}
                className="rounded-xl border border-zinc-800 bg-zinc-900/75 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                Forward
              </button>
              <button
                onClick={() => void handleCopyUrl()}
                className="rounded-xl border border-zinc-800 bg-zinc-900/75 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                Copy URL
              </button>
              <button
                onClick={() => void handleOpenExternal()}
                className="rounded-xl border border-zinc-800 bg-zinc-900/75 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                External
              </button>
              <button
                onClick={() => void handleReload()}
                className="rounded-xl border border-zinc-800 bg-zinc-900/75 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                Reload
              </button>
              <button
                onClick={() => void handleExportSnapshot()}
                className="rounded-xl border border-zinc-800 bg-zinc-900/75 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:bg-zinc-800 cursor-pointer"
              >
                Export
              </button>
              <button
                onClick={() => void handleToggleInspect()}
                className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-colors cursor-pointer ${
                  effectiveState.inspectMode
                    ? 'border-emerald-500/70 bg-emerald-500/12 text-emerald-300'
                    : 'border-zinc-800 bg-zinc-900/75 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {effectiveState.inspectMode ? 'Inspecting' : 'Inspect'}
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
              className="rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              Rotate
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
              <div className="relative flex h-full items-center justify-center p-6">
                <div
                  className={`relative transition-all duration-200 ${
                    activeDevice.id === 'responsive'
                      ? ''
                      : activeDevice.category === 'mobile'
                        ? 'rounded-[36px] border border-zinc-700/70 bg-zinc-950/92 shadow-[0_35px_90px_rgba(0,0,0,0.55)]'
                        : 'rounded-[26px] border border-zinc-700/70 bg-zinc-950/88 shadow-[0_28px_80px_rgba(0,0,0,0.45)]'
                  }`}
                  style={{
                    width: viewportMetrics.stageWidth,
                    height: viewportMetrics.stageHeight,
                    padding: activeDevice.id === 'responsive' ? 0 : viewportMetrics.shellPadding,
                    paddingTop: activeDevice.id === 'responsive'
                      ? 0
                      : viewportMetrics.shellPadding + viewportMetrics.shellHeader,
                  }}
                >
                  {activeDevice.id !== 'responsive' && (
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      <span>{activeDevice.label}</span>
                      <span>{viewportMetrics.viewportWidth} x {viewportMetrics.viewportHeight}</span>
                    </div>
                  )}

                  {activeDevice.category === 'mobile' && activeDevice.id !== 'responsive' && (
                    <div className="absolute left-1/2 top-3 h-1.5 w-20 -translate-x-1/2 rounded-full bg-zinc-700/90" />
                  )}

                  <div
                    ref={previewViewportRef}
                    className={`relative overflow-hidden ${
                      activeDevice.id === 'responsive'
                        ? 'h-full w-full rounded-none'
                        : activeDevice.category === 'mobile'
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

          {effectiveState.selectedElement && (
            <aside className="w-[390px] shrink-0 bg-[linear-gradient(180deg,rgba(10,10,12,0.98),rgba(17,24,39,0.96))] p-4 text-zinc-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">Element Handoff</div>
                  <div className="mt-2 text-xs text-zinc-400">Target the exact UI node, describe the change, then send the structured prompt into one of the running agents.</div>
                </div>
                <button
                  onClick={() => clearBrowserSelection(workspaceId)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/75 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="mt-4 rounded-3xl border border-zinc-800/80 bg-black/30 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-300">
                  {effectiveState.selectedElement.tagName}
                  {effectiveState.selectedElement.id ? `#${effectiveState.selectedElement.id}` : ''}
                </div>
                <div className="mt-2 text-[11px] leading-5 text-zinc-400">
                  {effectiveState.selectedElement.textContent || 'No visible text in this element.'}
                </div>
                <div className="mt-3 space-y-2">
                  {effectiveState.selectedElement.selectors.slice(0, 3).map((selector) => (
                    <div key={selector} className="rounded-2xl border border-zinc-800/60 bg-zinc-950/65 px-3 py-2 text-[10px] text-zinc-300 break-all">
                      {selector}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                  Destination Agent
                </label>
                <select
                  value={effectiveState.targetSessionId ?? ''}
                  onChange={(event) => setBrowserTargetSession(workspaceId, event.target.value || null)}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-[12px] text-zinc-100 outline-none"
                >
                  {targetableSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {sessionDisplayName(session)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex-1">
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                  Instruction
                </label>
                <textarea
                  value={effectiveState.prompt}
                  onChange={(event) => setBrowserPrompt(workspaceId, event.target.value)}
                  className="min-h-[170px] w-full resize-none rounded-[24px] border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-[12px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
                  placeholder="Example: tighten the spacing, improve the CTA hierarchy, and keep the same visual language."
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Prompt includes selectors, bounds, viewport, and current preview mode.
                </div>
                <button
                  onClick={() => void handleSubmitPrompt()}
                  disabled={isSubmitting || targetableSessions.length === 0}
                  className="rounded-2xl border border-emerald-700/70 bg-emerald-500/12 px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300 transition-colors hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Sending' : 'Send to Agent'}
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};
