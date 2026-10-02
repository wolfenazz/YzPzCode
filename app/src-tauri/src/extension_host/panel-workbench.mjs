const DATABASE_PREFIX = 'vscode-web-state-db-';
const TRUST_DATABASE = `${DATABASE_PREFIX}global-shared`;
const TRUST_KEY = 'content.trust.model.key';
const STORE = 'ItemTable';

export function trustValue(previous, folder, trusted) {
  let entries;
  try { entries = JSON.parse(previous || '{}').uriTrustInfo; } catch { /* Invalid cached data is replaced. */ }
  entries = Array.isArray(entries) ? entries : [];
  const sameFolder = entry => entry.uri?.scheme === folder.scheme && entry.uri?.authority === folder.authority &&
    entry.uri?.path?.replace(/\/$/, '') === folder.path?.replace(/\/$/, '');
  entries = entries.filter(entry => !sameFolder(entry));
  if (trusted) entries.push({ uri: folder, trusted: true });
  return JSON.stringify({ uriTrustInfo: entries });
}

export async function restoreDatabase(indexedDB, name, entries, folder, trusted, replace = false) {
  if (!/^vscode-web-state-db-[a-z0-9_-]{1,120}$/i.test(name)) throw new Error('Invalid storage database');
  for (const value of Object.values(entries || {}))
    if (typeof value !== 'string') throw new Error('Invalid saved state value');
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(name);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE)) opening.result.createObjectStore(STORE);
    };
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => reject(new Error('Panel storage is busy'));
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction(STORE, 'readwrite');
      let updatedTrust;
      transaction.oncomplete = () => { db.close(); resolve(updatedTrust); };
      transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
      const store = transaction.objectStore(STORE);
      if (replace) store.clear();
      for (const [key, value] of Object.entries(entries || {})) {
        store.put(value, key);
      }
      if (name === TRUST_DATABASE && folder && typeof trusted === 'boolean') {
        const request = store.get(TRUST_KEY);
        request.onsuccess = () => {
          updatedTrust = trustValue(request.result, folder, trusted);
          store.put(updatedTrust, TRUST_KEY);
        };
      }
    };
  });
}

export async function captureDatabase(indexedDB, name) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(name);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      const keys = store.getAllKeys(), values = store.getAll();
      transaction.oncomplete = () => {
        const insert = keys.result.map((key, index) => [key, values.result[index]])
          .filter(([key, value]) => typeof key === 'string' && typeof value === 'string');
        db.close(); resolve({ database: name, clear: true, insert, delete: [], nativeChange: false });
      };
      transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}

export function mirrorStorage(prototype, enqueue) {
  for (const method of ['put', 'add', 'delete', 'clear']) {
    const original = prototype[method];
    prototype[method] = function (...args) {
      const result = original.apply(this, args);
      const database = this.transaction.db.name;
      if (this.name === STORE && /^vscode-web-state-db-[a-z0-9_-]{1,120}$/i.test(database)) {
        this.transaction.addEventListener('complete', () => {
          if (method === 'clear') enqueue({ database, clear: true, insert: [], delete: [] });
          else if (method === 'delete' && typeof args[0] === 'string')
            enqueue({ database, clear: false, insert: [], delete: [args[0]] });
          else if (typeof args[0] === 'string' && typeof args[1] === 'string')
            enqueue({ database, clear: false, insert: [[args[1], args[0]]], delete: [] });
        }, { once: true });
      }
      return result;
    };
  }
}

let bootstrapStage = 'configuration';

export function localTunnelProvider(send) {
  const addresses = new Map();
  const proxyAuthorities = new Set();
  async function open(port) {
    if (!addresses.has(port)) {
      const pending = send({ action: 'open', port }).then(({ localAddress }) => {
        const address = new URL(localAddress);
        if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1' || !address.port)
          throw new Error('Invalid local assistant address');
        proxyAuthorities.add(address.host);
        return localAddress;
      });
      addresses.set(port, pending);
      pending.catch(() => addresses.delete(port));
    }
    return addresses.get(port);
  }
  return { features: { public: false, protocol: false },
    // reh-web has no default external URI resolver. A tunnel factory alone
    // does not intercept vscode.env.asExternalUri; register the embedding
    // callback too, retaining the runtime's URI type and its path/query/hash.
    resolveExternalUri: async uri => {
      if (uri.scheme !== 'http') return uri;
      if (proxyAuthorities.has(uri.authority)) return uri;
      const match = /^(?:localhost|127\.0\.0\.1):(\d+)$/.exec(uri.authority);
      if (!match) return uri;
      const port = Number(match[1]);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) return uri;
      const address = new URL(await open(port));
      return uri.with({ scheme: 'http', authority: address.host });
    }, tunnelFactory: async options => {
    if (!['localhost', '127.0.0.1'].includes(options.remoteAddress.host)) return undefined;
    const port = options.remoteAddress.port;
    const localAddress = await open(port);
    return { remoteAddress: options.remoteAddress, localAddress, public: false, privacy: 'private',
      dispose: async () => {
        addresses.delete(port);
        proxyAuthorities.delete(new URL(localAddress).host);
        await send({ action: 'close', port });
      },
    };
  } };
}

async function boot() {
  const config = JSON.parse(document.getElementById('vscode-workbench-web-configuration').getAttribute('data-settings'));
  if (config.yzpzLocalTunnels) globalThis.yzpzLocalTunnels = localTunnelProvider(async value => {
    const response = await fetch('/yzpz-panel/tunnel', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    if (!response.ok) throw new Error(`Local assistant service ${response.status}`);
    return response.status === 204 ? undefined : response.json();
  });
  bootstrapStage = 'read';
  const response = await fetch('/yzpz-panel/storage', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`Panel storage ${response.status}`);
  const saved = await response.json();
  const databases = { ...saved.databases };
  if (typeof saved.trustedWorkspace === 'boolean') databases[TRUST_DATABASE] ||= {};
  bootstrapStage = 'restore';
  for (const [name, entries] of Object.entries(databases))
    await restoreDatabase(indexedDB, name, entries, config.folderUri, saved.trustedWorkspace,
      Object.hasOwn(saved.databases, name));
  // Capture pre-upgrade browser state before recording deltas. Restores can
  // then replace a table exactly, including keys deleted before an abrupt exit.
  if (indexedDB.databases) {
    bootstrapStage = 'capture';
    for (const { name } of await indexedDB.databases()) {
      if (!/^vscode-web-state-db-[a-z0-9_-]{1,120}$/i.test(name || '')) continue;
      const result = await fetch('/yzpz-panel/storage', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await captureDatabase(indexedDB, name)) });
      if (!result.ok) throw new Error(`Panel storage upgrade ${result.status}`);
    }
  }

  let queue = Promise.resolve();
  const pending = new Map();
  let timer;
  function enqueue(change) {
    let batch = pending.get(change.database);
    if (!batch) { batch = { database: change.database, clear: false, insert: new Map(), delete: new Set() }; pending.set(change.database, batch); }
    if (change.clear) { batch.clear = true; batch.insert.clear(); batch.delete.clear(); }
    for (const key of change.delete) { batch.insert.delete(key); batch.delete.add(key); }
    for (const [key, value] of change.insert) { batch.delete.delete(key); batch.insert.set(key, value); }
    timer ??= setTimeout(() => {
      timer = undefined;
      for (const batch of pending.values()) {
        const data = { database: batch.database, clear: batch.clear, insert: [...batch.insert], delete: [...batch.delete], nativeChange: true };
        queue = queue.then(async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const result = await fetch('/yzpz-panel/storage', { method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
              if (!result.ok) throw new Error(`Panel state save ${result.status}`);
              return;
            } catch (error) {
              if (attempt === 2) throw error;
              await new Promise(resolve => setTimeout(resolve, 250));
            }
          }
        }).catch(error => console.error('[YzPzCode panel state]', error.message));
      }
      pending.clear();
    }, 0);
  }
  mirrorStorage(IDBObjectStore.prototype, enqueue);
  let lastTrust = saved.trustedWorkspace;
  // An approval or revocation in one assistant applies to the same workspace
  // in other assistant hosts. The runtime still evaluates native folder trust.
  async function synchronizeTrust() {
    try {
      const response = await fetch('/yzpz-panel/trust', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(`Workspace trust ${response.status}`);
      const { trusted } = await response.json();
      if (typeof trusted === 'boolean' && trusted !== lastTrust) {
        const value = await restoreDatabase(indexedDB, TRUST_DATABASE, {}, config.folderUri, trusted);
        const channel = new BroadcastChannel(TRUST_DATABASE);
        channel.postMessage({ changed: new Map([[TRUST_KEY, value]]), deleted: new Set() });
        channel.close();
        lastTrust = trusted;
      }
    } catch (error) { console.warn('[YzPzCode workspace trust]', error.message); }
    setTimeout(synchronizeTrust, 2000);
  }
  setTimeout(synchronizeTrust, 2000);
  bootstrapStage = 'import';
  const css = document.querySelector('link[href$="/out/vs/code/browser/workbench/workbench.css"]');
  const script = new URL(css.href);
  if (script.origin !== location.origin) throw new Error('Invalid runtime script origin');
  script.pathname = script.pathname.replace(/\.css$/, '.js');
  // Existing profiles may have the unadapted immutable runtime asset cached.
  if (config.yzpzLocalTunnels) script.searchParams.set('yzpz-local-tunnels', '3');
  await import(script.href);
}

if (typeof window !== 'undefined') void boot().catch(error => {
  console.error('[YzPzCode panel startup]', error.message);
  void fetch('/yzpz-panel/diagnostic', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: bootstrapStage, name: String(error.name || 'Error').slice(0, 60),
      message: String(error.message || 'Unknown startup error').slice(0, 400) }),
  }).catch(() => {});
  window.dispatchEvent(new CustomEvent('yzpz-boot-error', {
    detail: 'Could not restore the assistant’s saved state. Retry opening the panel.',
  }));
});
