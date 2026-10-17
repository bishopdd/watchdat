import { TrackedShow, WatchActivityItem } from '../types/tv';

const DB_NAME = 'watchdat_pwa_db';
const DB_VERSION = 1;
const STORE_SHOWS = 'tracked_shows';
const STORE_ACTIVITY = 'watch_activity';
const LS_FALLBACK_SHOWS = 'watchdat_shows_v1';
const LS_FALLBACK_ACTIVITY = 'watchdat_activity_v1';

function openDBWithTimeout(timeoutMs = 1500): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('IndexedDB open timed out'));
      }
    }, timeoutMs);

    try {
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
      req.onsuccess = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(req.result);
        } else {
          req.result.close();
        }
      };
      req.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(req.error);
        }
      };
      req.onblocked = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('IndexedDB blocked'));
        }
      };
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    }
  });
}

export async function loadTrackedShows(): Promise<TrackedShow[]> {
  let lsShows: TrackedShow[] = [];
  try {
    const raw = localStorage.getItem(LS_FALLBACK_SHOWS);
    if (raw) lsShows = JSON.parse(raw);
  } catch {
    // Ignore localStorage error
  }

  try {
    const db = await openDBWithTimeout();
    return await new Promise<TrackedShow[]>((resolve) => {
      const tx = db.transaction(STORE_SHOWS, 'readonly');
      const store = tx.objectStore(STORE_SHOWS);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = (req.result as TrackedShow[]) || [];
        db.close();
        resolve(result.length >= lsShows.length ? result : lsShows);
      };
      req.onerror = () => {
        db.close();
        resolve(lsShows);
      };
    });
  } catch {
    return lsShows;
  }
}

export async function saveTrackedShows(shows: TrackedShow[]): Promise<void> {
  try {
    localStorage.setItem(LS_FALLBACK_SHOWS, JSON.stringify(shows));
  } catch {
    // Ignore quota errors if very large
  }

  try {
    const db = await openDBWithTimeout();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SHOWS, 'readwrite');
      const store = tx.objectStore(STORE_SHOWS);
      store.clear();
      for (const show of shows) {
        store.put(show);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore IDB failure on iOS Private Mode
  }
}

export async function loadWatchActivity(): Promise<WatchActivityItem[]> {
  let lsActivity: WatchActivityItem[] = [];
  try {
    const raw = localStorage.getItem(LS_FALLBACK_ACTIVITY);
    if (raw) lsActivity = JSON.parse(raw);
  } catch {
    // Ignore
  }

  try {
    const db = await openDBWithTimeout();
    return await new Promise<WatchActivityItem[]>((resolve) => {
      const tx = db.transaction(STORE_ACTIVITY, 'readonly');
      const store = tx.objectStore(STORE_ACTIVITY);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = ((req.result as WatchActivityItem[]) || []).sort(
          (a, b) => b.timestamp - a.timestamp
        );
        db.close();
        resolve(items.length >= lsActivity.length ? items : lsActivity);
      };
      req.onerror = () => {
        db.close();
        resolve(lsActivity);
      };
    });
  } catch {
    return lsActivity;
  }
}

export async function saveWatchActivity(items: WatchActivityItem[]): Promise<void> {
  const trimmed = items
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 150);

  try {
    localStorage.setItem(LS_FALLBACK_ACTIVITY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota error
  }

  try {
    const db = await openDBWithTimeout();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ACTIVITY, 'readwrite');
      const store = tx.objectStore(STORE_ACTIVITY);
      store.clear();
      for (const item of trimmed) {
        store.put(item);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Fallback already saved in localStorage
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
