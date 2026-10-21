// Device tab: power, brightness, orientation, slots, password, known panels.
import * as P from '../protocol/ipixel';
import { $, el, num, toast, val } from '../ui/dom';
import { manager, onPanelsChanged, requireConnection, send } from '../app';
import { t } from '../i18n';

function renderKnown() {
  const known = manager.known;
  $('knownList').replaceChildren(...(known.length ? [el('p', { className: 'hint', textContent: t('Bekannte Leisten:') })] : []),
    ...known.map((k) => {
      const forget = el('button', { textContent: t('Vergessen') });
      forget.onclick = () => manager.forget(k.key);
      return el('div', { className: 'known' }, el('span', { textContent: k.name }), forget);
    }));
}

export function initDevice() {
  $('btnOn').addEventListener('click', () => send(t('Einschalten'), P.setPower(true)));
  $('btnOff').addEventListener('click', () => send(t('Ausschalten'), P.setPower(false)));

  // Brightness: send while dragging, but never queue more than one pending value.
  let sending = false, pending = false;
  const sendBrightness = async () => {
    if (sending) { pending = true; return; }
    sending = true;
    await send(t('Helligkeit {n} %', { n: val('bri') }), P.setBrightness(num('bri')), true);
    sending = false;
    if (pending) { pending = false; sendBrightness(); }
  };
  $('bri').addEventListener('input', () => {
    $('briOut').textContent = val('bri');
    if (manager.targets.length) sendBrightness();
  });
  $('briOut').textContent = val('bri');

  $('orient').addEventListener('change', () => send(t('Ausrichtung'), P.setOrientation(num('orient'))));
  $('btnSyncTime').addEventListener('click', () => send(t('Uhrzeit übertragen'), () => P.setTime()));
  $('btnShowSlot').addEventListener('click', () => send(t('Speicherplatz {n} anzeigen', { n: num('slotNo') }), P.showSlot(num('slotNo'))));
  $('btnDelSlot').addEventListener('click', () => send(t('Speicherplatz {n} löschen', { n: num('slotNo') }), P.deleteSlot(num('slotNo'))));
  $('btnClearAll').addEventListener('click', () => {
    if (requireConnection() && confirm(t('Wirklich ALLE gespeicherten Inhalte und Einstellungen auf der Leiste löschen?')))
      send(t('Alles gelöscht'), P.clearAll());
  });

  $('btnPwSet').addEventListener('click', async () => {
    const pw = val('pwNew');
    if (!/^\d{6}$/.test(pw)) { toast(t('Bitte genau 6 Ziffern eingeben'), true); return; }
    const targets = manager.targets;
    if (await send(t('Passwort gesetzt'), P.setPassword(true, pw))) {
      targets.forEach((p) => manager.storePassword(p, pw));
      $<HTMLInputElement>('pwNew').value = '';
    }
  });
  $('btnPwOff').addEventListener('click', async () => {
    const targets = manager.targets;
    if (await send(t('Passwort entfernt'), P.setPassword(false, '000000'))) targets.forEach((p) => manager.storePassword(p, null));
  });

  onPanelsChanged(renderKnown);
  renderKnown();
}

export const rerenderDevice = renderKnown;
