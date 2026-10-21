// Generates the README screenshots (docs/screenshots). Run: SCREENSHOTS=1 npx playwright test screenshots
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const mock = readFileSync(new URL('./mock-ble.js', import.meta.url), 'utf8');
const OUT = 'docs/screenshots';

test.skip(!process.env.SCREENSHOTS, 'only on demand');

async function setup(page: Page, lang: 'de' | 'en') {
  await page.addInitScript(mock);
  await page.addInitScript((l) => localStorage.setItem('pixelleiste', JSON.stringify({ $lang: l, autoUpdate: false })), lang);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.locator('#btnAdd').click();
  await expect(page.locator('.chip.connected')).toHaveCount(1);
  await page.locator('#btnAdd').click();
  await expect(page.locator('.chip.connected')).toHaveCount(2);
}

for (const lang of ['de', 'en'] as const) {
  test(`desktop ${lang}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.setViewportSize({ width: 900, height: 820 });
    await setup(page, lang);
    await page.locator('#txtFont').selectOption('Arial');
    await page.locator('#txt').fill(lang === 'de' ? 'Hallo 👋 PixelLeiste' : 'Hello 👋 PixelLeiste');
    await page.locator('#txtRainbow').selectOption('1');
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${OUT}/text-${lang}.png` });

    await page.getByRole('tab').nth(5).click();
    await page.locator('#liveTpl').fill('{zeit}  {tag}  {datum}');
    await page.locator('#liveTpl').dispatchEvent('input');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/live-${lang}.png` });

    await page.getByRole('tab').nth(2).click();
    await page.evaluate(() => {
      // Draw a small heart into the editor via synthetic pointer events
      const c = document.getElementById('drawCanvas') as HTMLCanvasElement;
      const r = c.getBoundingClientRect();
      const heart = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
      heart.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch !== '#') return;
        const ev = (type: string) => new PointerEvent(type, { clientX: r.left + ((44 + x + 0.5) / 96) * r.width, clientY: r.top + ((5 + y + 0.5) / 16) * r.height, pointerId: 1, bubbles: true });
        c.dispatchEvent(ev('pointerdown')); c.dispatchEvent(ev('pointerup'));
      }));
    });
    await page.screenshot({ path: `${OUT}/draw-${lang}.png` });
  });

  test(`phone ${lang}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    await setup(page, lang);
    await page.locator('#txt').fill(lang === 'de' ? 'Gute Fahrt!' : 'Drive safe!');
    await page.locator('#txtColor').fill('#ffd60a');
    await page.waitForTimeout(2600); // let the "connected" toast fade out
    await page.screenshot({ path: `${OUT}/phone-${lang}.png` });
    await page.getByRole('tab').nth(4).click();
    await page.screenshot({ path: `${OUT}/phone-music-${lang}.png` });
  });
}
