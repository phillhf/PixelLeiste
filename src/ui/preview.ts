// LED-style preview of what the panel will show.
import { $ } from './dom';

const PX = 8;
let anim = 0;
export type FrameFn = (t: number) => HTMLCanvasElement | null;

export function blank(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function paint(src: HTMLCanvasElement | null, w: number, h: number) {
  const preview = $<HTMLCanvasElement>('preview');
  if (preview.width !== w * PX || preview.height !== h * PX) {
    preview.width = w * PX;
    preview.height = h * PX;
    preview.style.aspectRatio = `${w} / ${h}`;
  }
  const ctx = preview.getContext('2d')!;
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, preview.width, preview.height);
  const data = src?.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lit = data && data[i + 3] > 0 && data[i] + data[i + 1] + data[i + 2] > 24;
      ctx.fillStyle = lit ? `rgb(${data[i]},${data[i + 1]},${data[i + 2]})` : '#16191e';
      ctx.beginPath();
      ctx.arc(x * PX + PX / 2, y * PX + PX / 2, PX * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Static canvas, or a function called ~25×/s for animations. */
export function showPreview(src: FrameFn | HTMLCanvasElement | null, w: number, h: number) {
  cancelAnimationFrame(anim);
  if (typeof src !== 'function') { paint(src, w, h); return; }
  let last = -1;
  const loop = (time: number) => {
    if (time - last > 40) { paint(src(time), w, h); last = time; }
    anim = requestAnimationFrame(loop);
  };
  anim = requestAnimationFrame(loop);
}

/** Reads the current preview back as a w×h pixel grid (for "copy preview" in the editor). */
export function readPreview(w: number, h: number): ([number, number, number] | null)[] {
  const preview = $<HTMLCanvasElement>('preview');
  const data = preview.getContext('2d')!.getImageData(0, 0, preview.width, preview.height).data;
  const out: ([number, number, number] | null)[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y * PX + PX / 2) * preview.width + x * PX + PX / 2) * 4;
      out.push(data[i] + data[i + 1] + data[i + 2] > 90 ? [data[i], data[i + 1], data[i + 2]] : null);
    }
  }
  return out;
}
