// Clock & live tab: clock faces, stopwatch, countdown, scoreboard, live text with data
// placeholders (time, weather, battery, CPU/RAM) and Android notifications.
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import * as P from '../protocol/ipixel';
import { hexToRgb, loadPixelFont, renderText } from '../render/glyphs';
import { encodePng } from '../render/image';
import { $, checked, errMsg, getSetting, log, num, setSetting, toast, val } from '../ui/dom';
import { blank, showPreview } from '../ui/preview';
import { manager, requireConnection, send, size } from '../app';
import { getLang, t } from '../i18n';
import { desktop, isAndroid } from '../platform';
import { buildTextPlan } from './text';

// --- data sources ----------------------------------------------------------------

interface WeatherLoc { name: string; lat: number; lon: number }
let weather: { at: number; temp: number; code: number } | null = null;

const WEATHER_TEXT: [number[], string, string][] = [
  [[0], 'Sonnig', 'Sunny'], [[1, 2], 'Heiter', 'Fair'], [[3], 'Bewölkt', 'Cloudy'],
  [[45, 48], 'Nebel', 'Fog'], [[51, 53, 55, 56, 57], 'Niesel', 'Drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Regen', 'Rain'], [[71, 73, 75, 77, 85, 86], 'Schnee', 'Snow'],
  [[95, 96, 99], 'Gewitter', 'Storm'],
];
const weatherText = (code: number) => {
  const e = WEATHER_TEXT.find(([codes]) => codes.includes(code));
  return e ? (getLang() === 'en' ? e[2] : e[1]) : '';
};

async function refreshWeather() {
  const loc = getSetting<WeatherLoc | null>('wxLoc', null);
  if (!loc || (weather && Date.now() - weather.at < 10 * 60_000)) return;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code`);
    const j = await r.json();
    weather = { at: Date.now(), temp: j.current.temperature_2m, code: j.current.weather_code };
  } catch (e) {
    log(`Wetter: ${errMsg(e)}`);
  }
}

async function findWeatherLocation() {
  const q = val('wxCity').trim();
  if (!q) return;
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=${getLang()}&name=${encodeURIComponent(q)}`);
    const hit = (await r.json()).results?.[0];
    if (!hit) { toast(t('Ort nicht gefunden'), true); return; }
    const loc: WeatherLoc = { name: `${hit.name}${hit.admin1 ? `, ${hit.admin1}` : ''}`, lat: hit.latitude, lon: hit.longitude };
    setSetting('wxLoc', loc);
    weather = null;
    await refreshWeather();
    showWeatherInfo();
    updateLivePreview();
  } catch (e) {
    toast(errMsg(e), true);
  }
}

function showWeatherInfo() {
  const loc = getSetting<WeatherLoc | null>('wxLoc', null);
  $('wxInfo').textContent = loc
    ? `${t('Wetter für {name}', { name: loc.name })}${weather ? `: ${Math.round(weather.temp)} °C, ${weatherText(weather.code)}` : ''}`
    : '';
}

let sys = { cpu: 0, ram: 0 };
let battery: number | null = null;
async function refreshSystem() {
  if (desktop) sys = await desktop.sysStats().catch(() => sys);
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
  if (nav.getBattery) battery = Math.round((await nav.getBattery()).level * 100);
}

// --- live text -----------------------------------------------------------------------

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');

export function fillTemplate(tpl: string, now = new Date()) {
  let countdown = '--:--:--';
  const target = val('liveTarget') ? new Date(val('liveTarget')) : null;
  if (target && !isNaN(target.getTime())) {
    let s = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
    const d = Math.floor(s / 86400); s %= 86400;
    const hms = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    countdown = d > 0 ? `${d}${getLang() === 'en' ? 'd' : 'T'} ${hms}` : hms;
  }
  const date = getLang() === 'en' ? `${pad(now.getMonth() + 1)}/${pad(now.getDate())}` : `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.`;
  return tpl
    .replace(/\{zeit\}/g, `${pad(now.getHours())}:${pad(now.getMinutes())}`)
    .replace(/\{zeitsek\}/g, `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)
    .replace(/\{datum\}/g, date)
    .replace(/\{tag\}/g, t(WEEKDAYS[now.getDay()]))
    .replace(/\{countdown\}/g, countdown)
    .replace(/\{temp\}/g, weather ? `${Math.round(weather.temp)}°C` : '--°C')
    .replace(/\{wetter\}/g, weather ? weatherText(weather.code) : '')
    .replace(/\{akku\}/g, battery === null ? '--%' : `${battery}%`)
    .replace(/\{cpu\}/g, `${sys.cpu}%`)
    .replace(/\{ram\}/g, `${sys.ram}%`);
}

async function renderLiveFrame(w: number, h: number) {
  const glyphs = await renderText(fillTemplate(val('liveTpl')), h >= 32 ? 32 : 16);
  const color = hexToRgb(val('liveColor'));
  const c = blank(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  const width = glyphs.reduce((n, g) => n + g.width, 0);
  let x0 = Math.max(0, Math.floor((w - width) / 2));
  for (const g of glyphs) {
    for (let y = 0; y < Math.min(g.height, h); y++)
      for (let x = 0; x < g.width && x0 + x < w; x++)
        if (g.pixels[y * g.width + x]) img.data.set([...(g.color ?? color), 255], (y * w + x0 + x) * 4);
    x0 += g.width;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function updateLivePreview() {
  await loadPixelFont();
  const { W, H } = size();
  showPreview(await renderLiveFrame(W, H), W, H);
}

let liveTimer = 0;
let liveBusy = false;
async function liveTick() {
  if (liveBusy) return;
  liveBusy = true;
  try {
    await Promise.all([refreshWeather(), refreshSystem()]);
    const { W, H } = size();
    showPreview(await renderLiveFrame(W, H), W, H);
    await send(t('Live-Text'), async (info) => P.sendImage(await encodePng(await renderLiveFrame(info.width, info.height)), false, 0), true);
  } finally { liveBusy = false; }
}

export function stopLive() {
  if (!liveTimer) return;
  clearInterval(liveTimer);
  liveTimer = 0;
  $('btnLive').textContent = t('Live-Text starten');
}

// --- Android notifications --------------------------------------------------------

interface NotificationEvent { app: string; appName: string; title: string; text: string }
interface NotificationsPlugin {
  isEnabled(): Promise<{ enabled: boolean }>;
  openSettings(): Promise<void>;
  addListener(event: 'notification', cb: (n: NotificationEvent) => void): Promise<PluginListenerHandle>;
}
const Notifications = registerPlugin<NotificationsPlugin>('PixelNotifications');
const seenApps = new Set<string>();
let returnTimer = 0;

async function onNotification(n: NotificationEvent) {
  seenApps.add(n.appName || n.app);
  $('notifSeen').textContent = t('Zuletzt gesehene Apps: {apps}', { apps: [...seenApps].slice(-8).join(', ') });
  if (!checked('notifOn') || !manager.targets.length) return;
  const filter = val('notifApps').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const name = (n.appName || n.app).toLowerCase();
  if (filter.length && !filter.some((f) => name.includes(f) || n.app.toLowerCase().includes(f))) return;
  const text = [n.appName, n.title, n.text].filter(Boolean).join(': ').replace(/\s+/g, ' ').slice(0, 200);
  log(`${t('Benachrichtigung')}: ${text}`);
  await send(t('Benachrichtigung'), (info) => buildTextPlan({
    kind: 'text', text, font: 'pixel', animation: P.TextAnimation.ScrollLeft, speed: 70, rainbow: 0,
    color: val('notifColor'), background: null, size: 14, bold: false, smooth: false,
  }, info, 0), true);
  clearTimeout(returnTimer);
  const back = num('notifReturn');
  if (back > 0) returnTimer = window.setTimeout(() => send(t('Speicherplatz {n} anzeigen', { n: back }), P.showSlot(back), true), num('notifSecs') * 1000);
}

async function initNotifications() {
  if (!isAndroid) return;
  $('notifSection').hidden = false;
  const ret = $<HTMLSelectElement>('notifReturn');
  if (ret.options[0]) ret.options[0].text = t('Nicht zurückschalten');
  await Notifications.addListener('notification', (n) => { onNotification(n).catch(() => undefined); });
  $('btnNotifAccess').addEventListener('click', () => Notifications.openSettings());
  $('notifOn').addEventListener('change', async () => {
    if (checked('notifOn') && !(await Notifications.isEnabled()).enabled) {
      toast(t('Bitte zuerst den Zugriff auf Benachrichtigungen erlauben'), true);
      Notifications.openSettings();
    }
  });
}

// --- init -----------------------------------------------------------------------------

export function initLive() {
  for (let i = 0; i <= 8; i++) $<HTMLSelectElement>('clkStyle').add(new Option(t('Stil {n}', { n: i + 1 }), String(i)));

  $('btnClock').addEventListener('click', async () => {
    if (await send(t('Uhrzeit übertragen'), () => P.setTime(), true))
      send(t('Uhr anzeigen'), () => P.setClockMode(num('clkStyle'), checked('clk24'), checked('clkDate')));
  });
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-sw]'))
    b.addEventListener('click', () => send(`${t('Stoppuhr')}: ${b.textContent}`, P.setStopwatch(Number(b.dataset.sw))));
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-cd]'))
    b.addEventListener('click', () => send(`${t('Countdown')}: ${b.textContent}`, P.setCountdown(Number(b.dataset.cd), num('cdMin'), num('cdSec'))));

  const scores = [0, 0];
  let scoreTimer = 0;
  const pushScores = () => {
    $('sc0').textContent = String(scores[0]);
    $('sc1').textContent = String(scores[1]);
    clearTimeout(scoreTimer);
    scoreTimer = window.setTimeout(() => send(t('Anzeigetafel'), P.setScores(scores[0], scores[1]), true), 200);
  };
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-sc]')) {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.sc);
      scores[i] = Math.max(0, Math.min(99, scores[i] + Number(b.dataset.d)));
      pushScores();
    });
  }
  $('btnScoreReset').addEventListener('click', () => { scores[0] = scores[1] = 0; pushScores(); });

  for (const id of ['liveTpl', 'liveColor', 'liveTarget']) $(id).addEventListener('input', updateLivePreview);
  $('btnWxFind').addEventListener('click', findWeatherLocation);
  $('btnLive').addEventListener('click', () => {
    if (liveTimer) { stopLive(); return; }
    if (!requireConnection()) return;
    liveTick();
    liveTimer = window.setInterval(liveTick, Math.max(2, num('liveInt')) * 1000);
    $('btnLive').textContent = t('Live-Text stoppen');
  });
  for (const e of document.querySelectorAll<HTMLElement>('.desktop-only')) e.hidden = !desktop;

  refreshWeather().then(showWeatherInfo);
  refreshSystem().catch(() => undefined);
  initNotifications().catch((e) => log(`Benachrichtigungen: ${errMsg(e)}`));
}

export const rerenderLive = showWeatherInfo;
