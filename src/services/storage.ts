import { TrackedShow, WatchActivityItem } from '../types/tv';

const DB_NAME = 'watchdat_pwa_db';
const DB_VERSION = 1;
const STORE_SHOWS = 'tracked_shows';
const STORE_ACTIVITY = 'watch_activity';
const LS_FALLBACK_SHOWS = 'watchdat_shows_v1';
const LS_FALLBACK_ACTIVITY = 'watchdat_activity_v1';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SHOWS)) {
        db.createObjectStore(STORE_SHOWS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ACTIVITY)) {
        db.createObjectStore(STORE_ACTIVITY, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadTrackedShows(): Promise<TrackedShow[]> {
  try {
    const db = await openDB();
    return await new Promise<TrackedShow[]>((resolve, reject) => {
      const tx = db.transaction(STORE_SHOWS, 'readonly');
      const store = tx.objectStore(STORE_SHOWS);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = (req.result as TrackedShow[]) || [];
        if (result.length > 0) {
          resolve(result);
        } else {
          // Check localStorage fallback
          const raw = localStorage.getItem(LS_FALLBACK_SHOWS);
          resolve(raw ? JSON.parse(raw) : []);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(LS_FALLBACK_SHOWS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export async function saveTrackedShows(shows: TrackedShow[]): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SHOWS, 'readwrite');
      const store = tx.objectStore(STORE_SHOWS);
      store.clear();
      for (const show of shows) {
        store.put(show);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB failure and rely on localStorage below
  }

  try {
    localStorage.setItem(LS_FALLBACK_SHOWS, JSON.stringify(shows));
  } catch {
    // Ignore quota errors if very large
  }
}

export async function loadWatchActivity(): Promise<WatchActivityItem[]> {
  try {
    const db = await openDB();
    return await new Promise<WatchActivityItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_ACTIVITY, 'readonly');
      const store = tx.objectStore(STORE_ACTIVITY);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = ((req.result as WatchActivityItem[]) || []).sort(
          (a, b) => b.timestamp - a.timestamp
        );
        if (items.length > 0) {
          resolve(items);
        } else {
          const raw = localStorage.getItem(LS_FALLBACK_ACTIVITY);
          resolve(raw ? JSON.parse(raw) : []);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(LS_FALLBACK_ACTIVITY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

export async function saveWatchActivity(items: WatchActivityItem[]): Promise<void> {
  const trimmed = items
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 150);

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ACTIVITY, 'readwrite');
      const store = tx.objectStore(STORE_ACTIVITY);
      store.clear();
      for (const item of trimmed) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback below
  }

  try {
    localStorage.setItem(LS_FALLBACK_ACTIVITY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota error
  }
}

export interface WatchDatBackupPayload {
  version: number;
  exportedAt: string;
  shows: TrackedShow[];
  activity: WatchActivityItem[];
}

export function exportBackupJson(shows: TrackedShow[], activity: WatchActivityItem[]): void {
  const payload: WatchDatBackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    shows,
    activity
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const datePart = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `watchdat-backup-${datePart}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
