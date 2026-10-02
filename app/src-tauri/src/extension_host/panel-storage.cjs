const fs = require('node:fs');
const crypto = require('node:crypto');
const MAX_BYTES = 8 * 1024 * 1024;

function readJson(file) {
  if (!file || !fs.existsSync(file)) return undefined;
  if (fs.statSync(file).size > MAX_BYTES) throw new Error('Saved panel state exceeds the size limit');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > MAX_BYTES) throw new Error('Panel state exceeds the size limit');
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, json); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function rememberedTrust(file, workspacePath) {
  const saved = readJson(file);
  return saved?.version === 1 && saved.workspacePath === workspacePath && typeof saved.trusted === 'boolean'
    ? saved.trusted : undefined;
}

function saveTrust(file, workspacePath, trusted) {
  if (!file || !workspacePath || typeof trusted !== 'boolean') throw new Error('Invalid workspace trust record');
  writeJson(file, { version: 1, workspacePath, trusted });
}

function readStorage(file) {
  const saved = readJson(file);
  if (!saved) return { version: 1, databases: {} };
  if (saved.version !== 1 || !saved.databases || typeof saved.databases !== 'object' || Array.isArray(saved.databases))
    throw new Error('Invalid saved panel state');
  return saved;
}

function folderIsTrusted(entries, folder) {
  if (!folder || !Array.isArray(entries)) return false;
  const normalize = value => {
    const path = (value || '').replace(/\/$/, '');
    return /^\/[a-z]:/i.test(folder.path) ? path.toLowerCase() : path;
  };
  const current = normalize(folder.path);
  return entries.some(entry => {
    const parent = normalize(entry.uri?.path);
    return entry.trusted === true && entry.uri?.scheme === folder.scheme &&
      entry.uri?.authority?.toLowerCase() === folder.authority?.toLowerCase() &&
      (current === parent || current.startsWith(`${parent}/`));
  });
}

function updateStorage(file, change) {
  if (!change || !/^vscode-web-state-db-[a-z0-9_-]{1,120}$/i.test(change.database) ||
      !Array.isArray(change.insert) || !Array.isArray(change.delete) ||
      typeof change.clear !== 'boolean' || change.insert.length + change.delete.length > 10000)
    throw new Error('Invalid panel state change');
  const saved = readStorage(file);
  const data = new Map(change.clear ? [] : Object.entries(saved.databases[change.database] || {}));
  for (const key of change.delete) {
    if (typeof key !== 'string' || key.length > 2048) throw new Error('Invalid state key');
    data.delete(key);
  }
  for (const item of change.insert) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || item[0].length > 2048 ||
        typeof item[1] !== 'string') throw new Error('Invalid state value');
    data.set(item[0], item[1]);
  }
  saved.databases[change.database] = Object.fromEntries(data);
  writeJson(file, saved);
}

module.exports = { MAX_BYTES, rememberedTrust, saveTrust, readStorage, updateStorage, folderIsTrusted };
