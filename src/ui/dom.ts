// Small DOM helpers shared by all feature modules.
import { t } from '../i18n';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const val = (id: string) => $<HTMLInputElement>(id).value;
export const num = (id: string) => Number(val(id)) || 0;
export const checked = (id: string) => $<HTMLInputElement>(id).checked;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

export function log(msg: string) {
  const logEl = $('log');
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `${time}  ${msg}\n${logEl.textContent ?? ''}`.slice(0, 20000);
}

let toastTimer = 0;
export function toast(msg: string, err = false) {
  const e = $('toast');
  e.textContent = msg;
  e.className = `show${err ? ' err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (e.className = ''), err ? 4500 : 2200);
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)) || t('Unbekannter Fehler');

// --- Persistent form values & small settings (per device, best effort) -------

const KEY = 'pixelleiste';

function readStore(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}
function writeStore(data: Record<string, unknown>) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

export function getSetting<T>(name: string, fallback: T): T {
  const v = readStore()[`$${name}`];
  return v === undefined ? fallback : (v as T);
}
export function setSetting(name: string, value: unknown) {
  const s = readStore();
  s[`$${name}`] = value;
  writeStore(s);
}

/** Every input/select/textarea with data-persist keeps its value across restarts. */
export function initPersistentFields() {
  const saved = readStore();
  for (const e of document.querySelectorAll<HTMLInputElement>('[data-persist]')) {
    if (e.id in saved) {
      if (e.type === 'checkbox') e.checked = !!saved[e.id]; else e.value = String(saved[e.id]);
    }
    const save = () => {
      const s = readStore();
      s[e.id] = e.type === 'checkbox' ? e.checked : e.value;
      writeStore(s);
    };
    e.addEventListener('change', save);
    e.addEventListener('input', save);
  }
}
