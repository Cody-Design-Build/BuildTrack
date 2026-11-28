import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { seed, sampleBids, sampleBilling, samplePayables, SAMPLE_VENDORS, type Db, type Account, type Person, type Membership, type JobLink, type TeamMember, AVATAR_COLORS } from './data';
import { filesInUse } from './plugins/registry';
import { pruneFiles, syncFiles } from './files';
import { invoiceTotals } from './plugins/invoices/invoices';
import { useCloudSync } from './cloud';
import { uid } from './model';

export { localIso, uid, money, pct, meOf, lineCost, linePrice } from './model';
import { isBudgetDb, isLegacy, migrateBudgets, migrateLegacy, migrateSchedule, type PreBudgetDb } from './migrate';

export const KEY = 'buildtrack-db-v6';
const LEGACY_KEYS = ['buildtrack-db-v5', 'buildtrack-db-v4', 'buildtrack-db-v3'];

/** Parses saved data or a backup file and migrates older records. */
export function parseDb(raw: string): Db {
  const parsed = JSON.parse(raw) as (Db | ReturnType<typeof migrateLegacy>) & { messages?: unknown };
  delete parsed.messages; // Drop legacy messages from browser saves and restored backups.
  const scheduled: unknown = migrateSchedule(isLegacy(parsed) ? migrateLegacy(parsed) : parsed);
  const db = isBudgetDb(scheduled) ? scheduled : migrateBudgets(scheduled as PreBudgetDb);
  if (!db.invoices) db.invoices = []; // saved before invoices existed
  if (!db.payments) addPayments(db);
  if (!db.bills) addBills(db);
  if (!db.bidPackages || !db.bids) addBids(db);
  if (!db.activity) db.activity = seed().activity;
  return db;
}

// Saved before payments were tracked. If the only invoices are the old samples, swap in the
// fuller sample billing history; otherwise turn each paid invoice into one full payment.
const OLD_SAMPLE_INVOICES = new Set(['inv-j12-1', 'inv-j12-2', 'inv-j12-3', 'inv-j8-1']);
function addPayments(db: Db) {
  db.payments = [];
  if (db.invoices.every((i) => OLD_SAMPLE_INVOICES.has(i.id))) {
    Object.assign(db, sampleBilling(db));
    return;
  }
  for (const inv of db.invoices.filter((i) => i.status === 'Paid')) {
    const date = (inv.statusDates?.Paid ?? inv.date).slice(0, 10);
    db.payments.push({
      id: uid('pay'), jobId: inv.jobId, invoiceId: inv.id, date, amount: invoiceTotals(db, inv).amount,
      method: 'Other', reference: '', notes: 'Recorded before payments were tracked', created: `${date}T12:00:00`,
    });
  }
}

// Saved before vendor bills existed. Sample data gets the sample bills (they only attach to the
// sample jobs and vendors, so they're skipped for anything else); real data just starts empty.
function addBills(db: Db) {
  const isSample = ['v1', 'v3', 'v4', 'v5'].every((id) => db.accounts.some((a) => a.id === id)) && db.jobs.some((j) => j.id === 'j12');
  const sample = isSample ? samplePayables(db) : { bills: [], payments: [] };
  db.bills = sample.bills;
  db.payments = [...db.payments, ...sample.payments];
}

// Saved before bid packages existed. Sample data gets the extra sample subcontractors and the
// sample packages (linked to the sample bills); real data just starts empty.
function addBids(db: Db) {
  const isSample = ['v1', 'v3', 'v4', 'v5'].every((id) => db.accounts.some((a) => a.id === id)) && db.jobs.some((j) => j.id === 'j12');
  if (!isSample) {
    db.bidPackages = [];
    db.bids = [];
    return;
  }
  db.accounts = [...db.accounts, ...SAMPLE_VENDORS.filter((v) => !db.accounts.some((a) => a.id === v.id))];
  Object.assign(db, sampleBids(db));
}

/** This browser's saved copy of the data, or the sample data. */
export function loadLocal(): Db {
  try {
    for (const key of [KEY, ...LEGACY_KEYS]) {
      const raw = localStorage.getItem(key);
      if (raw) return parseDb(raw);
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

/** `initial` is the team's shared data when connected to Supabase; otherwise this browser's copy is used. */
export function StoreProvider({ children, initial }: { children: ReactNode; initial?: Db }) {
  const [hist, setHist] = useState<{ past: Db[]; now: Db; future: Db[] }>(() => ({ past: [], now: initial ?? loadLocal(), future: [] }));
  const db = hist.now;
  // Changes made by teammates: merged into the current data, not added to undo.
  const applyRemote = useCallback((fn: (db: Db) => Db) => setHist((h) => {
    const now = fn(h.now);
    return now === h.now ? h : { ...h, now };
  }), []);
  useCloudSync(db, applyRemote);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* ignore */
    }
  }, [db]);
  // Drop this browser's copies of files nothing points at (replaced or removed signed copies),
  // then send the team any file it doesn't have yet. Only at start-up, because undo can bring
  // back a reference during the session.
  useEffect(() => {
    // every installed plugin (on or off) says which stored files its records still use
    const keep = new Set(filesInUse(hist.now).filter(Boolean));
    pruneFiles(keep)
      .then(() => syncFiles(keep))
      .catch((e) => console.warn('File clean-up or upload failed', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

/** A team member for an account signing in for the first time, if the team doesn't have one. */
export function withTeamMember(db: Db, account: { email: string; name: string } | null): Db {
  if (!account || db.team.some((t) => t.email?.toLowerCase() === account.email)) return db;
  const member: TeamMember = { id: uid('t'), name: account.name, initials: initials(account.name), color: colorFor(account.name), email: account.email };
  return { ...db, team: [...db.team, member] };
}

export const personName = (p?: Pick<Person, 'firstName' | 'lastName'>) => (p ? `${p.firstName} ${p.lastName}`.trim() : '');

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

/** A person or an account, seen the same way wherever either can appear (job links, documents, tasks). */
export interface Party {
  id: string;
  kind: 'person' | 'account';
  name: string;
  color: string;
  href: string;
  person?: Person;
  account?: Account;
}

export const partyHref = (kind: Party['kind'], id: string) => (kind === 'person' ? `/people?id=${id}` : `/accounts?id=${id}`);

export function buildLookups(db: Db) {
  const person = new Map(db.people.map((p) => [p.id, p] as const));
  const account = new Map(db.accounts.map((a) => [a.id, a] as const));
  const job = new Map(db.jobs.map((j) => [j.id, j] as const));
  const team = new Map(db.team.map((t) => [t.id, t] as const));
  const party = new Map<string, Party>();
  for (const p of db.people) {
    const name = personName(p);
    party.set(p.id, { id: p.id, kind: 'person', name, color: p.color ?? colorFor(name), href: partyHref('person', p.id), person: p });
  }
  for (const a of db.accounts) party.set(a.id, { id: a.id, kind: 'account', name: a.name, color: a.color, href: partyHref('account', a.id), account: a });

  const linksByJob = new Map<string, JobLink[]>();
  const linksByParty = new Map<string, JobLink[]>();
  for (const l of db.jobLinks) {
    linksByJob.set(l.jobId, [...(linksByJob.get(l.jobId) ?? []), l]);
    linksByParty.set(l.partyId, [...(linksByParty.get(l.partyId) ?? []), l]);
  }
  const membersOf = new Map<string, Membership[]>();
  const accountsOf = new Map<string, Membership[]>();
  for (const m of db.memberships) {
    membersOf.set(m.accountId, [...(membersOf.get(m.accountId) ?? []), m]);
    accountsOf.set(m.personId, [...(accountsOf.get(m.personId) ?? []), m]);
  }

  /** The job's customers: accounts first, then people, so a household or company reads as the customer. */
  const customers = (jobId: string) =>
    (linksByJob.get(jobId) ?? [])
      .filter((l) => l.role === 'Customer')
      .map((l) => party.get(l.partyId))
      .filter((p): p is Party => !!p)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'account' ? -1 : 1));
  /** One name to show for a job's customer, e.g. "Harper Household" or "Maya Harper". */
  const customerName = (jobId: string) => customers(jobId)[0]?.name ?? '';

  return { person, account, job, team, party, linksByJob, linksByParty, membersOf, accountsOf, customers, customerName };
}

export type Lookups = ReturnType<typeof buildLookups>;

export function useLookups(): Lookups {
  const { db } = useStore();
  return useMemo(() => buildLookups(db), [db]);
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

export type { Account, Person, Membership, JobLink };
