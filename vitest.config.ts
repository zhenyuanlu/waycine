import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The web app resolves `waycine` to the engine source and `waycine/presets/*`
// to the preset files, as apps/web/vite.config.ts does.
const engineCore = fileURLToPath(new URL('./packages/waycine/src/core/index.ts', import.meta.url));
const enginePresets = fileURLToPath(new URL('./packages/waycine/presets/', import.meta.url));
// The CLI tests resolve `waycine/node` to the engine source too, so `npm test` after an
// engine edit never runs them against a stale `packages/waycine/dist`.
const engineNode = fileURLToPath(new URL('./packages/waycine/src/node/index.ts', import.meta.url));

// One project per package, limited to packages/*/test, plus the web app's pure
// helpers (apps/web/src/**/*.test.ts). Browser e2e specs (apps/web/e2e) belong
// to Playwright and are never collected here.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'waycine',
          include: ['packages/waycine/test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: {
          alias: [{ find: /^waycine\/node$/, replacement: engineNode }],
        },
        test: {
          name: 'cli',
          include: ['packages/cli/test/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: {
          alias: [
            { find: /^waycine$/, replacement: engineCore },
            { find: /^waycine\/presets\/(.+)$/, replacement: `${enginePresets}$1` },
          ],
        },
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
