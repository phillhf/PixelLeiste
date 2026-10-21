// Renders characters into 1-bit glyph cells with GNU Unifont, matching the official app:
// 8 px wide for normal, 16 px for wide (CJK / broad) characters, 16 px high.
import type { Glyph } from '../protocol/ipixel';

const FONT_FAMILY = 'PixelUnifont';
let fontReady: Promise<void> | null = null;

export function loadPixelFont(): Promise<void> {
  if (!fontReady) {
    const face = new FontFace(FONT_FAMILY, `url(${new URL('./fonts/unifont.otf', document.baseURI).href})`);
    fontReady = face.load().then((f) => { document.fonts.add(f); });
  }
  return fontReady;
}

const WIDE_RE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

export type RGB = [number, number, number];

/** Parses "[#ff0000]rot[/] normal" into characters with optional per-character colour. */
export function parseColorTags(text: string): { char: string; color?: RGB }[] {
  const out: { char: string; color?: RGB }[] = [];
  const stack: RGB[] = [];
  const re = /\[#?([0-9a-fA-F]{6})\]|\[\/(?:color|#)?\]/g;
  let last = 0;
  const push = (s: string) => { for (const ch of s) out.push({ char: ch, color: stack[stack.length - 1] }); };
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    push(text.slice(last, m.index));
    if (m[1]) stack.push(hexToRgb(m[1])); else stack.pop();
    last = re.lastIndex;
  }
  push(text.slice(last));
  return out;
}

export function hexToRgb(h: string): RGB {
  const c = h.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

/** Supersampling factor: browsers anti-alias text differently, so we render 4× larger
 *  and treat a pixel as lit when at least half of its 4×4 block is covered. */
const SS = 4;

export function renderGlyph(char: string, height = 16): Glyph {
  const size = height >= 32 ? 32 : 16;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size * 2 * SS;
  canvas.height = height * SS;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `${size * SS}px ${FONT_FAMILY}`;
  const m = ctx.measureText(char);
  const wide = WIDE_RE.test(char) || m.width / SS > half * 1.25;
  const width = wide ? size : half;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  // Unifont: ascent 14 px of a 16 px em – same placement as PIL's default "la" anchor.
  const ascent = Math.round((m.fontBoundingBoxAscent ?? size * SS * 0.875) / SS) * SS;
  ctx.fillText(char, 0, ascent);
  const cw = width * SS;
  const data = ctx.getImageData(0, 0, cw, height * SS).data;
  const pixels: boolean[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = 0; dy < SS; dy++)
        for (let dx = 0; dx < SS; dx++) sum += data[((y * SS + dy) * cw + x * SS + dx) * 4];
      pixels.push(sum / (SS * SS) >= 128);
    }
  }
  return { width, height, pixels };
}

export async function renderText(text: string, height = 16): Promise<Glyph[]> {
  await loadPixelFont();
  return parseColorTags(text).map(({ char, color }) => ({ ...renderGlyph(char, height), color }));
}
