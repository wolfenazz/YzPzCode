import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BrowserBounds, BrowserViewState } from '../types';

export const useBrowser = () => {
  const ensureBrowserView = useCallback(async (workspaceId: string, url: string, bounds: BrowserBounds) => {
    return invoke<BrowserViewState>('ensure_browser_view', {
      request: {
        workspaceId,
        url,
        bounds,
      },
    });
  }, []);

  const resizeBrowserView = useCallback(async (workspaceId: string, bounds: BrowserBounds) => {
    await invoke('resize_browser_view', {
      request: {
        workspaceId,
        bounds,
      },
    });
  }, []);

  const navigateBrowserView = useCallback(async (workspaceId: string, url: string) => {
    return invoke<BrowserViewState>('navigate_browser_view', {
      request: {
        workspaceId,
        url,
      },
    });
  }, []);

  const reloadBrowserView = useCallback(async (workspaceId: string) => {
    await invoke('reload_browser_view', {
      request: {
        workspaceId,
      },
    });
  }, []);

  const setBrowserViewVisibility = useCallback(async (workspaceId: string, visible: boolean) => {
    await invoke('set_browser_view_visibility', {
      workspaceId,
      visible,
    });
  }, []);

  const closeBrowserView = useCallback(async (workspaceId: string) => {
    await invoke('close_browser_view', {
      request: {
        workspaceId,
      },
    });
  }, []);

  const setBrowserInspectMode = useCallback(async (workspaceId: string, enabled: boolean) => {
    await invoke('set_browser_inspect_mode', {
      request: {
        workspaceId,
        enabled,
      },
    });
  }, []);

  const setBrowserZoom = useCallback(async (workspaceId: string, zoomFactor: number) => {
    await invoke('set_browser_zoom', {
      request: {
        workspaceId,
        zoomFactor,
      },
    });
  }, []);

  const goBackBrowserView = useCallback(async (workspaceId: string) => {
    await invoke('browser_go_back', {
      request: {
        workspaceId,
      },
    });
  }, []);

  const goForwardBrowserView = useCallback(async (workspaceId: string) => {
    await invoke('browser_go_forward', {
      request: {
        workspaceId,
      },
    });
  }, []);

  const exportBrowserSnapshot = useCallback(async (workspaceId: string) => {
    await invoke('request_browser_snapshot', {
      request: {
        workspaceId,
      },
    });
  }, []);

  return {
    ensureBrowserView,
    resizeBrowserView,
    navigateBrowserView,
    reloadBrowserView,
    setBrowserViewVisibility,
    closeBrowserView,
    setBrowserInspectMode,
    setBrowserZoom,
    goBackBrowserView,
    goForwardBrowserView,
    exportBrowserSnapshot,
  };
};
