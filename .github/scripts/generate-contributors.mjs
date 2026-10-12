// Builds docs/readme/contributors.svg from the repository's real contributors.
//
// GitHub's Contributors list counts commit authors AND "Co-authored-by"
// trailers, but the REST contributors endpoint only returns authors. This
// script merges both so the README graphic matches the repository page:
//   1. GET /repos/{repo}/contributors            -> commit authors
//   2. GET /repos/{repo}/commits (all pages)     -> Co-authored-by trailers
// Co-author emails are resolved to logins through the noreply pattern, the
// `emails` map in .github/contributors.json, or a public-email user search.
//
// Usage: node .github/scripts/generate-contributors.mjs [--repo owner/name] [--out path]
// Set GITHUB_TOKEN (the Action does) to avoid anonymous rate limits.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const repo = flag('--repo', process.env.GITHUB_REPOSITORY || 'wolfenazz/YzPzCode');
const outPath = resolve(root, flag('--out', 'docs/readme/contributors.svg'));
const configPath = resolve(root, '.github/contributors.json');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'yzpzcode-contributors-graphic',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function api(path) {
  const response = await fetch(path.startsWith('http') ? path : `https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${path}`);
  return response.json();
}

async function paged(path) {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function readConfig() {
  try {
    const raw = JSON.parse(await readFile(configPath, 'utf8'));
    return { emails: {}, names: {}, roles: {}, exclude: [], ...raw };
  } catch {
    return { emails: {}, names: {}, roles: {}, exclude: [] };
  }
}

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const key = (login) => login.toLowerCase();

async function loginForEmail(email, config) {
  const lower = email.toLowerCase();
  const mapped = Object.entries(config.emails).find(([address]) => address.toLowerCase() === lower);
  if (mapped) return mapped[1];
  const noreply = lower.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  if (noreply) return noreply[1];
  try {
    const found = await api(`/search/users?q=${encodeURIComponent(`${email} in:email`)}`);
    return found.items?.[0]?.login ?? null;
  } catch {
    return null;
  }
}

async function collect(config) {
  /** @type {Map<string, {login:string, commits:number, coAuthored:number, isAuthor:boolean}>} */
  const people = new Map();
  const touch = (login) => {
    const id = key(login);
    if (!people.has(id)) people.set(id, { login, commits: 0, coAuthored: 0, isAuthor: false });
    return people.get(id);
  };

  for (const entry of await paged(`/repos/${repo}/contributors`)) {
    if (!entry.login) continue;
    const person = touch(entry.login);
    person.commits += entry.contributions;
    person.isAuthor = true;
  }

  const emailCache = new Map();
  for (const commit of await paged(`/repos/${repo}/commits`)) {
    const trailers = [...String(commit.commit?.message ?? '').matchAll(/^co-authored-by:\s*.+?<([^>]+)>/gim)];
    for (const [, email] of trailers) {
      if (!emailCache.has(email)) emailCache.set(email, await loginForEmail(email, config));
      const login = emailCache.get(email);
      if (login) touch(login).coAuthored += 1;
      else console.warn(`No GitHub account for co-author <${email}>; add it to .github/contributors.json "emails".`);
    }
  }

  const excluded = new Set(config.exclude.map(key));
  return [...people.values()]
    .filter((person) => !excluded.has(key(person.login)))
    .sort((a, b) => (b.commits + b.coAuthored) - (a.commits + a.coAuthored) || a.login.localeCompare(b.login));
}

async function avatarData(url) {
  const sized = `${url}${url.includes('?') ? '&' : '?'}s=128`;
  const response = await fetch(sized, { headers: { 'User-Agent': headers['User-Agent'] } });
  if (!response.ok) throw new Error(`avatar ${response.status} for ${url}`);
  const type = response.headers.get('content-type')?.split(';')[0] || 'image/png';
  return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
}

async function describe(people, config) {
  const described = [];
  for (const person of people) {
    const profile = await api(`/users/${person.login}`);
    described.push({
      login: profile.login,
      name: config.names[profile.login] || profile.name || profile.login,
      role: config.roles[profile.login] || (person.isAuthor ? 'Contributor' : 'Co-author'),
      count: person.commits + person.coAuthored,
      image: await avatarData(profile.avatar_url),
      human: person.isAuthor,
    });
  }
  return described;
}

// Layout ---------------------------------------------------------------------

const W = 1600;
const MAX_STACK = 14;
const CARD_COLUMNS = 4;
const CARD_W = (W - 120 - (CARD_COLUMNS - 1) * 20) / CARD_COLUMNS;
const CARD_H = 92;

function render(people) {
  const shown = people.slice(0, MAX_STACK);
  const extra = people.length - shown.length;
  const R = 62;
  const STEP = 84;
  const stackY = 262;
  const cardsTop = 372;
  const rows = Math.max(1, Math.ceil(people.length / CARD_COLUMNS));
  const H = cardsTop + rows * (CARD_H + 16) + 84;

  const defs = people.map((person, i) => `<image id="av${i}" width="128" height="128" href="${person.image}" preserveAspectRatio="xMidYMid slice"/>`).join('\n    ');

  const stack = [];
  const slots = shown.length + 1 + (extra > 0 ? 1 : 0);
  // Later circles sit behind earlier ones, so draw from the end.
  const joinX = 60 + R + (shown.length + (extra > 0 ? 1 : 0)) * STEP;
  stack.push(`<g filter="url(#sh)">`);
  stack.push(`<circle cx="${joinX}" cy="${stackY}" r="${R + 5}" fill="#0B0D10"/><circle cx="${joinX}" cy="${stackY}" r="${R}" fill="#12151A" stroke="#3A404A" stroke-width="2" stroke-dasharray="6 7"/><path d="M${joinX - 14} ${stackY}h28M${joinX} ${stackY - 14}v28" stroke="#6B7380" stroke-width="3" stroke-linecap="round"/>`);
  if (extra > 0) {
    const x = 60 + R + shown.length * STEP;
    stack.push(`<circle cx="${x}" cy="${stackY}" r="${R + 5}" fill="#0B0D10"/><circle cx="${x}" cy="${stackY}" r="${R}" fill="#171B21" stroke="#3A404A" stroke-width="2"/><text x="${x}" y="${stackY + 8}" text-anchor="middle" class="n">+${extra}</text>`);
  }
  for (let i = shown.length - 1; i >= 0; i -= 1) {
    const x = 60 + R + i * STEP;
    const scale = (2 * R) / 128;
    stack.push(
      `<circle cx="${x}" cy="${stackY}" r="${R + 5}" fill="#0B0D10"/>`,
      `<g transform="translate(${x - R} ${stackY - R}) scale(${scale})"><use href="#av${i}" clip-path="url(#round)"/></g>`,
      `<circle cx="${x}" cy="${stackY}" r="${R}" fill="none" stroke="${shown[i].human ? 'url(#gem)' : '#3A404A'}" stroke-width="3"/>`,
    );
  }
  stack.push('</g>');

  const cards = people.map((person, i) => {
    const col = i % CARD_COLUMNS;
    const row = Math.floor(i / CARD_COLUMNS);
    const x = 60 + col * (CARD_W + 20);
    const y = cardsTop + row * (CARD_H + 16);
    return `<g transform="translate(${x} ${y})">
      <rect width="${CARD_W}" height="${CARD_H}" rx="16" fill="#12151A" stroke="#232830"/>
      <g transform="translate(20 18) scale(${56 / 128})"><use href="#av${i}" clip-path="url(#round)"/></g>
      <circle cx="48" cy="46" r="28" fill="none" stroke="${person.human ? 'url(#gem)' : '#3A404A'}" stroke-width="2"/>
      <text class="cn" x="90" y="38">${esc(person.name)}</text>
      <text class="cr" x="90" y="58">${esc(person.role)}</text>
      <text class="cm" x="90" y="78">@${esc(person.login)} · ${person.count}</text>
    </g>`;
  });

  const total = people.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
  <title id="t">Contributors</title>
  <desc id="d">${esc(total)} contributors to ${esc(repo)}, generated from the repository: ${esc(people.map((p) => p.name).join(', '))}.</desc>
  <defs>
    <pattern id="px" width="18" height="18" patternUnits="userSpaceOnUse"><rect x="3" y="3" width="12" height="12" rx="2.5" fill="#fff" opacity="0.03"/></pattern>
    <linearGradient id="gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285F4"/><stop offset="0.55" stop-color="#9B72CB"/><stop offset="1" stop-color="#D96570"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#9B72CB" stop-opacity="0.2"/><stop offset="1" stop-color="#9B72CB" stop-opacity="0"/></radialGradient>
    <clipPath id="card"><rect width="${W}" height="${H}" rx="28"/></clipPath>
    <clipPath id="round"><circle cx="64" cy="64" r="64"/></clipPath>
    <filter id="sh" x="-10%" y="-30%" width="120%" height="170%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.55"/></filter>
    ${defs}
  </defs>
  <style>
    .tag{font:700 13px 'SF Mono','JetBrains Mono',Consolas,Menlo,monospace;letter-spacing:2.5px;fill:#9B72CB}
    .h{font:700 34px Inter,'Segoe UI',Helvetica,Arial,sans-serif;fill:#F4F5F7;letter-spacing:-0.6px}
    .p{font:400 16px Inter,'Segoe UI',Helvetica,Arial,sans-serif;fill:#8A929E}
    .n{font:700 22px Inter,'Segoe UI',Helvetica,Arial,sans-serif;fill:#F4F5F7}
    .cn{font:700 18px Inter,'Segoe UI',Helvetica,Arial,sans-serif;fill:#F4F5F7}
    .cr{font:600 13px Inter,'Segoe UI',Helvetica,Arial,sans-serif;fill:#C9CED6}
    .cm{font:500 12px 'SF Mono',Consolas,Menlo,monospace;fill:#8A929E}
  </style>
  <g clip-path="url(#card)">
    <rect width="${W}" height="${H}" fill="#0B0D10"/>
    <rect width="${W}" height="${H}" fill="url(#px)"/>
    <ellipse cx="420" cy="${stackY}" rx="520" ry="240" fill="url(#glow)"/>
    <text class="tag" x="60" y="72">${total} CONTRIBUTOR${total === 1 ? '' : 'S'}</text>
    <text class="h" x="60" y="118">The people building YzPzCode.</text>
    <text class="p" x="60" y="150">Open source under Apache 2.0. Pulled live from the repository: commit authors and co-authors.</text>
    ${stack.join('\n    ')}
    ${cards.join('\n    ')}
    <text class="cm" x="60" y="${H - 36}">+  The dashed circle is yours. Open a pull request. Updated automatically.</text>
  </g>
</svg>
`;
}

const config = await readConfig();
const people = await describe(await collect(config), config);
if (people.length === 0) throw new Error('No contributors found; refusing to write an empty graphic.');
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, render(people));
console.log(`Wrote ${outPath} with ${people.length} contributors: ${people.map((p) => p.login).join(', ')}`);
