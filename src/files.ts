// Uploaded files (e.g. signed proposals) kept in this browser's IndexedDB, because they are
// too big for the localStorage copy of the app's data. The data only stores each file's id,
// name, type and size. Files are not part of Settings → backups.

const DB_NAME = 'buildtrack-files';
const STORE = 'files';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const putFile = (id: string, blob: Blob) => run('readwrite', (s) => s.put(blob, id)).then(() => undefined);
export const getFile = (id: string) => run<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>);

/** Removes stored files nothing points at any more (e.g. replaced or removed signed copies). */
export async function pruneFiles(keep: Set<string>) {
  const ids = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  const stale = ids.map(String).filter((id) => !keep.has(id));
  if (stale.length) await run('readwrite', (s) => { stale.forEach((id) => s.delete(id)); return s.count(); });
}

export const fileSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
