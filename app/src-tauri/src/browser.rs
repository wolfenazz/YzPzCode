use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl, Window,
};
use url::Url;

const BROWSER_ELEMENT_SELECTED_EVENT: &str = "browser-element-selected";
const BROWSER_PAGE_LOAD_EVENT: &str = "browser-page-load";
const BROWSER_INSPECT_MODE_EVENT: &str = "browser-inspect-mode-changed";
const BROWSER_PAGE_STATE_EVENT: &str = "browser-page-state";
const BROWSER_SNAPSHOT_READY_EVENT: &str = "browser-snapshot-ready";
const DEFAULT_BROWSER_URL: &str = "http://localhost:3000";

fn resolve_browser_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.is_empty() || trimmed == "about:blank" {
        DEFAULT_BROWSER_URL.to_string()
    } else {
        trimmed.to_string()
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
    if (!inspectMode || shouldIgnoreElement(element)) {
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

    const labelBits = [element.tagName.toLowerCase()];
    if (element.id) labelBits.push(`#${element.id}`);
    if (element.classList && element.classList.length > 0) {
      const cls = Array.from(element.classList).slice(0, 2).join('.');
      if (cls) labelBits.push(`.${cls}`);
    }
    badge.textContent = labelBits.join('');
    activeElement = element;
  };

  const elementFromEvent = (event) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || shouldIgnoreElement(target)) {
      return null;
    }
    return target;
  };

  const handlePointerMove = (event) => {
    if (!inspectMode) return;
    updateOverlay(elementFromEvent(event));
  };

  const handleScroll = () => {
    if (!inspectMode || !activeElement || !document.contains(activeElement)) return;
    updateOverlay(activeElement);
  };

  const handleClick = (event) => {
    if (!inspectMode) return;

    const element = elementFromEvent(event);
    if (!element) return;

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
    if (!inspectMode) return;
    if (event.key === 'Escape') {
      inspectMode = false;
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
    invoke('browser_page_state_changed', {
      payload: {
        title: document.title || '',
        url: window.location.href,
        historyLength: window.history.length
      }
    });
  };

  styleOverlay();

  window.addEventListener('mousemove', handlePointerMove, true);
  window.addEventListener('scroll', handleScroll, true);
  window.addEventListener('resize', handleScroll, true);
  window.addEventListener('click', handleClick, true);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('load', () => setTimeout(emitPageState, 0), true);
  window.addEventListener('pageshow', () => setTimeout(emitPageState, 0), true);
  window.addEventListener('popstate', () => setTimeout(emitPageState, 0), true);

  const titleElement = document.querySelector('title');
  if (titleElement) {
    const titleObserver = new MutationObserver(() => emitPageState());
    titleObserver.observe(titleElement, { childList: true, subtree: true, characterData: true });
  }

  window.__YZPZ_BROWSER_BRIDGE__ = {
    setInspectMode(value) {
      inspectMode = !!value;
      document.documentElement.style.cursor = inspectMode ? 'crosshair' : '';
      if (!inspectMode) {
        clearOverlay();
      }
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
      emitPageState();
    }
  };

  setTimeout(emitPageState, 0);
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

#[derive(Debug, Clone)]
struct BrowserInstance {
    label: String,
    current_url: String,
    visible: bool,
    inspect_mode: bool,
    zoom_factor: f64,
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

    pub fn ensure_view(&self, workspace_id: &str, url: &str, bounds: BrowserBounds) -> Result<BrowserViewState> {
        let app = self.app_handle()?;
        let label = self.label_for_workspace(workspace_id);
        let resolved_url = resolve_browser_url(url);
        let existing_inspect = self
            .instances
            .lock()
            .unwrap()
            .get(workspace_id)
            .map(|instance| instance.inspect_mode)
            .unwrap_or(false);
        let existing_zoom = self
            .instances
            .lock()
            .unwrap()
            .get(workspace_id)
            .map(|instance| instance.zoom_factor)
            .unwrap_or(1.0);

        if let Some(webview) = app.get_webview(&label) {
            self.apply_bounds(&webview, &bounds)?;
            webview.show()?;
            if !resolved_url.is_empty() {
                self.navigate_webview(&webview, &resolved_url)?;
            }
            webview.set_zoom(existing_zoom)?;
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
                label,
                current_url,
                visible: true,
                inspect_mode: existing_inspect,
                zoom_factor: existing_zoom,
            },
        );

        if existing_inspect {
            self.set_inspect_mode(workspace_id, true)?;
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
        self.webview_for_workspace(workspace_id)?
            .eval("window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.goForward();")?;
        Ok(())
    }

    pub fn request_snapshot(&self, workspace_id: &str) -> Result<()> {
        self.webview_for_workspace(workspace_id)?
            .eval("window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.exportSnapshot();")?;
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

    pub fn close(&self, workspace_id: &str) -> Result<()> {
        let label = self
            .instances
            .lock()
            .unwrap()
            .get(workspace_id)
            .map(|instance| instance.label.clone())
            .context("Browser view not registered")?;

        if let Some(webview) = self.app_handle()?.get_webview(&label) {
            webview.close()?;
        }

        self.instances.lock().unwrap().remove(workspace_id);
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
            let inspect_mode = self
                .instances
                .lock()
                .unwrap()
                .get(&workspace_id)
                .map(|instance| instance.inspect_mode)
                .unwrap_or(false);

            if inspect_mode {
                webview.eval(
                    "setTimeout(() => window.__YZPZ_BROWSER_BRIDGE__ && window.__YZPZ_BROWSER_BRIDGE__.setInspectMode(true), 0);",
                )?;
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
