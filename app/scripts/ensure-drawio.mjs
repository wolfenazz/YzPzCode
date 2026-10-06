/**
 * Ensures the draw.io webapp exists in `public/drawio/`.
 *
 * Runs automatically on `npm install` (postinstall), `npm run dev` and
 * `npm run build` so draw.io editing works with zero manual setup. When the
 * assets are already present this is a fast no-op. If a fetch is required but
 * fails (e.g. no network), a warning is printed and the process still exits 0
 * so installs/builds are not blocked.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRAWIO = join(ROOT, 'public', 'drawio');
// The editor links `mxgraph/css/common.css` at runtime; without it every popup
// menu loses `position: absolute` and renders below the editor. Older fetches
// stripped the whole `mxgraph/` folder, so treat a missing stylesheet as stale.
const REQUIRED = [join(DRAWIO, 'index.html'), join(DRAWIO, 'mxgraph', 'css', 'common.css')];

if (REQUIRED.every((file) => existsSync(file))) {
  console.log('draw.io webapp already present.');
  process.exit(0);
}

console.log('draw.io webapp missing or incomplete — fetching it now (requires internet)...');
const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'fetch-drawio.mjs')], {
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.warn(
    'WARNING: could not fetch the draw.io webapp. The diagram editor will be ' +
      'unavailable until `npm run fetch:drawio` succeeds.'
  );
}

process.exit(0);
