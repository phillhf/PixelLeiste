import * as P from './protocol/ipixel';
import { PanelConnection } from './ble/connection';
import { hexToRgb, loadPixelFont, renderText, type RGB } from './render/glyphs';
import { encodeGif, encodePng, fitFrame, loadImageFile, type FitMode, type Frame } from './render/image';

// ---------------------------------------------------------------------------
// Helpers

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const val = (id: string) => ($<HTMLInputElement>(id)).value;
const num = (id: string) => Number(val(id)) || 0;
const checked = (id: string) => $<HTMLInputElement>(id).checked;

let W = 96;
let H = 16;

const logEl = $('log');
function log(msg: string) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent = `${t}  ${msg}\n${logEl.textContent ?? ''}`.slice(0, 20000);
}

let toastTimer = 0;
function toast(msg: string, err = false) {
  const el = $('toast');
  el.textContent = msg;
  el.className = `show${err ? ' err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.className = ''), err ? 4500 : 2200);
}

// Remember form values between sessions (per device only, best effort).
const PERSIST = ['txt', 'txtAnim', 'txtRainbow', 'txtColor', 'txtBgOn', 'txtBg', 'txtSpeed', 'imgFit', 'imgSmooth',
  'drawColor', 'clkStyle', 'clk24', 'clkDate', 'cdMin', 'cdSec', 'liveTpl', 'liveColor', 'liveInt', 'liveTarget',
  'bri', 'orient', 'showAll'];
function restoreForm() {
  let saved: Record<string, string | boolean> = {};
  try { saved = JSON.parse(localStorage.getItem('pixelleiste') ?? '{}'); } catch { /* storage unavailable */ }
  for (const id of PERSIST) {
    const el = $<HTMLInputElement>(id);
    if (!el || !(id in saved)) continue;
    if (el.type === 'checkbox') el.checked = !!saved[id]; else el.value = String(saved[id]);
  }
}
function saveForm() {
  const data: Record<string, string | boolean> = {};
  for (const id of PERSIST) {
    const el = $<HTMLInputElement>(id);
    if (el) data[id] = el.type === 'checkbox' ? el.checked : el.value;
  }
  try { localStorage.setItem('pixelleiste', JSON.stringify(data)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Connection

const statusEl = $('status');
const btnConnect = $<HTMLButtonElement>('btnConnect');
const conn = new PanelConnection(log, () => updateStatus());

function updateStatus(busy = false) {
  if (conn.connected) {
    statusEl.textContent = busy ? 'Sende …' : `${conn.device?.name ?? 'Verbunden'}`;
    statusEl.className = `status ${busy ? 'busy' : 'on'}`;
    btnConnect.textContent = 'Trennen';
  } else {
    statusEl.textContent = 'Nicht verbunden';
    statusEl.className = 'status off';
    btnConnect.textContent = 'Verbinden';
    stopLive();
  }
}

btnConnect.addEventListener('click', async () => {
  if (conn.connected) { await conn.disconnect(); updateStatus(); return; }
  btnConnect.disabled = true;
  statusEl.textContent = 'Suche …';
  statusEl.className = 'status busy';
  try {
    const info = await conn.connect(checked('showAll'));
    W = info.width; H = info.height;
    resizeDrawing();
    $('devInfo').textContent = `${conn.device?.name ?? ''} · ${W}×${H} Pixel · Gerätetyp ${info.deviceType}`;
    toast('Verbunden');
  } catch (e) {
    const msg = (e as Error).message || String(e);
    log(`Verbindung fehlgeschlagen: ${msg}`);
    toast(/cancel|abgebrochen/i.test(msg) ? 'Abgebrochen' : `Verbindung fehlgeschlagen: ${msg}`, true);
    await conn.disconnect().catch(() => undefined);
  } finally {
    ($<HTMLDialogElement>('picker')).close();
    btnConnect.disabled = false;
    updateStatus();
  }
});

const progressEl = $('progress');
async function run(what: string, plan: P.SendPlan | (() => Promise<P.SendPlan>), quiet = false) {
  if (!conn.connected) { toast('Bitte zuerst mit der LED-Leiste verbinden', true); return false; }
  updateStatus(true);
  const bar = progressEl.firstElementChild as HTMLElement;
  try {
    const p = typeof plan === 'function' ? await plan() : plan;
    const big = p.windows.length > 1 || p.windows[0].data.length > 512;
    if (big) { progressEl.hidden = false; bar.style.width = '0'; }
    await conn.send(p, (d, t) => (bar.style.width = `${Math.round((d / t) * 100)}%`));
    log(`✓ ${what}`);
    if (!quiet) toast(`${what} ✓`);
    return true;
  } catch (e) {
    log(`✗ ${what}: ${(e as Error).message}`);
    toast(`${what} fehlgeschlagen: ${(e as Error).message}`, true);
    return false;
  } finally {
    progressEl.hidden = true;
    updateStatus();
  }
}

// Electron (Windows): Chromium needs us to pick the Bluetooth device ourselves.
if (window.pixelDesktop) {
  const dlg = $<HTMLDialogElement>('picker');
  const list = $('pickList');
  window.pixelDesktop.onDevices((devices) => {
    if (!dlg.open) dlg.showModal();
    list.replaceChildren(...devices.map((d) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.textContent = d.deviceName || `Unbenannt (${d.deviceId})`;
      b.onclick = () => { window.pixelDesktop!.select(d.deviceId); dlg.close(); };
      li.append(b);
      return li;
    }));
  });
  $('pickCancel').onclick = () => { window.pixelDesktop!.select(''); dlg.close(); };
}

// ---------------------------------------------------------------------------
// LED preview (what the panel will roughly look like)

const preview = $<HTMLCanvasElement>('preview');
const PX = 8;
let previewAnim = 0;
type FrameFn = (t: number) => HTMLCanvasElement | null;

function paintPreview(src: HTMLCanvasElement | null) {
  preview.width = W * PX;
  preview.height = H * PX;
  const ctx = preview.getContext('2d')!;
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, preview.width, preview.height);
  const data = src?.getContext('2d')!.getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const lit = data && (data[i] + data[i + 1] + data[i + 2] > 24);
      ctx.fillStyle = lit ? `rgb(${data[i]},${data[i + 1]},${data[i + 2]})` : '#16191e';
      ctx.beginPath();
      ctx.arc(x * PX + PX / 2, y * PX + PX / 2, PX * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function showPreview(fn: FrameFn | HTMLCanvasElement | null) {
  cancelAnimationFrame(previewAnim);
  if (typeof fn !== 'function') { paintPreview(fn); return; }
  let last = -1;
  const loop = (t: number) => {
    if (t - last > 40) { paintPreview(fn(t)); last = t; }
    previewAnim = requestAnimationFrame(loop);
  };
  previewAnim = requestAnimationFrame(loop);
}

const blank = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };

// ---------------------------------------------------------------------------
// Slot pickers

for (const sel of document.querySelectorAll<HTMLSelectElement>('.slotSel')) {
  sel.add(new Option('Nur anzeigen', '0'));
  for (let i = 1; i <= 10; i++) sel.add(new Option(`Speicherplatz ${i}`, String(i)));
}
for (let i = 0; i <= 8; i++) $<HTMLSelectElement>('clkStyle').add(new Option(`Stil ${i}`, String(i)));

// ---------------------------------------------------------------------------
// Tabs

for (const tab of document.querySelectorAll<HTMLButtonElement>('.tabs button')) {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
    document.querySelectorAll<HTMLElement>('.panel').forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
    const name = tab.dataset.tab;
    if (name === 'text') updateTextPreview();
    else if (name === 'image') updateImagePreview();
    else if (name === 'draw') showPreview(drawToCanvas());
    else if (name === 'live') updateLivePreview();
  });
}

// ---------------------------------------------------------------------------
// Text

function hsl(h: number): RGB {
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}

async function buildTextStrip() {
  const glyphs = await renderText(val('txt') || ' ', H >= 32 ? 32 : 16);
  const width = glyphs.reduce((n, g) => n + g.width, 0);
  const strip = document.createElement('canvas');
  strip.width = Math.max(1, width);
  strip.height = H;
  const ctx = strip.getContext('2d')!;
  const img = ctx.createImageData(strip.width, H);
  const base = hexToRgb(val('txtColor'));
  const bg = checked('txtBgOn') ? hexToRgb(val('txtBg')) : null;
  const rainbow = num('txtRainbow') > 0;
  let x0 = 0;
  for (const g of glyphs) {
    for (let y = 0; y < Math.min(g.height, H); y++) {
      for (let x = 0; x < g.width; x++) {
        const on = g.pixels[y * g.width + x];
        const c = on ? (rainbow ? hsl(((x0 + x) * 360) / Math.max(width, 1)) : g.color ?? base) : bg;
        if (!c) continue;
        const i = (y * strip.width + x0 + x) * 4;
        img.data.set([c[0], c[1], c[2], 255], i);
      }
    }
    x0 += g.width;
  }
  ctx.putImageData(img, 0, 0);
  return { glyphs, strip };
}

let textPreviewToken = 0;
async function updateTextPreview() {
  const token = ++textPreviewToken;
  await loadPixelFont();
  const { strip } = await buildTextStrip();
  if (token !== textPreviewToken) return;
  const anim = num('txtAnim');
  const speed = num('txtSpeed');
  const frame = blank();
  const ctx = frame.getContext('2d')!;
  const pxPerSec = 6 + speed * 0.6;
  showPreview((t) => {
    ctx.clearRect(0, 0, W, H);
    if (anim === P.TextAnimation.ScrollLeft || anim === P.TextAnimation.ScrollRight) {
      const span = W + strip.width;
      const off = Math.floor((t / 1000) * pxPerSec) % span;
      const x = anim === P.TextAnimation.ScrollLeft ? W - off : off - strip.width;
      ctx.drawImage(strip, x, 0);
    } else {
      const visible = anim === P.TextAnimation.Blink ? Math.floor(t / 400) % 2 === 0 : true;
      ctx.globalAlpha = anim === P.TextAnimation.Fade ? 0.25 + 0.75 * Math.abs(Math.sin(t / 900)) : 1;
      if (visible) ctx.drawImage(strip, Math.max(0, Math.floor((W - strip.width) / 2)), 0);
      ctx.globalAlpha = 1;
    }
    return frame;
  });
}

for (const id of ['txt', 'txtAnim', 'txtRainbow', 'txtColor', 'txtBgOn', 'txtBg', 'txtSpeed']) {
  $(id).addEventListener('input', () => { $('txtSpeedOut').textContent = val('txtSpeed'); updateTextPreview(); saveForm(); });
}

$('btnText').addEventListener('click', () => {
  if (!val('txt').trim()) { toast('Bitte einen Text eingeben', true); return; }
  run('Text senden', async () => {
    const { glyphs } = await buildTextStrip();
    return P.sendText(glyphs, {
      animation: num('txtAnim'),
      speed: num('txtSpeed'),
      rainbow: num('txtRainbow'),
      color: hexToRgb(val('txtColor')),
      background: checked('txtBgOn') ? hexToRgb(val('txtBg')) : null,
      slot: num('txtSlot'),
    });
  });
});

// ---------------------------------------------------------------------------
// Image / GIF

let srcFrames: Frame[] = [];
let srcName = '';

function scaledFrames(): Frame[] {
  const mode = val('imgFit') as FitMode;
  const smooth = val('imgSmooth') === '1';
  return srcFrames.map((f) => ({ canvas: fitFrame(f.canvas, W, H, mode, smooth), delay: f.delay }));
}

function updateImagePreview() {
  if (!srcFrames.length) { showPreview(null); return; }
  const frames = scaledFrames();
  if (frames.length === 1) { showPreview(frames[0].canvas); return; }
  const total = frames.reduce((n, f) => n + f.delay, 0);
  showPreview((t) => {
    let at = t % total;
    for (const f of frames) { if (at < f.delay) return f.canvas; at -= f.delay; }
    return frames[0].canvas;
  });
}

async function onImageFile(file: File) {
  try {
    srcFrames = await loadImageFile(file);
    srcName = file.name;
    $('imgName').textContent = file.name;
    const anim = srcFrames.length > 1;
    $('imgInfo').textContent = `${srcFrames[0].canvas.width}×${srcFrames[0].canvas.height} px${anim ? ` · ${srcFrames.length} Bilder (animiert)` : ''} → wird auf ${W}×${H} skaliert`;
    $<HTMLButtonElement>('btnImage').disabled = false;
    updateImagePreview();
  } catch (e) {
    toast(`Bild konnte nicht geladen werden: ${(e as Error).message}`, true);
  }
}

$<HTMLInputElement>('imgFile').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) onImageFile(f);
});
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer?.files?.[0];
  if (f) onImageFile(f);
});
for (const id of ['imgFit', 'imgSmooth']) $(id).addEventListener('change', () => { updateImagePreview(); saveForm(); });

$('btnImage').addEventListener('click', () => {
  if (!srcFrames.length) return;
  run(`„${srcName}“ senden`, async () => {
    const frames = scaledFrames();
    const gif = frames.length > 1;
    const bytes = gif ? encodeGif(frames) : await encodePng(frames[0].canvas);
    log(`${gif ? 'GIF' : 'PNG'} ${(bytes.length / 1024).toFixed(1)} KB`);
    return P.sendImage(bytes, gif, num('imgSlot'));
  });
});

// ---------------------------------------------------------------------------
// Pixel drawing

const CELL = 10;
const drawCanvas = $<HTMLCanvasElement>('drawCanvas');
let pixels: (RGB | null)[] = [];
let tool: 'pen' | 'erase' | 'fill' = 'pen';
let liveDrawReady = false;

function resizeDrawing() {
  pixels = Array.from({ length: W * H }, (_, i) => pixels[i] ?? null);
  drawCanvas.width = W * CELL;
  drawCanvas.height = H * CELL;
  drawCanvas.style.aspectRatio = `${W} / ${H}`;
  paintDrawing();
}

function paintDrawing() {
  const ctx = drawCanvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = pixels[y * W + x];
      ctx.fillStyle = c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#15181d';
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    }
  }
}

function drawToCanvas() {
  const c = blank();
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  pixels.forEach((p, i) => { if (p) img.data.set([p[0], p[1], p[2], 255], i * 4); else img.data[i * 4 + 3] = 255; });
  ctx.putImageData(img, 0, 0);
  return c;
}

const sameColor = (a: RGB | null, b: RGB | null) => (a === b) || (!!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

function setPx(x: number, y: number, c: RGB | null) {
  const i = y * W + x;
  if (sameColor(pixels[i], c)) return;
  pixels[i] = c;
  if (checked('drawLive') && conn.connected && liveDrawReady) {
    const [r, g, b] = c ?? [0, 0, 0];
    conn.send(P.setPixel(x, y, r, g, b)).catch((e) => log(`Pixel: ${e.message}`));
  }
}

function floodFill(x: number, y: number, c: RGB) {
  const target = pixels[y * W + x];
  if (sameColor(target, c)) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (px < 0 || py < 0 || px >= W || py >= H || !sameColor(pixels[py * W + px], target)) continue;
    setPx(px, py, c);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
}

let drawing = false;
let lastCell: [number, number] | null = null;
function pointerCell(e: PointerEvent): [number, number] {
  const r = drawCanvas.getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) / r.width) * W), Math.floor(((e.clientY - r.top) / r.height) * H)];
}
function applyTool(e: PointerEvent) {
  const [x, y] = pointerCell(e);
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
  paintDrawing();
  showPreview(drawToCanvas());
}
drawCanvas.addEventListener('pointerdown', (e) => {
  drawing = tool !== 'fill';
  lastCell = null;
  drawCanvas.setPointerCapture(e.pointerId);
  applyTool(e);
});
drawCanvas.addEventListener('pointermove', (e) => { if (drawing) applyTool(e); });
drawCanvas.addEventListener('pointerup', () => (drawing = false));
drawCanvas.addEventListener('pointercancel', () => (drawing = false));

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
  b.addEventListener('click', () => {
    tool = b.dataset.tool as typeof tool;
    document.querySelectorAll('[data-tool]').forEach((o) => o.classList.toggle('on', o === b));
  });
}
const SWATCHES = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00e5ff', '#0a84ff', '#bf5af2', '#ff2d92', '#ffffff'];
$('swatches').replaceChildren(...SWATCHES.map((c) => {
  const b = document.createElement('button');
  b.style.background = c;
  b.title = c;
  b.onclick = () => { $<HTMLInputElement>('drawColor').value = c; saveForm(); };
  return b;
}));
$('drawColor').addEventListener('input', saveForm);

$('drawLive').addEventListener('change', async () => {
  liveDrawReady = false;
  if (!checked('drawLive')) return;
  if (!conn.connected) { toast('Bitte zuerst verbinden', true); $<HTMLInputElement>('drawLive').checked = false; return; }
  if (await run('Live-Zeichenmodus', P.setFunMode(true), true)) {
    liveDrawReady = true;
    // Push the current drawing so panel and editor start identical.
    pixels.forEach((p, i) => { if (p) conn.send(P.setPixel(i % W, Math.floor(i / W), p[0], p[1], p[2])).catch(() => undefined); });
    toast('Live-Zeichnen aktiv');
  }
});

$('btnDrawClear').addEventListener('click', () => {
  const live = checked('drawLive') && liveDrawReady;
  if (live) pixels.forEach((p, i) => p && setPx(i % W, Math.floor(i / W), null));
  pixels = pixels.map(() => null);
  paintDrawing();
  showPreview(drawToCanvas());
});

$('btnDrawFromPreview').addEventListener('click', () => {
  const data = preview.getContext('2d')!.getImageData(0, 0, preview.width, preview.height).data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = ((y * PX + PX / 2) * preview.width + x * PX + PX / 2) * 4;
      const c: RGB = [data[i], data[i + 1], data[i + 2]];
      pixels[y * W + x] = c[0] + c[1] + c[2] > 90 ? c : null;
    }
  }
  paintDrawing();
  showPreview(drawToCanvas());
});

$('btnDraw').addEventListener('click', () =>
  run('Zeichnung senden', async () => P.sendImage(await encodePng(drawToCanvas()), false, num('drawSlot'))));

// ---------------------------------------------------------------------------
// Clock, timers, scoreboard

$('btnClock').addEventListener('click', async () => {
  if (await run('Uhrzeit übertragen', P.setTime(), true))
    run('Uhr anzeigen', P.setClockMode(num('clkStyle'), checked('clk24'), checked('clkDate')));
});
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-sw]'))
  b.addEventListener('click', () => run(`Stoppuhr: ${b.textContent}`, P.setStopwatch(Number(b.dataset.sw))));
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-cd]'))
  b.addEventListener('click', () => run(`Countdown: ${b.textContent}`, P.setCountdown(Number(b.dataset.cd), num('cdMin'), num('cdSec'))));

const scores = [0, 0];
let scoreTimer = 0;
function setScore(i: number, v: number) {
  scores[i] = Math.max(0, Math.min(99, v));
  $(`sc${i}`).textContent = String(scores[i]);
  clearTimeout(scoreTimer);
  scoreTimer = window.setTimeout(() => run('Anzeigetafel', P.setScores(scores[0], scores[1]), true), 200);
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-sc]'))
  b.addEventListener('click', () => { const i = Number(b.dataset.sc); setScore(i, scores[i] + Number(b.dataset.d)); });
$('btnScoreReset').addEventListener('click', () => { scores[0] = 0; setScore(1, 0); $('sc0').textContent = '0'; });

// Live text: rendered locally into an image and pushed periodically.
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');

function fillTemplate(tpl: string, now = new Date()) {
  let countdown = '--:--:--';
  const target = val('liveTarget') ? new Date(val('liveTarget')) : null;
  if (target && !isNaN(target.getTime())) {
    let s = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
    const d = Math.floor(s / 86400); s %= 86400;
    const hms = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    countdown = d > 0 ? `${d}T ${hms}` : hms;
  }
  return tpl
    .replace(/\{zeit\}/g, `${pad(now.getHours())}:${pad(now.getMinutes())}`)
    .replace(/\{zeitsek\}/g, `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)
    .replace(/\{datum\}/g, `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.`)
    .replace(/\{tag\}/g, WEEKDAYS[now.getDay()])
    .replace(/\{countdown\}/g, countdown);
}

async function renderLiveFrame() {
  const glyphs = await renderText(fillTemplate(val('liveTpl')), H >= 32 ? 32 : 16);
  const color = hexToRgb(val('liveColor'));
  const c = blank();
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  const width = glyphs.reduce((n, g) => n + g.width, 0);
  let x0 = Math.max(0, Math.floor((W - width) / 2));
  for (const g of glyphs) {
    for (let y = 0; y < Math.min(g.height, H); y++)
      for (let x = 0; x < g.width && x0 + x < W; x++)
        if (g.pixels[y * g.width + x]) img.data.set([...(g.color ?? color), 255], (y * W + x0 + x) * 4);
    x0 += g.width;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

async function updateLivePreview() {
  await loadPixelFont();
  showPreview(await renderLiveFrame());
}
for (const id of ['liveTpl', 'liveColor', 'liveTarget']) $(id).addEventListener('input', () => { updateLivePreview(); saveForm(); });
for (const id of ['clkStyle', 'clk24', 'clkDate', 'cdMin', 'cdSec', 'liveInt']) $(id).addEventListener('change', saveForm);

let liveTimer = 0;
let liveBusy = false;
async function liveTick() {
  if (liveBusy) return;
  liveBusy = true;
  try {
    const frame = await renderLiveFrame();
    showPreview(frame);
    await run('Live-Text', P.sendImage(await encodePng(frame), false, 0), true);
  } finally { liveBusy = false; }
}
function stopLive() {
  if (!liveTimer) return;
  clearInterval(liveTimer);
  liveTimer = 0;
  $('btnLive').textContent = 'Live-Text starten';
}
$('btnLive').addEventListener('click', () => {
  if (liveTimer) { stopLive(); return; }
  if (!conn.connected) { toast('Bitte zuerst verbinden', true); return; }
  liveTick();
  liveTimer = window.setInterval(liveTick, Math.max(2, num('liveInt')) * 1000);
  $('btnLive').textContent = 'Live-Text stoppen';
});

// ---------------------------------------------------------------------------
// Device

$('btnOn').addEventListener('click', () => run('Einschalten', P.setPower(true)));
$('btnOff').addEventListener('click', () => run('Ausschalten', P.setPower(false)));

let briSending = false;
let briPending = false;
async function sendBrightness() {
  if (briSending) { briPending = true; return; }
  briSending = true;
  await run(`Helligkeit ${val('bri')} %`, P.setBrightness(num('bri')), true);
  briSending = false;
  if (briPending) { briPending = false; sendBrightness(); }
}
$('bri').addEventListener('input', () => { $('briOut').textContent = val('bri'); if (conn.connected) sendBrightness(); saveForm(); });
$('orient').addEventListener('change', () => { run('Ausrichtung', P.setOrientation(num('orient'))); saveForm(); });
$('btnSyncTime').addEventListener('click', () => run('Uhrzeit übertragen', P.setTime()));
$('btnShowSlot').addEventListener('click', () => run(`Speicherplatz ${num('slotNo')} anzeigen`, P.showSlot(num('slotNo'))));
$('btnDelSlot').addEventListener('click', () => run(`Speicherplatz ${num('slotNo')} löschen`, P.deleteSlot(num('slotNo'))));
$('btnClearAll').addEventListener('click', () => {
  if (confirm('Wirklich ALLE gespeicherten Inhalte und Einstellungen auf der Leiste löschen?'))
    run('Alles gelöscht', P.clearAll());
});
$('showAll').addEventListener('change', saveForm);

// ---------------------------------------------------------------------------
// Start

restoreForm();
$('txtSpeedOut').textContent = val('txtSpeed');
$('briOut').textContent = val('bri');
resizeDrawing();
updateStatus();
updateTextPreview();
log('Bereit. „Verbinden“ drücken und die LED-Leiste (meist „LED_BLE_…“) auswählen.');
