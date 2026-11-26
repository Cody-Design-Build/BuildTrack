import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { seed, type Db, type Account, type Contact, AVATAR_COLORS } from './data';

export const KEY = 'buildtrack-db-v3';

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as Db;
      if (!db.items) db.items = seed().items; // data saved before budgets existed
      if (!db.activity) db.activity = seed().activity;
      return db;
    }
  } catch {
    /* ignore */
  }
  return seed();
}

interface Store {
  db: Db;
  update: (fn: (db: Db) => Db) => void;
  reset: () => void;
  undo: () => void;
  redo: () => void;
  revert: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [hist, setHist] = useState<{ past: Db[]; now: Db; future: Db[] }>(() => ({ past: [], now: load(), future: [] }));
  const db = hist.now;
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* ignore */
    }
  }, [db]);
  const update = useCallback(
    (fn: (db: Db) => Db) => setHist((h) => ({ past: [...h.past.slice(-49), h.now], now: fn(h.now), future: [] })),
    [],
  );
  const reset = useCallback(() => setHist((h) => ({ past: [...h.past, h.now], now: seed(), future: [] })), []);
  const undo = useCallback(() => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h)), []);
  const redo = useCallback(() => setHist((h) => (h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h)), []);
  const revert = useCallback(() => setHist((h) => (h.past.length ? { past: [], now: h.past[0], future: [] } : h)), []);
  const value = useMemo(
    () => ({ db, update, reset, undo, redo, revert, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0 }),
    [db, update, reset, undo, redo, revert, hist.past.length, hist.future.length],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export const uid = (p: string) => p + Math.random().toString(36).slice(2, 9);

export const money = (n: number, cents = false) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

export const contactName = (c?: Contact) => (c ? `${c.firstName} ${c.lastName}`.trim() : '');

export const initials = (name: string) => {
  const words = name.replace(/[^A-Za-z& ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

export const colorFor = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export function useLookups() {
  const { db } = useStore();
  return useMemo(() => {
    const account = new Map(db.accounts.map((a) => [a.id, a] as const));
    const contact = new Map(db.contacts.map((c) => [c.id, c] as const));
    const job = new Map(db.jobs.map((j) => [j.id, j] as const));
    const location = new Map(db.locations.map((l) => [l.id, l] as const));
    const team = new Map(db.team.map((t) => [t.id, t] as const));
    return { account, contact, job, location, team };
  }, [db]);
}

export function sameDayLabel(iso: string, now = new Date('2026-11-26T09:00:00')) {
  const d = new Date(iso);
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export type { Account, Contact };

/** Cost and price of one budget line. */
export const lineCost = (i: { quantity: number; unitCost: number }) => i.quantity * i.unitCost;
export const linePrice = (i: { quantity: number; unitCost: number; markup: number }) => lineCost(i) * (1 + i.markup / 100);
