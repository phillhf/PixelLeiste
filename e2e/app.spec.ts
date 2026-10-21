import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const mock = readFileSync(new URL('./mock-ble.js', import.meta.url), 'utf8');

type Content = { kind: string; bytes: number; slot: number } | undefined;
const lastContent = (page: Page, i = 0) => page.evaluate((n) => (window as any).__mockBle.devices[n].lastContent as Content, i);
const frames = (page: Page, i = 0) => page.evaluate((n) => (window as any).__mockBle.devices[n].frames as { cmd: number; sub: number; hex: string }[], i);

async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name }).click();
}

async function connect(page: Page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.locator('#btnAdd').click();
    await expect(page.locator('.chip.connected')).toHaveCount(i + 1);
  }
}

async function answerPrompt(page: Page, value: string) {
  await expect(page.locator('#prompt')).toBeVisible();
  await page.locator('#promptInput').fill(value);
  await page.locator('#promptOk').click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
});

test('sendet Text in Leisten-Schrift', async ({ page }) => {
  await connect(page);
  await expect(page.locator('.chip')).toContainText('LED_BLE_A1B2 · 96×16');
  await page.locator('#txt').fill('Hallo');
  await page.locator('#btnText').click();
  await expect.poll(() => lastContent(page)).toMatchObject({ kind: 'text', slot: 0 });
  // 5 characters × (4 + 16) bytes + 14 byte header
  expect((await lastContent(page))!.bytes).toBe(5 * 20 + 14);
});

test('System-Schrift mit Emoji wird als animiertes GIF gesendet', async ({ page }) => {
  await connect(page);
  await page.locator('#txtFont').selectOption('Arial');
  await expect(page.locator('#sysFontOpts')).toBeVisible();
  await page.locator('#txt').fill('Party 🎉 heute');
  await page.locator('#txtSlot').selectOption('3');
  await page.locator('#btnText').click();
  await expect.poll(() => lastContent(page), { timeout: 15_000 }).toMatchObject({ kind: 'gif', slot: 3 });
});

test('Bild wird skaliert und als PNG gesendet', async ({ page }) => {
  await connect(page);
  await openTab(page, 'Bild / GIF');
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 300; c.height = 100;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, 150, 100);
    ctx.fillStyle = '#00f'; ctx.fillRect(150, 0, 150, 100);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#imgFile').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('#imgInfo')).toContainText('300×100');
  await page.locator('#btnImage').click();
  await expect.poll(() => lastContent(page)).toMatchObject({ kind: 'png', slot: 0 });
});

test('zwei Leisten gleichzeitig, Abwahl und automatisches Neuverbinden', async ({ page }) => {
  await connect(page, 2);
  await page.locator('#txt').fill('Beide');
  await page.locator('#btnText').click();
  await expect.poll(() => lastContent(page, 1)).toMatchObject({ kind: 'text' });
  expect(await lastContent(page, 0)).toMatchObject({ kind: 'text' });

  // Untick the second strip → only the first one receives the next text
  await page.locator('.chip').nth(1).locator('input').uncheck();
  const before = (await frames(page, 1)).length;
  await page.locator('#btnText').click();
  await expect(page.locator('#toast')).toContainText('✓');
  expect((await frames(page, 1)).length).toBe(before);

  // Lost connection → reconnects by itself
  await page.evaluate(() => (window as any).__mockBle.dropConnection('LED_BLE_A1B2'));
  await expect(page.locator('.chip.reconnecting')).toHaveCount(1);
  await expect(page.locator('.chip.connected')).toHaveCount(2, { timeout: 10_000 });
});

test('Favoriten und Profil in Speicherplätze laden', async ({ page }) => {
  await connect(page);
  await page.locator('#txt').fill('Eins');
  await page.locator('#btnTextFav').click();
  await answerPrompt(page, 'Erster');
  await page.locator('#txt').fill('Zwei');
  await page.locator('#btnTextFav').click();
  await answerPrompt(page, 'Zweiter');

  await openTab(page, 'Favoriten');
  await expect(page.locator('.fav')).toHaveCount(2);
  for (const box of await page.locator('.fav input[type=checkbox]').all()) await box.check();
  await page.locator('#profName').fill('Auto');
  await page.locator('#btnProfCreate').click();
  await expect(page.locator('.prof')).toContainText('2 Inhalte');

  await page.locator('.prof button.primary').click();
  await expect(page.locator('#toast')).toContainText('Profil „Auto“ übertragen', { timeout: 15_000 });
  const f = await frames(page);
  const texts = f.filter((x) => x.cmd === 0 && x.sub === 1);
  expect(texts.map((x) => x.hex.slice(28, 30))).toEqual(['01', '02']); // save slots 1 and 2
  expect(f.filter((x) => x.cmd === 2 && x.sub === 1)).toHaveLength(8); // slots 3..10 cleared
  expect(f[f.length - 1].hex).toBe('07000880010001'); // show slot 1
});

test('Passwortschutz: setzen und beim Verbinden abfragen', async ({ page }) => {
  await page.evaluate(() => { (window as any).__mockBle.devices[0].passwordFlag = 1; });
  await page.locator('#btnAdd').click();
  await answerPrompt(page, '123456');
  await expect(page.locator('.chip.connected')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__mockBle.devices[0].verified)).toBe('0c2238');
});

test('Sprache umschalten', async ({ page }) => {
  await openTab(page, 'Gerät');
  await page.locator('#lang').selectOption('en');
  await expect(page.getByRole('tab', { name: 'Draw' })).toBeVisible();
  await expect(page.locator('#btnAdd')).toHaveText('Connect');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Device' })).toBeVisible();
});

test('kein horizontales Scrollen', async ({ page }) => {
  for (const tab of ['Text', 'Bild / GIF', 'Zeichnen', 'Favoriten', 'Musik', 'Uhr & Live', 'Gerät']) {
    await openTab(page, tab);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, tab).toBeLessThanOrEqual(0);
  }
});
