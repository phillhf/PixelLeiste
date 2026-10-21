// Favourites (saved texts/images/drawings) and profiles (several favourites → slots 1..n).
import * as P from '../protocol/ipixel';
import { listAll, newId, put, remove, type Favorite, type FavoriteData, type Profile } from '../storage/db';
import { $, checked, el, errMsg, toast } from '../ui/dom';
import { ask, requireConnection, send } from '../app';
import { t } from '../i18n';
import { buildTextPlan } from './text';

let favorites: Favorite[] = [];
let profiles: Profile[] = [];
const marked = new Set<string>();

function planFor(f: Favorite, info: P.DeviceInfo, slot: number) {
  return f.data.kind === 'text' ? buildTextPlan(f.data, info, slot) : P.sendImage(f.data.bytes, f.data.gif, slot);
}

export async function saveFavorite(suggested: string, data: FavoriteData, thumb: HTMLCanvasElement) {
  const name = await ask(t('Als Favorit speichern'), t('Name des Favoriten'), { value: suggested || t('Favoriten') });
  if (!name) return;
  try {
    await put('favorites', { id: newId(), name, created: Date.now(), thumb: thumb.toDataURL('image/png'), data });
    toast(t('Favorit gespeichert'));
    await refresh();
  } catch (e) {
    toast(errMsg(e), true);
  }
}

async function refresh() {
  [favorites, profiles] = await Promise.all([listAll<Favorite>('favorites'), listAll<Profile>('profiles')]);
  render();
}

function slotPicker(f: Favorite) {
  const sel = el('select', { title: t('Speichern in') });
  sel.add(new Option(t('Nur anzeigen'), '0'));
  for (let i = 1; i <= 10; i++) sel.add(new Option(t('Speicherplatz {n}', { n: i }), String(i)));
  const go = el('button', { className: 'primary', textContent: t('Senden') });
  go.onclick = () => send(f.name, (info) => planFor(f, info, Number(sel.value)));
  return [sel, go];
}

function render() {
  $('favEmpty').hidden = favorites.length > 0;
  $('favList').replaceChildren(...favorites.map((f) => {
    const box = el('input', { type: 'checkbox', checked: marked.has(f.id), title: t('Für Profil auswählen') });
    box.onchange = () => { if (box.checked) marked.add(f.id); else marked.delete(f.id); };
    const img = el('img', { src: f.thumb, alt: '' });
    const rename = el('button', { textContent: '✎', title: t('Umbenennen'), className: 'icon-btn' });
    rename.onclick = async () => {
      const name = await ask(t('Umbenennen'), t('Name des Favoriten'), { value: f.name });
      if (name) { f.name = name; await put('favorites', f); render(); }
    };
    const del = el('button', { textContent: '🗑', title: t('Löschen'), className: 'icon-btn' });
    del.onclick = async () => {
      if (!confirm(t('Favorit „{name}“ löschen?', { name: f.name }))) return;
      await remove('favorites', f.id);
      marked.delete(f.id);
      await refresh();
    };
    return el('div', { className: 'fav' },
      el('label', { className: 'fav-head' }, box, img),
      el('div', { className: 'fav-body' },
        el('strong', { textContent: f.name }),
        el('div', { className: 'row' }, ...slotPicker(f), rename, del)));
  }));

  $('profList').replaceChildren(...profiles.map((p) => {
    const items = p.items.map((id) => favorites.find((f) => f.id === id)).filter((f): f is Favorite => !!f);
    const go = el('button', { className: 'primary', textContent: t('Übertragen') });
    go.onclick = () => transfer(p, items);
    const del = el('button', { textContent: '🗑', title: t('Löschen'), className: 'icon-btn' });
    del.onclick = async () => {
      if (!confirm(t('Profil „{name}“ löschen?', { name: p.name }))) return;
      await remove('profiles', p.id);
      await refresh();
    };
    return el('div', { className: 'prof' },
      el('div', { className: 'prof-head' }, el('strong', { textContent: p.name }), el('small', { textContent: t('{n} Inhalte', { n: items.length }) })),
      el('div', { className: 'prof-thumbs' }, ...items.map((f) => el('img', { src: f.thumb, alt: f.name, title: f.name }))),
      el('div', { className: 'row' }, go, del));
  }));
}

/** Loads the profile's favourites into slots 1..n of every selected panel. */
async function transfer(p: Profile, items: Favorite[]) {
  if (!requireConnection() || !items.length) return;
  for (let i = 0; i < items.length; i++) {
    const ok = await send(t('Profil übertragen ({i}/{n})', { i: i + 1, n: items.length }), (info) => planFor(items[i], info, i + 1), true);
    if (!ok) return;
  }
  if (checked('profClear')) {
    for (let s = items.length + 1; s <= 10; s++) await send(t('Speicherplatz {n} löschen', { n: s }), P.deleteSlot(s), true);
  }
  await send(t('Profil „{name}“ übertragen', { name: p.name }), P.showSlot(1));
}

export function initFavorites() {
  $('btnProfCreate').addEventListener('click', async () => {
    const ids = favorites.filter((f) => marked.has(f.id)).map((f) => f.id);
    if (!ids.length || ids.length > 10) { toast(t('Bitte Favoriten markieren (max. 10)'), true); return; }
    const name = $<HTMLInputElement>('profName').value.trim();
    if (!name) { toast(t('Bitte einen Namen eingeben'), true); return; }
    await put('profiles', { id: newId(), name, created: Date.now(), items: ids });
    $<HTMLInputElement>('profName').value = '';
    marked.clear();
    await refresh();
  });
  refresh().catch((e) => toast(errMsg(e), true));
}

/** Re-renders after a language switch. */
export const rerenderFavorites = render;
