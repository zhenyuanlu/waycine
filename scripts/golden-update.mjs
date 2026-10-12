#!/usr/bin/env node
// Regenerates the golden frames (`npm run golden:update`).
//
// Runs the golden tests (packages/waycine/test/golden) with
// WAYCINE_GOLDEN_UPDATE=1: every case is rendered with @napi-rs/canvas and the
// bundled fonts, a PNG under packages/waycine/test/golden/png/ is written only
// when it is missing or its pixels changed, and PNGs that no case produces any
// more are removed. Look at every changed PNG before committing it.
//
//   node scripts/golden-update.mjs

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const result = spawnSync(
  process.execPath,
  [vitest, 'run', '--project', 'waycine', 'packages/waycine/test/golden/'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, WAYCINE_GOLDEN_UPDATE: '1' } },
);
if (result.error !== undefined) {
  console.error(`golden:update could not start vitest: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
