import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@iconify/react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type {
  BrowserDeviceOrientation,
  BrowserDevicePreset,
  BrowserElementSelectedEventPayload,
  BrowserInspectModePayload,
  BrowserPopoutStatePayload,
  BrowserPreviewChrome,
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
import { useTerminal } from '../../hooks/useTerminal';
import { BrowserTabBar } from './BrowserTabBar';
import { StyleClipboardPanel } from './StyleClipboardPanel';
import { UiReferenceClipboardPanel } from './UiReferenceClipboardPanel';
import { ApplyModeToolbar } from './ApplyModeToolbar';

interface BrowserPaneProps {
  workspaceId: string;
  sessions: TerminalSession[];
  theme: 'dark' | 'light';
}

const FALLBACK_URL = 'https://www.google.com';
const LOCALHOST_URL = 'http://localhost:3000';
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
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

const normalizeBrowserUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'about:blank') return FALLBACK_URL;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
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

interface DeviceFrameDefinition {
  outerWidth: number;
  outerHeight: number;
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
  screenRadius: number;
  contentInsetTop: number;
  contentInsetRight: number;
  contentInsetBottom: number;
  contentInsetLeft: number;
  kind: 'iphone' | 'ipad';
  baseOrientation: BrowserDeviceOrientation;
}

interface DeviceFrameMetrics {
  stageWidth: number;
  stageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  viewportLeft: number;
  viewportTop: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
  shellPadding: number;
  shellHeader: number;
  kind: 'responsive' | 'iphone' | 'ipad';
  screenRadius: number;
  orientation: BrowserDeviceOrientation;
}

const DEVICE_FRAME_DEFINITIONS: Record<'iphone-14-pro' | 'ipad', DeviceFrameDefinition> = {
  'iphone-14-pro': {
    outerWidth: 200,
    outerHeight: 400,
    screenX: 14.08,
    screenY: 12.81,
    screenWidth: 171.98,
    screenHeight: 374.37,
    screenRadius: 24,
    contentInsetTop: 1,
    contentInsetRight: 1,
    contentInsetBottom: 2,
    contentInsetLeft: 1,
    kind: 'iphone',
    baseOrientation: 'portrait',
  },
  ipad: {
    outerWidth: 520,
    outerHeight: 400,
    screenX: 31.37,
    screenY: 28.47,
    screenWidth: 457.25,
    screenHeight: 342.87,
    screenRadius: 14,
    contentInsetTop: 1,
    contentInsetRight: 1,
    contentInsetBottom: 1,
    contentInsetLeft: 1,
    kind: 'ipad',
    baseOrientation: 'landscape',
  },
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

const IPhoneMockupFrame: React.FC<{
  metrics: DeviceFrameMetrics;
  children: React.ReactNode;
}> = ({ metrics, children }) => (
  <div
    className="relative"
    style={{
      width: metrics.stageWidth,
      height: metrics.stageHeight,
    }}
  >
    <div
      className="absolute overflow-hidden bg-zinc-900/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
      style={{
        left: metrics.viewportLeft,
        top: metrics.viewportTop,
        width: metrics.viewportWidth,
        height: metrics.viewportHeight,
        borderRadius: metrics.screenRadius,
      }}
    >
      {children}
    </div>
    <svg
      className="absolute inset-0 h-full w-full pointer-events-none"
      viewBox={`0 0 ${metrics.viewBoxWidth} ${metrics.viewBoxHeight}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      {metrics.orientation === 'portrait' ? (
        <>
          <path
            fill="#303333"
            d="M196.11,128.09c0-.25-.2-.45-.45-.45-.11.04-.37.03-.69,0V36.69c0-17.84-14.46-32.31-32.31-32.31H37.48C19.63,4.39,5.17,18.85,5.17,36.69v48.99c-.3.02-.55.03-.66-.02-.25,0-.45.2-.45.45,0,0,0,17.29,0,17.29-.03.41.5.49,1.11.48v13.63c-.61,0-1.14.08-1.11.48,0,0,0,28.54,0,28.54-.03.42.5.49,1.11.48v7.95c-.61,0-1.14.08-1.11.48,0,0,0,28.54,0,28.54-.03.42.5.49,1.11.48v178.86c0,17.84,14.46,32.31,32.31,32.31h125.2c17.84,0,32.31-14.46,32.31-32.31v-188.87c.32-.02.58-.03.69.04,1.26.1.03-45.94.45-46.38ZM186.07,362.63c0,13.56-10.99,24.56-24.56,24.56H38.64c-13.56,0-24.56-10.99-24.56-24.56V37.37c0-13.56,10.99-24.56,24.56-24.56h122.87c13.56,0,24.56,10.99,24.56,24.56v325.26Z"
          />
          <path
            fill="#000000"
            d="M161.38,7.29H38.78c-16.54,0-29.95,13.41-29.95,29.95v325.52c0,16.54,13.41,29.95,29.95,29.95h122.6c16.54,0,29.95-13.41,29.95-29.95V37.24c0-16.54-13.41-29.95-29.95-29.95ZM186.07,362.57c0,13.6-11.02,24.62-24.62,24.62H38.7c-13.6,0-24.62-11.02-24.62-24.62V37.43c0-13.6,11.02-24.62,24.62-24.62h122.75c13.6,0,24.62,11.02,24.62,24.62v325.14Z"
          />
          <rect x="14.08" y="12.81" width="171.98" height="374.37" rx="24.62" ry="24.62" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.75" />
          <path
            fill="#000000"
            d="M119.61,33.86h-38.93c-10.48-.18-10.5-15.78,0-15.96,0,0,38.93,0,38.93,0,4.41,0,7.98,3.57,7.98,7.98,0,4.41-3.57,7.98-7.98,7.98Z"
          />
          <path fill="#080d4c" d="M118.78,29.21c-4.32.06-4.32-6.73,0-6.66,4.32-.06,4.32,6.73,0,6.66Z" />
        </>
      ) : (
        <g transform="translate(400 0) rotate(90)">
          <path
            fill="#303333"
            d="M196.11,128.09c0-.25-.2-.45-.45-.45-.11.04-.37.03-.69,0V36.69c0-17.84-14.46-32.31-32.31-32.31H37.48C19.63,4.39,5.17,18.85,5.17,36.69v48.99c-.3.02-.55.03-.66-.02-.25,0-.45.2-.45.45,0,0,0,17.29,0,17.29-.03.41.5.49,1.11.48v13.63c-.61,0-1.14.08-1.11.48,0,0,0,28.54,0,28.54-.03.42.5.49,1.11.48v7.95c-.61,0-1.14.08-1.11.48,0,0,0,28.54,0,28.54-.03.42.5.49,1.11.48v178.86c0,17.84,14.46,32.31,32.31,32.31h125.2c17.84,0,32.31-14.46,32.31-32.31v-188.87c.32-.02.58-.03.69.04,1.26.1.03-45.94.45-46.38ZM186.07,362.63c0,13.56-10.99,24.56-24.56,24.56H38.64c-13.56,0-24.56-10.99-24.56-24.56V37.37c0-13.56,10.99-24.56,24.56-24.56h122.87c13.56,0,24.56,10.99,24.56,24.56v325.26Z"
          />
          <path
            fill="#000000"
            d="M161.38,7.29H38.78c-16.54,0-29.95,13.41-29.95,29.95v325.52c0,16.54,13.41,29.95,29.95,29.95h122.6c16.54,0,29.95-13.41,29.95-29.95V37.24c0-16.54-13.41-29.95-29.95-29.95ZM186.07,362.57c0,13.6-11.02,24.62-24.62,24.62H38.7c-13.6,0-24.62-11.02-24.62-24.62V37.43c0-13.6,11.02-24.62,24.62-24.62h122.75c13.6,0,24.62,11.02,24.62,24.62v325.14Z"
          />
          <rect x="14.08" y="12.81" width="171.98" height="374.37" rx="24.62" ry="24.62" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.75" />
          <path
            fill="#000000"
            d="M119.61,33.86h-38.93c-10.48-.18-10.5-15.78,0-15.96,0,0,38.93,0,38.93,0,4.41,0,7.98,3.57,7.98,7.98,0,4.41-3.57,7.98-7.98,7.98Z"
          />
          <path fill="#080d4c" d="M118.78,29.21c-4.32.06-4.32-6.73,0-6.66,4.32-.06,4.32,6.73,0,6.66Z" />
        </g>
      )}
    </svg>
  </div>
);

const IPadMockupFrame: React.FC<{
  metrics: DeviceFrameMetrics;
  children: React.ReactNode;
}> = ({ metrics, children }) => (
  <div
    className="relative"
    style={{
      width: metrics.stageWidth,
      height: metrics.stageHeight,
    }}
  >
    <div
      className="absolute overflow-hidden bg-zinc-900/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
      style={{
        left: metrics.viewportLeft,
        top: metrics.viewportTop,
        width: metrics.viewportWidth,
        height: metrics.viewportHeight,
        borderRadius: metrics.screenRadius,
      }}
    >
      {children}
    </div>
    <svg
      className="absolute inset-0 h-full w-full pointer-events-none"
      viewBox={`0 0 ${metrics.viewBoxWidth} ${metrics.viewBoxHeight}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      {metrics.orientation === 'landscape' ? (
        <>
          <path
            fill="#aaabac"
            d="M479.04,14.14H88.14v-.59c0-.16-.13-.3-.3-.3h-16.7c-.16,0-.3.13-.3.3v.59h-3.46v-.59c0-.16-.13-.3-.3-.3h-16.7c-.16,0-.3.13-.3.3v.59h-9.13c-13.4,0-24.27,10.78-24.45,24.14h-.48c-.16,0-.3.13-.3.3v20.07c0,.16.13.3.3.3h.47v303.38c0,13.51,10.95,24.45,24.45,24.45h438.08c13.51,0,24.45-10.95,24.45-24.45V38.6c0-13.51-10.95-24.45-24.45-24.45Z"
          />
          <rect x="18.58" y="15.94" width="482.84" height="368.91" rx="23.29" ry="23.29" fill="#000" />
          <rect x="31.37" y="28.47" width="457.25" height="342.87" rx="9.61" ry="9.61" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
          <circle fill="#0a1054" cx="245.1" cy="22.23" r="2.44" />
          <circle fill="#333" cx="274.98" cy="22.23" r=".88" />
        </>
      ) : (
        <g transform="translate(400 0) rotate(90)">
          <path
            fill="#aaabac"
            d="M479.04,14.14H88.14v-.59c0-.16-.13-.3-.3-.3h-16.7c-.16,0-.3.13-.3.3v.59h-3.46v-.59c0-.16-.13-.3-.3-.3h-16.7c-.16,0-.3.13-.3.3v.59h-9.13c-13.4,0-24.27,10.78-24.45,24.14h-.48c-.16,0-.3.13-.3.3v20.07c0,.16.13.3.3.3h.47v303.38c0,13.51,10.95,24.45,24.45,24.45h438.08c13.51,0,24.45-10.95,24.45-24.45V38.6c0-13.51-10.95-24.45-24.45-24.45Z"
          />
          <rect x="18.58" y="15.94" width="482.84" height="368.91" rx="23.29" ry="23.29" fill="#000" />
          <rect x="31.37" y="28.47" width="457.25" height="342.87" rx="9.61" ry="9.61" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
          <circle fill="#0a1054" cx="245.1" cy="22.23" r="2.44" />
          <circle fill="#333" cx="274.98" cy="22.23" r=".88" />
        </g>
      )}
    </svg>
  </div>
);

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

const buildBracketedPasteInput = (value: string): string => `\x1b[200~${value}\x1b[201~\r`;

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
      viewportLeft: 0,
      viewportTop: 0,
      viewBoxWidth: Math.max(hostWidth, 280),
      viewBoxHeight: Math.max(hostHeight, 320),
      shellPadding: 0,
      shellHeader: 0,
      kind: 'responsive',
      screenRadius: 0,
      orientation,
    };
  }

  const definition = DEVICE_FRAME_DEFINITIONS[device.id as keyof typeof DEVICE_FRAME_DEFINITIONS];
  const rotated = orientation !== definition.baseOrientation;
  const requestedWidth = orientation === 'landscape' && device.width && device.height ? device.height : device.width ?? 0;
  const requestedHeight = orientation === 'landscape' && device.width && device.height ? device.width : device.height ?? 0;
  const frameOuterWidth = rotated ? definition.outerHeight : definition.outerWidth;
  const frameOuterHeight = rotated ? definition.outerWidth : definition.outerHeight;
  const frameScreenWidth = rotated ? definition.screenHeight : definition.screenWidth;
  const frameScreenHeight = rotated ? definition.screenWidth : definition.screenHeight;
  const frameScreenX = rotated
    ? definition.outerHeight - definition.screenY - definition.screenHeight
    : definition.screenX;
  const frameScreenY = rotated ? definition.screenX : definition.screenY;
  const insets = rotated
    ? {
        top: definition.contentInsetLeft,
        right: definition.contentInsetTop,
        bottom: definition.contentInsetRight,
        left: definition.contentInsetBottom,
      }
    : {
        top: definition.contentInsetTop,
        right: definition.contentInsetRight,
        bottom: definition.contentInsetBottom,
        left: definition.contentInsetLeft,
      };
  const clippedScreenX = frameScreenX + insets.left;
  const clippedScreenY = frameScreenY + insets.top;
  const clippedScreenWidth = frameScreenWidth - insets.left - insets.right;
  const clippedScreenHeight = frameScreenHeight - insets.top - insets.bottom;

  const availableWidth = Math.max(hostWidth - 56, 240);
  const availableHeight = Math.max(hostHeight - 56, 280);
  const screenScale = Math.min(requestedWidth / clippedScreenWidth, requestedHeight / clippedScreenHeight);
  const desiredStageWidth = frameOuterWidth * screenScale;
  const desiredStageHeight = frameOuterHeight * screenScale;
  const scale = Math.min(1, availableWidth / desiredStageWidth, availableHeight / desiredStageHeight);
  const stageWidth = Math.max(220, Math.round(desiredStageWidth * scale));
  const stageHeight = Math.max(260, Math.round(desiredStageHeight * scale));
  const finalFrameScale = stageWidth / frameOuterWidth;
  const viewportWidth = Math.round(clippedScreenWidth * finalFrameScale);
  const viewportHeight = Math.round(clippedScreenHeight * finalFrameScale);
  const viewportLeft = Math.round(clippedScreenX * finalFrameScale);
  const viewportTop = Math.round(clippedScreenY * finalFrameScale);
  const maxInset = Math.max(insets.top, insets.right, insets.bottom, insets.left);
  const screenRadius = Math.max(8, Math.round((definition.screenRadius - maxInset) * finalFrameScale));

  return {
    stageWidth,
    stageHeight,
    viewportWidth,
    viewportHeight,
    viewportLeft,
    viewportTop,
    viewBoxWidth: frameOuterWidth,
    viewBoxHeight: frameOuterHeight,
    shellPadding: 0,
    shellHeader: 0,
    kind: definition.kind,
    screenRadius,
    orientation,
  };
};

export const BrowserPane: React.FC<BrowserPaneProps> = ({ workspaceId, sessions, theme: _theme }) => {
  const previewShellRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const loadStartRef = useRef<number | null>(null);
  const lastNavigatedTabRef = useRef<string | null>(null);
  const lastSyncedBoundsKeyRef = useRef<string | null>(null);
  const isPoppedOutRef = useRef(false);
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
  const addBrowserTab = useAppStore((state) => state.addBrowserTab);
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

  const defaultSessionId = useMemo(() => {
    if (activeSessionId && targetableSessions.some((session) => session.id === activeSessionId)) {
      return activeSessionId;
    }
    return targetableSessions[0]?.id ?? null;
  }, [activeSessionId, targetableSessions]);

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
    if (isPoppedOut) return;

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

    const chrome: BrowserPreviewChrome | null = viewportMetrics.kind === 'responsive'
      ? null
      : viewportMetrics.kind === 'iphone'
        ? {
            radius: Math.max(10, viewportMetrics.screenRadius),
            mode: 'iphone',
            topInset: Math.max(18, Math.round(viewportMetrics.viewportHeight * 0.06)),
            orientation: effectiveState.deviceOrientation,
          }
        : {
            radius: Math.max(10, viewportMetrics.screenRadius),
            mode: 'ipad',
            topInset: 0,
            orientation: effectiveState.deviceOrientation,
          };

    void setBrowserPreviewChrome(workspaceId, chrome).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [
    nativeBrowserReady,
    isPoppedOut,
    setBrowserPreviewChrome,
    effectiveState.deviceOrientation,
    viewportMetrics.kind,
    viewportMetrics.screenRadius,
    workspaceId,
  ]);

  useEffect(() => {
    if (!nativeBrowserReady) return;
    const activeTabId = browserState?.activeTabId;
    if (!activeTabId || activeTabId === lastNavigatedTabRef.current) return;

    const activeTab = browserState?.browserTabs?.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    lastNavigatedTabRef.current = activeTabId;
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

    if (!effectiveState.uiReferencePrompt.trim()) {
      setError('Enter an instruction before sending the UI reference to an agent.');
      return;
    }

    if (effectiveState.uiReferenceMode === 'replace' && !effectiveState.selectedElement) {
      setError('Select the target element on localhost before using replace mode.');
      return;
    }

    const formattedPrompt = formatUiReferencePrompt(
      reference,
      effectiveState.uiReferencePrompt,
      effectiveState.uiReferenceMode,
      effectiveState.selectedElement,
    );

    setIsSubmitting(true);
    try {
      await writeToTerminal(targetSessionId, buildBracketedPasteInput(formattedPrompt));
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
    writeToTerminal,
  ]);

  const handleAddTab = useCallback(() => {
    const id = `tab-${Date.now()}`;
    addBrowserTab(workspaceId, { id, url: FALLBACK_URL, title: 'New Tab' });
  }, [addBrowserTab, workspaceId]);

  const handleOpenLocalhost = useCallback(() => {
    const id = `tab-${Date.now()}`;
    addBrowserTab(workspaceId, { id, url: LOCALHOST_URL, title: 'Localhost' });
  }, [addBrowserTab, workspaceId]);

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveBrowserTab(workspaceId, tabId);
  }, [setActiveBrowserTab, workspaceId]);

  const handleCloseTab = useCallback((tabId: string) => {
    removeBrowserTab(workspaceId, tabId);
  }, [removeBrowserTab, workspaceId]);

  const selectedElement = effectiveState.selectedElement;
  const selectedElementSelectors = selectedElement?.selectors.slice(0, 3) ?? [];
  const selectedElementTitle = selectedElement?.pageTitle || pageTitle || 'Untitled page';
  const selectedElementSummary = selectedElement?.textContent || 'No visible text in this element.';
  const selectedElementAttributeCount = selectedElement ? Object.keys(selectedElement.attributes).length : 0;
  const activeUiReference = effectiveState.uiReferenceClipboard.find(
    (reference) => reference.id === effectiveState.activeUiReferenceId,
  ) ?? effectiveState.uiReferenceClipboard[0] ?? null;

  const displayUrl = resolvedDraftUrl.replace(/^https?:\/\//, '');
  const previewLabel = activeDevice.id === 'responsive'
    ? 'responsive'
    : `${viewportMetrics.viewportWidth}×${viewportMetrics.viewportHeight}`;

  return (
    <div className="h-full w-full">
      <div className="h-full w-full border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden flex flex-col rounded-lg">
        {/* ── Header Bar ──────────────────────────────────────────────── */}
        <header className="shrink-0 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/90 backdrop-blur-sm">
          {/* Title Row */}
          <div className="flex items-center gap-3 px-3 py-2.5">
            {/* Traffic Lights */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            </div>

            {/* Identity Badge */}
            <div className="flex items-center gap-2 shrink-0 pr-3 mr-1 border-r border-[var(--border-primary)]">
              <Icon icon="material-symbols:language-rounded" className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-primary)] select-none">
                browser
              </span>
              <div className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-[var(--accent)]/40" />
                <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-[var(--accent)] select-none">
                  v{effectiveState.zoomFactor.toFixed(2)}x
                </span>
              </div>
            </div>

            {/* URL Input — terminal prompt style */}
            <div className="flex-1 flex items-center gap-2 min-w-0 bg-[var(--bg-primary)]/60 border border-[var(--border-primary)] rounded-lg px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)] select-none shrink-0">
                $
              </span>
              <input
                value={resolvedDraftUrl}
                onChange={(event) => setBrowserDraftUrl(workspaceId, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleNavigate();
                  }
                }}
                className="flex-1 bg-transparent text-[11px] font-medium text-[var(--text-primary)] outline-none placeholder:text-zinc-600"
                placeholder={FALLBACK_URL}
              />
              <motion.button
                onClick={() => void handleNavigate()}
                title="Navigate"
                aria-label="Navigate to URL"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent-light)] text-[var(--accent)] hover:bg-[var(--accent)]/25 transition-colors cursor-pointer"
              >
                <span className="sr-only">Navigate</span>
                <Icon icon="material-symbols:arrow-forward-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
              </motion.button>
            </div>

            {/* Localhost quick-access */}
            <motion.button
              onClick={handleOpenLocalhost}
              title="Open localhost:3000 in new tab"
              aria-label="Open localhost:3000 in new tab"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/15 bg-emerald-500/6 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300/80 hover:border-emerald-500/30 hover:bg-emerald-500/12 hover:text-emerald-200 transition-all cursor-pointer"
            >
              <Icon icon="material-symbols:open-in-new-rounded" className="h-3 w-3" aria-hidden="true" />
              localhost
            </motion.button>

            {/* Primary Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Inspect */}
              <motion.button
                onClick={() => void handleToggleInspect()}
                title={effectiveState.inspectMode ? 'Exit inspect mode' : 'Inspect elements'}
                aria-label={effectiveState.inspectMode ? 'Exit inspect mode' : 'Inspect elements'}
                aria-pressed={effectiveState.inspectMode}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`inspect-button-gemini inline-flex h-7 w-7 items-center justify-center rounded-[7px] p-[1px] transition-transform duration-200 cursor-pointer ${
                  effectiveState.inspectMode
                    ? 'is-active'
                    : ''
                }`}
              >
                <span
                  className={`flex h-full w-full items-center justify-center rounded-[6px] border backdrop-blur-sm transition-colors duration-200 ${
                    effectiveState.inspectMode
                      ? 'border-emerald-400/40 bg-[var(--bg-secondary)]/90 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/80 text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]'
                  }`}
                >
                  <span className="sr-only">Inspect</span>
                  <svg
                    className={`h-4 w-4 shrink-0 ${effectiveState.inspectMode ? 'drop-shadow-[0_0_6px_rgba(74,222,128,0.45)]' : 'drop-shadow-[0_0_4px_rgba(255,255,255,0.15)]'}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.85"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M8 4l8 8-3 1 2 6-2 1-2-6-3 3V4Z" />
                    <path d="M14.5 14.5 20 20" />
                    <path d="M5 5h3" />
                    <path d="M5 9h2" />
                    <path d="M5 13h2" />
                  </svg>
                </span>
              </motion.button>

              <span className="h-5 w-px bg-[var(--border-primary)] mx-0.5" aria-hidden="true" />

              {/* Navigation */}
              <button
                onClick={() => void handleGoBack()}
                disabled={historyLength <= 1}
                title="Back"
                aria-label="Go back"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-30 transition-colors cursor-pointer"
              >
                <Icon icon="material-symbols:arrow-back-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={() => void handleGoForward()}
                title="Forward"
                aria-label="Go forward"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600 cursor-pointer"
              >
                <Icon icon="material-symbols:arrow-forward-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={() => void handleReload()}
                title="Reload"
                aria-label="Reload page"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600 cursor-pointer"
              >
                <Icon icon="material-symbols:refresh-rounded" className={`h-3.5 w-3.5 ${effectiveState.isLoading ? 'animate-spin-slow' : ''}`} aria-hidden="true" />
              </button>
              <button
                onClick={() => void handleCopyUrl()}
                title="Copy URL"
                aria-label="Copy URL to clipboard"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600 cursor-pointer"
              >
                <Icon icon="material-symbols:content-copy-outline-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={() => void handleOpenExternal()}
                title="Open in browser"
                aria-label="Open in external browser"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600 cursor-pointer"
              >
                <Icon icon="material-symbols:open-in-new-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={() => void handleTogglePopout()}
                title={isPoppedOut ? 'Dock browser here' : 'Open in app window'}
                aria-label={isPoppedOut ? 'Dock browser here' : 'Open browser in app window'}
                aria-pressed={isPoppedOut}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                  isPoppedOut
                    ? 'border-violet-400/35 bg-violet-500/10 text-violet-300 shadow-[0_0_12px_rgba(167,139,250,0.15)]'
                    : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600'
                }`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="4.5" y="6.5" width="10" height="10" rx="1.8" />
                  <path d="M10.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5V13" />
                  <path d="M13.5 10.5 19.5 4.5" />
                </svg>
              </button>
              <button
                onClick={() => void handleExportSnapshot()}
                title="Export snapshot"
                aria-label="Export page snapshot"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600 cursor-pointer"
              >
                <Icon icon="material-symbols:download-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <span className="h-5 w-px bg-[var(--border-primary)] mx-0.5" aria-hidden="true" />

              {/* Style Tools */}
              <button
                onClick={() => void handleTogglePickStyle()}
                title={effectiveState.pickStyleMode ? 'Stop picking styles' : 'Pick UI style'}
                aria-label={effectiveState.pickStyleMode ? 'Stop picking styles' : 'Pick UI style'}
                aria-pressed={effectiveState.pickStyleMode}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                  effectiveState.pickStyleMode
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.15)]'
                  : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600'
                }`}
              >
                <svg
                  className={`h-4 w-4 shrink-0 ${effectiveState.pickStyleMode ? 'drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]' : 'drop-shadow-[0_0_4px_rgba(255,255,255,0.1)]'}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 20h4l8.5-8.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" />
                  <path d="M12.5 7.5 16 11" />
                  <path d="M14.5 5.5l4-4" />
                  <path d="M18.5 1.5 21 4" />
                  <path d="M6 20c0-1.2.9-2 2.1-2H10" />
                  <path d="M18.5 18.5c0 1.4-1.1 2.5-2.5 2.5" />
                </svg>
              </button>
              <button
                onClick={() => void handleTogglePickUiElement()}
                title={effectiveState.pickUiElementMode ? 'Stop picking UI elements' : 'Pick UI Element'}
                aria-label={effectiveState.pickUiElementMode ? 'Stop picking UI elements' : 'Pick UI Element'}
                aria-pressed={effectiveState.pickUiElementMode}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 transition-colors cursor-pointer ${
                  effectiveState.pickUiElementMode
                    ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.15)]'
                    : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600'
                }`}
              >
                <Icon icon="material-symbols:view-in-ar-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="text-[9px] font-bold uppercase tracking-[0.15em]">UI</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => setActiveSidebar((prev) => prev === 'styles' ? null : 'styles')}
                  title="Style clipboard"
                  aria-label="Style clipboard"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                    activeSidebar === 'styles'
                      ? 'border-sky-500/30 bg-sky-500/10 text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.15)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600'
                  }`}
                >
                  <Icon icon="material-symbols:content-paste-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {effectiveState.styleClipboard.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500 text-[7px] font-bold text-white shadow-[0_0_6px_rgba(56,189,248,0.5)]">
                    {effectiveState.styleClipboard.length}
                  </span>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => setActiveSidebar((prev) => prev === 'ui-references' ? null : 'ui-references')}
                  title="UI references"
                  aria-label="UI references"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                    activeSidebar === 'ui-references'
                      ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
                      : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--accent)] hover:border-zinc-600'
                  }`}
                >
                  <Icon icon="material-symbols:view-in-ar-outline-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {effectiveState.uiReferenceClipboard.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-500 text-[7px] font-bold text-white shadow-[0_0_6px_rgba(34,211,238,0.5)]">
                    {effectiveState.uiReferenceClipboard.length}
                  </span>
                )}
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
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-primary)]/40 border-t border-[var(--border-primary)]">
            {/* Device Selector */}
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)]/80 px-2 py-1">
              <Icon icon="material-symbols:devices-outline-rounded" className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
              <select
                value={effectiveState.deviceId}
                onChange={(event) => handleDeviceChange(event.target.value as BrowserDevicePreset['id'])}
                className="bg-transparent text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-primary)] outline-none appearance-none pr-1 cursor-pointer"
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
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)]/80 text-[var(--accent)] hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-30 transition-colors cursor-pointer"
            >
              <Icon icon="material-symbols:screen-rotation-rounded" className="h-3 w-3" aria-hidden="true" />
            </button>

            <span className="h-4 w-px bg-[var(--border-primary)]" aria-hidden="true" />

            {/* Zoom Controls */}
            <button
              onClick={() => handleZoomChange(getNextZoom(effectiveState.zoomFactor, -1))}
              title="Zoom out"
              aria-label="Zoom out"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)]/80 text-[var(--accent)] hover:border-zinc-600 cursor-pointer"
            >
              <Icon icon="material-symbols:remove-rounded" className="h-3 w-3" aria-hidden="true" />
            </button>
            <motion.button
              onClick={() => handleZoomChange(1)}
              title="Reset zoom"
              aria-label="Reset zoom to 100%"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)]/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-primary)] hover:border-zinc-600 cursor-pointer"
            >
              <Icon icon="material-symbols:search-rounded" className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
              {Math.round(effectiveState.zoomFactor * 100)}%
            </motion.button>
            <button
              onClick={() => handleZoomChange(getNextZoom(effectiveState.zoomFactor, 1))}
              title="Zoom in"
              aria-label="Zoom in"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)]/80 text-[var(--accent)] hover:border-zinc-600 cursor-pointer"
            >
              <Icon icon="material-symbols:add-rounded" className="h-3 w-3" aria-hidden="true" />
            </button>

            <span className="h-4 w-px bg-[var(--border-primary)]" aria-hidden="true" />

            {/* Status Indicators — iconified */}
            <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]/70">
              <Icon icon="material-symbols:aspect-ratio-outline-rounded" className="h-3 w-3" aria-hidden="true" />
              <span>{previewLabel}</span>
            </div>

            <span className="h-4 w-px bg-[var(--border-primary)]" aria-hidden="true" />

            <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]/70">
              <Icon icon="material-symbols:pace-rounded" className="h-3 w-3" aria-hidden="true" />
              <span>{lastLoadDurationMs !== null ? `${lastLoadDurationMs}ms` : '--'}</span>
            </div>

            <span className="h-4 w-px bg-[var(--border-primary)]" aria-hidden="true" />

            <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]/70">
              <Icon icon="material-symbols:history-rounded" className="h-3 w-3" aria-hidden="true" />
              <span>{historyLength}</span>
            </div>

            <span className="h-4 w-px bg-[var(--border-primary)]" aria-hidden="true" />

            <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]/70 ml-auto">
              <span className={`inline-flex h-1.5 w-1.5 rounded-full ${effectiveState.isLoading ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-zinc-600'}`} />
              <span>{pageTitle ? pageTitle.slice(0, 40) + (pageTitle.length > 40 ? '…' : '') : 'untitled'}</span>
            </div>

            <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]/50 ml-2">
              <Icon icon="material-symbols:link-rounded" className="h-3 w-3" aria-hidden="true" />
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
                className="border-t border-rose-900/40 bg-rose-950/20 px-3 py-1.5"
              >
                <div className="flex items-center gap-2 text-[10px] text-rose-300/90">
                  <Icon icon="material-symbols:error-outline-rounded" className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{error}</span>
                </div>
              </motion.div>
            )}
            {exportMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-emerald-900/40 bg-emerald-950/20 px-3 py-1.5"
              >
                <div className="flex items-center gap-2 text-[10px] text-emerald-300/90">
                  <Icon icon="material-symbols:check-circle-outline-rounded" className="h-3 w-3 shrink-0" aria-hidden="true" />
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
              className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.06),transparent_35%),radial-gradient(ellipse_at_bottom_right,rgba(59,130,246,0.06),transparent_30%),var(--bg-primary)]"
            >
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px]" />

              {isPoppedOut ? (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="flex max-w-[320px] flex-col items-center gap-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]/90 px-5 py-4 text-center shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-400/25 bg-violet-500/10 text-violet-300">
                      <Icon icon="material-symbols:select-window-2-outline-rounded" className="h-5 w-5" aria-hidden="true" />
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
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="4.5" y="6.5" width="10" height="10" rx="1.8" />
                        <path d="M10.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5V13" />
                        <path d="M13.5 10.5 19.5 4.5" />
                      </svg>
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
                  {viewportMetrics.kind === 'iphone' ? (
                    <IPhoneMockupFrame metrics={viewportMetrics}>
                      <div ref={previewViewportRef} className="h-full w-full" />
                    </IPhoneMockupFrame>
                  ) : (
                    <IPadMockupFrame metrics={viewportMetrics}>
                      <div ref={previewViewportRef} className="h-full w-full" />
                    </IPadMockupFrame>
                  )}
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
                  <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]/90 backdrop-blur-sm px-5 py-3.5 text-center shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
                    <div className="flex items-center gap-2">
                      <Icon
                        icon="material-symbols:progress-activity-rounded"
                        className="h-4 w-4 text-[var(--accent)] animate-spin-slow"
                        aria-hidden="true"
                      />
                      <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-primary)]">
                        booting preview
                      </span>
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
                    <Icon icon="material-symbols:palette-outline-rounded" className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
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
                    <Icon icon="material-symbols:close-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
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
                className="w-[380px] shrink-0 border-l border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-y-auto"
              >
                <div className="sticky top-0 z-10 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 backdrop-blur-sm">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Icon icon="material-symbols:view-in-ar-rounded" className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-primary)]">
                        UI references
                      </span>
                      {effectiveState.uiReferenceClipboard.length > 0 && (
                        <span className="rounded-full border border-cyan-500/20 px-1.5 text-[9px] font-bold text-cyan-200">
                          {effectiveState.uiReferenceClipboard.length}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setActiveSidebar(null)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 text-[var(--accent)] hover:border-zinc-600 cursor-pointer"
                      aria-label="Close UI references"
                    >
                      <Icon icon="material-symbols:close-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="border-t border-[var(--border-primary)]/60 px-3 py-2 text-[10px] leading-4 text-[var(--accent)]/55">
                    Capture a component from any site, then recreate it inside your local project with project-native code.
                  </div>
                </div>

                <UiReferenceClipboardPanel
                  references={effectiveState.uiReferenceClipboard}
                  activeReferenceId={effectiveState.activeUiReferenceId}
                  onSelect={(referenceId) => setActiveUiReference(workspaceId, referenceId)}
                  onRemove={(referenceId) => removeCapturedUiReference(workspaceId, referenceId)}
                  onCopyJson={handleCopyUiReferenceJson}
                />

                {activeUiReference && (
                  <div className="border-t border-[var(--border-primary)] p-3">
                    <div className="rounded-xl border border-cyan-500/15 bg-[linear-gradient(180deg,rgba(34,211,238,0.08),rgba(8,145,178,0.03))] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-200/80">
                            active reference
                          </div>
                          <div className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">
                            {activeUiReference.componentLabel}
                          </div>
                          <p className="mt-2 text-[10px] leading-5 text-[var(--accent)]/70">
                            {activeUiReference.designIntent}
                          </p>
                        </div>
                        <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2 py-1 text-right">
                          <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--accent)]/55">source</div>
                          <div className="mt-0.5 max-w-[110px] truncate text-[10px] text-[var(--text-primary)]">
                            {activeUiReference.sourceUrl.replace(/^https?:\/\//, '')}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setBrowserUiReferenceMode(workspaceId, 'insert')}
                          className={`rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors cursor-pointer ${
                            effectiveState.uiReferenceMode === 'insert'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                              : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--text-primary)] hover:border-emerald-500/30'
                          }`}
                        >
                          Insert mode
                        </button>
                        <button
                          onClick={() => setBrowserUiReferenceMode(workspaceId, 'replace')}
                          className={`rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors cursor-pointer ${
                            effectiveState.uiReferenceMode === 'replace'
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                              : 'border-[var(--border-primary)] bg-[var(--bg-primary)]/60 text-[var(--text-primary)] hover:border-amber-500/30'
                          }`}
                        >
                          Replace mode
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                        <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/55 p-2">
                          <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--accent)]/55">layout</div>
                          <div className="mt-1 text-[var(--text-primary)]">
                            {activeUiReference.layout.display} / {activeUiReference.layout.position}
                          </div>
                          <div className="mt-1 text-[var(--accent)]/60">
                            {activeUiReference.layout.width} x {activeUiReference.layout.height}
                          </div>
                        </div>
                        <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/55 p-2">
                          <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--accent)]/55">viewport</div>
                          <div className="mt-1 text-[var(--text-primary)]">
                            {activeUiReference.viewport.width} x {activeUiReference.viewport.height}
                          </div>
                          <div className="mt-1 text-[var(--accent)]/60">
                            {activeUiReference.assets.length} assets
                          </div>
                        </div>
                      </div>

                      {effectiveState.uiReferenceMode === 'replace' && (
                        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/6 p-2.5">
                          <div className="flex items-center gap-1.5">
                            <Icon icon="material-symbols:target-rounded" className="h-3 w-3 text-amber-200" aria-hidden="true" />
                            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-amber-100">
                              localhost target
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] leading-4 text-amber-100/75">
                            Select an element in your local page with inspect mode before sending replace mode.
                          </p>
                          <div className="mt-2 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2 py-1.5 text-[10px] text-[var(--text-primary)]">
                            {selectedElement
                              ? selectedElement.selectors[0] || selectedElement.tagName
                              : 'No target selected yet'}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/55 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Icon icon="material-symbols:terminal-rounded" className="h-3 w-3 text-cyan-300" aria-hidden="true" />
                            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                              target agent
                            </span>
                          </div>
                          <span className="text-[9px] text-[var(--accent)]/55">{targetableSessions.length} avail</span>
                        </div>
                        <select
                          value={effectiveState.targetSessionId ?? ''}
                          onChange={(event) => setBrowserTargetSession(workspaceId, event.target.value || null)}
                          className="mt-2 w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/80 px-3 py-2 text-[11px] font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10"
                        >
                          {targetableSessions.map((session) => (
                            <option key={session.id} value={session.id} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                              {sessionDisplayName(session)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mt-3">
                        <div className="mb-2 flex items-center gap-1.5">
                          <Icon icon="material-symbols:edit-note-rounded" className="h-3 w-3 text-cyan-300" aria-hidden="true" />
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]">
                            Integration brief
                          </span>
                        </div>
                        <textarea
                          value={effectiveState.uiReferencePrompt}
                          onChange={(event) => setBrowserUiReferencePrompt(workspaceId, event.target.value)}
                          className="min-h-[144px] w-full resize-none rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/80 px-3 py-2.5 text-[11px] leading-5 text-[var(--text-primary)] outline-none placeholder:text-zinc-600 transition-colors focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10"
                          placeholder="Recreate this as a reusable React/Tailwind component for my local landing page. Keep the visual hierarchy, spacing rhythm, and tone, but use clean project-native code."
                        />
                      </div>

                      <motion.button
                        onClick={() => void handleSendUiReferenceToAgent()}
                        disabled={isSubmitting || targetableSessions.length === 0}
                        whileHover={!isSubmitting ? { scale: 1.01, y: -1 } : {}}
                        whileTap={!isSubmitting ? { scale: 0.98, y: 0 } : {}}
                        className="mt-3 group relative inline-flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-lg border border-cyan-500/25 bg-gradient-to-br from-cyan-500/15 via-sky-500/10 to-emerald-500/10 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12),0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-200 hover:border-cyan-400/40 hover:text-cyan-50 hover:shadow-[0_0_34px_rgba(34,211,238,0.18),0_6px_16px_rgba(0,0,0,0.3)] disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                      >
                        <span className="absolute inset-0 rounded-lg bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.16),transparent_60%)] opacity-0 transition-opacity group-hover:opacity-100" />
                        <Icon icon="material-symbols:auto-awesome-rounded" className="relative h-4 w-4" aria-hidden="true" />
                        <span className="relative">{isSubmitting ? 'sending...' : 'send reference to agent'}</span>
                      </motion.button>
                    </div>
                  </div>
                )}
              </motion.aside>
            )}
          </AnimatePresence>

          {/* ── Element Inspector Panel ────────────────────────────────── */}
          <AnimatePresence>
            {selectedElement && (
              <motion.aside
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 14 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="w-[380px] shrink-0 border-l border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-y-auto"
              >
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/90 backdrop-blur-sm sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-primary)]">
                      element inspector
                    </span>
                  </div>
                  <button
                    onClick={() => clearBrowserSelection(workspaceId)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)]/40 text-[var(--accent)] hover:border-zinc-600 cursor-pointer"
                    aria-label="Clear selection"
                  >
                    <Icon icon="material-symbols:close-rounded" className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="p-3 space-y-3">
                  {/* Element Summary Card */}
                  <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">focused node</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2.5 py-1.5">
                            <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--accent)]/60">
                              <Icon icon="material-symbols:code-rounded" className="h-2.5 w-2.5" aria-hidden="true" />
                              tag
                            </div>
                            <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-primary)]">
                              {selectedElement.tagName}
                              {selectedElement.id ? `#${selectedElement.id}` : ''}
                            </div>
                          </div>
                          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2.5 py-1.5">
                            <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--accent)]/60">
                              <Icon icon="material-symbols:language-rounded" className="h-2.5 w-2.5" aria-hidden="true" />
                              page
                            </div>
                            <div className="mt-0.5 max-w-[100px] truncate text-[11px] font-medium text-[var(--text-primary)]">
                              {selectedElementTitle}
                            </div>
                          </div>
                          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2.5 py-1.5">
                            <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--accent)]/60">
                              <Icon icon="material-symbols:crop-free-rounded" className="h-2.5 w-2.5" aria-hidden="true" />
                              bounds
                            </div>
                            <div className="mt-0.5 text-[11px] font-semibold text-[var(--text-primary)]">
                              {selectedElement.rect.width} × {selectedElement.rect.height}
                            </div>
                          </div>
                        </div>
                        <p className="mt-2.5 max-h-[4.5rem] overflow-hidden text-[11px] leading-5 text-[var(--accent)]/80">
                          {selectedElementSummary}
                        </p>
                      </div>
                      <div className="shrink-0 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2.5 py-2 text-center">
                        <div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--accent)]/60">sel</div>
                        <div className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">{selectedElement.selectors.length}</div>
                        <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--accent)]/60">
                          {selectedElementAttributeCount} attrs
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--accent)]/60">
                          <Icon icon="material-symbols:aspect-ratio-outline-rounded" className="h-2.5 w-2.5" aria-hidden="true" />
                          viewport
                        </div>
                        <div className="mt-0.5 text-[11px] font-semibold text-[var(--text-primary)]">
                          {selectedElement.viewport.width}×{selectedElement.viewport.height}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--accent)]/60">
                          <Icon icon="material-symbols:link-rounded" className="h-2.5 w-2.5" aria-hidden="true" />
                          url
                        </div>
                        <div className="mt-0.5 truncate text-[11px] font-medium text-[var(--text-primary)]">
                          {selectedElement.pageUrl.replace(/^https?:\/\//, '')}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--accent)]/60">
                          <Icon icon="material-symbols:send-rounded" className="h-2.5 w-2.5" aria-hidden="true" />
                          status
                        </div>
                        <div className="mt-0.5 text-[11px] font-semibold text-emerald-400/80">
                          ready
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Selectors */}
                  <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 p-3">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5">
                        <Icon icon="material-symbols:layers-outline-rounded" className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]">selectors</span>
                      </div>
                      <span className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--accent)]">
                        {selectedElementAttributeCount} attrs
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {selectedElementSelectors.map((selector, index) => (
                        <div key={selector} className="flex items-start gap-2.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-2.5 py-2">
                          <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
                            {index === 0 ? 'P' : `F${index}`}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[var(--accent)]/60">
                              {index === 0 ? 'primary selector' : `fallback ${index}`}
                            </div>
                            <div className="mt-0.5 break-all text-[10px] leading-4 text-[var(--text-primary)]">
                              {selector}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Destination Agent */}
                  <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <Icon icon="material-symbols:terminal-rounded" className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]">target agent</span>
                      </div>
                      <span className="text-[9px] font-medium text-[var(--accent)]/60">
                        {targetableSessions.length} avail
                      </span>
                    </div>
                    <select
                      value={effectiveState.targetSessionId ?? ''}
                      onChange={(event) => setBrowserTargetSession(workspaceId, event.target.value || null)}
                      className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/80 px-3 py-2 text-[11px] font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/10"
                    >
                      {targetableSessions.map((session) => (
                        <option key={session.id} value={session.id} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                          {sessionDisplayName(session)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-[9px] leading-4 text-[var(--accent)]/50">
                      handoff goes directly into the chosen terminal context
                    </p>
                  </div>

                  {/* Instruction */}
                  <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon icon="material-symbols:edit-note-rounded" className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]">instruction</span>
                    </div>
                    <textarea
                      value={effectiveState.prompt}
                      onChange={(event) => setBrowserPrompt(workspaceId, event.target.value)}
                      className="min-h-[160px] w-full resize-none rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/80 px-3 py-2.5 text-[11px] leading-5 text-[var(--text-primary)] outline-none placeholder:text-zinc-600 transition-colors focus:border-sky-400/30 focus:ring-1 focus:ring-sky-400/10"
                      placeholder="tighten the spacing, improve the CTA hierarchy, and keep the same visual language."
                    />
                  </div>

                  {/* Send Button */}
                  <motion.button
                    onClick={() => void handleSubmitPrompt()}
                    disabled={isSubmitting || targetableSessions.length === 0}
                    whileHover={!isSubmitting ? { scale: 1.01, y: -1 } : {}}
                    whileTap={!isSubmitting ? { scale: 0.98, y: 0 } : {}}
                    className="group relative w-full inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-lg border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-sky-500/12 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.12),0_4px_12px_rgba(0,0,0,0.25)] hover:border-emerald-400/40 hover:from-emerald-500/22 hover:to-sky-500/18 hover:text-emerald-100 hover:shadow-[0_0_34px_rgba(16,185,129,0.2),0_6px_16px_rgba(0,0,0,0.3)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:shadow-none transition-all duration-200 cursor-pointer"
                  >
                    <span className="absolute inset-0 rounded-lg bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.15),transparent_60%)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Icon icon="material-symbols:send-rounded" className="relative h-4 w-4" aria-hidden="true" />
                    <span className="relative">{isSubmitting ? 'sending...' : 'send to agent'}</span>
                  </motion.button>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
