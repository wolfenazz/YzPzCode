// Loaded locally before the workbench. Reveal only the selected assistant part.
(() => {
  if (window.top !== window) return;
  // Keep the runtime's ownership anchors available even on engines that do
  // not recognize CSS anchor properties. This does not depend on CSS layout.
  const anchors = new WeakMap();
  if (typeof CSSStyleDeclaration !== 'undefined') {
    const setProperty = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) {
      if (name === 'anchor-name' || name === 'position-anchor') {
        const saved = anchors.get(this) || {};
        saved[name] = value; anchors.set(this, saved);
      }
      return setProperty.call(this, name, value, priority);
    };
  }
  const anchorValue = (style, name) => style?.getPropertyValue(name) || anchors.get(style)?.[name] || '';
  const style = document.createElement('style');
  style.textContent = `
    html, body { margin: 0; overflow: hidden; background: #121212; }
    .monaco-workbench .part { visibility: hidden !important; }
    .monaco-workbench .part.titlebar,
    .monaco-workbench .part.activitybar,
    .monaco-workbench .part.statusbar,
    .monaco-workbench .part.banner { display: none !important; }
    .monaco-workbench .part.yzpz-assistant-part,
    .yzpz-trust-mode .monaco-workbench .part.editor,
    .yzpz-editor-mode .monaco-workbench .part.editor {
      visibility: visible !important; position: fixed !important;
      left: 0 !important; top: 0 !important;
      width: 100vw !important; height: 100vh !important;
      z-index: 20 !important;
    }
    .yzpz-assistant-part > .title { display: none !important; }
    .yzpz-assistant-part > .content { width: 100% !important; height: 100vh !important; }
    .yzpz-assistant-part .composite,
    .yzpz-assistant-part .monaco-split-view2,
    .yzpz-assistant-part .monaco-scrollable-element,
    .yzpz-assistant-part .split-view-container,
    .yzpz-assistant-part .split-view-view,
    .yzpz-assistant-part .pane,
    .yzpz-assistant-part .pane-body {
      width: 100% !important; height: 100% !important;
      max-width: none !important; min-width: 0 !important;
    }
    .yzpz-assistant-part .pane-header { display: none !important; }
    /* The runtime mounts webview overlays outside their sidebar part and uses
       CSS anchors. Give the selected assistant explicit viewport bounds so it
       also works on WebView2 versions without CSS anchor positioning. */
    .yzpz-assistant-overlay-root {
      position: fixed !important; inset: 0 !important;
      width: 100vw !important; height: 100vh !important;
      clip-path: none !important; pointer-events: none !important;
      position-anchor: auto !important; z-index: 21 !important;
    }
    .yzpz-assistant-overlay {
      position: fixed !important; inset: 0 !important;
      width: 100vw !important; height: 100vh !important;
      visibility: visible !important; pointer-events: auto !important;
      position-anchor: auto !important; z-index: 21 !important;
    }
    .yzpz-assistant-overlay iframe.webview { width: 100% !important; height: 100% !important; }
    .yzpz-editor-overlay {
      position: fixed !important; position-anchor: auto !important;
      left: var(--yzpz-editor-left) !important; top: var(--yzpz-editor-top) !important;
      width: var(--yzpz-editor-width) !important; height: var(--yzpz-editor-height) !important;
      visibility: visible !important; pointer-events: auto !important; z-index: 22 !important;
    }
    .yzpz-editor-overlay iframe.webview { width: 100% !important; height: 100% !important; }
    .yzpz-trust-mode .part.editor .content,
    .yzpz-trust-mode .part.editor .editor-group-container,
    .yzpz-editor-mode .part.editor .content,
    .yzpz-editor-mode .part.editor .editor-group-container {
      width: 100% !important; height: 100% !important;
    }
    .monaco-dialog-box { max-width: calc(100vw - 24px) !important; box-sizing: border-box; }
    #yzpz-panel-status {
      position: fixed; inset: 0; z-index: 100; display: flex;
      flex-direction: column; align-items: center; justify-content: center;
      gap: 16px; padding: 24px; background: #121212; color: #d4d4d4;
      font: 12px/1.6 system-ui, sans-serif; text-align: center;
    }
    #yzpz-panel-status p { max-width: 420px; margin: 0; white-space: pre-wrap; }
    #yzpz-panel-status button, #yzpz-trust-back {
      border: 1px solid #404040; border-radius: 5px; padding: 7px 12px;
      background: #202020; color: #eee; cursor: pointer; font: inherit;
    }
    #yzpz-trust-back { position: fixed; bottom: 12px; right: 12px; z-index: 120; }
  `;
  document.head.appendChild(style);
  let state = { stage: 'starting' };
  let overlay, message, button, back;
  let frame = 0;
  let waitingSince;
  let bootError;
  window.addEventListener('yzpz-boot-error', event => { bootError = event.detail; schedule(); });
  const containers = ['secondarySidebar', 'activitybar', 'panel']
    .flatMap(location => YZPZ_PANEL.containers?.[location] || [])
    .map(container => `workbench.view.extension.${container.id}`);

  async function action(value) {
    try {
      const response = await fetch('/yzpz-panel/action', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: value }) });
      if (!response.ok) throw new Error(`Host action ${response.status}`);
    } catch { state = { stage: 'error', message: 'Could not contact the extension host. Close and reopen this pane.' }; schedule(); }
  }

  function assistantFrame(composite) {
    if (!composite) return undefined;
    const frames = [...document.querySelectorAll('iframe.webview')].filter(element => {
      try { return new URL(element.src).searchParams.get('extensionId')?.toLowerCase() === YZPZ_PANEL.id.toLowerCase(); }
      catch { return false; }
    });
    // The runtime mounts overlays outside their owning view. Use its explicit
    // owner/anchor association, not just extensionId: welcome/editor webviews
    // from the same extension must never replace the chat panel.
    return frames.find(element => {
      const overlay = element.closest('.webview-overlay-content');
      const owner = document.getElementById(overlay?.dataset.parentFlowToElementId || '');
      if (owner) return composite.contains(owner);
      const anchor = anchorValue(overlay?.style, 'position-anchor');
      return Boolean(anchor) && [...composite.querySelectorAll('[style]')]
        .some(element => anchorValue(element.style, 'anchor-name') === anchor);
    });
  }

  function render() {
    frame = 0;
    if (!document.body) return;
    if (!overlay?.isConnected) {
      overlay = document.createElement('div'); overlay.id = 'yzpz-panel-status';
      message = document.createElement('p'); message.setAttribute('role', 'status');
      button = document.createElement('button'); button.type = 'button';
      // Re-establish the cookie through the server's authenticated entry URL.
      // Reloading '/' alone repeats Forbidden when the cookie is stale.
      button.onclick = () => !bootError && state.stage === 'waitingTrust' ? void action('review-trust') : location.replace(YZPZ_AUTH_ROUTE);
      overlay.append(message, button); document.body.appendChild(overlay);
      back = document.createElement('button'); back.id = 'yzpz-trust-back'; back.type = 'button';
      back.textContent = 'Back to extension'; back.onclick = () => void action('back');
      document.body.appendChild(back);
    }
    const editorMode = state.stage === 'editor';
    if (document.documentElement.classList.contains('yzpz-editor-mode') !== editorMode) {
      document.documentElement.classList.toggle('yzpz-editor-mode', editorMode);
      window.dispatchEvent(new Event('resize'));
    }
    const editor = document.querySelector('.part.editor');
    const editorFrame = editorMode ? [...document.querySelectorAll('iframe.webview')].find(element => {
      const content = element.closest('.webview-overlay-content');
      const owner = document.getElementById(content?.dataset.parentFlowToElementId || '');
      if (owner) return editor?.contains(owner) && owner.getBoundingClientRect().height > 0;
      const anchor = anchorValue(content?.style, 'position-anchor');
      return Boolean(anchor) && [...(editor?.querySelectorAll('[style]') || [])]
        .some(element => anchorValue(element.style, 'anchor-name') === anchor && element.getBoundingClientRect().height > 0);
    }) : undefined;
    const editorOverlay = editorFrame?.closest('.webview-overlay-content');
    document.querySelectorAll('.yzpz-editor-overlay').forEach(element => {
      if (element !== editorOverlay) element.classList.remove('yzpz-editor-overlay');
    });
    if (editorOverlay) {
      editorOverlay.classList.add('yzpz-editor-overlay');
      const owner = document.getElementById(editorOverlay.dataset.parentFlowToElementId || '');
      const rect = (owner || editor.querySelector('.editor-instance') || editor).getBoundingClientRect();
      for (const [name, value] of Object.entries({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })) {
        const pixels = `${value}px`;
        if (editorOverlay.style.getPropertyValue(`--yzpz-editor-${name}`) !== pixels)
          editorOverlay.style.setProperty(`--yzpz-editor-${name}`, pixels);
      }
    }
    const candidates = state.container ? [state.container, ...containers] : containers;
    const composite = candidates.map(id => document.getElementById(id))
      .find(element => element?.getBoundingClientRect().height > 0 && getComputedStyle(element).display !== 'none');
    const part = composite?.closest('.part');
    const viewOpened = !bootError && state.stage === 'ready' && Boolean(part);
    const iframe = assistantFrame(composite);
    const webviewOverlay = iframe?.closest('.webview-overlay-content');
    const overlayRoot = editorMode ? editorOverlay?.parentElement : webviewOverlay?.parentElement;
    for (const [selector, selected, className] of [
      ['.yzpz-assistant-overlay', webviewOverlay, 'yzpz-assistant-overlay'],
      ['.yzpz-assistant-overlay-root', overlayRoot, 'yzpz-assistant-overlay-root'],
    ]) {
      document.querySelectorAll(selector).forEach(element => {
        if (element !== selected || !(viewOpened || editorMode && className === 'yzpz-assistant-overlay-root')) element.classList.remove(className);
      });
      if ((viewOpened || editorMode && className === 'yzpz-assistant-overlay-root') && selected && !selected.classList.contains(className)) selected.classList.add(className);
    }
    const ready = viewOpened && Boolean(iframe?.classList.contains('ready'));
    if (ready || !viewOpened) waitingSince = undefined;
    else waitingSince ??= Date.now();
    const stalled = waitingSince !== undefined && Date.now() - waitingSince > 30000;
    document.querySelectorAll('.yzpz-assistant-part').forEach(element => {
      if (element !== part || !viewOpened) element.classList.remove('yzpz-assistant-part');
    });
    if (viewOpened && !part.classList.contains('yzpz-assistant-part')) {
      part.classList.add('yzpz-assistant-part');
      window.dispatchEvent(new Event('resize'));
    }
    const trustMode = state.stage === 'reviewingTrust';
    if (document.documentElement.classList.contains('yzpz-trust-mode') !== trustMode)
      document.documentElement.classList.toggle('yzpz-trust-mode', trustMode);
    const shown = !ready && !trustMode && !editorMode;
    const display = shown ? 'flex' : 'none';
    if (overlay.style.display !== display) overlay.style.display = display;
    if (back.style.display !== (trustMode || editorMode ? 'block' : 'none')) back.style.display = trustMode || editorMode ? 'block' : 'none';
    const text = bootError || (state.stage === 'waitingTrust'
      ? `Trust this workspace to enable ${YZPZ_PANEL.name}. Review the workspace permissions before continuing.`
      : state.stage === 'error' ? (state.message || `Could not open ${YZPZ_PANEL.name}.`)
      : stalled ? `${YZPZ_PANEL.name}'s graphical resources did not finish loading. Retry opening the panel. Rejected requests are recorded in the extension host log.`
      : `Opening ${YZPZ_PANEL.name}…`);
    if (message.textContent !== text) message.textContent = text;
    const buttonShown = bootError || state.stage === 'waitingTrust' || state.stage === 'error' || stalled;
    if (button.style.display !== (buttonShown ? 'block' : 'none')) button.style.display = buttonShown ? 'block' : 'none';
    const buttonText = !bootError && state.stage === 'waitingTrust' ? 'Review workspace trust' : 'Retry opening';
    if (button.textContent !== buttonText) button.textContent = buttonText;
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(render); }
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'id'],
  });
  window.addEventListener('resize', schedule);
  async function poll() {
    try {
      const response = await fetch('/yzpz-panel/status', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(`Host status ${response.status}`);
      state = await response.json();
    } catch { state = { stage: 'error', message: `The ${YZPZ_PANEL.name} host is unavailable. Close and reopen this pane.` }; }
    schedule(); setTimeout(poll, 500);
  }
  schedule(); void poll();

  // Webview frames report a finished assistant task (webview-activity.js).
  // Only hashed webview subdomains of this pane may send it.
  let lastTaskEvent = 0;
  window.addEventListener('message', event => {
    if (event.data?.yzpzPanelEvent !== 'task-complete') return;
    const suffix = `.${location.hostname}:${location.port}`;
    if (!event.origin.startsWith('http://') || !event.origin.endsWith(suffix) ||
        !/^[0-9a-v]{52}$/.test(event.origin.slice('http://'.length, -suffix.length))) return;
    const now = Date.now();
    if (now - lastTaskEvent < 2000) return;
    lastTaskEvent = now;
    void fetch('/yzpz-panel/event', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'task-complete' }),
    }).catch(() => undefined);
  });
})();
