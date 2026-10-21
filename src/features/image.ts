// Image / GIF tab.
import * as P from '../protocol/ipixel';
import { encodeGif, encodePng, fitFrame, loadImageFile, type FitMode, type Frame } from '../render/image';
import { $, errMsg, log, num, toast, val } from '../ui/dom';
import { showPreview } from '../ui/preview';
import { send, size } from '../app';
import { t } from '../i18n';
import { saveFavorite } from './favorites';

let srcFrames: Frame[] = [];
let srcName = '';

function scaled(w: number, h: number): Frame[] {
  const mode = val('imgFit') as FitMode;
  const smooth = val('imgSmooth') === '1';
  return srcFrames.map((f) => ({ canvas: fitFrame(f.canvas, w, h, mode, smooth), delay: f.delay }));
}

async function encode(w: number, h: number) {
  const frames = scaled(w, h);
  const gif = frames.length > 1;
  const bytes = gif ? encodeGif(frames) : await encodePng(frames[0].canvas);
  log(`${gif ? 'GIF' : 'PNG'} ${w}×${h}: ${(bytes.length / 1024).toFixed(1)} KB`);
  return { bytes, gif, first: frames[0].canvas };
}

export function updateImagePreview() {
  const { W, H } = size();
  if (!srcFrames.length) { showPreview(null, W, H); return; }
  const frames = scaled(W, H);
  if (frames.length === 1) { showPreview(frames[0].canvas, W, H); return; }
  const total = frames.reduce((n, f) => n + f.delay, 0);
  showPreview((time) => {
    let at = time % total;
    for (const f of frames) { if (at < f.delay) return f.canvas; at -= f.delay; }
    return frames[0].canvas;
  }, W, H);
}

async function onFile(file: File) {
  try {
    srcFrames = await loadImageFile(file);
    srcName = file.name;
    $('imgName').textContent = file.name;
    const { W, H } = size();
    const f0 = srcFrames[0].canvas;
    $('imgInfo').textContent = srcFrames.length > 1
      ? t('{w}×{h} px · {n} Bilder (animiert) → wird auf {W}×{H} skaliert', { w: f0.width, h: f0.height, n: srcFrames.length, W, H })
      : t('{w}×{h} px → wird auf {W}×{H} skaliert', { w: f0.width, h: f0.height, W, H });
    $<HTMLButtonElement>('btnImage').disabled = false;
    $<HTMLButtonElement>('btnImageFav').disabled = false;
    updateImagePreview();
  } catch (e) {
    toast(t('Bild konnte nicht geladen werden: {e}', { e: errMsg(e) }), true);
  }
}

export function initImage() {
  $<HTMLInputElement>('imgFile').addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) onFile(f);
  });
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  });
  for (const id of ['imgFit', 'imgSmooth']) $(id).addEventListener('change', updateImagePreview);

  $('btnImage').addEventListener('click', () => {
    if (!srcFrames.length) return;
    send(`„${srcName}“`, async (info) => {
      const { bytes, gif } = await encode(info.width, info.height);
      return P.sendImage(bytes, gif, num('imgSlot'));
    });
  });

  $('btnImageFav').addEventListener('click', async () => {
    if (!srcFrames.length) return;
    const { W, H } = size();
    const { bytes, gif, first } = await encode(W, H);
    await saveFavorite(srcName.replace(/\.[^.]+$/, ''), { kind: 'image', bytes, gif, width: W, height: H }, first);
  });
}
