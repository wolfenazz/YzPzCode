const fs = require('node:fs');
const Module = require('node:module');
const { fileURLToPath } = require('node:url');

function adaptStartup(source) {
  const deadline = 'async waitForServerReady(url, timeoutMs = 15000)';
  const versionProbe = /(execFileAsync\(binaryPath, \['--version'\], \{\s*timeout: )5000(,\s*\})/;
  if (source.split(deadline).length !== 2 || !versionProbe.test(source)) return undefined;
  // Only increase bounded waits. The provider still performs its real HTTP
  // readiness check, verifies versions, and handles failed starts itself.
  return source.replace(deadline, 'async waitForServerReady(url, timeoutMs = 60000)')
    .replace(versionProbe, (_, before, after) => `${before}15000${after}`);
}

function installStartupCompatibility(filename) {
  if (!filename) return;
  const normalize = value => {
    const resolved = fs.realpathSync(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const target = normalize(filename);
  Module.registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    let matches = false;
    try { matches = url.startsWith('file:') && normalize(fileURLToPath(url)) === target; } catch { /* Not a disk-backed module. */ }
    if (matches) {
      const source = result.source == null ? fs.readFileSync(filename, 'utf8')
        : typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
      const adapted = adaptStartup(source);
      if (adapted) {
        console.info('[YzPzCode Antigravity] Backend readiness deadline: 60s; executable version probe: 15s.');
        return { ...result, source: adapted };
      } else console.warn('[YzPzCode Antigravity] This package has an unsupported startup adapter; using its original deadlines.');
    }
    return result;
  } });
}

module.exports = { adaptStartup, installStartupCompatibility };
