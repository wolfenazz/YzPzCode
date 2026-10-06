// App-owned adapter for VSCodium's existing HTTP server. The runtime archive
// stays intact; only its workbench response receives embedding configuration.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { MAX_BYTES, rememberedTrust, saveTrust, readStorage, updateStorage, folderIsTrusted } = require('./panel-storage.cjs');
const { createTunnel } = require('./panel-tunnel.cjs');
const { installStartupCompatibility } = require('./antigravity-compat.cjs');
const { installAccessCompatibility } = require('./provider-access.cjs');

installAccessCompatibility(process.env.YZPZ_EXTENSION_ENTRY, process.env.YZPZ_EXTENSION_ID);

if (process.env.YZPZ_EXTENSION_ID?.toLowerCase() === 'google.google-antigravity')
  installStartupCompatibility(process.env.YZPZ_ANTIGRAVITY_ENTRY);

function adaptWorkbenchHtml(html, panel, onConfiguration) {
  const configPattern = /(<meta\s+id="vscode-workbench-web-configuration"\s+data-settings=")([^"]+)(")/;
  if (!configPattern.test(html)) return html;
  const css = /<link\s+rel="stylesheet"\s+href="([^"]+)\/out\/vs\/code\/browser\/workbench\/workbench\.css"/.exec(html);
  if (!css) throw new Error('The extension runtime has no workbench asset directory');
  return html.replace(configPattern, (_, before, encoded, after) => {
    const config = JSON.parse(encoded.replaceAll('&quot;', '"'));
    config.yzpzLocalTunnels = panel.id.toLowerCase() === 'google.google-antigravity';
    onConfiguration?.(config);
    // VS Code validates each webview's hashed subdomain. Keep that isolation
    // on *.localhost instead of fetching the iframe from vscode-cdn.net.
    const host = new URL(`http://${config.remoteAuthority}/`);
    const iframeDomain = host.hostname.endsWith('.localhost') ? host.hostname : 'localhost';
    config.webviewEndpoint = `http://{{uuid}}.${iframeDomain}:${host.port}/yzpz-webview/`;
    config.configurationDefaults = {
      ...config.configurationDefaults,
      'workbench.startupEditor': 'none',
      'workbench.colorTheme': 'Default Dark Modern',
      'workbench.activityBar.location': 'hidden',
      'workbench.statusBar.visible': false,
      'window.commandCenter': false,
      'workbench.tips.enabled': false,
      'security.workspace.trust.startupPrompt': 'always',
      'remote.extensionKind': {
        ...config.configurationDefaults?.['remote.extensionKind'],
        // A web workbench has no local desktop Node host. Node assistants run
        // in the bundled server's workspace extension host.
        ...(panel.hasNodeEntry ? { [panel.id]: ['workspace'] } : {}),
      },
    };
    return `${before}${JSON.stringify(config).replaceAll('"', '&quot;')}${after}`;
  }).replace('</head>', '<script src="/yzpz-panel/bootstrap.js"></script></head>')
    .replace(/(<script\s+type="module"\s+src=")[^"]+\/out\/vs\/code\/browser\/workbench\/workbench\.js("[^>]*>)/,
      '$1/yzpz-panel/workbench.mjs$2');
}

// The Tauri side reads this marker from the host's stdout (see mod.rs).
const PANEL_EVENT_PREFIX = '[YzPzCode panel event] ';
const TASK_EVENTS = ['task-busy', 'task-idle', 'task-complete'];
// Outcomes of a prompt handed to the assistant (panel-chrome.js, panel-prompt.js).
const PROMPT_STATUSES = ['submitted', 'inserted', 'no-input', 'failed', 'not-ready', 'no-view', 'timeout', 'unavailable'];
const PROMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a pane event body and returns its stdout line for mod.rs. */
function panelEventLine(value) {
  if (TASK_EVENTS.includes(value?.event)) return `${PANEL_EVENT_PREFIX}${value.event}\n`;
  if (value?.event === 'prompt-result' && typeof value.id === 'string' && PROMPT_ID.test(value.id) &&
      PROMPT_STATUSES.includes(value.status))
    return `${PANEL_EVENT_PREFIX}prompt-result ${value.id.toLowerCase()} ${value.status}\n`;
  throw new Error('Unsupported event');
}

/** The script every webview frame loads: activity reporting plus prompt delivery. */
function webviewScript(directory = __dirname) {
  const read = name => fs.readFileSync(path.join(directory, name), 'utf8');
  return `${read('webview-activity.js')}\n;${read('panel-prompt.js').trim()}({ mode: 'webview' });\n`;
}

function adaptWebviewHtml(html) {
  // The bootstrap CSP allows 'self' scripts, so no hash needs to change.
  return html.replace('</head>', '<script src="./yzpz-activity.js"></script></head>');
}

function adaptWorkbenchCsp(csp, port) {
  return csp.replace(/frame-src [^;]*;/, `frame-src 'self' http://*.localhost:${port} data:;`);
}

function adaptWorkbenchModule(source) {
  // The pinned runtime's public embedding API accepts a tunnel provider. Keep
  // the original module URL so its workers and static resources resolve normally.
  const startup = /(\w+\(\w+\.document\.body,\{\.\.\.\w+,)windowIndicator:/g;
  const matches = [...source.matchAll(startup)];
  if (matches.length !== 1) throw new Error('The runtime has an unsupported workbench startup');
  return source.replace(startup, '$1tunnelProvider:globalThis.yzpzLocalTunnels,resolveExternalUri:globalThis.yzpzLocalTunnels?.resolveExternalUri,windowIndicator:');
}

function isWorkbenchModule(pathname) {
  // reh-web prefixes static routes with its quality and commit, whereas some
  // server builds put the commit after /static. Both keep the same asset path.
  return /^(?:\/(?:stable|insider)-[a-f0-9]{40}\/static|\/static\/[a-f0-9]{40})\/out\/vs\/code\/browser\/workbench\/workbench\.js$/.test(pathname);
}

function installAdapter(panel) {
  const tokenIndex = process.argv.indexOf('--connection-token');
  const token = tokenIndex >= 0 ? process.argv[tokenIndex + 1] : '';
  const portIndex = process.argv.indexOf('--port');
  const port = Number(process.argv[portIndex + 1]);
  const iframeDomain = process.env.YZPZ_PANEL_HOSTNAME || 'localhost';
  const tunnels = new Map();
  const paneOrigin = `http://${iframeDomain}:${port}`;
  const rejectedRequests = new Set();
  let folderUri;
  const originalWriteHead = http.ServerResponse.prototype.writeHead;
  http.ServerResponse.prototype.writeHead = function (status, reasonOrHeaders, headers) {
    const suppliedHeaders = typeof reasonOrHeaders === 'object' ? reasonOrHeaders : headers;
    if (suppliedHeaders) {
      const cspKey = Object.keys(suppliedHeaders).find(key => key.toLowerCase() === 'content-security-policy');
      if (cspKey && String(suppliedHeaders[cspKey]).includes('https://*.vscode-cdn.net')) {
        const replacement = { ...suppliedHeaders, [cspKey]: adaptWorkbenchCsp(String(suppliedHeaders[cspKey]), port) };
        if (typeof reasonOrHeaders === 'object') reasonOrHeaders = replacement;
        else headers = replacement;
      }
    }
    return originalWriteHead.call(this, status, reasonOrHeaders, headers);
  };
  const script = `const YZPZ_PANEL = ${JSON.stringify(panel)};\nconst YZPZ_AUTH_ROUTE = ${JSON.stringify(`/?tkn=${encodeURIComponent(token)}`)};\n${fs.readFileSync(path.join(__dirname, 'panel-chrome.js'), 'utf8')}`;
  const originalEnd = http.ServerResponse.prototype.end;
  http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
    if ((typeof chunk === 'string' || Buffer.isBuffer(chunk)) &&
        String(chunk).includes('id="vscode-workbench-web-configuration"')) {
      chunk = adaptWorkbenchHtml(String(chunk), panel, config => { folderUri = config.folderUri; });
    }
    return originalEnd.call(this, chunk, encoding, callback);
  };

  const originalEmit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, ...args) {
    if (event !== 'request' || this.yzpzLocalTunnel) return originalEmit.call(this, event, ...args);
    const [request, response] = args;
    let address;
    try { address = new URL(request.url, 'http://127.0.0.1'); }
    catch { response.writeHead(400); response.end(); return true; }
    if (panel.id.toLowerCase() === 'google.google-antigravity' && request.method === 'GET' &&
        isWorkbenchModule(address.pathname)) {
      try {
        const source = adaptWorkbenchModule(fs.readFileSync(process.env.YZPZ_RUNTIME_WORKBENCH_FILE, 'utf8'));
        response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(source);
      } catch { response.writeHead(500); response.end('Unsupported workbench startup'); }
      return true;
    }
    response.on('finish', () => {
      if (response.statusCode < 400 || rejectedRequests.size >= 64) return;
      // Never log query strings, cookies, or connection tokens.
      const route = `${response.statusCode} ${request.method} ${address.pathname.slice(0, 180)}`;
      if (!rejectedRequests.has(route)) {
        rejectedRequests.add(route);
        console.warn(`[YzPzCode extension HTTP] ${route}`);
      }
    });
    if (address.pathname.startsWith('/yzpz-webview/')) {
      // Hashed iframe origins do not receive the parent host's auth cookie.
      // Serve only the three public runtime bootstrap files (plus the
      // app's activity and prompt script) here. Workspace
      // files, extension files, status/actions, and all host APIs remain private.
      const runtimeAsset = name => path.join(process.env.YZPZ_WEBVIEW_ASSETS_DIR, name);
      const allowed = {
        '/yzpz-webview/index.html': [runtimeAsset('index.html'), 'text/html; charset=utf-8'],
        '/yzpz-webview/fake.html': [runtimeAsset('fake.html'), 'text/html; charset=utf-8'],
        '/yzpz-webview/service-worker.js': [runtimeAsset('service-worker.js'), 'application/javascript; charset=utf-8'],
        '/yzpz-webview/yzpz-activity.js': [null, 'application/javascript; charset=utf-8'],
      };
      const asset = allowed[address.pathname];
      const assetHost = (request.headers.host || '').toLowerCase();
      const suffix = `.${iframeDomain.toLowerCase()}:${port}`;
      const validHost = assetHost.endsWith(suffix) && /^[0-9a-v]{52}$/.test(assetHost.slice(0, -suffix.length));
      if (!asset || !validHost || !['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(403); response.end(); return true;
      }
      try {
        let bytes = asset[0] ? fs.readFileSync(asset[0]) : Buffer.from(webviewScript());
        if (address.pathname === '/yzpz-webview/index.html') bytes = Buffer.from(adaptWebviewHtml(bytes.toString('utf8')));
        response.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': bytes.length,
          'Cache-Control': 'no-cache', 'Cross-Origin-Resource-Policy': 'cross-origin',
          'Service-Worker-Allowed': '/yzpz-webview/' });
        response.end(request.method === 'HEAD' ? undefined : bytes);
      } catch { response.writeHead(404); response.end(); }
      return true;
    }
    if (!address.pathname.startsWith('/yzpz-panel/')) return originalEmit.call(this, event, ...args);
    const cookieToken = (request.headers.cookie || '').split(';').map(value => value.trim())
      .find(value => value.startsWith('vscode-tkn='))?.slice('vscode-tkn='.length);
    if (!token || (cookieToken !== token && address.searchParams.get('tkn') !== token)) {
      response.writeHead(401); response.end('Unauthorized'); return true;
    }
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'GET' && address.pathname === '/yzpz-panel/bootstrap.js') {
      response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      response.end(script); return true;
    }
    if (request.method === 'GET' && address.pathname === '/yzpz-panel/workbench.mjs') {
      response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      response.end(fs.readFileSync(path.join(__dirname, 'panel-workbench.mjs'))); return true;
    }
    if (request.method === 'GET' && address.pathname === '/yzpz-panel/storage') {
      response.setHeader('Content-Type', 'application/json');
      try {
        const saved = readStorage(process.env.YZPZ_PANEL_STORAGE_FILE);
        const trustedWorkspace = rememberedTrust(process.env.YZPZ_WORKSPACE_TRUST_FILE, process.env.YZPZ_WORKSPACE_PATH);
        response.end(JSON.stringify({ ...saved, trustedWorkspace }));
      } catch { response.writeHead(500); response.end('{"error":"Could not restore saved state"}'); }
      return true;
    }
    if (request.method === 'GET' && address.pathname === '/yzpz-panel/trust') {
      response.setHeader('Content-Type', 'application/json');
      try { response.end(JSON.stringify({ trusted: rememberedTrust(process.env.YZPZ_WORKSPACE_TRUST_FILE, process.env.YZPZ_WORKSPACE_PATH) })); }
      catch { response.writeHead(500); response.end('{}'); }
      return true;
    }
    if (request.method === 'GET' && address.pathname === '/yzpz-panel/status') {
      response.setHeader('Content-Type', 'application/json');
      try { response.end(fs.readFileSync(process.env.YZPZ_PANEL_STATE_FILE)); }
      catch { response.end('{"stage":"starting"}'); }
      return true;
    }
    if (request.method === 'POST' && ['/yzpz-panel/action', '/yzpz-panel/storage', '/yzpz-panel/diagnostic', '/yzpz-panel/tunnel', '/yzpz-panel/event'].includes(address.pathname)) {
      // Accept only the host's own UI, with a bounded JSON body and a fixed
      // command allowlist. This never grants trust on the user's behalf.
      const origin = request.headers.origin;
      let sameOrigin = false;
      try { sameOrigin = Boolean(origin) && new URL(origin).host === request.headers.host; }
      catch { /* Malformed Origin is rejected. */ }
      if (!sameOrigin ||
          !request.headers['content-type']?.startsWith('application/json')) {
        response.writeHead(403); response.end(); return true;
      }
      let body = '';
      request.setEncoding('utf8');
      request.on('data', data => {
        body += data;
        if (Buffer.byteLength(body) > (address.pathname.endsWith('/storage') ? MAX_BYTES : 1024)) request.destroy();
      });
      request.on('end', async () => {
        try {
          const value = JSON.parse(body);
          if (address.pathname.endsWith('/tunnel')) {
            if (panel.id.toLowerCase() !== 'google.google-antigravity' ||
                rememberedTrust(process.env.YZPZ_WORKSPACE_TRUST_FILE, process.env.YZPZ_WORKSPACE_PATH) !== true) {
              response.writeHead(403); response.end(); return;
            }
            if (!Number.isInteger(value.port) || value.port < 1024 || value.port > 65535 || value.port === port)
              throw new Error('Invalid local service port');
            if (value.action === 'close') {
              const tunnel = tunnels.get(value.port);
              tunnels.delete(value.port);
              if (tunnel) await (await tunnel).dispose();
            } else if (value.action === 'open') {
              if (!tunnels.has(value.port)) {
                if (tunnels.size >= 16) throw new Error('Too many local services');
                const pending = createTunnel(value.port, paneOrigin, diagnostic => {
                  console.info('[YzPzCode Antigravity startup]', JSON.stringify(diagnostic));
                });
                tunnels.set(value.port, pending);
                pending.catch(() => tunnels.delete(value.port));
              }
              const tunnel = await tunnels.get(value.port);
              console.info(`[YzPzCode Antigravity] Local service ${value.port} is available through the pane proxy.`);
              response.writeHead(200, { 'Content-Type': 'application/json' });
              response.end(JSON.stringify({ localAddress: tunnel.localAddress })); return;
            } else throw new Error('Unsupported tunnel action');
          } else if (address.pathname.endsWith('/storage')) {
            updateStorage(process.env.YZPZ_PANEL_STORAGE_FILE, value);
            // Remember revocation when VS Code changes its own trust list.
            // Granting trust is recorded by the extension bridge's actual
            // onDidGrantWorkspaceTrust notification, not a frontend request.
            const trust = value.insert.find(item => item[0] === 'content.trust.model.key');
            // Baseline imports may come from an older browser cache while
            // another pane has already recorded an approval. Only subsequent
            // native mutations can revoke that approval.
            if (value.nativeChange === true && value.database === 'vscode-web-state-db-global-shared') {
              if ((value.clear && !trust) || value.delete.includes('content.trust.model.key') ||
                  (trust && folderUri && !folderIsTrusted(JSON.parse(trust[1]).uriTrustInfo, folderUri)))
                saveTrust(process.env.YZPZ_WORKSPACE_TRUST_FILE, process.env.YZPZ_WORKSPACE_PATH, false);
            }
          } else if (address.pathname.endsWith('/event')) {
            process.stdout.write(panelEventLine(value));
          } else if (address.pathname.endsWith('/diagnostic')) {
            if (!['configuration', 'read', 'restore', 'capture', 'import'].includes(value.stage) ||
                typeof value.name !== 'string' || typeof value.message !== 'string' ||
                value.name.length > 60 || value.message.length > 400) throw new Error('Invalid diagnostic');
            const message = value.message.replace(/\?[^\s"']+/g, '?<redacted>');
            console.error('[YzPzCode panel startup]', JSON.stringify({ stage: value.stage, name: value.name, message }));
          } else {
            const { action } = value;
            if (!['review-trust', 'back'].includes(action)) throw new Error('Unsupported action');
            fs.writeFileSync(process.env.YZPZ_PANEL_ACTION_FILE, JSON.stringify({ action, id: crypto.randomUUID() }));
          }
          response.writeHead(204); response.end();
        } catch { response.writeHead(400); response.end(); }
      });
      return true;
    }
    response.writeHead(404); response.end(); return true;
  };
}

module.exports = { adaptWorkbenchHtml, adaptWebviewHtml, adaptWorkbenchCsp, adaptWorkbenchModule, isWorkbenchModule, panelEventLine, webviewScript };
if (process.env.YZPZ_PANEL_CONFIG && process.argv.includes('--start-server')) installAdapter(JSON.parse(process.env.YZPZ_PANEL_CONFIG));
