// Music tab: microphone → 11-band equaliser streamed to the panel, plus the built-in rhythm effect.
import * as P from '../protocol/ipixel';
import { $, errMsg, num, toast } from '../ui/dom';
import { blank, showPreview } from '../ui/preview';
import { manager, requireConnection, send, size } from '../app';
import { t } from '../i18n';

const BANDS = 11;
const FRAME_MS = 70;

let stream: MediaStream | null = null;
let audio: AudioContext | null = null;
let timer = 0;

/** Log-spaced bands from 60 Hz to 12 kHz → bar heights 1..15. */
function levels(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>, gain: number): number[] {
  analyser.getByteFrequencyData(data);
  const nyquist = analyser.context.sampleRate / 2;
  const out: number[] = [];
  for (let b = 0; b < BANDS; b++) {
    const f0 = 60 * Math.pow(12000 / 60, b / BANDS);
    const f1 = 60 * Math.pow(12000 / 60, (b + 1) / BANDS);
    const i0 = Math.floor((f0 / nyquist) * data.length);
    const i1 = Math.max(i0 + 1, Math.floor((f1 / nyquist) * data.length));
    let sum = 0;
    for (let i = i0; i < i1; i++) sum += data[i];
    const avg = sum / (i1 - i0);
    out.push(Math.max(1, Math.min(15, Math.round(((avg - 50) / 205) * 15 * gain))));
  }
  return out;
}

function drawBars(lv: number[]) {
  const { W, H } = size();
  const c = blank(W, H);
  const ctx = c.getContext('2d')!;
  const bw = W / BANDS;
  lv.forEach((l, i) => {
    const h = Math.round((l / 15) * H);
    ctx.fillStyle = `hsl(${120 - (l / 15) * 120}, 100%, 50%)`;
    ctx.fillRect(Math.round(i * bw) + 1, H - h, Math.max(1, Math.round(bw) - 2), h);
  });
  showPreview(c, W, H);
}

export function stopMusic() {
  clearInterval(timer);
  timer = 0;
  stream?.getTracks().forEach((tr) => tr.stop());
  stream = null;
  audio?.close().catch(() => undefined);
  audio = null;
  $('btnMusic').textContent = t('Equalizer starten');
}

async function startMusic() {
  if (!requireConnection()) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    toast(t('Kein Zugriff auf das Mikrofon: {e}', { e: errMsg(e) }), true);
    return;
  }
  audio = new AudioContext();
  const analyser = audio.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.55;
  audio.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  $('btnMusic').textContent = t('Equalizer stoppen');
  timer = window.setInterval(() => {
    if (!manager.targets.length) { stopMusic(); return; }
    const lv = levels(analyser, data, num('musGain') / 50);
    drawBars(lv);
    manager.stream(P.setRhythmChart(num('musStyle'), lv));
  }, FRAME_MS);
}

export function initMusic() {
  $('btnMusic').addEventListener('click', () => (timer ? stopMusic() : startMusic()));
  const sync = () => {
    $('musGainOut').textContent = $<HTMLInputElement>('musGain').value;
    $('rhTimeOut').textContent = $<HTMLInputElement>('rhTime').value;
  };
  $('musGain').addEventListener('input', sync);
  $('rhTime').addEventListener('input', sync);
  sync();
  $('btnRhythm').addEventListener('click', () => {
    stopMusic();
    send(t('Rhythmus-Effekt'), P.setRhythmMode(num('rhStyle'), num('rhTime')));
  });
}

export const musicRunning = () => timer !== 0;
