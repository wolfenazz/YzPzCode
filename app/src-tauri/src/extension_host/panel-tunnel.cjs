// Same-machine extension services need no remote TCP forwarding. Antigravity
// additionally limits iframe ancestors to plain localhost. Keep its backend
// loopback-only and add just this pane's isolated origins to that policy.
const http = require('node:http');
const crypto = require('node:crypto');

function scopeBundle(source) {
  // Closure's generated `ipc` function conflicts with Wry's non-configurable
  // window.ipc. Keep all generated names local, preserving the bundle's
  // original global `this` and its explicit window/globalThis exports.
  return `;(function () {\n${source}\n}).call(globalThis);\n`;
}

function diagnosticScript(route) {
  return `(() => {
    const route = ${JSON.stringify(route)};
    const source = value => { try { return new URL(value, location.href).pathname.slice(0, 180); } catch { return ''; } };
    const report = value => { void fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value) }).catch(() => {}); };
    for (const method of ['error', 'warn']) {
      const original = console[method];
      console[method] = function (...args) {
        const error = args.find(value => value instanceof Error);
        const frames = [...String(error?.stack || new Error().stack).matchAll(/(?:https?:[^\\s)]+):(\\d+):(\\d+)/g)];
        const frame = frames.find(value => source(value[0].replace(/:\\d+:\\d+$/, '')) === '/main.js');
        report({ kind: 'console', name: error?.name || method, source: frame ? '/main.js' : '',
          line: Number(frame?.[1] || 0), column: Number(frame?.[2] || 0) });
        return original.apply(this, args);
      };
    }
    addEventListener('error', event => {
      const duplicate = event.error?.name === 'SyntaxError' && /^Identifier '([A-Za-z_$][\\w$]{0,60})' has already been declared$/.exec(event.error.message);
      report({ kind: 'error', name: event.error?.name || 'ResourceError',
        source: source(event.filename || event.target?.src || event.target?.href || ''), line: event.lineno || 0, column: event.colno || 0,
        ...(duplicate ? { symbol: duplicate[1] } : {}) });
    }, true);
    addEventListener('unhandledrejection', event => {
      const frame = /(?:https?:[^\\s)]+):(\\d+):(\\d+)/.exec(event.reason?.stack || '');
      report({ kind: 'rejection', name: event.reason?.name || 'PromiseError',
        source: frame ? source(frame[0].replace(/:\\d+:\\d+$/, '')) : '', line: Number(frame?.[1] || 0), column: Number(frame?.[2] || 0) });
    });
    addEventListener('securitypolicyviolation', event => report({ kind: 'policy', name: event.effectiveDirective,
      source: source(event.blockedURI), line: event.lineNumber || 0, column: event.columnNumber || 0 }));
    const state = () => report({ kind: 'state', name: document.readyState, source: '',
      children: document.getElementById('root')?.childElementCount || 0, secure: isSecureContext });
    addEventListener('load', state); setTimeout(state, 5000); setTimeout(state, 15000);
  })();`;
}

function embeddingPolicy(policy, paneOrigin) {
  const pane = new URL(paneOrigin);
  if (pane.protocol !== 'http:' || !/^panel-[a-f0-9-]+\.localhost$/.test(pane.hostname) || !pane.port)
    throw new Error('Invalid pane origin');
  const allowed = `${pane.origin} http://*.${pane.host}`;
  return policy.replace(/(^|;)\s*frame-ancestors\s+([^;]*)/gi, (match, separator, ancestors) => {
    // Retain the backend's existing entries and every other CSP directive.
    const entries = ancestors.trim().split(/\s+/).filter(value => value !== "'none'");
    return `${separator} frame-ancestors ${entries.join(' ')} ${allowed}`;
  });
}

function backendHeaders(headers, target, localOrigin) {
  const result = { ...headers, host: target.host };
  // Only translate this proxy's own origin. Foreign origins are left for the
  // backend to reject; CSRF headers, cookies, and request bodies stay intact.
  if (result.origin === localOrigin) result.origin = target.origin;
  delete result['proxy-authorization'];
  delete result['proxy-connection'];
  return result;
}

async function createTunnel(remotePort, paneOrigin, onDiagnostic) {
  if (!Number.isInteger(remotePort) || remotePort < 1024 || remotePort > 65535)
    throw new Error('Invalid local service port');
  // Validate before opening a listener. No caller can supply a destination host.
  embeddingPolicy("frame-ancestors 'self';", paneOrigin);
  const target = new URL(`http://127.0.0.1:${remotePort}`);
  const sockets = new Set();
  let localOrigin;
  const diagnosticRoute = `/__yzpz-startup-${crypto.randomUUID()}`;
  const server = http.createServer((request, response) => {
    if (request.headers.host !== new URL(localOrigin).host) {
      response.writeHead(403); response.end(); return;
    }
    const route = new URL(request.url, localOrigin).pathname;
    if (onDiagnostic && route === diagnosticRoute + '.js' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
      response.end(diagnosticScript(diagnosticRoute)); return;
    }
    if (onDiagnostic && route === diagnosticRoute && request.method === 'POST') {
      if (request.headers.origin !== localOrigin || !request.headers['content-type']?.startsWith('application/json')) {
        response.writeHead(403); response.end(); return;
      }
      let body = ''; request.setEncoding('utf8');
      request.on('data', bytes => { body += bytes; if (Buffer.byteLength(body) > 2048) request.destroy(); });
      request.on('end', () => {
        try {
          const value = JSON.parse(body);
          if (!['error', 'rejection', 'policy', 'state', 'console'].includes(value.kind)) throw new Error();
          // Never collect messages, query strings, page text, or provider state.
          onDiagnostic({ kind: value.kind, name: String(value.name).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60),
            source: String(value.source || '').split(/[?#]/)[0].slice(0, 180),
            line: Number(value.line) || 0, column: Number(value.column) || 0,
            ...(typeof value.symbol === 'string' && /^[A-Za-z_$][\w$]{0,60}$/.test(value.symbol) ? { symbol: value.symbol } : {}),
            ...(value.kind === 'state' ? { children: Number(value.children) || 0, secure: value.secure === true } : {}) });
          response.writeHead(204); response.end();
        } catch { response.writeHead(400); response.end(); }
      }); return;
    }
    const scopedScript = route === '/main.js' && request.method === 'GET';
    const forwardedHeaders = backendHeaders(request.headers, target, localOrigin);
    if (scopedScript) {
      // A backend ETag identifies the unscoped bundle, not our adapted response.
      delete forwardedHeaders['if-none-match'];
      delete forwardedHeaders['if-modified-since'];
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: remotePort,
      path: request.url, method: request.method,
      headers: { ...forwardedHeaders,
        // The backend gzips HTML when browsers request compression. Request
        // identity for documents so the startup hook can precede its bundle;
        // keep compression for the large script and other resource responses.
        ...(scopedScript || (onDiagnostic && request.method === 'GET' &&
          (route === '/' || ['iframe', 'document'].includes(request.headers['sec-fetch-dest']))
          ) ? { 'accept-encoding': 'identity' } : {}),
      },
    }, reply => {
      const headers = { ...reply.headers };
      if (onDiagnostic) onDiagnostic({ kind: 'request', route, status: reply.statusCode });
      const csp = headers['content-security-policy'];
      if (csp) headers['content-security-policy'] = Array.isArray(csp)
        ? csp.map(value => embeddingPolicy(value, paneOrigin)) : embeddingPolicy(csp, paneOrigin);
      // Preserve root-relative assets and API routes on this dedicated port.
      // Redirects back to the backend remain on the proxy as well.
      if (headers.location) {
        try {
          const location = new URL(headers.location, target);
          if (location.origin === target.origin) headers.location = localOrigin + location.pathname + location.search + location.hash;
        } catch { /* Leave non-URL locations unchanged. */ }
      }
      if (scopedScript && reply.statusCode === 200 && headers['content-type']?.includes('javascript') && !headers['content-encoding']) {
        let source = ''; reply.setEncoding('utf8');
        reply.on('data', chunk => { source += chunk; });
        reply.on('end', () => {
          delete headers['content-length']; delete headers.etag; delete headers['last-modified'];
          headers['cache-control'] = 'no-store';
          response.writeHead(reply.statusCode, headers);
          response.end(scopeBundle(source));
        });
        reply.on('error', () => response.destroy()); return;
      }
      if (onDiagnostic && reply.statusCode === 200 && headers['content-type']?.startsWith('text/html') && !headers['content-encoding']) {
        let html = ''; reply.setEncoding('utf8');
        reply.on('data', chunk => { html += chunk; });
        reply.on('end', () => {
          delete headers['content-length']; delete headers.etag;
          headers['cache-control'] = 'no-store';
          response.writeHead(reply.statusCode, headers);
          response.end(html.replace(/<head>/i, `<head><script src="${diagnosticRoute}.js"></script>`)
            .replace(/src="\/main\.js"/g, 'src="/main.js?yzpz-scope=1"'));
        });
        reply.on('error', () => response.destroy()); return;
      }
      response.writeHead(reply.statusCode, headers);
      reply.pipe(response);
      reply.on('error', () => response.destroy());
    });
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain' });
      response.end('Antigravity local service is unavailable. Close and reopen the pane.');
    });
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });
  server.yzpzLocalTunnel = true;
  server.on('connection', socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (request, socket, head) => {
    if (request.headers.host !== new URL(localOrigin).host) { socket.destroy(); return; }
    const upstream = http.request({ hostname: '127.0.0.1', port: remotePort,
      path: request.url, method: request.method,
      headers: backendHeaders(request.headers, target, localOrigin),
    });
    upstream.on('upgrade', (reply, backend, backendHead) => {
      if (onDiagnostic) onDiagnostic({ kind: 'websocket', status: reply.statusCode });
      sockets.add(backend); backend.on('close', () => sockets.delete(backend));
      socket.write(`HTTP/1.1 ${reply.statusCode} ${reply.statusMessage}\r\n`);
      for (let index = 0; index < reply.rawHeaders.length; index += 2)
        socket.write(`${reply.rawHeaders[index]}: ${reply.rawHeaders[index + 1]}\r\n`);
      socket.write('\r\n');
      if (backendHead.length) socket.write(backendHead);
      if (head.length) backend.write(head);
      backend.on('error', () => socket.destroy());
      socket.on('error', () => backend.destroy());
      socket.on('close', () => backend.destroy());
      backend.on('close', () => socket.destroy());
      socket.pipe(backend).pipe(socket);
    });
    upstream.on('response', reply => {
      if (onDiagnostic) onDiagnostic({ kind: 'websocket', status: reply.statusCode });
      socket.end(`HTTP/1.1 ${reply.statusCode} ${reply.statusMessage}\r\nConnection: close\r\n\r\n`);
      reply.resume();
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upstream.end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  localOrigin = `http://127.0.0.1:${server.address().port}`;
  return { localAddress: localOrigin, dispose: () => {
    for (const socket of sockets) socket.destroy();
    return new Promise(resolve => server.close(resolve));
  } };
}

module.exports = { embeddingPolicy, backendHeaders, createTunnel, scopeBundle };
