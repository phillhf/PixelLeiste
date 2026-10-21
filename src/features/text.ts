// Text tab: native pixel-font text (the panel animates it) or system fonts rendered as image/GIF.
import * as P from '../protocol/ipixel';
import { hexToRgb, loadPixelFont, renderText, type RGB } from '../render/glyphs';
import { textToFrames } from '../render/textImage';
import { encodeGif, encodePng } from '../render/image';
import type { TextFavorite } from '../storage/db';
import { $, checked, num, toast, val } from '../ui/dom';
import { blank, showPreview } from '../ui/preview';
import { send, size } from '../app';
import { t } from '../i18n';
import { saveFavorite } from './favorites';

/** Current form state as a favourite-compatible description. */
export function currentText(): TextFavorite {
  return {
    kind: 'text',
    text: val('txt'),
    font: val('txtFont'),
    animation: num('txtAnim'),
    speed: num('txtSpeed'),
    rainbow: num('txtRainbow'),
    color: val('txtColor'),
    background: checked('txtBgOn') ? val('txtBg') : null,
    size: num('txtSize'),
    bold: checked('txtBold'),
    smooth: checked('txtSmooth'),
  };
}

const isNative = (d: TextFavorite) => d.font === 'pixel';

function hsl(h: number): RGB {
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}

/** Pixel-font text drawn into one wide strip (for the preview). */
async function nativeStrip(d: TextFavorite, h: number) {
  const glyphs = await renderText(d.text || ' ', h >= 32 ? 32 : 16);
  const width = glyphs.reduce((n, g) => n + g.width, 0);
  const strip = blank(Math.max(1, width), h);
  const ctx = strip.getContext('2d')!;
  const img = ctx.createImageData(strip.width, h);
  const base = hexToRgb(d.color);
  const bg = d.background ? hexToRgb(d.background) : null;
  let x0 = 0;
  for (const g of glyphs) {
    for (let y = 0; y < Math.min(g.height, h); y++) {
      for (let x = 0; x < g.width; x++) {
        const on = g.pixels[y * g.width + x];
        const c = on ? (d.rainbow ? hsl(((x0 + x) * 360) / Math.max(width, 1)) : g.color ?? base) : bg;
        if (c) img.data.set([c[0], c[1], c[2], 255], (y * strip.width + x0 + x) * 4);
      }
    }
    x0 += g.width;
  }
  ctx.putImageData(img, 0, 0);
  return { glyphs, strip };
}

function imageOptions(d: TextFavorite) {
  return {
    font: d.font, size: d.size, bold: d.bold, smooth: d.smooth, color: d.color,
    background: d.background, rainbow: d.rainbow > 0, animation: d.animation, speed: d.speed,
  };
}

/** Builds the send plan for one panel (also used for favourites and profiles). */
export async function buildTextPlan(d: TextFavorite, info: P.DeviceInfo, slot: number): Promise<P.SendPlan> {
  if (isNative(d)) {
    const { glyphs } = await nativeStrip(d, info.height);
    return P.sendText(glyphs, {
      animation: d.animation, speed: d.speed, rainbow: d.rainbow,
      color: hexToRgb(d.color), background: d.background ? hexToRgb(d.background) : null, slot,
    });
  }
  const frames = textToFrames(d.text || ' ', imageOptions(d), info.width, info.height);
  return frames.length > 1
    ? P.sendImage(encodeGif(frames, 64), true, slot)
    : P.sendImage(await encodePng(frames[0].canvas), false, slot);
}

/** First frame of the text (for favourite thumbnails). */
export async function textThumb(d: TextFavorite): Promise<HTMLCanvasElement> {
  const { W, H } = size();
  if (!isNative(d)) return textToFrames(d.text || ' ', { ...imageOptions(d), animation: P.TextAnimation.Static }, W, H)[0].canvas;
  const { strip } = await nativeStrip(d, H);
  const c = blank(W, H);
  c.getContext('2d')!.drawImage(strip, Math.max(0, Math.floor((W - strip.width) / 2)), 0);
  return c;
}

let previewToken = 0;
export async function updateTextPreview() {
  const token = ++previewToken;
  const d = currentText();
  const { W, H } = size();
  if (!isNative(d)) {
    const frames = textToFrames(d.text || ' ', imageOptions(d), W, H);
    if (token !== previewToken) return;
    if (frames.length === 1) { showPreview(frames[0].canvas, W, H); return; }
    const total = frames.reduce((n, f) => n + f.delay, 0);
    showPreview((time) => {
      let at = time % total;
      for (const f of frames) { if (at < f.delay) return f.canvas; at -= f.delay; }
      return frames[0].canvas;
    }, W, H);
    return;
  }
  await loadPixelFont();
  const { strip } = await nativeStrip(d, H);
  if (token !== previewToken) return;
  const frame = blank(W, H);
  const ctx = frame.getContext('2d')!;
  const pxPerSec = 6 + d.speed * 0.6;
  showPreview((time) => {
    ctx.clearRect(0, 0, W, H);
    if (d.animation === P.TextAnimation.ScrollLeft || d.animation === P.TextAnimation.ScrollRight) {
      const off = Math.floor((time / 1000) * pxPerSec) % (W + strip.width);
      ctx.drawImage(strip, d.animation === P.TextAnimation.ScrollLeft ? W - off : off - strip.width, 0);
    } else {
      const visible = d.animation === P.TextAnimation.Blink ? Math.floor(time / 400) % 2 === 0 : true;
      ctx.globalAlpha = d.animation === P.TextAnimation.Fade ? 0.25 + 0.75 * Math.abs(Math.sin(time / 900)) : 1;
      if (visible) ctx.drawImage(strip, Math.max(0, Math.floor((W - strip.width) / 2)), 0);
      ctx.globalAlpha = 1;
    }
    return frame;
  }, W, H);
}

function syncFontControls() {
  const native = val('txtFont') === 'pixel';
  $('sysFontOpts').hidden = native;
  $('sysFontHint').hidden = native;
  // Fade and snowflakes are panel effects – not available for image text.
  const anim = $<HTMLSelectElement>('txtAnim');
  for (const o of anim.querySelectorAll<HTMLOptionElement>('[data-native]')) o.disabled = !native;
  if (anim.selectedOptions[0]?.disabled) anim.value = '1';
  $('txtSpeedOut').textContent = val('txtSpeed');
  $('txtSizeOut').textContent = val('txtSize');
}

export function initText() {
  for (const id of ['txt', 'txtFont', 'txtAnim', 'txtRainbow', 'txtColor', 'txtBgOn', 'txtBg', 'txtSpeed', 'txtSize', 'txtBold', 'txtSmooth']) {
    $(id).addEventListener('input', () => { syncFontControls(); updateTextPreview(); });
  }
  syncFontControls();

  $('btnText').addEventListener('click', () => {
    const d = currentText();
    if (!d.text.trim()) { toast(t('Bitte einen Text eingeben'), true); return; }
    send(t('Text senden'), (info) => buildTextPlan(d, info, num('txtSlot')));
  });

  $('btnTextFav').addEventListener('click', async () => {
    const d = currentText();
    if (!d.text.trim()) { toast(t('Bitte einen Text eingeben'), true); return; }
    await saveFavorite(d.text.replace(/\[\/?#?[0-9a-fA-F]{0,6}\]/g, '').slice(0, 40), d, await textThumb(d));
  });
}
