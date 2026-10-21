// Pixel editor tab, optionally mirroring every stroke live onto the panel(s).
import * as P from '../protocol/ipixel';
import { hexToRgb, type RGB } from '../render/glyphs';
import { encodePng } from '../render/image';
import { $, checked, el, log, num, val } from '../ui/dom';
import { blank, readPreview, showPreview } from '../ui/preview';
import { manager, onPanelsChanged, requireConnection, send, size } from '../app';
import { t } from '../i18n';
import { saveFavorite } from './favorites';

const CELL = 10;
let W = 96;
let H = 16;
let pixels: (RGB | null)[] = Array(W * H).fill(null);
let tool: 'pen' | 'erase' | 'fill' = 'pen';
let liveReady = false;

const canvasEl = () => $<HTMLCanvasElement>('drawCanvas');

function resize() {
  const s = size();
  if (s.W === W && s.H === H && pixels.length === W * H) return;
  const old = pixels, oldW = W;
  W = s.W; H = s.H;
  pixels = Array.from({ length: W * H }, (_, i) => (i % W < oldW ? old[Math.floor(i / W) * oldW + (i % W)] ?? null : null));
  const c = canvasEl();
  c.width = W * CELL;
  c.height = H * CELL;
  c.style.aspectRatio = `${W} / ${H}`;
  paint();
}

function paint() {
  const ctx = canvasEl().getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W * CELL, H * CELL);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = pixels[y * W + x];
      ctx.fillStyle = c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#15181d';
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    }
  }
}

export function drawingCanvas() {
  const c = blank(W, H);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  pixels.forEach((p, i) => { if (p) img.data.set([p[0], p[1], p[2], 255], i * 4); else img.data[i * 4 + 3] = 255; });
  ctx.putImageData(img, 0, 0);
  return c;
}

export const updateDrawPreview = () => { resize(); showPreview(drawingCanvas(), W, H); };

const same = (a: RGB | null, b: RGB | null) => a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

function setPx(x: number, y: number, c: RGB | null) {
  const i = y * W + x;
  if (same(pixels[i], c)) return;
  pixels[i] = c;
  if (liveReady && checked('drawLive')) {
    const [r, g, b] = c ?? [0, 0, 0];
    for (const p of manager.targets) p.conn.send(P.setPixel(x, y, r, g, b)).catch((e) => log(`Pixel: ${e.message}`));
  }
}

function floodFill(x: number, y: number, c: RGB) {
  const target = pixels[y * W + x];
  if (same(target, c)) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (px < 0 || py < 0 || px >= W || py >= H || !same(pixels[py * W + px], target)) continue;
    setPx(px, py, c);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
}

let drawing = false;
let lastCell: [number, number] | null = null;
function cellAt(e: PointerEvent): [number, number] {
  const r = canvasEl().getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) / r.width) * W), Math.floor(((e.clientY - r.top) / r.height) * H)];
}
function apply(e: PointerEvent) {
  const [x, y] = cellAt(e);
  const color = hexToRgb(val('drawColor'));
  if (tool === 'fill') {
    if (x >= 0 && y >= 0 && x < W && y < H) floodFill(x, y, color);
  } else {
    // Bresenham line from the previous position so fast strokes have no gaps.
    let [x0, y0] = lastCell ?? [x, y];
    const dx = Math.abs(x - x0), dy = -Math.abs(y - y0), sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1;
    for (let err = dx + dy; ; ) {
      if (x0 >= 0 && y0 >= 0 && x0 < W && y0 < H) setPx(x0, y0, tool === 'erase' ? null : color);
      if (x0 === x && y0 === y) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    lastCell = [x, y];
  }
  paint();
  showPreview(drawingCanvas(), W, H);
}

export function initDraw() {
  const c = canvasEl();
  c.addEventListener('pointerdown', (e) => {
    drawing = tool !== 'fill';
    lastCell = null;
    c.setPointerCapture(e.pointerId);
    apply(e);
  });
  c.addEventListener('pointermove', (e) => { if (drawing) apply(e); });
  c.addEventListener('pointerup', () => (drawing = false));
  c.addEventListener('pointercancel', () => (drawing = false));

  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    b.addEventListener('click', () => {
      tool = b.dataset.tool as typeof tool;
      document.querySelectorAll('[data-tool]').forEach((o) => o.classList.toggle('on', o === b));
    });
  }
  const swatches = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00e5ff', '#0a84ff', '#bf5af2', '#ff2d92', '#ffffff'];
  $('swatches').replaceChildren(...swatches.map((col) => {
    const b = el('button', { title: col });
    b.style.background = col;
    b.onclick = () => { const i = $<HTMLInputElement>('drawColor'); i.value = col; i.dispatchEvent(new Event('change')); };
    return b;
  }));

  $('drawLive').addEventListener('change', async () => {
    liveReady = false;
    if (!checked('drawLive')) return;
    if (!requireConnection()) { $<HTMLInputElement>('drawLive').checked = false; return; }
    if (await send(t('Live-Zeichenmodus'), P.setFunMode(true), true)) {
      liveReady = true;
      // Push the current drawing so panel and editor start identical.
      pixels.forEach((p, i) => {
        if (p) for (const pn of manager.targets) pn.conn.send(P.setPixel(i % W, Math.floor(i / W), p[0], p[1], p[2])).catch(() => undefined);
      });
      log(t('Live-Zeichnen aktiv'));
    }
  });

  $('btnDrawClear').addEventListener('click', () => {
    pixels.forEach((p, i) => p && setPx(i % W, Math.floor(i / W), null));
    paint();
    showPreview(drawingCanvas(), W, H);
  });

  $('btnDrawFromPreview').addEventListener('click', () => {
    pixels = readPreview(W, H);
    paint();
    showPreview(drawingCanvas(), W, H);
  });

  $('btnDraw').addEventListener('click', () =>
    send(t('Zeichnung senden'), async () => P.sendImage(await encodePng(drawingCanvas()), false, num('drawSlot'))));

  $('btnDrawFav').addEventListener('click', async () => {
    const c = drawingCanvas();
    await saveFavorite(t('Zeichnung'), { kind: 'image', bytes: await encodePng(c), gif: false, width: W, height: H }, c);
  });

  onPanelsChanged(resize);
  resize();
}
