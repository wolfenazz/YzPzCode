use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::webview::{PageLoadEvent, WebviewBuilder, WebviewWindowBuilder};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl, WebviewWindow,
    Window, WindowEvent,
};
use url::Url;

const BROWSER_ELEMENT_SELECTED_EVENT: &str = "browser-element-selected";
const BROWSER_PAGE_LOAD_EVENT: &str = "browser-page-load";
const BROWSER_INSPECT_MODE_EVENT: &str = "browser-inspect-mode-changed";
const BROWSER_PAGE_STATE_EVENT: &str = "browser-page-state";
const BROWSER_SNAPSHOT_READY_EVENT: &str = "browser-snapshot-ready";
const BROWSER_STYLE_CAPTURED_EVENT: &str = "browser-style-captured";
const BROWSER_UI_ELEMENT_CAPTURED_EVENT: &str = "browser-ui-element-captured";
const BROWSER_STYLE_APPLIED_EVENT: &str = "browser-style-applied";
const BROWSER_POPOUT_STATE_EVENT: &str = "browser-popout-state";
const DEFAULT_BROWSER_URL: &str = "http://localhost:3000";

fn resolve_browser_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.is_empty() || trimmed == "about:blank" {
        DEFAULT_BROWSER_URL.to_string()
    } else {
        trimmed.to_string()
    }
}

fn canonicalize_browser_url_runtime(url: &str) -> Option<String> {
    Url::parse(&resolve_browser_url(url))
        .ok()
        .map(|parsed| parsed.as_str().to_string())
}

fn browser_urls_match_runtime(left: &str, right: &str) -> bool {
    match (
        canonicalize_browser_url_runtime(left),
        canonicalize_browser_url_runtime(right),
    ) {
        (Some(left_url), Some(right_url)) => left_url == right_url,
        _ => resolve_browser_url(left) == resolve_browser_url(right),
    }
}

#[cfg(test)]
fn canonicalize_browser_url(url: &str) -> Option<String> {
    Url::parse(&resolve_browser_url(url))
        .ok()
        .map(|parsed| parsed.as_str().to_string())
}

#[cfg(test)]
fn browser_urls_match(left: &str, right: &str) -> bool {
    match (
        canonicalize_browser_url(left),
        canonicalize_browser_url(right),
    ) {
        (Some(left_url), Some(right_url)) => left_url == right_url,
        _ => resolve_browser_url(left) == resolve_browser_url(right),
    }
}

const BROWSER_INIT_SCRIPT: &str = r#"
(() => {
  if (window.__YZPZ_BROWSER_BRIDGE__) {
    return;
  }

  const overlay = document.createElement('div');
  const badge = document.createElement('div');
  let inspectMode = false;
  let activeElement = null;
  let pickStyleMode = false;
  let pickUiElementMode = false;
  let applyMode = false;
  let previewChrome = null;
  let applyPayload = null;
  let undoStack = [];
  let applyHoverTarget = null;
  let applyHoverBackup = null;
  let pointerMoveFrame = 0;
  let lastPointerEvent = null;
  let pageStateTimer = 0;
  let lastPageStateKey = null;

  const invoke = (command, payload = {}) => {
    const ipc = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
    if (typeof ipc !== 'function') {
      return Promise.resolve();
    }
    return ipc(command, payload).catch(() => undefined);
  };

  const styleOverlay = () => {
    overlay.setAttribute('data-yzpz-browser-overlay', 'true');
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '0';
    overlay.style.height = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '2147483646';
    overlay.style.border = '2px solid rgba(16, 185, 129, 0.95)';
    overlay.style.borderRadius = '12px';
    overlay.style.boxShadow = '0 0 0 1px rgba(5, 7, 10, 0.95), 0 0 0 9999px rgba(5, 7, 10, 0.18)';
    overlay.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(34, 197, 94, 0.08))';
    overlay.style.backdropFilter = 'blur(0.5px)';
    overlay.style.display = 'none';

    badge.setAttribute('data-yzpz-browser-overlay-badge', 'true');
    badge.style.position = 'absolute';
    badge.style.left = '0';
    badge.style.top = '0';
    badge.style.transform = 'translateY(calc(-100% - 10px))';
    badge.style.padding = '6px 10px';
    badge.style.borderRadius = '999px';
    badge.style.border = '1px solid rgba(16, 185, 129, 0.4)';
    badge.style.background = 'rgba(9, 9, 11, 0.92)';
    badge.style.color = '#d4d4d8';
    badge.style.fontFamily = '"Cascadia Mono", "JetBrains Mono", monospace';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = '700';
    badge.style.letterSpacing = '0.08em';
    badge.style.textTransform = 'uppercase';
    badge.style.whiteSpace = 'nowrap';
    badge.style.maxWidth = 'min(60vw, 520px)';
    badge.style.overflow = 'hidden';
    badge.style.textOverflow = 'ellipsis';
    badge.style.boxShadow = '0 18px 50px rgba(0, 0, 0, 0.45)';

    overlay.appendChild(badge);
  };

  const ensureOverlay = () => {
    if (!overlay.parentElement) {
      const root = document.documentElement || document.body;
      if (root) {
        root.appendChild(overlay);
      }
    }
  };

  const clearOverlay = () => {
    activeElement = null;
    overlay.style.display = 'none';
  };

  const applyPreviewChrome = () => {
    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) return;
    let island = document.getElementById('yzpz-preview-island');
    let previewStyle = document.getElementById('yzpz-preview-style');

    if (!previewChrome) {
      html.style.removeProperty('overflow');
      html.style.removeProperty('border-radius');
      html.style.removeProperty('clip-path');
      body.style.removeProperty('overflow');
      body.style.removeProperty('border-radius');
      body.style.removeProperty('clip-path');
      body.style.removeProperty('min-height');
      body.style.removeProperty('padding-top');
      body.style.removeProperty('box-sizing');
      if (island) island.remove();
      if (previewStyle) previewStyle.remove();
      return;
    }

    const radius = `${previewChrome.radius}px`;
    const topInset = `${previewChrome.topInset || 0}px`;
    html.style.overflow = 'hidden';
    html.style.borderRadius = radius;
    html.style.clipPath = `inset(0 round ${radius})`;
    body.style.overflow = 'hidden';
    body.style.borderRadius = radius;
    body.style.clipPath = `inset(0 round ${radius})`;
    body.style.minHeight = '100vh';
    body.style.boxSizing = 'border-box';
    body.style.paddingTop = topInset;

    if (!previewStyle) {
      previewStyle = document.createElement('style');
      previewStyle.id = 'yzpz-preview-style';
      document.head.appendChild(previewStyle);
    }
    previewStyle.textContent = `
      html, body { background: #202228 !important; }
      body { position: relative !important; }
    `;

    if (previewChrome.mode === 'iphone') {
      if (!island) {
        island = document.createElement('div');
        island.id = 'yzpz-preview-island';
        document.body.appendChild(island);
      }
      island.setAttribute('aria-hidden', 'true');
      island.style.position = 'fixed';
      const orientation = previewChrome.orientation || 'portrait';
      island.style.width = orientation === 'landscape' ? '28px' : '104px';
      island.style.height = orientation === 'landscape' ? '104px' : '28px';
      island.style.borderRadius = '999px';
      island.style.background = '#000';
      island.style.zIndex = '2147483645';
      island.style.pointerEvents = 'none';
      island.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.05)';
      if (orientation === 'landscape') {
        island.style.left = 'auto';
        island.style.right = '8px';
        island.style.top = '50%';
        island.style.transform = 'translateY(-50%)';
      } else {
        island.style.left = '50%';
        island.style.right = 'auto';
        island.style.top = '8px';
        island.style.transform = 'translateX(-50%)';
      }
    } else if (island) {
      island.remove();
    }
  };

  const buildPathSelector = (element) => {
    const segments = [];
    let current = element;

    while (current && current.nodeType === 1 && segments.length < 6) {
      const tag = current.tagName.toLowerCase();
      if (current.id) {
        segments.unshift(`${tag}#${CSS.escape(current.id)}`);
        break;
      }

      let segment = tag;
      if (current.classList && current.classList.length > 0) {
        const classes = Array.from(current.classList)
          .filter((cls) => cls && cls.length < 40)
          .slice(0, 2)
          .map((cls) => `.${CSS.escape(cls)}`)
          .join('');
        if (classes) {
          segment += classes;
        }
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === current.tagName
        );
        if (siblings.length > 1) {
          segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }

      segments.unshift(segment);
      current = current.parentElement;
    }

    return segments.join(' > ');
  };

  const selectorCandidates = (element) => {
    const selectors = [];
    if (element.id) selectors.push(`#${CSS.escape(element.id)}`);

    const attrNames = ['data-testid', 'data-test', 'data-cy', 'name', 'role', 'aria-label'];
    for (const attr of attrNames) {
      const value = element.getAttribute(attr);
      if (value) {
        selectors.push(`[${attr}="${String(value).replace(/"/g, '\\"')}"]`);
      }
    }

    if (element.classList && element.classList.length > 0) {
      const classes = Array.from(element.classList)
        .filter((cls) => cls && cls.length < 40)
        .slice(0, 3)
        .map((cls) => `.${CSS.escape(cls)}`);
      if (classes.length > 0) {
        selectors.push(`${element.tagName.toLowerCase()}${classes.join('')}`);
      }
    }

    selectors.push(buildPathSelector(element));
    return Array.from(new Set(selectors.filter(Boolean))).slice(0, 6);
  };

  const shouldIgnoreElement = (element) => {
    return (
      !element ||
      element === overlay ||
      overlay.contains(element) ||
      element.closest('[data-yzpz-browser-overlay="true"]')
    );
  };

  const serializeElement = (element) => {
    const rect = element.getBoundingClientRect();
    const attrs = {};
    for (const attr of Array.from(element.attributes).slice(0, 20)) {
      attrs[attr.name] = attr.value;
    }

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      className: typeof element.className === 'string' ? element.className : null,
      textContent: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      htmlSnippet: (element.outerHTML || '').replace(/\s+/g, ' ').trim().slice(0, 1800),
      selectors: selectorCandidates(element),
      attributes: attrs,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      pageUrl: window.location.href,
      pageTitle: document.title || '',
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  };

  const updateOverlay = (element) => {
    if ((!inspectMode && !pickStyleMode && !pickUiElementMode && !applyMode) || shouldIgnoreElement(element)) {
      clearOverlay();
      return;
    }

    ensureOverlay();

    const rect = element.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = `${Math.max(rect.left, 0)}px`;
    overlay.style.top = `${Math.max(rect.top, 0)}px`;
    overlay.style.width = `${Math.max(rect.width, 0)}px`;
    overlay.style.height = `${Math.max(rect.height, 0)}px`;

    if (pickUiElementMode) {
      overlay.style.border = '2px solid rgba(6, 182, 212, 0.95)';
      overlay.style.background = 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(14, 165, 233, 0.08))';
    } else if (pickStyleMode) {
      overlay.style.border = '2px solid rgba(245, 158, 11, 0.95)';
      overlay.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(251, 191, 36, 0.08))';
    } else if (applyMode) {
      overlay.style.border = '2px solid rgba(59, 130, 246, 0.95)';
      overlay.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(96, 165, 250, 0.08))';
    } else {
      overlay.style.border = '2px solid rgba(16, 185, 129, 0.95)';
      overlay.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(34, 197, 94, 0.08))';
    }

    const labelBits = [element.tagName.toLowerCase()];
    if (element.id) labelBits.push(`#${element.id}`);
    if (element.classList && element.classList.length > 0) {
      const cls = Array.from(element.classList).slice(0, 2).join('.');
      if (cls) labelBits.push(`.${cls}`);
    }
    badge.textContent = labelBits.join('');
    activeElement = element;
  };

  const uiComponentTokens = new Set([
    'app', 'banner', 'block', 'card', 'carousel', 'component', 'content', 'cta',
    'dialog', 'drawer', 'feature', 'footer', 'form', 'gallery', 'grid', 'header',
    'hero', 'item', 'layout', 'list', 'menu', 'modal', 'module', 'nav', 'navbar',
    'panel', 'popover', 'pricing', 'product', 'row', 'section', 'sidebar', 'stack',
    'tab', 'testimonial', 'tile', 'toast', 'toolbar', 'widget'
  ]);
  const uiSemanticTags = new Set(['article', 'aside', 'dialog', 'figure', 'footer', 'form', 'header', 'main', 'nav', 'section']);
  const uiInteractiveTags = new Set(['a', 'button', 'details', 'label', 'li', 'summary']);
  const uiBoundaryRoles = new Set([
    'alert', 'banner', 'complementary', 'contentinfo', 'dialog', 'form', 'grid',
    'group', 'list', 'listitem', 'main', 'menu', 'menubar', 'navigation',
    'region', 'search', 'tablist', 'toolbar'
  ]);

  const elementTokens = (element) => {
    const text = `${element.id || ''} ${typeof element.className === 'string' ? element.className : ''}`;
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  };

  const hasComponentToken = (element) => elementTokens(element).some((token) => uiComponentTokens.has(token));

  const hasCaptureMarker = (element) => (
    element.hasAttribute('data-component') ||
    element.hasAttribute('data-ui') ||
    element.hasAttribute('data-testid') ||
    element.hasAttribute('data-test-id')
  );

  const isUsefulComponentRoot = (element, target) => {
    const tagName = element.tagName.toLowerCase();
    const role = (element.getAttribute('role') || '').toLowerCase();
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;

    const area = rect.width * rect.height;
    const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
    const isVeryLargeGenericShell = area > viewportArea * 1.25 && !uiSemanticTags.has(tagName);
    if (isVeryLargeGenericShell) return false;

    const isSemantic = uiSemanticTags.has(tagName);
    const isInteractive = uiInteractiveTags.has(tagName);
    const isRoleBoundary = uiBoundaryRoles.has(role);
    const hasMarker = hasCaptureMarker(element);
    const hasToken = hasComponentToken(element);
    const mediaOrControls = element.querySelector('img,svg,video,canvas,picture,button,a,input,textarea,select');
    const hasUsefulChildren = element.children.length > 0 || Boolean(mediaOrControls);
    if (element === target) {
      return isInteractive || isSemantic || hasMarker || (hasToken && hasUsefulChildren);
    }

    return isInteractive || isSemantic || isRoleBoundary || hasMarker || hasToken;
  };

  const resolveUiCaptureRoot = (target) => {
    if (!target) return null;
    let current = target;
    let fallback = null;

    while (current && current !== document.documentElement && current !== document.body) {
      if (shouldIgnoreElement(current)) {
        current = current.parentElement;
        continue;
      }

      if (isUsefulComponentRoot(current, target)) {
        return current;
      }

      const rect = current.getBoundingClientRect();
      const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
      if (!fallback && current !== target && current.children.length > 1 && rect.width * rect.height <= viewportArea * 1.1) {
        fallback = current;
      }

      current = current.parentElement;
    }

    return fallback || target;
  };

  const elementFromEvent = (event, options = {}) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || shouldIgnoreElement(target)) {
      return null;
    }
    return options.uiCapture ? resolveUiCaptureRoot(target) : target;
  };

  const flushPointerMove = () => {
    pointerMoveFrame = 0;
    if (!lastPointerEvent) return;
    if (!inspectMode && !pickStyleMode && !pickUiElementMode && !applyMode) return;
    updateOverlay(elementFromEvent(lastPointerEvent, { uiCapture: pickUiElementMode }));
  };

  const handlePointerMove = (event) => {
    if (!inspectMode && !pickStyleMode && !pickUiElementMode && !applyMode) return;
    lastPointerEvent = event;
    if (pointerMoveFrame) return;
    pointerMoveFrame = window.requestAnimationFrame(flushPointerMove);
  };

  const handleScroll = () => {
    if ((!inspectMode && !pickStyleMode && !pickUiElementMode && !applyMode) || !activeElement || !document.contains(activeElement)) return;
    updateOverlay(activeElement);
  };

  const handleClick = (event) => {
    const element = elementFromEvent(event, { uiCapture: pickUiElementMode });
    if (!element) return;

    if (pickUiElementMode) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const tagName = element.tagName.toLowerCase();
      const computedStyles = computeDiffStyles(element);
      const pseudoBefore = capturePseudoStyles(element, '::before');
      const pseudoAfter = capturePseudoStyles(element, '::after');
      const computed = window.getComputedStyle(element);
      const assets = collectAssets(element);
      const hoverSelectors = detectHoverSelectors(element);

      for (const key in computedStyles) {
        computedStyles[key] = resolveUrl(computedStyles[key]);
      }

      const rect = element.getBoundingClientRect();
      const payload = {
        id: 'ui-' + Math.random().toString(36).slice(2, 10),
        sourceUrl: window.location.href,
        pageTitle: document.title || '',
        selector: buildPathSelector(element),
        tagName,
        textContent: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
        htmlSnippet: (element.outerHTML || '').replace(/\s+/g, ' ').trim().slice(0, 20000),
        computedStyles,
        pseudoBefore,
        pseudoAfter,
        layout: {
          width: computed.getPropertyValue('width') || `${Math.round(rect.width)}px`,
          height: computed.getPropertyValue('height') || `${Math.round(rect.height)}px`,
          display: computed.getPropertyValue('display'),
          position: computed.getPropertyValue('position'),
          flexDirection: computed.getPropertyValue('flex-direction') || null,
          justifyContent: computed.getPropertyValue('justify-content') || null,
          alignItems: computed.getPropertyValue('align-items') || null,
          gap: computed.getPropertyValue('gap') || null,
          gridTemplateColumns: computed.getPropertyValue('grid-template-columns') || null,
          gridTemplateRows: computed.getPropertyValue('grid-template-rows') || null,
        },
        spacing: {
          margin: computed.getPropertyValue('margin'),
          padding: computed.getPropertyValue('padding'),
          borderRadius: computed.getPropertyValue('border-radius'),
        },
        typography: {
          fontFamily: computed.getPropertyValue('font-family'),
          fontSize: computed.getPropertyValue('font-size'),
          fontWeight: computed.getPropertyValue('font-weight'),
          lineHeight: computed.getPropertyValue('line-height'),
          letterSpacing: computed.getPropertyValue('letter-spacing'),
          textTransform: computed.getPropertyValue('text-transform'),
        },
        visuals: {
          background: computed.getPropertyValue('background') || computed.getPropertyValue('background-color'),
          color: computed.getPropertyValue('color'),
          border: computed.getPropertyValue('border'),
          boxShadow: computed.getPropertyValue('box-shadow'),
          opacity: computed.getPropertyValue('opacity'),
        },
        interactivity: {
          cursor: computed.getPropertyValue('cursor'),
          transition: computed.getPropertyValue('transition'),
          hoverSelectors,
        },
        assets,
        structure: serializeStructureNode(element),
        designIntent: inferDesignIntent(element, computed, rect, assets, hoverSelectors),
        componentLabel: inferComponentLabel(element),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        timestamp: Date.now(),
      };

      pickUiElementMode = false;
      document.documentElement.style.cursor = '';
      clearOverlay();
      invoke('browser_ui_element_captured', { payload });
      return;
    }

    if (pickStyleMode) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const element = elementFromEvent(event);
      if (!element) return;

      const tagName = element.tagName.toLowerCase();
      const computedStyles = computeDiffStyles(element);
      const pseudoBefore = capturePseudoStyles(element, '::before');
      const pseudoAfter = capturePseudoStyles(element, '::after');

      for (const key in computedStyles) {
        computedStyles[key] = resolveUrl(computedStyles[key]);
      }

      const payload = {
        id: 'cap-' + Math.random().toString(36).slice(2, 9),
        sourceUrl: window.location.href,
        selector: buildPathSelector(element),
        tagName: tagName,
        computedStyles: computedStyles,
        pseudoBefore: pseudoBefore,
        pseudoAfter: pseudoAfter,
        htmlSnippet: (element.outerHTML || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        timestamp: Date.now(),
      };

      pickStyleMode = false;
      document.documentElement.style.cursor = '';
      clearOverlay();
      invoke('browser_style_captured', { payload });
      return;
    }

    if (!inspectMode) return;
    if (applyMode) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const payload = serializeElement(element);
    inspectMode = false;
    document.documentElement.style.cursor = '';
    clearOverlay();
    invoke('browser_element_selected', { payload });
  };

  const handleKeyDown = (event) => {
    if (!inspectMode && !pickUiElementMode && !pickStyleMode) return;
    if (event.key === 'Escape') {
      inspectMode = false;
      pickUiElementMode = false;
      pickStyleMode = false;
      document.documentElement.style.cursor = '';
      clearOverlay();
      invoke('browser_inspect_cancelled');
    }
  };

  const getDocumentHtml = () => {
    const doctype = document.doctype
      ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ''}${document.doctype.systemId ? ` "${document.doctype.systemId}"` : ''}>`
      : '<!DOCTYPE html>';
    return `${doctype}\n${document.documentElement.outerHTML}`;
  };

  const emitPageState = () => {
    const payload = {
      title: document.title || '',
      url: window.location.href,
      historyLength: window.history.length
    };
    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastPageStateKey) {
      return;
    }
    lastPageStateKey = payloadKey;
    invoke('browser_page_state_changed', { payload });
  };

  const scheduleEmitPageState = () => {
    if (pageStateTimer) {
      window.clearTimeout(pageStateTimer);
    }
    pageStateTimer = window.setTimeout(() => {
      pageStateTimer = 0;
      emitPageState();
    }, 80);
  };

  const getBaselineStyles = (tagName) => {
    const el = document.createElement(tagName);
    const parent = document.body || document.documentElement;
    if (!parent) return {};
    parent.appendChild(el);
    const styles = window.getComputedStyle(el);
    const map = {};
    for (let i = 0; i < styles.length; i++) {
      map[styles[i]] = styles.getPropertyValue(styles[i]);
    }
    parent.removeChild(el);
    return map;
  };

  const computeDiffStyles = (element) => {
    const baseline = getBaselineStyles(element.tagName);
    const computed = window.getComputedStyle(element);
    const diff = {};
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      const value = computed.getPropertyValue(prop);
      if (value !== baseline[prop] && value !== '' && value !== 'none' && value !== 'auto' && value !== 'normal' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
        diff[prop] = value;
      }
    }
    return diff;
  };

  const capturePseudoStyles = (element, pseudo) => {
    try {
      const computed = window.getComputedStyle(element, pseudo);
      const map = {};
      let hasValues = false;
      for (let i = 0; i < computed.length; i++) {
        const prop = computed[i];
        const value = computed.getPropertyValue(prop);
        if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '' && value !== 'rgba(0, 0, 0, 0)') {
          map[prop] = value;
          hasValues = true;
        }
      }
      return hasValues ? map : null;
    } catch (e) {
      return null;
    }
  };

  const UI_STRUCTURE_LIMITS = {
    maxDepth: 8,
    maxNodes: 140,
    maxChildrenPerNode: 24,
  };
  const UI_STYLE_SNAPSHOT_PROPERTIES = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'box-sizing',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border', 'border-width', 'border-style', 'border-color', 'border-radius',
    'background', 'background-color', 'background-image', 'background-size', 'background-position',
    'color', 'box-shadow', 'opacity', 'overflow', 'overflow-x', 'overflow-y',
    'transform', 'transition', 'filter', 'backdrop-filter',
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
    'text-align', 'text-transform', 'white-space',
    'flex', 'flex-direction', 'flex-wrap', 'align-items', 'align-self', 'justify-content',
    'gap', 'row-gap', 'column-gap',
    'grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'grid-column', 'grid-row',
    'object-fit', 'object-position', 'aspect-ratio', 'cursor'
  ];

  const hasMeaningfulStyleValue = (value) => (
    value &&
    value !== 'none' &&
    value !== 'normal' &&
    value !== 'auto' &&
    value !== '0px' &&
    value !== 'rgba(0, 0, 0, 0)' &&
    value !== 'transparent'
  );

  const compactStyleMap = (styles, maxEntries = 40) => {
    if (!styles) return null;
    const compact = {};
    for (const [key, value] of Object.entries(styles)) {
      if (!hasMeaningfulStyleValue(value)) continue;
      compact[key] = resolveUrl(value);
      if (Object.keys(compact).length >= maxEntries) break;
    }
    return Object.keys(compact).length > 0 ? compact : null;
  };

  const captureStyleSnapshot = (element) => {
    const computed = window.getComputedStyle(element);
    const styles = {};
    for (const property of UI_STYLE_SNAPSHOT_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (hasMeaningfulStyleValue(value)) {
        styles[property] = resolveUrl(value);
      }
    }
    return styles;
  };

  const captureNodeAttributes = (element) => {
    const attributes = {};
    for (const attr of Array.from(element.attributes).slice(0, 24)) {
      if (attr.name.startsWith('data-yzpz-browser-overlay')) continue;
      attributes[attr.name] = attr.value.slice(0, 300);
    }
    return attributes;
  };

  const captureNodeRect = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };

  const captureNodeLayout = (element, computed) => ({
    width: computed.getPropertyValue('width'),
    height: computed.getPropertyValue('height'),
    display: computed.getPropertyValue('display'),
    position: computed.getPropertyValue('position'),
    flexDirection: computed.getPropertyValue('flex-direction') || null,
    justifyContent: computed.getPropertyValue('justify-content') || null,
    alignItems: computed.getPropertyValue('align-items') || null,
    gap: computed.getPropertyValue('gap') || null,
    gridTemplateColumns: computed.getPropertyValue('grid-template-columns') || null,
    gridTemplateRows: computed.getPropertyValue('grid-template-rows') || null,
  });

  const captureNodeSpacing = (computed) => ({
    margin: computed.getPropertyValue('margin'),
    padding: computed.getPropertyValue('padding'),
    borderRadius: computed.getPropertyValue('border-radius'),
  });

  const captureNodeTypography = (computed) => ({
    fontFamily: computed.getPropertyValue('font-family'),
    fontSize: computed.getPropertyValue('font-size'),
    fontWeight: computed.getPropertyValue('font-weight'),
    lineHeight: computed.getPropertyValue('line-height'),
    letterSpacing: computed.getPropertyValue('letter-spacing'),
    textTransform: computed.getPropertyValue('text-transform'),
  });

  const captureNodeVisuals = (computed) => ({
    background: computed.getPropertyValue('background') || computed.getPropertyValue('background-color'),
    color: computed.getPropertyValue('color'),
    border: computed.getPropertyValue('border'),
    boxShadow: computed.getPropertyValue('box-shadow'),
    opacity: computed.getPropertyValue('opacity'),
  });

  const shallowHtmlSnippet = (element) => {
    const clone = element.cloneNode(false);
    return (clone.outerHTML || element.outerHTML || '').replace(/\s+/g, ' ').trim().slice(0, 900);
  };

  const collectDirectAssets = (element) => {
    const assets = [];
    const pushAsset = (type, sourceUrl, alt = null) => {
      if (!sourceUrl) return;
      assets.push({ type, sourceUrl, alt });
    };

    if (element instanceof HTMLImageElement && element.currentSrc) {
      pushAsset('image', element.currentSrc, element.alt || null);
    }

    if (element.matches && element.matches('svg,[class*="icon"],[data-icon]')) {
      const iconLabel = element.getAttribute('aria-label') || element.getAttribute('data-icon') || element.getAttribute('class') || element.tagName.toLowerCase();
      pushAsset('icon', iconLabel, null);
    }

    const computed = window.getComputedStyle(element);
    const backgroundImage = computed.getPropertyValue('background-image');
    const backgroundMatch = backgroundImage.match(/url\((["']?)(.+?)\1\)/);
    if (backgroundMatch && backgroundMatch[2]) {
      pushAsset('background', resolveUrl(`url(${backgroundMatch[2]})`).replace(/^url\((["']?)(.+)\1\)$/,'$2'), null);
    }

    return assets.slice(0, 4);
  };

  const serializeStructureNode = (element) => {
    let capturedNodeCount = 0;

    const visit = (node, depth) => {
      if (!node || depth > UI_STRUCTURE_LIMITS.maxDepth || capturedNodeCount >= UI_STRUCTURE_LIMITS.maxNodes) {
        return null;
      }

      capturedNodeCount += 1;
      const allChildren = Array.from(node.children).filter((child) => !shouldIgnoreElement(child));
      const children = [];

      for (const child of allChildren) {
        if (children.length >= UI_STRUCTURE_LIMITS.maxChildrenPerNode || capturedNodeCount >= UI_STRUCTURE_LIMITS.maxNodes) {
          break;
        }
        const serialized = visit(child, depth + 1);
        if (serialized) {
          children.push(serialized);
        }
      }

      const computed = window.getComputedStyle(node);

      return {
        tagName: node.tagName.toLowerCase(),
        role: node.getAttribute('role'),
        id: node.id || null,
        className: typeof node.className === 'string' ? node.className.slice(0, 220) : null,
        attributes: captureNodeAttributes(node),
        textPreview: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600),
        htmlSnippet: shallowHtmlSnippet(node),
        rect: captureNodeRect(node),
        computedStyles: captureStyleSnapshot(node),
        pseudoBefore: compactStyleMap(capturePseudoStyles(node, '::before'), 28),
        pseudoAfter: compactStyleMap(capturePseudoStyles(node, '::after'), 28),
        layout: captureNodeLayout(node, computed),
        spacing: captureNodeSpacing(computed),
        typography: captureNodeTypography(computed),
        visuals: captureNodeVisuals(computed),
        assets: collectDirectAssets(node),
        childCount: allChildren.length,
        capturedChildCount: children.length,
        truncatedChildren: children.length < allChildren.length,
        children,
      };
    };

    const root = visit(element, 0);
    if (root) {
      root.captureStats = {
        capturedNodeCount,
        maxNodes: UI_STRUCTURE_LIMITS.maxNodes,
        maxDepth: UI_STRUCTURE_LIMITS.maxDepth,
        maxChildrenPerNode: UI_STRUCTURE_LIMITS.maxChildrenPerNode,
      };
    }

    return root;
  };

  const collectAssets = (element) => {
    const assets = [];

    const pushAsset = (type, sourceUrl, alt = null) => {
      if (!sourceUrl) return;
      assets.push({ type, sourceUrl, alt });
    };

    if (element instanceof HTMLImageElement && element.currentSrc) {
      pushAsset('image', element.currentSrc, element.alt || null);
    }

    for (const img of Array.from(element.querySelectorAll('img')).slice(0, 6)) {
      if (img.currentSrc) {
        pushAsset('image', img.currentSrc, img.alt || null);
      }
    }

    const computed = window.getComputedStyle(element);
    const backgroundImage = computed.getPropertyValue('background-image');
    const backgroundMatch = backgroundImage.match(/url\((["']?)(.+?)\1\)/);
    if (backgroundMatch && backgroundMatch[2]) {
      pushAsset('background', resolveUrl(`url(${backgroundMatch[2]})`).replace(/^url\((["']?)(.+)\1\)$/,'$2'), null);
    }

    for (const icon of Array.from(element.querySelectorAll('svg,[class*="icon"],[data-icon]')).slice(0, 6)) {
      const iconLabel = icon.getAttribute('aria-label') || icon.getAttribute('data-icon') || icon.getAttribute('class') || 'icon';
      pushAsset('icon', iconLabel, null);
    }

    return assets.slice(0, 8);
  };

  const detectHoverSelectors = (element) => {
    const selectors = new Set();
    const candidates = selectorCandidates(element);

    for (const sheet of Array.from(document.styleSheets)) {
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch (_error) {
        continue;
      }

      if (!rules) continue;

      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule) || !rule.selectorText || !rule.selectorText.includes(':hover')) {
          continue;
        }

        for (const candidate of candidates) {
          const normalizedCandidate = candidate.replace(/:nth-of-type\(\d+\)/g, '');
          if (rule.selectorText.includes(normalizedCandidate)) {
            selectors.add(rule.selectorText.slice(0, 180));
          }
        }
      }
    }

    return Array.from(selectors).slice(0, 6);
  };

  const inferComponentLabel = (element) => {
    const classText = `${element.className || ''}`.toLowerCase();
    const text = (element.textContent || '').trim();
    if (classText.includes('hero')) return 'Hero section';
    if (classText.includes('nav') || element.tagName.toLowerCase() === 'nav') return 'Navigation';
    if (classText.includes('modal') || element.getAttribute('role') === 'dialog') return 'Modal';
    if (classText.includes('card')) return 'Card';
    if (classText.includes('price')) return 'Pricing block';
    if (element.tagName.toLowerCase() === 'button') return 'Button';
    if (element.tagName.toLowerCase() === 'form' || classText.includes('form')) return 'Form';
    if (text.length > 0 && text.length < 40) return `${text.slice(0, 32)}${text.length > 32 ? '…' : ''}`;
    return `${element.tagName.toLowerCase()} component`;
  };

  const inferDesignIntent = (element, computed, rect, assets, hoverSelectors) => {
    const traits = [];
    const display = computed.getPropertyValue('display');
    const background = computed.getPropertyValue('background-color');
    const boxShadow = computed.getPropertyValue('box-shadow');
    const radius = computed.getPropertyValue('border-radius');
    const fontWeight = computed.getPropertyValue('font-weight');

    if (display.includes('flex')) traits.push('flex-based composition');
    if (display.includes('grid')) traits.push('grid-based layout');
    if (boxShadow && boxShadow !== 'none') traits.push('elevated surface styling');
    if (background && background !== 'rgba(0, 0, 0, 0)') traits.push('intentional background contrast');
    if (radius && radius !== '0px') traits.push('rounded geometry');
    if (Number.parseInt(fontWeight, 10) >= 600) traits.push('strong type hierarchy');
    if (assets.length > 0) traits.push('paired with supporting media or iconography');
    if (hoverSelectors.length > 0) traits.push('interactive hover treatment');
    if (rect.width >= Math.max(window.innerWidth * 0.65, 720)) traits.push('section-scale presentation');
    if (element.children.length >= 3) traits.push('multi-part composition');

    return traits.length > 0
      ? `This element reads as a ${inferComponentLabel(element).toLowerCase()} with ${traits.join(', ')}.`
      : `This element reads as a focused ${inferComponentLabel(element).toLowerCase()} with a straightforward visual treatment.`;
  };

  const resolveUrl = (value) => {
    if (typeof value !== 'string') return value;
    return value.replace(/url\((["']?)(.+?)\1\)/g, (match, quote, url) => {
      if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('//')) return match;
      try {
        return `url(${quote}${new URL(url, window.location.href).href}${quote})`;
      } catch {
        return match;
      }
    });
  };

  const applyStyleToElement = (element, styles) => {
    const inline = {};
    for (const [key, value] of Object.entries(styles)) {
      inline[key] = element.style.getPropertyValue(key);
      element.style.setProperty(key, value, 'important');
    }
    return inline;
  };

  const restoreStyleToElement = (element, backup) => {
    for (const key of Object.keys(backup)) {
      if (backup[key] === '') {
        element.style.removeProperty(key);
      } else {
        element.style.setProperty(key, backup[key]);
      }
    }
  };

  const generateClassName = () => 'yzpz-copied-' + Math.random().toString(36).slice(2, 8);

  const handleContextMenu = () => {
    // Pick style mode now uses left-click via handleClick
  };

  const handleApplyMouseOver = (event) => {
    if (!applyMode || !applyPayload) return;
    const element = elementFromEvent(event);
    if (!element) return;
    if (applyHoverTarget === element) return;

    if (applyHoverTarget && applyHoverBackup) {
      restoreStyleToElement(applyHoverTarget, applyHoverBackup);
    }

    applyHoverTarget = element;
    applyHoverBackup = applyStyleToElement(element, applyPayload.computedStyles);
    updateOverlay(element);
  };

  const handleApplyMouseOut = (event) => {
    if (!applyMode || !applyPayload) return;
    if (applyHoverTarget && applyHoverBackup) {
      restoreStyleToElement(applyHoverTarget, applyHoverBackup);
      applyHoverTarget = null;
      applyHoverBackup = null;
      clearOverlay();
    }
  };

  const handleApplyClick = (event) => {
    if (!applyMode || !applyPayload) return;
    const element = elementFromEvent(event);
    if (!element) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (applyHoverTarget && applyHoverBackup) {
      restoreStyleToElement(applyHoverTarget, applyHoverBackup);
    }

    const className = generateClassName();
    const cssRules = [];
    const ruleBody = Object.entries(applyPayload.computedStyles)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
    cssRules.push(`.${className} {\n${ruleBody}\n}`);

    if (applyPayload.pseudoBefore) {
      const beforeBody = Object.entries(applyPayload.pseudoBefore)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n');
      cssRules.push(`.${className}::before {\n${beforeBody}\n}`);
    }
    if (applyPayload.pseudoAfter) {
      const afterBody = Object.entries(applyPayload.pseudoAfter)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n');
      cssRules.push(`.${className}::after {\n${afterBody}\n}`);
    }

    let styleTag = document.getElementById('yzpz-injected-styles');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'yzpz-injected-styles';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent += '\n' + cssRules.join('\n');

    const originalClassName = element.className;
    element.classList.add(className);

    undoStack.push({
      element,
      originalClassName,
      className,
      cssRules,
    });

    applyMode = false;
    applyPayload = null;
    applyHoverTarget = null;
    applyHoverBackup = null;
    document.documentElement.style.cursor = '';
    clearOverlay();

    invoke('browser_style_applied', { payload: { targetSelector: buildPathSelector(element), className, cssRules } });
  };

  const handleUndoLastStyle = () => {
    const entry = undoStack.pop();
    if (!entry) return;
    const { element, originalClassName, className } = entry;
    if (document.contains(element)) {
      element.classList.remove(className);
      if (typeof originalClassName === 'string') {
        element.className = originalClassName;
      }
    }
  };

  styleOverlay();

  window.addEventListener('mousemove', handlePointerMove, true);
  window.addEventListener('scroll', handleScroll, true);
  window.addEventListener('resize', handleScroll, true);
  window.addEventListener('click', handleClick, true);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('load', scheduleEmitPageState, true);
  window.addEventListener('pageshow', scheduleEmitPageState, true);
  window.addEventListener('popstate', scheduleEmitPageState, true);

  const titleElement = document.querySelector('title');
  if (titleElement) {
    const titleObserver = new MutationObserver(() => scheduleEmitPageState());
    titleObserver.observe(titleElement, { childList: true, subtree: true, characterData: true });
  }

  window.__YZPZ_BROWSER_BRIDGE__ = {
    setInspectMode(value) {
      inspectMode = !!value;
      pickStyleMode = false;
      pickUiElementMode = false;
      applyMode = false;
      applyPayload = null;
      document.documentElement.style.cursor = inspectMode ? 'crosshair' : '';
      if (!inspectMode) {
        clearOverlay();
      }
    },
    setPickStyleMode(value) {
      pickStyleMode = !!value;
      inspectMode = false;
      pickUiElementMode = false;
      applyMode = false;
      applyPayload = null;
      document.documentElement.style.cursor = pickStyleMode ? 'copy' : '';
      if (!pickStyleMode) {
        clearOverlay();
      }
    },
    setPickUiElementMode(value) {
      pickUiElementMode = !!value;
      inspectMode = false;
      pickStyleMode = false;
      applyMode = false;
      applyPayload = null;
      document.documentElement.style.cursor = pickUiElementMode ? 'crosshair' : '';
      if (!pickUiElementMode) {
        clearOverlay();
      }
    },
    setApplyMode(payload) {
      applyPayload = payload || null;
      applyMode = !!payload;
      inspectMode = false;
      pickStyleMode = false;
      pickUiElementMode = false;
      document.documentElement.style.cursor = applyMode ? 'pointer' : '';
      if (!applyMode) {
        if (applyHoverTarget && applyHoverBackup) {
          restoreStyleToElement(applyHoverTarget, applyHoverBackup);
          applyHoverTarget = null;
          applyHoverBackup = null;
        }
        clearOverlay();
      }
    },
    setPreviewChrome(payload) {
      previewChrome = payload || null;
      applyPreviewChrome();
    },
    undoLastStyle() {
      handleUndoLastStyle();
    },
    goBack() {
      window.history.back();
    },
    goForward() {
      window.history.forward();
    },
    exportSnapshot() {
      invoke('browser_snapshot_exported', {
        payload: {
          title: document.title || '',
          url: window.location.href,
          html: getDocumentHtml()
        }
      });
    },
    emitPageState() {
      scheduleEmitPageState();
    }
  };

  window.addEventListener('contextmenu', handleContextMenu, true);
  window.addEventListener('mouseover', handleApplyMouseOver, true);
  window.addEventListener('mouseout', handleApplyMouseOut, true);
  window.addEventListener('click', handleApplyClick, true);

  scheduleEmitPageState();
  setTimeout(applyPreviewChrome, 0);
})();
"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserViewState {
    pub workspace_id: String,
    pub label: String,
    pub current_url: String,
    pub visible: bool,
    pub inspect_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPopoutStatePayload {
    pub workspace_id: String,
    pub popped_out: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPageLoadPayload {
    pub workspace_id: String,
    pub url: String,
    pub event: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInspectModePayload {
    pub workspace_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPageStatePayload {
    pub workspace_id: String,
    pub url: String,
    pub title: String,
    pub history_length: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPageStateCommandPayload {
    pub url: String,
    pub title: String,
    pub history_length: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSnapshotPayload {
    pub workspace_id: String,
    pub url: String,
    pub title: String,
    pub html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSnapshotCommandPayload {
    pub url: String,
    pub title: String,
    pub html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserElementRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserViewport {
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSelectedElementPayload {
    pub tag_name: String,
    pub id: Option<String>,
    pub class_name: Option<String>,
    pub text_content: String,
    pub html_snippet: String,
    pub selectors: Vec<String>,
    pub attributes: HashMap<String, String>,
    pub rect: BrowserElementRect,
    pub page_url: String,
    pub page_title: String,
    pub viewport: BrowserViewport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserElementSelectedEventPayload {
    pub workspace_id: String,
    pub element: BrowserSelectedElementPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedStyle {
    pub id: String,
    pub source_url: String,
    pub selector: String,
    pub tag_name: String,
    pub computed_styles: std::collections::HashMap<String, String>,
    pub pseudo_before: Option<std::collections::HashMap<String, String>>,
    pub pseudo_after: Option<std::collections::HashMap<String, String>>,
    pub html_snippet: String,
    pub viewport: BrowserViewport,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUiElementCaptureStats {
    pub captured_node_count: u64,
    pub max_nodes: u64,
    pub max_depth: u64,
    pub max_children_per_node: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUiElementNode {
    pub tag_name: String,
    pub role: Option<String>,
    pub id: Option<String>,
    pub class_name: Option<String>,
    #[serde(default)]
    pub attributes: HashMap<String, String>,
    pub text_preview: String,
    #[serde(default)]
    pub html_snippet: Option<String>,
    #[serde(default)]
    pub rect: Option<BrowserElementRect>,
    #[serde(default)]
    pub computed_styles: HashMap<String, String>,
    pub pseudo_before: Option<HashMap<String, String>>,
    pub pseudo_after: Option<HashMap<String, String>>,
    #[serde(default)]
    pub layout: Option<BrowserUiElementLayout>,
    #[serde(default)]
    pub spacing: Option<BrowserUiElementSpacing>,
    #[serde(default)]
    pub typography: Option<BrowserUiElementTypography>,
    #[serde(default)]
    pub visuals: Option<BrowserUiElementVisuals>,
    #[serde(default)]
    pub assets: Vec<BrowserUiElementAsset>,
    pub child_count: u64,
    #[serde(default)]
    pub captured_child_count: u64,
    #[serde(default)]
    pub truncated_children: bool,
    #[serde(default)]
    pub capture_stats: Option<BrowserUiElementCaptureStats>,
    pub children: Vec<BrowserUiElementNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUiElementAsset {
    #[serde(rename = "type")]
    pub asset_type: String,
    pub source_url: String,
    pub alt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUiElementLayout {
    pub width: String,
    pub height: String,
    pub display: String,
    pub position: String,
    pub flex_direction: Option<String>,
    pub justify_content: Option<String>,
    pub align_items: Option<String>,
    pub gap: Option<String>,
    pub grid_template_columns: Option<String>,
    pub grid_template_rows: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUiElementSpacing {
    pub margin: String,
    pub padding: String,
    pub border_radius: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUiElementTypography {
    pub font_family: String,
    pub font_size: String,
    pub font_weight: String,
    pub line_height: String,
    pub letter_spacing: String,
    pub text_transform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUiElementVisuals {
    pub background: String,
    pub color: String,
    pub border: String,
    pub box_shadow: String,
    pub opacity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUiElementInteractivity {
    pub cursor: String,
    pub transition: String,
    pub hover_selectors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUiElementReference {
    pub id: String,
    pub source_url: String,
    pub page_title: String,
    pub selector: String,
    pub tag_name: String,
    pub text_content: String,
    pub html_snippet: String,
    pub computed_styles: std::collections::HashMap<String, String>,
    pub pseudo_before: Option<std::collections::HashMap<String, String>>,
    pub pseudo_after: Option<std::collections::HashMap<String, String>>,
    pub layout: BrowserUiElementLayout,
    pub spacing: BrowserUiElementSpacing,
    pub typography: BrowserUiElementTypography,
    pub visuals: BrowserUiElementVisuals,
    pub interactivity: BrowserUiElementInteractivity,
    pub assets: Vec<BrowserUiElementAsset>,
    pub structure: BrowserUiElementNode,
    pub design_intent: String,
    pub component_label: String,
    pub viewport: BrowserViewport,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPreviewChrome {
    pub radius: u32,
    pub mode: Option<String>,
    pub top_inset: Option<u32>,
    pub orientation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleApplyPayload {
    pub target_selector: String,
    pub class_name: String,
    pub css_rules: Vec<String>,
}

#[derive(Debug, Clone)]
struct BrowserInstance {
    label: String,
    embedded_label: String,
    current_url: String,
    visible: bool,
    inspect_mode: bool,
    zoom_factor: f64,
    preview_chrome: Option<BrowserPreviewChrome>,
    popped_out: bool,
}

#[derive(Clone)]
pub struct BrowserManager {
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    instances: Arc<Mutex<HashMap<String, BrowserInstance>>>,
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            app_handle: Arc::new(Mutex::new(None)),
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        let mut app = self.app_handle.lock().unwrap();
        *app = Some(handle);
    }

    pub fn ensure_view(
        &self,
        workspace_id: &str,
        url: &str,
        bounds: BrowserBounds,
    ) -> Result<BrowserViewState> {
        let app = self.app_handle()?;
        let label = self.label_for_workspace(workspace_id);
        let resolved_url = resolve_browser_url(url);

        if let Some(instance) = self.instances.lock().unwrap().get(workspace_id).cloned() {
            if instance.popped_out {
                if let Some(webview) = app.get_webview(&instance.label) {
                    webview.show()?;
                    webview.set_zoom(instance.zoom_factor)?;
                    self.emit_popout_state(workspace_id, true)?;
                    return Ok(BrowserViewState {
                        workspace_id: workspace_id.to_string(),
                        label: instance.label,
                        current_url: webview
                            .url()
                            .ok()
                            .map(|value| value.to_string())
                            .unwrap_or(instance.current_url),
                        visible: true,
                        inspect_mode: instance.inspect_mode,
                    });
                }

                self.mark_popout_closed(workspace_id, &instance.label)?;
            }
        }

        let existing = self.instances.lock().unwrap().get(workspace_id).cloned();
        let existing_inspect = existing
            .as_ref()
            .map(|instance| instance.inspect_mode)
            .unwrap_or(false);
        let existing_zoom = existing
            .as_ref()
            .map(|instance| instance.zoom_factor)
            .unwrap_or(1.0);
        let existing_preview_chrome = existing
            .as_ref()
            .and_then(|instance| instance.preview_chrome.clone());

        if let Some(webview) = app.get_webview(&label) {
            self.apply_bounds(&webview, &bounds)?;
            webview.show()?;
            let current_url = webview
                .url()
                .ok()
                .map(|value| value.to_string())
                .or_else(|| {
                    self.instances
                        .lock()
                        .unwrap()
                        .get(workspace_id)
                        .map(|instance| instance.current_url.clone())
                });
            webview.set_zoom(existing_zoom)?;

            // Re-showing an existing webview should not trigger a navigation.
            // Explicit URL changes go through `navigate()`, which keeps the
            // browser from snapping back to a default page during UI churn.
            let current_url = current_url.unwrap_or_else(|| resolved_url.clone());

            let state = BrowserViewState {
                workspace_id: workspace_id.to_string(),
                label: label.clone(),
                current_url: current_url.clone(),
                visible: true,
                inspect_mode: existing_inspect,
            };

            self.instances.lock().unwrap().insert(
                workspace_id.to_string(),
                BrowserInstance {
                    label: label.clone(),
                    embedded_label: label,
                    current_url,
                    visible: true,
                    inspect_mode: existing_inspect,
                    zoom_factor: existing_zoom,
                    preview_chrome: existing_preview_chrome.clone(),
                    popped_out: false,
                },
            );

            if existing_inspect {
                self.set_inspect_mode(workspace_id, true)?;
            }
            if let Some(chrome) = existing_preview_chrome {
                self.set_preview_chrome(workspace_id, Some(chrome))?;
            }

            return Ok(state);
        } else {
            let window = self.main_window(&app)?;
            let parsed_url = Url::parse(&resolved_url)
                .with_context(|| format!("Invalid browser URL: {resolved_url}"))?;
            let workspace_id_owned = workspace_id.to_string();
            let manager = self.clone();

            let builder = WebviewBuilder::new(label.clone(), WebviewUrl::External(parsed_url))
                .initialization_script(BROWSER_INIT_SCRIPT)
                .accept_first_mouse(true)
                .on_page_load(move |webview, payload| {
                    let _ = manager.handle_page_load(
                        workspace_id_owned.clone(),
                        webview,
                        payload.url().to_string(),
                        payload.event(),
                    );
                });

            let webview = window.add_child(
                builder,
                LogicalPosition::new(bounds.x, bounds.y),
                LogicalSize::new(bounds.width, bounds.height),
            )?;
            webview.set_auto_resize(false)?;
            webview.set_zoom(existing_zoom)?;
        }

        let current_url = if url.is_empty() {
            app.get_webview(&label)
                .and_then(|webview| webview.url().ok())
                .map(|value| value.to_string())
                .unwrap_or_default()
        } else {
            resolve_browser_url(url)
        };

        let state = BrowserViewState {
            workspace_id: workspace_id.to_string(),
            label: label.clone(),
            current_url: current_url.clone(),
            visible: true,
            inspect_mode: existing_inspect,
        };

        self.instances.lock().unwrap().insert(
            workspace_id.to_string(),
            BrowserInstance {
                label: label.clone(),
                embedded_label: label,
                current_url,
                visible: true,
                inspect_mode: existing_inspect,
                zoom_factor: existing_zoom,
                preview_chrome: existing_preview_chrome.clone(),
                popped_out: false,
            },
        );

        if existing_inspect {
            self.set_inspect_mode(workspace_id, true)?;
        }
        if let Some(chrome) = existing_preview_chrome {
            self.set_preview_chrome(workspace_id, Some(chrome))?;
        }

        Ok(state)
    }

    pub fn resize_view(&self, workspace_id: &str, bounds: BrowserBounds) -> Result<()> {
        let webview = self.webview_for_workspace(workspace_id)?;
        self.apply_bounds(&webview, &bounds)?;
        Ok(())
    }

    pub fn navigate(&self, workspace_id: &str, url: &str) -> Result<BrowserViewState> {
        let webview = self.webview_for_workspace(workspace_id)?;
        let resolved_url = resolve_browser_url(url);
        self.navigate_webview(&webview, &resolved_url)?;

        let mut instances = self.instances.lock().unwrap();
        let instance = instances
            .get_mut(workspace_id)
            .context("Browser view not registered")?;
        instance.current_url = resolved_url.clone();

        Ok(BrowserViewState {
            workspace_id: workspace_id.to_string(),
            label: instance.label.clone(),
            current_url: instance.current_url.clone(),
            visible: instance.visible,
            inspect_mode: instance.inspect_mode,
        })
    }

    pub fn reload(&self, workspace_id: &str) -> Result<()> {
        self.webview_for_workspace(workspace_id)?.reload()?;
        Ok(())
    }

    pub fn set_zoom(&self, workspace_id: &str, zoom_factor: f64) -> Result<()> {
        if let Some(instance) = self.instances.lock().unwrap().get_mut(workspace_id) {
            if (instance.zoom_factor - zoom_factor).abs() < f64::EPSILON {
                return Ok(());
            }
        }

        let webview = self.webview_for_workspace(workspace_id)?;
        webview.set_zoom(zoom_factor)?;

        if let Some(instance) = self.instances.lock().unwrap().get_mut(workspace_id) {
            instance.zoom_factor = zoom_factor;
        }

        Ok(())
    }

    pub fn go_back(&self, workspace_id: &str) -> Result<()> {
        self.webview_for_workspace(workspace_id)?
            .eval("window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.goBack();")?;
        Ok(())
    }

    pub fn go_forward(&self, workspace_id: &str) -> Result<()> {
        self.webview_for_workspace(workspace_id)?.eval(
            "window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.goForward();",
        )?;
        Ok(())
    }

    pub fn request_snapshot(&self, workspace_id: &str) -> Result<()> {
        self.webview_for_workspace(workspace_id)?.eval(
            "window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.exportSnapshot();",
        )?;
        Ok(())
    }

    pub fn set_visibility(&self, workspace_id: &str, visible: bool) -> Result<()> {
        let webview = self.webview_for_workspace(workspace_id)?;
        if visible {
            webview.show()?;
        } else {
            webview.hide()?;
        }

        if let Some(instance) = self.instances.lock().unwrap().get_mut(workspace_id) {
            instance.visible = visible;
        }

        Ok(())
    }

    pub fn pop_out(&self, workspace_id: &str, url: &str) -> Result<BrowserViewState> {
        let app = self.app_handle()?;
        let embedded_label = self.label_for_workspace(workspace_id);
        let popout_label = self.popout_label_for_workspace(workspace_id);
        let resolved_url = resolve_browser_url(url);
        let existing = self.instances.lock().unwrap().get(workspace_id).cloned();
        let current_url = existing
            .as_ref()
            .and_then(|instance| {
                app.get_webview(&instance.label)
                    .and_then(|webview| webview.url().ok())
                    .map(|value| value.to_string())
            })
            .unwrap_or_else(|| {
                existing
                    .as_ref()
                    .map(|instance| instance.current_url.clone())
                    .unwrap_or(resolved_url)
            });
        let inspect_mode = existing
            .as_ref()
            .map(|instance| instance.inspect_mode)
            .unwrap_or(false);
        let zoom_factor = existing
            .as_ref()
            .map(|instance| instance.zoom_factor)
            .unwrap_or(1.0);

        if let Some(window) = app.get_webview_window(&popout_label) {
            window.show()?;
            window.set_focus()?;
            window.set_zoom(zoom_factor)?;
            if !browser_urls_match_runtime(
                window
                    .url()
                    .ok()
                    .as_ref()
                    .map(|value| value.as_str())
                    .unwrap_or(""),
                &current_url,
            ) {
                self.navigate_webview_window(&window, &current_url)?;
            }
        } else {
            let parsed_url = Url::parse(&current_url)
                .with_context(|| format!("Invalid browser URL: {current_url}"))?;
            let workspace_for_load = workspace_id.to_string();
            let workspace_for_close = workspace_id.to_string();
            let popout_for_close = popout_label.clone();
            let manager_for_load = self.clone();
            let manager_for_close = self.clone();

            let window = WebviewWindowBuilder::new(
                &app,
                popout_label.clone(),
                WebviewUrl::External(parsed_url),
            )
            .title("YzPzCode Browser")
            .inner_size(1280.0, 820.0)
            .min_inner_size(480.0, 360.0)
            .resizable(true)
            .decorations(true)
            .accept_first_mouse(true)
            .initialization_script(BROWSER_INIT_SCRIPT)
            .on_page_load(move |window, payload| {
                let _ = manager_for_load.handle_page_load(
                    workspace_for_load.clone(),
                    window.as_ref().clone(),
                    payload.url().to_string(),
                    payload.event(),
                );
            })
            .build()?;

            window.set_zoom(zoom_factor)?;
            window.on_window_event(move |event| {
                if matches!(event, WindowEvent::Destroyed) {
                    let _ = manager_for_close
                        .mark_popout_closed(&workspace_for_close, &popout_for_close);
                }
            });
        }

        if let Some(webview) = app.get_webview(&embedded_label) {
            if embedded_label != popout_label {
                let _ = webview.close();
            }
        }

        self.instances.lock().unwrap().insert(
            workspace_id.to_string(),
            BrowserInstance {
                label: popout_label.clone(),
                embedded_label,
                current_url: current_url.clone(),
                visible: true,
                inspect_mode,
                zoom_factor,
                preview_chrome: None,
                popped_out: true,
            },
        );

        if inspect_mode {
            self.set_inspect_mode(workspace_id, true)?;
        }

        self.emit_popout_state(workspace_id, true)?;

        Ok(BrowserViewState {
            workspace_id: workspace_id.to_string(),
            label: popout_label,
            current_url,
            visible: true,
            inspect_mode,
        })
    }

    pub fn dock(&self, workspace_id: &str) -> Result<()> {
        let instance = self
            .instances
            .lock()
            .unwrap()
            .get(workspace_id)
            .cloned()
            .context("Browser view not registered")?;

        if instance.popped_out {
            let app = self.app_handle()?;
            let current_url = app
                .get_webview_window(&instance.label)
                .and_then(|window| window.url().ok())
                .map(|value| value.to_string())
                .unwrap_or(instance.current_url.clone());

            if let Some(window) = app.get_webview_window(&instance.label) {
                let _ = window.close();
            }

            self.instances.lock().unwrap().insert(
                workspace_id.to_string(),
                BrowserInstance {
                    label: instance.embedded_label.clone(),
                    embedded_label: instance.embedded_label,
                    current_url,
                    visible: false,
                    inspect_mode: instance.inspect_mode,
                    zoom_factor: instance.zoom_factor,
                    preview_chrome: None,
                    popped_out: false,
                },
            );
        }

        self.emit_popout_state(workspace_id, false)?;
        Ok(())
    }

    pub fn close(&self, workspace_id: &str) -> Result<()> {
        let instance = self
            .instances
            .lock()
            .unwrap()
            .get(workspace_id)
            .cloned()
            .context("Browser view not registered")?;

        let app = self.app_handle()?;
        if instance.popped_out {
            if let Some(window) = app.get_webview_window(&instance.label) {
                window.close()?;
            }
        } else if let Some(webview) = app.get_webview(&instance.label) {
            webview.close()?;
        }

        self.instances.lock().unwrap().remove(workspace_id);
        Ok(())
    }

    pub fn close_all(&self) -> Result<()> {
        let workspace_ids: Vec<String> = self.instances.lock().unwrap().keys().cloned().collect();

        for workspace_id in workspace_ids {
            let _ = self.close(&workspace_id);
        }

        Ok(())
    }

    pub fn set_inspect_mode(&self, workspace_id: &str, enabled: bool) -> Result<()> {
        let webview = self.webview_for_workspace(workspace_id)?;
        webview.eval(inspect_mode_script(enabled))?;

        if let Some(instance) = self.instances.lock().unwrap().get_mut(workspace_id) {
            instance.inspect_mode = enabled;
        }

        self.emit_event(
            BROWSER_INSPECT_MODE_EVENT,
            &BrowserInspectModePayload {
                workspace_id: workspace_id.to_string(),
                enabled,
            },
        )?;

        Ok(())
    }

    pub fn handle_element_selected(
        &self,
        webview_label: &str,
        payload: BrowserSelectedElementPayload,
    ) -> Result<()> {
        let workspace_id = self.workspace_for_label(webview_label)?;

        if let Some(instance) = self.instances.lock().unwrap().get_mut(&workspace_id) {
            instance.inspect_mode = false;
        }

        self.emit_event(
            BROWSER_INSPECT_MODE_EVENT,
            &BrowserInspectModePayload {
                workspace_id: workspace_id.clone(),
                enabled: false,
            },
        )?;

        self.emit_event(
            BROWSER_ELEMENT_SELECTED_EVENT,
            &BrowserElementSelectedEventPayload {
                workspace_id,
                element: payload,
            },
        )?;
        Ok(())
    }

    pub fn handle_inspect_cancelled(&self, webview_label: &str) -> Result<()> {
        let workspace_id = self.workspace_for_label(webview_label)?;

        if let Some(instance) = self.instances.lock().unwrap().get_mut(&workspace_id) {
            instance.inspect_mode = false;
        }

        self.emit_event(
            BROWSER_INSPECT_MODE_EVENT,
            &BrowserInspectModePayload {
                workspace_id,
                enabled: false,
            },
        )?;
        Ok(())
    }

    pub fn handle_page_state_changed(
        &self,
        webview_label: &str,
        payload: BrowserPageStateCommandPayload,
    ) -> Result<()> {
        let workspace_id = self.workspace_for_label(webview_label)?;

        if let Some(instance) = self.instances.lock().unwrap().get_mut(&workspace_id) {
            instance.current_url = payload.url.clone();
        }

        self.emit_event(
            BROWSER_PAGE_STATE_EVENT,
            &BrowserPageStatePayload {
                workspace_id,
                url: payload.url,
                title: payload.title,
                history_length: payload.history_length,
            },
        )?;
        Ok(())
    }

    pub fn handle_snapshot_exported(
        &self,
        webview_label: &str,
        payload: BrowserSnapshotCommandPayload,
    ) -> Result<()> {
        let workspace_id = self.workspace_for_label(webview_label)?;

        self.emit_event(
            BROWSER_SNAPSHOT_READY_EVENT,
            &BrowserSnapshotPayload {
                workspace_id,
                url: payload.url,
                title: payload.title,
                html: payload.html,
            },
        )?;
        Ok(())
    }

    pub fn set_pick_style_mode(&self, workspace_id: &str, enabled: bool) -> Result<()> {
        let webview = self.webview_for_workspace(workspace_id)?;
        webview.eval(pick_style_mode_script(enabled))?;

        self.emit_event(
            BROWSER_INSPECT_MODE_EVENT,
            &BrowserInspectModePayload {
                workspace_id: workspace_id.to_string(),
                enabled: false,
            },
        )?;
        Ok(())
    }

    pub fn set_preview_chrome(
        &self,
        workspace_id: &str,
        chrome: Option<BrowserPreviewChrome>,
    ) -> Result<()> {
        let webview = self.webview_for_workspace(workspace_id)?;
        webview.eval(preview_chrome_script(chrome.clone()))?;

        if let Some(instance) = self.instances.lock().unwrap().get_mut(workspace_id) {
            instance.preview_chrome = chrome;
        }

        Ok(())
    }

    pub fn set_pick_ui_element_mode(&self, workspace_id: &str, enabled: bool) -> Result<()> {
        let webview = self.webview_for_workspace(workspace_id)?;
        webview.eval(pick_ui_element_mode_script(enabled))?;

        self.emit_event(
            BROWSER_INSPECT_MODE_EVENT,
            &BrowserInspectModePayload {
                workspace_id: workspace_id.to_string(),
                enabled: false,
            },
        )?;
        Ok(())
    }

    pub fn set_apply_mode(
        &self,
        workspace_id: &str,
        style_payload: Option<CapturedStyle>,
    ) -> Result<()> {
        let webview = self.webview_for_workspace(workspace_id)?;
        webview.eval(apply_mode_script(style_payload))?;
        Ok(())
    }

    pub fn undo_last_style(&self, workspace_id: &str) -> Result<()> {
        let webview = self.webview_for_workspace(workspace_id)?;
        webview.eval(undo_style_script())?;
        Ok(())
    }

    pub fn handle_style_captured(&self, webview_label: &str, payload: CapturedStyle) -> Result<()> {
        let workspace_id = self.workspace_for_label(webview_label)?;
        self.emit_event(BROWSER_STYLE_CAPTURED_EVENT, &payload)?;
        self.emit_event(
            BROWSER_INSPECT_MODE_EVENT,
            &BrowserInspectModePayload {
                workspace_id: workspace_id.clone(),
                enabled: false,
            },
        )?;
        Ok(())
    }

    pub fn handle_ui_element_captured(
        &self,
        webview_label: &str,
        payload: BrowserUiElementReference,
    ) -> Result<()> {
        let workspace_id = self.workspace_for_label(webview_label)?;
        self.emit_event(BROWSER_UI_ELEMENT_CAPTURED_EVENT, &payload)?;
        self.emit_event(
            BROWSER_INSPECT_MODE_EVENT,
            &BrowserInspectModePayload {
                workspace_id,
                enabled: false,
            },
        )?;
        Ok(())
    }

    pub fn handle_style_applied(
        &self,
        webview_label: &str,
        payload: StyleApplyPayload,
    ) -> Result<()> {
        let _workspace_id = self.workspace_for_label(webview_label)?;
        self.emit_event(BROWSER_STYLE_APPLIED_EVENT, &payload)?;
        Ok(())
    }

    fn handle_page_load(
        &self,
        workspace_id: String,
        webview: Webview,
        url: String,
        event: PageLoadEvent,
    ) -> Result<()> {
        {
            let mut instances = self.instances.lock().unwrap();
            if let Some(instance) = instances.get_mut(&workspace_id) {
                instance.current_url = url.clone();
            }
        }

        self.emit_event(
            BROWSER_PAGE_LOAD_EVENT,
            &BrowserPageLoadPayload {
                workspace_id: workspace_id.clone(),
                url: url.clone(),
                event: match event {
                    PageLoadEvent::Started => "started",
                    PageLoadEvent::Finished => "finished",
                }
                .to_string(),
            },
        )?;

        if matches!(event, PageLoadEvent::Finished) {
            let (inspect_mode, preview_chrome) = self
                .instances
                .lock()
                .unwrap()
                .get(&workspace_id)
                .map(|instance| (instance.inspect_mode, instance.preview_chrome.clone()))
                .unwrap_or((false, None));

            if inspect_mode {
                webview.eval(
                    "setTimeout(() => window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.setInspectMode(true), 0);",
                )?;
            }
            if let Some(chrome) = preview_chrome {
                let script = preview_chrome_script(Some(chrome));
                webview.eval(&format!("setTimeout(() => {{ {script} }}, 0);"))?;
            }
            webview
                .eval(
                    "setTimeout(() => window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.emitPageState && window.__YZPZ_BROWSER_BRIDGE__.emitPageState(), 0);",
                )
                .ok();
        }

        Ok(())
    }

    fn apply_bounds(&self, webview: &Webview, bounds: &BrowserBounds) -> Result<()> {
        webview.set_position(LogicalPosition::new(bounds.x, bounds.y))?;
        webview.set_size(LogicalSize::new(bounds.width, bounds.height))?;
        Ok(())
    }

    fn navigate_webview(&self, webview: &Webview, url: &str) -> Result<()> {
        let resolved_url = resolve_browser_url(url);
        let parsed = Url::parse(&resolved_url)
            .with_context(|| format!("Invalid browser URL: {resolved_url}"))?;
        webview.navigate(parsed)?;
        Ok(())
    }

    fn navigate_webview_window(&self, window: &WebviewWindow, url: &str) -> Result<()> {
        let resolved_url = resolve_browser_url(url);
        let parsed = Url::parse(&resolved_url)
            .with_context(|| format!("Invalid browser URL: {resolved_url}"))?;
        window.navigate(parsed)?;
        Ok(())
    }

    fn webview_for_workspace(&self, workspace_id: &str) -> Result<Webview> {
        let label = self
            .instances
            .lock()
            .unwrap()
            .get(workspace_id)
            .map(|instance| instance.label.clone())
            .context("Browser view not registered")?;

        self.app_handle()?
            .get_webview(&label)
            .context("Browser webview not found")
    }

    fn mark_popout_closed(&self, workspace_id: &str, popout_label: &str) -> Result<()> {
        let mut instances = self.instances.lock().unwrap();
        let Some(instance) = instances.get_mut(workspace_id) else {
            return Ok(());
        };

        if !instance.popped_out || instance.label != popout_label {
            return Ok(());
        }

        instance.label = instance.embedded_label.clone();
        instance.visible = false;
        instance.popped_out = false;
        instance.preview_chrome = None;
        drop(instances);

        self.emit_popout_state(workspace_id, false)?;
        Ok(())
    }

    fn workspace_for_label(&self, label: &str) -> Result<String> {
        self.instances
            .lock()
            .unwrap()
            .iter()
            .find_map(|(workspace_id, instance)| {
                if instance.label == label {
                    Some(workspace_id.clone())
                } else {
                    None
                }
            })
            .context("Browser workspace not found")
    }

    fn label_for_workspace(&self, workspace_id: &str) -> String {
        let suffix = workspace_id
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':' | '/') {
                    c
                } else {
                    '-'
                }
            })
            .collect::<String>();
        format!("browser-{suffix}")
    }

    fn popout_label_for_workspace(&self, workspace_id: &str) -> String {
        let suffix = workspace_id
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || matches!(c, '-' | '_') {
                    c
                } else {
                    '-'
                }
            })
            .collect::<String>();
        format!("browser-popout-{suffix}")
    }

    fn main_window(&self, app: &AppHandle) -> Result<Window> {
        app.get_window("main").context("Main window not found")
    }

    fn app_handle(&self) -> Result<AppHandle> {
        self.app_handle
            .lock()
            .unwrap()
            .clone()
            .context("App handle not set")
    }

    fn emit_event<S: Serialize>(&self, event: &str, payload: &S) -> Result<()> {
        self.app_handle()?.emit(event, payload)?;
        Ok(())
    }

    fn emit_popout_state(&self, workspace_id: &str, popped_out: bool) -> Result<()> {
        self.emit_event(
            BROWSER_POPOUT_STATE_EVENT,
            &BrowserPopoutStatePayload {
                workspace_id: workspace_id.to_string(),
                popped_out,
            },
        )
    }
}

impl Default for BrowserManager {
    fn default() -> Self {
        Self::new()
    }
}

fn inspect_mode_script(enabled: bool) -> String {
    format!(
        "window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.setInspectMode({enabled});"
    )
}

fn pick_style_mode_script(enabled: bool) -> String {
    format!(
        "window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.setPickStyleMode({enabled});"
    )
}

fn pick_ui_element_mode_script(enabled: bool) -> String {
    format!(
        "window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.setPickUiElementMode({enabled});"
    )
}

fn preview_chrome_script(chrome: Option<BrowserPreviewChrome>) -> String {
    match chrome {
        Some(payload) => {
            let json = serde_json::to_string(&payload).unwrap_or_default();
            format!(
                "window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.setPreviewChrome({json});"
            )
        }
        None => {
            "window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.setPreviewChrome(null);".to_string()
        }
    }
}

fn apply_mode_script(style_payload: Option<CapturedStyle>) -> String {
    match style_payload {
        Some(payload) => {
            let json = serde_json::to_string(&payload).unwrap_or_default();
            format!(
                "window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.setApplyMode({json});"
            )
        }
        None => {
            "window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.setApplyMode(null);"
                .to_string()
        }
    }
}

fn undo_style_script() -> String {
    "window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.undoLastStyle();".to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        browser_urls_match, canonicalize_browser_url, resolve_browser_url, DEFAULT_BROWSER_URL,
    };

    #[test]
    fn canonicalizes_default_url_variants() {
        let canonical_default =
            canonicalize_browser_url(DEFAULT_BROWSER_URL).expect("default url should parse");

        assert_eq!(
            canonical_default,
            canonicalize_browser_url("http://localhost:3000/")
                .expect("trailing slash should parse")
        );
        assert_eq!(
            canonical_default,
            canonicalize_browser_url("about:blank").expect("blank should normalize to default")
        );
    }

    #[test]
    fn matches_equivalent_urls_without_forced_reload() {
        assert!(browser_urls_match(
            "http://localhost:3000",
            "http://localhost:3000/"
        ));
        assert!(browser_urls_match("about:blank", &resolve_browser_url("")));
    }
}
