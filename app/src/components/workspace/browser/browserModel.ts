import type {
  BrowserDeviceId,
  BrowserDeviceOrientation,
  BrowserDevicePreset,
  BrowserSelectedElement,
  BrowserUiIntegrationMode,
  BrowserViewportSize,
  CapturedUiElementReference,
  TerminalSession,
} from '../../../types';

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Ports yzpzcode may serve on itself (8745 = the Tauri devUrl) plus common
 *  framework dev-server ports. Probing these over HTTP lets the start page and
 *  the Localhost menu find a server running in *any* terminal. */
export const DEV_SERVER_PROBE_PORTS = [8745, 5173, 5174, 4173, 3000, 3001, 8080, 8000, 5000, 4321, 4200, 6006, 1420, 8888];

export const BROWSER_DEVICES: BrowserDevicePreset[] = [
  { id: 'responsive', label: 'Responsive', width: null, height: null, category: 'responsive' },
  { id: 'laptop', label: 'Laptop', width: 1280, height: 800, category: 'desktop' },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900, category: 'desktop' },
  { id: 'desktop-hd', label: 'Full HD', width: 1920, height: 1080, category: 'desktop' },
  { id: 'ipad-mini', label: 'iPad Mini', width: 744, height: 1133, category: 'tablet' },
  { id: 'ipad', label: 'iPad Air', width: 820, height: 1180, category: 'tablet' },
  { id: 'ipad-pro', label: 'iPad Pro 12.9"', width: 1024, height: 1366, category: 'tablet' },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, category: 'mobile' },
  { id: 'iphone-15-pro', label: 'iPhone 15 Pro', width: 393, height: 852, category: 'mobile' },
  { id: 'iphone-15-pro-max', label: 'iPhone 15 Pro Max', width: 430, height: 932, category: 'mobile' },
  { id: 'pixel-8', label: 'Pixel 8', width: 412, height: 915, category: 'mobile' },
  { id: 'galaxy-s24', label: 'Galaxy S24', width: 360, height: 780, category: 'mobile' },
  { id: 'custom', label: 'Custom', width: null, height: null, category: 'custom' },
];

export const DEVICE_GROUPS: { label: string; category: BrowserDevicePreset['category'] }[] = [
  { label: 'Desktop', category: 'desktop' },
  { label: 'Tablet', category: 'tablet' },
  { label: 'Mobile', category: 'mobile' },
];

/** Unknown ids (e.g. persisted from an older version) fall back to Responsive. */
export const findDevice = (id: BrowserDeviceId | string): BrowserDevicePreset =>
  BROWSER_DEVICES.find((device) => device.id === id) ?? BROWSER_DEVICES[0];

export const clampZoom = (value: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));

export const getNextZoom = (current: number, direction: -1 | 1): number => {
  const next = direction > 0
    ? ZOOM_STEPS.find((value) => value > current + 0.001)
    : [...ZOOM_STEPS].reverse().find((value) => value < current - 0.001);
  return next ?? current;
};

export type DeviceFrameKind = 'responsive' | 'desktop' | 'tablet' | 'phone';

/** Space reserved around an emulated device: stage padding + caption row. */
const STAGE_PADDING = 24;
const CAPTION_HEIGHT = 30;
/**
 * The native webview is a plain rectangle drawn above the DOM and cannot be
 * clipped, so the frame's rounded corner must stay outside the screen's
 * square corner: (radius - bezel) * √2 <= radius, i.e. radius <= bezel * 3.41.
 * The radii below keep a few pixels of bezel visible across every corner.
 */
const FRAME: Record<DeviceFrameKind, { bezel: number; radius: number }> = {
  responsive: { bezel: 0, radius: 0 },
  desktop: { bezel: 1, radius: 2 },
  tablet: { bezel: 12, radius: 20 },
  phone: { bezel: 12, radius: 26 },
};

export interface ViewportMetrics {
  kind: DeviceFrameKind;
  /** On-screen size of the native webview, in app CSS pixels. */
  viewportWidth: number;
  viewportHeight: number;
  /** Size the page lays out against (what `window.innerWidth` reports). */
  cssWidth: number;
  cssHeight: number;
  /** Zoom applied to the native webview. */
  webviewZoom: number;
  /** True when a device preset was scaled down to fit the pane. */
  fitted: boolean;
  bezel: number;
  /** Outer corner radius of the device frame. */
  radius: number;
}

/**
 * Emulating a device means the page must lay out at the device's CSS width.
 * The webview is drawn at `size × scale` and zoomed by the same `scale`, so
 * `innerWidth` equals the device width at any on-screen size. The requested
 * zoom is capped by what fits, because a native webview cannot be clipped.
 */
export const getViewportMetrics = (
  hostWidth: number,
  hostHeight: number,
  device: BrowserDevicePreset,
  orientation: BrowserDeviceOrientation,
  zoom: number,
  customViewport: BrowserViewportSize,
): ViewportMetrics => {
  if (device.category === 'responsive') {
    const width = Math.max(hostWidth, 280);
    const height = Math.max(hostHeight, 240);
    return {
      kind: 'responsive',
      viewportWidth: width,
      viewportHeight: height,
      cssWidth: Math.round(width / zoom),
      cssHeight: Math.round(height / zoom),
      webviewZoom: zoom,
      fitted: false,
      bezel: 0,
      radius: 0,
    };
  }

  const kind: DeviceFrameKind = device.category === 'mobile'
    ? 'phone'
    : device.category === 'tablet'
      ? 'tablet'
      : 'desktop';
  const { bezel, radius } = FRAME[kind];
  const base = device.category === 'custom'
    ? customViewport
    : { width: device.width ?? 1024, height: device.height ?? 768 };
  const landscape = orientation === 'landscape' && device.category !== 'custom';
  const cssWidth = landscape ? base.height : base.width;
  const cssHeight = landscape ? base.width : base.height;

  const availableWidth = Math.max(hostWidth - STAGE_PADDING * 2 - bezel * 2, 80);
  const availableHeight = Math.max(hostHeight - STAGE_PADDING * 2 - CAPTION_HEIGHT - bezel * 2, 80);
  const fit = Math.min(availableWidth / cssWidth, availableHeight / cssHeight);
  const scale = Math.max(0.1, Math.floor(Math.min(zoom, fit) * 100) / 100);

  return {
    kind,
    viewportWidth: Math.max(80, Math.round(cssWidth * scale)),
    viewportHeight: Math.max(80, Math.round(cssHeight * scale)),
    cssWidth,
    cssHeight,
    webviewZoom: scale,
    fitted: zoom > fit + 0.005,
    bezel,
    radius,
  };
};

const sanitizeFileSegment = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'snapshot';

const buildExportStamp = (now = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

/** Snapshot paths use the workspace's own separator so export works on
 *  macOS and Linux as well as Windows. */
export const buildSnapshotPaths = (workspacePath: string, title: string) => {
  const separator = workspacePath.includes('\\') ? '\\' : '/';
  const root = workspacePath.replace(/[\\/]+$/, '');
  const baseDir = [root, '.yzpzcode', 'browser-exports'].join(separator);
  const name = `${buildExportStamp()}-${sanitizeFileSegment(title)}`;
  return {
    baseDir,
    htmlPath: `${baseDir}${separator}${name}.html`,
    jsonPath: `${baseDir}${separator}${name}.json`,
  };
};

export const sessionDisplayName = (session: TerminalSession): string =>
  session.agent ? `TTY ${session.index + 1} · ${session.agent}` : `TTY ${session.index + 1} · shell`;

/** Best-effort check that an HTTP server is listening. A no-cors fetch needs
 *  no CORS headers: resolving means the port speaks HTTP, a network failure
 *  or the abort timeout means nothing is there. */
export const isLocalPortResponding = async (url: string, timeoutMs = 800): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { mode: 'no-cors', signal: controller.signal, cache: 'no-store' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export const getLocalhostLabel = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `localhost${parsed.port ? `:${parsed.port}` : ''}`;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
};

export const formatUiReferencePrompt = (
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

const TERMINAL_SUBMIT_DELAY_MS = 32;

/** Keep the submit key in a separate PTY write. Several full-screen CLIs
 *  finish their bracketed-paste callback after the read loop returns and
 *  otherwise consume an adjacent CR without submitting the prompt. */
export const submitBracketedPaste = async (
  sessionId: string,
  prompt: string,
  writeToTerminal: (targetSessionId: string, input: string) => Promise<void>,
): Promise<void> => {
  await writeToTerminal(sessionId, '\x1b[200~');
  await writeToTerminal(sessionId, prompt);
  await writeToTerminal(sessionId, '\x1b[201~');
  await new Promise<void>((resolve) => window.setTimeout(resolve, TERMINAL_SUBMIT_DELAY_MS));
  await writeToTerminal(sessionId, '\r');
};
