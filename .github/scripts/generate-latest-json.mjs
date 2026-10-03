import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tag = process.env.TAG;
const repo = process.env.GITHUB_REPOSITORY;
const dryRun = process.env.DRY_RUN === '1';

if (!tag || !repo) {
  console.error('TAG and GITHUB_REPOSITORY environment variables are required');
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'latest-json-'));

execFileSync(
  'gh',
  ['release', 'download', tag, '--repo', repo, '--pattern', '*.sig', '--dir', dir, '--clobber'],
  { stdio: 'inherit' },
);

const platforms = {};
const addPlatform = (key, bundle) => {
  const signature = readFileSync(join(dir, `${bundle}.sig`), 'utf8').trim();
  if (!signature) {
    throw new Error(`Signature file for ${bundle} is empty`);
  }
  platforms[key] = {
    signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${bundle}`,
  };
};

for (const file of readdirSync(dir)) {
  if (!file.endsWith('.sig')) continue;
  const bundle = file.slice(0, -'.sig'.length);
  if (bundle.endsWith('.AppImage')) {
    addPlatform('linux-x86_64', bundle);
    addPlatform('linux-x86_64-appimage', bundle);
  } else if (bundle.endsWith('.deb')) {
    addPlatform('linux-x86_64-deb', bundle);
  } else if (bundle.endsWith('.rpm')) {
    addPlatform('linux-x86_64-rpm', bundle);
  } else if (bundle.endsWith('.msi')) {
    addPlatform('windows-x86_64', bundle);
    addPlatform('windows-x86_64-msi', bundle);
  } else if (bundle.endsWith('-setup.exe')) {
    addPlatform('windows-x86_64-nsis', bundle);
  } else if (bundle.endsWith('aarch64.app.tar.gz')) {
    addPlatform('darwin-aarch64', bundle);
    addPlatform('darwin-aarch64-app', bundle);
  } else if (bundle.endsWith('x64.app.tar.gz')) {
    addPlatform('darwin-x86_64', bundle);
    addPlatform('darwin-x86_64-app', bundle);
  } else {
    console.warn(`Ignoring unrecognized updater bundle: ${bundle}`);
  }
}

const expectedKeys = [
  'linux-x86_64',
  'linux-x86_64-appimage',
  'linux-x86_64-deb',
  'linux-x86_64-rpm',
  'windows-x86_64',
  'windows-x86_64-msi',
  'windows-x86_64-nsis',
  'darwin-aarch64',
  'darwin-aarch64-app',
  'darwin-x86_64',
  'darwin-x86_64-app',
];
const missing = expectedKeys.filter((key) => !platforms[key]);
if (missing.length > 0) {
  console.error(`Missing updater bundles for platforms: ${missing.join(', ')}`);
  process.exit(1);
}

const manifest = {
  version: tag.replace(/^v/, ''),
  notes: 'See the release notes',
  pub_date: new Date().toISOString(),
  platforms,
};

if (dryRun) {
  const outputPath = join(process.cwd(), 'latest.json');
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${outputPath} (${expectedKeys.length} platforms)`);
} else {
  const outputPath = join(dir, 'latest.json');
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  execFileSync('gh', ['release', 'upload', tag, outputPath, '--repo', repo, '--clobber'], {
    stdio: 'inherit',
  });
  console.log(`Uploaded latest.json for ${tag} (${expectedKeys.length} platforms)`);
}
