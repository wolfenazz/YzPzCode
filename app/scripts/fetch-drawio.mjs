/**
 * Fetches and extracts the draw.io webapp into `public/drawio/`.
 *
 * The npm package named `drawio` is an unrelated CLI, so we vendor the compiled
 * webapp from the official jgraph/drawio GitHub release (the `draw.war` asset is
 * a plain ZIP containing the static webapp at its root).
 *
 * Run manually with: npm run fetch:drawio
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '31.1.8';
const WAR_URL = `https://github.com/jgraph/drawio/releases/download/v${VERSION}/draw.war`;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DIR = join(ROOT, '.tmp-drawio');
const WAR_PATH = join(TMP_DIR, 'draw.war');
const OUT_DIR = join(ROOT, 'public', 'drawio');
// Server/debug-only folders that are not needed by the static editor.
const EXCLUDE = ['WEB-INF', 'META-INF', 'mxgraph', 'connect'];

function download() {
  console.log(`Downloading draw.io ${VERSION} webapp...`);
  mkdirSync(TMP_DIR, { recursive: true });
  return fetch(WAR_URL).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${WAR_URL}`);
    writeFileSync(WAR_PATH, Buffer.from(await res.arrayBuffer()));
  });
}

async function main() {
  if (!existsSync(WAR_PATH) || statSync(WAR_PATH).size < 1_000_000) {
    await download();
  }

  console.log('Extracting webapp to public/drawio ...');
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  execSync(`tar -xf "${WAR_PATH}" -C "${OUT_DIR}"`, { stdio: 'inherit' });

  for (const dir of EXCLUDE) {
    rmSync(join(OUT_DIR, dir), { recursive: true, force: true });
  }

  rmSync(TMP_DIR, { recursive: true, force: true });
  const sizeMb = (() => {
    let total = 0;
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else total += statSync(p).size;
      }
    };
    walk(OUT_DIR);
    return (total / (1024 * 1024)).toFixed(1);
  })();
  console.log(`Done. draw.io webapp extracted (${sizeMb} MB) to public/drawio`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
