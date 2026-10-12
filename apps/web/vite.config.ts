import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// Resolve the engine straight from source so `npm run dev` needs no prebuild.
const engineSrc = fileURLToPath(new URL('../../packages/waycine/src/', import.meta.url));
// Presets resolve like the package's `./presets/*` export.
const enginePresets = fileURLToPath(new URL('../../packages/waycine/presets/', import.meta.url));

// Fixed ports, always strict: a busy port is an error to report, never a reason
// to pick another one. playwright.config.ts repeats the dev URL.
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: [
      { find: /^waycine\/browser$/, replacement: `${engineSrc}browser/index.ts` },
      { find: /^waycine\/presets\/(.+)$/, replacement: `${enginePresets}$1` },
      { find: /^waycine$/, replacement: `${engineSrc}core/index.ts` },
    ],
  },
  build: {
    // Keep license comments (Mediabunny's MPL 2.0 header) in the bundled output.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
  // Mediabunny is only imported lazily (on export). Pre-bundling it up front
  // stops the dev server from discovering it mid-session and reloading the page.
  optimizeDeps: {
    include: ['mediabunny'],
  },
  server: {
    host: '127.0.0.1',
    port: 25180,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 25181,
    strictPort: true,
  },
});
