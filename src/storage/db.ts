// Minimal IndexedDB wrapper for favourites and profiles (images can be too big for localStorage).

export interface TextFavorite {
  kind: 'text';
  text: string;
  font: string;
  animation: number;
  speed: number;
  rainbow: number;
  color: string;
  background: string | null;
  size: number;
  bold: boolean;
  smooth: boolean;
}
export interface ImageFavorite {
  kind: 'image';
  bytes: Uint8Array;
  gif: boolean;
  width: number;
  height: number;
}
export type FavoriteData = TextFavorite | ImageFavorite;

export interface Favorite {
  id: string;
  name: string;
  created: number;
  /** PNG data URL of the first frame for the list. */
  thumb: string;
  data: FavoriteData;
}

export interface Profile {
  id: string;
  name: string;
  created: number;
  items: string[];
}

type StoreName = 'favorites' | 'profiles';
let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('pixelleiste', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('favorites', { keyPath: 'id' });
      req.result.createObjectStore('profiles', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const listAll = <T>(store: StoreName) =>
  tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>).then((l) => l.sort((a, b) => (a as { created: number }).created - (b as { created: number }).created));
export const put = (store: StoreName, item: Favorite | Profile) => tx(store, 'readwrite', (s) => s.put(item));
export const remove = (store: StoreName, id: string) => tx(store, 'readwrite', (s) => s.delete(id));
