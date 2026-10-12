import { defineConfig } from '@playwright/test';

// Must match the fixed dev server in vite.config.ts (127.0.0.1:25180, strictPort).
const DEV_URL = 'http://127.0.0.1:25180';

// The browser is an installed one, chosen by WAYCINE_E2E_CHANNEL: Microsoft Edge by
// default (it ships H.264 on Windows 11); CI sets it to `chrome` (the runners have
// Google Chrome). Playwright's bundled Chromium is never used.
const CHANNEL = process.env.WAYCINE_E2E_CHANNEL || 'msedge';

// Two projects: the smoke specs run in parallel first; the exports run after
// them, one at a time (the export project depends on the smoke project), so an
// export never shares the machine with the smoke specs' players and the export
// time it records means something.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: DEV_URL,
    channel: CHANNEL,
    trace: 'retain-on-failure',
  },
  projects: [
    // Every spec runs in the smoke project except the export ones: a file whose name ends in
    // `export.spec.ts` (export.spec.ts and layout-shift-export.spec.ts today) runs in the
    // serial export project. Both projects use the same pattern, so every spec file belongs
    // to exactly one of them and a new spec runs in smoke unless its name ends that way.
    {
      name: 'smoke',
      testIgnore: /export\.spec\.ts/,
      fullyParallel: true,
    },
    {
      name: 'export',
      testMatch: /export\.spec\.ts/,
      dependencies: ['smoke'],
      fullyParallel: false,
      workers: 1,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: DEV_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
