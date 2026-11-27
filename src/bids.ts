// Bid packages: a scope of work on a job sent to subcontractors, the bids that come back, and
// awarding one (or, for a split scope, more than one).
//
// Delivery is by email: the package prints as a PDF for subs, and each invited sub has an Email
// button that opens a ready-to-send message and records the date it went out. Bids come back by
// email too and are entered by hand: a total (required), optional prices per scope item, and
// what's included and excluded.
//
// Awarding a bid creates a Draft bill from that sub for the bid amount, linked to the bid, so it
// can be checked before it's approved to pay. More bills can be made against the same award
// (progress billing), and the package shows awarded vs billed vs paid.
import type { Activity, Bid, BidItem, BidPackage, BidPackageStatus, BidStatus, Bill, Db } from './data';
import { localIso, money, uid } from './store';
import { billAmount, nextBillNumber, logBill } from './bills';
import { todayYmd } from './invoices';
import { budgetForCode } from './costing';

export const PACKAGE_STATUS_COLOR: Record<BidPackageStatus, string> = {
  Draft: '#2b7fff',
  'Out for bid': '#f0b100',
  Awarded: '#00c950',
  Cancelled: '#6b7280',
};

export const BID_STATUS_COLOR: Record<BidStatus, string> = {
  Invited: '#0284c7',
  Received: '#8b5cf6',
  Declined: '#6b7280',
  Awarded: '#00c950',
  'Not selected': '#6b7280',
};

export const packageLabel = (p: Pick<BidPackage, 'number'>) => `Bid package ${p.number}`;
export const isPackageOpen = (p: Pick<BidPackage, 'status'>) => p.status === 'Draft' || p.status === 'Out for bid';

const round2 = (n: number) => Math.round(n * 100) / 100;

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localIso(d).slice(0, 10);
}

export const packageBids = (db: Db, packageId: string) => db.bids.filter((b) => b.packageId === packageId);

/** What a bid's status reads as in lists: an invite that hasn't gone out yet is "Not sent". */
export const bidStatusLabel = (b: Bid) => (b.status === 'Invited' && !b.invited ? 'Not sent' : b.status);

/** A package at a glance: who's bidding, the low bid, what's been awarded, billed and paid. */
export function packageSummary(db: Db, p: BidPackage) {
  const bids = packageBids(db, p.id);
  const priced = bids.filter((b) => (b.status === 'Received' || b.status === 'Awarded' || b.status === 'Not selected') && b.amount > 0);
  const low = priced.reduce<Bid | null>((m, b) => (!m || b.amount < m.amount ? b : m), null);
  const awarded = bids.filter((b) => b.status === 'Awarded');
  const awardIds = new Set(awarded.map((b) => b.id));
  const bills = db.bills.filter((b) => b.bidId && awardIds.has(b.bidId) && b.status !== 'Void');
  const approvedBills = bills.filter((b) => b.status === 'Open' || b.status === 'Paid');
  const paid = db.payments.filter((x) => x.billId && bills.some((b) => b.id === x.billId)).reduce((s, x) => s + x.amount, 0);
  return {
    bids,
    invited: bids.filter((b) => b.invited).length,
    notSent: bids.filter((b) => b.status === 'Invited' && !b.invited).length,
    received: priced.length,
    waiting: bids.filter((b) => b.status === 'Invited' && b.invited).length,
    low,
    awarded,
    awardedTotal: round2(awarded.reduce((s, b) => s + b.amount, 0)),
    bills,
    billed: round2(approvedBills.reduce((s, b) => s + billAmount(b), 0)),
    paid: round2(paid),
    budget: budgetForCode(db, p.jobId, p.costCodeId),
  };
}

export function nextPackageNumber(db: Db, jobId: string) {
  const prefix = `${jobId.replace(/\D/g, '') || '1'}-`;
  const seqs = db.bidPackages.filter((p) => p.jobId === jobId && p.number.startsWith(prefix)).map((p) => Number(p.number.slice(prefix.length)));
  return prefix + (Math.max(0, ...seqs.filter(Number.isFinite)) + 1);
}

function logPackage(d: Db, p: BidPackage, what: string, extra: Partial<Activity> = {}): Activity {
  const job = d.jobs.find((j) => j.id === p.jobId);
  const me = d.team[0]?.name ?? 'You';
  return {
    id: uid('a'),
    date: localIso(),
    partyId: '',
    jobId: p.jobId,
    title: p.title || packageLabel(p),
    doc: packageLabel(p),
    amount: 0,
    text: `${what} by ${me}${job ? ` on ${job.name}` : ''}`,
    color: what === 'Created' ? '#2b7fff' : PACKAGE_STATUS_COLOR[p.status],
    bidPackageId: p.id,
    ...extra,
  };
}

const vendorName = (d: Db, id: string) => d.accounts.find((a) => a.id === id)?.name ?? 'a vendor';

const putPackage = (d: Db, p: BidPackage): Db => ({ ...d, bidPackages: d.bidPackages.map((x) => (x.id === p.id ? p : x)) });
const putBid = (d: Db, b: Bid): Db => ({ ...d, bids: d.bids.map((x) => (x.id === b.id ? b : x)) });
const withStatus = (p: BidPackage, status: BidPackageStatus): BidPackage => ({ ...p, status, updated: localIso(), statusDates: { ...p.statusDates, [status]: localIso() } });

/** A new draft package on a job, due back in two weeks. */
export function createPackage(d: Db, jobId: string, id = uid('bp'), init: Partial<BidPackage> = {}): Db {
  const t = localIso();
  const p: BidPackage = {
    id, jobId, number: nextPackageNumber(d, jobId), title: '', costCodeId: '', status: 'Draft', due: addDays(t.slice(0, 10), 14),
    scope: '', items: [], attachments: [], created: t, updated: t, ...init,
  };
  const next = { ...d, bidPackages: [...d.bidPackages, p] };
  return { ...next, activity: [...next.activity, logPackage(next, p, 'Created')] };
}

/** Edits a package's scope while it's a draft or out for bid. Attachments can change any time. */
export function editPackage(d: Db, id: string, fn: (p: BidPackage) => Partial<BidPackage>): Db {
  const p = d.bidPackages.find((x) => x.id === id);
  if (!p) return d;
  const patch = fn(p);
  if (!isPackageOpen(p)) {
    if (!patch.attachments) return d;
    return putPackage(d, { ...p, attachments: patch.attachments, updated: localIso() });
  }
  return putPackage(d, { ...p, ...patch, updated: localIso() });
}

export function deletePackage(d: Db, id: string): Db {
  const p = d.bidPackages.find((x) => x.id === id);
  if (!p || p.status !== 'Draft') return d;
  return { ...d, bidPackages: d.bidPackages.filter((x) => x.id !== id), bids: d.bids.filter((b) => b.packageId !== id) };
}

/** Copies budget lines into the package as scope items (quantities and units, never prices). */
export function importItems(d: Db, packageId: string, lineIds: string[]): Db {
  const lines = d.budgetLines.filter((l) => lineIds.includes(l.id));
  const items: BidItem[] = lines.map((l) => ({
    id: uid('bi'),
    description: l.description ? `${l.name} — ${l.description}` : l.name,
    quantity: l.quantity,
    unit: l.unit,
    budgetLineId: l.id,
  }));
  return editPackage(d, packageId, (p) => ({ items: [...p.items, ...items], costCodeId: p.costCodeId || lines[0]?.costCodeId || '' }));
}

/** Adds subs to a package's invite list (not sent yet). Subs already on it are skipped. */
export function inviteVendors(d: Db, packageId: string, vendorIds: string[]): Db {
  const p = d.bidPackages.find((x) => x.id === packageId);
  if (!p || !isPackageOpen(p)) return d;
  const have = new Set(packageBids(d, packageId).map((b) => b.vendorId));
  const added: Bid[] = vendorIds.filter((v) => !have.has(v)).map((vendorId) => ({
    id: uid('bid'), packageId, jobId: p.jobId, vendorId, status: 'Invited', invited: '', received: '', amount: 0, itemPrices: {},
    inclusions: '', exclusions: '', notes: '', validUntil: '', attachments: [],
  }));
  return { ...d, bids: [...d.bids, ...added] };
}

/** Takes a sub off the invite list. Not for an awarded bid. */
export function removeBid(d: Db, bidId: string): Db {
  const b = d.bids.find((x) => x.id === bidId);
  if (!b || b.status === 'Awarded') return d;
  return { ...d, bids: d.bids.filter((x) => x.id !== bidId) };
}

/** Records that the package went out to these subs today (or on `date`); the package is then Out for bid. */
export function markSent(d: Db, packageId: string, bidIds: string[], date = todayYmd()): Db {
  let p = d.bidPackages.find((x) => x.id === packageId);
  if (!p || !isPackageOpen(p)) return d;
  let next: Db = { ...d, bids: d.bids.map((b) => (bidIds.includes(b.id) && b.packageId === packageId && !b.invited ? { ...b, invited: date } : b)) };
  const names = bidIds.map((id) => d.bids.find((b) => b.id === id)).filter((b): b is Bid => !!b && !b.invited).map((b) => vendorName(d, b.vendorId));
  if (p.status === 'Draft') {
    p = withStatus(p, 'Out for bid');
    next = putPackage(next, p);
  }
  if (!names.length) return next;
  return { ...next, activity: [...next.activity, logPackage(next, p, `Sent to ${names.join(', ')}`)] };
}

/** Edits a sub's bid (amount, item prices, inclusions, notes, attachments…). */
export function editBid(d: Db, bidId: string, fn: (b: Bid) => Partial<Bid>): Db {
  const b = d.bids.find((x) => x.id === bidId);
  if (!b) return d;
  const patch = fn(b);
  if (patch.amount !== undefined) patch.amount = round2(Number(patch.amount) || 0);
  return putBid(d, { ...b, ...patch });
}

/** Records a sub's price as received. If only item prices are given, the total is their sum. */
export function recordBid(d: Db, bidId: string, bid: Pick<Bid, 'amount' | 'itemPrices' | 'inclusions' | 'exclusions' | 'notes' | 'validUntil' | 'received'>): Db {
  const b = d.bids.find((x) => x.id === bidId);
  const p = b && d.bidPackages.find((x) => x.id === b.packageId);
  if (!b || !p || b.status === 'Awarded') return d;
  const itemSum = round2(Object.values(bid.itemPrices).reduce((s, n) => s + (Number(n) || 0), 0));
  const amount = round2(bid.amount || itemSum);
  if (!(amount > 0)) return d;
  let next = putBid(d, { ...b, ...bid, amount, status: b.status === 'Not selected' ? 'Not selected' : 'Received', invited: b.invited || bid.received });
  if (p.status === 'Draft') next = putPackage(next, withStatus(p, 'Out for bid'));
  const pk = next.bidPackages.find((x) => x.id === p.id)!;
  return { ...next, activity: [...next.activity, logPackage(next, pk, `Bid of ${money(amount)} received from ${vendorName(d, b.vendorId)}`, { partyId: b.vendorId, amount: Math.round(amount) })] };
}

export function declineBid(d: Db, bidId: string): Db {
  const b = d.bids.find((x) => x.id === bidId);
  const p = b && d.bidPackages.find((x) => x.id === b.packageId);
  if (!b || !p || b.status === 'Awarded') return d;
  const next = putBid(d, { ...b, status: 'Declined' });
  return { ...next, activity: [...next.activity, logPackage(next, p, `${vendorName(d, b.vendorId)} declined to bid`, { partyId: b.vendorId })] };
}

/**
 * Awards a bid: the bid becomes Awarded, the package Awarded, and a Draft bill is created from
 * the sub for the bid amount (one line per priced scope item, else one line), coded to the
 * package's cost code. With `othersNotSelected`, every other priced bid is marked Not selected.
 */
export function awardBid(d: Db, bidId: string, othersNotSelected: boolean, billId = uid('bill')): Db {
  const b = d.bids.find((x) => x.id === bidId);
  const p = b && d.bidPackages.find((x) => x.id === b.packageId);
  if (!b || !p || p.status === 'Cancelled' || b.status === 'Awarded' || !(b.amount > 0)) return d;
  const t = localIso();
  const today = t.slice(0, 10);
  const priced = p.items.filter((i) => (b.itemPrices[i.id] ?? 0) !== 0);
  const itemSum = round2(priced.reduce((s, i) => s + b.itemPrices[i.id], 0));
  const lines = priced.length && Math.abs(itemSum - b.amount) < 0.01
    ? priced.map((i) => ({ id: uid('bl'), description: i.description, costCodeId: p.costCodeId, amount: b.itemPrices[i.id] }))
    : [{ id: uid('bl'), description: p.title || packageLabel(p), costCodeId: p.costCodeId, amount: b.amount }];
  const bill: Bill = {
    id: billId, jobId: p.jobId, vendorId: b.vendorId, number: nextBillNumber(d, p.jobId), vendorRef: '', title: p.title || packageLabel(p),
    status: 'Draft', date: today, due: addDays(today, 30), lines,
    notes: `From ${vendorName(d, b.vendorId)}'s awarded bid on ${packageLabel(p)}. Adjust it to match their invoice before approving it to pay (e.g. for a progress bill).`,
    attachments: [], created: t, updated: t, bidId: b.id,
  };
  let next: Db = {
    ...d,
    bids: d.bids.map((x) => {
      if (x.id === b.id) return { ...x, status: 'Awarded' as const, awarded: today };
      if (othersNotSelected && x.packageId === p.id && x.status === 'Received') return { ...x, status: 'Not selected' as const };
      return x;
    }),
    bills: [...d.bills, bill],
  };
  const pk = p.status === 'Awarded' ? p : withStatus(p, 'Awarded');
  next = putPackage(next, pk);
  next = { ...next, activity: [...next.activity, logPackage(next, pk, `Awarded to ${vendorName(d, b.vendorId)} for ${money(b.amount)}`, { partyId: b.vendorId, amount: Math.round(b.amount) })] };
  return { ...next, activity: [...next.activity, logBill(next, bill, 'Created from an awarded bid')] };
}

/** Bills made against an award that still matter (not void). */
export const awardBills = (db: Db, bidId: string) => db.bills.filter((x) => x.bidId === bidId && x.status !== 'Void');

/** Whether an award can be undone: only while its bills are all still drafts. */
export const canUnaward = (db: Db, bidId: string) => awardBills(db, bidId).every((x) => x.status === 'Draft');

/**
 * Undoes an award: deletes its draft bills and puts the bid back to Received. If nothing on the
 * package is awarded any more, the package goes back out for bid and Not selected bids are
 * back in the running.
 */
export function unawardBid(d: Db, bidId: string): Db {
  const b = d.bids.find((x) => x.id === bidId);
  const p = b && d.bidPackages.find((x) => x.id === b.packageId);
  if (!b || !p || b.status !== 'Awarded' || !canUnaward(d, bidId)) return d;
  const drop = new Set(d.bills.filter((x) => x.bidId === bidId).map((x) => x.id));
  let next: Db = { ...d, bills: d.bills.filter((x) => !drop.has(x.id)), bids: d.bids.map((x) => (x.id === bidId ? { ...x, status: 'Received' as const, awarded: undefined } : x)) };
  const stillAwarded = next.bids.some((x) => x.packageId === p.id && x.status === 'Awarded');
  let pk = p;
  if (!stillAwarded) {
    pk = withStatus(p, 'Out for bid');
    next = putPackage(next, pk);
    next = { ...next, bids: next.bids.map((x) => (x.packageId === p.id && x.status === 'Not selected' ? { ...x, status: 'Received' as const } : x)) };
  }
  return { ...next, activity: [...next.activity, logPackage(next, pk, `Award to ${vendorName(d, b.vendorId)} undone`, { partyId: b.vendorId })] };
}

export function cancelPackage(d: Db, id: string): Db {
  const p = d.bidPackages.find((x) => x.id === id);
  if (!p || !isPackageOpen(p)) return d;
  const pk = withStatus(p, 'Cancelled');
  const next = putPackage(d, pk);
  return { ...next, activity: [...next.activity, logPackage(next, pk, 'Cancelled')] };
}

export function reopenPackage(d: Db, id: string): Db {
  const p = d.bidPackages.find((x) => x.id === id);
  if (!p || p.status !== 'Cancelled') return d;
  const pk = withStatus(p, packageBids(d, id).some((b) => b.invited) ? 'Out for bid' : 'Draft');
  const next = putPackage(d, pk);
  return { ...next, activity: [...next.activity, logPackage(next, pk, 'Reopened')] };
}

/** Where to email a sub: the account's email, else its main contact's. */
export function vendorEmail(db: Db, vendorId: string) {
  const a = db.accounts.find((x) => x.id === vendorId);
  if (a?.email) return a.email;
  const members = db.memberships.filter((m) => m.accountId === vendorId).sort((x, y) => Number(y.primary) - Number(x.primary));
  for (const m of members) {
    const person = db.people.find((x) => x.id === m.personId);
    if (person?.email) return person.email;
  }
  return '';
}

const longDate = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '');

/** The invitation email for one sub, ready to open in their mail app. Attach the PDF and files yourself. */
export function inviteEmail(db: Db, p: BidPackage, vendorId: string) {
  const job = db.jobs.find((j) => j.id === p.jobId);
  const vendor = db.accounts.find((a) => a.id === vendorId);
  const me = db.team[0]?.name ?? '';
  const subject = `Bid request: ${p.title || packageLabel(p)}${job ? ` — ${job.name}` : ''}`;
  const lines = [
    `Hi${vendor ? ` ${vendor.name}` : ''},`,
    '',
    `We'd like your bid on ${p.title || 'the scope below'}${job ? ` at ${job.address || job.name}` : ''}.`,
    '',
    p.scope.trim(),
    ...(p.items.length ? ['', 'Scope items:', ...p.items.map((i) => `- ${i.description}${i.quantity && i.unit !== 'lump' ? ` (${i.quantity} ${i.unit})` : ''}`)] : []),
    '',
    `Please send your price${p.due ? ` by ${longDate(p.due)}` : ''}, with a total and, if you can, a price for each item, plus what's included and excluded.`,
    'The bid package and plans are attached.',
    '',
    'Thanks,',
    me,
    db.companyName,
  ];
  const body = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  const to = vendorEmail(db, vendorId);
  return { to, subject, body, href: `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}
