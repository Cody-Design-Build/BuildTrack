// Shared data in Supabase.
//
// The app still works on one in-memory Db object, exactly as before. This module
// mirrors it to the `records` table (one row per record, see
// supabase/migrations) and back:
//   - loadDb() reads every row into a Db when the app starts;
//   - useCloudSync() watches the Db, works out which records changed since the
//     last save, and writes only those (debounced);
//   - live changes from other people arrive over Supabase Realtime and are
//     merged into the Db without being written back.
// With no VITE_SUPABASE_* settings the app runs on this browser's storage only.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { Db } from './data';
import { setSignedInAccount } from './session';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const cloud = url && key ? createClient(url, key) : null;

/**
 * The company's Google Workspace domain, if set: Google then offers only that
 * domain's accounts at sign-in. Only a convenience: the database's allowed
 * domains decide who actually gets in.
 */
export const TEAM_DOMAIN = (import.meta.env.VITE_TEAM_DOMAIN as string | undefined)?.trim() || undefined;

const META = '$meta'; // collection for plain values such as companyName
// One row listing which kinds of records the data has. The database keeps no row for an
// empty list, so without this an empty list and a kind of record added by a newer
// version of the app would look the same (and the app's upgrade, e.g. adding sample
// records for a new feature, would never run).
const SCHEMA = '$schema';
const ORIGIN = crypto.randomUUID(); // this open copy of the app
const SAVE_DELAY = 400;

type Item = { id: string };
type Row = { collection: string; id: string; data: unknown; sort: number; origin?: string | null; company_id?: string };
type Key = { collection: string; id: string };
type AnyDb = Record<string, unknown>;

// ---------- Connection status, for the status corner ----------
export type CloudStatus = 'local' | 'connecting' | 'online' | 'saving' | 'offline' | 'error';
let status: CloudStatus = cloud ? 'connecting' : 'local';
let lastError = '';
const statusListeners = new Set<() => void>();
function setStatus(next: CloudStatus, error = '') {
  if (next === status && error === lastError) return;
  status = next;
  lastError = error;
  statusListeners.forEach((l) => l());
}
export function useCloudStatus() {
  const s = useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => statusListeners.delete(l);
    },
    () => status,
  );
  return { status: s, error: lastError };
}

// ---------- Ordering ----------
// Each row keeps a sort number so lists come back in the same order. New records
// get a number between their neighbours, so adding one never rewrites the rest.
const sortOf = new Map<string, number>();
const sk = (collection: string, id: string) => `${collection}\u0000${id}`;

function sortFor(collection: string, list: Item[], i: number): number {
  const before = i > 0 ? sortOf.get(sk(collection, list[i - 1].id)) : undefined;
  const after = list.slice(i + 1).map((r) => sortOf.get(sk(collection, r.id))).find((n) => n !== undefined);
  if (before === undefined && after === undefined) return i;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

// ---------- The company ----------
// Every row belongs to a company (supabase/migrations/…_companies.sql). A person
// usually has one; with several, the last one they picked is remembered on this device.
export interface Company { id: string; name: string }
const COMPANY_KEY = 'bt-company';
let companyId: string | null = null;
let companies: Company[] = [];

export { signedInAccount } from './session';

/** The signed-in person's companies (more than one only when they've been invited to several). */
export const myCompanies = () => companies;

/** The company whose data is open, or null when not connected. */
export const currentCompany = () => companyId;

/** The signed-in person's companies; opens the remembered one (or the first). */
export async function openCompany(): Promise<Company[]> {
  const { data: who } = await cloud!.auth.getUser();
  const email = who.user?.email?.toLowerCase() ?? '';
  const meta = who.user?.user_metadata ?? {};
  setSignedInAccount(email ? { email, name: String(meta.full_name || meta.name || email.split('@')[0]) } : null);
  const { data, error } = await cloud!.from('companies').select('id,name').order('created_at');
  if (error) throw error;
  const list = (data ?? []) as Company[];
  companies = list;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(COMPANY_KEY);
  } catch {
    /* private window */
  }
  companyId = (list.find((c) => c.id === saved) ?? list[0])?.id ?? null;
  return list;
}

/** Switch to another of the person's companies (the app reloads to open its data). */
export function switchCompany(id: string) {
  try {
    localStorage.setItem(COMPANY_KEY, id);
  } catch {
    /* private window */
  }
  window.location.reload();
}

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await cloud!.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

/** Uses every valid invite for this person's email: joins those companies (or starts the one a new-company invite is for). Returns how many. */
export const acceptInvites = () => rpc<number>('accept_invites');

export type Role = 'owner' | 'admin' | 'member';
export interface TeamEntry { user_id: string | null; email: string; role: Role; since: string; pending: boolean; expires_at: string | null }
/** Members of the open company, then pending invites. */
export const companyTeam = () => rpc<TeamEntry[]>('company_team', { company: mine() });
/** Invites someone (a single-use invite for their email, good for 7 days); returns when it expires. */
export const inviteMember = (email: string, role: 'admin' | 'member') => rpc<string>('invite_member', { company: mine(), invite_email: email, invite_role: role });
export const cancelInvite = (email: string) => rpc<void>('cancel_invite', { company: mine(), invite_email: email });
/** Change a member's role, or remove them with null. */
export const setMemberRole = (userId: string, role: Role | null) => rpc<void>('set_member_role', { company: mine(), member: userId, new_role: role });
export const renameCompany = (name: string) => rpc<void>('rename_company', { company: mine(), new_name: name });

const mine = () => {
  if (!companyId) throw new Error('No company is open');
  return companyId;
};

// ---------- Reading and writing ----------
/** False until someone has been made a member (a new install: `npm run invite:owner`). */
export async function teamIsSetUp(): Promise<boolean> {
  const { data, error } = await cloud!.rpc('team_is_set_up');
  if (error) throw error;
  return data === true;
}

export async function isTeamMember(): Promise<boolean> {
  const { data, error } = await cloud!.rpc('is_team_member');
  if (error) throw error;
  return data === true;
}

/** Every record in the database as a Db, or null when the database is still empty. */
export async function loadDb(): Promise<Db | null> {
  const out: AnyDb = {};
  let known: string[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await cloud!
      .from('records')
      .select('collection,id,data,sort')
      .eq('company_id', mine())
      .order('collection')
      .order('sort')
      .order('id')
      .range(from, from + page - 1);
    if (error) throw error;
    for (const r of data as Row[]) {
      sortOf.set(sk(r.collection, r.id), r.sort);
      if (r.collection === SCHEMA) known = r.data as string[];
      else if (r.collection === META) out[r.id] = r.data;
      else ((out[r.collection] ??= []) as unknown[]).push(r.data);
    }
    if (data.length < page) break;
  }
  for (const k of known) out[k] ??= [];
  return Object.keys(out).length ? (out as unknown as Db) : null;
}

/** Works out which rows to write and delete to turn `prev` into `next`. */
function diff(prev: AnyDb, next: AnyDb): { upserts: Row[]; deletes: Key[] } {
  const upserts: Row[] = [];
  const deletes: Key[] = [];
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const a = prev[k];
    const b = next[k];
    if (Array.isArray(a) || Array.isArray(b)) {
      const before = new Map(((a ?? []) as Item[]).map((r) => [r.id, r] as const));
      const list = (b ?? []) as Item[];
      // Moved within the list? Then renumber the whole list (rare: drag to reorder).
      const nextIds = new Set(list.map((r) => r.id));
      const kept = list.filter((r) => before.has(r.id)).map((r) => r.id);
      const order = ((a ?? []) as Item[]).filter((r) => nextIds.has(r.id)).map((r) => r.id);
      const reordered = kept.some((id, i) => id !== order[i]);
      list.forEach((r, i) => {
        const old = before.get(r.id);
        const changed = !old || (old !== r && JSON.stringify(old) !== JSON.stringify(r));
        if (reordered) sortOf.set(sk(k, r.id), i);
        else if (!old) sortOf.set(sk(k, r.id), sortFor(k, list, i));
        if (changed || reordered) upserts.push({ collection: k, id: r.id, data: r, sort: sortOf.get(sk(k, r.id))!, origin: ORIGIN });
        before.delete(r.id);
      });
      for (const id of before.keys()) {
        deletes.push({ collection: k, id });
        sortOf.delete(sk(k, id));
      }
    } else if (a !== b && JSON.stringify(a) !== JSON.stringify(b)) {
      if (b === undefined) deletes.push({ collection: META, id: k });
      else upserts.push({ collection: META, id: k, data: b, sort: 0, origin: ORIGIN });
    }
  }
  const lists = (db: AnyDb) => Object.keys(db).filter((k) => Array.isArray(db[k])).sort();
  if (lists(prev).join() !== lists(next).join()) {
    upserts.push({ collection: SCHEMA, id: 'collections', data: lists(next), sort: 0, origin: ORIGIN });
  }
  return { upserts, deletes };
}

/** Records only owners and admins may change (supabase/migrations/20261128090000_plugin_admins.sql). */
const adminOnly = (k: Key) => k.collection === 'installedPlugins' || (k.collection === META && k.id === 'plugins');

async function write(changes: { upserts: Row[]; deletes: Key[] }) {
  // Sent on their own: if the database refuses them (someone who isn't an admin), everything
  // else still saves. The app doesn't offer these changes to non-admins anyway.
  const admin = { upserts: changes.upserts.filter(adminOnly), deletes: changes.deletes.filter(adminOnly) };
  await writeRows({ upserts: changes.upserts.filter((r) => !adminOnly(r)), deletes: changes.deletes.filter((d) => !adminOnly(d)) });
  if (admin.upserts.length || admin.deletes.length) {
    try {
      await writeRows(admin);
    } catch (e) {
      console.warn('Only owners and admins can change plugins; that change was not saved.', e);
    }
  }
}

async function writeRows({ upserts, deletes }: { upserts: Row[]; deletes: Key[] }) {
  for (let i = 0; i < upserts.length; i += 500) {
    const rows = upserts.slice(i, i + 500).map((r) => ({ ...r, company_id: mine() }));
    const { error } = await cloud!.from('records').upsert(rows, { onConflict: 'company_id,collection,id' });
    if (error) throw error;
  }
  const byCollection = new Map<string, string[]>();
  for (const d of deletes) byCollection.set(d.collection, [...(byCollection.get(d.collection) ?? []), d.id]);
  for (const [collection, ids] of byCollection) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await cloud!.from('records').delete().eq('company_id', mine()).eq('collection', collection).in('id', ids.slice(i, i + 200));
      if (error) throw error;
    }
  }
}

/** Saves the difference between two versions of the data. */
export async function saveChanges(prev: Db, next: Db) {
  await write(diff(prev as unknown as AnyDb, next as unknown as AnyDb));
}

/** First sign-in on an empty database: upload this browser's data (or the sample data). */
export async function uploadDb(db: Db) {
  await write(diff({}, db as unknown as AnyDb));
}

// ---------- Live changes from other people ----------
function applyRow(db: AnyDb, change: { type: 'upsert'; row: Row } | { type: 'delete'; key: Key }): AnyDb {
  if ((change.type === 'upsert' ? change.row.collection : change.key.collection) === SCHEMA) return db;
  if (change.type === 'delete') {
    const { collection, id } = change.key;
    if (collection === META) {
      const { [id]: _, ...rest } = db;
      return rest;
    }
    const list = db[collection] as Item[] | undefined;
    return list?.some((r) => r.id === id) ? { ...db, [collection]: list.filter((r) => r.id !== id) } : db;
  }
  const { collection, id, data, sort } = change.row;
  if (collection === META) return { ...db, [id]: data };
  const list = ((db[collection] ?? []) as Item[]).filter((r) => r.id !== id);
  let at = list.findIndex((r) => (sortOf.get(sk(collection, r.id)) ?? Infinity) > sort);
  if (at < 0) at = list.length;
  return { ...db, [collection]: [...list.slice(0, at), data as Item, ...list.slice(at)] };
}

/**
 * Keeps the database in step with the app's Db. `apply` merges a change from
 * elsewhere into the app's state (without adding it to undo).
 */
let flushPending: () => Promise<void> = async () => {};
/** Saves any change still waiting to be sent (e.g. before signing out). */
export const savePending = () => flushPending();

export function useCloudSync(db: Db, apply: (fn: (db: Db) => Db) => void) {
  const synced = useRef<AnyDb>(db as unknown as AnyDb); // what the database holds, as far as we know
  const latest = useRef(db);
  latest.current = db;
  const timer = useRef<number | undefined>(undefined);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  // Save local edits.
  flushRef.current = async () => {
    window.clearTimeout(timer.current);
    const next = latest.current as unknown as AnyDb;
    const changes = diff(synced.current, next);
    if (!changes.upserts.length && !changes.deletes.length) return;
    const before = synced.current;
    synced.current = next;
    setStatus('saving');
    try {
      await write(changes);
      setStatus(navigator.onLine ? 'online' : 'offline');
    } catch (e) {
      synced.current = before; // try again with the next save
      setStatus('error', e instanceof Error ? e.message : String(e));
      timer.current = window.setTimeout(() => flushRef.current(), 5000);
    }
  };
  flushPending = () => flushRef.current();
  useEffect(() => {
    if (!cloud) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flushRef.current(), SAVE_DELAY);
  }, [db]);

  // Receive everyone else's edits.
  useEffect(() => {
    if (!cloud) return;
    const merge = (change: Parameters<typeof applyRow>[1]) => {
      if (change.type === 'upsert') sortOf.set(sk(change.row.collection, change.row.id), change.row.sort);
      synced.current = applyRow(synced.current, change);
      apply((d) => applyRow(d as unknown as AnyDb, change) as unknown as Db);
      if (change.type === 'delete') sortOf.delete(sk(change.key.collection, change.key.id));
    };
    let dropped = false;
    const channel: RealtimeChannel = cloud
      .channel('records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `company_id=eq.${mine()}` }, (p) => {
        if (p.eventType === 'DELETE') {
          // Deletes skip filters and access rules, so they arrive from every company:
          // only act on our own (the key always includes the company).
          const old = p.old as Partial<Row>;
          if (old.company_id === companyId && old.collection && old.id) merge({ type: 'delete', key: { collection: old.collection, id: old.id } });
          return;
        }
        const row = p.new as Row;
        if (row.company_id === companyId && row.origin !== ORIGIN) merge({ type: 'upsert', row });
      });
    let closed = false;
    const onStatus = async (s: string) => {
      if (s === 'SUBSCRIBED') {
        if (dropped) {
          // Back after a dropout: save what's pending, then catch up on what we missed.
          dropped = false;
          await flushRef.current();
          try {
            const fresh = await loadDb();
            if (fresh) {
              synced.current = fresh as unknown as AnyDb;
              apply(() => fresh);
            }
          } catch {
            /* stay on what we have; the next change will retry */
          }
        }
        setStatus('online');
      } else if (!closed && (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED')) {
        dropped = true;
        setStatus('offline');
      }
    };
    // Give the live connection the signed-in user's token first, or the database's
    // access rules hide every change from it.
    cloud.auth.getSession().then(({ data }) => {
      if (closed) return;
      if (data.session) cloud!.realtime.setAuth(data.session.access_token);
      channel.subscribe((s) => void onStatus(s));
    });
    const offline = () => setStatus('offline');
    const flushNow = () => flushRef.current();
    window.addEventListener('offline', offline);
    window.addEventListener('pagehide', flushNow);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('pagehide', flushNow);
      closed = true;
      cloud.removeChannel(channel);
    };
    // apply is stable (a useCallback in the store)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
