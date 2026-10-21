import { defineConfig } from '@playwright/test';

// Smoke test of the packaged desktop app (see e2e-electron/desktop.spec.ts).
export default defineConfig({
  testDir: 'e2e-electron',
  timeout: 60_000,
  reporter: process.env.CI ? 'github' : 'list',
});
