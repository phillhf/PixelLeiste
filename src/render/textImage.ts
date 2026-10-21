// Text in any system font (incl. colour emojis) rendered into frames: one PNG for static text,
// an animated GIF for scrolling/blinking – the panel then just plays the animation.
import type { Frame } from './image';
import { hexToRgb, parseColorTags, type RGB } from './glyphs';
import { TextAnimation } from '../protocol/ipixel';

export interface TextImageOptions {
  font: string;
  size: number;
  bold: boolean;
  smooth: boolean;
  color: string;
  background: string | null;
  rainbow: boolean;
  animation: TextAnimation;
  /** 0..100 */
  speed: number;
}

const MAX_FRAMES = 240;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = h;
  return c;
}

const rgbCss = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** Draws the whole text once; width = text width. */
export function renderTextStrip(text: string, o: TextImageOptions, height: number): HTMLCanvasElement {
  const fontCss = `${o.bold ? 'bold ' : ''}${o.size}px ${o.font}, "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  const measure = canvas(1, height).getContext('2d')!;
  measure.font = fontCss;

  // Group characters by colour tag so each run is drawn in one go (keeps kerning and emojis intact).
  const runs: { text: string; color?: RGB }[] = [];
  for (const { char, color } of parseColorTags(text)) {
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.text += char; else runs.push({ text: char, color });
  }
  const widths = runs.map((r) => Math.ceil(measure.measureText(r.text).width));
  const width = Math.max(1, widths.reduce((a, b) => a + b, 0));

  const c = canvas(width, height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.font = fontCss;
  ctx.textBaseline = 'middle';
  const base = hexToRgb(o.color);
  let fill: string | CanvasGradient = rgbCss(base);
  if (o.rainbow) {
    const g = ctx.createLinearGradient(0, 0, width, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`);
    fill = g;
  }
  let x = 0;
  runs.forEach((r, i) => {
    ctx.fillStyle = r.color && !o.rainbow ? rgbCss(r.color) : fill;
    ctx.fillText(r.text, x, height / 2 + 1);
    x += widths[i];
  });

  if (!o.smooth) {
    // Hard edges: every pixel either fully on (keeping its colour) or off – crisper on LEDs.
    const img = ctx.getImageData(0, 0, c.width, height);
    const d = img.data;
    // (getImageData is not premultiplied, so the RGB values already hold the full colour.)
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
  }
  return c;
}

function frameWith(strip: HTMLCanvasElement | null, x: number, w: number, h: number, bg: string | null): HTMLCanvasElement {
  const f = canvas(w, h);
  const ctx = f.getContext('2d')!;
  ctx.fillStyle = bg ?? '#000';
  ctx.fillRect(0, 0, w, h);
  if (strip) ctx.drawImage(strip, x, 0);
  return f;
}

/** Frames for the panel: 1 frame = static PNG, more = animated GIF. */
export function textToFrames(text: string, o: TextImageOptions, w: number, h: number): Frame[] {
  const strip = renderTextStrip(text, o, h);
  const centered = Math.max(0, Math.floor((w - strip.width) / 2));
  const delay = Math.max(20, Math.round((150 - o.speed * 1.3) / 10) * 10);

  if (o.animation === TextAnimation.ScrollLeft || o.animation === TextAnimation.ScrollRight) {
    const span = w + strip.width;
    const step = Math.max(1, Math.ceil(span / MAX_FRAMES));
    const frames: Frame[] = [];
    for (let off = 0; off < span; off += step) {
      const x = o.animation === TextAnimation.ScrollLeft ? w - off : off - strip.width;
      frames.push({ canvas: frameWith(strip, x, w, h, o.background), delay });
    }
    return frames;
  }
  if (o.animation === TextAnimation.Blink) {
    return [
      { canvas: frameWith(strip, centered, w, h, o.background), delay: delay * 4 },
      { canvas: frameWith(null, 0, w, h, o.background), delay: delay * 3 },
    ];
  }
  return [{ canvas: frameWith(strip, centered, w, h, o.background), delay: 0 }];
}
