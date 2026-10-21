// Shared application core: panel manager, device bar, send wrapper, dialogs.
import { PanelManager, type Panel } from './ble/manager';
import type { DeviceInfo, SendPlan } from './protocol/ipixel';
import { $, checked, el, errMsg, log, toast } from './ui/dom';
import { t } from './i18n';
import { desktop } from './platform';

// --- dialogs -------------------------------------------------------------------

/** Small text prompt (window.prompt is not available in Electron). */
export function ask(title: string, text: string, opts: { value?: string; numeric?: boolean } = {}): Promise<string | null> {
  const dlg = $<HTMLDialogElement>('prompt');
  const input = $<HTMLInputElement>('promptInput');
  $('promptTitle').textContent = title;
  $('promptText').textContent = text;
  input.value = opts.value ?? '';
  input.inputMode = opts.numeric ? 'numeric' : 'text';
  dlg.showModal();
  input.focus();
  return new Promise((resolve) => {
    const done = (v: string | null) => { dlg.close(); cleanup(); resolve(v); };
    const ok = () => done(input.value.trim() || null);
    const cancel = () => done(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Enter') ok(); };
    const cleanup = () => {
      $('promptOk').removeEventListener('click', ok);
      $('promptCancel').removeEventListener('click', cancel);
      input.removeEventListener('keydown', key);
      dlg.removeEventListener('cancel', cancel);
    };
    $('promptOk').addEventListener('click', ok);
    $('promptCancel').addEventListener('click', cancel);
    input.addEventListener('keydown', key);
    dlg.addEventListener('cancel', cancel);
  });
}

// --- panels --------------------------------------------------------------------

const listeners: (() => void)[] = [];
/** Called whenever panels connect/disconnect or the selection changes. */
export const onPanelsChanged = (fn: () => void) => listeners.push(fn);

export const manager = new PanelManager(log, () => {
  renderDevices();
  listeners.forEach((fn) => fn());
}, (name) => ask(t('Passwort für {name}', { name }), t('Die Leiste ist mit einem 6-stelligen Passwort geschützt.'), { numeric: true }));

export const size = () => {
  const i = manager.primaryInfo;
  return { W: i.width, H: i.height };
};

export function renderDevices() {
  const box = $('devices');
  if (!manager.panels.length) {
    box.replaceChildren(el('p', { className: 'empty small', textContent: t('Keine Leiste verbunden – „Verbinden“ drücken.') }));
  } else {
    box.replaceChildren(...manager.panels.map((p) => deviceChip(p)));
  }
  $('btnAdd').textContent = manager.panels.length ? t('+ Leiste') : t('Verbinden');
}

function deviceChip(p: Panel) {
  const stateText = { connecting: t('Verbinde …'), connected: '', reconnecting: t('Getrennt – verbinde neu …') }[p.state];
  const box = el('input', { type: 'checkbox', checked: p.selected, title: t('Senden an diese Leiste') });
  box.addEventListener('change', () => manager.toggle(p));
  const close = el('button', { className: 'chip-x', textContent: '✕', title: t('Trennen') });
  close.addEventListener('click', () => manager.remove(p));
  const size = p.conn.info ? ` · ${p.conn.info.width}×${p.conn.info.height}` : '';
  return el('div', { className: `chip ${p.state}` },
    el('label', {}, box, el('span', { className: 'dot' }), el('span', { textContent: `${p.name}${size}` })),
    stateText ? el('small', { textContent: stateText }) : '',
    close);
}

$('btnAdd').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('btnAdd');
  btn.disabled = true;
  try {
    await manager.addViaPicker(checked('showAll'));
    toast(t('Verbunden'));
  } catch (e) {
    const msg = errMsg(e);
    log(t('Verbindung fehlgeschlagen: {e}', { e: msg }));
    toast(/cancel|abgebrochen|chosen|aborted/i.test(msg) ? t('Abgebrochen') : t('Verbindung fehlgeschlagen: {e}', { e: msg }), true);
  } finally {
    $<HTMLDialogElement>('picker').close();
    btn.disabled = false;
  }
});

// Electron (Windows): Chromium needs us to show the Bluetooth device list ourselves.
if (desktop) {
  const dlg = $<HTMLDialogElement>('picker');
  desktop.onDevices((devices) => {
    if (!dlg.open) dlg.showModal();
    $('pickList').replaceChildren(...devices.map((d) => {
      const b = el('button', { textContent: d.deviceName || `${t('Unbenannt')} (${d.deviceId})` });
      b.onclick = () => { desktop!.select(d.deviceId); dlg.close(); };
      return el('li', {}, b);
    }));
  });
  $('pickCancel').onclick = () => { desktop!.select(''); dlg.close(); };
}

// --- sending -------------------------------------------------------------------

let busy = 0;
/**
 * Builds and sends a plan to every selected panel, with progress bar, log and toast.
 * `build` gets each panel's size so content can be scaled per panel.
 */
export async function send(what: string, build: SendPlan | ((info: DeviceInfo) => SendPlan | Promise<SendPlan>), quiet = false): Promise<boolean> {
  if (!manager.targets.length) { toast(t('Bitte zuerst mit der LED-Leiste verbinden'), true); return false; }
  const progress = $('progress');
  const bar = progress.firstElementChild as HTMLElement;
  busy++;
  document.body.classList.add('busy');
  const showBar = window.setTimeout(() => { progress.hidden = false; }, 300);
  try {
    const errors = await manager.sendAll(typeof build === 'function' ? build : () => build,
      (d, n) => (bar.style.width = `${Math.round((d / n) * 100)}%`));
    for (const { panel, error } of errors) log(`✗ ${panel.name}: ${what}: ${errMsg(error)}`);
    if (errors.length) {
      toast(t('{what} fehlgeschlagen: {e}', { what, e: errMsg(errors[0].error) }), true);
      return false;
    }
    log(`✓ ${what}`);
    if (!quiet) toast(`${what} ✓`);
    return true;
  } catch (e) {
    toast(t('{what} fehlgeschlagen: {e}', { what, e: errMsg(e) }), true);
    return false;
  } finally {
    clearTimeout(showBar);
    if (--busy === 0) {
      progress.hidden = true;
      bar.style.width = '0';
      document.body.classList.remove('busy');
    }
  }
}

export function requireConnection(): boolean {
  if (manager.targets.length) return true;
  toast(t('Bitte zuerst mit der LED-Leiste verbinden'), true);
  return false;
}

renderDevices();
