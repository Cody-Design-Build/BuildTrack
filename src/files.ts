// Uploaded files (signed proposals, bill and bid attachments). The data only stores each
// file's id, name, type and size; the bytes live here.
//
// - Connected to Supabase (the live app): files go to the team's private `files` bucket, so
//   everyone on the team can open them, and a copy is cached in this browser's IndexedDB.
// - Browser only (local and previews): files live in IndexedDB only.
//
// An upload that fails (offline, say) is kept locally and sent at the next start-up by
// syncFiles(). Files are not part of Settings → backups.
import { cloud } from './cloud';

const BUCKET = 'files';

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

const putLocal = (id: string, blob: Blob) => run('readwrite', (s) => s.put(blob, id)).then(() => undefined);
const getLocal = (id: string) => run<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>);

async function upload(id: string, blob: Blob) {
  if (!cloud) return;
  const { error } = await cloud.storage.from(BUCKET).upload(id, blob, { contentType: blob.type || 'application/octet-stream', upsert: true });
  if (error) throw error;
}

/** Stores a file: in this browser, and for the team when connected. A failed upload is retried at the next start-up. */
export async function putFile(id: string, blob: Blob) {
  await putLocal(id, blob);
  await upload(id, blob).catch((e) => console.warn(`Couldn't upload ${id} yet; it'll be sent later.`, e));
}

/** A stored file: this browser's copy, or the team's (downloaded once, then kept here). */
export async function getFile(id: string): Promise<Blob | undefined> {
  const local = await getLocal(id).catch(() => undefined);
  if (local || !cloud) return local;
  const { data, error } = await cloud.storage.from(BUCKET).download(id);
  if (error || !data) return undefined;
  await putLocal(id, data).catch(() => {});
  return data;
}

/** Whether files are shared with the team (connected to Supabase) or kept in this browser only. */
export const filesShared = !!cloud;

/** Why a file can't be opened here, to finish "<file name> …". */
export const MISSING_FILE = filesShared
  ? "hasn't reached the team yet. It's sent the next time BuildTrack is opened on the computer it was added from."
  : "isn't stored in this browser. Files stay in the browser they were uploaded from.";

/**
 * Sends the team any file this browser has that the bucket doesn't: uploads that failed, and
 * files attached before files were shared. Only files the data still uses are sent.
 */
export async function syncFiles(keep: Set<string>) {
  if (!cloud) return;
  const ids = (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())).map(String).filter((id) => keep.has(id));
  if (!ids.length) return;
  const inBucket = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await cloud.storage.from(BUCKET).list('', { limit: 1000, offset });
    if (error) throw error;
    data.forEach((o) => inBucket.add(o.name));
    if (data.length < 1000) break;
  }
  for (const id of ids.filter((x) => !inBucket.has(x))) {
    const blob = await getLocal(id);
    if (blob) await upload(id, blob);
  }
}

/**
 * Removes this browser's copies of files nothing points at any more (e.g. replaced or removed
 * signed copies). The team's bucket is left alone: a teammate's new file may not have reached
 * this copy of the data yet.
 */
export async function pruneFiles(keep: Set<string>) {
  const ids = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  const stale = ids.map(String).filter((id) => !keep.has(id));
  if (stale.length) await run('readwrite', (s) => { stale.forEach((id) => s.delete(id)); return s.count(); });
}

export const fileSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
