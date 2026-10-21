import './style.css';
import { applyLang, detectLang, getLang, t, type Lang } from './i18n';
import { $, checked, getSetting, initPersistentFields, log, setSetting } from './ui/dom';
import { manager, onPanelsChanged, renderDevices } from './app';
import { initText, updateTextPreview } from './features/text';
import { initImage, updateImagePreview } from './features/image';
import { initDraw, updateDrawPreview } from './features/draw';
import { initFavorites, rerenderFavorites } from './features/favorites';
import { initMusic, stopMusic } from './features/music';
import { initLive, rerenderLive, stopLive, updateLivePreview } from './features/live';
import { initDevice, rerenderDevice } from './features/device';
import { initUpdate, rerenderUpdate } from './features/update';
import { loadPixelFont } from './render/glyphs';

// Language first, so dynamically created texts use it too.
applyLang(detectLang(getSetting<string | null>('lang', null)));

// Slot pickers
for (const sel of document.querySelectorAll<HTMLSelectElement>('.slotSel')) {
  sel.add(new Option(t('Nur anzeigen'), '0'));
  for (let i = 1; i <= 10; i++) sel.add(new Option(t('Speicherplatz {n}', { n: i }), String(i)));
}

initPersistentFields();

let tab = 'text';
function refreshPreview() {
  if (tab === 'text') updateTextPreview();
  else if (tab === 'image') updateImagePreview();
  else if (tab === 'draw') updateDrawPreview();
  else if (tab === 'live') updateLivePreview();
}

for (const b of document.querySelectorAll<HTMLButtonElement>('.tabs button')) {
  b.addEventListener('click', () => {
    tab = b.dataset.tab!;
    document.querySelectorAll('.tabs button').forEach((o) => o.setAttribute('aria-selected', String(o === b)));
    document.querySelectorAll<HTMLElement>('.panel').forEach((p) => (p.hidden = p.dataset.panel !== tab));
    refreshPreview();
  });
}

initText();
initImage();
initDraw();
initFavorites();
initMusic();
initLive();
initDevice();
initUpdate();

onPanelsChanged(() => {
  if (!manager.anyConnected) { stopLive(); stopMusic(); }
  refreshPreview();
});

const langSel = $<HTMLSelectElement>('lang');
langSel.value = getLang();
langSel.addEventListener('change', () => {
  setSetting('lang', langSel.value);
  applyLang(langSel.value as Lang);
  // Rebuild generated option texts and lists in the new language.
  for (const sel of document.querySelectorAll<HTMLSelectElement>('.slotSel')) {
    sel.options[0].text = t('Nur anzeigen');
    for (let i = 1; i <= 10; i++) sel.options[i].text = t('Speicherplatz {n}', { n: i });
  }
  for (const o of $<HTMLSelectElement>('clkStyle').options) o.text = t('Stil {n}', { n: Number(o.value) + 1 });
  renderDevices();
  rerenderFavorites();
  rerenderLive();
  rerenderDevice();
  rerenderUpdate();
});

loadPixelFont().then(refreshPreview);
log(t('Bereit. „Verbinden“ drücken und die LED-Leiste (meist „LED_BLE_…“) auswählen.'));
if (checked('autoConnect')) manager.autoConnect();
