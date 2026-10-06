// Loaded by every VS Code webview bootstrap frame. Watches the assistant's own
// document and tells the workbench when a submitted request finishes: the user
// sends something (Enter / button), the UI stays busy (streaming text, timers,
// spinners) for at least MIN_BUSY_MS, then settles for QUIET_MS.
// It also reports `task-busy` once a request is visibly underway (activity
// still arriving BUSY_SHOW_MS after the submit) and `task-idle` when a busy
// request ends without completing (interrupted or too short), so the pane can
// show a working indicator.
(() => {
  const QUIET_MS = 3000;
  const MIN_BUSY_MS = 4000;
  const BUSY_SHOW_MS = 1000;
  const SAMPLE_MS = 500;
  const parentOrigin = new URLSearchParams(location.search).get('parentOrigin');
  if (!parentOrigin || window.parent === window) return;

  let doc = null;
  let observer = null;
  let armedAt = 0;
  let runStart = 0;
  let lastActivity = 0;
  let busy = false;
  // Animations already running when the request was sent (idle decorations)
  // never count as work; spinners shown for the request are new animations.
  let baseline = new WeakSet();

  const isEditable = element => Boolean(element && (element.isContentEditable || /^(INPUT|TEXTAREA)$/.test(element.tagName)));
  const post = event => window.parent.postMessage({ yzpzPanelEvent: event }, parentOrigin);
  const setBusy = next => {
    if (next === busy) return;
    busy = next;
    post(next ? 'task-busy' : 'task-idle');
  };

  const inEditor = target => {
    const active = doc?.activeElement;
    return Boolean(isEditable(active) && target && active.contains(target.nodeType === 1 ? target : target.parentNode));
  };

  function activity(now = Date.now()) {
    if (!lastActivity) runStart = now;
    lastActivity = now;
  }

  function arm() {
    const now = Date.now();
    armedAt = now;
    runStart = now;
    lastActivity = now;
    try { baseline = new WeakSet(doc.getAnimations()); } catch { baseline = new WeakSet(); }
  }

  function animating() {
    try {
      return doc.getAnimations().some(animation => {
        if (animation.playState !== 'running' || baseline.has(animation)) return false;
        if (animation.effect?.getComputedTiming?.().iterations !== Infinity) return false;
        const target = animation.effect.target;
        return Boolean(target?.isConnected) && !inEditor(target) && (target.checkVisibility?.() ?? true);
      });
    } catch { return false; }
  }

  function attach(next) {
    observer?.disconnect();
    observer = null;
    doc = next;
    if (!doc?.body) return;
    observer = new MutationObserver(records => {
      if (records.some(record => !inEditor(record.target))) activity();
    });
    observer.observe(doc.body, { subtree: true, childList: true, characterData: true });
    doc.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        armedAt = 0;
        setBusy(false);
      }
      else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && isEditable(event.target)) arm();
    }, true);
    doc.addEventListener('click', event => {
      if (event.target?.closest?.('button, [role="button"]')) arm();
    }, true);
  }

  setInterval(() => {
    let current = null;
    try { current = document.getElementById('active-frame')?.contentDocument ?? null; } catch { /* Not ready. */ }
    if (current !== doc) attach(current);
    if (!doc) return;
    const now = Date.now();
    if (armedAt && animating()) activity(now);
    if (armedAt && lastActivity - armedAt >= BUSY_SHOW_MS && now - lastActivity < QUIET_MS) setBusy(true);
    if (lastActivity && now - lastActivity >= QUIET_MS) {
      // The first settle after a submit ends that request, long or short.
      const finished = armedAt && lastActivity - runStart >= MIN_BUSY_MS;
      lastActivity = 0;
      armedAt = 0;
      if (finished) {
        busy = false;
        post('task-complete');
      } else {
        setBusy(false);
      }
    }
  }, SAMPLE_MS);
})();
