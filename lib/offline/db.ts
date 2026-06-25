// Minimal IndexedDB layer for offline support — no dependencies.
//
// We persist three things so the app is useful in the field with no signal:
//   • drawings   — full drawing records (strokes), with a `pendingSync` flag so
//                  edits made offline (or pending inserts) can be flushed later.
//   • jobFiles   — the list of files attached to a job, cached when last viewed
//                  online, so "what's already in this job" is answerable offline.
//   • jobs       — id→title, so cached lists can show a job name offline.
//
// Everything is best-effort: if IndexedDB is unavailable the helpers resolve to
// null/no-op rather than throwing, so they can be called unconditionally.

const DB_NAME = "coastal-edge-offline";
const DB_VERSION = 1;

export interface OfflineDrawing {
  id: string;
  job_id: string;
  label: string;
  strokes: unknown[];
  thumbnail: string | null;
  sort_order: number;
  updated_at: string; // ISO; local edit time when dirty
  pendingSync: boolean; // true = has local changes not yet in Supabase
  pendingInsert?: boolean; // true = created offline, needs INSERT (not UPDATE)
}

export interface OfflineJobFiles {
  job_id: string;
  job_title: string;
  files: { kind: string; name: string; detail?: string }[];
  cached_at: string;
}

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("drawings")) {
        const s = db.createObjectStore("drawings", { keyPath: "id" });
        s.createIndex("by_job", "job_id", { unique: false });
      }
      if (!db.objectStoreNames.contains("jobFiles")) db.createObjectStore("jobFiles", { keyPath: "job_id" });
      if (!db.objectStoreNames.contains("jobs")) db.createObjectStore("jobs", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDB().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(store, mode);
          const req = fn(t.objectStore(store));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

// ---- Drawings ---------------------------------------------------------------

export function putDrawing(d: OfflineDrawing): Promise<unknown> {
  return tx("drawings", "readwrite", (s) => s.put(d));
}

export function getDrawing(id: string): Promise<OfflineDrawing | null> {
  return tx<OfflineDrawing>("drawings", "readonly", (s) => s.get(id) as IDBRequest<OfflineDrawing>);
}

export function getAllDrawings(): Promise<OfflineDrawing[]> {
  return tx<OfflineDrawing[]>("drawings", "readonly", (s) => s.getAll() as IDBRequest<OfflineDrawing[]>).then((r) => r ?? []);
}

export async function getPendingDrawings(): Promise<OfflineDrawing[]> {
  const all = await getAllDrawings();
  return all.filter((d) => d.pendingSync);
}

export async function markDrawingSynced(id: string): Promise<void> {
  const d = await getDrawing(id);
  if (d) await putDrawing({ ...d, pendingSync: false, pendingInsert: false });
}

// ---- Job file lists ---------------------------------------------------------

export function putJobFiles(rec: OfflineJobFiles): Promise<unknown> {
  return tx("jobFiles", "readwrite", (s) => s.put(rec));
}

export function getJobFiles(jobId: string): Promise<OfflineJobFiles | null> {
  return tx<OfflineJobFiles>("jobFiles", "readonly", (s) => s.get(jobId) as IDBRequest<OfflineJobFiles>);
}

// ---- Jobs (id → title) ------------------------------------------------------

export interface OfflineJob {
  id: string;
  title: string;
}

export function putJob(id: string, title: string): Promise<unknown> {
  return tx("jobs", "readwrite", (s) => s.put({ id, title }));
}

export function getAllJobs(): Promise<OfflineJob[]> {
  return tx<OfflineJob[]>("jobs", "readonly", (s) => s.getAll() as IDBRequest<OfflineJob[]>).then((r) => r ?? []);
}
