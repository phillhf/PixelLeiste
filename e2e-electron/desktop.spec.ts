// Starts the packaged desktop app (Windows or Linux build) and checks that it is usable.
// Run: PIXEL_EXE=<path to PixelLeiste executable> [PIXEL_UPDATE_MODE=none|deb|…] npx playwright test -c playwright.electron.config.ts
import { test, expect, _electron as electron } from '@playwright/test';

const exe = process.env.PIXEL_EXE!;

test('Desktop-App startet und Bluetooth ist verfügbar', async () => {
  test.skip(!exe, 'PIXEL_EXE not set');
  const app = await electron.launch({ executablePath: exe, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('#btnAdd')).toBeVisible({ timeout: 20_000 });
    expect(await page.title()).toBe('PixelLeiste');

    const env = await page.evaluate(async () => ({
      bluetooth: 'bluetooth' in navigator && typeof navigator.bluetooth.requestDevice === 'function',
      bridge: !!window.pixelDesktop,
      platform: window.pixelDesktop?.platform,
      updateMode: await window.pixelDesktop?.updateMode(),
      stats: await window.pixelDesktop?.sysStats(),
      version: document.getElementById('appVersion')?.textContent,
    }));
    expect(env.bluetooth).toBe(true);
    expect(env.bridge).toBe(true);
    expect(env.platform).toBe(process.platform);
    expect(env.updateMode).toBe(process.env.PIXEL_UPDATE_MODE ?? 'none');
    expect(env.stats!.ram).toBeGreaterThan(0);
    expect(env.version).toMatch(/\d+\.\d+\.\d+/);

    // Pixel font loads from the packaged files (file://)
    await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.includes('PixelUnifont') && f.status === 'loaded'))).toBe(true);
    await page.screenshot({ path: `test-results/desktop-${process.platform}.png` });
  } finally {
    await app.close();
  }
});
