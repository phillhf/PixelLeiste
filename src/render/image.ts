// Image / GIF preparation: decode, scale to the panel size, re-encode as PNG or GIF.
import { parseGIF, decompressFrames } from 'gifuct-js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export type FitMode = 'crop' | 'fit' | 'stretch';

export interface Frame {
  canvas: HTMLCanvasElement;
  /** milliseconds */
  delay: number;
}

export const MAX_FRAMES = 120;

function newCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function decodeGif(buf: ArrayBuffer): Promise<Frame[]> {
  const gif = parseGIF(buf);
  const raw = decompressFrames(gif, true);
  const { width, height } = gif.lsd;
  const full = newCanvas(width, height);
  const ctx = full.getContext('2d')!;
  const patch = newCanvas(width, height);
  const pctx = patch.getContext('2d')!;
  const frames: Frame[] = [];
  let restore: ImageData | null = null;
  for (const f of raw.slice(0, MAX_FRAMES)) {
    if (f.disposalType === 3) restore = ctx.getImageData(0, 0, width, height);
    patch.width = f.dims.width;
    patch.height = f.dims.height;
    pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height), 0, 0);
    ctx.drawImage(patch, f.dims.left, f.dims.top);
    const snap = newCanvas(width, height);
    snap.getContext('2d')!.drawImage(full, 0, 0);
    frames.push({ canvas: snap, delay: Math.max(20, f.delay || 100) });
    if (f.disposalType === 2) ctx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
    else if (f.disposalType === 3 && restore) ctx.putImageData(restore, 0, 0);
  }
  return frames;
}

async function decodeStill(file: Blob): Promise<Frame[]> {
  const bmp = await createImageBitmap(file);
  const c = newCanvas(bmp.width, bmp.height);
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return [{ canvas: c, delay: 0 }];
}

export async function loadImageFile(file: File): Promise<Frame[]> {
  const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
  return isGif ? decodeGif(await file.arrayBuffer()) : decodeStill(file);
}

/** Scales a frame onto a black w×h canvas. */
export function fitFrame(src: HTMLCanvasElement, w: number, h: number, mode: FitMode, smooth = true): HTMLCanvasElement {
  const out = newCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = 'high';
  if (mode === 'stretch') {
    ctx.drawImage(src, 0, 0, w, h);
    return out;
  }
  const scale = mode === 'crop'
    ? Math.max(w / src.width, h / src.height)
    : Math.min(w / src.width, h / src.height);
  const dw = src.width * scale;
  const dh = src.height * scale;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return out;
}

export async function encodePng(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG-Export fehlgeschlagen'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export function encodeGif(frames: Frame[]): Uint8Array {
  const enc = GIFEncoder();
  for (const f of frames) {
    const { width, height } = f.canvas;
    const rgba = f.canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    enc.writeFrame(index, width, height, { palette, delay: f.delay, repeat: 0 });
  }
  enc.finish();
  return enc.bytes();
}
